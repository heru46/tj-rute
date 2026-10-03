// Jarak dan waktu jalan kaki. Jalan kaki memakai garis lurus × faktor 1,3
// (jalan sungguhan jarang lurus) dengan kecepatan 1,25 m/s (≈ 4,5 km/jam).

export const WALK_FACTOR = 1.3;
export const WALK_SPEED = 1.25;

const R = 6371008.8;
const RAD = Math.PI / 180;

export function haversine(aLat, aLon, bLat, bLon) {
  const dLat = (bLat - aLat) * RAD;
  const dLon = (bLon - aLon) * RAD;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * RAD) * Math.cos(bLat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function walkSec(meters) {
  return Math.round((meters * WALK_FACTOR) / WALK_SPEED);
}

/** Jarak tegak lurus titik p ke ruas a–b, dalam meter (proyeksi equirectangular lokal). */
export function pointSegmentMeters(p, a, b) {
  const kx = 111320 * Math.cos(p[0] * RAD);
  const ky = 110574;
  const ax = (a[1] - p[1]) * kx, ay = (a[0] - p[0]) * ky;
  const bx = (b[1] - p[1]) * kx, by = (b[0] - p[0]) * ky;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
  const x = ax + t * dx, y = ay + t * dy;
  return Math.sqrt(x * x + y * y);
}
