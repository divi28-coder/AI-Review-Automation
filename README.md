# ReviewFlow — AI Review Automation System

A local, responsive web application for student internship assignments, workbook imports, repository URL submissions, review schedules, reviewer workflows, and progress reporting. AI review generation supports configured OpenAI, Claude, or Gemini providers; repository analysis requires GitHub access. SMTP delivery remains a demo-only integration.

## Workbook inspected

The included workbook has four worksheets: `Students` (101 rows including header, 21 columns), `Task_Brief` (101 rows including header, 8 columns), `Review_Schedule` (326 rows including header, 9 columns), and `Instructions` (11 rows including header, 2 columns). The student columns include ID, name, email, phone, internship, task, review count, review dates/times/meeting links, repository URL, and submission status. Task briefs contain problem statement, abstract, workflow, suggested technologies/tools, and expected deliverables. Schedule records contain student ID/name/email, review number/date/time, meeting link, status, and feedback-sent marker. The workbook's Instructions sheet says its contact details are generated sample data and meeting URLs are placeholders.

## Architecture

- **Backend:** FastAPI + Pydantic + SQLite (`backend/app/main.py`), REST API under `/api/v1`, API docs at `/docs`.
- **Frontend:** responsive HTML/CSS/JavaScript single-page interface served by FastAPI. This keeps the project runnable without a Node toolchain; it is a documented alternative to the preferred React stack.
- **Data:** SQLite schema is initialized on startup. The supplied sample workbook seeds local demo data on first run. Imports are transaction-protected and idempotent by student ID and schedule key.
- **Authentication:** signed bearer tokens, PBKDF2-SHA256 password hashes, role checks on backend routes.

## Requirements

- Python 3.10+ (Python 3.11 recommended)
- pip

## Start locally

From the project root:

### Windows PowerShell

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
Copy-Item .env.example .env
uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

### macOS / Linux

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
cp .env.example .env
uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:8000`. API documentation is at `http://127.0.0.1:8000/docs`; health is at `http://127.0.0.1:8000/api/v1/health`.

## Demo accounts

- Administrator: `admin@demo.local` / `AdminDemo123!`
- Reviewer: `reviewer@demo.local` / `ReviewerDemo123!`
- Student: use a student email in the workbook / `StudentDemo123!`

All student contact details in the included workbook are sample data. These demo credentials are for local evaluation only. Do not expose this demo deployment to the internet. Before production, replace demo account provisioning with secure invitations/password reset, rotate `APP_SECRET`, configure secure deployment settings, and use a production-grade database and session strategy.

## Workbook import

Sign in as administrator → **Workbook import** → choose `.xlsx`/`.xlsm` → **Validate and preview** → inspect row-level errors → **Confirm import**. The endpoint enforces a 10 MB limit and validates required `Students` columns. Re-imports update matching student IDs instead of blindly creating duplicates. Valid rows import while invalid rows are recorded in the import history. The app preserves supplied schedule dates and meeting links; absent links remain absent.

Included workbook: `data/sample_workbook.xlsx`.

## Student project brief

The student project page displays the official task-brief fields when available. If the workbook leaves fields blank for **Petrol Price Prediction**, the page fills those gaps with clearly labeled suggested project guidance (problem outline, workflow, recommended tools, and deliverables). These suggestions are not official requirements; students should confirm project scope and deadlines with their reviewer.

## Configuration

Copy `.env.example` to `.env`, then set the selected provider and its API key. The backend loads simple `.env` entries at startup without overriding variables already supplied by the process. Supported values for `AI_PROVIDER` are `openai`, `claude` (also accepted as `anthropic`), and `gemini`.

- `DATABASE_PATH`: SQLite file path.
- `APP_SECRET`: long random secret for signed tokens; replace the local demo value.
- `DEMO_MODE=false`: required for real review notification emails. Keep it `true` to disable delivery during demos.
- `AI_PROVIDER`: selects which provider handles generated reviews (`openai`, `claude`, or `gemini`).
- `OPENAI_API_KEY`, `OPENAI_MODEL`: OpenAI credentials and optional model (defaults to `gpt-4.1-mini`).
- `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`: Claude credentials and optional model (defaults to `claude-sonnet-4-5`). `CLAUDE_API_KEY` and `CLAUDE_MODEL` are also accepted aliases.
- `GEMINI_API_KEY`, `GEMINI_MODEL`: Gemini credentials and optional model (defaults to `gemini-2.5-flash`).
- `GITHUB_TOKEN`: reserved for private/restricted repository integration.
- `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `EMAIL_FROM`: Gmail SMTP settings. Use a Google **App Password** for `SMTP_PASSWORD`, not your Google account password. Enable 2-Step Verification on the sender account before creating an App Password.

When a reviewer approves a draft with `DEMO_MODE=false`, the backend sends the approved feedback and the student's next scheduled review date, time, timezone, and Google Meet link (when available) to the email address on that student's account. If SMTP delivery fails, the review remains published and the admin UI reports that the notification was not sent; check the Gmail SMTP configuration, then use **Approve and publish** again to retry.

**Known integration limits:** AI review generation requires a valid API key for the selected provider and a reachable GitHub repository. GitHub URL format validation and repository metadata/source retrieval are implemented. SMTP delivery requires valid Gmail SMTP credentials and network access. Reviewer approval endpoints publish generated drafts only after reviewer approval.

## Tests

From the project root:

```bash
python -m pytest -q
```

Run syntax checks:

```bash
python -m compileall backend
```

## API overview

- `POST /api/v1/auth/login`, `GET /api/v1/auth/me`, `POST /api/v1/auth/logout`
- `GET /api/v1/dashboard/admin`, `GET /api/v1/dashboard/student`
- `GET /api/v1/students`, `GET /api/v1/students/{student_id}`
- `POST /api/v1/imports/validate`, `POST /api/v1/imports/confirm`, `GET /api/v1/imports/history`
- `GET /api/v1/tasks`, `GET /api/v1/schedules`
- `POST /api/v1/submissions`
- `GET /api/v1/reviews`, `POST /api/v1/reviews/{id}/analyze`, `PATCH /api/v1/reviews/{id}/draft`, `POST /api/v1/reviews/{id}/approve`, `POST /api/v1/reviews/{id}/request-changes`
- `GET /api/v1/reports/students.csv`

## Current implementation status

**Implemented:** responsive admin/reviewer/student views; role-protected API; hashed demo passwords; workbook preview and import; task brief import; review schedule import; student search; repository URL validation and submission status; published feedback visibility rules; approval/change-request endpoints; CSV export with formula-injection mitigation; health status; import history and audit log.

**Partial or awaiting integration:** production-grade account invitations/password reset, persistent revocable sessions/rate limiting, full reviewer assignment management, edit UI for drafts, SMTP delivery, frontend automated browser tests, PostgreSQL migrations, and production deployment hardening. AI review generation supports OpenAI, Claude, and Gemini, configured through `AI_PROVIDER` and the matching API key.

**Not claimed:** real email delivery or public deployment.
