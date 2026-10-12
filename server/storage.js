import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(here, 'data');
export const PANDALS_FILE = path.join(DATA_DIR, 'pandals.json');
export const SUGGESTIONS_FILE = path.join(DATA_DIR, 'suggestions.json');

async function ensureFile(file, initialValue) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  try { await fs.access(file); }
  catch { await fs.writeFile(file, JSON.stringify(initialValue, null, 2) + '\n', 'utf8'); }
}

export async function readJson(file, initialValue = []) {
  await ensureFile(file, initialValue);
  const raw = await fs.readFile(file, 'utf8');
  return JSON.parse(raw);
}

export async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2) + '\n', 'utf8');
  await fs.rename(temp, file);
}

export const readPandals = () => readJson(PANDALS_FILE, []);
export const writePandals = (items) => writeJson(PANDALS_FILE, items);
export const readSuggestions = () => readJson(SUGGESTIONS_FILE, []);
export const writeSuggestions = (items) => writeJson(SUGGESTIONS_FILE, items);
