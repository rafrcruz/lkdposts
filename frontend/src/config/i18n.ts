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
        skipToContent: 'Skip to content',
      },
      footer: {
        rights: 'All rights reserved.',
        version: 'Version {{version}}',
      },
      home: {
        meta: { title: 'lkdposts · Home' },
        hero: {
          badge: 'Automation ready',
          title: 'Generate LinkedIn posts straight from your feeds',
          subtitle: 'A curated experience that connects your backend automation with a polished and responsive frontend.',
        },
      },
      hello: {
        subtitle: 'This message is served by the backend API and cached with intelligent revalidation.',
        errorTitle: 'Could not load the hello message',
        errorDescription: 'Check your connection or try again in a few moments.',
        emptyTitle: 'No greeting available right now',
        emptyDescription: 'Once the backend responds with a message it will appear here automatically.',
      },
      actions: {
        tryAgain: 'Try again',
        tryingAgain: 'Trying again…',
        refresh: 'Refresh message',
        refreshing: 'Refreshing…',
      },
      dashboard: {
        meta: { title: 'lkdposts · Dashboard' },
        empty: {
          title: 'Dashboard coming soon',
          description: 'Feature protected by routing guard. Enable authentication to access internal content.',
        },
      },
      notFound: {
        meta: { title: 'lkdposts · Not found' },
        title: 'Page not found',
        description: 'The page you are looking for may have been moved or deleted.',
        cta: 'Go back home',
      },
    },
  },
  'pt-BR': {
    translation: {
      navigation: {
        primary: 'Navegação principal',
        home: 'Início',
        dashboard: 'Painel',
        skipToContent: 'Ir para o conteúdo',
      },
      footer: {
        rights: 'Todos os direitos reservados.',
        version: 'Versão {{version}}',
      },
      home: {
        meta: { title: 'lkdposts · Início' },
        hero: {
          badge: 'Automação pronta',
          title: 'Gere posts para o LinkedIn direto dos seus feeds',
          subtitle: 'Uma experiência moderna que conecta a automação do backend a uma interface responsiva e acessível.',
        },
      },
      hello: {
        subtitle: 'Esta mensagem é servida pela API e utiliza cache com revalidação inteligente.',
        errorTitle: 'Não foi possível carregar a mensagem',
        errorDescription: 'Verifique sua conexão ou tente novamente em instantes.',
        emptyTitle: 'Nenhuma saudação disponível no momento',
        emptyDescription: 'Assim que o backend responder com uma mensagem ela aparecerá aqui automaticamente.',
      },
      actions: {
        tryAgain: 'Tentar novamente',
        tryingAgain: 'Tentando…',
        refresh: 'Atualizar mensagem',
        refreshing: 'Atualizando…',
      },
      dashboard: {
        meta: { title: 'lkdposts · Painel' },
        empty: {
          title: 'Painel em desenvolvimento',
          description: 'Recurso protegido por guarda de rota. Habilite autenticação para acessar conteúdos internos.',
        },
      },
      notFound: {
        meta: { title: 'lkdposts · Não encontrado' },
        title: 'Página não encontrada',
        description: 'A página que você procura pode ter sido movida ou removida.',
        cta: 'Voltar ao início',
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
    },
  })
  .catch((error) => {
    console.error('Failed to initialise i18n', error);
  });

export default i18n;
