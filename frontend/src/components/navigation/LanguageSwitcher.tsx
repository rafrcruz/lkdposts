import { ChangeEvent, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const SUPPORTED_LOCALES = [
  { value: 'pt-BR', label: '\u{1F1E7}\u{1F1F7} Português' },
  { value: 'en', label: '\u{1F1FA}\u{1F1F8} English' },
];

const LANGUAGE_STORAGE_KEY = 'lkdposts-language';

export const LanguageSwitcher = () => {
  const { i18n } = useTranslation();

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextLanguage = event.target.value;

    const browserWindow = typeof globalThis.window === 'undefined' ? undefined : globalThis.window;
    browserWindow?.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);

    i18n.changeLanguage(nextLanguage).catch((err) => {
      console.error('Failed to change language', err);
    });
  };

  useEffect(() => {
    const browserWindow = typeof globalThis.window === 'undefined' ? undefined : globalThis.window;
    if (!browserWindow) {
      return;
    }

    const storedLanguage = browserWindow.localStorage.getItem(LANGUAGE_STORAGE_KEY);

    if (storedLanguage && storedLanguage !== i18n.language) {
      i18n.changeLanguage(storedLanguage).catch((err) => {
        console.error('Failed to load stored language', err);
      });
    }
  }, [i18n]);

  return (
    <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
      <span className="sr-only">Idioma</span>
      <select
        value={i18n.language}
        onChange={handleChange}
        className="min-w-[10rem] rounded-md border border-border bg-surface px-3 py-1 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
        aria-label="Selecionar idioma"
      >
        {SUPPORTED_LOCALES.map((locale) => (
          <option key={locale.value} value={locale.value}>
            {locale.label}
          </option>
        ))}
      </select>
    </label>
  );
};
