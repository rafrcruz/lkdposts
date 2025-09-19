import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
const NotFoundPage = () => {
    const { t } = useTranslation();
    useEffect(() => {
        document.title = t('notFound.meta.title');
    }, [t]);
    return (_jsxs("div", { className: "mx-auto flex max-w-xl flex-col items-center gap-6 text-center", children: [_jsx("span", { className: "text-6xl font-display font-bold text-primary", children: "404" }), _jsx("h1", { className: "text-2xl font-semibold text-foreground", children: t('notFound.title') }), _jsx("p", { className: "text-muted-foreground", children: t('notFound.description') }), _jsx(Link, { to: "/", className: "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90", children: t('notFound.cta') })] }));
};
export default NotFoundPage;
