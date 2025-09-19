import { useTranslation } from 'react-i18next';

import { HelloMessageCard } from '@/features/hello/components/HelloMessageCard';
import { useEffect } from 'react';

const HomePage = () => {
  const { t } = useTranslation();

  useEffect(() => {
    document.title = t('home.meta.title');
  }, [t]);

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
      </section>
      <HelloMessageCard />
    </div>
  );
};

export default HomePage;
