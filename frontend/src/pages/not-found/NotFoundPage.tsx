import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const NotFoundPage = () => {
  const { t } = useTranslation();

  useEffect(() => {
    document.title = t('notFound.meta.title');
  }, [t]);

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-6 text-center">
      <span className="text-6xl font-display font-bold text-primary">404</span>
      <h1 className="text-2xl font-semibold text-foreground">{t('notFound.title')}</h1>
      <p className="text-muted-foreground">{t('notFound.description')}</p>
      <Link
        to="/"
        className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90"
      >
        {t('notFound.cta')}
      </Link>
    </div>
  );
};

export default NotFoundPage;
