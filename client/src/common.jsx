import { useEffect, useMemo, useState } from 'react';
import { SCRIPTS, makeTranslator, useT } from './i18n.js';

export function Icon({ name, size = 20 }) {
  const paths = {
    check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
    x: <path d="M6 6l12 12M18 6L6 18" />,
    arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
    alert: <path d="M12 8v5M12 16.5v.5M12 3l9.5 17h-19L12 3z" />,
    clock: <path d="M12 7v5l3 2M12 3a9 9 0 100 18 9 9 0 000-18z" />,
    plus: <path d="M12 5v14M5 12h14" />,
    edit: <path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />,
    trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
    download: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
    refresh: <path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7" />,
    logout: <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" />,
    arrowUp: <path d="M12 19V5M6 11l6-6 6 6" />,
    arrowDown: <path d="M12 5v14M6 13l6 6 6-6" />,
    archive: <path d="M3 4h18v4H3zM5 8v12h14V8M10 12h4" />,
    undo: <path d="M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3" />,
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

export function ErrorMessage({ children }) {
  const t = useT();
  if (!children) return null;
  return (
    <p className="error" role="alert">
      <Icon name="alert" size={18} />
      <span>{t.tr(children)}</span>
    </p>
  );
}

const SCRIPT_KEY = 'uzinkass-script';

function savedScript() {
  try {
    return localStorage.getItem(SCRIPT_KEY) === 'cyr' ? 'cyr' : 'lat';
  } catch {
    return 'lat';
  }
}

// Tanlangan yozuv (lotin/kirill) brauzerda eslab qolinadi
export function useScript() {
  const [script, setScript] = useState(savedScript);
  const t = useMemo(() => makeTranslator(script), [script]);

  useEffect(() => {
    document.documentElement.lang = script === 'cyr' ? 'uz-Cyrl' : 'uz-Latn';
    try {
      localStorage.setItem(SCRIPT_KEY, script);
    } catch {
      // Brauzer xotirasi yopiq bo'lsa tanlov faqat shu safar amal qiladi
    }
  }, [script]);

  return [script, setScript, t];
}

export function LangSwitch({ script, onChange }) {
  return (
    <div className="lang-switch" role="group" aria-label="Yozuv / Ёзув">
      {Object.entries(SCRIPTS).map(([key, label]) => (
        <button
          key={key}
          type="button"
          aria-pressed={script === key}
          className={script === key ? 'active' : ''}
          onClick={() => onChange(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
