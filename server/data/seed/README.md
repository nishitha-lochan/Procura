# Procura — Demonstration Seed Fixtures

This directory contains intentional, pre-configured sample data for the Procura B2B Procurement Copilot hackathon presentation and local development.

## Files

- `sample_orders.json`: 23 baseline procurement orders (including Sandbox verified orders, simulation records, and quotation comparisons) used to populate dashboard charts, order history, and status trackers on a fresh installation.
- `sample_transactions.json`: 6 verified financial ledger settlements showcasing landed cost distributions, realized corporate savings, and multi-mode payment badges (`SANDBOX_VERIFIED` and `SIMULATION`).

## Automatic Seeding Lifecycle

1. **Clean Separation**: Runtime transactions and orders (`server/data/orders.json` and `server/data/transactions.json`) represent mutable local financial state and are excluded from Git via `.gitignore`.
2. **Auto-Bootstrap on Fresh Clone**: When the backend server boots up or accesses the storage layer, if `server/data/orders.json` or `server/data/transactions.json` is missing, Procura automatically seeds the local runtime files from these baseline fixtures so the dashboard renders immediately without manual setup.
3. **Hermetic Test Isolation**: Automated test suites in `server/tests/testScoring.js` create isolated temporary directories with fresh `[]` arrays, guaranteeing that automated test executions never touch or contaminate these sample fixtures or local runtime files.

