import Decimal from 'decimal.js';
import { Fragment, useState } from 'react';
import {
  ArrowLeftRight,
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  CreditCard,
  Pencil,
  Trash2,
  Check,
  SkipForward,
  RotateCcw,
  Plus,
  Archive,
  ArchiveRestore,
  ChevronRight,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  AddButton,
  Empty,
  EntityCombobox,
  LoadState,
  PageHeader,
  Panel,
  PeriodNavigator,
  Progress,
  type FormSpec,
} from '../components/ui';
import { currentDate, dateLabel, euro, useData, type Row } from '../lib/api';
import {
  accountForm,
  accountOptions,
  cardForm,
  decimal,
  goalForm,
  options,
  recurrenceCreateForm,
  transactionForm,
  transactionCreateForm,
} from './forms';
import type { PurchaseEditorSpec } from './purchase-dialog';

type Props = {
  month: string;
  setMonth: (month: string) => void;
  open: (form: FormSpec) => void;
  accounts: Row[];
  categories: Row[];
  openPurchase?: (spec: PurchaseEditorSpec) => void;
};
const kinds: Record<string, string> = {
  income: 'Receita',
  expense: 'Despesa',
  transfer: 'Transferência',
  card_payment: 'Fatura',
};
const accountSections = [
  {
    purpose: 'available',
    title: 'Contas disponíveis',
    description: 'Dinheiro disponível para pagamentos e transferências.',
  },
  {
    purpose: 'reserved',
    title: 'Cofrinhos e reservas',
    description: 'Dinheiro separado para objetivos e segurança.',
  },
  {
    purpose: 'restricted',
    title: 'Benefícios',
    description: 'Saldos com uso específico, como alimentação.',
  },
] as const;
const zeroForm = (
  title: string,
  path: string,
  method: string,
  description: string,
  map: () => unknown = () => ({}),
): FormSpec => ({ title, path, method, description, fields: [], map, submit: 'Confirmar' });

function AccountsLink({ small = false }: { small?: boolean }) {
  return (
    <Link className={`button${small ? ' secondary small' : ''}`} to="/accounts">
      Ir para Contas
      <ChevronRight size={16} />
    </Link>
  );
}

export function Accounts({ accounts, open }: Props) {
  return (
    <>
      <PageHeader
        eyebrow="CONTAS"
        title="Cada saldo no seu lugar."
        description="Contas, benefícios e cofrinhos. Sem duplicar seu dinheiro."
        action={<AddButton onClick={() => open(accountForm())}>Nova conta</AddButton>}
      />
      {!accounts.length ? (
        <Panel title="Suas contas">
          <Empty
            title="Cadastre sua primeira conta"
            action={<AddButton onClick={() => open(accountForm())}>Criar conta</AddButton>}
          >
            Informe o saldo existente e a data de início do acompanhamento.
          </Empty>
        </Panel>
      ) : (
        <div className="account-sections">
          {accountSections.map((section) => {
            const sectionAccounts = accounts.filter(
              (account) => account.purpose === section.purpose,
            );
            if (!sectionAccounts.length) return null;
            return (
              <section className="account-section" key={section.purpose}>
                <div className="account-section-header">
                  <h2>{section.title}</h2>
                  <p>{section.description}</p>
                </div>
                <div className="cards-grid">
                  {sectionAccounts.map((a) => (
                    <article className={`account-card ${a.archived ? 'archived' : ''}`} key={a.id}>
                      <div className="split">
                        <span className="account-icon">
                          <Wallet size={21} />
                        </span>
                        <span className="badge">
                          {a.archived
                            ? 'Arquivada'
                            : a.purpose === 'reserved'
                              ? 'Reserva'
                              : a.purpose === 'restricted'
                                ? 'Benefício'
                                : 'Dia a dia'}
                        </span>
                      </div>
                      <h2>{a.name}</h2>
                      <strong className={Number(a.balance) < 0 ? 'danger' : ''}>
                        {euro(a.balance)}
                      </strong>
                      <p>Saldo atual · desde {dateLabel(a.opening_date)}</p>
                      {Number(a.balance) < 0 && (
                        <p className="danger">
                          Saldo negativo. Verifique os registros desta conta.
                        </p>
                      )}
                      <div className="card-actions">
                        <button
                          className="icon-button"
                          aria-label={`Editar conta ${a.name}`}
                          title="Editar conta"
                          onClick={() =>
                            open({
                              title: 'Editar conta e abertura',
                              description:
                                'Corrigir o saldo inicial recalcula o histórico. Use apenas para corrigir o valor que já existia na data de abertura.',
                              path: `/accounts/${a.id}`,
                              method: 'PATCH',
                              fields: [
                                { name: 'name', label: 'Nome', value: a.name },
                                {
                                  name: 'opening_balance',
                                  label: 'Saldo inicial (€)',
                                  value: a.opening_balance,
                                },
                                {
                                  name: 'opening_date',
                                  label: 'Data inicial',
                                  type: 'date',
                                  value: a.opening_date,
                                  max: currentDate(),
                                },
                              ],
                              map: (d) => ({ ...d, opening_balance: decimal(d.opening_balance) }),
                            })
                          }
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`${a.archived ? 'Reativar' : 'Arquivar'} conta ${a.name}`}
                          title={a.archived ? 'Reativar conta' : 'Arquivar conta'}
                          onClick={() =>
                            open(
                              zeroForm(
                                a.archived ? 'Reativar conta' : 'Arquivar conta',
                                `/accounts/${a.id}`,
                                'PATCH',
                                'O histórico será preservado. Para arquivar, o saldo deve estar zerado.',
                                () => ({ archived: !a.archived }),
                              ),
                            )
                          }
                        >
                          {a.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
      <div className="info-note">
        Ao cadastrar um cofrinho separado, use na conta principal apenas o saldo que não está nos
        cofrinhos.
      </div>
    </>
  );
}

export function Transactions({ month, setMonth, open, accounts, categories }: Props) {
  const [page, setPage] = useState(1),
    [accountId, setAccount] = useState('');
  const query = useData(
    `/transactions?month=${month}&page=${page}${accountId ? `&account_id=${accountId}` : ''}`,
  );
  const items = query.data || [];
  const hasActiveAccount = accounts.some((account) => !account.archived);

  if (!hasActiveAccount) {
    return (
      <>
        <PageHeader
          eyebrow="MOVIMENTAÇÕES"
          title="O que aconteceu de verdade."
          description="Receitas, despesas e transferências registradas por você."
          action={<PeriodNavigator month={month} onChange={setMonth} />}
        />
        <Panel title="Antes de registrar uma movimentação">
          <Empty title="Configure uma conta na área de Contas" action={<AccountsLink />}>
            A aba Movimentações registra receitas, despesas e transferências. A criação e a gestão
            das contas ficam concentradas em Contas.
          </Empty>
        </Panel>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="MOVIMENTAÇÕES"
        title="O que aconteceu de verdade."
        description="Receitas, despesas e transferências registradas por você."
        action={
          <div className="header-actions">
            <PeriodNavigator month={month} onChange={setMonth} />
            <AddButton onClick={() => open(transactionCreateForm(accounts, categories))}>
              Nova movimentação
            </AddButton>
          </div>
        }
      />
      <>
        <div className="toolbar">
          <span className="toolbar-label">Filtrar movimentações</span>
          <div className="toolbar-filter" aria-label="Filtrar por conta">
            <EntityCombobox
              options={accountOptions(accounts)}
              value={accountId}
              onChange={(value) => {
                setAccount(value);
                setPage(1);
              }}
              optional
              invalid={false}
              emptyLabel="Todas as contas"
            />
          </div>
        </div>
        <LoadState loading={query.isLoading} error={query.error} />
        {!query.isLoading && !query.error && (
          <Panel title="Histórico do mês" description="Somente movimentações realizadas">
            {!items.length ? (
              <Empty title="Nenhuma movimentação encontrada">
                Registre o que recebeu ou pagou neste período.
              </Empty>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Descrição</th>
                      <th>Conta</th>
                      <th>Data</th>
                      <th>Valor</th>
                      <th>
                        <span className="sr-only">Ações</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((t) => (
                      <tr key={t.id}>
                        <td>
                          <div className="transaction-label">
                            <span className={`transaction-icon ${t.kind}`}>
                              {t.kind === 'income' ? (
                                <ArrowDownLeft size={18} />
                              ) : t.kind === 'transfer' ? (
                                <ArrowLeftRight size={18} />
                              ) : (
                                <ArrowUpRight size={18} />
                              )}
                            </span>
                            <div>
                              <b>{t.description}</b>
                              <small>{t.category_name || kinds[t.kind]}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          {t.kind === 'transfer'
                            ? `${t.source_name} → ${t.destination_name}`
                            : t.source_name || t.destination_name}
                        </td>
                        <td>{dateLabel(t.occurred_on)}</td>
                        <td className={t.kind === 'income' ? 'positive' : ''}>
                          <b>
                            {t.kind === 'income' ? '+' : t.kind === 'transfer' ? '' : '−'}
                            {euro(t.amount)}
                          </b>
                          {t.kind === 'transfer' && <small>Destino: {euro(t.received)}</small>}
                        </td>
                        <td>
                          <div className="row-actions">
                            {t.kind !== 'card_payment' && (
                              <button
                                className="icon-button"
                                aria-label={`Editar ${t.description}`}
                                onClick={() =>
                                  open(transactionForm(t.kind, accounts, categories, t))
                                }
                              >
                                <Pencil size={16} />
                              </button>
                            )}
                            <button
                              className="icon-button"
                              aria-label={`Excluir ${t.description}`}
                              onClick={() =>
                                open(
                                  zeroForm(
                                    'Excluir movimentação',
                                    `/transactions/${t.id}?version=${t.version}`,
                                    'DELETE',
                                    `Excluir “${t.description}”? Os saldos serão recalculados. Se houver uma fatura ou recorrência vinculada, ela será reaberta.`,
                                  ),
                                )
                              }
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="pagination">
              <button
                disabled={page === 1}
                className="button secondary small"
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </button>
              <span>Página {page}</span>
              <button
                disabled={items.length < 50 || page * 50 >= (items[0]?.total_count || 0)}
                className="button secondary small"
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </button>
            </div>
          </Panel>
        )}
      </>
    </>
  );
}

export function Budgets({ month, setMonth, open, categories }: Props) {
  const query = useData(`/budgets/${month}`);
  const items = (query.data || []).filter(
    (b) =>
      b.budget !== null || Number(b.spent) > 0 || Number(b.expected) > 0 || Number(b.committed) > 0,
  );
  return (
    <>
      <PageHeader
        eyebrow="ORÇAMENTO"
        title="Um plano para o seu mês."
        description="O realizado mostra o que saiu. Previsões e parcelas mostram o que ainda pode sair."
        action={
          <div className="header-actions">
            <PeriodNavigator month={month} onChange={setMonth} />
            <AddButton
              onClick={() =>
                open({
                  title: 'Definir orçamento',
                  description:
                    'O orçamento pode continuar nos próximos meses ou ser uma exceção somente para o mês selecionado.',
                  path: `/budgets/${month}`,
                  method: 'PUT',
                  fields: [
                    {
                      name: 'category_id',
                      label: 'Categoria',
                      options: options(categories.filter((c) => c.kind === 'expense')),
                      searchable: true,
                    },
                    { name: 'amount', label: 'Limite mensal (€)' },
                    {
                      name: 'scope',
                      label: 'Aplicar',
                      value: 'future',
                      options: [
                        { value: 'future', label: 'Deste mês em diante' },
                        { value: 'month', label: 'Somente neste mês' },
                      ],
                    },
                  ],
                  map: (d) => ({ ...d, amount: decimal(d.amount) }),
                })
              }
            >
              Definir orçamento
            </AddButton>
          </div>
        }
      />
      <LoadState loading={query.isLoading} error={query.error} />
      {!items.length && !query.isLoading ? (
        <Panel title="Seus limites">
          <Empty
            title="Planeje os gastos por categoria"
            action={
              <AddButton
                onClick={() =>
                  open({
                    title: 'Definir orçamento',
                    path: `/budgets/${month}`,
                    method: 'PUT',
                    fields: [
                      {
                        name: 'category_id',
                        label: 'Categoria',
                        options: options(categories.filter((c) => c.kind === 'expense')),
                        searchable: true,
                      },
                      { name: 'amount', label: 'Limite mensal (€)' },
                      {
                        name: 'scope',
                        label: 'Aplicar',
                        value: 'future',
                        options: [
                          { value: 'future', label: 'Deste mês em diante' },
                          { value: 'month', label: 'Somente neste mês' },
                        ],
                      },
                    ],
                    map: (d) => ({ ...d, amount: decimal(d.amount) }),
                  })
                }
              >
                Criar orçamento
              </AddButton>
            }
          >
            Defina quanto pretende gastar neste mês. O orçamento não altera saldos.
          </Empty>
        </Panel>
      ) : (
        <div className="budget-grid">
          {items.map((b) => {
            const limit = b.budget === null ? null : Number(b.budget),
              spent = Number(b.spent),
              expected = Number(b.expected),
              committed = Number(b.committed),
              over = limit !== null && new Decimal(b.spent).gt(b.budget);
            return (
              <article className="panel budget-card" key={b.category_id}>
                <div className="split">
                  <div>
                    <h2>{b.name}</h2>
                    {b.budget_scope && (
                      <span className="badge">
                        {b.budget_scope === 'month' ? 'Exceção deste mês' : 'Orçamento padrão'}
                      </span>
                    )}
                  </div>
                  <div className="row-actions">
                    {b.budget_scope === 'month' && (
                      <button
                        className="icon-button"
                        aria-label={`Remover exceção de ${b.name}`}
                        title="Usar orçamento padrão neste mês"
                        onClick={() =>
                          open(
                            zeroForm(
                              'Usar orçamento padrão',
                              `/budgets/${month}/${b.category_id}/override`,
                              'DELETE',
                              'A exceção deste mês será removida e o orçamento padrão voltará a valer.',
                            ),
                          )
                        }
                      >
                        <RotateCcw size={15} />
                      </button>
                    )}
                    <button
                      className="icon-button"
                      aria-label={`Editar limite de ${b.name}`}
                      onClick={() =>
                        open({
                          title: `Orçamento de ${b.name}`,
                          path: `/budgets/${month}`,
                          method: 'PUT',
                          fields: [
                            { name: 'amount', label: 'Limite mensal (€)', value: b.budget || '' },
                            {
                              name: 'scope',
                              label: 'Aplicar alteração',
                              value: b.budget_scope === 'month' ? 'month' : 'future',
                              options: [
                                { value: 'future', label: 'Deste mês em diante' },
                                { value: 'month', label: 'Somente neste mês' },
                              ],
                            },
                          ],
                          map: (d) => ({
                            category_id: b.category_id,
                            amount: decimal(d.amount),
                            scope: d.scope,
                          }),
                        })
                      }
                    >
                      <Pencil size={15} />
                    </button>
                  </div>
                </div>
                <div className="budget-total">
                  <strong className={over ? 'danger' : ''}>{euro(b.spent)}</strong>
                  <span> / {limit === null ? 'Sem orçamento' : euro(b.budget)}</span>
                </div>
                {limit !== null && (
                  <Progress value={limit > 0 ? (spent / limit) * 100 : spent > 0 ? 100 : 0} />
                )}
                {b.utilization !== null && b.utilization !== undefined && (
                  <small>{String(b.utilization).replace('.', ',')}% do limite utilizado</small>
                )}
                <dl>
                  <div>
                    <dt>Realizado</dt>
                    <dd>{euro(b.spent)}</dd>
                  </div>
                  <div>
                    <dt>Recorrências previstas</dt>
                    <dd>{euro(b.expected)}</dd>
                  </div>
                  <div>
                    <dt>Parcelas pendentes</dt>
                    <dd>{euro(b.committed)}</dd>
                  </div>
                  {limit !== null && (
                    <>
                      <div>
                        <dt>{over ? 'Excedente atual' : 'Restante atual'}</dt>
                        <dd className={over ? 'danger' : ''}>
                          {euro(new Decimal(b.remaining).abs().toString())}
                        </dd>
                      </div>
                      <div className="budget-margin">
                        <dt>Margem após pendências</dt>
                        <dd className={new Decimal(b.margin).lt(0) ? 'danger' : ''}>
                          {euro(b.margin)}
                        </dd>
                      </div>
                    </>
                  )}
                </dl>
              </article>
            );
          })}
        </div>
      )}
      <div className="info-note">
        Transferências para cofrinhos não consomem orçamento. O custo de uma transferência com perda
        aparece como despesa.
      </div>
    </>
  );
}

export function Goals({ open, accounts }: Props) {
  const query = useData('/goals');
  const reservedAccounts = accounts.filter(
    (account) => !account.archived && account.purpose === 'reserved',
  );
  return (
    <>
      <PageHeader
        eyebrow="METAS"
        title="Dê um destino aos seus planos."
        description="O progresso vem do saldo real do cofrinho associado."
        action={
          reservedAccounts.length ? (
            <AddButton onClick={() => open(goalForm(accounts))}>Nova meta</AddButton>
          ) : undefined
        }
      />
      <LoadState loading={query.isLoading} error={query.error} />
      {!query.data?.length && !query.isLoading ? (
        <Panel title="Seus objetivos">
          <Empty
            title={
              reservedAccounts.length ? 'Qual é seu próximo objetivo?' : 'Crie um cofrinho primeiro'
            }
            action={
              reservedAccounts.length ? (
                <AddButton onClick={() => open(goalForm(accounts))}>Criar meta</AddButton>
              ) : (
                <AccountsLink />
              )
            }
          >
            {reservedAccounts.length
              ? 'Associe a meta a um dos seus cofrinhos.'
              : 'Crie uma conta do tipo cofrinho em Contas e depois volte para definir a meta.'}
          </Empty>
        </Panel>
      ) : (
        <div className="cards-grid">
          {query.data?.map((g) => {
            const progress = Number(g.progress),
              remaining = g.remaining,
              months = g.months_to_goal;
            return (
              <article className={`panel goal-card ${g.archived ? 'archived' : ''}`} key={g.id}>
                <span className="eyebrow">
                  {g.archived
                    ? 'ARQUIVADA'
                    : accounts.find((a) => a.id === g.account_id)?.name || 'COFRINHO'}
                </span>
                <h2>{g.name}</h2>
                <div className="goal-value">
                  <strong>{euro(g.balance)}</strong>
                  <span> de {euro(g.target)}</span>
                </div>
                <Progress value={progress} />
                <div className="split">
                  <span>{progress.toFixed(1)}% do objetivo</span>
                  <b>Faltam {euro(remaining)}</b>
                </div>
                <dl>
                  <div>
                    <dt>Aporte planejado</dt>
                    <dd>{euro(g.monthly_contribution)}/mês</dd>
                  </div>
                  <div>
                    <dt>Conclusão estimada</dt>
                    <dd>
                      {new Decimal(remaining).isZero()
                        ? 'Objetivo atingido'
                        : months === null
                          ? 'Sem aporte definido'
                          : `Em ${months} ${months === '1' ? 'mês' : 'meses'}`}
                    </dd>
                  </div>
                  {g.deadline && (
                    <div>
                      <dt>Prazo desejado</dt>
                      <dd>{dateLabel(g.deadline)}</dd>
                    </div>
                  )}
                </dl>
                <p className="footnote">
                  Estimativa com aportes constantes, sem saques ou rendimentos.
                </p>
                <div className="card-actions">
                  <button
                    className="icon-button"
                    aria-label={`Editar meta ${g.name}`}
                    title="Editar meta"
                    onClick={() =>
                      open({
                        title: 'Editar meta',
                        path: `/goals/${g.id}`,
                        method: 'PATCH',
                        fields: [
                          { name: 'name', label: 'Nome', value: g.name },
                          { name: 'target', label: 'Objetivo (€)', value: g.target },
                          {
                            name: 'monthly_contribution',
                            label: 'Aporte planejado (€)',
                            value: g.monthly_contribution,
                          },
                          {
                            name: 'deadline',
                            label: 'Prazo (opcional)',
                            type: 'date',
                            required: false,
                            value: g.deadline,
                          },
                        ],
                        map: (d) => ({
                          ...d,
                          target: decimal(d.target),
                          monthly_contribution: decimal(d.monthly_contribution),
                          deadline: d.deadline || null,
                        }),
                      })
                    }
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`${g.archived ? 'Reativar' : 'Arquivar'} meta ${g.name}`}
                    title={g.archived ? 'Reativar meta' : 'Arquivar meta'}
                    onClick={() =>
                      open(
                        zeroForm(
                          g.archived ? 'Reativar meta' : 'Arquivar meta',
                          `/goals/${g.id}`,
                          'PATCH',
                          'O saldo do cofrinho será preservado.',
                          () => ({ archived: !g.archived }),
                        ),
                      )
                    }
                  >
                    {g.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

export function Recurrences({ month, setMonth, open, accounts, categories }: Props) {
  const query = useData(`/occurrences?month=${month}`),
    rules = useData('/recurrences');
  const history = useData(`/transactions?month=${month}&page=1`);
  const hasActiveAccount = accounts.some((account) => !account.archived);
  const occurrenceRows = [
    ...(query.data || []).filter((item) => item.kind === 'income'),
    ...(query.data || []).filter((item) => item.kind !== 'income'),
  ];
  const ruleRows = [
    ...(rules.data || []).filter((item) => item.kind === 'income'),
    ...(rules.data || []).filter((item) => item.kind !== 'income'),
  ];

  if (!hasActiveAccount) {
    return (
      <>
        <PageHeader
          eyebrow="RECORRENTES"
          title="Antecipe. Confira. Confirme."
          description="Previsões não são pagamentos. Você decide quando viram realidade."
          action={<PeriodNavigator month={month} onChange={setMonth} />}
        />
        <Panel title="Antes de criar uma recorrência">
          <Empty title="Configure uma conta na área de Contas" action={<AccountsLink />}>
            A conta informa onde a receita será recebida ou de onde a despesa será paga.
          </Empty>
        </Panel>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="RECORRENTES"
        title="Antecipe. Confira. Confirme."
        description="Previsões não são pagamentos. Você decide quando viram realidade."
        action={
          <div className="header-actions">
            <PeriodNavigator month={month} onChange={setMonth} />
            <AddButton onClick={() => open(recurrenceCreateForm(accounts, categories))}>
              Novo recorrente
            </AddButton>
          </div>
        }
      />
      <LoadState loading={query.isLoading || rules.isLoading} error={query.error || rules.error} />
      <Panel title="Ocorrências do mês" description="Valores previstos para o período selecionado">
        {!query.data?.length ? (
          <Empty title="Sem previsões neste mês">
            Cadastre despesas, receitas ou aportes que se repetem mensalmente.
          </Empty>
        ) : (
          <div className="occurrence-list">
            {occurrenceRows.map((o, index) => (
              <Fragment key={o.id}>
                {(index === 0 || occurrenceRows[index - 1].kind === 'income') && (
                  <h3 className="recurrence-group-title">
                    {o.kind === 'income'
                      ? 'Entradas previstas'
                      : 'Saídas e transferências previstas'}
                  </h3>
                )}
                <div className="list-row">
                  <div
                    className={`date-tile ${o.state === 'pending' && o.due_on < currentDate() ? 'overdue' : ''}`}
                  >
                    {o.due_on.slice(8)}
                    <small>{o.due_on.slice(5, 7)}</small>
                  </div>
                  <div className="grow">
                    <b>{o.description}</b>
                    <small>
                      {o.state === 'confirmed'
                        ? 'Confirmado'
                        : o.state === 'skipped'
                          ? 'Ignorado'
                          : o.due_on < currentDate()
                            ? 'Previsto · data passada'
                            : 'Previsto'}{' '}
                      · {kinds[o.kind]}
                    </small>
                  </div>
                  <strong>{euro(o.amount)}</strong>
                  <div className="row-actions">
                    {o.state === 'pending' ? (
                      <>
                        <button
                          className="icon-button"
                          aria-label={`Editar previsão de ${o.description}`}
                          onClick={() =>
                            open({
                              title: 'Editar esta previsão',
                              description: 'Esta alteração afeta apenas a ocorrência selecionada.',
                              path: `/occurrences/${o.id}`,
                              method: 'PATCH',
                              fields: [
                                { name: 'description', label: 'Descrição', value: o.description },
                                { name: 'amount', label: 'Valor previsto (€)', value: o.amount },
                              ],
                              map: (d) => ({ ...d, amount: decimal(d.amount) }),
                            })
                          }
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          className="text-link"
                          onClick={() =>
                            open({
                              title: 'Vincular registro existente',
                              description:
                                'Selecione entre os 50 registros mais recentes do mês selecionado. Não será criada outra movimentação.',
                              path: `/occurrences/${o.id}/link-transaction`,
                              fields: [
                                {
                                  name: 'transaction_id',
                                  label: 'Movimentação já registrada',
                                  options: (history.data || [])
                                    .filter(
                                      (t) =>
                                        t.kind === o.kind &&
                                        t.category_id === o.category_id &&
                                        (o.kind === 'income' ? t.destination_id : t.source_id) ===
                                          o.account_id &&
                                        (o.kind !== 'transfer' ||
                                          t.destination_id === o.destination_id),
                                    )
                                    .map((t) => ({
                                      value: t.id,
                                      label: `${t.description} · ${euro(t.amount)} · ${dateLabel(t.occurred_on)}`,
                                    })),
                                  searchable: true,
                                },
                              ],
                              submit: 'Vincular',
                            })
                          }
                        >
                          Já registrei
                        </button>
                        <button
                          className="button secondary small"
                          onClick={() =>
                            open({
                              title:
                                o.kind === 'income'
                                  ? 'Confirmar recebimento'
                                  : 'Confirmar pagamento',
                              description: 'Confira o valor e a data em que aconteceu.',
                              path: `/occurrences/${o.id}/confirm`,
                              fields: [
                                {
                                  name: 'account_id',
                                  label: 'Conta',
                                  options: accountOptions(accounts),
                                  searchable: true,
                                  value: o.account_id,
                                },
                                { name: 'amount', label: 'Valor real (€)', value: o.amount },
                                {
                                  name: 'occurred_on',
                                  label: 'Data efetiva',
                                  type: 'date',
                                  value: currentDate(),
                                  max: currentDate(),
                                },
                              ],
                              map: (d) => ({ ...d, amount: decimal(d.amount) }),
                              submit: 'Confirmar',
                            })
                          }
                        >
                          <Check size={15} />
                          Confirmar
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Ignorar ${o.description}`}
                          onClick={() =>
                            open(
                              zeroForm(
                                'Ignorar ocorrência',
                                `/occurrences/${o.id}`,
                                'PATCH',
                                'Esta ocorrência deixará de contar como previsão pendente.',
                                () => ({ state: 'skipped' }),
                              ),
                            )
                          }
                        >
                          <SkipForward size={17} />
                        </button>
                      </>
                    ) : o.state === 'skipped' ? (
                      <button
                        className="icon-button"
                        aria-label={`Reabrir ${o.description}`}
                        onClick={() =>
                          open(
                            zeroForm(
                              'Reabrir ocorrência',
                              `/occurrences/${o.id}`,
                              'PATCH',
                              'Ela voltará a aparecer como previsão pendente.',
                              () => ({ state: 'pending' }),
                            ),
                          )
                        }
                      >
                        <RotateCcw size={17} />
                      </button>
                    ) : (
                      <span className="badge success">Realizado</span>
                    )}
                  </div>
                </div>
              </Fragment>
            ))}
          </div>
        )}
      </Panel>
      {!!rules.data?.length && (
        <Panel
          title="Suas recorrências"
          description="Desativar ignora as ocorrências pendentes de hoje em diante; o histórico permanece."
        >
          <div className="occurrence-list">
            {ruleRows.map((r, index) => (
              <Fragment key={r.id}>
                {(index === 0 || ruleRows[index - 1].kind === 'income') && (
                  <h3 className="recurrence-group-title">
                    {r.kind === 'income'
                      ? 'Entradas recorrentes'
                      : 'Saídas e transferências recorrentes'}
                  </h3>
                )}
                <div className="list-row">
                  <div className="grow">
                    <b>{r.description}</b>
                    <small>
                      Dia {r.expected_day} · {euro(r.amount)} · {r.active ? 'Ativa' : 'Inativa'}
                    </small>
                  </div>
                  <button
                    className="icon-button"
                    aria-label={`Editar recorrência ${r.description}`}
                    onClick={() =>
                      open({
                        title: 'Editar próximas previsões',
                        description:
                          'Atualiza descrição e valor das ocorrências pendentes de hoje em diante. O passado permanece igual.',
                        path: `/recurrences/${r.id}`,
                        method: 'PATCH',
                        fields: [
                          { name: 'description', label: 'Descrição', value: r.description },
                          { name: 'amount', label: 'Valor previsto (€)', value: r.amount },
                        ],
                        map: (d) => ({ ...d, amount: decimal(d.amount) }),
                      })
                    }
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    className="button secondary small"
                    onClick={() =>
                      open(
                        zeroForm(
                          r.active ? 'Desativar recorrência' : 'Reativar recorrência',
                          `/recurrences/${r.id}`,
                          'PATCH',
                          'Ocorrências já confirmadas não serão alteradas. Ao reativar, ocorrências ignoradas permanecem ignoradas.',
                          () => ({ active: !r.active }),
                        ),
                      )
                    }
                  >
                    {r.active ? 'Desativar' : 'Reativar'}
                  </button>
                </div>
              </Fragment>
            ))}
          </div>
        </Panel>
      )}
    </>
  );
}

export function Cards({ open, openPurchase, accounts, categories }: Props) {
  const cards = useData('/cards'),
    invoices = useData('/invoices'),
    purchases = useData('/purchases');
  const [showPaid, setShowPaid] = useState(false),
    [expanded, setExpanded] = useState<string | null>(null);
  const filtered = (invoices.data || []).filter((invoice) => {
    const settledBeforeTracking =
      Number(invoice.amount) === 0 && Number(invoice.historical_amount) > 0;
    return invoice.payment_id || settledBeforeTracking ? showPaid : Number(invoice.amount) > 0;
  });
  return (
    <>
      <PageHeader
        eyebrow="CARTÕES E DÍVIDAS"
        title="Compromissos sob controle."
        description="Parcelas e faturas separadas do dinheiro que já saiu da conta."
        action={
          <AddButton
            onClick={() =>
              cards.data?.length
                ? openPurchase?.({ cards: cards.data, categories })
                : open(cardForm())
            }
          >
            {cards.data?.length ? 'Registrar compra' : 'Criar primeiro cartão'}
          </AddButton>
        }
      />
      <LoadState
        loading={cards.isLoading || invoices.isLoading || purchases.isLoading}
        error={cards.error || invoices.error || purchases.error}
      />
      {!cards.isLoading && !cards.error && !cards.data?.length ? (
        <Panel title="Comece pelo seu cartão">
          <Empty
            title="Cadastre seu primeiro cartão"
            action={<AddButton onClick={() => open(cardForm())}>Criar cartão</AddButton>}
          >
            Depois, registre compras. As parcelas e faturas serão criadas automaticamente.
          </Empty>
        </Panel>
      ) : cards.data?.length ? (
        <>
          <div className="cards-grid compact">
            {cards.data?.map((c) => (
              <article className="credit-card" key={c.id}>
                <div className="split">
                  <CreditCard size={24} />
                  <span>CRÉDITO</span>
                </div>
                <h2>{c.name}</h2>
                <div className="split">
                  <small>Fecha dia {c.closing_day}</small>
                  <small>Vence dia {c.due_day}</small>
                </div>
              </article>
            ))}
          </div>
          <div className="toolbar">
            <button className="button secondary" onClick={() => open(cardForm())}>
              <Plus size={17} />
              Adicionar cartão
            </button>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={showPaid}
                onChange={(e) => setShowPaid(e.target.checked)}
              />
              Mostrar quitadas
            </label>
          </div>
          <Panel
            title="Faturas"
            description="Pagamento integral. Juros e crédito rotativo não são calculados."
          >
            {!filtered.length ? (
              <Empty title="Nenhuma fatura pendente">
                As compras no cartão geram as parcelas automaticamente.
              </Empty>
            ) : (
              filtered.map((i) => (
                <div key={i.id} className="invoice">
                  <div className="list-row">
                    <div className="grow">
                      <b>{i.card_name}</b>
                      <small>
                        Fecha {dateLabel(i.closes_on)} · Vence {dateLabel(i.due_on)}
                      </small>
                    </div>
                    <strong>
                      {euro(
                        Number(i.amount) === 0 && Number(i.historical_amount) > 0
                          ? i.historical_amount
                          : i.amount,
                      )}
                    </strong>
                    <button
                      className="text-link"
                      onClick={() => setExpanded(expanded === i.id ? null : i.id)}
                    >
                      {expanded === i.id ? 'Fechar' : 'Detalhes'}
                    </button>
                    {i.payment_id || (Number(i.amount) === 0 && Number(i.historical_amount) > 0) ? (
                      <span className="badge success">
                        {i.payment_id ? 'Paga' : 'Paga antes do acompanhamento'}
                      </span>
                    ) : !accounts.some((account) => !account.archived) ? (
                      <AccountsLink small />
                    ) : (
                      <button
                        className="button secondary small"
                        onClick={() =>
                          open({
                            title: 'Pagar fatura',
                            description: `Serão registrados ${euro(i.amount)} de pagamento real. Confira com a fatura do banco antes de confirmar.`,
                            path: `/invoices/${i.id}/pay`,
                            map: (d) => ({ ...d, expected_amount: i.amount }),
                            fields: [
                              {
                                name: 'account_id',
                                label: 'Pagar com a conta',
                                options: accountOptions(accounts),
                                searchable: true,
                              },
                              {
                                name: 'occurred_on',
                                label: 'Data do pagamento',
                                type: 'date',
                                value: currentDate(),
                                max: currentDate(),
                              },
                            ],
                            submit: 'Confirmar pagamento',
                          })
                        }
                      >
                        Pagar
                      </button>
                    )}
                  </div>
                  {expanded === i.id && <InvoiceDetails id={i.id} />}
                </div>
              ))
            )}
          </Panel>
          <Panel
            title="Compras parceladas e à vista"
            description="Compras quitadas continuam no histórico."
          >
            {!purchases.data?.length ? (
              <p className="quiet-note">Ainda não há compras registradas.</p>
            ) : (
              purchases.data.map((p) => (
                <div className="list-row" key={p.id}>
                  <div className="grow">
                    <b>{p.description}</b>
                    <small>
                      {p.card_name} · {p.installments}{' '}
                      {p.installments === 1 ? 'parcela' : 'parcelas'} · Compra {euro(p.amount)}
                      {p.financed_total && !new Decimal(p.financed_total).eq(p.amount)
                        ? ` · Total parcelado ${euro(p.financed_total)}`
                        : ''}
                    </small>
                  </div>
                  <div className="align-right">
                    <b>{Number(p.remaining) === 0 ? 'Quitada' : euro(p.remaining)}</b>
                    <small>{Number(p.remaining) > 0 ? 'A pagar' : 'Concluída'}</small>
                  </div>
                  <button
                    className="icon-button"
                    aria-label={`Editar compra ${p.description}`}
                    title="Editar compra e parcelamento"
                    onClick={() =>
                      openPurchase?.({
                        cards: cards.data || [],
                        categories,
                        purchaseId: p.id,
                      })
                    }
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Excluir ${p.description}`}
                    onClick={() =>
                      open(
                        zeroForm(
                          'Excluir compra',
                          `/purchases/${p.id}`,
                          'DELETE',
                          'Só é possível excluir se nenhuma parcela estiver paga. Caso necessário, exclua primeiro os pagamentos no histórico de movimentações.',
                        ),
                      )
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            )}
          </Panel>
        </>
      ) : null}
    </>
  );
}
function InvoiceDetails({ id }: { id: string }) {
  const query = useData<Row>(`/invoices/${id}`);
  return (
    <div className="invoice-details">
      <LoadState loading={query.isLoading} error={query.error} />
      {query.data?.installments.map((s: Row) => (
        <div className="split" key={s.id}>
          <span>
            {s.description}{' '}
            <small>
              {s.number}/{s.installments} · {s.category_name}
              {s.settled_before_tracking && ' · paga anteriormente'}
            </small>
          </span>
          <b>{euro(s.amount)}</b>
        </div>
      ))}
    </div>
  );
}

export function Categories({ categories, open }: Props) {
  return (
    <>
      <PageHeader
        eyebrow="CATEGORIAS"
        title="Organize do seu jeito."
        description="Suas categorias são individuais. Arquivar mantém o histórico."
        action={
          <AddButton
            onClick={() =>
              open({
                title: 'Nova categoria',
                path: '/categories',
                fields: [
                  { name: 'name', label: 'Nome' },
                  {
                    name: 'kind',
                    label: 'Tipo',
                    value: 'expense',
                    options: [
                      { value: 'expense', label: 'Despesa' },
                      { value: 'income', label: 'Receita' },
                    ],
                  },
                ],
              })
            }
          >
            Nova categoria
          </AddButton>
        }
      />
      <div className="summary-grid">
        {['expense', 'income'].map((kind) => (
          <Panel key={kind} title={kind === 'expense' ? 'Despesas' : 'Receitas'}>
            {categories
              .filter((c) => c.kind === kind)
              .map((c) => (
                <div className="list-row" key={c.id}>
                  <span className="grow">
                    {c.name} {c.archived && <small>Arquivada</small>}
                  </span>
                  <button
                    className="icon-button"
                    aria-label={`Renomear ${c.name}`}
                    onClick={() =>
                      open({
                        title: 'Renomear categoria',
                        path: `/categories/${c.id}`,
                        method: 'PATCH',
                        fields: [{ name: 'name', label: 'Nome', value: c.name }],
                      })
                    }
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`${c.archived ? 'Reativar' : 'Arquivar'} categoria ${c.name}`}
                    title={c.archived ? 'Reativar categoria' : 'Arquivar categoria'}
                    onClick={() =>
                      open(
                        zeroForm(
                          c.archived ? 'Reativar categoria' : 'Arquivar categoria',
                          `/categories/${c.id}`,
                          'PATCH',
                          'O histórico e os gastos já registrados serão preservados.',
                          () => ({ archived: !c.archived }),
                        ),
                      )
                    }
                  >
                    {c.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                  </button>
                </div>
              ))}
          </Panel>
        ))}
      </div>
    </>
  );
}
