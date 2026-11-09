# Ultimate Bakery Tracker

A complete, **offline-first** bakery management web app. Everything lives in your browser
(SQLite compiled to WebAssembly, persisted in IndexedDB) — no account, no server, no
internet required after the first load.

Pink & white design system (`#E8A3BA` / `#C96F91`), DM Serif Display headings, Inter body,
desktop-first with a collapsible sidebar.

## Features

| Area | What it does |
| --- | --- |
| **Dashboard** | Live KPIs computed from your real records — never sample/hardcoded numbers |
| **Orders** | Inquiry → Quoted → Confirmed → In Production → Ready → Completed; deposits, payments, refunds, timeline |
| **Customers** | Profiles, order history, outstanding balances |
| **Products** | Catalog with categories, prices, lead times, recipe links |
| **Recipes** | Ingredient lines, scaled yields, full costing (ingredients + labor + overhead + packaging) |
| **Inventory** | Stock levels, movement ledger, low-stock & expiry alerts, adjustments |
| **Suppliers / Purchases** | Suppliers, purchase orders, receive stock (adds stock exactly once) |
| **Production** | Batches, consumption preview → commit → reverse (re-saving is a no-op) |
| **Waste** | Waste records with reasons, categories and value |
| **Calendar / Tasks** | Tasks and events on a weekly calendar |
| **Finances** | Expenses, other income, cash summary, who owes you |
| **Reports** | Sales, orders, profitability, inventory, production, customers — CSV + PDF + print |
| **Settings / Backup** | Profile, currency, costing defaults, unit conversions, `.ubt` backup/restore, sample-data tools, full reset |

## Business rules (by design)

- Creating an order **never** deducts stock.
- Receiving a purchase **adds stock exactly once**.
- Completed production **consumes stock exactly once**; re-saving the batch is a no-op.
- Every stock change is an auditable row in `inventory_movements`.
- Refunds are transactions against the order, never a silent total edit.
- Orders/recipes keep snapshots so history survives later edits.
- Dashboard numbers are computed from the database — no fake data.

## Tech

React 18 + TypeScript + Vite + Tailwind CSS + sql.js (SQLite WASM) + IndexedDB +
Recharts + jsPDF + Lucide icons. Hash router (`/#/orders`) so it works on any static host,
including GitHub Pages project sites.

## Develop

```bash
npm install
npm run dev
```

Other scripts:

```bash
npm run build        # typecheck (tsc -b) + production build into dist/
npm run typecheck    # strict typecheck only
npm test             # 3 static SQL checks: arity, aliases, execute every query against the schema
npm run verify       # typecheck + tests + build (what CI runs)
npm run preview      # serve the production build locally
```

## Deploy on GitHub Pages

The repo ships with `.github/workflows/deploy.yml`. Push to `main` (or `master`) and it
builds, validates and publishes automatically.

```bash
git init
git add .
git commit -m "Ultimate Bakery Tracker"
git branch -M main
git remote add origin https://github.com/muhammadabd778899-glitch/ultimate-bakery-tracker.git
git push -u origin main
```

Then in GitHub: **Settings → Pages → Source: GitHub Actions**.

`vite.config.ts` sets `base: './'`, so the app also works if you deploy to a sub-path
manually (e.g. copy `dist/` to a `gh-pages` branch).

## Offline

After the app loads once, it runs fully offline: fonts, the SQLite WASM binary and all
code are bundled locally. Backups download as `.ubt` files you keep yourself.

## Known limitations

- Data is per-browser/per-device — use **Settings → Backup** to move or archive it.
- Profitability figures are *estimated* (recorded ingredient cost + expenses), not
  audited accounting.
- Reports aggregate in JavaScript for very large datasets; a home bakery's volume is
  fine, an enterprise's may get slow.
