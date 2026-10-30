# Department MVP walkthrough

## Start the demo

From `demo/`, run `npm ci` once, then `npm run dev`. Open
`http://localhost:5174/`. This is a separate app from the real frontend on port 5173.

This is a frontend prototype using fictional people and budgets. No Google login,
database, backend process, or internet connection is needed once Vite is running.
The `cowrywise.com` addresses are fictional examples, not real employee accounts.
Changes use a separate browser storage key and never send requests to the API.

Before presenting, click **Reset sample data** as the Admin. Close other tabs that
could contain private information. Use a desktop browser at 100% zoom; the app also
adapts to smaller screens. Keep the terminal running while presenting.

## Five-minute script

1. **The problem — 30 seconds.** “Team budgets can be spread across spreadsheets.
   This prototype gives finance a single place to plan allocations and gives each
   teammate a clear view of their own team’s budget.”
2. **Overview — 45 seconds.** Show Q4. Explain NGN and USD totals separately.
   Point out Operations has no budget. These are planned allocations, not actual
   expenses. The bars show each team’s share of the NGN allocation only.
3. **Budget workspace — 60 seconds.** Open Engineering. Search `cloud`, then clear
   the search. Add `CW10005`, description `Engineering workshop`, purpose
   `Quarterly skills development`, amount `250000`, currency `NGN`. Edit it to
   `300000`. Point out updated totals and the code, description, and purpose.
4. **CSV import — 60 seconds.** Select Operations after creating its Q4 budget, or
   use an existing budget. Click **Load error example**. Explain that nothing is
   saved if any row is invalid. Click **Load sample CSV**, inspect the two rows,
   then confirm the import. Return to Budget workspace to show the imported items.
   The same sample cannot be imported twice into the same budget.
5. **Access — 60 seconds.** Use **Present as** to select New Teammate and show
   awaiting access. Switch back to Finance Admin. In Teams & people, assign New
   Teammate to Operations. Switch to New Teammate again and show its read-only
   budget. The sample-data persona switch illustrates UI behaviour; it does not
   demonstrate real authentication or server authorization.
6. **Next milestone — 30 seconds.** “Next we are connecting the workflows to our
   FastAPI and PostgreSQL backend, completing company Google SSO and server-side
   permissions, and verifying the flow with real import files and tests.”

The in-app **Presentation guide** has these talking points and screen shortcuts.

## Questions you may get

- **Is this actual spend?** No. V1 covers planned budget input. Spend tracking is
  a future version.
- **Are currencies converted?** No. Totals are always separate by currency.
- **Is this real company financial data?** No. All demo people and amounts are fictional.
- **Is Google SSO working in this demo?** The demo intentionally skips SSO. The
  separate connected application has a Google sign-in flow under development.
- **Where are edits saved?** In this browser only. Reset restores the starting data.
- **What is implemented here?** Team summaries, budget creation, line-item add/edit/
  delete, search, CSV preview/import/export, team management, and team mapping.
- **What is still backend work?** Completing and integrating APIs, persistent
  database storage for these workflows, company-only SSO, access enforcement,
  validation, and endpoint tests. The prototype does not prove those are finished.

## Recovery during the presentation

- Something looks different after rehearsal: Admin → **Reset sample data**.
- An import reports duplicate codes: use another budget or reset the samples.
- A team is missing in employee mode: switch to Admin and check its team mapping.
- The original connected dashboard reports an API error: open `http://localhost:5174/`; the demo
  does not need the API.
- Refresh keeps demo edits when localStorage is available. If browser storage is
  blocked, a banner says changes last only for the current session.
