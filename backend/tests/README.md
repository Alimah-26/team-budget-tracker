# Backend regression checks

From the repository root:

```bash
backend/venv/bin/python -m pytest backend -q
```

The normal suite mocks database connections and Google's verifier. It never opens
the production connection pool or contacts Google. PostgreSQL tests are skipped
unless `TEST_DATABASE_URL` is supplied.

To verify SQL and persistence, set `TEST_DATABASE_URL` to a PostgreSQL database
where your test account can create schemas, then run:

```bash
backend/venv/bin/python -m pytest backend/tests/test_database.py -q
```

Each PostgreSQL test creates a unique `budget_regression_...` schema, loads the
repository's schema and sample seeds there, and drops that schema on completion.
Existing tables are never cleared or changed. The tests check summary SQL,
per-currency totals, budget creation and conflicts, user assignment/unassignment,
CSV previews, rejection of invalid batches, successful imports, and persistence.

These checks do not exercise real company Google sign-in. Use Python 3.12 as
specified for the project; the existing Python 3.9 environment reports a LibreSSL
compatibility warning from urllib3. Do not suppress that warning as a substitute
for updating the environment.
