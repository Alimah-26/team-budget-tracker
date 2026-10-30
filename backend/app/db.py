from psycopg_pool import ConnectionPool # type: ignore
from app.core.config import DATABASE_URL


pool = ConnectionPool(conninfo=DATABASE_URL, min_size=1, max_size=10, open=False)

def get_db():
    with pool.connection() as conn:
        yield conn


        
