# Referensi API BebanLab

Semua endpoint berada di server dashboard (`http://localhost:3000` secara default).

## 1. Status & Kesehatan

### `GET /api/health`
Mengecek kondisi proses dashboard BebanLab.

**Contoh respons `200 OK`:**
```json
{
  "status": "ok",
  "service": "bebanlab-dashboard",
  "uptimeSec": 12.4,
  "targetPort": 3001,
  "running": false,
  "activeRunId": null
}
```

### `GET /api/status`
Mengembalikan status eksekusi uji beban aktif serta URL target demo yang sedang berjalan.

---

## 2. Pengujian Beban (*Load Testing*)

### `POST /api/test/start`
Memulai sesi uji beban baru. Mengembalikan `202 Accepted` beserta `runId` dan konfigurasi tervalidasi (atau `409 Conflict` jika ada pengujian lain yang masih berjalan).

**Body JSON:**
```json
{
  "url": "http://localhost:3001/api/products",
  "method": "GET",
  "mode": "step",
  "startUsers": 10,
  "maxUsers": 100,
  "stepUsers": 20,
  "stepIntervalSec": 5,
  "durationSec": 25,
  "thinkTimeMs": 100,
  "timeoutMs": 5000,
  "headers": {
    "X-Test": "1"
  },
  "body": "",
  "allowRemote": false
}
```

- `mode`: `"ramp"` (linear per detik), `"step"` (naik per tangga), atau `"constant"`.
- `allowRemote`: wajib `true` untuk target selain `localhost` / jaringan lokal privat (`127.0.0.1`, `10.x`, `192.168.x`, `172.16-31.x`).

### `POST /api/test/stop`
Menghentikan pengujian yang sedang berjalan lebih awal dan tetap menghitung ringkasan + diagnosis dari data yang sudah terkumpul.

### `GET /api/test/stream`
Endpoint **Server-Sent Events (SSE)** yang mengirimkan event secara langsung:
- `state` — status berjalan/berhenti saat koneksi dibuka atau tes dimulai.
- `tick` — data agregasi per detik (`sec`, `activeUsers`, `rps`, `okCount`, `p50Ms`, `p95Ms`, `p99Ms`, `errorRate`, `kbPerSec`, `targetHealth`).
- `done` — objek hasil lengkap (`summary`, `verdict`, `diagnosis`, `timeline`).
- `error` — pesan error jika terjadi gangguan runtime.

---

## 3. Riwayat Pengujian

### `GET /api/runs`
Mengambil daftar maksimal 50 sesi pengujian terakhir dari `data/runs.json`.

### `DELETE /api/runs/:id`
Menghapus satu sesi pengujian berdasarkan `id`.

---

## 4. Audit Keamanan Header HTTP

### `POST /api/audit`
Memeriksa header keamanan HTTP aktual dari URL target.

**Body JSON:**
```json
{
  "url": "http://localhost:3001/"
}
```

**Contoh respons `200 OK` (ringkas):**
```json
{
  "url": "http://localhost:3001/",
  "finalUrl": "http://localhost:3001/",
  "statusCode": 200,
  "latencyMs": 4.82,
  "score": 2.5,
  "maxScore": 7,
  "summary": {
    "level": "kurang",
    "title": "Beberapa pengaman penting belum terpasang",
    "simple": "Dari 7 gembok pengaman yang dicek...",
    "technical": "HTTP 200..."
  },
  "checks": [],
  "rawHeaders": {}
}
```

---

## 5. Website Target Demo Terisolasi (`http://localhost:3001`)

- `GET /` — Halaman demo katalog interaktif (`?hardened=1` untuk mengaktifkan header keamanan lengkap).
- `GET /api/products` — JSON ringan (24 dari 5.000 item katalog in-memory).
- `GET /api/search?q=<kata>` — Filter & sortir 5.000 item katalog.
- `GET /api/heavy` — Simulasi beban CPU nyata dengan `crypto.pbkdf2` (`25.000` iterasi SHA-256).
- `GET /health` — Telemetri proses (`pid`, `rssMB`, `heapUsedMB`, `activeConnections`, `activeRequests`).
