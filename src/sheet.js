// Bottom sheet dengan tiga detent ala iOS: kecil (hanya kolom A/B), sedang, besar.
// Di layar lebar sheet menjadi panel samping tetap (lihat styles.css) dan tidak bisa ditarik.

const WIDE = window.matchMedia('(min-width: 760px)');

export function createSheet(el, { grabArea, head, onResize }) {
  let current = 'medium';

  function heights() {
    const vh = window.innerHeight;
    const top = 56; // sisakan sedikit peta di atas, seperti sheet besar iOS
    return {
      small: Math.min(vh * 0.5, head.offsetHeight + 28),
      medium: Math.round(vh * 0.52),
      large: vh - top,
    };
  }

  function apply(px, animate = true) {
    el.classList.toggle('no-anim', !animate);
    el.style.height = `${Math.round(px)}px`;
    onResize(WIDE.matches ? 0 : px);
  }

  function set(detent, animate = true) {
    current = detent;
    if (WIDE.matches) { el.style.height = ''; onResize(0); return; }
    apply(heights()[detent], animate);
  }

  // Tarik grabber/kepala sheet; lepas → kunci ke detent terdekat (atau searah lemparan).
  let start = null;
  grabArea.addEventListener('pointerdown', (e) => {
    if (WIDE.matches || e.target.closest('input, button, a')) return;
    start = { y: e.clientY, h: el.getBoundingClientRect().height, t: performance.now() };
    grabArea.setPointerCapture(e.pointerId);
  });
  grabArea.addEventListener('pointermove', (e) => {
    if (!start) return;
    const h = heights();
    const next = Math.max(h.small, Math.min(h.large, start.h + (start.y - e.clientY)));
    apply(next, false);
  });
  const end = (e) => {
    if (!start) return;
    const h = heights();
    const now = el.getBoundingClientRect().height;
    const velocity = (start.y - e.clientY) / Math.max(1, performance.now() - start.t); // px/ms, + = ke atas
    const moved = Math.abs(start.y - e.clientY);
    start = null;
    if (moved < 6) { // ketuk grabber: putar detent
      set(current === 'large' ? 'medium' : current === 'medium' ? 'small' : 'medium');
      return;
    }
    const order = ['small', 'medium', 'large'];
    let target;
    if (Math.abs(velocity) > 0.6) {
      const idx = order.indexOf(nearest(now, h));
      target = order[Math.max(0, Math.min(2, idx + (velocity > 0 ? 1 : -1)))];
    } else target = nearest(now, h);
    set(target);
  };
  grabArea.addEventListener('pointerup', end);
  grabArea.addEventListener('pointercancel', end);

  function nearest(px, h) {
    return Object.entries(h).reduce((a, b) => (Math.abs(b[1] - px) < Math.abs(a[1] - px) ? b : a))[0];
  }

  window.addEventListener('resize', () => set(current, false));
  WIDE.addEventListener('change', () => set(current, false));

  return {
    set,
    get detent() { return current; },
  };
}
