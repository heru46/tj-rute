# TJ Rute — perencana perjalanan Transjakarta (desain)

Tanggal: 2026-10-03
Status: disetujui di chat, menunggu review spec

## Tujuan

Webapp mobile untuk pemakaian pribadi: pengguna memilih titik A dan B, app menjawab
"naik apa, turun di mana, pindah di mana, berapa lama, berapa tarif" dengan seluruh
layanan Transjakarta. Mirip mode transit Google Maps, khusus jaringan Transjakarta.

## Batasan yang sudah diputuskan

- App baru terpisah di `D:\Claude-Code\tj-rute`, tidak bergantung pada repo ruangkita.
- Hosting: GitHub Pages di akun pengguna (`heru46`), repo public. HTTPS wajib karena
  Geolocation API di HP hanya jalan di secure context.
- Semua rute dihitung di browser. Tidak ada server sendiri.
- Layanan yang dihitung: BRT, Angkutan Umum Integrasi, Mikrotrans, Transjabodetabek,
  Royaltrans, Rusun, Bus Wisata (semua `route_desc` di GTFS).
- Waktu tunggu dan waktu tempuh adalah perkiraan dari jadwal GTFS (headway), bukan
  posisi bus real-time.

## Sumber data

| Data | Sumber | Catatan |
| --- | --- | --- |
| Jaringan, halte, urutan halte, waktu tempuh, headway, tarif | GTFS resmi `https://gtfs.transjakarta.co.id/files/file_gtfs.zip` | Dicek 2026-10-03: 240 rute, 8.091 halte (7.819 dipakai), 700 trip, 753 baris `frequencies.txt`, 26.427 `stop_times`, 14 `transfers`. Semua trip berbasis frekuensi. |
| Pencarian tempat | Photon `https://photon.komoot.io/api/` dengan `bbox=106.4,-6.75,107.2,-6.0` | Dicek: CORS `*`, mengembalikan koordinat. |
| Peta dasar | Tile CARTO Voyager + atribusi OSM/CARTO | Online saja. |
| Peta | Leaflet 1.9.4, disimpan lokal di `vendor/` | Supaya app shell bisa di-cache. |

## Arsitektur

Situs statis, JavaScript ES module tanpa framework dan tanpa bundler.

```
tj-rute/
  index.html, manifest.webmanifest, sw.js, icons/
  src/
    app.js          state UI + alur layar
    search.js       saran tempat: halte lokal + Photon
    router.js       mesin rute murni (tanpa DOM) — bisa dites di Node
    fare.js         hitung tarif per itinerary
    geo.js          jarak haversine, waktu jalan kaki
    map.js          Leaflet: penanda A/B, gambar leg
    format.js       teks langkah, durasi, rupiah
  data/
    network.json    halte, pola trip, headway, transfer, tarif (hasil build)
    shapes.json     polyline per pola (dimuat saat detail dibuka)
  scripts/
    build-data.mjs  unduh GTFS → data/*.json
  test/
    router.test.mjs, fare.test.mjs (node:test, fixture kecil)
```

Unit dan antarmukanya:

- `router.plan({ from, to, departSec, date, network }) → Itinerary[]` — murni, deterministik.
- `fare.price(itinerary, network) → { total, perLeg }`.
- `search.suggest(text) → Promise<Place[]>` — halte dulu (lokal, instan), lalu tempat dari Photon.
- `map.showItinerary(itinerary, shapes)` — satu-satunya modul yang menyentuh Leaflet.

## Build data (`npm run data`)

1. Unduh dan ekstrak zip GTFS.
2. Halte: hanya yang dipakai `stop_times`. Simpan id, nama, lat, lon. Halte dengan
   `parent_station` digabung namanya untuk pencarian.
3. Pola: tiap trip → daftar halte + offset detik kumulatif dari `stop_times`
   (`arrival_time` relatif terhadap halte pertama), `route_id`, `trip_headsign`,
   `service_id`, `shape_id`, dan jendela frekuensi `[mulai, selesai, headway]`.
4. Rute: nama pendek, nama panjang, kategori (`route_desc`), warna.
5. Transfer jalan kaki: pasangan halte berjarak ≤ 400 m (garis lurus), ditambah
   `transfers.txt`. Dihitung sekali saat build dengan grid spasial.
6. Kalender: `calendar.txt` → hari aktif per `service_id`.
7. Tarif: `fare_attributes` + `fare_rules` → harga per rute dan `transfer_duration`.
8. Shape: disederhanakan Douglas-Peucker toleransi ~5 m, ditulis ke `shapes.json`.

Validasi build gagal keras bila: file GTFS wajib hilang, pola tanpa frekuensi, atau
halte pola tidak ditemukan.

## Mesin rute

Algoritma RAPTOR berbasis ronde (satu ronde = satu kali naik kendaraan), disesuaikan
untuk trip berfrekuensi.

- **Akses/egress:** halte dalam 1.000 m dari A atau B. Waktu jalan =
  jarak garis lurus × 1,3 ÷ 1,25 m/s (≈ 4,5 km/jam).
- **Naik:** di halte i pada waktu t, pola bisa dinaiki bila layanan aktif pada tanggal
  itu dan ada jendela frekuensi yang memuat `t − offset_i`. Waktu tunggu = headway ÷ 2
  (nilai harapan). Bila t sebelum jendela berikutnya, tunggu sampai jendela itu buka.
- **Turun:** tiba di halte j = t + tunggu + (offset_j − offset_i).
- **Transfer:** lewat jalur jalan kaki hasil build, plus penalti transfer 2 menit.
- **Ronde maksimum:** 4 kendaraan.
- **Alternatif:** hasil terbaik per jumlah kendaraan (Pareto waktu × transfer), lalu
  pencarian ulang dengan mengecualikan rute utama tiap hasil untuk mendapat variasi.
  Duplikat dibuang, maksimum 5, diurutkan dari waktu tiba.
- **Jalan kaki langsung:** bila A–B ≤ 1.000 m, tampilkan opsi "jalan kaki saja".

## Tarif

Pemetaan diambil dari `fare_rules.txt` (dicek 2026-10-03, tanpa aturan origin/destination):

- `FP`/`FP2` Rp3.500 — BRT, Angkutan Umum Integrasi, Rusun, dan 18 rute Transjabodetabek.
  Dibayar sekali selama perpindahan antar-rute ber-tarif FP/FP2 masih dalam
  `transfer_duration` 10.800 detik sejak tap pertama.
- `GR` Rp0 — Mikrotrans dan Bus Wisata.
- `PP` Rp20.000 / `PP3` Rp35.000 — Royaltrans, dibayar per leg.
- Tarif ditampilkan sebagai perkiraan; tarif khusus pagi (05.00–07.00) tidak dimodelkan.

## Layar (mobile-first)

1. **Peta penuh** sebagai latar.
2. **Kartu atas:** input "Dari" dan "Ke", tombol tukar, tombol "Lokasi saya", pemilih
   waktu berangkat (default: sekarang).
3. **Saran:** halte cocok (ikon bus) di atas, tempat dari Photon di bawah. Debounce 300 ms.
   Mode "pilih di peta": ketuk peta untuk menetapkan titik.
4. **Bottom sheet hasil:** tiap opsi menampilkan jam berangkat–tiba, total durasi,
   chip rute berwarna (mis. `1` → `9`), jumlah transit, jalan kaki total, tarif.
5. **Detail:** langkah berurutan — jalan ke halte, naik rute X arah Y, jumlah halte,
   turun di Z, transfer, jalan ke tujuan. Leg digambar di peta (warna rute; jalan kaki
   garis putus-putus). Daftar halte per leg bisa dibuka.

## PWA dan performa

- Manifest + ikon supaya bisa "Tambahkan ke layar utama".
- Service worker: app shell cache-first; `data/*.json` stale-while-revalidate.
- Target: `network.json` ≤ 1,5 MB (gzip oleh GitHub Pages), pencarian rute < 500 ms di HP
  kelas menengah.

## Penanganan galat

- GPS ditolak/gagal → pesan singkat dan fokus ke input "Dari".
- Photon gagal → saran halte tetap tampil, plus catatan "pencarian tempat sedang tidak
  tersedia".
- Tidak ada rute → tampilkan alasan (di luar jam operasi / tidak ada halte dalam 1 km)
  dan saran mengubah waktu atau titik.
- Data gagal dimuat → layar galat dengan tombol muat ulang.

## Pengujian

- `node --test`: router pada jaringan fixture kecil — naik langsung, satu transfer,
  tunggu headway, jendela frekuensi tutup, hari layanan, batas 4 kendaraan, akses 1 km.
- `node --test`: tarif — integrasi sekali bayar, Mikrotrans gratis, Royaltrans per leg,
  batas 3 jam.
- Uji build: jumlah halte/pola sesuai GTFS, semua pola punya frekuensi.
- Smoke test browser di viewport 390×844: Blok M → Bundaran HI, lokasi via GPS palsu,
  rute dengan transfer, mode offline setelah kunjungan pertama.

## Di luar cakupan

- Posisi bus real-time, kepadatan, penutupan halte.
- KRL, MRT, LRT (tidak ada di GTFS Transjakarta).
- Rute jalan kaki mengikuti jaringan jalan (dipakai garis lurus × 1,3).
- Akun pengguna, riwayat di server.
