import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';
import { sheetsEnabled, callAdmin } from './sheets.js';
import { startHttpsRedirect, publicCertificate } from './httpsRedirect.js';
import {
  refreshQuestions,
  publicConfig,
  findRegion,
  findDirection,
  pickQuestions,
  grade,
  saveResult,
  collectSurvey,
  saveSurvey,
  flushPending,
  status,
} from './quiz.js';

const app = express();
app.use(express.json({ limit: '100kb' }));

const sessions = new Map();

const clean = (value, max) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

app.get('/api/status', (req, res) => res.json(status()));

const NOT_READY = "Savollar hali yuklanmagan. Birozdan so'ng qayta urinib ko'ring.";

app.get('/api/config', (req, res) => {
  const data = publicConfig();
  if (!data) return res.status(503).json({ error: NOT_READY });
  res.json(data);
});

app.post('/api/start', (req, res) => {
  if (!publicConfig()) return res.status(503).json({ error: NOT_READY });

  const names = [req.body?.lastName, req.body?.firstName, req.body?.middleName].map((v) => clean(v, 60));
  if (names.some((n) => n.length < 2)) {
    return res.status(400).json({ error: "Familiya, ism va sharifni to'liq kiriting" });
  }
  const region = findRegion(clean(req.body?.region, 120));
  if (!region) return res.status(400).json({ error: 'Hududni tanlang' });
  const direction = findDirection(clean(req.body?.direction, 120));
  if (!direction) return res.status(400).json({ error: "Yo'nalishni tanlang" });

  const { mode, questions, timeLimit } = pickQuestions(direction);
  if (!questions.length) {
    return res.status(503).json({ error: "Bu yo'nalish uchun savollar topilmadi" });
  }

  const sessionId = crypto.randomUUID();
  // Cloudflare tunnel orqali kelgan so'rovlarda cf-ray sarlavhasi bo'ladi
  const source = req.headers['cf-ray'] || req.headers['cf-connecting-ip'] ? 'Internet' : 'Lokal tarmoq';
  sessions.set(sessionId, {
    mode,
    region,
    fullName: names.join(' '),
    direction: direction.name,
    questions,
    source,
    startedAt: Date.now(),
  });

  // To'g'ri javoblar brauzerga yuborilmaydi
  res.json({
    sessionId,
    mode,
    timeLimit,
    questions: questions.map(({ section, text, options }) => ({ section, text, options })),
  });
});

app.post('/api/submit', (req, res) => {
  const session = sessions.get(req.body?.sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Test topilmadi yoki allaqachon yakunlangan' });
  }
  const answers = Array.isArray(req.body.answers) ? req.body.answers : [];
  const person = { fullName: session.fullName, region: session.region, direction: session.direction };

  if (session.mode === 'survey') {
    const survey = collectSurvey(session, answers);
    if (!survey.answered) return res.status(400).json({ error: 'Kamida bitta savolga javob bering' });
    sessions.delete(req.body.sessionId);
    saveSurvey(session, survey);
    return res.json({ mode: 'survey', ...person, answered: survey.answered, total: survey.total });
  }

  const result = grade(session, answers);
  sessions.delete(req.body.sessionId);
  saveResult(session, result);

  res.json({ mode: 'test', ...person, ...result });
});

// Jadvalni o'zgartiradigan amallardan keyin savollar va sozlamalar darhol qayta o'qiladi
const ADMIN_WRITES = [
  'saveSettings',
  'saveQuestion',
  'deleteQuestion',
  'addSheet',
  'renameSheet',
  'archiveSheet',
  'restoreSheet',
];

app.post('/api/admin', async (req, res) => {
  if (!sheetsEnabled) {
    return res.status(503).json({ error: "Admin panel faqat Google Sheets ulanganda ishlaydi (server/.env)" });
  }
  try {
    const data = await callAdmin(req.body ?? {});
    if (data.error) return res.status(data.auth ? 401 : 400).json(data);
    if (ADMIN_WRITES.includes(req.body?.op)) await refreshQuestions();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/uzinkass-cert.cer', (req, res) => {
  const cert = publicCertificate();
  if (!cert) return res.status(404).send('Sertifikat yaratilmagan');
  res.type('application/x-x509-ca-cert').send(cert);
});

if (fs.existsSync(config.clientDist)) {
  app.get('/admin', (req, res) => res.redirect('admin.html'));
  app.use(express.static(config.clientDist));
  app.use((req, res) => res.sendFile(path.join(config.clientDist, 'index.html')));
} else {
  app.use((req, res) => res.status(503).send('Frontend yig\'ilmagan. "npm run setup" buyrug\'ini bajaring.'));
}

setInterval(refreshQuestions, config.questionsRefreshMs);
setInterval(flushPending, config.flushIntervalMs);
setInterval(() => {
  const expired = Date.now() - config.sessionTtlMs;
  for (const [id, session] of sessions) if (session.startedAt < expired) sessions.delete(id);
}, 10 * 60 * 1000);

await refreshQuestions();
flushPending();
startHttpsRedirect();

// 0.0.0.0 — lokal tarmoqdagi boshqa kompyuterlar ham ulana olishi uchun
app.listen(config.port, '0.0.0.0', () => {
  const info = status();
  console.log(`\nRejim: ${sheetsEnabled ? 'Google Sheets' : "FAKE DATA (APPS_SCRIPT_URL sozlanmagan)"}`);
  console.log(`Bo'limlar: ${info.sections.map((s) => `${s.title} (${s.questions})`).join(', ') || "yo'q"}`);
  console.log(`\nShu kompyuterda:   http://localhost:${config.port}`);
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const a of addresses ?? []) {
      if (a.family === 'IPv4' && !a.internal) console.log(`Lokal tarmoqda:    http://${a.address}:${config.port}`);
    }
  }
  console.log('');
});
