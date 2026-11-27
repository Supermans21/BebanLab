# Arsitektur BebanLab

BebanLab dirancang agar ringan, nol dependensi pihak ketiga (*zero npm runtime dependencies*), dan akurat saat mengukur performa HTTP di mesin lokal maupun target jarak jauh yang diizinkan.

## 1. Isolasi Proses (*Process Isolation*)

```text
+-----------------------------------+        HTTP / Keep-Alive        +----------------------------------+
|  src/bench-server.mjs (Port 3000) | ------------------------------> | src/target-server.mjs (Port 3001)|
|  - Dashboard UI (public/)         |                                 | - Katalog 5.000 item in-memory   |
|  - LoadEngine (Worker Loops)      |  <---- GET /health (1s) ------  | - GET /api/products (ringan)     |
|  - Security Header Audit          |                                 | - GET /api/search (menengah)     |
|  - SSE Stream (/api/test/stream)  |                                 | - GET /api/heavy (PBKDF2 async)  |
|  - Persistence (data/runs.json)   |                                 | - Socket & RSS telemetry         |
+-----------------------------------+                                 +----------------------------------+
                 ^
                 | EventSource (SSE) + REST JSON
                 v
+-----------------------------------+
|     Browser UI (Hallmark Cobalt)  |
|  - Live Ruler Canvas Chart        |
|  - 50-Cell Monospace Load Meter   |
|  - Diagnosis (Simple + Technical) |
|  - Compare Runs & Print/PDF/MD    |
+-----------------------------------+
```

**Kenapa terpisah?**
Jika generator beban berjalan di event-loop yang sama dengan server target, CPU generator akan memengaruhi latensi target dan menghasilkan angka palsu. `src/start.mjs` menjalankan `src/target-server.mjs` lewat `child_process.fork()` agar masing-masing punya V8 isolate, event-loop, dan pemakaian memori sendiri. Jika port `3000` atau `3001` sedang dipakai aplikasi lain, `findAvailablePort` otomatis memilih port kosong berikutnya.

## 2. Mesin Uji Beban (`src/load-engine.mjs`)

- **Virtual User Loops:** Setiap VU berjalan sebagai loop asinkron terpisah (`spawnWorker`) menggunakan `http.Agent` / `https.Agent` dengan `keepAlive: true`, `scheduling: 'fifo'`, dan `maxSockets` yang diskalakan dinamis (`max(maxUsers + 128, 512)`).
- **Pencegahan Memory Leak:** `AbortController` menggunakan `setMaxListeners(0, signal)` dan setiap timer `sleep` maupun `executeOneRequest` selalu memanggil `signal.removeEventListener('abort', onAbort)` setelah selesai.
- **Akurasi Persentil (`Reservoir Sampling`):** Sampel latensi disimpan per detik untuk grafik real-time, sementara ringkasan akhir menggunakan *reservoir sampling* hingga `100.000` sampel agar RAM tetap hemat pada pengujian puluhan ribu request.
- **Pemisahan `okCount` vs Error:** Kecepatan sukses (`peakSuccessRps` & `avgSuccessRps`) hanya menghitung respons HTTP `2xx/3xx` agar permintaan yang gagal karena `ETIMEDOUT` tidak pernah salah dilaporkan sebagai throughput server.

## 3. Mesin Diagnosis Dua Lapis (`buildDiagnosis`)

Setiap hasil uji dianalisis menjadi 5 fase beban terukur (mengabaikan detik pemanasan jika `completed === 0`):
1. **Kapasitas aman terakhir (`safeCapacity`)** — beban tertinggi dengan `p95 <= 500 ms` dan `0%` error.
2. **Mulai melambat (`slowdownPoint`)** — titik pertama saat `p95 > 500 ms`.
3. **Error / timeout pertama (`firstErrorPoint`)** — detik pertama ketika `errCount > 0`.
4. **Titik jenuh (`breakingPoint`)** — detik pertama ketika `p95 > 1000 ms` atau `errorRate > 1%`.
5. **Mayoritas gagal & Down total (`downPoint` / `totalDownPoint`)** — `errorRate >= 50%` dan `okCount === 0`.

Setiap kesimpulan, fakta lapangan, dan rekomendasi disusun dalam dua lapis:
- **Bahasa Sederhana (Utama):** analogi antrean/kasir/pintu yang mudah dipahami siapa pun.
- **Pendukung Teknis:** metrik terukur dan langkah teknis konkret.

## 4. Audit Header Keamanan (`src/security-audit.mjs`)

`runSecurityAudit` melakukan permintaan HTTP/HTTPS `GET` nyata (mengikuti hingga 3 redirect) lalu memeriksa 8 aspek:
1. `HTTPS & HSTS` (`strict-transport-security`)
2. `Content-Security-Policy`
3. `Anti-Clickjacking` (`x-frame-options` / `frame-ancestors`)
4. `MIME Sniffing` (`x-content-type-options: nosniff`)
5. `Referrer-Policy`
6. `Permissions-Policy`
7. `Kebocoran Info Server` (`x-powered-by`, `server`)
8. `Keamanan Cookie` (`HttpOnly`, `Secure`, `SameSite`)

## 5. Sistem Antarmuka (Hallmark Cobalt)

Antarmuka dibangun di atas token `oklch(...)` tema **Cobalt** (`public/tokens.css` + `public/base.css` + `public/styles.css`) dengan tipe `shape: app screen` dan diverifikasi menggunakan `sloplint.mjs` (`0 FAIL`, `0 REFLEX`, `0 WARN`).
