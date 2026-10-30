"""Opt-in PostgreSQL checks. Only a newly created temporary schema is modified."""
import os
from pathlib import Path
from uuid import uuid4

import psycopg
from psycopg import sql
import pytest
from fastapi.testclient import TestClient

from app.core.dependencies import get_current_user
from app.db import get_db
from app.main import app


@pytest.fixture
def database_client(request):
    dsn = os.getenv("TEST_DATABASE_URL")
    if not dsn:
        pytest.skip("Set TEST_DATABASE_URL to run isolated PostgreSQL checks")

    namespace = "budget_regression_" + uuid4().hex
    previous = app.dependency_overrides.copy()
    with psycopg.connect(dsn, autocommit=True, connect_timeout=5) as setup:
        setup.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(namespace)))
        try:
            with psycopg.connect(dsn, options=f"-c search_path={namespace}", connect_timeout=5) as conn:
                sql_dir = Path(__file__).resolve().parents[1] / "sql"
                if getattr(request, 'param', True):
                    conn.execute((sql_dir / "schema.sql").read_text())
                    conn.execute((sql_dir / "seeds.sql").read_text())
                conn.commit()

                def database():
                    try:
                        yield conn
                        conn.commit()
                    except Exception:
                        conn.rollback()
                        raise

                app.dependency_overrides[get_db] = database
                app.dependency_overrides[get_current_user] = lambda: {
                    "id": 1, "role": "admin", "team_id": 2,
                    "email": "admin@example.com", "full_name": "Test Admin",
                }
                client = TestClient(app, raise_server_exceptions=False)
                try:
                    yield client, conn
                finally:
                    client.close()
        finally:
            app.dependency_overrides.clear()
            app.dependency_overrides.update(previous)
            setup.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(namespace)))


def test_summary_budget_creation_and_user_assignment_in_postgresql(database_client):
    client, conn = database_client
    response = client.get("/api/summary", params={"period": "2026-Q4"})
    assert response.status_code == 200, response.text
    summaries = response.json()["summaries"]
    engineering = {row["currency"]: row for row in summaries if row["team_id"] == 1}
    assert engineering["NGN"]["total_amount"] == "1950000.00"
    assert engineering["USD"]["total_amount"] == "2500.00"
    assert engineering["NGN"]["budget_id"] == 1
    assert any(row["team_id"] == 2 and row["budget_id"] is None for row in summaries)

    response = client.post("/api/teams/2/budgets", json={"period": "2026-Q4"})
    assert response.status_code == 201, response.text
    assert client.post("/api/teams/2/budgets", json={"period": "2026-Q4"}).status_code == 409

    response = client.patch("/api/users/2", json={"team_id": None})
    assert response.status_code == 200, response.text
    assert conn.execute("SELECT team_id FROM users WHERE id = 2").fetchone()[0] is None
    assert client.patch("/api/users/2", json={"team_id": 3}).status_code == 200
    assert client.patch("/api/users/2", json={"role": "employee"}).status_code == 200
    assert conn.execute("SELECT team_id FROM users WHERE id = 2").fetchone()[0] == 3


def test_csv_preview_and_writes_in_postgresql(database_client):
    client, conn = database_client
    header = "code,amount,currency,description,purpose\n"
    valid = header + "NEW1,0.10,NGN,Planning,Quarterly plan\nNEW2,0.20,USD,Tools,Development\n"

    def upload(content, dry_run=False):
        return client.post(
            "/api/line-items/import", params={"budget_id": 1, "dry_run": dry_run},
            files={"file": ("test.csv", content, "text/csv")},
        )

    before = conn.execute("SELECT count(*) FROM line_items").fetchone()[0]
    assert upload(valid, True).json()["success"] is True
    assert conn.execute("SELECT count(*) FROM line_items").fetchone()[0] == before

    invalid = valid + "BAD,-1,NGN,Invalid,Planning\n"
    assert upload(invalid).json()["success"] is False
    assert conn.execute("SELECT count(*) FROM line_items").fetchone()[0] == before

    result = upload(valid)
    assert result.status_code == 200, result.text
    assert result.json()["imported_count"] == 2
    assert conn.execute("SELECT count(*) FROM line_items").fetchone()[0] == before + 2
    assert upload(valid, True).json()["success"] is False

    details = client.get("/api/teams/1/budgets/2026-Q4").json()
    amounts = {item["code"]: item["amount"] for item in details["line_items"]}
    assert amounts["NEW1"] == "0.10"
    assert amounts["NEW2"] == "0.20"

    item_id = conn.execute("SELECT id FROM line_items WHERE code = 'NEW2'").fetchone()[0]
    assert client.patch(f"/api/line-items/{item_id}", json={"code": "NEW1"}).status_code == 409
    assert conn.execute("SELECT code FROM line_items WHERE id = %s", (item_id,)).fetchone()[0] == "NEW2"


def test_new_budget_and_items_roll_back_together(database_client):
    client, conn = database_client
    conn.execute("""CREATE FUNCTION reject_test_item() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.code = 'REJECT' THEN
            RAISE EXCEPTION 'test rejection' USING ERRCODE = '23514';
        END IF; RETURN NEW; END $$""")
    conn.execute('CREATE TRIGGER reject_test_item BEFORE INSERT ON line_items FOR EACH ROW EXECUTE FUNCTION reject_test_item()')
    conn.commit()
    rows = [
        {'code': 'FIRST', 'description': 'D', 'purpose': 'P', 'amount': '0.10', 'currency': 'NGN'},
        {'code': 'REJECT', 'description': 'D', 'purpose': 'P', 'amount': '0.20', 'currency': 'USD'},
    ]
    response = client.post('/api/teams/2/budgets', json={'period': '2027-Q1', 'line_items': rows})
    assert response.status_code == 422, response.text
    assert conn.execute("SELECT count(*) FROM budgets WHERE period = '2027-Q1'").fetchone()[0] == 0
    assert conn.execute("SELECT count(*) FROM line_items WHERE code = 'FIRST'").fetchone()[0] == 0
    rows[1]['code'] = 'SECOND'
    response = client.post('/api/teams/2/budgets', json={'period': '2027-Q1', 'line_items': rows})
    assert response.status_code == 201, response.text
    details = client.get('/api/teams/2/budgets/2027-Q1').json()
    assert len(details['line_items']) == 2
    assert {row['currency']: row['total_amount'] for row in details['totals']} == {'NGN': '0.10', 'USD': '0.20'}


def test_existing_database_baseline_adoption(database_client):
    from app.migrate import apply_migrations
    client, conn = database_client
    before = conn.execute('SELECT count(*) FROM line_items').fetchone()[0]
    with pytest.raises(ValueError, match='adopt-existing'):
        apply_migrations(conn)
    conn.rollback()
    assert apply_migrations(conn, adopt_existing=True) == ['001_initial.sql']
    conn.commit()
    assert apply_migrations(conn) == []
    assert conn.execute('SELECT count(*) FROM line_items').fetchone()[0] == before


@pytest.mark.parametrize('database_client', [False], indirect=True)
def test_fresh_migration_and_admin_bootstrap(database_client):
    from app.migrate import apply_migrations
    from app.bootstrap_admin import bootstrap_admin
    client, conn = database_client
    assert apply_migrations(conn) == ['001_initial.sql']
    conn.commit()
    assert apply_migrations(conn) == []
    first = bootstrap_admin(conn, 'bootstrap@cowrywise.com', 'Bootstrap Admin')
    conn.commit()
    second = bootstrap_admin(conn, 'bootstrap@cowrywise.com')
    assert first[0] == second[0]
    assert second[2] == 'admin'
    assert conn.execute("SELECT count(*) FROM users WHERE email = 'bootstrap@cowrywise.com'").fetchone()[0] == 1
