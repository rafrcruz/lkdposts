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
        posts: 'Posts',
        feeds: 'Feeds',
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
      feeds: {
        meta: { title: 'lkdposts - Feeds' },
        heading: 'RSS feeds',
        subtitle: 'Manage the feeds that will power post generation.',
        form: {
          title: 'Add feed',
          url: 'URL',
          titleLabel: 'Title (optional)',
          titlePlaceholder: 'E.g. Company blog',
          adding: 'Adding...',
          submit: 'Add',
          success: 'Feed added successfully.',
          errors: {
            urlRequired: 'Enter a URL.',
            invalidUrl: 'Enter a valid URL starting with http:// or https://.',
          },
        },
        bulkForm: {
          title: 'Add feeds in bulk',
          label: 'One URL per line',
          placeholder: 'https://example.com/feed-1.xml\nhttps://example.com/feed-2.xml',
          hint: 'Blank lines are ignored and local duplicates will not be sent.',
          adding: 'Processing...',
          submit: 'Add in bulk',
          errors: {
            empty: 'Provide at least one URL to add.',
            noValidEntries: 'No valid URL to send.',
          },
          success_zero: 'No new feeds created.',
          success_one: '{{count}} feed added successfully.',
          success_other: '{{count}} feeds added successfully.',
          summary: {
            title: 'Operation summary',
            created_one: '{{count}} feed created',
            created_other: '{{count}} feeds created',
            duplicates_one: '{{count}} duplicate',
            duplicates_other: '{{count}} duplicates',
            invalid_one: '{{count}} invalid URL',
            invalid_other: '{{count}} invalid URLs',
            none: 'No entries in this category.',
            feedId: 'Feed ID {{id}}',
          },
          reasons: {
            alreadyExists: 'This feed already exists for the user.',
            duplicateInPayload: 'Duplicate URL in payload.',
            urlRequired: 'URL required.',
            invalidUrl: 'Invalid URL format.',
          },
        },
        errors: {
          duplicate: 'This feed is already registered.',
          invalidUrl: 'Enter a valid URL starting with http:// or https://.',
          generic: 'The operation failed. Try again.',
        },
        list: {
          title: 'Your feeds',
          caption: 'Total of {{count}} feeds • Page {{page}}',
          syncing: 'Syncing...',
          loading: 'Loading feeds...',
          error: 'Unable to load feeds. Try again later.',
          empty: {
            title: 'No feed registered yet.',
            description: 'Add your feeds individually or in bulk to start generating posts.',
          },
          headers: {
            feed: 'Feed',
            lastFetchedAt: 'Last update',
            actions: 'Actions',
          },
          untitled: 'Untitled',
          feedId: 'Feed ID {{id}}',
          neverFetched: 'Not processed yet',
          edit: {
            url: 'URL',
            title: 'Title',
            titlePlaceholder: 'Optional',
            cancel: 'Cancel',
            save: 'Save changes',
            saving: 'Saving...',
            trigger: 'Edit',
            errors: {
              urlRequired: 'Enter a URL.',
              invalidUrl: 'Enter a valid URL starting with http:// or https://.',
            },
          },
          feedback: {
            updated: 'Feed updated successfully.',
            removed: 'Feed removed successfully.',
          },
          deleteConfirm: 'Remove this feed?',
          delete: 'Delete',
          deleting: 'Deleting...',
          pagination: {
            page: 'Page {{page}}',
            previous: 'Previous',
            next: 'Next',
          },
        },
      },
      posts: {
        meta: { title: 'lkdposts - Posts' },
        heading: 'Recent posts',
        subtitle: 'Review the generated posts alongside the original article excerpts.',
        filters: {
          feedLabel: 'Filter by feed',
          feedAll: 'All feeds',
          feedFallback: 'Feed {{id}}',
          empty: {
            title: 'No feed available yet.',
            description: 'Add feeds on the Feeds page to start generating posts.',
            cta: 'Manage feeds',
          },
          error: 'Could not load your feeds. Try refreshing the page.',
        },
        actions: {
          refresh: 'Refresh',
          refreshing: 'Refreshing...',
        },
        errors: {
          generic: 'The operation failed. Try again.',
          refresh: 'Could not refresh your feeds.',
          cleanup: 'Could not clean old articles.',
          list: 'Could not load posts. Try again later.',
          partial: 'Some operations finished with errors.',
        },
        messages: {
          syncing: 'Syncing...',
        },
        cleanup: {
          description: 'Removed {{articles}} articles and {{posts}} posts older than seven days.',
        },
        summary: {
          title: 'Refresh summary',
          executedAt: 'Executed at {{date}}',
          show: 'Show refresh summary',
          hide: 'Hide refresh summary',
          empty: 'No feed was processed during the latest refresh.',
          feedFallback: 'Feed {{id}}',
          skippedByCooldown: 'Skipped by cooldown window.',
          cooldownRemaining: 'Cooldown remaining: {{seconds}}s',
          itemsRead: 'Items read',
          itemsWithinWindow: 'Items within window',
          articlesCreated: 'Articles created',
          duplicates: 'Duplicates',
          invalidItems: 'Invalid entries',
          error: 'Error: {{message}}',
        },
        list: {
          metadata: {
            publishedAt: 'Published {{date}}',
            feed: 'Feed: {{feed}}',
            createdAt: 'Generated {{date}}',
            feedUnknown: 'Feed not available',
            feedFallback: 'Feed {{id}}',
          },
          sections: {
            post: 'POST',
            article: 'NEWS',
          },
          postUnavailable: 'Post not available yet.',
          empty: {
            default: {
              title: 'No recent posts.',
              description: 'Posts from the last seven days will appear here after a refresh.',
            },
            filtered: {
              title: 'No posts for this feed.',
              description: 'Select another feed or refresh to get new posts.',
            },
          },
        },
        pagination: {
          page: 'Page {{page}}',
          previous: 'Previous',
          next: 'Next',
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
        posts: 'Posts',
        feeds: 'Feeds',
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
      feeds: {
        meta: { title: 'lkdposts - Feeds' },
        heading: 'Feeds RSS',
        subtitle: 'Gerencie os feeds que alimentarao a geracao de posts.',
        form: {
          title: 'Adicionar feed',
          url: 'URL',
          titleLabel: 'Titulo (opcional)',
          titlePlaceholder: 'Ex.: Blog da empresa',
          adding: 'Adicionando...',
          submit: 'Adicionar',
          success: 'Feed adicionado com sucesso.',
          errors: {
            urlRequired: 'Informe uma URL.',
            invalidUrl: 'Informe uma URL valida iniciando com http:// ou https://.',
          },
        },
        bulkForm: {
          title: 'Adicionar feeds em lote',
          label: 'Uma URL por linha',
          placeholder: 'https://example.com/feed-1.xml\nhttps://example.com/feed-2.xml',
          hint: 'Linhas vazias sao ignoradas e duplicatas locais nao serao enviadas.',
          adding: 'Processando...',
          submit: 'Adicionar em lote',
          errors: {
            empty: 'Informe ao menos uma URL para adicionar.',
            noValidEntries: 'Nenhuma URL valida para envio.',
          },
          success_zero: 'Nenhum feed novo criado.',
          success_one: '{{count}} feed adicionado com sucesso.',
          success_other: '{{count}} feeds adicionados com sucesso.',
          summary: {
            title: 'Resumo da operacao',
            created_one: '{{count}} feed criado',
            created_other: '{{count}} feeds criados',
            duplicates_one: '{{count}} duplicata',
            duplicates_other: '{{count}} duplicatas',
            invalid_one: '{{count}} URL invalida',
            invalid_other: '{{count}} URLs invalidas',
            none: 'Nenhum item nesta categoria.',
            feedId: 'ID do feed {{id}}',
          },
          reasons: {
            alreadyExists: 'Este feed ja existe para o usuario.',
            duplicateInPayload: 'URL duplicada no envio em lote.',
            urlRequired: 'URL obrigatoria.',
            invalidUrl: 'Formato de URL invalido.',
          },
        },
        errors: {
          duplicate: 'Este feed ja foi adicionado.',
          invalidUrl: 'Informe uma URL valida iniciando com http:// ou https://.',
          generic: 'A operacao falhou. Tente novamente.',
        },
        list: {
          title: 'Feeds do usuario',
          caption: 'Total de {{count}} feeds • Pagina {{page}}',
          syncing: 'Sincronizando...',
          loading: 'Carregando feeds...',
          error: 'Nao foi possivel carregar os feeds. Tente novamente mais tarde.',
          empty: {
            title: 'Nenhum feed cadastrado ainda.',
            description: 'Adicione seus feeds individuais ou em lote para comecar a gerar posts.',
          },
          headers: {
            feed: 'Feed',
            lastFetchedAt: 'Ultima atualizacao',
            actions: 'Acoes',
          },
          untitled: 'Sem titulo',
          feedId: 'ID do feed {{id}}',
          neverFetched: 'Ainda nao processado',
          edit: {
            url: 'URL',
            title: 'Titulo',
            titlePlaceholder: 'Opcional',
            cancel: 'Cancelar',
            save: 'Salvar alteracoes',
            saving: 'Salvando...',
            trigger: 'Editar',
            errors: {
              urlRequired: 'Informe uma URL.',
              invalidUrl: 'Informe uma URL valida iniciando com http:// ou https://.',
            },
          },
          feedback: {
            updated: 'Feed atualizado com sucesso.',
            removed: 'Feed removido com sucesso.',
          },
          deleteConfirm: 'Remover este feed?',
          delete: 'Excluir',
          deleting: 'Removendo...',
          pagination: {
            page: 'Pagina {{page}}',
            previous: 'Anterior',
            next: 'Proxima',
          },
        },
      },
      posts: {
        meta: { title: 'lkdposts - Posts' },
        heading: 'Posts recentes',
        subtitle: 'Acompanhe os posts gerados ao lado dos trechos das noticias originais.',
        filters: {
          feedLabel: 'Filtrar por feed',
          feedAll: 'Todos os feeds',
          feedFallback: 'Feed {{id}}',
          empty: {
            title: 'Nenhum feed disponivel ainda.',
            description: 'Adicione feeds na pagina de Feeds para comecar a gerar posts.',
            cta: 'Gerenciar feeds',
          },
          error: 'Nao foi possivel carregar seus feeds. Tente atualizar a pagina.',
        },
        actions: {
          refresh: 'Atualizar',
          refreshing: 'Atualizando...',
        },
        errors: {
          generic: 'A operacao falhou. Tente novamente.',
          refresh: 'Nao foi possivel atualizar seus feeds.',
          cleanup: 'Nao foi possivel limpar artigos antigos.',
          list: 'Nao foi possivel carregar os posts. Tente novamente mais tarde.',
          partial: 'Algumas operacoes terminaram com erros.',
        },
        messages: {
          syncing: 'Sincronizando...',
        },
        cleanup: {
          description: 'Removidos {{articles}} artigos e {{posts}} posts com mais de sete dias.',
        },
        summary: {
          title: 'Resumo da atualizacao',
          executedAt: 'Executado em {{date}}',
          show: 'Mostrar resumo da atualizacao',
          hide: 'Ocultar resumo da atualizacao',
          empty: 'Nenhum feed foi processado na ultima atualizacao.',
          feedFallback: 'Feed {{id}}',
          skippedByCooldown: 'Ignorado por estar em cooldown.',
          cooldownRemaining: 'Cooldown restante: {{seconds}}s',
          itemsRead: 'Itens lidos',
          itemsWithinWindow: 'Itens na janela',
          articlesCreated: 'Artigos criados',
          duplicates: 'Duplicatas',
          invalidItems: 'Entradas invalidas',
          error: 'Erro: {{message}}',
        },
        list: {
          metadata: {
            publishedAt: 'Publicado em {{date}}',
            feed: 'Feed: {{feed}}',
            createdAt: 'Gerado em {{date}}',
            feedUnknown: 'Feed indisponivel',
            feedFallback: 'Feed {{id}}',
          },
          sections: {
            post: 'POST',
            article: 'NOTICIA',
          },
          postUnavailable: 'Post ainda nao disponivel.',
          empty: {
            default: {
              title: 'Nenhum post recente.',
              description: 'Posts dos ultimos sete dias aparecerao aqui apos uma atualizacao.',
            },
            filtered: {
              title: 'Nenhum post para este feed.',
              description: 'Selecione outro feed ou atualize para buscar novos posts.',
            },
          },
        },
        pagination: {
          page: 'Pagina {{page}}',
          previous: 'Anterior',
          next: 'Proxima',
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
    compatibilityJSON: 'v3',
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



