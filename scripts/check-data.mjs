import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'server', 'data', 'pandals.json');
const pandals = JSON.parse(await fs.readFile(file, 'utf8'));
const errors = [];
const ids = new Set();
const names = new Set();

for (const [index, p] of pandals.entries()) {
  const row = index + 1;
  if (!p.id || ids.has(p.id)) errors.push(`row ${row}: missing or duplicate id ${p.id || '(empty)'}`);
  ids.add(p.id);
  const key = String(p.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (!key || names.has(key)) errors.push(`row ${row}: missing or duplicate normalized name ${p.name || '(empty)'}`);
  names.add(key);
  if (!p.name || !p.area || !p.district) errors.push(`row ${row}: name, area and district are required`);
  if (!Number.isFinite(Number(p.lat)) || Number(p.lat) < 21.4 || Number(p.lat) > 27.3) errors.push(`row ${row}: latitude out of West Bengal bounds`);
  if (!Number.isFinite(Number(p.lng)) || Number(p.lng) < 85.5 || Number(p.lng) > 89.9) errors.push(`row ${row}: longitude out of West Bengal bounds`);
  for (const key of ['sourceUrl', 'coordinateSourceUrl']) {
    if (p[key] && !/^https?:\/\//i.test(p[key])) errors.push(`row ${row}: ${key} must be http(s)`);
  }
}

if (errors.length) {
  console.error(`Pandal data validation failed (${errors.length} issues):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  const sourced = pandals.filter(p => p.recordStatus === 'source-listed' && p.sourceUrl).length;
  console.log(`Pandal data OK: ${pandals.length} listings, ${ids.size} unique IDs, ${names.size} unique names, ${sourced} source-listed names.`);
}
