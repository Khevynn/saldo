import Decimal from 'decimal.js';
import { Fragment, useEffect, useState } from 'react';
import {
  ArrowLeftRight,
  ArrowLeft,
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
  MapPin,
  Plane,
  GraduationCap,
  ShoppingBag,
  Hammer,
  Sparkles,
  CircleCheckBig,
  TrendingUp,
  TrendingDown,
  CalendarClock,
  Boxes,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import {
  AddButton,
  Empty,
  EntityCombobox,
  LoadState,
  PageHeader,
  Panel,
  PeriodSelector,
  Progress,
  periodBounds,
  type DateRange,
  type FormSpec,
  type PeriodMode,
} from '../components/ui';
import { currentDate, dateLabel, euro, useData, useSave, type Row } from '../lib/api';
import {
  accountForm,
  accountOptions,
  cardForm,
  decimal,
  futurePlanForm,
  futurePlanItemForm,
  futurePlanPocketForm,
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
  expenseRolloverDay?: number;
  theme?: 'system' | 'light' | 'dark';
  setTheme?: (theme: 'system' | 'light' | 'dark') => void;
  openPurchase?: (spec: PurchaseEditorSpec) => void;
};

function suggestedReferenceMonth(date: string, rolloverDay = 25) {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const monthIndex = year * 12 + month - 1 + (day >= rolloverDay ? 1 : 0);
  return `${Math.floor(monthIndex / 12)}-${String((monthIndex % 12) + 1).padStart(2, '0')}`;
}

export function Settings({ theme = 'system', setTheme = () => undefined }: Props) {
  const profile = useData<Row>('/me');
  const save = useSave();
  const [day, setDay] = useState(25);
  useEffect(() => {
    if (profile.data?.expense_rollover_day) setDay(Number(profile.data.expense_rollover_day));
  }, [profile.data?.expense_rollover_day]);
  return (
    <>
      <PageHeader
        eyebrow="PREFERÊNCIAS"
        title="Configurações"
        description="Ajustes gerais do seu espaço financeiro."
      />
      <LoadState loading={profile.isLoading} error={profile.error} />
      <div className="settings-grid">
        <Panel
          title="Mês financeiro"
          description="Escolha quando despesas antecipadas passam a pertencer ao mês seguinte."
        >
          <p className="quiet-note">
            Exemplo: com dia {day}, uma despesa nessa data será sugerida para o mês seguinte.
          </p>
          <div className="day-picker" aria-label="Dia da virada do mês">
            {Array.from({ length: 31 }, (_, index) => index + 1).map((value) => (
              <button
                key={value}
                type="button"
                className={day === value ? 'active' : ''}
                aria-pressed={day === value}
                onClick={() => setDay(value)}
              >
                {value}
              </button>
            ))}
          </div>
          {save.error && <p className="error-box">{save.error.message}</p>}
          <button
            className="button settings-save"
            disabled={save.isPending || day === Number(profile.data?.expense_rollover_day)}
            onClick={() =>
              save.mutate({ path: '/me', method: 'PATCH', data: { expense_rollover_day: day } })
            }
          >
            {save.isPending ? 'A guardar…' : `Guardar dia ${day}`}
          </button>
        </Panel>
        <Panel title="Aparência" description="Escolha como o Saldo aparece neste navegador.">
          <div className="theme-picker">
            {(
              [
                ['system', 'Automático'],
                ['light', 'Claro'],
                ['dark', 'Escuro'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={theme === value ? 'active' : ''}
                aria-pressed={theme === value}
                onClick={() => setTheme(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
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
const planThemes = {
  move: { label: 'Mudança', Icon: MapPin },
  travel: { label: 'Viagem', Icon: Plane },
  education: { label: 'Estudo', Icon: GraduationCap },
  purchase: { label: 'Compra', Icon: ShoppingBag },
  project: { label: 'Projeto', Icon: Hammer },
  other: { label: 'Outro', Icon: Sparkles },
} as const;
const cadenceLabel = (months: number) => (months === 1 ? 'Todo mês' : `A cada ${months} meses`);
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
  const [showArchived, setShowArchived] = useState(false);
  const visibleAccounts = accounts.filter((account) =>
    showArchived ? account.archived === true : !account.archived,
  );
  const archivedCount = accounts.filter((account) => account.archived).length;
  return (
    <>
      <PageHeader
        eyebrow="CONTAS"
        title="Cada saldo no seu lugar."
        description="Contas, benefícios e cofrinhos. Sem duplicar seu dinheiro."
        action={<AddButton onClick={() => open(accountForm())}>Nova conta</AddButton>}
      />
      {archivedCount > 0 && (
        <button className="account-view-toggle" onClick={() => setShowArchived((value) => !value)}>
          {showArchived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
          {showArchived ? 'Voltar às contas ativas' : `Ver arquivadas (${archivedCount})`}
        </button>
      )}
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
            const sectionAccounts = visibleAccounts.filter(
              (account) => account.purpose === section.purpose,
            );
            if (!sectionAccounts.length) return null;
            return (
              <section className="account-section" key={section.purpose}>
                <div className="account-section-header">
                  <h2>{section.title}</h2>
                  <p>{section.description}</p>
                </div>
                <div className="account-ledger">
                  {sectionAccounts.map((a) => (
                    <article className={`account-card ${a.archived ? 'archived' : ''}`} key={a.id}>
                      <span className="account-icon">
                        <Wallet size={21} />
                      </span>
                      <div className="account-copy">
                        <div className="account-name">
                          <h2>{a.name}</h2>
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
                        <p>Saldo atual · desde {dateLabel(a.opening_date)}</p>
                        {Number(a.balance) < 0 && (
                          <p className="danger">
                            Saldo negativo. Verifique os registros desta conta.
                          </p>
                        )}
                      </div>
                      <strong className={Number(a.balance) < 0 ? 'danger' : ''}>
                        {euro(a.balance)}
                      </strong>
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

export function Transactions({
  month,
  setMonth,
  open,
  accounts,
  categories,
  expenseRolloverDay = 25,
}: Props) {
  const [page, setPage] = useState(1),
    [accountId, setAccount] = useState(''),
    [periodMode, setPeriodMode] = useState<PeriodMode>('month'),
    [range, setRange] = useState<DateRange>({ from: `${month}-01`, to: currentDate() });
  const bounds = periodBounds(periodMode, month, range);
  const query = useData(
    `/transactions?from=${bounds.from}&to=${bounds.to}&page=${page}${accountId ? `&account_id=${accountId}` : ''}`,
  );
  const transfers = useData('/transactions/transfers');
  const items = query.data || [];
  const hasActiveAccount = accounts.some((account) => !account.archived);

  if (!hasActiveAccount) {
    return (
      <>
        <PageHeader
          eyebrow="MOVIMENTAÇÕES"
          title="O que aconteceu de verdade."
          description="Receitas, despesas e transferências registradas por você."
          action={
            <PeriodSelector
              mode={periodMode}
              onModeChange={(value) => {
                setPeriodMode(value);
                setPage(1);
              }}
              month={month}
              onMonthChange={(value) => {
                setMonth(value);
                setPage(1);
              }}
              range={range}
              onRangeChange={(value) => {
                setRange(value);
                setPage(1);
              }}
            />
          }
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
            <PeriodSelector
              mode={periodMode}
              onModeChange={(value) => {
                setPeriodMode(value);
                setPage(1);
              }}
              month={month}
              onMonthChange={(value) => {
                setMonth(value);
                setPage(1);
              }}
              range={range}
              onRangeChange={(value) => {
                setRange(value);
                setPage(1);
              }}
            />
            <AddButton
              onClick={() =>
                open(
                  transactionCreateForm(
                    accounts,
                    categories,
                    expenseRolloverDay,
                    transfers.data || [],
                  ),
                )
              }
            >
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
          <Panel title="Histórico do período" description="Somente movimentações realizadas">
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
                                  open(
                                    transactionForm(
                                      t.kind,
                                      accounts,
                                      categories,
                                      t,
                                      expenseRolloverDay,
                                      transfers.data || [],
                                    ),
                                  )
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
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month');
  const [range, setRange] = useState<DateRange>({ from: `${month}-01`, to: currentDate() });
  const bounds = periodBounds(periodMode, month, range);
  const monthly = periodMode === 'month';
  const query = useData(
    monthly ? `/budgets/${month}` : `/budgets/range?from=${bounds.from}&to=${bounds.to}`,
  );
  const items = (query.data || []).filter((b) => b.budget !== null);
  return (
    <>
      <PageHeader
        eyebrow="ORÇAMENTO"
        title="Um plano para o seu mês."
        description="O realizado mostra o que saiu. Previsões e parcelas mostram o que ainda pode sair."
        action={
          <div className="header-actions">
            <PeriodSelector
              mode={periodMode}
              onModeChange={setPeriodMode}
              month={month}
              onMonthChange={setMonth}
              range={range}
              onRangeChange={setRange}
            />
            {monthly && (
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
            )}
          </div>
        }
      />
      <LoadState loading={query.isLoading} error={query.error} />
      {!monthly && <p className="quiet-note">Para alterar um limite, selecione a visão mensal.</p>}
      {!items.length && !query.isLoading ? (
        <Panel title="Seus limites">
          <Empty
            title="Planeje os gastos por categoria"
            action={
              monthly ? (
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
              ) : undefined
            }
          >
            {monthly
              ? 'Defina quanto pretende gastar neste mês. O orçamento não altera saldos.'
              : 'Nenhum orçamento foi encontrado no período. Selecione a visão mensal para definir um limite.'}
          </Empty>
        </Panel>
      ) : (
        <div className="budget-grid budget-list">
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
                    {monthly && b.budget_scope === 'month' && (
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
                    {monthly && (
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
                    )}
                  </div>
                </div>
                <div className="budget-total">
                  <strong className={over ? 'danger' : ''}>{euro(b.spent)}</strong>
                  <span> / {limit === null ? 'Sem orçamento' : euro(b.budget)}</span>
                </div>
                {limit !== null && (
                  <Progress
                    value={limit > 0 ? (spent / limit) * 100 : spent > 0 ? 100 : 0}
                    danger={over}
                  />
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
        <div className="cards-grid goals-list">
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

export function FuturePlans({ open }: Props) {
  const plans = useData('/future-plans');
  const { planId } = useParams();
  const activePlans = (plans.data || []).filter((plan) => plan.status === 'active');
  const report = activePlans.reduce(
    (total, plan) => ({
      upfrontGap: total.upfrontGap.plus(plan.upfront_gap || 0),
      monthlyIncome: total.monthlyIncome.plus(plan.monthly_income || 0),
      monthlyExpenses: total.monthlyExpenses.plus(plan.monthly_expenses || 0),
      periodicExpenses: total.periodicExpenses.plus(plan.periodic_expenses || 0),
      projectedBalance: total.projectedBalance.plus(plan.projected_balance || 0),
    }),
    {
      upfrontGap: new Decimal(0),
      monthlyIncome: new Decimal(0),
      monthlyExpenses: new Decimal(0),
      periodicExpenses: new Decimal(0),
      projectedBalance: new Decimal(0),
    },
  );
  if (!planId)
    return (
      <>
        <PageHeader
          eyebrow="HORIZONTES"
          title="Seus planos, sem ruído."
          description="Compare os cenários rapidamente e abra um deles quando quiser analisar cada detalhe."
          action={<AddButton onClick={() => open(futurePlanForm())}>Novo plano</AddButton>}
        />
        <LoadState loading={plans.isLoading} error={plans.error} />
        <div className="future-intro">
          <span>01</span>
          <p>
            Este é apenas o índice dos seus cenários. Caixas, receitas, despesas e projeções ficam
            dentro do dashboard de cada plano.
          </p>
        </div>
        {!!activePlans.length && (
          <section className="planning-report" aria-label="Relatório geral dos planos">
            <div className="planning-report-title">
              <span>RELATÓRIO GERAL</span>
              <h2>
                {activePlans.length}{' '}
                {activePlans.length === 1 ? 'cenário ativo' : 'cenários ativos'}
              </h2>
              <p>Visão consolidada das hipóteses, sem misturar os valores com suas contas reais.</p>
            </div>
            <div>
              <small>Falta disponível agora</small>
              <strong className={report.upfrontGap.gt(0) ? 'negative' : ''}>
                {euro(report.upfrontGap.toFixed(2))}
              </strong>
            </div>
            <div>
              <small>Resultado mensal</small>
              <strong
                className={
                  report.monthlyIncome.minus(report.monthlyExpenses).lt(0) ? 'negative' : ''
                }
              >
                {euro(report.monthlyIncome.minus(report.monthlyExpenses).toFixed(2))}
              </strong>
            </div>
            <div>
              <small>Contas periódicas</small>
              <strong>{euro(report.periodicExpenses.toFixed(2))}</strong>
            </div>
            <div>
              <small>Saldo final projetado</small>
              <strong className={report.projectedBalance.lt(0) ? 'negative' : ''}>
                {euro(report.projectedBalance.toFixed(2))}
              </strong>
            </div>
          </section>
        )}
        {!plans.data?.length ? (
          <Panel title="Seus próximos capítulos">
            <Empty
              title="Ainda não há planos no horizonte"
              action={
                <AddButton onClick={() => open(futurePlanForm())}>Criar primeiro plano</AddButton>
              }
            >
              Defina uma data e uma primeira estimativa. O dashboard ajudará a detalhar o restante.
            </Empty>
          </Panel>
        ) : (
          <div className="plan-directory">
            {plans.data.map((plan) => {
              const theme = planThemes[plan.theme as keyof typeof planThemes] || planThemes.other;
              const { Icon } = theme;
              const state =
                Number(plan.upfront_gap) > 0
                  ? { label: `Faltam ${euro(plan.upfront_gap)} agora`, className: 'not_viable' }
                  : Number(plan.monthly_margin) < 0
                    ? {
                        label: `Déficit mensal de ${euro(Math.abs(Number(plan.monthly_margin)))}`,
                        className: 'not_viable',
                      }
                    : { label: 'Cenário sustentável', className: plan.viability || 'viable' };
              return (
                <article className="plan-directory-row" key={plan.id}>
                  <div className="plan-directory-title">
                    <span className="future-icon">
                      <Icon size={18} />
                    </span>
                    <div>
                      <span className="future-index">{theme.label}</span>
                      <h2>{plan.name}</h2>
                      <p>
                        {dateLabel(plan.target_date)} · {plan.months_remaining}{' '}
                        {Number(plan.months_remaining) === 1 ? 'mês' : 'meses'}
                      </p>
                    </div>
                  </div>
                  <div className="plan-directory-metrics">
                    <div>
                      <small>Disponível agora</small>
                      <strong>{euro(plan.upfront_available ?? plan.reserved_amount)}</strong>
                    </div>
                    <div>
                      <small>Resultado mensal</small>
                      <strong className={Number(plan.monthly_margin) < 0 ? 'negative' : ''}>
                        {euro(plan.monthly_margin)}
                      </strong>
                    </div>
                    <div>
                      <small>Saldo projetado</small>
                      <strong className={Number(plan.projected_balance) < 0 ? 'negative' : ''}>
                        {euro(plan.projected_balance)}
                      </strong>
                    </div>
                  </div>
                  <div className="plan-directory-status">
                    <span className={state.className}>{state.label}</span>
                    <Link className="button small" to={`/future-plans/${plan.id}`}>
                      Abrir dashboard <ChevronRight size={15} />
                    </Link>
                  </div>
                  <div className="plan-directory-actions">
                    <button
                      className="icon-button"
                      aria-label={`Editar plano ${plan.name}`}
                      onClick={() => open(futurePlanForm(plan))}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Excluir plano ${plan.name}`}
                      onClick={() =>
                        open(
                          zeroForm(
                            'Excluir plano definitivamente',
                            `/future-plans/${plan.id}`,
                            'DELETE',
                            'O plano e todas as hipóteses deste cenário serão apagados. Suas finanças reais não serão alteradas.',
                          ),
                        )
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </>
    );
  const selectedPlan = plans.data?.find((plan) => plan.id === planId);
  return (
    <>
      <PageHeader
        eyebrow="DASHBOARD DO PLANO"
        title={selectedPlan?.name || 'Carregando plano…'}
        description="Analise caixas, desembolsos, fluxo mensal, contas periódicas e a projeção completa deste cenário."
        action={
          <Link className="button secondary" to="/future-plans">
            <ArrowLeft size={16} /> Todos os planos
          </Link>
        }
      />
      <LoadState loading={plans.isLoading} error={plans.error} />
      {plans.isLoading ? null : !selectedPlan ? (
        <Panel title="Plano não encontrado">
          <Empty
            title="Este cenário não está mais disponível"
            action={
              <Link className="button" to="/future-plans">
                Voltar aos planos
              </Link>
            }
          >
            Ele pode ter sido excluído ou o endereço está incorreto.
          </Empty>
        </Panel>
      ) : (
        <div className="scenario-list">
          {[selectedPlan!].map((plan) => {
            const theme = planThemes[plan.theme as keyof typeof planThemes] || planThemes.other;
            const { Icon } = theme;
            const pockets = plan.pockets?.length
              ? plan.pockets
              : [
                  {
                    id: 'principal',
                    name: 'Principal',
                    kind: 'principal',
                    opening_balance: plan.reserved_amount,
                    closing_balance: plan.projected_balance,
                    upfront_cost: plan.total_cost,
                    upfront_gap: plan.remaining,
                    monthly_income: plan.monthly_income,
                    monthly_expenses: plan.monthly_expenses,
                    monthly_margin: plan.monthly_margin,
                    items: plan.items || [],
                  },
                ];
            const viability =
              plan.viability || (Number(plan.remaining) > 0 ? 'not_viable' : 'viable');
            const verdict =
              Number(plan.upfront_gap) > 0
                ? {
                    label: 'Dinheiro imediato insuficiente',
                    text: `Você precisa ter mais ${euro(plan.upfront_gap)} disponível agora.`,
                  }
                : viability === 'viable'
                  ? {
                      label: 'Plano viável',
                      text: `Sobra projetada de ${euro(plan.projected_balance)}.`,
                    }
                  : viability === 'tight'
                    ? {
                        label: 'Cabe, mas está apertado',
                        text: `A margem projetada é de ${euro(plan.projected_balance)}.`,
                      }
                    : {
                        label: 'Ainda não fecha',
                        text: `Faltam ${euro(plan.remaining)} para o cenário ser possível.`,
                      };
            return (
              <article
                className={`scenario future-${plan.theme} ${plan.status !== 'active' ? 'archived' : ''}`}
                key={plan.id}
              >
                <header className="scenario-header">
                  <div className="scenario-title">
                    <span className="future-icon">
                      <Icon size={19} />
                    </span>
                    <div>
                      <span className="future-index">{theme.label}</span>
                      <h2>{plan.name}</h2>
                      <p>
                        <CalendarClock size={14} /> {dateLabel(plan.target_date)} ·{' '}
                        {plan.months_remaining}{' '}
                        {Number(plan.months_remaining) === 1 ? 'mês' : 'meses'}
                      </p>
                    </div>
                  </div>
                  <div className={`scenario-verdict ${viability}`}>
                    <strong>{verdict.label}</strong>
                    <span>{verdict.text}</span>
                  </div>
                </header>
                {plan.notes && <p className="scenario-notes">{plan.notes}</p>}
                <div className="scenario-metrics">
                  <div>
                    <small>Desembolso necessário agora</small>
                    <strong>{euro(plan.upfront_cost ?? plan.total_cost)}</strong>
                  </div>
                  <div>
                    <small>Disponível agora nas caixas</small>
                    <strong>{euro(plan.upfront_available ?? plan.reserved_amount)}</strong>
                  </div>
                  <div>
                    <small>Falta para o desembolso</small>
                    <strong className={Number(plan.upfront_gap) > 0 ? 'negative' : ''}>
                      {euro(plan.upfront_gap)}
                    </strong>
                  </div>
                  <div>
                    <small>Contas periódicas no período</small>
                    <strong>{euro(plan.periodic_expenses)}</strong>
                  </div>
                </div>
                <div className="scenario-progress">
                  <div>
                    <span>Cobertura total até a data final</span>
                    <b>{Number(plan.progress || 0).toFixed(0)}% projetado</b>
                  </div>
                  <Progress value={Number(plan.progress || 0)} />
                </div>
                <section className="scenario-pockets">
                  <div className="scenario-pockets-header">
                    <div>
                      <span>CAIXAS DO CENÁRIO</span>
                      <h3>Separe de onde cada valor vem e para onde ele vai</h3>
                    </div>
                    <button
                      className="button secondary small"
                      onClick={() => open(futurePlanPocketForm(plan.id))}
                    >
                      <Plus size={14} /> Nova caixa
                    </button>
                  </div>
                  <div className="scenario-pocket-grid">
                    {pockets.map((pocket: Row) => (
                      <article className={`scenario-pocket ${pocket.kind}`} key={pocket.id}>
                        <header>
                          <div>
                            <span>
                              <Boxes size={15} />{' '}
                              {pocket.kind === 'principal'
                                ? 'Principal'
                                : pocket.kind === 'benefit'
                                  ? 'Benefício'
                                  : 'Reserva'}
                            </span>
                            <h4>{pocket.name}</h4>
                          </div>
                          <div className="scenario-pocket-actions">
                            <button
                              className="icon-button"
                              aria-label={`Editar caixa ${pocket.name}`}
                              onClick={() => open(futurePlanPocketForm(plan.id, pocket))}
                            >
                              <Pencil size={14} />
                            </button>
                            {pocket.kind !== 'principal' && (
                              <button
                                className="icon-button"
                                aria-label={`Excluir caixa ${pocket.name}`}
                                onClick={() =>
                                  open(
                                    zeroForm(
                                      'Excluir caixa do cenário',
                                      `/future-plans/${plan.id}/pockets/${pocket.id}`,
                                      'DELETE',
                                      'A caixa só poderá ser excluída quando não tiver receitas ou despesas vinculadas.',
                                    ),
                                  )
                                }
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </header>
                        <div className="scenario-pocket-summary">
                          <div>
                            <small>Disponível agora</small>
                            <strong>{euro(pocket.opening_balance)}</strong>
                          </div>
                          <div>
                            <small>Desembolso imediato</small>
                            <strong>{euro(pocket.upfront_cost)}</strong>
                          </div>
                          <div>
                            <small>Resultado mensal</small>
                            <strong className={Number(pocket.monthly_margin) < 0 ? 'negative' : ''}>
                              {euro(pocket.monthly_margin)}
                            </strong>
                          </div>
                          <div>
                            <small>Saldo ao final</small>
                            <strong
                              className={Number(pocket.closing_balance) < 0 ? 'negative' : ''}
                            >
                              {euro(pocket.closing_balance)}
                            </strong>
                          </div>
                        </div>
                        {Number(pocket.upfront_gap) > 0 && (
                          <p className="scenario-pocket-warning">
                            Faltam {euro(pocket.upfront_gap)} nesta caixa para os pagamentos
                            imediatos.
                          </p>
                        )}
                        {pocket.first_deficit_month && (
                          <p className="scenario-pocket-warning">
                            O saldo fica negativo a partir de {pocket.first_deficit_month}.
                          </p>
                        )}
                        {pocket.items?.some((item: Row) => item.is_baseline) && (
                          <p className="scenario-baseline-note">
                            A estimativa inicial entra no total. Reduza-a conforme distribuir os
                            custos em itens detalhados.
                          </p>
                        )}
                        <div className="scenario-pocket-items">
                          {!pocket.items?.length ? (
                            <p className="scenario-items-empty">
                              Esta caixa ainda não tem movimentações projetadas.
                            </p>
                          ) : (
                            pocket.items.map((item: Row) => (
                              <div className={`scenario-item ${item.kind}`} key={item.id}>
                                {item.kind === 'income' ? (
                                  <TrendingUp size={14} />
                                ) : (
                                  <TrendingDown size={14} />
                                )}
                                <div>
                                  <strong>{item.name}</strong>
                                  <span>
                                    {item.cadence === 'once'
                                      ? item.due_on
                                        ? `Uma vez · ${dateLabel(item.due_on)}`
                                        : 'Uma vez · disponível agora'
                                      : Number(item.interval_months) === 1
                                        ? 'Todo mês'
                                        : `A cada ${item.interval_months} meses`}
                                    {item.notes ? ` · ${item.notes}` : ''}
                                  </span>
                                </div>
                                <div className="scenario-item-value">
                                  <strong>{euro(item.amount)}</strong>
                                  {item.cadence === 'recurring' && (
                                    <small>{euro(item.projected_total)} no período</small>
                                  )}
                                </div>
                                <button
                                  className="icon-button"
                                  aria-label={`Editar ${item.name}`}
                                  onClick={() =>
                                    open(futurePlanItemForm(plan.id, item.kind, pockets, item))
                                  }
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  className="icon-button"
                                  aria-label={`Excluir ${item.name}`}
                                  onClick={() =>
                                    open(
                                      zeroForm(
                                        'Excluir item',
                                        `/future-plans/${plan.id}/items/${item.id}`,
                                        'DELETE',
                                        'O item será retirado apenas deste cenário.',
                                      ),
                                    )
                                  }
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                        <footer>
                          <button
                            className="text-link"
                            onClick={() =>
                              open(
                                futurePlanItemForm(
                                  plan.id,
                                  'income',
                                  pockets,
                                  undefined,
                                  pocket.id,
                                ),
                              )
                            }
                          >
                            <TrendingUp size={14} /> Receita
                          </button>
                          <button
                            className="text-link"
                            onClick={() =>
                              open(
                                futurePlanItemForm(
                                  plan.id,
                                  'expense',
                                  pockets,
                                  undefined,
                                  pocket.id,
                                ),
                              )
                            }
                          >
                            <TrendingDown size={14} /> Despesa
                          </button>
                        </footer>
                      </article>
                    ))}
                  </div>
                </section>
                <div className="scenario-analysis">
                  <div>
                    <small>Entradas mensais</small>
                    <strong>{euro(plan.monthly_income)}</strong>
                  </div>
                  <div>
                    <small>Saídas mensais</small>
                    <strong>{euro(plan.monthly_expenses)}</strong>
                  </div>
                  <div>
                    <small>Margem após financiar o plano</small>
                    <strong className={Number(plan.monthly_margin) < 0 ? 'negative' : ''}>
                      {euro(plan.monthly_margin)}
                    </strong>
                  </div>
                  <p>
                    {Number(plan.monthly_margin) >= 0
                      ? `As receitas mensais cobrem as despesas mensais e deixam ${euro(plan.monthly_margin)} livres. Pagamentos pontuais e periódicos são verificados separadamente nas caixas.`
                      : `As despesas mensais superam as receitas em ${euro(Math.abs(Number(plan.monthly_margin)))}. Ajuste o fluxo recorrente antes de assumir o plano.`}
                  </p>
                </div>
                {!!plan.timeline?.length && (
                  <details className="scenario-projection">
                    <summary>Ver projeção completa mês a mês</summary>
                    <div className="scenario-projection-table">
                      <table>
                        <thead>
                          <tr>
                            <th>Mês</th>
                            <th>Entradas</th>
                            <th>Saídas</th>
                            <th>Saldo das caixas</th>
                          </tr>
                        </thead>
                        <tbody>
                          {plan.timeline.map((period: Row) => (
                            <tr key={period.month}>
                              <td>
                                {new Date(`${period.month}-02T12:00:00`).toLocaleDateString(
                                  'pt-PT',
                                  { month: 'long', year: 'numeric' },
                                )}
                              </td>
                              <td>{euro(period.income)}</td>
                              <td>{euro(period.expense)}</td>
                              <td className={Number(period.balance) < 0 ? 'negative' : ''}>
                                {euro(period.balance)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}
                <div className="future-actions">
                  <button className="text-link" onClick={() => open(futurePlanForm(plan))}>
                    <Pencil size={14} /> Editar dados gerais
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Excluir plano ${plan.name}`}
                    title="Excluir plano"
                    onClick={() =>
                      open(
                        zeroForm(
                          'Excluir plano definitivamente',
                          `/future-plans/${plan.id}`,
                          'DELETE',
                          'O plano e todas as receitas e despesas deste cenário serão apagados. Suas contas, saldos e movimentações reais não serão alterados.',
                        ),
                      )
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                  {plan.status === 'completed' && <span className="badge success">Realizado</span>}
                  {plan.status === 'archived' && <span className="badge">Arquivado</span>}
                  {plan.status === 'active' ? (
                    <>
                      <button
                        className="icon-button"
                        aria-label={`Marcar ${plan.name} como realizado`}
                        title="Marcar como realizado"
                        onClick={() =>
                          open(
                            zeroForm(
                              'Concluir plano',
                              `/future-plans/${plan.id}`,
                              'PATCH',
                              'Isso apenas encerra este cenário; nenhuma movimentação será criada.',
                              () => ({ status: 'completed' }),
                            ),
                          )
                        }
                      >
                        <CircleCheckBig size={17} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Arquivar plano ${plan.name}`}
                        title="Arquivar"
                        onClick={() =>
                          open(
                            zeroForm(
                              'Arquivar plano',
                              `/future-plans/${plan.id}`,
                              'PATCH',
                              'O plano ficará guardado e continuará sem alterar suas finanças.',
                              () => ({ status: 'archived' }),
                            ),
                          )
                        }
                      >
                        <Archive size={17} />
                      </button>
                    </>
                  ) : (
                    <button
                      className="icon-button"
                      aria-label={`Reativar plano ${plan.name}`}
                      title="Reativar"
                      onClick={() =>
                        open(
                          zeroForm(
                            'Reativar plano',
                            `/future-plans/${plan.id}`,
                            'PATCH',
                            'O cenário volta para seus horizontes ativos.',
                            () => ({ status: 'active' }),
                          ),
                        )
                      }
                    >
                      <ArchiveRestore size={17} />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

export function Recurrences({
  month,
  setMonth,
  open,
  accounts,
  categories,
  expenseRolloverDay = 25,
}: Props) {
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month');
  const [range, setRange] = useState<DateRange>({ from: `${month}-01`, to: currentDate() });
  const bounds = periodBounds(periodMode, month, range);
  const query = useData(`/occurrences?from=${bounds.from}&to=${bounds.to}`),
    rules = useData('/recurrences');
  const history = useData(`/transactions?from=${bounds.from}&to=${bounds.to}&page=1`);
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
          action={
            <PeriodSelector
              mode={periodMode}
              onModeChange={setPeriodMode}
              month={month}
              onMonthChange={setMonth}
              range={range}
              onRangeChange={setRange}
            />
          }
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
            <PeriodSelector
              mode={periodMode}
              onModeChange={setPeriodMode}
              month={month}
              onMonthChange={setMonth}
              range={range}
              onRangeChange={setRange}
            />
            <AddButton onClick={() => open(recurrenceCreateForm(accounts, categories))}>
              Novo recorrente
            </AddButton>
          </div>
        }
      />
      <LoadState loading={query.isLoading || rules.isLoading} error={query.error || rules.error} />
      <Panel
        title="Ocorrências do período"
        description="Valores previstos para o período selecionado"
      >
        {!query.data?.length ? (
          <Empty title="Sem previsões neste mês">
            Cadastre despesas, receitas ou aportes e escolha de quantos em quantos meses se repetem.
          </Empty>
        ) : (
          <div className="occurrence-list">
            {occurrenceRows.map((o, index) => (
              <Fragment key={o.id}>
                {(index === 0 || occurrenceRows[index - 1].kind !== o.kind) && (
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
                                ...(o.kind === 'income'
                                  ? [
                                      {
                                        name: 'reference_month',
                                        label: 'Mês do orçamento',
                                        type: 'month',
                                        value: suggestedReferenceMonth(
                                          o.due_on,
                                          expenseRolloverDay,
                                        ),
                                        hint: 'Você pode alterar o mês antes de confirmar o recebimento.',
                                      },
                                    ]
                                  : []),
                              ],
                              map: (d) => ({
                                ...d,
                                amount: decimal(d.amount),
                                reference_month:
                                  o.kind === 'income' ? d.reference_month || null : null,
                              }),
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
                {(index === 0 || ruleRows[index - 1].kind !== r.kind) && (
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
                      Dia {r.expected_day} · {cadenceLabel(Number(r.interval_months || 1))} ·{' '}
                      {euro(r.amount)} · {r.active ? 'Ativa' : 'Inativa'}
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
                          {
                            name: 'interval_months',
                            label: 'Repetir',
                            value: r.interval_months || 1,
                            options: Array.from({ length: 24 }, (_, index) => ({
                              value: String(index + 1),
                              label: cadenceLabel(index + 1),
                            })),
                          },
                        ],
                        map: (d) => ({
                          ...d,
                          amount: decimal(d.amount),
                          interval_months: Number(d.interval_months),
                        }),
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
                  <button
                    className="icon-button danger"
                    aria-label={`Excluir recorrência ${r.description}`}
                    onClick={() =>
                      open(
                        zeroForm(
                          'Excluir recorrência',
                          `/recurrences/${r.id}`,
                          'DELETE',
                          'A regra e suas previsões não confirmadas deixarão de aparecer. Movimentações já confirmadas e saldos serão preservados.',
                        ),
                      )
                    }
                  >
                    <Trash2 size={15} />
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
          <div className="cards-grid compact card-wallets">
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
                    {!i.payment_id && (
                      <button
                        className="text-link"
                        onClick={() =>
                          open({
                            title: `Editar fatura · ${i.card_name}`,
                            description:
                              'O valor é calculado pelas compras; ajuste apenas as datas.',
                            path: `/invoices/${i.id}`,
                            method: 'PATCH',
                            fields: [
                              {
                                name: 'closes_on',
                                label: 'Data de fechamento',
                                type: 'date',
                                value: i.closes_on,
                              },
                              {
                                name: 'due_on',
                                label: 'Data de vencimento',
                                type: 'date',
                                value: i.due_on,
                              },
                            ],
                          })
                        }
                      >
                        Editar datas
                      </button>
                    )}
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
                              {
                                name: 'reference_month',
                                label: 'Mês a que esta fatura pertence',
                                type: 'month',
                                value: String(i.month).slice(0, 7),
                                hint: 'Uma fatura de outubro paga em setembro continuará no orçamento de outubro.',
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
