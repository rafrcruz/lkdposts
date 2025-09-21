# Catálogo de Endpoints

| Método | Caminho                  | Descrição                                                       | Autenticação |
|--------|--------------------------|-------------------------------------------------------------------|--------------|
| GET    | /health/live             | Verifica se o serviço está vivo                                   | Não          |
| GET    | /health/ready            | Verifica se o serviço está pronto                                 | Não          |
| GET    | /metrics                 | Retorna métricas Prometheus                                       | Não*         |
| GET    | /docs                    | Interface Swagger/OpenAPI                                         | Não          |
| GET    | /api/v1/hello            | Retorna a mensagem hello mundo                                    | Não          |
| POST   | /api/v1/posts/refresh    | Atualiza os feeds do usuário e cria novos artigos/posts recentes  | Sim          |
| POST   | /api/v1/posts/cleanup    | Remove artigos antigos (>7 dias) e seus posts associados          | Sim          |
| GET    | /api/v1/posts            | Lista artigos recentes (≤7 dias) com posts e metadados paginados  | Sim          |

> \* Recomenda-se proteger /metrics com autenticação na produção.
