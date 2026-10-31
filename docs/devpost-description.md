# Devpost submission text — TopoVibe (paste-ready; fill the two URLs)

## Tagline

Fly a 3D globe, click any city, and see what it actually *loves* — every venue scored 0–100 by the Grounding Score, with Qloo's taste graph underneath and an MCP server on top so any AI agent can query cultural ground truth.

## What it does

AI agents are culturally blind: they recommend fluent, generic, popularity-ranked "agentic slop." Meanwhile nobody — traveler, relocatee, promoter, or agent — can verify *"is this place loved, or just loud?"* Review sites measure popularity; LLMs hallucinate taste.

**TopoVibe** grounds every answer in Qloo's taste graph (250M+ entities, billions of anonymized signals). On a CesiumJS 3D globe you click a city and see its **Cultural DNA** (signature tags, demographics, top places), drape a **cultural heatmap** of any tag over the city, and read every venue's **Grounding Score (GS)** — a 0–100 proof-of-human authenticity index rendered FLIR-style: loved analog venues glow hot red, viral tourist traps glow cold blue.

`GS = 100 × clamp(0.6·A + 0.4·T − 0.3·N)` — A = affinity rank from `/v2/insights`, T = analog tag density via a `/v2/tags`-resolved lexicon (vinyl, independent bookshop, ceramics, craft, quiet, heritage, record store, third place), N = viral-noise penalty. GS is withheld honestly when data is insufficient — never interpolated.

For agents, TopoVibe is a first-class **MCP server** with 5 tools (`resolve_entities`, `resolve_tags`, `get_insights`, `get_taste_profile`, `get_grounding_score`). Every tool response embeds the raw Qloo query echo for auditability.

## What makes it Qloo-powered

**Remove Qloo and TopoVibe is an empty basemap** — cultural intelligence is not a feature, it is the product. Every taste claim traces to a live Qloo call: `/search` for entity resolution, `/v2/tags` for tag URNs, `/v2/insights` (tags, demographics, places, heatmaps) for every panel and score. The LLM/agent never invents taste — it calls Qloo and narrates verified results. The codebase enforces the Qloo contract in a broker module (X-Api-Key, GET-only, param validity matrix that strips+logs what the API would silently ignore) and honestly surfaces coverage (`live | cached | insufficient-data`) on every panel.

## Key features

- 3D globe (CesiumJS + keyless Esri imagery), bundled demo cities Austin · NYC · Tokyo
- Cultural DNA panel: signature tags, demographics (age/gender affinity deltas), top 10 places
- Tag heatmaps: affinity-colored point clouds over each city
- Grounding Score: red/amber/blue venue markers + A/T/N component breakdown
- MCP server (streamable HTTP): 5 tools, per-IP rate limit, query echoes
- Share links (camera + city + tag in the URL hash), honest-data badges everywhere

## Tech stack

Vanilla JS + CesiumJS + Vite client; Node.js + Express server (Qloo broker, validity matrix, GS engine, MCP endpoint, TTL cache + demo pre-cache); Qloo API (`/search`, `/v2/tags`, `/v2/insights`, `/v2/trending` internally). MIT licensed.

## Links

- **Live demo:** https://<your-render-url>.onrender.com
- **Source (MIT):** https://github.com/kvmtest/topovibe
- **MCP endpoint:** https://<your-render-url>.onrender.com/mcp (see `mcp.json` in the repo)

## Honest notes for judges

- `/v2/trending` does not support `urn:entity:place` (verified live), so the N component reports `unknown` for venues — shown in the UI, not hidden.
- First clicks on a cold deploy call Qloo live (`coverage: live`), then serve from a 6-hour in-memory cache. The local demo mode is fully pre-cached (`npm run precache`).
