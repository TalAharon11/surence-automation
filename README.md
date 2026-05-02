# Insurance Process Automation

> An end-to-end automation system that reads daily Excel reports from insurance companies, applies business rules, updates a task-management system via browser automation, and emails a structured audit report — all triggered by a single incoming email.

---

## The Problem This Solves

Insurance agents manually process dozens of transfer requests (ניוד) every day. Each morning they receive Excel reports from insurance companies (Harel, Menora, Migdal, etc.) listing clients whose forms have been reviewed. For each row, the agent has to:

1. Find the client in the task-management system
2. Decide what to do based on the report data (approve, set a follow-up date, reject)
3. Update the status and required-action date
4. Add a note
5. Repeat for every row

This project automates that entire workflow. The agent sends one email with the Excel attachment — the rest happens automatically, and they receive an audit report in their inbox within seconds.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        Gmail                            │
│   Subject: "דוח יומי"  +  Excel attachment              │
└────────────────────┬────────────────────────────────────┘
                     │  Gmail Trigger (polls every minute)
                     ▼
┌─────────────────────────────────────────────────────────┐
│                        n8n  :5678                       │
│   Orchestration layer — no business logic here          │
└────────────────────┬────────────────────────────────────┘
                     │  POST /run  (multipart/form-data)
                     ▼
┌─────────────────────────────────────────────────────────┐
│            Automation Service  :3000                    │
│   server.js  →  spawns  automate.js as child process    │
│                                                         │
│   automate.js:                                          │
│   ① Read + parse Excel (xlsx)                           │
│   ② Launch Playwright (headless Chromium)               │
│   ③ For each row — find task, apply rule, update UI     │
│   ④ Generate HTML audit report                          │
└────────────────────┬────────────────────────────────────┘
                     │  Playwright browser automation
                     ▼
┌─────────────────────────────────────────────────────────┐
│             Demo Site  :8080                            │
│   React + TypeScript — Insurance task manager           │
│   State persisted server-side (Express + JSON volume)   │
└─────────────────────────────────────────────────────────┘
                     │  audit report (HTML)
                     ▼
┌─────────────────────────────────────────────────────────┐
│                        Gmail                            │
│   Subject: "דוח אוטומציה - הראל - 01/05/2026"           │
│   Body: formatted RTL HTML email                        │
└─────────────────────────────────────────────────────────┘
```

Three Docker containers on a shared internal network (`insurance-net`):

| Service | Port | Image |
|---------|------|-------|
| `demo-site` | 8080 | Node 20 + Vite build + Express |
| `automation` | 3000 | Node 20 + Playwright Chromium |
| `n8n` | 5678 | n8nio/n8n |

---

## Demo Site — Purpose-Built for Automation

The demo site simulates a real insurance task-management system. It was designed from the ground up to be **automation-friendly**: every interactive element carries a `data-testid` attribute, and every table row exposes its current state as HTML data attributes.

```html
<tr
  data-testid="process-row"
  data-id-number="045123456"
  data-fund-number="7823"
  data-status="בטיפול"
  data-required-date="2026-05-15"
  data-last-note="ממתין להפקדות"
>
```

This is a standard practice in QA and automation engineering — stable, semantic selectors that don't break when styles change. The `data-last-note` attribute in particular enables the **idempotency check** (see below): the automation can read the last note directly from the DOM without opening each task's dialog.

> In a production environment without source-code access, Playwright can target any web UI using CSS selectors, text content, or XPath — the selector strategy adapts to whatever the site exposes.

---

## How the Automation Logic Works

Each Excel row is evaluated by `decideCase()` — a pure function with no side effects, making it independently testable.

```
┌─────────────────────────────────┐
│         Row from Excel          │
└────────────┬────────────────────┘
             │
    ┌────────▼────────┐
    │  isValid = "לא" │──▶ Case 3: status = "נדחה",  date = today
    └────────┬────────┘
             │  isValid = "כן"
    ┌────────▼─────────────────┐
    │  expectedDate present?   │──▶ Case 1: status = "בטיפול", date = transfer date from Excel
    └────────┬─────────────────┘
             │  no date
    ┌────────▼──────────────────────────┐
    │  notes includes "ממתין להפקדות"? │──▶ Case 2: status = "בטיפול", date = 15th of next month
    └────────┬──────────────────────────┘
             │  no match
             ▼
         skipped (logged in audit)
```

### Idempotency — the "Unchanged" Detection

A critical requirement: running the same report twice must not produce duplicate notes or overwrite data. The system detects already-processed rows by comparing the **last note text** on the task against the note the automation would write.

This is smarter than comparing status alone — both "ממתין להפקדות" and "צפי ניוד" result in status `"בטיפול"`, so a status-only check would incorrectly skip a row that actually changed.

```javascript
const currentLastNote = await targetRow.getAttribute("data-last-note");
const currentStatus   = await targetRow.getAttribute("data-status");

if (currentStatus !== "חדש" && currentLastNote === decision.noteText) {
  audit.unchanged.push({ ... });
  return; // same situation as before — nothing to do
}
```

---

## State Persistence — Why Server-Side?

The demo site originally used `localStorage` to persist task data. This caused a critical issue: **Playwright opens a fresh browser context with empty localStorage**, meaning the automation would always see the default seed data, not the live state.

The solution moves persistence server-side:

- The Express server (`serve.js`) exposes `GET /api/state` and `POST /api/state`
- State is stored in `state.json` on a Docker named volume (`demo-state`)
- The React app syncs state to the server on every change and reads from it on first load
- Playwright now sees the live data because the state lives on the server, not in the browser

State also **survives container restarts** — a clean separation between ephemeral containers and persistent data.

---

## Audit Report

After processing, the automation generates a structured HTML report with four sections:

| Category | Hebrew | Meaning |
|----------|--------|---------|
| ✅ Success | עודכן בהצלחה | Task found and updated |
| ❌ Rejected | נדחה | Forms invalid — task marked rejected |
| ⏭ Unchanged | ללא שינוי | Row already processed in a previous run |
| ⚠️ Failed / Skipped | נכשל / דילוג | Task not found, or row didn't match any rule |

The report is sent as an **HTML email** with `dir="rtl"` for correct Hebrew rendering in Gmail. The email subject includes the company name and today's date: `"דוח אוטומציה - הראל - 01/05/2026"`.

Company identification is extracted from the filename — no configuration needed:

```javascript
function extractCompanyName(filename) {
  if (filename.includes("harel")  || filename.includes("הראל"))  return "הראל";
  if (filename.includes("menora") || filename.includes("מנורה")) return "מנורה";
  if (filename.includes("migdal") || filename.includes("מגדל"))  return "מגדל";
  if (filename.includes("clal")   || filename.includes("כלל"))   return "כלל";
  return filename.match(/^([^_\s]+)/)?.[1] ?? "לא ידוע";
}
```

---

## Expected Excel Format

The automation expects an `.xlsx` file with the following columns (Hebrew headers, order-independent):

| Column | Hebrew | Values |
|--------|--------|--------|
| Client name | `שם` | Free text |
| ID number | `תעודת זהות` | 9-digit string |
| Fund number | `מספר קופה` | Numeric string |
| Forms received | `האם הטפסים התקבלו תקין` | `כן` / `לא` |
| Notes | `הערות` | Free text, e.g. `ממתין להפקדות` |
| Expected transfer date | `צפי ניוד` | `DD/MM/YYYY` or empty |

Column order doesn't matter — headers are matched by trimmed string comparison.

---

## Design Decisions

**Why a child process instead of importing `automate.js` directly?**
Playwright is stateful and hard to reset between runs. Spawning a fresh child process guarantees a clean browser context for every report, with no risk of state leaking between runs.

**Why n8n instead of a custom webhook?**
n8n handles the Gmail OAuth flow, polling, and email sending with zero custom code. The automation service stays focused on business logic — it doesn't need to know anything about email protocols.

**Why a Docker named volume instead of a database?**
The data model is a single JSON array that one service reads and writes. A database would add infrastructure complexity with no real benefit at this scale. The volume gives durability and simplicity.

**Why HTML email instead of plain text?**
The audit report is in Hebrew (RTL). Plain text emails don't support `dir="rtl"`, so the layout breaks in Gmail. An HTML email with inline `dir="rtl"` renders correctly on all clients, including mobile.

---

## A Real Bug Worth Mentioning

When `multer` (the file upload middleware) saves an uploaded file to disk, it **strips the file extension** and uses a hash as the filename. SheetJS identifies `.xlsx` files by extension — so without the fix, it silently fails to parse the file.

```javascript
// multer saves the file as e.g. "a3f9c1d2" with no extension
const ext = path.extname(req.file.originalname) || ".xlsx";
const xlsxPath = req.file.path + ext;
fs.renameSync(req.file.path, xlsxPath); // restore the extension
```

A small fix, but it took real debugging to find — the error wasn't loud, the file just parsed as empty.

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | React + TypeScript + Vite | Type safety; component model fits the process-card UI |
| UI Components | shadcn/ui + Tailwind CSS | Accessible, consistent design system |
| Browser Automation | Playwright | Reliable selector engine, headless-capable, async-first |
| Automation Runtime | Node.js + Express | Same language as frontend; easy child-process spawning |
| File Parsing | SheetJS (xlsx) | De facto standard for `.xlsx` in Node; handles Excel quirks |
| Orchestration | n8n | Visual workflow; native Gmail OAuth; no custom webhook code |
| Containerization | Docker + Docker Compose | Reproducible environment; network isolation between services |
| State Persistence | Docker named volume + JSON | Simple, durable, no database dependency |

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- A Gmail account to connect to n8n

---

## Getting Started

```bash
# 1. Clone the repo
git clone <repo-url>
cd surence-automation

# 2. Build and start all three containers
docker-compose up -d --build

# 3. Verify everything is running
docker-compose ps
```

Open in browser:
- **Demo site:** http://localhost:8080
- **n8n:** http://localhost:5678 *(credentials: `admin` / `admin123`)*

---

## n8n Workflow Setup

The workflow is included as `n8n/workflow.json`. After starting the containers:

1. Open http://localhost:5678
2. Go to **Workflows → Import from file** → select `n8n/workflow.json`
3. Open the **Gmail Trigger** node → connect your Gmail account via OAuth
4. Open the **Gmail Send** node → select the same Gmail credential
5. Click **Save** then **Activate**

> Gmail credentials are personal and not included in the export — each user connects their own account.

---

## Triggering the Automation

Send an email to the connected Gmail account with:
- **Subject:** `דוח יומי`
- **Attachment:** an `.xlsx` file named after the company (e.g. `harel_daily_report.xlsx`)

The workflow picks it up within a minute, runs the automation, and sends the audit report back by email.

Sample Excel files for testing are included in `automation/reports/`:

| File | Day | Description |
|------|-----|-------------|
| `harel_daily_report.xlsx` | Day 1 | Forms valid + waiting for deposits |
| `harel_daily_report_day2.xlsx` | Day 2 | Transfer dates now available |
| `menora_daily_report.xlsx` | Day 1 | Menora variant |
| `menora_daily_report_day2.xlsx` | Day 2 | Menora with dates |

---

## Project Structure

```
surence-automation/
├── demo-site/
│   ├── src/
│   │   ├── data/seed.ts                    # Default demo data (dynamic today's date)
│   │   ├── hooks/useProcesses.ts           # State management + server-side sync
│   │   ├── pages/Index.tsx                 # Main table with data-testid attributes
│   │   └── components/
│   │       ├── ProcessDetailsDialog.tsx    # Edit dialog (status, date, notes)
│   │       └── StatusBadge.tsx             # Coloured status pill
│   ├── serve.js                            # Express: serves built React app + /api/state
│   ├── Dockerfile                          # Two-stage: Vite build → lightweight runtime
│   └── package.json
├── automation/
│   ├── automate.js                         # Core automation: Excel → Playwright → audit
│   ├── server.js                           # HTTP wrapper: POST /run → spawns automate.js
│   ├── reports/                            # Sample Excel files for testing
│   ├── audit/                              # Generated audit reports (.txt, .json, .html)
│   ├── Dockerfile
│   └── package.json
├── n8n/
│   └── workflow.json                       # Gmail Trigger → HTTP Request → Gmail Send
├── docker-compose.yml
└── README.md
```

---

## Useful Commands

```bash
# Stop / restart
docker-compose down
docker-compose up -d

# Rebuild after code changes
docker-compose build demo-site automation
docker-compose up -d

# Stream logs
docker-compose logs -f automation
docker-compose logs -f demo-site

# Health check
curl http://localhost:3000/health

# Full reset (including all stored state)
docker-compose down -v
```

---

## Notes

- **Demo data reset:** click the "איפוס דמו" button on the site to restore seed data
- **State durability:** task data survives `docker-compose down` (stored in `demo-state` volume)
- **Headless mode:** set `HEADLESS=true` to hide the browser window (default in Docker)
- **n8n data:** workflow and credentials survive restarts via the `n8n-data` volume
