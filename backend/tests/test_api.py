from fastapi import HTTPException
from app.routers import auth


def test_health_check_endpoint(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["db"] is True


def test_invalid_google_auth_returns_401(client, monkeypatch):
    def invalid_token(token):
        raise HTTPException(status_code=401, detail="Invalid Google ID token")
    monkeypatch.setattr(auth, "verify_google_token", invalid_token)
    response = client.post("/api/auth/google", json={"id_token": "fake_token_value"})
    assert response.status_code == 401
    assert "detail" in response.json()


def test_unauthenticated_teams_request_returns_401(client):
    response = client.get("/api/teams")
    assert response.status_code == 401


def test_unauthenticated_budgets_summary_returns_401(client):
    response = client.get("/api/summary")
    assert response.status_code == 401


def test_unauthenticated_line_items_returns_401(client):
    response = client.get("/api/line-items?budget_id=1")
    assert response.status_code == 401
