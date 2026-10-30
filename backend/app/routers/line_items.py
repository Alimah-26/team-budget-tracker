from pydantic import TypeAdapter, ValidationError
import csv
import io
import re
from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
import psycopg # type: ignore
from app.db import get_db
from app.schemas.line_items import (
    MoneyAmount,
    LineItemCreate,
    LineItemUpdate,
    LineItemResponse,
    LineItemListResponse,
    ImportResponse,
    BudgetLineItemCreate,
    CurrencyResponse,
)
from app.core.dependencies import get_current_user, require_admin
from app.core.currencies import CURRENCIES, CURRENCY_CODES
ISO_CURRENCY_REGEX = re.compile(r"[A-Z]{3}")
MONEY_ADAPTER = TypeAdapter(MoneyAmount)
router = APIRouter(prefix="/api/line-items", tags=["line-items"])
budget_items_router = APIRouter(prefix="/api/budgets", tags=["line-items"])
currency_router = APIRouter(tags=["currencies"])


@currency_router.get("/api/currencies", response_model=list[CurrencyResponse])
def list_currencies(current_user: dict = Depends(get_current_user)):
    return CURRENCIES


@router.get("/template", response_class=Response)
def csv_template(current_user: dict = Depends(require_admin)):
    return Response(
        content="code,amount,currency,description,purpose\n",
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="budget-template.csv"'},
    )
def require_budget_access(cur, budget_id: int, current_user: dict):
    if current_user["role"] != "admin":
        if current_user["team_id"] is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account awaiting team assignment",
            )

    cur.execute(
        "SELECT team_id FROM budgets WHERE id = %s;",
        (budget_id,),
    )
    budget = cur.fetchone()

    if not budget:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Budget not found",
        )

    if current_user["role"] != "admin":
        if current_user["team_id"] != budget[0]:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Budget not found",
            )

@router.post("", response_model=LineItemResponse, status_code=status.HTTP_201_CREATED)
def create_line_item(
    payload: LineItemCreate,
    conn: psycopg.Connection = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM budgets WHERE id = %s;", (payload.budget_id,))
        if not cur.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Budget period not found",
            )

        cur.execute(
            """
            INSERT INTO line_items (budget_id, code, description, purpose, amount, currency)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id, budget_id, code, description, purpose, amount, currency;
            """,
            (
                payload.budget_id,
                payload.code,
                payload.description,
                payload.purpose,
                payload.amount,
                payload.currency.upper(),
            ),
        )
        item = cur.fetchone()
        conn.commit()

    return LineItemResponse(
        id=item[0],
        budget_id=item[1],
        code=item[2],
        description=item[3],
        purpose=item[4],
        amount=item[5],
        currency=item[6],
    )


@router.get("", response_model=LineItemListResponse)
def list_line_items(
    budget_id: int,
    search: str = Query("", description="Case-insensitive ILIKE pattern match"),
    conn: psycopg.Connection = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    search_pattern = f"%{search}%"
    with conn.cursor() as cur:
        require_budget_access(cur, budget_id, current_user)
        cur.execute(
            """
            SELECT id, budget_id, code, description, purpose, amount, currency
            FROM line_items
            WHERE budget_id = %s
              AND (code ILIKE %s OR description ILIKE %s OR purpose ILIKE %s)
            ORDER BY code ASC;
            """,
            (budget_id, search_pattern, search_pattern, search_pattern),
        )
        rows = cur.fetchall()

    items = [
        {
            "id": r[0],
            "budget_id": r[1],
            "code": r[2],
            "description": r[3],
            "purpose": r[4],
            "amount": r[5],
            "currency": r[6],
        }
        for r in rows
    ]
    return LineItemListResponse(line_items=items)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_line_item(
    item_id: int,
    conn: psycopg.Connection = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    with conn.cursor() as cur:
        cur.execute("DELETE FROM line_items WHERE id = %s RETURNING id;", (item_id,))
        deleted = cur.fetchone()
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Line item not found",
            )
        conn.commit()
    return None
@router.post("/import", response_model=ImportResponse, status_code=status.HTTP_200_OK)
def import_line_items(
    budget_id: int,
    file: UploadFile = File(...),
    dry_run: bool = Query(False),
    conn: psycopg.Connection = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    if not (file.filename or "").lower().endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="File must be a CSV file",
        )

    with conn.cursor() as cur:
        cur.execute("SELECT id FROM budgets WHERE id = %s;", (budget_id,))
        if not cur.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Budget not found",
            )
        cur.execute(
            "SELECT code FROM line_items WHERE budget_id = %s;",
            (budget_id,),
        )
        existing_codes = {record[0] for record in cur.fetchall()}

    try:
        content = file.file.read().decode("utf-8-sig")
        csv_reader = csv.DictReader(io.StringIO(content), strict=True)
        rows = list(csv_reader)
    except (UnicodeDecodeError, csv.Error):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Upload a valid UTF-8 CSV file.",
        )
    required_cols = {"code", "amount", "currency", "description", "purpose"}
    if (not csv_reader.fieldnames
            or not required_cols.issubset(set(csv_reader.fieldnames))
            or len(csv_reader.fieldnames) != len(set(csv_reader.fieldnames))):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="CSV needs unique headers including code, amount, currency, description, and purpose.",
        )
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="CSV contains no line items.",
        )

    errors = []
    valid_rows = []
    seen_codes = set()

    for row_num, row in enumerate(rows, start=2):
        if None in row:
            errors.append({"row": row_num, "error": "Too many columns"})
            continue

        code = (row.get("code") or "").strip()
        amount_str = (row.get("amount") or "").strip()
        currency = (row.get("currency") or "").strip().upper()
        description = (row.get("description") or "").strip()
        purpose = (row.get("purpose") or "").strip()

        if not code or not amount_str or not currency or not description or not purpose:
            errors.append({"row": row_num, "error": "Missing required field(s)"})
            continue

        try:
            amount = MONEY_ADAPTER.validate_python(amount_str)
        except ValidationError:
            errors.append({
                "row": row_num, 
                "error": (
                    "Amount must be a positive finite number, "
                   "with at most 12 integer digits and 2 decimal places"
                ),
           })
            continue

        if not ISO_CURRENCY_REGEX.fullmatch(currency):
            errors.append({"row": row_num, "error": f"Invalid currency format '{currency}'. Must be 3 uppercase letters (e.g. NGN, USD)"})
            continue

        if currency not in CURRENCY_CODES:
            errors.append({"row": row_num, "error": f"Unsupported currency code '{currency}'"})
            continue

        if code in existing_codes:
            errors.append({"row": row_num, "error": f"Code '{code}' already exists in this budget"})
            continue

        if code in seen_codes:
            errors.append({"row": row_num, "error": f"Duplicate line item code '{code}' inside CSV file"})
            continue
        seen_codes.add(code)

        valid_rows.append((budget_id, code, description, purpose, amount, currency, "import"))


    if errors or dry_run:
        return {
            "success": len(errors) == 0,
            "dry_run": dry_run,
            "total_rows": len(valid_rows) + len(errors),
            "imported_count": 0,
            "errors": errors,
        }


    try:
        with conn.cursor() as cur:
            cur.executemany(
                """
                INSERT INTO line_items (budget_id, code, description, purpose, amount, currency, source)
                VALUES (%s, %s, %s, %s, %s, %s, %s);
                """,
                valid_rows,
            )
        conn.commit()
    except psycopg.errors.UniqueViolation:
        conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="One or more line item codes already exist in this budget.",
        )
    except psycopg.Error:
        conn.rollback()
        raise

    return {
        "success": True,
        "dry_run": False,
        "imported_count": len(valid_rows),
        "total_rows": len(rows),
        "errors": [],
    }

@router.patch("/{item_id}", response_model=LineItemResponse)
def edit_line_item(
    item_id: int,
    payload: LineItemUpdate,
    conn: psycopg.Connection = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM line_items WHERE id = %s;", (item_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Line item not found")

        cur.execute(
            """
            UPDATE line_items
            SET code = COALESCE(%s, code),
                description = COALESCE(%s, description),
                purpose = COALESCE(%s, purpose),
                amount = COALESCE(%s, amount),
                currency = COALESCE(%s, currency)
            WHERE id = %s
            RETURNING id, budget_id, code, description, purpose, amount, currency;
            """,
            (
                payload.code,
                payload.description,
                payload.purpose,
                payload.amount,
                payload.currency.upper() if payload.currency else None,
                item_id,
            ),
        )
        item = cur.fetchone()
        if not item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Line item not found")
        conn.commit()

    return LineItemResponse(
        id=item[0],
        budget_id=item[1],
        code=item[2],
        description=item[3],
        purpose=item[4],
        amount=item[5],
        currency=item[6],
    )


@budget_items_router.post("/{budget_id}/line-items", response_model=LineItemResponse, status_code=201)
def create_budget_line_item(
    budget_id: int,
    payload: BudgetLineItemCreate,
    conn: psycopg.Connection = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    return create_line_item(LineItemCreate(budget_id=budget_id, **payload.model_dump()), conn, current_user)


@budget_items_router.post("/{budget_id}/line-items/import", response_model=ImportResponse)
def import_budget_line_items(
    budget_id: int,
    file: UploadFile = File(...),
    dry_run: bool = Query(False),
    conn: psycopg.Connection = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    return import_line_items(budget_id, file, dry_run, conn, current_user)
