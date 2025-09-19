import { jsx as _jsx } from "react/jsx-runtime";
import { Suspense, lazy } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { MainLayout } from '../layout/MainLayout';
import { LoadingSplash } from '@/components/feedback/LoadingSplash';
const HomePage = lazy(() => import('@/pages/home/HomePage'));
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage'));
const NotFoundPage = lazy(() => import('@/pages/not-found/NotFoundPage'));
const withSuspense = (node) => _jsx(Suspense, { fallback: _jsx(LoadingSplash, {}), children: node });
export const router = createBrowserRouter([
    {
        path: '/',
        element: _jsx(MainLayout, {}),
        children: [
            {
                index: true,
                element: withSuspense(_jsx(HomePage, {})),
            },
            {
                path: 'dashboard',
                element: withSuspense(_jsx(ProtectedRoute, { children: _jsx(DashboardPage, {}) })),
            },
        ],
    },
    {
        path: '*',
        element: withSuspense(_jsx(NotFoundPage, {})),
    },
]);
