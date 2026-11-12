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
  compareRankedSuppliers
} from '../utils/calculations.js';
import { getQuotes, extractRequirements, compareQuotes } from '../services/procurementService.js';
import { createOrder, captureOrder } from '../services/paypalService.js';

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
  // 4. REQUIREMENT EXTRACTION & HEURISTIC FALLBACK
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

  // Test 5b: Invalid / Negative Quantity
  try {
    await createOrder('SUP-001', -5, 5000, true);
    assert(false, 'createOrder should reject negative quantity');
  } catch (err) {
    assert(err.statusCode === 400, `createOrder throws 400 for negative quantity (got ${err.statusCode})`);
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

  console.log('\n================================================================');
  console.log(`     TEST EXECUTION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});
