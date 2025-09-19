import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useTranslation } from 'react-i18next';
import { HelloMessageCard } from '@/features/hello/components/HelloMessageCard';
import { useEffect } from 'react';
const HomePage = () => {
    const { t } = useTranslation();
    useEffect(() => {
        document.title = t('home.meta.title');
    }, [t]);
    return (_jsxs("div", { className: "mx-auto flex max-w-3xl flex-col gap-10", children: [_jsxs("section", { className: "flex flex-col items-center gap-4 text-center", children: [_jsx("span", { className: "inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary", children: t('home.hero.badge') }), _jsx("h1", { className: "text-balance text-4xl font-display font-bold leading-tight sm:text-5xl", children: t('home.hero.title') }), _jsx("p", { className: "max-w-2xl text-balance text-base text-muted-foreground", children: t('home.hero.subtitle') })] }), _jsx(HelloMessageCard, {})] }));
};
export default HomePage;
