# Procura — Demonstration Seed Fixtures

This directory contains intentional, pre-configured sample data for the Procura B2B Procurement Copilot hackathon presentation and local development.

## Files

- `sample_orders.json`: 23 baseline procurement orders (including Sandbox verified orders, simulation records, and quotation comparisons) used to populate dashboard charts, order history, and status trackers on a fresh installation.
- `sample_transactions.json`: 6 financial ledger records (4 verified PayPal Sandbox settlements and 2 historical sample benchmark records) showcasing landed cost distributions, realized corporate savings, and multi-mode payment badges (`SANDBOX_VERIFIED` and `SAMPLE_DATA`).

## Demonstration Fixtures Lifecycle

1. **Clean Separation**: Runtime transactions and orders (`server/data/orders.json` and `server/data/transactions.json`) represent mutable local financial state and are excluded from Git via `.gitignore`.
2. **Empty by Default**: On a fresh clone, Procura initializes clean, empty runtime files (`[]`). This ensures an honest, pristine financial state for production-quality testing and real transactions.
3. **Optional Demo Seeding**: If pre-populated demonstration data is desired for hackathon evaluation or walkthroughs, copy `sample_orders.json` to `../orders.json` and `sample_transactions.json` to `../transactions.json`.
4. **Hermetic Test Isolation**: Automated test suites in `server/tests/testScoring.js` create isolated temporary directories with fresh `[]` arrays, guaranteeing that automated test executions never touch or contaminate these sample fixtures or local runtime files.

