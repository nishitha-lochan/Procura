import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { readJsonFile, writeJsonFile } from '../utils/storage.js';
import { toCents, fromCents } from '../utils/calculations.js';

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

// POST /api/ledger/simulate-payment - Explicit Simulation Mode entry
router.post('/simulate-payment', async (req, res) => {
  try {
    const { supplierId, supplierName, product, quantity, unitPrice, shippingCost, totalAmount, maxBudget, estimatedSavings } = req.body;

    if (!supplierId || !quantity || !totalAmount) {
      return res.status(400).json({ success: false, error: "Missing required transaction fields" });
    }

    const timestamp = new Date().toISOString();
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const transactionId = `SIM-TXN-2026-${randomSuffix}`;

    const newTransaction = {
      transactionId,
      paypalOrderId: "N/A (SIMULATED)",
      paypalCaptureId: "N/A (SIMULATED)",
      timestamp,
      supplierId,
      supplierName: supplierName || `Supplier ${supplierId}`,
      product: product || "Procurement Item",
      quantity: parseInt(quantity, 10),
      unitPrice: parseFloat(unitPrice) || 0,
      shippingCost: parseFloat(shippingCost) || 0,
      totalAmount: parseFloat(totalAmount),
      maxBudget: parseFloat(maxBudget) || 0,
      estimatedSavings: parseFloat(estimatedSavings) || 0,
      realizedSavings: parseFloat(estimatedSavings) || 0,
      paymentStatus: "COMPLETED",
      paymentMode: "SIMULATION",
      notes: "Simulated checkout (PayPal credentials not configured or Simulation Mode selected)"
    };

    const transactions = await readJsonFile(TRANSACTIONS_FILE, []);
    transactions.unshift(newTransaction);
    await writeJsonFile(TRANSACTIONS_FILE, transactions);

    res.json({
      success: true,
      transaction: newTransaction,
      message: "Simulated settlement recorded successfully."
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

