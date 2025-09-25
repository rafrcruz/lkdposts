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
        posts: 'Posts',
        feeds: 'Feeds',
        allowlist: 'Allowlist',
        appParams: 'App parameters',
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
          checking: 'Checking your session...',
        },
      },
      actions: {
        tryAgain: 'Try again',
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
          refreshCooldown: 'Wait {{time}} before refreshing again.',
        },
        diagnostics: {
          title: 'Diagnostics (admin)',
          refreshCount: 'Refreshes (session)',
          cooldownBlocks: 'Cooldown blocks (session)',
          avgFetchDuration: 'Avg fetch duration (ms, session)',
        },
        errors: {
          generic: 'The operation failed. Try again.',
          network: 'We could not connect. Check your network and try again.',
          refresh: 'Could not refresh your feeds.',
          cleanup: 'Could not clean old articles.',
          list: 'Could not load posts. Try again later.',
          partial: 'Some operations finished with errors.',
        },
        messages: {
          syncing: 'Syncing...',
        },
        cleanup: {
          description: 'Removed {{articles}} articles and {{posts}} posts older than {{days}} days.',
        },
        summary: {
          title: 'Refresh summary',
          executedAt: 'Executed at {{date}}',
          show: 'Show refresh summary',
          hide: 'Hide refresh summary',
          dismiss: 'Dismiss summary',
          empty: 'No feed was processed during the latest refresh.',
          feedFallback: 'Feed {{id}}',
          skippedByCooldown: 'Skipped by cooldown window.',
          cooldownRemaining: 'Cooldown remaining: {{time}}.',
          cooldownTime: {
            minutesSeconds: '{{minutes}} min {{seconds}} s',
            minutes: '{{minutes}} min',
            seconds: '{{seconds}} s',
          },
          itemsRead: 'Items read',
          itemsWithinWindow: 'Items within < {{days}}d',
          articlesCreated: 'Articles created',
          duplicates: 'Duplicates',
          invalidItems: 'Invalid entries',
          error: 'Error: {{message}}',
          partialError: 'Some feeds returned errors during the refresh.',
          metrics: {
            feedsProcessed: 'Feeds processed',
            feedsSkipped: 'Feeds skipped',
            feedsWithErrors: 'Feeds with errors',
          },
          feedStatus: {
            ok: 'Updated',
            skipped: 'Skipped',
            error: 'Error',
          },
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
          article: {
            readMore: 'See more',
            readLess: 'See less',
            partialAdminNotice: 'This article looks partial. Review the feed extraction.',
            unavailable: 'News content not available yet.',
          },
          empty: {
            default: {
              title: 'No recent posts.',
              description: 'Posts from the last {{days}} days will appear here after a refresh.',
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
      news: {
        list: {
          metaTitle: 'lkdposts - News',
          heading: 'Latest highlights',
          subtitle: 'Explore the most recent news processed from your feeds.',
          empty: {
            title: 'No posts found.',
            description: 'Refresh your feeds to generate new content.',
            cta: 'Refresh list',
          },
          error: {
            title: 'We could not load your posts.',
            description: 'Check your connection and try again.',
            retry: 'Try again',
          },
        },
        detail: {
          metaTitle: 'lkdposts - News article',
          back: 'Go back',
          backToList: 'Back to post list',
          original: 'Open original article',
          publishedAt: 'Published on {{date}}',
          missing: 'We could not find this news entry.',
          invalid: 'Invalid article address.',
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
      appParams: {
        heading: 'Application parameters',
        subtitle: 'Adjust how posts are processed and presented across the app.',
        fields: {
          refreshCooldown: 'Refresh cooldown (seconds)',
          timeWindow: 'Posts time window (days)',
        },
        validation: {
          cooldownRequired: 'Enter an integer greater than or equal to zero.',
          cooldownNegative: 'Cooldown cannot be negative.',
          windowRequired: 'Enter an integer greater than or equal to one.',
          windowTooSmall: 'The time window must be at least one day.',
        },
        feedback: {
          successWithReset: 'Parameters updated successfully. Feeds reset based on the new configuration.',
          successResetFailed:
            'Parameters updated successfully, but we could not reset the feeds automatically. Try again from the feeds page.',
          error: 'We could not update the parameters. Try again later.',
        },
        actions: {
          save: 'Save',
          saving: 'Saving...',
          cancel: 'Cancel',
          retry: 'Try again',
          retrying: 'Retrying...',
        },
        status: {
          refreshing: 'Syncing parameters...',
        },
        errors: {
          loadFailed: 'We could not load the parameters.',
          retry: 'Try again. If the issue persists, contact support.',
        },
      },
      forbidden: {
        title: '403 - Access denied',
        description:
          'You do not have permission to access this page. Contact an administrator if you need access.',
        backToPosts: 'Back to Posts',
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
        posts: 'Posts',
        feeds: 'Feeds',
        allowlist: 'Allowlist',
        appParams: 'Parametros',
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
          checking: 'Verificando sessao...',
        },
      },
      actions: {
        tryAgain: 'Tentar novamente',
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
          refreshCooldown: 'Aguarde {{time}} antes de atualizar novamente.',
        },
        diagnostics: {
          title: 'Diagnostico (admin)',
          refreshCount: 'Atualizacoes (sessao)',
          cooldownBlocks: 'Bloqueios por cooldown (sessao)',
          avgFetchDuration: 'Tempo medio de busca (ms, sessao)',
        },
        errors: {
          generic: 'A operacao falhou. Tente novamente.',
          network: 'Nao foi possivel conectar. Verifique sua conexao e tente novamente.',
          refresh: 'Nao foi possivel atualizar seus feeds.',
          cleanup: 'Nao foi possivel limpar artigos antigos.',
          list: 'Nao foi possivel carregar os posts. Tente novamente mais tarde.',
          partial: 'Algumas operacoes terminaram com erros.',
        },
        messages: {
          syncing: 'Sincronizando...',
        },
        cleanup: {
          description: 'Removidos {{articles}} artigos e {{posts}} posts com mais de {{days}} dias.',
        },
        summary: {
          title: 'Resumo da atualizacao',
          executedAt: 'Executado em {{date}}',
          show: 'Mostrar resumo da atualizacao',
          hide: 'Ocultar resumo da atualizacao',
          dismiss: 'Dispensar resumo',
          empty: 'Nenhum feed foi processado na ultima atualizacao.',
          feedFallback: 'Feed {{id}}',
          skippedByCooldown: 'Ignorado por estar em cooldown.',
          cooldownRemaining: 'Cooldown restante: {{time}}.',
          cooldownTime: {
            minutesSeconds: '{{minutes}} min e {{seconds}} seg',
            minutes: '{{minutes}} min',
            seconds: '{{seconds}} seg',
          },
          itemsRead: 'Itens lidos',
          itemsWithinWindow: 'Itens dentro de < {{days}}d',
          articlesCreated: 'Artigos criados',
          duplicates: 'Duplicatas',
          invalidItems: 'Entradas invalidas',
          error: 'Erro: {{message}}',
          partialError: 'Alguns feeds retornaram erros durante a atualizacao.',
          metrics: {
            feedsProcessed: 'Feeds processados',
            feedsSkipped: 'Feeds ignorados',
            feedsWithErrors: 'Feeds com erros',
          },
          feedStatus: {
            ok: 'Atualizado',
            skipped: 'Ignorado',
            error: 'Erro',
          },
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
          article: {
            readMore: 'Ver mais',
            readLess: 'Ver menos',
            partialAdminNotice: 'Conteudo parcial da noticia. Verifique a coleta no feed.',
            unavailable: 'Noticia indisponivel no momento.',
          },
          empty: {
            default: {
              title: 'Nenhum post recente.',
              description: 'Posts dos ultimos {{days}} dias aparecerao aqui apos uma atualizacao.',
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
      news: {
        list: {
          metaTitle: 'lkdposts - Notícias',
          heading: 'Novidades geradas',
          subtitle: 'Confira os destaques das notícias processadas recentemente.',
          empty: {
            title: 'Nenhum post encontrado.',
            description: 'Atualize seus feeds para gerar novos posts.',
            cta: 'Atualizar lista',
          },
          error: {
            title: 'Não foi possível carregar os posts.',
            description: 'Verifique sua conexão e tente novamente.',
            retry: 'Tentar novamente',
          },
        },
        detail: {
          metaTitle: 'lkdposts - Notícia',
          back: 'Voltar',
          backToList: 'Voltar para a lista de posts',
          original: 'Abrir notícia original',
          publishedAt: 'Publicado em {{date}}',
          missing: 'Não encontramos os detalhes desta notícia.',
          invalid: 'Endereço inválido para a notícia.',
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
      appParams: {
        heading: 'Parametros da aplicacao',
        subtitle: 'Ajuste os valores que controlam o processamento e a exibicao dos posts.',
        fields: {
          refreshCooldown: 'Cooldown de atualizacao (segundos)',
          timeWindow: 'Janela de tempo dos posts (dias)',
        },
        validation: {
          cooldownRequired: 'Informe um numero inteiro maior ou igual a zero.',
          cooldownNegative: 'O cooldown nao pode ser negativo.',
          windowRequired: 'Informe um numero inteiro maior ou igual a um.',
          windowTooSmall: 'A janela de tempo deve ter pelo menos um dia.',
        },
        feedback: {
          successWithReset: 'Parametros atualizados com sucesso. Feeds resetados com base nos novos parametros.',
          successResetFailed:
            'Parametros atualizados com sucesso, mas nao foi possivel resetar os feeds automaticamente. Tente novamente na tela de feeds.',
          error: 'Nao foi possivel atualizar os parametros. Tente novamente mais tarde.',
        },
        actions: {
          save: 'Salvar',
          saving: 'Salvando...',
          cancel: 'Cancelar',
          retry: 'Tentar novamente',
          retrying: 'Tentando novamente...',
        },
        status: {
          refreshing: 'Sincronizando parametros...',
        },
        errors: {
          loadFailed: 'Nao foi possivel carregar os parametros.',
          retry: 'Tente novamente. Se o problema persistir, contate o suporte.',
        },
      },
      forbidden: {
        title: '403 - Acesso negado',
        description:
          'Voce nao tem permissao para acessar esta pagina. Verifique com um administrador se precisar de acesso.',
        backToPosts: 'Voltar para Posts',
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

const initialiseI18n = async () => {
  try {
    await i18n
      .use(LanguageDetector)
      .use(initReactI18next)
      .init({
        resources,
        fallbackLng: ENV.FALLBACK_LOCALE,
        lng: ENV.DEFAULT_LOCALE,
        compatibilityJSON: 'v4',
        interpolation: {
          escapeValue: false,
        },
        detection: {
          order: ['querystring', 'localStorage', 'navigator'],
          caches: ['localStorage'],
          lookupLocalStorage: 'lkdposts-language',
        },
      });
  } catch (error) {
    console.error('Failed to initialise i18n', error);
  }
};

void initialiseI18n();

export { default } from 'i18next';



