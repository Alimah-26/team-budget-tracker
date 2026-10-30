from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
import psycopg # type: ignore
from psycopg.rows import dict_row # type: ignore
from app.db import get_db
from app.schemas.auth import GoogleAuthRequest, TokenResponse
from app.core.security import verify_google_token, create_access_token

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/google", response_model=TokenResponse)
def google_auth(
    payload: GoogleAuthRequest, 
    conn: psycopg.Connection = Depends(get_db)
):
    
    google_user = verify_google_token(payload.id_token)
    google_sub = google_user["google_sub"]
    email = google_user["email"]
    full_name = google_user["full_name"]

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, email, full_name, role, team_id 
            FROM users 
            WHERE google_sub = %s OR email = %s;
            """,
            (google_sub, email),
        )
        user = cur.fetchone()

        if user:
            user_id, email, full_name, role, team_id = user
        
            cur.execute(
                """
                UPDATE users 
                SET last_login_at = %s, google_sub = %s 
                WHERE id = %s;
                """,
                (datetime.now(timezone.utc), google_sub, user_id),
            )
        else:
        
            cur.execute(
                """
                INSERT INTO users (google_sub, email, full_name, role, team_id, last_login_at)
                VALUES (%s, %s, %s, 'employee', NULL, %s)
                RETURNING id, email, full_name, role, team_id;
                """,
                (google_sub, email, full_name, datetime.now(timezone.utc)),
            )
            user_record = cur.fetchone()
            user_id, email, full_name, role, team_id = user_record

        conn.commit()

    token_data = {
        "sub": str(user_id),
        "email": email,
        "role": role,
        "team_id": team_id,
    }
    access_token = create_access_token(data=token_data)

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user={
            "id": user_id,
            "email": email,
            "full_name": full_name,
            "role": role,
            "team_id": team_id,
        },
    )