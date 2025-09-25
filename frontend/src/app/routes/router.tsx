import { Suspense, lazy, type ReactNode } from 'react';
import { createBrowserRouter } from 'react-router-dom';

import { MainLayout } from '../layout/MainLayout';
import { LoadingSplash } from '@/components/feedback/LoadingSplash';
import { RequireAdmin } from '@/features/auth/components/RequireAdmin';
import { RequireAuth } from '@/features/auth/components/RequireAuth';

const HomePage = lazy(() => import('@/pages/home/HomePage'));
const FeedsPage = lazy(() => import('@/pages/feeds/FeedsPage'));
const PostsPage = lazy(() => import('@/pages/posts/PostsPage'));
const AllowlistPage = lazy(() => import('@/pages/allowlist/AllowlistPage'));
const NotFoundPage = lazy(() => import('@/pages/not-found/NotFoundPage'));
const NewsListPage = lazy(() => import('@/pages/news/NewsListPage'));
const NewsDetailPage = lazy(() => import('@/pages/news/NewsDetailPage'));
const AppParamsPage = lazy(() => import('@/pages/app-params/AppParamsPage'));
const ForbiddenPage = lazy(() => import('@/pages/forbidden/ForbiddenPage'));

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
        path: 'feeds',
        element: withSuspense(
          <RequireAuth>
            <FeedsPage />
          </RequireAuth>
        ),
      },
      {
        path: 'posts',
        element: withSuspense(
          <RequireAuth>
            <PostsPage />
          </RequireAuth>
        ),
      },
      {
        path: 'news',
        element: withSuspense(
          <RequireAuth>
            <NewsListPage />
          </RequireAuth>
        ),
      },
      {
        path: 'news/:postId',
        element: withSuspense(
          <RequireAuth>
            <NewsDetailPage />
          </RequireAuth>
        ),
      },
      {
        path: 'allowlist',
        element: withSuspense(
          <RequireAdmin>
            <AllowlistPage />
          </RequireAdmin>
        ),
      },
      {
        path: 'app-params',
        element: withSuspense(
          <RequireAdmin forbiddenElement={withSuspense(<ForbiddenPage />)}>
            <AppParamsPage />
          </RequireAdmin>
        ),
      },
    ],
  },
  {
    path: '*',
    element: withSuspense(<NotFoundPage />),
  },
]);

