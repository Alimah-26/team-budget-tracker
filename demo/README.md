# Cowrywise Budget Demo

Standalone presentation prototype with fictional budget data. It does not use the
FastAPI backend, Google sign-in, or the real frontend's authentication token.

## Run

Use Node.js 24 (the version used to verify this project), then:

```bash
cd demo
npm ci
npm run dev
```

Open **http://localhost:5174/**. No `?demo=1` parameter is needed.
The real application remains in `frontend/`, normally at http://localhost:5173/.
The demo's “Open connected application” link uses that address; set `VITE_APP_URL`
when starting Vite if the connected frontend uses a different address.

## Checks and production preview

```bash
npm test
npm run lint
npm run build
npm run preview
```

The production preview uses http://localhost:4174/.

## Demo data

Edits persist under the `cowrywise-budget-presentation-v1` localStorage key.
Storage belongs to the browser origin: old changes from port 5173 do not move to
port 5174. The new demo starts with the original samples. Nothing is deleted from
the old browser storage or from the real database.

Use **Reset sample data** in the demo to rehearse again. CSV examples are in
`public/`. The five-minute script is in [DEMO_GUIDE.md](DEMO_GUIDE.md).

This prototype illustrates the intended workflow. It does not demonstrate real
authentication, database persistence, or server-side access enforcement.
