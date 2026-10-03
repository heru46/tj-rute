// Tur singkat untuk pengguna pertama: sorotan (spotlight) pada elemen nyata +
// kartu penjelasan. Lapisan gelap tidak menghalangi ketukan, jadi pengguna bisa
// langsung mencoba (mis. mengetuk poni) saat tur berjalan. Tampil sekali; bisa
// diulang dari beranda.

const PAD = 6;

export function unionRect(rects) {
  const r = rects.filter(Boolean);
  if (!r.length) return null;
  const left = Math.min(...r.map((x) => x.left));
  const top = Math.min(...r.map((x) => x.top));
  const right = Math.max(...r.map((x) => x.right));
  const bottom = Math.max(...r.map((x) => x.bottom));
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

export function createTour({ steps, storageKey, onEnd = () => {} }) {
  let root = null;
  let index = 0;
  let raf = 0;
  let last = '';

  const seen = () => {
    try { return localStorage.getItem(storageKey) === '1'; } catch { return false; }
  };
  const markSeen = () => {
    try { localStorage.setItem(storageKey, '1'); } catch { /* mode privat */ }
  };

  function build() {
    root = document.createElement('div');
    root.className = 'tour';
    root.innerHTML = `<div class="tour-spot"></div>
      <div class="tour-card" role="dialog" aria-modal="false" aria-labelledby="tour-title" aria-describedby="tour-text">
        <div class="tour-dots" aria-hidden="true">${steps.map(() => '<i></i>').join('')}</div>
        <h3 id="tour-title"></h3>
        <p id="tour-text"></p>
        <div class="tour-actions">
          <button type="button" class="text-btn tour-skip">Lewati</button>
          <button type="button" class="tour-next"></button>
        </div>
      </div>`;
    document.body.appendChild(root);
    root.querySelector('.tour-skip').addEventListener('click', end);
    root.querySelector('.tour-next').addEventListener('click', next);
    document.addEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (!root) return;
    if (e.key === 'Escape') end();
    else if ((e.key === 'Enter' || e.key === 'ArrowRight') && !e.target.closest('input')) { e.preventDefault(); next(); }
  }

  async function show(i) {
    index = i;
    const step = steps[i];
    if (step.before) await step.before();
    const card = root.querySelector('.tour-card');
    root.querySelector('#tour-title').textContent = step.title;
    root.querySelector('#tour-text').textContent = step.text;
    root.querySelector('.tour-skip').hidden = i === steps.length - 1;
    const nextBtn = root.querySelector('.tour-next');
    nextBtn.textContent = step.next || (i === steps.length - 1 ? 'Mulai pakai' : 'Lanjut');
    root.querySelectorAll('.tour-dots i').forEach((d, k) => d.classList.toggle('on', k === i));
    card.classList.remove('in');
    void card.offsetWidth;
    card.classList.add('in');
    last = '';
  }

  function targetRect() {
    const t = steps[index].target ? steps[index].target() : null;
    if (!t) return null;
    const r = typeof t.getBoundingClientRect === 'function' ? t.getBoundingClientRect() : t;
    if (!r || (r.width === 0 && r.height === 0)) return null;
    // Potong ke layar supaya kartu tidak diletakkan di luar pandangan.
    const vh = window.innerHeight, vw = window.innerWidth;
    const top = Math.max(0, r.top), bottom = Math.min(vh, r.bottom);
    const left = Math.max(0, r.left), right = Math.min(vw, r.right);
    return { top, left, bottom, right, width: right - left, height: bottom - top };
  }

  // Ikuti target tiap frame: sheet beranimasi dan pengguna boleh berinteraksi.
  function tick() {
    if (!root) return;
    const r = targetRect();
    const key = r ? `${r.top|0},${r.left|0},${r.width|0},${r.height|0}` : 'none';
    if (key !== last) {
      last = key;
      place(r);
    }
    raf = requestAnimationFrame(tick);
  }

  function place(r) {
    const spot = root.querySelector('.tour-spot');
    const card = root.querySelector('.tour-card');
    const vw = window.innerWidth, vh = window.innerHeight;
    const radius = steps[index].radius ?? 14;
    if (!r) {
      Object.assign(spot.style, { top: `${vh / 2}px`, left: `${vw / 2}px`, width: '0px', height: '0px', borderRadius: '0px' });
      Object.assign(card.style, { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' });
      return;
    }
    Object.assign(spot.style, {
      top: `${r.top - PAD}px`, left: `${r.left - PAD}px`,
      width: `${r.width + PAD * 2}px`, height: `${r.height + PAD * 2}px`, borderRadius: `${radius}px`,
    });
    const cw = card.offsetWidth, ch = card.offsetHeight;
    const gap = 14;
    const below = r.bottom + PAD + gap;
    const above = r.top - PAD - gap - ch;
    let top;
    if (vh - below >= ch + 12 && (r.top + r.height / 2 < vh / 2 || above < 12)) top = below;
    else if (above >= 12) top = above;
    else top = Math.max(12, Math.min(vh - ch - 12, below));
    const left = Math.max(12, Math.min(vw - cw - 12, r.left + r.width / 2 - cw / 2));
    Object.assign(card.style, { top: `${top}px`, left: `${left}px`, transform: 'none' });
  }

  function next() {
    if (index < steps.length - 1) show(index + 1);
    else end();
  }

  function end() {
    if (!root) return;
    cancelAnimationFrame(raf);
    document.removeEventListener('keydown', onKey);
    root.remove();
    root = null;
    markSeen();
    onEnd();
  }

  return {
    start() {
      if (root) return;
      build();
      show(0).then(() => { raf = requestAnimationFrame(tick); });
    },
    get seen() { return seen(); },
    get open() { return !!root; },
  };
}
