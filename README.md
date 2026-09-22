# Ledger v1.2

A lean, local-first personal finance tracker with a private single-owner authentication flow.

## Important: this build starts empty

There is **no demo/seed transaction data**. On first launch, create the owner account, then add a bank account in **Settings** and import your own CSV/XLSX statement, or add a cash expense.

The Docker workflow uses the `ledger_db_v11` volume, so it starts with an empty ledger unless that volume already exists.

## Included
- First-run single-owner account setup
- Email/password login and logout
- Secure HttpOnly session cookie
- Backend authentication guard on finance/API routes
- Origin checks for state-changing API requests
- Overview: real Income, Spent, Available, verification health, category totals and recent activity
- Working period selector: current month, previous month, last 3 months
- Cash-flow visualization built from actual ledger data only
- Transactions ledger filtered by the selected period
- Bank account setup in Settings
- Quick Cash entry; Cash account is created only when first used
- CSV/XLSX statement import preview + commit
- File-hash protection for exact re-imports
- Transaction-level dedupe/reconciliation using bank reference and deterministic fingerprint
- Manual review state for uncertain matches
- Local/OpenAI-compatible AI provider or Gemini configuration
- AI queries scoped to the selected period
- PostgreSQL + FastAPI + React/TypeScript

## Deliberately removed / deferred
- Demo transaction seed data
- Budgets
- PDF parsing
- Screenshots/OCR
- iPhone Shortcut/SMS automation
- Email ingestion
- Direct bank connections
- Notifications
- Subscription/mandate monitoring
- Split bill / reimbursement workflows
- Receipt downloads
- Multi-user accounts / roles
- MFA / passkeys

## Run

```bash
docker compose up --build
```

Open:
- UI: http://localhost:5173
- API docs: http://localhost:8000/docs

## First use
1. Open the app and create the first owner account.
2. Use a unique password with at least 12 characters.
3. Open **Settings**.
4. Add a bank/institution and optional last 4 digits.
5. Open **Import & Review**.
6. Select that account and upload a CSV/XLSX statement.
7. Review the import summary before committing.

## Authentication
Only these API endpoints are public:
- `/api/health`
- `/api/auth/status`
- `/api/auth/setup`
- `/api/auth/login`
- `/api/auth/logout`

All finance, import, settings and AI API routes require a valid owner session.

Passwords are stored as salted scrypt hashes. Session tokens are encrypted using the configured Fernet `SECRET_KEY` and delivered through an HttpOnly cookie. State-changing authenticated requests also enforce same-origin / configured-origin checks.

## Import format
CSV/XLSX v1 detects common column names for:
- date / transaction date / value date
- description / narration / remarks
- debit + credit columns, or amount + DR/CR type
- optional reference / UTR / transaction ID

If your bank uses unusual headers, the next increment should add the column-mapping screen rather than hard-code the bank.

## Dedupe rules
1. Same file hash for the same account -> reject exact re-import.
2. Exact bank/UPI reference -> attach source + verify existing transaction.
3. Exact fingerprint `(account + date + amount + direction + normalized description)` -> attach source + verify.
4. Same account/amount/direction within ±1 day plus similar description -> manual review.
5. Otherwise -> new transaction.

## AI privacy
The backend never places raw bank statements, full account numbers, UPI IDs, or bank/UTR references into the AI prompt. AI API credentials are encrypted at rest using the same configured Fernet key.

## Vercel deployment

The repository includes a Vercel-compatible FastAPI entrypoint at `api/index.py` and builds the Vite frontend from `frontend/`.

Required production environment variables:

- `DATABASE_URL`: persistent hosted PostgreSQL connection string
- `SECRET_KEY`: a stable Fernet key used for sessions and encrypted AI credentials
- `CORS_ORIGINS`: optional when frontend and API share the same Vercel origin

For Neon with psycopg, use the SQLAlchemy URL form:

```
postgresql+psycopg://USER:PASSWORD@HOST/DATABASE?sslmode=require
```

Never commit production database credentials or `SECRET_KEY` to GitHub.
