import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const RUNS_PATH = path.join(ROOT_DIR, 'data', 'runs.json');
const REPORTS_DIR = path.join(ROOT_DIR, 'reports');
const HTML_PATH = path.join(REPORTS_DIR, 'laporan-kekuatan-shared-hosting-pplg.html');
const PDF_PATH = path.join(ROOT_DIR, 'laporan-kekuatan-shared-hosting-pplg.pdf');

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

async function findBrowserExe() {
  for (const p of CHROME_CANDIDATES) {
    try {
      await fs.access(p);
      return p;
    } catch {
      // try next
    }
  }
  throw new Error('Tidak ditemukan Chrome atau Edge untuk mencetak PDF.');
}

function fmtWib(iso) {
  const d = new Date(iso);
  const wib = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  const hh = String(wib.getUTCHours()).padStart(2, '0');
  const mm = String(wib.getUTCMinutes()).padStart(2, '0');
  const ss = String(wib.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss} WIB`;
}

function numId(val, digits = 2) {
  return Number(val || 0).toLocaleString('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function summarizeRun(r) {
  const timeline = Array.isArray(r.timeline) ? r.timeline : [];
  const okPeak = timeline.reduce((m, t) => Math.max(m, t.okCount || 0), 0);
  const peakKBps = timeline.reduce((m, t) => Math.max(m, t.kbPerSec || 0), 0);
  const peakMBps = Number((peakKBps / 1024).toFixed(2));
  const avgPageKB = r.summary.okCount > 0 ? Number((r.summary.totalKB / r.summary.okCount).toFixed(2)) : 0;

  const active = timeline.filter((t) => t.okCount + t.err4xx + t.err5xx + t.netErr > 0);
  const zeroErr = timeline.filter((t) => t.okCount > 0 && t.err4xx + t.err5xx + t.netErr === 0);
  const maxZeroVU = zeroErr.reduce((m, t) => Math.max(m, t.activeUsers || 0), 0);
  const firstErr = active.find((t) => t.err4xx + t.err5xx + t.netErr > 0) || null;
  const halfDown = active.find((t) => t.errorRate >= 50) || null;
  const fullDown = active.find((t) => t.okCount === 0 && t.err4xx + t.err5xx + t.netErr > 0) || null;

  return {
    id: r.id.slice(0, 8),
    startedAt: r.startedAt,
    wibTime: fmtWib(r.startedAt),
    config: r.config,
    summary: r.summary,
    errorCounts: r.errorCounts || {},
    timeline,
    okPeak,
    peakMBps,
    avgPageKB,
    maxZeroVU,
    firstErr,
    halfDown,
    fullDown,
    blocked: r.id.startsWith('50ea05b3') || r.id.startsWith('d8be761a'),
  };
}

function buildTimelineSvg(run8b) {
  const pts = run8b.timeline;
  const W = 740;
  const H = 250;
  const pad = { top: 34, right: 48, bottom: 38, left: 46 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const maxY = Math.max(200, ...pts.map((p) => p.okCount + p.err4xx + p.err5xx + p.netErr));
  const xFor = (i) => pad.left + (plotW * i) / Math.max(1, pts.length - 1);
  const yFor = (v) => pad.top + plotH - (Math.min(v, maxY) / maxY) * plotH;

  const gridVals = [0, 50, 100, 150, 200];
  const gridLines = gridVals
    .map((gv) => {
      const y = yFor(gv).toFixed(1);
      return `<line x1="${pad.left}" y1="${y}" x2="${pad.left + plotW}" y2="${y}" stroke="#dbe2ee" stroke-width="1"/>
      <text x="${pad.left - 8}" y="${Number(y) + 4}" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="10" fill="#5b667a">${gv}</text>`;
    })
    .join('');

  const xTicks = [1, 10, 20, 30, 40, 50, 60]
    .map((sec) => {
      const idx = pts.findIndex((p) => p.sec === sec);
      if (idx < 0) return '';
      const x = xFor(idx).toFixed(1);
      const vu = pts[idx].activeUsers;
      return `<line x1="${x}" y1="${pad.top + plotH}" x2="${x}" y2="${pad.top + plotH + 5}" stroke="#94a3b8" stroke-width="1"/>
      <text x="${x}" y="${pad.top + plotH + 17}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="9.5" fill="#5b667a">d${sec} (${vu}u)</text>`;
    })
    .join('');

  const okPts = pts.map((p, i) => `${xFor(i).toFixed(1)},${yFor(p.okCount).toFixed(1)}`).join(' ');
  const okArea = `${xFor(0).toFixed(1)},${(pad.top + plotH).toFixed(1)} ${okPts} ${xFor(pts.length - 1).toFixed(1)},${(pad.top + plotH).toFixed(1)}`;
  const errPts = pts
    .map((p, i) => `${xFor(i).toFixed(1)},${yFor(p.err4xx + p.err5xx + p.netErr).toFixed(1)}`)
    .join(' ');

  const markers = [
    { sec: 6, label: 'Error 1 (89u)', color: '#b45309', yOff: 12 },
    { sec: 14, label: 'Gagal >=50% (224u)', color: '#b91c1c', yOff: 28 },
    { sec: 33, label: 'Down total 0 sukses (545u)', color: '#991b1b', yOff: 12 },
  ]
    .map((m) => {
      const idx = pts.findIndex((p) => p.sec === m.sec);
      if (idx < 0) return '';
      const x = xFor(idx).toFixed(1);
      const labelX = Number(x) + 4;
      const yText = pad.top + m.yOff;
      return `<line x1="${x}" y1="${pad.top}" x2="${x}" y2="${pad.top + plotH}" stroke="${m.color}" stroke-width="1.2" stroke-dasharray="4 3"/>
      <rect x="${labelX - 2}" y="${yText - 10}" width="${m.label.length * 5.6 + 6}" height="14" rx="2" fill="#f8fafc" opacity="0.94"/>
      <text x="${labelX}" y="${yText}" text-anchor="start" font-family="Familjen Grotesk, sans-serif" font-weight="600" font-size="10" fill="${m.color}">${m.label}</text>`;
    })
    .join('');

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="auto" role="img" aria-label="Grafik request sukses vs gagal per detik pada uji beban 1000 user">
    <rect x="0" y="0" width="${W}" height="${H}" fill="#f5f7fb" stroke="#dbe2ee" rx="6"/>
    ${gridLines}
    ${xTicks}
    <polygon points="${okArea}" fill="#dbeafe" opacity="0.7"/>
    <polyline points="${okPts}" fill="none" stroke="#1d4ed8" stroke-width="2.4"/>
    <polyline points="${errPts}" fill="none" stroke="#dc2626" stroke-width="2"/>
    ${markers}
    <text x="${pad.left}" y="18" font-family="Familjen Grotesk, sans-serif" font-weight="600" font-size="11.5" fill="#182032">Grafik 1. Uji Beban Penuh 5 → 1000 User (Run 8b3fb7df, 60 detik)</text>
    <g transform="translate(${W - 235}, 10)">
      <line x1="0" y1="5" x2="14" y2="5" stroke="#1d4ed8" stroke-width="2.5"/>
      <text x="18" y="8" font-family="IBM Plex Sans, sans-serif" font-size="10" fill="#182032">Sukses (2xx/dtk)</text>
      <line x1="115" y1="5" x2="129" y2="5" stroke="#dc2626" stroke-width="2.2"/>
      <text x="133" y="8" font-family="IBM Plex Sans, sans-serif" font-size="10" fill="#182032">Gagal / Timeout</text>
    </g>
  </svg>`;
}

function buildComparisonSvg(orderedRuns) {
  const W = 740;
  const H = 225;
  const pad = { top: 34, right: 24, bottom: 52, left: 46 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const maxRps = 50;

  const gridLines = [0, 10, 20, 30, 40, 50]
    .map((v) => {
      const y = (pad.top + plotH - (v / maxRps) * plotH).toFixed(1);
      return `<line x1="${pad.left}" y1="${y}" x2="${pad.left + plotW}" y2="${y}" stroke="#dbe2ee" stroke-width="1"/>
      <text x="${pad.left - 8}" y="${Number(y) + 4}" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="10" fill="#5b667a">${v}</text>`;
    })
    .join('');

  const slotW = plotW / orderedRuns.length;
  const barW = Math.min(48, slotW * 0.56);

  const bars = orderedRuns
    .map((r, i) => {
      const cx = pad.left + slotW * i + slotW / 2;
      const x = (cx - barW / 2).toFixed(1);
      const val = r.okPeak;
      const barH = Math.max(2, (val / maxRps) * plotH);
      const y = (pad.top + plotH - barH).toFixed(1);
      const fill = r.blocked ? '#dc2626' : '#1d4ed8';
      const label = r.blocked ? `${val} (Blokir)` : `${val} req/s`;
      const mbText = r.blocked ? '0 MB/s' : `${numId(r.peakMBps, 2)} MB/s`;
      const targetTag = `${r.config.startUsers}-${r.config.maxUsers}u`;
      return `<rect x="${x}" y="${y}" width="${barW}" height="${barH.toFixed(1)}" rx="3" fill="${fill}"/>
      <text x="${cx.toFixed(1)}" y="${Number(y) - 6}" text-anchor="middle" font-family="Familjen Grotesk, sans-serif" font-weight="600" font-size="10.5" fill="${fill}">${label}</text>
      <text x="${cx.toFixed(1)}" y="${pad.top + plotH + 15}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="9.5" fill="#182032">${r.id}</text>
      <text x="${cx.toFixed(1)}" y="${pad.top + plotH + 28}" text-anchor="middle" font-family="IBM Plex Sans, sans-serif" font-size="9" fill="#5b667a">${targetTag} | ${mbText}</text>`;
    })
    .join('');

  const line40Y = (pad.top + plotH - (40 / maxRps) * plotH).toFixed(1);

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="auto" role="img" aria-label="Perbandingan puncak kecepatan sukses across 7 sesi pengujian">
    <rect x="0" y="0" width="${W}" height="${H}" fill="#f5f7fb" stroke="#dbe2ee" rx="6"/>
    ${gridLines}
    <line x1="${pad.left}" y1="${line40Y}" x2="${pad.left + plotW}" y2="${line40Y}" stroke="#475569" stroke-width="1" stroke-dasharray="4 3"/>
    ${bars}
    <text x="${pad.left}" y="18" font-family="Familjen Grotesk, sans-serif" font-weight="600" font-size="11.5" fill="#182032">Grafik 2. Konsistensi Puncak Request Sukses/Detik Across 7 Sesi Uji</text>
  </svg>`;
}

async function main() {
  const raw = await fs.readFile(RUNS_PATH, 'utf8');
  const allRuns = JSON.parse(raw);

  const umkmRaw = allRuns
    .filter((r) => r.config?.url?.includes('aplikasiumkmdigital.id'))
    .map(summarizeRun)
    .sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt));

  if (umkmRaw.length < 5) {
    throw new Error(`Hanya ditemukan ${umkmRaw.length} sesi aplikasiumkmdigital.id di data/runs.json.`);
  }

  const run8b = umkmRaw.find((r) => r.id === '8b3fb7df') || umkmRaw[2];
  const timelineSvg = buildTimelineSvg(run8b);
  const compSvg = buildComparisonSvg(umkmRaw);

  const tableRowsHtml = umkmRaw
    .map((r) => {
      const errPct = `${numId(r.summary.errorRate, 2)}%`;
      const firstErrTxt = r.firstErr ? `Detik ${r.firstErr.sec} (${r.firstErr.activeUsers}u)` : 'Tidak ada';
      const halfTxt = r.halfDown ? `Detik ${r.halfDown.sec} (${r.halfDown.activeUsers}u)` : 'Tidak terjadi';
      const fullTxt = r.fullDown ? `Detik ${r.fullDown.sec} (${r.fullDown.activeUsers}u)` : 'Tidak terjadi';
      const statusBadge = r.blocked
        ? '<span class="pill pill--err">Terblokir Firewall</span>'
        : r.fullDown
          ? '<span class="pill pill--accent">Valid (Sampai Down)</span>'
          : '<span class="pill pill--ok">Valid</span>';
      return `<tr class="${r.blocked ? 'row-muted' : ''}">
        <td class="mono">${r.id}<br><span class="sub-cell">${r.wibTime}</span></td>
        <td><span class="mono">${r.config.mode}</span> ${r.config.startUsers}→${r.config.maxUsers}u<br><span class="sub-cell">${r.config.durationSec}s, jeda ${r.config.thinkTimeMs}ms</span></td>
        <td class="mono">${r.summary.okCount} / ${r.summary.totalRequests}<br><span class="sub-cell">Error ${errPct}</span></td>
        <td class="mono"><strong>${r.okPeak} req/dtk</strong><br><span class="sub-cell">${numId(r.peakMBps, 2)} MB/dtk (${numId(r.avgPageKB, 1)} KB/hal)</span></td>
        <td class="mono">${numId(r.summary.p50Ms, 0)} / ${numId(r.summary.p95Ms, 0)} ms</td>
        <td>${firstErrTxt}</td>
        <td>${halfTxt} / ${fullTxt}</td>
        <td>${statusBadge}</td>
      </tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Laporan Uji Beban &amp; Kekuatan Shared Hosting PPLG - aplikasiumkmdigital.id</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --paper: #fcfdff;
      --paper-2: #f4f7fc;
      --paper-3: #eaf0fa;
      --ink: #182032;
      --ink-2: #3b465c;
      --muted: #5b667a;
      --rule: #dce3ef;
      --rule-2: #bcc7da;
      --accent: #1d4ed8;
      --accent-deep: #1e3a8a;
      --accent-wash: #eff6ff;
      --ok: #15803d;
      --ok-wash: #f0fdf4;
      --warn: #b45309;
      --warn-wash: #fffbeb;
      --err: #b91c1c;
      --err-wash: #fef2f2;
      --font-display: "Familjen Grotesk", "Segoe UI", system-ui, sans-serif;
      --font-body: "IBM Plex Sans", "Segoe UI", system-ui, sans-serif;
      --font-mono: "JetBrains Mono", Consolas, monospace;
    }

    @page {
      size: A4;
      margin: 14mm 14mm 16mm 14mm;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      background: var(--paper);
      color: var(--ink);
      font-family: var(--font-body);
      font-size: 9.7pt;
      line-height: 1.5;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .doc-header {
      border-bottom: 2px solid var(--ink);
      padding-bottom: 12px;
      margin-bottom: 14px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 16px;
    }

    .doc-kicker {
      font-family: var(--font-display);
      font-weight: 600;
      font-size: 9pt;
      color: var(--accent);
      margin-bottom: 4px;
    }

    h1 {
      margin: 0;
      font-family: var(--font-display);
      font-weight: 700;
      font-size: 20pt;
      line-height: 1.08;
      letter-spacing: -0.025em;
      color: var(--ink);
    }

    .doc-sub {
      margin: 6px 0 0;
      font-size: 9.5pt;
      color: var(--ink-2);
    }

    .doc-meta-box {
      text-align: right;
      font-family: var(--font-mono);
      font-size: 8pt;
      color: var(--muted);
      line-height: 1.55;
      white-space: nowrap;
    }

    .answer-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
      margin-bottom: 16px;
      break-inside: avoid;
    }

    .answer-card {
      border: 1px solid var(--rule-2);
      border-radius: 6px;
      background: var(--paper-2);
      padding: 10px 12px;
      break-inside: avoid;
    }

    .answer-card--highlight {
      border-color: var(--accent);
      background: var(--accent-wash);
    }

    .answer-label {
      font-family: var(--font-display);
      font-weight: 600;
      font-size: 9pt;
      color: var(--accent-deep);
      margin-bottom: 3px;
    }

    .answer-big {
      font-family: var(--font-display);
      font-weight: 700;
      font-size: 14.5pt;
      line-height: 1.15;
      color: var(--ink);
      margin-bottom: 5px;
    }

    .answer-simple {
      font-size: 8.9pt;
      color: var(--ink);
      margin-bottom: 5px;
    }

    .answer-tech {
      font-family: var(--font-mono);
      font-size: 7.7pt;
      color: var(--muted);
      border-top: 1px solid var(--rule);
      padding-top: 4px;
    }

    .section {
      margin-bottom: 15px;
    }

    h2 {
      margin: 0 0 8px;
      padding-bottom: 4px;
      border-bottom: 1px solid var(--rule-2);
      font-family: var(--font-display);
      font-weight: 700;
      font-size: 12.5pt;
      letter-spacing: -0.015em;
      color: var(--ink);
      break-after: avoid;
    }

    .simple-box {
      border-left: 3.5px solid var(--accent);
      background: var(--accent-wash);
      padding: 9px 12px;
      border-radius: 0 6px 6px 0;
      margin-bottom: 9px;
      break-inside: avoid;
    }

    .simple-box--warn {
      border-left-color: var(--warn);
      background: var(--warn-wash);
    }

    .box-tag {
      font-family: var(--font-display);
      font-weight: 600;
      font-size: 8.5pt;
      color: var(--accent-deep);
      margin-bottom: 3px;
    }

    .simple-box--warn .box-tag {
      color: var(--warn);
    }

    .simple-box p {
      margin: 0;
      font-size: 9.4pt;
      color: var(--ink);
    }

    .tech-box {
      border: 1px solid var(--rule);
      background: var(--paper-2);
      padding: 8px 11px;
      border-radius: 6px;
      margin-bottom: 10px;
      font-size: 8.6pt;
      color: var(--ink-2);
      break-inside: avoid;
    }

    .tech-box .box-tag {
      color: var(--muted);
    }

    .tech-box ul {
      margin: 4px 0 0;
      padding-left: 16px;
    }

    .tech-box li {
      margin-bottom: 2px;
    }

    .chart-block {
      margin: 8px 0 10px;
      break-inside: avoid;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.2pt;
      margin-top: 6px;
      break-inside: avoid;
    }

    th {
      text-align: left;
      padding: 6px 7px;
      border-bottom: 1.5px solid var(--rule-2);
      background: var(--paper-3);
      font-family: var(--font-display);
      font-weight: 600;
      color: var(--ink);
      white-space: nowrap;
    }

    td {
      padding: 6px 7px;
      border-bottom: 1px solid var(--rule);
      vertical-align: top;
      color: var(--ink);
    }

    .row-muted td {
      background: var(--err-wash);
    }

    .mono {
      font-family: var(--font-mono);
      font-variant-numeric: tabular-nums;
    }

    .sub-cell {
      font-family: var(--font-body);
      font-size: 7.4pt;
      color: var(--muted);
    }

    .pill {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: var(--font-display);
      font-weight: 600;
      font-size: 7.5pt;
      white-space: nowrap;
    }

    .pill--ok { background: var(--ok-wash); color: var(--ok); border: 1px solid var(--ok); }
    .pill--accent { background: var(--accent-wash); color: var(--accent); border: 1px solid var(--accent); }
    .pill--err { background: var(--err-wash); color: var(--err); border: 1px solid var(--err); }

    .sol-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 9px;
      break-inside: avoid;
    }

    .sol-card {
      border: 1px solid var(--rule-2);
      border-radius: 6px;
      padding: 9px 11px;
      background: var(--paper);
      break-inside: avoid;
    }

    .sol-title {
      font-family: var(--font-display);
      font-weight: 700;
      font-size: 9.8pt;
      color: var(--ink);
      margin-bottom: 4px;
    }

    .sol-simple {
      font-size: 8.8pt;
      color: var(--ink);
      margin-bottom: 5px;
    }

    .sol-tech {
      font-size: 8pt;
      color: var(--muted);
      border-top: 1px solid var(--rule);
      padding-top: 4px;
    }

    .page-break {
      page-break-before: always;
    }

    .doc-footer {
      margin-top: 14px;
      padding-top: 8px;
      border-top: 1px solid var(--rule);
      font-family: var(--font-mono);
      font-size: 7.5pt;
      color: var(--muted);
      display: flex;
      justify-content: space-between;
    }
  </style>
</head>
<body>
  <header class="doc-header">
    <div>
      <div class="doc-kicker">Laporan Pengujian Kapasitas Server &amp; Shared Hosting</div>
      <h1>Evaluasi Kekuatan Web &amp; Limit Viewers</h1>
      <p class="doc-sub">Target uji: <span class="mono">https://aplikasiumkmdigital.id/katalog</span> (Shared Hosting PPLG)</p>
    </div>
    <div class="doc-meta-box">
      Tanggal uji: 26 Nov 2026 (13:49 – 14:21 WIB)<br>
      Total sesi tercatat: 7 run (5 valid + 2 terblokir firewall)<br>
      Alat ukur: BebanLab HTTP Load Engine (real sockets)
    </div>
  </header>

  <section class="answer-grid">
    <div class="answer-card answer-card--highlight">
      <div class="answer-label">1. QTY Limit Viewers (Kapasitas Pengunjung)</div>
      <div class="answer-big">32 – 72 klik bersamaan | ~155 – 440 orang online</div>
      <div class="answer-simple"><strong>Bahasa mudah:</strong> Jika orang mengklik berbarengan di detik yang persis sama, aman sampai <strong>32 – 72 orang</strong>. Jika dipakai pengunjung manusia normal (baca halaman 5–10 detik sebelum klik lagi), server kuat menampung sekitar <strong>155 – 440 orang online aktif</strong> bersamaan.</div>
      <div class="answer-tech">Teknis: maxZeroErrVU 32–72 VU; throughput sukses stabil 31–44 req/dtk (Little's Law pada think-time 5–10 dtk).</div>
    </div>

    <div class="answer-card">
      <div class="answer-label">2. Test Sampai Down (Kapan Web Tumbang?)</div>
      <div class="answer-big">Mulai gagal 35–89 | Down total 545–798 user</div>
      <div class="answer-simple"><strong>Bahasa mudah:</strong> Web mulai ada yang gagal/macet di <strong>35 – 89 orang</strong> klik bareng. Lebih dari separuh pengunjung gagal di <strong>207 – 224 orang</strong>, dan <strong>lumpuh total (0 orang lolos)</strong> saat diserbu <strong>545 – 798 orang</strong> sekaligus.</div>
      <div class="answer-tech">Teknis: ETIMEDOUT (&gt;5s) pertama di 35–89 VU; &gt;=50% error di 207–224 VU (d13–14); 0 sukses di 545–798 VU (d33–48).</div>
    </div>

    <div class="answer-card">
      <div class="answer-label">3. Kekuatan Shared Hosting PPLG</div>
      <div class="answer-big">Mentok konsisten di ~40 req/dtk &amp; ~4 MB/dtk</div>
      <div class="answer-simple"><strong>Bahasa mudah:</strong> Cukup bagus untuk web katalog/UMKM pemakaian wajar, tetapi kasirnya mentok di <strong>31 – 44 halaman per detik</strong> karena ukuran satu halamannya cukup besar (101–135 KB). Kelebihannya, hosting ini punya <strong>satpam firewall</strong> yang otomatis memblokir saat ada serangan beruntun.</div>
      <div class="answer-tech">Teknis: Peak transfer konsisten 3,94–4,50 MB/dtk (~31,5–36 Mbps); 0 error HTTP 500/502, bottleneck di antrean CPU/EP &amp; port I/O.</div>
    </div>

    <div class="answer-card">
      <div class="answer-label">4. Seberapa Besar Limit Traffic-nya?</div>
      <div class="answer-big">31 – 44 req/dtk (~2.640 hal/menit)</div>
      <div class="answer-simple"><strong>Bahasa mudah:</strong> Pipa data maksimal yang bisa dikirim shared hosting ini adalah sekitar <strong>31 – 44 halaman setiap detik</strong>, atau setara <strong>1.860 – 2.640 halaman per menit</strong> (~111.000 – 158.000 halaman per jam jika terus penuh).</div>
      <div class="answer-tech">Teknis: 31–44 req/dtk × 100,9–135,4 KB/req = 3,94–4,50 MB/dtk (~236–270 MB/menit teoritis puncak).</div>
    </div>
  </section>

  <section class="section">
    <h2>1. Kenapa File Laporan Terakhir (bebanlab-d8be761a) Menunjukkan 0 Sukses?</h2>
    <div class="simple-box simple-box--warn">
      <div class="box-tag">Penjelasan Sederhana (Utama)</div>
      <p>File <strong>bebanlab-d8be761a-laporan.md</strong> yang mencatat <strong>0 dari 4.060 pengunjung berhasil</strong> <strong>BUKAN</strong> berarti web aslinya langsung mati hanya karena 10 orang. Penyebabnya: sebelum tes jam 14:19 WIB itu dijalankan, kita sudah menembak server tersebut dua kali dengan <strong>1.000 user berturut-turut</strong>. Akibatnya, <strong>satpam firewall shared hosting langsung mengunci pintu untuk alamat IP kita</strong> — jadi setiap ketukan langsung ditolak sebelum sempat masuk ke halaman katalog.</p>
    </div>
    <div class="tech-box">
      <div class="box-tag">Pendukung Teknis &amp; Bukti Data</div>
      <ul>
        <li>Pada run <code>d8be761a</code> (14:19 WIB, <code>step 10→300 VU</code>), detik ke-1 dan ke-2 langsung mencatat <strong>19x <code>ECONNRESET</code> dalam 60,75 – 92,16 ms</strong> (sambungan diputus langsung oleh firewall/WAF/CSF jaringan sebelum aplikasi merespons), lalu <strong>4.041x <code>ETIMEDOUT</code></strong> dengan total transfer <code>0 KB</code>.</li>
        <li>Cek koneksi tunggal menggunakan <code>curl.exe -sI --max-time 5 https://aplikasiumkmdigital.id/katalog</code> pada 14:25 WIB juga mengalami timeout tanpa header — membuktikan IP penguji masih berada dalam daftar blokir sementara hosting.</li>
        <li>Oleh karena itu, seluruh angka kapasitas resmi pada laporan ini diambil dari <strong>5 sesi bersih sebelum blokir firewall aktif</strong> (pukul 13:49 – 14:14 WIB).</li>
      </ul>
    </div>
  </section>

  <section class="section">
    <h2>2. Perjalanan Website Dari Lancar Sampai Down Total (Uji 1.000 User)</h2>
    <div class="simple-box">
      <div class="box-tag">Penjelasan Sederhana (Utama)</div>
      <p>Bayangkan halaman <code>/katalog</code> seperti loket kasir yang hanya kuat melayani sekitar <strong>40 orang per detik</strong>. Selama yang datang masih di bawah 72 orang bersamaan, antrean berjalan mulus tanpa ada yang gagal. Begitu pengunjung yang datang bersamaan naik menjadi <strong>89 orang</strong>, sebagian mulai kehabisan kesabaran menunggu lebih dari 5 detik. Di <strong>224 orang</strong>, lebih dari separuh pengunjung gagal masuk, dan saat menyentuh <strong>545 orang bersamaan</strong>, antrean macet total sampai 0 orang yang berhasil dilayani.</p>
    </div>

    <div class="chart-block">
      ${timelineSvg}
    </div>

    <div class="tech-box">
      <div class="box-tag">Pendukung Teknis &amp; Data Fase Beban (Run 8b3fb7df &amp; d1267d72)</div>
      <table>
        <thead>
          <tr>
            <th>Fase Beban</th>
            <th>Ambang User Terukur</th>
            <th>Bukti Angka Nyata</th>
            <th>Kondisi Server</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Lancar (0% error)</strong></td>
            <td class="mono">32 – 72 user</td>
            <td class="mono">p50 316–668 ms | 31–44 sukses/dtk</td>
            <td>Semua permintaan <code>2xx</code> selesai bersih tanpa timeout</td>
          </tr>
          <tr>
            <td><strong>Mulai error pertama</strong></td>
            <td class="mono">35 – 89 user</td>
            <td class="mono">Detik 6 (89u): 30 ok vs 3 ETIMEDOUT</td>
            <td>Antrean mulai melewati batas timeout 5.000 ms</td>
          </tr>
          <tr>
            <td><strong>Mayoritas gagal (&gt;=50%)</strong></td>
            <td class="mono">207 – 224 user</td>
            <td class="mono">p50 &gt; 5.011 ms | 33 ok vs 34 gagal</td>
            <td>Lebih dari separuh request gagal; halaman terasa macet</td>
          </tr>
          <tr class="row-muted">
            <td><strong>Down total (0 sukses)</strong></td>
            <td class="mono">545 – 798 user</td>
            <td class="mono">2xx = 0 terus sampai 1.000 user</td>
            <td>100% permintaan berakhir <code>ETIMEDOUT</code> / <code>ECONNRESET</code></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <div class="page-break"></div>

  <section class="section">
    <h2>3. Kekuatan Shared Hosting PPLG &amp; Limit Traffic (7 Sesi Uji)</h2>
    <div class="simple-box">
      <div class="box-tag">Penjelasan Sederhana (Utama)</div>
      <p>Kekuatan mesin shared hosting ini sangat konsisten: entah dites dengan 40 orang, 100 orang, atau 1.000 orang, batas maksimal kecepatannya selalu berhenti di angka <strong>31 – 44 halaman per detik</strong> dan pipa datanya mentok di sekitar <strong>4 – 4,5 MB per detik</strong>. Salah satu penyebab cepat penuhnya adalah ukuran 1 halaman <code>/katalog</code> mencapai <strong>101 – 135 KB</strong>. Ini sangat normal untuk kelas shared hosting tanpa caching.</p>
    </div>

    <div class="chart-block">
      ${compSvg}
    </div>

    <div class="tech-box">
      <div class="box-tag">Data Valid Seluruh 7 Sesi Pengujian (data/runs.json)</div>
      <table>
        <thead>
          <tr>
            <th>ID &amp; Waktu</th>
            <th>Skenario</th>
            <th>Sukses / Total</th>
            <th>Puncak Sukses &amp; Data</th>
            <th>p50 / p95</th>
            <th>Error Pertama</th>
            <th>&gt;=50% / Down Total</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
      </table>
    </div>
  </section>

  <section class="section">
    <h2>4. Solusi &amp; Saran Agar Website Jauh Lebih Kuat</h2>
    <div class="sol-grid">
      <div class="sol-card">
        <div class="sol-title">1. Pasang Cache Halaman Katalog (Paling Ampuh)</div>
        <div class="sol-simple"><strong>Bahasa mudah:</strong> Karena isi halaman <code>/katalog</code> sama untuk semua tamu, simpan "fotokopi" halamannya di depan pintu (lewat Cloudflare gratis atau fitur cache hosting). Jadi dapur server tidak perlu masak ulang dari database setiap kali ada tamu datang — daya tahannya bisa naik 10x sampai 50x lipat.</div>
        <div class="sol-tech"><strong>Teknis:</strong> Aktifkan Cloudflare Cache Rules atau LiteSpeed Cache (<code>LSCache</code>) dengan <code>Cache-Control: public, max-age=60, stale-while-revalidate=300</code> pada rute katalog publik.</div>
      </div>

      <div class="sol-card">
        <div class="sol-title">2. Perkecil Ukuran Halaman (Saat Ini 101–135 KB)</div>
        <div class="sol-simple"><strong>Bahasa mudah:</strong> Sekarang satu kali buka halaman memakan data 101–135 KB. Kalau diringankan separuhnya dan gambar dibuat <em>lazy load</em>, pipa 4 MB/detik milik shared hosting bisa melayani 2x lebih banyak pengunjung sekaligus.</div>
        <div class="sol-tech"><strong>Teknis:</strong> Aktifkan kompresi Brotli/Gzip, batasi jumlah item per halaman dengan pagination (<code>LIMIT 12–20</code>), dan hindari menyisipkan aset/base64 besar langsung di HTML.</div>
      </div>

      <div class="sol-card">
        <div class="sol-title">3. Rapikan Database &amp; Mesin PHP Shared Hosting</div>
        <div class="sol-simple"><strong>Bahasa mudah:</strong> Beri "daftar isi" pada tabel produk di database supaya server tidak membaca semua baris dari awal setiap kali halaman dibuka, dan aktifkan pengingat kode PHP supaya lebih gesit.</div>
        <div class="sol-tech"><strong>Teknis:</strong> Aktifkan <code>PHP OPcache</code> di panel hosting, tambahkan SQL index pada kolom filter/sortir katalog (<code>kategori</code>, <code>status</code>, <code>created_at</code>), dan hindari query N+1.</div>
      </div>

      <div class="sol-card">
        <div class="sol-title">4. Cara Uji Ulang yang Valid Tanpa Kena Blokir</div>
        <div class="sol-simple"><strong>Bahasa mudah:</strong> Tunggu 15–60 menit sampai blokir IP lepas (atau pindah jaringan WiFi/hotspot), lalu tes memakai mode <strong>Bertangga</strong> dengan jeda antar klik <code>1000 ms</code> (seperti manusia asli) dan langsung berhenti kalau error sudah naik.</div>
        <div class="sol-tech"><strong>Teknis:</strong> Gunakan <code>step</code> 10→300 VU, <code>thinkTimeMs: 1000</code>, <code>timeoutMs: 10000</code>, atau tambahkan IP penguji ke whitelist firewall sementara selama masa pengujian terotorisasi.</div>
      </div>
    </div>
  </section>

  <section class="section">
    <h2>5. Konversi Kapasitas Traffic &amp; Estimasi Pemakaian Nyata</h2>
    <div class="simple-box">
      <div class="box-tag">Penjelasan Sederhana (Utama)</div>
      <p>Supaya mudah dibayangkan untuk kegiatan harian di sekolah/UMKM: dalam kondisi normal sebelum dipasang cache, website ini nyaman dibuka oleh sekitar <strong>150 sampai 400 orang yang sedang online bersamaan</strong>. Yang berbahaya bukan jumlah total pengunjung seharian, melainkan kalau <strong>lebih dari 70–90 orang mengklik tombol buka halaman di detik yang persis sama</strong> (misal saat pengumuman dibuka serentak).</p>
    </div>
    <div class="tech-box">
      <div class="box-tag">Pendukung Teknis: Tabel Estimasi Limit Traffic (Berdasarkan Puncak Nyata 31–44 req/dtk)</div>
      <table>
        <thead>
          <tr>
            <th>Rentang Waktu</th>
            <th>Kapasitas Permintaan Sukses</th>
            <th>Estimasi Transfer Data</th>
            <th>Catatan Operasional Shared Hosting</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Per detik</strong></td>
            <td class="mono">31 – 44 halaman/detik</td>
            <td class="mono">3,94 – 4,50 MB/detik</td>
            <td>Batas keras terukur pada 5 sesi valid sebelum blokir firewall</td>
          </tr>
          <tr>
            <td><strong>Per menit (puncak)</strong></td>
            <td class="mono">1.860 – 2.640 halaman/menit</td>
            <td class="mono">~236 – 270 MB/menit</td>
            <td>Jika dipacu konstan penuh di batas atas server</td>
          </tr>
          <tr>
            <td><strong>Per jam (teoritis)</strong></td>
            <td class="mono">111.600 – 158.400 halaman/jam</td>
            <td class="mono">~14,2 – 16,2 GB/jam</td>
            <td>Dalam praktik shared hosting dibatasi fair-usage CPU &amp; kuota bulanan</td>
          </tr>
          <tr>
            <td><strong>Pengunjung online bersamaan</strong></td>
            <td class="mono">~155 – 440 orang online</td>
            <td class="mono">Jeda baca manusia 5–10 dtk</td>
            <td>Klik serentak di 1 detik yang sama tetap aman di 32 – 72 VU</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <footer class="doc-footer">
    <span>BebanLab Report Generator — Sumber data faktual: data/runs.json</span>
    <span>Target: https://aplikasiumkmdigital.id/katalog (Shared Hosting PPLG)</span>
  </footer>
</body>
</html>`;

  await fs.mkdir(REPORTS_DIR, { recursive: true });
  await fs.writeFile(HTML_PATH, html, 'utf8');

  const browserExe = await findBrowserExe();
  const fileUrl = `file:///${HTML_PATH.replace(/\\/g, '/')}`;

  await execFileAsync(browserExe, [
    '--headless=new',
    '--disable-gpu',
    '--no-pdf-header-footer',
    '--virtual-time-budget=5000',
    `--print-to-pdf=${PDF_PATH}`,
    fileUrl,
  ]);

  const stat = await fs.stat(PDF_PATH);
  console.log(`PDF berhasil dibuat: ${PDF_PATH} (${stat.size} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
