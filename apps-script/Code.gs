/**
 * Uzinkass test — Google Sheets ko'prigi.
 * O'rnatish: jadvalda Extensions → Apps Script → shu kodni Code.gs ga, Token.gs ni alohida
 * faylga joylang → Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone.
 * Chiqqan /exec havolasini server/.env dagi APPS_SCRIPT_URL ga yozing.
 *
 * Ikki xil mijoz ishlatadi:
 *  - lokal server (token bilan): action=questions, action=result
 *  - internetdagi sahifa (GitHub Pages, tokensiz): action=config, action=start, action=submit
 *
 * Hududlar, yo'nalishlar va test sozlamalari "_Sozlamalar" listida turadi
 * (list bo'lmasa birinchi murojaatda o'zi yaratiladi).
 */

// TOKEN alohida Token.gs faylida turadi (u GitHub'ga yuklanmaydi):
//   const TOKEN = '...';   — server/.env dagi APPS_SCRIPT_TOKEN bilan bir xil

// Barcha natijalar yoziladigan list
const RESULTS_SHEET = 'Natijalar';

// Hududlar, yo'nalishlar va sozlamalar listi
const SETTINGS_SHEET = '_Sozlamalar';

// Savollar olinmaydigan qo'shimcha listlar. Google Forms javoblari listi va
// "_" bilan boshlanadigan listlar avtomatik o'tkazib yuboriladi.
const EXCLUDE_SHEETS = ['Umumiy'];

const RESULT_HEADER = [
  'Sana va vaqt', 'Hudud', 'F.I.SH', "Yo'nalish", "To'g'ri javoblar", 'Jami savollar',
  'Foiz (%)', "Bo'limlar bo'yicha", 'Davomiyligi', 'Manba',
];

// "_Sozlamalar" listi bo'lmaganda yoki ustuni bo'sh bo'lganda ishlatiladigan qiymatlar
const DEFAULT_REGIONS = [
  "Qoraqalpog'iston Respublikasi", 'Andijon viloyati', 'Buxoro viloyati', 'Jizzax viloyati',
  'Qashqadaryo viloyati', 'Navoiy viloyati', 'Namangan viloyati', 'Samarqand viloyati',
  'Surxondaryo viloyati', 'Sirdaryo viloyati', 'Toshkent viloyati', "Farg'ona viloyati",
  'Xorazm viloyati', 'Toshkent shahri',
];
const DEFAULT_QUESTION_COUNT = 10;
const DEFAULT_SECONDS_PER_QUESTION = 60;

// Formadagi savollar sarlavhasida shu so'zlardan biri bo'lishi kerak
const NAME_WORDS = ['f.i.sh', 'f.i.o', 'fish', 'fio', 'ism', 'фио', 'ф.и.о', 'ф.и.ш'];
const DIRECTION_WORDS = ["yo'nalish", 'lavozim', 'направление', 'должность', 'йўналиш', 'лавозим'];
const REGION_WORDS = ['hudud', 'viloyat', 'регион', 'область', 'ҳудуд', 'вилоят'];

function doGet(e) {
  const action = e.parameter.action;
  if (action === 'config') return json(publicConfig());
  if (action === 'start') return json(startTest(e.parameter.direction));

  if (e.parameter.token !== TOKEN) return json({ error: "Token noto'g'ri" });
  if (action !== 'questions') return json({ error: "Noma'lum amal" });

  const sections = questionSheets().map(function (sheet) {
    return { title: sheet.getName(), rows: sheet.getDataRange().getDisplayValues() };
  });
  return json({ sections: sections, settings: loadSettings() });
}

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  if (body.action === 'submit') return json(submitTest(body));
  if (body.action === 'admin') return json(adminAction(body));

  if (body.token !== TOKEN) return json({ error: "Token noto'g'ri" });
  if (body.action !== 'result' || !Array.isArray(body.row)) return json({ error: "Noma'lum amal" });
  // Yangilanmagan server eski tartibdagi qator yuborsa, ustunlar aralashib ketmasligi uchun
  if (body.row.length !== RESULT_HEADER.length) return json({ error: 'Server eski versiyada — uni yangilang' });

  appendResult(body.row);
  return json({ ok: true });
}

/** Bosh sahifa uchun: hududlar va yo'nalishlar ro'yxati. */
function publicConfig() {
  const settings = loadSettings();
  return {
    regions: settings.regions,
    directions: settings.directions.map(function (d) { return d.name; }),
    secondsPerQuestion: settings.secondsPerQuestion,
    texts: settings.texts,
  };
}

/** Yo'nalishga biriktirilgan listlardan navbatma-navbat bittadan olib, savollar beradi (to'g'ri javoblarsiz). */
function startTest(directionName) {
  const settings = loadSettings();
  const direction = findDirection(settings, directionName);
  if (!direction) return { error: "Yo'nalish topilmadi" };

  const pools = {};
  const names = [];
  shuffle(loadQuestions()).forEach(function (q) {
    if (!inDirection(direction, q.section)) return;
    if (!pools[q.section]) {
      pools[q.section] = [];
      names.push(q.section);
    }
    pools[q.section].push(q);
  });
  if (!names.length) return { error: "Bu yo'nalish uchun savollar topilmadi" };

  const picked = [];
  let found = true;
  while (picked.length < settings.questionCount && found) {
    found = false;
    shuffle(names).forEach(function (name) {
      if (picked.length >= settings.questionCount || !pools[name].length) return;
      picked.push(pools[name].pop());
      found = true;
    });
  }

  return {
    timeLimit: picked.length * settings.secondsPerQuestion,
    questions: shuffle(picked).map(function (q) {
      return { id: q.id, section: q.section, text: q.text, options: shuffle(q.options) };
    }),
  };
}

/** Internetdagi sahifadan kelgan javoblarni baholab, "Natijalar" listiga yozadi. */
function submitTest(body) {
  const settings = loadSettings();
  const person = readPerson(body, settings);
  if (person.error) return person;

  const byId = {};
  loadQuestions().forEach(function (q) { byId[q.id] = q; });

  const stats = {};
  const order = [];
  const mistakes = [];
  const seen = {};
  let correct = 0;
  let total = 0;

  (Array.isArray(body.answers) ? body.answers : []).slice(0, settings.questionCount).forEach(function (item) {
    const q = item && byId[item.id];
    if (!q || seen[q.id]) return;
    seen[q.id] = true;
    total++;
    if (!stats[q.section]) {
      stats[q.section] = { section: q.section, correct: 0, total: 0 };
      order.push(q.section);
    }
    stats[q.section].total++;
    if (norm(item.answer) === norm(q.correct)) {
      stats[q.section].correct++;
      correct++;
    } else {
      // To'g'ri javob xodimga ko'rsatilmaydi
      mistakes.push({
        number: total,
        section: q.section,
        text: q.text,
        yourAnswer: item.answer ? clean(item.answer) : null,
      });
    }
  });
  if (!total) return { error: 'Javoblar topilmadi. Testni qaytadan boshlang.' };

  const sections = order.map(function (name) { return stats[name]; });
  const percent = Math.round((correct / total) * 100);
  const seconds = Math.max(0, Math.round(Number(body.seconds) || 0));

  appendResult([
    now(),
    person.region,
    person.fullName,
    person.direction,
    correct,
    total,
    percent,
    sectionSummary(sections),
    Math.floor(seconds / 60) + ' daq ' + (seconds % 60) + ' son',
    'Internet',
  ]);

  return {
    fullName: person.fullName, region: person.region, direction: person.direction,
    correct: correct, total: total, percent: percent, sections: sections, mistakes: mistakes,
  };
}

function readPerson(body, settings) {
  const parts = [clean(body.lastName), clean(body.firstName), clean(body.middleName)];
  if (parts.some(function (p) { return p.length < 2; })) return { error: "Familiya, ism va sharifni to'liq kiriting" };
  const region = clean(body.region);
  if (settings.regions.indexOf(region) === -1) return { error: 'Hududni tanlang' };
  const direction = findDirection(settings, body.direction);
  if (!direction) return { error: "Yo'nalishni tanlang" };
  return { region: region, fullName: parts.join(' '), direction: direction.name };
}

function findDirection(settings, name) {
  const wanted = clean(name);
  return settings.directions.filter(function (d) { return d.name === wanted; })[0] || null;
}

// Listlari ko'rsatilmagan yo'nalishga barcha listlardan savol tushadi
function inDirection(direction, section) {
  return !direction.sheets.length || direction.sheets.map(norm).indexOf(norm(section)) !== -1;
}

/**
 * "_Sozlamalar" listini o'qiydi:
 *   A — Hududlar | B — Yo'nalishlar | C — yo'nalish listlari (vergul bilan) | E — Sozlama | F — Qiymat
 */
function loadSettings() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = book.getSheetByName(SETTINGS_SHEET) || createSettingsSheet(book);

  const regions = [];
  const directions = [];
  const values = {};
  sheet.getDataRange().getDisplayValues().slice(1).forEach(function (row) {
    if (clean(row[0])) regions.push(clean(row[0]));
    if (clean(row[1])) {
      directions.push({
        name: clean(row[1]),
        sheets: String(row[2] || '').split(/[;,]/).map(clean).filter(Boolean),
      });
    }
    if (clean(row[4])) values[norm(row[4])] = row[5];
  });

  function numberSetting(word, fallback, min, max) {
    const key = Object.keys(values).filter(function (k) { return k.indexOf(word) !== -1; })[0];
    const n = parseInt(values[key], 10);
    return n >= min && n <= max ? n : fallback;
  }

  return {
    regions: regions.length ? regions : DEFAULT_REGIONS,
    directions: directions.length ? directions : defaultDirections(),
    questionCount: numberSetting('soni', DEFAULT_QUESTION_COUNT, 1, 200),
    secondsPerQuestion: numberSetting('vaqt', DEFAULT_SECONDS_PER_QUESTION, 5, 3600),
    texts: loadTexts(),
  };
}

// Sozlanmagan bo'lsa har bir savollar listi alohida yo'nalish hisoblanadi
function defaultDirections() {
  return questionSheets().map(function (sheet) {
    return { name: sheet.getName(), sheets: [sheet.getName()] };
  });
}

function createSettingsSheet(book) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const existing = book.getSheetByName(SETTINGS_SHEET);
    if (existing) return existing;

    const sheet = book.insertSheet(SETTINGS_SHEET);
    writeSettingsSheet(sheet, {
      regions: DEFAULT_REGIONS,
      directions: defaultDirections(),
      questionCount: DEFAULT_QUESTION_COUNT,
      secondsPerQuestion: DEFAULT_SECONDS_PER_QUESTION,
    });
    return sheet;
  } finally {
    lock.releaseLock();
  }
}

function writeSettingsSheet(sheet, settings) {
  const rows = [[
    'Hududlar', "Yo'nalishlar", "Yo'nalish listlari (vergul bilan; bo'sh — barcha listlar)", '', 'Sozlama', 'Qiymat',
  ]];
  const height = Math.max(settings.regions.length, settings.directions.length, 2);
  for (let i = 0; i < height; i++) {
    const direction = settings.directions[i];
    rows.push([
      settings.regions[i] || '',
      direction ? direction.name : '',
      direction ? direction.sheets.join(', ') : '',
      '',
      ['Savollar soni', 'Bir savolga vaqt (soniya)'][i] || '',
      [settings.questionCount, settings.secondsPerQuestion][i] || '',
    ]);
  }
  sheet.clearContents();
  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows.map(function (row) { return row.map(safeCell); }));
  sheet.getRange(1, 1, 1, rows[0].length).setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, rows[0].length);
}

// --- Sayt matnlari ("_Matnlar" listi: Kalit | Tavsif | Lotin | Kirill) ---

const TEXTS_SHEET = '_Matnlar';
const TEXT_KEYS = [
  ['title', 'Bosh sahifa sarlavhasi'],
  ['lead', 'Sarlavha ostidagi matn'],
  ['rules', "Qoidalar: har qator — bitta qoida, {daqiqa} — bir savolga vaqt"],
];

// Faqat to'ldirilgan matnlar qaytariladi; bo'shlari saytda standart matn bilan ko'rsatiladi
function loadTexts() {
  const texts = { lat: {}, cyr: {} };
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TEXTS_SHEET);
  if (!sheet) return texts;
  sheet.getDataRange().getValues().slice(1).forEach(function (row) {
    const key = String(row[0]).trim();
    if (!TEXT_KEYS.some(function (k) { return k[0] === key; })) return;
    if (String(row[2]).trim()) texts.lat[key] = String(row[2]).trim();
    if (String(row[3]).trim()) texts.cyr[key] = String(row[3]).trim();
  });
  return texts;
}

function writeTexts(texts) {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = book.getSheetByName(TEXTS_SHEET) || book.insertSheet(TEXTS_SHEET);
  const rows = [['Kalit', 'Tavsif', 'Lotin', 'Kirill']].concat(TEXT_KEYS.map(function (k) {
    return [k[0], k[1], cleanText(texts.lat && texts.lat[k[0]], 2000), cleanText(texts.cyr && texts.cyr[k[0]], 2000)];
  }));
  sheet.clearContents();
  sheet.getRange(1, 1, rows.length, 4).setValues(rows.map(function (row) { return row.map(safeCell); }));
  sheet.getRange(1, 1, 1, 4).setFontWeight('bold');
  sheet.setFrozenRows(1);
}

// --- Admin panel ---

const MAX_LOGIN_FAILS = 5;
const LOGIN_LOCK_SECONDS = 15 * 60;
const LETTERS = ['A', 'B', 'C', 'D'];

function adminAction(body) {
  const denied = checkAdmin(body.login, body.password);
  if (denied) return { error: denied, auth: true };

  if (body.op === 'login') return { ok: true };
  if (body.op === 'settings') return adminSettings();
  if (body.op === 'results') return adminResults();
  if (body.op === 'questions') return adminQuestions();
  if (body.op === 'changePassword') return changePassword(body);

  // O'zgartiruvchi amallar bir vaqtda bajarilmasligi uchun
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (body.op === 'saveSettings') return saveSettings(body.settings || {});
    if (body.op === 'saveQuestion') return saveQuestion(body);
    if (body.op === 'deleteQuestion') return deleteQuestion(body);
    if (body.op === 'addSheet') return addQuestionSheet(body.name);
  } finally {
    lock.releaseLock();
  }
  return { error: "Noma'lum amal" };
}

// Panelda o'zgartirilgan login/parol Script Properties'da (parol xesh ko'rinishida) turadi,
// aks holda Token.gs dagi ADMIN_LOGIN / ADMIN_PASSWORD ishlatiladi
function adminCredentials() {
  const props = PropertiesService.getScriptProperties();
  const hash = props.getProperty('ADMIN_HASH');
  if (hash) return { login: props.getProperty('ADMIN_LOGIN'), salt: props.getProperty('ADMIN_SALT'), hash: hash };
  if (typeof ADMIN_PASSWORD === 'undefined' || !ADMIN_PASSWORD) return null;
  return { login: typeof ADMIN_LOGIN === 'undefined' ? 'admin' : ADMIN_LOGIN, password: String(ADMIN_PASSWORD) };
}

function sha256(text) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8));
}

// Xato bo'lsa sababini, to'g'ri bo'lsa null qaytaradi
function checkAdmin(login, password) {
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('admin-fails') || 0);
  if (fails >= MAX_LOGIN_FAILS) return "Ko'p marta xato kiritildi. 15 daqiqadan so'ng qayta urinib ko'ring.";

  const creds = adminCredentials();
  if (!creds) return "Admin paroli o'rnatilmagan: Token.gs ga ADMIN_PASSWORD yozing";
  const pass = String(password == null ? '' : password);
  const ok = String(login == null ? '' : login).trim() === creds.login &&
    (creds.hash ? sha256(creds.salt + pass) === creds.hash : pass === creds.password);
  if (ok) return null;
  cache.put('admin-fails', String(fails + 1), LOGIN_LOCK_SECONDS);
  return "Login yoki parol noto'g'ri";
}

function changePassword(body) {
  const login = String(body.newLogin == null ? '' : body.newLogin).trim();
  const password = String(body.newPassword == null ? '' : body.newPassword);
  if (login.length < 3) return { error: "Login kamida 3 ta belgidan iborat bo'lsin" };
  if (password.length < 8) return { error: "Parol kamida 8 ta belgidan iborat bo'lsin" };
  const salt = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperties({
    ADMIN_LOGIN: login,
    ADMIN_SALT: salt,
    ADMIN_HASH: sha256(salt + password),
  });
  return { ok: true };
}

function adminSettings() {
  const settings = loadSettings();
  settings.sheets = questionSheets().map(function (sheet) {
    return { name: sheet.getName(), questions: Math.max(0, sheet.getLastRow() - 1) };
  });
  return settings;
}

function saveSettings(input) {
  const regions = (Array.isArray(input.regions) ? input.regions : []).map(clean).filter(Boolean);
  if (!regions.length) return { error: "Kamida bitta hudud kiriting" };

  const directions = (Array.isArray(input.directions) ? input.directions : [])
    .map(function (d) {
      return {
        name: clean(d && d.name),
        sheets: (d && Array.isArray(d.sheets) ? d.sheets : []).map(clean).filter(Boolean),
      };
    })
    .filter(function (d) { return d.name; });
  if (!directions.length) return { error: "Kamida bitta yo'nalish kiriting" };

  const questionCount = parseInt(input.questionCount, 10);
  if (!(questionCount >= 1 && questionCount <= 200)) return { error: "Savollar soni 1 dan 200 gacha bo'lsin" };
  const secondsPerQuestion = parseInt(input.secondsPerQuestion, 10);
  if (!(secondsPerQuestion >= 5 && secondsPerQuestion <= 3600)) {
    return { error: "Bir savolga vaqt 5 dan 3600 soniyagacha bo'lsin" };
  }

  const book = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = book.getSheetByName(SETTINGS_SHEET) || book.insertSheet(SETTINGS_SHEET);
  writeSettingsSheet(sheet, {
    regions: regions,
    directions: directions,
    questionCount: questionCount,
    secondsPerQuestion: secondsPerQuestion,
  });
  if (input.texts) writeTexts(input.texts);
  return adminSettings();
}

// Barcha savollar listlari; to'liq bo'lmagan qatorlar ham ko'rsatiladi (valid: false), admin ularni tuzatsin
function adminQuestions() {
  return {
    sheets: questionSheets().map(function (sheet) {
      const questions = [];
      sheet.getDataRange().getDisplayValues().forEach(function (row, i) {
        if (i === 0) return;
        const text = String(row[0]).trim();
        const options = row.slice(1, 5).map(function (o) { return String(o).trim(); });
        if (!text && options.every(function (o) { return !o; })) return;
        const correct = resolveAnswer(row[5], options);
        questions.push({
          row: i + 1,
          text: text,
          options: options,
          correct: correct === null ? -1 : options.indexOf(correct),
          valid: Boolean(text) && correct !== null && options.every(function (o) { return o; }),
        });
      });
      return { name: sheet.getName(), questions: questions };
    }),
  };
}

function findQuestionSheet(name) {
  const wanted = String(name == null ? '' : name);
  return questionSheets().filter(function (sheet) { return sheet.getName() === wanted; })[0] || null;
}

function saveQuestion(body) {
  const sheet = findQuestionSheet(body.sheet);
  if (!sheet) return { error: "Bo'lim topilmadi" };
  const text = cleanText(body.text, 1000);
  const options = (Array.isArray(body.options) ? body.options : []).slice(0, 4).map(function (o) { return cleanText(o, 500); });
  const correct = Number(body.correct);
  if (!text) return { error: 'Savol matnini kiriting' };
  if (options.length !== 4 || options.some(function (o) { return !o; })) return { error: "To'rtala variantni to'ldiring" };
  if (!(correct >= 0 && correct <= 3)) return { error: "To'g'ri javobni belgilang" };

  const values = [[text].concat(options, [LETTERS[correct]]).map(safeCell)];
  if (body.row) {
    const stale = checkRow(sheet, body.row, body.original);
    if (stale) return stale;
    sheet.getRange(Number(body.row), 1, 1, 6).setValues(values);
  } else {
    if (sheet.getLastRow() === 0) sheet.appendRow(['Savol', 'A', 'B', 'C', 'D', "To'g'ri javob"]);
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, 6).setValues(values);
  }
  return { ok: true };
}

function deleteQuestion(body) {
  const sheet = findQuestionSheet(body.sheet);
  if (!sheet) return { error: "Bo'lim topilmadi" };
  const stale = checkRow(sheet, body.row, body.original);
  if (stale) return stale;
  sheet.deleteRow(Number(body.row));
  return { ok: true };
}

// Panel ochilgandan beri jadvalda shu qator o'zgarmaganini tekshiradi
function checkRow(sheet, row, original) {
  const n = Number(row);
  if (!(n >= 2 && n <= sheet.getLastRow())) return { error: "Savol topilmadi. Ro'yxatni yangilang." };
  if (String(sheet.getRange(n, 1).getDisplayValue()).trim() !== String(original == null ? '' : original).trim()) {
    return { error: "Savol jadvalda o'zgargan. Ro'yxatni yangilang." };
  }
  return null;
}

function addQuestionSheet(name) {
  const title = clean(name);
  if (!title) return { error: "Bo'lim nomini kiriting" };
  if (title.charAt(0) === '_' || title === RESULTS_SHEET || EXCLUDE_SHEETS.indexOf(title) !== -1) {
    return { error: "Bu nomdan foydalanib bo'lmaydi" };
  }
  const book = SpreadsheetApp.getActiveSpreadsheet();
  if (book.getSheetByName(title)) return { error: "Bunday nomli list allaqachon bor" };
  const sheet = book.insertSheet(title);
  sheet.appendRow(['Savol', 'A', 'B', 'C', 'D', "To'g'ri javob"]);
  sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
  sheet.setFrozenRows(1);
  return { ok: true };
}

function adminResults() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RESULTS_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return { header: RESULT_HEADER, rows: [] };
  const values = sheet.getRange(1, 1, sheet.getLastRow(), RESULT_HEADER.length).getDisplayValues();
  return { header: values[0], rows: values.slice(1) };
}

// "=" yoki "+" bilan boshlangan matn formula sifatida bajarilmasligi uchun
function safeCell(value) {
  return typeof value === 'string' && /^[=+]/.test(value) ? "'" + value : value;
}

function cleanText(value, max) {
  return String(value == null ? '' : value).replace(/\r\n?/g, '\n').trim().slice(0, max);
}

/** Bir marta qo'lda ishga tushiriladi: forma javobi kelganda onFormSubmit chaqiriladigan qiladi. */
function setupFormTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'onFormSubmit') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('onFormSubmit').forSpreadsheet(SpreadsheetApp.getActive()).onFormSubmit().create();
}

/** Forma javobini savollar listlari bo'yicha baholab, "Natijalar" listiga yozadi. */
function onFormSubmit(e) {
  const bank = {};
  loadQuestions().forEach(function (q) {
    if (!bank[norm(q.text)]) bank[norm(q.text)] = q;
  });

  const stats = {};
  const order = [];
  let fullName = '';
  let direction = '';
  let region = '';
  let correct = 0;
  let total = 0;

  Object.keys(e.namedValues).forEach(function (title) {
    const answer = String(e.namedValues[title][0] || '').trim();
    const key = norm(title);
    const question = bank[key];

    if (!question) {
      if (!region && hasWord(key, REGION_WORDS)) region = answer;
      else if (!direction && hasWord(key, DIRECTION_WORDS)) direction = answer;
      else if (!fullName && hasWord(key, NAME_WORDS)) fullName = answer;
      return;
    }
    if (!stats[question.section]) {
      stats[question.section] = { section: question.section, correct: 0, total: 0 };
      order.push(question.section);
    }
    stats[question.section].total++;
    total++;
    if (norm(answer) === norm(question.correct)) {
      stats[question.section].correct++;
      correct++;
    }
  });

  appendResult([
    now(),
    region,
    fullName,
    direction,
    correct,
    total,
    total ? Math.round((correct / total) * 100) : '',
    sectionSummary(order.map(function (name) { return stats[name]; })),
    '',
    'Google Forms',
  ]);
}

function questionSheets() {
  const skipped = [RESULTS_SHEET].concat(EXCLUDE_SHEETS);
  return SpreadsheetApp.getActiveSpreadsheet()
    .getSheets()
    .filter(function (sheet) {
      const name = sheet.getName();
      return name.charAt(0) !== '_' && skipped.indexOf(name) === -1 && !sheet.getFormUrl();
    });
}

// Ustunlar: Savol | A | B | C | D | To'g'ri javob (1-qator — sarlavha)
// `correct` — to'g'ri variantning matni
function loadQuestions() {
  const list = [];
  questionSheets().forEach(function (sheet) {
    const name = sheet.getName();
    sheet.getDataRange().getDisplayValues().forEach(function (row, i) {
      if (i === 0) return;
      const text = String(row[0]).trim();
      const options = row.slice(1, 5).map(function (o) { return String(o).trim(); });
      const correct = resolveAnswer(row[5], options);
      if (!text || correct === null || options.some(function (o) { return !o; })) return;
      list.push({ id: name + '#' + (i + 1), section: name, text: text, options: options, correct: correct });
    });
  });
  return list;
}

// To'g'ri javob: variant matni, A/B/C/D harfi yoki 1-4 raqami bo'lishi mumkin
function resolveAnswer(raw, options) {
  const value = norm(raw);
  if (!value) return null;
  for (let i = 0; i < options.length; i++) {
    if (norm(options[i]) === value) return options[i];
  }
  const index = { a: 0, b: 1, c: 2, d: 3, 'а': 0, 'в': 1, 'с': 2, 1: 0, 2: 1, 3: 2, 4: 3 }[value.replace(/[).]$/, '')];
  return typeof index !== 'number' || !options[index] ? null : options[index];
}

function appendResult(row) {
  // Bir vaqtda kelgan natijalar bir-birini bosib ketmasligi uchun
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const book = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = book.getSheetByName(RESULTS_SHEET);
    if (sheet && sheet.getLastRow() > 0) {
      // Ustunlari eski tartibdagi list saqlab qo'yiladi, natijalar yangisiga yoziladi
      const header = sheet.getRange(1, 1, 1, RESULT_HEADER.length).getDisplayValues()[0];
      if (header.join('|') !== RESULT_HEADER.join('|')) {
        sheet.setName('_' + RESULTS_SHEET + ' eski ' + Utilities.formatDate(new Date(), 'Asia/Tashkent', 'yyyy-MM-dd HH.mm.ss'));
        sheet = null;
      }
    }
    if (!sheet) {
      sheet = book.insertSheet(RESULTS_SHEET);
      sheet.appendRow(RESULT_HEADER);
      sheet.setFrozenRows(1);
    } else if (sheet.getLastRow() === 0) {
      sheet.appendRow(RESULT_HEADER);
    }
    sheet.appendRow(row);
  } finally {
    lock.releaseLock();
  }
}

function sectionSummary(sections) {
  return sections.map(function (s) { return s.section + ': ' + s.correct + '/' + s.total; }).join('; ');
}

function now() {
  return Utilities.formatDate(new Date(), 'Asia/Tashkent', 'dd.MM.yyyy, HH:mm:ss');
}

function shuffle(items) {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

function clean(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, 120);
}

function norm(value) {
  return String(value == null ? '' : value).trim().toLowerCase().replace(/\s+/g, ' ');
}

function hasWord(text, words) {
  return words.some(function (word) { return text.indexOf(word) !== -1; });
}

function json(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
