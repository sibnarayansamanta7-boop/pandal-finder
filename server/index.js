import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  DATA_DIR, PANDALS_FILE, readPandals, writePandals,
  readSuggestions, writeSuggestions
} from './storage.js';

const app = express();
const PORT = Number(process.env.PORT || 3001);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const AREAS_FILE = path.join(DATA_DIR, 'area-centres.json');

app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

const cleanText = (value, max = 180) => String(value ?? '').trim().replace(/[<>\u0000-\u001f]/g, '').slice(0, max);
const validCoordinate = (n, min, max) => Number.isFinite(Number(n)) && Number(n) >= min && Number(n) <= max;
const cleanHttpUrl = (value) => {
  const raw = cleanText(value, 500);
  if (!raw) return '';
  try { const parsed = new URL(raw); return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : ''; }
  catch { return ''; }
};
const createId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const fail = (res, status, message) => res.status(status).json({ error: message });

function validatePandal(input, { partial = false } = {}) {
  const errors = [];
  const fields = {};
  for (const key of ['name', 'area', 'district', 'theme']) {
    const max = key === 'theme' ? 240 : 140;
    if (input[key] !== undefined || !partial) fields[key] = cleanText(input[key], max);
    if (!partial && ['name', 'area', 'district'].includes(key) && !fields[key]) errors.push(`${key} is required`);
    if (input[key] !== undefined && !fields[key] && key !== 'theme') errors.push(`${key} cannot be empty`);
  }
  if (!partial || input.lat !== undefined) {
    if (!validCoordinate(input.lat, 21.4, 27.3)) errors.push('lat must be a valid West Bengal latitude between 21.4 and 27.3');
    else fields.lat = Number(input.lat);
  }
  if (!partial || input.lng !== undefined) {
    if (!validCoordinate(input.lng, 85.5, 89.9)) errors.push('lng must be a valid West Bengal longitude between 85.5 and 89.9');
    else fields.lng = Number(input.lng);
  }
  if (input.locationPrecision !== undefined) fields.locationPrecision = input.locationPrecision === 'landmark-level' ? 'landmark-level' : 'approximate';
  if (input.seasonStatus !== undefined) fields.seasonStatus = ['confirmed', 'unconfirmed', 'closed'].includes(input.seasonStatus) ? input.seasonStatus : 'unconfirmed';
  if (input.sourceNote !== undefined) fields.sourceNote = cleanText(input.sourceNote, 300);
  if (input.recordStatus !== undefined) fields.recordStatus = ['source-listed', 'community-submitted', 'unverified'].includes(input.recordStatus) ? input.recordStatus : 'unverified';
  if (input.sourceLabel !== undefined) fields.sourceLabel = cleanText(input.sourceLabel, 120);
  for (const key of ['sourceUrl', 'coordinateSourceUrl']) {
    if (input[key] !== undefined) {
      const raw = cleanText(input[key], 500);
      const cleaned = cleanHttpUrl(raw);
      if (raw && !cleaned) errors.push(`${key} must be an http or https URL`);
      else fields[key] = cleaned;
    }
  }
  return { errors, fields };
}

function requireAdmin(req, res, next) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected || expected === 'replace-this-with-a-long-random-secret') {
    return fail(res, 503, 'Admin API is disabled. Set a strong ADMIN_TOKEN in your .env file and restart the server.');
  }
  const provided = req.get('x-admin-token') || req.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!provided || provided !== expected) return fail(res, 401, 'A valid admin token is required.');
  return next();
}

app.get('/api/health', async (_req, res, next) => {
  try {
    const pandals = await readPandals();
    res.json({ ok: true, service: 'pandal-finder-api', pandalCount: pandals.length, version: '1.1.0' });
  } catch (error) { next(error); }
});

app.get('/api/areas', async (_req, res, next) => {
  try {
    const areas = JSON.parse(await fs.promises.readFile(AREAS_FILE, 'utf8'));
    res.json({ areas });
  } catch (error) { next(error); }
});

app.get('/api/pandals', async (req, res, next) => {
  try {
    const query = cleanText(req.query.q, 120).toLowerCase();
    const district = cleanText(req.query.district, 100).toLowerCase();
    const pandals = await readPandals();
    const filtered = pandals.filter((p) => {
      const matchesQuery = !query || `${p.name} ${p.area} ${p.theme} ${p.district}`.toLowerCase().includes(query);
      const matchesDistrict = !district || p.district.toLowerCase() === district;
      return matchesQuery && matchesDistrict;
    });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ pandals: filtered, count: filtered.length, total: pandals.length });
  } catch (error) { next(error); }
});

app.get('/api/pandals/:id', async (req, res, next) => {
  try {
    const item = (await readPandals()).find((p) => p.id === req.params.id);
    if (!item) return fail(res, 404, 'Pandal not found');
    res.json({ pandal: item });
  } catch (error) { next(error); }
});

// Public submissions enter a review queue; they do not immediately become public map pins.
app.post('/api/suggestions', async (req, res, next) => {
  try {
    const input = req.body || {};
    const name = cleanText(input.name, 140);
    const area = cleanText(input.area, 140);
    const district = cleanText(input.district, 100);
    const note = cleanText(input.note, 600);
    const email = cleanText(input.email, 160);
    const errors = [];
    if (!name) errors.push('Pandal name is required');
    if (!area) errors.push('Area or locality is required');
    if (!district) errors.push('District is required');
    if (name.length < 3) errors.push('Pandal name must have at least 3 characters');
    if (errors.length) return res.status(400).json({ error: errors.join('. ') });
    let coordinates = null;
    if (input.lat !== undefined || input.lng !== undefined) {
      if (!validCoordinate(input.lat, 21.4, 27.3) || !validCoordinate(input.lng, 85.5, 89.9)) {
        return fail(res, 400, 'Coordinates must be a valid latitude and longitude in West Bengal.');
      }
      coordinates = { lat: Number(input.lat), lng: Number(input.lng) };
    }
    const suggestions = await readSuggestions();
    const suggestion = {
      id: createId('suggestion'), name, area, district,
      theme: cleanText(input.theme, 240), note, email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '',
      coordinates, status: 'pending', createdAt: new Date().toISOString()
    };
    suggestions.unshift(suggestion);
    await writeSuggestions(suggestions);
    res.status(201).json({ message: 'Thanks! Your suggestion was saved for review.', suggestion: { id: suggestion.id, status: suggestion.status } });
  } catch (error) { next(error); }
});

// Admin routes: use X-Admin-Token: <ADMIN_TOKEN>. Do not expose this token in frontend code.
app.get('/api/admin/suggestions', requireAdmin, async (_req, res, next) => {
  try { res.json({ suggestions: await readSuggestions() }); }
  catch (error) { next(error); }
});

app.patch('/api/admin/suggestions/:id', requireAdmin, async (req, res, next) => {
  try {
    const suggestions = await readSuggestions();
    const index = suggestions.findIndex((s) => s.id === req.params.id);
    if (index < 0) return fail(res, 404, 'Suggestion not found');
    const status = req.body?.status;
    if (!['pending', 'approved', 'rejected'].includes(status)) return fail(res, 400, 'status must be pending, approved or rejected');
    const suggestion = suggestions[index];
    if (status === 'approved') {
      const candidate = { name: suggestion.name, area: suggestion.area, district: suggestion.district, theme: suggestion.theme, ...(req.body || {}) };
      const validated = validatePandal(candidate);
      if (validated.errors.length) return fail(res, 400, `To approve, provide valid coordinates. ${validated.errors.join('; ')}`);
      const pandals = await readPandals();
      if (pandals.some((p) => p.name.toLowerCase() === validated.fields.name.toLowerCase() && p.area.toLowerCase() === validated.fields.area.toLowerCase())) {
        return fail(res, 409, 'A pandal with this name and area already exists.');
      }
      pandals.push({ id: createId('pandal'), ...validated.fields, locationPrecision: 'approximate', seasonStatus: 'unconfirmed', recordStatus: 'community-submitted', sourceNote: 'Community submission approved by an administrator; verify pin and current operation locally.' });
      await writePandals(pandals);
    }
    suggestions[index] = { ...suggestion, status, reviewedAt: new Date().toISOString() };
    await writeSuggestions(suggestions);
    res.json({ message: `Suggestion ${status}.`, suggestion: suggestions[index] });
  } catch (error) { next(error); }
});

app.post('/api/admin/pandals', requireAdmin, async (req, res, next) => {
  try {
    const { errors, fields } = validatePandal(req.body || {});
    if (errors.length) return fail(res, 400, errors.join('; '));
    const pandals = await readPandals();
    if (pandals.some((p) => p.name.toLowerCase() === fields.name.toLowerCase() && p.area.toLowerCase() === fields.area.toLowerCase())) {
      return fail(res, 409, 'A pandal with this name and area already exists.');
    }
    const pandal = { id: createId('pandal'), ...fields, locationPrecision: fields.locationPrecision || 'approximate', seasonStatus: fields.seasonStatus || 'unconfirmed', recordStatus: fields.recordStatus || 'unverified', sourceNote: fields.sourceNote || 'Added by administrator; verify locally before travel.' };
    pandals.push(pandal);
    await writePandals(pandals);
    res.status(201).json({ pandal, total: pandals.length });
  } catch (error) { next(error); }
});

app.patch('/api/admin/pandals/:id', requireAdmin, async (req, res, next) => {
  try {
    const pandals = await readPandals();
    const index = pandals.findIndex((p) => p.id === req.params.id);
    if (index < 0) return fail(res, 404, 'Pandal not found');
    const { errors, fields } = validatePandal(req.body || {}, { partial: true });
    if (errors.length) return fail(res, 400, errors.join('; '));
    pandals[index] = { ...pandals[index], ...fields };
    await writePandals(pandals);
    res.json({ pandal: pandals[index] });
  } catch (error) { next(error); }
});

app.delete('/api/admin/pandals/:id', requireAdmin, async (req, res, next) => {
  try {
    const pandals = await readPandals();
    const filtered = pandals.filter((p) => p.id !== req.params.id);
    if (filtered.length === pandals.length) return fail(res, 404, 'Pandal not found');
    await writePandals(filtered);
    res.json({ message: 'Pandal deleted.', total: filtered.length });
  } catch (error) { next(error); }
});

if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR, { maxAge: '1h' }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => res.status(200).send('Pandal Finder API is running. Start the React frontend with `npm run dev` or build with `npm run build`.'));
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error. Check the server terminal for details.' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Pandal Finder API ready at http://localhost:${PORT}`);
  console.log(`Data file: ${PANDALS_FILE}`);
});
