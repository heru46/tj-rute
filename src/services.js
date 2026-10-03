// Jenis layanan dari route_desc GTFS → nama yang dikenal penumpang, ikon, dan warna.
// Warna memakai varian kontras tinggi warna sistem iOS supaya teks putih tetap terbaca.
import { ICONS } from './icons.js';

export const SERVICES = [
  { cat: 'BRT', key: 'brt', name: 'Transjakarta BRT', short: 'BRT', icon: 'bus', color: '#0040DD', note: 'Koridor jalur khusus' },
  { cat: 'Angkutan Umum Integrasi', key: 'nonbrt', name: 'Transjakarta Non-BRT', short: 'Non-BRT', icon: 'busSide', color: '#0071A4', note: 'Lewat jalan umum, naik di halte & bus stop' },
  { cat: 'Mikrotrans', key: 'jaklingko', name: 'JakLingko (Mikrotrans)', short: 'JakLingko', icon: 'van', color: '#248A3D', note: 'Angkot, Rp0 — tetap tap kartu' },
  { cat: 'Transjabodetabek', key: 'jabodetabek', name: 'Transjabodetabek', short: 'Jabodetabek', icon: 'coach', color: '#3634A3', note: 'Ke Bekasi, Depok, Tangerang, Bogor' },
  { cat: 'Royaltrans', key: 'royal', name: 'Royaltrans', short: 'Royaltrans', icon: 'crown', color: '#C93400', note: 'Premium, tarif terpisah' },
  { cat: 'Rusun', key: 'rusun', name: 'Bus Rusun', short: 'Rusun', icon: 'building', color: '#7F6545', note: 'Melayani rumah susun' },
  { cat: 'Bus Wisata', key: 'wisata', name: 'Bus Wisata', short: 'Wisata', icon: 'camera', color: '#D30F45', note: 'Keliling tempat wisata, gratis' },
];

const BY_CAT = new Map(SERVICES.map((s) => [s.cat, s]));
const FALLBACK = { cat: '', key: 'lain', name: 'Transjakarta', short: 'TJ', icon: 'bus', color: '#636366', note: '' };

export function serviceOf(route) {
  return BY_CAT.get(route.cat) || FALLBACK;
}

export function serviceIcon(service) {
  return ICONS[service.icon] || ICONS.bus;
}
