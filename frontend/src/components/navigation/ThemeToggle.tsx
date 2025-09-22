import { useEffect, useState } from 'react';

const STORAGE_KEY = 'lkdposts-theme';
type Theme = 'light' | 'dark';

const stringToTheme = (value: string | null): Theme | null => {
  if (value === 'light' || value === 'dark') {
    return value;
  }
  return null;
};

const getInitialTheme = (): Theme => {
  const browserWindow = 'window' in globalThis ? globalThis.window : undefined;
  if (!browserWindow) {
    return 'light';
  }

  const stored = stringToTheme(browserWindow.localStorage.getItem(STORAGE_KEY));
  if (stored) {
    return stored;
  }

  return browserWindow.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const applyTheme = (nextTheme: Theme) => {
  const rootDocument = 'document' in globalThis ? globalThis.document : undefined;
  if (!rootDocument) {
    return;
  }

  rootDocument.documentElement.dataset.theme = nextTheme;
};

export const ThemeToggle = () => {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
    const browserWindow = 'window' in globalThis ? globalThis.window : undefined;
    browserWindow?.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  return (
    <button
      type="button"
      aria-label={theme === 'light' ? 'Ativar tema escuro' : 'Ativar tema claro'}
      onClick={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
      className="rounded-full border border-border bg-surface/80 p-2 shadow-sm transition-colors hover:bg-surface"
    >
      <span aria-hidden>
        {theme === 'light' ? (
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 3.75a.75.75 0 0 1 .75-.75h.5a.75.75 0 0 1 .75.75v1a.75.75 0 0 1-.75.75h-.5A.75.75 0 0 1 10 4.75v-1Zm0 11.5a.75.75 0 0 1 .75-.75h.5a.75.75 0 0 1 .75.75v1a.75.75 0 0 1-.75.75h-.5a.75.75 0 0 1-.75-.75v-1ZM4.75 10a.75.75 0 0 1-.75.75h-1a.75.75 0 0 1-.75-.75v-.5a.75.75 0 0 1 .75-.75h1a.75.75 0 0 1 .75.75v.5Zm11.5 0a.75.75 0 0 1-.75.75h-1a.75.75 0 0 1-.75-.75v-.5a.75.75 0 0 1 .75-.75h1a.75.75 0 0 1 .75.75v.5ZM5.636 5.636a.75.75 0 0 1 1.06 0l.354.353a.75.75 0 0 1-1.06 1.062l-.354-.353a.75.75 0 0 1 0-1.062Zm8.314 8.314a.75.75 0 0 1 1.06 0l.354.354a.75.75 0 0 1-1.06 1.06l-.354-.353a.75.75 0 0 1 0-1.06Zm1.06-8.314a.75.75 0 0 1 0 1.062l-.353.353a.75.75 0 0 1-1.062-1.06l.353-.354a.75.75 0 0 1 1.062 0ZM6.99 14.24a.75.75 0 0 1 0 1.062l-.353.353a.75.75 0 0 1-1.062-1.06l.353-.354a.75.75 0 0 1 1.062 0ZM10 6.5A3.5 3.5 0 1 1 6.5 10 3.5 3.5 0 0 1 10 6.5Z" />
          </svg>
        ) : (
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M17.293 13.293a8 8 0 1 1-10.586-10.586.75.75 0 0 1 .977.977A6.5 6.5 0 0 0 16.316 12.62a.75.75 0 0 1 .977.977Z" />
          </svg>
        )}
      </span>
    </button>
  );
};
