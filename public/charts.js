(function initTelemetryChartModule() {
  function readTokens() {
    const cs = getComputedStyle(document.documentElement);
    const get = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;
    return {
      paper: get('--color-paper-2', 'oklch(96.2% 0.008 252)'),
      ink: get('--color-ink', 'oklch(21% 0.028 262)'),
      muted: get('--color-muted', 'oklch(48% 0.018 258)'),
      rule: get('--color-rule', 'oklch(90% 0.009 252)'),
      rule2: get('--color-rule-2', 'oklch(83% 0.012 252)'),
      accent: get('--color-accent', 'oklch(52% 0.19 258)'),
      accentWash: get('--color-accent-wash', 'oklch(95% 0.028 256)'),
      error: get('--color-error', 'oklch(52% 0.19 27)'),
      fontMono: get('--font-outlier', 'monospace'),
      fontDisplay: get('--font-display', 'sans-serif'),
    };
  }

  class TelemetryRulerChart {
    constructor(canvas, tooltipEl) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.tooltipEl = tooltipEl;
      this.points = [];
      this.hoverIndex = -1;
      this.pad = { top: 24, right: 56, bottom: 32, left: 52 };

      this.handleResize = this.render.bind(this);
      window.addEventListener('resize', this.handleResize);

      this.canvas.addEventListener('mousemove', (ev) => this.onPointerMove(ev));
      this.canvas.addEventListener('mouseleave', () => {
        this.hoverIndex = -1;
        if (this.tooltipEl) this.tooltipEl.hidden = true;
        this.render();
      });

      this.render();
    }

    setData(points) {
      this.points = Array.isArray(points) ? points : [];
      if (this.hoverIndex >= this.points.length) {
        this.hoverIndex = -1;
      }
      this.render();
    }

    pushPoint(point) {
      this.points.push(point);
      this.render();
    }

    onPointerMove(ev) {
      if (!this.points.length) return;
      const rect = this.canvas.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const plotW = Math.max(1, rect.width - this.pad.left - this.pad.right);
      const clamped = Math.max(0, Math.min(plotW, x - this.pad.left));
      const idx =
        this.points.length === 1
          ? 0
          : Math.round((clamped / plotW) * (this.points.length - 1));

      this.hoverIndex = idx;
      const pt = this.points[idx];
      if (this.tooltipEl && pt) {
        this.tooltipEl.hidden = false;
        const lines = [
          `detik ${pt.sec}  |  VU ${pt.activeUsers}`,
          `RPS ${pt.rps} req/dtk  |  ${pt.kbPerSec} KB/dtk`,
          `p50 ${pt.p50Ms} ms  |  p95 ${pt.p95Ms} ms  |  max ${pt.maxMs} ms`,
          `2xx ${pt.okCount}  |  err ${pt.err4xx + pt.err5xx + pt.netErr} (${pt.errorRate}%)`,
        ];
        this.tooltipEl.textContent = lines.join('\n');
      }
      this.render();
    }

    render() {
      const rect = this.canvas.getBoundingClientRect();
      const width = Math.max(240, Math.floor(rect.width));
      const height = Math.max(180, Math.floor(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      if (this.canvas.width !== width * dpr || this.canvas.height !== height * dpr) {
        this.canvas.width = width * dpr;
        this.canvas.height = height * dpr;
      }

      const ctx = this.ctx;
      const tok = readTokens();
      ctx.save();
      ctx.scale(dpr, dpr);

      ctx.fillStyle = tok.paper;
      ctx.fillRect(0, 0, width, height);

      const { left, right, top, bottom } = this.pad;
      const plotW = Math.max(40, width - left - right);
      const plotH = Math.max(40, height - top - bottom);

      const gridRows = 4;
      ctx.strokeStyle = tok.rule;
      ctx.lineWidth = 1;
      for (let i = 0; i <= gridRows; i += 1) {
        const y = Math.round(top + (plotH * i) / gridRows) + 0.5;
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(left + plotW, y);
        ctx.stroke();
      }

      if (!this.points.length) {
        ctx.fillStyle = tok.muted;
        ctx.font = `13px ${tok.fontDisplay}`;
        ctx.textAlign = 'center';
        ctx.fillText(
          'Grafik akan tergambar otomatis setiap detik saat uji beban berjalan',
          left + plotW / 2,
          top + plotH / 2 + 4
        );
        ctx.restore();
        return;
      }

      const maxRps = Math.max(10, ...this.points.map((p) => p.rps)) * 1.15;
      const maxLat = Math.max(20, ...this.points.map((p) => p.p95Ms)) * 1.15;
      const maxVu = Math.max(1, ...this.points.map((p) => p.activeUsers)) * 1.1;

      const xFor = (i) =>
        this.points.length === 1
          ? left + plotW / 2
          : left + (plotW * i) / (this.points.length - 1);
      const yRps = (v) => top + plotH - (Math.min(v, maxRps) / maxRps) * plotH;
      const yLat = (v) => top + plotH - (Math.min(v, maxLat) / maxLat) * plotH;
      const yVu = (v) => top + plotH - (Math.min(v, maxVu) / maxVu) * plotH;

      ctx.font = `11px ${tok.fontMono}`;
      for (let i = 0; i <= gridRows; i += 1) {
        const ratio = 1 - i / gridRows;
        const y = top + (plotH * i) / gridRows + 4;
        ctx.fillStyle = tok.accent;
        ctx.textAlign = 'right';
        ctx.fillText(String(Math.round(maxRps * ratio)), left - 8, y);

        ctx.fillStyle = tok.ink;
        ctx.textAlign = 'left';
        ctx.fillText(`${Math.round(maxLat * ratio)}ms`, left + plotW + 6, y);
      }

      ctx.fillStyle = tok.muted;
      ctx.textAlign = 'center';
      const step = Math.max(1, Math.ceil(this.points.length / 8));
      for (let i = 0; i < this.points.length; i += step) {
        const x = xFor(i);
        ctx.beginPath();
        ctx.strokeStyle = tok.rule2;
        ctx.moveTo(x, top + plotH);
        ctx.lineTo(x, top + plotH + 5);
        ctx.stroke();
        ctx.fillText(`${this.points[i].sec}s`, x, top + plotH + 18);
      }

      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = tok.muted;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      this.points.forEach((p, i) => {
        const x = xFor(i);
        const y = yVu(p.activeUsers);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.restore();

      ctx.beginPath();
      this.points.forEach((p, i) => {
        const x = xFor(i);
        const y = yRps(p.rps);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.lineTo(xFor(this.points.length - 1), top + plotH);
      ctx.lineTo(xFor(0), top + plotH);
      ctx.closePath();
      ctx.fillStyle = tok.accentWash;
      ctx.fill();

      ctx.beginPath();
      this.points.forEach((p, i) => {
        const x = xFor(i);
        const y = yRps(p.rps);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = tok.accent;
      ctx.lineWidth = 2.2;
      ctx.stroke();

      ctx.beginPath();
      this.points.forEach((p, i) => {
        const x = xFor(i);
        const y = yLat(p.p95Ms);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = tok.ink;
      ctx.lineWidth = 2;
      ctx.stroke();

      this.points.forEach((p, i) => {
        const errs = p.err4xx + p.err5xx + p.netErr;
        if (errs > 0) {
          const x = xFor(i);
          ctx.fillStyle = tok.error;
          ctx.fillRect(x - 2, top + plotH - 12, 4, 12);
        }
      });

      if (this.hoverIndex >= 0 && this.hoverIndex < this.points.length) {
        const pt = this.points[this.hoverIndex];
        const x = xFor(this.hoverIndex);
        ctx.strokeStyle = tok.rule2;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, top + plotH);
        ctx.stroke();

        ctx.fillStyle = tok.accent;
        ctx.beginPath();
        ctx.arc(x, yRps(pt.rps), 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = tok.ink;
        ctx.beginPath();
        ctx.arc(x, yLat(pt.p95Ms), 4, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  window.TelemetryRulerChart = TelemetryRulerChart;
})();
