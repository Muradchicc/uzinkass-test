import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminCall } from '../api.js';
import { LangContext, makeTranslator, transliterate, useT } from '../i18n.js';
import { ErrorMessage, Icon, LangSwitch, useScript } from '../common.jsx';
import logoMark from '../assets/logo-mark.png';

// Panel matnlari lotinda yoziladi va kirill rejimida avtomatik o'giriladi (t.tr)

const CREDS_KEY = 'uzinkass-admin';
const LETTERS = ['A', 'B', 'C', 'D'];

function savedCreds() {
  try {
    return JSON.parse(sessionStorage.getItem(CREDS_KEY));
  } catch {
    return null;
  }
}

function storeCreds(creds) {
  try {
    if (creds) sessionStorage.setItem(CREDS_KEY, JSON.stringify(creds));
    else sessionStorage.removeItem(CREDS_KEY);
  } catch {
    // Brauzer xotirasi yopiq bo'lsa sahifa yangilanganda qayta kirish kerak bo'ladi
  }
}

// Bitta amal natijasini yuklaydi: { data, setData, error, loading, reload }
// params — amalga qo'shimcha qiymatlar (masalan { kind: 'survey' }); o'zgarsa qayta yuklanadi
function useAdminData(call, op, params) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const paramsKey = JSON.stringify(params ?? {});

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await call(op, JSON.parse(paramsKey)));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [call, op, paramsKey]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, setData, error, loading, reload };
}

function Spinner({ dark }) {
  return <span className={`spinner${dark ? ' dark' : ''}`} aria-hidden="true" />;
}

function Loading() {
  const t = useT();
  return (
    <p className="admin-loading">
      <Spinner dark /> {t.tr('Yuklanmoqda…')}
    </p>
  );
}

function SaveButton({ busy, children, ...props }) {
  const t = useT();
  return (
    <button className="btn primary" disabled={busy} {...props}>
      {busy ? <Spinner /> : <Icon name="check" size={18} />}
      {busy ? t.tr('Saqlanmoqda…') : children}
    </button>
  );
}

function Saved({ show }) {
  const t = useT();
  if (!show) return null;
  return (
    <span className="saved" role="status">
      <Icon name="check" size={16} /> {t.tr('Saqlandi')}
    </span>
  );
}

// Saqlash amali uchun umumiy holat: busy, error, saved
function useSaver() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function run(action) {
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const result = await action();
      setSaved(true);
      return result;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, saved, run, setSaved, setError };
}

// --- Kirish ---

function LoginScreen({ onLogin }) {
  const t = useT();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');
    const creds = { login: login.trim(), password };
    try {
      await adminCall('login', creds);
      onLogin(creds);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <form className="card login-card" onSubmit={handleSubmit}>
      <h1>{t.tr('Admin panel')}</h1>
      <p className="lead">{t.tr('Sozlamalarni o\'zgartirish uchun login va parolni kiriting.')}</p>
      <div className="field">
        <label htmlFor="login">{t.tr('Login')}</label>
        <input id="login" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" required />
      </div>
      <div className="field">
        <label htmlFor="password">{t.tr('Parol')}</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </div>
      <ErrorMessage>{error}</ErrorMessage>
      <button className="btn primary block" disabled={loading || !login.trim() || !password}>
        {loading ? <Spinner /> : null}
        {loading ? t.tr('Tekshirilmoqda…') : t.tr('Kirish')}
        {loading ? null : <Icon name="arrowRight" />}
      </button>
    </form>
  );
}

// --- Sozlamalar ---

const DIRECTION_TYPES = [
  ['test', 'Test'],
  ['survey', "So'rovnoma"],
];

// Ro'yxat elementlari qayta tartiblanganda React ularni adashtirmasligi uchun doimiy kalit
let nextKey = 0;
const withKey = (item) => ({ ...item, key: ++nextKey });

function toForm(data) {
  return {
    questionCount: String(data.questionCount),
    secondsPerQuestion: String(data.secondsPerQuestion),
    regions: data.regions.map((value) => withKey({ value })),
    directions: data.directions.map((d) =>
      withKey({
        name: d.name,
        sheets: d.sheets,
        type: d.type === 'survey' ? 'survey' : 'test',
        region: d.region !== false,
        visible: d.visible !== false,
      }),
    ),
  };
}

// Elementni bir pog'ona yuqoriga (-1) yoki pastga (+1) suradi
function move(list, index, step) {
  const target = index + step;
  if (target < 0 || target >= list.length) return list;
  const copy = [...list];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}

// Katta-kichik harf farqlanmaydi: "Toshkent shahri" va "toshkent shahri" — bitta nom
function findDuplicate(names) {
  const seen = new Set();
  for (const name of names) {
    const key = name.trim().toLowerCase();
    if (seen.has(key)) return name;
    seen.add(key);
  }
  return null;
}

function MoveButtons({ index, count, onMove }) {
  const t = useT();
  return (
    <>
      <button
        type="button"
        className="btn icon-btn"
        disabled={index === 0}
        onClick={() => onMove(-1)}
        aria-label={t.tr('Yuqoriga')}
        title={t.tr('Yuqoriga')}
      >
        <Icon name="arrowUp" size={18} />
      </button>
      <button
        type="button"
        className="btn icon-btn"
        disabled={index === count - 1}
        onClick={() => onMove(1)}
        aria-label={t.tr('Pastga')}
        title={t.tr('Pastga')}
      >
        <Icon name="arrowDown" size={18} />
      </button>
    </>
  );
}

// Yangi qiymat kiritish qatori. Sozlamalar formasi ichida turadi, shuning uchun Enter formani
// yubormasdan qiymatni qo'shadi
function AddRow({ placeholder, label, onAdd, maxLength = 120, busy = false }) {
  const t = useT();
  const [value, setValue] = useState('');

  async function add() {
    const name = value.trim();
    if (!name || busy) return;
    if ((await onAdd(name)) !== false) setValue('');
  }

  return (
    <div className="inline add-row">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add();
          }
        }}
        placeholder={t.tr(placeholder)}
        aria-label={t.tr(placeholder)}
        maxLength={maxLength}
      />
      <button type="button" className="btn" disabled={!value.trim() || busy} onClick={add}>
        {busy ? <Spinner dark /> : <Icon name="plus" size={18} />}
        {t.tr(label)}
      </button>
    </div>
  );
}

// Bo'limlar (savollar listlari) bilan amallar darhol jadvalda bajariladi
function SectionsCard({ data, call, onChanged }) {
  const t = useT();
  const [editing, setEditing] = useState(null);
  const [confirming, setConfirming] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function run(key, op, payload, rename) {
    setBusy(key);
    setError('');
    try {
      onChanged(await call(op, payload), rename);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy('');
    }
  }

  async function rename(event) {
    event?.preventDefault();
    const to = editing.value.trim();
    if (!to || to === editing.name) {
      setEditing(null);
      return;
    }
    if (await run(`rename:${editing.name}`, 'renameSheet', { name: editing.name, newName: to }, { from: editing.name, to })) {
      setEditing(null);
    }
  }

  return (
    <section className="card admin-section">
      <h2>
        {t.tr("Bo'limlar")} <span className="count">{data.sheets.length}</span>
      </h2>
      <p className="hint">
        {t.tr(
          "Har bir bo'lim — jadvaldagi alohida list. O'zgarishlar darhol saqlanadi. O'chirilgan bo'lim arxivga o'tadi: savollari jadvalda qoladi va uni qaytarish mumkin.",
        )}
      </p>
      <ul className="rows">
        {data.sheets.map((sheet) => (
          <li key={sheet.name} className="row-edit">
            {editing?.name === sheet.name ? (
              <>
                <input
                  aria-label={t.tr("Bo'limning yangi nomi")}
                  value={editing.value}
                  maxLength={60}
                  autoFocus
                  onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') rename(e);
                    if (e.key === 'Escape') setEditing(null);
                  }}
                />
                <button
                  type="button"
                  className="btn primary"
                  disabled={!editing.value.trim() || Boolean(busy)}
                  onClick={rename}
                >
                  {busy ? <Spinner /> : <Icon name="check" size={18} />} {t.tr('Saqlash')}
                </button>
                <button type="button" className="btn" disabled={Boolean(busy)} onClick={() => setEditing(null)}>
                  {t.tr('Bekor qilish')}
                </button>
              </>
            ) : confirming === sheet.name ? (
              <>
                <span className="row-name">
                  <span className="confirm-text">
                    {t.tr(`"${sheet.name}" arxivga o'tkazilsinmi?`)}
                  </span>
                </span>
                <button
                  type="button"
                  className="btn danger"
                  disabled={Boolean(busy)}
                  onClick={async () => {
                    if (await run(`archive:${sheet.name}`, 'archiveSheet', { name: sheet.name })) setConfirming('');
                  }}
                >
                  {busy ? <Spinner /> : <Icon name="archive" size={18} />} {t.tr('Ha, arxivga')}
                </button>
                <button type="button" className="btn" disabled={Boolean(busy)} onClick={() => setConfirming('')}>
                  {t.tr("Yo'q")}
                </button>
              </>
            ) : (
              <>
                <span className="row-name">
                  {t.tr(sheet.name)} <em>· {sheet.questions} {t.tr('ta savol')}</em>
                </span>
                <button
                  type="button"
                  className="btn icon-btn"
                  aria-label={t.tr('Qayta nomlash')}
                  title={t.tr('Qayta nomlash')}
                  disabled={Boolean(busy)}
                  onClick={() => {
                    setConfirming('');
                    setEditing({ name: sheet.name, value: sheet.name });
                  }}
                >
                  <Icon name="edit" size={18} />
                </button>
                <button
                  type="button"
                  className="btn icon-btn"
                  aria-label={t.tr("Arxivga o'tkazish")}
                  title={t.tr("Arxivga o'tkazish")}
                  disabled={Boolean(busy)}
                  onClick={() => {
                    setEditing(null);
                    setConfirming(sheet.name);
                  }}
                >
                  <Icon name="archive" size={18} />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      <AddRow
        placeholder="Yangi bo'lim nomi"
        label="Bo'lim qo'shish"
        maxLength={60}
        busy={busy === 'add'}
        onAdd={(name) => run('add', 'addSheet', { name })}
      />
      <ErrorMessage>{error}</ErrorMessage>

      {data.archived?.length ? (
        <>
          <h3 className="sub-heading">{t.tr('Arxiv')}</h3>
          <ul className="rows">
            {data.archived.map((sheet) => (
              <li key={sheet.name} className="row-edit archived">
                <span className="row-name">
                  {t.tr(sheet.title)} <em>· {sheet.questions} {t.tr('ta savol')}</em>
                </span>
                <button
                  type="button"
                  className="btn"
                  disabled={Boolean(busy)}
                  onClick={() => run(`restore:${sheet.name}`, 'restoreSheet', { name: sheet.name })}
                >
                  {busy === `restore:${sheet.name}` ? <Spinner dark /> : <Icon name="undo" size={18} />}{' '}
                  {t.tr('Qaytarish')}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

function SettingsTab({ call }) {
  const t = useT();
  const { data, setData, error, loading } = useAdminData(call, 'settings');
  const [form, setForm] = useState(null);
  const saver = useSaver();

  // Forma bir marta to'ldiriladi; bo'limlar bilan amallar saqlanmagan o'zgarishlarni o'chirmasligi kerak
  useEffect(() => {
    if (data && !form) setForm(toForm(data));
  }, [data, form]);

  if (loading && !form) return <Loading />;
  if (!form) return <ErrorMessage>{error}</ErrorMessage>;

  const update = (patch) => {
    saver.setSaved(false);
    setForm((prev) => ({ ...prev, ...patch }));
  };
  const updateRegion = (index, value) =>
    update({ regions: form.regions.map((r, i) => (i === index ? { ...r, value } : r)) });
  const updateDirection = (index, patch) =>
    update({ directions: form.directions.map((d, i) => (i === index ? { ...d, ...patch } : d)) });
  const toggleSheet = (index, sheet) => {
    const current = form.directions[index].sheets;
    updateDirection(index, {
      sheets: current.includes(sheet) ? current.filter((s) => s !== sheet) : [...current, sheet],
    });
  };

  // Bo'lim qayta nomlansa, saqlanmagan formadagi yo'nalishlar ham yangi nomga o'tadi
  function sectionsChanged(fresh, rename) {
    setData((prev) => ({ ...prev, sheets: fresh.sheets, archived: fresh.archived }));
    if (rename) {
      setForm((prev) => ({
        ...prev,
        directions: prev.directions.map((d) => ({
          ...d,
          sheets: d.sheets.map((s) => (s === rename.from ? rename.to : s)),
        })),
      }));
    }
  }

  // Jadvalda yo'q bo'lgan, lekin yo'nalishga yozilgan listlar ham ko'rsatiladi
  const sheetNames = [...new Set([...data.sheets.map((s) => s.name), ...form.directions.flatMap((d) => d.sheets)])];
  const questionsIn = Object.fromEntries(data.sheets.map((s) => [s.name, s.questions]));

  async function save(event) {
    event.preventDefault();
    const regions = form.regions.map((r) => r.value.trim()).filter(Boolean);
    const directions = form.directions
      .map(({ name, sheets, type, region, visible }) => ({ name: name.trim(), sheets, type, region, visible }))
      .filter((d) => d.name);
    const fresh = await saver.run(() => {
      const region = findDuplicate(regions);
      if (region) throw new Error(`Hudud takrorlangan: ${region}`);
      const direction = findDuplicate(directions.map((d) => d.name));
      if (direction) throw new Error(`Yo'nalish takrorlangan: ${direction}`);
      const survey = directions.find((d) => d.type === 'survey' && !d.sheets.length);
      if (survey) throw new Error(`"${survey.name}" so'rovnomasi uchun kamida bitta bo'limni belgilang`);
      return call('saveSettings', {
        settings: {
          questionCount: form.questionCount,
          secondsPerQuestion: form.secondsPerQuestion,
          regions,
          directions,
          texts: data.texts,
        },
      });
    });
    if (fresh) {
      setData(fresh);
      setForm(toForm(fresh));
    }
  }

  return (
    <form onSubmit={save}>
      <section className="card admin-section">
        <h2>{t.tr('Test parametrlari')}</h2>
        <p className="hint">
          {t.tr(
            "Savollar soni va vaqt faqat «Test» turidagi yo'nalishlarga tegishli. So'rovnomada belgilangan bo'limlarning barcha savollari vaqt cheklovisiz beriladi.",
          )}
        </p>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="questionCount">{t.tr('Savollar soni')}</label>
            <input
              id="questionCount"
              type="number"
              min="1"
              max="200"
              value={form.questionCount}
              onChange={(e) => update({ questionCount: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="secondsPerQuestion">{t.tr('Bir savolga vaqt (soniya)')}</label>
            <input
              id="secondsPerQuestion"
              type="number"
              min="5"
              max="3600"
              value={form.secondsPerQuestion}
              onChange={(e) => update({ secondsPerQuestion: e.target.value })}
              required
            />
          </div>
        </div>
        <p className="hint">
          {t.tr('Umumiy vaqt')}:{' '}
          {Math.round((Number(form.questionCount) * Number(form.secondsPerQuestion)) / 6) / 10 || 0}{' '}
          {t.tr('daqiqa')}
        </p>
      </section>

      <section className="card admin-section">
        <h2>
          {t.tr('Hududlar')} <span className="count">{form.regions.length}</span>
        </h2>
        <ul className="rows">
          {form.regions.map((region, index) => (
            <li key={region.key} className="row-edit">
              <input
                aria-label={`${t.tr('Hudud')} ${index + 1}`}
                value={region.value}
                maxLength={120}
                onChange={(e) => updateRegion(index, e.target.value)}
              />
              <MoveButtons
                index={index}
                count={form.regions.length}
                onMove={(step) => update({ regions: move(form.regions, index, step) })}
              />
              <button
                type="button"
                className="btn icon-btn"
                aria-label={t.tr("Hududni o'chirish")}
                title={t.tr("Hududni o'chirish")}
                onClick={() => update({ regions: form.regions.filter((_, i) => i !== index) })}
              >
                <Icon name="trash" size={18} />
              </button>
            </li>
          ))}
        </ul>
        <AddRow
          placeholder="Yangi hudud nomi"
          label="Hudud qo'shish"
          onAdd={(value) => update({ regions: [...form.regions, withKey({ value })] })}
        />
      </section>

      <SectionsCard data={data} call={call} onChanged={sectionsChanged} />

      <section className="card admin-section">
        <h2>
          {t.tr("Yo'nalishlar")} <span className="count">{form.directions.length}</span>
        </h2>
        <p className="hint">
          {t.tr(
            "Har bir yo'nalishning turini tanlang va savol tushadigan bo'limlarni belgilang. Testda hech bir bo'lim belgilanmasa — barcha bo'limlardan savol tushadi; so'rovnomaga kamida bitta bo'lim belgilanadi. «Ko'rsatiladi» belgisi olib tashlansa, yo'nalish xodimning ro'yxatidan yashiriladi (savollari saqlanadi); faqat bittasi ko'rsatilsa, u avtomatik tanlanadi. «Hudud so'raladi» belgisi olib tashlansa, xodim hudud tanlamaydi va natijada hudud bo'sh qoladi.",
          )}
        </p>
        <ul className="directions">
          {form.directions.map((direction, index) => (
            <li
              key={direction.key}
              className={`direction${direction.type === 'survey' ? ' survey' : ''}${direction.visible ? '' : ' off'}`}
            >
              <div className="direction-head">
                <input
                  aria-label={t.tr("Yo'nalish nomi")}
                  placeholder={t.tr("Yo'nalish nomi")}
                  value={direction.name}
                  maxLength={120}
                  onChange={(e) => updateDirection(index, { name: e.target.value })}
                />
                <div className="segmented" role="group" aria-label={t.tr("Yo'nalish turi")}>
                  {DIRECTION_TYPES.map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={direction.type === value}
                      className={direction.type === value ? 'active' : ''}
                      onClick={() => updateDirection(index, { type: value })}
                    >
                      {t.tr(label)}
                    </button>
                  ))}
                </div>
                <label className={`chip flag-toggle${direction.visible ? ' on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={direction.visible}
                    onChange={(e) => updateDirection(index, { visible: e.target.checked })}
                  />
                  {t.tr("Ko'rsatiladi")}
                </label>
                <label className={`chip flag-toggle${direction.region ? ' on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={direction.region}
                    onChange={(e) => updateDirection(index, { region: e.target.checked })}
                  />
                  {t.tr("Hudud so'raladi")}
                </label>
                <MoveButtons
                  index={index}
                  count={form.directions.length}
                  onMove={(step) => update({ directions: move(form.directions, index, step) })}
                />
                <button
                  type="button"
                  className="btn icon-btn"
                  aria-label={t.tr("Yo'nalishni o'chirish")}
                  title={t.tr("Yo'nalishni o'chirish")}
                  onClick={() => update({ directions: form.directions.filter((_, i) => i !== index) })}
                >
                  <Icon name="trash" size={18} />
                </button>
              </div>
              {direction.type === 'survey' ? (
                <p className="hint direction-note">
                  {t.tr(
                    "So'rovnoma: belgilangan bo'limlarning barcha savollari tartib bilan beriladi, to'g'ri javob hisoblanmaydi. Javoblar «So'rovnoma javoblari» listiga yoziladi.",
                  )}
                </p>
              ) : null}
              <div className="chips">
                {sheetNames.map((sheet) => (
                  <label key={sheet} className={`chip${direction.sheets.includes(sheet) ? ' on' : ''}`}>
                    <input
                      type="checkbox"
                      checked={direction.sheets.includes(sheet)}
                      onChange={() => toggleSheet(index, sheet)}
                    />
                    {sheet}
                    {sheet in questionsIn ? null : <em> · {t.tr('jadvalda yo\'q')}</em>}
                  </label>
                ))}
              </div>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="btn"
          onClick={() => update({ directions: [...form.directions, withKey({ name: '', sheets: [], type: 'test', region: true, visible: true })] })}
        >
          <Icon name="plus" size={18} /> {t.tr("Yo'nalish qo'shish")}
        </button>
      </section>

      <div className="admin-actions">
        <ErrorMessage>{saver.error}</ErrorMessage>
        <Saved show={saver.saved} />
        <SaveButton busy={saver.busy}>{t.tr('Saqlash')}</SaveButton>
      </div>
    </form>
  );
}

// --- Savollar ---

const emptyQuestion = () => ({ text: '', options: ['', '', '', ''], correct: -1 });

function QuestionEditor({ sheet, initial, call, onDone, onCancel }) {
  const t = useT();
  const [q, setQ] = useState(initial);
  const saver = useSaver();
  const setOption = (i, value) => setQ((prev) => ({ ...prev, options: prev.options.map((o, j) => (j === i ? value : o)) }));
  const filled = q.options.filter((o) => o.trim()).length;
  const correctOk = q.correct < 0 || Boolean(q.options[q.correct]?.trim());
  const ready = q.text.trim() && filled !== 1 && correctOk;
  // Test uchun 4 ta variant va to'g'ri javob kerak; qolgan holatlarda savol faqat so'rovnomaga tushadi
  const kind =
    filled === 4 && q.correct >= 0
      ? "Testga ham, so'rovnomaga ham tushadi."
      : filled === 0
        ? "Faqat so'rovnoma uchun: xodim javobni o'zi yozadi."
        : filled === 1
          ? "Kamida ikkita variant kiriting yoki hammasini bo'sh qoldiring."
          : !correctOk
            ? "To'g'ri javob bo'sh variantda belgilangan."
            : "Faqat so'rovnoma uchun: testga 4 ta variant va to'g'ri javob kerak.";

  async function save(event) {
    event.preventDefault();
    const ok = await saver.run(() =>
      call('saveQuestion', {
        sheet,
        row: initial.row,
        original: initial.original,
        text: q.text,
        options: q.options,
        correct: q.correct,
      }),
    );
    if (ok) onDone();
  }

  return (
    <form className="card admin-section editor" onSubmit={save}>
      <h2>{initial.row ? `${t.tr('Savolni tahrirlash')} · #${initial.row}` : t.tr('Yangi savol')}</h2>
      <div className="field">
        <label htmlFor="q-text">{t.tr('Savol matni')}</label>
        <textarea id="q-text" rows={3} value={q.text} onChange={(e) => setQ({ ...q, text: e.target.value })} required />
      </div>
      <fieldset className="field">
        <legend>{t.tr('Variantlar')}</legend>
        <p className="hint">
          {t.tr(
            "Test savoli: to'rtala variant va to'g'ri javob. So'rovnoma savoli: 2–4 ta variant to'g'ri javobsiz yoki variantlarsiz (erkin javob).",
          )}
        </p>
        {q.options.map((option, i) => (
          <div key={i} className={`option-edit${q.correct === i ? ' correct' : ''}`}>
            <label className="option-radio" title={t.tr("To'g'ri javob")}>
              <input
                type="radio"
                name="correct"
                checked={q.correct === i}
                onChange={() => setQ({ ...q, correct: i })}
                aria-label={`${LETTERS[i]} — ${t.tr("to'g'ri javob")}`}
              />
              <span className="letter">{LETTERS[i]}</span>
            </label>
            <input
              aria-label={`${t.tr('Variant')} ${LETTERS[i]}`}
              value={option}
              onChange={(e) => setOption(i, e.target.value)}
            />
          </div>
        ))}
        <div className="editor-status">
          <span className={`hint${ready ? '' : ' bad'}`} role="status">
            {t.tr(kind)}
          </span>
          {q.correct >= 0 ? (
            <button type="button" className="btn small" onClick={() => setQ({ ...q, correct: -1 })}>
              {t.tr("To'g'ri javob belgisini olib tashlash")}
            </button>
          ) : null}
        </div>
      </fieldset>
      <ErrorMessage>{saver.error}</ErrorMessage>
      <div className="admin-actions">
        <button type="button" className="btn" onClick={onCancel} disabled={saver.busy}>
          {t.tr('Bekor qilish')}
        </button>
        <SaveButton busy={saver.busy} disabled={!ready || saver.busy}>
          {t.tr('Saqlash')}
        </SaveButton>
      </div>
    </form>
  );
}

// surveyView — "So'rovnoma" bo'limida: belgida savol turi (variantli yoki yozma) ko'rsatiladi
function QuestionItem({ question, onEdit, onDelete, surveyView = false }) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    const ok = await onDelete(question);
    if (!ok) {
      setBusy(false);
      setConfirming(false);
    }
  }

  const unusable = !question.valid && !question.survey;
  const freeText = question.options.every((o) => !o);

  return (
    <li className={`q-item${unusable ? ' invalid' : ''}`}>
      <div className="q-head">
        <span className="q-row">#{question.row}</span>
        <p className="q-text">{question.text || <em>{t.tr('(matn yo\'q)')}</em>}</p>
        {surveyView && question.survey ? (
          <span className="tag info">{t.tr(freeText ? 'Yozma' : 'Variantli')}</span>
        ) : question.valid ? null : question.survey ? (
          <span className="tag info">{t.tr("Faqat so'rovnoma uchun")}</span>
        ) : (
          <span className="tag bad">{t.tr("To'liq emas — testga ham, so'rovnomaga ham tushmaydi")}</span>
        )}
      </div>
      {freeText ? (
        <p className="hint">{t.tr('Variantsiz — xodim javobni o\'zi yozadi')}</p>
      ) : (
        <ol className="q-options">
          {question.options.map((option, i) =>
            // So'rovnoma savolidagi bo'sh variantlar ko'rsatilmaydi
            !option && !question.valid && question.survey ? null : (
              <li key={i} className={question.correct === i ? 'correct' : ''}>
                <span className="letter">{question.correct === i ? <Icon name="check" size={14} /> : LETTERS[i]}</span>
                <span>{option || <em>—</em>}</span>
              </li>
            ),
          )}
        </ol>
      )}
      <div className="q-actions">
        {confirming ? (
          <>
            <span className="confirm-text">{t.tr("O'chirilsinmi?")}</span>
            <button type="button" className="btn danger" onClick={remove} disabled={busy}>
              {busy ? <Spinner /> : null} {t.tr('Ha, o\'chirish')}
            </button>
            <button type="button" className="btn" onClick={() => setConfirming(false)} disabled={busy}>
              {t.tr("Yo'q")}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn" onClick={() => onEdit(question)}>
              <Icon name="edit" size={18} /> {t.tr('Tahrirlash')}
            </button>
            <button type="button" className="btn" onClick={() => setConfirming(true)}>
              <Icon name="trash" size={18} /> {t.tr("O'chirish")}
            </button>
          </>
        )}
      </div>
    </li>
  );
}

function QuestionsTab({ call }) {
  const t = useT();
  const { data, error, loading, reload } = useAdminData(call, 'questions');
  const [selected, setSelected] = useState('');
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [newSheet, setNewSheet] = useState('');
  const [actionError, setActionError] = useState('');
  const sheetSaver = useSaver();

  const sheets = data?.sheets ?? [];
  const current = sheets.find((s) => s.name === selected) ?? sheets[0];

  useEffect(() => {
    if (current && current.name !== selected) setSelected(current.name);
  }, [current, selected]);

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorMessage>{error}</ErrorMessage>;

  async function addSheet(event) {
    event.preventDefault();
    const name = newSheet.trim();
    const ok = await sheetSaver.run(() => call('addSheet', { name }));
    if (ok) {
      setNewSheet('');
      // Avval yangi ro'yxat yuklanadi, aks holda yangi bo'lim hali yo'qligi uchun tanlov birinchisiga qaytadi
      await reload();
      setSelected(name);
    }
  }

  async function remove(question) {
    setActionError('');
    try {
      await call('deleteQuestion', { sheet: current.name, row: question.row, original: question.text });
      await reload();
      return true;
    } catch (err) {
      setActionError(err.message);
      return false;
    }
  }

  const needle = search.trim().toLowerCase();
  const visible = (current?.questions ?? []).filter(
    (q) => !needle || [q.text, ...q.options].some((s) => s.toLowerCase().includes(needle)),
  );

  return (
    <>
      <section className="card admin-section">
        <div className="toolbar">
          <div className="field grow">
            <label htmlFor="sheet">{t.tr("Bo'lim (list)")}</label>
            <select
              id="sheet"
              value={current?.name ?? ''}
              onChange={(e) => {
                setSelected(e.target.value);
                setEditing(null);
              }}
            >
              {sheets.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name} ({s.questions.length})
                </option>
              ))}
            </select>
          </div>
          <form className="field grow inline-form" onSubmit={addSheet}>
            <label htmlFor="newSheet">{t.tr("Yangi bo'lim")}</label>
            <div className="inline">
              <input
                id="newSheet"
                value={newSheet}
                onChange={(e) => setNewSheet(e.target.value)}
                placeholder={t.tr("Bo'lim nomi")}
                maxLength={90}
              />
              <button className="btn" disabled={!newSheet.trim() || sheetSaver.busy}>
                {sheetSaver.busy ? <Spinner dark /> : <Icon name="plus" size={18} />}
                {t.tr("Qo'shish")}
              </button>
            </div>
          </form>
        </div>
        <ErrorMessage>{sheetSaver.error}</ErrorMessage>
        <div className="toolbar">
          <input
            className="grow"
            type="search"
            aria-label={t.tr('Qidirish')}
            placeholder={t.tr('Savol yoki variant bo\'yicha qidirish')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="button" className="btn" onClick={reload} disabled={loading}>
            <Icon name="refresh" size={18} /> {t.tr('Yangilash')}
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!current}
            onClick={() => setEditing(emptyQuestion())}
          >
            <Icon name="plus" size={18} /> {t.tr("Savol qo'shish")}
          </button>
        </div>
      </section>

      {editing && current ? (
        <QuestionEditor
          key={editing.row ?? 'new'}
          sheet={current.name}
          initial={editing}
          call={call}
          onCancel={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            reload();
          }}
        />
      ) : null}

      <ErrorMessage>{actionError || error}</ErrorMessage>

      {current ? (
        <section className="card admin-section">
          <h2>
            {current.name} · {visible.length} {t.tr('ta savol')}
          </h2>
          {visible.length ? (
            <ul className="q-list">
              {visible.map((q) => (
                <QuestionItem
                  key={q.row}
                  question={q}
                  onDelete={remove}
                  onEdit={(item) => {
                    setEditing({ row: item.row, original: item.text, text: item.text, options: item.options, correct: item.correct });
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                />
              ))}
            </ul>
          ) : (
            <p className="hint">{t.tr("Savollar yo'q.")}</p>
          )}
        </section>
      ) : (
        <p className="hint">{t.tr("Savollar listi yo'q. Yangi bo'lim qo'shing.")}</p>
      )}
    </>
  );
}

// --- So'rovnoma ---

const SURVEY_QUESTION_TYPES = [
  ['choice', 'Variantli (test)'],
  ['text', 'Yozma'],
];

const emptySurveyQuestion = () => ({ text: '', kind: 'choice', options: ['', '', '', ''], correct: -1 });

// Variantli savol — 2-4 ta variant, to'g'ri javobsiz; yozma savol — variantsiz, xodim javobni o'zi yozadi
function SurveyQuestionEditor({ sheet, initial, call, onDone, onCancel }) {
  const t = useT();
  const [q, setQ] = useState(initial);
  const saver = useSaver();
  const setOption = (i, value) => setQ((prev) => ({ ...prev, options: prev.options.map((o, j) => (j === i ? value : o)) }));
  const filled = q.options.filter((o) => o.trim()).length;
  const ready = q.text.trim() && (q.kind === 'text' || filled >= 2);

  async function save(event) {
    event.preventDefault();
    const options = q.kind === 'text' ? ['', '', '', ''] : q.options;
    // Testdan kelgan savolning to'g'ri javob belgisi variant o'zgarmagan bo'lsa saqlanib qoladi
    const correct = q.kind === 'choice' && q.correct >= 0 && options[q.correct]?.trim() ? q.correct : -1;
    const ok = await saver.run(() =>
      call('saveQuestion', { sheet, row: initial.row, original: initial.original, text: q.text, options, correct }),
    );
    if (ok) onDone();
  }

  return (
    <form className="card admin-section editor" onSubmit={save}>
      <h2>{initial.row ? `${t.tr('Savolni tahrirlash')} · #${initial.row}` : t.tr('Yangi savol')}</h2>
      <div className="field">
        <label htmlFor="s-text">{t.tr('Savol matni')}</label>
        <textarea id="s-text" rows={3} value={q.text} onChange={(e) => setQ({ ...q, text: e.target.value })} required />
      </div>
      <fieldset className="field">
        <legend>{t.tr('Savol turi')}</legend>
        <div className="segmented" role="group" aria-label={t.tr('Savol turi')}>
          {SURVEY_QUESTION_TYPES.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={q.kind === value}
              className={q.kind === value ? 'active' : ''}
              onClick={() => setQ({ ...q, kind: value })}
            >
              {t.tr(label)}
            </button>
          ))}
        </div>
      </fieldset>
      {q.kind === 'choice' ? (
        <fieldset className="field">
          <legend>{t.tr('Variantlar')}</legend>
          <p className="hint">{t.tr("Kamida ikkita variant kiriting. To'g'ri javob belgilanmaydi — xodim o'z fikrini tanlaydi.")}</p>
          {q.options.map((option, i) => (
            <div key={i} className="option-edit">
              <span className="letter">{LETTERS[i]}</span>
              <input
                aria-label={`${t.tr('Variant')} ${LETTERS[i]}`}
                value={option}
                onChange={(e) => setOption(i, e.target.value)}
              />
            </div>
          ))}
        </fieldset>
      ) : (
        <p className="hint">{t.tr("Xodim javobni o'zi yozadi (1000 belgigacha).")}</p>
      )}
      <ErrorMessage>{saver.error}</ErrorMessage>
      <div className="admin-actions">
        <button type="button" className="btn" onClick={onCancel} disabled={saver.busy}>
          {t.tr('Bekor qilish')}
        </button>
        <SaveButton busy={saver.busy} disabled={!ready || saver.busy}>
          {t.tr('Saqlash')}
        </SaveButton>
      </div>
    </form>
  );
}

function SurveyTab({ call }) {
  const t = useT();
  const settings = useAdminData(call, 'settings');
  const questions = useAdminData(call, 'questions');
  const [selected, setSelected] = useState('');
  const [sheet, setSheet] = useState('');
  const [editing, setEditing] = useState(null);
  const [actionError, setActionError] = useState('');
  const creator = useSaver();

  if ((settings.loading && !settings.data) || (questions.loading && !questions.data)) return <Loading />;
  if (!settings.data || !questions.data) return <ErrorMessage>{settings.error || questions.error}</ErrorMessage>;

  // So'rovnoma — "So'rovnoma" turidagi yo'nalish; uning savollari belgilangan bo'limlarda turadi
  const surveys = settings.data.directions.filter((d) => d.type === 'survey');
  const current = surveys.find((s) => s.name === selected) ?? surveys[0];
  const sheets = current?.sheets ?? [];
  const currentSheet = sheets.includes(sheet) ? sheet : sheets[0];
  const sheetData = questions.data.sheets.find((s) => s.name === currentSheet);

  async function addSurvey(name) {
    const fresh = await creator.run(() => call('addSurvey', { name }));
    if (!fresh) return false;
    settings.setData(fresh);
    await questions.reload();
    setSelected(name);
    setSheet(name);
    setEditing(null);
    return true;
  }

  // Boshqa amalga o'tilganda eski xato xabarlari yopiladi
  function startEditing(value) {
    creator.setError('');
    setActionError('');
    setEditing(value);
  }

  async function remove(question) {
    setActionError('');
    creator.setError('');
    try {
      await call('deleteQuestion', { sheet: currentSheet, row: question.row, original: question.text });
      await questions.reload();
      return true;
    } catch (err) {
      setActionError(err.message);
      return false;
    }
  }

  return (
    <>
      <section className="card admin-section">
        <h2>
          {t.tr("So'rovnomalar")} <span className="count">{surveys.length}</span>
        </h2>
        <p className="hint">
          {t.tr(
            "Yangi so'rovnoma qo'shilsa, shu nomli bo'lim (list) va «So'rovnoma» turidagi yo'nalish yaratiladi. Yo'nalishni o'chirish yoki qayta nomlash — «Sozlamalar» bo'limida.",
          )}
        </p>
        {surveys.length ? (
          <div className="toolbar">
            <div className="field grow">
              <label htmlFor="survey">{t.tr("So'rovnoma")}</label>
              <select
                id="survey"
                value={current.name}
                onChange={(e) => {
                  setSelected(e.target.value);
                  setSheet('');
                  startEditing(null);
                }}
              >
                {surveys.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            {sheets.length > 1 ? (
              <div className="field grow">
                <label htmlFor="survey-sheet">{t.tr("Bo'lim")}</label>
                <select
                  id="survey-sheet"
                  value={currentSheet}
                  onChange={(e) => {
                    setSheet(e.target.value);
                    setEditing(null);
                  }}
                >
                  {sheets.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <button type="button" className="btn" onClick={questions.reload} disabled={questions.loading}>
              <Icon name="refresh" size={18} /> {t.tr('Yangilash')}
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={!sheetData}
              onClick={() => startEditing(emptySurveyQuestion())}
            >
              <Icon name="plus" size={18} /> {t.tr("Savol qo'shish")}
            </button>
          </div>
        ) : (
          <p className="hint">{t.tr("Hali so'rovnoma yo'q. Quyida yangisini qo'shing.")}</p>
        )}
        <AddRow
          placeholder="Yangi so'rovnoma nomi"
          label="So'rovnoma qo'shish"
          maxLength={60}
          busy={creator.busy}
          onAdd={addSurvey}
        />
        <ErrorMessage>{creator.error}</ErrorMessage>
      </section>

      {editing && sheetData ? (
        <SurveyQuestionEditor
          key={editing.row ?? 'new'}
          sheet={currentSheet}
          initial={editing}
          call={call}
          onCancel={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            questions.reload();
          }}
        />
      ) : null}

      <ErrorMessage>{actionError || questions.error}</ErrorMessage>

      {current ? (
        <section className="card admin-section">
          <h2>
            {currentSheet ?? current.name} · {sheetData?.questions.length ?? 0} {t.tr('ta savol')}
          </h2>
          {!sheetData ? (
            <p className="hint">
              {t.tr("Bu bo'lim jadvalda yo'q (arxivlangan yoki o'chirilgan). «Sozlamalar» bo'limida yo'nalishga boshqa bo'lim belgilang.")}
            </p>
          ) : sheetData.questions.length ? (
            <ul className="q-list">
              {sheetData.questions.map((q) => (
                <QuestionItem
                  key={q.row}
                  question={q}
                  surveyView
                  onDelete={remove}
                  onEdit={(item) => {
                    startEditing({
                      row: item.row,
                      original: item.text,
                      text: item.text,
                      kind: item.options.every((o) => !o) ? 'text' : 'choice',
                      options: item.options,
                      correct: item.correct,
                    });
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                />
              ))}
            </ul>
          ) : (
            <p className="hint">{t.tr("Savollar yo'q. «Savol qo'shish» tugmasini bosing.")}</p>
          )}
        </section>
      ) : null}
    </>
  );
}

// --- Natijalar ---

function percentOf(row) {
  const n = parseFloat(String(row[6]).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// Test natijalarida son ustunlari o'ngga tekislanadi, foiz rangda; so'rovnoma javoblari — oddiy matn
function cellClass(survey, row, column) {
  if (survey) return column === 5 || column === 6 ? 'wrap' : '';
  if (column === 6) return `num ${percentOf(row) >= 70 ? 'ok' : 'low'}`;
  return column >= 4 && column <= 5 ? 'num' : '';
}

function downloadCsv(header, rows, name) {
  // Excel o'zbek/rus sozlamalarida ";" ajratuvchini va BOM'ni kutadi
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const SHOW_LIMIT = 300;
const SUMMARY_ANSWERS = 8;

const RESULT_KINDS = [
  ['test', 'Test natijalari'],
  ['survey', "So'rovnoma javoblari"],
];

// So'rovnoma javoblari ustunlari: Sana | Hudud | F.I.SH | Yo'nalish | Bo'lim | Savol | Javob | Manba.
// Har bir savol bo'yicha javoblar sanab chiqiladi (ko'pidan kamiga)
function summarizeSurvey(rows) {
  const byQuestion = new Map();
  for (const row of rows) {
    const key = `${row[4]}\u0000${row[5]}`;
    let item = byQuestion.get(key);
    if (!item) {
      item = { section: row[4], text: row[5], total: 0, counts: new Map() };
      byQuestion.set(key, item);
    }
    item.total++;
    item.counts.set(row[6], (item.counts.get(row[6]) ?? 0) + 1);
  }
  return [...byQuestion.values()].map((item) => ({
    ...item,
    answers: [...item.counts.entries()].sort((a, b) => b[1] - a[1]),
  }));
}

function SurveySummary({ rows }) {
  const t = useT();
  const questions = summarizeSurvey(rows);
  if (!questions.length) return null;
  return (
    <section className="card admin-section">
      <h2>{t.tr("Savollar bo'yicha xulosa")}</h2>
      <ul className="summary">
        {questions.map((q) => (
          <li key={`${q.section}\u0000${q.text}`}>
            <span className="badge">{t.tr(q.section)}</span>
            <p className="q-text">{q.text}</p>
            <ul className="summary-answers">
              {q.answers.slice(0, SUMMARY_ANSWERS).map(([answer, count]) => (
                <li key={answer}>
                  <div className="section-row">
                    <span>{answer}</span>
                    <span className="section-count">
                      {count} · {Math.round((count / q.total) * 100)}%
                    </span>
                  </div>
                  <div className="bar">
                    <div style={{ transform: `scaleX(${count / q.total})` }} />
                  </div>
                </li>
              ))}
            </ul>
            {q.answers.length > SUMMARY_ANSWERS ? (
              <p className="hint">
                {t.tr(`Yana ${q.answers.length - SUMMARY_ANSWERS} xil javob — to'liq ro'yxat jadvalda va CSV faylda.`)}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ResultsTab({ call }) {
  const t = useT();
  const [kind, setKind] = useState('test');

  const kindSwitch = (
    <div className="segmented wide" role="group" aria-label={t.tr('Natijalar turi')}>
      {RESULT_KINDS.map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={kind === value}
          className={kind === value ? 'active' : ''}
          onClick={() => setKind(value)}
        >
          {t.tr(label)}
        </button>
      ))}
    </div>
  );

  // key — turi almashganda eski jadval yangi ustunlar bilan aralashib ko'rinmasligi uchun
  return <ResultsView key={kind} call={call} kind={kind} kindSwitch={kindSwitch} />;
}

function ResultsView({ call, kind, kindSwitch }) {
  const t = useT();
  const { data, error, loading, reload } = useAdminData(call, 'results', { kind });
  const [region, setRegion] = useState('');
  const [direction, setDirection] = useState('');
  const [search, setSearch] = useState('');
  const survey = kind === 'survey';

  // Eng yangi natijalar yuqorida
  const rows = useMemo(() => [...(data?.rows ?? [])].reverse(), [data]);
  const unique = (col) => [...new Set(rows.map((r) => r[col]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const needle = search.trim().toLowerCase();
  const filtered = rows.filter(
    (r) =>
      (!region || r[1] === region) &&
      (!direction || r[3] === direction) &&
      (!needle || String(r[2]).toLowerCase().includes(needle)),
  );
  const percents = survey ? [] : filtered.map(percentOf).filter((n) => n !== null);
  const average = percents.length ? Math.round(percents.reduce((a, b) => a + b, 0) / percents.length) : null;
  // So'rovnomada bitta ishtirokchi — bir vaqtda yuborilgan bir xil F.I.SH dagi qatorlar
  const participants = survey ? new Set(filtered.map((r) => `${r[0]}\u0000${r[2]}`)).size : 0;

  if (loading && !data) {
    return (
      <>
        <section className="card admin-section">{kindSwitch}</section>
        <Loading />
      </>
    );
  }
  if (!data) {
    return (
      <>
        <section className="card admin-section">{kindSwitch}</section>
        <ErrorMessage>{error}</ErrorMessage>
      </>
    );
  }

  return (
    <>
      <section className="card admin-section">
        <div className="toolbar">{kindSwitch}</div>
        <div className="toolbar">
          <div className="field grow">
            <label htmlFor="f-region">{t.tr('Hudud')}</label>
            <select id="f-region" value={region} onChange={(e) => setRegion(e.target.value)}>
              <option value="">{t.tr('Barchasi')}</option>
              {unique(1).map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="field grow">
            <label htmlFor="f-direction">{t.tr("Yo'nalish")}</label>
            <select id="f-direction" value={direction} onChange={(e) => setDirection(e.target.value)}>
              <option value="">{t.tr('Barchasi')}</option>
              {unique(3).map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </div>
          <div className="field grow">
            <label htmlFor="f-name">{t.tr('F.I.SH')}</label>
            <input id="f-name" type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="toolbar">
          {survey ? (
            <div className="stats">
              <span>
                {t.tr('Ishtirokchilar')}: <b>{participants}</b>
              </span>
              <span>
                {t.tr('Javoblar')}: <b>{filtered.length}</b>
              </span>
            </div>
          ) : (
            <div className="stats">
              <span>
                {t.tr('Natijalar')}: <b>{filtered.length}</b>
              </span>
              <span>
                {t.tr("O'rtacha natija")}: <b>{average === null ? '—' : `${average}%`}</b>
              </span>
            </div>
          )}
          <button type="button" className="btn" onClick={reload} disabled={loading}>
            <Icon name="refresh" size={18} /> {t.tr('Yangilash')}
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!filtered.length}
            onClick={() => downloadCsv(data.header, filtered, survey ? 'sorovnoma' : 'natijalar')}
          >
            <Icon name="download" size={18} /> {t.tr('Excel (CSV) yuklab olish')}
          </button>
        </div>
      </section>

      <ErrorMessage>{error}</ErrorMessage>

      <section className="card admin-section table-card">
        {filtered.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {data.header.map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, SHOW_LIMIT).map((row, i) => (
                  <tr key={i}>
                    {row.map((value, j) => (
                      <td key={j} className={cellClass(survey, row, j)}>
                        {value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="hint">{t.tr("Natijalar yo'q.")}</p>
        )}
        {filtered.length > SHOW_LIMIT ? (
          <p className="hint">
            {t.tr(`Jadvalda oxirgi ${SHOW_LIMIT} ta natija ko'rsatildi. Hammasini CSV faylda ko'ring.`)}
          </p>
        ) : null}
      </section>

      {survey ? <SurveySummary rows={filtered} /> : null}
    </>
  );
}

// --- Matnlar ---

const TEXT_FIELDS = [
  { key: 'title', label: 'Bosh sahifa sarlavhasi', rows: 1 },
  { key: 'lead', label: 'Sarlavha ostidagi matn', rows: 2 },
  { key: 'rules', label: 'Qoidalar', rows: 5, hint: "Har qatorda bitta qoida. {daqiqa} o'rniga bir savolga beriladigan vaqt qo'yiladi." },
];

function defaultText(script, key) {
  const t = makeTranslator(script);
  if (key !== 'rules') return t(key);
  const minutes = script === 'cyr' ? '{дақиқа}' : '{daqiqa}';
  return [t('ruleOne'), t('ruleTime', minutes), t('ruleExpire'), t('ruleNoBack')].join('\n');
}

function TextsTab({ call }) {
  const t = useT();
  const { data, setData, error, loading } = useAdminData(call, 'settings');
  const [texts, setTexts] = useState(null);
  const saver = useSaver();

  useEffect(() => {
    if (data) setTexts({ lat: { ...data.texts?.lat }, cyr: { ...data.texts?.cyr } });
  }, [data]);

  if (loading && !texts) return <Loading />;
  if (!texts) return <ErrorMessage>{error}</ErrorMessage>;

  const set = (script, key, value) => {
    saver.setSaved(false);
    setTexts((prev) => ({ ...prev, [script]: { ...prev[script], [key]: value } }));
  };

  async function save(event) {
    event.preventDefault();
    const fresh = await saver.run(() => call('saveSettings', { settings: { ...data, texts } }));
    if (fresh) setData(fresh);
  }

  return (
    <form onSubmit={save}>
      <section className="card admin-section">
        <h2>{t.tr('Sayt matnlari')}</h2>
        <p className="hint">
          {t.tr(
            "Bo'sh qoldirilgan matn o'rniga standart matn ko'rsatiladi. Faqat bitta yozuvda kiritilsa, ikkinchisiga avtomatik o'giriladi.",
          )}
        </p>
      </section>
      {TEXT_FIELDS.map((field) => (
        <section key={field.key} className="card admin-section">
          <h2>{t.tr(field.label)}</h2>
          {field.hint ? <p className="hint">{t.tr(field.hint)}</p> : null}
          <div className="grid-2">
            {['lat', 'cyr'].map((script) => (
              <div key={script} className="field">
                <label htmlFor={`${field.key}-${script}`}>{script === 'lat' ? 'Lotin' : 'Кирил'}</label>
                <textarea
                  id={`${field.key}-${script}`}
                  rows={field.rows}
                  value={texts[script][field.key] ?? ''}
                  placeholder={defaultText(script, field.key)}
                  onChange={(e) => set(script, field.key, e.target.value)}
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn small"
            disabled={!texts.lat[field.key]?.trim()}
            onClick={() => set('cyr', field.key, transliterate(texts.lat[field.key], 'cyr'))}
          >
            {t.tr("Lotindan kirillga o'girish")} <Icon name="arrowRight" size={16} />
          </button>
        </section>
      ))}
      <div className="admin-actions">
        <ErrorMessage>{saver.error}</ErrorMessage>
        <Saved show={saver.saved} />
        <SaveButton busy={saver.busy}>{t.tr('Saqlash')}</SaveButton>
      </div>
    </form>
  );
}

// --- Parol ---

function PasswordTab({ call, creds, onChanged }) {
  const t = useT();
  const [login, setLogin] = useState(creds.login);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const saver = useSaver();
  const mismatch = repeat && password !== repeat;

  async function save(event) {
    event.preventDefault();
    const ok = await saver.run(() => call('changePassword', { newLogin: login.trim(), newPassword: password }));
    if (ok) {
      onChanged({ login: login.trim(), password });
      setPassword('');
      setRepeat('');
    }
  }

  return (
    <form className="card admin-section narrow" onSubmit={save}>
      <h2>{t.tr("Login va parolni o'zgartirish")}</h2>
      <div className="field">
        <label htmlFor="new-login">{t.tr('Login')}</label>
        <input id="new-login" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" minLength={3} required />
      </div>
      <div className="field">
        <label htmlFor="new-password">{t.tr('Yangi parol (kamida 8 ta belgi)')}</label>
        <input
          id="new-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="repeat-password">{t.tr('Parolni takrorlang')}</label>
        <input
          id="repeat-password"
          type="password"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
          autoComplete="new-password"
          required
        />
      </div>
      <ErrorMessage>{mismatch ? t.tr('Parollar bir xil emas') : saver.error}</ErrorMessage>
      <div className="admin-actions">
        <Saved show={saver.saved} />
        <SaveButton busy={saver.busy} disabled={saver.busy || mismatch || password.length < 8 || login.trim().length < 3}>
          {t.tr('Saqlash')}
        </SaveButton>
      </div>
    </form>
  );
}

// --- Asosiy ---

const TABS = [
  ['settings', 'Sozlamalar'],
  ['questions', 'Savollar'],
  ['survey', "So'rovnoma"],
  ['results', 'Natijalar'],
  ['texts', 'Matnlar'],
  ['password', 'Parol'],
];

export default function AdminApp() {
  const [script, setScript, t] = useScript();
  const [creds, setCreds] = useState(savedCreds);
  const [tab, setTab] = useState('settings');

  const login = useCallback((next) => {
    storeCreds(next);
    setCreds(next);
  }, []);
  const logout = useCallback(() => login(null), [login]);

  // Parol boshqa joyda o'zgartirilsa yoki noto'g'ri bo'lib qolsa — kirish oynasiga qaytadi
  const call = useCallback(
    async (op, payload) => {
      try {
        return await adminCall(op, creds, payload);
      } catch (err) {
        if (err.auth) logout();
        throw err;
      }
    },
    [creds, logout],
  );

  let content;
  if (!creds) content = <LoginScreen onLogin={login} />;
  else if (tab === 'settings') content = <SettingsTab call={call} />;
  else if (tab === 'questions') content = <QuestionsTab call={call} />;
  else if (tab === 'survey') content = <SurveyTab call={call} />;
  else if (tab === 'results') content = <ResultsTab call={call} />;
  else if (tab === 'texts') content = <TextsTab call={call} />;
  else content = <PasswordTab call={call} creds={creds} onChanged={login} />;

  return (
    <LangContext.Provider value={t}>
      <div className="app admin">
        <header className="brand">
          <img className="brand-mark" src={logoMark} alt="" width="34" height="38" />
          <span className="brand-name">Uzinkass</span>
          <span className="brand-sub">{t.tr('Admin panel')}</span>
          <LangSwitch script={script} onChange={setScript} />
          {creds ? (
            <button type="button" className="logout" onClick={logout} title={t.tr('Chiqish')}>
              <Icon name="logout" size={18} />
              <span>{t.tr('Chiqish')}</span>
            </button>
          ) : null}
        </header>
        <main>
          {creds ? (
            <nav className="tabs" aria-label={t.tr('Bo\'limlar')}>
              {TABS.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={tab === key ? 'active' : ''}
                  aria-current={tab === key ? 'page' : undefined}
                  onClick={() => setTab(key)}
                >
                  {t.tr(label)}
                </button>
              ))}
            </nav>
          ) : null}
          {content}
        </main>
      </div>
    </LangContext.Provider>
  );
}
