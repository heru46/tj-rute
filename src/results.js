// Daftar opsi dan detail langkah. Detail digambar sebagai "peta strip" —
// rel vertikal berwarna rute dengan titik halte, seperti peta rute di atas pintu bus.
import { clock, duration, rupiah, meters, escapeHtml as esc } from './format.js';

function chip(route) {
  return `<span class="chip" style="--c:#${route.color};--t:#${route.text}">${esc(route.short)}</span>`;
}

const WALK_ICON = '<svg class="walk-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="13" cy="4" r="2"/><path d="M10 22l2-7 3 3v6M8 12l2-4 4 1 3 4M10 8l-2 6"/></svg>';

function legSummary(it, network) {
  const parts = [];
  for (const leg of it.legs) {
    if (leg.type === 'walk') {
      if (leg.meters >= 150 || it.rides === 0) parts.push(`<span class="walkbit">${WALK_ICON}<small>${Math.max(1, Math.round(leg.sec / 60))}</small></span>`);
    } else {
      parts.push(chip(network.routes[leg.route]));
    }
  }
  return parts.join('<span class="sep" aria-hidden="true">›</span>');
}

export function renderList(el, items, network, onSelect) {
  el.innerHTML = `<ol class="options">${items.map(({ it, fare }, i) => {
    const transit = it.rides > 1 ? `${it.rides - 1}× pindah` : it.rides === 1 ? 'Langsung' : 'Jalan kaki';
    return `<li><button type="button" class="option" data-i="${i}">
      <span class="opt-top">
        <span class="opt-dur">${duration(it.arriveSec - it.departSec)}</span>
        <span class="opt-time">${clock(it.departSec)} – ${clock(it.arriveSec)}</span>
      </span>
      <span class="opt-legs">${legSummary(it, network)}</span>
      <span class="opt-meta">${transit} · jalan ${meters(it.walkMeters)} · ${rupiah(fare.total)}</span>
    </button></li>`;
  }).join('')}</ol>`;
  el.querySelectorAll('.option').forEach((b) => b.addEventListener('click', () => onSelect(Number(b.dataset.i))));
}

function stopName(network, s) {
  return network.stops.name[s];
}

export function renderDetail(el, item, network, labels, onBack) {
  const { it, fare } = item;
  const rows = [];
  let rideIdx = 0;

  // Titik A/B hanya ditampilkan sendiri bila ada jalan kaki dari/ke halte;
  // bila A atau B tepat di halte, simpul halte sudah mewakilinya.
  if (it.legs[0].type === 'walk') {
    rows.push(`<li class="node node-end"><span class="node-time">${clock(it.departSec)}</span><b>${esc(labels.from)}</b></li>`);
  }

  it.legs.forEach((leg, i) => {
    if (leg.type === 'walk') {
      const target = i === it.legs.length - 1 ? labels.to : `Halte ${leg.to.name}`;
      rows.push(`<li class="seg seg-walk"><span class="seg-txt">${WALK_ICON} Jalan ${meters(leg.meters)} · ${duration(leg.sec)} ke ${esc(target)}</span></li>`);
      return;
    }
    const route = network.routes[leg.route];
    const pat = network.patterns[leg.pattern];
    const between = pat.stops.slice(leg.fromPos + 1, leg.toPos);
    const nStops = leg.toPos - leg.fromPos;
    const paid = fare.perLeg[rideIdx++];
    rows.push(`<li class="node node-board" style="--c:#${route.color}">
      <span class="node-time">${clock(leg.boardSec)}</span>
      <b>${esc(stopName(network, leg.fromStop))}</b>
      <small>Tunggu ±${duration(leg.waitSec)}${paid ? ` · tap ${rupiah(paid)}` : paid === 0 && route.fare.startsWith('FP') ? ' · tanpa bayar lagi' : ''}</small>
    </li>`);
    rows.push(`<li class="seg seg-ride" style="--c:#${route.color}">
      <span class="seg-txt">${chip(route)} <span>arah <b>${esc(pat.head || route.long)}</b></span></span>
      <span class="seg-sub">${esc(route.long)} · ${esc(route.cat)}</span>
      <details><summary>${nStops} halte · ${duration(leg.alightSec - leg.boardSec)}</summary>
        <ol class="via">${between.map((s) => `<li>${esc(stopName(network, s))}</li>`).join('') || '<li>Langsung ke halte berikutnya</li>'}</ol>
      </details>
    </li>`);
    rows.push(`<li class="node node-alight" style="--c:#${route.color}"><span class="node-time">${clock(leg.alightSec)}</span><b>Turun di ${esc(stopName(network, leg.toStop))}</b></li>`);
  });

  if (it.legs[it.legs.length - 1].type === 'walk') {
    rows.push(`<li class="node node-end node-dest"><span class="node-time">${clock(it.arriveSec)}</span><b>${esc(labels.to)}</b></li>`);
  }

  el.innerHTML = `<div class="detail-head">
      <button type="button" class="back" aria-label="Kembali ke daftar pilihan">‹</button>
      <div><span class="opt-dur">${duration(it.arriveSec - it.departSec)}</span>
      <span class="opt-meta">${clock(it.departSec)} – ${clock(it.arriveSec)} · ${rupiah(fare.total)}</span></div>
    </div>
    <ol class="strip">${rows.join('')}</ol>
    <p class="fine">Waktu tunggu dan tempuh adalah perkiraan dari jadwal GTFS Transjakarta, bukan posisi bus langsung.</p>`;
  el.querySelector('.back').addEventListener('click', onBack);
}
