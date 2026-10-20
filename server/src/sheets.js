import fs from 'node:fs';
import { config } from './config.js';
import { DEFAULT_REGIONS } from './defaults.js';

const TIMEOUT_MS = 20000;

export const sheetsEnabled = Boolean(config.appsScriptUrl);

const norm = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

async function callScript(init, params = {}, { keepError = false } = {}) {
  const url = new URL(config.appsScriptUrl);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const res = await fetch(url, { ...init, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    // Odatda bu Web App "Anyone" uchun ochilmaganini bildiradi (Google login sahifasi qaytadi)
    throw new Error(`Apps Script JSON qaytarmadi (HTTP ${res.status})`);
  }
  if (data.error && !keepError) throw new Error(`Apps Script: ${data.error}`);
  return data;
}

// To'g'ri javob: variant matni, A/B/C/D harfi yoki 1-4 raqami bo'lishi mumkin
function resolveAnswer(raw, options) {
  const value = norm(raw);
  if (!value) return -1;
  const byText = options.findIndex((o) => norm(o) === value);
  if (byText >= 0) return byText;
  const match = value.match(/^([a-dавс1-4])[).]?$/);
  if (!match) return -1;
  // Kirill а/в/с harflari lotin A/B/C o'rnida yozilgan bo'lishi mumkin
  return { a: 0, b: 1, c: 2, d: 3, а: 0, в: 1, с: 2, 1: 0, 2: 1, 3: 2, 4: 3 }[match[1]];
}

// Kutilgan ustunlar: Savol | A | B | C | D | To'g'ri javob (1-qator — sarlavha)
function parseRows(title, rows) {
  if (rows.length < 2) return [];
  const header = rows[0].map(norm);
  const has = (h, words) => words.some((w) => h.includes(w));

  let qCol = header.findIndex((h) => has(h, ['savol', 'савол', 'вопрос']));
  if (qCol < 0) qCol = 0;
  let aCol = header.findIndex((h, i) => i > qCol + 4 && has(h, ['javob', 'жавоб', 'ответ']));
  if (aCol < 0) aCol = qCol + 5;

  const questions = [];
  rows.slice(1).forEach((row, i) => {
    const rowNumber = i + 2;
    const text = String(row[qCol] ?? '').trim();
    const options = [1, 2, 3, 4].map((n) => String(row[qCol + n] ?? '').trim());
    if (!text && options.every((o) => !o)) return;

    const correctIndex = resolveAnswer(row[aCol], options);
    // Test savoli: to'rtala variant va to'g'ri javob. So'rovnoma savoli: 2-4 ta variant yoki variantsiz (erkin javob)
    const test = Boolean(text) && options.every(Boolean) && correctIndex >= 0 && Boolean(options[correctIndex]);
    const survey = Boolean(text) && options.filter(Boolean).length !== 1;
    if (!test && !survey) {
      console.warn(`[savollar] "${title}" listi, ${rowNumber}-qator o'tkazib yuborildi (to'liq emas)`);
      return;
    }
    questions.push({ id: `${title}#${rowNumber}`, text, options, correctIndex: test ? correctIndex : -1, test, survey });
  });
  return questions;
}

const clean = (value) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

// Jadvaldagi "_Sozlamalar" listidan kelgan qiymatlar; yetishmaganlari standart bilan to'ldiriladi
function normalizeSettings(raw, sections) {
  const regions = (raw?.regions ?? []).map(clean).filter(Boolean);
  const directions = (raw?.directions ?? [])
    .map((d) => ({
      name: clean(d?.name),
      sheets: (d?.sheets ?? []).map(clean).filter(Boolean),
      type: d?.type === 'survey' ? 'survey' : 'test',
    }))
    .filter((d) => d.name);
  return {
    regions: regions.length ? regions : DEFAULT_REGIONS,
    // Sozlanmagan bo'lsa har bir savollar listi alohida yo'nalish (test) hisoblanadi
    directions: directions.length ? directions : sections.map((s) => ({ name: s.title, sheets: [s.title], type: 'test' })),
    questionCount: Number(raw?.questionCount) || config.questionCount,
    secondsPerQuestion: Number(raw?.secondsPerQuestion) || config.secondsPerQuestion,
    // Admin paneldan o'zgartirilgan sayt matnlari ("_Matnlar" listi)
    texts: { lat: raw?.texts?.lat ?? {}, cyr: raw?.texts?.cyr ?? {} },
  };
}

// Har bir list — bitta bo'lim
export async function fetchData() {
  const data = sheetsEnabled
    ? await callScript({ method: 'GET' }, { action: 'questions', token: config.appsScriptToken })
    : JSON.parse(fs.readFileSync(config.fakeDataFile, 'utf8'));

  const sections = (data.sections ?? [])
    .map((s) => ({ title: String(s.title), questions: parseRows(s.title, s.rows ?? []) }))
    .filter((section) => section.questions.length);
  return { sections, settings: normalizeSettings(data.settings, sections) };
}

// Admin panel so'rovlari: login/parolni Apps Script o'zi tekshiradi
// Xato javob ({ error, auth }) o'zgarishsiz qaytariladi
export function callAdmin(body) {
  return callScript(
    { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...body, action: 'admin' }) },
    {},
    { keepError: true },
  );
}

export async function appendResultRow(row) {
  await callScript({
    method: 'POST',
    // text/plain — Apps Script'ga CORS/preflight'siz oddiy so'rov sifatida boradi
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'result', token: config.appsScriptToken, row }),
  });
}

// Bitta so'rovnomaning barcha javoblari ("So'rovnoma javoblari" listiga, har bir javob — qator)
export async function appendSurveyRows(rows) {
  await callScript({
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'survey', token: config.appsScriptToken, rows }),
  });
}
