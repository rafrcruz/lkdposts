import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopNav } from '@/components/navigation/TopNav';
export const MainLayout = () => {
    const { t } = useTranslation();
    return (_jsxs("div", { className: "flex min-h-screen flex-col bg-background text-foreground", children: [_jsx(TopNav, {}), _jsx("main", { id: "conteudo", className: "container-responsive flex-1 py-10", children: _jsx(Outlet, {}) }), _jsx("footer", { className: "border-t border-border bg-surface/50 py-6 text-sm text-muted-foreground", children: _jsxs("div", { className: "container-responsive flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between", children: [_jsxs("p", { children: ["\u00A9 ", new Date().getFullYear(), " lkdposts. ", t('footer.rights')] }), _jsx("p", { children: t('footer.version', { version: __APP_VERSION__ }) })] }) })] }));
};
