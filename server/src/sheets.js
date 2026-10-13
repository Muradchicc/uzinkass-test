import fs from 'node:fs';
import { config } from './config.js';

const TIMEOUT_MS = 20000;

export const sheetsEnabled = Boolean(config.appsScriptUrl);

const norm = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

async function callScript(init, params = {}) {
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
  if (data.error) throw new Error(`Apps Script: ${data.error}`);
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
    if (!text || options.some((o) => !o) || correctIndex < 0) {
      console.warn(`[savollar] "${title}" listi, ${rowNumber}-qator o'tkazib yuborildi (to'liq emas yoki to'g'ri javob aniqlanmadi)`);
      return;
    }
    questions.push({ id: `${title}#${rowNumber}`, text, options, correctIndex });
  });
  return questions;
}

// Har bir list — bitta bo'lim
export async function fetchSections() {
  const data = sheetsEnabled
    ? await callScript({ method: 'GET' }, { action: 'questions', token: config.appsScriptToken })
    : JSON.parse(fs.readFileSync(config.fakeDataFile, 'utf8'));

  return (data.sections ?? [])
    .map((s) => ({ title: String(s.title), questions: parseRows(s.title, s.rows ?? []) }))
    .filter((section) => section.questions.length);
}

export async function appendResultRow(row) {
  await callScript({
    method: 'POST',
    // text/plain — Apps Script'ga CORS/preflight'siz oddiy so'rov sifatida boradi
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'result', token: config.appsScriptToken, row }),
  });
}
