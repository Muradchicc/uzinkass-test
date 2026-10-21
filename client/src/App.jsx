import { useEffect, useRef, useState } from 'react';
import { loadConfig, startTest, submitTest } from './api.js';
import { LangContext, useT } from './i18n.js';
import { ErrorMessage, Icon, LangSwitch, useScript } from './common.jsx';
import logo from './assets/logo.png';
import logoMark from './assets/logo-mark.png';

const LETTERS = ['A', 'B', 'C', 'D'];

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function StartScreen({ onStart }) {
  const t = useT();
  const [options, setOptions] = useState(null);
  const [form, setForm] = useState({ region: '', lastName: '', firstName: '', middleName: '', direction: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function fetchOptions() {
    setError('');
    loadConfig()
      .then(setOptions)
      .catch((err) => setError(err.message));
  }
  useEffect(fetchOptions, []);

  const set = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

  // Yo'nalish tanlanadi, so'ng hudud — agar admin shu yo'nalish uchun uni o'chirmagan bo'lsa
  const needsRegion = !(options?.noRegion ?? []).includes(form.direction);
  const person = {
    region: needsRegion ? form.region : '',
    lastName: form.lastName.trim(),
    firstName: form.firstName.trim(),
    middleName: form.middleName.trim(),
    direction: form.direction,
  };
  const ready =
    (person.region || !needsRegion) &&
    person.direction &&
    [person.lastName, person.firstName, person.middleName].every((name) => name.length >= 2);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!ready || loading) return;
    setLoading(true);
    setError('');
    try {
      onStart(await startTest(person));
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  const minutesPerQuestion = options ? Math.round((options.secondsPerQuestion / 60) * 10) / 10 : 1;
  const surveys = options?.surveys ?? [];
  const isSurvey = surveys.includes(form.direction);
  // Admin paneldagi qoidalar test uchun yozilgan, so'rovnomada o'z qoidalari ko'rsatiladi
  const rules = isSurvey
    ? [t('surveyRuleAll'), t('surveyRuleNoTime'), t('ruleNoBack')]
    : (t.customRules(options?.texts, minutesPerQuestion) ?? [
        t('ruleOne'),
        t('ruleTime', minutesPerQuestion),
        t('ruleExpire'),
        t('ruleNoBack'),
      ]);

  return (
    <form className="card" onSubmit={handleSubmit}>
      <img className="logo" src={logo} alt="Uzinkass" width="96" height="120" />
      <h1>{t.custom(options?.texts, 'title') ?? t('title')}</h1>
      <p className="lead">{t.custom(options?.texts, 'lead') ?? t('lead')}</p>

      <div className="field">
        <label htmlFor="direction">{t('direction')}</label>
        <select id="direction" value={form.direction} onChange={set('direction')} disabled={!options} required>
          <option value="">{options ? t('chooseDirection') : t('loading')}</option>
          {options?.directions.map((direction) => (
            <option key={direction} value={direction}>
              {t.tr(direction)}
              {surveys.includes(direction) ? ` (${t('surveyTag')})` : ''}
            </option>
          ))}
        </select>
      </div>

      {needsRegion ? (
        <div className="field">
          <label htmlFor="region">{t('region')}</label>
          <select id="region" value={form.region} onChange={set('region')} disabled={!options} required>
            <option value="">{options ? t('chooseRegion') : t('loading')}</option>
            {options?.regions.map((region) => (
              <option key={region} value={region}>
                {t.tr(region)}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="lastName">{t('lastName')}</label>
        <input
          id="lastName"
          value={form.lastName}
          onChange={set('lastName')}
          placeholder={t('lastNameHint')}
          autoComplete="family-name"
          maxLength={60}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="firstName">{t('firstName')}</label>
        <input
          id="firstName"
          value={form.firstName}
          onChange={set('firstName')}
          placeholder={t('firstNameHint')}
          autoComplete="given-name"
          maxLength={60}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="middleName">{t('middleName')}</label>
        <input
          id="middleName"
          value={form.middleName}
          onChange={set('middleName')}
          placeholder={t('middleNameHint')}
          autoComplete="additional-name"
          maxLength={60}
          required
        />
      </div>

      <ul className="rules">
        {rules.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>

      <ErrorMessage>{error}</ErrorMessage>
      {options ? (
        <button className="btn primary block" disabled={!ready || loading}>
          {loading ? <span className="spinner" aria-hidden="true" /> : null}
          {loading ? t('loading') : isSurvey ? t('startSurvey') : t('start')}
          {loading ? null : <Icon name="arrowRight" />}
        </button>
      ) : error ? (
        <button type="button" className="btn block" onClick={fetchOptions}>
          {t('retry')}
        </button>
      ) : null}
    </form>
  );
}

function QuizScreen({ test, onFinish }) {
  const t = useT();
  const { sessionId, questions, timeLimit } = test;
  // So'rovnomada vaqt cheklanmaydi (timeLimit = 0)
  const timed = timeLimit > 0;
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState(() => questions.map(() => null));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [deadline] = useState(() => Date.now() + timeLimit * 1000);
  const [left, setLeft] = useState(timeLimit);
  const headingRef = useRef(null);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  const question = questions[index];
  // Variantsiz savol (faqat so'rovnomada) — xodim javobni o'zi yozadi
  const freeText = !question.options.length;
  const isLast = index === questions.length - 1;
  const answered = freeText ? Boolean(answers[index]?.trim()) : answers[index] !== null;
  const expired = timed && left <= 0;

  // Tugma bosilishi va vaqt tugashi bir paytga to'g'ri kelsa ham javoblar bir marta yuboriladi
  const sendingRef = useRef(false);
  async function finish() {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setLoading(true);
    setError('');
    try {
      onFinish(await submitTest(sessionId, answersRef.current));
    } catch (err) {
      sendingRef.current = false;
      setError(err.message);
      setLoading(false);
    }
  }

  // Qolgan vaqt soat bo'yicha hisoblanadi — brauzer fonda sekinlashsa ham adashmaydi
  useEffect(() => {
    if (!timed) return undefined;
    const timer = setInterval(() => {
      const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setLeft(seconds);
      if (seconds === 0) clearInterval(timer);
    }, 250);
    return () => clearInterval(timer);
  }, [deadline, timed]);

  // Vaqt tugasa test o'zi yakunlanadi; javobsiz qolgan savollar xato hisoblanadi
  useEffect(() => {
    if (expired) finish();
  }, [expired]);

  // Yangi savolga o'tganda fokus savol matniga ko'chadi (klaviatura va ekran o'quvchilar uchun)
  useEffect(() => {
    headingRef.current?.focus();
  }, [index]);

  function choose(option) {
    if (expired || loading) return;
    setAnswers((prev) => prev.map((a, i) => (i === index ? option : a)));
  }

  function next() {
    if (isLast) finish();
    else setIndex(index + 1);
  }

  const low = timed && left <= 60;

  return (
    <div className="card">
      <div className="progress-head">
        <span className="step">
          {t('question')} <strong>{index + 1}</strong> / {questions.length}
        </span>
        {timed ? (
          <span className={`timer${low ? ' low' : ''}`} role="timer" aria-label={`${t('timeLeft')} ${formatTime(left)}`}>
            <Icon name="clock" size={18} />
            {formatTime(left)}
          </span>
        ) : null}
      </div>
      <div className="progress" aria-hidden="true">
        {/* Testda — qolgan vaqt, so'rovnomada — o'tilgan savollar */}
        <div
          style={{ transform: `scaleX(${timed ? left / timeLimit : (index + 1) / questions.length})` }}
          className={low ? 'low' : ''}
        />
      </div>

      <div className="question" key={index}>
        <span className="badge">{t.tr(question.section)}</span>
        <h2 ref={headingRef} tabIndex={-1}>
          {t.tr(question.text)}
        </h2>

        {freeText ? (
          <textarea
            className="answer-input"
            rows={4}
            maxLength={1000}
            aria-label={t('answerPlaceholder')}
            placeholder={t('answerPlaceholder')}
            value={answers[index] ?? ''}
            disabled={loading}
            onChange={(e) => choose(e.target.value)}
          />
        ) : (
          <div className="options" role="radiogroup" aria-label={t('answerOptions')}>
            {question.options.map((option, i) => {
              const selected = answers[index] === i;
              return (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`option${selected ? ' selected' : ''}`}
                  disabled={expired || loading}
                  onClick={() => choose(i)}
                >
                  <span className="letter">{selected ? <Icon name="check" size={16} /> : LETTERS[i]}</span>
                  <span className="option-text">{t.tr(option)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {expired ? (
        <p className="notice" role="status">
          <Icon name="clock" size={18} />
          <span>{t('timeUp')}</span>
        </p>
      ) : null}
      <ErrorMessage>{error}</ErrorMessage>

      {expired ? (
        error ? (
          <button type="button" className="btn primary block" disabled={loading} onClick={finish}>
            {t('resend')}
          </button>
        ) : null
      ) : (
        <button type="button" className="btn primary block" disabled={!answered || loading} onClick={next}>
          {loading ? <span className="spinner" aria-hidden="true" /> : null}
          {loading ? t('sending') : isLast ? t('finish') : t('next')}
          {loading ? null : <Icon name={isLast ? 'check' : 'arrowRight'} />}
        </button>
      )}
    </div>
  );
}

function ScoreRing({ percent }) {
  const t = useT();
  const radius = 52;
  const length = 2 * Math.PI * radius;
  return (
    <svg className="ring" viewBox="0 0 120 120" width="132" height="132" aria-hidden="true">
      <circle className="ring-track" cx="60" cy="60" r={radius} />
      <circle
        className="ring-value"
        cx="60"
        cy="60"
        r={radius}
        strokeDasharray={length}
        strokeDashoffset={length * (1 - percent / 100)}
      />
      <text x="60" y="58" className="ring-percent">
        {percent}%
      </text>
      <text x="60" y="78" className="ring-label">
        {t('result')}
      </text>
    </svg>
  );
}

function SurveyDoneScreen({ result, onRestart }) {
  const t = useT();
  return (
    <div className="card">
      <h1>{t('surveyDone')}</h1>
      <p className="lead">
        {t.tr(result.fullName)}
        <br />
        {[result.region, result.direction].filter(Boolean).map(t.tr).join(' · ')}
      </p>
      <p className="all-right">
        <Icon name="check" />
        {t('surveyThanks', result.answered)}
      </p>
      <button className="btn primary block" onClick={onRestart}>
        {t('home')}
      </button>
    </div>
  );
}

function ResultScreen({ result, onRestart }) {
  const t = useT();
  if (result.mode === 'survey') return <SurveyDoneScreen result={result} onRestart={onRestart} />;
  return (
    <div className="card">
      <h1>{t('done')}</h1>
      <p className="lead">
        {t.tr(result.fullName)}
        <br />
        {[result.region, result.direction].filter(Boolean).map(t.tr).join(' · ')}
      </p>

      <div className="score">
        <ScoreRing percent={result.percent} />
        <div>
          <p className="score-value">
            {result.correct} <span>/ {result.total}</span>
          </p>
          <p className="score-caption">{t('correctAnswers')}</p>
        </div>
      </div>

      <h3>{t('bySection')}</h3>
      <ul className="sections">
        {result.sections.map((s) => (
          <li key={s.section}>
            <div className="section-row">
              <span>{t.tr(s.section)}</span>
              <span className="section-count">
                {s.correct} / {s.total}
              </span>
            </div>
            <div className="bar">
              <div style={{ transform: `scaleX(${s.correct / s.total})` }} />
            </div>
          </li>
        ))}
      </ul>

      {result.mistakes.length > 0 ? (
        <>
          <h3>
            {t('mistakes')} ({result.mistakes.length})
          </h3>
          <ul className="mistakes">
            {result.mistakes.map((m) => (
              <li key={m.number}>
                <p className="mistake-q">
                  {m.number}. {t.tr(m.text)}
                </p>
                <p className="answer wrong">
                  <Icon name="x" size={16} />
                  <span>
                    <b>{t('yourAnswer')}</b> {m.yourAnswer == null ? t('noAnswer') : t.tr(m.yourAnswer)}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="all-right">
          <Icon name="check" />
          {t('allRight')}
        </p>
      )}

      <button className="btn primary block" onClick={onRestart}>
        {t('home')}
      </button>
    </div>
  );
}

export default function App() {
  const [test, setTest] = useState(null);
  const [result, setResult] = useState(null);
  const [script, setScript, t] = useScript();

  let screen;
  if (result) {
    screen = (
      <ResultScreen
        result={result}
        onRestart={() => {
          setResult(null);
          setTest(null);
        }}
      />
    );
  } else if (test) {
    screen = <QuizScreen test={test} onFinish={setResult} />;
  } else {
    screen = <StartScreen onStart={setTest} />;
  }

  return (
    <LangContext.Provider value={t}>
      <div className="app">
        <header className="brand">
          <img className="brand-mark" src={logoMark} alt="" width="34" height="38" />
          <span className="brand-name">Uzinkass</span>
          <span className="brand-sub">{t('brandSub')}</span>
          <LangSwitch script={script} onChange={setScript} />
        </header>
        <main>{screen}</main>
      </div>
    </LangContext.Provider>
  );
}
