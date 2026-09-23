# Contratos REST principais

Prefixo: `/api`. Todos os endpoints exigem `Authorization: Bearer <token de sessão Clerk>`. `user_id` não é aceito como entrada. IDs são UUIDs internos e todas as referências são verificadas no contexto do usuário.

Valores monetários usam strings com ponto decimal (por exemplo `"125.50"`), nunca números JSON. Datas são `YYYY-MM-DD`; meses são `YYYY-MM`. A interface aceita vírgula e normaliza antes do envio. Erros retornam `{ "message": "..." }`, sem SQL ou segredos.

## Identidade, contas e categorias

- `GET /me`: identidade interna, moeda e fuso.
- `GET /accounts`: contas com saldo atual derivado.
- `POST /accounts`: `name`, `nature`, `purpose`, `opening_balance`, `opening_date`.
- `PATCH /accounts/:id`: nome, saldo/data de abertura ou estado de arquivamento. Correções da abertura são auditadas; a data não pode ultrapassar movimentos existentes. Arquivamento exige saldo zero.
- `GET /categories`: categorias individuais; inicializa os padrões no primeiro uso.
- `POST /categories`: `name`, `kind` (`income` ou `expense`).
- `PATCH /categories/:id`: `name` e/ou `archived`.

Natureza de conta: `bank`, `cash`, `benefit`, `pot`, `other`. Finalidade: `available`, `restricted`, `reserved`. Não há múltiplas moedas.

## Movimentações

- `GET /transactions?month=YYYY-MM&page=1`: 50 registros por página; filtros opcionais `account_id` e `category_id`. `total_count` acompanha os registros retornados.
- `POST /transactions`: exige `Idempotency-Key` UUID.
- `PATCH /transactions/:id`: representação completa da movimentação e `version` atual. Conflito retorna HTTP 409. Pagamento de fatura exige exclusão/recriação pelo fluxo próprio.
- `DELETE /transactions/:id?version=N`: exclusão lógica; reabre ocorrência ou fatura vinculada.

Campos comuns: `kind`, `description`, `amount`, `occurred_on`.

- Receita (`income`): `destination_id`, `category_id` de receita.
- Despesa (`expense`): `source_id`, `category_id` de despesa.
- Transferência (`transfer`): `source_id`, `destination_id`, `received`. Se recebido for menor que enviado, `category_id` de despesa é obrigatório; se forem iguais, categoria deve ser ausente/null.

Campos incompatíveis devem ser ausentes/null. Datas reais futuras são rejeitadas.

## Recorrências

- `GET/POST /recurrences`: criação com descrição, tipo, conta, categoria (ou destino para transferências), valor, dia esperado, início e fim opcional.
- `PATCH /recurrences/:id`: `active`, `description` e/ou `amount`. Alterações de valor/descrição alcançam pendências de hoje em diante.
- `GET /occurrences?month=YYYY-MM`: gera previsões idempotentemente e lista o mês, sem alterar saldos.
- `PATCH /occurrences/:id`: `state` (`pending`/`skipped`), `description` e/ou `amount`. Não altera ocorrência confirmada.
- `POST /occurrences/:id/confirm`: exige `Idempotency-Key`; corpo `account_id`, `amount`, `occurred_on` reais.
- `POST /occurrences/:id/link-transaction`: `transaction_id` de lançamento existente compatível. Não cria outro movimento.

## Orçamentos e metas

- `GET /budgets/:month`: categorias, limite efetivo, origem (`future` para padrão ou `month` para exceção), realizado, previsto, parcelas, restante e margem calculados.
- `PUT /budgets/:month`: salva `category_id`, `amount` e `scope`. `future` cria uma nova versão válida deste mês em diante; `month` cria uma exceção somente para o mês indicado.
- `DELETE /budgets/:month/:categoryId/override`: remove a exceção mensal e volta a usar o orçamento padrão. Criação, substituição, encerramento e remoção são auditados.
- `GET/POST /goals`: nome, conta reservada, objetivo, aporte planejado e prazo opcional. Consultas retornam saldo, restante, progresso e estimativa de meses calculados.
- `PATCH /goals/:id`: nome, objetivo, aporte, prazo ou arquivamento. A conta vinculada é preservada.

## Cartões

- `GET/POST /cards`: nome, dia de fechamento e dia de vencimento. Não armazena número de cartão.
- `GET /purchases`: compras e dívida restante.
- `POST /purchases`: exige `Idempotency-Key`; `card_id`, `category_id`, `description`, `purchased_on`, `amount` total, `installments` (1 a 60), `first_invoice_month` opcional (mês de fechamento).
- `DELETE /purchases/:id`: exclusão lógica, apenas quando não há faturas pagas associadas.
- `GET /invoices`: faturas, totais e referência do pagamento.
- `GET /invoices/:id`: detalhes das parcelas e categorias.
- `POST /invoices/:id/pay`: exige `Idempotency-Key`; `account_id`, `occurred_on`, `expected_amount`. Apenas pagamento integral. Se o total atual diferir do revisado, retorna 409.

## Relatórios

- `GET /reports/overview?month=YYYY-MM`: posição na data informada, fluxos do mês, dívida, evolução em 12 meses, médias e orçamento.
- `GET /reports/annual?year=YYYY`: posição no fim do ano (ou hoje, no ano corrente), fluxos anuais e evolução. Orçamento permanece mensal na tela própria.

Uma confirmação repetida com outros dados não edita o pagamento existente: retorna conflito. Idempotência é vinculada ao usuário, operação e conteúdo do pedido.
