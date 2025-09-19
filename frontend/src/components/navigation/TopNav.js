import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ThemeToggle } from './ThemeToggle';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { clsx } from 'clsx';
export const TopNav = () => {
    const { t } = useTranslation();
    const dashboardEnabled = useFeatureFlag('dashboard');
    const links = [
        { to: '/', label: t('navigation.home'), shouldRender: true },
        { to: '/dashboard', label: t('navigation.dashboard'), shouldRender: dashboardEnabled },
    ];
    return (_jsxs("header", { className: "sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur", children: [_jsx("a", { href: "#conteudo", className: "sr-only focus:not-sr-only focus:block focus:bg-primary focus:text-primary-foreground", children: t('navigation.skipToContent') }), _jsxs("div", { className: "container-responsive flex h-16 items-center justify-between gap-4", children: [_jsxs("div", { className: "flex items-center gap-6", children: [_jsx("span", { className: "text-lg font-display font-semibold tracking-tight text-primary", children: "lkdposts" }), _jsx("nav", { "aria-label": t('navigation.primary'), children: _jsx("ul", { className: "flex items-center gap-3 text-sm font-medium text-muted-foreground", children: links
                                        .filter((link) => link.shouldRender)
                                        .map((link) => (_jsx("li", { children: _jsx(NavLink, { to: link.to, end: link.to === '/', className: ({ isActive }) => clsx('rounded-md px-3 py-2 transition-colors duration-200', isActive ? 'bg-primary/10 text-primary' : 'hover:bg-muted hover:text-foreground'), children: link.label }) }, link.to))) }) })] }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsx(LanguageSwitcher, {}), _jsx(ThemeToggle, {})] })] })] }));
};
