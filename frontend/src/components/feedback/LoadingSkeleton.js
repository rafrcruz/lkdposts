import { jsx as _jsx } from "react/jsx-runtime";
import { clsx } from 'clsx';
export const LoadingSkeleton = ({ className }) => (_jsx("div", { role: "status", "aria-live": "polite", className: clsx('h-4 w-full animate-skeleton rounded-md bg-gradient-to-r from-muted via-muted/60 to-muted', className) }));
