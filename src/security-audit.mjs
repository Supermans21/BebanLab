import http from 'node:http';
import https from 'node:https';

function fetchHeadersOnce(targetUrl, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch {
      reject(new Error('Format URL tidak valid.'));
      return;
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      reject(new Error('URL harus menggunakan protokol http:// atau https://.'));
      return;
    }

    const transport = parsed.protocol === 'https:' ? https : http;
    const req = transport.request(
      parsed,
      {
        method: 'GET',
        timeout: timeoutMs,
        headers: {
          'User-Agent': 'BebanLab-SecurityAudit/1.0',
        },
      },
      (res) => {
        res.resume();
        resolve({
          statusCode: res.statusCode || 0,
          headers: res.headers,
          rawHeaders: res.rawHeaders || [],
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('Permintaan audit melebihi batas waktu 5 detik.'));
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.end();
  });
}

function normalizeHeadersObject(headers) {
  const out = {};
  for (const [k, v] of Object.entries(headers || {})) {
    out[k.toLowerCase()] = Array.isArray(v) ? v.join('; ') : String(v ?? '');
  }
  return out;
}

export async function runSecurityAudit(inputUrl) {
  const rawUrl = String(inputUrl || '').trim();
  if (!rawUrl) {
    throw new Error('URL target wajib diisi.');
  }

  let currentUrl = new URL(rawUrl).toString();
  const start = performance.now();
  let response = null;
  const redirectChain = [];

  for (let hop = 0; hop <= 3; hop += 1) {
    response = await fetchHeadersOnce(currentUrl, 5000);
    const location = response.headers.location;
    if (
      location &&
      [301, 302, 303, 307, 308].includes(response.statusCode) &&
      hop < 3
    ) {
      const nextUrl = new URL(location, currentUrl).toString();
      redirectChain.push({ from: currentUrl, statusCode: response.statusCode, to: nextUrl });
      currentUrl = nextUrl;
      continue;
    }
    break;
  }

  const latencyMs = Number((performance.now() - start).toFixed(2));
  const finalParsed = new URL(currentUrl);
  const headers = normalizeHeadersObject(response.headers);
  const isHttps = finalParsed.protocol === 'https:';

  const checks = [];

  // 1. HTTPS & HSTS
  const hsts = headers['strict-transport-security'] || '';
  if (isHttps && hsts) {
    checks.push({
      id: 'hsts',
      name: 'HTTPS & HSTS',
      status: 'pass',
      observed: hsts,
      simpleDetail: 'Data yang dikirim pengunjung sudah terkunci (terenkripsi) seperti surat di amplop tertutup rapat.',
      simpleSolution: 'Sudah aman, cukup pertahankan pengaturan ini.',
      detail: 'Koneksi memakai HTTPS dan mengirim header Strict-Transport-Security.',
      recommendation: 'Pertahankan Strict-Transport-Security dengan max-age minimal 31536000.',
    });
  } else if (isHttps && !hsts) {
    checks.push({
      id: 'hsts',
      name: 'HTTPS & HSTS',
      status: 'warn',
      observed: 'HTTPS aktif, tanpa header Strict-Transport-Security',
      simpleDetail: 'Amplopnya sudah terkunci (HTTPS), tapi belum ada aturan wajib agar browser tidak pernah membuka versi tanpa kunci.',
      simpleSolution: 'Minta server memaksa semua pengunjung selalu lewat jalur aman HTTPS.',
      detail: 'HTTPS sudah dipakai tetapi browser belum dipaksa lewat header HSTS.',
      recommendation: 'Tambahkan header Strict-Transport-Security: max-age=31536000; includeSubDomains.',
    });
  } else {
    checks.push({
      id: 'hsts',
      name: 'HTTPS & HSTS',
      status: 'fail',
      observed: hsts || `Protokol ${finalParsed.protocol} (tanpa TLS)`,
      simpleDetail: 'Jalurnya masih terbuka tanpa gembok (HTTP biasa). Kalau di internet umum, isi formulir/password bisa diintip di jalan.',
      simpleSolution: 'Kalau masih di localhost tidak masalah; saat dipublikasikan ke domain asli, wajib pasang HTTPS (SSL/TLS).',
      detail: 'Traffic localhost/HTTP biasa belum terenkripsi dan HSTS hanya berlaku di HTTPS.',
      recommendation: 'Aktifkan sertifikat TLS/HTTPS (misalnya Let\'s Encrypt/Cloudflare) dan header Strict-Transport-Security saat deploy.',
    });
  }

  // 2. Content-Security-Policy
  const csp = headers['content-security-policy'] || '';
  if (csp) {
    const hasUnsafe = /'unsafe-eval'/i.test(csp);
    checks.push({
      id: 'csp',
      name: 'Content-Security-Policy',
      status: hasUnsafe ? 'warn' : 'pass',
      observed: csp,
      simpleDetail: hasUnsafe
        ? 'Sudah ada daftar tamu untuk kode yang boleh jalan di halaman, tapi masih ada celah longgar.'
        : 'Sudah ada aturan ketat soal kode mana saja yang boleh berjalan di halaman web.',
      simpleSolution: hasUnsafe
        ? 'Rapikan aturan agar kode asing tidak bisa dievaluasi secara bebas.'
        : 'Sudah baik, jaga daftar sumber kode tetap seperlunya.',
      detail: hasUnsafe
        ? 'Header CSP terpasang tetapi masih mengizinkan unsafe-eval.'
        : 'Header Content-Security-Policy terpasang untuk membatasi sumber script.',
      recommendation: hasUnsafe
        ? "Hapus 'unsafe-eval' dari Content-Security-Policy agar proteksi XSS lebih ketat."
        : 'Terus jaga daftar origin agar tetap minimal.',
    });
  } else {
    checks.push({
      id: 'csp',
      name: 'Content-Security-Policy',
      status: 'fail',
      observed: 'Tidak ada header',
      simpleDetail: 'Belum ada aturan penyaring kode di browser, jadi kalau ada penyusup menyelipkan script nakal, browser bisa langsung menurut.',
      simpleSolution: 'Pasang daftar izin resmi agar browser hanya menjalankan kode milik website sendiri.',
      detail: 'Tanpa CSP, script inline atau eksternal berbahaya lebih mudah dijalankan jika ada celah XSS.',
      recommendation: "Tambahkan header Content-Security-Policy, misalnya: default-src 'self'.",
    });
  }

  // 3. Anti-Clickjacking
  const xfo = headers['x-frame-options'] || '';
  const hasFrameAncestors = /frame-ancestors\s+/i.test(csp);
  if (xfo || hasFrameAncestors) {
    checks.push({
      id: 'clickjacking',
      name: 'Anti-Clickjacking',
      status: 'pass',
      observed: xfo || 'CSP frame-ancestors aktif',
      simpleDetail: 'Halaman webmu tidak bisa diam-diam ditempel di dalam website orang lain untuk menjebak klik pengunjung.',
      simpleSolution: 'Sudah terlindungi, tidak perlu diubah.',
      detail: 'Halaman terlindung agar tidak sembarangan disematkan dalam iframe pihak ketiga.',
      recommendation: 'Sudah sesuai praktik baik.',
    });
  } else {
    checks.push({
      id: 'clickjacking',
      name: 'Anti-Clickjacking',
      status: 'fail',
      observed: 'Tidak ada X-Frame-Options maupun frame-ancestors',
      simpleDetail: 'Website orang lain bisa menempelkan halamanmu di dalam bingkai tersembunyi supaya user mengira sedang mengklik tombol lain.',
      simpleSolution: 'Kunci halaman agar tidak boleh ditempel di bingkai (iframe) situs lain.',
      detail: 'Halaman bisa disematkan ke dalam iframe situs lain (risiko clickjacking).',
      recommendation: "Tambahkan X-Frame-Options: DENY atau CSP frame-ancestors 'none'.",
    });
  }

  // 4. MIME Sniffing
  const xcto = headers['x-content-type-options'] || '';
  if (xcto.toLowerCase() === 'nosniff') {
    checks.push({
      id: 'mime',
      name: 'MIME Sniffing',
      status: 'pass',
      observed: xcto,
      simpleDetail: 'Browser dipaksa patuh pada jenis file asli (misal gambar tetap gambar, bukan tiba-tiba dijalankan sebagai program).',
      simpleSolution: 'Sudah aman.',
      detail: 'Browser dilarang menebak tipe MIME di luar Content-Type resmi.',
      recommendation: 'Sudah sesuai.',
    });
  } else {
    checks.push({
      id: 'mime',
      name: 'MIME Sniffing',
      status: 'fail',
      observed: xcto || 'Tidak ada header',
      simpleDetail: 'Browser boleh menebak-nebak isi file sendiri, jadi file biasa bisa salah jalan sebagai script.',
      simpleSolution: 'Larang browser menebak tipe file secara sembarangan.',
      detail: 'Browser dapat menafsirkan file teks/upload sebagai script aktif.',
      recommendation: 'Tambahkan header X-Content-Type-Options: nosniff.',
    });
  }

  // 5. Referrer-Policy
  const referrerPolicy = headers['referrer-policy'] || '';
  if (referrerPolicy) {
    checks.push({
      id: 'referrer',
      name: 'Referrer-Policy',
      status: 'pass',
      observed: referrerPolicy,
      simpleDetail: 'Saat pengunjung mengklik tautan keluar, alamat detail halamanmu tidak ikut dibocorkan penuh.',
      simpleSolution: 'Sudah aman.',
      detail: 'Kebijakan pengiriman header Referer saat berpindah tautan sudah diatur.',
      recommendation: 'Sudah sesuai.',
    });
  } else {
    checks.push({
      id: 'referrer',
      name: 'Referrer-Policy',
      status: 'warn',
      observed: 'Tidak ada header',
      simpleDetail: 'Saat pengunjung pindah ke website lain, alamat URL halamanmu beserta buntut parameternya bisa ikut terbaca.',
      simpleSolution: 'Atur supaya hanya nama domain utamanya saja yang terlihat saat pindah link.',
      detail: 'URL penuh termasuk query parameter berisiko ikut terkirim sebagai Referer ke domain luar.',
      recommendation: 'Tambahkan header Referrer-Policy: strict-origin-when-cross-origin.',
    });
  }

  // 6. Permissions-Policy
  const permissionsPolicy = headers['permissions-policy'] || '';
  if (permissionsPolicy) {
    checks.push({
      id: 'permissions',
      name: 'Permissions-Policy',
      status: 'pass',
      observed: permissionsPolicy,
      simpleDetail: 'Akses ke fitur sensitif perangkat seperti kamera, mikrofon, dan lokasi sudah dikunci.',
      simpleSolution: 'Sudah aman.',
      detail: 'Akses fitur browser (kamera, mikrofon, lokasi) dibatasi secara eksplisit.',
      recommendation: 'Sudah sesuai.',
    });
  } else {
    checks.push({
      id: 'permissions',
      name: 'Permissions-Policy',
      status: 'warn',
      observed: 'Tidak ada header',
      simpleDetail: 'Belum ada pernyataan resmi untuk mematikan izin kamera, mikrofon, atau GPS di halaman ini.',
      simpleSolution: 'Matikan izin kamera, mikrofon, dan lokasi kalau webmu memang tidak memakainya.',
      detail: 'Fitur sensitif browser belum dibatasi di level HTTP header.',
      recommendation: 'Tambahkan header Permissions-Policy: camera=(), microphone=(), geolocation=().',
    });
  }

  // 7. Kebocoran Info Server
  const xPoweredBy = headers['x-powered-by'] || '';
  const serverBanner = headers['server'] || '';
  if (!xPoweredBy && !serverBanner) {
    checks.push({
      id: 'fingerprint',
      name: 'Kebocoran Info Server',
      status: 'pass',
      observed: 'Header X-Powered-By dan Server tersembunyi',
      simpleDetail: 'Server tidak memamerkan merek dapur atau alat pembuatnya ke publik.',
      simpleSolution: 'Sudah rapi, tetap sembunyikan identitas mesin server.',
      detail: 'Server tidak membeberkan jenis framework atau versi runtime.',
      recommendation: 'Pertahankan konfigurasi ini.',
    });
  } else {
    const exposed = [
      xPoweredBy ? `X-Powered-By: ${xPoweredBy}` : '',
      serverBanner ? `Server: ${serverBanner}` : '',
    ]
      .filter(Boolean)
      .join(' | ');
    checks.push({
      id: 'fingerprint',
      name: 'Kebocoran Info Server',
      status: 'warn',
      observed: exposed,
      simpleDetail: 'Server seperti menempelkan stiker merek mesinnya di pintu depan, sehingga orang iseng tahu pakai alat apa web ini dibuat.',
      simpleSolution: 'Lepas stiker identitas software server agar tidak gampang ditebak celahnya.',
      detail: 'Identitas runtime/framework terlihat di respons HTTP sehingga memudahkan pemetaan celah.',
      recommendation: 'Hapus header X-Powered-By dan samarkan/hapus header Server.',
    });
  }

  // 8. Keamanan Cookie
  const rawSetCookie = response.headers['set-cookie'];
  const cookieList = Array.isArray(rawSetCookie)
    ? rawSetCookie
    : rawSetCookie
      ? [rawSetCookie]
      : [];

  if (cookieList.length === 0) {
    checks.push({
      id: 'cookies',
      name: 'Keamanan Cookie',
      status: 'info',
      observed: 'Tidak ada cookie dikirim pada endpoint ini',
      simpleDetail: 'Halaman ini tidak menitipkan tiket sesi (cookie) apa pun ke browser.',
      simpleSolution: 'Aman untuk halaman publik; kalau nanti ada halaman login, pastikan tiket login-nya dikunci.',
      detail: 'Server tidak mengirim header Set-Cookie saat diakses.',
      recommendation: 'Jika memakai cookie sesi, pastikan ada atribut HttpOnly, Secure, dan SameSite.',
    });
  } else {
    const missingFlags = [];
    for (const cookie of cookieList) {
      if (!/;\s*httponly/i.test(cookie)) missingFlags.push('HttpOnly');
      if (!/;\s*secure/i.test(cookie)) missingFlags.push('Secure');
      if (!/;\s*samesite=/i.test(cookie)) missingFlags.push('SameSite');
    }
    const uniqueMissing = [...new Set(missingFlags)];
    if (uniqueMissing.length === 0) {
      checks.push({
        id: 'cookies',
        name: 'Keamanan Cookie',
        status: 'pass',
        observed: `${cookieList.length} cookie memiliki HttpOnly, Secure, SameSite`,
        simpleDetail: 'Semua tiket sesi (cookie) sudah dikunci rapat agar tidak mudah dicuri script jahat.',
        simpleSolution: 'Sudah sesuai.',
        detail: 'Semua cookie pada respons sudah membawa flag perlindungan utama.',
        recommendation: 'Sudah sesuai.',
      });
    } else {
      checks.push({
        id: 'cookies',
        name: 'Keamanan Cookie',
        status: 'fail',
        observed: `${cookieList.length} cookie tanpa flag: ${uniqueMissing.join(', ')}`,
        simpleDetail: 'Tiket sesi pengunjung masih ditaruh tanpa gembok lengkap, sehingga rawan dicuri kalau ada celah halaman.',
        simpleSolution: 'Kunci tiket cookie agar tidak bisa dibaca JavaScript dan hanya terkirim di jalur aman.',
        detail: 'Cookie tanpa flag keamanan berisiko dicuri lewat XSS atau dikirim lintas situs.',
        recommendation: `Tambahkan atribut ${uniqueMissing.join(', ')} pada Set-Cookie.`,
      });
    }
  }

  let score = 0;
  let maxScore = 0;
  let passCount = 0;
  let warnCount = 0;
  let failCount = 0;
  for (const check of checks) {
    if (check.status === 'info') continue;
    maxScore += 1;
    if (check.status === 'pass') {
      score += 1;
      passCount += 1;
    } else if (check.status === 'warn') {
      score += 0.5;
      warnCount += 1;
    } else if (check.status === 'fail') {
      failCount += 1;
    }
  }

  const ratio = maxScore > 0 ? score / maxScore : 0;
  const level = ratio >= 0.8 ? 'kuat' : ratio >= 0.5 ? 'cukup' : 'kurang';
  const missingNames = checks
    .filter((c) => c.status === 'fail' || c.status === 'warn')
    .map((c) => c.name);

  let title = 'Pengaman dasar sudah terpasang baik';
  let simple = `Dari ${maxScore} gembok pengaman yang dicek, ${passCount} sudah terpasang baik${warnCount ? `, ${warnCount} masih setengah/peringatan` : ''}${failCount ? `, dan ${failCount} belum ada` : ''}.`;
  if (level === 'kurang') {
    title = 'Beberapa pengaman penting belum terpasang';
  } else if (level === 'cukup') {
    title = 'Pengaman dasar sudah ada tetapi masih ada yang kurang';
  }

  const technical = `HTTP ${response.statusCode} (${latencyMs} ms), skor ${score}/${maxScore} (${passCount} pass, ${warnCount} warn, ${failCount} fail). ${
    missingNames.length
      ? `Perlu perbaikan pada: ${missingNames.join(', ')}.`
      : 'Seluruh header utama terkonfigurasi.'
  }`;

  return {
    url: rawUrl,
    finalUrl: currentUrl,
    statusCode: response.statusCode,
    latencyMs,
    redirectChain,
    score,
    maxScore,
    summary: {
      level,
      title,
      simple,
      technical,
    },
    checks,
    rawHeaders: headers,
  };
}
