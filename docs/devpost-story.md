# TopoVibe — Devpost Project Story

## Inspiration

AI agents are getting smarter, but they're culturally blind. Ask one where to go and you get fluent, generic, popularity-ranked "agentic slop" — the same ten places everyone already knows. Meanwhile people are shifting toward analog, screen-free, heritage-rooted third places, and nobody — traveler, relocatee, promoter, or agent — can answer the question that actually matters: **is this place loved, or just loud?**

Review sites measure popularity. LLMs hallucinate taste. We wanted a queryable engine for the difference — one that works as beautifully for a human flying a globe as for an agent grounding its next recommendation. TopoVibe (UX-inspired by the open-source "God's Eye View" project, clean-room build) is that engine.

## What it does

TopoVibe is a cultural-intelligence globe for humans, and an MCP oracle for agents — both powered entirely by Qloo's taste graph.

- **Click a city** on the CesiumJS 3D globe → its **Cultural DNA**: signature tags, demographics (age/gender affinity deltas), and top places.
- **Pick a tag** (Italian dining, live music, coffee) → an **affinity heatmap** drapes over the city, blue to red.
- **Every venue gets a Grounding Score (GS), 0–100:** `GS = 100 × clamp(0.6·A + 0.4·T − 0.3·N)` — affinity rank from `/v2/insights`, analog tag density from a `/v2/tags`-resolved lexicon (vinyl, independent bookshop, ceramics, craft, quiet, heritage, record store, third place), and a viral-noise penalty. Loved analog venues glow hot red; viral tourist traps glow cold blue. Click any marker and the score shows its work: A/T/N component bars, matched analog tags, and what people actually mention there.
- **For agents,** a first-class MCP server with 5 tools (`resolve_entities`, `resolve_tags`, `get_insights`, `get_taste_profile`, `get_grounding_score`) — every response embeds the raw Qloo query echo, so an agent can prove where its taste claims came from.
- Share links serialize camera + city + tag into the URL hash; coverage badges (`live | cached | insufficient-data`) appear on every panel.

**Remove Qloo and TopoVibe is an empty basemap** — cultural intelligence isn't a feature, it's the product.

## How we built it

Vanilla JS + CesiumJS + Vite client; Node.js + Express server in six single-responsibility modules: a Qloo **broker** (X-Api-Key header, GET-only, 6-hour TTL cache, one retry), a **validity matrix** (param ↔ `filter.type` rules from the Qloo docs), the **Grounding Score engine**, REST routes, the MCP endpoint, and the cache with a demo pre-cache loader.

We worked to a hard 7-hour phase plan — scaffold → broker → DNA → heatmap → Grounding Score → MCP → share links → ship — with an acceptance check and a commit at every green gate. Every Qloo rule was enforced in code, not in comments: full-URN `filter.type` values, resolve IDs before signaling, `/v2/insights` GET-only, no legacy `/recs`. The demo pre-cache warms 3 cities × 3 tags in 27 calls so demos never burn quota. Deployed as one Render service (static client + REST + MCP) verified by a 7-point script: static, Cesium, health, DNA, Grounding, MCP, HTTPS.

## Challenges we ran into

The best features came from API discoveries the docs don't make:

- **`/v2/tags` rejects `?query=`.** Only the API's own error message revealed the real parameter is `filter.query`. Our broker now validates against the exact set the API accepts.
- **`/v2/trending` doesn't support `urn:entity:place`** — only actor, artist, brand, movie, person, podcast, tv_show. Our viral-noise component was designed around trending data for venues. Rather than fake it, every venue's N component reports `unknown` and the UI says so. The score degrades honestly.
- **A location *signal* isn't a location *filter*.** An Austin record-store query cheerfully returned San Antonio venues until we switched to `filter.location.query` as a hard filter.
- **Demographics are sparse.** Niche tags return empty breakdowns, so the DNA panel falls back through a city's top tags → top places, and declares `insufficient-data` when nothing yields — never inventing numbers.
- **Our analog lexicon got polluted.** Resolving "third place" returned a burger-combo tag and the bare parent `urn:tag:genre:place` — which intersected with *every venue on Earth* and silently inflated every score. A depth filter (leaf URNs only) fixed it.
- **Pretty presets, empty grids.** The indie-music keyword tag has no place heat grid at all; specialty-coffee produced 22 cells. We density-tested replacements live and swapped tags, documenting why.
- **Deployment whack-a-mole.** AWS App Runner is closed to new customers (per AWS's own notice) — we pivoted to a Render free instance with a blueprint and a keep-warm health ping.

## Accomplishments that we're proud of

- **Honesty as architecture.** No taste claim renders without its Qloo query echo; the Grounding Score is *withheld*, never interpolated, on insufficient data; coverage badges are everywhere. The demo can't lie by accident.
- **A real agentic surface.** Five MCP tools verified end-to-end over raw JSON-RPC — handshake, tool list, every tool called, invalid input rejected with actionable named errors, and the 30/min rate limit returning 429s.
- **Discipline that shipped.** Seven phases, seven acceptance gates, a commit at every green. Self-check green at minute zero; deploy sweep 7/7 at the end.
- **The Grounding Score works.** Austin's record stores score 15–60 with a clean monotonic ranking and a real analog-density signal — the FLIR contrast is honest data, not tuned theatrics.

## What we learned

APIs silently ignore invalid parameters — which makes client-side validation a feature, not a courtesy (we strip *and log* what Qloo would ignore). Resolve before you signal, always: invented tag URNs fail silently too. Sparse data is a design input, not an edge case — fallback chains and honest empty states made the product *more* trustworthy, not less. And a metric that shows its work (A/T/N bars, matched tags, query echoes) turns a number into evidence.

## What's next for TopoVibe

Per our roadmap: **Sister Cities** (neighborhood affinity matching via `/v2/analysis/compare` — "which Tokyo neighborhood feels like Bushwick?"), **Promoter Mode** for venue scouting, a **voice/chat agent** over the existing MCP tools, and the NVG "Quiet" map style. On the production side: graduating from the hackathon key to commercial Qloo terms, a durable pre-cached demo pack, and the final-version deployment to AWS Elastic Beanstalk. The Grounding Score deserves an API of its own — every agent deserves to know what's loved, not just loud.
