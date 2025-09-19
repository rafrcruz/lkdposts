import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/feedback/EmptyState';
const DashboardPage = () => {
    const { t } = useTranslation();
    useEffect(() => {
        document.title = t('dashboard.meta.title');
    }, [t]);
    return (_jsx(EmptyState, { title: t('dashboard.empty.title'), description: t('dashboard.empty.description') }));
};
export default DashboardPage;
