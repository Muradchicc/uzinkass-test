/**
 * Uzinkass test — Google Sheets ko'prigi.
 * O'rnatish: jadvalda Extensions → Apps Script → shu kodni Code.gs ga, Token.gs ni alohida
 * faylga joylang → Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone.
 * Chiqqan /exec havolasini server/.env dagi APPS_SCRIPT_URL ga yozing.
 *
 * Ikki xil mijoz ishlatadi:
 *  - lokal server (token bilan): action=questions, action=result
 *  - internetdagi sahifa (GitHub Pages, tokensiz): action=start, action=submit
 *
 * Google Forms javoblari ham "Natijalar" listiga tushishi uchun formani shu jadvalga
 * bog'lang va setupFormTrigger funksiyasini bir marta ishga tushiring.
 */

// TOKEN alohida Token.gs faylida turadi (u GitHub'ga yuklanmaydi):
//   const TOKEN = '...';   — server/.env dagi APPS_SCRIPT_TOKEN bilan bir xil

// Barcha natijalar yoziladigan list
const RESULTS_SHEET = 'Natijalar';

// Internetdagi sahifa uchun bitta testdagi savollar soni
const QUESTION_COUNT = 10;

// Savollar olinmaydigan qo'shimcha listlar. Google Forms javoblari listi va
// "_" bilan boshlanadigan listlar avtomatik o'tkazib yuboriladi.
const EXCLUDE_SHEETS = ['Umumiy'];

const RESULT_HEADER = [
  'Sana va vaqt', 'F.I.SH', 'Lavozim', "To'g'ri javoblar", 'Jami savollar',
  'Foiz (%)', "Bo'limlar bo'yicha", 'Davomiyligi', 'Manba',
];

// Formadagi F.I.SH va lavozim savollari sarlavhasida shu so'zlardan biri bo'lishi kerak
const NAME_WORDS = ['f.i.sh', 'f.i.o', 'fish', 'fio', 'ism', 'фио', 'ф.и.о', 'ф.и.ш'];
const POSITION_WORDS = ['lavozim', 'должность', 'лавозим'];

function doGet(e) {
  const action = e.parameter.action;
  if (action === 'start') return json(startTest());

  if (e.parameter.token !== TOKEN) return json({ error: "Token noto'g'ri" });
  if (action !== 'questions') return json({ error: "Noma'lum amal" });

  const sections = questionSheets().map(function (sheet) {
    return { title: sheet.getName(), rows: sheet.getDataRange().getDisplayValues() };
  });
  return json({ sections: sections });
}

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  if (body.action === 'submit') return json(submitTest(body));

  if (body.token !== TOKEN) return json({ error: "Token noto'g'ri" });
  if (body.action !== 'result' || !Array.isArray(body.row)) return json({ error: "Noma'lum amal" });

  appendResult(body.row);
  return json({ ok: true });
}

/** Bo'limlardan navbatma-navbat bittadan olib, jami QUESTION_COUNT ta savol beradi (to'g'ri javoblarsiz). */
function startTest() {
  const pools = {};
  const names = [];
  shuffle(loadQuestions()).forEach(function (q) {
    if (!pools[q.section]) {
      pools[q.section] = [];
      names.push(q.section);
    }
    pools[q.section].push(q);
  });
  if (!names.length) return { error: 'Savollar topilmadi' };

  const picked = [];
  let found = true;
  while (picked.length < QUESTION_COUNT && found) {
    found = false;
    shuffle(names).forEach(function (name) {
      if (picked.length >= QUESTION_COUNT || !pools[name].length) return;
      picked.push(pools[name].pop());
      found = true;
    });
  }

  return {
    questions: shuffle(picked).map(function (q) {
      return { id: q.id, section: q.section, text: q.text, options: shuffle(q.options) };
    }),
  };
}

/** Internetdagi sahifadan kelgan javoblarni baholab, "Natijalar" listiga yozadi. */
function submitTest(body) {
  const fullName = clean(body.fullName);
  const position = clean(body.position);
  if (fullName.length < 3 || !position) return { error: 'F.I.SH va lavozimni kiriting' };

  const byId = {};
  loadQuestions().forEach(function (q) { byId[q.id] = q; });

  const stats = {};
  const order = [];
  const mistakes = [];
  const seen = {};
  let correct = 0;
  let total = 0;

  (Array.isArray(body.answers) ? body.answers : []).slice(0, QUESTION_COUNT).forEach(function (item) {
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
      mistakes.push({
        number: total,
        section: q.section,
        text: q.text,
        yourAnswer: item.answer ? clean(item.answer) : null,
        correctAnswer: q.correct,
      });
    }
  });
  if (!total) return { error: 'Javoblar topilmadi. Testni qaytadan boshlang.' };

  const sections = order.map(function (name) { return stats[name]; });
  const percent = Math.round((correct / total) * 100);
  const seconds = Math.max(0, Math.round(Number(body.seconds) || 0));

  appendResult([
    now(),
    fullName,
    position,
    correct,
    total,
    percent,
    sectionSummary(sections),
    Math.floor(seconds / 60) + ' daq ' + (seconds % 60) + ' son',
    'Internet',
  ]);

  return {
    fullName: fullName, position: position, correct: correct, total: total,
    percent: percent, sections: sections, mistakes: mistakes,
  };
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
  let position = '';
  let correct = 0;
  let total = 0;

  Object.keys(e.namedValues).forEach(function (title) {
    const answer = String(e.namedValues[title][0] || '').trim();
    const key = norm(title);
    const question = bank[key];

    if (!question) {
      if (!fullName && hasWord(key, NAME_WORDS)) fullName = answer;
      else if (!position && hasWord(key, POSITION_WORDS)) position = answer;
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
    fullName,
    position,
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
    if (!sheet) {
      sheet = book.insertSheet(RESULTS_SHEET);
      sheet.appendRow(RESULT_HEADER);
      sheet.setFrozenRows(1);
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
