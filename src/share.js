// share.js — scene ⇄ URL hash serializer (brief §5.5): `#c=lon,lat,h&city=&tag=&gs=1`
// Round-trip: camera moves, city selection and active tag all serialize into the
// hash; loading a hash restores camera + city + heat/GS layers. ~40 lines.
import { Math as CesiumMath, Cartesian3 } from 'cesium';
import { CITIES } from './cities.js';

let viewer = null;
const state = { city: null, tag: null, tagName: null };
let writeTimer = null;

function cameraHash() {
  const c = viewer.camera.positionCartographic;
  return [
    CesiumMath.toDegrees(c.longitude).toFixed(4),
    CesiumMath.toDegrees(c.latitude).toFixed(4),
    Math.round(c.height),
  ].join(',');
}

function writeHash() {
  const parts = [`c=${cameraHash()}`];
  if (state.city) parts.push(`city=${encodeURIComponent(state.city)}`);
  if (state.tag) parts.push(`tag=${encodeURIComponent(state.tag)}`);
  if (state.tag) parts.push('gs=1');
  if (state.tagName) parts.push(`tagName=${encodeURIComponent(state.tagName)}`);
  history.replaceState(null, '', `#${parts.join('&')}`);
}

const debouncedWrite = () => {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(writeHash, 350);
};

export function initShare(v) {
  viewer = v;

  window.addEventListener('topovibe:city', (e) => {
    state.city = e.detail.name;
    debouncedWrite();
  });
  window.addEventListener('topovibe:tag', (e) => {
    state.tag = e.detail.tag;
    state.tagName = e.detail.tagName;
    debouncedWrite();
  });
  viewer.camera.moveEnd.addEventListener(debouncedWrite);

  restore();
}

function restore() {
  const h = new URLSearchParams(location.hash.slice(1));
  const cityName = h.get('city');
  const cityObj = CITIES.find((c) => c.name === cityName);
  const tag = h.get('tag');
  const tagName = h.get('tagName') ?? tag;
  const cam = h.get('c');

  // Select the city through the real button (single code path: fly + DNA panel)
  if (cityObj) {
    const btn = [...document.querySelectorAll('#citybar button')].find((b) => b.dataset.city === cityObj.name);
    if (btn) btn.click();
    state.city = cityObj.name;
  }

  if (tag && cityObj) {
    state.tag = tag;
    state.tagName = tagName;
    // slight delay so the city selection lands first (layer loads are async anyway)
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('topovibe:tag', { detail: { tag, tagName, city: cityObj } }));
    }, 400);
  }

  // Exact camera wins over the city fly-to: apply after the flight settles
  if (cam) {
    const [lon, lat, height] = cam.split(',').map(Number);
    if ([lon, lat, height].every(Number.isFinite)) {
      setTimeout(() => {
        viewer.camera.setView({
          destination: Cartesian3.fromDegrees(lon, lat, height),
          orientation: { heading: 0, pitch: CesiumMath.toRadians(-90), roll: 0 },
        });
      }, cityObj ? 3200 : 0);
    }
  }
}
