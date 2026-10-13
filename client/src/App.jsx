import { useEffect, useRef, useState } from 'react';
import { loadConfig, startTest, submitTest } from './api.js';
import logo from './assets/logo.png';
import logoMark from './assets/logo-mark.png';

const LETTERS = ['A', 'B', 'C', 'D'];

function Icon({ name, size = 20 }) {
  const paths = {
    check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
    x: <path d="M6 6l12 12M18 6L6 18" />,
    arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
    alert: <path d="M12 8v5M12 16.5v.5M12 3l9.5 17h-19L12 3z" />,
    clock: <path d="M12 7v5l3 2M12 3a9 9 0 100 18 9 9 0 000-18z" />,
  };
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function ErrorMessage({ children }) {
  if (!children) return null;
  return (
    <p className="error" role="alert">
      <Icon name="alert" size={18} />
      <span>{children}</span>
    </p>
  );
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function StartScreen({ onStart }) {
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

  const person = {
    region: form.region,
    lastName: form.lastName.trim(),
    firstName: form.firstName.trim(),
    middleName: form.middleName.trim(),
    direction: form.direction,
  };
  const ready =
    person.region &&
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

  return (
    <form className="card" onSubmit={handleSubmit}>
      <img className="logo" src={logo} alt="Uzinkass" width="96" height="120" />
      <h1>Bilimni sinash testi</h1>
      <p className="lead">Testni boshlash uchun ma'lumotlaringizni to'liq kiriting.</p>

      <div className="field">
        <label htmlFor="region">Hudud</label>
        <select id="region" value={form.region} onChange={set('region')} disabled={!options} required>
          <option value="">{options ? 'Hududni tanlang' : 'Yuklanmoqda…'}</option>
          {options?.regions.map((region) => (
            <option key={region}>{region}</option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="lastName">Familiya</label>
        <input
          id="lastName"
          value={form.lastName}
          onChange={set('lastName')}
          placeholder="Familiyangiz"
          autoComplete="family-name"
          maxLength={60}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="firstName">Ism</label>
        <input
          id="firstName"
          value={form.firstName}
          onChange={set('firstName')}
          placeholder="Ismingiz"
          autoComplete="given-name"
          maxLength={60}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="middleName">Sharif</label>
        <input
          id="middleName"
          value={form.middleName}
          onChange={set('middleName')}
          placeholder="Otangizning ismi"
          autoComplete="additional-name"
          maxLength={60}
          required
        />
      </div>

      <div className="field">
        <label htmlFor="direction">Yo'nalish</label>
        <select id="direction" value={form.direction} onChange={set('direction')} disabled={!options} required>
          <option value="">{options ? "Yo'nalishni tanlang" : 'Yuklanmoqda…'}</option>
          {options?.directions.map((direction) => (
            <option key={direction}>{direction}</option>
          ))}
        </select>
      </div>

      <ul className="rules">
        <li>Har bir savolda bitta to'g'ri javob bor.</li>
        <li>Har bir savolga {minutesPerQuestion} daqiqa hisobidan umumiy vaqt beriladi.</li>
        <li>Vaqt tugasa test yakunlanadi, javobsiz savollar xato hisoblanadi.</li>
        <li>Oldingi savolga qaytib, javobni o'zgartirib bo'lmaydi.</li>
      </ul>

      <ErrorMessage>{error}</ErrorMessage>
      {options ? (
        <button className="btn primary block" disabled={!ready || loading}>
          {loading ? <span className="spinner" aria-hidden="true" /> : null}
          {loading ? 'Yuklanmoqda…' : 'Testni boshlash'}
          {loading ? null : <Icon name="arrowRight" />}
        </button>
      ) : error ? (
        <button type="button" className="btn block" onClick={fetchOptions}>
          Qayta urinish
        </button>
      ) : null}
    </form>
  );
}

function QuizScreen({ test, onFinish }) {
  const { sessionId, questions, timeLimit } = test;
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
  const isLast = index === questions.length - 1;
  const answered = answers[index] !== null;
  const expired = left <= 0;

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
    const timer = setInterval(() => {
      const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setLeft(seconds);
      if (seconds === 0) clearInterval(timer);
    }, 250);
    return () => clearInterval(timer);
  }, [deadline]);

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

  const low = left <= 60;

  return (
    <div className="card">
      <div className="progress-head">
        <span className="step">
          Savol <strong>{index + 1}</strong> / {questions.length}
        </span>
        <span className={`timer${low ? ' low' : ''}`} role="timer" aria-label={`Qolgan vaqt ${formatTime(left)}`}>
          <Icon name="clock" size={18} />
          {formatTime(left)}
        </span>
      </div>
      <div className="progress" aria-hidden="true">
        <div style={{ transform: `scaleX(${left / timeLimit})` }} className={low ? 'low' : ''} />
      </div>

      <div className="question" key={index}>
        <span className="badge">{question.section}</span>
        <h2 ref={headingRef} tabIndex={-1}>
          {question.text}
        </h2>

        <div className="options" role="radiogroup" aria-label="Javob variantlari">
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
                <span className="option-text">{option}</span>
              </button>
            );
          })}
        </div>
      </div>

      {expired ? (
        <p className="notice" role="status">
          <Icon name="clock" size={18} />
          <span>Vaqt tugadi. Javoblaringiz yuborilmoqda.</span>
        </p>
      ) : null}
      <ErrorMessage>{error}</ErrorMessage>

      {expired ? (
        error ? (
          <button type="button" className="btn primary block" disabled={loading} onClick={finish}>
            Qayta yuborish
          </button>
        ) : null
      ) : (
        <button type="button" className="btn primary block" disabled={!answered || loading} onClick={next}>
          {loading ? <span className="spinner" aria-hidden="true" /> : null}
          {loading ? 'Yuborilmoqda…' : isLast ? 'Yakunlash' : 'Keyingi savol'}
          {loading ? null : <Icon name={isLast ? 'check' : 'arrowRight'} />}
        </button>
      )}
    </div>
  );
}

function ScoreRing({ percent }) {
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
        natija
      </text>
    </svg>
  );
}

function ResultScreen({ result, onRestart }) {
  return (
    <div className="card">
      <h1>Test yakunlandi</h1>
      <p className="lead">
        {result.fullName}
        <br />
        {result.region} · {result.direction}
      </p>

      <div className="score">
        <ScoreRing percent={result.percent} />
        <div>
          <p className="score-value">
            {result.correct} <span>/ {result.total}</span>
          </p>
          <p className="score-caption">to'g'ri javob</p>
        </div>
      </div>

      <h3>Bo'limlar bo'yicha</h3>
      <ul className="sections">
        {result.sections.map((s) => (
          <li key={s.section}>
            <div className="section-row">
              <span>{s.section}</span>
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
          <h3>Xato javoblar ({result.mistakes.length})</h3>
          <ul className="mistakes">
            {result.mistakes.map((m) => (
              <li key={m.number}>
                <p className="mistake-q">
                  {m.number}. {m.text}
                </p>
                <p className="answer wrong">
                  <Icon name="x" size={16} />
                  <span>
                    <b>Sizning javobingiz:</b> {m.yourAnswer ?? 'javob berilmagan'}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="all-right">
          <Icon name="check" />
          Barcha savollarga to'g'ri javob berdingiz.
        </p>
      )}

      <button className="btn primary block" onClick={onRestart}>
        Bosh sahifaga qaytish
      </button>
    </div>
  );
}

export default function App() {
  const [test, setTest] = useState(null);
  const [result, setResult] = useState(null);

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
    <div className="app">
      <header className="brand">
        <img className="brand-mark" src={logoMark} alt="" width="34" height="38" />
        <span className="brand-name">Uzinkass</span>
        <span className="brand-sub">Xodimlar test sinovi</span>
      </header>
      <main>{screen}</main>
    </div>
  );
}
