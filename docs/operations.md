# Operação local e preparação para disponibilização

## Credenciais

Separe o usuário que aplica migrations do usuário da API. A senha no exemplo é apenas local; escolha segredos próprios e nunca versione `.env`. Em produção, injete somente DATABASE_URL e as variáveis de runtime no processo da API. Não disponibilize DATABASE_ADMIN_URL nem APP_DB_PASSWORD a ele.

O frontend usa apenas a chave **pública** Clerk. A chave secreta fica no backend. A autenticação está em um adaptador, mas Clerk continua sendo uma dependência operacional do acesso. Não existe login alternativo oculto.

## Rede

O ambiente local escuta em loopback. Em produção, a API escuta em `0.0.0.0` para funcionar em containers. Configure proxy reverso com TLS e sirva frontend e `/api` na mesma origem. Revise `WEB_ORIGIN`, `CLERK_AUTHORIZED_PARTIES` e as origens permitidas na instância Clerk. O Bearer token é enviado no cabeçalho Authorization; a API não autentica via cookies.

Configure `TRUST_PROXY` somente com a quantidade de proxies confiáveis ou uma faixa nomeada suportada pelo Express. Uma configuração ampla permite falsificar o IP usado pelo limitador. O limitador usa a identidade autenticada e usa IP nas rotas públicas.

O limitador em memória funciona em uma única réplica. Antes de executar mais de uma réplica da API, substitua o armazenamento por Redis ou pelo limitador do gateway. Cadastro aberto exige acompanhar abuso, custos e limites da instância Clerk. Não existe limite arbitrário de cinco usuários.

O frontend deve ser entregue com os cabeçalhos presentes em `apps/web/public/_headers`. Confirme que o provedor os aplica. Ative HSTS no ponto que encerra TLS. Defina uma CSP depois de confirmar os domínios Clerk da instância; uma política genérica pode bloquear login. A API define `Cache-Control: no-store` em todas as respostas.

## Configuração de produção

Use `NODE_ENV=production`, `CLERK_JWT_KEY` e uma `DATABASE_URL` que contenha `sslmode=require`, `sslmode=verify-ca` ou `sslmode=verify-full`. Prefira `verify-full` quando o provedor disponibilizar a cadeia de certificados. A API recusa inicialização sem essas condições.

Use `CLERK_AUDIENCE` se os tokens da instância possuírem audiência dedicada. A validação de assinatura ocorre localmente. O estado banido e a verificação do e-mail ficam em cache por até `CLERK_STATUS_CACHE_SECONDS`, limitado a cinco minutos, para evitar uma chamada Clerk em toda requisição.

Dimensione `DB_POOL_MAX` considerando todas as réplicas e o limite total de conexões do PostgreSQL. Os timeouts de conexão, consulta e transação impedem que operações travadas ocupem o pool indefinidamente. `GET /api/health/live` verifica o processo e `GET /api/health/ready` verifica o banco. Não exponha métricas com dados financeiros.

## Migrations

`npm run db:migrate` usa lock consultivo global e registra hash dos arquivos. Se houver uma migration aplicada, alterações no arquivo original são rejeitadas. Crie um novo arquivo numerado para evoluir o esquema. A aplicação de cada arquivo e seu registro no histórico ocorrem na mesma transação.

Não use sincronização automática de esquema em produção. Faça backup e revise migrations antes de aplicá-las a dados reais.

## Backup e restauração

A automação de backup depende do destino de hospedagem, que ainda não foi escolhido. Não há backup agendado configurado nesta entrega. `npm run db:backup` produz uma cópia JSON local consistente e um checksum SHA-256 para proteção antes de migrations. Esse arquivo contém dados pessoais em texto e não substitui o backup de produção.

Antes de disponibilizar, configure backup diário no provedor PostgreSQL ou execute `pg_dump` em formato custom para armazenamento protegido, com retenção e criptografia. Não passe senha em argumentos visíveis de processo; use mecanismo seguro do provedor ou `PGPASSFILE` protegido.

Valide a restauração em **outro banco vazio**, usando `pg_restore --no-owner --no-acl`. Crie o papel `finance_app` e reaplique os grants/políticas apropriados ao ambiente restaurado. Confirme contagens, saldos, auditoria e isolamento usando a credencial da API. Não restaure sobre o banco de origem para testar.

Uma restauração não é considerada validada apenas porque o arquivo de backup existe. Este ensaio ainda precisa ser realizado no ambiente de destino.

## Checklist para o piloto

1. Aplicar migrations no PostgreSQL de destino e confirmar que a API usa finance_app.
2. Fazer cadastro de dois usuários reais no Clerk, verificar e-mails e testar isolamento via API.
3. Registrar receita, despesa, transferência com perda, recorrência e compra parcelada.
4. Confirmar uma fatura e comparar saldo, orçamento e categoria.
5. Repetir confirmação simultaneamente por duas conexões e verificar ausência de duplicação.
6. Executar backup/restauração num banco separado.
7. Validar frontend no celular com sessão Clerk real.
8. Confirmar cabeçalhos do frontend, TLS, HSTS, CORS e `TRUST_PROXY` no domínio final.
9. Configurar alertas para falhas de readiness, erros 5xx, saturação do pool e espaço do banco.
10. Definir retenção de auditoria, processo de exportação e exclusão da conta segundo a política de privacidade.

## Crescimento

Leituras comuns não usam o lock consultivo por usuário. Escritas financeiras continuam serializadas por usuário para preservar consistência. A listagem de movimentações já é paginada. Compras, faturas, cartões, recorrências e metas ainda precisam de paginação antes de volumes grandes.

Relatórios calculam saldos históricos a partir do ledger e repetem algumas agregações mensais. Monitore tempo de resposta e plano de execução. Quando isso se tornar um problema comprovado, adicione snapshots mensais reconstruíveis ou uma visão materializada. Não transforme o saldo armazenado em fonte de verdade.

Idempotências antigas são removidas durante novas operações depois de `IDEMPOTENCY_RETENTION_DAYS`. Defina retenção e limpeza de auditoria somente após decidir os requisitos legais e de suporte. Exclusão completa e exportação de dados precisam de fluxo autenticado com confirmação recente no Clerk antes de serem oferecidas ao usuário.

Nenhum desses passos deve ser interpretado como já executado apenas porque os testes locais passaram.
