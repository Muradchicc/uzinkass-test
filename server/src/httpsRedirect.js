import https from 'node:https';
import selfsigned from 'selfsigned';
import { config } from './config.js';
import { readJson, writeJson } from './store.js';

const CERT_FILE = 'https-cert.json';

// Sertifikat bir marta yaratilib saqlanadi — brauzerdagi istisno har safar qayta so'ralmasligi uchun
async function loadCertificate() {
  const saved = readJson(CERT_FILE, null);
  if (saved?.key && saved?.cert) return saved;

  const pems = await selfsigned.generate([{ name: 'commonName', value: 'Uzinkass test' }], {
    days: 3650,
    keySize: 2048,
    algorithm: 'sha256',
  });
  const created = { key: pems.private, cert: pems.cert };
  writeJson(CERT_FILE, created);
  return created;
}

// https://... deb yozilgan so'rovlarni http://... ga yo'naltiradi
export async function startHttpsRedirect() {
  if (!config.httpsRedirectPort) return;
  try {
    const { key, cert } = await loadCertificate();
    const suffix = config.port === 80 ? '' : `:${config.port}`;
    const server = https.createServer({ key, cert }, (req, res) => {
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
