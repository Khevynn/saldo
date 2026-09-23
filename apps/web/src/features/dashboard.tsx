import { ArrowDownLeft, ArrowUpRight, Wallet, Landmark, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  BarChart,
  Bar,
  Legend,
} from 'recharts';
import { Empty, LoadState, PageHeader, Panel, PeriodNavigator, Progress } from '../components/ui';
import { euro, useData, type Row } from '../lib/api';

export function Dashboard({
  month,
  setMonth,
}: {
  month: string;
  setMonth: (month: string) => void;
}) {
  const [annual, setAnnual] = useState(false);
  const goals = useData('/goals');
  const query = useData<Row>(
      annual ? `/reports/annual?year=${month.slice(0, 4)}` : `/reports/overview?month=${month}`,
    ),
    r = query.data;
  if (!r) return <LoadState loading={query.isLoading} error={query.error} />;
  const chart = r.evolution.map((p: Row) => ({
    ...p,
    label: p.month.slice(5) + '/' + p.month.slice(2, 4),
    income: Number(p.income),
    expense: Number(p.expense),
    balance: Number(p.balance),
  }));
  return (
    <>
      <PageHeader
        eyebrow="VISÃO GERAL"
        title="Seu dinheiro, com clareza."
        description="Entenda o presente. Prepare seus próximos passos."
        action={
          <div className="header-actions">
            <PeriodNavigator month={month} onChange={setMonth} />
            <select
              aria-label="Abrangência da análise"
              value={annual ? 'year' : 'month'}
              onChange={(e) => setAnnual(e.target.value === 'year')}
            >
              <option value="month">Mês selecionado</option>
              <option value="year">Ano de {month.slice(0, 4)}</option>
            </select>
          </div>
        }
      />
      <div className="metric-grid">
        <article className="metric featured">
          <div>
            <span>Total nas contas</span>
            <Wallet size={19} />
          </div>
          <strong>{euro(r.total)}</strong>
          <small>Posição em {new Date(r.as_of + 'T12:00:00').toLocaleDateString('pt-PT')}</small>
          <div className="metric-foot">
            Disponível no dia a dia <b>{euro(r.available)}</b>
          </div>
        </article>
        <article className="metric">
          <div>
            <span>Receitas do {annual ? 'ano' : 'mês'}</span>
            <ArrowDownLeft size={19} />
          </div>
          <strong>{euro(r.income)}</strong>
          <small>Apenas valores recebidos</small>
        </article>
        <article className="metric">
          <div>
            <span>Despesas do {annual ? 'ano' : 'mês'}</span>
            <ArrowUpRight size={19} />
          </div>
          <strong>{euro(r.expense)}</strong>
          <small>Pagamentos e perdas realizados</small>
        </article>
        <article className="metric">
          <div>
            <span>Sobra do {annual ? 'ano' : 'mês'}</span>
            <Landmark size={19} />
          </div>
          <strong className={Number(r.surplus) < 0 ? 'danger' : ''}>{euro(r.surplus)}</strong>
          <small>Receitas menos despesas</small>
        </article>
      </div>
      <div className="insight-strip">
        <span>
          Reservas <b>{euro(r.reserved)}</b>
        </span>
        <span>
          Benefícios <b>{euro(r.restricted)}</b>
        </span>
        <span>
          Dívidas do cartão <b>{euro(r.debt)}</b>
        </span>
        <span>
          Saldo líquido acompanhado <b>{euro(r.net)}</b>
        </span>
      </div>
      {!r.accounts.length ? (
        <Panel title="Um começo simples">
          <Empty
            title="Onde está seu dinheiro hoje?"
            action={
              <Link className="button" to="/accounts">
                Cadastrar primeira conta <ChevronRight size={16} />
              </Link>
            }
          >
            Adicione uma conta e seu saldo inicial. Depois, registre receitas, despesas e
            transferências.
          </Empty>
        </Panel>
      ) : (
        <div className="dashboard-grid">
          <Panel
            title="Evolução das contas"
            description="Saldos reais no fim de cada mês"
            className="chart-panel"
          >
            {chart.length ? (
              <ResponsiveContainer width="100%" height={245}>
                <AreaChart data={chart} margin={{ top: 20, right: 16, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2d7362" stopOpacity={0.18} />
                      <stop offset="100%" stopColor="#2d7362" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="#e9ede9" />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis width={60} axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => euro(Number(v))} />
                  <Area
                    type="monotone"
                    dataKey="balance"
                    name="Saldo"
                    stroke="#2d7362"
                    strokeWidth={2.5}
                    fill="url(#balanceGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <Empty title="Histórico em construção">
                Os saldos aparecerão conforme você acompanhar suas contas.
              </Empty>
            )}
          </Panel>
          <Panel
            title="Suas contas"
            description="Cada valor no seu lugar"
            action={
              <Link className="text-link" to="/accounts">
                Ver todas <ChevronRight size={14} />
              </Link>
            }
          >
            <div className="account-list">
              {r.accounts.slice(0, 5).map((a: Row) => (
                <div className="list-row" key={a.id}>
                  <span className="account-icon">
                    <Wallet size={17} />
                  </span>
                  <div className="grow">
                    <b>{a.name}</b>
                    <small>
                      {a.purpose === 'reserved'
                        ? 'Reservado'
                        : a.purpose === 'restricted'
                          ? 'Uso restrito'
                          : 'Disponível'}
                    </small>
                  </div>
                  <strong>{euro(a.balance)}</strong>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Entradas e saídas" description="Movimentações realizadas, sem previsões">
            {chart.length ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chart}>
                  <CartesianGrid strokeDasharray="3 6" vertical={false} />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis width={60} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v) => euro(Number(v))} />
                  <Legend />
                  <Bar name="Receitas" dataKey="income" fill="#2d7362" radius={[3, 3, 0, 0]} />
                  <Bar name="Despesas" dataKey="expense" fill="#c3ada0" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : null}
          </Panel>
          <Panel title="Para onde o dinheiro foi" description="Despesas por categoria">
            {r.categories.length ? (
              <div className="category-list">
                {r.categories.slice(0, 6).map((c: Row) => (
                  <div key={c.name}>
                    <div className="split">
                      <span>{c.name}</span>
                      <b>{euro(c.amount)}</b>
                    </div>
                    <div className="category-bar">
                      <span
                        style={{
                          width: `${Number(r.expense) > 0 ? (Number(c.amount) / Number(r.expense)) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty title="Nenhuma despesa neste mês">
                Os pagamentos aparecerão aqui por categoria.
              </Empty>
            )}
          </Panel>
        </div>
      )}
      <Panel
        title="Seus objetivos"
        description="Progresso atual dos cofrinhos, independente do período de análise"
        action={
          <Link className="text-link" to="/goals">
            Ver metas <ChevronRight size={14} />
          </Link>
        }
        className="goals-overview"
      >
        <LoadState loading={goals.isLoading} error={goals.error} />
        {goals.data?.filter((g) => !g.archived).length ? (
          <div className="cards-grid">
            {goals.data
              .filter((g) => !g.archived)
              .slice(0, 3)
              .map((g) => (
                <div key={g.id}>
                  <div className="split">
                    <b>{g.name}</b>
                    <span>{g.progress}%</span>
                  </div>
                  <p className="quiet-note">
                    {euro(g.balance)} de {euro(g.target)}
                  </p>
                  <Progress value={Number(g.progress)} />
                </div>
              ))}
          </div>
        ) : !goals.isLoading && !goals.error ? (
          <p className="quiet-note">
            Associe uma meta a um cofrinho para acompanhar seu progresso.
          </p>
        ) : null}
      </Panel>
      <div className="summary-grid">
        <Panel
          title="Sua consistência"
          description={`${r.average_months} meses completos nos últimos 12 meses`}
        >
          <div className="split">
            <span>Sobra média mensal</span>
            <strong>
              {r.average_surplus === null ? 'Ainda sem histórico' : euro(r.average_surplus)}
            </strong>
          </div>
          <div className="split">
            <span>Taxa de poupança</span>
            <strong>{r.savings_rate === null ? 'Sem dados' : `${r.savings_rate}%`}</strong>
          </div>
          <p className="footnote">
            Inclui benefícios recebidos. Transferir para uma reserva não conta como nova poupança.
          </p>
        </Panel>
        <Panel
          title="Atenção ao orçamento"
          description="Limites que merecem uma revisão"
          action={
            <Link className="text-link" to="/budgets">
              Ver orçamento <ChevronRight size={14} />
            </Link>
          }
        >
          {r.budgets.filter(
            (b: Row) =>
              b.budget !== null && Number(b.spent) >= Number(b.budget) * 0.8 && Number(b.spent) > 0,
          ).length ? (
            r.budgets
              .filter(
                (b: Row) =>
                  b.budget !== null &&
                  Number(b.spent) >= Number(b.budget) * 0.8 &&
                  Number(b.spent) > 0,
              )
              .slice(0, 3)
              .map((b: Row) => (
                <div className="list-row" key={b.category_id}>
                  <span className="grow">{b.name}</span>
                  <b>
                    {euro(b.spent)} / {euro(b.budget)}
                  </b>
                </div>
              ))
          ) : (
            <p className="quiet-note">Nenhuma categoria próxima do limite neste mês.</p>
          )}
        </Panel>
      </div>
    </>
  );
}
