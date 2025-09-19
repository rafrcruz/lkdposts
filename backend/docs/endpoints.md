# Catálogo de Endpoints

| Método | Caminho             | Descrição                            | Autenticação |
|--------|---------------------|----------------------------------------|--------------|
| GET    | /health/live        | Verifica se o serviço está vivo        | Não          |
| GET    | /health/ready       | Verifica se o serviço está pronto      | Não          |
| GET    | /metrics            | Retorna métricas Prometheus            | Não*         |
| GET    | /docs               | Interface Swagger/OpenAPI              | Não          |
| GET    | /api/v1/hello       | Retorna a mensagem hello mundo         | Não          |

> \* Recomenda-se proteger /metrics com autenticação na produção.
