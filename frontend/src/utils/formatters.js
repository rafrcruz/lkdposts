import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
export const formatDate = (date, locale, options) => {
    const parsed = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
        ...options,
    }).format(parsed);
};
export const formatNumber = (value, locale, options) => {
    return new Intl.NumberFormat(locale, options).format(value);
};
export const formatCurrency = (value, locale, currency) => {
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
