# Kōro

Panduan naik Transjakarta dari titik A ke B: rute, tempat pindah, waktu, dan tarif.
Webapp statis; rute dihitung di browser dari GTFS resmi Transjakarta.

Live: https://heru46.github.io/tj-rute/ — buka di HP, lalu "Tambahkan ke Layar Utama".

## Jalankan lokal

```bash
npm run serve        # http://127.0.0.1:8080
```

## Perbarui data GTFS

```bash
npm run data:fresh   # unduh ulang gtfs.transjakarta.co.id → data/*.json
npm test
```

## Batasan

- Waktu tunggu = setengah headway GTFS; bukan posisi bus langsung.
- Jalan kaki dihitung garis lurus × 1,3 pada 4,5 km/jam; maksimal 1 km ke/dari halte, 400 m saat pindah.
- GPS di HP hanya jalan lewat HTTPS (GitHub Pages) atau `localhost`.
