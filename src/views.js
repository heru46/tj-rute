// Isi sheet: beranda (jenis layanan), saran lokasi, daftar pilihan rute, detail rute.
// Gaya daftar mengikuti inset grouped list iOS; detail memakai rel vertikal berwarna rute.
import { clock, duration, rupiah, meters, escapeHtml as esc } from './format.js';
import { ICONS } from './icons.js';
import { SERVICES, serviceOf, serviceIcon } from './services.js';

/** Chip rute: ikon jenis layanan + nomor rute, berlatar warna rute GTFS. */
export function routeChip(route) {
  const svc = serviceOf(route);
  return `<span class="rchip" style="--c:#${route.color};--t:#${route.text}" title="${esc(svc.name)} ${esc(route.short)}">${serviceIcon(svc)}<b>${esc(route.short)}</b></span>`;
}

function serviceTag(svc) {
  return `<span class="stag" style="--s:${svc.color}">${serviceIcon(svc)}${esc(svc.name)}</span>`;
}

export function renderHome(el) {
  el.innerHTML = `<h2 class="section-title">Jenis layanan</h2>
    <ul class="group legend">${SERVICES.map((s) => `<li class="cell">
      <span class="badge" style="--s:${s.color}">${serviceIcon(s)}</span>
      <span class="cell-text"><b>${esc(s.name)}</b><small>${esc(s.note)}</small></span>
    </li>`).join('')}</ul>
    <p class="footnote">Data rute, halte, dan jadwal dari GTFS resmi Transjakarta.</p>`;
}

export function renderSuggestions(el, { stops, places, placesFailed, pending }, onPick, onPickMap) {
  const items = [...stops, ...places];
  const cell = (item, i) => `<li><button type="button" class="cell cell-btn" data-i="${i}">
      <span class="badge ${item.kind === 'stop' ? 'badge-stop' : 'badge-place'}">${item.kind === 'stop' ? ICONS.bus : ICONS.pin}</span>
      <span class="cell-text"><b>${esc(item.name)}</b>${item.detail ? `<small>${esc(item.detail)}</small>` : ''}</span>
    </button></li>`;
  const notes = [];
  if (pending) notes.push('Mencari tempat…');
  if (placesFailed) notes.push('Pencarian tempat sedang tidak tersedia. Halte tetap bisa dipilih.');
  if (!pending && !placesFailed && !items.length) notes.push('Tidak ditemukan. Coba nama halte, gedung, atau jalan.');
  el.innerHTML = `${items.length ? `<ul class="group">${items.map(cell).join('')}</ul>` : ''}
    ${notes.map((n) => `<p class="footnote">${esc(n)}</p>`).join('')}
    <ul class="group"><li><button type="button" class="cell cell-btn" data-pickmap="1">
      <span class="badge badge-tint">${ICONS.target}</span>
      <span class="cell-text"><b class="tint">Pilih di peta</b></span>
    </button></li></ul>`;
  el.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => onPick(items[Number(b.dataset.i)])));
  el.querySelector('[data-pickmap]').addEventListener('click', onPickMap);
}

function legStrip(it, network) {
  const parts = [];
  for (const leg of it.legs) {
    if (leg.type === 'walk') {
      if (leg.meters >= 150 || it.rides === 0) parts.push(`<span class="walkbit">${ICONS.walk}<small>${Math.max(1, Math.round(leg.sec / 60))}</small></span>`);
    } else parts.push(routeChip(network.routes[leg.route]));
  }
  return parts.join(`<span class="sep">${ICONS.chevronRight}</span>`);
}

export function renderList(el, items, network, onSelect) {
  el.innerHTML = `<h2 class="section-title">${items.length} pilihan rute</h2>
    <ul class="group">${items.map(({ it, fare }, i) => {
      const transit = it.rides > 1 ? `${it.rides - 1}× pindah` : it.rides === 1 ? 'Langsung' : 'Jalan kaki';
      const svcNames = [...new Set(it.legs.filter((l) => l.type === 'ride').map((l) => serviceOf(network.routes[l.route]).short))];
      return `<li><button type="button" class="cell cell-btn option" data-i="${i}">
        <span class="opt">
          <span class="opt-row"><b class="opt-dur">${duration(it.arriveSec - it.departSec)}</b><span class="opt-fare">${rupiah(fare.total)}</span></span>
          <span class="opt-legs">${legStrip(it, network)}</span>
          <small class="opt-meta">${clock(it.departSec)}–${clock(it.arriveSec)} · ${transit}${svcNames.length ? ` · ${esc(svcNames.join(', '))}` : ''} · jalan ${meters(it.walkMeters)}</small>
        </span>
        <span class="disclosure">${ICONS.chevronRight}</span>
      </button></li>`;
    }).join('')}</ul>
    <p class="footnote">Perkiraan dari jadwal GTFS Transjakarta (tunggu = setengah jarak antarbus), bukan posisi bus langsung.</p>`;
  el.querySelectorAll('.option').forEach((b) => b.addEventListener('click', () => onSelect(Number(b.dataset.i))));
}

export function renderEmpty(el, message) {
  el.innerHTML = `<div class="empty"><span class="badge badge-place">${ICONS.pin}</span><p>${esc(message)}</p></div>`;
}

export function renderDetail(el, item, network, labels, onBack) {
  const { it, fare } = item;
  const rows = [];
  let rideIdx = 0;
  const name = (s) => network.stops.name[s];

  if (it.legs[0].type === 'walk') {
    rows.push(`<li class="node node-a"><time>${clock(it.departSec)}</time><b>${esc(labels.from)}</b></li>`);
  }
  it.legs.forEach((leg, i) => {
    if (leg.type === 'walk') {
      const target = i === it.legs.length - 1 ? labels.to : leg.to.name;
      rows.push(`<li class="seg seg-walk"><span class="seg-line">${ICONS.walk}Jalan ${meters(leg.meters)} · ${duration(leg.sec)}<span class="muted"> ke ${esc(target)}</span></span></li>`);
      return;
    }
    const route = network.routes[leg.route];
    const svc = serviceOf(route);
    const pat = network.patterns[leg.pattern];
    const between = pat.stops.slice(leg.fromPos + 1, leg.toPos);
    const paid = fare.perLeg[rideIdx++];
    const payNote = paid > 0 ? `Tap ${rupiah(paid)}` : route.fare.startsWith('FP') ? 'Tanpa bayar lagi' : 'Rp0 · tetap tap kartu';
    rows.push(`<li class="node" style="--c:#${route.color}"><time>${clock(leg.boardSec)}</time><b>${esc(name(leg.fromStop))}</b>
      <small>Tunggu ±${duration(leg.waitSec)} · ${payNote}</small></li>`);
    rows.push(`<li class="seg seg-ride" style="--c:#${route.color}">
      <span class="seg-line">${routeChip(route)}<span>arah <b>${esc(pat.head || route.long)}</b></span></span>
      ${serviceTag(svc)}
      <details><summary>${leg.toPos - leg.fromPos} halte · ${duration(leg.alightSec - leg.boardSec)}${ICONS.chevronRight}</summary>
        <ol class="via">${between.map((s) => `<li>${esc(name(s))}</li>`).join('') || '<li>Langsung ke halte berikutnya</li>'}</ol>
      </details>
    </li>`);
    rows.push(`<li class="node" style="--c:#${route.color}"><time>${clock(leg.alightSec)}</time><b>Turun di ${esc(name(leg.toStop))}</b></li>`);
  });
  if (it.legs[it.legs.length - 1].type === 'walk') {
    rows.push(`<li class="node node-b"><time>${clock(it.arriveSec)}</time><b>${esc(labels.to)}</b></li>`);
  }

  el.innerHTML = `<div class="nav">
      <button type="button" class="back">${ICONS.chevronLeft}Pilihan</button>
    </div>
    <div class="detail-title">
      <h2>${duration(it.arriveSec - it.departSec)}</h2>
      <p>${clock(it.departSec)}–${clock(it.arriveSec)} · ${rupiah(fare.total)}</p>
    </div>
    <ol class="strip">${rows.join('')}</ol>
    <p class="footnote">Waktu adalah perkiraan dari jadwal GTFS Transjakarta, bukan posisi bus langsung.</p>`;
  el.querySelector('.back').addEventListener('click', onBack);
}
