import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { LoadingSplash } from '@/components/feedback/LoadingSplash';
import { useAuth } from '../hooks/useAuth';

type RequireAuthProps = {
  children: React.ReactElement;
};

export const RequireAuth: React.FC<RequireAuthProps> = ({ children }) => {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <LoadingSplash />;
  }

  if (status !== 'authenticated') {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  return children;
};
