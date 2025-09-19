import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { LanguageSwitcher } from './LanguageSwitcher';
import { ThemeToggle } from './ThemeToggle';
import { clsx } from 'clsx';

export const TopNav = () => {
  const { t } = useTranslation();

  const links = [
    { to: '/', label: t('navigation.home') },
    { to: '/dashboard', label: t('navigation.dashboard') },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:block focus:bg-primary focus:text-primary-foreground">
        {t('navigation.skipToContent')}
      </a>
      <div className="container-responsive flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <span className="text-lg font-display font-semibold tracking-tight text-primary">
            lkdposts
          </span>
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
        </div>
      </div>
    </header>
  );
};
