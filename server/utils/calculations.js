/**
 * Pure mathematical calculations and deterministic scoring for Procura.
 * Eliminates floating-point currency hazards by operating on integer cents for verification.
 */

/**
 * Converts a currency amount (number or string) into exact integer cents.
 * Avoids JavaScript floating-point errors (e.g. 0.1 + 0.2 !== 0.3).
 */
export function toCents(amount) {
  if (amount === undefined || amount === null) return 0;
  if (typeof amount === 'number') {
    return Math.round(amount * 100);
  }
  if (typeof amount === 'string') {
    const clean = amount.replace(/[^0-9.-]/g, '');
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : Math.round(num * 100);
  }
  return 0;
}

/**
 * Converts integer cents back to formatted dollar string (e.g. 445000 -> "4450.00").
 */
export function fromCents(cents) {
  return (cents / 100).toFixed(2);
}

/**
 * Calculates landed purchase cost in dollars: (unitPrice * quantity) + shippingCost
 */
export function calculateLandedCost(unitPrice, quantity, shippingCost = 0) {
  const itemCents = toCents(unitPrice) * quantity;
  const shippingCents = toCents(shippingCost);
  const totalCents = itemCents + shippingCents;
  return totalCents / 100;
}

/**
 * Calculates estimated savings in dollars.
 * Only positive if budget is specified (> 0) and totalCost is within budget.
 */
export function calculateEstimatedSavings(maxBudget, totalCost) {
  if (!maxBudget || maxBudget <= 0) return 0;
  const budgetCents = toCents(maxBudget);
  const costCents = toCents(totalCost);
  if (budgetCents < costCents) return 0;
  return (budgetCents - costCents) / 100;
}

/**
 * Calculates Range-Normalized Cost Score (0 to 100).
 * If all eligible suppliers offer the exact same price (max == min), assign 100.
 * Otherwise: 100 * (maxCost - cost) / (maxCost - minCost).
 */
export function calculateCostScore(cost, minEligibleCost, maxEligibleCost) {
  if (minEligibleCost === maxEligibleCost) {
    return 100.0;
  }
  const minCents = toCents(minEligibleCost);
  const maxCents = toCents(maxEligibleCost);
  const costCents = toCents(cost);

  if (maxCents === minCents) return 100.0;
  const rawScore = (100 * (maxCents - costCents)) / (maxCents - minCents);
  return Math.max(0, Math.min(100, Math.round(rawScore * 10) / 10));
}

/**
 * Normalizes supplier rating (0.0 to 5.0) to 0-100 scale.
 * Defaults missing or null rating to median 3.0.
 */
export function calculateRatingScore(rating) {
  const effectiveRating = (typeof rating === 'number' && !isNaN(rating)) ? rating : 3.0;
  const clamped = Math.max(0, Math.min(5, effectiveRating));
  return Math.round((clamped / 5.0) * 1000) / 10;
}

/**
 * Calculates speed score (0 to 100) based on estimated delivery days.
 * E.g., 2 days -> 90, 5 days -> 75, 9 days -> 55.
 */
export function calculateSpeedScore(deliveryDays) {
  const days = (typeof deliveryDays === 'number' && deliveryDays > 0) ? deliveryDays : 7;
  return Math.max(0, Math.min(100, 100 - (days * 5)));
}

/**
 * Weights and calculates final composite score based on procurement priority.
 */
export function calculateCompositeScore(costScore, ratingScore, speedScore, priority = 'balanced') {
  let wCost = 0.45;
  let wRating = 0.30;
  let wSpeed = 0.25;

  if (priority === 'cost') {
    wCost = 0.70;
    wRating = 0.15;
    wSpeed = 0.15;
  } else if (priority === 'speed') {
    wCost = 0.25;
    wRating = 0.15;
    wSpeed = 0.60;
  } else if (priority === 'quality') {
    wCost = 0.20;
    wRating = 0.60;
    wSpeed = 0.20;
  }

  const composite = (wCost * costScore) + (wRating * ratingScore) + (wSpeed * speedScore);
  return Math.round(composite * 10) / 10;
}

/**
 * Deterministic multi-factor tie-breaker.
 * 1. Higher composite score
 * 2. Lower landed cost
 * 3. Higher supplier rating
 * 4. Faster delivery days
 */
export function compareRankedSuppliers(a, b) {
  // 1. Composite score descending
  if (b.compositeScore !== a.compositeScore) {
    return b.compositeScore - a.compositeScore;
  }
  // 2. Landed cost ascending (cheaper first)
  if (a.totalCost !== b.totalCost) {
    return a.totalCost - b.totalCost;
  }
  // 3. Rating descending (higher quality first)
  if (b.supplierRating !== a.supplierRating) {
    return b.supplierRating - a.supplierRating;
  }
  // 4. Delivery days ascending (faster first)
  return a.estimatedDeliveryDays - b.estimatedDeliveryDays;
}

