// Format tampilan berbahasa Indonesia.

export function clock(sec) {
  const s = ((Math.round(sec) % 86400) + 86400) % 86400;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, '0')}.${String(m).padStart(2, '0')}`;
}

export function duration(sec) {
  const total = Math.max(1, Math.round(sec / 60));
  if (total < 60) return `${total} mnt`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} j ${m} mnt` : `${h} j`;
}

export function rupiah(n) {
  return n === 0 ? 'Gratis' : `Rp${n.toLocaleString('id-ID')}`;
}

export function meters(m) {
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

export function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
