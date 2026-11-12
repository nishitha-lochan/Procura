import path from 'path';
import { fileURLToPath } from 'url';
import { readJsonFile } from '../utils/storage.js';
import {
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
  toCents,
  fromCents
} from '../utils/calculations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SUPPLIERS_FILE = path.join(__dirname, '../data/suppliers.json');

/**
 * Loads demo supplier catalog with intelligent category resolution.
 * Returns only matching suppliers. If no suppliers match the requested category,
 * returns an empty array to prevent irrelevant category recommendations.
 */
export async function getQuotes(category = 'chairs') {
  const suppliers = await readJsonFile(SUPPLIERS_FILE, []);
  if (!category || category === 'all') {
    return suppliers;
  }
  const cleanCat = category.toLowerCase().trim();
  let targetCategory = cleanCat;

  if (cleanCat.includes('chair') || cleanCat.includes('furniture') || cleanCat.includes('seating')) {
    targetCategory = 'chairs';
  } else if (cleanCat.includes('laptop') || cleanCat.includes('computer') || cleanCat.includes('pc') || cleanCat.includes('hardware') || cleanCat.includes('thinkpad') || cleanCat.includes('dell')) {
    targetCategory = 'laptops';
  } else if (cleanCat.includes('webcam') || cleanCat.includes('camera') || cleanCat.includes('av') || cleanCat.includes('video') || cleanCat.includes('conference')) {
    targetCategory = 'webcams';
  } else if (cleanCat.includes('desk') || cleanCat.includes('standing') || cleanCat.includes('table') || cleanCat.includes('workstation')) {
    targetCategory = 'desks';
  }

  const filtered = suppliers.filter(s => 
    s.category.toLowerCase() === targetCategory ||
    s.product.toLowerCase().includes(cleanCat)
  );

  return filtered;
}

/**
 * Robust heuristic requirement extractor (used for baseline verification or when LLM is offline).
 * Explicitly distinguishes quantity from delivery days and budget from product model numbers.
 */
export function extractRequirements(text = '') {
  const clean = text.toLowerCase().trim();
  
  // Extract item name & category
  let item = 'Ergonomic Office Chair';
  let category = 'chairs';
  let defaultBudget = 5000;
  let defaultQty = 100;

  if (clean.includes('laptop') || clean.includes('thinkpad') || clean.includes('dell') || clean.includes('computer')) {
    item = 'Enterprise Laptop';
    category = 'laptops';
    defaultBudget = 22000;
    defaultQty = 25;
  } else if (clean.includes('webcam') || clean.includes('camera') || clean.includes('conference')) {
    item = '4K Conference Camera';
    category = 'webcams';
    defaultBudget = 3500;
    defaultQty = 15;
  } else if (clean.includes('desk') || clean.includes('standing')) {
    item = 'Electric Standing Desk';
    category = 'desks';
    defaultBudget = 12000;
    defaultQty = 40;
  }

  // Extract budget first (e.g. "$5,000", "$22000", "5000 USD", "budget of 5000")
  let maxBudget = defaultBudget;
  const budgetMatch = clean.match(/(?:\$|budget\s*(?:of|is|:)?\s*\$?)\s*([0-9,]+(?:\.[0-9]{2})?)/i) ||
                      clean.match(/([0-9,]+(?:\.[0-9]{2})?)\s*(?:dollars?|usd|budget)/i);
  let matchedBudgetString = null;
  if (budgetMatch) {
    const rawVal = budgetMatch[1].replace(/,/g, '');
    const num = parseFloat(rawVal);
    if (!isNaN(num) && num > 0) {
      maxBudget = num;
      matchedBudgetString = budgetMatch[1];
    }
  }

  // Extract delivery days to prevent conflating days with quantity
  const daysMatch = clean.match(/(?:within|in|under|max)?\s*(\d+)\s*days?/i);
  const deliveryDays = daysMatch ? parseInt(daysMatch[1], 10) : null;

  // Extract quantity (e.g. "100 chairs", "need 25 laptops", "quantity: 50", "order 10")
  let quantity = defaultQty;
  const explicitQtyMatch = clean.match(/(?:need|order|procure|buy|quantity:?|volume:?)\s*(\d+)/i) ||
                           clean.match(/(\d+)\s*(?:units?|chairs?|items?|pieces?|desks?|laptops?|cameras?|webcams?|workstations?)/i);
  
  if (explicitQtyMatch) {
    const parsedQty = parseInt(explicitQtyMatch[1], 10);
    if (parsedQty > 0 && parsedQty !== deliveryDays) {
      quantity = parsedQty;
    }
  } else {
    // General number finder, ignoring budget amount and delivery days
    const numberMatches = clean.match(/\b\d+\b/g);
    if (numberMatches) {
      for (const rawNum of numberMatches) {
        const n = parseInt(rawNum, 10);
        if (n > 0 && n !== deliveryDays && n !== maxBudget && n < 10000) {
          quantity = n;
          break;
        }
      }
    }
  }

  // Extract priority
  let priority = 'balanced';
  if (clean.includes('cheapest') || clean.includes('lowest price') || clean.includes('low cost') || (clean.includes('cost') && !clean.includes('speed'))) {
    priority = 'cost';
  } else if (clean.includes('fast') || clean.includes('urgent') || clean.includes('quick') || clean.includes('speed') || clean.includes('asap')) {
    priority = 'speed';
  } else if (clean.includes('quality') || clean.includes('premium') || clean.includes('warranty') || clean.includes('reliable') || clean.includes('risk')) {
    priority = 'quality';
  }

  return { item, category, quantity, maxBudget, priority };
}

/**
 * Deterministic multi-factor evaluation of supplier quotes.
 * Strictly separates non-compliant quotes before ranking.
 * Implements transparent 5-dimensional scoring model.
 */
export async function compareQuotes(quotes = null, requestedQuantity = 100, maxBudget = 5000, priority = 'balanced') {
  const candidateQuotes = (quotes !== null && quotes !== undefined) ? quotes : await getQuotes('chairs');
  const quantity = Math.max(1, parseInt(requestedQuantity, 10) || 1);
  const budget = parseFloat(maxBudget) || 0;
  const weights = getScoringWeights(priority);

  if (candidateQuotes.length === 0) {
    return {
      success: true,
      compliantCount: 0,
      totalEvaluated: 0,
      priority,
      weights,
      requestedQuantity: quantity,
      maxBudget: budget,
      comparison: [],
      recommendation: {
        selectedSupplierId: null,
        selectedSupplierName: null,
        summary: `No suppliers found in catalog for the requested requisition. Please verify category availability (chairs, laptops, webcams, desks).`,
        topQuote: null,
        estimatedSavings: 0,
        totalAmount: 0
      }
    };
  }

  const analyzedQuotes = candidateQuotes.map(quote => {
    const totalCost = calculateLandedCost(quote.unitPrice, quantity, quote.shippingCost);
    const hasSufficientStock = (quote.availableQuantity >= quantity);
    const withinBudget = (budget <= 0) || (toCents(totalCost) <= toCents(budget));

    const disqualificationReasons = [];
    if (!hasSufficientStock) {
      disqualificationReasons.push(`Insufficient stock: ${quote.availableQuantity} available vs ${quantity} requested`);
    }
    if (!withinBudget) {
      disqualificationReasons.push(`Exceeds budget: total landed cost $${totalCost.toFixed(2)} exceeds $${budget.toFixed(2)}`);
    }

    const isCompliant = hasSufficientStock && withinBudget;
    const estimatedSavings = isCompliant ? calculateEstimatedSavings(budget, totalCost) : 0;

    return {
      ...quote,
      requestedQuantity: quantity,
      maxBudget: budget,
      totalCost,
      withinBudget,
      hasSufficientStock,
      isCompliant,
      disqualificationReasons,
      estimatedSavings
    };
  });

  // Separate compliant vs non-compliant
  const compliantQuotes = analyzedQuotes.filter(q => q.isCompliant);
  const nonCompliantQuotes = analyzedQuotes.filter(q => !q.isCompliant);

  // If compliant suppliers exist, compute range-normalized scores
  if (compliantQuotes.length > 0) {
    const costs = compliantQuotes.map(q => q.totalCost);
    const minCost = Math.min(...costs);
    const maxCost = Math.max(...costs);

    compliantQuotes.forEach(q => {
      q.costScore = calculateCostScore(q.totalCost, minCost, maxCost);
      q.speedScore = calculateSpeedScore(q.estimatedDeliveryDays);
      q.warrantyScore = calculateWarrantyScore(q.warranty);
      q.stockScore = calculateStockCushionScore(q.availableQuantity, quantity);
      q.riskScore = calculateRiskScore(q.riskLevel, q.supplierRating);
      q.ratingScore = calculateRatingScore(q.supplierRating); // backward compat
      q.compositeScore = calculateCompositeScore(
        q.costScore,
        q.speedScore,
        q.warrantyScore,
        q.stockScore,
        q.riskScore,
        priority
      );
      q.scoreBreakdown = {
        costScore: q.costScore,
        speedScore: q.speedScore,
        warrantyScore: q.warrantyScore,
        stockScore: q.stockScore,
        riskScore: q.riskScore,
        compositeScore: q.compositeScore,
        weights
      };
    });

    // Deterministic multi-factor sorting
    compliantQuotes.sort(compareRankedSuppliers);

    compliantQuotes.forEach((q, idx) => {
      q.rank = idx + 1;
      q.isRecommended = (idx === 0);
    });
  }

  // Non-compliant suppliers receive rank null and 0 scores
  nonCompliantQuotes.forEach(q => {
    q.rank = null;
    q.costScore = 0;
    q.speedScore = calculateSpeedScore(q.estimatedDeliveryDays);
    q.warrantyScore = calculateWarrantyScore(q.warranty);
    q.stockScore = 0;
    q.riskScore = calculateRiskScore(q.riskLevel, q.supplierRating);
    q.ratingScore = calculateRatingScore(q.supplierRating);
    q.compositeScore = 0;
    q.isRecommended = false;
    q.scoreBreakdown = {
      costScore: 0,
      speedScore: q.speedScore,
      warrantyScore: q.warrantyScore,
      stockScore: 0,
      riskScore: q.riskScore,
      compositeScore: 0,
      weights
    };
  });

  const fullComparison = [...compliantQuotes, ...nonCompliantQuotes];
  const topSupplier = compliantQuotes.length > 0 ? compliantQuotes[0] : null;

  let recommendationSummary = '';
  if (topSupplier) {
    recommendationSummary = `${topSupplier.name} is recommended with the highest composite score of ${topSupplier.compositeScore}/100 ` +
      `across 5 evaluation dimensions (Cost: ${topSupplier.costScore}, Speed: ${topSupplier.speedScore}, Warranty: ${topSupplier.warrantyScore}, Stock: ${topSupplier.stockScore}, Risk: ${topSupplier.riskScore}). ` +
      `It delivers ${quantity} units at an authoritative landed cost of $${topSupplier.totalCost.toFixed(2)} ` +
      (budget > 0 ? `(saving $${topSupplier.estimatedSavings.toFixed(2)} against the $${budget.toFixed(2)} budget cap). ` : '. ') +
      `Delivery estimated in ${topSupplier.estimatedDeliveryDays} days with a ${topSupplier.warranty} and ${topSupplier.riskLevel} operational profile.`;
  } else {
    recommendationSummary = `No suppliers fully meet the requested requisition of ${quantity} units within the $${budget.toFixed(2)} budget cap. Please increase the budget or reduce the order volume.`;
  }

  return {
    success: true,
    compliantCount: compliantQuotes.length,
    totalEvaluated: analyzedQuotes.length,
    priority,
    weights,
    requestedQuantity: quantity,
    maxBudget: budget,
    comparison: fullComparison,
    recommendation: {
      selectedSupplierId: topSupplier ? topSupplier.supplierId : null,
      selectedSupplierName: topSupplier ? topSupplier.name : null,
      summary: recommendationSummary,
      topQuote: topSupplier,
      estimatedSavings: topSupplier ? topSupplier.estimatedSavings : 0,
      totalAmount: topSupplier ? topSupplier.totalCost : 0
    }
  };
}
