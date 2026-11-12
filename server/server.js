import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import suppliersRouter from './routes/suppliers.js';
import ledgerRouter from './routes/ledger.js';
import agentRouter from './routes/agent.js';
import paypalRouter from './routes/paypal.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from server directory
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5173'],
  credentials: true
}));

app.use(express.json());

// Health Check & Configuration Status
app.get('/api/health', (req, res) => {
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 10);
  const paypalConfigured = Boolean(
    process.env.PAYPAL_CLIENT_ID && 
    process.env.PAYPAL_CLIENT_SECRET &&
    process.env.PAYPAL_CLIENT_ID.trim().length > 10 &&
    !process.env.PAYPAL_CLIENT_ID.includes('your_paypal')
  );

  res.json({
    status: 'ONLINE',
    service: 'Procura Backend',
    timestamp: new Date().toISOString(),
    config: {
      geminiConfigured,
      geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      paypalSandboxConfigured: paypalConfigured,
      paypalClientId: paypalConfigured ? process.env.PAYPAL_CLIENT_ID : null,
      mode: paypalConfigured ? 'SANDBOX_READY' : 'SIMULATION_MODE'
    }
  });
});

// Mount Routes
app.use('/api/suppliers', suppliersRouter);
app.use('/api/ledger', ledgerRouter);
app.use('/api/agent', agentRouter);
app.use('/api/paypal', paypalRouter);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[SERVER ERROR]', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Procura Server listening on http://localhost:${PORT}`);
});
