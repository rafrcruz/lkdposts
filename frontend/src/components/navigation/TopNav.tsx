import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { LanguageSwitcher } from './LanguageSwitcher';
import { ThemeToggle } from './ThemeToggle';
import { clsx } from 'clsx';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { HttpError } from '@/lib/api/http';

export const TopNav = () => {
  const { t } = useTranslation();
  const { status, user, logout, isAuthenticating } = useAuth();

  const links: Array<{ to: string; label: string }> =
    status === 'authenticated'
      ? [
          { to: '/posts', label: t('navigation.posts', 'Posts') },
          { to: '/feeds', label: t('navigation.feeds', 'Feeds') },
          ...(user?.role === 'admin'
            ? [
                { to: '/allowlist', label: t('navigation.allowlist', 'Allowlist') },
                { to: '/app-params', label: t('navigation.appParams', 'Parâmetros') },
              ]
            : []),
        ]
      : [{ to: '/', label: t('navigation.home') }];

  const handleLogout = () => {
    logout().catch((error) => {
      if (error instanceof HttpError && error.status === 401) {
        return;
      }
      console.error('Failed to logout', error);
    });
  };

  let authSection: ReactNode;

  if (status === 'unknown') {
    authSection = (
      <span className="text-xs text-muted-foreground">{t('navigation.checking', 'Verificando...')}</span>
    );
  } else if (status === 'authenticated') {
    authSection = (
      <div className="flex items-center gap-2">
        <span className="hidden text-xs text-muted-foreground sm:inline-flex">
          {user?.email}
        </span>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          onClick={handleLogout}
          disabled={isAuthenticating}
        >
          {isAuthenticating ? t('navigation.signingOut', 'Saindo...') : t('navigation.logout', 'Sair')}
        </button>
      </div>
    );
  } else {
    authSection = (
      <a href="/" className="text-sm font-medium text-primary hover:underline">
        {t('navigation.signIn', 'Entrar')}
      </a>
    );
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:block focus:bg-primary focus:text-primary-foreground">
        {t('navigation.skipToContent')}
      </a>
      <div className="container-responsive flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Link
            to={status === 'authenticated' ? '/posts' : '/'}
            className="text-lg font-display font-semibold tracking-tight text-primary"
          >
            LinkedIn Posts
          </Link>
          <nav aria-label={t('navigation.primary')}>
            <ul className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
              {links.map((link) => (
                <li key={link.to}>
                  <NavLink
                    to={link.to}
                    end={link.to === '/'}
                    className={({ isActive }) =>
                      clsx(
                        'rounded-md px-3 py-2 transition-colors duration-200',
                        isActive ? 'bg-primary/10 text-primary' : 'hover:bg-muted hover:text-foreground'
                      )
                    }
                  >
                    {link.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <ThemeToggle />
          {authSection}
        </div>
      </div>
    </header>
  );
};






