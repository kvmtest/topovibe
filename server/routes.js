// routes.js — the ONLY REST surface for the client (brief §5.4).
// No new endpoints outside this table:
//   GET /api/health · /api/resolve · /api/dna · /api/heatmap · /api/grounding
import { Router } from 'express';
import { qlooWithMeta, cache, QLOO_BASE } from './qloo.js';

export const router = Router();

const bootTime = Date.now();

/** Named Qloo errors → actionable HTTP responses (brief §6 error rule). */
function sendError(res, e) {
  const status = e.status ?? 500;
  res.status(status).json({ error: e.name ?? 'Error', message: e.message });
}

const asyncWrap = (fn) => (req, res) => fn(req, res).catch((e) => sendError(res, e));

const notYet = (phase) => (req, res) =>
  res.status(501).json({
    error: 'NotImplementedYet',
    message: `This endpoint lands in ${phase} of the 7-hour plan (brief §9).`,
  });

// --- GET /api/health — boot banner self-check ---------------------------
router.get(
  '/health',
  asyncWrap(async (req, res) => {
    res.json({
      ok: true,
      service: 'topovibe',
      qlooBase: QLOO_BASE,
      keyConfigured: !!process.env.QLOO_API_KEY,
      cacheEntries: cache.size,
      uptimeSec: Math.round((Date.now() - bootTime) / 1000),
    });
  })
);

// --- GET /api/resolve?q=&types= — wraps /search (entity-ID resolution) --
router.get(
  '/resolve',
  asyncWrap(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    if (!q) return res.status(400).json({ error: 'BadRequest', message: 'q is required' });
    const params = { query: q, take: String(req.query.take ?? '10') };
    if (req.query.types) params.types = String(req.query.types);
    const { json, meta } = await qlooWithMeta('/search', params);
    const raw = Array.isArray(json?.results) ? json.results : Array.isArray(json) ? json : [];
    const hits = raw.map((h) => ({
      name: h.name,
      entity_id: h.entity_id,
      subtype: h.subtype ?? h.types?.[0],
      popularity: h.popularity,
    }));
    res.json({ results: hits, coverage: meta.coverage, query: meta.query });
  })
);

// --- GET /api/dna?city= (Phase 2) ----------------------------------------
router.get('/dna', notYet('Phase 2 (DNA panel)'));

// --- GET /api/heatmap?city=&tag= (Phase 3) --------------------------------
router.get('/heatmap', notYet('Phase 3 (heatmap)'));

// --- GET /api/grounding?city=&tag= (Phase 4) ------------------------------
router.get('/grounding', notYet('Phase 4 (Grounding Score)'));
