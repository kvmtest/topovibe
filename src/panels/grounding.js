// panels/grounding.js — GS badge + A/T/N component bars (brief §5.5).
// The score always shows its work: three component bars, analog matches,
// the N kill-switch flag, and the Qloo query echo behind the claim.

const panel = () => document.getElementById('panel');

function gsClass(gs) {
  if (gs === null || gs === undefined) return 'gs-grey';
  if (gs >= 70) return 'gs-hot';
  if (gs >= 40) return 'gs-warm';
  return 'gs-cold';
}

function compBar(label, cls, v, note = '') {
  const pct = Math.round((v ?? 0) * 100);
  return `<div class="bar-row"><span class="label">${label}</span>
    <span class="track"><span class="fill ${cls}" style="width:${Math.min(pct, 100)}%"></span></span>
    <span class="val">${v === null || v === undefined ? '—' : v.toFixed(2)}${note}</span></div>`;
}

/** venue = entity payload; meta = { gs, components, confidence, formula, coverage, tag, explainability } */
export function showGrounding(venue, meta) {
  const el = panel();
  el.classList.remove('hidden');
  const c = meta.components ?? {};
  const gs = meta.gs;

  const gsBlock =
    gs === null || gs === undefined
      ? `<div class="gs-badge gs-grey">— <small>insufficient data</small></div>
         <p class="empty-state">Grounding Score withheld — never interpolated (brief §10).</p>`
      : `<div class="gs-badge ${gsClass(gs)}">${gs}<small>/ 100 · ${meta.confidence}</small></div>`;

  const nBlock = c.n?.unknown
    ? compBar('N · viral noise', 'n', 0, ' ?') +
      `<p class="query-echo">n unknown — /v2/trending has no urn:entity:place support (verified live); N=0 by kill-switch, not hidden.</p>`
    : compBar('N · viral noise', 'n', c.n?.value ?? 0);

  const matches = (c.analogMatches ?? [])
    .map((u) => `<span class="chip" title="${u}">${u.split(':').pop()}</span>`)
    .join('');

  const kw = (venue.keywords ?? []).map((k) => `<span class="chip">${k}</span>`).join('');

  el.innerHTML = `<button class="close">×</button>
    <h2>${venue.name}</h2>
    <div style="color:var(--muted);font-size:12px;margin-bottom:8px">${venue.address ?? ''}${venue.rating ? ` · ★ ${Number(venue.rating).toFixed(1)}` : ''}</div>
    ${gsBlock}
    <h3>Grounding Score components</h3>
    ${compBar('A · affinity', 'a', c.a)}
    ${compBar('T · analog density', 't', c.t)}
    ${nBlock}
    ${matches ? `<h3>Analog tag matches</h3>${matches}` : ''}
    ${kw ? `<h3>What people mention</h3>${kw}` : ''}
    <div class="query-echo">${meta.formula ?? ''}<br>coverage: ${meta.coverage ?? '?'}</div>`;
  el.querySelector('.close').onclick = () => el.classList.add('hidden');
}
