import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { TopNav } from '@/components/navigation/TopNav';

export const MainLayout = () => {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <TopNav />
      <main id="conteudo" className="container-responsive flex-1 py-6 sm:py-10">
        <Outlet />
      </main>
      <footer className="border-t border-border bg-surface/50 py-6 text-sm text-muted-foreground sm:py-8">
        <div className="container-responsive flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} lkdposts. {t('footer.rights')}</p>
          <p>{t('footer.version', { version: __APP_VERSION__ })}</p>
        </div>
      </footer>
    </div>
  );
};
