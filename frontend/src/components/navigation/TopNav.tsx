import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
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
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const toggleButtonRef = useRef<HTMLButtonElement | null>(null);

  const links: Array<{ to: string; label: string }> =
    status === 'authenticated'
      ? [
          { to: '/posts', label: t('navigation.posts', 'Posts') },
          { to: '/prompts', label: t('navigation.prompts', 'Prompts') },
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

  const closeMenu = useCallback(() => {
    setIsMenuOpen(false);
    setTimeout(() => {
      toggleButtonRef.current?.focus();
    }, 0);
  }, []);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const rootDocument = 'document' in globalThis ? globalThis.document : undefined;

    if (!rootDocument) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu();
      }
    };

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) {
        return;
      }

      if (toggleButtonRef.current?.contains(target)) {
        return;
      }

      closeMenu();
    };

    const previousOverflow = rootDocument.body.style.overflow;
    rootDocument.body.style.overflow = 'hidden';

    rootDocument.addEventListener('keydown', handleKeyDown);
    rootDocument.addEventListener('mousedown', handleClickOutside);

    return () => {
      rootDocument.body.style.overflow = previousOverflow;
      rootDocument.removeEventListener('keydown', handleKeyDown);
      rootDocument.removeEventListener('mousedown', handleClickOutside);
    };
  }, [closeMenu, isMenuOpen]);

  const desktopLinkClassName = useCallback(
    ({ isActive }: { isActive: boolean }) =>
      clsx(
        'rounded-md px-3 py-2 transition-colors duration-200',
        isActive ? 'bg-primary/10 text-primary' : 'hover:bg-muted hover:text-foreground',
      ),
    [],
  );

  let authSection: ReactNode;
  let authSectionMobile: ReactNode;

  if (status === 'unknown') {
    authSection = (
      <span className="text-xs text-muted-foreground">{t('navigation.checking', 'Verificando...')}</span>
    );
    authSectionMobile = (
      <span className="block text-sm text-muted-foreground">
        {t('navigation.checking', 'Verificando...')}
      </span>
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
    authSectionMobile = (
      <div className="space-y-2 rounded-md border border-border bg-muted/30 p-4">
        <span className="block text-sm font-medium text-foreground">{user?.email}</span>
        <button
          type="button"
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
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
    authSectionMobile = (
      <a
        href="/"
        className="block w-full rounded-md bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90"
      >
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
        <div className="flex flex-1 items-center gap-6">
          <Link
            to={status === 'authenticated' ? '/posts' : '/'}
            className="text-lg font-display font-semibold tracking-tight text-primary"
          >
            LinkedIn Posts
          </Link>
          <nav aria-label={t('navigation.primary')} className="hidden sm:block">
            <ul className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
              {links.map((link) => (
                <li key={link.to}>
                  <NavLink to={link.to} end={link.to === '/'} className={desktopLinkClassName}>
                    {link.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="hidden items-center gap-3 sm:flex">
          <LanguageSwitcher />
          <ThemeToggle />
          {authSection}
        </div>
        <div className="flex items-center gap-2 sm:hidden">
          <ThemeToggle />
          <button
            type="button"
            ref={toggleButtonRef}
            className="inline-flex items-center justify-center rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
            onClick={() => setIsMenuOpen((prev) => !prev)}
            aria-expanded={isMenuOpen}
            aria-controls="mobile-menu"
          >
            <span className="sr-only">{isMenuOpen ? t('navigation.closeMenu', 'Fechar menu') : t('navigation.openMenu', 'Abrir menu')}</span>
            <svg aria-hidden className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              {isMenuOpen ? (
                <path
                  fillRule="evenodd"
                  d="M5.22 5.22a.75.75 0 0 1 1.06 0L10 8.94l3.72-3.72a.75.75 0 0 1 1.06 1.06L11.06 10l3.72 3.72a.75.75 0 0 1-1.06 1.06L10 11.06l-3.72 3.72a.75.75 0 0 1-1.06-1.06L8.94 10 5.22 6.28a.75.75 0 0 1 0-1.06Z"
                  clipRule="evenodd"
                />
              ) : (
                <path
                  fillRule="evenodd"
                  d="M3.75 5A.75.75 0 0 1 4.5 4.25h11a.75.75 0 0 1 0 1.5h-11A.75.75 0 0 1 3.75 5Zm0 5a.75.75 0 0 1 .75-.75h11a.75.75 0 0 1 0 1.5h-11A.75.75 0 0 1 3.75 10Zm0 5a.75.75 0 0 1 .75-.75h11a.75.75 0 0 1 0 1.5h-11a.75.75 0 0 1-.75-.75Z"
                  clipRule="evenodd"
                />
              )}
            </svg>
          </button>
        </div>
      </div>
      {isMenuOpen ? (
        <div className="sm:hidden" role="dialog" aria-modal="true">
          <div className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm" />
          <div
            id="mobile-menu"
            ref={menuRef}
            className="fixed inset-x-4 top-20 z-50 overflow-hidden rounded-lg border border-border bg-background shadow-xl"
          >
            <div className="space-y-6 p-6">
              <nav aria-label={t('navigation.primary')} className="space-y-2">
                {links.map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    end={link.to === '/'}
                    className={({ isActive }) =>
                      clsx(
                        'block rounded-md px-4 py-2 text-base font-medium transition-colors',
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'text-foreground hover:bg-muted hover:text-foreground',
                      )
                    }
                    onClick={closeMenu}
                  >
                    {link.label}
                  </NavLink>
                ))}
              </nav>
              <div className="space-y-4">
                <LanguageSwitcher className="flex-col items-start gap-3" selectClassName="sm:min-w-0" />
                {authSectionMobile}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
};






