import path from 'path';
import { fileURLToPath } from 'url';
import { readJsonFile } from '../utils/storage.js';
import {
  calculateLandedCost,
  calculateEstimatedSavings,
  calculateCostScore,
  calculateRatingScore,
  calculateSpeedScore,
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
 */
export async function getQuotes(category = 'chairs') {
  const suppliers = await readJsonFile(SUPPLIERS_FILE, []);
  if (!category || category === 'all') {
    return suppliers;
  }
  const cleanCat = category.toLowerCase();
  let targetCategory = cleanCat;

  if (cleanCat.includes('chair') || cleanCat.includes('furniture') || cleanCat.includes('seating')) {
    targetCategory = 'chairs';
  } else if (cleanCat.includes('laptop') || cleanCat.includes('computer') || cleanCat.includes('pc') || cleanCat.includes('hardware')) {
    targetCategory = 'laptops';
  } else if (cleanCat.includes('webcam') || cleanCat.includes('camera') || cleanCat.includes('av') || cleanCat.includes('video')) {
    targetCategory = 'webcams';
  } else if (cleanCat.includes('desk') || cleanCat.includes('standing') || cleanCat.includes('table') || cleanCat.includes('workstation')) {
    targetCategory = 'desks';
  }

  const filtered = suppliers.filter(s => 
    s.category.toLowerCase() === targetCategory ||
    s.product.toLowerCase().includes(cleanCat)
  );

  return filtered.length > 0 ? filtered : suppliers.slice(0, 3);
}

/**
 * Heuristic fallback requirement extractor (used when LLM requires baseline or offline).
 */
export function extractRequirements(text = '') {
  const clean = text.toLowerCase();
  
  // Extract item name & category
  let item = 'Ergonomic Office Chair';
  let category = 'chairs';
  let defaultBudget = 5000;
  let defaultQty = 100;

  if (clean.includes('laptop') || clean.includes('thinkpad') || clean.includes('dell')) {
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

  // Extract quantity (e.g. "100 chairs", "need 25 laptops")
  let quantity = defaultQty;
  const qtyMatch = clean.match(/(\d+)\s*(units?|chairs?|items?|pieces?|desks?|laptops?|cameras?|webcams?)?/i);
  if (qtyMatch && parseInt(qtyMatch[1], 10) > 0) {
    quantity = parseInt(qtyMatch[1], 10);
  }

  // Extract budget (e.g. "$5,000", "5000 budget", "under 22000")
  let maxBudget = defaultBudget;
  const budgetMatch = clean.match(/\$?\s*([0-9,]+(\.[0-9]{2})?)\s*(dollars?|usd|budget)?/i);
  if (budgetMatch) {
    const rawVal = budgetMatch[1].replace(/,/g, '');
    const num = parseFloat(rawVal);
    // Disregard if it matched the quantity
    if (!isNaN(num) && num !== quantity && num > 100) {
      maxBudget = num;
    }
  }

  // Extract priority
  let priority = 'balanced';
  if (clean.includes('cheapest') || clean.includes('cost') || clean.includes('budget') && !clean.includes('speed')) {
    priority = 'cost';
  } else if (clean.includes('fast') || clean.includes('speed') || clean.includes('urgent') || clean.includes('quick')) {
    priority = 'speed';
  } else if (clean.includes('quality') || clean.includes('best') || clean.includes('rating') || clean.includes('premium')) {
    priority = 'quality';
  }

  return { item, category, quantity, maxBudget, priority };
}

/**
 * Deterministic multi-factor evaluation of supplier quotes.
 * Strictly separates non-compliant quotes before ranking.
 */
export async function compareQuotes(quotes = null, requestedQuantity = 100, maxBudget = 5000, priority = 'balanced') {
  const candidateQuotes = (quotes && quotes.length > 0) ? quotes : await getQuotes('furniture');
  const quantity = Math.max(1, parseInt(requestedQuantity, 10) || 1);
  const budget = parseFloat(maxBudget) || 0;

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
      q.ratingScore = calculateRatingScore(q.supplierRating);
      q.speedScore = calculateSpeedScore(q.estimatedDeliveryDays);
      q.compositeScore = calculateCompositeScore(q.costScore, q.ratingScore, q.speedScore, priority);
    });

    // Deterministic sorting
    compliantQuotes.sort(compareRankedSuppliers);

    compliantQuotes.forEach((q, idx) => {
      q.rank = idx + 1;
      q.isRecommended = (idx === 0);
    });
  }

  // Non-compliant suppliers get rank null and 0 scores
  nonCompliantQuotes.forEach(q => {
    q.rank = null;
    q.costScore = 0;
    q.ratingScore = calculateRatingScore(q.supplierRating);
    q.speedScore = calculateSpeedScore(q.estimatedDeliveryDays);
    q.compositeScore = 0;
    q.isRecommended = false;
  });

  const fullComparison = [...compliantQuotes, ...nonCompliantQuotes];
  const topSupplier = compliantQuotes.length > 0 ? compliantQuotes[0] : null;

  let recommendationSummary = '';
  if (topSupplier) {
    recommendationSummary = `${topSupplier.name} is recommended with the highest composite score of ${topSupplier.compositeScore}/100. ` +
      `It delivers ${quantity} units at a total landed cost of $${topSupplier.totalCost.toFixed(2)} ` +
      (budget > 0 ? `(saving $${topSupplier.estimatedSavings.toFixed(2)} against the $${budget.toFixed(2)} budget). ` : '. ') +
      `Delivery estimated in ${topSupplier.estimatedDeliveryDays} days with a ${topSupplier.supplierRating}★ supplier rating.`;
  } else {
    recommendationSummary = `No suppliers fully meet the requested requisition of ${quantity} units within the $${budget.toFixed(2)} budget. Please increase the budget or reduce the order volume.`;
  }

  return {
    success: true,
    compliantCount: compliantQuotes.length,
    totalEvaluated: analyzedQuotes.length,
    priority,
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

