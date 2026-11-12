import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import { PAYPAL_CREDENTIALS, isPayPalConfigured, PAYPAL_API_BASE } from '../config/paypal.js';
import { readJsonFile, writeJsonFile } from '../utils/storage.js';
import { toCents, fromCents, calculateLandedCost, calculateEstimatedSavings } from '../utils/calculations.js';

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
    throw new Error('PayPal Sandbox credentials not configured.');
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
 * Calculates exact landed cost from suppliers.json to prevent client-side price tampering.
 */
export async function createOrder(supplierId, quantityRequested = 1, maxBudget = 0, forceSimulation = false) {
  const quantity = Math.max(1, parseInt(quantityRequested, 10) || 1);
  const suppliers = await readJsonFile(SUPPLIERS_FILE, []);
  const supplier = suppliers.find(s => s.supplierId === supplierId);

  if (!supplier) {
    throw new Error(`Supplier with ID "${supplierId}" not found.`);
  }

  // Calculate authoritative landed cost on backend
  const landedCost = calculateLandedCost(supplier.unitPrice, quantity, supplier.shippingCost);
  const landedCostFormatted = landedCost.toFixed(2);
  const budget = parseFloat(maxBudget) || 0;
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
        description: `ProcurePal Settlement: ${supplier.product} (${quantity} units)`,
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
 * Captures an approved PayPal order with double-capture protection and cent-level amount verification.
 */
export async function captureOrder(orderId, procurementMetadata = {}) {
  const orders = await readJsonFile(ORDERS_FILE, []);
  const orderIndex = orders.findIndex(o => o.orderId === orderId);

  if (orderIndex === -1) {
    throw new Error(`Order "${orderId}" not found in persistent orders registry.`);
  }

  const order = orders[orderIndex];

  // Double capture / replay protection
  if (order.status === 'CAPTURED') {
    const error = new Error(`Order "${orderId}" has already been captured and settled.`);
    error.statusCode = 409;
    throw error;
  }

  let captureId;
  let paymentMode = order.mode === 'SANDBOX' ? 'SANDBOX_VERIFIED' : 'SIMULATION';
  let captureStatus = 'COMPLETED';

  if (order.mode === 'SANDBOX') {
    const token = await getPayPalAccessToken();
    let captureResponse;
    try {
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
    } catch (axiosErr) {
      const errDetails = axiosErr.response?.data?.details;
      const issue = errDetails?.[0]?.issue;
      if (issue === 'ORDER_NOT_APPROVED') {
        const error = new Error('Payment was not approved yet. Please log into the PayPal popup and click "Pay Now" or "Complete Purchase".');
        error.statusCode = 422;
        throw error;
      }
      const desc = errDetails?.[0]?.description || axiosErr.response?.data?.message || axiosErr.message;
      const error = new Error(`PayPal capture error (${issue || '422'}): ${desc}`);
      error.statusCode = axiosErr.response?.status || 500;
      throw error;
    }

    const captureData = captureResponse.data;
    captureStatus = captureData.status;

    if (captureStatus !== 'COMPLETED') {
      throw new Error(`PayPal order capture was not completed. Status returned: ${captureStatus}`);
    }

    const captureUnit = captureData.purchase_units[0].payments.captures[0];
    captureId = captureUnit.id;
    const capturedAmountStr = captureUnit.amount.value;

    // Zero Floating-Point Precision Hazard: verify in exact integer cents
    const capturedCents = toCents(capturedAmountStr);
    const expectedCents = toCents(order.amount);

    if (capturedCents !== expectedCents) {
      throw new Error(
        `Critical financial mismatch: Server expected $${order.amount} (${expectedCents} cents), ` +
        `but PayPal captured $${capturedAmountStr} (${capturedCents} cents). Settlement aborted.`
      );
    }
  } else {
    // Simulation Mode
    captureId = `SIM-CAPTURE-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
  }

  // Update order state to CAPTURED
  order.status = 'CAPTURED';
  order.capturedAt = new Date().toISOString();
  order.captureId = captureId;
  orders[orderIndex] = order;
  await writeJsonFile(ORDERS_FILE, orders);

  // Generate verified transaction row in ledger
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const transactionId = paymentMode === 'SANDBOX_VERIFIED' 
    ? `TXN-2026-${randomSuffix}` 
    : `SIM-TXN-2026-${randomSuffix}`;

  const newTransaction = {
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
    realizedSavings: order.estimatedSavings || procurementMetadata.estimatedSavings || calculateEstimatedSavings(order.maxBudget || procurementMetadata.maxBudget, order.amount), // Realized strictly upon successful capture
    paymentStatus: "COMPLETED",
    paymentMode,
    notes: paymentMode === 'SANDBOX_VERIFIED'
      ? `Settled to platform Sandbox Merchant with Supplier metadata (ID: ${order.supplierId})`
      : `Simulated checkout record (Simulation Mode active)`
  };

  const transactions = await readJsonFile(TRANSACTIONS_FILE, []);
  transactions.unshift(newTransaction);
  await writeJsonFile(TRANSACTIONS_FILE, transactions);

  return {
    success: true,
    transaction: newTransaction,
    paymentStatus: "COMPLETED",
    paymentMode,
    captureID: captureId,
    realizedSavings: newTransaction.realizedSavings
  };
}

