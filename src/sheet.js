// Bottom sheet tiga detent ala iOS: kecil (hanya kolom A/B), sedang, besar.
//
// Gestur meniru sheet iOS:
// - Seluruh sheet bisa ditarik, termasuk daftar hasil. Di detent kecil/sedang,
//   geser daftar ke atas = sheet membesar (bukan menggulir isi).
// - Di detent besar, daftar menggulir biasa; tarik ke bawah saat sudah di
//   paling atas = sheet mengecil.
// - Tombol grabber: ketuk untuk membesar/mengecil.
// Di layar lebar sheet menjadi panel samping tetap (lihat styles.css).

const WIDE = window.matchMedia('(min-width: 760px)');
const ORDER = ['small', 'medium', 'large'];
const DRAG_SLOP = 6;     // px sebelum gerakan dianggap tarikan
const FLICK = 0.5;       // px/ms; lemparan secepat ini pindah satu detent searah

export function createSheet(el, { head, content, grabber, onResize, onChange = () => {} }) {
  let current = 'medium';

  function heights() {
    const vh = window.innerHeight;
    return {
      small: Math.min(vh * 0.45, head.offsetHeight + 8),
      medium: Math.round(vh * 0.52),
      large: vh - 56, // sisakan sedikit peta di atas, seperti sheet besar iOS
    };
  }

  function apply(px, animate = true) {
    el.classList.toggle('no-anim', !animate);
    el.style.height = `${Math.round(px)}px`;
    onResize(WIDE.matches ? 0 : px);
  }

  function set(detent, animate = true) {
    const changed = detent !== current;
    current = detent;
    el.dataset.detent = detent;
    grabber.setAttribute('aria-expanded', String(detent === 'large'));
    grabber.setAttribute('aria-label', detent === 'large' ? 'Perkecil panel' : 'Perbesar panel');
    if (WIDE.matches) { el.style.height = ''; onResize(0); return; }
    apply(heights()[detent], animate);
    if (changed) onChange(detent);
  }

  function nearest(px, h) {
    return ORDER.reduce((a, b) => (Math.abs(h[b] - px) < Math.abs(h[a] - px) ? b : a));
  }

  function snap(px, velocity) {
    const h = heights();
    const base = nearest(px, h);
    if (Math.abs(velocity) < FLICK) return base;
    // Lemparan: dari posisi sekarang, ambil detent berikutnya searah gerakan.
    const up = velocity > 0;
    const candidates = ORDER.filter((d) => (up ? h[d] > px + 1 : h[d] < px - 1));
    if (!candidates.length) return base;
    return up ? candidates[0] : candidates[candidates.length - 1];
  }

  // ── Sentuhan (HP) ──
  let g = null;
  el.addEventListener('touchstart', (e) => {
    if (WIDE.matches || e.touches.length !== 1) { g = null; return; }
    const t = e.touches[0];
    g = {
      y0: t.clientY, x0: t.clientX, h0: el.getBoundingClientRect().height,
      inContent: content.contains(e.target), dragging: null,
      lastY: t.clientY, lastT: performance.now(), v: 0,
    };
  }, { passive: true });

  el.addEventListener('touchmove', (e) => {
    if (!g) return;
    const t = e.touches[0];
    const dy = t.clientY - g.y0; // + = jari turun
    if (g.dragging === null) {
      if (Math.abs(dy) < DRAG_SLOP && Math.abs(t.clientX - g.x0) < DRAG_SLOP) return;
      if (Math.abs(t.clientX - g.x0) > Math.abs(dy)) { g.dragging = false; return; } // geser horizontal (chip)
      if (!g.inContent) g.dragging = true;
      else if (current !== 'large') g.dragging = true;
      else g.dragging = content.scrollTop <= 0 && dy > 0;
    }
    if (!g.dragging) return;
    e.preventDefault();
    const now = performance.now();
    g.v = (g.lastY - t.clientY) / Math.max(1, now - g.lastT); // + = ke atas
    g.lastY = t.clientY;
    g.lastT = now;
    const h = heights();
    let next = g.h0 - dy;
    // Karet di luar batas, seperti iOS.
    if (next > h.large) next = h.large + (next - h.large) * 0.25;
    if (next < h.small) next = h.small - (h.small - next) * 0.25;
    apply(next, false);
  }, { passive: false });

  const end = () => {
    if (!g) return;
    const wasDragging = g.dragging;
    const v = g.v;
    g = null;
    if (!wasDragging) return;
    set(snap(el.getBoundingClientRect().height, v));
  };
  el.addEventListener('touchend', end);
  el.addEventListener('touchcancel', end);

  // ── Mouse (jendela sempit di PC): tarik dari kepala sheet ──
  let m = null;
  head.addEventListener('pointerdown', (e) => {
    if (WIDE.matches || e.pointerType !== 'mouse' || e.target.closest('input, button, a')) return;
    m = { y0: e.clientY, h0: el.getBoundingClientRect().height, lastY: e.clientY, lastT: performance.now(), v: 0 };
    head.setPointerCapture(e.pointerId);
  });
  head.addEventListener('pointermove', (e) => {
    if (!m) return;
    const now = performance.now();
    m.v = (m.lastY - e.clientY) / Math.max(1, now - m.lastT);
    m.lastY = e.clientY;
    m.lastT = now;
    const h = heights();
    apply(Math.max(h.small, Math.min(h.large, m.h0 - (e.clientY - m.y0))), false);
  });
  head.addEventListener('pointerup', () => {
    if (!m) return;
    const v = m.v;
    m = null;
    set(snap(el.getBoundingClientRect().height, v));
  });

  // Tombol grabber: kecil → sedang → besar; besar → sedang.
  grabber.addEventListener('click', () => {
    set(current === 'large' ? 'medium' : current === 'medium' ? 'large' : 'medium');
  });

  window.addEventListener('resize', () => set(current, false));
  WIDE.addEventListener('change', () => set(current, false));

  return {
    set,
    get detent() { return current; },
  };
}
