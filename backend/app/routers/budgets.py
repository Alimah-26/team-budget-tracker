from fastapi import APIRouter, Depends, HTTPException, Query, status
import psycopg  # type: ignore

from app.db import get_db
from app.schemas.budgets import (
    BudgetCreate,
    BudgetResponse,
    BudgetDetailResponse,
    BudgetSummaryResponse,
)
from app.core.dependencies import get_current_user, require_admin


router = APIRouter(tags=["budgets"])

def require_budget_access(
    team_id: int,
    current_user: dict = Depends(get_current_user)
) -> dict:
    user_role = current_user.get("role")
    user_team_id = current_user.get("team_id")

    if user_role == "admin":
        return current_user

    if user_team_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account awaiting team assignment",
        )

    if user_team_id != team_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Budget not found",
        )

    return current_user

@router.post("/api/teams/{team_id}/budgets", response_model=BudgetResponse, status_code=status.HTTP_201_CREATED)
def create_budget(
    team_id: int,
    payload: BudgetCreate,
    conn: psycopg.Connection = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM teams WHERE id = %s;", (team_id,))
        if not cur.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Team not found",
            )

        try:
            cur.execute(
                """
                INSERT INTO budgets (team_id, period, created_by)
                VALUES (%s, %s, %s)
                RETURNING id, team_id, period;
                """,
                (team_id, payload.period, current_user["id"]),
            )
            budget = cur.fetchone()
            if payload.line_items:
                cur.executemany(
                    """
                    INSERT INTO line_items (budget_id, code, description, purpose, amount, currency)
                    VALUES (%s, %s, %s, %s, %s, %s);
                    """,
                    [(budget[0], item.code, item.description, item.purpose, item.amount, item.currency)
                     for item in payload.line_items],
                )
            conn.commit()
        except psycopg.errors.UniqueViolation:
            conn.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Budget for team {team_id} in period '{payload.period}' already exists.",
            )
        except psycopg.Error:
            conn.rollback()
            raise

    return BudgetResponse(id=budget[0], team_id=budget[1], period=budget[2])



@router.get("/api/teams/{team_id}/budgets/{period}",
            response_model=BudgetDetailResponse,
            )
def get_team_budget_for_period(
    team_id: int,
    period: str,
    conn: psycopg.Connection = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    
    require_budget_access(team_id, current_user)

    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, team_id, period FROM budgets WHERE team_id = %s AND period = %s;",
            (team_id, period),
        )
        budget = cur.fetchone()
        if not budget:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Budget not found",
            )

        budget_id = budget[0]

        
        cur.execute(
            """
            SELECT id, budget_id, code, description, purpose, amount, currency, source
            FROM line_items
            WHERE budget_id = %s
            ORDER BY code ASC;
            """,
            (budget_id,),
        )
        items = cur.fetchall()

        
        cur.execute(
            """
            SELECT currency, SUM(amount)
            FROM line_items
            WHERE budget_id = %s
            GROUP BY currency;
            """,
            (budget_id,),
        )
        totals = cur.fetchall()

    return BudgetDetailResponse.model_validate({
        "id": budget_id,
        "team_id": budget[1],
        "period": budget[2],
        "line_items": [
            {
                "id": r[0],
                "budget_id": r[1],
                "code": r[2],
                "description": r[3],
                "purpose": r[4],
                "amount": r[5],
                "currency": r[6],
                "source": r[7],
            }
            for r in items
        ],
        "totals": [{"currency": r[0], "total_amount": r[1]} for r in totals],
    })



@router.delete("/api/budgets/{budget_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_budget(
    budget_id: int,
    conn: psycopg.Connection = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    with conn.cursor() as cur:
        cur.execute("DELETE FROM budgets WHERE id = %s RETURNING id;", (budget_id,))
        if not cur.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Budget not found",
            )
        conn.commit()
    return None


@router.get("/api/summary", response_model=BudgetSummaryResponse)
def get_summary(
    period: str = Query("2026-Q4"),
    conn: psycopg.Connection = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT 
                t.id AS team_id,
                t.name AS team_name,
                li.currency,
                COALESCE(SUM(li.amount), 0.00) AS total_amount,
                b.id AS budget_id
            FROM teams t
            LEFT JOIN budgets b ON t.id = b.team_id AND b.period = %s
            LEFT JOIN line_items li ON b.id = li.budget_id
            GROUP BY t.id, t.name, b.id, li.currency
            ORDER BY t.name ASC;
            """,
            (period,),
        )
        rows = cur.fetchall()

    return BudgetSummaryResponse(
        period=period,
        summaries=[
            {
                "team_id": r[0],
                "team_name": r[1],
                "currency": r[2],
                "total_amount": r[3],
                "budget_id": r[4],
            }
            for r in rows
        ],
    )
