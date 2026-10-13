import https from 'node:https';
import os from 'node:os';
import selfsigned from 'selfsigned';
import { config } from './config.js';
import { readJson, writeJson } from './store.js';

const CERT_FILE = 'https-cert.json';

function localIps() {
  const ips = ['127.0.0.1'];
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const a of addresses ?? []) if (a.family === 'IPv4' && !a.internal) ips.push(a.address);
  }
  return ips.sort();
}

// Sertifikat bir marta yaratilib saqlanadi: mijoz kompyuterlarda u "ishonchli" deb o'rnatiladi,
// qayta yaratilsa o'sha o'rnatish bekor bo'ladi. Faqat server IP-manzili o'zgarsa yangilanadi.
async function loadCertificate() {
  const ips = localIps();
  const saved = readJson(CERT_FILE, null);
  if (saved?.key && saved?.cert && ips.every((ip) => saved.ips?.includes(ip))) return saved;

  const pems = await selfsigned.generate([{ name: 'commonName', value: 'Uzinkass test' }], {
    days: 3650,
    keySize: 2048,
    algorithm: 'sha256',
    extensions: [
      { name: 'basicConstraints', cA: true },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, keyCertSign: true },
      { name: 'extKeyUsage', serverAuth: true },
      {
        // Brauzerlar manzilni aynan shu ro'yxat bo'yicha tekshiradi
        name: 'subjectAltName',
        altNames: [{ type: 2, value: 'localhost' }, ...ips.map((ip) => ({ type: 7, ip }))],
      },
    ],
  });
  const created = { key: pems.private, cert: pems.cert, ips };
  writeJson(CERT_FILE, created);
  return created;
}

let certificate = null;

// Mijoz kompyuterlarga o'rnatish uchun ochiq sertifikat (maxfiy kalitsiz)
export const publicCertificate = () => certificate?.cert ?? null;

// https://... deb yozilgan so'rovlarni http://... ga yo'naltiradi
export async function startHttpsRedirect() {
  if (!config.httpsRedirectPort) return;
  try {
    certificate = await loadCertificate();
    const suffix = config.port === 80 ? '' : `:${config.port}`;
    const server = https.createServer({ key: certificate.key, cert: certificate.cert }, (req, res) => {
      const host = (req.headers.host ?? 'localhost').replace(/:\d+$/, '');
      res.writeHead(302, { Location: `http://${host}${suffix}${req.url}` });
      res.end();
    });
    server.on('error', (err) => console.warn(`[https] ${config.httpsRedirectPort}-portni ochib bo'lmadi: ${err.message}`));
    server.listen(config.httpsRedirectPort, '0.0.0.0');
  } catch (err) {
    console.warn(`[https] Yo'naltirish ishga tushmadi: ${err.message}`);
  }
}
