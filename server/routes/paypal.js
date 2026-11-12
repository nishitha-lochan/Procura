import express from 'express';
import { createOrder, captureOrder, reconcileOrderWithPayPal } from '../services/paypalService.js';

const router = express.Router();

/**
 * POST /api/paypal/create-order
 * Creates an authoritative PayPal Sandbox or Simulation order.
 */
router.post('/create-order', async (req, res) => {
  try {
    const { supplierId, quantity, maxBudget, forceSimulation } = req.body;

    if (!supplierId) {
      return res.status(400).json({ success: false, error: "supplierId is required to create an order." });
    }

    const orderData = await createOrder(supplierId, quantity || 1, maxBudget || 0, Boolean(forceSimulation));
    res.json(orderData);
  } catch (error) {
    console.error('[PayPal Create Order Error]:', error.message);
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ success: false, error: error.message || "Failed to create PayPal order." });
  }
});

/**
 * POST /api/paypal/capture-order
 * Captures an approved PayPal order, verifies amounts in integer cents, and locks duplicate attempts.
 */
router.post('/capture-order', async (req, res) => {
  try {
    const { orderID, procurementMetadata } = req.body;

    if (!orderID) {
      return res.status(400).json({ success: false, error: "orderID is required for payment capture." });
    }

    const captureResult = await captureOrder(orderID, procurementMetadata);
    res.json(captureResult);
  } catch (error) {
    console.error('[PayPal Capture Order Error]:', error.message);
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ success: false, error: error.message || "Failed to capture PayPal order." });
  }
});

/**
 * POST /api/paypal/reconcile-order
 * Reconciles an order with PayPal if the status was uncertain or interrupted.
 */
router.post('/reconcile-order', async (req, res) => {
  try {
    const { orderID } = req.body;
    if (!orderID) {
      return res.status(400).json({ success: false, error: "orderID is required for reconciliation." });
    }
    const result = await reconcileOrderWithPayPal(orderID);
    res.json(result);
  } catch (error) {
    console.error('[PayPal Reconcile Order Error]:', error.message);
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ success: false, error: error.message || "Failed to reconcile PayPal order." });
  }
});

export default router;
