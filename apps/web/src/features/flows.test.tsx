// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Accounts, Transactions, Cards, FuturePlans, Goals, Recurrences } from './pages';
import { EntityCombobox, FormDialog } from '../components/ui';
import { futurePlanForm, transactionCreateForm, transactionForm } from './forms';
import { buildPurchaseSchedule, PurchaseDialog } from './purchase-dialog';
import { euro } from '../lib/api';

vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ getToken: async () => 'test-session' }),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState({}, '', '/');
});
const account = { id: 'acc-1', name: 'Principal', balance: '100', purpose: 'available' },
  category = { id: 'cat-1', name: 'Alimentação', kind: 'expense' };
const wrap = (node: React.ReactNode) => (
  <QueryClientProvider
    client={
      new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      })
    }
  >
    <BrowserRouter>{node}</BrowserRouter>
  </QueryClientProvider>
);

describe('financial UI flows', () => {
  it('keeps a searchable dropdown open while its own scroll area is used', async () => {
    render(
      wrap(
        <EntityCombobox
          options={Array.from({ length: 20 }, (_, index) => ({
            value: String(index),
            label: `Categoria extensa ${index}`,
          }))}
          value=""
          onChange={vi.fn()}
          optional={false}
          invalid={false}
        />,
      ),
    );
    await userEvent.click(screen.getByRole('combobox'));
    const list = screen.getByRole('listbox');
    fireEvent.pointerDown(list);
    fireEvent.wheel(list, { deltaY: 1000 });
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('listbox')).toBeNull();
  });
  it('formats large monetary values without Number precision loss', () => {
    expect(euro('99999999999999999.99').replace(/\s/g, '')).toBe('99999999999999999,99€');
    expect(euro('-0.01')).toContain('0,01');
  });
  it('opens edit/delete actions for a real transaction', async () => {
    const open = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify([
              {
                id: 'tx',
                kind: 'expense',
                description: 'Mercado',
                source_name: 'Principal',
                source_id: 'acc-1',
                category_id: 'cat-1',
                amount: '12.50',
                occurred_on: '2026-01-01',
                version: 2,
              },
            ]),
            { status: 200 },
          ),
      ),
    );
    render(
      wrap(
        <Transactions
          month="2026-01"
          setMonth={vi.fn()}
          accounts={[account]}
          categories={[category]}
          open={open}
        />,
      ),
    );
    await screen.findByText('Mercado');
    await userEvent.click(screen.getByRole('button', { name: 'Editar Mercado' }));
    expect(open.mock.lastCall?.[0].method).toBe('PATCH');
    await userEvent.click(screen.getByRole('button', { name: 'Excluir Mercado' }));
    expect(open.mock.lastCall?.[0].path).toBe('/transactions/tx?version=2');
  });
  it('uses one primary action to choose any movement type', async () => {
    const open = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('[]', { status: 200 })),
    );
    render(
      wrap(
        <Transactions
          month="2026-01"
          setMonth={vi.fn()}
          accounts={[account]}
          categories={[category]}
          open={open}
        />,
      ),
    );
    await screen.findByText('Nenhuma movimentação encontrada');
    await userEvent.click(screen.getByRole('button', { name: 'Nova movimentação' }));
    expect(open.mock.lastCall?.[0].title).toBe('Nova movimentação');
    expect(open.mock.lastCall?.[0].variants.map((variant: any) => variant.value)).toEqual([
      'expense',
      'income',
      'transfer',
    ]);
  });
  it('sends account setup to the Accounts area instead of opening it in Movements', async () => {
    const open = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('[]', { status: 200 })),
    );
    render(
      wrap(
        <Transactions
          month="2026-01"
          setMonth={vi.fn()}
          accounts={[]}
          categories={[category]}
          open={open}
        />,
      ),
    );
    const link = screen.getByRole('link', { name: 'Ir para Contas' });
    expect(link.getAttribute('href')).toBe('/accounts');
    expect(screen.queryByRole('button', { name: 'Nova movimentação' })).toBeNull();
    expect(open).not.toHaveBeenCalled();
  });
  it('keeps account creation out of Recurrences', () => {
    const open = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('[]', { status: 200 })),
    );
    render(
      wrap(
        <Recurrences
          month="2026-01"
          setMonth={vi.fn()}
          accounts={[]}
          categories={[category]}
          open={open}
        />,
      ),
    );
    expect(screen.getByRole('link', { name: 'Ir para Contas' }).getAttribute('href')).toBe(
      '/accounts',
    );
    expect(screen.queryByRole('button', { name: 'Novo recorrente' })).toBeNull();
    expect(open).not.toHaveBeenCalled();
  });
  it('keeps cofrinho creation in Accounts when Goals has no eligible account', async () => {
    const open = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('[]', { status: 200 })),
    );
    render(
      wrap(<Goals month="2026-01" setMonth={vi.fn()} accounts={[]} categories={[]} open={open} />),
    );
    await screen.findByText('Crie um cofrinho primeiro');
    expect(screen.getByRole('link', { name: 'Ir para Contas' }).getAttribute('href')).toBe(
      '/accounts',
    );
    expect(screen.queryByRole('button', { name: 'Criar cofrinho' })).toBeNull();
    expect(open).not.toHaveBeenCalled();
  });
  it('guides card creation before exposing purchase registration', async () => {
    const open = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('[]', { status: 200 })),
    );
    render(
      wrap(
        <Cards
          month="2026-01"
          setMonth={vi.fn()}
          accounts={[account]}
          categories={[category]}
          open={open}
        />,
      ),
    );
    await screen.findByText('Cadastre seu primeiro cartão');
    expect(screen.queryByRole('button', { name: 'Registrar compra' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Criar cartão' }));
    expect(open.mock.lastCall?.[0].path).toBe('/cards');
  });
  it('keeps card registration distinct from payment confirmation', async () => {
    const open = vi.fn();
    const openPurchase = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (input) =>
          new Response(
            JSON.stringify(
              String(input).endsWith('/cards')
                ? [{ id: 'card', name: 'Cartão', closing_day: 20, due_day: 5 }]
                : String(input).endsWith('/invoices/invoice')
                  ? {
                      id: 'invoice',
                      payment_id: null,
                      installments: [
                        {
                          id: 'installment',
                          description: 'Compra',
                          number: 1,
                          installments: 3,
                          category_name: 'Alimentação',
                          amount: '11.11',
                          settled_before_tracking: false,
                        },
                      ],
                    }
                  : String(input).endsWith('/invoices')
                    ? [
                        {
                          id: 'invoice',
                          card_name: 'Cartão',
                          closes_on: '2026-01-20',
                          due_on: '2026-02-05',
                          amount: '33.34',
                          payment_id: null,
                        },
                      ]
                    : String(input).endsWith('/purchases')
                      ? [
                          {
                            id: 'purchase',
                            description: 'Compra',
                            card_name: 'Cartão',
                            installments: 3,
                            amount: '33.34',
                            financed_total: '33.34',
                            remaining: '33.34',
                            editable: true,
                          },
                        ]
                      : [],
            ),
            { status: 200 },
          ),
      ),
    );
    render(
      wrap(
        <Cards
          month="2026-01"
          setMonth={vi.fn()}
          accounts={[account]}
          categories={[category]}
          open={open}
          openPurchase={openPurchase}
        />,
      ),
    );
    await screen.findByRole('heading', { name: 'Cartão' });
    expect(screen.queryByRole('button', { name: /Editar fatura/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Detalhes' }));
    await screen.findByText('1/3 · Alimentação');
    expect(screen.queryByRole('button', { name: /Editar parcela/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Editar compra Compra' }));
    expect(openPurchase).toHaveBeenCalledWith(expect.objectContaining({ purchaseId: 'purchase' }));
    await userEvent.click(screen.getByRole('button', { name: 'Pagar' }));
    expect(open.mock.lastCall?.[0].path).toBe('/invoices/invoice/pay');
    expect(open.mock.lastCall?.[0].description).toContain('pagamento real');
  });
  it('a recurrence requires an explicit confirmation form', async () => {
    const open = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (input) =>
          new Response(
            JSON.stringify(
              String(input).includes('occurrences')
                ? [
                    {
                      id: 'occ',
                      description: 'Aluguel',
                      kind: 'expense',
                      account_id: 'acc-1',
                      amount: '375.00',
                      state: 'pending',
                      due_on: '2026-01-05',
                    },
                  ]
                : [],
            ),
            { status: 200 },
          ),
      ),
    );
    render(
      wrap(
        <Recurrences
          month="2026-01"
          setMonth={vi.fn()}
          accounts={[account]}
          categories={[category]}
          open={open}
        />,
      ),
    );
    await screen.findByText('Aluguel');
    expect(screen.getByRole('heading', { name: 'Saídas e transferências previstas' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(open.mock.lastCall?.[0].path).toBe('/occurrences/occ/confirm');
    expect(open.mock.lastCall?.[0].fields.map((f: any) => f.name)).toEqual([
      'account_id',
      'amount',
      'occurred_on',
    ]);
  });
  it('keeps future plans visibly separate from current balances', async () => {
    const open = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify([
              {
                id: 'plan',
                name: 'Mudança',
                theme: 'move',
                target_date: '2027-06-01',
                estimated_cost: '3000.00',
                initial_estimate: '3000.00',
                total_cost: '3000.00',
                total_income: '10800.00',
                reserved_amount: '600.00',
                remaining: '0.00',
                progress: '100.0',
                months_remaining: 9,
                monthly_income: '1200.00',
                monthly_expenses: '700.00',
                monthly_capacity: '500.00',
                monthly_needed: '266.67',
                monthly_margin: '233.33',
                projected_balance: '8400.00',
                viability: 'viable',
                status: 'active',
                items: [
                  {
                    id: 'salary',
                    pocket_id: 'principal',
                    kind: 'income',
                    name: 'Salário',
                    cadence: 'recurring',
                    interval_months: 1,
                    amount: '1200.00',
                    projected_total: '10800.00',
                  },
                  {
                    id: 'base',
                    kind: 'expense',
                    name: 'Estimativa inicial',
                    cadence: 'once',
                    amount: '3000.00',
                    projected_total: '3000.00',
                  },
                  {
                    id: 'rent',
                    pocket_id: 'principal',
                    kind: 'expense',
                    name: 'Aluguel',
                    cadence: 'recurring',
                    interval_months: 1,
                    amount: '700.00',
                    projected_total: '6300.00',
                  },
                ],
              },
            ]),
            { status: 200 },
          ),
      ),
    );
    window.history.replaceState({}, '', '/future-plans/plan');
    render(
      wrap(
        <Routes>
          <Route
            path="/future-plans/:planId"
            element={
              <FuturePlans
                month="2026-09"
                setMonth={vi.fn()}
                accounts={[account]}
                categories={[category]}
                open={open}
              />
            }
          />
        </Routes>,
      ),
    );
    await screen.findByRole('heading', { name: 'Mudança', level: 1 });
    expect(screen.getByText(/Analise caixas, desembolsos/)).toBeTruthy();
    expect(screen.getByText('Plano viável')).toBeTruthy();
    expect(screen.getByText('Salário')).toBeTruthy();
    expect(screen.getByText('Aluguel')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Receita' }));
    expect(open.mock.lastCall?.[0].path).toBe('/future-plans/plan/items');
    expect(open.mock.lastCall?.[0].fields.map((field: any) => field.name)).toContain('pocket_id');
    expect(
      open.mock.lastCall?.[0].map({
        name: 'Freelance',
        amount: '300',
        schedule: '6',
        pocket_id: 'principal',
        due_on: '',
        notes: '',
      }),
    ).toMatchObject({ cadence: 'recurring', interval_months: 6, pocket_id: 'principal' });
    await userEvent.click(screen.getByRole('button', { name: 'Nova caixa' }));
    expect(open.mock.lastCall?.[0].path).toBe('/future-plans/plan/pockets');
    await userEvent.click(screen.getByRole('button', { name: /Editar dados gerais/ }));
    expect(open.mock.lastCall?.[0].path).toBe('/future-plans/plan');
    await userEvent.click(screen.getByRole('button', { name: 'Excluir plano Mudança' }));
    expect(open.mock.lastCall?.[0]).toMatchObject({
      path: '/future-plans/plan',
      method: 'DELETE',
    });
  });
  it('keeps the plan index concise and links to a dedicated dashboard', async () => {
    window.history.replaceState({}, '', '/future-plans');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json([
          {
            id: 'move',
            name: 'Mudança',
            theme: 'move',
            target_date: '2027-06-01',
            months_remaining: 9,
            upfront_available: '600.00',
            upfront_gap: '2400.00',
            monthly_margin: '300.00',
            projected_balance: '900.00',
            status: 'active',
          },
        ]),
      ),
    );
    render(
      wrap(
        <Routes>
          <Route
            path="/future-plans"
            element={
              <FuturePlans
                month="2026-09"
                setMonth={vi.fn()}
                accounts={[account]}
                categories={[category]}
                open={vi.fn()}
              />
            }
          />
        </Routes>,
      ),
    );
    await screen.findByRole('heading', { name: 'Mudança' });
    expect(screen.getByRole('link', { name: /Abrir dashboard/ }).getAttribute('href')).toBe(
      '/future-plans/move',
    );
    expect(screen.queryByText('CAIXAS DO CENÁRIO')).toBeNull();
  });
  it('normalizes comma decimals and preserves user values after server rejection', async () => {
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute('open', '');
    };
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ message: 'Conta indisponível.' }), { status: 400 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(
      wrap(
        <FormDialog spec={transactionForm('expense', [account], [category])} onClose={vi.fn()} />,
      ),
    );
    await userEvent.type(screen.getByLabelText('Descrição'), 'Mercado');
    await userEvent.type(screen.getByLabelText(/Valor/), '12,50');
    await userEvent.click(screen.getByRole('combobox', { name: 'Conta de origem' }));
    await userEvent.click(screen.getByRole('option', { name: 'Principal' }));
    await userEvent.click(screen.getByRole('combobox', { name: 'Categoria' }));
    await userEvent.click(screen.getByRole('option', { name: 'Alimentação' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('alert').textContent).toBe('Conta indisponível.');
    expect((screen.getByLabelText(/Valor/) as HTMLInputElement).value).toBe('12,50');
    expect(JSON.parse((fetchMock.mock.calls[0] as any)[1].body).amount).toBe('12.50');
  });
  it('does not validate a future plan date as a monetary value', async () => {
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute('open', '');
    };
    const fetchMock = vi.fn(async () => Response.json({ id: 'plan-1' }, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const onClose = vi.fn();
    render(wrap(<FormDialog spec={futurePlanForm()} onClose={onClose} />));
    await userEvent.type(screen.getByLabelText('Nome do plano'), 'Viagem Aveiro');
    await userEvent.type(screen.getByLabelText(/Estimativa inicial do custo/), '250');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(screen.queryByText('Use um valor em euros com até duas casas decimais.')).toBeNull();
    expect(
      (screen.getByLabelText('Quando gostaria de realizar?') as HTMLInputElement).inputMode,
    ).toBe('');
    expect(onClose).toHaveBeenCalledOnce();
  });
  it('preserves compatible fields when the movement type changes', async () => {
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute('open', '');
    };
    render(
      wrap(<FormDialog spec={transactionCreateForm([account], [category])} onClose={vi.fn()} />),
    );
    await userEvent.type(screen.getByLabelText('Descrição'), 'Mercado mensal');
    await userEvent.type(screen.getByLabelText(/Valor/), '42,50');
    await userEvent.click(screen.getByRole('combobox', { name: 'Conta de origem' }));
    await userEvent.click(screen.getByRole('option', { name: 'Principal' }));
    await userEvent.click(screen.getByRole('button', { name: 'Receita' }));
    expect((screen.getByLabelText('Descrição') as HTMLInputElement).value).toBe('Mercado mensal');
    expect((screen.getByLabelText(/Valor/) as HTMLInputElement).value).toBe('42,50');
    expect((screen.getByRole('combobox', { name: 'Conta' }) as HTMLInputElement).value).toBe(
      'Principal',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Despesa' }));
    expect((screen.getByLabelText('Descrição') as HTMLInputElement).value).toBe('Mercado mensal');
  });
  it('groups account choices by how the money can be used', async () => {
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute('open', '');
    };
    const accounts = [
      account,
      { id: 'reserve', name: 'Emergência', purpose: 'reserved' },
      { id: 'benefit', name: 'Alimentação', purpose: 'restricted' },
    ];
    render(
      wrap(
        <FormDialog spec={transactionForm('expense', accounts, [category])} onClose={vi.fn()} />,
      ),
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'Conta de origem' }));
    expect(screen.getByText('Contas disponíveis')).toBeTruthy();
    expect(screen.getByText('Cofrinhos e reservas')).toBeTruthy();
    expect(screen.getByText('Benefícios')).toBeTruthy();
  });
  it('separates account cards by purpose on the Accounts page', () => {
    const accounts = [
      { ...account, opening_date: '2026-01-01' },
      {
        id: 'reserve',
        name: 'Emergência',
        purpose: 'reserved',
        balance: '50',
        opening_date: '2026-01-01',
      },
      {
        id: 'benefit',
        name: 'Alimentação',
        purpose: 'restricted',
        balance: '20',
        opening_date: '2026-01-01',
      },
    ];
    render(
      wrap(
        <Accounts
          month="2026-01"
          setMonth={vi.fn()}
          accounts={accounts}
          categories={[]}
          open={vi.fn()}
        />,
      ),
    );
    expect(screen.getByRole('heading', { name: 'Contas disponíveis' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Cofrinhos e reservas' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Benefícios' })).toBeTruthy();
  });
  it('previews editable invoice values before creating a purchase', () => {
    const schedule = buildPurchaseSchedule(
      {
        card_id: 'card',
        category_id: 'cat-1',
        description: 'Notebook',
        amount: '338',
        installments: '3',
        purchased_on: '2026-01-01',
      },
      '2026-02-05',
    );
    expect(schedule).toEqual([
      { number: 1, amount: '112.66', due_on: '2026-02-05', paid: false },
      { number: 2, amount: '112.67', due_on: '2026-03-05', paid: false },
      { number: 3, amount: '112.67', due_on: '2026-04-05', paid: false },
    ]);
  });
  it('creates a purchase in two steps and marks individual installments as already paid', async () => {
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute('open', '');
    };
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(
      wrap(
        <PurchaseDialog
          spec={{
            cards: [{ id: 'card', name: 'Principal', closing_day: 20, due_day: 5 }],
            categories: [category],
          }}
          onClose={vi.fn()}
        />,
      ),
    );
    await userEvent.type(screen.getByLabelText('Descrição'), 'Notebook');
    await userEvent.click(screen.getByRole('combobox', { name: 'Categoria' }));
    await userEvent.click(screen.getByRole('option', { name: 'Alimentação' }));
    await userEvent.type(screen.getByLabelText('Valor da compra'), '338');
    await userEvent.clear(screen.getByLabelText('Número de parcelas'));
    await userEvent.type(screen.getByLabelText('Número de parcelas'), '3');
    expect(screen.queryByText('Rever faturas', { selector: 'h3' })).toBeNull();
    expect(screen.queryByLabelText('Valor fixo por parcela (opcional)')).toBeNull();
    expect(screen.queryByLabelText('Primeira fatura')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Rever faturas' }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Rever faturas' })).toBeTruthy();
    expect(screen.getAllByLabelText(/Valor da parcela/)).toHaveLength(3);
    const firstAmount = screen.getByLabelText('Valor da parcela 1');
    await userEvent.clear(firstAmount);
    await userEvent.type(firstAmount, '113');
    expect((firstAmount as HTMLInputElement).value).toBe('113');
    expect(screen.getByText(/Total das parcelas/).textContent).toContain('338,34');
    const paid = screen.getAllByRole('button', { name: 'Marcar como já paga' })[0];
    await userEvent.click(paid);
    expect(
      screen.getByRole('button', { name: 'Já estava paga' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });
  it('loads an existing purchase with its installment count and editable schedule', async () => {
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute('open', '');
    };
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: 'purchase',
            description: 'Notebook',
            card_id: 'card',
            category_id: 'cat-1',
            amount: '338.00',
            installments: 3,
            purchased_on: '2026-01-01',
            schedule: [
              { number: 1, amount: '113.00', due_on: '2026-02-05', settled_before_tracking: true },
              { number: 2, amount: '113.00', due_on: '2026-03-05', settled_before_tracking: false },
              { number: 3, amount: '113.00', due_on: '2026-04-05', settled_before_tracking: false },
            ],
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(
      wrap(
        <PurchaseDialog
          spec={{
            purchaseId: 'purchase',
            cards: [{ id: 'card', name: 'Principal', closing_day: 20, due_day: 5 }],
            categories: [category],
          }}
          onClose={vi.fn()}
        />,
      ),
    );
    expect(await screen.findByDisplayValue('Notebook')).toBeTruthy();
    expect((screen.getByLabelText('Número de parcelas') as HTMLInputElement).value).toBe('3');
    await userEvent.click(screen.getByRole('button', { name: 'Rever faturas' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getAllByLabelText(/Valor da parcela/)).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Já estava paga' })).toBeTruthy();
  });
});
