import { genAI, GEMINI_MODEL, isGeminiConfigured } from '../config/gemini.js';
import { extractRequirements, getQuotes, compareQuotes } from './procurementService.js';

/**
 * Constructs the final recommendation narrative ensuring all financial metrics
 * (supplier name, landed cost, budget, savings, composite score) originate strictly
 * from deterministic backend calculations, while Gemini contributes qualitative rationale.
 */
export function buildAuthoritativeRecommendationNarrative(topSupplier, budget, qualitativeReasoning = '') {
  if (!topSupplier) {
    return 'No compliant suppliers meet the requested requisition criteria.';
  }

  const budgetNum = parseFloat(budget) || 0;
  const costStr = `$${topSupplier.totalCost.toFixed(2)}`;
  const savingsStr = topSupplier.estimatedSavings > 0
    ? ` (saving $${topSupplier.estimatedSavings.toFixed(2)} against the $${budgetNum.toFixed(2)} budget cap)`
    : '';
  const scoreStr = `${topSupplier.compositeScore}/100`;

  // Sanitize qualitative reasoning to prevent LLM price/financial hallucinations
  let cleanQualitative = (qualitativeReasoning || '')
    .replace(/\$\s*[\d,]+(?:\.\d{2})?/g, '') // strip any hallucinated dollar amounts
    .replace(/\b(?:budget|cost|price|savings|landed)\s*(?:is|of|was|at)?\s*[\d,]+(?:\.\d{2})?\b/gi, '') // strip cost statements
    .replace(/^.*?(is recommended|chosen|selected)[^.]*\.\s*/i, '') // strip redundant lead-ins
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!cleanQualitative || cleanQualitative.length < 15) {
    cleanQualitative = `It provides the strongest overall balance across commercial warranty (${topSupplier.warranty}), delivery SLA (${topSupplier.estimatedDeliveryDays} days), and ${topSupplier.riskLevel} profile.`;
  }

  return `${topSupplier.name} is recommended with the highest composite score of ${scoreStr} at an authoritative landed settlement of ${costStr}${savingsStr}. ${cleanQualitative}`;
}

/**
 * Runs the Gemini procurement agent.
 * 1. Invokes Gemini to extract structured procurement requirements (item, quantity, budget, priority).
 * 2. Invokes deterministic quote retrieval and multi-factor comparison engine.
 * 3. Invokes Gemini to synthesize qualitative operational risk and trade-off analysis.
 * Gracefully falls back to deterministic copilot if Gemini is unconfigured or rate-limited.
 */
export async function runProcurementAgent(userPrompt) {
  // If Gemini API is not configured, run deterministic simulation copilot
  if (!isGeminiConfigured || !genAI) {
    return runDeterministicFallback(userPrompt, "Gemini API key not configured. Running in deterministic Copilot mode.");
  }

  const toolTrace = [];
  const modelToUse = GEMINI_MODEL || 'gemini-3.1-flash-lite';

  try {
    // Turn 1: AI Tool - Extract Requisition Criteria using Gemini
    toolTrace.push({
      turn: 1,
      tool: "extract_procurement_requirements",
      args: { prompt: userPrompt }
    });

    let requirements;
    try {
      const extractionResponse = await genAI.models.generateContent({
        model: modelToUse,
        contents: `Extract procurement requirements from this buyer requisition: "${userPrompt}"`,
        config: {
          temperature: 0.1,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              item: { type: "STRING", description: "Standardized product name" },
              category: { type: "STRING", description: "Product category: chairs, laptops, webcams, or desks" },
              quantity: { type: "INTEGER", description: "Requested quantity" },
              maxBudget: { type: "NUMBER", description: "Target budget cap in USD" },
              priority: { 
                type: "STRING", 
                enum: ["cost", "speed", "quality", "balanced"],
                description: "Optimization priority" 
              }
            },
            required: ["item", "quantity", "maxBudget"]
          }
        }
      });

      const parsed = JSON.parse(extractionResponse.text);
      requirements = {
        item: parsed.item || "Enterprise Equipment",
        category: parsed.category || "chairs",
        quantity: parseInt(parsed.quantity, 10) || 100,
        maxBudget: parseFloat(parsed.maxBudget) || 5000,
        priority: parsed.priority || "balanced"
      };
    } catch (parseErr) {
      console.warn('[Gemini Extraction Fallback]:', parseErr.message);
      requirements = extractRequirements(userPrompt);
    }

    // Turn 2: Deterministic Tool - Retrieve Supplier Quotes for targeted category
    const targetCategory = requirements.category || requirements.item || 'chairs';
    toolTrace.push({
      turn: 2,
      tool: "get_supplier_quotes",
      args: { category: targetCategory }
    });
    const quotes = await getQuotes(targetCategory);

    // Turn 3: Deterministic Tool - Multi-Factor Comparative Scoring
    toolTrace.push({
      turn: 3,
      tool: "compare_supplier_quotes",
      args: requirements
    });
    const comparisonResult = await compareQuotes(
      quotes,
      requirements.quantity,
      requirements.maxBudget,
      requirements.priority
    );

    const topSupplier = comparisonResult.recommendation?.topQuote;

    // Turn 4: AI Agent - Cognitive Comparative Reasoning & Risk Analysis
    toolTrace.push({
      turn: 4,
      tool: "reason_supplier_tradeoffs_and_risks",
      args: {
        candidateCount: quotes.length,
        recommendedSupplier: topSupplier?.name || "None",
        evaluationDimensions: ["Price", "Delivery SLA", "Warranty", "Stock Availability", "Risk Level"]
      }
    });

    let narrativeText = comparisonResult.recommendation.summary;
    let supplierRisks = [];

    // Construct deterministic baseline risks
    comparisonResult.comparison.forEach((s) => {
      const isTop = topSupplier && s.supplierId === topSupplier.supplierId;
      const reasons = s.disqualificationReasons?.length > 0
        ? s.disqualificationReasons.join('. ')
        : (s.riskFactors || `${s.riskLevel} - Standard supplier lead times apply.`);
      
      supplierRisks.push({
        supplierId: s.supplierId,
        supplierName: s.name,
        isRecommended: isTop,
        riskLevel: s.riskLevel || (s.isCompliant ? 'Low Risk' : 'High Risk'),
        riskSummary: reasons
      });
    });

    if (topSupplier) {
      try {
        const reasoningPrompt = `You are Procura, an expert B2B procurement and financial risk architect.
Analyze the following supplier quotation data for ${requirements.quantity} units of ${requirements.item} with budget $${requirements.maxBudget.toFixed(2)}:
${JSON.stringify(comparisonResult.comparison.map(c => ({
  id: c.supplierId,
  name: c.name,
  unitPrice: c.unitPrice,
  shipping: c.shippingCost,
  totalLandedCost: c.totalCost,
  deliveryDays: c.estimatedDeliveryDays,
  rating: c.supplierRating,
  warranty: c.warranty,
  stockStatus: c.stockStatus,
  riskLevel: c.riskLevel,
  disqualificationReasons: c.disqualificationReasons
})), null, 2)}

Provide:
1. An executive qualitative rationale (2 sentences) explaining why ${topSupplier.name} was chosen over competitors across Delivery SLA, Warranty Coverage, Stock Cushion, and Operational Risk. Do not include dollar amounts or financial calculations.
2. Explicit operational/financial risk analysis for each supplier (especially explaining why the non-recommended suppliers pose higher operational or supply chain risk).`;

        const reasoningResponse = await genAI.models.generateContent({
          model: modelToUse,
          contents: reasoningPrompt,
          config: {
            temperature: 0.2,
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                executiveRecommendation: { type: "STRING" },
                supplierRisks: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      supplierId: { type: "STRING" },
                      supplierName: { type: "STRING" },
                      riskLevel: { type: "STRING" },
                      riskSummary: { type: "STRING" }
                    },
                    required: ["supplierId", "riskSummary"]
                  }
                }
              },
              required: ["executiveRecommendation", "supplierRisks"]
            }
          }
        });

        if (reasoningResponse.text) {
          const parsedReasoning = JSON.parse(reasoningResponse.text);
          if (parsedReasoning.executiveRecommendation) {
            narrativeText = buildAuthoritativeRecommendationNarrative(
              topSupplier,
              requirements.maxBudget,
              parsedReasoning.executiveRecommendation
            );
          }
          if (parsedReasoning.supplierRisks && Array.isArray(parsedReasoning.supplierRisks)) {
            // Merge with deterministic supplier list
            supplierRisks = comparisonResult.comparison.map(c => {
              const matched = parsedReasoning.supplierRisks.find(r => r.supplierId === c.supplierId);
              return {
                supplierId: c.supplierId,
                supplierName: c.name,
                isRecommended: topSupplier && c.supplierId === topSupplier.supplierId,
                riskLevel: c.riskLevel || (c.isCompliant ? 'Low Risk' : 'High Risk'),
                riskSummary: matched?.riskSummary || c.riskFactors || c.disqualificationReasons?.join('. ') || 'Standard operational profile.'
              };
            });
          }
        }
      } catch (reasoningErr) {
        console.warn('[Gemini Reasoning Notice]:', reasoningErr.message);
      }
    }

    // Synchronize recommendation summary with authoritative narrative
    const finalRecommendation = {
      ...comparisonResult.recommendation,
      summary: narrativeText
    };

    return {
      success: true,
      agentMode: 'GEMINI_AUTONOMOUS',
      modelUsed: modelToUse,
      recommendationText: narrativeText,
      supplierRisks,
      requirements,
      comparison: comparisonResult.comparison,
      recommendation: finalRecommendation,
      toolTrace,
      totalTurns: 4
    };

  } catch (error) {
    console.warn('[Gemini API Warning]:', error.message);
    const friendlyNotice = error.message?.includes('503') || error.message?.includes('high demand')
      ? "Gemini model is currently experiencing temporary high traffic. ProcurePal seamlessly engaged its deterministic Copilot engine."
      : `Gemini notice (${error.message?.slice(0, 80)}...). Seamlessly switched to deterministic Copilot mode.`;
    return runDeterministicFallback(userPrompt, friendlyNotice);
  }
}

/**
 * Deterministic fallback when Gemini is unconfigured or rate-limited.
 */
async function runDeterministicFallback(userPrompt, notice = "") {
  const requirements = extractRequirements(userPrompt);
  const targetCategory = requirements.category || 'chairs';
  const quotes = await getQuotes(targetCategory);
  const comparisonResult = await compareQuotes(
    quotes,
    requirements.quantity,
    requirements.maxBudget,
    requirements.priority
  );

  const topSupplier = comparisonResult.recommendation?.topQuote;
  const supplierRisks = comparisonResult.comparison.map(s => ({
    supplierId: s.supplierId,
    supplierName: s.name,
    isRecommended: topSupplier && s.supplierId === topSupplier.supplierId,
    riskLevel: s.riskLevel || (s.isCompliant ? 'Low Risk' : 'High Risk'),
    riskSummary: s.disqualificationReasons?.length > 0
      ? s.disqualificationReasons.join('. ')
      : (s.riskFactors || `${s.riskLevel} - Verified commercial SLA profile.`)
  }));

  const narrativeText = buildAuthoritativeRecommendationNarrative(
    topSupplier,
    requirements.maxBudget,
    topSupplier?.notes || ''
  );

  const finalRecommendation = {
    ...comparisonResult.recommendation,
    summary: narrativeText
  };

  const toolTrace = [
    { turn: 1, tool: "extract_procurement_requirements", args: { prompt: userPrompt } },
    { turn: 2, tool: "get_supplier_quotes", args: { category: targetCategory } },
    { turn: 3, tool: "compare_supplier_quotes", args: requirements },
    { turn: 4, tool: "reason_supplier_tradeoffs_and_risks", args: { mode: "deterministic_baseline" } }
  ];

  return {
    success: true,
    agentMode: 'DETERMINISTIC_COPILOT',
    notice,
    recommendationText: narrativeText,
    supplierRisks,
    requirements,
    comparison: comparisonResult.comparison,
    recommendation: finalRecommendation,
    toolTrace,
    totalTurns: 4
  };
}
