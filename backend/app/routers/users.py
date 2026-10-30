
from fastapi import APIRouter, Depends, HTTPException, status, Query
import psycopg # type: ignore
from app.db import get_db
from app.core.dependencies import get_current_user, require_admin

router = APIRouter(prefix="/api", tags=["users"])


from app.schemas.users import (
    UserUpdate,
    UserResponse,
    CurrentUserResponse,
)


@router.get("/me", response_model=CurrentUserResponse)
def get_me(
    conn: psycopg.Connection = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT u.id, u.email, u.full_name, u.role, u.team_id, t.name as team_name
            FROM users u
            LEFT JOIN teams t ON u.team_id = t.id
            WHERE u.id = %s;
            """,
            (current_user["id"],),
        )
        user = cur.fetchone()
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    return {
        "id": user[0],
        "email": user[1],
        "full_name": user[2],
        "role": user[3],
        "team_id": user[4],
        "team_name": user[5],
    }


@router.get("/users", response_model=list[UserResponse])
def list_users(
    unmapped: bool = Query(False),
    conn: psycopg.Connection = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    with conn.cursor() as cur:
        if unmapped:
            cur.execute(
                """
                SELECT id, email, full_name, role, team_id 
                FROM users 
                WHERE team_id IS NULL AND role != 'admin'
                ORDER BY created_at DESC;
                """
            )
        else:
            cur.execute(
                """
                SELECT id, email, full_name, role, team_id 
                FROM users 
                ORDER BY created_at DESC;
                """
            )
        rows = cur.fetchall()

    return [
        {"id": r[0], "email": r[1], "full_name": r[2], "role": r[3], "team_id": r[4]}
        for r in rows
    ]


@router.patch("/users/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    payload: UserUpdate,
    conn: psycopg.Connection = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM users WHERE id = %s;", (user_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        if payload.team_id is not None:
            cur.execute("SELECT id FROM teams WHERE id = %s;", (payload.team_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")



        cur.execute(
            """
            UPDATE users
            SET team_id = CASE WHEN %s THEN %s ELSE team_id END,
                role = COALESCE(%s, role)
            WHERE id = %s
            RETURNING id, email, full_name, role, team_id;
            """,
            (
                "team_id" in payload.model_fields_set,
                payload.team_id,
                payload.role,
                user_id,
            ),
        )

        updated = cur.fetchone()
        if not updated:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        conn.commit()


    return {
        "id": updated[0],
        "email": updated[1],
        "full_name": updated[2],
        "role": updated[3],
        "team_id": updated[4],
    }
