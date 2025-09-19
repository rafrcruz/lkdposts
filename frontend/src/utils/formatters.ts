import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

export const formatDate = (date: Date | string, locale: string, options?: Intl.DateTimeFormatOptions) => {
  const parsed = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...options,
  }).format(parsed);
};

export const formatNumber = (value: number, locale: string, options?: Intl.NumberFormatOptions) => {
  return new Intl.NumberFormat(locale, options).format(value);
};

export const formatCurrency = (value: number, locale: string, currency: string) => {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
};

export const useLocale = () => {
  const { i18n } = useTranslation();
  return useMemo(() => i18n.language ?? 'pt-BR', [i18n.language]);
};
