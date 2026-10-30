# Team Budget Tracker

The connected application lives in `frontend/` and `backend/`. The presentation
prototype is an independent project in `demo/`.

## Local setup

Use Python 3.12, Node.js compatible with the installed Vite version, and PostgreSQL.
From the repository root:

```bash
python3.12 -m venv backend/venv
backend/venv/bin/python -m pip install -r backend/requirements.txt
docker compose up -d db
```

For a new checkout, copy `backend/.env.example` to `backend/.env`. Preserve your
existing `.env` when updating. Set `GOOGLE_CLIENT_ID`, `DATABASE_URL`,
`COMPANY_DOMAIN=cowrywise.com`, and a private random `JWT_SECRET`. Generate the
secret with `backend/venv/bin/python -c 'import secrets; print(secrets.token_urlsafe(48))'`.
Never commit `.env` or paste the secret into source code.

For an empty database, apply numbered migrations:

```bash
cd backend
venv/bin/python -m app.migrate
```

If this project already created the database using `sql/schema.sql`, use
`venv/bin/python -m app.migrate --adopt-existing` instead. This checks the expected
columns and amount precision and records the baseline without recreating tables.
It does not verify every existing constraint. Back up valuable data before schema
changes. Later runs skip recorded migrations and reject changed checksums.

To explicitly grant administrator access to a company account:

```bash
venv/bin/python -m app.bootstrap_admin --email person@cowrywise.com --name 'Full Name'
```

This command is repeatable and preserves an existing account's team. Google sign-in
does not automatically grant administrator access.

Start the backend from the repository root:

```bash
backend/venv/bin/python -m uvicorn app.main:app --app-dir backend --reload
```

In another terminal, run `cd frontend`, `npm ci`, then
`npm run dev -- --port 5173 --strictPort`. Open http://localhost:5173 and authorize
that exact JavaScript origin in the Google OAuth client. Frontend and backend
Google client IDs must match. See [frontend setup](frontend/README.md).

## Implemented workflows

- Company Google login, database-backed permissions, and team-scoped employee access.
- Team and people administration, including assignment and unassignment.
- Budgets with optional initial line items saved in one transaction, and confirmed deletion.
- Line-item creation, editing, deletion, and search.
- Summary totals per team and currency, without adding different currencies together.
- CSV validation and preview before confirmation; invalid imports save no rows.
- A white-and-blue interface with separate Budgets, CSV Import, and Teams & People sections.

API documentation is available through the local FastAPI schema at
http://localhost:8000/docs. Budget-scoped creation and import use
`POST /api/budgets/{budget_id}/line-items` and
`POST /api/budgets/{budget_id}/line-items/import`; earlier line-item routes remain
available for compatibility. `GET /api/currencies` supplies the accepted codes.

The offline currency list in `backend/app/data/currencies.json` comes from
[SIX's ISO 4217 list](https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml),
published September 17, 2026. Test code XTS and no-currency code XXX are excluded.
Update the checked-in registry deliberately when the official list changes.

## Verification and remaining acceptance checks

```bash
backend/venv/bin/python -m pytest backend -q
cd frontend
npm test
npm run lint
npm run build
```

See [database regression checks](backend/tests/README.md) for opt-in PostgreSQL
tests. Those tests use temporary schemas and do not modify existing application
tables. Browser workflow checks used mocked API and Google responses; they do not
replace a real company-account acceptance test.

The local backend environment has been upgraded to Python 3.12.16; the standard
backend suite passes, and the LibreSSL warning is resolved. `backend/.python-version`
records the required Python series. The local interpreter and virtual environment
are ignored by Git: recreate the environment on another computer using Python 3.12.

Still to verify: the supplied finance CSV when available and the complete workflow
with actual company users. No production deployment has been done.
