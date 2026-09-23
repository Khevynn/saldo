import Decimal from 'decimal.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export const money = (value: Decimal.Value) => new Decimal(value).toFixed(2);
export const sum = (values: Decimal.Value[]) =>
  values.reduce<Decimal>((total, value) => total.plus(value), new Decimal(0));

export function splitInstallments(amount: string, count: number): string[] {
  if (!Number.isInteger(count) || count < 1 || count > 60) throw new Error('Quantidade inválida.');
  const cents = new Decimal(amount).times(100);
  if (!cents.isInteger() || cents.lessThan(count))
    throw new Error('Cada parcela deve ter pelo menos €0,01.');
  const base = cents.div(count).floor();
  const remainder = cents.mod(count).toNumber();
  return Array.from({ length: count }, (_, i) =>
    base
      .plus(i >= count - remainder ? 1 : 0)
      .div(100)
      .toFixed(2),
  );
}

export function monthDate(month: string, day: number): string {
  const [year, index] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, index, 0)).getUTCDate();
  return `${month}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}
export function shiftMonth(month: string, delta: number): string {
  const [year, index] = month.split('-').map(Number);
  return new Date(Date.UTC(year, index - 1 + delta, 1)).toISOString().slice(0, 7);
}
export function today(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
export function firstInvoiceMonth(purchasedOn: string, closingDay: number): string {
  const month = purchasedOn.slice(0, 7);
  return purchasedOn > monthDate(month, closingDay) ? shiftMonth(month, 1) : month;
}
export function invoiceMonthFromDueDate(dueOn: string, closingDay: number): string {
  const month = dueOn.slice(0, 7);
  return Number(dueOn.slice(8, 10)) <= closingDay ? shiftMonth(month, -1) : month;
}
export function dueDate(closingMonth: string, closingDay: number, dueDay: number): string {
  const closes = monthDate(closingMonth, closingDay);
  const due = monthDate(closingMonth, dueDay);
  return due > closes ? due : monthDate(shiftMonth(closingMonth, 1), dueDay);
}
