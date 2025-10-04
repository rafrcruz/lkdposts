import { ChangeEvent, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';

const SUPPORTED_LOCALES = [
  { value: 'pt-BR', label: '\u{1F1E7}\u{1F1F7} Português' },
  { value: 'en', label: '\u{1F1FA}\u{1F1F8} English' },
];

const LANGUAGE_STORAGE_KEY = 'lkdposts-language';

type LanguageSwitcherProps = {
  className?: string;
  selectClassName?: string;
};

export const LanguageSwitcher = ({ className, selectClassName }: LanguageSwitcherProps) => {
  const { i18n } = useTranslation();

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextLanguage = event.target.value;

    const browserWindow = 'window' in globalThis ? globalThis.window : undefined;
    browserWindow?.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);

    i18n.changeLanguage(nextLanguage).catch((err) => {
      console.error('Failed to change language', err);
    });
  };

  useEffect(() => {
    const browserWindow = 'window' in globalThis ? globalThis.window : undefined;
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
    <label
      className={clsx('flex items-center gap-2 text-sm font-medium text-muted-foreground', className)}
    >
      <span className="sr-only">Idioma</span>
      <select
        value={i18n.language}
        onChange={handleChange}
        className={clsx(
          'w-full rounded-md border border-border bg-surface px-3 py-1 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring sm:w-auto sm:min-w-[10rem]',
          selectClassName,
        )}
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
