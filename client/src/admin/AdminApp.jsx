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
function useAdminData(call, op) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await call(op));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [call, op]);

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
  return { busy, error, saved, run, setSaved };
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

function SettingsTab({ call }) {
  const t = useT();
  const { data, setData, error, loading } = useAdminData(call, 'settings');
  const [form, setForm] = useState(null);
  const saver = useSaver();

  useEffect(() => {
    if (!data) return;
    setForm({
      questionCount: String(data.questionCount),
      secondsPerQuestion: String(data.secondsPerQuestion),
      regions: data.regions.join('\n'),
      directions: data.directions.map((d) => ({ name: d.name, sheets: d.sheets })),
    });
  }, [data]);

  if (loading && !form) return <Loading />;
  if (!form) return <ErrorMessage>{error}</ErrorMessage>;

  const update = (patch) => {
    saver.setSaved(false);
    setForm((prev) => ({ ...prev, ...patch }));
  };
  const updateDirection = (index, patch) =>
    update({ directions: form.directions.map((d, i) => (i === index ? { ...d, ...patch } : d)) });
  const toggleSheet = (index, sheet) => {
    const current = form.directions[index].sheets;
    updateDirection(index, {
      sheets: current.includes(sheet) ? current.filter((s) => s !== sheet) : [...current, sheet],
    });
  };

  // Jadvalda yo'q bo'lgan, lekin yo'nalishga yozilgan listlar ham ko'rsatiladi
  const sheetNames = [...new Set([...data.sheets.map((s) => s.name), ...form.directions.flatMap((d) => d.sheets)])];
  const questionsIn = Object.fromEntries(data.sheets.map((s) => [s.name, s.questions]));

  async function save(event) {
    event.preventDefault();
    const fresh = await saver.run(() =>
      call('saveSettings', {
        settings: {
          questionCount: form.questionCount,
          secondsPerQuestion: form.secondsPerQuestion,
          regions: form.regions.split('\n').map((r) => r.trim()).filter(Boolean),
          directions: form.directions,
          texts: data.texts,
        },
      }),
    );
    if (fresh) setData(fresh);
  }

  return (
    <form onSubmit={save}>
      <section className="card admin-section">
        <h2>{t.tr('Test parametrlari')}</h2>
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
        <h2>{t.tr('Hududlar')}</h2>
        <p className="hint">{t.tr('Har qatorda bitta hudud.')}</p>
        <textarea
          aria-label={t.tr('Hududlar')}
          rows={Math.min(16, Math.max(6, form.regions.split('\n').length + 1))}
          value={form.regions}
          onChange={(e) => update({ regions: e.target.value })}
        />
      </section>

      <section className="card admin-section">
        <h2>{t.tr("Yo'nalishlar")}</h2>
        <p className="hint">
          {t.tr("Har bir yo'nalishga savol tushadigan bo'limlarni belgilang. Hech biri belgilanmasa — barcha bo'limlardan savol tushadi.")}
        </p>
        <ul className="directions">
          {form.directions.map((direction, index) => (
            <li key={index} className="direction">
              <div className="direction-head">
                <input
                  aria-label={t.tr("Yo'nalish nomi")}
                  placeholder={t.tr("Yo'nalish nomi")}
                  value={direction.name}
                  onChange={(e) => updateDirection(index, { name: e.target.value })}
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
          onClick={() => update({ directions: [...form.directions, { name: '', sheets: [] }] })}
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
  const ready = q.text.trim() && q.options.every((o) => o.trim()) && q.correct >= 0;

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
        <legend>{t.tr("Variantlar (to'g'ri javobni belgilang)")}</legend>
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
              required
            />
          </div>
        ))}
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

function QuestionItem({ question, onEdit, onDelete }) {
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

  return (
    <li className={`q-item${question.valid ? '' : ' invalid'}`}>
      <div className="q-head">
        <span className="q-row">#{question.row}</span>
        <p className="q-text">{question.text || <em>{t.tr('(matn yo\'q)')}</em>}</p>
        {question.valid ? null : <span className="tag bad">{t.tr("To'liq emas — testga tushmaydi")}</span>}
      </div>
      <ol className="q-options">
        {question.options.map((option, i) => (
          <li key={i} className={question.correct === i ? 'correct' : ''}>
            <span className="letter">{question.correct === i ? <Icon name="check" size={14} /> : LETTERS[i]}</span>
            <span>{option || <em>—</em>}</span>
          </li>
        ))}
      </ol>
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

// --- Natijalar ---

function percentOf(row) {
  const n = parseFloat(String(row[6]).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function downloadCsv(header, rows) {
  // Excel o'zbek/rus sozlamalarida ";" ajratuvchini va BOM'ni kutadi
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `natijalar-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const SHOW_LIMIT = 300;

function ResultsTab({ call }) {
  const t = useT();
  const { data, error, loading, reload } = useAdminData(call, 'results');
  const [region, setRegion] = useState('');
  const [direction, setDirection] = useState('');
  const [search, setSearch] = useState('');

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
  const percents = filtered.map(percentOf).filter((n) => n !== null);
  const average = percents.length ? Math.round(percents.reduce((a, b) => a + b, 0) / percents.length) : null;

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorMessage>{error}</ErrorMessage>;

  return (
    <>
      <section className="card admin-section">
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
          <div className="stats">
            <span>
              {t.tr('Natijalar')}: <b>{filtered.length}</b>
            </span>
            <span>
              {t.tr("O'rtacha natija")}: <b>{average === null ? '—' : `${average}%`}</b>
            </span>
          </div>
          <button type="button" className="btn" onClick={reload} disabled={loading}>
            <Icon name="refresh" size={18} /> {t.tr('Yangilash')}
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!filtered.length}
            onClick={() => downloadCsv(data.header, filtered)}
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
                      <td key={j} className={j === 6 ? `num ${percentOf(row) >= 70 ? 'ok' : 'low'}` : j >= 4 && j <= 5 ? 'num' : ''}>
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
