import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import { PAYPAL_CREDENTIALS, isPayPalConfigured, PAYPAL_API_BASE } from '../config/paypal.js';
import { readJsonFile, writeJsonFile, fileMutex } from '../utils/storage.js';
import {
  toCents,
  fromCents,
  calculateLandedCost,
  calculateEstimatedSavings,
  isStrictPositiveInteger
} from '../utils/calculations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ORDERS_FILE = path.join(__dirname, '../data/orders.json');
const TRANSACTIONS_FILE = path.join(__dirname, '../data/transactions.json');
const SUPPLIERS_FILE = path.join(__dirname, '../data/suppliers.json');

// In-memory token cache
let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * Obtains an OAuth 2.0 access token from PayPal Sandbox with auto-refresh.
 */
export async function getPayPalAccessToken() {
  if (!isPayPalConfigured) {
    const error = new Error('PayPal Sandbox credentials not configured.');
    error.statusCode = 503;
    throw error;
  }

  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt) {
    return cachedToken;
  }

  const authString = Buffer.from(`${PAYPAL_CREDENTIALS.clientId}:${PAYPAL_CREDENTIALS.clientSecret}`).toString('base64');
  
  const response = await axios.post(
    `${PAYPAL_API_BASE}/v1/oauth2/token`,
    'grant_type=client_credentials',
    {
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }
  );

  const { access_token, expires_in } = response.data;
  cachedToken = access_token;
  // Expire 5 minutes early to guard against mid-request expiration
  tokenExpiresAt = now + ((expires_in - 300) * 1000);

  return cachedToken;
}

/**
 * Creates an authoritative PayPal order on the backend.
 * Validates quantity, stock availability, and budget caps authoritatively against suppliers.json.
 */
export async function createOrder(supplierId, quantityRequested = 1, maxBudget = 0, forceSimulation = false) {
  if (!supplierId || typeof supplierId !== 'string') {
    const error = new Error('supplierId is required and must be a valid string.');
    error.statusCode = 400;
    throw error;
  }

  // Strict integer check: reject decimals (e.g. 2.5), malformed strings (e.g. "10abc"), negatives, or 0
  if (!isStrictPositiveInteger(quantityRequested)) {
    const error = new Error(`Invalid order quantity (${quantityRequested}). Quantity must be a positive integer >= 1.`);
    error.statusCode = 400;
    throw error;
  }
  const quantity = Number(quantityRequested);

  const suppliers = await readJsonFile(SUPPLIERS_FILE, []);
  const supplier = suppliers.find(s => s.supplierId === supplierId.trim());

  if (!supplier) {
    const error = new Error(`Supplier with ID "${supplierId}" not found in catalog.`);
    error.statusCode = 404;
    throw error;
  }

  // Stock availability validation
  if (quantity > supplier.availableQuantity) {
    const error = new Error(
      `Requested quantity (${quantity}) exceeds supplier stock limit (${supplier.availableQuantity} units available).`
    );
    error.statusCode = 400;
    throw error;
  }

  // Authoritative server-side landed cost calculation
  const landedCost = calculateLandedCost(supplier.unitPrice, quantity, supplier.shippingCost);
  const landedCostFormatted = landedCost.toFixed(2);
  const budget = parseFloat(maxBudget) || 0;

  // Budget cap enforcement
  if (budget > 0 && toCents(landedCost) > toCents(budget)) {
    const error = new Error(
      `Authoritative landed cost ($${landedCostFormatted}) exceeds specified budget cap ($${budget.toFixed(2)}). Order rejected.`
    );
    error.statusCode = 400;
    throw error;
  }

  const estimatedSavings = calculateEstimatedSavings(budget, landedCost);

  // If PayPal Sandbox credentials are not configured or Simulation is explicitly requested
  if (!isPayPalConfigured || forceSimulation) {
    const simOrderId = `SIM-ORDER-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
    const pendingOrder = {
      orderId: simOrderId,
      supplierId: supplier.supplierId,
      supplierName: supplier.name,
      product: supplier.product,
      quantity,
      unitPrice: supplier.unitPrice,
      shippingCost: supplier.shippingCost,
      amount: landedCostFormatted,
      currency: "USD",
      maxBudget: budget,
      estimatedSavings,
      status: "CREATED",
      mode: "SIMULATION",
      createdAt: new Date().toISOString()
    };

    const orders = await readJsonFile(ORDERS_FILE, []);
    orders.push(pendingOrder);
    await writeJsonFile(ORDERS_FILE, orders);

    return {
      success: true,
      orderID: simOrderId,
      mode: "SIMULATION",
      amount: landedCostFormatted,
      currency: "USD",
      supplierName: supplier.name,
      estimatedSavings
    };
  }

  // Real PayPal Sandbox Orders API v2
  const token = await getPayPalAccessToken();
  const orderPayload = {
    intent: "CAPTURE",
    purchase_units: [
      {
        custom_id: supplier.supplierId,
        description: `Procura Settlement: ${supplier.product} (${quantity} units)`,
        amount: {
          currency_code: "USD",
          value: landedCostFormatted
        }
      }
    ],
    application_context: {
      brand_name: "Procura",
      landing_page: "NO_PREFERENCE",
      user_action: "PAY_NOW",
      shipping_preference: "NO_SHIPPING"
    }
  };

  const response = await axios.post(
    `${PAYPAL_API_BASE}/v2/checkout/orders`,
    orderPayload,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': `create-${supplier.supplierId}-${Date.now()}`
      }
    }
  );

  const realOrderId = response.data.id;
  const pendingOrder = {
    orderId: realOrderId,
    supplierId: supplier.supplierId,
    supplierName: supplier.name,
    product: supplier.product,
    quantity,
    unitPrice: supplier.unitPrice,
    shippingCost: supplier.shippingCost,
    amount: landedCostFormatted,
    currency: "USD",
    maxBudget: budget,
    estimatedSavings,
    status: "CREATED",
    mode: "SANDBOX",
    createdAt: new Date().toISOString()
  };

  const orders = await readJsonFile(ORDERS_FILE, []);
  orders.push(pendingOrder);
  await writeJsonFile(ORDERS_FILE, orders);

  return {
    success: true,
    orderID: realOrderId,
    mode: "SANDBOX",
    amount: landedCostFormatted,
    currency: "USD",
    supplierName: supplier.name,
    estimatedSavings
  };
}

/**
 * Captures an approved PayPal order with state transition locking,
 * duplicate-capture protection, and safe error-state reconciliation.
 */
export async function captureOrder(orderId, procurementMetadata = {}) {
  if (!orderId || typeof orderId !== 'string') {
    const error = new Error('orderId is required for payment capture.');
    error.statusCode = 400;
    throw error;
  }

  // Mutex on specific order ID prevents concurrent duplicate calls
  const releaseOrderLock = await fileMutex.acquire(`order-lock-${orderId}`);

  try {
    const orders = await readJsonFile(ORDERS_FILE, []);
    const orderIndex = orders.findIndex(o => o.orderId === orderId);

    if (orderIndex === -1) {
      const error = new Error(`Order "${orderId}" not found in persistent orders registry.`);
      error.statusCode = 404;
      throw error;
    }

    const order = orders[orderIndex];

    // State machine inspection
    if (order.status === 'CAPTURED') {
      const error = new Error(`Order "${orderId}" has already been captured and settled.`);
      error.statusCode = 409;
      throw error;
    }

    if (order.status === 'CAPTURING') {
      const error = new Error(`Payment capture for order "${orderId}" is currently in progress. Please wait.`);
      error.statusCode = 409;
      throw error;
    }

    if (order.status === 'MANUAL_RECONCILIATION_REQUIRED' || order.status === 'CAPTURE_UNKNOWN') {
      const error = new Error(
        `Order "${orderId}" is in reconciliation state (${order.status}: ${order.reconciliationReason || 'Uncertain capture status'}). ` +
        `Re-capture is blocked to prevent duplicate charges. Please run reconciliation.`
      );
      error.statusCode = 409;
      throw error;
    }

    // Transition state to CAPTURING
    order.status = 'CAPTURING';
    orders[orderIndex] = order;
    await writeJsonFile(ORDERS_FILE, orders);

    let captureId;
    let paymentMode = order.mode === 'SANDBOX' ? 'SANDBOX_VERIFIED' : 'SIMULATION';
    let captureStatus = 'COMPLETED';

    if (order.mode === 'SANDBOX') {
      let captureResponse;
      try {
        const token = await getPayPalAccessToken();
        captureResponse = await axios.post(
          `${PAYPAL_API_BASE}/v2/checkout/orders/${orderId}/capture`,
          {},
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
              'PayPal-Request-Id': `capture-${orderId}`
            }
          }
        );
      } catch (err) {
        // Dissect error: distinguish definite pre-capture errors from uncertain dispatch outcomes
        const errDetails = err.response?.data?.details;
        const issue = errDetails?.[0]?.issue;

        if (issue === 'ORDER_NOT_APPROVED') {
          // Pre-capture failure: buyer hasn't approved yet, money NOT taken -> safe to revert to CREATED
          order.status = 'CREATED';
          orders[orderIndex] = order;
          await writeJsonFile(ORDERS_FILE, orders);

          const error = new Error('Payment was not approved yet. Please log into the PayPal popup and click "Pay Now" or "Complete Purchase".');
          error.statusCode = 422;
          throw error;
        }

        if (issue === 'ORDER_ALREADY_CAPTURED') {
          // Already captured on PayPal side! Do not revert to CREATED!
          order.status = 'CAPTURE_UNKNOWN';
          order.reconciliationReason = 'PayPal indicates ORDER_ALREADY_CAPTURED. Reconciliation required.';
          orders[orderIndex] = order;
          await writeJsonFile(ORDERS_FILE, orders);

          const error = new Error('Order was already captured on PayPal. Reconciling transaction record.');
          error.statusCode = 409;
          throw error;
        }

        // Network timeout, connection drop, 5xx gateway error
        // Capture may have completed on PayPal, but response was lost: retain CAPTURE_UNKNOWN
        order.status = 'CAPTURE_UNKNOWN';
        order.reconciliationReason = `Uncertain outcome during capture dispatch: ${err.message}`;
        order.updatedAt = new Date().toISOString();
        orders[orderIndex] = order;
        await writeJsonFile(ORDERS_FILE, orders);

        const error = new Error(`Payment capture outcome uncertain (${err.message}). Status locked as CAPTURE_UNKNOWN to prevent duplicate charge.`);
        error.statusCode = 504;
        throw error;
      }

      // Successful HTTP response from PayPal
      const captureData = captureResponse.data;
      captureStatus = captureData.status;

      if (captureStatus !== 'COMPLETED') {
        order.status = 'CAPTURE_UNKNOWN';
        order.reconciliationReason = `Non-completed PayPal status returned: ${captureStatus}`;
        orders[orderIndex] = order;
        await writeJsonFile(ORDERS_FILE, orders);

        const error = new Error(`PayPal order capture was not completed. Status returned: ${captureStatus}`);
        error.statusCode = 422;
        throw error;
      }

      const captureUnit = captureData.purchase_units?.[0]?.payments?.captures?.[0];
      captureId = captureUnit?.id || `CAP-${Date.now()}`;
      const capturedAmountStr = captureUnit?.amount?.value || order.amount;

      // Verify in exact integer cents
      const capturedCents = toCents(capturedAmountStr);
      const expectedCents = toCents(order.amount);

      if (capturedCents !== expectedCents) {
        // PayPal took the funds, but amount differed: DO NOT REVERT TO CREATED! Lock as MANUAL_RECONCILIATION_REQUIRED
        order.status = 'MANUAL_RECONCILIATION_REQUIRED';
        order.captureId = captureId;
        order.capturedAmount = capturedAmountStr;
        order.reconciliationReason = `Critical financial mismatch: Server expected $${order.amount} (${expectedCents} cents), but PayPal captured $${capturedAmountStr} (${capturedCents} cents).`;
        order.updatedAt = new Date().toISOString();
        orders[orderIndex] = order;
        await writeJsonFile(ORDERS_FILE, orders);

        const error = new Error(
          `Critical financial mismatch: Server expected $${order.amount} (${expectedCents} cents), ` +
          `but PayPal captured $${capturedAmountStr} (${capturedCents} cents). Locked for manual reconciliation.`
        );
        error.statusCode = 422;
        throw error;
      }
    } else {
      // Simulation Mode
      captureId = `SIM-CAPTURE-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
    }

    // Atomic & Idempotent Ledger Write
    // Acquire ledger lock to serialize transactions.json across ALL orders
    const releaseLedgerLock = await fileMutex.acquire('transactions-ledger-lock');
    let newTransaction;

    try {
      // Update order state to CAPTURED
      order.status = 'CAPTURED';
      order.capturedAt = new Date().toISOString();
      order.captureId = captureId;
      orders[orderIndex] = order;
      await writeJsonFile(ORDERS_FILE, orders);

      // Check if transaction row already exists (idempotency)
      const transactions = await readJsonFile(TRANSACTIONS_FILE, []);
      const existingTxn = transactions.find(t => 
        t.paypalOrderId === order.orderId || 
        (captureId && t.paypalCaptureId === captureId)
      );

      if (existingTxn) {
        newTransaction = existingTxn;
      } else {
        const randomSuffix = Math.floor(1000 + Math.random() * 9000);
        const transactionId = paymentMode === 'SANDBOX_VERIFIED' 
          ? `TXN-2026-${randomSuffix}` 
          : `SIM-TXN-2026-${randomSuffix}`;

        newTransaction = {
          transactionId,
          paypalOrderId: order.orderId,
          paypalCaptureId: captureId,
          timestamp: new Date().toISOString(),
          supplierId: order.supplierId,
          supplierName: order.supplierName,
          product: order.product,
          quantity: order.quantity,
          unitPrice: order.unitPrice,
          shippingCost: order.shippingCost,
          totalAmount: parseFloat(order.amount),
          maxBudget: order.maxBudget || procurementMetadata.maxBudget || 0,
          estimatedSavings: order.estimatedSavings || procurementMetadata.estimatedSavings || calculateEstimatedSavings(order.maxBudget || procurementMetadata.maxBudget, order.amount),
          realizedSavings: order.estimatedSavings || procurementMetadata.estimatedSavings || calculateEstimatedSavings(order.maxBudget || procurementMetadata.maxBudget, order.amount),
          paymentStatus: "COMPLETED",
          paymentMode,
          notes: paymentMode === 'SANDBOX_VERIFIED'
            ? `Settled to platform Sandbox Merchant with Supplier metadata (ID: ${order.supplierId})`
            : `Simulated checkout record (Simulation Mode active)`
        };

        transactions.unshift(newTransaction);
        await writeJsonFile(TRANSACTIONS_FILE, transactions);
      }
    } finally {
      releaseLedgerLock();
    }

    return {
      success: true,
      transaction: newTransaction,
      paymentStatus: "COMPLETED",
      paymentMode,
      captureID: captureId,
      realizedSavings: newTransaction.realizedSavings
    };
  } finally {
    releaseOrderLock();
  }
}

/**
 * Startup and on-demand ledger/order reconciliation routine.
 * 1. Recovers any missing ledger entries for orders marked CAPTURED.
 * 2. Unsticks any orders left in CAPTURING due to an unexpected process restart.
 */
export async function reconcileLedgerAndOrders() {
  const release = await fileMutex.acquire('reconciliation-lock');
  try {
    const orders = await readJsonFile(ORDERS_FILE, []);
    const transactions = await readJsonFile(TRANSACTIONS_FILE, []);
    let modifiedTransactions = false;
    let reconciledCount = 0;

    // 1. Recover missing transactions for CAPTURED orders
    for (const order of orders) {
      if (order.status === 'CAPTURED' && order.captureId) {
        const hasTxn = transactions.some(t => 
          t.paypalOrderId === order.orderId || 
          t.paypalCaptureId === order.captureId
        );

        if (!hasTxn) {
          const randomSuffix = Math.floor(1000 + Math.random() * 9000);
          const paymentMode = order.mode === 'SANDBOX' ? 'SANDBOX_VERIFIED' : 'SIMULATION';
          const recoveredTxn = {
            transactionId: paymentMode === 'SANDBOX_VERIFIED' ? `TXN-REC-${randomSuffix}` : `SIM-TXN-REC-${randomSuffix}`,
            paypalOrderId: order.orderId,
            paypalCaptureId: order.captureId,
            timestamp: order.capturedAt || new Date().toISOString(),
            supplierId: order.supplierId,
            supplierName: order.supplierName,
            product: order.product,
            quantity: order.quantity,
            unitPrice: order.unitPrice,
            shippingCost: order.shippingCost,
            totalAmount: parseFloat(order.amount),
            maxBudget: order.maxBudget || 0,
            estimatedSavings: order.estimatedSavings || 0,
            realizedSavings: order.estimatedSavings || 0,
            paymentStatus: "COMPLETED",
            paymentMode,
            notes: `Auto-reconciled on startup (missing ledger entry recovered)`
          };
          transactions.unshift(recoveredTxn);
          modifiedTransactions = true;
          reconciledCount++;
        }
      }
    }

    if (modifiedTransactions) {
      await writeJsonFile(TRANSACTIONS_FILE, transactions);
    }

    // 2. Clear stuck CAPTURING orders from previous process crashes
    let modifiedOrders = false;
    for (const order of orders) {
      if (order.status === 'CAPTURING') {
        order.status = 'CAPTURE_UNKNOWN';
        order.reconciliationReason = 'Server process terminated while capture was in-flight. Verification required.';
        order.updatedAt = new Date().toISOString();
        modifiedOrders = true;
      }
    }

    if (modifiedOrders) {
      await writeJsonFile(ORDERS_FILE, orders);
    }

    return {
      success: true,
      reconciledCount
    };
  } finally {
    release();
  }
}

/**
 * Reconciles an order with uncertain status (CAPTURE_UNKNOWN) against PayPal Orders API.
 */
export async function reconcileOrderWithPayPal(orderId) {
  if (!orderId) {
    const error = new Error('orderId is required for PayPal reconciliation.');
    error.statusCode = 400;
    throw error;
  }

  const release = await fileMutex.acquire(`order-lock-${orderId}`);
  try {
    const orders = await readJsonFile(ORDERS_FILE, []);
    const orderIndex = orders.findIndex(o => o.orderId === orderId);

    if (orderIndex === -1) {
      const error = new Error(`Order "${orderId}" not found in persistent orders registry.`);
      error.statusCode = 404;
      throw error;
    }

    const order = orders[orderIndex];
    if (order.mode !== 'SANDBOX') {
      return { success: true, status: order.status, message: 'Simulation orders do not require remote PayPal API reconciliation.' };
    }

    const token = await getPayPalAccessToken();
    const response = await axios.get(`${PAYPAL_API_BASE}/v2/checkout/orders/${orderId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const paypalOrder = response.data;
    if (paypalOrder.status === 'COMPLETED') {
      const capture = paypalOrder.purchase_units?.[0]?.payments?.captures?.[0];
      const captureId = capture ? capture.id : `REC-${Date.now()}`;
      order.status = 'CAPTURED';
      order.captureId = captureId;
      order.capturedAt = new Date().toISOString();
      delete order.reconciliationReason;
      orders[orderIndex] = order;
      await writeJsonFile(ORDERS_FILE, orders);

      await reconcileLedgerAndOrders();
      return { success: true, status: 'CAPTURED', captureId, reconciled: true };
    } else if (paypalOrder.status === 'APPROVED' || paypalOrder.status === 'CREATED') {
      order.status = 'CREATED';
      delete order.reconciliationReason;
      orders[orderIndex] = order;
      await writeJsonFile(ORDERS_FILE, orders);
      return { success: true, status: 'CREATED', message: 'Order was uncaptured on PayPal. Reverted to CREATED.' };
    }

    return { success: true, status: paypalOrder.status };
  } finally {
    release();
  }
}
