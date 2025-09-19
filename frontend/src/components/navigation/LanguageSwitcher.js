import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useTranslation } from 'react-i18next';
const SUPPORTED_LOCALES = [
    { value: 'pt-BR', label: 'Português' },
    { value: 'en', label: 'English' },
];
export const LanguageSwitcher = () => {
    const { i18n } = useTranslation();
    const handleChange = (event) => {
        i18n.changeLanguage(event.target.value).catch((err) => {
            console.error('Failed to change language', err);
        });
    };
    return (_jsxs("label", { className: "flex items-center gap-2 text-sm font-medium text-muted-foreground", children: [_jsx("span", { className: "sr-only", children: "Idioma" }), _jsx("select", { value: i18n.language, onChange: handleChange, className: "rounded-md border border-border bg-surface px-2 py-1 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring", "aria-label": "Selecionar idioma", children: SUPPORTED_LOCALES.map((locale) => (_jsx("option", { value: locale.value, children: locale.label }, locale.value))) })] }));
};
