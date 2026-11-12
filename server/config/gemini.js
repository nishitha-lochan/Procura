import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const apiKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : '';
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

export const isGeminiConfigured = Boolean(
  apiKey &&
  apiKey.length > 10 &&
  !apiKey.includes('your_gemini_api_key')
);

export const genAI = isGeminiConfigured ? new GoogleGenAI({ apiKey }) : null;

