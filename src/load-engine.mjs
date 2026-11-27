import EventEmitter, { setMaxListeners } from 'node:events';
import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const ALLOWED_MODES = new Set(['ramp', 'step', 'constant']);
const MAX_RESERVOIR = 100000;

export function isLocalHostname(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (LOCAL_HOSTS.has(host)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  const m172 = /^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(host);
  if (m172) {
    const second = Number(m172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

function round2(val) {
  return Number((Number.isFinite(val) ? val : 0).toFixed(2));
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  const safeIdx = Math.max(0, Math.min(sorted.length - 1, idx));
  return sorted[safeIdx];
}

function summarizeLatencies(latencies) {
  if (!latencies.length) {
    return { avgMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, minMs: 0, maxMs: 0 };
  }
  const sorted = [...latencies].sort((a, b) => a - b);
  let sum = 0;
  for (let i = 0; i < sorted.length; i += 1) sum += sorted[i];
  return {
    avgMs: round2(sum / sorted.length),
    p50Ms: round2(percentile(sorted, 50)),
    p95Ms: round2(percentile(sorted, 95)),
    p99Ms: round2(percentile(sorted, 99)),
    minMs: round2(sorted[0]),
    maxMs: round2(sorted[sorted.length - 1]),
  };
}

function sanitizeHeaders(rawHeaders) {
  const out = {};
  if (!rawHeaders || typeof rawHeaders !== 'object' || Array.isArray(rawHeaders)) {
    return out;
  }
  for (const [k, v] of Object.entries(rawHeaders)) {
    const key = String(k || '').trim();
    if (!key || /[\r\n]/.test(key)) continue;
    const val = String(v ?? '').replace(/[\r\n]+/g, ' ').trim();
    out[key] = val;
  }
  return out;
}

export function validateConfig(input = {}) {
  const rawUrl = String(input.url || '').trim();
  if (!rawUrl) {
    throw new Error('URL target wajib diisi.');
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Format URL tidak valid. Gunakan http:// atau https://.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Protokol harus http: atau https:.');
  }

  const isLocal = isLocalHostname(parsed.hostname);
  const allowRemote = Boolean(input.allowRemote);

  if (!isLocal && !allowRemote) {
    throw new Error(
      'Target eksternal membutuhkan konfirmasi bahwa Anda memiliki izin untuk menguji domain tersebut.'
    );
  }

  const maxUsers = Number.parseInt(input.maxUsers, 10);
  if (!Number.isFinite(maxUsers) || maxUsers < 1) {
    throw new Error('Jumlah user maksimal minimal 1.');
  }

  const durationSec = Number.parseInt(input.durationSec, 10);
  if (!Number.isFinite(durationSec) || durationSec < 1) {
    throw new Error('Durasi pengujian minimal 1 detik.');
  }

  const rawMode = String(input.mode || 'ramp').toLowerCase();
  const mode = ALLOWED_MODES.has(rawMode) ? rawMode : 'ramp';

  let startUsers = maxUsers;
  if (mode !== 'constant') {
    const requestedStart = Number.parseInt(input.startUsers, 10);
    if (Number.isFinite(requestedStart) && requestedStart >= 1) {
      startUsers = Math.min(maxUsers, requestedStart);
    } else {
      startUsers = Math.max(1, Math.min(maxUsers, Math.ceil(maxUsers * 0.1)));
    }
  }

  const stepUsersRaw = Number.parseInt(input.stepUsers, 10);
  const stepUsers =
    Number.isFinite(stepUsersRaw) && stepUsersRaw >= 1
      ? stepUsersRaw
      : Math.max(1, Math.ceil((maxUsers - startUsers) / 4));

  const stepIntervalRaw = Number.parseInt(input.stepIntervalSec, 10);
  const stepIntervalSec =
    Number.isFinite(stepIntervalRaw) && stepIntervalRaw >= 1 ? stepIntervalRaw : 5;

  const method = String(input.method || 'GET').toUpperCase();
  if (!ALLOWED_METHODS.has(method)) {
    throw new Error('Metode HTTP harus GET, POST, PUT, PATCH, atau DELETE.');
  }

  const thinkTimeMsRaw =
    input.thinkTimeMs === undefined ? 50 : Number.parseInt(input.thinkTimeMs, 10);
  const thinkTimeMs =
    Number.isFinite(thinkTimeMsRaw) && thinkTimeMsRaw >= 0 ? thinkTimeMsRaw : 0;

  const timeoutMsRaw =
    input.timeoutMs === undefined ? 5000 : Number.parseInt(input.timeoutMs, 10);
  const timeoutMs =
    Number.isFinite(timeoutMsRaw) && timeoutMsRaw >= 100 ? timeoutMsRaw : 5000;

  const headers = sanitizeHeaders(input.headers);
  const sendsBody = method === 'POST' || method === 'PUT' || method === 'PATCH';
  const body = sendsBody && input.body !== undefined ? String(input.body) : undefined;

  return {
    url: parsed.toString(),
    origin: parsed.origin,
    hostname: parsed.hostname,
    isLocal,
    allowRemote,
    mode,
    startUsers,
    maxUsers,
    stepUsers,
    stepIntervalSec,
    durationSec,
    method,
    thinkTimeMs,
    timeoutMs,
    headers,
    body,
  };
}

function pollTargetHealth(targetOrigin, targetPort) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(targetOrigin);
    } catch {
      resolve(null);
      return;
    }
    const defaultPort = parsed.protocol === 'https:' ? '443' : '80';
    const actualPort = parsed.port || defaultPort;
    if (
      parsed.protocol !== 'http:' ||
      !isLocalHostname(parsed.hostname) ||
      String(actualPort) !== String(targetPort)
    ) {
      resolve(null);
      return;
    }

    const req = http.get(`${parsed.origin}/health`, { timeout: 500 }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        raw += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw));
        } catch {
          resolve(null);
        }
      });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.on('error', () => resolve(null));
  });
}

function buildVerdict(summary, config) {
  const { totalRequests, okCount, errorRate, p95Ms, peakSuccessRps, peakRps, breakingPoint } = summary;
  const shownRps = peakSuccessRps ?? peakRps;
  if (totalRequests === 0 || okCount === 0) {
    const simple = `Bayangkan toko buka selama ${config.durationSec} detik, tapi semua ${totalRequests} tamu yang datang tidak ada satu pun yang berhasil dilayani (gagal ${errorRate}%). Web belum siap menerima pengunjung atau alamatnya sedang mati.`;
    const technical = `Target ${config.url} mengembalikan 0 respons 2xx/3xx dari ${totalRequests} percobaan (errorRate ${errorRate}%, durasi ${summary.actualDurationSec} dtk).`;
    return {
      level: 'kewalahan',
      title: 'Tidak ada respons berhasil diterima',
      simple,
      technical,
      explanation: simple,
    };
  }

  if (errorRate > 5 || p95Ms > 2000) {
    const bpUsers = breakingPoint ? breakingPoint.activeUsers : config.maxUsers;
    const simple = `Saat tamu masih sedikit, website masih bisa melayani maksimal ${shownRps} orang per detik. Tapi begitu antrean menyentuh sekitar ${bpUsers} orang bersamaan, kasir kewalahan: halaman mulai lemot banget dan ${errorRate}% pengunjung gagal masuk.`;
    const bpText = breakingPoint
      ? `Titik jenuh pada detik ke-${breakingPoint.sec} (${breakingPoint.activeUsers} user, p95 ${breakingPoint.p95Ms} ms, error ${breakingPoint.errorRate}%).`
      : `Latensi p95 ${p95Ms} ms dengan error ${errorRate}%.`;
    const technical = `${bpText} Puncak sukses ${shownRps} req/dtk, total ${okCount}/${totalRequests} sukses, p95 keseluruhan ${p95Ms} ms.`;
    return {
      level: 'kewalahan',
      title: 'Server mulai kewalahan di beban puncak',
      simple,
      technical,
      explanation: simple,
    };
  }

  if (errorRate > 0.5 || p95Ms > 500 || breakingPoint) {
    const bpUsers = breakingPoint ? breakingPoint.activeUsers : config.maxUsers;
    const simple = `Websitenya masih hidup sampai ${config.maxUsers} orang datang bersamaan, tapi mulai terasa antre dan agak lambat saat menyentuh sekitar ${bpUsers} orang (tercepatnya mampu melayani ${shownRps} permintaan per detik).`;
    const bpText = breakingPoint
      ? `Melewati batas 1000 ms atau error >1% pada detik ke-${breakingPoint.sec} (${breakingPoint.activeUsers} user).`
      : `Latensi p95 ${p95Ms} ms dengan error ${errorRate}%.`;
    const technical = `${bpText} Puncak sukses ${shownRps} req/dtk, ${okCount}/${totalRequests} request 2xx/3xx, p95 keseluruhan ${p95Ms} ms.`;
    return {
      level: 'melambat',
      title: 'Server tetap hidup tetapi mulai melambat',
      simple,
      technical,
      explanation: simple,
    };
  }

  const simple = `Mantap! Sampai ${config.maxUsers} orang datang bersamaan, semuanya terlayani cepat tanpa error (mampu melayani hingga ${shownRps} permintaan per detik). Batas tumbangnya belum ketemu di angka ini.`;
  const technical = `${okCount}/${totalRequests} request sukses (error ${errorRate}%), latensi p95 ${p95Ms} ms, puncak sukses ${shownRps} req/dtk.`;
  return {
    level: 'kuat',
    title: `Kuat menahan hingga ${config.maxUsers} user bersamaan`,
    simple,
    technical,
    explanation: simple,
  };
}

function buildDiagnosis(summary, config, timeline, statusCounts, errorCounts) {
  const withTotals = timeline.map((pt) => {
    const errCount = pt.err4xx + pt.err5xx + pt.netErr;
    const completed = pt.okCount + errCount;
    return { ...pt, errCount, completed };
  });

  const activeTicks = withTotals.filter((pt) => pt.completed > 0);
  const safeTicks = activeTicks.filter((pt) => pt.p95Ms <= 500 && pt.errorRate === 0 && pt.okCount > 0);
  const lastSafe = safeTicks.length ? safeTicks[safeTicks.length - 1] : null;
  const safeCapacity = lastSafe
    ? {
        sec: lastSafe.sec,
        activeUsers: lastSafe.activeUsers,
        rps: lastSafe.okCount,
        p95Ms: lastSafe.p95Ms,
        errorRate: lastSafe.errorRate,
      }
    : null;

  const slowPt = activeTicks.find((pt) => pt.p95Ms > 500) || null;
  const slowdownPoint = slowPt
    ? {
        sec: slowPt.sec,
        activeUsers: slowPt.activeUsers,
        rps: slowPt.okCount,
        p95Ms: slowPt.p95Ms,
        errorRate: slowPt.errorRate,
      }
    : null;

  const firstErrPt = activeTicks.find((pt) => pt.errCount > 0) || null;
  const firstErrorPoint = firstErrPt
    ? {
        sec: firstErrPt.sec,
        activeUsers: firstErrPt.activeUsers,
        rps: firstErrPt.okCount,
        p95Ms: firstErrPt.p95Ms,
        errorRate: firstErrPt.errorRate,
        errCount: firstErrPt.errCount,
      }
    : null;

  const breakingPoint = summary.breakingPoint || null;

  const downPt = activeTicks.find((pt) => pt.errCount > 0 && pt.errorRate >= 50) || null;
  const downPoint = downPt
    ? {
        sec: downPt.sec,
        activeUsers: downPt.activeUsers,
        rps: downPt.okCount,
        p95Ms: downPt.p95Ms,
        errorRate: downPt.errorRate,
        errCount: downPt.errCount,
      }
    : null;

  const totalDownPt = activeTicks.find((pt) => pt.errCount > 0 && pt.okCount === 0) || null;
  const totalDownPoint = totalDownPt
    ? {
        sec: totalDownPt.sec,
        activeUsers: totalDownPt.activeUsers,
        rps: 0,
        p95Ms: totalDownPt.p95Ms,
        errorRate: totalDownPt.errorRate,
        errCount: totalDownPt.errCount,
      }
    : null;

  let peakPt = null;
  for (const pt of activeTicks) {
    if (!peakPt || pt.okCount > peakPt.okCount) peakPt = pt;
  }
  const peakRpsPoint = peakPt
    ? {
        sec: peakPt.sec,
        activeUsers: peakPt.activeUsers,
        rps: peakPt.okCount,
        totalRps: peakPt.rps,
        p95Ms: peakPt.p95Ms,
      }
    : null;

  const healthTicks = timeline.filter((pt) => pt.targetHealth);
  const targetMemory = healthTicks.length
    ? {
        startRssMB: healthTicks[0].targetHealth.rssMB,
        peakRssMB: Math.max(...healthTicks.map((pt) => pt.targetHealth.rssMB || 0)),
        peakConnections: Math.max(
          ...healthTicks.map((pt) => pt.targetHealth.activeConnections || 0)
        ),
      }
    : null;

  const errEntries = [];
  for (const [code, count] of Object.entries(statusCounts || {})) {
    const num = Number(code);
    if (num >= 400 && count > 0) errEntries.push({ code: `HTTP ${code}`, count });
  }
  for (const [code, count] of Object.entries(errorCounts || {})) {
    if (count > 0) errEntries.push({ code, count });
  }
  errEntries.sort((a, b) => b.count - a.count);

  const factItems = [];
  if (safeCapacity) {
    factItems.push({
      phase: 'Kapasitas aman',
      simple: `Sampai ${safeCapacity.activeUsers} orang bersamaan, website masih lancar banget (${safeCapacity.rps} pengunjung dilayani per detik tanpa gagal).`,
      technical: `Batas aman terakhir di detik ke-${safeCapacity.sec}: ${safeCapacity.activeUsers} VU, ${safeCapacity.rps} sukses/dtk, p95 ${safeCapacity.p95Ms} ms, error 0%.`,
    });
  } else if (activeTicks.length) {
    const first = activeTicks[0];
    factItems.push({
      phase: 'Respons awal',
      simple: `Dari awal dites (${first.activeUsers} orang), website sudah terasa agak lama menunggu atau ada yang gagal.`,
      technical: `Respons pertama selesai di detik ke-${first.sec} (${first.activeUsers} VU): p95 ${first.p95Ms} ms, error ${first.errorRate}%.`,
    });
  }

  if (peakRpsPoint) {
    factItems.push({
      phase: 'Kecepatan puncak',
      simple: `Kecepatan paling tinggi website ini adalah ${peakRpsPoint.rps} orang berhasil dilayani dalam 1 detik (saat ada ${peakRpsPoint.activeUsers} orang mengakses bareng).`,
      technical: `Peak successful throughput: ${peakRpsPoint.rps} req/dtk (total selesai ${peakRpsPoint.totalRps} req/dtk) pada detik ke-${peakRpsPoint.sec} di ${peakRpsPoint.activeUsers} VU, p95 ${peakRpsPoint.p95Ms} ms.`,
    });
  }

  if (slowdownPoint) {
    factItems.push({
      phase: 'Mulai lambat',
      simple: `Begitu menyentuh ${slowdownPoint.activeUsers} orang bersamaan, halaman mulai terasa berat dan butuh lebih dari setengah detik untuk terbuka.`,
      technical: `Slowdown (p95 > 500 ms) terdeteksi pada detik ke-${slowdownPoint.sec} di ${slowdownPoint.activeUsers} VU (p95 ${slowdownPoint.p95Ms} ms, ${slowdownPoint.rps} sukses/dtk).`,
    });
  }

  if (firstErrorPoint) {
    factItems.push({
      phase: 'Mulai ada yang gagal',
      simple: `Pada angka ${firstErrorPoint.activeUsers} orang bersamaan, mulai ada ${firstErrorPoint.errCount} pengunjung yang gagal atau kelamaan menunggu.`,
      technical: `Error/timeout pertama pada detik ke-${firstErrorPoint.sec} di ${firstErrorPoint.activeUsers} VU: ${firstErrorPoint.errCount} gagal vs ${firstErrorPoint.rps} sukses (errorRate ${firstErrorPoint.errorRate}%).`,
    });
  }

  if (breakingPoint) {
    factItems.push({
      phase: 'Titik jenuh',
      simple: `Di ${breakingPoint.activeUsers} orang bersamaan, antrean sudah macet (waktu tunggu lewat 1 detik atau error muncul).`,
      technical: `Breaking point (p95 > 1000 ms atau error > 1%) pada detik ke-${breakingPoint.sec}: ${breakingPoint.activeUsers} VU, p95 ${breakingPoint.p95Ms} ms, error ${breakingPoint.errorRate}%.`,
    });
  }

  if (downPoint) {
    factItems.push({
      phase: 'Mayoritas gagal',
      simple: `Saat menyentuh ${downPoint.activeUsers} orang bersamaan, lebih dari separuh pengunjung (${downPoint.errorRate}%) gagal membuka halaman.`,
      technical: `Degradasi berat (>= 50% error) pada detik ke-${downPoint.sec} di ${downPoint.activeUsers} VU: ${downPoint.errCount} gagal vs ${downPoint.rps} sukses (${downPoint.errorRate}%).`,
    });
  }

  if (totalDownPoint) {
    factItems.push({
      phase: 'Down total',
      simple: `Pada titik ${totalDownPoint.activeUsers} orang bersamaan, website benar-benar lumpuh (0 orang yang berhasil masuk, ${totalDownPoint.errCount} gagal semua).`,
      technical: `Down total (okCount = 0) mulai detik ke-${totalDownPoint.sec} di ${totalDownPoint.activeUsers} VU (${totalDownPoint.errCount} gagal, p95 ${totalDownPoint.p95Ms} ms).`,
    });
  } else if (!downPoint) {
    factItems.push({
      phase: 'Ketahanan hidup',
      simple: `Selama tes hingga ${config.maxUsers} orang bersamaan, website tidak sampai tumbang/down total.`,
      technical: `Tidak ada detik dengan errorRate >= 50% sepanjang ${summary.actualDurationSec} detik pengujian hingga ${config.maxUsers} VU.`,
    });
  }

  if (targetMemory) {
    factItems.push({
      phase: 'Memori server',
      simple: `Pemakaian RAM server target naik dari ${targetMemory.startRssMB} MB menjadi ${targetMemory.peakRssMB} MB dengan ${targetMemory.peakConnections} jalur terbuka bersamaan.`,
      technical: `Target process RSS ${targetMemory.startRssMB} MB -> puncak ${targetMemory.peakRssMB} MB; peak activeConnections ${targetMemory.peakConnections}.`,
    });
  }

  if (errEntries.length) {
    const errText = errEntries.map((e) => `${e.code} (${e.count}x)`).join(', ');
    factItems.push({
      phase: 'Jenis gangguan',
      simple: `Penyebab gagalnya permintaan adalah antrean terlalu lama atau koneksi terputus di tengah jalan.`,
      technical: `Distribusi error aktual: ${errText}.`,
    });
  }

  const facts = factItems.map((item) => item.technical);

  const recommendations = [];
  const hasConnErr = errEntries.some((e) =>
    ['ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'ECONNABORTED'].includes(e.code)
  );
  const hasTimeout = errEntries.some((e) => e.code === 'ETIMEDOUT');
  const has429 = errEntries.some((e) => e.code === 'HTTP 429');
  const has5xx = errEntries.some((e) => /^HTTP 5\d\d$/.test(e.code));

  if (hasConnErr) {
    recommendations.push({
      area: 'Stabilitas koneksi & proses server',
      simpleIssue: 'Pintu masuk server penuh atau menutup sambungan mendadak saat ramai.',
      simpleSolution: 'Tambah jumlah pintu masuk (banyak pekerja server sekaligus) dan pastikan server otomatis nyala lagi kalau sempat jatuh.',
      issue: 'Terjadi penolakan atau pemutusan socket (ECONNREFUSED/ECONNRESET) saat beban naik.',
      solution:
        'Periksa log crash aplikasi, naikkan batas socket/listen backlog OS, aktifkan PM2/Node cluster di semua core CPU, dan pasang reverse proxy (Nginx/Caddy) dengan keep-alive.',
    });
  }

  if (hasTimeout || summary.p95Ms > 1000 || breakingPoint) {
    const triggerUsers = firstErrorPoint
      ? firstErrorPoint.activeUsers
      : breakingPoint
        ? breakingPoint.activeUsers
        : slowdownPoint?.activeUsers || config.maxUsers;
    recommendations.push({
      area: 'Antrean CPU, event-loop, dan database',
      simpleIssue: `Server mulai kewalahan dan membuat antrean panjang sekitar ${triggerUsers} pengunjung bersamaan.`,
      simpleSolution:
        'Simpan salinan halaman yang sering dibuka (cache) agar tidak dihitung ulang terus-menerus, dan rapikan pencarian data biar lebih cepat.',
      issue: `Server kewalahan (latensi > 1000 ms / timeout) mulai sekitar ${triggerUsers} user bersamaan.`,
      solution:
        'Pindahkan komputasi sinkron/berat ke Worker Threads atau antrean background, tambahkan cache halaman/API (Redis atau CDN seperti Cloudflare), serta optimalkan query dan indeks database.',
    });
  }

  if (has5xx) {
    recommendations.push({
      area: 'Error aplikasi / upstream (HTTP 5xx)',
      simpleIssue: 'Bagian dalam server mengalami macet atau kehabisan jatah koneksi saat pengunjung membludak.',
      simpleSolution: 'Cek catatan error server, perbesar jatah sambungan ke database, dan pasang pengaman batas waktu.',
      issue: 'Server mengembalikan status 5xx saat permintaan memuncak.',
      solution:
        'Cek stack trace error di server, perbesar ukuran connection pool database, dan tambahkan graceful timeout serta fallback agar kegagalan satu layanan tidak merembet.',
    });
  }

  if (has429) {
    recommendations.push({
      area: 'Rate limiting (HTTP 429)',
      simpleIssue: 'Satpam server sengaja menahan tamu yang datang terlalu cepat.',
      simpleSolution: 'Jika memang untuk cegah serangan, biarkan saja; kalau tamu asli ikut terblokir, longgarkan batas per menitnya.',
      issue: 'Sebagian permintaan ditolak oleh pembatas laju (rate limiter).',
      solution:
        'Jika ini batas perlindungan yang disengaja, perilaku sudah benar; jika untuk user sah, sesuaikan kuota per IP atau gunakan token-bucket per user terautentikasi.',
    });
  }

  if (!hasConnErr && !hasTimeout && !has5xx && summary.p95Ms > 300 && summary.p95Ms <= 1000) {
    recommendations.push({
      area: 'Optimasi kecepatan respons',
      simpleIssue: `Website masih aman, tetapi waktu tunggu (${summary.p95Ms} ms) mulai terasa agak lambat untuk sebagian pengunjung.`,
      simpleSolution: 'Kecilkan ukuran halaman yang dikirim (kompresi) dan aktifkan cache supaya tampil lebih ngebut.',
      issue: `Latensi ekor p95 tercatat ${summary.p95Ms} ms, masih hidup tetapi mulai terasa lambat bagi user.`,
      solution:
        'Aktifkan kompresi Gzip/Brotli, terapkan HTTP cache header untuk konten statis/semi-statis, dan lakukan profiling pada handler yang paling lama.',
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      area: 'Uji batas lanjutan',
      simpleIssue: `Sampai ${config.maxUsers} orang bersamaan masih lancar semua (tidak ada yang gagal).`,
      simpleSolution: 'Coba naikkan lagi jumlah user (misalnya 2x atau 3x lipat) dan nol-kan jeda antar request untuk mencari batas maksimalnya.',
      issue: `Target stabil hingga ${config.maxUsers} user (p95 ${summary.p95Ms} ms, error ${summary.errorRate}%).`,
      solution:
        'Untuk mengetahui titik patah sebenarnya, naikkan User maksimal (misalnya 2x hingga 3x lipat) atau turunkan Jarak antar request ke 0 ms pada skenario berikutnya.',
    });
  }

  return {
    safeCapacity,
    slowdownPoint,
    firstErrorPoint,
    breakingPoint,
    downPoint,
    totalDownPoint,
    peakRpsPoint,
    targetMemory,
    dominantErrors: errEntries,
    factItems,
    facts,
    recommendations,
  };
}

export class LoadEngine extends EventEmitter {
  constructor({ targetPort = Number(process.env.TARGET_PORT || 3001) } = {}) {
    super();
    this.targetPort = targetPort;
    this.running = false;
    this.activeRunId = null;
    this.abortController = null;
    this.agent = null;
  }

  getStatus() {
    return {
      running: this.running,
      activeRunId: this.activeRunId,
    };
  }

  stop() {
    if (!this.running || !this.abortController) return false;
    this.abortController.abort();
    return true;
  }

  async start(rawInput) {
    if (this.running) {
      const err = new Error('Pengujian beban lain sedang berjalan.');
      err.statusCode = 409;
      throw err;
    }

    const config = validateConfig(rawInput);
    const runId = crypto.randomUUID();
    const parsedUrl = new URL(config.url);
    const isHttps = parsedUrl.protocol === 'https:';
    const transport = isHttps ? https : http;

    const agent = new transport.Agent({
      keepAlive: true,
      maxSockets: Math.max(config.maxUsers + 128, 512),
      maxFreeSockets: Math.min(Math.max(config.maxUsers, 128), 512),
      scheduling: 'fifo',
    });

    this.running = true;
    this.activeRunId = runId;
    this.agent = agent;
    this.abortController = new AbortController();
    const { signal } = this.abortController;
    setMaxListeners(0, signal);

    const startedAt = new Date().toISOString();
    const startWall = performance.now();

    const reservoir = [];
    let seenLatencies = 0;
    const statusCounts = {};
    const errorCounts = {};
    const timeline = [];
    let totalRequests = 0;
    let totalOk = 0;
    let total4xx = 0;
    let total5xx = 0;
    let totalNetErr = 0;
    let totalBytes = 0;

    const pushLatencySample = (ms) => {
      seenLatencies += 1;
      if (reservoir.length < MAX_RESERVOIR) {
        reservoir.push(ms);
      } else {
        const j = Math.floor(Math.random() * seenLatencies);
        if (j < MAX_RESERVOIR) {
          reservoir[j] = ms;
        }
      }
    };

    let bucket = {
      latencies: [],
      okCount: 0,
      err4xx: 0,
      err5xx: 0,
      netErr: 0,
      bytes: 0,
    };

    const computeTargetUsersForSec = (sec) => {
      if (config.mode === 'constant') return config.maxUsers;
      if (config.mode === 'step') {
        const stepsPassed = Math.floor((sec - 1) / config.stepIntervalSec);
        return Math.min(config.maxUsers, config.startUsers + stepsPassed * config.stepUsers);
      }
      if (config.durationSec <= 1) return config.maxUsers;
      const ratio = Math.min(1, Math.max(0, (sec - 1) / (config.durationSec - 1)));
      return Math.round(config.startUsers + (config.maxUsers - config.startUsers) * ratio);
    };

    let currentTargetUsers = computeTargetUsersForSec(1);
    let activeWorkers = 0;
    const workerPromises = new Set();

    const sleep = (ms) =>
      new Promise((resolve) => {
        if (ms <= 0 || signal.aborted) {
          resolve();
          return;
        }
        let timer = null;
        const onAbort = () => {
          if (timer) clearTimeout(timer);
          resolve();
        };
        timer = setTimeout(() => {
          signal.removeEventListener('abort', onAbort);
          resolve();
        }, ms);
        signal.addEventListener('abort', onAbort, { once: true });
      });

    const executeOneRequest = () =>
      new Promise((resolve) => {
        if (signal.aborted) {
          resolve();
          return;
        }

        const reqStart = performance.now();
        let settled = false;
        let bytesReceived = 0;

        const headers = {
          'User-Agent': 'BebanLab-LoadEngine/1.0',
          Connection: 'keep-alive',
          ...config.headers,
        };
        const sendsBody =
          config.method === 'POST' || config.method === 'PUT' || config.method === 'PATCH';
        const payload = sendsBody && config.body !== undefined ? config.body : null;
        if (payload !== null) {
          if (!Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
            headers['Content-Type'] = 'application/json';
          }
          headers['Content-Length'] = Buffer.byteLength(payload);
        }

        const req = transport.request(
          parsedUrl,
          {
            method: config.method,
            agent,
            headers,
            timeout: config.timeoutMs,
          },
          (res) => {
            const code = res.statusCode || 0;
            const codeKey = String(code);
            statusCounts[codeKey] = (statusCounts[codeKey] || 0) + 1;

            res.on('data', (chunk) => {
              bytesReceived += chunk.length;
            });

            res.on('end', () => {
              if (settled) return;
              settled = true;
              signal.removeEventListener('abort', onAbort);
              const elapsed = performance.now() - reqStart;

              totalRequests += 1;
              totalBytes += bytesReceived;
              bucket.bytes += bytesReceived;
              pushLatencySample(elapsed);
              bucket.latencies.push(elapsed);

              if (code >= 200 && code < 400) {
                totalOk += 1;
                bucket.okCount += 1;
              } else if (code >= 400 && code < 500) {
                total4xx += 1;
                bucket.err4xx += 1;
              } else {
                total5xx += 1;
                bucket.err5xx += 1;
              }
              resolve();
            });
          }
        );

        const recordNetError = (errCode) => {
          if (settled) return;
          settled = true;
          signal.removeEventListener('abort', onAbort);
          const elapsed = performance.now() - reqStart;
          const key = String(errCode || 'ERR_NETWORK');
          errorCounts[key] = (errorCounts[key] || 0) + 1;
          totalRequests += 1;
          totalNetErr += 1;
          bucket.netErr += 1;
          pushLatencySample(elapsed);
          bucket.latencies.push(elapsed);
          resolve();
        };

        req.on('timeout', () => {
          req.destroy(Object.assign(new Error('Request timeout'), { code: 'ETIMEDOUT' }));
        });

        req.on('error', (err) => {
          recordNetError(err?.code || 'ERR_SOCKET');
        });

        const onAbort = () => {
          if (!settled) {
            settled = true;
            req.destroy();
            resolve();
          }
        };
        signal.addEventListener('abort', onAbort, { once: true });

        if (payload !== null) {
          req.write(payload);
        }
        req.end();
      });

    const spawnWorker = (workerIdx) => {
      activeWorkers += 1;
      const p = (async () => {
        while (!signal.aborted && workerIdx < currentTargetUsers) {
          await executeOneRequest();
          if (signal.aborted || workerIdx >= currentTargetUsers) break;
          if (config.thinkTimeMs > 0) {
            await sleep(config.thinkTimeMs);
          }
        }
      })().finally(() => {
        activeWorkers -= 1;
        workerPromises.delete(p);
      });
      workerPromises.add(p);
    };

    const syncWorkers = (targetCount) => {
      currentTargetUsers = targetCount;
      while (activeWorkers < currentTargetUsers && !signal.aborted) {
        spawnWorker(activeWorkers);
      }
    };

    const flushBucket = async (sec, activeUsersSnapshot) => {
      const snap = bucket;
      bucket = {
        latencies: [],
        okCount: 0,
        err4xx: 0,
        err5xx: 0,
        netErr: 0,
        bytes: 0,
      };

      const reqInSec = snap.okCount + snap.err4xx + snap.err5xx + snap.netErr;
      const errInSec = snap.err4xx + snap.err5xx + snap.netErr;
      const latStats = summarizeLatencies(snap.latencies);
      const errorRate = reqInSec > 0 ? round2((errInSec / reqInSec) * 100) : 0;
      const kbPerSec = round2(snap.bytes / 1024);
      const targetHealth = await pollTargetHealth(config.origin, this.targetPort);

      const point = {
        sec,
        activeUsers: activeUsersSnapshot,
        rps: reqInSec,
        avgMs: latStats.avgMs,
        p50Ms: latStats.p50Ms,
        p95Ms: latStats.p95Ms,
        p99Ms: latStats.p99Ms,
        minMs: latStats.minMs,
        maxMs: latStats.maxMs,
        okCount: snap.okCount,
        err4xx: snap.err4xx,
        err5xx: snap.err5xx,
        netErr: snap.netErr,
        errorRate,
        kbPerSec,
        targetHealth,
      };

      timeline.push(point);
      this.emit('tick', { runId, point });
      return point;
    };

    syncWorkers(computeTargetUsersForSec(1));

    const runLoop = (async () => {
      let elapsedSec = 0;

      try {
        while (elapsedSec < config.durationSec && !signal.aborted) {
          await sleep(1000);
          const activeSnapshot = currentTargetUsers;
          if (signal.aborted && bucket.latencies.length === 0) {
            break;
          }
          elapsedSec += 1;
          await flushBucket(elapsedSec, activeSnapshot);

          if (elapsedSec < config.durationSec && !signal.aborted) {
            syncWorkers(computeTargetUsersForSec(elapsedSec + 1));
          }
        }
      } finally {
        this.abortController.abort();
        await Promise.allSettled([...workerPromises]);

        const residualCount =
          bucket.okCount + bucket.err4xx + bucket.err5xx + bucket.netErr;
        if (residualCount > 0) {
          await flushBucket(elapsedSec + 1, currentTargetUsers);
        }

        agent.destroy();

        const actualDurationSec = Math.max(
          1,
          round2((performance.now() - startWall) / 1000)
        );
        const totalErrors = total4xx + total5xx + totalNetErr;
        const overallLat = summarizeLatencies(reservoir);
        const peakRps = timeline.reduce((max, pt) => Math.max(max, pt.rps), 0);
        const peakSuccessRps = timeline.reduce((max, pt) => Math.max(max, pt.okCount), 0);
        const avgRps = round2(totalRequests / actualDurationSec);
        const avgSuccessRps = round2(totalOk / actualDurationSec);
        const errorRate =
          totalRequests > 0 ? round2((totalErrors / totalRequests) * 100) : 0;

        const bpPoint =
          timeline.find(
            (pt) =>
              pt.okCount + pt.err4xx + pt.err5xx + pt.netErr > 0 &&
              (pt.p95Ms > 1000 || pt.errorRate > 1)
          ) || null;
        const breakingPoint = bpPoint
          ? {
              sec: bpPoint.sec,
              activeUsers: bpPoint.activeUsers,
              rps: bpPoint.okCount,
              p95Ms: bpPoint.p95Ms,
              errorRate: bpPoint.errorRate,
            }
          : null;

        const summary = {
          totalRequests,
          okCount: totalOk,
          err4xx: total4xx,
          err5xx: total5xx,
          netErr: totalNetErr,
          totalErrors,
          errorRate,
          peakRps,
          peakSuccessRps,
          avgRps,
          avgSuccessRps,
          totalKB: round2(totalBytes / 1024),
          actualDurationSec,
          ...overallLat,
          breakingPoint,
        };

        const verdict = buildVerdict(summary, config);
        const diagnosis = buildDiagnosis(summary, config, timeline, statusCounts, errorCounts);

        const runRecord = {
          id: runId,
          startedAt,
          finishedAt: new Date().toISOString(),
          aborted: timeline.length < config.durationSec,
          config,
          summary,
          verdict,
          diagnosis,
          statusCounts,
          errorCounts,
          timeline,
        };

        this.running = false;
        this.activeRunId = null;
        this.abortController = null;
        this.agent = null;

        this.emit('done', runRecord);
      }
    })();

    runLoop.catch((err) => {
      this.running = false;
      this.activeRunId = null;
      this.emit('error', { runId, error: err?.message || 'Load engine error' });
    });

    return { runId, config };
  }
}
