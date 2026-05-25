# Clearwater

A private, client-side personal finance dashboard. Upload bank and investment statements (CSV/PDF) from up to 6 sources, answer a few clarifying questions, and get a complete financial health report — net worth, cash flow, category breakdown, and prioritized action steps.

Built as a single-file React component designed to run as a **claude.ai artifact**.

## Why a claude.ai artifact?

The app calls the Anthropic API directly at `https://api.anthropic.com/v1/messages` with no Authorization header. That endpoint is authenticated automatically by claude.ai's artifact runtime using your active session — you do not need an API key, and API credits are consumed from your Claude Max session.

This means the app **will not work** when opened as a static HTML file locally — browser CORS and missing auth will block the API calls. To use it, paste `App.jsx` into a claude.ai React artifact.

## How to run

1. Open [claude.ai](https://claude.ai) and start a new conversation.
2. Ask Claude to create a React artifact and paste the contents of `App.jsx`.
3. Upload your bank/investment statements (CSV or PDF) into the 6 slots.
4. Click **Analyze My Finances**.
5. Answer the clarifying questions about ambiguous transactions.
6. Review your financial intelligence report.

## Sources supported

- 4 bank accounts (CSV or PDF statements)
- Robo advisor (CSV or PDF)
- Angel One (CSV or PDF)

All processing happens in your browser. Nothing is stored.

## Tech

- React 18 + Recharts for charts
- PapaParse (CSV) + PDF.js (PDF text extraction)
- Anthropic `claude-sonnet-4-20250514` for parsing PDFs, generating clarifying questions, and producing the final report
- Lucide React for icons

## File structure

```
App.jsx        — the entire app (paste this into claude.ai)
README.md      — this file
```

## Design system

See the PRD in the repo for the full design spec: ice-blue clinical aesthetic, DM Serif Display + DM Sans + JetBrains Mono, 8px grid, subtle motion. Inspired by private banking interfaces, not consumer fintech.

## Privacy

Everything runs client-side. Statement contents are sent only to Anthropic's API for parsing and analysis — no other servers are involved, no localStorage, no cookies. Close the tab and your data is gone.
