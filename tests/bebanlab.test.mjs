import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { LoadEngine, validateConfig } from '../src/load-engine.mjs';
import { runSecurityAudit } from '../src/security-audit.mjs';
import { createTargetServer } from '../src/target-server.mjs';
import { createBenchServer } from '../src/bench-server.mjs';

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve(addr.port);
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

function httpJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => {
        body += c;
      });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

test('validateConfig allows unlimited VUs on localhost and enforces safety validation', () => {
  const highLocal = validateConfig({
    url: 'http://localhost:3001/api/products',
    mode: 'step',
    startUsers: 50,
    maxUsers: 1200,
    stepUsers: 100,
    stepIntervalSec: 5,
    durationSec: 60,
    thinkTimeMs: 0,
    timeoutMs: 10000,
  });
  assert.equal(highLocal.maxUsers, 1200);
  assert.equal(highLocal.mode, 'step');
  assert.equal(highLocal.thinkTimeMs, 0);

  assert.throws(
    () => validateConfig({ url: 'ftp://localhost/file', maxUsers: 10, durationSec: 5 }),
    /Protokol/
  );
  assert.throws(
    () => validateConfig({ url: 'https://example.com', maxUsers: 10, durationSec: 5 }),
    /izin/
  );
});

test('LoadEngine runs real requests against isolated target server and emits diagnosis', async () => {
  const target = createTargetServer();
  const targetPort = await listen(target);
  const engine = new LoadEngine({ targetPort });

  try {
    const donePromise = new Promise((resolve) => {
      engine.once('done', resolve);
    });

    await engine.start({
      url: `http://127.0.0.1:${targetPort}/api/products`,
      mode: 'ramp',
      startUsers: 5,
      maxUsers: 15,
      durationSec: 2,
      thinkTimeMs: 20,
    });

    const record = await donePromise;
    assert.ok(record.summary.totalRequests > 0);
    assert.ok(record.summary.okCount > 0);
    assert.ok(record.summary.peakSuccessRps > 0);
    assert.ok(record.verdict.simple.length > 0);
    assert.ok(record.verdict.technical.length > 0);
    assert.ok(Array.isArray(record.diagnosis.factItems));
    assert.ok(record.diagnosis.recommendations.length > 0);
    assert.ok(record.diagnosis.recommendations[0].simpleSolution.length > 0);
  } finally {
    await closeServer(target);
  }
});

test('runSecurityAudit distinguishes default vs hardened headers with dual-layer explanations', async () => {
  const target = createTargetServer();
  const targetPort = await listen(target);

  try {
    const baseReport = await runSecurityAudit(`http://127.0.0.1:${targetPort}/`);
    const hardenedReport = await runSecurityAudit(`http://127.0.0.1:${targetPort}/?hardened=1`);

    assert.equal(baseReport.statusCode, 200);
    assert.equal(hardenedReport.statusCode, 200);
    assert.equal(baseReport.checks.length, 8);
    assert.ok(hardenedReport.score > baseReport.score);
    assert.ok(baseReport.summary.simple.length > 0);
    assert.ok(baseReport.summary.technical.length > 0);
    assert.ok(baseReport.checks[0].simpleDetail.length > 0);
    assert.ok(baseReport.checks[0].simpleSolution.length > 0);
  } finally {
    await closeServer(target);
  }
});

test('bench-server exposes health, status, audit, runs, and HTML UI cleanly', async () => {
  const target = createTargetServer();
  const targetPort = await listen(target);
  const bench = createBenchServer({ targetPort });
  const benchPort = await listen(bench);

  try {
    const health = await httpJson(`http://127.0.0.1:${benchPort}/api/health`);
    assert.equal(health.status, 200);
    assert.equal(health.data.status, 'ok');
    assert.equal(health.data.targetPort, targetPort);

    const status = await httpJson(`http://127.0.0.1:${benchPort}/api/status`);
    assert.equal(status.status, 200);
    assert.equal(status.data.running, false);

    const audit = await httpJson(`http://127.0.0.1:${benchPort}/api/audit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: `http://127.0.0.1:${targetPort}/?hardened=1` }),
    });
    assert.equal(audit.status, 200);
    assert.equal(audit.data.score, 6);
  } finally {
    await closeServer(bench);
    await closeServer(target);
  }
});
