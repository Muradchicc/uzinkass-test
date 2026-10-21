import { readJson, writeJson } from './store.js';
import { fetchData, appendResultRow, appendSurveyRows, sheetsEnabled } from './sheets.js';

const QUESTIONS_FILE = 'questions.json';
const PENDING_FILE = 'pending.json';
const RESULTS_FILE = 'results.json';
const SURVEYS_FILE = 'surveys.json';
const MAX_SURVEY_QUESTIONS = 200;

// Fake rejimda eski Sheets keshi ishlatilmaydi. Sozlamalarsiz eski kesh ham yaroqsiz.
const saved = sheetsEnabled ? readJson(QUESTIONS_FILE, null) : null;
const cached = saved?.settings ? saved : null;
// Eski keshda faqat test savollari bo'lgan va test/survey belgilari yo'q
let sections = (cached?.sections ?? []).map((s) => ({
  ...s,
  questions: s.questions.map((q) => ({ test: true, survey: true, ...q })),
}));
let settings = cached?.settings ?? null;
let lastSync = cached?.syncedAt ?? null;
let lastSyncError = null;

// Navbat: natija qatori (massiv) yoki so'rovnoma javoblari ({ kind: 'survey', rows }).
// Eski tartibdagi (hududsiz, 9 ustunli) natijalar yangi ustunlarga moslanadi
let pending = readJson(PENDING_FILE, []).map((item) =>
  Array.isArray(item) && item.length === 9 ? [item[0], '', item[1], item[2], ...item.slice(3)] : item,
);
let flushing = false;

const norm = (value) => String(value ?? '').trim().toLowerCase();

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
    const fresh = await fetchData();
    if (!fresh.sections.length) throw new Error('Yaroqli savollar topilmadi');
    sections = fresh.sections;
    settings = fresh.settings;
    lastSync = new Date().toISOString();
    lastSyncError = null;
    if (sheetsEnabled) writeJson(QUESTIONS_FILE, { syncedAt: lastSync, sections, settings });
  } catch (err) {
    // Internet uzilsa oxirgi saqlangan savollar bilan ishlayveramiz
    lastSyncError = err.message;
    console.warn(`[savollar] O'qib bo'lmadi: ${err.message}`);
  }
}

// Bosh sahifa uchun: hududlar va yo'nalishlar ro'yxati
export function publicConfig() {
  if (!settings) return null;
  return {
    regions: settings.regions,
    directions: settings.directions.map((d) => d.name),
    // So'rovnoma turidagi yo'nalishlar (qolganlari — test)
    surveys: settings.directions.filter((d) => d.type === 'survey').map((d) => d.name),
    // Hudud so'ralmaydigan yo'nalishlar
    noRegion: settings.directions.filter((d) => !d.region).map((d) => d.name),
    secondsPerQuestion: settings.secondsPerQuestion,
    texts: settings.texts ?? { lat: {}, cyr: {} },
  };
}

export const findRegion = (name) => settings?.regions.find((r) => r === name) ?? null;
export const findDirection = (name) => settings?.directions.find((d) => d.name === name) ?? null;

// Yo'nalishga biriktirilgan bo'limlardan navbatma-navbat bittadan olib savollar yig'adi.
// Listlari ko'rsatilmagan yo'nalishga barcha bo'limlardan savol tushadi.
export function pickQuestions(direction) {
  if (direction.type === 'survey') return pickSurvey(direction);
  const allowed = direction.sheets.map(norm);
  const pools = shuffle(sections)
    .filter((s) => !allowed.length || allowed.includes(norm(s.title)))
    .map((s) => ({ title: s.title, questions: shuffle(s.questions.filter((q) => q.test)) }));

  const picked = [];
  while (picked.length < settings.questionCount && pools.some((p) => p.questions.length)) {
    for (const pool of pools) {
      if (picked.length >= settings.questionCount) break;
      const question = pool.questions.pop();
      if (question) picked.push({ ...question, section: pool.title });
    }
  }
  const questions = shuffle(picked).map((q) => {
    const order = shuffle([0, 1, 2, 3]);
    return {
      id: q.id,
      section: q.section,
      text: q.text,
      options: order.map((i) => q.options[i]),
      correctIndex: order.indexOf(q.correctIndex),
    };
  });
  return { mode: 'test', questions, timeLimit: questions.length * settings.secondsPerQuestion };
}

// So'rovnoma: yo'nalishdagi bo'limlarning barcha savollari — bo'limlar yo'nalishda ko'rsatilgan
// tartibda, savollar jadvaldagi tartibda; variantlar aralashtirilmaydi, vaqt cheklanmaydi
function pickSurvey(direction) {
  const allowed = direction.sheets.map(norm);
  const questions = sections
    .filter((s) => !allowed.length || allowed.includes(norm(s.title)))
    .sort((a, b) => allowed.indexOf(norm(a.title)) - allowed.indexOf(norm(b.title)))
    .flatMap((s) =>
      s.questions
        .filter((q) => q.survey)
        .map((q) => ({ id: q.id, section: s.title, text: q.text, options: q.options.filter(Boolean) })),
    )
    .slice(0, MAX_SURVEY_QUESTIONS);
  return { mode: 'survey', questions, timeLimit: 0 };
}

// So'rovnoma javoblari: variant raqami yoki xodim yozgan matn
export function collectSurvey(session, answers) {
  const answered = [];
  session.questions.forEach((q, i) => {
    const raw = answers[i];
    const answer = q.options.length
      ? (Number.isInteger(raw) ? q.options[raw] : null)
      : String(raw ?? '').replace(/\r\n?/g, '\n').trim().slice(0, 1000);
    if (answer) answered.push({ section: q.section, text: q.text, answer });
  });
  return { answered: answered.length, total: session.questions.length, items: answered };
}

export function saveSurvey(session, survey) {
  const time = new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent' });
  // Ustunlar tartibi apps-script/Code.gs dagi SURVEY_HEADER bilan bir xil
  const rows = survey.items.map((item) => [
    time,
    session.region,
    session.fullName,
    session.direction,
    item.section,
    item.text,
    item.answer,
    session.source,
  ]);
  if (!rows.length) return;

  writeJson(SURVEYS_FILE, [...readJson(SURVEYS_FILE, []), ...rows]);

  if (!sheetsEnabled) return;
  pending.push({ kind: 'survey', rows });
  writeJson(PENDING_FILE, pending);
  flushPending();
}

// Javobsiz qolgan savollar xato hisoblanadi
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
      // To'g'ri javob xodimga ko'rsatilmaydi
      mistakes.push({
        number: i + 1,
        section: q.section,
        text: q.text,
        yourAnswer: q.options[answers[i]] ?? null,
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
    session.region,
    session.fullName,
    session.direction,
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
      const item = pending[0];
      if (Array.isArray(item)) await appendResultRow(item);
      else await appendSurveyRows(item.rows);
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
    sections: sections.map((s) => ({
      title: s.title,
      questions: s.questions.length,
      testQuestions: s.questions.filter((q) => q.test).length,
    })),
    totalQuestions: sections.reduce((n, s) => n + s.questions.length, 0),
    questionCount: settings?.questionCount ?? null,
    secondsPerQuestion: settings?.secondsPerQuestion ?? null,
    directions: settings?.directions ?? [],
    lastSync,
    lastSyncError,
    pendingResults: sheetsEnabled ? pending.length : 0,
  };
}
