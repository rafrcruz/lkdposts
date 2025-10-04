import type { ReactNode, RefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { LanguageSwitcher } from './LanguageSwitcher';
import { ThemeToggle } from './ThemeToggle';
import { clsx } from 'clsx';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { HttpError } from '@/lib/api/http';
import type { AuthStatus } from '@/features/auth/context/AuthContext';
import type { AuthenticatedUser } from '@/features/auth/api/auth';

type MainLink = { to: string; label: string };

type AuthSections = {
  desktop: ReactNode;
  mobile: ReactNode;
};

type TranslateFunction = ReturnType<typeof useTranslation>['t'];

type DesktopSettingsMenuProps = {
  settingsLinks: MainLink[];
  isSettingsOpen: boolean;
  isSettingsActive: boolean;
  toggleSettings: () => void;
  closeSettings: () => void;
  settingsToggleRef: RefObject<HTMLButtonElement | null>;
  settingsMenuRef: RefObject<HTMLDivElement | null>;
  t: TranslateFunction;
};

type MobileMenuProps = {
  isMenuOpen: boolean;
  mainLinks: MainLink[];
  settingsLinks: MainLink[];
  closeMenu: () => void;
  menuRef: RefObject<HTMLDialogElement | null>;
  t: TranslateFunction;
  authSectionMobile: ReactNode;
};

const useMobileMenu = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDialogElement | null>(null);
  const toggleButtonRef = useRef<HTMLButtonElement | null>(null);

  const focusToggle = useCallback(() => {
    setTimeout(() => {
      toggleButtonRef.current?.focus();
    }, 0);
  }, []);

  const closeMenu = useCallback(() => {
    setIsMenuOpen(false);
    focusToggle();
  }, [focusToggle]);

  const toggleMenu = useCallback(() => {
    setIsMenuOpen((prev) => !prev);
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

  return { isMenuOpen, toggleMenu, closeMenu, menuRef, toggleButtonRef };
};

const useSettingsMenu = () => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);
  const settingsToggleRef = useRef<HTMLButtonElement | null>(null);

  const focusToggle = useCallback(() => {
    setTimeout(() => {
      settingsToggleRef.current?.focus();
    }, 0);
  }, []);

  const closeSettings = useCallback(() => {
    setIsSettingsOpen(false);
  }, []);

  const closeSettingsAndFocus = useCallback(() => {
    setIsSettingsOpen(false);
    focusToggle();
  }, [focusToggle]);

  const toggleSettings = useCallback(() => {
    setIsSettingsOpen((prev) => !prev);
  }, []);

  useEffect(() => {
    if (!isSettingsOpen) {
      return;
    }

    const rootDocument = 'document' in globalThis ? globalThis.document : undefined;

    if (!rootDocument) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeSettingsAndFocus();
      }
    };

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (settingsMenuRef.current?.contains(target)) {
        return;
      }

      if (settingsToggleRef.current?.contains(target)) {
        return;
      }

      closeSettings();
    };

    rootDocument.addEventListener('keydown', handleKeyDown);
    rootDocument.addEventListener('mousedown', handleClickOutside);

    return () => {
      rootDocument.removeEventListener('keydown', handleKeyDown);
      rootDocument.removeEventListener('mousedown', handleClickOutside);
    };
  }, [closeSettings, closeSettingsAndFocus, isSettingsOpen]);

  return { isSettingsOpen, toggleSettings, closeSettings, settingsMenuRef, settingsToggleRef };
};

const DesktopSettingsMenu = ({
  settingsLinks,
  isSettingsOpen,
  isSettingsActive,
  toggleSettings,
  closeSettings,
  settingsToggleRef,
  settingsMenuRef,
  t,
}: DesktopSettingsMenuProps) => {
  if (settingsLinks.length === 0) {
    return null;
  }

  return (
    <li className="relative">
      <button
        type="button"
        ref={settingsToggleRef}
        className={clsx(
          'flex items-center gap-1 rounded-md px-3 py-2 text-sm transition-colors duration-200',
          isSettingsOpen || isSettingsActive
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
        onClick={toggleSettings}
        aria-haspopup="menu"
        aria-expanded={isSettingsOpen}
      >
        <span>{t('navigation.settings', 'Configurações')}</span>
        <svg
          aria-hidden
          className={clsx('h-4 w-4 transition-transform', isSettingsOpen ? 'rotate-180' : 'rotate-0')}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.086l3.71-3.855a.75.75 0 1 1 1.08 1.04l-4.25 4.417a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {isSettingsOpen ? (
        <div
          ref={settingsMenuRef}
          className="absolute right-0 z-50 mt-2 w-48 overflow-hidden rounded-md border border-border bg-background py-1 shadow-lg"
          role="menu"
          aria-label={t('navigation.settings', 'Configurações')}
        >
          {settingsLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                clsx(
                  'block px-4 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-foreground hover:bg-muted hover:text-foreground',
                )
              }
              onClick={closeSettings}
              role="menuitem"
            >
              {link.label}
            </NavLink>
          ))}
        </div>
      ) : null}
    </li>
  );
};

const MobileMenu = ({
  isMenuOpen,
  mainLinks,
  settingsLinks,
  closeMenu,
  menuRef,
  t,
  authSectionMobile,
}: MobileMenuProps) => {
  if (!isMenuOpen) {
    return null;
  }

  return (
    <div className="sm:hidden">
      <div className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm" aria-hidden="true" />
      <dialog
        id="mobile-menu"
        ref={menuRef}
        className="fixed inset-x-4 top-20 z-50 overflow-hidden rounded-lg border border-border bg-background shadow-xl"
        open
        aria-modal="true"
        aria-label={t('navigation.mobileMenu', 'Navigation menu')}
      >
        <div className="space-y-6 p-6">
          <nav aria-label={t('navigation.primary')} className="space-y-4">
            <div className="space-y-2">
              {mainLinks.map((link) => (
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
            </div>
            {settingsLinks.length > 0 ? (
              <div className="space-y-2">
                <p className="px-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('navigation.settings', 'Configurações')}
                </p>
                {settingsLinks.map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
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
              </div>
            ) : null}
          </nav>
          <div className="space-y-4">
            <LanguageSwitcher className="flex-col items-start gap-3" selectClassName="sm:min-w-0" />
            {authSectionMobile}
          </div>
        </div>
      </dialog>
    </div>
  );
};

const createAuthSections = ({
  status,
  user,
  t,
  handleLogout,
  isAuthenticating,
}: {
  status: AuthStatus;
  user: AuthenticatedUser | null;
  t: TranslateFunction;
  handleLogout: () => void;
  isAuthenticating: boolean;
}): AuthSections => {
  if (status === 'unknown') {
    const checkingLabel = t('navigation.checking', 'Verificando...');
    return {
      desktop: <span className="text-xs text-muted-foreground">{checkingLabel}</span>,
      mobile: <span className="block text-sm text-muted-foreground">{checkingLabel}</span>,
    };
  }

  if (status === 'authenticated') {
    const signingOutLabel = t('navigation.signingOut', 'Saindo...');
    const logoutLabel = t('navigation.logout', 'Sair');
    return {
      desktop: (
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-muted-foreground sm:inline-flex">{user?.email}</span>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleLogout}
            disabled={isAuthenticating}
          >
            {isAuthenticating ? signingOutLabel : logoutLabel}
          </button>
        </div>
      ),
      mobile: (
        <div className="space-y-2 rounded-md border border-border bg-muted/30 p-4">
          <span className="block text-sm font-medium text-foreground">{user?.email}</span>
          <button
            type="button"
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleLogout}
            disabled={isAuthenticating}
          >
            {isAuthenticating ? signingOutLabel : logoutLabel}
          </button>
        </div>
      ),
    };
  }

  const signInLabel = t('navigation.signIn', 'Entrar');
  return {
    desktop: (
      <a href="/" className="text-sm font-medium text-primary hover:underline">
        {signInLabel}
      </a>
    ),
    mobile: (
      <a
        href="/"
        className="block w-full rounded-md bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90"
      >
        {signInLabel}
      </a>
    ),
  };
};

export const TopNav = () => {
  const { t } = useTranslation();
  const { status, user, logout, isAuthenticating } = useAuth();
  const { isMenuOpen, toggleMenu, closeMenu, menuRef, toggleButtonRef } = useMobileMenu();
  const { isSettingsOpen, toggleSettings, closeSettings, settingsMenuRef, settingsToggleRef } = useSettingsMenu();
  const location = useLocation();

  const mainLinks: MainLink[] =
    status === 'authenticated'
      ? [
          { to: '/posts', label: t('navigation.posts', 'Posts') },
          { to: '/feeds', label: t('navigation.feeds', 'Feeds') },
        ]
      : [{ to: '/', label: t('navigation.home') }];

  const settingsLinks: MainLink[] =
    status === 'authenticated'
      ? [
          { to: '/prompts', label: t('navigation.prompts', 'Prompts') },
          ...(user?.role === 'admin'
            ? [
                { to: '/allowlist', label: t('navigation.allowlist', 'Allowlist') },
                { to: '/app-params', label: t('navigation.appParams', 'Parâmetros') },
              ]
            : []),
        ]
      : [];

  const isSettingsActive = settingsLinks.some((link) => location.pathname.startsWith(link.to));

  const handleLogout = () => {
    logout().catch((error) => {
      if (error instanceof HttpError && error.status === 401) {
        return;
      }
      console.error('Failed to logout', error);
    });
  };

  useEffect(() => {
    closeSettings();
  }, [closeSettings, location.pathname]);

  const desktopLinkClassName = useCallback(
    ({ isActive }: { isActive: boolean }) =>
      clsx(
        'rounded-md px-3 py-2 transition-colors duration-200',
        isActive ? 'bg-primary/10 text-primary' : 'hover:bg-muted hover:text-foreground',
      ),
    [],
  );

  const { desktop: authSection, mobile: authSectionMobile } = createAuthSections({
    status,
    user,
    t,
    handleLogout,
    isAuthenticating,
  });

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
              {mainLinks.map((link) => (
                <li key={link.to}>
                  <NavLink to={link.to} end={link.to === '/'} className={desktopLinkClassName}>
                    {link.label}
                  </NavLink>
                </li>
              ))}
              <DesktopSettingsMenu
                settingsLinks={settingsLinks}
                isSettingsOpen={isSettingsOpen}
                isSettingsActive={isSettingsActive}
                toggleSettings={toggleSettings}
                closeSettings={closeSettings}
                settingsToggleRef={settingsToggleRef}
                settingsMenuRef={settingsMenuRef}
                t={t}
              />
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
            onClick={toggleMenu}
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
      <MobileMenu
        isMenuOpen={isMenuOpen}
        mainLinks={mainLinks}
        settingsLinks={settingsLinks}
        closeMenu={closeMenu}
        menuRef={menuRef}
        t={t}
        authSectionMobile={authSectionMobile}
      />
    </header>
  );
};

