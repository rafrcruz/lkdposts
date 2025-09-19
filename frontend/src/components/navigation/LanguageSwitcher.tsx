import { ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';

const SUPPORTED_LOCALES = [
  { value: 'pt-BR', label: 'Português' },
  { value: 'en', label: 'English' },
];

export const LanguageSwitcher = () => {
  const { i18n } = useTranslation();

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    i18n.changeLanguage(event.target.value).catch((err) => {
      console.error('Failed to change language', err);
    });
  };

  return (
    <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
      <span className="sr-only">Idioma</span>
      <select
        value={i18n.language}
        onChange={handleChange}
        className="rounded-md border border-border bg-surface px-2 py-1 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
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
