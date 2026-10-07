# CDC Stock Issue Tool — frontend

Storekeepers use this to issue paper and other stock to jobs, against a picklist or directly to a job content. It replaces two screens of the ERP and shows the voucher number the ERP never does.

The backend is a module in the `eacdc/CDC-Site` repo (`/api/issue-tool`). This repo is only the web app. Its single source of truth is [`docs/issue-tool-api.md`](docs/issue-tool-api.md), a copy of the backend's contract. When the backend changes the contract, copy the new file here.

- React 19 + Vite + TypeScript, no UI framework.
- One typed API client (`src/api/http.ts`) talking to the real backend; components never call `fetch`. An in-browser mock of the contract (`src/api/mock.ts`) is used only by the unit tests.
- Deployed on Render as a static site.

## Local setup on macOS

You need Node 20.19 or later (22 recommended).

```sh
brew install node@22          # or: nvm install 22 && nvm use 22
git clone https://github.com/eacdc/Item-Issue-Tool.git
cd Item-Issue-Tool
npm install
cp .env.example .env.local    # empty = production server
npm run dev                   # http://localhost:5173
```

Sign-in is the same as the production entry tool: your ERP **username** and the **database** (KOL or AHM), no password. The app always talks to the real backend; whether saves are written or dry-run is decided by the server (`ISSUE_TOOL_ALLOW_WRITES`).

### Against the real backend

```sh
# .env.local
VITE_API_BASE_URL=http://localhost:3001     # or https://cdcapi.onrender.com
```

Restart `npm run dev` after changing it: Vite reads env files at start-up. The backend must allow this origin (see its `CORS_ORIGINS` / `ISSUE_TOOL_CORS_ORIGIN`; with `CORS_ORIGINS` unset it allows every origin). Sign in with your ERP username (as in `UserMaster`, the same one the production entry tool uses) and the database.

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
| `VITE_API_BASE_URL` | `http://localhost:3001` | Backend origin, no trailing slash. Empty (or the old `mock`) → `https://cdcapi.onrender.com`. |

It picks which backend the app talks to. Vite inlines it at **build** time, so changing it on Render needs a rebuild. Never put secrets in a `VITE_` variable: it ends up in the JavaScript anyone can download.

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
- **Picklist list.** Newest picklist first, with the ERP picklist screen's columns. **Issue** opens the issue form; **Close** closes the line after a confirmation (a dry run while writes are off), as the ERP's Close does. **Closed allocation picklist** lists the closed lines instead, with when and by whom. Page size 50 / 150 / 500.
- **Issue form.** Laid out like the ERP's Create Issue screen: voucher no. (given on save) and date, the picklist line, its batches, already issued + quantity + Add, the lines being issued, then floor warehouse, bin and remark.
- **Tables.** Every table (picklist list, picklist line, batches, lines, job contents, planned items, item search, History) is the same grid: a filter under each header that suits the column (text: contains; number: `5`, `>1000`, `<=5`, `<>0`, `100-200`; date: on / from / until), click a header to sort, and a totals row. Every grid fits a desktop window without sideways scrolling (fixed column widths, compact 20px rows, long values cut short with … and shown in full on hover), shows 30 rows per page by default (100 / 500 / 1000 on request), and keeps its header and filter row at the top while the page scrolls. Quantity totals are **Kg only**: Kg plus sheets weighed from the item's GSM × SizeW × SizeL (mm). Nos, Ltr, Mtr, Roll and sheets without GSM or size are left out of the total and listed on hover (the * marks a total that has such notes). A stock column counts each item once. Filters and totals cover all matching rows, not just the page.
- **History.** The ERP's issue register: one row per issue line with Item Group, Sub Group, Issue No., Issue Date, Item Code / Name, Picklist No. (the voucher no. on a direct issue, as the ERP shows), Department, J.C. No., Job, Content, Machine, Issue Qty, Stock Unit, Client, Created By, Remark, plus Slip No., Type, batch and floor bin. Default period: the last 7 days. **Delete** deletes the whole voucher.
- **Direct issue: finding the job.** The Job Card Generator's filters (Job Booking No, Client Name, Sales Person, Job Date, Job Status), then **Search**. Results look like the ERP's "Exist Job Card" list: one row per content and planned paper, with Released Date, Booking No, Job Card No, Job Name, Content Name, Item Code and Required / Issued / Pending in sheets, Kg and running metres (sheets weighed from GSM × size; running metres for reels = Kg × 1,000,000 ÷ (GSM × width mm)). Rows whose paper has been issued are green. Clicking a row picks the content and preselects its paper. The search and its results are kept when you change job.
- **Direct issue screen.** Laid out like the ERP's Item Issue (direct) screen: Issue No. (given on save) and Issue Date; Picklist Type **Job Allocated** (the job's planned items) or **All** (search every item); **Job Consumables** or **Other** (no job); Job Card No. with **Click** (look it up) and ⊞ (the Exist Job Card search); Process Name, Department, Machine, Required Qty In (SU); a Job Card list of the job's contents. The item grid shows Process Name, Item Code, Item Group, Sub Group, Item Name, GSM, Size W, Size L, Manufacturer, Supplier Reference, Stock Unit, Physical / Allocated / Free / Incoming / Unapproved Stock, Unit Decimal Place and Issue Quantity; then Stock Batch Wise; Already Issued Qty, Quantity, Add; the lines with Process, Machine and Department; Slip No., Slip Date, Floor Warehouse, Bin, Remark. Each line keeps the machine chosen when it was added (saved, as the ERP does); the process is shown and preselects the planned machine, but is saved as 0, as the ERP does. Slip Date is shown but not saved, as in the ERP.
- **Light / dark mode.** The header button switches; the choice is remembered in this browser. Until one is chosen, the system setting decides.

Out of scope for now, as agreed: the ERP's Picklist Type options, Process and Machine selection, issuing without a job card, printing slips.

## Testing

[`TEST_CHECKLIST.md`](TEST_CHECKLIST.md) walks through the two acceptance flows by hand, in mock mode and against the real backend in dry run.
