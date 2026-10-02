import type { Row } from './api';
import { currentDate, dateLabel, euro } from './api';

export type Option = { label: string; value: string; description?: string };
export type Field = {
  name: string;
  label: string;
  value?: string | number | null;
  type?: 'text' | 'number' | 'date' | 'month' | 'textarea' | 'select' | 'checkbox';
  options?: Option[];
  required?: boolean;
  hint?: string;
  min?: string | number;
  max?: string | number;
  currency?: boolean;
  integer?: boolean;
  visibleWhen?: (values: Record<string, string>) => boolean;
};
export type FormSpec = {
  title: string;
  description?: string;
  submitLabel?: string;
  path: string;
  method?: string;
  fields: Field[];
  purchaseSchedule?: { cards: Row[]; existing?: Row };
  map?: (values: Record<string, string>) => unknown;
  confirm?: (values: Record<string, string>) => {
    title: string;
    message: string;
    confirmLabel?: string;
  } | null;
};

const money = (name: string, label: string, value: unknown = ''): Field => ({
  name,
  label,
  value: value == null ? '' : String(value),
  type: 'number',
  currency: true,
});
const decimal = (value?: string) => (value || '').trim().replace(',', '.');
export const options = (rows: Row[], filterArchived = true): Option[] =>
  rows
    .filter((row) => !filterArchived || !row.archived)
    .map((row) => ({ label: row.name, value: row.id }));

export const accountForm = (existing?: Row): FormSpec => ({
  title: existing ? 'Editar conta' : 'Nova conta',
  description: 'O saldo inicial representa o dinheiro que já existia e não conta como receita.',
  path: existing ? `/accounts/${existing.id}` : '/accounts',
  method: existing ? 'PATCH' : 'POST',
  fields: [
    { name: 'name', label: 'Nome da conta', value: existing?.name },
    ...(existing
      ? []
      : [
          {
            name: 'nature',
            label: 'Tipo',
            type: 'select' as const,
            value: 'bank',
            options: [
              { value: 'bank', label: 'Conta bancária', description: 'Conta corrente ou digital' },
              {
                value: 'pot',
                label: 'Cofrinho',
                description: 'Dinheiro separado para um objetivo',
              },
              { value: 'cash', label: 'Dinheiro físico', description: 'Valor guardado em espécie' },
              {
                value: 'benefit',
                label: 'Benefício',
                description: 'Vale-refeição ou outro saldo restrito',
              },
              { value: 'other', label: 'Outra', description: 'Outro tipo de saldo acompanhado' },
            ],
          },
          {
            name: 'purpose',
            label: 'Uso do dinheiro',
            type: 'select' as const,
            value: 'available',
            options: [
              {
                value: 'available',
                label: 'Disponível',
                description: 'Pode ser usado no dia a dia',
              },
              {
                value: 'reserved',
                label: 'Reservado',
                description: 'Separado para uma meta ou emergência',
              },
              {
                value: 'restricted',
                label: 'Uso restrito',
                description: 'Só pode ser usado para finalidades específicas',
              },
            ],
          },
        ]),
    money('opening_balance', 'Saldo inicial (€)', existing?.opening_balance || '0'),
    {
      name: 'opening_date',
      label: 'Data inicial',
      type: 'date',
      value: existing?.opening_date || currentDate(),
      max: currentDate(),
    },
  ],
  map: (values) => ({ ...values, opening_balance: decimal(values.opening_balance || '0') }),
});

export const categoryForm = (existing?: Row): FormSpec => ({
  title: existing ? 'Editar categoria' : 'Nova categoria',
  description: 'Categorias ajudam a entender de onde o dinheiro vem e para onde ele vai.',
  path: existing ? `/categories/${existing.id}` : '/categories',
  method: existing ? 'PATCH' : 'POST',
  fields: [
    { name: 'name', label: 'Nome', value: existing?.name },
    ...(!existing
      ? [
          {
            name: 'kind',
            label: 'Tipo',
            type: 'select' as const,
            value: 'expense',
            options: [
              { value: 'expense', label: 'Saída', description: 'Dinheiro gasto ou pago' },
              { value: 'income', label: 'Entrada', description: 'Dinheiro recebido' },
            ],
          },
        ]
      : []),
  ],
});

export const transactionForm = (
  accounts: Row[],
  categories: Row[],
  kind: string,
  existing?: Row,
  transfers: Row[] = [],
  expenseRolloverDay = 25,
): FormSpec => ({
  title: `${existing ? 'Editar' : 'Nova'} ${kind === 'income' ? 'receita' : kind === 'expense' ? 'despesa' : 'transferência'}`,
  description:
    kind === 'income'
      ? 'Registe quando o dinheiro entrou e em qual orçamento mensal ele será usado.'
      : kind === 'expense'
        ? 'Registe de qual conta saiu o dinheiro e o que foi pago.'
        : 'Registe o dinheiro movido entre duas das suas contas.',
  path: existing ? `/transactions/${existing.id}` : '/transactions',
  method: existing ? 'PATCH' : 'POST',
  fields: [
    { name: 'description', label: 'Descrição', value: existing?.description },
    money('amount', kind === 'transfer' ? 'Valor que sai (€)' : 'Valor (€)', existing?.amount),
    {
      name: 'occurred_on',
      label:
        kind === 'income'
          ? 'Data em que recebeu'
          : kind === 'expense'
            ? 'Data em que pagou'
            : 'Data da transferência',
      type: 'date',
      value: existing?.occurred_on || currentDate(),
      max: currentDate(),
      hint: 'Esta data altera o saldo real das contas.',
    },
    ...(kind === 'income' || kind === 'expense'
      ? [
          {
            name: 'reference_month',
            label:
              kind === 'income'
                ? 'Mês em que este dinheiro será usado (opcional)'
                : 'Mês a que esta despesa pertence (opcional)',
            type: 'month' as const,
            required: false,
            value:
              existing?.reference_month?.slice(0, 7) ||
              (kind === 'expense' && Number(currentDate().slice(8, 10)) >= expenseRolloverDay
                ? (() => {
                    const date = new Date(`${currentDate().slice(0, 7)}-15T12:00:00Z`);
                    date.setUTCMonth(date.getUTCMonth() + 1);
                    return date.toISOString().slice(0, 7);
                  })()
                : ''),
            hint:
              kind === 'income'
                ? 'Ex.: salário recebido no fim de setembro para usar em outubro.'
                : 'Ex.: conta de outubro paga antecipadamente no fim de setembro.',
          },
        ]
      : []),
    ...(kind !== 'income'
      ? [
          {
            name: 'source_id',
            label: 'Conta de origem',
            type: 'select' as const,
            value: existing?.source_id,
            options: options(accounts),
          },
        ]
      : []),
    ...(kind === 'expense'
      ? [
          {
            name: 'funding_transfer_id',
            label: 'Transferência usada para pagar (opcional)',
            type: 'select' as const,
            required: false,
            value: existing?.funding_transfer_id,
            hint: 'Use quando o dinheiro saiu de uma reserva e entrou nesta conta antes do pagamento.',
            options: transfers.map((transfer) => ({
              value: transfer.id,
              label: `${dateLabel(transfer.occurred_on)} · ${transfer.source_name} → ${transfer.destination_name} · ${euro(transfer.received)}`,
            })),
          },
        ]
      : []),
    ...(kind !== 'expense'
      ? [
          {
            name: 'destination_id',
            label: kind === 'income' ? 'Conta' : 'Conta de destino',
            type: 'select' as const,
            value: existing?.destination_id,
            options: options(accounts),
          },
        ]
      : []),
    ...(kind === 'transfer'
      ? [
          {
            name: 'has_loss',
            label: 'Houve perda na transferência?',
            type: 'checkbox' as const,
            value:
              existing?.received && Number(existing.received) < Number(existing.amount)
                ? 'yes'
                : 'no',
            hint: 'Marque somente quando o valor recebido foi menor que o valor enviado.',
          },
          {
            ...money('received', 'Valor que entrou (€)', existing?.received),
            visibleWhen: (v: Record<string, string>) => v.has_loss === 'yes',
          },
        ]
      : []),
    {
      name: 'category_id',
      label: kind === 'transfer' ? 'Categoria da perda (opcional)' : 'Categoria',
      type: 'select',
      required: kind !== 'transfer',
      value: existing?.category_id,
      options: options(
        categories.filter(
          (category) => category.kind === (kind === 'income' ? 'income' : 'expense'),
        ),
      ),
      visibleWhen: kind === 'transfer' ? (values) => values.has_loss === 'yes' : undefined,
    },
  ],
  map: (values) => {
    const { has_loss: _hasLoss, ...payload } = values;
    return {
      ...payload,
      kind,
      amount: decimal(values.amount),
      received:
        kind === 'transfer'
          ? values.has_loss === 'yes'
            ? decimal(values.received)
            : decimal(values.amount)
          : null,
      category_id:
        kind === 'transfer' && values.has_loss !== 'yes' ? null : values.category_id || null,
      reference_month:
        kind === 'income' || kind === 'expense' ? values.reference_month || null : null,
      funding_transfer_id: kind === 'expense' ? values.funding_transfer_id || null : null,
      ...(existing ? { version: existing.version } : {}),
    };
  },
});

export const goalForm = (accounts: Row[], existing?: Row): FormSpec => ({
  title: existing ? 'Editar meta' : 'Nova meta',
  description: 'Defina quanto deseja guardar e, se quiser, uma data para alcançar o objetivo.',
  path: existing ? `/goals/${existing.id}` : '/goals',
  method: existing ? 'PATCH' : 'POST',
  fields: [
    { name: 'name', label: 'Nome', value: existing?.name },
    ...(!existing
      ? [
          {
            name: 'account_id',
            label: 'Cofrinho associado',
            type: 'select' as const,
            options: options(accounts.filter((row) => row.purpose === 'reserved')),
          },
        ]
      : []),
    money('target', 'Valor objetivo (€)', existing?.target),
    money('monthly_contribution', 'Aporte mensal (€)', existing?.monthly_contribution || '0'),
    {
      name: 'deadline',
      label: 'Prazo (opcional)',
      type: 'date',
      required: false,
      value: existing?.deadline,
    },
  ],
  map: (values) => ({
    ...values,
    target: decimal(values.target),
    monthly_contribution: decimal(values.monthly_contribution),
    deadline: values.deadline || null,
  }),
});

export const cardForm = (): FormSpec => ({
  title: 'Novo cartão',
  description:
    'O fechamento define em qual fatura entra uma compra; o vencimento é o dia de pagar.',
  path: '/cards',
  fields: [
    { name: 'name', label: 'Nome do cartão' },
    {
      name: 'closing_day',
      label: 'Dia de fechamento',
      type: 'number',
      value: '20',
      min: 1,
      max: 31,
      integer: true,
    },
    {
      name: 'due_day',
      label: 'Dia de vencimento',
      type: 'number',
      value: '5',
      min: 1,
      max: 31,
      integer: true,
    },
  ],
  map: (values) => ({
    ...values,
    closing_day: Number(values.closing_day),
    due_day: Number(values.due_day),
  }),
});

export const purchaseForm = (cards: Row[], categories: Row[], existing?: Row): FormSpec => ({
  title: existing ? 'Editar compra' : 'Nova compra no cartão',
  description: 'Informe o valor total; as parcelas serão distribuídas automaticamente nas faturas.',
  path: existing ? `/purchases/${existing.id}` : '/purchases',
  method: existing ? 'PATCH' : 'POST',
  purchaseSchedule: { cards, existing },
  fields: [
    { name: 'description', label: 'Descrição', value: existing?.description },
    {
      name: 'card_id',
      label: 'Cartão',
      type: 'select',
      value: existing?.card_id,
      options: options(cards),
    },
    {
      name: 'category_id',
      label: 'Categoria',
      type: 'select',
      value: existing?.category_id,
      options: options(categories.filter((row) => row.kind === 'expense')),
    },
    money('amount', 'Valor total (€)', existing?.amount),
    {
      name: 'purchased_on',
      label: 'Data da compra',
      type: 'date',
      value: existing?.purchased_on || currentDate(),
      max: currentDate(),
    },
    {
      name: 'installments',
      label: 'Quantidade de parcelas',
      type: 'number',
      value: existing?.installments || '1',
      min: 1,
      max: 60,
      integer: true,
    },
    ...(!existing
      ? [
          {
            name: 'paid_installments',
            label: 'Parcelas anteriores já pagas',
            type: 'number' as const,
            value: '0',
            min: 0,
            max: 60,
            integer: true,
          },
        ]
      : []),
  ],
  map: (values) => ({
    ...values,
    amount: decimal(values.amount),
    installments: Number(values.installments),
    ...(existing?.schedule
      ? {
          schedule: existing.schedule.map((item: Row) => ({
            number: Number(item.number),
            amount: String(item.amount),
            due_on: String(item.due_on).slice(0, 10),
            paid: Boolean(item.settled_before_tracking),
          })),
        }
      : { paid_installments: Number(values.paid_installments || 0) }),
  }),
});

export const recurrenceForm = (accounts: Row[], categories: Row[], kind: string): FormSpec => ({
  title: 'Novo recorrente',
  description:
    'Cria previsões futuras. O saldo só muda depois que você revisar e confirmar cada ocorrência.',
  path: '/recurrences',
  fields: [
    { name: 'description', label: 'Descrição' },
    money('amount', 'Valor esperado (€)'),
    {
      name: 'expected_day',
      label: 'Dia previsto do mês',
      type: 'number',
      value: '5',
      min: 1,
      max: 31,
      integer: true,
    },
    {
      name: 'interval_months',
      label: 'Repete a cada quantos meses?',
      type: 'number',
      value: '1',
      min: 1,
      max: 24,
      integer: true,
    },
    {
      name: 'account_id',
      label: kind === 'transfer' ? 'Conta de origem' : 'Conta',
      type: 'select',
      options: options(accounts),
    },
    ...(kind === 'transfer'
      ? [
          {
            name: 'destination_id',
            label: 'Conta de destino',
            type: 'select' as const,
            options: options(accounts),
          },
        ]
      : [
          {
            name: 'category_id',
            label: 'Categoria',
            type: 'select' as const,
            options: options(categories.filter((row) => row.kind === kind)),
          },
        ]),
    { name: 'starts_on', label: 'A partir de', type: 'date', value: currentDate() },
    { name: 'ends_on', label: 'Até (opcional)', type: 'date', required: false },
  ],
  map: (values) => ({
    ...values,
    kind,
    amount: decimal(values.amount),
    expected_day: Number(values.expected_day),
    interval_months: Number(values.interval_months),
    ends_on: values.ends_on || null,
  }),
});

export const recurrenceEditForm = (existing: Row): FormSpec => ({
  title: 'Editar recorrente',
  description:
    'As alterações valem para as previsões pendentes de hoje em diante. O histórico permanece igual.',
  submitLabel: 'Guardar alterações',
  path: `/recurrences/${existing.id}`,
  method: 'PATCH',
  fields: [
    { name: 'description', label: 'Descrição', value: existing.description },
    money('amount', 'Valor previsto (€)', existing.amount),
    {
      name: 'interval_months',
      label: 'Repetir',
      type: 'select',
      value: String(existing.interval_months || 1),
      options: Array.from({ length: 24 }, (_, index) => ({
        value: String(index + 1),
        label: index === 0 ? 'Todo mês' : `A cada ${index + 1} meses`,
      })),
    },
  ],
  map: (values) => ({
    description: values.description,
    amount: decimal(values.amount),
    interval_months: Number(values.interval_months),
  }),
});

export const budgetForm = (month: string, category: Row, existing?: Row): FormSpec => ({
  title: `Orçamento · ${category.name}`,
  description: 'Defina quanto pretende gastar nesta categoria.',
  path: `/budgets/${month}`,
  method: 'PUT',
  fields: [
    money('amount', 'Limite (€)', existing?.budget || ''),
    {
      name: 'scope',
      label: 'Aplicar',
      type: 'select',
      value: existing?.budget_scope === 'month' ? 'month' : 'future',
      options: [
        {
          value: 'future',
          label: 'Neste e próximos meses',
          description: 'Continua ativo até ser alterado',
        },
        {
          value: 'month',
          label: 'Somente neste mês',
          description: 'Uma exceção apenas para o mês selecionado',
        },
      ],
    },
  ],
  map: (values) => ({
    category_id: category.id,
    amount: decimal(values.amount),
    scope: values.scope,
  }),
});

export const createBudgetForm = (month: string, categories: Row[]): FormSpec => ({
  title: 'Criar orçamento',
  description:
    'Escolha uma categoria e defina o limite. Categorias sem orçamento não aparecem nesta tela.',
  submitLabel: 'Criar orçamento',
  path: `/budgets/${month}`,
  method: 'PUT',
  fields: [
    {
      name: 'category_id',
      label: 'Categoria',
      type: 'select',
      options: options(categories.filter((row) => row.kind === 'expense' && !row.archived)),
    },
    money('amount', 'Limite mensal (€)'),
    {
      name: 'scope',
      label: 'Aplicar',
      type: 'select',
      value: 'future',
      options: [
        {
          value: 'future',
          label: 'Deste mês em diante',
          description: 'Continua ativo até ser alterado',
        },
        {
          value: 'month',
          label: 'Somente neste mês',
          description: 'Uma exceção apenas para o mês selecionado',
        },
      ],
    },
  ],
  map: (values) => ({
    category_id: values.category_id,
    amount: decimal(values.amount),
    scope: values.scope,
  }),
});

export const futurePlanForm = (existing?: Row): FormSpec => ({
  title: existing ? 'Editar plano futuro' : 'Novo plano futuro',
  description: 'Reúna o dinheiro disponível, os recursos esperados e os gastos do seu plano.',
  path: existing ? `/future-plans/${existing.id}` : '/future-plans',
  method: existing ? 'PATCH' : 'POST',
  fields: [
    { name: 'name', label: 'Nome do plano', value: existing?.name },
    {
      name: 'theme',
      label: 'Tipo',
      type: 'select',
      value: existing?.theme || 'travel',
      options: [
        { value: 'move', label: 'Mudança' },
        { value: 'travel', label: 'Viagem' },
        { value: 'education', label: 'Estudo' },
        { value: 'purchase', label: 'Compra' },
        { value: 'project', label: 'Projeto' },
        { value: 'other', label: 'Outro' },
      ],
    },
    {
      name: 'target_date',
      label: 'Data desejada',
      type: 'date',
      value: existing?.target_date || currentDate(),
    },
    money(
      'estimated_cost',
      'Custo estimado (€)',
      existing?.initial_estimate || existing?.estimated_cost,
    ),
    money(
      'reserved_amount',
      'Valor disponível (€)',
      existing?.principal_balance || existing?.reserved_amount || '0',
    ),
    {
      name: 'notes',
      label: 'Notas (opcional)',
      type: 'textarea',
      required: false,
      value: existing?.notes,
    },
  ],
  map: (values) => ({
    ...values,
    estimated_cost: decimal(values.estimated_cost),
    reserved_amount: decimal(values.reserved_amount),
    notes: values.notes || null,
  }),
});

export const futurePlanPocketForm = (planId: string, existing?: Row): FormSpec => ({
  title: existing ? 'Editar caixa' : 'Nova caixa',
  description: 'Separe as fontes de dinheiro usadas neste plano.',
  path: existing
    ? `/future-plans/${planId}/pockets/${existing.id}`
    : `/future-plans/${planId}/pockets`,
  method: existing ? 'PATCH' : 'POST',
  fields: [
    { name: 'name', label: 'Nome da caixa', value: existing?.name },
    ...(existing?.kind === 'principal'
      ? []
      : [
          {
            name: 'kind',
            label: 'Tipo',
            type: 'select' as const,
            value: existing?.kind || 'benefit',
            options: [
              { value: 'benefit', label: 'Benefício' },
              { value: 'reserve', label: 'Reserva' },
            ],
          },
        ]),
    money('opening_balance', 'Valor inicial (€)', existing?.opening_balance || '0'),
  ],
  map: (values) => ({
    name: values.name,
    ...(existing?.kind === 'principal' ? {} : { kind: values.kind }),
    opening_balance: decimal(values.opening_balance),
  }),
});

export const futurePlanItemForm = (
  planId: string,
  pockets: Row[],
  kind: 'income' | 'expense',
  existing?: Row,
): FormSpec => ({
  title: existing ? 'Editar item' : kind === 'income' ? 'Novo recurso' : 'Novo gasto',
  description:
    kind === 'income'
      ? 'Adicione um valor que estará disponível para realizar o plano.'
      : 'Adicione um custo previsto para saber quanto o plano realmente exige.',
  path: existing ? `/future-plans/${planId}/items/${existing.id}` : `/future-plans/${planId}/items`,
  method: existing ? 'PATCH' : 'POST',
  fields: [
    { name: 'name', label: 'Nome', value: existing?.name },
    money('amount', 'Valor (€)', existing?.amount),
    {
      name: 'schedule',
      label: 'Frequência',
      type: 'select',
      value: existing?.cadence === 'recurring' ? String(existing.interval_months || 1) : 'once',
      options: [
        { value: 'once', label: 'Uma vez' },
        { value: '1', label: 'Todo mês' },
        ...Array.from({ length: 59 }, (_, index) => ({
          value: String(index + 2),
          label: `A cada ${index + 2} meses`,
        })),
      ],
    },
    {
      name: 'pocket_id',
      label: kind === 'income' ? 'Caixa que recebe' : 'Caixa que paga',
      type: 'select',
      value: existing?.pocket_id || pockets[0]?.id,
      options: options(pockets, false),
    },
    {
      name: 'due_on',
      label: 'Data prevista (opcional)',
      type: 'date',
      required: false,
      value: existing?.due_on,
    },
    {
      name: 'notes',
      label: 'Observação (opcional)',
      type: 'textarea',
      required: false,
      value: existing?.notes,
    },
  ],
  map: (values) => ({
    kind,
    name: values.name,
    amount: decimal(values.amount),
    cadence: values.schedule === 'once' ? 'once' : 'recurring',
    interval_months: values.schedule === 'once' ? 1 : Number(values.schedule),
    pocket_id: values.pocket_id,
    due_on: values.due_on || null,
    notes: values.notes || null,
  }),
});
