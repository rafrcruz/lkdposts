import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export const LoadingSplash = () => {
    return (_jsxs("div", { className: "flex-center min-h-[50vh] flex-col gap-4 text-center", children: [_jsx("div", { className: "h-16 w-16 animate-spin rounded-full border-2 border-primary border-t-transparent", "aria-hidden": true }), _jsx("p", { className: "text-muted-foreground", children: "Carregando..." })] }));
};
