# 🌍 TopoVibe — Development Brief (Build-Ready)

> **Product:** TopoVibe — the cultural-intelligence globe & MCP oracle.
> **One-liner:** Fly a 3D globe, click any city, and see what it actually *loves* — every venue scored 0–100 by the **Grounding Score**, Qloo's taste graph underneath, an MCP server on top so any AI agent can query cultural ground truth.
> **Naming system:** TopoVibe (product) · **Grounding Score** (hero metric) · **TopoVibe MCP** (agent oracle)
> **License:** MIT · **Build mode:** agentic coding · **Hard budget:** **7 hours end-to-end**
> **Lineage:** Local's Eye View v2 (see `Locals_Eye_View_v2_Hackathon_Proposal.md`) with a 7-hour scope cut. God's-Eye-View-inspired UX; **no GEV code, assets, or data copied** — clean-room build (MIT attribution note in §12 regardless).

---

## 1. Product Description

### 1.1 Problem
AI agents are culturally blind: they recommend fluent, generic, popularity-ranked "agentic slop." Meanwhile consumers are shifting toward **analog, screen-free, heritage-rooted third places**, and nobody — traveler, relocatee, promoter, or agent — can verify *"is this place loved, or just loud?"* Review sites measure popularity; LLMs hallucinate taste. Affinity questions ("which Tokyo neighborhood feels like Bushwick?") and authenticity questions ("which bar is loved, which is viral?") have no queryable engine.

### 1.2 Solution
TopoVibe grounds every answer in **Qloo's taste graph** (250M+ entities, billions of anonymized signals). The LLM/agent never invents taste — it calls Qloo and narrates verified results. On top of raw answers, TopoVibe computes the **Grounding Score (GS)**, a 0–100 proof-of-human authenticity index, rendered in a **FLIR "Grounding" style**: loved analog venues glow hot red, viral tourist traps glow cold blue.

### 1.3 Why it wins (one paragraph for the README)
Remove Qloo and TopoVibe is an empty basemap — cultural intelligence is not a feature, it is the product. It runs as a 3D globe for humans and a **first-class MCP server** for agents, answering the hackathon's brief literally: an agentic tool that only works because it knows what people love.

---

## 2. MVP Scope — the 7-Hour Cut

| # | Feature | In MVP? | Notes |
| --- | --- | --- | --- |
| 1 | CesiumJS globe, Esri keyless basemap, fly-to search | ✅ | Bundled city list + decimal-coord input; **no geocoder dependency** |
| 2 | **Cultural DNA panel** — click a demo city → signature tags + demographics + top places | ✅ | 3 Qloo calls per city; cached |
| 3 | **Cultural heatmap** — one tag over one city, draped as affinity-colored points | ✅ | `urn:heatmap` geohash grid → Cesium PointPrimitives |
| 4 | **Grounding Score engine** + GS-colored venue markers + component breakdown UI | ✅ | Hero feature — see §5.3 |
| 5 | **TopoVibe MCP server** (HTTP) with 5 tools | ✅ | The agentic requirement |
| 6 | Share links (camera + selection ⇄ URL hash) | ✅ | ~30 lines |
| 7 | Voice agent / chat UI | ❌ Post-hackathon | MCP *is* the agentic surface for v1 |
| 8 | Sister Cities (compare), Promoter Mode, trending UI | ❌ Post-hackathon | `/v2/trending` is used *internally* by GS only |
| 9 | NVG "Quiet" shader, missions, hosted accounts | ❌ Post-hackathon | GS marker-coloring delivers the FLIR effect without GLSL |

**Demo geography (coverage-verified first):** Austin, New York City, Tokyo — the three cities the Qloo docs themselves use in examples. All demo flows pre-cached (§9).

---

## 3. Technical Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  AGENTS (MCP)                          HUMANS (browser)          │
│  Claude/ChatGPT desktop · agent loops  │  TopoVibe globe (static) │
│  HTTP + JSON-RPC (MCP streamable)      │  CesiumJS + Vite build   │
└───────────────────┬────────────────────┴───────────▲─────────────┘
                    │                                 │ REST/JSON
┌───────────────────┴─────────────────────────────────┴────────────┐
│                    TopoVibe SERVER (Node.js, Express)             │
│  server/qloo.js      Qloo broker: X-Api-Key server-side,         │
│                      GET-only, in-memory cache, validity matrix   │
│  server/grounding.js Grounding Score engine (A / T / N)           │
│  server/routes.js    /api/dna · /api/heatmap · /api/grounding ·   │
│                      /api/resolve · /api/health                   │
│  server/mcp.js       MCP endpoint: 5 tools (§6)                   │
│  server/cache.js     TTL cache + demo pre-cache loader            │
└───────────────────┬───────────────────────────────────────────────┘
                    │ GET, query string, X-Api-Key
┌───────────────────┴───────────────────────────────────────────────┐
│        Qloo API — https://hackathon.api.qloo.com                  │
│  /search · /v2/tags · /v2/insights · /v2/trending                 │
└───────────────────────────────────────────────────────────────────┘
```

**Principles:** Qloo key server-side only (env var, never bundled); Qloo responses privately cached (permitted by Qloo terms, never committed); honest-data UI (coverage badges, "insufficient data" states, GS withheld — never faked); no PII anywhere.

---

## 4. Repository Layout

```
topovibe/
├── LICENSE                     # MIT (TopoVibe) + attribution note
├── README.md                   # pitch, screenshots, run instructions
├── .env.example                # QLOO_API_KEY, QLOO_BASE_URL, PORT
├── package.json
├── vite.config.js
├── index.html
├── src/                        # CLIENT
│   ├── main.js                 # boot: viewer, basemap, wire modules
│   ├── globe.js                # Cesium init (Esri), fly-to, camera hash
│   ├── cities.js               # bundled demo-city list w/ coords (keyless search)
│   ├── layers/insights.js      # top-places markers per category
│   ├── layers/heatmap.js       # urn:heatmap grid → colored PointPrimitives
│   ├── panels/dna.js           # Cultural DNA panel (tags, demographics, places)
│   ├── panels/grounding.js     # GS badge + A/T/N component bars
│   └── share.js                # scene ⇄ URL hash serializer
├── server/
│   ├── index.js                # Express boot, static serving, startup self-check
│   ├── qloo.js                 # broker (fetch, X-Api-Key, cache, validity matrix)
│   ├── validity.js             # param↔filter.type matrix (from Qloo docs)
│   ├── grounding.js            # GS engine
│   ├── routes.js               # /api/* REST
│   ├── mcp.js                  # MCP server (streamable HTTP), 5 tools
│   └── cache.js
└── scripts/
    ├── selfcheck.mjs           # pings /v2/insights on hackathon base URL
    └── precache.mjs            # warms cache for 3 demo cities
```

`npm scripts`: `dev` (vite + nodemon server), `build`, `start`, `selfcheck`, `precache`.

---

## 5. Module Specifications

### 5.1 `server/qloo.js` — the broker (build first, everything depends on it)

```js
// Contract
qloo(path, params) → Promise<json>   // GET only; params → query string
```
- Base URL from `QLOO_BASE_URL` (default `https://hackathon.api.qloo.com`); header `X-Api-Key: process.env.QLOO_API_KEY`. **Never** Bearer, never a body on `/v2/insights`.
- Cache key = path+sorted params; TTL 6h in-memory Map; demo pre-cache overrides.
- Retry once on 429/5xx with 1s backoff; on 401/403 throw a *named* error the UI can translate ("wrong environment", "unsupported entity type").
- Every request passes through `validateParams(filterType, params)` from `validity.js` — invalid keys are stripped **and logged** (the API ignores them silently; we refuse to).

### 5.2 `server/validity.js` — the Entity-Type matrix (from Qloo docs)

```js
export const MATRIX = {
  'urn:entity:place':  ['filter.type','signal.interests.entities','signal.interests.tags',
    'signal.location','signal.location.query','filter.location','filter.location.query',
    'filter.location.radius','filter.tags','filter.exclude.tags','filter.address',
    'filter.external.exists','bias.quality','bias.trends','diversify.by','diversify.take',
    'feature.explainability','take','page'],
  'urn:entity:artist': ['filter.type','signal.interests.entities','signal.interests.tags',
    'signal.location.query','filter.tags','bias.trends','feature.explainability','take','page'],
  'urn:heatmap':       ['filter.type','filter.location','filter.location.query',
    'filter.location.radius','signal.interests.entities','signal.interests.tags',
    'signal.demographics.age','signal.demographics.gender','signal.demographics.audiences',
    'filter.dimensions.price_level','bias.trends','output.heatmap.boundary'],
  'urn:demographics':  ['filter.type','signal.interests.entities','signal.interests.tags'],
  'urn:tag':           ['filter.type','signal.interests.entities','signal.interests.tags',
    'signal.location','signal.location.query','filter.tag.types','filter.parents.types'],
  'urn:entity:locality':[/* compare/insights subset */],
};
// trending: filter.type, filter.start_date, filter.end_date, signal.interests.entities, take
```

### 5.3 `server/grounding.js` — the Grounding Score

```
GS(venue) = 100 × clamp(0.6·A + 0.4·T − 0.3·N)
```
| Component | How computed (documented Qloo data only) |
| --- | --- |
| **A — Affinity** | The venue's rank-normalized position in its `/v2/insights` result set (top result ≈ 1.0), optionally blended with its `popularity` field (0–1). |
| **T — Analog density** | Share of resolved *proof-of-human* tag URNs attached to the venue. Analog lexicon resolved **at server startup** via `/v2/tags` keyword search (`vinyl, independent bookshop, ceramics, craft, quiet, heritage, record store, third place`) → real tag URNs cached in memory. Venue tags come from its entity record; matching = tag-URN intersection count / lexicon size. |
| **N — Viral-noise penalty** | `/v2/trending` for the venue over trailing 12 weeks: `N = clamp(max(acceleration), 0..1)` — a hard recent spike reads tourist-trap; steady curve reads loved. If trending 404s/empty → `N = 0` and `components.n.unknown = true`. |

Output contract:
```json
{ "gs": 82, "components": { "a": 0.91, "t": 0.55, "n": 0.12 },
  "explainability": { /* passthrough from Qloo when present */ },
  "confidence": "high | low | insufficient-data" }
```
GS is **withheld** (`gs: null`, confidence `insufficient-data`) when affinity results are empty or analog lexicon resolution failed entirely. The panel always shows the three component bars — the score shows its work.

### 5.4 `server/routes.js` — REST surface for the client

| Endpoint | Wraps | Used by |
| --- | --- | --- |
| `GET /api/health` | self-check | boot banner |
| `GET /api/resolve?q=&types=` | `/search` | fly-to + entity pickers |
| `GET /api/dna?city=` | `urn:tag` + `urn:demographics` + `urn:entity:place` (3 calls, cached) | DNA panel |
| `GET /api/heatmap?city=&tag=` | `urn:heatmap` | heat layer |
| `GET /api/grounding?city=&tag=` | insights + trending + tags → `[{entity, gs, components}]` | FLIR markers |

### 5.5 Client modules

- **`globe.js`** — Cesium Viewer, Esri World Imagery (no ion token required); bundled `cities.js` lookup → `camera.flyTo`; hash restore on load.
- **`layers/heatmap.js`** — fetch `/api/heatmap` → one `PointPrimitive` per grid cell: `color = lerp(blue→red, affinity_rank)`, `pixelSize = 4 + 10·popularity`. Toggleable.
- **`layers/insights.js`** — venue markers colored by GS: `gs ≥ 70 → #ff3b30 (hot red)`, `40–69 → amber`, `< 40 → #0a84ff (cold blue)`, `null → grey`. Click → `panels/grounding.js` breakdown.
- **`panels/dna.js`** — signature tags (chips), demographics (two bar rows: age, gender), top 10 places with popularity.
- **`share.js`** — `#c=lat,lng,h&city=&tag=&gs=1` round-trip.

---

## 6. TopoVibe MCP — Tool Contract (streamable HTTP, `@modelcontextprotocol/sdk`)

| Tool | Args | Returns |
| --- | --- | --- |
| `resolve_entities` | `query, types?` | `[{name, entity_id, subtype, popularity}]` |
| `resolve_tags` | `keyword` | `[{tag_id, name, subtype}]` |
| `get_insights` | `filterType, signals{}, filters{}` | ranked entities (validity-checked) |
| `get_taste_profile` | `locationQuery` | signature tags + demographics of a place |
| `get_grounding_score` | `city, tag` (or `entityIds[]`) | `[{entity, gs, components, confidence}]` |

Rules: every tool's response embeds the raw Qloo `query` echo for auditability; errors map to named, actionable strings; per-IP rate limit (30/min) on the MCP route.

---

## 7. Corrected Qloo Call Flows (canonical reference for the coding agent)

All: `GET $QLOO_BASE_URL{path}`, header `X-Api-Key`, params in query string. `/v2/insights` is GET-only. Never `/recs`, never `/recommendations`.

```http
# Cultural DNA — signature tags
GET /v2/insights?filter.type=urn:tag&signal.location.query=Austin
# Cultural DNA — demographics of a tag
GET /v2/insights?filter.type=urn:demographics&signal.interests.tags=urn:tag:genre:media:indie
# Cultural DNA — top places
GET /v2/insights?filter.type=urn:entity:place&signal.location.query=Austin
    &diversify.by=properties.geocode.city&diversify.take=5&feature.explainability=true
# Heatmap
GET /v2/insights?filter.type=urn:heatmap&filter.location.query=Austin
    &signal.interests.tags=urn:tag:genre:place:restaurant:italian&bias.trends=medium
# Resolution (always before signals)
GET /search?query=Am%C3%A9lie&types=urn:entity:movie
GET /v2/tags?query=vinyl
# Trending (GS noise penalty)
GET /v2/trending?filter.type=urn:entity:place&signal.interests.entities=<id>
    &filter.start_date=2026-08-08&filter.end_date=2026-10-30&take=50
```

---

## 8. Environment & Config

```bash
# .env.example
QLOO_API_KEY=            # hackathon key (server-side only!)
QLOO_BASE_URL=https://hackathon.api.qloo.com
PORT=4173
DEMO_CITIES=Austin,New York City,Tokyo
```

### Key status & constraints (confirmed)

- ✅ **A Qloo hackathon API key has been provisioned** and is in hand — per the [Qloo Agentic Hackathon Developer Guide](https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide). The hour-0 self-check runs with the real key; there is no credential wait-state in the plan.
- **Endpoint lock:** the key is valid **only** against `https://hackathon.api.qloo.com`. Calls to `api.qloo.com` or `staging.api.qloo.com` return 401 even with a valid key — hence the single `QLOO_BASE_URL` env var and the startup self-check.
- **Quotas:** hackathon keys carry rate + **monthly** limits sized for typical projects; raises are granted per-project via **#api-help on the Qloo Hackathon Discord**. This makes the **pre-cache script (§9) mandatory, not optional** — burn quota once, demo from cache forever.
- **Expiry:** keys deactivate when the hackathon closes. Anything meant to survive judging needs either cached demo data or a commercial Qloo agreement (§12).
- **Key hygiene:** the key lives **only** in `.env` (git-ignored, owner-only permissions). Never paste it into docs, the repo, agent prompts, screenshots, share links, or Discord. The coding agent reads it from the environment at runtime — it never sees the literal value in its context.

Startup self-check (`scripts/selfcheck.mjs`): one `GET /v2/insights?filter.type=urn:entity:place&signal.location.query=Austin&take=1` — green banner or loud failure before any dev work continues.

---

## 9. The 7-Hour Execution Plan

| Time | Phase | Deliverable & acceptance check |
| --- | --- | --- |
| **0:00–0:30** | Scaffold | Repo, npm, `.env` with the **provisioned hackathon key**, self-check green against `hackathon.api.qloo.com` at minute 0 (no credential wait-state), Cesium globe renders Esri Earth at `localhost:4173` |
| **0:30–2:00** | Broker + validity | `qloo.js`, `cache.js`, `validity.js`; unit-checked: one call per module endpoint; invalid param stripped+logged |
| **2:00–3:00** | DNA panel | Click Austin → tags chips, demo bars, top-10 places render; zero-console-error |
| **3:00–4:00** | Heatmap | Tag picker (3 presets) → affinity-colored points over Austin; toggle works |
| **4:00–5:00** | Grounding Score | GS engine unit-checked on 5 cached venues; markers colored red/amber/blue/grey; breakdown panel shows A/T/N bars |
| **5:00–6:00** | MCP server | 5 tools live; verified with MCP inspector (`npx @modelcontextprotocol/inspector`) end-to-end |
| **6:00–6:30** | Share links + polish | URL hash round-trips camera+selection; coverage badges; empty states |
| **6:30–7:00** | Ship | `README.md` (pitch + run steps + screenshots), `LICENSE`, `npm run build`, deploy static client (Cloudflare Pages/Netlify) + server (Render/Fly) **or** record local-run fallback; submission checklist §11 |

### Kill-switches (pre-agreed cuts, in order)
1. **MCP SDK misbehaves** → ship the 5 tools as documented plain-JSON REST + an `mcp.json` manifest; note MCP-compat in README. *(−45 min saved)*
2. **Trending sparse for demo venues** → `N=0` + `unknown` flag; GS still ships honestly. *(−30 min)*
3. **Heatmap grid sparse in a demo city** → swap in the pre-cached backup city (decided at 0:30, not at 6:00).
4. **Deploy fails** → flawless local run + README; deploy post-deadline. Submission requires hosting, so this is last-resort only.

### Agentic-coding playbook (how to drive the build agent)
- Work **phase-by-phase per the table**; do not let the agent start phase N+1 until phase N's acceptance check passes.
- Paste §7 verbatim into the agent's context before any Qloo-touching task (prevents Bearer/`PLACE`-style errors).
- One file = one responsibility per §4; the agent must not invent new endpoints outside `routes.js`'s table.
- After each phase: `npm run selfcheck` + manual click-through; commit. Seven hours dies by uncommitted refactors — commit at every green check.

### Demo pre-cache (`scripts/precache.mjs`)
Run once with the hackathon key: warms `/api/dna`, `/api/heatmap`, `/api/grounding` for the 3 demo cities × 3 preset tags (italian dining, indie music, specialty coffee). Demo never touches the network live.

---

## 10. Honest-Data & Ethics Rules (non-negotiable in code review)

1. No taste claim without a Qloo `query` echo behind it.
2. GS withheld, never interpolated, on insufficient data.
3. People are not a query type — no person-tracking affordances (GEV's line, adopted).
4. No PII collected; no accounts in MVP.
5. Coverage badge on every panel: `live | cached | insufficient-data`.

---

## 11. Submission Checklist (hackathon requirements)

- [ ] Functional demo app, externally hosted, usable end-to-end
- [ ] Public repo with full source + run instructions
- [ ] Text description (adapt §1 + §2 of this brief)
- [ ] External hosting verified from a fresh browser/profile
- [ ] MIT `LICENSE` file visible in repo About section

---

## 12. Legal & Attribution Notes

- TopoVibe is a **clean-room build**: no God's Eye View code, media, or bundled data copied (their GIFs/data packs are *not* MIT). UX inspiration only; we note "inspired by the God's Eye View open-source project (MIT)" in the README as courtesy.
- "TopoVibe" and "God's Eye View" trademarks: ours to register (pending USPTO check), theirs untouched.
- Qloo: hackathon key (provisioned) valid only on `hackathon.api.qloo.com`, subject to rate/monthly quotas (raises via #api-help on the hackathon Discord), and expires post-judging; responses cached privately per Qloo terms; nothing cached committed to the repo. Production = commercial Qloo agreement (post-hackathon work).
- Basemap: Esri World Imagery usage per Esri terms; attribution string rendered on-globe.

---

## 13. Post-Hackathon Roadmap (context only — not in the 7h)

Sister Cities (`/v2/analysis/compare`) · Promoter Mode · voice/chat agent over the MCP tools · NVG "Quiet" style · missions pack · commercial Qloo terms + Grounding API GA.

---

*Build order is sacred: broker → DNA → heatmap → GS → MCP → ship. Seven hours is enough for a small thing done honestly — not a big thing done halfway.*
