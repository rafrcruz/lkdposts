import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { GoogleLoginButton } from '@/features/auth/components/GoogleLoginButton';
import { useAuth } from '@/features/auth/hooks/useAuth';

const HomePage = () => {
  const { t } = useTranslation();
  const { status } = useAuth();

  useEffect(() => {
    document.title = t('home.meta.title');
  }, [t]);

  const isAuthenticated = status === 'authenticated';
  const isCheckingSession = status === 'unknown';

  if (isAuthenticated) {
    return <Navigate to="/posts" replace />;
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10">
      <section className="flex flex-col items-center gap-4 text-center">
        <span className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
          {t('home.hero.badge')}
        </span>
        <h1 className="text-balance text-4xl font-display font-bold leading-tight sm:text-5xl">
          {t('home.hero.title')}
        </h1>
        <p className="max-w-2xl text-balance text-base text-muted-foreground">
          {t('home.hero.subtitle')}
        </p>
        <div className="mt-6">
          {isCheckingSession ? (
            <p className="text-sm text-muted-foreground">
              {t('home.auth.checking', 'Verificando sessao...')}
            </p>
          ) : (
            <GoogleLoginButton />
          )}
        </div>
      </section>
      <div className="card space-y-3 px-8 py-10 text-center">
        <h2 className="text-lg font-semibold text-foreground">{t('home.auth.title', 'Autenticacao necessaria')}</h2>
        <p className="text-sm text-muted-foreground">{t('home.auth.description', 'Entre com sua conta Google autorizada para acessar o conteudo.')}</p>
      </div>
    </div>
  );
};

export default HomePage;
