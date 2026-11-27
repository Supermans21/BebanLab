import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LoadEngine } from './load-engine.mjs';
import { runSecurityAudit } from './security-audit.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const RUNS_FILE = path.join(DATA_DIR, 'runs.json');

export const BENCH_PORT = Number(process.env.PORT || 3000);
const DEFAULT_TARGET_PORT = Number(process.env.TARGET_PORT || 3001);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

async function readRuns() {
  try {
    const raw = await fs.readFile(RUNS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeRuns(runs) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(RUNS_FILE, JSON.stringify(runs.slice(0, 50), null, 2), 'utf8');
}

async function readJsonBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > 1024 * 1024) {
      throw Object.assign(new Error('Payload terlalu besar'), { statusCode: 413 });
    }
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw Object.assign(new Error('Body JSON tidak valid'), { statusCode: 400 });
  }
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

export function createBenchServer({ targetPort = DEFAULT_TARGET_PORT } = {}) {
  const resolvedTargetPort = Number(targetPort || DEFAULT_TARGET_PORT);
  const engine = new LoadEngine({ targetPort: resolvedTargetPort });
  const sseClients = new Set();

  function broadcast(eventName, data) {
    const line = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of sseClients) {
      try {
        res.write(line);
      } catch {
        sseClients.delete(res);
      }
    }
  }

  engine.on('tick', (payload) => {
    broadcast('tick', payload);
  });

  engine.on('done', async (runRecord) => {
    try {
      const runs = await readRuns();
      runs.unshift(runRecord);
      await writeRuns(runs);
    } catch {
      // ignore persistence write error
    }
    broadcast('done', runRecord);
  });

  engine.on('error', (payload) => {
    broadcast('error', payload);
  });

  const heartbeat = setInterval(() => {
    for (const res of sseClients) {
      try {
        res.write(': keepalive\n\n');
      } catch {
        sseClients.delete(res);
      }
    }
  }, 15000);
  heartbeat.unref();

  const server = http.createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url || '/', `http://localhost:${BENCH_PORT}`);
      const pathname = reqUrl.pathname;

      if (req.method === 'GET' && pathname === '/api/health') {
        sendJson(res, 200, {
          status: 'ok',
          service: 'bebanlab-dashboard',
          uptimeSec: Number(process.uptime().toFixed(1)),
          targetPort: resolvedTargetPort,
          ...engine.getStatus(),
        });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/status') {
        sendJson(res, 200, {
          ...engine.getStatus(),
          targetPort: resolvedTargetPort,
          targetUrl: `http://localhost:${resolvedTargetPort}`,
        });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/test/start') {
        const body = await readJsonBody(req);
        try {
          const started = await engine.start(body);
          broadcast('state', { running: true, ...started });
          sendJson(res, 202, started);
        } catch (err) {
          sendJson(res, err?.statusCode || 400, { error: err?.message || 'Gagal memulai pengujian' });
        }
        return;
      }

      if (req.method === 'POST' && pathname === '/api/test/stop') {
        const stopped = engine.stop();
        sendJson(res, 200, { stopped, ...engine.getStatus() });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/test/stream') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        });
        res.write(`event: state\ndata: ${JSON.stringify(engine.getStatus())}\n\n`);
        sseClients.add(res);
        req.on('close', () => {
          sseClients.delete(res);
        });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/runs') {
        const runs = await readRuns();
        sendJson(res, 200, { runs });
        return;
      }

      if (req.method === 'DELETE' && pathname.startsWith('/api/runs/')) {
        const runId = decodeURIComponent(pathname.slice('/api/runs/'.length));
        const runs = await readRuns();
        const filtered = runs.filter((r) => r.id !== runId);
        if (filtered.length === runs.length) {
          sendJson(res, 404, { error: 'Riwayat tidak ditemukan.' });
          return;
        }
        await writeRuns(filtered);
        sendJson(res, 200, { deleted: runId });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/audit') {
        const body = await readJsonBody(req);
        try {
          const report = await runSecurityAudit(body.url);
          sendJson(res, 200, report);
        } catch (err) {
          sendJson(res, 400, { error: err?.message || 'Gagal memeriksa header keamanan.' });
        }
        return;
      }

      if (req.method === 'GET') {
        const relPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
        const safePath = path.normalize(relPath).replace(/^(\.\.[/\\])+/, '');
        const filePath = path.join(PUBLIC_DIR, safePath);
        if (!filePath.startsWith(PUBLIC_DIR)) {
          sendJson(res, 403, { error: 'Akses ditolak' });
          return;
        }
        try {
          const content = await fs.readFile(filePath);
          const ext = path.extname(filePath).toLowerCase();
          res.statusCode = 200;
          res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
          res.end(content);
          return;
        } catch {
          sendJson(res, 404, { error: 'Berkas tidak ditemukan' });
          return;
        }
      }

      sendJson(res, 405, { error: 'Metode tidak didukung' });
    } catch (err) {
      sendJson(res, err?.statusCode || 500, { error: err?.message || 'Kesalahan server internal' });
    }
  });

  server.on('close', () => {
    clearInterval(heartbeat);
    engine.stop();
  });

  return server;
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectRun) {
  const server = createBenchServer();
  server.on('error', (err) => {
    console.error(`[bench] Gagal menjalankan server pada port ${BENCH_PORT}: ${err.message}`);
    process.exit(1);
  });
  server.listen(BENCH_PORT, '127.0.0.1', () => {
    console.log(`[bench] Dashboard BebanLab aktif di http://localhost:${BENCH_PORT}`);
  });
}
