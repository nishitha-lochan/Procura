import fs from 'fs/promises';
import path from 'path';

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
 * Safely writes data to a JSON file atomically.
 */
export async function writeJsonFile(filePath, data) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tempPath = `${filePath}.tmp.${Date.now()}`;
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
  await fs.rename(tempPath, filePath);
}

