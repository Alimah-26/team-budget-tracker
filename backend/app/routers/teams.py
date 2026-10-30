from fastapi import APIRouter, Depends, HTTPException, status
import psycopg # type: ignore
from app.db import get_db
from app.schemas.teams import TeamBase, TeamCreate, TeamResponse, TeamListResponse
from app.core.dependencies import get_current_user, require_admin

router = APIRouter(prefix="/api/teams", tags=["teams"])

class TeamUpdate(TeamBase):
    pass

@router.get("", response_model=TeamListResponse)
def list_teams(
    conn: psycopg.Connection = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    with conn.cursor() as cur:
        # Employees see only their assigned team; admins see all teams
        if current_user.get("role") != "admin":
            team_id = current_user.get("team_id")
            if team_id is None:
                return TeamListResponse(teams=[])
            cur.execute("SELECT id, name, created_at, created_by FROM teams WHERE id = %s;", (team_id,))
        else:
            cur.execute("SELECT id, name, created_at, created_by FROM teams ORDER BY name ASC;")
            
        rows = cur.fetchall()

    return TeamListResponse(
        teams=[
            TeamResponse(
                id=r[0],
                name=r[1],
                created_at=r[2],
                created_by=r[3],
            )
            for r in rows
        ]
    )


@router.get("/{team_id}", response_model=TeamResponse)
def get_team(
    team_id: int,
    conn: psycopg.Connection = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] != "admin":
        if current_user["team_id"] != team_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Team not found",
            ) 
    with conn.cursor() as cur:
        cur.execute("SELECT id, name FROM teams WHERE id = %s;", (team_id,))
        team = cur.fetchone()

    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )

    return TeamResponse(id=team[0], name=team[1])

@router.post("", response_model=TeamResponse, status_code=status.HTTP_201_CREATED)
def create_team(
    payload: TeamCreate,
    conn: psycopg.Connection = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO teams (name, created_by)
                VALUES (%s, %s)
                RETURNING id, name, created_at, created_by;
                """,
                (payload.name, current_user["id"]),
            )
            team = cur.fetchone()
            conn.commit()
    except psycopg.errors.UniqueViolation:
        conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Team with name '{payload.name}' already exists.",
        )

    return TeamResponse(id=team[0], name=team[1], created_at=team[2], created_by=team[3])

@router.patch("/{team_id}", response_model=TeamResponse)
def rename_team(
    team_id: int,
    payload: TeamUpdate,
    conn: psycopg.Connection = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE teams SET name = %s WHERE id = %s
                RETURNING id, name, created_at, created_by;
                """,
                (payload.name, team_id),
            )
            team = cur.fetchone()
            if not team:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
            conn.commit()
    except psycopg.errors.UniqueViolation:
        conn.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Team name already in use")

    return TeamResponse(id=team[0], name=team[1], created_at=team[2], created_by=team[3])

@router.delete("/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_team(
    team_id: int,
    conn: psycopg.Connection = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    with conn.cursor() as cur:
        cur.execute("DELETE FROM teams WHERE id = %s RETURNING id;", (team_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
        conn.commit()
    return None
