(function initBebanLabApp() {
  let targetBaseUrl = 'http://localhost:3001';

  function buildPresets(base) {
    return {
      home: {
        url: `${base}/`,
        method: 'GET',
        mode: 'ramp',
        startUsers: 5,
        maxUsers: 40,
        durationSec: 15,
        thinkTimeMs: 40,
      },
      products: {
        url: `${base}/api/products`,
        method: 'GET',
        mode: 'ramp',
        startUsers: 5,
        maxUsers: 50,
        durationSec: 15,
        thinkTimeMs: 30,
      },
      search: {
        url: `${base}/api/search?q=server`,
        method: 'GET',
        mode: 'ramp',
        startUsers: 5,
        maxUsers: 50,
        durationSec: 20,
        thinkTimeMs: 40,
      },
      heavy: {
        url: `${base}/api/heavy`,
        method: 'GET',
        mode: 'ramp',
        startUsers: 5,
        maxUsers: 50,
        durationSec: 20,
        thinkTimeMs: 20,
      },
      high200: {
        url: `${base}/api/products`,
        method: 'GET',
        mode: 'ramp',
        startUsers: 20,
        maxUsers: 200,
        durationSec: 15,
        thinkTimeMs: 20,
      },
    };
  }

  let PRESETS = buildPresets(targetBaseUrl);

  const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
  const METER_CHARS = ['.', ':', '+', '#', '@'];

  function isLocalHost(hostname) {
    const host = String(hostname || '').toLowerCase();
    if (LOCAL_HOSTS.has(host)) return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    const m172 = /^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(host);
    if (m172) {
      const s = Number(m172[1]);
      if (s >= 16 && s <= 31) return true;
    }
    return false;
  }

  const el = {
    openTargetLink: document.getElementById('open-target-link'),
    tabs: [...document.querySelectorAll('[data-tab]')],
    panels: {
      load: document.getElementById('panel-load'),
      audit: document.getElementById('panel-audit'),
      history: document.getElementById('panel-history'),
      docs: document.getElementById('panel-docs'),
    },
    presets: [...document.querySelectorAll('[data-preset]')],
    form: document.getElementById('load-form'),
    inputUrl: document.getElementById('input-url'),
    inputMethod: document.getElementById('input-method'),
    inputMode: document.getElementById('input-mode'),
    inputStartUsers: document.getElementById('input-start-users'),
    inputUsers: document.getElementById('input-users'),
    inputDuration: document.getElementById('input-duration'),
    inputThink: document.getElementById('input-think'),
    inputStepUsers: document.getElementById('input-step-users'),
    inputStepInterval: document.getElementById('input-step-interval'),
    inputTimeout: document.getElementById('input-timeout'),
    inputHeaders: document.getElementById('input-headers'),
    inputBody: document.getElementById('input-body'),
    remoteWrap: document.getElementById('remote-confirm-wrap'),
    inputAllowRemote: document.getElementById('input-allow-remote'),
    loadError: document.getElementById('load-error'),
    btnStart: document.getElementById('btn-start'),
    btnStop: document.getElementById('btn-stop'),
    btnExportPdf: document.getElementById('btn-export-pdf'),
    btnExportReport: document.getElementById('btn-export-report'),
    btnExportJson: document.getElementById('btn-export-json'),
    btnExportCsv: document.getElementById('btn-export-csv'),
    liveStatus: document.getElementById('live-status'),
    liveStatusText: document.getElementById('live-status-text'),
    canvas: document.getElementById('telemetry-canvas'),
    tooltip: document.getElementById('chart-tooltip'),
    monoMeter: document.getElementById('mono-meter'),
    meterRps: document.getElementById('meter-rps'),
    meterUnit: document.getElementById('meter-unit'),
    meterVu: document.getElementById('meter-vu'),
    meterP95: document.getElementById('meter-p95'),
    meterErr: document.getElementById('meter-err'),
    meterRss: document.getElementById('meter-rss'),
    verdictBox: document.getElementById('verdict-box'),
    verdictTitle: document.getElementById('verdict-title'),
    verdictText: document.getElementById('verdict-text'),
    verdictTech: document.getElementById('verdict-tech'),
    diagnosisSection: document.getElementById('diagnosis-section'),
    diagSafe: document.getElementById('diag-safe'),
    diagSlow: document.getElementById('diag-slow'),
    diagFirstErr: document.getElementById('diag-first-err'),
    diagBreak: document.getElementById('diag-break'),
    diagDown: document.getElementById('diag-down'),
    diagTotalDown: document.getElementById('diag-total-down'),
    diagFacts: document.getElementById('diag-facts'),
    diagRecTbody: document.getElementById('diag-rec-tbody'),
    ledgerContext: document.getElementById('ledger-context'),
    mTotal: document.getElementById('m-total'),
    mOk: document.getElementById('m-ok'),
    mErr: document.getElementById('m-err'),
    mP95: document.getElementById('m-p95'),
    mLatPack: document.getElementById('m-lat-pack'),
    mRpsPack: document.getElementById('m-rps-pack'),
    mKb: document.getElementById('m-kb'),
    mBp: document.getElementById('m-bp'),
    consoleMeta: document.getElementById('console-meta'),
    telemetryConsole: document.getElementById('telemetry-console'),
    auditForm: document.getElementById('audit-form'),
    auditUrl: document.getElementById('audit-url'),
    btnAuditRun: document.getElementById('btn-audit-run'),
    btnAuditHardened: document.getElementById('btn-audit-hardened'),
    btnAuditExportPdf: document.getElementById('btn-audit-export-pdf'),
    btnAuditExportMd: document.getElementById('btn-audit-export-md'),
    btnAuditExportJson: document.getElementById('btn-audit-export-json'),
    btnAuditExportCsv: document.getElementById('btn-audit-export-csv'),
    auditError: document.getElementById('audit-error'),
    auditResultCard: document.getElementById('audit-result-card'),
    auditScore: document.getElementById('audit-score'),
    auditMeta: document.getElementById('audit-meta'),
    auditSummaryBox: document.getElementById('audit-summary-box'),
    auditSummaryTitle: document.getElementById('audit-summary-title'),
    auditSummarySimple: document.getElementById('audit-summary-simple'),
    auditSummaryTech: document.getElementById('audit-summary-tech'),
    auditTbody: document.getElementById('audit-tbody'),
    auditRawCard: document.getElementById('audit-raw-card'),
    auditRawUrl: document.getElementById('audit-raw-url'),
    auditRawBody: document.getElementById('audit-raw-body'),
    btnCompareRuns: document.getElementById('btn-compare-runs'),
    btnClearCompare: document.getElementById('btn-clear-compare'),
    comparePanel: document.getElementById('compare-panel'),
    compareSummaryText: document.getElementById('compare-summary-text'),
    cmpHeadA: document.getElementById('cmp-head-a'),
    cmpHeadB: document.getElementById('cmp-head-b'),
    compareTbody: document.getElementById('compare-tbody'),
    btnRefreshHistory: document.getElementById('btn-refresh-history'),
    historyTbody: document.getElementById('history-tbody'),
  };

  let currentRunRecord = null;
  let currentAuditReport = null;
  let liveTicks = [];
  let cachedRuns = [];
  const selectedCompareIds = new Set();

  const chart = new window.TelemetryRulerChart(el.canvas, el.tooltip);

  const meterCells = [];
  for (let i = 0; i < 50; i += 1) {
    const span = document.createElement('span');
    span.className = 'meter-cell';
    span.textContent = '.';
    el.monoMeter.appendChild(span);
    meterCells.push(span);
  }

  function updateMonoMeter(p95Ms, errorRate) {
    const ratio = Math.max(0, Math.min(1, p95Ms / 1500));
    const activeCount = Math.round(ratio * 50);
    for (let i = 0; i < 50; i += 1) {
      const cell = meterCells[i];
      if (i >= activeCount) {
        cell.className = 'meter-cell';
        cell.textContent = '.';
      } else {
        const tier = Math.min(4, Math.floor((i / 50) * 4) + 1);
        const isErr = errorRate > 1 && i >= 38;
        cell.className = isErr ? 'meter-cell meter-cell--err' : `meter-cell meter-cell--${tier}`;
        cell.textContent = METER_CHARS[tier];
      }
    }
  }

  function setStatus(kind, text) {
    el.liveStatus.className = `run-state run-state--${kind}`;
    el.liveStatusText.textContent = text;
  }

  function setRunningUI(isRunning) {
    el.btnStart.disabled = isRunning;
    el.btnStop.disabled = !isRunning;
    if (isRunning) {
      setStatus('running', 'Sedang mengirim beban nyata…');
    }
  }

  function checkRemoteVisibility() {
    try {
      const parsed = new URL(el.inputUrl.value.trim());
      el.remoteWrap.hidden = isLocalHost(parsed.hostname);
    } catch {
      el.remoteWrap.hidden = true;
    }
  }

  function syncModeFields() {
    const isConstant = el.inputMode.value === 'constant';
    el.inputStartUsers.disabled = isConstant;
    if (isConstant) {
      el.inputStartUsers.value = el.inputUsers.value;
    }
  }

  el.inputMode.addEventListener('change', syncModeFields);
  el.inputUsers.addEventListener('input', () => {
    if (el.inputMode.value === 'constant') {
      el.inputStartUsers.value = el.inputUsers.value;
    }
  });

  function switchTab(tabName) {
    el.tabs.forEach((btn) => {
      const active = btn.dataset.tab === tabName;
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    Object.entries(el.panels).forEach(([key, panel]) => {
      panel.hidden = key !== tabName;
    });
    if (tabName === 'load') {
      chart.render();
    } else if (tabName === 'history') {
      loadHistory();
    }
  }

  el.tabs.forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  el.presets.forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.preset;
      const p = PRESETS[key];
      if (!p) return;
      el.presets.forEach((b) => b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'));
      el.inputUrl.value = p.url;
      el.inputMethod.value = p.method;
      el.inputMode.value = p.mode;
      el.inputStartUsers.value = String(p.startUsers);
      el.inputUsers.value = String(p.maxUsers);
      el.inputDuration.value = String(p.durationSec);
      el.inputThink.value = String(p.thinkTimeMs);
      syncModeFields();
      checkRemoteVisibility();
    });
  });

  el.inputUrl.addEventListener('input', checkRemoteVisibility);

  function parseHeadersInput(raw) {
    const headers = {};
    const lines = String(raw || '').split(/\r?\n/);
    for (const line of lines) {
      const idx = line.indexOf(':');
      if (idx <= 0) continue;
      const k = line.slice(0, idx).trim();
      const v = line.slice(idx + 1).trim();
      if (k) headers[k] = v;
    }
    return headers;
  }

  function formatConsoleTick(pt) {
    const secStr = String(pt.sec).padStart(2, '0');
    const errs = pt.err4xx + pt.err5xx + pt.netErr;
    const rss = pt.targetHealth
      ? `  target_rss=${pt.targetHealth.rssMB}MB  sockets=${pt.targetHealth.activeConnections}`
      : '';
    return `[00:${secStr}]  VU=${String(pt.activeUsers).padStart(3, ' ')}  RPS=${String(pt.rps).padStart(5, ' ')}  p50=${pt.p50Ms}ms  p95=${pt.p95Ms}ms  2xx=${pt.okCount}  err=${errs}${rss}`;
  }

  function renderLiveTick(pt) {
    liveTicks.push(pt);
    chart.pushPoint(pt);

    el.meterRps.textContent = String(pt.rps);
    el.meterUnit.textContent = `req/detik pada detik ke-${pt.sec}`;
    el.meterVu.textContent = `${pt.activeUsers} user`;
    el.meterP95.textContent = `${pt.p95Ms} ms`;
    el.meterErr.textContent = `${pt.errorRate}%`;
    el.meterRss.textContent = pt.targetHealth ? `${pt.targetHealth.rssMB} MB` : 'Tidak tersedia';

    updateMonoMeter(pt.p95Ms, pt.errorRate);

    const line = document.createElement('div');
    const errs = pt.err4xx + pt.err5xx + pt.netErr;
    line.className = errs > 0 ? 'graphite-line-err' : 'graphite-line-accent';
    line.textContent = formatConsoleTick(pt);
    if (liveTicks.length === 1) {
      el.telemetryConsole.textContent = '';
    }
    el.telemetryConsole.appendChild(line);
    el.telemetryConsole.scrollTop = el.telemetryConsole.scrollHeight;

    const totalOk = liveTicks.reduce((s, t) => s + t.okCount, 0);
    const totalErr = liveTicks.reduce((s, t) => s + t.err4xx + t.err5xx + t.netErr, 0);
    const totalReq = totalOk + totalErr;
    const peakRps = liveTicks.reduce((m, t) => Math.max(m, t.rps), 0);
    const totalKB = liveTicks.reduce((s, t) => s + t.kbPerSec, 0).toFixed(1);

    el.mTotal.textContent = String(totalReq);
    el.mOk.textContent = String(totalOk);
    el.mErr.textContent = `${totalErr} (${totalReq ? ((totalErr / totalReq) * 100).toFixed(2) : '0.00'}%)`;
    el.mP95.textContent = `${pt.p95Ms} ms (detik ${pt.sec})`;
    el.mLatPack.textContent = `${pt.avgMs} ms / ${pt.p50Ms} ms / ${pt.p99Ms} ms`;
    el.mRpsPack.textContent = `puncak ${peakRps} req/dtk`;
    el.mKb.textContent = `${totalKB} KB`;
  }

  function renderRunSummary(record) {
    currentRunRecord = record;
    const { summary, verdict, config, timeline } = record;

    el.btnExportPdf.disabled = false;
    el.btnExportReport.disabled = false;
    el.btnExportJson.disabled = false;
    el.btnExportCsv.disabled = false;

    chart.setData(timeline || []);

    const lastPt = timeline && timeline.length ? timeline[timeline.length - 1] : null;
    const shownPeak = summary.peakSuccessRps ?? summary.peakRps;
    const shownAvg = summary.avgSuccessRps ?? summary.avgRps;
    el.meterRps.textContent = String(shownPeak);
    el.meterUnit.textContent = `puncak sukses/dtk (rata-rata ${shownAvg})`;
    el.meterVu.textContent = `${config.maxUsers} maks`;
    el.meterP95.textContent = `${summary.p95Ms} ms`;
    el.meterErr.textContent = `${summary.errorRate}%`;
    el.meterRss.textContent =
      lastPt && lastPt.targetHealth ? `${lastPt.targetHealth.rssMB} MB` : 'Tidak tersedia';
    updateMonoMeter(summary.p95Ms, summary.errorRate);

    el.verdictBox.hidden = false;
    el.verdictBox.className = `verdict-box section-block verdict-box--${verdict.level}`;
    el.verdictTitle.textContent = verdict.title;
    el.verdictText.textContent = verdict.simple || verdict.explanation || '';
    el.verdictTech.textContent = verdict.technical ? `Detail teknis: ${verdict.technical}` : '';
    el.verdictTech.hidden = !verdict.technical;

    renderDiagnosis(record.diagnosis);

    el.ledgerContext.textContent = `${config.method} ${config.url} (${config.mode}, ${config.startUsers} ke ${config.maxUsers} user, ${summary.actualDurationSec} dtk)`;
    el.mTotal.textContent = String(summary.totalRequests);
    el.mOk.textContent = String(summary.okCount);
    el.mErr.textContent = `${summary.totalErrors} (4xx: ${summary.err4xx}, 5xx: ${summary.err5xx}, jaringan: ${summary.netErr}, ${summary.errorRate}%)`;
    el.mP95.textContent = `${summary.p95Ms} ms`;
    el.mLatPack.textContent = `${summary.avgMs} ms / ${summary.p50Ms} ms / ${summary.p99Ms} ms`;
    el.mRpsPack.textContent = `puncak sukses ${shownPeak} req/dtk (total ${summary.peakRps}), rata-rata sukses ${shownAvg} req/dtk`;
    el.mKb.textContent = `${summary.totalKB} KB`;
    el.mBp.textContent = summary.breakingPoint
      ? `Detik ${summary.breakingPoint.sec} (${summary.breakingPoint.activeUsers} user, p95 ${summary.breakingPoint.p95Ms} ms, err ${summary.breakingPoint.errorRate}%)`
      : 'Belum tercapai pada beban ini';

    el.consoleMeta.textContent = `${timeline.length} titik detik terukur`;
    el.telemetryConsole.textContent = '';
    if (!timeline.length) {
      el.telemetryConsole.textContent = 'Tidak ada titik telemetri pada run ini.';
    } else {
      timeline.forEach((pt) => {
        const div = document.createElement('div');
        const errs = pt.err4xx + pt.err5xx + pt.netErr;
        div.className = errs > 0 ? 'graphite-line-err' : 'graphite-line-accent';
        div.textContent = formatConsoleTick(pt);
        el.telemetryConsole.appendChild(div);
      });
    }

    const statusKind =
      verdict.level === 'kuat' ? 'ok' : verdict.level === 'melambat' ? 'warn' : 'err';
    setStatus(statusKind, `Selesai (${summary.totalRequests} request, p95 ${summary.p95Ms} ms)`);
  }

  function formatPointCell(pt, emptyText) {
    if (!pt) return emptyText;
    const rpsText = pt.rps !== undefined ? `${pt.rps} sukses/dtk, ` : '';
    return `${pt.activeUsers} user (detik ${pt.sec}, ${rpsText}p95 ${pt.p95Ms} ms, err ${pt.errorRate}%)`;
  }

  function renderDiagnosis(diag) {
    if (!diag) {
      el.diagnosisSection.hidden = true;
      return;
    }
    el.diagnosisSection.hidden = false;
    el.diagSafe.textContent = formatPointCell(
      diag.safeCapacity,
      'Tidak tercapai (sejak awal p95 > 500 ms atau error)'
    );
    el.diagSlow.textContent = formatPointCell(diag.slowdownPoint, 'Tidak terjadi selama uji');
    el.diagFirstErr.textContent = formatPointCell(diag.firstErrorPoint, 'Tidak terjadi selama uji');
    el.diagBreak.textContent = formatPointCell(
      diag.breakingPoint,
      'Tidak tercapai pada beban ini'
    );
    el.diagDown.textContent = formatPointCell(diag.downPoint, 'Tidak terjadi (error di bawah 50%)');
    el.diagTotalDown.textContent = formatPointCell(
      diag.totalDownPoint,
      'Tidak terjadi (masih ada respons sukses)'
    );

    el.diagFacts.textContent = '';
    if (Array.isArray(diag.factItems) && diag.factItems.length) {
      diag.factItems.forEach((item) => {
        const li = document.createElement('li');
        const pSimple = document.createElement('div');
        pSimple.className = 'simple-copy';
        pSimple.textContent = item.simple;
        const pTech = document.createElement('div');
        pTech.className = 'tech-note';
        pTech.textContent = `Detail teknis: ${item.technical}`;
        li.append(pSimple, pTech);
        el.diagFacts.appendChild(li);
      });
    } else {
      (diag.facts || []).forEach((factText) => {
        const li = document.createElement('li');
        li.textContent = factText;
        el.diagFacts.appendChild(li);
      });
    }

    el.diagRecTbody.textContent = '';
    (diag.recommendations || []).forEach((rec) => {
      const tr = document.createElement('tr');
      const tdArea = document.createElement('td');
      tdArea.textContent = rec.area;

      const tdIssue = document.createElement('td');
      const issueMain = document.createElement('div');
      issueMain.className = 'simple-copy';
      issueMain.textContent = rec.simpleIssue || rec.issue;
      tdIssue.appendChild(issueMain);
      if (rec.simpleIssue && rec.issue) {
        const issueTech = document.createElement('div');
        issueTech.className = 'tech-note';
        issueTech.textContent = `Teknis: ${rec.issue}`;
        tdIssue.appendChild(issueTech);
      }

      const tdSol = document.createElement('td');
      const solMain = document.createElement('div');
      solMain.className = 'simple-copy';
      solMain.textContent = rec.simpleSolution || rec.solution;
      tdSol.appendChild(solMain);
      if (rec.simpleSolution && rec.solution) {
        const solTech = document.createElement('div');
        solTech.className = 'tech-note';
        solTech.textContent = `Solusi teknis: ${rec.solution}`;
        tdSol.appendChild(solTech);
      }

      tr.append(tdArea, tdIssue, tdSol);
      el.diagRecTbody.appendChild(tr);
    });
  }

  el.form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    el.loadError.hidden = true;

    const payload = {
      url: el.inputUrl.value.trim(),
      method: el.inputMethod.value,
      mode: el.inputMode.value,
      startUsers: Number.parseInt(el.inputStartUsers.value, 10),
      maxUsers: Number.parseInt(el.inputUsers.value, 10),
      durationSec: Number.parseInt(el.inputDuration.value, 10),
      thinkTimeMs: Number.parseInt(el.inputThink.value, 10),
      stepUsers: Number.parseInt(el.inputStepUsers.value, 10),
      stepIntervalSec: Number.parseInt(el.inputStepInterval.value, 10),
      timeoutMs: Number.parseInt(el.inputTimeout.value, 10),
      headers: parseHeadersInput(el.inputHeaders.value),
      body: el.inputBody.value,
      allowRemote: el.inputAllowRemote.checked,
    };

    try {
      const res = await fetch('/api/test/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        el.loadError.textContent = data.error || 'Gagal memulai pengujian.';
        el.loadError.hidden = false;
        return;
      }

      liveTicks = [];
      currentRunRecord = null;
      chart.setData([]);
      el.verdictBox.hidden = true;
      el.diagnosisSection.hidden = true;
      el.btnExportPdf.disabled = true;
      el.btnExportReport.disabled = true;
      el.btnExportJson.disabled = true;
      el.btnExportCsv.disabled = true;
      el.mBp.textContent = 'Memantau…';
      el.ledgerContext.textContent = `Menguji ${data.config.method} ${data.config.url}…`;
      el.consoleMeta.textContent = `Run ${data.runId.slice(0, 8)} aktif`;
      el.telemetryConsole.textContent = 'Mengirim gelombang pertama permintaan HTTP…';
      setRunningUI(true);
    } catch (err) {
      el.loadError.textContent = err?.message || 'Tidak dapat terhubung ke server BebanLab.';
      el.loadError.hidden = false;
    }
  });

  el.btnStop.addEventListener('click', async () => {
    el.btnStop.disabled = true;
    try {
      await fetch('/api/test/stop', { method: 'POST' });
    } catch {
      // handled by SSE done
    }
  });

  function downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function csvEscape(value) {
    const str = String(value ?? '');
    if (/[",\r\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  function buildMarkdownReport(runRecord, auditReport) {
    const lines = [];
    lines.push('# Laporan Pengujian Website - BebanLab');
    lines.push(`Waktu ekspor: ${new Date().toLocaleString('id-ID')}`);
    lines.push('');

    if (runRecord) {
      const { config, summary, verdict, diagnosis, timeline } = runRecord;
      const peakOk = summary.peakSuccessRps ?? summary.peakRps;
      const avgOk = summary.avgSuccessRps ?? summary.avgRps;
      lines.push('## 1. Hasil Uji Beban (Load Test)');
      lines.push(`- Target: \`${config.method} ${config.url}\``);
      lines.push(`- Skenario: pola \`${config.mode}\`, ${config.startUsers} ke ${config.maxUsers} user bersamaan, durasi ${summary.actualDurationSec} detik, jeda antar request ${config.thinkTimeMs} ms`);
      lines.push(`- Status Utama: **${verdict.title}**`);
      lines.push('');
      lines.push('### Penjelasan Sederhana (Utama)');
      lines.push(verdict.simple || verdict.explanation || '');
      lines.push('');
      if (verdict.technical) {
        lines.push('### Pendukung Teknis');
        lines.push(verdict.technical);
        lines.push('');
      }

      lines.push('### Ringkasan Angka Terukur (Valid)');
      lines.push('| Metrik | Nilai Terukur |');
      lines.push('| --- | --- |');
      lines.push(`| Total permintaan selesai | ${summary.totalRequests} |`);
      lines.push(`| Berhasil (2xx / 3xx) | ${summary.okCount} |`);
      lines.push(`| Gagal (4xx / 5xx / jaringan) | ${summary.totalErrors} (${summary.errorRate}%) |`);
      lines.push(`| Puncak sukses per detik | ${peakOk} req/dtk (rata-rata sukses ${avgOk} req/dtk) |`);
      lines.push(`| Kecepatan respons rata-rata / median (p50) / p95 / p99 | ${summary.avgMs} ms / ${summary.p50Ms} ms / ${summary.p95Ms} ms / ${summary.p99Ms} ms |`);
      lines.push(`| Total data diterima | ${summary.totalKB} KB |`);
      lines.push('');

      if (diagnosis) {
        lines.push('### Fase Beban dan Titik Down');
        lines.push(`- Kapasitas aman terakhir (p95 <= 500 ms, 0% error): ${formatPointCell(diagnosis.safeCapacity, 'Tidak tercapai')}`);
        lines.push(`- Mulai melambat (p95 > 500 ms): ${formatPointCell(diagnosis.slowdownPoint, 'Tidak terjadi')}`);
        lines.push(`- Error / timeout pertama: ${formatPointCell(diagnosis.firstErrorPoint, 'Tidak terjadi')}`);
        lines.push(`- Titik jenuh (p95 > 1000 ms / error > 1%): ${formatPointCell(diagnosis.breakingPoint, 'Tidak tercapai')}`);
        lines.push(`- Mayoritas gagal (>= 50% error): ${formatPointCell(diagnosis.downPoint, 'Tidak terjadi')}`);
        lines.push(`- Down total (0 sukses): ${formatPointCell(diagnosis.totalDownPoint, 'Tidak terjadi')}`);
        lines.push('');

        if (Array.isArray(diagnosis.factItems) && diagnosis.factItems.length) {
          lines.push('### Fakta Lapangan Terukur');
          diagnosis.factItems.forEach((f) => {
            lines.push(`- **${f.phase}:** ${f.simple}`);
            lines.push(`  - *Teknis:* ${f.technical}`);
          });
          lines.push('');
        }

        if (Array.isArray(diagnosis.recommendations) && diagnosis.recommendations.length) {
          lines.push('### Solusi dan Saran Perbaikan Uji Beban');
          diagnosis.recommendations.forEach((r, idx) => {
            lines.push(`${idx + 1}. **${r.area}**`);
            lines.push(`   - Masalah (sederhana): ${r.simpleIssue || r.issue}`);
            lines.push(`   - Solusi (sederhana): ${r.simpleSolution || r.solution}`);
            lines.push(`   - Masalah (teknis): ${r.issue}`);
            lines.push(`   - Solusi (teknis): ${r.solution}`);
          });
          lines.push('');
        }
      }

      if (Array.isArray(timeline) && timeline.length) {
        lines.push('### Data Per Detik');
        lines.push('| Detik | User Aktif | Sukses (2xx/3xx) | Gagal | Error (%) | p50 (ms) | p95 (ms) | Data (KB/dtk) |');
        lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
        timeline.forEach((pt) => {
          const errs = pt.err4xx + pt.err5xx + pt.netErr;
          lines.push(`| ${pt.sec} | ${pt.activeUsers} | ${pt.okCount} | ${errs} | ${pt.errorRate}% | ${pt.p50Ms} | ${pt.p95Ms} | ${pt.kbPerSec} |`);
        });
        lines.push('');
      }
    } else {
      lines.push('## 1. Hasil Uji Beban');
      lines.push('Belum ada data uji beban pada sesi ini.');
      lines.push('');
    }

    if (auditReport) {
      lines.push('## 2. Hasil Audit Keamanan Header HTTP');
      lines.push(`- Target URL akhir: \`${auditReport.finalUrl}\``);
      lines.push(`- Status HTTP: ${auditReport.statusCode} | Latensi: ${auditReport.latencyMs} ms | Skor: **${auditReport.score} / ${auditReport.maxScore}**`);
      if (auditReport.summary) {
        lines.push(`- Ringkasan sederhana: ${auditReport.summary.simple}`);
        lines.push(`- Pendukung teknis: ${auditReport.summary.technical}`);
      }
      lines.push('');
      lines.push('### Rincian Pemeriksaan dan Solusi');
      (auditReport.checks || []).forEach((chk, idx) => {
        lines.push(`${idx + 1}. **${chk.name}** [${statusLabel(chk.status)}]`);
        lines.push(`   - Nilai aktual: \`${chk.observed}\``);
        lines.push(`   - Penjelasan sederhana: ${chk.simpleDetail || chk.detail}`);
        lines.push(`   - Solusi sederhana: ${chk.simpleSolution || chk.recommendation}`);
        lines.push(`   - Penjelasan teknis: ${chk.detail}`);
        lines.push(`   - Solusi teknis: ${chk.recommendation}`);
      });
      lines.push('');
      lines.push('### Header HTTP Mentah');
      lines.push('```text');
      Object.entries(auditReport.rawHeaders || {}).forEach(([k, v]) => {
        lines.push(`${k}: ${v}`);
      });
      lines.push('```');
      lines.push('');
    } else {
      lines.push('## 2. Hasil Audit Keamanan Header HTTP');
      lines.push('Audit keamanan belum dijalankan pada sesi ini. Jalankan tab "Cek keamanan" terlebih dahulu jika ingin menyertakan hasil audit di laporan.');
      lines.push('');
    }

    return lines.join('\n');
  }

  function buildCombinedJson(runRecord, auditReport) {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        loadTest: runRecord || null,
        securityAudit: auditReport || null,
      },
      null,
      2
    );
  }

  function buildRichCsv(runRecord, auditReport) {
    const lines = [];
    const pushRow = (cols) => lines.push(cols.map(csvEscape).join(','));

    if (runRecord) {
      const { config, summary, verdict, diagnosis, timeline } = runRecord;
      pushRow(['BAGIAN', 'KATEGORI', 'PENJELASAN SEDERHANA / NILAI', 'PENDUKUNG TEKNIS / DETAIL']);
      pushRow(['RINGKASAN UJI BEBAN', 'Target', `${config.method} ${config.url}`, `Pola ${config.mode}, ${config.startUsers}->${config.maxUsers} user, ${summary.actualDurationSec} dtk`]);
      pushRow(['RINGKASAN UJI BEBAN', 'Kesimpulan', verdict.simple || verdict.explanation, verdict.technical || '']);
      pushRow(['RINGKASAN UJI BEBAN', 'Total / Sukses / Gagal', `${summary.totalRequests} total | ${summary.okCount} sukses | ${summary.totalErrors} gagal (${summary.errorRate}%)`, `4xx=${summary.err4xx}, 5xx=${summary.err5xx}, netErr=${summary.netErr}`]);
      pushRow(['RINGKASAN UJI BEBAN', 'Kecepatan & Latensi', `Puncak sukses ${summary.peakSuccessRps ?? summary.peakRps} req/dtk`, `avg=${summary.avgMs}ms, p50=${summary.p50Ms}ms, p95=${summary.p95Ms}ms, p99=${summary.p99Ms}ms`]);

      if (diagnosis) {
        pushRow(['FASE BEBAN', 'Kapasitas aman', formatPointCell(diagnosis.safeCapacity, 'Tidak tercapai'), 'p95 <= 500 ms dan 0% error']);
        pushRow(['FASE BEBAN', 'Mulai melambat', formatPointCell(diagnosis.slowdownPoint, 'Tidak terjadi'), 'p95 > 500 ms']);
        pushRow(['FASE BEBAN', 'Error / timeout pertama', formatPointCell(diagnosis.firstErrorPoint, 'Tidak terjadi'), 'Error pertama muncul']);
        pushRow(['FASE BEBAN', 'Titik jenuh', formatPointCell(diagnosis.breakingPoint, 'Tidak tercapai'), 'p95 > 1000 ms atau error > 1%']);
        pushRow(['FASE BEBAN', 'Mayoritas gagal (>=50%)', formatPointCell(diagnosis.downPoint, 'Tidak terjadi'), 'errorRate >= 50%']);
        pushRow(['FASE BEBAN', 'Down total (0 sukses)', formatPointCell(diagnosis.totalDownPoint, 'Tidak terjadi'), 'okCount = 0']);

        (diagnosis.factItems || []).forEach((f) => {
          pushRow(['FAKTA TERUKUR', f.phase, f.simple, f.technical]);
        });
        (diagnosis.recommendations || []).forEach((r) => {
          pushRow([
            'SOLUSI UJI BEBAN',
            r.area,
            `Masalah: ${r.simpleIssue || r.issue} | Solusi: ${r.simpleSolution || r.solution}`,
            `Masalah teknis: ${r.issue} | Solusi teknis: ${r.solution}`,
          ]);
        });
      }
      pushRow([]);
    }

    if (auditReport) {
      pushRow(['AUDIT KEAMANAN', 'Target & Skor', `Skor ${auditReport.score} / ${auditReport.maxScore} (${auditReport.summary?.simple || ''})`, `URL ${auditReport.finalUrl} | HTTP ${auditReport.statusCode} | ${auditReport.latencyMs} ms | ${auditReport.summary?.technical || ''}`]);
      pushRow(['PEMERIKSAAN', 'STATUS', 'NILAI AKTUAL', 'PENJELASAN SEDERHANA & SOLUSI', 'PENJELASAN & SOLUSI TEKNIS']);
      (auditReport.checks || []).forEach((chk) => {
        pushRow([
          chk.name,
          statusLabel(chk.status),
          chk.observed,
          `${chk.simpleDetail || chk.detail} Solusi: ${chk.simpleSolution || chk.recommendation}`,
          `${chk.detail} Solusi teknis: ${chk.recommendation}`,
        ]);
      });
      pushRow([]);
    }

    if (runRecord && Array.isArray(runRecord.timeline) && runRecord.timeline.length) {
      pushRow(['TELEMETRI PER DETIK']);
      pushRow(['sec', 'activeUsers', 'okCount', 'errTotal', 'rpsTotal', 'avgMs', 'p50Ms', 'p95Ms', 'p99Ms', 'minMs', 'maxMs', 'err4xx', 'err5xx', 'netErr', 'errorRate', 'kbPerSec']);
      runRecord.timeline.forEach((p) => {
        pushRow([
          p.sec,
          p.activeUsers,
          p.okCount,
          p.err4xx + p.err5xx + p.netErr,
          p.rps,
          p.avgMs,
          p.p50Ms,
          p.p95Ms,
          p.p99Ms,
          p.minMs,
          p.maxMs,
          p.err4xx,
          p.err5xx,
          p.netErr,
          p.errorRate,
          p.kbPerSec,
        ]);
      });
    }

    return `\uFEFF${lines.join('\n')}`;
  }

  function getExportPrefix() {
    if (currentRunRecord) return `bebanlab-${currentRunRecord.id.slice(0, 8)}`;
    return 'bebanlab-audit';
  }

  function exportMarkdown() {
    if (!currentRunRecord && !currentAuditReport) return;
    downloadFile(
      `${getExportPrefix()}-laporan.md`,
      buildMarkdownReport(currentRunRecord, currentAuditReport),
      'text/markdown; charset=utf-8'
    );
  }

  function exportJson() {
    if (!currentRunRecord && !currentAuditReport) return;
    downloadFile(
      `${getExportPrefix()}.json`,
      buildCombinedJson(currentRunRecord, currentAuditReport),
      'application/json; charset=utf-8'
    );
  }

  function exportCsv() {
    if (!currentRunRecord && !currentAuditReport) return;
    downloadFile(
      `${getExportPrefix()}.csv`,
      buildRichCsv(currentRunRecord, currentAuditReport),
      'text/csv; charset=utf-8'
    );
  }

  function escHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function buildSvgTimeline(timeline) {
    if (!Array.isArray(timeline) || !timeline.length) return '';
    const W = 720;
    const H = 200;
    const pad = { top: 24, right: 20, bottom: 28, left: 42 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;
    const maxY = Math.max(10, ...timeline.map((p) => p.okCount + p.err4xx + p.err5xx + p.netErr));
    const xFor = (i) =>
      timeline.length === 1 ? pad.left + plotW / 2 : pad.left + (plotW * i) / (timeline.length - 1);
    const yFor = (v) => pad.top + plotH - (Math.min(v, maxY) / maxY) * plotH;
    const okPts = timeline.map((p, i) => `${xFor(i).toFixed(1)},${yFor(p.okCount).toFixed(1)}`).join(' ');
    const errPts = timeline
      .map((p, i) => `${xFor(i).toFixed(1)},${yFor(p.err4xx + p.err5xx + p.netErr).toFixed(1)}`)
      .join(' ');

    return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="auto" style="border:1px solid #dbe2ee;border-radius:6px;background:#f5f7fb;">
      <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left + plotW}" y2="${pad.top}" stroke="#e2e8f0" />
      <line x1="${pad.left}" y1="${pad.top + plotH / 2}" x2="${pad.left + plotW}" y2="${pad.top + plotH / 2}" stroke="#e2e8f0" />
      <line x1="${pad.left}" y1="${pad.top + plotH}" x2="${pad.left + plotW}" y2="${pad.top + plotH}" stroke="#cbd5e1" />
      <polyline points="${okPts}" fill="none" stroke="#1d4ed8" stroke-width="2.2" />
      <polyline points="${errPts}" fill="none" stroke="#dc2626" stroke-width="2" />
      <text x="${pad.left}" y="15" font-family="sans-serif" font-size="11" font-weight="600" fill="#182032">Grafik Sukses (biru) vs Gagal (merah) per Detik</text>
      <text x="${pad.left - 6}" y="${pad.top + 4}" text-anchor="end" font-family="monospace" font-size="10" fill="#5b667a">${maxY}</text>
      <text x="${pad.left - 6}" y="${pad.top + plotH + 3}" text-anchor="end" font-family="monospace" font-size="10" fill="#5b667a">0</text>
      <text x="${pad.left}" y="${H - 8}" font-family="monospace" font-size="10" fill="#5b667a">d${timeline[0].sec}</text>
      <text x="${pad.left + plotW}" y="${H - 8}" text-anchor="end" font-family="monospace" font-size="10" fill="#5b667a">d${timeline[timeline.length - 1].sec}</text>
    </svg>`;
  }

  function buildPrintableHtmlReport(runRecord, auditReport) {
    const loadHtml = runRecord
      ? (() => {
          const { config, summary, verdict, diagnosis, timeline } = runRecord;
          const peakOk = summary.peakSuccessRps ?? summary.peakRps;
          const avgOk = summary.avgSuccessRps ?? summary.avgRps;
          const factsHtml = (diagnosis?.factItems || [])
            .map(
              (f) =>
                `<li><div><strong>${escHtml(f.phase)}:</strong> ${escHtml(f.simple)}</div><div class="tech">${escHtml(f.technical)}</div></li>`
            )
            .join('');
          const recsHtml = (diagnosis?.recommendations || [])
            .map(
              (r) =>
                `<tr><td>${escHtml(r.area)}</td><td><div>${escHtml(r.simpleIssue || r.issue)}</div><div class="tech">${escHtml(r.issue)}</div></td><td><div>${escHtml(r.simpleSolution || r.solution)}</div><div class="tech">${escHtml(r.solution)}</div></td></tr>`
            )
            .join('');
          return `<h2>1. Hasil Uji Beban</h2>
            <p class="mono">Target: ${escHtml(config.method)} ${escHtml(config.url)} | Pola: ${escHtml(config.mode)} (${config.startUsers} ke ${config.maxUsers} user, ${summary.actualDurationSec} detik)</p>
            <div class="callout"><strong>${escHtml(verdict.title)}</strong><p>${escHtml(verdict.simple || verdict.explanation)}</p><p class="tech">${escHtml(verdict.technical || '')}</p></div>
            ${buildSvgTimeline(timeline)}
            <table><thead><tr><th>Metrik</th><th>Nilai Terukur</th></tr></thead><tbody>
              <tr><td>Total / Sukses / Gagal</td><td class="mono">${summary.totalRequests} total | ${summary.okCount} sukses | ${summary.totalErrors} gagal (${summary.errorRate}%)</td></tr>
              <tr><td>Puncak &amp; Rata-rata Sukses</td><td class="mono">${peakOk} req/dtk (rata-rata ${avgOk} req/dtk)</td></tr>
              <tr><td>Latensi (avg / p50 / p95 / p99)</td><td class="mono">${summary.avgMs} / ${summary.p50Ms} / ${summary.p95Ms} / ${summary.p99Ms} ms</td></tr>
              <tr><td>Error pertama</td><td class="mono">${escHtml(formatPointCell(diagnosis?.firstErrorPoint, 'Tidak terjadi'))}</td></tr>
              <tr><td>Titik jenuh (p95 &gt; 1000 ms / err &gt; 1%)</td><td class="mono">${escHtml(formatPointCell(diagnosis?.breakingPoint, 'Tidak tercapai'))}</td></tr>
              <tr><td>Down total (0 sukses)</td><td class="mono">${escHtml(formatPointCell(diagnosis?.totalDownPoint, 'Tidak terjadi'))}</td></tr>
            </tbody></table>
            ${factsHtml ? `<h3>Fakta Lapangan</h3><ul>${factsHtml}</ul>` : ''}
            ${recsHtml ? `<h3>Solusi &amp; Saran</h3><table><thead><tr><th>Area</th><th>Temuan</th><th>Solusi</th></tr></thead><tbody>${recsHtml}</tbody></table>` : ''}`;
        })()
      : '';

    const auditHtml = auditReport
      ? `<h2>2. Hasil Audit Keamanan HTTP</h2>
        <p class="mono">Target: ${escHtml(auditReport.finalUrl)} | HTTP ${auditReport.statusCode} | ${auditReport.latencyMs} ms | Skor ${auditReport.score} / ${auditReport.maxScore}</p>
        ${auditReport.summary ? `<div class="callout"><strong>${escHtml(auditReport.summary.title)}</strong><p>${escHtml(auditReport.summary.simple)}</p><p class="tech">${escHtml(auditReport.summary.technical)}</p></div>` : ''}
        <table><thead><tr><th>Pemeriksaan</th><th>Status</th><th>Header Aktual</th><th>Penjelasan &amp; Solusi</th></tr></thead><tbody>
          ${(auditReport.checks || [])
            .map(
              (c) =>
                `<tr><td>${escHtml(c.name)}</td><td>${escHtml(statusLabel(c.status))}</td><td class="mono">${escHtml(c.observed)}</td><td><div>${escHtml(c.simpleDetail || c.detail)} Solusi: ${escHtml(c.simpleSolution || c.recommendation)}</div><div class="tech">${escHtml(c.detail)} | ${escHtml(c.recommendation)}</div></td></tr>`
            )
            .join('')}
        </tbody></table>`
      : '';

    return `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>Laporan BebanLab</title>
      <style>
        @page { size: A4; margin: 14mm; }
        body { font-family: system-ui, sans-serif; color: #182032; font-size: 10pt; line-height: 1.45; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        h1 { font-size: 18pt; margin: 0 0 4px; } h2 { font-size: 13pt; margin: 16px 0 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; } h3 { font-size: 11pt; margin: 12px 0 6px; }
        .mono { font-family: monospace; font-size: 9pt; }
        .callout { border-left: 3px solid #1d4ed8; background: #eff6ff; padding: 8px 12px; margin: 8px 0 12px; }
        .tech { color: #5b667a; font-size: 8.5pt; margin-top: 3px; }
        table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 9pt; }
        th, td { border-bottom: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; vertical-align: top; }
        th { background: #f1f5f9; }
      </style></head><body>
      <h1>Laporan Pengujian BebanLab</h1>
      <div class="tech">Dicetak pada ${escHtml(new Date().toLocaleString('id-ID'))}</div>
      ${loadHtml}${auditHtml}
      </body></html>`;
  }

  function exportPdf() {
    if (!currentRunRecord && !currentAuditReport) return;
    const html = buildPrintableHtmlReport(currentRunRecord, currentAuditReport);
    const win = window.open('', '_blank', 'width=960,height=760');
    if (!win) {
      downloadFile(`${getExportPrefix()}-laporan.html`, html, 'text/html; charset=utf-8');
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 250);
  }

  el.btnExportPdf.addEventListener('click', exportPdf);
  el.btnExportReport.addEventListener('click', exportMarkdown);
  el.btnExportJson.addEventListener('click', exportJson);
  el.btnExportCsv.addEventListener('click', exportCsv);
  el.btnAuditExportPdf.addEventListener('click', exportPdf);
  el.btnAuditExportMd.addEventListener('click', exportMarkdown);
  el.btnAuditExportJson.addEventListener('click', exportJson);
  el.btnAuditExportCsv.addEventListener('click', exportCsv);

  function connectStream() {
    const es = new EventSource('/api/test/stream');

    es.addEventListener('state', (ev) => {
      try {
        const st = JSON.parse(ev.data);
        setRunningUI(Boolean(st.running));
        if (!st.running && !currentRunRecord) {
          setStatus('ok', 'Siap menguji');
        }
      } catch {
        // ignore parse error
      }
    });

    es.addEventListener('tick', (ev) => {
      try {
        const payload = JSON.parse(ev.data);
        if (payload && payload.point) {
          renderLiveTick(payload.point);
        }
      } catch {
        // ignore
      }
    });

    es.addEventListener('done', (ev) => {
      setRunningUI(false);
      try {
        const record = JSON.parse(ev.data);
        renderRunSummary(record);
      } catch {
        // ignore
      }
    });

    es.addEventListener('error', (ev) => {
      if (ev.data) {
        setRunningUI(false);
        setStatus('err', 'Terjadi kesalahan saat pengujian');
      } else if (es.readyState === EventSource.CONNECTING) {
        setStatus('warn', 'Menghubungkan ke server BebanLab…');
      }
    });
  }

  function statusIconSvg(status) {
    if (status === 'pass') {
      return '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 8.5L6.5 12L13 4.5"/></svg>';
    }
    if (status === 'warn') {
      return '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M8 2.5L14 13H2L8 2.5Z"/><path d="M8 6.5V9.5"/></svg>';
    }
    if (status === 'fail') {
      return '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 4L12 12M12 4L4 12"/></svg>';
    }
    return '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="8" cy="8" r="5.5"/><path d="M8 7V11"/></svg>';
  }

  function statusLabel(status) {
    if (status === 'pass') return 'Aman';
    if (status === 'warn') return 'Peringatan';
    if (status === 'fail') return 'Kurang';
    return 'Info';
  }

  async function executeAudit(targetUrl) {
    el.auditError.hidden = true;
    el.btnAuditRun.disabled = true;
    el.btnAuditRun.textContent = 'Memeriksa…';

    try {
      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        el.auditError.textContent = data.error || 'Gagal memeriksa header target.';
        el.auditError.hidden = false;
        return;
      }

      currentAuditReport = data;
      el.auditResultCard.hidden = false;
      el.auditRawCard.hidden = false;
      el.auditScore.textContent = `${data.score} / ${data.maxScore}`;
      el.auditMeta.textContent = `HTTP ${data.statusCode} | ${data.latencyMs} ms | ${data.finalUrl}`;

      if (data.summary) {
        el.auditSummaryBox.hidden = false;
        el.auditSummaryTitle.textContent = data.summary.title;
        el.auditSummarySimple.textContent = data.summary.simple;
        el.auditSummaryTech.textContent = `Detail teknis: ${data.summary.technical}`;
      } else {
        el.auditSummaryBox.hidden = true;
      }

      el.auditTbody.textContent = '';
      data.checks.forEach((chk) => {
        const tr = document.createElement('tr');
        const tdName = document.createElement('td');
        tdName.textContent = chk.name;

        const tdStatus = document.createElement('td');
        const badge = document.createElement('span');
        badge.className = `status-inline status-inline--${chk.status}`;
        badge.innerHTML = `${statusIconSvg(chk.status)}<span>${statusLabel(chk.status)}</span>`;
        tdStatus.appendChild(badge);

        const tdObs = document.createElement('td');
        tdObs.className = 'mono';
        tdObs.textContent = chk.observed;

        const tdDetail = document.createElement('td');
        const pSimple = document.createElement('div');
        pSimple.className = 'simple-copy';
        pSimple.textContent = `${chk.simpleDetail || chk.detail} Solusi: ${chk.simpleSolution || chk.recommendation}`;
        const pTech = document.createElement('div');
        pTech.className = 'tech-note';
        pTech.textContent = `Teknis: ${chk.detail} Saran teknis: ${chk.recommendation}`;
        tdDetail.append(pSimple, pTech);

        tr.append(tdName, tdStatus, tdObs, tdDetail);
        el.auditTbody.appendChild(tr);
      });

      el.auditRawUrl.textContent = data.finalUrl;
      const rawLines = Object.entries(data.rawHeaders || {}).map(([k, v]) => `${k}: ${v}`);
      el.auditRawBody.textContent = rawLines.join('\n') || '(tidak ada header)';
    } catch (err) {
      el.auditError.textContent = err?.message || 'Tidak dapat menghubungi server audit.';
      el.auditError.hidden = false;
    } finally {
      el.btnAuditRun.disabled = false;
      el.btnAuditRun.textContent = 'Periksa header';
    }
  }

  el.auditForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    executeAudit(el.auditUrl.value.trim());
  });

  el.btnAuditHardened.addEventListener('click', () => {
    const hardenedUrl = `${targetBaseUrl}/?hardened=1`;
    el.auditUrl.value = hardenedUrl;
    executeAudit(hardenedUrl);
  });

  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return iso;
    }
  }

  async function loadHistory() {
    try {
      const res = await fetch('/api/runs');
      const data = await res.json();
      cachedRuns = Array.isArray(data.runs) ? data.runs : [];
      renderHistoryTable();
    } catch {
      // ignore
    }
  }

  function syncCompareButtons() {
    const count = selectedCompareIds.size;
    el.btnCompareRuns.textContent = `Bandingkan (${count}/2)`;
    el.btnCompareRuns.disabled = count !== 2;
    el.btnClearCompare.hidden = count === 0;
  }

  function formatDelta(diff, unit, lowerIsBetter) {
    if (diff === 0) return { text: `Sama (0 ${unit})`, cls: 'mono' };
    const sign = diff > 0 ? '+' : '';
    const isGood = lowerIsBetter ? diff < 0 : diff > 0;
    return {
      text: `${sign}${Number(diff.toFixed(2))} ${unit}`,
      cls: isGood ? 'delta-good' : 'delta-bad',
    };
  }

  function renderComparePanel() {
    const ids = [...selectedCompareIds];
    if (ids.length !== 2) {
      el.comparePanel.hidden = true;
      return;
    }
    const runA = cachedRuns.find((r) => r.id === ids[0]);
    const runB = cachedRuns.find((r) => r.id === ids[1]);
    if (!runA || !runB) {
      el.comparePanel.hidden = true;
      return;
    }

    el.comparePanel.hidden = false;
    el.cmpHeadA.textContent = `A (${runA.id.slice(0, 6)} | ${runA.config.maxUsers}u)`;
    el.cmpHeadB.textContent = `B (${runB.id.slice(0, 6)} | ${runB.config.maxUsers}u)`;

    const peakA = runA.summary.peakSuccessRps ?? runA.summary.peakRps;
    const peakB = runB.summary.peakSuccessRps ?? runB.summary.peakRps;
    const rows = [
      {
        label: 'Puncak sukses (req/dtk)',
        a: `${peakA} req/dtk`,
        b: `${peakB} req/dtk`,
        delta: formatDelta(peakB - peakA, 'req/dtk', false),
      },
      {
        label: 'Latensi p50 (median)',
        a: `${runA.summary.p50Ms} ms`,
        b: `${runB.summary.p50Ms} ms`,
        delta: formatDelta(runB.summary.p50Ms - runA.summary.p50Ms, 'ms', true),
      },
      {
        label: 'Latensi p95',
        a: `${runA.summary.p95Ms} ms`,
        b: `${runB.summary.p95Ms} ms`,
        delta: formatDelta(runB.summary.p95Ms - runA.summary.p95Ms, 'ms', true),
      },
      {
        label: 'Tingkat error',
        a: `${runA.summary.errorRate}%`,
        b: `${runB.summary.errorRate}%`,
        delta: formatDelta(runB.summary.errorRate - runA.summary.errorRate, '%', true),
      },
      {
        label: 'Total permintaan sukses',
        a: `${runA.summary.okCount} / ${runA.summary.totalRequests}`,
        b: `${runB.summary.okCount} / ${runB.summary.totalRequests}`,
        delta: formatDelta(runB.summary.okCount - runA.summary.okCount, 'req', false),
      },
    ];

    el.compareTbody.textContent = '';
    rows.forEach((row) => {
      const tr = document.createElement('tr');
      const tdLbl = document.createElement('td');
      tdLbl.textContent = row.label;
      const tdA = document.createElement('td');
      tdA.className = 'mono';
      tdA.textContent = row.a;
      const tdB = document.createElement('td');
      tdB.className = 'mono';
      tdB.textContent = row.b;
      const tdD = document.createElement('td');
      tdD.className = row.delta.cls;
      tdD.textContent = row.delta.text;
      tr.append(tdLbl, tdA, tdB, tdD);
      el.compareTbody.appendChild(tr);
    });

    const p95Diff = Number((runB.summary.p95Ms - runA.summary.p95Ms).toFixed(2));
    el.compareSummaryText.textContent =
      p95Diff < 0
        ? `Pengujian B lebih cepat ${Math.abs(p95Diff)} ms pada p95 dibanding Pengujian A.`
        : p95Diff > 0
          ? `Pengujian B lebih lambat ${p95Diff} ms pada p95 dibanding Pengujian A.`
          : 'Kedua pengujian mencatat latensi p95 yang sama.';
  }

  el.btnCompareRuns.addEventListener('click', renderComparePanel);
  el.btnClearCompare.addEventListener('click', () => {
    selectedCompareIds.clear();
    el.comparePanel.hidden = true;
    syncCompareButtons();
    renderHistoryTable();
  });

  function renderHistoryTable() {
    el.historyTbody.textContent = '';
    if (!cachedRuns.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 9;
      td.className = 'empty-state';
      td.textContent = 'Belum ada riwayat pengujian tersimpan.';
      tr.appendChild(td);
      el.historyTbody.appendChild(tr);
      syncCompareButtons();
      return;
    }

    cachedRuns.forEach((run) => {
      const tr = document.createElement('tr');

      const tdPick = document.createElement('td');
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.setAttribute('aria-label', `Pilih run ${run.id.slice(0, 8)} untuk dibandingkan`);
      chk.checked = selectedCompareIds.has(run.id);
      chk.addEventListener('change', () => {
        if (chk.checked) {
          if (selectedCompareIds.size >= 2) {
            const firstId = selectedCompareIds.values().next().value;
            selectedCompareIds.delete(firstId);
          }
          selectedCompareIds.add(run.id);
        } else {
          selectedCompareIds.delete(run.id);
        }
        syncCompareButtons();
        renderHistoryTable();
      });
      tdPick.appendChild(chk);

      const tdTime = document.createElement('td');
      tdTime.className = 'mono';
      tdTime.textContent = formatDate(run.startedAt);

      const tdUrl = document.createElement('td');
      tdUrl.className = 'mono';
      tdUrl.textContent = `${run.config.method} ${run.config.url}`;

      const tdMode = document.createElement('td');
      tdMode.textContent = `${run.config.mode} (${run.config.startUsers} ke ${run.config.maxUsers}, ${run.config.durationSec}s)`;

      const tdRps = document.createElement('td');
      tdRps.className = 'mono';
      tdRps.textContent = `${run.summary.peakSuccessRps ?? run.summary.peakRps} req/dtk`;

      const tdP95 = document.createElement('td');
      tdP95.className = 'mono';
      tdP95.textContent = `${run.summary.p95Ms} ms`;

      const tdErr = document.createElement('td');
      tdErr.className = 'mono';
      tdErr.textContent = `${run.summary.errorRate}%`;

      const tdVerdict = document.createElement('td');
      const mapKind =
        run.verdict.level === 'kuat'
          ? 'pass'
          : run.verdict.level === 'melambat'
            ? 'warn'
            : 'fail';
      const vSpan = document.createElement('span');
      vSpan.className = `status-inline status-inline--${mapKind}`;
      vSpan.textContent = run.verdict.level;
      tdVerdict.appendChild(vSpan);

      const tdAct = document.createElement('td');
      const openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.className = 'key key--small';
      openBtn.textContent = 'Lihat grafik';
      openBtn.addEventListener('click', () => {
        renderRunSummary(run);
        switchTab('load');
      });

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'key key--small key--danger';
      delBtn.textContent = 'Hapus';
      delBtn.addEventListener('click', async () => {
        selectedCompareIds.delete(run.id);
        await fetch(`/api/runs/${encodeURIComponent(run.id)}`, { method: 'DELETE' });
        loadHistory();
      });

      const wrap = document.createElement('div');
      wrap.className = 'action-buttons';
      wrap.append(openBtn, delBtn);
      tdAct.appendChild(wrap);

      tr.append(tdPick, tdTime, tdUrl, tdMode, tdRps, tdP95, tdErr, tdVerdict, tdAct);
      el.historyTbody.appendChild(tr);
    });
    syncCompareButtons();
  }

  document.querySelectorAll('[data-copy-target]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const targetId = btn.getAttribute('data-copy-target');
      const codeEl = targetId ? document.getElementById(targetId) : null;
      if (!codeEl) return;
      try {
        await navigator.clipboard.writeText(codeEl.textContent.trim());
        const prev = btn.textContent;
        btn.textContent = 'Tersalin';
        setTimeout(() => {
          btn.textContent = prev;
        }, 1200);
      } catch {
        // clipboard blocked
      }
    });
  });

  async function syncServerStatus() {
    try {
      const res = await fetch('/api/status');
      const st = await res.json();
      if (st.targetUrl) {
        targetBaseUrl = st.targetUrl;
        PRESETS = buildPresets(targetBaseUrl);
        const portLabel = st.targetPort || '3001';

        if (el.openTargetLink) {
          el.openTargetLink.href = targetBaseUrl;
          const span = el.openTargetLink.querySelector('span');
          if (span) span.textContent = `Buka target localhost:${portLabel}`;
        }

        const pathMap = {
          home: `localhost:${portLabel}/`,
          products: `localhost:${portLabel}/api/products`,
          search: `localhost:${portLabel}/api/search?q=server`,
          heavy: `localhost:${portLabel}/api/heavy`,
          high200: '20 sampai 200 user',
        };
        Object.entries(pathMap).forEach(([k, txt]) => {
          const node = document.querySelector(`[data-preset-path="${k}"]`);
          if (node) node.textContent = txt;
        });

        if (el.inputUrl.value.startsWith('http://localhost:3001')) {
          el.inputUrl.value = el.inputUrl.value.replace('http://localhost:3001', targetBaseUrl);
        }
        if (el.auditUrl.value.startsWith('http://localhost:3001')) {
          el.auditUrl.value = el.auditUrl.value.replace('http://localhost:3001', targetBaseUrl);
        }
      }
    } catch {
      // fallback to default 3001
    }
  }

  el.btnRefreshHistory.addEventListener('click', loadHistory);

  syncModeFields();
  checkRemoteVisibility();
  syncServerStatus();
  connectStream();
})();
