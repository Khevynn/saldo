import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { today } from '../domain/money';

export const id = z.string().uuid();
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    'Data inválida.',
  )
  .refine((v) => v >= '2000-01-01' && v <= '2100-12-31', 'Data fora do intervalo de 2000 a 2100.');
export const pastDate = date.refine(
  (v) => v <= today(),
  'Um lançamento real não pode ter data futura.',
);
export const month = z.string().regex(/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/);
export const moneyInput = z
  .string()
  .regex(/^(0|[1-9]\d{0,16})(\.\d{1,2})?$/, 'Informe um valor decimal com até duas casas.');
export const positiveMoney = moneyInput.refine(
  (v) => /[1-9]/.test(v),
  'O valor deve ser maior que zero.',
);
export const signedMoney = z.string().regex(/^-?(0|[1-9]\d{0,16})(\.\d{1,2})?$/);
const name = z.string().trim().min(1).max(100);

export const accountInput = z
  .object({
    name,
    nature: z.enum(['bank', 'cash', 'benefit', 'pot', 'other']),
    purpose: z.enum(['available', 'restricted', 'reserved']),
    opening_balance: signedMoney,
    opening_date: pastDate,
  })
  .strict();
export const accountPatch = z
  .object({
    name: name.optional(),
    archived: z.boolean().optional(),
    opening_balance: signedMoney.optional(),
    opening_date: pastDate.optional(),
  })
  .strict();
export const categoryInput = z
  .object({ name: name.max(80), kind: z.enum(['income', 'expense']) })
  .strict();
export const categoryPatch = z
  .object({ name: name.max(80).optional(), archived: z.boolean().optional() })
  .strict();
export const transactionInput = z
  .object({
    kind: z.enum(['income', 'expense', 'transfer']),
    description: name.max(200),
    source_id: id.nullish(),
    destination_id: id.nullish(),
    category_id: id.nullish(),
    amount: positiveMoney,
    received: positiveMoney.nullish(),
    occurred_on: pastDate,
    reference_month: month.nullish().optional(),
    funding_transfer_id: id.nullish().optional(),
  })
  .strict();
export const recurrenceInput = z
  .object({
    description: name,
    kind: z.enum(['income', 'expense', 'transfer']),
    account_id: id,
    destination_id: id.nullish(),
    category_id: id.nullish(),
    amount: positiveMoney,
    expected_day: z.number().int().min(1).max(31),
    interval_months: z.number().int().min(1).max(24).default(1),
    starts_on: date,
    ends_on: date.nullish(),
  })
  .strict()
  .refine((v) => !v.ends_on || v.ends_on >= v.starts_on, 'Fim anterior ao início.');
export const futurePlanInput = z
  .object({
    name,
    theme: z.enum(['move', 'travel', 'education', 'purchase', 'project', 'other']),
    target_date: date,
    estimated_cost: positiveMoney,
    reserved_amount: moneyInput.default('0'),
    notes: z.string().trim().max(1000).nullish(),
  })
  .strict();
export const futurePlanItemInput = z
  .object({
    kind: z.enum(['income', 'expense']),
    name,
    cadence: z.enum(['once', 'recurring']),
    interval_months: z.number().int().min(1).max(60).default(1),
    pocket_id: id.optional(),
    amount: positiveMoney,
    due_on: date.nullish(),
    notes: z.string().trim().max(500).nullish(),
  })
  .strict();
export const futurePlanPocketInput = z
  .object({
    name: name.max(80),
    kind: z.enum(['benefit', 'reserve']),
    opening_balance: moneyInput.default('0'),
  })
  .strict();
export const occurrenceConfirm = z
  .object({
    account_id: id,
    amount: positiveMoney,
    occurred_on: pastDate,
    reference_month: month.nullish().optional(),
  })
  .strict();
export const goalInput = z
  .object({
    name,
    account_id: id,
    target: positiveMoney,
    monthly_contribution: moneyInput.default('0'),
    deadline: date.nullish(),
  })
  .strict();
export const cardInput = z
  .object({
    name,
    closing_day: z.number().int().min(1).max(31),
    due_day: z.number().int().min(1).max(31),
  })
  .strict();
const purchaseScheduleItem = z
  .object({
    number: z.number().int().min(1).max(60),
    amount: positiveMoney,
    due_on: date,
    paid: z.boolean().default(false),
  })
  .strict();
export const purchaseInput = z
  .object({
    card_id: id,
    category_id: id,
    description: name,
    purchased_on: pastDate,
    amount: positiveMoney,
    installment_amount: positiveMoney.optional(),
    installments: z.number().int().min(1).max(60),
    first_invoice_month: month.optional(),
    first_invoice_on: date.optional(),
    paid_installments: z.number().int().min(0).max(60).default(0),
    schedule: z.array(purchaseScheduleItem).min(1).max(60).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.paid_installments > value.installments)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Parcelas já pagas não podem superar o total de parcelas.',
      });
    if (!value.schedule) return;
    if (value.schedule.length !== value.installments)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['schedule'],
        message: 'O cronograma deve conter todas as parcelas.',
      });
    value.schedule.forEach((installment, index) => {
      if (installment.number !== index + 1)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['schedule', index, 'number'],
          message: 'Numeração de parcelas inválida.',
        });
      if (installment.due_on < value.purchased_on)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['schedule', index, 'due_on'],
          message: 'Vencimento anterior à compra.',
        });
      if (index && installment.due_on <= value.schedule![index - 1].due_on)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['schedule', index, 'due_on'],
          message: 'Os vencimentos devem estar em ordem crescente.',
        });
    });
  });
export const invoicePayment = z
  .object({
    account_id: id,
    occurred_on: pastDate,
    expected_amount: positiveMoney,
    reference_month: month.nullish().optional(),
  })
  .strict();
export const invoicePatch = z
  .object({ closes_on: date, due_on: date })
  .strict()
  .refine((value) => value.due_on >= value.closes_on, {
    message: 'O vencimento não pode ser anterior ao fechamento.',
    path: ['due_on'],
  });
export const budgetInput = z
  .object({
    category_id: id,
    amount: moneyInput,
    scope: z.enum(['month', 'future']).default('future'),
  })
  .strict();
const labels: Record<string, string> = {
  name: 'Nome',
  kind: 'Tipo',
  source_id: 'Conta de origem',
  destination_id: 'Conta de destino',
  category_id: 'Categoria',
  account_id: 'Conta',
  amount: 'Valor',
  received: 'Valor recebido',
  occurred_on: 'Data efetiva',
  reference_month: 'Mês de referência',
  opening_balance: 'Saldo inicial',
  opening_date: 'Data inicial',
  description: 'Descrição',
  expected_day: 'Dia esperado',
  interval_months: 'Frequência',
  starts_on: 'Início',
  ends_on: 'Fim',
  target: 'Objetivo',
  monthly_contribution: 'Aporte mensal',
  deadline: 'Prazo',
  card_id: 'Cartão',
  purchased_on: 'Data da compra',
  installments: 'Parcelas',
  first_invoice_month: 'Primeira fatura',
  first_invoice_on: 'Data da primeira fatura',
  paid_installments: 'Parcelas já pagas',
  due_on: 'Data de vencimento',
  schedule: 'Parcelas',
  month: 'Mês',
  theme: 'Tipo de plano',
  target_date: 'Data desejada',
  estimated_cost: 'Custo estimado',
  reserved_amount: 'Valor já reservado',
  notes: 'Notas',
  page: 'Página',
  version: 'Versão do registro',
};
export function parse<S extends z.ZodTypeAny>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new BadRequestException(
      result.error.issues
        .map((i) =>
          i.code === 'unrecognized_keys'
            ? 'Os dados contêm campos não permitidos.'
            : `${labels[String(i.path[0])] || 'Dados'}: ${i.message === 'Required' ? 'preencha este campo.' : i.message}`,
        )
        .join('; '),
    );
  return result.data;
}
export type TransactionInput = z.infer<typeof transactionInput>;
