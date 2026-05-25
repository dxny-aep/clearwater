# Clearwater

A private, client-side personal finance dashboard. Upload bank and investment statements, clarify ambiguous transactions one at a time, watch your financial picture sharpen in real time.

Built as a single-file React component for the **claude.ai artifact runtime**.

## How it works

1. **Upload** statements (CSV or PDF) from up to 6 sources via the top-right Upload button.
2. **Parse & categorize** — Clearwater extracts every transaction, then runs one bulk AI categorization pass that assigns each transaction a category, confidence score, and hypothesis.
3. **Action Center** — the queue surfaces transactions ranked by `(1 − confidence) × amount`, so you spend attention on the ones that move the needle. For each one you see:
   - Counterparty (extracted from UPI/IMPS/POS strings)
   - Date, day of week, source account
   - Amount
   - AI hypothesis + confidence %
   - 4–6 ranked category chips
   - Free-text quick input for custom notes
   - "Always categorize X this way" — saves a rule that applies to all matching past + future transactions
4. **Live updates** — stats recompute instantly on every clearance. Insights regenerate every 10 clearances or on demand.
5. **Persistent** — all data lives in browser localStorage. Re-open the artifact and pick up where you left off.

## Why claude.ai artifact only?

The app calls `https://api.anthropic.com/v1/messages` directly with no auth header. That endpoint is automatically authenticated by claude.ai's artifact runtime via your active session. **It won't work on Vercel, a static host, or `file://`** — browser CORS and missing auth will block every API call.

To use it: open [claude.ai](https://claude.ai), create a React artifact, paste `App.jsx`.

## Sources supported

- 4 bank accounts
- Robo advisor
- Angel One

All CSV or PDF. PDFs are text-extracted with PDF.js then parsed by Claude into structured transactions.

## AI calls (3 types)

1. **PDF → transactions** (per PDF, on upload)
2. **Bulk categorize** — all new transactions in chunks of 80, returns `{category, confidence, hypothesis, chips}` per txn (on upload)
3. **Insights report** — regenerates on every 10 clearances or manual refresh

Token-efficient: no per-question AI calls. The AI's guess is computed once, your corrections are local.

## Privacy

Everything is client-side. Statement contents go only to Anthropic's API for parsing and analysis. No backend, no database, no cookies, no analytics. Use the Reset button to wipe localStorage.

## Tech

- React 18, Recharts, Lucide React
- PapaParse (CSV), PDF.js (PDF text)
- `claude-sonnet-4-20250514`
- DM Serif Display + DM Sans + JetBrains Mono
- Inline CSS, single file, no build step

## File structure

```
App.jsx        — the entire app, paste into claude.ai
README.md      — this file
```
