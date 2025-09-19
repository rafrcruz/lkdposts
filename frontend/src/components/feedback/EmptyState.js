import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { clsx } from 'clsx';
export const EmptyState = ({ title, description, icon, action, className }) => (_jsxs("div", { className: clsx('card flex flex-col items-center justify-center gap-3 px-6 py-10 text-center text-muted-foreground', className), children: [icon, _jsx("h2", { className: "text-lg font-semibold text-foreground", children: title }), description ? _jsx("p", { className: "max-w-md text-sm text-muted-foreground text-balance", children: description }) : null, action] }));
