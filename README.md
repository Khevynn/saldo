# Saldo: Controle financeiro pessoal

Aplicativo individual de finanças em EUR, com React/TypeScript, API REST NestJS, PostgreSQL, Drizzle e Clerk. Movimentações realizadas, previsões e dívidas são conceitos separados.

## O que está implementado

- Contas e cofrinhos, abertura com data e saldo calculado.
- Receitas, despesas, transferências comuns e com perda.
- Edição com controle de versão, exclusão lógica e auditoria.
- Categorias individuais editáveis e arquiváveis.
- Recorrências mensais, edição isolada ou das próximas previsões, confirmação com valor/data reais, ignorar/reabrir e vínculo com lançamento existente.
- Orçamento padrão contínuo por categoria, exceções mensais auditadas, realizado, previsto e parcelas pendentes.
- Metas cujo progresso deriva do saldo do cofrinho.
- Cartões, compras parceladas, faturas e pagamento integral.
- Dashboard mensal/anual, evolução de contas, receitas, despesas, médias e dívida pendente.
- Isolamento por usuário no backend e no PostgreSQL (RLS), chaves estrangeiras compostas e idempotência.

Esta é a primeira implementação local e ainda não está publicada. Os dados financeiros usados nos testes são sintéticos e não são cadastrados no banco da aplicação.

## Requisitos

- Node.js 22.12+ (verificado com Node 24).
- PostgreSQL 17+; Docker é uma alternativa local.
- Instância Clerk com cadastro aberto e verificação obrigatória de e-mail.

## Executar localmente

### Caminho simples, sem Docker

O projeto inclui PostgreSQL portátil como dependência de desenvolvimento. Ele não instala serviço no Windows, escuta somente em loopback e mantém os dados em `.local/development-postgres`.

```sh
npm ci
npm run setup:local
# Preencha as duas chaves Clerk em .env.
npm run dev:local
```

Se não houver `.env`, a preparação cria um com senhas locais aleatórias e porta 55432. Um arquivo existente é preservado. Depois disso, edite somente as configurações Clerk; não substitua o arquivo pelo `.env.example`, pois isso descartaria as credenciais aleatórias do banco. Para ajustar somente as URLs de banco a essa porta: `npm run setup:local -- --port=55432`.

`setup:local` aplica migrations, provisiona o usuário da API e encerra o banco. `dev:local` inicia banco, API e frontend. Encerrar o comando para os processos, preservando os dados. Se houver outro frontend aberto na porta 5173, encerre-o antes de iniciar o conjunto.

### PostgreSQL já instalado ou Docker

1. Instale as dependências: `npm ci`.
2. Copie `.env.example` para `.env` na raiz.
3. Configure `DATABASE_ADMIN_URL` (migrations), `DATABASE_URL` (API) e `APP_DB_PASSWORD`. As duas URLs devem apontar ao mesmo banco. A API exige o usuário `finance_app`; não use `postgres` nela.
4. Se usar Docker: `docker compose up -d`.
5. Execute `npm run db:migrate` com a credencial administrativa. As migrations são incrementais, transacionais e verificadas por hash; não altere migrations já aplicadas.
6. Execute `npm run db:provision`. Esse comando habilita login para `finance_app` com `APP_DB_PASSWORD` (mínimo 16 caracteres). Use a mesma senha, codificada para URL se necessário, em `DATABASE_URL`.
7. Configure `CLERK_SECRET_KEY` e `VITE_CLERK_PUBLISHABLE_KEY` da **mesma instância** Clerk. A chave secreta nunca deve usar prefixo `VITE_`.
8. Em `CLERK_AUTHORIZED_PARTIES`, inclua a origem exata do frontend, por exemplo `http://localhost:5173,http://127.0.0.1:5173`. Configure `WEB_ORIGIN` com essas mesmas origens.
9. No Clerk, habilite cadastro aberto, autenticação por e-mail e verificação do e-mail. Não há allowlist nem convites no código.
10. Execute `npm run dev`. Frontend: `http://localhost:5173`. API: `http://localhost:3000/api`.

### Aplicação completa no Docker

Este modo cria um ambiente isolado com PostgreSQL, migrations, API compilada e frontend React servido por Nginx. Ele não utiliza nem altera o PostgreSQL portátil em `.local/development-postgres`.

1. Instale e inicie o Docker Desktop.
2. Mantenha `CLERK_SECRET_KEY` e `VITE_CLERK_PUBLISHABLE_KEY` preenchidas no `.env` da raiz.
3. No Clerk, permita `http://localhost:8080` e `http://127.0.0.1:8080` como origens locais.
4. Execute:

```sh
npm run docker:up
```

Abra `http://localhost:8080`. O PostgreSQL fica disponível somente no computador local em `localhost:55433`. A API não expõe porta própria; o Nginx encaminha `/api` internamente.

Para conferir os containers e acompanhar logs:

```sh
docker compose ps
npm run docker:logs
```

Para parar sem perder os dados do banco Docker:

```sh
npm run docker:down
```

Ao subir novamente, as migrations já aplicadas são verificadas por hash e ignoradas com segurança. O volume `saldo-local_postgres_data` preserva os dados. Somente use `docker compose down -v` quando quiser apagar definitivamente o banco criado pelo Docker.

As senhas Docker padrão servem apenas ao teste local e os serviços escutam em loopback. Para disponibilização pública, use segredos próprios, TLS e um PostgreSQL gerenciado conforme `docs/operations.md`.

Sem a chave pública, a interface apresenta instruções de configuração. A API falha no início caso faltem configuração de autenticação, banco ou papel seguro. Não há bypass de autenticação em desenvolvimento.

O SDK faz autenticação no frontend; o backend valida assinatura, expiração, origem autorizada e sessão, e consulta o usuário Clerk para exigir e-mail principal verificado e rejeitar usuários banidos/removidos. Essa consulta é intencional nesta versão; indisponibilidade do provedor pode impedir acesso. O adaptador de identidade é substituível, mas não existe provedor alternativo implementado.

## Verificações

```sh
npm run typecheck
npm test
npm run build
```

Os testes de integração aplicam todas as migrations em PGlite, um motor PostgreSQL embarcado, e executam operações como o papel `finance_app`. Não é um mock de SQL. Os testes HTTP usam um adaptador de identidade exclusivo da suíte; os de interface usam respostas sintéticas. Nenhum desses adaptadores está ligado à execução normal da aplicação.

`npm run test:postgres` cria e encerra um PostgreSQL portátil isolado. A validação com PostgreSQL 18.4 passou com múltiplas conexões: 12 escritas idempotentes simultâneas, 10 confirmações da mesma ocorrência, oito pagamentos da mesma fatura, conflito de edição, 20 alternâncias de usuários e rollback. Esse teste também aplica o runner de migrations duas vezes e provisiona a credencial real da API.

Ainda é necessário validar a instância real Clerk e realizar um ciclo real de backup/restauração antes de disponibilizar a aplicação. O pacote portátil não inclui pg_dump/pg_restore; use as ferramentas do PostgreSQL ou backup gerenciado do destino de hospedagem. Testar concorrência local não substitui o piloto no ambiente de produção.

### Revisão visual sem credenciais

`npm run preview:ui` abre um servidor de teste em `http://127.0.0.1:5174`, com dados sintéticos e somente leitura. Ele usa configuração Vite separada; o adaptador de teste não entra no build do produto. Desktop, navegação móvel e modal de confirmação foram inspecionados no navegador. A marca “TESTE VISUAL” identifica esse ambiente.

## Organização

- `apps/api/src/auth`: adaptador Clerk e identidade interna.
- `apps/api/src/modules`: módulos financeiros, regras de escrita e relatórios.
- `apps/api/src/domain`: dinheiro e calendário.
- `apps/api/src/database`: execução Drizzle, contexto de usuário, migrations e provisionamento.
- `apps/api/migrations`: evolução versionada do PostgreSQL.
- `apps/web/src/features`: telas e formulários.
- `apps/web/src/components`: componentes de interface.
- `docs/architecture.md`: decisões, fórmulas e limites.
- `docs/operations.md`: execução e cuidados operacionais.

As migrations SQL são a fonte do esquema; Drizzle executa consultas SQL parametrizadas. Não use `drizzle-kit push` para modificar o banco fora desse histórico.

## Limites desta versão

- Somente EUR e regime de caixa.
- Cartão com pagamento integral, sem rotativo, juros automáticos ou pagamento parcial.
- Transferências com valores recebidos menores ou iguais aos enviados; sem câmbio ou ganhos.
- Recorrências mensais, sem confirmação automática e sem rateio de pagamentos parciais.
- Datas de acompanhamento entre 2000 e 2100.
- Um objetivo ativo por conta reservada.
- Planejamento estratégico, integrações bancárias, investimentos e compartilhamento não estão incluídos.
- Alterações em compras com faturas pagas exigem reabrir os pagamentos antes de excluir/recriar a compra. Isso preserva as alocações das despesas pagas.
- Alteração de dia de fechamento/vencimento do cartão e recuperação de registros excluídos ainda não possuem fluxos de interface.
- A interface usa componentes próprios e CSS com tokens; não foi introduzido um framework adicional de componentes para os poucos controles desta primeira versão.

Não foi realizada publicação, criação de conta externa ou configuração automática do Clerk.
