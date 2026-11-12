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
 * Safely reads a JSON file, returning defaultValue if the file does not exist or has invalid JSON.
 */
export async function readJsonFile(filePath, defaultValue = []) {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return defaultValue;
    }
    console.error(`Error reading ${filePath}:`, error.message);
    return defaultValue;
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
