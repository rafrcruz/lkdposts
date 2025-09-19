# Frontend lkdposts

SPA leve em React + Vite com TypeScript, Tailwind e TanStack Query para consumir o backend Express.

## Stack
- React 19 com React Router para roteamento simples
- TypeScript estrito
- TanStack Query para cache e revalidação dos dados obtidos da API
- Tailwind 3 com tokens básicos e suporte a tema claro/escuro
- i18next (pt-BR / en) com detecção automática de idioma
- Vite 5 + Vitest, ESLint e Prettier

## Estrutura de pastas
```
src/
  app/          # composição das rotas e layout principal
  components/   # componentes reutilizáveis (navegação, feedback)
  config/       # configuração de i18n e variáveis de ambiente
  features/     # módulos por domínio (ex.: hello)
  lib/          # utilitários de acesso à API
  pages/        # páginas carregadas pelas rotas
  styles/       # estilos globais e tokens Tailwind
  test/         # setup de testes (Vitest + Testing Library)
```

## Como rodar
```bash
npm install
cp .env.example .env  # ajuste VITE_API_URL se necessário
npm run dev           # http://localhost:5173
```

### Verificações locais
```bash
npm run lint
npm run type-check
npm test
npm run build
```

## Scripts
| Script | Descrição |
|--------|-----------|
| `npm run dev` | Desenvolvimento com HMR |
| `npm run build` | Checagem de tipos + build de produção |
| `npm run preview` | Preview do build |
| `npm run lint` | ESLint com regras para TypeScript e acessibilidade |
| `npm run type-check` | `tsc --noEmit` |
| `npm test` / `npm run test:watch` | Testes com Vitest + Testing Library |
| `npm run format` / `npm run format:check` | Prettier |
| `npm run ci` | Pipeline local (lint → type-check → test → build) |

## Variáveis de ambiente
- `VITE_API_URL`: URL do backend (padrão `http://localhost:3001`)
- `VITE_DEFAULT_LOCALE`: idioma padrão (`pt-BR`)
- `VITE_FALLBACK_LOCALE`: idioma de fallback (`en`)

## Observações
- O cliente HTTP foi simplificado para aproveitar os recursos do TanStack Query.
- Providers adicionais (auth, notificações, PWA, feature flags) foram removidos para manter o código enxuto. Reintroduza conforme a aplicação crescer.
