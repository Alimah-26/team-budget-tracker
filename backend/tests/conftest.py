from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.core.dependencies import get_current_user
from app.db import get_db
from app.main import app
from app.core import security


@pytest.fixture(autouse=True)
def test_signing_key(monkeypatch):
    # Tests must work without relying on a developer's private environment file.
    monkeypatch.setattr(security, "SECRET_KEY", "unit-test-signing-key-not-for-real-use-123456")


@pytest.fixture
def connection():
    conn = MagicMock()
    cur = conn.cursor.return_value.__enter__.return_value
    cur.fetchone.return_value = (1,)
    cur.fetchall.return_value = []
    return conn


@pytest.fixture
def cursor(connection):
    return connection.cursor.return_value.__enter__.return_value


@pytest.fixture
def client(connection):
    previous = app.dependency_overrides.copy()
    app.dependency_overrides[get_db] = lambda: connection
    # No lifespan context: unit tests must never open the real database pool.
    test_client = TestClient(app, raise_server_exceptions=False)
    try:
        yield test_client
    finally:
        test_client.close()
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous)


@pytest.fixture
def as_user(client):
    def select(role="admin", team_id=1):
        user = {"id": 1, "email": "example@cowrywise.com", "full_name": "Example", "role": role, "team_id": team_id}
        app.dependency_overrides[get_current_user] = lambda: user
        return user
    return select
