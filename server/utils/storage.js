import fs from 'fs/promises';
import path from 'path';

/**
 * In-memory asynchronous mutex to prevent concurrent file write race conditions.
 */
class FileMutex {
  constructor() {
    this.mutexes = new Map();
  }

  async acquire(key) {
    while (this.mutexes.has(key)) {
      await this.mutexes.get(key);
    }
    let release;
    const promise = new Promise((resolve) => {
      release = resolve;
    });
    this.mutexes.set(key, promise);
    return () => {
      this.mutexes.delete(key);
      release();
    };
  }
}

export const fileMutex = new FileMutex();

/**
 * Safely reads a JSON file.
 * Returns defaultValue only when the file does not exist (ENOENT).
 * Fails visibly on JSON syntax corruption or read errors to prevent silent data loss.
 */
export async function readJsonFile(filePath, defaultValue = []) {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return defaultValue;
    }
    if (error instanceof SyntaxError) {
      const corruptErr = new Error(`Critical JSON integrity error: Corrupted or malformed file at ${filePath}. Parse failed: ${error.message}`);
      corruptErr.code = 'CORRUPTED_JSON_FILE';
      console.error(`[STORAGE INTEGRITY ERROR] ${corruptErr.message}`);
      throw corruptErr;
    }
    console.error(`Error reading ${filePath}:`, error.message);
    throw error;
  }
}

/**
 * Safely writes data to a JSON file atomically with file locking.
 */
export async function writeJsonFile(filePath, data) {
  const release = await fileMutex.acquire(filePath);
  try {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    const tempPath = `${filePath}.tmp.${Date.now()}.${Math.floor(Math.random() * 10000)}`;
    await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rename(tempPath, filePath);
  } finally {
    release();
  }
}
