# lkdposts

Automação de posts para LinkedIn a partir de feeds RSS.

## Visão geral
O lkdposts permite que cada usuário cadastre seus próprios feeds RSS, colete notícias recentes e gere posts prontos para revisão antes da publicação no LinkedIn. O backend aplica normalização, deduplicação e janelas de retenção, enquanto o frontend oferece uma interface simples para gerenciar feeds e visualizar posts gerados.

## Arquitetura
- **Backend**: Node.js + Express com Prisma, PostgreSQL (Neon) e observabilidade via Sentry. A API expõe rotas autenticadas em `/api/v1` usando envelopes JSON padronizados.
- **Frontend**: React (Vite) com Tailwind CSS, TanStack Query e i18next para internacionalização.
- **Deploy**: Aplicação hospedada na Vercel, utilizando funções serverless para o backend e banco PostgreSQL gerenciado no Neon.

### Estrutura do código

```
backend/src
├── config        # carga e validação de variáveis de ambiente
├── controllers   # controladores finos que orquestram respostas HTTP
├── lib           # integrações com serviços externos (Prisma, Sentry)
├── middlewares   # middlewares compartilhados (auth, rate limit, response envelope, validações)
├── repositories  # camada de persistência isolando consultas Prisma
├── routes        # definição das rotas agrupadas por versão
├── schemas       # contratos Zod reutilizados por rotas e serviços
├── services      # regras de negócio e integração entre repositórios
├── startup       # bootstrap para ambientes serverless
└── utils         # utilitários puros (cache TTL, métricas, helpers)

frontend/src segue convenções equivalentes, com `config/`, `features/`, `lib/`, `pages/` e `utils/`.
```

Camadas de acesso (`controllers` → `services` → `repositories`) evitam SQL acoplado às rotas e permitem testes isolados.

## Pré-requisitos
- Node.js 20.19.0 LTS (compatível com `>=18.20.0`).
- npm 10 ou superior.
- Conta na **Vercel** para deploy do frontend + backend.
- Conta na **Neon** (ou PostgreSQL compatível com TLS) para o banco de dados.
- Projeto no **Google Cloud** com OAuth 2.0 habilitado para autenticação via Google.

## Configuração
### Backend
1. `cd backend`.
2. `cp .env.example .env` e ajuste as variáveis conforme a necessidade.
3. Instale dependências: `npm install`.
4. Gere e aplique migrações no ambiente local: `npm run db:migrate:dev`.

#### Variáveis obrigatórias (`backend/.env`)
| Variável | Descrição |
| --- | --- |
| `DATABASE_URL` | URL do PostgreSQL (Neon) com `sslmode=require` e usuário com permissão de leitura/escrita. |
| `GOOGLE_CLIENT_ID` | Client ID do app OAuth 2.0 configurado no Google. |
| `GOOGLE_CLIENT_SECRET` | Client secret correspondente ao client ID acima. |
| `GOOGLE_REDIRECT_URI` | URL de callback utilizada pelo backend (ex.: `http://localhost:3001/auth/callback/google`). |
| `SESSION_SECRET` | Chave aleatória (mínimo 16 caracteres) usada para assinar cookies de sessão. |
| `SUPERADMIN_EMAIL` | E-mail que receberá permissão de administrador no primeiro acesso. |

#### Variáveis opcionais importantes
| Variável | Valor padrão | Descrição |
| --- | --- | --- |
| `NODE_ENV` | `development` | Ambiente de execução. |
| `HOST` / `PORT` | `0.0.0.0` / `3001` | Interface e porta HTTP do servidor Express. |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173` | Lista de origens permitidas para o frontend. |
| `PAYLOAD_LIMIT` | `100kb` | Limite de tamanho do corpo das requisições. |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` | `60000` / `100` | Janela e quantidade máxima de requisições por IP. |
| `ENABLE_METRICS` | `true` | Habilita endpoint `/metrics` (Prometheus). |
| `CACHE_MAX_AGE_SECONDS` | `60` | Tempo padrão de cache HTTP para respostas públicas. |
| `CACHE_FEED_FETCH_TTL_SECONDS` | `120` | TTL (segundos) do cache em memória usado ao buscar RSS em produção. Use `0` para desabilitar. |
| `CACHE_FEED_FETCH_MAX_ENTRIES` | `16` | Quantidade máxima de feeds mantidos no cache em memória. |
| `SWAGGER_UI_ENABLED` | `true` | Exibe Swagger UI em `/docs`.
| `DEBUG_AUTH` | `false` | Ativa logs extras de autenticação. |
| `SESSION_TTL_SECONDS` | `3600` | Duração da sessão autenticada em segundos. |
| `SESSION_RENEW_THRESHOLD_SECONDS` | `900` | Janela para renovação antecipada da sessão. |
| `SENTRY_DSN_BACKEND` | vazio | DSN do Sentry para o backend. |
| `SENTRY_TRACES_SAMPLE_RATE` | `0.05` | Taxa de amostragem de transações enviada ao Sentry (0–1). |
| `SENTRY_PROFILES_SAMPLE_RATE` | `0` | Taxa de amostragem de profiles do Sentry (0–1). |
| `PRISMA_URL` | vazio | URL alternativa com pool (ex.: Neon connection pooling). |

### Frontend
1. `cd frontend`.
2. `cp .env.example .env` e preencha as variáveis necessárias.
3. Instale dependências: `npm install`.

#### Variáveis (`frontend/.env`)
| Variável | Obrigatória? | Descrição |
| --- | --- | --- |
| `VITE_API_URL` | Sim | URL do backend (ex.: `http://localhost:3001`). |
| `VITE_GOOGLE_CLIENT_ID` | Sim | Client ID do Google usado para o fluxo OAuth no navegador. |
| `VITE_DEFAULT_LOCALE` | Opcional | Locale padrão da UI (`pt-BR` por padrão). |
| `VITE_FALLBACK_LOCALE` | Opcional | Locale de fallback (`en`). |
| `VITE_SENTRY_DSN_FRONTEND` | Opcional | DSN do Sentry para monitoramento do frontend. |
| `VITE_SENTRY_TRACES_SAMPLE_RATE` | Opcional | Taxa de amostragem de transações (padrão `0.05`). |
| `VITE_SENTRY_PROFILES_SAMPLE_RATE` | Opcional | Taxa de amostragem de profiles (padrão `0`). |

## Rodando localmente
Abra dois terminais e execute:

```bash
# Terminal 1 - API
npm run dev --prefix backend

# Terminal 2 - Frontend
npm run dev --prefix frontend
```

- Backend: http://localhost:3001 (Swagger UI em http://localhost:3001/docs quando `SWAGGER_UI_ENABLED=true`).
- Frontend: http://localhost:5173 (consome o backend definido em `VITE_API_URL`).

## Rodando em produção (Vercel + Neon)
1. Crie um banco PostgreSQL no Neon e copie a `DATABASE_URL` (habilite connection pooling caso queira usar `PRISMA_URL`).
2. Configure um projeto na Vercel apontando para este repositório. A Vercel utilizará o runtime Node.js 20 definido em `vercel.json`.
3. Defina todas as variáveis de ambiente nas seções **Production** e **Preview** da Vercel:
   - Variáveis do backend começam com os mesmos nomes utilizados em `backend/.env`.
   - Variáveis do frontend começam com `VITE_` e precisam ser configuradas na aba "Environment Variables" do projeto Vercel para que o build do Vite as injete.
4. Ajuste `VITE_API_URL` para apontar para o domínio público do deploy (ex.: `https://seu-projeto.vercel.app/api`).
5. Rode as migrações em produção:
   - Localmente, exporte as variáveis de produção e execute `npm run db:migrate:deploy` dentro de `backend/`; **ou**
   - Utilize um job/Action apontando para o script `npm run db:migrate:deploy:vercel`, pensado para o ambiente serverless da Vercel.
6. Dispare o deploy. A Vercel construirá o frontend e exporá o backend em `/api` utilizando o adaptador de Express definido em `api/index.js`.

## Testes
- **Backend (Jest + Supertest)**: `npm test --prefix backend`
- **Frontend (Vitest + Testing Library)**: `npm test --prefix frontend`

Tests adicionais (lint, type-check) podem ser executados com `npm run lint --prefix backend`, `npm run lint --prefix frontend` e `npm run type-check --prefix frontend` conforme necessário.

## APIs e documentação
- Swagger UI: `http://localhost:3001/docs`
- Especificação OpenAPI 3.1 gerada automaticamente em `backend/docs/openapi.json` (`npm run docs:generate --prefix backend`).

## Notas adicionais
- As rotas validam parâmetros e payloads via Zod, retornando o envelope padrão de erro com código `INVALID_INPUT` em caso de inconsistências.
- Listagens (`feeds`, `posts`) aplicam paginação com limites seguros e definem `Cache-Control: private` por padrão.
- Fetch de feeds RSS utiliza cache em memória com TTL configurável para reduzir custos em ambientes serverless.
- Sentry utiliza amostragem configurável para respeitar a cota do plano gratuito (backend e frontend).
- Consulte `CHANGELOG.md` e `NOTAS_DE_MIGRACAO.md` para detalhes de evolução e eventuais ajustes necessários após atualizar o projeto.

Com o README e a especificação OpenAPI atualizados, um novo desenvolvedor consegue provisionar o banco no Neon, configurar credenciais Google, rodar a aplicação localmente e publicar na Vercel sem passos adicionais.
