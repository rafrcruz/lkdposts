import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { LoadingSplash } from '@/components/feedback/LoadingSplash';
import { useAuth } from '../hooks/useAuth';

type RequireAdminProps = {
  children: React.ReactElement;
};

export const RequireAdmin: React.FC<RequireAdminProps> = ({ children }) => {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <LoadingSplash />;
  }

  if (status !== 'authenticated') {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  if (!user || user.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};
