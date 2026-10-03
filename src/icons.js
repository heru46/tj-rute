// Ikon garis gaya SF Symbols: viewBox 24, stroke 2, ujung bulat, warna dari currentColor.
const svg = (body, extra = '') => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"${extra}>${body}</svg>`;

export const ICONS = {
  // layanan
  bus: svg('<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 10.5h14M8.5 20.5v-3.5M15.5 20.5v-3.5"/><circle cx="8.5" cy="14" r=".6" class="f"/><circle cx="15.5" cy="14" r=".6" class="f"/>'),
  busSide: svg('<path d="M3 16.5V7.5A1.5 1.5 0 0 1 4.5 6h13A3.5 3.5 0 0 1 21 9.5v7"/><path d="M3 16.5h18M3 11h18M9 6v5M15 6v5"/><circle cx="7.5" cy="17.5" r="1.6"/><circle cx="16.5" cy="17.5" r="1.6"/>'),
  van: svg('<path d="M2.5 16.5V8A2 2 0 0 1 4.5 6H14l4.5 4.5 2 1v5"/><path d="M2.5 16.5h18M2.5 11h16M9.5 6v5"/><circle cx="7" cy="17.5" r="1.6"/><circle cx="16.5" cy="17.5" r="1.6"/>'),
  coach: svg('<rect x="3" y="4" width="13" height="13" rx="2.5"/><path d="M3 10h13M6 20v-3M13 20v-3M18 9h3.5M19.5 7l2 2-2 2"/>'),
  crown: svg('<path d="M4 17.5h16M5 17.5 3.5 8l5 3.5L12 5l3.5 6.5 5-3.5L19 17.5"/>'),
  building: svg('<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 7h1.5M13.5 7H15M9 11h1.5M13.5 11H15M10.5 21v-4h3v4"/>'),
  camera: svg('<path d="M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>'),
  // umum
  walk: svg('<circle cx="13.5" cy="4" r="1.8" class="f"/><path d="M10 21l2.2-6.5 2.8 3V21M8 12.5l2.2-4.2 3.6.8 2.7 3.4M10.2 8.3 8.4 14"/>'),
  location: svg('<path d="M20 4 4 11l7 2 2 7z" class="f"/>'),
  clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  swap: svg('<path d="M8 4v15M8 4 4.5 7.5M8 4l3.5 3.5M16 20V5M16 20l-3.5-3.5M16 20l3.5-3.5"/>'),
  chevronRight: svg('<path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>'),
  chevronLeft: svg('<path d="M14.5 5.5 8 12l6.5 6.5"/>'),
  close: svg('<path d="m7 7 10 10M17 7 7 17"/>'),
  pin: svg('<path d="M12 21s-6.5-5.8-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.2 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.3"/>'),
  target: svg('<circle cx="12" cy="12" r="7"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/>'),
};
