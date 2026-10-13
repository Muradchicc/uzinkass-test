import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';
import { sheetsEnabled } from './sheets.js';
import { startHttpsRedirect } from './httpsRedirect.js';
import { refreshQuestions, pickQuestions, grade, saveResult, flushPending, status } from './quiz.js';

const app = express();
app.use(express.json({ limit: '100kb' }));

const sessions = new Map();

const clean = (value, max) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

app.get('/api/status', (req, res) => res.json(status()));

app.post('/api/start', (req, res) => {
  const fullName = clean(req.body?.fullName, 120);
  const position = clean(req.body?.position, 120);
  if (fullName.length < 3 || !position) {
    return res.status(400).json({ error: 'F.I.SH va lavozimni kiriting' });
  }

  const questions = pickQuestions();
  if (!questions.length) {
    return res.status(503).json({ error: "Savollar hali yuklanmagan. Birozdan so'ng qayta urinib ko'ring." });
  }

  const sessionId = crypto.randomUUID();
  // Cloudflare tunnel orqali kelgan so'rovlarda cf-ray sarlavhasi bo'ladi
  const source = req.headers['cf-ray'] || req.headers['cf-connecting-ip'] ? 'Internet' : 'Lokal tarmoq';
  sessions.set(sessionId, { fullName, position, questions, source, startedAt: Date.now() });

  // To'g'ri javoblar brauzerga yuborilmaydi
  res.json({
    sessionId,
    questions: questions.map(({ section, text, options }) => ({ section, text, options })),
  });
});

app.post('/api/submit', (req, res) => {
  const session = sessions.get(req.body?.sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Test topilmadi yoki allaqachon yakunlangan' });
  }
  const answers = Array.isArray(req.body.answers) ? req.body.answers : [];

  const result = grade(session, answers);
  sessions.delete(req.body.sessionId);
  saveResult(session, result);

  res.json({ fullName: session.fullName, position: session.position, ...result });
});

if (fs.existsSync(config.clientDist)) {
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
