from contextlib import asynccontextmanager
import logging
from fastapi import FastAPI, Depends, Request, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import psycopg # type: ignore
from app.db import pool, get_db
from app.routers import auth, teams, budgets, line_items, users


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool.open()
    try:
        yield
    finally:
        pool.close()


app = FastAPI(
    title="Team Budget Tracker API",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(psycopg.Error)
async def database_exception_handler(request: Request, exc: psycopg.Error):
    logging.getLogger(__name__).error("Database operation failed", exc_info=exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Database operation failed"},
    )


@app.exception_handler(psycopg.errors.UniqueViolation)
async def duplicate_exception_handler(request: Request, exc: psycopg.Error):
    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        content={"detail": "A record with these unique fields already exists"},
    )


@app.exception_handler(psycopg.errors.ForeignKeyViolation)
async def reference_exception_handler(request: Request, exc: psycopg.Error):
    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        content={"detail": "A referenced record no longer exists or is still in use"},
    )


@app.exception_handler(psycopg.errors.CheckViolation)
@app.exception_handler(psycopg.DataError)
async def invalid_data_exception_handler(request: Request, exc: psycopg.Error):
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": "Invalid database field value"},
    )


app.include_router(auth.router)
app.include_router(teams.router)
app.include_router(budgets.router)
app.include_router(line_items.router)
app.include_router(line_items.budget_items_router)
app.include_router(line_items.currency_router)
app.include_router(users.router)


@app.get("/api/health")
def health_check(conn: psycopg.Connection = Depends(get_db)):
    with conn.cursor() as cur:
        cur.execute("SELECT 1;")
        result = cur.fetchone()
    return {"status": "ok", "db": result[0] == 1}
