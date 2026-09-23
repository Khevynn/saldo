# Decisões de arquitetura

## Identidade e isolamento

Clerk cuida de cadastro, login e recuperação. `users.id` é um UUID interno; `identities(provider,subject)` faz o vínculo. Nenhuma entidade financeira conhece Clerk. A autorização usa o UUID da sessão validada, nunca um `user_id` recebido em JSON.

Todas as tabelas financeiras têm RLS forçada e políticas por `app.user_id`, configurado somente dentro da transação. O pool nunca recebe um `SET` persistente. A conexão da API utiliza `finance_app`, sem propriedade das tabelas, superusuário ou `BYPASSRLS`. Views têm `security_invoker=true`.

As referências financeiras usam `(user_id,id)`: mesmo um erro de aplicação não consegue conectar uma conta de A a uma movimentação de B. Consultas também filtram o usuário explicitamente. Auditoria permite somente leitura/inserção para a API.

As tabelas de identidade são acessadas somente pelo adaptador de autenticação, antes do contexto financeiro. Não há endpoint para consultar identidades de outros usuários.

## Dinheiro e datas

PostgreSQL `NUMERIC(19,2)`, JSON como strings decimais e `decimal.js` nas regras. Não há floats em valores persistidos. `Number` é usado em coordenadas de gráficos e percentuais de apresentação, não como fonte do saldo.

Datas financeiras são `DATE`, transportadas como `YYYY-MM-DD`, sem conversão de fuso. Timestamps técnicos são `TIMESTAMPTZ`. A aplicação considera Europe/Lisbon para o dia atual. Dados de abertura têm data própria; não são receitas.

## Movimento real

Receita, despesa e transferência são registros atômicos. Receita exige destino e categoria de receita. Despesa exige origem e categoria de despesa. Transferência exige contas distintas, valor enviado e recebido. Uma perda exige categoria de despesa. Todos os valores de movimentação são estritamente positivos.

`account_effects` transforma cada registro nos efeitos por conta. `cash_effects` produz receitas e despesas, incluindo perdas e alocações de faturas. Dashboard e orçamento consomem as mesmas definições.

Saldo = abertura + efeitos realizados até a data. Nenhum saldo atual é salvo. Contas arquivadas continuam no histórico e nos totais. Desativação exige saldo zero; saldo negativo é permitido nas contas ativas.

Transferência de 100 para 90: origem -100, destino +90, despesa de 10. Não se debita a perda novamente.

Correções usam `version` para impedir sobrescrita silenciosa. Exclusão é lógica e auditada, reabre ocorrências/faturas vinculadas e recalcula os resultados. Os valores históricos representam a versão atualmente corrigida, não um fechamento contábil imutável.

## Concorrência

Cada operação financeira executa numa transação Drizzle/PostgreSQL, com lock consultivo por usuário. Assim, as operações de pessoas diferentes continuam independentes; operações concorrentes da mesma pessoa são serializadas. O lock é obtido antes das leituras de domínio. O isolamento padrão READ COMMITTED permite que consultas posteriores ao lock vejam a última operação confirmada.

Chaves de idempotência UUID são vinculadas a usuário e hash do pedido. Uma repetição idêntica recebe o mesmo resultado. Reutilização com outro conteúdo recebe conflito. Confirmações de ocorrência e fatura também verificam o vínculo já existente.

Esse mecanismo é suficiente para o volume inicial. O teste HTTP cobre repetição concorrente sobre o banco embarcado serializado. O comando `test:postgres` validou os locks com várias conexões reais no PostgreSQL 18.4; o piloto deve repetir as verificações no destino de hospedagem.

## Cartões

Compra cria dívida, parcelas e faturas, sem efeito bancário. O mês da fatura identifica seu fechamento. Compra no dia de fechamento entra na mesma fatura; após o dia de fechamento entra na seguinte. O usuário pode informar explicitamente o primeiro mês de fechamento, pois emissores podem usar processamento diferente. Vencimento é a próxima ocorrência do dia configurado após o fechamento, com ajuste ao último dia do mês.

Parcelas preservam centavos; restos são distribuídos nas últimas parcelas. Uma compra de 100 em três vezes gera 33,33 + 33,33 + 33,34.

Pagamento integral debita a conta uma vez. `cash_effects` distribui o total pelas categorias das compras. O cliente envia também o total que revisou; se a composição mudar antes da confirmação, a API exige nova revisão em vez de pagar um valor inesperado. Uma fatura paga não recebe novas compras nem alterações na composição. Excluir pagamento reabre a fatura. Compras quitadas continuam no histórico.

Como a compra é uma obrigação real, ela aparece como dívida e reduz o saldo líquido acompanhado, mesmo antes do pagamento. Não é tratada como previsão incerta nem como despesa de caixa antecipada.

## Recorrências

Regra e ocorrência são separadas da movimentação. Consultar um mês materializa ocorrências idempotentemente. Nenhuma geração altera saldo. Dia 31 é ajustado ao último dia do mês. Ocorrências podem ser confirmadas, vinculadas a lançamento compatível, ignoradas ou reabertas.

Editar descrição/valor da regra afeta ocorrências pendentes de hoje em diante; passado e confirmações preservam seus dados. Alterar uma ocorrência isolada não altera a série. Desativar ignora pendências de hoje em diante; reativar não ressuscita automaticamente itens ignorados.

## Orçamentos e metas

`budget_rules` mantém versões do orçamento padrão por categoria, com mês inicial e final. Uma mudança “deste mês em diante” encerra a versão anterior e cria outra; regras futuras substituídas também permanecem registradas na auditoria. `budgets` contém somente exceções de um mês e tem precedência sobre a regra vigente. Registros mensais anteriores à migração continuam como exceções, preservando o histórico.

Realizado considera `cash_effects`. Previsto considera somente ocorrências pendentes. Comprometido com cartão considera parcelas de faturas não pagas pelo mês de vencimento. Confirmar um pagamento remove a respectiva pendência da soma, evitando duplicação.

Meta lê o saldo da conta reservada. Restante, progresso e quantidade estimada de meses são calculados com decimais. Estimativa pressupõe aporte constante, sem saques/rendimentos.

## Métricas

- Total nas contas: soma de saldos acompanhados até a data indicada.
- Disponível, reservado e restrito: subconjuntos mutuamente exclusivos por finalidade.
- Sobra: receitas reais menos despesas reais, incluindo perdas.
- Dívida: parcelas de compras existentes na data, não pagas até aquela data.
- Saldo líquido acompanhado: total nas contas menos dívida de cartão acompanhada. Não representa todo o patrimônio da pessoa.
- Médias: meses completos dentro da janela de 12 meses, excluindo o mês atual e o primeiro mês incompleto.
- Taxa de poupança: soma das sobras dividida pela soma das receitas; sem receitas positivas retorna indisponível.

## Fora do escopo

Não há microserviços, filas, Redis, event sourcing, CQRS, organizações, RBAC, cotação de investimentos, cartões com rotativo nem cenários estratégicos.
