import express from 'express';
import { getQuotes } from '../services/procurementService.js';

const router = express.Router();

// GET /api/suppliers - Retrieve demo supplier catalog
router.get('/', async (req, res) => {
  try {
    const { category } = req.query;
    const quotes = await getQuotes(category);
    res.json({
      success: true,
      data: quotes,
      disclaimer: "DEMO DATA: Quotations are predefined for hackathon demonstration purposes."
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

