import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { clsx } from 'clsx';
export const ErrorState = ({ title, description, action, className }) => (_jsx("div", { role: "alert", className: clsx('card border-danger/30 bg-danger/5 px-6 py-8 text-danger shadow-md transition-colors', className), children: _jsxs("div", { className: "flex flex-col gap-2", children: [_jsx("h2", { className: "text-lg font-semibold", children: title }), description ? _jsx("p", { className: "text-sm text-danger/80", children: description }) : null, action] }) }));
