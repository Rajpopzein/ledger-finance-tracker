# Ledger v1.1

A lean, local-first personal finance tracker based on the approved UI.

## Important: this build starts empty

There is **no demo/seed transaction data**. Add a bank account in **Settings**, then import your own CSV/XLSX statement, or add a cash expense.

This updated bundle uses a new `ledger_db_v11` Docker volume, so it starts with an empty ledger even if you ran the older demo build. The older demo volume is left untouched and is not used by this version.

## Included
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
- Authentication (single-user local v1)

## Run

```bash
docker compose up --build
```

Open:
- UI: http://localhost:5173
- API docs: http://localhost:8000/docs

## First use
1. Open **Settings**.
2. Add a bank/institution and optional last 4 digits.
3. Open **Import & Review**.
4. Select that account and upload a CSV/XLSX statement.
5. Review the import summary before committing.

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
The backend never places raw bank statements, full account numbers, UPI IDs, or bank/UTR references into the AI prompt. API keys entered in Settings are encrypted at rest using a local Fernet key stored in the Docker volume.

## Vercel deployment

The repository now includes a Vercel-compatible FastAPI entrypoint at `api/index.py` and builds the Vite frontend from `frontend/`.

Required production environment variables:

- `DATABASE_URL`: persistent hosted PostgreSQL connection string (for example Neon via the Vercel Marketplace)
- `SECRET_KEY`: a stable Fernet key used to encrypt configured AI API keys
- `CORS_ORIGINS`: optional when frontend and API share the same Vercel origin

The local Docker Compose workflow is unchanged.
