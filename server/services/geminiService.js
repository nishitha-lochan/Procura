import { genAI, GEMINI_MODEL, isGeminiConfigured } from '../config/gemini.js';
import { extractRequirements, getQuotes, compareQuotes } from './procurementService.js';

/**
 * Runs the Gemini procurement agent.
 * 1. Invokes Gemini to extract structured procurement requirements (item, quantity, budget, priority).
 * 2. Invokes deterministic quote retrieval and multi-factor comparison engine.
 * 3. Invokes Gemini to synthesize the executive recommendation narrative.
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
        recommendedSupplier: topSupplier?.name,
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
1. An executive recommendation summary (2-3 sentences) explaining why ${topSupplier.name} was chosen over the competitors across Price, Delivery Time, Warranty, Stock, and Risk. Include exact landed cost $${topSupplier.totalCost.toFixed(2)} and savings $${topSupplier.estimatedSavings.toFixed(2)}.
2. Explicit operational/financial risk analysis for each supplier (especially explaining why the non-recommended suppliers pose higher risk).`;

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
            narrativeText = parsedReasoning.executiveRecommendation;
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

    return {
      success: true,
      agentMode: 'GEMINI_AUTONOMOUS',
      modelUsed: modelToUse,
      recommendationText: narrativeText,
      supplierRisks,
      requirements,
      comparison: comparisonResult.comparison,
      recommendation: comparisonResult.recommendation,
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
    recommendationText: comparisonResult.recommendation.summary,
    supplierRisks,
    requirements,
    comparison: comparisonResult.comparison,
    recommendation: comparisonResult.recommendation,
    toolTrace,
    totalTurns: 4
  };
}
