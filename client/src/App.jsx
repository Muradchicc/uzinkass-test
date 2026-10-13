import { useEffect, useRef, useState } from 'react';
import { startTest, submitTest } from './api.js';
import logo from './assets/logo.png';
import logoMark from './assets/logo-mark.png';

const LETTERS = ['A', 'B', 'C', 'D'];

function Icon({ name, size = 20 }) {
  const paths = {
    check: <path d="M5 12.500l4.500 4.500L19 7.500" />,
    x: <path d="M6 6l12 12M18 6L6 18" />,
    arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
    arrowLeft: <path d="M19 12H5M11 6l-6 6 6 6" />,
    alert: <path d="M12 8v5M12 16.500v.500M12 3l9.500 17h-19L12 3z" />,
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

function StartScreen({ onStart }) {
  const [fullName, setFullName] = useState('');
  const [position, setPosition] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const ready = fullName.trim().length >= 3 && position.trim().length > 0;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!ready || loading) return;
    setLoading(true);
    setError('');
    try {
      onStart(await startTest(fullName.trim(), position.trim()));
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <img className="logo" src={logo} alt="Uzinkass" width="96" height="120" />
      <h1>Bilimni sinash testi</h1>
      <p className="lead">Testni boshlash uchun ma'lumotlaringizni kiriting.</p>

      <div className="field">
        <label htmlFor="fullName">F.I.SH</label>
        <input
          id="fullName"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Familiya Ism Sharif"
          autoComplete="name"
          maxLength={120}
          autoFocus
        />
      </div>
      <div className="field">
        <label htmlFor="position">Lavozim</label>
        <input
          id="position"
          value={position}
          onChange={(e) => setPosition(e.target.value)}
          placeholder="Lavozimingiz"
          autoComplete="organization-title"
          maxLength={120}
        />
      </div>

      <ul className="rules">
        <li>Har bir savolda bitta to'g'ri javob bor.</li>
        <li>Vaqt chegaralanmagan, oldingi savolga qaytish mumkin.</li>
        <li>Natija test yakunida ko'rsatiladi.</li>
      </ul>

      <ErrorMessage>{error}</ErrorMessage>
      <button className="btn primary block" disabled={!ready || loading}>
        {loading ? <span className="spinner" aria-hidden="true" /> : null}
        {loading ? 'Yuklanmoqda…' : 'Testni boshlash'}
        {loading ? null : <Icon name="arrowRight" />}
      </button>
    </form>
  );
}

function QuizScreen({ test, onFinish }) {
  const { sessionId, questions } = test;
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState(() => questions.map(() => null));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const headingRef = useRef(null);

  const question = questions[index];
  const isLast = index === questions.length - 1;
  const answered = answers[index] !== null;
  const doneCount = answers.filter((a) => a !== null).length;

  // Yangi savolga o'tganda fokus savol matniga ko'chadi (klaviatura va ekran o'quvchilar uchun)
  useEffect(() => {
    headingRef.current?.focus();
  }, [index]);

  function choose(option) {
    setAnswers((prev) => prev.map((a, i) => (i === index ? option : a)));
  }

  async function next() {
    if (!isLast) return setIndex(index + 1);
    setLoading(true);
    setError('');
    try {
      onFinish(await submitTest(sessionId, answers));
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <div className="progress-head">
        <span className="step">
          Savol <strong>{index + 1}</strong> / {questions.length}
        </span>
        <span className="badge">{question.section}</span>
      </div>
      <div
        className="progress"
        role="progressbar"
        aria-label="Javob berilgan savollar"
        aria-valuemin={0}
        aria-valuemax={questions.length}
        aria-valuenow={doneCount}
      >
        <div style={{ transform: `scaleX(${doneCount / questions.length})` }} />
      </div>

      <div className="question" key={index}>
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
                onClick={() => choose(i)}
              >
                <span className="letter">{selected ? <Icon name="check" size={16} /> : LETTERS[i]}</span>
                <span className="option-text">{option}</span>
              </button>
            );
          })}
        </div>
      </div>

      <ErrorMessage>{error}</ErrorMessage>
      <div className="nav">
        <button type="button" className="btn" disabled={index === 0 || loading} onClick={() => setIndex(index - 1)}>
          <Icon name="arrowLeft" />
          Orqaga
        </button>
        <button type="button" className="btn primary" disabled={!answered || loading} onClick={next}>
          {loading ? <span className="spinner" aria-hidden="true" /> : null}
          {loading ? 'Yuborilmoqda…' : isLast ? 'Yakunlash' : 'Keyingi'}
          {loading ? null : <Icon name={isLast ? 'check' : 'arrowRight'} />}
        </button>
      </div>
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
        {result.fullName} · {result.position}
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
                <p className="answer right">
                  <Icon name="check" size={16} />
                  <span>
                    <b>To'g'ri javob:</b> {m.correctAnswer}
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
