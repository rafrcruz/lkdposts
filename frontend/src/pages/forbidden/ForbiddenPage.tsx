import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const ForbiddenPage = () => {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="card max-w-md space-y-4 px-6 py-8 text-center">
        <h1 className="text-2xl font-semibold text-foreground">
          {t('forbidden.title', '403 - Acesso negado')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(
            'forbidden.description',
            'Você não tem permissão para acessar esta página. Verifique com um administrador se precisar de acesso.',
          )}
        </p>
        <Link
          to="/posts"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90"
        >
          {t('forbidden.backToPosts', 'Voltar para Posts')}
        </Link>
      </div>
    </div>
  );
};

export default ForbiddenPage;
