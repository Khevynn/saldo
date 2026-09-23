import { describe, expect, it } from 'vitest';
import {
  dueDate,
  firstInvoiceMonth,
  invoiceMonthFromDueDate,
  monthDate,
  shiftMonth,
  splitInstallments,
  sum,
} from './money';
import { parse, positiveMoney, pastDate } from '../common/validation';

describe('money and calendar rules', () => {
  it('splits cents exactly without float drift', () => {
    expect(splitInstallments('100', 3)).toEqual(['33.33', '33.33', '33.34']);
    for (let count = 1; count <= 60; count++)
      expect(sum(splitInstallments('99999999999999.99', count)).toFixed(2)).toBe(
        '99999999999999.99',
      );
  });
  it('rejects installments below one cent', () =>
    expect(() => splitInstallments('0.02', 3)).toThrow());
  it('clamps monthly dates, including leap years', () => {
    expect(monthDate('2028-02', 31)).toBe('2028-02-29');
    expect(monthDate('2027-02', 31)).toBe('2027-02-28');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });
  it('computes a predictable invoice and allows explicit override in the API', () => {
    expect(firstInvoiceMonth('2026-09-21', 20)).toBe('2026-10');
    expect(firstInvoiceMonth('2026-09-20', 20)).toBe('2026-09');
    expect(dueDate('2026-09', 20, 5)).toBe('2026-10-05');
    expect(dueDate('2026-09', 10, 20)).toBe('2026-09-20');
    expect(invoiceMonthFromDueDate('2026-10-05', 20)).toBe('2026-09');
    expect(invoiceMonthFromDueDate('2026-09-20', 10)).toBe('2026-09');
  });
  it('rejects money represented as float, excessive decimals and NaN', () => {
    for (const value of [0.1, '1.001', 'NaN', 'Infinity', '-1', '0', '1e3'])
      expect(() => parse(positiveMoney, value)).toThrow();
    expect(parse(positiveMoney, '0.01')).toBe('0.01');
  });
  it('rejects nonexistent dates and future real movements', () => {
    expect(() => parse(pastDate, '2026-02-30')).toThrow();
    expect(() => parse(pastDate, '2100-01-01')).toThrow();
  });
});
