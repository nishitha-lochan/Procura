import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const clientId = process.env.PAYPAL_CLIENT_ID ? process.env.PAYPAL_CLIENT_ID.trim() : '';
const clientSecret = process.env.PAYPAL_CLIENT_SECRET ? process.env.PAYPAL_CLIENT_SECRET.trim() : '';

export const PAYPAL_API_BASE = process.env.PAYPAL_API_BASE || 'https://api-m.sandbox.paypal.com';

export const isPayPalConfigured = Boolean(
  clientId &&
  clientSecret &&
  clientId.length > 10 &&
  clientSecret.length > 10 &&
  !clientId.includes('your_paypal')
);

export const PAYPAL_CREDENTIALS = {
  clientId,
  clientSecret,
  apiBase: PAYPAL_API_BASE
};

