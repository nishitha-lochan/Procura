import { toCents, fromCents, calculateCostScore, calculateLandedCost, calculateCompositeScore, compareRankedSuppliers } from '../utils/calculations.js';
import { compareQuotes } from '../services/procurementService.js';

console.log('=== RUNNING DETERMINISTIC SCORING & CALCULATION TESTS ===\n');

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

// 1. Cents Precision Test
assert(toCents(0.1) + toCents(0.2) === toCents(0.3), 'Integer cents prevents 0.1 + 0.2 floating error');
assert(toCents('$4,450.00') === 445000, 'toCents handles formatted dollar strings');
assert(fromCents(445000) === '4450.00', 'fromCents formats back to exact two decimal places');

// 2. Equal Price Cost Score Test
const equalScore = calculateCostScore(4450, 4450, 4450);
assert(equalScore === 100, `Equal price yields 100 (got ${equalScore})`);

// 3. Range-Normalized Cost Score Test
const cheapScore = calculateCostScore(4000, 4000, 5000);
const expScore = calculateCostScore(5000, 4000, 5000);
const midScore = calculateCostScore(4500, 4000, 5000);
assert(cheapScore === 100, `Cheapest compliant vendor gets 100 (got ${cheapScore})`);
assert(expScore === 0, `Most expensive compliant vendor gets 0 (got ${expScore})`);
assert(midScore === 50, `Midpoint vendor gets 50 (got ${midScore})`);

// 4. Standard Requisition: 100 chairs, $5000 budget
async function testStandardRequisition() {
  const result = await compareQuotes(null, 100, 5000, 'balanced');
  assert(result.success === true, 'compareQuotes executes successfully');
  assert(result.compliantCount === 2, `2 suppliers compliant, 1 disqualified (got ${result.compliantCount})`);
  
  const sup003 = result.comparison.find(q => q.supplierId === 'SUP-003');
  assert(sup003.isCompliant === false, 'SUP-003 is disqualified due to stock limit (80 < 100)');
  assert(sup003.disqualificationReasons.length > 0, 'SUP-003 has explicit disqualification reasons');
  
  const top = result.recommendation.topQuote;
  assert(top.supplierId === 'SUP-001', `SUP-001 is top ranked (got ${top.supplierId})`);
  assert(top.totalCost === 4450, `SUP-001 landed cost is exactly $4450 (got ${top.totalCost})`);
  assert(top.estimatedSavings === 550, `Estimated savings is $550 (got ${top.estimatedSavings})`);
}

// 5. Zero Budget Test
async function testZeroBudget() {
  const result = await compareQuotes(null, 50, 0, 'balanced');
  assert(result.compliantCount === 3, 'Zero budget allows all stock-compliant suppliers');
  assert(result.recommendation.estimatedSavings === 0, 'Zero budget produces 0 estimated savings without error');
}

// 6. Over-Budget Requisition (no suppliers compliant)
async function testOverBudget() {
  const result = await compareQuotes(null, 100, 3000, 'balanced');
  assert(result.compliantCount === 0, 'All suppliers disqualified when budget too low');
  assert(result.recommendation.selectedSupplierId === null, 'No supplier selected when 0 compliant');
}

async function runAll() {
  await testStandardRequisition();
  await testZeroBudget();
  await testOverBudget();
  console.log(`\n=== SUMMARY: ${passed} PASSED, ${failed} FAILED ===`);
  if (failed > 0) process.exit(1);
}

runAll();

