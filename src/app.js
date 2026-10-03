import { prepare, planAlternatives, nearbyStops, ACCESS_M } from './router.js';
import { price } from './fare.js';
import { createSearch } from './search.js';
import { createMap } from './map.js';
import { createSheet } from './sheet.js';
import { ICONS } from './icons.js';
import { renderHome, renderSuggestions, renderList, renderDetail, renderEmpty } from './views.js';
import { escapeHtml as esc } from './format.js';
import { createTour, unionRect } from './tour.js';

const $ = (s) => document.querySelector(s);
const els = {
  from: $('#from'), to: $('#to'), locate: $('#locate'), swap: $('#swap'),
  when: $('#when'), whenLabel: $('#when-label'), whenNow: $('#when-now'),
  pickbar: $('#pickbar'), pickLabel: $('#pick-label'), pickCancel: $('#pick-cancel'),
  status: $('#status'), sheet: $('#sheet'), head: $('#sheet-head'), content: $('#content'),
};

// Ikon statis di markup.
document.querySelectorAll('[data-icon]').forEach((n) => { n.outerHTML = ICONS[n.dataset.icon]; });
els.swap.innerHTML = ICONS.swap;
els.whenNow.innerHTML = ICONS.close;
document.querySelectorAll('.clear').forEach((b) => { b.innerHTML = ICONS.close; });

const state = {
  network: null, index: null, search: null, shapes: null,
  from: null, to: null, active: null, whenTouched: false,
  items: [], view: 'home',
};
const map = createMap($('#map'));
const sheet = createSheet(els.sheet, {
  head: els.head,
  content: els.content,
  grabber: $('#grabber'),
  onResize: (px) => map.setBottomInset(px),
});
// Ketuk peta saat tidak memilih titik → sheet turun ke kecil supaya peta lega.
map.onTap(() => {
  if (sheet.detent !== 'small' && !document.activeElement?.matches('input')) sheet.set('small');
});
sheet.set('medium', false);

// ── status ──
let statusTimer = 0;
function showStatus(text, { sticky = false, action = null } = {}) {
  clearTimeout(statusTimer);
  els.status.innerHTML = esc(text) + (action ? ` <button type="button" class="text-btn">${esc(action.label)}</button>` : '');
  els.status.hidden = false;
  if (action) els.status.querySelector('button').addEventListener('click', action.run);
  if (!sticky) statusTimer = setTimeout(() => { els.status.hidden = true; }, 4500);
}
function hideStatus() { els.status.hidden = true; }

// ── waktu berangkat ──
const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
function toLocalInput(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function departure() {
  const d = state.whenTouched && els.when.value ? new Date(els.when.value) : new Date();
  return { date: d, sec: d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() };
}
function syncWhenLabel() {
  if (!state.whenTouched) {
    els.whenLabel.textContent = 'Berangkat sekarang';
    els.whenNow.hidden = true;
    return;
  }
  const d = new Date(els.when.value);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const jam = `${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
  els.whenLabel.textContent = `Berangkat ${sameDay ? '' : `${HARI[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1} `}${jam}`;
  els.whenNow.hidden = false;
}
els.when.value = toLocalInput(new Date());
els.when.addEventListener('click', () => { try { els.when.showPicker(); } catch { /* fokus biasa */ } });
els.when.addEventListener('focus', () => { if (!state.whenTouched) els.when.value = toLocalInput(new Date()); });
els.when.addEventListener('change', () => {
  state.whenTouched = !!els.when.value;
  syncWhenLabel();
  compute();
});
els.whenNow.addEventListener('click', () => {
  state.whenTouched = false;
  syncWhenLabel();
  compute();
});

// ── tampilan isi sheet ──
function showHome() {
  state.view = 'home';
  renderHome(els.content, () => tour.start());
}

// ── tur pengguna pertama ──
const tour = createTour({
  storageKey: 'tjrute.tour.v1',
  steps: [
    {
      title: 'Selamat datang di TJ Rute',
      text: 'Cari naik apa dari titik A ke B: Transjakarta, JakLingko, dan layanan lainnya. Enam langkah singkat, ±30 detik.',
      next: 'Mulai tur',
      before: () => { document.activeElement?.blur(); sheet.set('medium'); },
    },
    {
      title: 'Isi Dari dan Ke',
      text: 'Ketik nama halte, gedung, atau jalan. Halte muncul paling atas, tempat umum di bawahnya. Bisa juga pilih titik langsung di peta.',
      target: () => $('.route-form'),
    },
    {
      title: 'Lokasi dan jam berangkat',
      text: '"Lokasi saya" mengisi titik berangkat dari GPS. Ketuk "Berangkat sekarang" untuk memilih jam lain — jam operasi tiap layanan berbeda.',
      target: () => $('.chips'),
      radius: 20,
    },
    {
      title: 'Ketuk poni untuk buka-tutup',
      text: 'Ketuk poni ini untuk membesarkan panel, ketuk lagi untuk mengecilkan. Coba sekarang.',
      target: () => unionRect([$('.poni').getBoundingClientRect(), $('#grabber').getBoundingClientRect()]),
      radius: 16,
    },
    {
      title: 'Geser panel, ketuk peta',
      text: 'Geser daftar ke atas untuk melihat semua pilihan rute; tarik ke bawah dari atas daftar untuk mengecilkan. Ketuk peta untuk menurunkan panel agar garis rute terlihat.',
      target: () => els.sheet,
      before: () => sheet.set('medium'),
      radius: 12,
    },
    {
      title: 'Kenali jenis layanan',
      text: 'Ikon di depan nomor rute menunjukkan jenis layanan: bus BRT, bus Non-BRT, angkot JakLingko, dan lainnya. Daftar lengkapnya ada di sini.',
      target: () => $('.legend'),
      before: () => {
        if (state.view !== 'home') showHome();
        sheet.set('large');
        $('.legend')?.scrollIntoView({ block: 'nearest' });
      },
      radius: 10,
    },
  ],
  onEnd: () => sheet.set('medium'),
});

function restoreView() {
  if (state.items.length && state.from && state.to) showList();
  else if (state.from && state.to) compute();
  else showHome();
}

// ── titik A/B ──
function inputOf(which) { return which === 'from' ? els.from : els.to; }
function syncClear(which) {
  document.querySelector(`[data-clear="${which}"]`).hidden = !inputOf(which).value;
}

function setPoint(which, point) {
  state[which] = point;
  inputOf(which).value = point ? point.name : '';
  syncClear(which);
  map.setPoint(which, point);
  if (state.from && state.to) {
    state.active = null;
    document.activeElement?.blur();
    compute();
    return;
  }
  const other = which === 'from' ? 'to' : 'from';
  if (point && !state[other]) {
    inputOf(other).focus();
  } else {
    document.activeElement?.blur();
    showHome();
  }
  map.fitPoints();
}

document.querySelectorAll('.clear').forEach((b) => b.addEventListener('click', (e) => {
  e.preventDefault();
  const which = b.dataset.clear;
  state.items = [];
  map.clearItinerary();
  setPoint(which, null);
  inputOf(which).focus();
}));

function nearestStopLabel(lat, lon) {
  const near = nearbyStops(state.index, lat, lon, 300)[0];
  return near ? `Titik di peta (dekat ${state.network.stops.name[near.stop]})` : 'Titik di peta';
}

// ── saran ──
let suggestAbort = null;
let suggestTimer = 0;

function showSuggestions(which, result) {
  state.view = 'suggest';
  renderSuggestions(els.content, result,
    (item) => setPoint(which, { lat: item.lat, lon: item.lon, name: item.name }),
    () => startPick(which));
}

function onType(which) {
  state.active = which;
  syncClear(which);
  if (state[which]) { state[which] = null; map.setPoint(which, null); }
  const text = inputOf(which).value;
  clearTimeout(suggestTimer);
  if (suggestAbort) suggestAbort.abort();
  if (!state.search) return;
  if (!text.trim()) { showSuggestions(which, { stops: [], places: [], placesFailed: false, pending: false }); return; }
  showSuggestions(which, { stops: state.search.suggestStops(text), places: [], placesFailed: false, pending: text.trim().length >= 3 });
  suggestTimer = setTimeout(async () => {
    suggestAbort = new AbortController();
    try {
      const res = await state.search.suggest(text, suggestAbort.signal);
      if (inputOf(which).value === text && state.active === which) showSuggestions(which, { ...res, pending: false });
    } catch (e) {
      if (e.name !== 'AbortError') throw e;
    }
  }, 300);
}

// Ketukan pada daftar saran tidak boleh mencabut fokus input lebih dulu.
els.content.addEventListener('pointerdown', (e) => {
  if (state.view === 'suggest' && e.target.closest('button')) e.preventDefault();
});

for (const which of ['from', 'to']) {
  const input = inputOf(which);
  input.addEventListener('input', () => onType(which));
  input.addEventListener('focus', () => {
    state.active = which;
    sheet.set('large');
    input.select();
    if (input.value.trim() && !state[which]) onType(which);
    else showSuggestions(which, { stops: [], places: [], placesFailed: false, pending: false });
  });
  input.addEventListener('blur', () => setTimeout(() => {
    if (state.active !== which || document.activeElement === els.from || document.activeElement === els.to) return;
    state.active = null;
    // Teks yang diketik tanpa memilih saran dikembalikan ke titik yang tersimpan.
    if (state[which]) input.value = state[which].name;
    syncClear(which);
    if (state.view === 'suggest') {
      restoreView();
      sheet.set('medium');
    }
  }, 120));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const first = els.content.querySelector('[data-i]');
      if (first) { e.preventDefault(); first.click(); }
    } else if (e.key === 'Escape') input.blur();
  });
}

// ── pilih di peta ──
function startPick(which) {
  state.active = null;
  document.activeElement?.blur();
  els.pickLabel.textContent = which === 'from' ? 'berangkat' : 'tujuan';
  els.pickbar.hidden = false;
  sheet.set('small');
  map.onPick(({ lat, lon }) => {
    stopPick();
    setPoint(which, { lat, lon, name: nearestStopLabel(lat, lon) });
    if (!(state.from && state.to)) sheet.set('medium');
  });
}
function stopPick() {
  els.pickbar.hidden = true;
  map.onPick(null);
}
els.pickCancel.addEventListener('click', () => { stopPick(); restoreView(); sheet.set('medium'); });

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
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
  );
});

els.swap.addEventListener('click', () => {
  const { from, to } = state;
  state.from = to; state.to = from;
  els.from.value = to ? to.name : '';
  els.to.value = from ? from.name : '';
  syncClear('from'); syncClear('to');
  map.setPoint('from', state.from);
  map.setPoint('to', state.to);
  compute();
});

// ── hasil ──
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
  state.view = 'list';
  renderList(els.content, state.items, state.network, selectItem);
  els.content.scrollTop = 0;
  if (state.items[0]) loadShapes().then((shapes) => map.showItinerary(state.items[0].it, state.network, shapes));
}

async function selectItem(i) {
  state.view = 'detail';
  renderDetail(els.content, state.items[i], state.network, labels(), showList);
  els.content.scrollTop = 0;
  if (sheet.detent === 'small') sheet.set('medium');
  map.showItinerary(state.items[i].it, state.network, await loadShapes());
}

function emptyMessage() {
  const { from, to } = state;
  if (!nearbyStops(state.index, from.lat, from.lon, ACCESS_M).length) return 'Tidak ada halte dalam 1 km dari titik berangkat. Pilih titik yang lebih dekat ke halte.';
  if (!nearbyStops(state.index, to.lat, to.lon, ACCESS_M).length) return 'Tidak ada halte dalam 1 km dari tujuan. Pilih titik yang lebih dekat ke halte.';
  return 'Tidak ada layanan yang beroperasi untuk perjalanan ini pada jam tersebut. Ubah waktu berangkat lalu coba lagi.';
}

function compute() {
  if (!state.index || !state.from || !state.to) return;
  const dep = departure();
  const its = planAlternatives(state.index, { from: state.from, to: state.to, departSec: dep.sec, date: dep.date });
  state.items = its.map((it) => ({ it, fare: price(it, state.network) }));
  sheet.set('medium');
  if (!state.items.length) {
    state.view = 'empty';
    map.clearItinerary();
    map.fitPoints();
    renderEmpty(els.content, emptyMessage());
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
    if (state.active && inputOf(state.active).value) onType(state.active);
    // Tur hanya otomatis untuk pengguna baru yang belum mulai mengetik.
    if (!tour.seen && !state.active && !state.from && !state.to) setTimeout(() => tour.start(), 500);
  } catch (e) {
    showStatus('Data jaringan gagal dimuat. Periksa koneksi lalu muat ulang.', {
      sticky: true,
      action: { label: 'Muat ulang', run: () => location.reload() },
    });
    console.error(e);
  }
}

showHome();
load();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW gagal', e)));
}
