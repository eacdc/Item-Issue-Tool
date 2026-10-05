# CDC Stock Issue Tool — frontend

Storekeepers use this to issue paper and other stock to jobs, against a picklist or directly to a job content. It replaces two screens of the ERP and shows the voucher number the ERP never does.

The backend is a module in the `eacdc/CDC-Site` repo (`/api/issue-tool`). This repo is only the web app. Its single source of truth is [`docs/issue-tool-api.md`](docs/issue-tool-api.md), a copy of the backend's contract. When the backend changes the contract, copy the new file here.

- React 19 + Vite + TypeScript, no UI framework.
- One typed API client (`src/api/http.ts`) and an in-browser mock of the whole contract (`src/api/mock.ts`). Both implement `IssueToolApi` in `src/api/types.ts`; components never call `fetch`.
- Deployed on Render as a static site.

## Local setup on macOS

You need Node 20.19 or later (22 recommended).

```sh
brew install node@22          # or: nvm install 22 && nvm use 22
git clone https://github.com/eacdc/Item-Issue-Tool.git
cd Item-Issue-Tool
npm install
cp .env.example .env.local    # VITE_API_BASE_URL=mock
npm run dev                   # http://localhost:5173
```

In mock mode any email and password sign in (the password `wrong` fails). The header has a **Mock API** menu to:

- turn writes on and off (off = every save is a dry run, as on the real server until writes are enabled);
- make the next save's stock refresh fail;
- expire the session, to see the sign-in dialog appear over a half-filled form.

The mock is seeded with the two issues the backend's acceptance tests use: picklist `IPIC03454` (item P02621, Sheet, two batches) and job content `J06482_26_27[1_1]` (planned R01312, substitute R01175, Kg).

### Against the real backend

```sh
# .env.local
VITE_API_BASE_URL=http://localhost:3001     # or https://cdcapi.onrender.com
```

Restart `npm run dev` after changing it: Vite reads env files at start-up. The backend must allow this origin (see its `CORS_ORIGINS` / `ISSUE_TOOL_CORS_ORIGIN`; with `CORS_ORIGINS` unset it allows every origin). You sign in with a Supplier Portal login that has the `STORE` role. Posting also needs an ERP UserID on that login.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the built `dist/` locally |
| `npm run typecheck` | TypeScript only |
| `npm test` | Unit tests (quantities, line arithmetic, the save/warnings flow against the mock) |

## Environment variables

| Variable | Example | Meaning |
|---|---|---|
| `VITE_API_BASE_URL` | `https://cdcapi.onrender.com` | Backend origin, no trailing slash. Empty or `mock` → the built-in mock. |

It is the only switch between mock and real. Vite inlines it at **build** time, so changing it on Render needs a rebuild. Never put secrets in a `VITE_` variable: it ends up in the JavaScript anyone can download.

## Deploying on Render

1. **New → Static Site**, connect `eacdc/Item-Issue-Tool`. Or **New → Blueprint** to use `render.yaml`.
2. Build command `npm ci && npm run build`, publish directory `dist`.
3. Environment: `VITE_API_BASE_URL=https://<your backend>` and `NODE_VERSION=22`.
4. Deploy. Then on the backend service, if `CORS_ORIGINS` is set, add this site's URL to `ISSUE_TOOL_CORS_ORIGIN` (or to `CORS_ORIGINS`) and restart it.

## How it behaves

- **Dry run.** `GET /session` says whether the server really writes. While it does not, a striped DRY RUN banner shows on every screen and the confirm button reads "Confirm (dry run)". A dry-run result never shows a voucher number; the rows the server would have written are viewable, with the rolled-back IDs masked.
- **Request ID.** Each form gets a UUID when it opens. Every save attempt from that form uses it: the resend after acknowledging warnings, and any retry after an error, a timeout or a re-login. The server makes at most one voucher per ID; a repeat comes back marked "already saved". Only **New issue** starts a new ID.
- **Warnings.** The first save never acknowledges. If the server answers with warnings (over pending, over batch stock), the confirmation dialog lists them and the save button stays disabled until the tick-box is ticked. The resend is the same request with `acknowledgeWarnings: true`.
- **Voucher number.** Shown only after a real save succeeds, large, with **New issue**.
- **Stock refresh failure.** If the server saved the issue but could not refresh the stock summary, the result says so plainly and offers **Retry stock refresh**.
- **Expired session.** A 401 opens a sign-in dialog over the screen. The form underneath stays as it was; after signing in, press Save (or Confirm) again.
- **Quantities.** Digits and one dot only, more than zero, at most 3 decimals; the field selects all on focus and Enter adds the line. The stock unit sits next to every quantity, and totals never add Kg to Sheet.
- **Stale stock.** Batch stock reloads when the window regains focus and again right before the confirmation dialog, which warns if a line now takes more than its batch holds.
- **Later: closing picklist lines.** The picklist table's last column holds row actions and each row carries `picklistDetailId`, so a "Close" button can be added there.

Out of scope for now, as agreed: closing picklist lines, the ERP's Picklist Type options, Process and Machine selection, issuing without a job card, printing slips.

## Testing

[`TEST_CHECKLIST.md`](TEST_CHECKLIST.md) walks through the two acceptance flows by hand, in mock mode and against the real backend in dry run.
