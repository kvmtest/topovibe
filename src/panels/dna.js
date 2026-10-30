// panels/dna.js — Cultural DNA panel: signature tags, demographics, top places.
// Honest-data rules (brief §10): coverage badge always visible, query echoes
// behind every taste claim, explicit empty/insufficient-data states.

const AGE_LABELS = {
  '24_and_younger': '≤ 24',
  '25_to_29': '25–29',
  '30_to_34': '30–34',
  '35_to_44': '35–44',
  '45_to_54': '45–54',
  '55_and_older': '55 +',
};

const panel = () => document.getElementById('panel');
const covBadge = () => document.getElementById('coverage');

export function setCoverage(coverage) {
  const el = covBadge();
  el.textContent = `coverage: ${coverage}`;
  el.className = `badge ${coverage === 'live' ? 'badge-live' : coverage === 'cached' ? 'badge-cached' : 'badge-insufficient'}`;
}

function deltaBar(label, v) {
  const pct = Math.round(Math.abs(v) * 100);
  const sign = v > 0 ? '+' : '';
  const cls = v >= 0 ? 'fill' : 'fill n';
  return `<div class="bar-row"><span class="label">${label}</span>
    <span class="track"><span class="${cls}" style="width:${Math.min(pct, 100)}%"></span></span>
    <span class="val">${sign}${v.toFixed(2)}</span></div>`;
}

export async function showDna(city) {
  const el = panel();
  el.classList.remove('hidden');
  el.innerHTML = `<button class="close" title="Close">×</button>
    <h2>${city.name}</h2><span class="badge badge-muted">querying Qloo…</span>`;
  el.querySelector('.close').onclick = () => el.classList.add('hidden');

  let d;
  try {
    const r = await fetch(`/api/dna?city=${encodeURIComponent(city.name)}`);
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error(e.message ?? `HTTP ${r.status}`);
    }
    d = await r.json();
  } catch (e) {
    setCoverage('insufficient-data');
    el.innerHTML = `<button class="close">×</button><h2>${city.name}</h2>
      <p class="empty-state">Qloo request failed: ${e.message}</p>`;
    el.querySelector('.close').onclick = () => el.classList.add('hidden');
    return;
  }

  setCoverage(d.coverage);

  const badgeCls = d.coverage === 'live' ? 'badge-live' : d.coverage === 'cached' ? 'badge-cached' : 'badge-insufficient';

  // Signature tags — chips become the heatmap tag picker in Phase 3
  const tagsHtml = d.tags?.length
    ? d.tags
        .map(
          (t) =>
            `<span class="chip selectable" data-tag="${t.tag_id}" data-tag-name="${t.name}" title="${t.tag_id}">${t.name}<span class="pct">${Math.round((t.affinity ?? t.popularity ?? 0) * 100)}%</span></span>`
        )
        .join('')
    : `<p class="empty-state">No signature tags returned by Qloo for ${city.name}.</p>`;

  // Demographics — signed affinity deltas vs global baseline
  let demoHtml;
  if (d.demographics?.age && d.demographics?.gender) {
    const age = Object.entries(d.demographics.age)
      .map(([k, v]) => deltaBar(AGE_LABELS[k] ?? k, v))
      .join('');
    const gen = deltaBar('female', d.demographics.gender.female) + deltaBar('male', d.demographics.gender.male);
    demoHtml = `<h3>Demographics · ${d.demographicsOf?.name ?? 'signature'} ${d.demographicsOf?.kind === 'entity' ? '(place)' : '(tag)'}</h3>
      ${age}${gen}
      <p class="query-echo">affinity delta vs global baseline (−1…+1)</p>`;
  } else {
    demoHtml = `<h3>Demographics</h3><p class="empty-state">insufficient data — Qloo returned no demographic breakdown for ${city.name}'s top signals.</p>`;
  }

  // Top places
  const placesHtml = d.places?.length
    ? d.places
        .map(
          (p) =>
            `<div class="place-row" data-entity="${p.entity_id}" title="${p.address ?? ''}">
             <span class="name">${p.name}</span>
             <span class="pop">${Math.round((p.popularity ?? 0) * 100)}%</span></div>`
        )
        .join('')
    : `<p class="empty-state">No top places returned by Qloo for ${city.name}.</p>`;

  el.innerHTML = `<button class="close">×</button>
    <h2>${d.city}</h2>
    <span class="badge ${badgeCls}">${d.coverage}</span>
    <h3>Signature tags</h3><div id="dna-tags">${tagsHtml}</div>
    ${demoHtml}
    <h3>Top places</h3>${placesHtml}
    <div class="query-echo">${(d.queries ?? []).map((q) => `GET ${q}`).join('<br>')}</div>`;
  el.querySelector('.close').onclick = () => el.classList.add('hidden');

  // Tag chips dispatch for the heatmap layer (Phase 3 listener)
  el.querySelectorAll('#dna-tags .chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      window.dispatchEvent(
        new CustomEvent('topovibe:tag', {
          detail: { tag: chip.dataset.tag, tagName: chip.dataset.tagName, city },
        })
      );
    });
  });
}
