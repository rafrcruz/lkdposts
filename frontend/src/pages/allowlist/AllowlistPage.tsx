import { FormEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  useAllowlist,
  useCreateAllowlistEntry,
  useRemoveAllowlistEntry,
  useUpdateAllowlistEntryRole,
} from '@/features/allowlist/hooks/useAllowlist';
import type { AllowedRole } from '@/features/allowlist/types/allowlist';
import { HttpError } from '@/lib/api/http';

const DEFAULT_ROLE: AllowedRole = 'user';

export const AllowlistPage = () => {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useAllowlist();
  const createEntry = useCreateAllowlistEntry();
  const updateEntry = useUpdateAllowlistEntryRole();
  const removeEntry = useRemoveAllowlistEntry();

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AllowedRole>(DEFAULT_ROLE);
  const [feedback, setFeedback] = useState<string | null>(null);

  const sortedEntries = useMemo(() => {
    if (!data) {
      return [] as const;
    }
    return [...data].sort((a, b) => a.email.localeCompare(b.email));
  }, [data]);

  const isBusy = createEntry.isPending || updateEntry.isPending || removeEntry.isPending;

  const handleError = (error: unknown) => {
    if (error instanceof HttpError && error.status === 401) {
      return;
    }

    if (error instanceof HttpError) {
      const payload = error.payload as {
        message?: string;
        error?: { message?: string } | null;
      } | null;

      const detailedMessage =
        (payload?.error && typeof payload.error === 'object' && (payload.error as { message?: string }).message) ||
        (payload && typeof payload.message === 'string' ? payload.message : null);

      if (detailedMessage) {
        setFeedback(detailedMessage);
        return;
      }
    }

    if (error instanceof Error) {
      setFeedback(error.message);
      return;
    }

    setFeedback('A operacao falhou. Tente novamente.');
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setFeedback('Informe um email valido.');
      return;
    }

    createEntry.mutate(
      { email: trimmedEmail, role },
      {
        onSuccess: () => {
          setEmail('');
          setRole(DEFAULT_ROLE);
        },
        onError: handleError,
      }
    );
  };

  const handleRoleChange = (id: number, nextRole: AllowedRole) => {
    setFeedback(null);
    updateEntry.mutate({ id, role: nextRole }, { onError: handleError });
  };

  const handleRemove = (id: number) => {
    setFeedback(null);
    removeEntry.mutate(id, { onError: handleError });
  };

  const renderTableContent = () => {
    if (isLoading) {
      return (
        <div className="px-6 py-6 text-sm text-muted-foreground">
          {t('allowlist.table.loading', 'Carregando dados...')}
        </div>
      );
    }

    if (isError) {
      return (
        <div className="px-6 py-6 text-sm text-destructive" role="alert">
          {t('allowlist.table.error', 'Nao foi possivel carregar a lista. Tente atualizar a pagina.')}
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-muted/50 text-left uppercase text-xs tracking-wide text-muted-foreground">
            <tr>
              <th className="px-6 py-3">{t('allowlist.table.headers.email', 'Email')}</th>
              <th className="px-6 py-3">{t('allowlist.table.headers.role', 'Papel')}</th>
              <th className="px-6 py-3 text-right">{t('allowlist.table.headers.actions', 'Acoes')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sortedEntries.length === 0 ? (
              <tr>
                <td className="px-6 py-6 text-sm text-muted-foreground" colSpan={3}>
                  {t('allowlist.table.empty', 'Nenhum email autorizado ainda.')}
                </td>
              </tr>
            ) : (
              sortedEntries.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-6 py-4 font-medium text-foreground">{entry.email}</td>
                  <td className="px-6 py-4">
                    <select
                      value={entry.role}
                      onChange={(event) => handleRoleChange(entry.id, event.target.value as AllowedRole)}
                      className="rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={entry.immutable || isBusy}
                    >
                      <option value="user">{t('allowlist.roles.user', 'Usuario')}</option>
                      <option value="admin">{t('allowlist.roles.admin', 'Administrador')}</option>
                    </select>
                    {entry.immutable ? (
                      <p className="mt-1 text-xs text-muted-foreground">{t('allowlist.table.immutable', 'Super admin nao pode ser alterado.')}</p>
                    ) : null}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-md border border-destructive px-3 py-2 text-xs font-medium text-destructive transition hover:bg-destructive hover:text-destructive-foreground disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => {
                        if (entry.immutable) {
                          return;
                        }
                        const browserWindow = 'window' in globalThis ? globalThis.window : undefined;
                        const confirmed =
                          browserWindow?.confirm(t('allowlist.table.removeConfirm', 'Remover este email da allowlist?')) ?? false;
                        if (!confirmed) {
                          return;
                        }
                        handleRemove(entry.id);
                      }}
                      disabled={entry.immutable || isBusy}
                    >
                      {t('allowlist.table.remove', 'Remover')}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-foreground">{t('allowlist.heading', 'Allowlist de usuarios')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('allowlist.subtitle', 'Gerencie quais emails podem acessar a aplicacao.')}
        </p>
      </header>

      <section className="card space-y-4 px-6 py-6">
        <h2 className="text-lg font-medium text-foreground">{t('allowlist.form.title', 'Adicionar email')}</h2>
        <form className="grid gap-4 sm:grid-cols-[2fr,1fr,auto]" onSubmit={handleSubmit}>
          <label className="text-sm">
            <span className="mb-1 block font-medium">{t('allowlist.form.email', 'Email')}</span>
            <input
              type="email"
              name="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              placeholder="usuario@empresa.com"
              required
              autoComplete="off"
              disabled={isBusy}
            />
          </label>

          <label className="text-sm">
            <span className="mb-1 block font-medium">{t('allowlist.form.role', 'Papel')}</span>
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as AllowedRole)}
              className="w-full min-w-[8rem] rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              disabled={isBusy}
            >
              <option value="user">{t('allowlist.roles.user', 'Usuario')}</option>
              <option value="admin">{t('allowlist.roles.admin', 'Administrador')}</option>
            </select>
          </label>

          <div className="flex items-end">
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isBusy}
            >
              {t('allowlist.form.submit', 'Adicionar')}
            </button>
          </div>
        </form>
        {feedback ? (
          <p className="text-sm text-destructive" role="alert">
            {feedback}
          </p>
        ) : null}
      </section>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-medium text-foreground">{t('allowlist.table.title', 'Usuarios autorizados')}</h2>
          {isBusy ? <span className="text-xs text-muted-foreground">{t('allowlist.table.syncing', 'Sincronizando...')}</span> : null}
        </div>
        {renderTableContent()}
      </section>
    </div>
  );
};

export default AllowlistPage;
