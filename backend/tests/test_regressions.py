from decimal import Decimal
from datetime import datetime, timezone
from google.auth import jwt as google_jwt
from unittest.mock import patch

import psycopg
import pytest

from app.core import security
from app.routers import auth
from fastapi import HTTPException

HEADER = "code,amount,currency,description,purpose\n"
VALID = HEADER + "CW1,1250.50,NGN,Cloud hosting,Production\nCW2,25.10,USD,Tools,Planning\n"


@pytest.mark.parametrize("key", ["", "short"])
def test_missing_or_short_signing_key_is_rejected(monkeypatch, key):
    monkeypatch.setattr(security, "SECRET_KEY", key)
    with pytest.raises(HTTPException) as error:
        security.create_access_token({"sub": "1"})
    assert error.value.status_code == 500
    with pytest.raises(HTTPException) as error:
        security.decode_access_token("invalid-token")
    assert error.value.status_code == 500


def upload(client, content=VALID, dry_run=False, filename="budget.csv"):
    return client.post(
        "/api/line-items/import",
        params={"budget_id": 1, "dry_run": str(dry_run).lower()},
        files={"file": (filename, content, "text/csv")},
    )


def test_csv_inserts_all_rows_with_decimal_amounts(client, as_user, connection, cursor):
    as_user()
    response = upload(client, "\ufeff" + VALID, filename="BUDGET.CSV")
    assert response.status_code == 200, response.text
    assert response.json()["imported_count"] == 2
    values = cursor.executemany.call_args.args[1]
    assert values[0] == (1, "CW1", "Cloud hosting", "Production", Decimal("1250.50"), "NGN", "import")
    assert values[1][4] == Decimal("25.10")
    connection.commit.assert_called_once()


def test_valid_dry_run_never_writes(client, as_user, connection, cursor):
    as_user()
    response = upload(client, dry_run=True)
    assert response.json() == {"success": True, "dry_run": True, "total_rows": 2, "imported_count": 0, "errors": []}
    cursor.executemany.assert_not_called()
    connection.commit.assert_not_called()


@pytest.mark.parametrize("content", [
    "", HEADER, "code,amount\nA,1\n", HEADER + 'A,1,NGN,"unfinished,Planning',
    b"\xff\xfeinvalid", "code,amount,currency,description,purpose,code\nA,1,NGN,D,P,A\n",
])
def test_invalid_csv_files_return_422_without_writes(client, as_user, connection, cursor, content):
    as_user()
    response = upload(client, content)
    assert response.status_code == 422, response.text
    cursor.executemany.assert_not_called()
    connection.commit.assert_not_called()


@pytest.mark.parametrize("row", [
    "A,10,NGN", "A,10,NGN,D,P,extra", "A,0,NGN,D,P", "A,-1,NGN,D,P",
    "A,NaN,NGN,D,P", "A,Infinity,NGN,D,P", "A,0.001,NGN,D,P",
    "A,1000000000000,NGN,D,P", "A,1,NGNN,D,P", "A,1,NGN, ,P",
])
def test_invalid_csv_rows_prevent_entire_batch(client, as_user, connection, cursor, row):
    as_user()
    response = upload(client, HEADER + "GOOD,1,NGN,Valid,Planning\n" + row + "\n")
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["success"] is False
    assert result["total_rows"] == 2
    assert result["errors"][0]["row"] == 3
    assert result["imported_count"] == 0
    cursor.executemany.assert_not_called()
    connection.commit.assert_not_called()


def test_csv_dry_run_detects_existing_codes(client, as_user, connection, cursor):
    as_user()
    cursor.fetchall.return_value = [("CW1",)]
    result = upload(client, dry_run=True).json()
    assert result["success"] is False
    assert "already exists" in result["errors"][0]["error"]
    connection.commit.assert_not_called()


def test_csv_duplicate_in_file_reports_row(client, as_user, cursor):
    as_user()
    result = upload(client, HEADER + "A,1,NGN,D,P\nA,2,USD,D,P\n").json()
    assert result["success"] is False
    assert result["errors"][0]["row"] == 3
    cursor.executemany.assert_not_called()


def test_csv_insert_conflict_rolls_back(client, as_user, connection, cursor):
    as_user()
    cursor.executemany.side_effect = psycopg.errors.UniqueViolation("duplicate")
    assert upload(client).status_code == 409
    connection.rollback.assert_called_once()
    connection.commit.assert_not_called()


def test_csv_database_failure_rolls_back_and_hides_details(client, as_user, connection, cursor):
    as_user()
    cursor.executemany.side_effect = psycopg.OperationalError("private connection detail")
    response = upload(client)
    assert response.status_code == 500
    assert "private connection detail" not in response.text
    connection.rollback.assert_called_once()
    connection.commit.assert_not_called()


@pytest.mark.parametrize("role,team_id,expected", [("employee", None, 403), ("employee", 2, 404)])
def test_employee_cannot_read_unassigned_or_other_team_budget(client, as_user, role, team_id, expected):
    as_user(role, team_id)
    assert client.get("/api/line-items", params={"budget_id": 1}).status_code == expected
    assert client.get("/api/teams/1/budgets/2026-Q4").status_code == expected


@pytest.mark.parametrize("method,path,kwargs", [
    ("post", "/api/line-items", {"json": {"budget_id": 1, "code": "A", "description": "D", "purpose": "P", "amount": "1", "currency": "NGN"}}),
    ("patch", "/api/line-items/1", {"json": {"amount": "2"}}),
    ("delete", "/api/line-items/1", {}),
    ("post", "/api/teams", {"json": {"name": "Example"}}),
    ("patch", "/api/users/2", {"json": {"team_id": 1}}),
    ("get", "/api/summary", {}),
])
def test_employee_cannot_write_or_read_admin_summary(client, as_user, method, path, kwargs):
    as_user("employee", 1)
    assert getattr(client, method)(path, **kwargs).status_code == 403


def test_employee_cannot_import(client, as_user):
    as_user("employee", 1)
    assert upload(client).status_code == 403


def test_summary_preserves_currencies_and_missing_budgets(client, as_user, cursor):
    as_user()
    cursor.fetchall.return_value = [
        (1, "Engineering", "NGN", Decimal("0.10"), 1),
        (1, "Engineering", "USD", Decimal("0.20"), 1),
        (2, "Finance", None, Decimal("0.00"), None),
    ]
    response = client.get("/api/summary", params={"period": "2026-Q4"})
    assert response.status_code == 200, response.text
    summaries = response.json()["summaries"]
    assert summaries[0]["total_amount"] == "0.10"
    assert summaries[1]["currency"] == "USD"
    assert summaries[2]["budget_id"] is None


def test_budget_detail_preserves_decimal_amounts(client, as_user, cursor):
    as_user("employee", 1)
    cursor.fetchone.return_value = (1, 1, "2026-Q4")
    cursor.fetchall.side_effect = [
        [(1, 1, "A", "Tool", "Planning", Decimal("0.10"), "NGN", "manual")],
        [("NGN", Decimal("0.10"))],
    ]
    response = client.get("/api/teams/1/budgets/2026-Q4")
    assert response.status_code == 200, response.text
    assert response.json()["line_items"][0]["amount"] == "0.10"
    assert response.json()["totals"][0]["total_amount"] == "0.10"


@pytest.mark.parametrize("payload", [{}, {"description": " "}, {"currency": "N"}, {"amount": None}, {"code": None}])
def test_invalid_item_edits_are_rejected(client, as_user, cursor, payload):
    as_user()
    assert client.patch("/api/line-items/1", json=payload).status_code == 422
    cursor.execute.assert_not_called()


def test_item_currency_and_text_are_normalized(client, as_user, cursor):
    as_user()
    cursor.fetchone.side_effect = [(1,), (1, 1, "A", "Tool", "Planning", Decimal("1.00"), "NGN")]
    response = client.post("/api/line-items", json={"budget_id": 1, "code": " A ", "description": " Tool ", "purpose": " Planning ", "amount": "1.00", "currency": " ngn "})
    assert response.status_code == 201, response.text
    assert response.json()["currency"] == "NGN"
    assert cursor.execute.call_args.args[1][1:4] == ("A", "Tool", "Planning")


@pytest.mark.parametrize("method,path,payload", [
    ("post", "/api/teams", {"name": " "}),
    ("patch", "/api/teams/1", {"name": ""}),
    ("post", "/api/teams/1/budgets", {"period": " "}),
])
def test_empty_team_and_period_are_rejected(client, as_user, method, path, payload):
    as_user()
    assert getattr(client, method)(path, json=payload).status_code == 422


@pytest.mark.parametrize("error,status_code", [
    (psycopg.errors.UniqueViolation("duplicate"), 409),
    (psycopg.errors.CheckViolation("check"), 422),
    (psycopg.errors.ForeignKeyViolation("foreign key"), 409),
])
def test_database_constraint_errors_have_correct_status(client, as_user, cursor, error, status_code):
    as_user()
    cursor.execute.side_effect = [None, error]
    response = client.post("/api/line-items", json={"budget_id": 1, "code": "A", "description": "D", "purpose": "P", "amount": "1", "currency": "NGN"})
    assert response.status_code == status_code, response.text


@pytest.mark.parametrize("existing", [True, False])
def test_google_login_handles_existing_and_new_users(client, monkeypatch, cursor, existing):
    monkeypatch.setattr(auth, "verify_google_token", lambda token: {"google_sub": "subject", "email": "example@cowrywise.com", "full_name": "Example"})
    row = (1, "example@cowrywise.com", "Example", "employee", None)
    cursor.fetchone.side_effect = [row] if existing else [None, row]
    response = client.post("/api/auth/google", json={"id_token": "mock-token"})
    assert response.status_code == 200, response.text
    assert response.json()["user"]["id"] == 1
    assert security.decode_access_token(response.json()["access_token"])["sub"] == "1"


def test_user_can_be_unassigned(client, as_user, cursor, connection):
    as_user()
    cursor.fetchone.side_effect = [(2,), (2, "example@cowrywise.com", "Example", "employee", None)]
    response = client.patch("/api/users/2", json={"team_id": None})
    assert response.status_code == 200, response.text
    assert response.json()["team_id"] is None
    connection.commit.assert_called_once()


@pytest.mark.parametrize("claims", [
    {"sub": "abc"}, {"sub": "-1"}, {"sub": "2147483648"}, {},
])
def test_invalid_token_subject_returns_401(client, claims):
    token = security.create_access_token(claims)
    assert client.get("/api/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


@pytest.mark.parametrize("domain,verified,expected", [
    ("cowrywise.com", True, 200), (None, True, 403),
    ("another-company.com", True, 403), ("cowrywise.com", False, 403),
])
def test_company_google_token_rules(monkeypatch, domain, verified, expected):
    monkeypatch.setattr(security, "GOOGLE_CLIENT_ID", "test-client")
    monkeypatch.setattr(security, "ALLOWED_DOMAIN", "cowrywise.com")
    claims = {"sub": "subject", "email": "example@cowrywise.com", "email_verified": verified, "hd": domain}
    with patch.object(security.id_token, "verify_oauth2_token", return_value=claims):
        try:
            security.verify_google_token("test-token")
            actual = 200
        except Exception as error:
            actual = error.status_code
    assert actual == expected


@pytest.mark.parametrize("issued_offset,expiry_offset,expected", [
    (2, 3600, 200), (6, 3600, 401), (-100, -6, 401),
])
def test_google_timestamp_tolerance_is_bounded(monkeypatch, issued_offset, expiry_offset, expected):
    now = 2000000000
    monkeypatch.setattr(security, "GOOGLE_CLIENT_ID", "test-client")
    monkeypatch.setattr(security, "ALLOWED_DOMAIN", "cowrywise.com")
    monkeypatch.setattr(google_jwt._helpers, "utcnow", lambda: datetime.fromtimestamp(now, timezone.utc))
    claims = {
        "sub": "subject", "email": "example@cowrywise.com",
        "email_verified": True, "hd": "cowrywise.com",
        "iat": now + issued_offset, "exp": now + expiry_offset,
    }

    def verifier(token, request, audience, clock_skew_in_seconds):
        # Use Google's real timestamp validator; remote certificate checks are mocked.
        google_jwt._verify_iat_and_exp(claims, clock_skew_in_seconds)
        return claims

    monkeypatch.setattr(security.id_token, "verify_oauth2_token", verifier)
    if expected == 200:
        assert security.verify_google_token("test-token")["google_sub"] == "subject"
    else:
        with pytest.raises(HTTPException) as error:
            security.verify_google_token("test-token")
        assert error.value.status_code == expected
