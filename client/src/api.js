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

async function startViaScript(person) {
  const data = await request(`${SCRIPT_URL}?action=start&direction=${encodeURIComponent(person.direction)}`);
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
      answers: current.questions.map((q, i) => ({ id: q.id, answer: q.options[answers[i]] ?? null })),
    }),
  });
}

// { regions, directions, secondsPerQuestion, texts }
export const loadConfig = () => request(SCRIPT_URL ? `${SCRIPT_URL}?action=config` : '/api/config');

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
