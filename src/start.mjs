import net from 'node:net';
import { fork } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBenchServer } from './bench-server.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PREFERRED_BENCH_PORT = Number(process.env.PORT || 3000);
const PREFERRED_TARGET_PORT = Number(process.env.TARGET_PORT || 3001);

function canBindPort(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.unref();
    tester.once('error', () => resolve(false));
    tester.once('listening', () => {
      tester.close(() => resolve(true));
    });
    tester.listen(port, host);
  });
}

export async function findAvailablePort(preferredPort, excludePort = null, host = '127.0.0.1') {
  let candidate = preferredPort;
  for (let i = 0; i < 20; i += 1) {
    if (candidate !== excludePort && (await canBindPort(candidate, host))) {
      return candidate;
    }
    candidate += 2;
  }
  throw new Error(`Tidak ditemukan port kosong mulai dari ${preferredPort}.`);
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectRun) {
  const benchPort = await findAvailablePort(PREFERRED_BENCH_PORT);
  const targetPort = await findAvailablePort(PREFERRED_TARGET_PORT, benchPort);

  const targetWorkerPath = path.join(__dirname, 'target-server.mjs');
  const targetChild = fork(targetWorkerPath, [], {
    env: { ...process.env, TARGET_PORT: String(targetPort) },
    stdio: 'inherit',
  });

  const benchServer = createBenchServer({ targetPort });
  benchServer.listen(benchPort, '127.0.0.1', () => {
    console.log('');
    if (benchPort !== PREFERRED_BENCH_PORT) {
      console.log(
        `Port ${PREFERRED_BENCH_PORT} sedang dipakai, BebanLab otomatis berjalan di http://localhost:${benchPort}`
      );
    }
    if (targetPort !== PREFERRED_TARGET_PORT) {
      console.log(
        `Port ${PREFERRED_TARGET_PORT} sedang dipakai, Website Target otomatis berjalan di http://localhost:${targetPort}`
      );
    }
    console.log('BebanLab aktif (proses target terisolasi):');
    console.log(`  Dashboard Uji & Audit : http://localhost:${benchPort}`);
    console.log(`  Website Target Demo   : http://localhost:${targetPort}`);
    console.log('');
  });

  let shuttingDown = false;
  function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    if (!targetChild.killed) {
      targetChild.kill('SIGTERM');
    }
    benchServer.close(() => {
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 2000).unref();
  }

  targetChild.on('exit', (code) => {
    if (!shuttingDown) {
      console.error(`[start] Proses target berhenti (kode ${code ?? 'unknown'}).`);
    }
  });

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
