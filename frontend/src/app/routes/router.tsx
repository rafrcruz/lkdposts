import { Suspense, lazy, type ReactNode } from 'react';
import { createBrowserRouter } from 'react-router-dom';

import { MainLayout } from '../layout/MainLayout';
import { LoadingSplash } from '@/components/feedback/LoadingSplash';

const HomePage = lazy(() => import('@/pages/home/HomePage'));
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage'));
const NotFoundPage = lazy(() => import('@/pages/not-found/NotFoundPage'));

const withSuspense = (node: ReactNode) => <Suspense fallback={<LoadingSplash />}>{node}</Suspense>;

export const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [
      {
        index: true,
        element: withSuspense(<HomePage />),
      },
      {
        path: 'dashboard',
        element: withSuspense(<DashboardPage />),
      },
    ],
  },
  {
    path: '*',
    element: withSuspense(<NotFoundPage />),
  },
]);

