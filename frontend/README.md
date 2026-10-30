# Team Budget Tracker — connected frontend

This React application uses the FastAPI backend and PostgreSQL data. The separate
presentation prototype lives in `../demo/` and is not imported here.

## Run locally

Start PostgreSQL with `docker compose up -d db` from the repository root.
Start the API from the repository root:

```bash
backend/venv/bin/python -m uvicorn app.main:app --app-dir backend --reload
```

In another terminal:

```bash
cd frontend
npm ci
npm run dev -- --port 5173 --strictPort
```

Open **http://localhost:5173/**. Google OAuth must authorize that exact origin.
Backend configuration loads from `backend/.env`. The frontend uses the existing
Google client ID unless `VITE_GOOGLE_CLIENT_ID` overrides it; both client IDs must
match. `VITE_API_URL` optionally overrides `http://localhost:8000`.

## Connected workflows

- Google login exchanges an ID token for the app token.
- `/api/me` supplies the current database role/team on sign-in, refresh, and window
  focus. The UI does not rely on potentially stale role/team JWT claims.
- Admins load `/api/summary`, filter teams, and search line items.
- Employees load only their assigned team's budget, never the admin summary.
- Unmapped employees see awaiting access and can check again after being assigned.
- Admins can create a budget with optional initial line items saved together,
  delete a budget after confirmation, and add, edit, or delete its line items.
- Currency choices come from the backend's checked-in ISO 4217 registry.
- Budget totals use decimal strings and integer cents, separately per currency.
- A `401` ends the session. Network failures show a retry state without discarding
  the stored token.

Admins also have **CSV Import** and **Teams & People** tabs connected to the real
API. CSV import requires server validation before confirmation and shows a preview
of the selected file (up to 100 rows) plus all returned row errors. Replacing the
file or target budget invalidates the preview. People changes use an explicit
Save button, and deleting a team requires confirmation of the cascading deletion.
Changing your own role/team refreshes `/api/me` immediately.

## CSV test files

The CSV Import screen offers the template and valid sample. All three files are
also available in `public/csv/`:

- `budget-template.csv`: required headers only.
- `budget-sample.csv`: two fictional valid line items in NGN and USD.
- `budget-errors.csv`: negative amount, invalid currency format, missing fields.

The connected application uses a white-and-blue layout with separate Budgets,
CSV Import, and Teams & People sections. Employee navigation shows My budget.

For a clean test, create a test team and budget first. Choose the period and budget,
select the file, click **Validate & preview**, review the report, then **Confirm
import**. Confirming saves real data to PostgreSQL. Importing the same sample twice
into one budget should report duplicate codes. The error example must not insert
any rows. When your real CSV is ready, use the same five columns:
`code,amount,currency,description,purpose`.

For access management, assign a team and/or role in Teams & People, then click Save
on that person's row. Clearing the team sends `team_id: null`. Employee accounts
can check access again or refocus the application after finance maps them.

## Checks

```bash
npm test
npm run lint
npm run build
```

The frontend tests mock HTTP responses to check route contracts, role-specific
loading, search, mutation payloads, and exact money calculations. They do not sign
in to Google or change the real database.
