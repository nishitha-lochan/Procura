import express from 'express';
import { runProcurementAgent } from '../services/geminiService.js';

const router = express.Router();

/**
 * POST /api/agent/procure
 * Natural language procurement requisition endpoint.
 */
router.post('/procure', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: "A natural-language procurement prompt is required. Example: 'I need 100 ergonomic office chairs within a $5,000 budget.'"
      });
    }

    const result = await runProcurementAgent(prompt.trim());
    res.json(result);
  } catch (error) {
    console.error('[Agent Route Error]:', error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to process procurement requisition."
    });
  }
});

export default router;

