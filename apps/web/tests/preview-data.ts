// Synthetic fixtures exclusively for visual QA, not a demo mode in the product.
const accounts = [
  {
    id: 'a',
    name: 'Conta do dia a dia',
    nature: 'bank',
    purpose: 'available',
    balance: '1845.35',
    opening_date: '2026-01-01',
  },
  {
    id: 'b',
    name: 'Reserva de segurança',
    nature: 'pot',
    purpose: 'reserved',
    balance: '2650.00',
    opening_date: '2026-01-01',
  },
  {
    id: 'c',
    name: 'Benefício alimentação',
    nature: 'benefit',
    purpose: 'restricted',
    balance: '146.80',
    opening_date: '2026-01-01',
  },
];
const categories = [
  { id: 'c1', name: 'Moradia', kind: 'expense' },
  { id: 'c2', name: 'Alimentação', kind: 'expense' },
  { id: 'c3', name: 'Lazer', kind: 'expense' },
  { id: 'c4', name: 'Salário', kind: 'income' },
];
const budgets = [
  {
    category_id: 'c1',
    name: 'Moradia',
    budget: '700.00',
    budget_scope: 'future',
    spent: '650.00',
    expected: '0',
    committed: '0',
    remaining: '50.00',
    margin: '50.00',
  },
  {
    category_id: 'c2',
    name: 'Alimentação',
    budget: '300.00',
    budget_scope: 'month',
    spent: '212.40',
    expected: '0',
    committed: '40.00',
    remaining: '87.60',
    margin: '47.60',
  },
  {
    category_id: 'c3',
    name: 'Lazer',
    budget: '150.00',
    budget_scope: 'future',
    spent: '65.20',
    expected: '25.00',
    committed: '0',
    remaining: '84.80',
    margin: '59.80',
  },
];
export function fixtureResponse(url: string): unknown {
  const pathname = new URL(url, 'http://localhost').pathname;
  if (pathname === '/api/accounts') return accounts;
  if (pathname === '/api/categories') return categories;
  if (pathname.startsWith('/api/reports/'))
    return {
      month: '2026-09',
      as_of: '2026-09-22',
      accounts,
      total: '4642.15',
      available: '1845.35',
      reserved: '2650.00',
      restricted: '146.80',
      income: '2200.00',
      expense: '927.60',
      surplus: '1272.40',
      debt: '240.00',
      net: '4402.15',
      average_surplus: '425.80',
      savings_rate: '19.4',
      average_months: 8,
      budgets,
      categories: [
        { name: 'Moradia', amount: '650.00' },
        { name: 'Alimentação', amount: '212.40' },
        { name: 'Lazer', amount: '65.20' },
      ],
      evolution: Array.from({ length: 9 }, (_, i) => ({
        month: `2026-${String(i + 1).padStart(2, '0')}`,
        income: '2200.00',
        expense: String(1500 + i * 35),
        balance: String(1400 + i * 405),
        surplus: String(700 - i * 35),
      })),
    };
  if (pathname.startsWith('/api/budgets/')) return budgets;
  if (pathname === '/api/transactions')
    return [
      {
        id: 't1',
        description: 'Compras da semana',
        kind: 'expense',
        category_id: 'c2',
        category_name: 'Alimentação',
        source_id: 'a',
        source_name: 'Conta do dia a dia',
        amount: '42.80',
        occurred_on: '2026-09-20',
        version: 1,
      },
      {
        id: 't2',
        description: 'Aporte na reserva',
        kind: 'transfer',
        source_id: 'a',
        source_name: 'Conta do dia a dia',
        destination_id: 'b',
        destination_name: 'Reserva de segurança',
        amount: '250.00',
        received: '250.00',
        occurred_on: '2026-09-19',
        version: 1,
      },
      {
        id: 't3',
        description: 'Salário',
        kind: 'income',
        destination_id: 'a',
        destination_name: 'Conta do dia a dia',
        amount: '2200.00',
        occurred_on: '2026-09-01',
        category_name: 'Salário',
        version: 1,
      },
    ];
  if (pathname === '/api/goals')
    return [
      {
        id: 'g',
        name: 'Tranquilidade financeira',
        account_id: 'b',
        target: '6000.00',
        monthly_contribution: '300.00',
        balance: '2650.00',
        remaining: '3350.00',
        progress: '44.2',
        months_to_goal: '12',
      },
    ];
  if (pathname === '/api/recurrences')
    return [
      {
        id: 'r',
        description: 'Mensalidade',
        kind: 'expense',
        amount: '25.00',
        expected_day: 28,
        active: true,
      },
    ];
  if (pathname === '/api/occurrences')
    return [
      {
        id: 'o',
        description: 'Mensalidade',
        kind: 'expense',
        account_id: 'a',
        category_id: 'c3',
        amount: '25.00',
        due_on: '2026-09-28',
        state: 'pending',
      },
    ];
  if (pathname === '/api/cards')
    return [{ id: 'card', name: 'Cartão principal', closing_day: 20, due_day: 5 }];
  if (pathname === '/api/invoices')
    return [
      {
        id: 'i',
        card_name: 'Cartão principal',
        closes_on: '2026-09-20',
        due_on: '2026-10-05',
        amount: '80.00',
        payment_id: null,
      },
    ];
  if (pathname === '/api/purchases')
    return [
      {
        id: 'p',
        description: 'Compra de teste',
        card_name: 'Cartão principal',
        amount: '240.00',
        installments: 3,
        remaining: '240.00',
      },
    ];
  if (pathname === '/api/invoices/i')
    return {
      id: 'i',
      installments: [
        {
          id: 's',
          description: 'Compra de teste',
          category_name: 'Compras',
          number: 1,
          installments: 3,
          amount: '80.00',
        },
      ],
    };
  return [];
}
