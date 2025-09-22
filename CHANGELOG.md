# Changelog

## 2025-01-21
- Padronizada a arquitetura do backend em camadas (`controllers` → `services` → `repositories`) com validações centralizadas em `schemas/`.
- Substituídos acessos diretos ao Prisma por repositórios desacoplados, evitando N+1 e facilitando testes.
- Adicionados middlewares de validação com Zod, cache HTTP (`res.withCache`) e cache em memória configurável para leitura de feeds RSS.
- Atualizados limites de paginação e contratos de erro padronizados em todas as rotas públicas.
- Implementada paginação na allowlist com metadados de resposta e validação consistente.
- Configurado Sentry com amostragem controlada via variáveis de ambiente no backend e frontend.
- Ajustada a build do Vite com `manualChunks` e minificação consistente para reduzir o bundle.
- Documentação revisada com nova estrutura de pastas, variáveis `.env` e orientações operacionais.
