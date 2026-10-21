import { createContext, useContext } from 'react';

// Interfeys matnlari ikki yozuvda; jadvaldan keladigan matnlar (savollar, hududlar, yo'nalishlar)
// esa tanlangan yozuvga avtomatik o'giriladi
export const SCRIPTS = { lat: 'Lotin', cyr: 'Кирил' };

const TEXTS = {
  lat: {
    brandSub: 'Xodimlar test sinovi',
    title: 'Bilimni sinash testi',
    lead: "Testni boshlash uchun ma'lumotlaringizni to'liq kiriting.",
    region: 'Hudud',
    chooseRegion: 'Hududni tanlang',
    loading: 'Yuklanmoqda…',
    lastName: 'Familiya',
    lastNameHint: 'Familiyangiz',
    firstName: 'Ism',
    firstNameHint: 'Ismingiz',
    middleName: 'Sharif',
    middleNameHint: 'Otangizning ismi',
    direction: "Yo'nalish",
    chooseDirection: "Yo'nalishni tanlang",
    noDirections: "Hozircha ochiq test yoki so'rovnoma yo'q.",
    ruleOne: "Har bir savolda bitta to'g'ri javob bor.",
    ruleTime: (m) => `Har bir savolga ${m} daqiqa hisobidan umumiy vaqt beriladi.`,
    ruleExpire: 'Vaqt tugasa test yakunlanadi, javobsiz savollar xato hisoblanadi.',
    ruleNoBack: "Oldingi savolga qaytib, javobni o'zgartirib bo'lmaydi.",
    start: 'Testni boshlash',
    retry: 'Qayta urinish',
    question: 'Savol',
    timeLeft: 'Qolgan vaqt',
    answerOptions: 'Javob variantlari',
    timeUp: 'Vaqt tugadi. Javoblaringiz yuborilmoqda.',
    resend: 'Qayta yuborish',
    sending: 'Yuborilmoqda…',
    finish: 'Yakunlash',
    next: 'Keyingi savol',
    result: 'natija',
    done: 'Test yakunlandi',
    correctAnswers: "to'g'ri javob",
    bySection: "Bo'limlar bo'yicha",
    mistakes: 'Xato javoblar',
    yourAnswer: 'Sizning javobingiz:',
    noAnswer: 'javob berilmagan',
    allRight: "Barcha savollarga to'g'ri javob berdingiz.",
    home: 'Bosh sahifaga qaytish',
    surveyTag: "so'rovnoma",
    startSurvey: "So'rovnomani boshlash",
    surveyRuleAll: "So'rovnomada to'g'ri yoki noto'g'ri javob yo'q — o'z fikringizni belgilang.",
    surveyRuleNoTime: 'Vaqt cheklanmagan.',
    answerPlaceholder: 'Javobingizni yozing',
    surveyDone: "So'rovnoma yakunlandi",
    surveyThanks: (n) => `Rahmat! ${n} ta savolga javobingiz qabul qilindi.`,
  },
  cyr: {
    brandSub: 'Ходимлар тест синови',
    title: 'Билимни синаш тести',
    lead: 'Тестни бошлаш учун маълумотларингизни тўлиқ киритинг.',
    region: 'Ҳудуд',
    chooseRegion: 'Ҳудудни танланг',
    loading: 'Юкланмоқда…',
    lastName: 'Фамилия',
    lastNameHint: 'Фамилиянгиз',
    firstName: 'Исм',
    firstNameHint: 'Исмингиз',
    middleName: 'Шариф',
    middleNameHint: 'Отангизнинг исми',
    direction: 'Йўналиш',
    chooseDirection: 'Йўналишни танланг',
    noDirections: 'Ҳозирча очиқ тест ёки сўровнома йўқ.',
    ruleOne: 'Ҳар бир саволда битта тўғри жавоб бор.',
    ruleTime: (m) => `Ҳар бир саволга ${m} дақиқа ҳисобидан умумий вақт берилади.`,
    ruleExpire: 'Вақт тугаса тест якунланади, жавобсиз саволлар хато ҳисобланади.',
    ruleNoBack: 'Олдинги саволга қайтиб, жавобни ўзгартириб бўлмайди.',
    start: 'Тестни бошлаш',
    retry: 'Қайта уриниш',
    question: 'Савол',
    timeLeft: 'Қолган вақт',
    answerOptions: 'Жавоб вариантлари',
    timeUp: 'Вақт тугади. Жавобларингиз юборилмоқда.',
    resend: 'Қайта юбориш',
    sending: 'Юборилмоқда…',
    finish: 'Якунлаш',
    next: 'Кейинги савол',
    result: 'натижа',
    done: 'Тест якунланди',
    correctAnswers: 'тўғри жавоб',
    bySection: 'Бўлимлар бўйича',
    mistakes: 'Хато жавоблар',
    yourAnswer: 'Сизнинг жавобингиз:',
    noAnswer: 'жавоб берилмаган',
    allRight: 'Барча саволларга тўғри жавоб бердингиз.',
    home: 'Бош саҳифага қайтиш',
    surveyTag: 'сўровнома',
    startSurvey: 'Сўровномани бошлаш',
    surveyRuleAll: 'Сўровномада тўғри ёки нотўғри жавоб йўқ — ўз фикрингизни белгиланг.',
    surveyRuleNoTime: 'Вақт чекланмаган.',
    answerPlaceholder: 'Жавобингизни ёзинг',
    surveyDone: 'Сўровнома якунланди',
    surveyThanks: (n) => `Раҳмат! ${n} та саволга жавобингиз қабул қилинди.`,
  },
};

// --- Lotin → Kirill ---

const APOS = "'ʻʼ‘’`";
const LAT_VOWELS = 'aeiouAEIOU';

const LAT_SINGLE = {
  a: 'а', b: 'б', c: 'ц', d: 'д', e: 'е', f: 'ф', g: 'г', h: 'ҳ', i: 'и', j: 'ж', k: 'к', l: 'л', m: 'м',
  n: 'н', o: 'о', p: 'п', q: 'қ', r: 'р', s: 'с', t: 'т', u: 'у', v: 'в', w: 'в', x: 'х', y: 'й', z: 'з',
};

const LAT_PAIRS = { sh: 'ш', ch: 'ч', yo: 'ё', yu: 'ю', ya: 'я', ye: 'е' };

function matchCase(source, target) {
  if (source === source.toLowerCase()) return target;
  return target.toUpperCase();
}

function toCyrillic(text) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const lower = ch.toLowerCase();
    const nextCh = text[i + 1] ?? '';
    const prev = text[i - 1] ?? '';

    // o' va g' — ў, ғ
    if ((lower === 'o' || lower === 'g') && nextCh && APOS.includes(nextCh)) {
      out += matchCase(ch, lower === 'o' ? 'ў' : 'ғ');
      i++;
      continue;
    }
    // Harfdan keyingi tutuq belgisi — ъ
    if (APOS.includes(ch) && /\p{L}/u.test(prev) && /\p{L}/u.test(nextCh)) {
      out += 'ъ';
      continue;
    }
    // yo' — й + ў, ё emas
    const afterPair = text[i + 2];
    const pair = afterPair && APOS.includes(afterPair) ? null : LAT_PAIRS[(ch + nextCh).toLowerCase()];
    if (pair) {
      out += matchCase(ch, pair);
      i++;
      continue;
    }
    // So'z boshida va unlidan keyin e — э
    if (lower === 'e') {
      const wordStart = !/\p{L}/u.test(prev);
      out += matchCase(ch, wordStart || LAT_VOWELS.includes(prev) ? 'э' : 'е');
      continue;
    }
    const single = LAT_SINGLE[lower];
    out += single ? matchCase(ch, single) : ch;
  }
  return out;
}

// --- Kirill → Lotin ---

const CYR_SINGLE = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l',
  м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 'ts', ч: 'ch',
  ш: 'sh', щ: 'sh', ъ: "'", ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: "o'", қ: 'q', ғ: "g'", ҳ: 'h',
};
const CYR_VOWELS = 'аеёиоуўэюяъь';

function toLatin(text) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const lower = ch.toLowerCase();
    const prev = (text[i - 1] ?? '').toLowerCase();
    let lat;
    if (lower === 'е') {
      // So'z boshida va unlidan keyin е — ye
      lat = !/\p{L}/u.test(prev) || CYR_VOWELS.includes(prev) ? 'ye' : 'e';
    } else {
      lat = CYR_SINGLE[lower];
    }
    if (lat === undefined) {
      out += ch;
    } else if (ch === lower || !lat) {
      out += lat;
    } else {
      // Bosh harf: so'z bosh harf bilan yozilgan bo'lsa (ШАҲАР) to'liq, aks holda faqat birinchisi (Шаҳар)
      const nextCh = text[i + 1] ?? '';
      const allCaps = nextCh && nextCh !== nextCh.toLowerCase();
      out += allCaps ? lat.toUpperCase() : lat[0].toUpperCase() + lat.slice(1);
    }
  }
  return out;
}

export function transliterate(text, script) {
  if (text === null || text === undefined) return text;
  const str = String(text);
  return script === 'cyr' ? toCyrillic(str) : toLatin(str);
}

export function makeTranslator(script) {
  const texts = TEXTS[script];
  const t = (key, ...args) => {
    const value = texts[key];
    return typeof value === 'function' ? value(...args) : value;
  };
  // Jadval va serverdan kelgan matnni tanlangan yozuvga o'girish
  t.tr = (text) => transliterate(text, script);
  // Admin paneldan kiritilgan matn: shu yozuvdagisi, bo'lmasa ikkinchi yozuvdagisi o'girilib; yo'q bo'lsa null
  t.custom = (texts, key) => {
    const own = texts?.[script]?.[key];
    if (own) return own;
    const other = texts?.[script === 'cyr' ? 'lat' : 'cyr']?.[key];
    return other ? t.tr(other) : null;
  };
  t.customRules = (texts, minutes) => {
    const raw = t.custom(texts, 'rules');
    if (!raw) return null;
    const rules = raw
      .split('\n')
      .map((line) => line.trim().replace(/\{(daqiqa|дақиқа)\}/gi, minutes))
      .filter(Boolean);
    return rules.length ? rules : null;
  };
  return t;
}

export const LangContext = createContext(makeTranslator('lat'));
export const useT = () => useContext(LangContext);
