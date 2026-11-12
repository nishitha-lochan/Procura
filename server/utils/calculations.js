/**
 * Pure mathematical calculations and deterministic scoring for Procura.
 * Eliminates floating-point currency hazards by operating on integer cents for verification.
 * Implements a transparent 5-dimensional supplier evaluation model:
 * 1. Landed Cost
 * 2. Delivery SLA / Speed
 * 3. Warranty Coverage
 * 4. Stock Availability Cushion
 * 5. Operational Risk
 */

/**
 * Converts a currency amount (number or string) into exact integer cents.
 * Avoids JavaScript floating-point errors (e.g. 0.1 + 0.2 !== 0.3).
 */
export function toCents(amount) {
  if (amount === undefined || amount === null) return 0;
  if (typeof amount === 'number') {
    if (isNaN(amount) || !isFinite(amount)) return 0;
    return Math.round(amount * 100);
  }
  if (typeof amount === 'string') {
    const clean = amount.replace(/[^0-9.-]/g, '');
    const num = parseFloat(clean);
    return isNaN(num) || !isFinite(num) ? 0 : Math.round(num * 100);
  }
  return 0;
}

/**
 * Converts integer cents back to formatted dollar string (e.g. 445000 -> "4450.00").
 */
export function fromCents(cents) {
  if (typeof cents !== 'number' || isNaN(cents)) return "0.00";
  return (cents / 100).toFixed(2);
}

/**
 * Strict positive integer validation.
 * Rejects decimals (e.g. 2.5), malformed alphanumeric strings (e.g. "10abc"), zero, negatives, NaN, and infinity.
 */
export function isStrictPositiveInteger(val) {
  if (val === null || val === undefined) return false;
  if (typeof val === 'number') {
    return Number.isInteger(val) && val > 0 && isFinite(val);
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!/^\d+$/.test(trimmed)) return false;
    const num = Number(trimmed);
    return Number.isInteger(num) && num > 0 && isFinite(num);
  }
  return false;
}

/**
 * Calculates landed purchase cost in dollars: (unitPrice * quantity) + shippingCost
 */
export function calculateLandedCost(unitPrice, quantity, shippingCost = 0) {
  const safeQty = Math.max(0, parseInt(quantity, 10) || 0);
  const itemCents = toCents(unitPrice) * safeQty;
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
 * Dimension 1: Range-Normalized Cost Score (0 to 100).
 * If all eligible suppliers offer the exact same price (max == min), assign 100.
 * Otherwise: 100 * (maxCost - cost) / (maxCost - minCost).
 */
export function calculateCostScore(cost, minEligibleCost, maxEligibleCost) {
  const minCents = toCents(minEligibleCost);
  const maxCents = toCents(maxEligibleCost);
  const costCents = toCents(cost);

  if (minCents === maxCents) {
    return 100.0;
  }
  if (costCents <= minCents) return 100.0;
  if (costCents >= maxCents) return 0.0;

  const rawScore = (100 * (maxCents - costCents)) / (maxCents - minCents);
  return Math.max(0, Math.min(100, Math.round(rawScore * 10) / 10));
}

/**
 * Dimension 2: Delivery Speed / SLA Score (0 to 100).
 * Based on estimated delivery calendar days. E.g., 2 days -> 90, 5 days -> 75, 9 days -> 55.
 */
export function calculateSpeedScore(deliveryDays) {
  const days = (typeof deliveryDays === 'number' && !isNaN(deliveryDays) && deliveryDays > 0) ? deliveryDays : 7;
  return Math.max(0, Math.min(100, Math.round((100 - (days * 5)) * 10) / 10));
}

/**
 * Dimension 3: Warranty Coverage Score (0 to 100).
 * Parses warranty duration from text (e.g. "5-Year Commercial Warranty", "1-Year Standard", "Lifetime").
 */
export function calculateWarrantyScore(warranty) {
  if (!warranty || typeof warranty !== 'string') return 20.0;
  const clean = warranty.toLowerCase().trim();

  if (clean.includes('lifetime')) return 100.0;
  if (clean.includes('no warranty') || clean.includes('none') || clean.includes('as-is')) return 0.0;

  const yearMatch = clean.match(/(\d+)\s*[- ]?year/);
  if (yearMatch) {
    const years = parseInt(yearMatch[1], 10);
    if (years >= 5) return 100.0;
    if (years === 4) return 85.0;
    if (years === 3) return 70.0;
    if (years === 2) return 55.0;
    if (years === 1) return 40.0;
    return Math.min(100, years * 20);
  }

  const monthMatch = clean.match(/(\d+)\s*[- ]?month/);
  if (monthMatch) {
    const months = parseInt(monthMatch[1], 10);
    if (months >= 12) return 40.0;
    if (months >= 6) return 30.0;
    return 20.0;
  }

  // Default neutral score for unspecified warranty
  return 30.0;
}

/**
 * Dimension 4: Stock Cushion Score (0 to 100).
 * Measures supplier inventory depth relative to requested quantity.
 * Ratio < 1.0 is disqualified (score 0).
 * Ratio 1.0 (exact match) -> 50.0.
 * Ratio >= 5.0 (5x cushion) -> 100.0.
 */
export function calculateStockCushionScore(availableQuantity, requestedQuantity) {
  const avail = Math.max(0, parseInt(availableQuantity, 10) || 0);
  const req = Math.max(1, parseInt(requestedQuantity, 10) || 1);

  if (avail < req) return 0.0;

  const ratio = avail / req;
  if (ratio >= 5.0) return 100.0;

  // Linear progression from 50 (at 1x) to 100 (at 5x)
  const score = 50.0 + ((ratio - 1.0) / 4.0) * 50.0;
  return Math.max(50, Math.min(100, Math.round(score * 10) / 10));
}

/**
 * Dimension 5: Operational Risk Score (0 to 100). Higher is better (lower risk).
 * Evaluates declared risk level ('Low', 'Medium', 'High') and blends with supplier rating.
 */
export function calculateRiskScore(riskLevel, supplierRating) {
  const clean = (riskLevel || '').toLowerCase().trim();
  let baseScore = 60.0; // default neutral / medium

  if (clean.includes('low')) {
    baseScore = 90.0;
  } else if (clean.includes('high')) {
    baseScore = 30.0;
  } else if (clean.includes('medium') || clean.includes('med')) {
    baseScore = 60.0;
  }

  // Rating adjustment: up to +/- 5 points based on supplier rating (0 - 5.0)
  const rating = (typeof supplierRating === 'number' && !isNaN(supplierRating)) ? Math.max(0, Math.min(5, supplierRating)) : 3.0;
  const ratingDelta = (rating - 3.0) * 2.5; // -7.5 to +5.0

  return Math.max(0, Math.min(100, Math.round((baseScore + ratingDelta) * 10) / 10));
}

/**
 * Normalizes supplier rating (0.0 to 5.0) to 0-100 scale.
 */
export function calculateRatingScore(rating) {
  const effectiveRating = (typeof rating === 'number' && !isNaN(rating)) ? rating : 3.0;
  const clamped = Math.max(0, Math.min(5, effectiveRating));
  return Math.round((clamped / 5.0) * 1000) / 10;
}

/**
 * Returns the exact weights for the 5 dimensions, ensuring they sum to exactly 1.0 (100%).
 */
export function getScoringWeights(priority = 'balanced') {
  switch (priority) {
    case 'cost':
      return { cost: 0.55, speed: 0.15, warranty: 0.10, stock: 0.10, risk: 0.10 };
    case 'speed':
      return { speed: 0.45, cost: 0.20, stock: 0.15, risk: 0.10, warranty: 0.10 };
    case 'quality':
      return { risk: 0.30, warranty: 0.25, cost: 0.15, speed: 0.15, stock: 0.15 };
    case 'balanced':
    default:
      return { cost: 0.35, speed: 0.20, warranty: 0.15, stock: 0.15, risk: 0.15 };
  }
}

/**
 * Weights and calculates final composite score (0 to 100) across all 5 dimensions.
 * Backward compatible: if called with 3 or 4 arguments, falls back cleanly.
 */
export function calculateCompositeScore(
  costScore,
  speedScore,
  warrantyScore = 30,
  stockScore = 50,
  riskScore = 60,
  priority = 'balanced'
) {
  // Support legacy signature: calculateCompositeScore(costScore, ratingScore, speedScore, priority)
  if (typeof warrantyScore === 'string') {
    priority = warrantyScore;
    warrantyScore = 30;
    stockScore = 50;
    riskScore = 60;
  }

  const weights = getScoringWeights(priority);

  const composite = (weights.cost * costScore) +
                    (weights.speed * speedScore) +
                    (weights.warranty * warrantyScore) +
                    (weights.stock * stockScore) +
                    (weights.risk * riskScore);

  return Math.max(0, Math.min(100, Math.round(composite * 10) / 10));
}

/**
 * Deterministic multi-factor tie-breaker.
 * 1. Higher composite score
 * 2. Lower landed cost
 * 3. Higher operational risk score (safer vendor)
 * 4. Higher supplier rating
 * 5. Faster delivery days
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
  // 3. Operational risk score descending (safer first)
  if ((b.riskScore || 0) !== (a.riskScore || 0)) {
    return (b.riskScore || 0) - (a.riskScore || 0);
  }
  // 4. Rating descending (higher quality first)
  if (b.supplierRating !== a.supplierRating) {
    return b.supplierRating - a.supplierRating;
  }
  // 5. Delivery days ascending (faster first)
  return a.estimatedDeliveryDays - b.estimatedDeliveryDays;
}
