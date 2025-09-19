import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useTranslation } from 'react-i18next';
import { ErrorState } from '@/components/feedback/ErrorState';
import { LoadingSkeleton } from '@/components/feedback/LoadingSkeleton';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useHelloMessage } from '../hooks/useHelloMessage';
export const HelloMessageCard = () => {
    const { t } = useTranslation();
    const { data, isLoading, isError, refetch, isRefetching } = useHelloMessage();
    if (isLoading) {
        return (_jsxs("div", { className: "card flex flex-col gap-4 px-8 py-10", children: [_jsx(LoadingSkeleton, { className: "h-8 w-1/2 self-center" }), _jsx(LoadingSkeleton, { className: "h-4 w-2/3 self-center" })] }));
    }
    if (isError) {
        return (_jsx(ErrorState, { title: t('hello.errorTitle'), description: t('hello.errorDescription'), action: _jsx("button", { type: "button", className: "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90", onClick: () => { void refetch(); }, disabled: isRefetching, children: isRefetching ? t('actions.tryingAgain') : t('actions.tryAgain') }) }));
    }
    if (!data?.message) {
        return (_jsx(EmptyState, { title: t('hello.emptyTitle'), description: t('hello.emptyDescription') }));
    }
    return (_jsxs("div", { className: "card flex flex-col items-center gap-6 px-8 py-12 text-center", children: [_jsx("h1", { className: "text-balance text-4xl font-bold text-foreground sm:text-5xl", children: data.message }), _jsx("p", { className: "max-w-xl text-balance text-sm text-muted-foreground", children: t('hello.subtitle') }), _jsx("div", { className: "flex flex-wrap items-center justify-center gap-3", children: _jsx("button", { type: "button", onClick: () => { void refetch(); }, className: "inline-flex items-center justify-center rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground shadow-sm transition hover:border-primary hover:text-primary", disabled: isRefetching, children: isRefetching ? t('actions.refreshing') : t('actions.refresh') }) })] }));
};
