import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import {
  toCents,
  fromCents,
  calculateLandedCost,
  calculateEstimatedSavings,
  calculateCostScore,
  calculateSpeedScore,
  calculateWarrantyScore,
  calculateStockCushionScore,
  calculateRiskScore,
  calculateRatingScore,
  getScoringWeights,
  calculateCompositeScore,
  compareRankedSuppliers,
  isStrictPositiveInteger
} from '../utils/calculations.js';
import { getQuotes, extractRequirements, compareQuotes } from '../services/procurementService.js';
import {
  createOrder,
  captureOrder,
  reconcileLedgerAndOrders,
  reconcileOrderWithPayPal,
  getOrdersFilePath,
  getTransactionsFilePath,
  getSuppliersFilePath
} from '../services/paypalService.js';
import { buildAuthoritativeRecommendationNarrative } from '../services/geminiService.js';
import { readJsonFile, writeJsonFile } from '../utils/storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create isolated temporary test directory to prevent tests from modifying real runtime data
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'procura-test-fixtures-'));
const tempSuppliers = path.join(tempDir, 'suppliers.json');
const tempOrders = path.join(tempDir, 'orders.json');
const tempTransactions = path.join(tempDir, 'transactions.json');

// Copy baseline data into isolated test fixtures
fs.copyFileSync(path.join(__dirname, '../data/suppliers.json'), tempSuppliers);
fs.copyFileSync(path.join(__dirname, '../data/orders.json'), tempOrders);
fs.copyFileSync(path.join(__dirname, '../data/transactions.json'), tempTransactions);

process.env.SUPPLIERS_FILE_PATH = tempSuppliers;
process.env.ORDERS_FILE_PATH = tempOrders;
process.env.TRANSACTIONS_FILE_PATH = tempTransactions;

const ORDERS_FILE = tempOrders;
const TRANSACTIONS_FILE = tempTransactions;
const SUPPLIERS_FILE = tempSuppliers;

console.log('================================================================');
console.log('     PROCURA — COMPREHENSIVE PRODUCTION TEST SUITE             ');
console.log('================================================================\n');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failed++;
  }
}

async function runTests() {
  try {
  // -------------------------------------------------------------------------
  // 1. FINANCIAL PRECISION & INTEGER CENTS CONVERSION
  // -------------------------------------------------------------------------
  console.log('\n--- 1. Financial Precision & Integer Cents ---');
  assert(toCents(0.1) + toCents(0.2) === toCents(0.3), 'Integer cents eliminates floating-point arithmetic error (0.1 + 0.2 === 0.3)');
  assert(toCents('$4,450.00') === 445000, 'toCents handles formatted dollar strings ($4,450.00 -> 445000)');
  assert(toCents(' 120.50 ') === 12050, 'toCents trims and parses spaced currency strings');
  assert(toCents(null) === 0 && toCents(undefined) === 0 && toCents(NaN) === 0, 'toCents handles null, undefined, and NaN safely');
  assert(fromCents(445000) === '4450.00', 'fromCents formats back to exact two decimal places');
  assert(fromCents(0) === '0.00', 'fromCents formats 0 to 0.00');

  const landed = calculateLandedCost(42.00, 100, 250.00);
  assert(landed === 4450.00, `calculateLandedCost calculates exact (42.00 * 100) + 250.00 = 4450.00 (got ${landed})`);
  assert(calculateEstimatedSavings(5000, 4450) === 550.00, 'calculateEstimatedSavings calculates $5000 - $4450 = $550');
  assert(calculateEstimatedSavings(4000, 4450) === 0, 'calculateEstimatedSavings returns 0 when cost exceeds budget');
  assert(calculateEstimatedSavings(0, 4450) === 0, 'calculateEstimatedSavings returns 0 when budget is unspecified');

  // Strict Integer Validation Tests
  assert(isStrictPositiveInteger(10) === true, 'isStrictPositiveInteger accepts positive integer (10)');
  assert(isStrictPositiveInteger('25') === true, 'isStrictPositiveInteger accepts clean numeric string ("25")');
  assert(isStrictPositiveInteger(2.5) === false, 'isStrictPositiveInteger strictly rejects decimal numbers (2.5)');
  assert(isStrictPositiveInteger('2.5') === false, 'isStrictPositiveInteger strictly rejects decimal strings ("2.5")');
  assert(isStrictPositiveInteger('10abc') === false, 'isStrictPositiveInteger strictly rejects alphanumeric strings ("10abc")');
  assert(isStrictPositiveInteger(0) === false && isStrictPositiveInteger('0') === false, 'isStrictPositiveInteger strictly rejects 0');
  assert(isStrictPositiveInteger(-5) === false && isStrictPositiveInteger('-5') === false, 'isStrictPositiveInteger strictly rejects negative numbers');
  assert(isStrictPositiveInteger(NaN) === false && isStrictPositiveInteger(null) === false, 'isStrictPositiveInteger strictly rejects NaN and null');

  // -------------------------------------------------------------------------
  // 2. 5-DIMENSIONAL SCORING ENGINE TESTS
  // -------------------------------------------------------------------------
  console.log('\n--- 2. 5-Dimensional Scoring Engine ---');

  // Dimension 1: Landed Cost
  const costCheap = calculateCostScore(4000, 4000, 5000);
  const costExp = calculateCostScore(5000, 4000, 5000);
  const costMid = calculateCostScore(4500, 4000, 5000);
  const costEqual = calculateCostScore(4500, 4500, 4500);
  assert(costCheap === 100, `Cheapest compliant vendor gets 100 (got ${costCheap})`);
  assert(costExp === 0, `Most expensive compliant vendor gets 0 (got ${costExp})`);
  assert(costMid === 50, `Midpoint cost gets 50 (got ${costMid})`);
  assert(costEqual === 100, `Equal prices yield 100 without division-by-zero (got ${costEqual})`);

  // Dimension 2: Delivery SLA
  assert(calculateSpeedScore(2) === 90, '2-day delivery yields speed score 90');
  assert(calculateSpeedScore(5) === 75, '5-day delivery yields speed score 75');
  assert(calculateSpeedScore(9) === 55, '9-day delivery yields speed score 55');
  assert(calculateSpeedScore(null) === 65, 'Unspecified delivery defaults to neutral median');

  // Dimension 3: Warranty Coverage
  assert(calculateWarrantyScore('5-Year Commercial Warranty') === 100, '5-Year warranty yields 100');
  assert(calculateWarrantyScore('3-Year Limited Warranty') === 70, '3-Year warranty yields 70');
  assert(calculateWarrantyScore('1-Year Standard Warranty') === 40, '1-Year warranty yields 40');
  assert(calculateWarrantyScore('Lifetime Warranty') === 100, 'Lifetime warranty yields 100');
  assert(calculateWarrantyScore('No Warranty') === 0, 'No warranty yields 0');
  assert(calculateWarrantyScore(null) === 20, 'Missing warranty yields documented minimum default 20');

  // Dimension 4: Stock Availability & Cushion
  assert(calculateStockCushionScore(80, 100) === 0, 'Insufficient stock (< 1x) yields 0 cushion score');
  assert(calculateStockCushionScore(100, 100) === 50, 'Exact stock match (1.0x) yields base cushion score 50');
  assert(calculateStockCushionScore(250, 100) === 68.8, `2.5x stock ratio yields cushion score ~68.8 (got ${calculateStockCushionScore(250, 100)})`);
  assert(calculateStockCushionScore(500, 100) === 100, 'Abundant stock (>= 5.0x) yields maximum cushion score 100');

  // Dimension 5: Operational Risk
  const lowRisk = calculateRiskScore('Low Risk', 4.8);
  const medRisk = calculateRiskScore('Medium Risk', 4.2);
  const highRisk = calculateRiskScore('High Risk', 4.9);
  assert(lowRisk >= 90, `Low Risk yields >= 90 operational risk score (got ${lowRisk})`);
  assert(medRisk >= 55 && medRisk <= 70, `Medium Risk yields ~60 operational risk score (got ${medRisk})`);
  assert(highRisk <= 40, `High Risk yields <= 40 operational risk score (got ${highRisk})`);

  // Weight Verification (strictly sums to 1.0)
  for (const prio of ['balanced', 'cost', 'speed', 'quality']) {
    const w = getScoringWeights(prio);
    const sum = Math.round((w.cost + w.speed + w.warranty + w.stock + w.risk) * 100) / 100;
    assert(sum === 1.0, `Priority "${prio}" weights sum to exactly 1.0 (got ${sum})`);
  }

  // Composite Score
  const compScore = calculateCompositeScore(100, 75, 100, 68.8, 95, 'balanced');
  assert(compScore >= 89 && compScore <= 91, `Composite score for optimal profile is ~89.6 (got ${compScore})`);

  // -------------------------------------------------------------------------
  // 3. DETERMINISTIC QUOTATION EVALUATION & RANKING
  // -------------------------------------------------------------------------
  console.log('\n--- 3. Quotation Comparison & Ranking ---');

  // Test 3a: Standard Requisition (100 chairs, $5000 budget)
  const result100 = await compareQuotes(null, 100, 5000, 'balanced');
  assert(result100.success === true, 'compareQuotes executes successfully');
  assert(result100.compliantCount === 2, `2 suppliers compliant, 1 disqualified (got ${result100.compliantCount})`);

  const sup003 = result100.comparison.find(q => q.supplierId === 'SUP-003');
  assert(sup003.isCompliant === false, 'SUP-003 is disqualified due to stock limit (80 < 100)');
  assert(sup003.disqualificationReasons.length > 0, 'SUP-003 has explicit disqualification reasons');
  assert(sup003.scoreBreakdown.compositeScore === 0, 'Disqualified supplier receives composite score 0');

  const top100 = result100.recommendation.topQuote;
  assert(top100.supplierId === 'SUP-001', `SUP-001 is top ranked (got ${top100.supplierId})`);
  assert(top100.totalCost === 4450, `SUP-001 landed cost is exactly $4450 (got ${top100.totalCost})`);
  assert(top100.estimatedSavings === 550, `Estimated savings is $550 (got ${top100.estimatedSavings})`);
  assert(top100.scoreBreakdown !== undefined, 'Top quote includes full transparent scoreBreakdown');

  // Test 3b: Zero Budget Requisition
  const resultZero = await compareQuotes(null, 50, 0, 'balanced');
  assert(resultZero.compliantCount === 3, 'Zero budget allows all stock-compliant suppliers');
  assert(resultZero.recommendation.estimatedSavings === 0, 'Zero budget produces 0 estimated savings without error');

  // Test 3c: Over-Budget Requisition (no suppliers compliant)
  const resultOver = await compareQuotes(null, 100, 3000, 'balanced');
  assert(resultOver.compliantCount === 0, 'All suppliers disqualified when budget is lower than all landed costs');
  assert(resultOver.recommendation.selectedSupplierId === null, 'No supplier selected when 0 compliant');

  // Test 3d: Empty / Unmatched Category
  const emptyQuotes = await getQuotes('non_existent_category_xyz');
  assert(emptyQuotes.length === 0, 'getQuotes returns empty array for unsupported category without fallback pollution');
  const resultEmpty = await compareQuotes(emptyQuotes, 10, 1000, 'balanced');
  assert(resultEmpty.compliantCount === 0 && resultEmpty.totalEvaluated === 0, 'compareQuotes handles empty quote list gracefully');

  // -------------------------------------------------------------------------
  // 4. REQUIREMENT EXTRACTION & HEURISTICS
  // -------------------------------------------------------------------------
  console.log('\n--- 4. Requirement Extraction & Heuristics ---');

  const prompt1 = 'Procure 100 ergonomic mesh task chairs under $5,000 within 5 days';
  const req1 = extractRequirements(prompt1);
  assert(req1.quantity === 100, `Correctly parsed quantity 100 (got ${req1.quantity})`);
  assert(req1.maxBudget === 5000, `Correctly parsed budget 5000 (got ${req1.maxBudget})`);
  assert(req1.category === 'chairs', `Correctly identified category chairs (got ${req1.category})`);

  const prompt2 = 'Need 25 Dell Latitude 5540 enterprise laptops for $25,000 urgently';
  const req2 = extractRequirements(prompt2);
  assert(req2.quantity === 25, `Did not confuse model number 5540 with quantity (got ${req2.quantity})`);
  assert(req2.maxBudget === 25000, `Correctly parsed budget $25,000 (got ${req2.maxBudget})`);
  assert(req2.category === 'laptops', `Correctly identified category laptops (got ${req2.category})`);
  assert(req2.priority === 'speed', `Correctly identified urgency as speed priority (got ${req2.priority})`);

  // -------------------------------------------------------------------------
  // 5. SERVER-SIDE ORDER CREATION & VALIDATION
  // -------------------------------------------------------------------------
  console.log('\n--- 5. Server-Side Order Validation (createOrder) ---');

  // Test 5a: Missing / Invalid Supplier
  try {
    await createOrder('SUP-NONEXISTENT', 10, 5000, true);
    assert(false, 'createOrder should reject non-existent supplier');
  } catch (err) {
    assert(err.statusCode === 404, `createOrder throws 404 for unknown supplier (got ${err.statusCode})`);
  }

  // Test 5b: Invalid / Negative / Decimal Quantity
  try {
    await createOrder('SUP-001', -5, 5000, true);
    assert(false, 'createOrder should reject negative quantity');
  } catch (err) {
    assert(err.statusCode === 400, `createOrder throws 400 for negative quantity (got ${err.statusCode})`);
  }

  try {
    await createOrder('SUP-001', 2.5, 5000, true);
    assert(false, 'createOrder should reject decimal quantity (2.5)');
  } catch (err) {
    assert(err.statusCode === 400, `createOrder throws 400 for decimal quantity (got ${err.statusCode})`);
  }

  try {
    await createOrder('SUP-001', '10abc', 5000, true);
    assert(false, 'createOrder should reject malformed quantity string ("10abc")');
  } catch (err) {
    assert(err.statusCode === 400, `createOrder throws 400 for malformed quantity string (got ${err.statusCode})`);
  }

  // Test 5c: Quantity Exceeding Stock Limit
  try {
    await createOrder('SUP-003', 150, 10000, true); // SUP-003 only has 80 units
    assert(false, 'createOrder should reject quantity exceeding stock');
  } catch (err) {
    assert(err.statusCode === 400, `createOrder throws 400 when quantity exceeds stock (got ${err.statusCode})`);
  }

  // Test 5d: Budget Violation
  try {
    await createOrder('SUP-001', 100, 3000, true); // 100 * $42 + $250 = $4450 > $3000
    assert(false, 'createOrder should reject when landed cost exceeds budget cap');
  } catch (err) {
    assert(err.statusCode === 400, `createOrder throws 400 when cost exceeds budget cap (got ${err.statusCode})`);
  }

  // Test 5e: Valid Simulation Order Creation
  const simOrder = await createOrder('SUP-001', 10, 1000, true);
  assert(simOrder.success === true, 'Valid simulation order creates successfully');
  assert(simOrder.orderID.startsWith('SIM-ORDER-'), `Simulation order receives SIM-ORDER ID (got ${simOrder.orderID})`);
  assert(simOrder.amount === '670.00', `Authoritative landed cost for 10 units is $670.00 (got ${simOrder.amount})`);

  // -------------------------------------------------------------------------
  // 6. ORDER STATE MACHINE & DOUBLE-CAPTURE PROTECTION
  // -------------------------------------------------------------------------
  console.log('\n--- 6. Order State Machine & Double-Capture Protection ---');

  // Test 6a: Missing Order Capture
  try {
    await captureOrder('SIM-ORDER-DOES-NOT-EXIST');
    assert(false, 'captureOrder should reject non-existent order ID');
  } catch (err) {
    assert(err.statusCode === 404, `captureOrder throws 404 for unknown order ID (got ${err.statusCode})`);
  }

  // Test 6b: First Capture (Success)
  const captureResult = await captureOrder(simOrder.orderID, { maxBudget: 1000 });
  assert(captureResult.success === true, 'First capture attempt succeeds');
  assert(captureResult.paymentStatus === 'COMPLETED', 'Captured order has COMPLETED status');
  assert(captureResult.transaction.totalAmount === 670, `Transaction records exact totalAmount $670 (got ${captureResult.transaction.totalAmount})`);

  // Test 6c: Duplicate Capture Prevention (Replay Protection)
  try {
    await captureOrder(simOrder.orderID);
    assert(false, 'captureOrder should reject double capture attempt');
  } catch (err) {
    assert(err.statusCode === 409, `Double capture attempt throws HTTP 409 Conflict (got ${err.statusCode})`);
  }

  // -------------------------------------------------------------------------
  // 7. PAYPAL RECONCILIATION AMOUNT, CURRENCY & IDEMPOTENCY VERIFICATION
  // -------------------------------------------------------------------------
  console.log('\n--- 7. PayPal Capture Reconciliation & Mismatch Defense ---');

  // Test 7a: PayPal capture amount matches stored order
  const recOrder = await createOrder('SUP-001', 10, 1000, true);
  const allOrders = await readJsonFile(ORDERS_FILE, []);
  const recIdx = allOrders.findIndex(o => o.orderId === recOrder.orderID);
  allOrders[recIdx].mode = 'SANDBOX';
  allOrders[recIdx].status = 'CAPTURE_UNKNOWN';
  await writeJsonFile(ORDERS_FILE, allOrders);

  const mockValidCaptureId = `CAP-VALID-${Date.now()}`;
  const mockValidPayPal = {
    id: recOrder.orderID,
    status: 'COMPLETED',
    purchase_units: [{
      payments: {
        captures: [{
          id: mockValidCaptureId,
          status: 'COMPLETED',
          amount: { value: '670.00', currency_code: 'USD' },
          create_time: new Date().toISOString()
        }]
      }
    }]
  };

  const recResult = await reconcileOrderWithPayPal(recOrder.orderID, mockValidPayPal);
  assert(recResult.success === true, 'PayPal reconciliation succeeds when capture amount and currency match');
  assert(recResult.status === 'CAPTURED', 'Reconciled order transitions to CAPTURED');

  // Test 7b: PayPal capture amount mismatch is rejected
  const mismatchOrder = await createOrder('SUP-001', 10, 1000, true);
  const allOrders2 = await readJsonFile(ORDERS_FILE, []);
  const misIdx = allOrders2.findIndex(o => o.orderId === mismatchOrder.orderID);
  allOrders2[misIdx].mode = 'SANDBOX';
  allOrders2[misIdx].status = 'CAPTURE_UNKNOWN';
  await writeJsonFile(ORDERS_FILE, allOrders2);

  const mockAmountMismatch = {
    id: mismatchOrder.orderID,
    status: 'COMPLETED',
    purchase_units: [{
      payments: {
        captures: [{
          id: `CAP-MIS-${Date.now()}`,
          status: 'COMPLETED',
          amount: { value: '500.00', currency_code: 'USD' }
        }]
      }
    }]
  };

  const misResult = await reconcileOrderWithPayPal(mismatchOrder.orderID, mockAmountMismatch);
  assert(misResult.success === false, 'Reconciliation rejects capture amount mismatch ($500.00 vs $670.00)');
  assert(misResult.status === 'MANUAL_RECONCILIATION_REQUIRED', 'Mismatch transitions order to MANUAL_RECONCILIATION_REQUIRED');

  const checkedMismatchOrder = (await readJsonFile(ORDERS_FILE, [])).find(o => o.orderId === mismatchOrder.orderID);
  assert(checkedMismatchOrder.status === 'MANUAL_RECONCILIATION_REQUIRED', 'Persisted order state is MANUAL_RECONCILIATION_REQUIRED');
  assert(checkedMismatchOrder.capturedAmount === '500.00', 'Captured amount ($500.00) is saved for manual audit');

  const txnsAfterMismatch = await readJsonFile(TRANSACTIONS_FILE, []);
  const mismatchTxn = txnsAfterMismatch.find(t => t.paypalOrderId === mismatchOrder.orderID);
  assert(mismatchTxn === undefined, 'No falsified ledger transaction is created for mismatched order');

  // Test 7c: Currency mismatch is rejected
  const currOrder = await createOrder('SUP-001', 10, 1000, true);
  const allOrders3 = await readJsonFile(ORDERS_FILE, []);
  const currIdx = allOrders3.findIndex(o => o.orderId === currOrder.orderID);
  allOrders3[currIdx].mode = 'SANDBOX';
  allOrders3[currIdx].status = 'CAPTURE_UNKNOWN';
  await writeJsonFile(ORDERS_FILE, allOrders3);

  const mockCurrencyMismatch = {
    id: currOrder.orderID,
    status: 'COMPLETED',
    purchase_units: [{
      payments: {
        captures: [{
          id: `CAP-CURR-${Date.now()}`,
          status: 'COMPLETED',
          amount: { value: '670.00', currency_code: 'EUR' }
        }]
      }
    }]
  };

  const currResult = await reconcileOrderWithPayPal(currOrder.orderID, mockCurrencyMismatch);
  assert(currResult.success === false, 'Reconciliation rejects currency mismatch (EUR vs USD)');
  assert(currResult.status === 'MANUAL_RECONCILIATION_REQUIRED', 'Currency mismatch transitions order to MANUAL_RECONCILIATION_REQUIRED');

  // Test 7d: Missing currency code fails closed (rejects missing currency)
  const noCurrOrder = await createOrder('SUP-001', 10, 1000, true);
  const allOrders4 = await readJsonFile(ORDERS_FILE, []);
  const noCurrIdx = allOrders4.findIndex(o => o.orderId === noCurrOrder.orderID);
  allOrders4[noCurrIdx].mode = 'SANDBOX';
  allOrders4[noCurrIdx].status = 'CAPTURE_UNKNOWN';
  await writeJsonFile(ORDERS_FILE, allOrders4);

  const mockMissingCurrency = {
    id: noCurrOrder.orderID,
    status: 'COMPLETED',
    purchase_units: [{
      payments: {
        captures: [{
          id: `CAP-NOCURR-${Date.now()}`,
          status: 'COMPLETED',
          amount: { value: '670.00' } // Missing currency_code
        }]
      }
    }]
  };

  const noCurrResult = await reconcileOrderWithPayPal(noCurrOrder.orderID, mockMissingCurrency);
  assert(noCurrResult.success === false, 'Reconciliation rejects missing currency code');
  assert(noCurrResult.status === 'MANUAL_RECONCILIATION_REQUIRED', 'Missing currency code transitions order to MANUAL_RECONCILIATION_REQUIRED');

  // Test 7e: Non-COMPLETED capture status in reconciliation fails closed
  const pendOrder = await createOrder('SUP-001', 10, 1000, true);
  const allOrders5 = await readJsonFile(ORDERS_FILE, []);
  const pendIdx = allOrders5.findIndex(o => o.orderId === pendOrder.orderID);
  allOrders5[pendIdx].mode = 'SANDBOX';
  allOrders5[pendIdx].status = 'CAPTURE_UNKNOWN';
  await writeJsonFile(ORDERS_FILE, allOrders5);

  const mockPendingCapture = {
    id: pendOrder.orderID,
    status: 'COMPLETED',
    purchase_units: [{
      payments: {
        captures: [{
          id: `CAP-PEND-${Date.now()}`,
          status: 'PENDING', // Non-completed capture inside completed order!
          amount: { value: '670.00', currency_code: 'USD' }
        }]
      }
    }]
  };

  const pendResult = await reconcileOrderWithPayPal(pendOrder.orderID, mockPendingCapture);
  assert(pendResult.success === false, 'Reconciliation rejects non-COMPLETED capture status (PENDING)');
  assert(pendResult.status === 'MANUAL_RECONCILIATION_REQUIRED', 'PENDING capture status transitions order to MANUAL_RECONCILIATION_REQUIRED');

  // Test 7f: Completed PayPal order with missing captures array fails closed
  const noCapOrder = await createOrder('SUP-001', 10, 1000, true);
  const allOrders6 = await readJsonFile(ORDERS_FILE, []);
  const noCapIdx = allOrders6.findIndex(o => o.orderId === noCapOrder.orderID);
  allOrders6[noCapIdx].mode = 'SANDBOX';
  allOrders6[noCapIdx].status = 'CAPTURE_UNKNOWN';
  await writeJsonFile(ORDERS_FILE, allOrders6);

  const mockNoCaptures = {
    id: noCapOrder.orderID,
    status: 'COMPLETED',
    purchase_units: [{
      payments: {} // No captures unit
    }]
  };

  const noCapResult = await reconcileOrderWithPayPal(noCapOrder.orderID, mockNoCaptures);
  assert(noCapResult.success === false, 'Reconciliation rejects completed PayPal order with missing capture units');
  assert(noCapResult.status === 'MANUAL_RECONCILIATION_REQUIRED', 'Missing capture record transitions order to MANUAL_RECONCILIATION_REQUIRED');

  // Test 7g & 7h: Reconciliation idempotency and single ledger record
  const secondRecResult = await reconcileOrderWithPayPal(recOrder.orderID, mockValidPayPal);
  assert(secondRecResult.status === 'CAPTURED', 'Second reconciliation confirms CAPTURED status');

  const allTxnsAfterRec = await readJsonFile(TRANSACTIONS_FILE, []);
  const matchingRecTxns = allTxnsAfterRec.filter(t => t.paypalOrderId === recOrder.orderID);
  assert(matchingRecTxns.length === 1, `Reconciliation idempotently creates exactly 1 ledger transaction (found ${matchingRecTxns.length})`);

  // -------------------------------------------------------------------------
  // 8. CONCURRENCY CONTROL (ORDERS.JSON & PARALLEL CAPTURES)
  // -------------------------------------------------------------------------
  console.log('\n--- 8. Concurrent Order Creation & Parallel Capture Safety ---');

  // Test 8a: Concurrent creation of 5 distinct orders
  const concurrentCreations = await Promise.all([
    createOrder('SUP-001', 1, 0, true),
    createOrder('SUP-002', 2, 0, true),
    createOrder('SUP-004', 1, 0, true),
    createOrder('SUP-005', 2, 0, true),
    createOrder('SUP-006', 1, 0, true)
  ]);
  assert(concurrentCreations.length === 5, 'Executed 5 concurrent order creations simultaneously');

  const ordersAfterConcurrent = await readJsonFile(ORDERS_FILE, []);
  for (const created of concurrentCreations) {
    const found = ordersAfterConcurrent.find(o => o.orderId === created.orderID);
    assert(found !== undefined, `Concurrent order ${created.orderID} persisted in orders.json without overwrite loss`);
  }

  // Test 8b: Concurrent capture of 3 distinct orders
  const concurrentCaptures = await Promise.all([
    captureOrder(concurrentCreations[0].orderID),
    captureOrder(concurrentCreations[1].orderID),
    captureOrder(concurrentCreations[2].orderID)
  ]);
  assert(concurrentCaptures.length === 3, 'Executed 3 concurrent captures simultaneously');

  const freshOrdersAfterCaptures = await readJsonFile(ORDERS_FILE, []);
  for (let i = 0; i < 3; i++) {
    const oId = concurrentCreations[i].orderID;
    const found = freshOrdersAfterCaptures.find(o => o.orderId === oId);
    assert(found.status === 'CAPTURED', `Concurrent captured order ${oId} correctly transitioned to CAPTURED`);
  }

  const freshTxnsAfterCaptures = await readJsonFile(TRANSACTIONS_FILE, []);
  for (let i = 0; i < 3; i++) {
    const oId = concurrentCreations[i].orderID;
    const foundTxn = freshTxnsAfterCaptures.find(t => t.paypalOrderId === oId);
    assert(foundTxn !== undefined, `Concurrent capture ${oId} has distinct committed transaction in ledger`);
  }

  // -------------------------------------------------------------------------
  // 9. LEDGER FAILURE RECOVERY & GEMINI AUTHORITATIVE NARRATIVE
  // -------------------------------------------------------------------------
  console.log('\n--- 9. Ledger Failure Recovery & Gemini Financial Narrative ---');

  // Test 9a: Ledger failure and recovery behavior
  const ghostOrderId = `SIM-ORDER-GHOST-${Date.now()}`;
  const ghostCaptureId = `SIM-CAPTURE-GHOST-${Date.now()}`;
  const ghostOrder = {
    orderId: ghostOrderId,
    supplierId: 'SUP-001',
    supplierName: 'Apex Office Solutions [DEMO DATA]',
    product: 'Ergonomic Mesh Task Chair',
    quantity: 5,
    unitPrice: 42.00,
    shippingCost: 250.00,
    amount: '460.00',
    currency: 'USD',
    maxBudget: 1000,
    estimatedSavings: 540,
    status: 'CAPTURED',
    captureId: ghostCaptureId,
    mode: 'SIMULATION',
    createdAt: new Date().toISOString(),
    capturedAt: new Date().toISOString()
  };

  const ordersForGhost = await readJsonFile(ORDERS_FILE, []);
  ordersForGhost.push(ghostOrder);
  await writeJsonFile(ORDERS_FILE, ordersForGhost);

  const recoveryResult = await reconcileLedgerAndOrders();
  assert(recoveryResult.success === true, 'reconcileLedgerAndOrders executed successfully');

  const txnsAfterRecovery = await readJsonFile(TRANSACTIONS_FILE, []);
  const ghostTxn = txnsAfterRecovery.find(t => t.paypalOrderId === ghostOrderId);
  assert(ghostTxn !== undefined, 'Missing ledger entry for ghost CAPTURED order was automatically recovered');
  assert(ghostTxn.totalAmount === 460.00, 'Recovered ledger entry preserves authoritative financial total ($460.00)');

  // Test 9b: Gemini financial narrative remains backend-authoritative
  const mockTopQuote = {
    supplierId: 'SUP-001',
    name: 'Apex Office Solutions',
    totalCost: 4450.00,
    estimatedSavings: 550.00,
    compositeScore: 89.6,
    warranty: '5-Year Commercial Warranty',
    estimatedDeliveryDays: 5,
    riskLevel: 'Low Risk'
  };

  const hallucinatedLLMText = "Apex is recommended for $2,999.00 saving $2,001.00 because of superior freight SLA and warranty.";
  const narrative = buildAuthoritativeRecommendationNarrative(mockTopQuote, 5000, hallucinatedLLMText);

  assert(narrative.includes('$4450.00'), 'Narrative enforces exact backend landed cost ($4450.00)');
  assert(!narrative.includes('$2,999.00'), 'Narrative strips out hallucinated price ($2,999.00)');
  assert(narrative.includes('$550.00'), 'Narrative enforces exact backend savings ($550.00)');
  assert(!narrative.includes('$2,001.00'), 'Narrative strips out hallucinated savings ($2,001.00)');
  assert(narrative.includes('89.6/100'), 'Narrative enforces exact backend composite score (89.6/100)');
  assert(narrative.includes('Apex Office Solutions'), 'Narrative enforces authoritative supplier name');

  // -------------------------------------------------------------------------
  // 10. STORAGE INTEGRITY & CORRUPTED JSON PROTECTION
  // -------------------------------------------------------------------------
  console.log('\n--- 10. Data Persistence & Corrupted File Protection ---');
  const corruptFile = path.join(tempDir, 'corrupt_test.json');
  fs.writeFileSync(corruptFile, '{ "invalidJson": [ unquoted_value, }');
  let threwCorrupt = false;
  try {
    await readJsonFile(corruptFile, []);
  } catch (err) {
    threwCorrupt = err.code === 'CORRUPTED_JSON_FILE';
  }
  assert(threwCorrupt === true, 'readJsonFile throws CORRUPTED_JSON_FILE on malformed JSON to prevent silent data loss');

  // Non-existent file safely returns default value (ENOENT)
  const missingFile = path.join(tempDir, 'does_not_exist.json');
  const defaultVal = await readJsonFile(missingFile, [{ default: true }]);
  assert(defaultVal.length === 1 && defaultVal[0].default === true, 'readJsonFile returns defaultValue safely for non-existent file (ENOENT)');

  console.log('\n================================================================');
  console.log(`     TEST EXECUTION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
      console.warn('Temporary test fixture cleanup notice:', e.message);
    }
  }
}

runTests().catch(err => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});
