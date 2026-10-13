import { useState } from 'react';
import { startTest, submitTest } from './api.js';

const LETTERS = ['A', 'B', 'C', 'D'];

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
      <h1>Test sinovi</h1>
      <p className="muted">Testni boshlash uchun ma'lumotlaringizni kiriting.</p>

      <label>
        F.I.SH
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Familiya Ism Sharif"
          maxLength={120}
          autoFocus
        />
      </label>
      <label>
        Lavozim
        <input
          value={position}
          onChange={(e) => setPosition(e.target.value)}
          placeholder="Lavozimingiz"
          maxLength={120}
        />
      </label>

      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={!ready || loading}>
        {loading ? 'Yuklanmoqda…' : 'Testni boshlash'}
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

  const question = questions[index];
  const isLast = index === questions.length - 1;
  const answered = answers[index] !== null;

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
        <span>
          Savol {index + 1} / {questions.length}
        </span>
        <span className="badge">{question.section}</span>
      </div>
      <div className="progress">
        <div style={{ width: `${((index + 1) / questions.length) * 100}%` }} />
      </div>

      <h2>{question.text}</h2>

      <div className="options">
        {question.options.map((option, i) => (
          <button
            key={i}
            type="button"
            className={`option${answers[index] === i ? ' selected' : ''}`}
            onClick={() => choose(i)}
          >
            <span className="letter">{LETTERS[i]}</span>
            <span>{option}</span>
          </button>
        ))}
      </div>

      {error && <p className="error">{error}</p>}
      <div className="nav">
        <button type="button" disabled={index === 0 || loading} onClick={() => setIndex(index - 1)}>
          Orqaga
        </button>
        <button type="button" className="primary" disabled={!answered || loading} onClick={next}>
          {loading ? 'Yuborilmoqda…' : isLast ? 'Yakunlash' : 'Keyingi'}
        </button>
      </div>
    </div>
  );
}

function ResultScreen({ result, onRestart }) {
  return (
    <div className="card">
      <h1>Test yakunlandi</h1>
      <p className="muted">
        {result.fullName} — {result.position}
      </p>

      <div className="score">
        <strong>
          {result.correct} / {result.total}
        </strong>
        <span>{result.percent}%</span>
      </div>

      <h3>Bo'limlar bo'yicha</h3>
      <ul className="sections">
        {result.sections.map((s) => (
          <li key={s.section}>
            <span>{s.section}</span>
            <span>
              {s.correct} / {s.total}
            </span>
          </li>
        ))}
      </ul>

      {result.mistakes.length > 0 ? (
        <>
          <h3>Xato javoblar</h3>
          <ul className="mistakes">
            {result.mistakes.map((m) => (
              <li key={m.number}>
                <p className="mistake-q">
                  {m.number}. {m.text}
                </p>
                <p className="wrong">Sizning javobingiz: {m.yourAnswer ?? 'javob berilmagan'}</p>
                <p className="right">To'g'ri javob: {m.correctAnswer}</p>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="right">Barcha savollarga to'g'ri javob berdingiz.</p>
      )}

      <button className="primary" onClick={onRestart}>
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

  return <main className="app">{screen}</main>;
}
