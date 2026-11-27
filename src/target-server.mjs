import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

export const TARGET_PORT = Number(process.env.TARGET_PORT || 3001);

const CATEGORIES = [
  'Jaringan',
  'Server',
  'Sensor',
  'Penyimpanan',
  'Kabel',
  'Keamanan',
  'Komputasi',
  'Kelistrikan',
];

const ADJECTIVES = [
  'Presisi',
  'Industri',
  'Modular',
  'Kompak',
  'Terukur',
  'Tahan Lama',
  'Cepat',
  'Ringkas',
];

const WAREHOUSES = ['Jakarta-01', 'Bandung-02', 'Surabaya-01', 'Semarang-01'];

function buildCatalog(count = 5000) {
  const items = new Array(count);
  for (let i = 0; i < count; i += 1) {
    const category = CATEGORIES[i % CATEGORIES.length];
    const adj = ADJECTIVES[(i * 3) % ADJECTIVES.length];
    const warehouse = WAREHOUSES[(i * 7) % WAREHOUSES.length];
    const id = i + 1;
    items[i] = {
      id,
      sku: `BL-${String(id).padStart(5, '0')}`,
      name: `${category} ${adj} Seri ${100 + (i % 900)}`,
      category,
      priceIdr: 45000 + ((i * 13750) % 2450000),
      stock: 5 + ((i * 11) % 240),
      warehouse,
    };
  }
  return items;
}

const CATALOG = buildCatalog(5000);

function applySecurityHeaders(res, hardened) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (hardened) {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'"
    );
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  } else {
    res.setHeader('X-Powered-By', 'BebanLab-Demo');
  }
}

function sendJson(res, statusCode, payload, hardened = false) {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  applySecurityHeaders(res, hardened);
  res.end(body);
}

function pbkdf2Async(password, salt, iterations, keylen, digest) {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, iterations, keylen, digest, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

export function createTargetServer() {
  const sockets = new Set();
  let activeRequests = 0;

  const server = http.createServer(async (req, res) => {
    activeRequests += 1;
    let decremented = false;
    const done = () => {
      if (!decremented) {
        decremented = true;
        activeRequests = Math.max(0, activeRequests - 1);
      }
    };
    res.on('finish', done);
    res.on('close', done);

    try {
      const reqUrl = new URL(req.url || '/', `http://localhost:${TARGET_PORT}`);
      const hardened = reqUrl.searchParams.get('hardened') === '1';

      if (req.method === 'GET' && reqUrl.pathname === '/') {
        const htmlPath = path.join(PUBLIC_DIR, 'target.html');
        const html = await fs.readFile(htmlPath, 'utf8');
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        applySecurityHeaders(res, hardened);
        res.end(html);
        return;
      }

      if (
        req.method === 'GET' &&
        (reqUrl.pathname === '/styles.css' ||
          reqUrl.pathname === '/tokens.css' ||
          reqUrl.pathname === '/base.css')
      ) {
        const cssPath = path.join(PUBLIC_DIR, reqUrl.pathname.slice(1));
        const css = await fs.readFile(cssPath, 'utf8');
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/css; charset=utf-8');
        applySecurityHeaders(res, hardened);
        res.end(css);
        return;
      }

      if (req.method === 'GET' && reqUrl.pathname === '/api/products') {
        sendJson(
          res,
          200,
          {
            items: CATALOG.slice(0, 24),
            total: CATALOG.length,
            mode: 'fast-catalog',
          },
          hardened
        );
        return;
      }

      if (req.method === 'GET' && reqUrl.pathname === '/api/search') {
        const q = (reqUrl.searchParams.get('q') || '').trim().toLowerCase();
        const matches = q
          ? CATALOG.filter(
              (item) =>
                item.name.toLowerCase().includes(q) ||
                item.category.toLowerCase().includes(q) ||
                item.sku.toLowerCase().includes(q)
            )
          : CATALOG.slice(0, 200);
        matches.sort((a, b) => a.priceIdr - b.priceIdr);
        sendJson(
          res,
          200,
          {
            query: q,
            totalMatched: matches.length,
            items: matches.slice(0, 40),
          },
          hardened
        );
        return;
      }

      if ((req.method === 'GET' || req.method === 'POST') && reqUrl.pathname === '/api/heavy') {
        const start = performance.now();
        const derived = await pbkdf2Async('bebanlab-stress', 'salt-v1', 25000, 32, 'sha256');
        const computeMs = Number((performance.now() - start).toFixed(2));
        sendJson(
          res,
          200,
          {
            status: 'ok',
            work: 'pbkdf2-sha256-25000',
            digestPrefix: derived.subarray(0, 6).toString('hex'),
            computeMs,
            activeRequests,
          },
          hardened
        );
        return;
      }

      if (req.method === 'GET' && reqUrl.pathname === '/health') {
        const mem = process.memoryUsage();
        sendJson(
          res,
          200,
          {
            status: 'ok',
            pid: process.pid,
            uptimeSec: Number(process.uptime().toFixed(1)),
            rssMB: Number((mem.rss / (1024 * 1024)).toFixed(1)),
            heapUsedMB: Number((mem.heapUsed / (1024 * 1024)).toFixed(1)),
            activeConnections: sockets.size,
            activeRequests,
            timestamp: new Date().toISOString(),
          },
          hardened
        );
        return;
      }

      sendJson(res, 404, { error: 'Endpoint tidak ditemukan', path: reqUrl.pathname }, hardened);
    } catch (err) {
      sendJson(res, 500, { error: err?.message || 'Internal Server Error' }, false);
    }
  });

  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => {
      sockets.delete(socket);
    });
  });

  return server;
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectRun) {
  const server = createTargetServer();
  server.listen(TARGET_PORT, '127.0.0.1', () => {
    console.log(`[target] Website target localhost aktif di http://localhost:${TARGET_PORT}`);
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
