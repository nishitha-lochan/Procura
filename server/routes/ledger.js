import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { readJsonFile, writeJsonFile } from '../utils/storage.js';
import { toCents, fromCents, isStrictPositiveInteger } from '../utils/calculations.js';
import { createOrder, captureOrder } from '../services/paypalService.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TRANSACTIONS_FILE = path.join(__dirname, '../data/transactions.json');

// GET /api/ledger/transactions - List all ledger records
router.get('/transactions', async (req, res) => {
  try {
    const transactions = await readJsonFile(TRANSACTIONS_FILE, []);
    // Sort newest first
    transactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json({
      success: true,
      count: transactions.length,
      data: transactions
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/ledger/stats - Aggregated financial metrics
router.get('/stats', async (req, res) => {
  try {
    const transactions = await readJsonFile(TRANSACTIONS_FILE, []);
    
    let sandboxSpendCents = 0;
    let simulationSpendCents = 0;
    let sampleSpendCents = 0;

    let sandboxRealizedSavingsCents = 0;
    let simulationRealizedSavingsCents = 0;
    let sampleRealizedSavingsCents = 0;

    let sandboxCount = 0;
    let simulationCount = 0;
    let sampleCount = 0;

    for (const txn of transactions) {
      if (txn.paymentStatus !== 'COMPLETED') continue;

      const amountCents = toCents(txn.totalAmount);
      const savingsCents = toCents(txn.realizedSavings);

      if (txn.paymentMode === 'SANDBOX_VERIFIED') {
        sandboxSpendCents += amountCents;
        sandboxRealizedSavingsCents += savingsCents;
        sandboxCount++;
      } else if (txn.paymentMode === 'SIMULATION') {
        simulationSpendCents += amountCents;
        simulationRealizedSavingsCents += savingsCents;
        simulationCount++;
      } else {
        sampleSpendCents += amountCents;
        sampleRealizedSavingsCents += savingsCents;
        sampleCount++;
      }
    }

    res.json({
      success: true,
      stats: {
        sandbox: {
          totalSpend: parseFloat(fromCents(sandboxSpendCents)),
          realizedSavings: parseFloat(fromCents(sandboxRealizedSavingsCents)),
          completedPayments: sandboxCount
        },
        simulation: {
          totalSpend: parseFloat(fromCents(simulationSpendCents)),
          realizedSavings: parseFloat(fromCents(simulationRealizedSavingsCents)),
          completedPayments: simulationCount
        },
        sample: {
          totalSpend: parseFloat(fromCents(sampleSpendCents)),
          realizedSavings: parseFloat(fromCents(sampleRealizedSavingsCents)),
          completedPayments: sampleCount
        },
        totalOrdersCount: transactions.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/ledger/simulate-payment
 * Authoritative Simulation settlement endpoint.
 * Ignores any client-submitted financial amounts and recalculates strictly against suppliers.json.
 */
router.post('/simulate-payment', async (req, res) => {
  try {
    const { supplierId, quantity, maxBudget } = req.body;

    if (!supplierId || typeof supplierId !== 'string') {
      return res.status(400).json({ success: false, error: "supplierId is required and must be a valid string." });
    }

    if (!isStrictPositiveInteger(quantity)) {
      return res.status(400).json({ success: false, error: "Quantity must be a positive integer >= 1." });
    }

    // Route authoritatively through server-side createOrder and captureOrder
    // This completely prevents client-side price/savings tampering
    const order = await createOrder(supplierId, quantity, maxBudget || 0, true);
    const captureResult = await captureOrder(order.orderID, { maxBudget: maxBudget || 0 });

    res.json({
      success: true,
      transaction: captureResult.transaction,
      message: "Authoritative simulated settlement recorded successfully."
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ success: false, error: error.message || "Failed to process simulated payment." });
  }
});

export default router;
