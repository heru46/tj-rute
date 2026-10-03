import { prepare, planAlternatives, nearbyStops, ACCESS_M } from './router.js';
import { price } from './fare.js';
import { createSearch } from './search.js';
import { createMap } from './map.js';
import { renderList, renderDetail } from './results.js';
import { escapeHtml as esc } from './format.js';

const $ = (s) => document.querySelector(s);
const els = {
  from: $('#from'), to: $('#to'), locate: $('#locate'), swap: $('#swap'),
  when: $('#when'), whenNow: $('#when-now'), suggest: $('#suggest'),
  pickbar: $('#pickbar'), pickLabel: $('#pick-label'), pickCancel: $('#pick-cancel'),
  status: $('#status'), sheet: $('#sheet'), sheetBody: $('#sheet-body'), handle: $('#sheet-handle'),
};

const state = {
  network: null, index: null, search: null, shapes: null,
  from: null, to: null, active: 'from', whenTouched: false,
  items: [], selected: -1,
};

// Tinggi kartu atas dipakai CSS untuk menaruh daftar saran dan status tepat di bawahnya.
const card = $('#card');
new ResizeObserver(() => {
  document.documentElement.style.setProperty('--card-h', `${card.getBoundingClientRect().height}px`);
}).observe(card);
const map = createMap($('#map'));

// ── status ──
let statusTimer = 0;
function showStatus(text, { sticky = false, action = null } = {}) {
  clearTimeout(statusTimer);
  els.status.innerHTML = esc(text) + (action ? ` <button type="button" class="link-btn">${esc(action.label)}</button>` : '');
  els.status.hidden = false;
  if (action) els.status.querySelector('button').addEventListener('click', action.run);
  if (!sticky) statusTimer = setTimeout(() => { els.status.hidden = true; }, 4500);
}
function hideStatus() { els.status.hidden = true; }

// ── waktu berangkat ──
function toLocalInput(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function departure() {
  const d = state.whenTouched && els.when.value ? new Date(els.when.value) : new Date();
  if (!state.whenTouched) els.when.value = toLocalInput(d);
  return { date: d, sec: d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() };
}
els.when.value = toLocalInput(new Date());
els.when.addEventListener('change', () => {
  state.whenTouched = !!els.when.value;
  els.whenNow.hidden = !state.whenTouched;
  compute();
});
els.whenNow.addEventListener('click', () => {
  state.whenTouched = false;
  els.whenNow.hidden = true;
  compute();
});

// ── titik A/B ──
function inputOf(which) { return which === 'from' ? els.from : els.to; }

function setPoint(which, point) {
  state[which] = point;
  inputOf(which).value = point ? point.name : '';
  map.setPoint(which, point);
  closeSuggest();
  if (state.from && state.to) compute();
  else {
    map.fitPoints();
    const other = which === 'from' ? 'to' : 'from';
    if (point && !state[other]) inputOf(other).focus();
  }
}

function nearestStopLabel(lat, lon) {
  const near = nearbyStops(state.index, lat, lon, 300)[0];
  return near ? `Titik di peta · dekat ${state.network.stops.name[near.stop]}` : 'Titik di peta';
}

// ── saran ──
let suggestAbort = null;
let suggestTimer = 0;
let suggestItems = [];

function closeSuggest() {
  els.suggest.hidden = true;
  els.suggest.innerHTML = '';
  if (suggestAbort) suggestAbort.abort();
}

function renderSuggest(result, pendingPlaces) {
  const rows = [];
  suggestItems = [];
  const add = (item, icon) => {
    suggestItems.push(item);
    rows.push(`<button type="button" role="option" class="sg" data-i="${suggestItems.length - 1}">
      <span class="sg-ico sg-${icon}" aria-hidden="true"></span>
      <span class="sg-txt"><b>${esc(item.name)}</b>${item.detail ? `<small>${esc(item.detail)}</small>` : ''}</span></button>`);
  };
  result.stops.forEach((s) => add(s, 'stop'));
  result.places.forEach((p) => add(p, 'place'));
  if (pendingPlaces) rows.push('<p class="sg-note">Mencari tempat…</p>');
  if (result.placesFailed) rows.push('<p class="sg-note">Pencarian tempat sedang tidak tersedia. Halte tetap bisa dipilih.</p>');
  if (!pendingPlaces && !result.stops.length && !result.places.length && !result.placesFailed) rows.push('<p class="sg-note">Tidak ditemukan. Coba nama halte, gedung, atau jalan.</p>');
  rows.push(`<button type="button" class="sg sg-pick" data-pick="1"><span class="sg-ico sg-pin" aria-hidden="true"></span><span class="sg-txt"><b>Pilih di peta</b></span></button>`);
  els.suggest.innerHTML = rows.join('');
  els.suggest.hidden = false;
}

els.suggest.addEventListener('pointerdown', (e) => e.preventDefault()); // jaga fokus input
els.suggest.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.pick) { startPick(state.active); return; }
  const item = suggestItems[Number(b.dataset.i)];
  if (item) setPoint(state.active, { lat: item.lat, lon: item.lon, name: item.name });
});

function onType(which) {
  state.active = which;
  if (state[which]) { state[which] = null; map.setPoint(which, null); }
  const text = inputOf(which).value;
  clearTimeout(suggestTimer);
  if (suggestAbort) suggestAbort.abort();
  if (!state.search) return;
  if (!text.trim()) { closeSuggest(); return; }
  const stops = state.search.suggestStops(text);
  renderSuggest({ stops, places: [], placesFailed: false }, text.trim().length >= 3);
  suggestTimer = setTimeout(async () => {
    suggestAbort = new AbortController();
    try {
      const res = await state.search.suggest(text, suggestAbort.signal);
      if (inputOf(which).value === text && document.activeElement === inputOf(which)) renderSuggest(res, false);
    } catch (e) {
      if (e.name !== 'AbortError') throw e;
    }
  }, 300);
}

for (const which of ['from', 'to']) {
  const input = inputOf(which);
  input.addEventListener('input', () => onType(which));
  input.addEventListener('focus', () => {
    state.active = which;
    input.select();
    if (input.value.trim() && !state[which]) onType(which);
    else renderSuggest({ stops: [], places: [], placesFailed: false }, false);
  });
  input.addEventListener('blur', () => setTimeout(() => {
    if (!document.activeElement || !document.activeElement.closest('#suggest, #card')) closeSuggest();
  }, 0));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && suggestItems[0]) {
      e.preventDefault();
      setPoint(which, { lat: suggestItems[0].lat, lon: suggestItems[0].lon, name: suggestItems[0].name });
    } else if (e.key === 'Escape') closeSuggest();
  });
}

// ── pilih di peta ──
function startPick(which) {
  closeSuggest();
  inputOf(which).blur();
  els.pickLabel.textContent = which === 'from' ? 'A (berangkat)' : 'B (tujuan)';
  els.pickbar.hidden = false;
  map.onPick(({ lat, lon }) => {
    stopPick();
    setPoint(which, { lat, lon, name: nearestStopLabel(lat, lon) });
  });
}
function stopPick() {
  els.pickbar.hidden = true;
  map.onPick(null);
}
els.pickCancel.addEventListener('click', stopPick);

// ── lokasi saya ──
els.locate.addEventListener('click', () => {
  if (!('geolocation' in navigator)) { showStatus('Browser ini tidak mendukung lokasi. Ketik titik berangkat.'); return; }
  showStatus('Mencari lokasimu…', { sticky: true });
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      hideStatus();
      setPoint('from', { lat: pos.coords.latitude, lon: pos.coords.longitude, name: 'Lokasi saya' });
    },
    (err) => {
      showStatus(err.code === 1
        ? 'Izin lokasi ditolak. Ketik titik berangkat atau pilih di peta.'
        : 'Lokasi tidak didapat. Ketik titik berangkat atau pilih di peta.');
      els.from.focus();
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
  );
});

els.swap.addEventListener('click', () => {
  const { from, to } = state;
  state.from = to; state.to = from;
  els.from.value = to ? to.name : '';
  els.to.value = from ? from.name : '';
  map.setPoint('from', state.from);
  map.setPoint('to', state.to);
  compute();
});

// ── sheet ──
function openSheet() {
  els.sheet.hidden = false;
  els.sheet.classList.remove('is-collapsed');
  syncInset();
}
function syncInset() {
  requestAnimationFrame(() => map.setBottomInset(els.sheet.hidden ? 0 : els.sheet.getBoundingClientRect().height));
}
els.handle.addEventListener('click', () => {
  els.sheet.classList.toggle('is-collapsed');
  syncInset();
});

async function loadShapes() {
  if (state.shapes) return state.shapes;
  try {
    const res = await fetch('data/shapes.json');
    state.shapes = res.ok ? await res.json() : {};
  } catch {
    state.shapes = {};
  }
  return state.shapes;
}

function labels() {
  return { from: state.from ? state.from.name : 'Titik A', to: state.to ? state.to.name : 'Titik B' };
}

function showList() {
  state.selected = -1;
  renderList(els.sheetBody, state.items, state.network, selectItem);
  els.sheetBody.scrollTop = 0;
  if (state.items[0]) loadShapes().then((shapes) => map.showItinerary(state.items[0].it, state.network, shapes));
}

async function selectItem(i) {
  state.selected = i;
  renderDetail(els.sheetBody, state.items[i], state.network, labels(), showList);
  els.sheetBody.scrollTop = 0;
  openSheet();
  map.showItinerary(state.items[i].it, state.network, await loadShapes());
}

function emptyMessage() {
  const { from, to } = state;
  if (!nearbyStops(state.index, from.lat, from.lon, ACCESS_M).length) return 'Tidak ada halte Transjakarta dalam 1 km dari titik A. Pilih titik lain yang lebih dekat ke halte.';
  if (!nearbyStops(state.index, to.lat, to.lon, ACCESS_M).length) return 'Tidak ada halte Transjakarta dalam 1 km dari titik B. Pilih titik lain yang lebih dekat ke halte.';
  return 'Tidak ada layanan yang beroperasi untuk perjalanan ini pada jam tersebut. Ubah waktu berangkat lalu coba lagi.';
}

function compute() {
  if (!state.index || !state.from || !state.to) return;
  const dep = departure();
  const its = planAlternatives(state.index, { from: state.from, to: state.to, departSec: dep.sec, date: dep.date });
  state.items = its.map((it) => ({ it, fare: price(it, state.network) }));
  openSheet();
  if (!state.items.length) {
    map.clearItinerary();
    map.fitPoints();
    els.sheetBody.innerHTML = `<p class="empty">${esc(emptyMessage())}</p>`;
    return;
  }
  showList();
}

// ── muat data ──
async function load() {
  showStatus('Memuat jaringan Transjakarta…', { sticky: true });
  try {
    const res = await fetch('data/network.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.network = await res.json();
    state.index = prepare(state.network);
    state.search = createSearch(state.network);
    hideStatus();
    if (els.from.value && document.activeElement === els.from) onType('from');
    if (els.to.value && document.activeElement === els.to) onType('to');
  } catch (e) {
    showStatus('Data jaringan gagal dimuat. Periksa koneksi lalu muat ulang.', {
      sticky: true,
      action: { label: 'Muat ulang', run: () => location.reload() },
    });
    console.error(e);
  }
}

load();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW gagal', e)));
}
