// Berilgan bo'lsa (GitHub Pages yig'masi) sahifa serversiz, to'g'ridan-to'g'ri Apps Script bilan ishlaydi
const SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL;

const OFFLINE = "Server bilan aloqa yo'q. Tarmoqni tekshirib, qayta urinib ko'ring.";

async function request(url, init) {
  let res;
  try {
    res = await fetch(url, init);
  } catch {
    throw new Error(OFFLINE);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const err = new Error(data.error || `Xatolik (${res.status})`);
    // Login yoki parol noto'g'ri — admin panel kirish oynasiga qaytadi
    err.auth = Boolean(data.auth) || res.status === 401;
    throw err;
  }
  return data;
}

const post = (path, body) =>
  request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

// Apps Script rejimida sessiya brauzerda saqlanadi
let current = null;

const scriptStart = (direction) => request(`${SCRIPT_URL}?action=start&direction=${encodeURIComponent(direction)}`);

// Apps Script har so'rovga 3-5 soniya sarflaydi: savollar xodim F.I.SH ni yozayotganda oldindan olinadi.
// Bir marta ishlatiladi (testda savollar har safar aralashtiriladi) va eskirsa qayta so'raladi.
const PREFETCH_MS = 5 * 60 * 1000;
let prefetched = null;

const freshPrefetch = (direction) =>
  prefetched && prefetched.direction === direction && Date.now() - prefetched.at < PREFETCH_MS ? prefetched : null;

export function prefetchStart(direction) {
  if (!SCRIPT_URL || !direction || freshPrefetch(direction)) return;
  const promise = scriptStart(direction);
  // Xato bo'lsa "Boshlash" bosilganda qayta so'raladi
  promise.catch(() => {});
  prefetched = { direction, at: Date.now(), promise };
}

async function startViaScript(person) {
  const ready = freshPrefetch(person.direction);
  prefetched = null;
  const data = (ready && (await ready.promise.catch(() => null))) || (await scriptStart(person.direction));
  // Vaqt savollar olingan paytdan emas, xodim boshlagan paytdan hisoblanadi
  current = { person, questions: data.questions, startedAt: Date.now() };
  return { sessionId: 'script', ...data };
}

function submitViaScript(answers) {
  return request(SCRIPT_URL, {
    method: 'POST',
    // text/plain — Apps Script'ga CORS preflight'siz boradi
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      action: 'submit',
      ...current.person,
      seconds: Math.round((Date.now() - current.startedAt) / 1000),
      // Variant raqami variant matniga aylantiriladi; so'rovnomadagi erkin javob matni o'zgarishsiz
      answers: current.questions.map((q, i) => ({
        id: q.id,
        answer: typeof answers[i] === 'string' ? answers[i] : (q.options[answers[i]] ?? null),
      })),
    }),
  });
}

// Oxirgi olingan sozlamalar: qayta kirganda forma Apps Script javobini kutmasdan darhol ochiladi
const CONFIG_KEY = 'uzinkass-config';

export function cachedConfig() {
  try {
    const config = JSON.parse(localStorage.getItem(CONFIG_KEY));
    return Array.isArray(config?.regions) && Array.isArray(config?.directions) ? config : null;
  } catch {
    return null;
  }
}

// { regions, directions, surveys, noRegion, secondsPerQuestion, texts }
export const loadConfig = () =>
  request(SCRIPT_URL ? `${SCRIPT_URL}?action=config` : '/api/config').then((config) => {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    } catch {
      // Brauzer xotirasi yopiq bo'lsa keyingi safar ham javob kutiladi
    }
    return config;
  });

// person: { region, lastName, firstName, middleName, direction }
export const startTest = (person) => (SCRIPT_URL ? startViaScript(person) : post('/api/start', person));

export const submitTest = (sessionId, answers) =>
  SCRIPT_URL ? submitViaScript(answers) : post('/api/submit', { sessionId, answers });

// Admin panel: login/parol har bir so'rov bilan yuboriladi, ularni Apps Script tekshiradi
export const adminCall = (op, creds, payload = {}) =>
  SCRIPT_URL
    ? request(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'admin', op, ...creds, ...payload }),
      })
    : post('/api/admin', { op, ...creds, ...payload });
