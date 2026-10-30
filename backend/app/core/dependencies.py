from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import psycopg # type: ignore
from app.db import get_db
from app.core.security import decode_access_token

security_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
    conn: psycopg.Connection = Depends(get_db),
) -> dict:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(credentials.credentials)
    subject = payload.get("sub")

    try:
        if not isinstance(subject, str):
            raise ValueError

        user_id = int(subject)
        if not 1 <= user_id <= 2147483647:
            raise ValueError
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication claims",
            headers={"WWW-Authenticate": "Bearer"},
        )

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, email, full_name, role, team_id 
            FROM users 
            WHERE id = %s;
            """,
            (user_id,),
        )
        user = cur.fetchone()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found",
            )

        u_id, email, full_name, role, team_id = user
        return {
            "id": u_id,
            "email": email,
            "full_name": full_name,
            "role": role,
            "team_id": team_id,
        }


def require_admin(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return current_user