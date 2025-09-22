# Notas de Migração

1. **Validações obrigatórias nas rotas**: toda rota nova deve usar `validateRequest` com schemas em `src/schemas`. Controladores passam a ler dados de `req.validated`. Chamadas diretas a `req.body`/`req.query` não são mais recomendadas.
2. **Acesso ao banco via repositórios**: substitua usos diretos de `prisma.*` fora de `src/repositories` por funções de repositório. Isso mantém a separação de camadas e evita duplicação de regras de negócio.
3. **Cache de RSS configurável**: o serviço de posts usa o cache TTL em memória quando `CACHE_FEED_FETCH_TTL_SECONDS > 0`. Ajuste as variáveis de ambiente (`CACHE_FEED_FETCH_TTL_SECONDS`, `CACHE_FEED_FETCH_MAX_ENTRIES`) caso o consumo em Vercel precise ser mais agressivo ou desligado.
4. **Sentry com amostragem**: os novos parâmetros `SENTRY_TRACES_SAMPLE_RATE`/`SENTRY_PROFILES_SAMPLE_RATE` (backend e frontend) precisam ser definidos nos ambientes Vercel/Neon. Valores fora do intervalo `[0,1]` são rejeitados pela validação.
5. **Atualização de dependências internas**: se houver código customizado importando funções removidas (`parsePositiveInteger`, helpers em controllers), adapte para a nova API exposta pelos serviços ou mova a lógica para `src/utils`.
6. **Lista de allowlist paginada**: `GET /api/v1/allowlist` agora aceita `cursor` e `limit` e retorna metadados (`total`, `limit`, `nextCursor`). Clientes que consumiam a lista completa devem iterar usando a paginação.
