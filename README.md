# lkdposts

Automação de posts para LinkedIn a partir de feeds RSS.

## Estrutura do repositório
- `backend/`: API Express com middlewares de segurança, observabilidade básica e respostas padronizadas.
- `frontend/`: SPA React + Vite + Tailwind, consumindo o endpoint `/api/v1/hello` via TanStack Query.

## Requisitos
- Node.js **20.19.0** ou superior
- npm 10+

## Configuração rápida
```bash
# Backend
cd backend
cp .env.example .env          # ajuste CORS e porta se necessário
npm install
npm run dev                   # servidor em http://localhost:3001

# Frontend
cd ../frontend
cp .env.example .env          # ajuste VITE_API_URL se necessário
npm install
npm run dev                   # aplicação em http://localhost:5173
```

A interface consome o backend usando `VITE_API_URL` (padrão `http://localhost:3001`) e exibe a mensagem retornada.

## Back-end em detalhes
- **Segurança**: Helmet, CORS restrito, HPP, xss-clean, rate limiting e limite de payload.
- **Configuração**: variáveis de ambiente validadas com Zod (`backend/.env.example`).
- **Observabilidade**: métricas Prometheus opcionais (`/metrics`) e health checks (`/health/live` e `/health/ready`).
- **Documentação**: OpenAPI 3.1 gerada em `backend/docs/openapi.json` e disponível em `/docs`.
- **Respostas**: envelope JSON único com `success`, `data` e `meta.requestId`.

### Scripts úteis (`backend/package.json`)
- `npm run dev` – nodemon com recarregamento
- `npm run start` – execução em produção
- `npm run lint` – ESLint em `src/**/*.js`
- `npm test` – Jest + Supertest (smoke tests)
- `npm run build` – lint + test (gate local)
- `npm run docs:generate` – gera `docs/openapi.json`
- `npm run task -- <dev|test|build|docs>` – wrapper utilitário

## Front-end em detalhes
- Estrutura enxuta em TypeScript com React Router, TanStack Query e Tailwind tokens.
- Hooks locais + Query Client atendem às necessidades de estado para uma aplicação pequena.
- i18n configurado com i18next para `pt-BR` e `en`.
- Layout básico (`MainLayout`), navegação acessível e tema claro/escuro controlado no cliente.

### Scripts úteis (`frontend/package.json`)
- `npm run dev` – Vite com HMR
- `npm run build` – `tsc --noEmit` + build de produção
- `npm run preview` – serve o build gerado
- `npm run lint` – ESLint para `src/**/*.ts(x)`
- `npm test` – Vitest + Testing Library
- `npm run type-check`, `npm run format`, `npm run ci`

## CI
- `.github/workflows/backend-ci.yml`: lint → test → audit → build + OpenAPI como artefato.
- `.github/workflows/frontend-ci.yml`: lint → type-check → test → build com artefato do bundle.
- **Branch protection**: configure apenas os checks obrigatórios `backend-ci / build-test` e `frontend-ci / quality`; evite checks extras de lint bloqueando merge.
- **SonarCloud**: se surgirem comentários duplicados no PR, desative "Pull Request decoration" em SonarCloud (Project Settings -> General Settings -> Pull Request Decoration) ou mantenha apenas essa decoração sem outros bots.

## Documentação adicional
- `backend/docs/endpoints.md`: visão rápida dos endpoints expostos.
## Autenticacao e autorizacao
- Login exclusivo via Google. Apenas emails presentes na allowlist conseguem iniciar sessao.
- O primeiro acesso ja garante que `rafrcruz@gmail.com` seja administrador fixo.
- Usuarios autenticados recebem uma sessao assinada via cookie; todas as rotas `/api/v1` exigem essa sessao.
- Administradores acessam a pagina `/allowlist` no frontend para cadastrar, alterar papel ou remover emails.

## Variaveis de ambiente relevantes
### Backend
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
- `SESSION_SECRET`, `SESSION_TTL_SECONDS`, `SESSION_RENEW_THRESHOLD_SECONDS`
- `SUPERADMIN_EMAIL`
- `SENTRY_DSN_BACKEND`

### Frontend
- `VITE_API_URL`
- `VITE_GOOGLE_CLIENT_ID`
- `VITE_SENTRY_DSN_FRONTEND`

Configure `.env` e `.env.example` conforme os exemplos fornecidos para habilitar login e observabilidade.
