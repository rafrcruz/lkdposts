import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import { ENV } from './env';

const resources = {
  en: {
    translation: {
      navigation: {
        primary: 'Primary navigation',
        home: 'Home',
        dashboard: 'Dashboard',
        allowlist: 'Allowlist',
        skipToContent: 'Skip to content',
        signIn: 'Sign in',
        logout: 'Sign out',
        signingOut: 'Signing out...',
        checking: 'Checking...'
      },
      footer: {
        rights: 'All rights reserved.',
        version: 'Version {{version}}',
      },
      home: {
        meta: { title: 'lkdposts - Home' },
        hero: {
          badge: 'Automation ready',
          title: 'Generate LinkedIn posts straight from your RSS feeds',
          subtitle: 'Connect your automation backend with a polished and responsive interface.',
        },
        auth: {
          title: 'Authentication required',
          description: 'Use your authorised Google account to access the protected content.',
          welcome: 'Active session for {{email}}',
        },
      },
      hello: {
        subtitle: 'This message is served by the backend API and cached with smart revalidation.',
        errorTitle: 'Could not load the hello message',
        errorDescription: 'Check your connection or try again in a few moments.',
        emptyTitle: 'No greeting available right now',
        emptyDescription: 'Once the backend responds with a message it will appear here automatically.',
        authRequiredTitle: 'Authentication required',
        authRequiredDescription: 'Sign in to view the backend hello message.',
      },
      actions: {
        tryAgain: 'Try again',
        tryingAgain: 'Trying again...',
        refresh: 'Refresh message',
        refreshing: 'Refreshing...',
      },
      dashboard: {
        meta: { title: 'lkdposts - Dashboard' },
        empty: {
          title: 'Dashboard coming soon',
          description: 'This area is protected. Sign in to explore internal content.',
        },
      },
      allowlist: {
        heading: 'Allowlist management',
        subtitle: 'Manage which email addresses can access the application.',
        form: {
          title: 'Add email',
          email: 'Email',
          role: 'Role',
          submit: 'Add',
        },
        roles: {
          user: 'User',
          admin: 'Admin',
        },
        table: {
          title: 'Authorised users',
          loading: 'Loading data...',
          error: 'Unable to load the list. Try refreshing the page.',
          empty: 'No authorised email yet.',
          remove: 'Remove',
          removeConfirm: 'Remove this email from the allowlist?',
          syncing: 'Syncing...',
          immutable: 'Super admin is immutable.',
          headers: {
            email: 'Email',
            role: 'Role',
            actions: 'Actions',
          },
        },
      },
      notFound: {
        meta: { title: 'lkdposts - Not found' },
        title: 'Page not found',
        description: 'The page you are looking for may have been moved or deleted.',
        cta: 'Go back home',
      },
    },
  },
  'pt-BR': {
    translation: {
      navigation: {
        primary: 'Navegacao principal',
        home: 'Inicio',
        dashboard: 'Painel',
        allowlist: 'Allowlist',
        skipToContent: 'Ir para o conteudo',
        signIn: 'Entrar',
        logout: 'Sair',
        signingOut: 'Saindo...',
        checking: 'Verificando...'
      },
      footer: {
        rights: 'Todos os direitos reservados.',
        version: 'Versao {{version}}',
      },
      home: {
        meta: { title: 'lkdposts - Inicio' },
        hero: {
          badge: 'Automacao pronta',
          title: 'Gere posts para o LinkedIn direto dos seus feeds RSS',
          subtitle: 'Gere automaticamente posts para o linkedin com IA a partir de novidades e noticias.',
        },
        auth: {
          title: 'Autenticacao necessaria',
          description: 'Use sua conta Google autorizada para acessar o conteudo protegido.',
          welcome: 'Sessao ativa para {{email}}',
        },
      },
      hello: {
        subtitle: 'Esta mensagem vem da API e usa cache com revalidacao inteligente.',
        errorTitle: 'Nao foi possivel carregar a mensagem',
        errorDescription: 'Verifique sua conexao ou tente novamente em instantes.',
        emptyTitle: 'Nenhuma saudacao disponivel no momento',
        emptyDescription: 'Assim que o backend responder com uma mensagem ela aparecera aqui automaticamente.',
        authRequiredTitle: 'Autenticacao necessaria',
        authRequiredDescription: 'Entre para visualizar a mensagem do backend.',
      },
      actions: {
        tryAgain: 'Tentar novamente',
        tryingAgain: 'Tentando...',
        refresh: 'Atualizar mensagem',
        refreshing: 'Atualizando...',
      },
      dashboard: {
        meta: { title: 'lkdposts - Painel' },
        empty: {
          title: 'Painel em desenvolvimento',
          description: 'Esta area e protegida. Entre para acessar conteudos internos.',
        },
      },
      allowlist: {
        heading: 'Gerenciar allowlist',
        subtitle: 'Defina quais emails podem acessar o aplicativo.',
        form: {
          title: 'Adicionar email',
          email: 'Email',
          role: 'Papel',
          submit: 'Adicionar',
        },
        roles: {
          user: 'Usuario',
          admin: 'Administrador',
        },
        table: {
          title: 'Usuarios autorizados',
          loading: 'Carregando dados...',
          error: 'Nao foi possivel carregar a lista. Tente atualizar a pagina.',
          empty: 'Nenhum email autorizado ainda.',
          remove: 'Remover',
          removeConfirm: 'Remover este email da allowlist?',
          syncing: 'Sincronizando...',
          immutable: 'Super admin nao pode ser alterado.',
          headers: {
            email: 'Email',
            role: 'Papel',
            actions: 'Acoes',
          },
        },
      },
      notFound: {
        meta: { title: 'lkdposts - Nao encontrado' },
        title: 'Pagina nao encontrada',
        description: 'A pagina que voce procura pode ter sido movida ou removida.',
        cta: 'Voltar ao inicio',
      },
    },
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: ENV.FALLBACK_LOCALE,
    lng: ENV.DEFAULT_LOCALE,
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['querystring', 'localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'lkdposts-language',
    },
  })
  .catch((error) => {
    console.error('Failed to initialise i18n', error);
  });

export default i18n;



