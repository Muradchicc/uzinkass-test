import { config } from './config.js';
import { readJson, writeJson } from './store.js';
import { fetchSections, appendResultRow, sheetsEnabled } from './sheets.js';

const QUESTIONS_FILE = 'questions.json';
const PENDING_FILE = 'pending.json';
const RESULTS_FILE = 'results.json';

// Fake rejimda eski Sheets keshi ishlatilmaydi
const cached = sheetsEnabled ? readJson(QUESTIONS_FILE, null) : null;
let sections = cached?.sections ?? [];
let lastSync = cached?.syncedAt ?? null;
let lastSyncError = null;

let pending = readJson(PENDING_FILE, []);
let flushing = false;

export function shuffle(items) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function refreshQuestions() {
  try {
    const fresh = await fetchSections();
    if (!fresh.length) throw new Error('Yaroqli savollar topilmadi');
    sections = fresh;
    lastSync = new Date().toISOString();
    lastSyncError = null;
    if (sheetsEnabled) writeJson(QUESTIONS_FILE, { syncedAt: lastSync, sections });
  } catch (err) {
    // Internet uzilsa oxirgi saqlangan savollar bilan ishlayveramiz
    lastSyncError = err.message;
    console.warn(`[savollar] O'qib bo'lmadi: ${err.message}`);
  }
}

// Bo'limlardan navbatma-navbat bittadan olib, jami `count` ta savol yig'adi
export function pickQuestions(count = config.questionCount) {
  const pools = shuffle(sections).map((s) => ({ title: s.title, questions: shuffle(s.questions) }));
  const picked = [];
  while (picked.length < count && pools.some((p) => p.questions.length)) {
    for (const pool of pools) {
      if (picked.length >= count) break;
      const question = pool.questions.pop();
      if (question) picked.push({ ...question, section: pool.title });
    }
  }
  return shuffle(picked).map((q) => {
    const order = shuffle([0, 1, 2, 3]);
    return {
      id: q.id,
      section: q.section,
      text: q.text,
      options: order.map((i) => q.options[i]),
      correctIndex: order.indexOf(q.correctIndex),
    };
  });
}

export function grade(session, answers) {
  const bySection = new Map();
  const mistakes = [];
  let correct = 0;
  session.questions.forEach((q, i) => {
    const stat = bySection.get(q.section) ?? { section: q.section, correct: 0, total: 0 };
    stat.total++;
    if (answers[i] === q.correctIndex) {
      stat.correct++;
      correct++;
    } else {
      mistakes.push({
        number: i + 1,
        section: q.section,
        text: q.text,
        yourAnswer: q.options[answers[i]] ?? null,
        correctAnswer: q.options[q.correctIndex],
      });
    }
    bySection.set(q.section, stat);
  });
  const total = session.questions.length;
  return {
    correct,
    total,
    percent: Math.round((correct / total) * 100),
    sections: [...bySection.values()],
    mistakes,
  };
}

function formatDuration(ms) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(seconds / 60)} daq ${seconds % 60} son`;
}

export function saveResult(session, result) {
  const now = new Date();
  // Ustunlar tartibi apps-script/Code.gs dagi RESULT_HEADER bilan bir xil
  const row = [
    now.toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent' }),
    session.fullName,
    session.position,
    result.correct,
    result.total,
    result.percent,
    result.sections.map((s) => `${s.section}: ${s.correct}/${s.total}`).join('; '),
    formatDuration(now - session.startedAt),
    session.source,
  ];

  // Serverda doim zaxira nusxa qoladi
  writeJson(RESULTS_FILE, [...readJson(RESULTS_FILE, []), row]);

  if (!sheetsEnabled) return;
  pending.push(row);
  writeJson(PENDING_FILE, pending);
  flushPending();
}

// Navbatdagi natijalarni Google Sheets'ga yozadi; xato bo'lsa keyingi safar qayta urinadi
export async function flushPending() {
  if (!sheetsEnabled || flushing || !pending.length) return;
  flushing = true;
  try {
    while (pending.length) {
      await appendResultRow(pending[0]);
      pending.shift();
      writeJson(PENDING_FILE, pending);
    }
  } catch (err) {
    console.warn(`[natijalar] Google Sheets'ga yozib bo'lmadi, ${pending.length} ta natija navbatda: ${err.message}`);
  } finally {
    flushing = false;
  }
}

export function status() {
  return {
    mode: sheetsEnabled ? 'google-sheets' : 'fake-data',
    sections: sections.map((s) => ({ title: s.title, questions: s.questions.length })),
    totalQuestions: sections.reduce((n, s) => n + s.questions.length, 0),
    questionCount: config.questionCount,
    lastSync,
    lastSyncError,
    pendingResults: sheetsEnabled ? pending.length : 0,
  };
}
