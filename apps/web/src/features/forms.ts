import type { EntityOption, Field, FormSpec } from '../components/ui';
import { currentDate, type Row } from '../lib/api';

export const options = (items: Row[]) =>
  items.filter((i) => !i.archived).map((i) => ({ value: i.id, label: i.name }));
const accountGroups: Record<string, string> = {
  available: 'Contas disponíveis',
  reserved: 'Cofrinhos e reservas',
  restricted: 'Benefícios',
};
const accountGroupOrder: Record<string, number> = { available: 0, reserved: 1, restricted: 2 };
export const accountOptions = (items: Row[]): EntityOption[] =>
  items
    .filter((item) => !item.archived)
    .sort(
      (left, right) =>
        (accountGroupOrder[left.purpose] ?? 3) - (accountGroupOrder[right.purpose] ?? 3),
    )
    .map((item) => ({
      value: item.id,
      label: item.name,
      group: accountGroups[item.purpose] || 'Outras contas',
    }));
const value = (name: string, label: string, initial = ''): Field => ({
  name,
  label,
  value: initial,
  hint: 'EUR · exemplo: 125,50',
});
export const decimal = (text: string) => text.trim().replace(',', '.');
export const accountForm = (): FormSpec => ({
  title: 'Nova conta',
  description:
    'O saldo inicial é o dinheiro que já existe nesta conta. Não será contabilizado como receita.',
  path: '/accounts',
  fields: [
    { name: 'name', label: 'Nome da conta', type: 'wide' },
    {
      name: 'nature',
      label: 'Tipo',
      value: 'bank',
      options: [
        { value: 'bank', label: 'Conta bancária' },
        { value: 'pot', label: 'Cofrinho' },
        { value: 'cash', label: 'Dinheiro físico' },
        { value: 'benefit', label: 'Benefício' },
        { value: 'other', label: 'Outra' },
      ],
    },
    {
      name: 'purpose',
      label: 'Uso do dinheiro',
      value: 'available',
      options: [
        { value: 'available', label: 'Disponível para o dia a dia' },
        { value: 'reserved', label: 'Reservado para objetivos' },
        { value: 'restricted', label: 'Benefício de uso restrito' },
      ],
    },
    value('opening_balance', 'Saldo inicial', '0'),
    {
      name: 'opening_date',
      label: 'Data desse saldo',
      type: 'date',
      value: currentDate(),
      max: currentDate(),
    },
  ],
  map: (d) => ({ ...d, opening_balance: decimal(d.opening_balance) }),
});
export function transactionForm(
  kind: string,
  accounts: Row[],
  categories: Row[],
  existing?: Row,
): FormSpec {
  const fields: Field[] = [
    { name: 'description', label: 'Descrição', type: 'wide', value: existing?.description },
    value('amount', kind === 'transfer' ? 'Valor que sai' : 'Valor', existing?.amount),
    {
      name: 'occurred_on',
      label: 'Data efetiva',
      type: 'date',
      value: existing?.occurred_on || currentDate(),
      max: currentDate(),
    },
  ];
  if (kind !== 'income')
    fields.push({
      name: 'source_id',
      label: 'Conta de origem',
      options: accountOptions(accounts),
      searchable: true,
      value: existing?.source_id,
    });
  if (kind !== 'expense')
    fields.push({
      name: 'destination_id',
      label: kind === 'income' ? 'Conta' : 'Conta de destino',
      options: accountOptions(accounts),
      searchable: true,
      value: existing?.destination_id,
    });
  if (kind === 'transfer') fields.push(value('received', 'Valor que entra', existing?.received));
  fields.push({
    name: 'category_id',
    label: kind === 'transfer' ? 'Categoria da perda (se houver)' : 'Categoria',
    options: options(
      categories.filter((c) => c.kind === (kind === 'income' ? 'income' : 'expense')),
    ),
    searchable: true,
    required: kind !== 'transfer',
    value: existing?.category_id,
  });
  return {
    title: `${existing ? 'Editar' : 'Nova'} ${kind === 'income' ? 'receita' : kind === 'expense' ? 'despesa' : 'transferência'}`,
    description:
      kind === 'transfer'
        ? 'Informe quanto sai e quanto entra. A diferença será uma despesa na categoria da perda.'
        : 'Registre apenas o que efetivamente aconteceu.',
    path: existing ? `/transactions/${existing.id}` : '/transactions',
    method: existing ? 'PATCH' : 'POST',
    fields,
    map: (d) => ({
      ...d,
      kind,
      amount: decimal(d.amount),
      received: d.received ? decimal(d.received) : null,
      category_id: d.category_id || null,
      ...(existing ? { version: existing.version } : {}),
    }),
  };
}
export const transactionCreateForm = (accounts: Row[], categories: Row[]): FormSpec => ({
  title: 'Nova movimentação',
  path: '/transactions',
  fields: [],
  variants: [
    { value: 'expense', label: 'Despesa', spec: transactionForm('expense', accounts, categories) },
    { value: 'income', label: 'Receita', spec: transactionForm('income', accounts, categories) },
    {
      value: 'transfer',
      label: 'Transferência',
      spec: transactionForm('transfer', accounts, categories),
    },
  ],
});
export const recurrenceForm = (accounts: Row[], categories: Row[], kind: string): FormSpec => ({
  title:
    kind === 'income'
      ? 'Receita recorrente'
      : kind === 'transfer'
        ? 'Aporte recorrente'
        : 'Despesa recorrente',
  description: 'Esta previsão nunca altera seu saldo automaticamente.',
  path: '/recurrences',
  fields: [
    { name: 'description', label: 'Descrição', type: 'wide' },
    value('amount', 'Valor esperado'),
    { name: 'expected_day', label: 'Dia esperado', type: 'number', min: 1, max: 31, value: 5 },
    {
      name: 'account_id',
      label: kind === 'transfer' ? 'Conta de origem' : 'Conta',
      options: accountOptions(accounts),
      searchable: true,
    },
    ...(kind === 'transfer'
      ? [
          {
            name: 'destination_id',
            label: 'Conta de destino',
            options: accountOptions(accounts),
            searchable: true,
          },
        ]
      : [
          {
            name: 'category_id',
            label: 'Categoria',
            options: options(categories.filter((c) => c.kind === kind)),
            searchable: true,
          },
        ]),
    { name: 'starts_on', label: 'A partir de', type: 'date', value: currentDate() },
    { name: 'ends_on', label: 'Até (opcional)', type: 'date', required: false },
  ],
  map: (d) => ({
    ...d,
    kind,
    amount: decimal(d.amount),
    expected_day: Number(d.expected_day),
    ends_on: d.ends_on || null,
  }),
});
export const recurrenceCreateForm = (accounts: Row[], categories: Row[]): FormSpec => ({
  title: 'Novo recorrente',
  path: '/recurrences',
  fields: [],
  variants: [
    { value: 'expense', label: 'Despesa', spec: recurrenceForm(accounts, categories, 'expense') },
    { value: 'income', label: 'Receita', spec: recurrenceForm(accounts, categories, 'income') },
    {
      value: 'transfer',
      label: 'Transferência',
      spec: recurrenceForm(accounts, categories, 'transfer'),
    },
  ],
});
export const goalForm = (accounts: Row[]): FormSpec => ({
  title: 'Nova meta',
  description:
    'O progresso acompanha o saldo do cofrinho. Não é preciso cadastrar o dinheiro novamente.',
  path: '/goals',
  fields: [
    { name: 'name', label: 'Nome da meta', type: 'wide' },
    {
      name: 'account_id',
      label: 'Cofrinho associado',
      options: accountOptions(accounts.filter((a) => a.purpose === 'reserved')),
      searchable: true,
    },
    value('target', 'Valor objetivo'),
    value('monthly_contribution', 'Aporte mensal planejado', '0'),
    { name: 'deadline', label: 'Prazo (opcional)', type: 'date', required: false },
  ],
  map: (d) => ({
    ...d,
    target: decimal(d.target),
    monthly_contribution: decimal(d.monthly_contribution),
    deadline: d.deadline || null,
  }),
});
export const cardForm = (): FormSpec => ({
  title: 'Novo cartão',
  description:
    'Cadastre apenas o nome e as datas. Não informe número, código de segurança ou dados sensíveis.',
  path: '/cards',
  fields: [
    { name: 'name', label: 'Nome do cartão', type: 'wide' },
    { name: 'closing_day', label: 'Dia de fechamento', type: 'number', min: 1, max: 31, value: 20 },
    { name: 'due_day', label: 'Dia de vencimento', type: 'number', min: 1, max: 31, value: 5 },
  ],
  map: (d) => ({ ...d, closing_day: Number(d.closing_day), due_day: Number(d.due_day) }),
});
