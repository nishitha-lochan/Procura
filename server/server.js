import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import suppliersRouter from './routes/suppliers.js';
import ledgerRouter from './routes/ledger.js';
import agentRouter from './routes/agent.js';
import paypalRouter from './routes/paypal.js';
import { reconcileLedgerAndOrders } from './services/paypalService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from server directory
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 5000;

// Build list of allowed origins
const defaultLocalOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
];

// Support comma-separated CLIENT_URL origins (e.g. "https://procura.vercel.app,https://procura-preview.vercel.app")
const configuredClientUrls = (process.env.CLIENT_URL || '')
  .split(',')
  .map(url => url.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const allowedOrigins = Array.from(new Set([...defaultLocalOrigins, ...configuredClientUrls]));

// Enable CORS with strict origin validation (no wildcards)
app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (e.g. curl, Render health checks, server-to-server) without Origin header
    if (!origin) return callback(null, true);
    
    const cleanOrigin = origin.trim().replace(/\/+$/, '');
    if (allowedOrigins.some(allowed => allowed.toLowerCase() === cleanOrigin.toLowerCase())) {
      return callback(null, true);
    }
    
    console.warn(`[CORS Blocked] Origin not allowed: ${origin}`);
    return callback(new Error(`CORS policy: Origin ${origin} is not allowed`));
  },
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

export default app;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, async () => {
    console.log(`🚀 Procura Server listening on http://localhost:${PORT}`);
    try {
      const recovery = await reconcileLedgerAndOrders();
      if (recovery.reconciledCount > 0) {
        console.log(`[Auto-Recovery] Reconciled ${recovery.reconciledCount} missing transaction record(s).`);
      }
    } catch (recErr) {
      console.warn(`[Auto-Recovery Notice]:`, recErr.message);
    }
  });
}
