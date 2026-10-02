import { Controller, Get, Inject, Query } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import Decimal from 'decimal.js';
import { z } from 'zod';
import { UserId } from '../auth/auth';
import { date, month, parse } from '../common/validation';
import { rows } from '../database/database.service';
import { money, monthDate, shiftMonth, sum, today } from '../domain/money';
import { FinanceStore } from './finance.store';
import { PlanningService } from './planning.service';

@Controller('reports')
export class ReportingController {
  constructor(
    @Inject(FinanceStore) private readonly store: FinanceStore,
    @Inject(PlanningService) private readonly planning: PlanningService,
  ) {}
  @Get('annual') async annual(@UserId() user: string, @Query('year') rawYear: string) {
    const year = parse(z.string().regex(/^(20\d{2}|2100)$/), rawYear);
    return this.report(user, year + '-12', true);
  }
  @Get('overview') overview(@UserId() user: string, @Query('month') rawMonth: string) {
    const m = parse(month, rawMonth || today().slice(0, 7));
    return this.report(user, m, false);
  }
  @Get('period') period(
    @UserId() user: string,
    @Query('from') rawFrom: string,
    @Query('to') rawTo: string,
  ) {
    const range = parse(
      z
        .object({ from: date, to: date })
        .refine((value) => value.from <= value.to, 'A data inicial deve ser anterior à final.'),
      { from: rawFrom, to: rawTo },
    );
    return this.report(user, range.to.slice(0, 7), false, range);
  }
  private report(user: string, m: string, annual: boolean, range?: { from: string; to: string }) {
    const periodStart = range?.from || (annual ? m.slice(0, 4) + '-01-01' : m + '-01');
    const periodEnd = range?.to || monthDate(m, 31);
    return this.store.run(user, async (db) => {
      const asOf = periodEnd > today() ? today() : periodEnd;
      const flowDate = range ? sql`occurred_on` : sql`reference_month`;
      const accounts = await this.store.balances(db, user, asOf);
      const [flow] = await rows(
        db,
        sql`SELECT coalesce(sum(amount) FILTER(WHERE kind='income'),0)::text AS income,coalesce(sum(amount) FILTER(WHERE kind='expense'),0)::text AS expense FROM cash_effects WHERE user_id=${user} AND ${flowDate}>=${periodStart}::date AND ${flowDate}<=${periodEnd}::date`,
      );
      const [debt] = await rows(
        db,
        sql`SELECT coalesce(sum(s.amount),0)::text AS amount FROM installments s JOIN purchases p ON p.user_id=s.user_id AND p.id=s.purchase_id JOIN invoices i ON i.user_id=s.user_id AND i.id=s.invoice_id LEFT JOIN transactions t ON t.user_id=i.user_id AND t.id=i.payment_id WHERE s.user_id=${user} AND p.deleted_at IS NULL AND NOT s.settled_before_tracking AND p.purchased_on<=${asOf}::date AND (i.payment_id IS NULL OR t.occurred_on>${asOf}::date)`,
      );
      const byCategory = await rows(
        db,
        sql`SELECT c.id AS category_id,c.name,sum(e.amount)::text AS amount FROM cash_effects e JOIN categories c ON c.user_id=e.user_id AND c.id=e.category_id WHERE e.user_id=${user} AND e.kind='expense' AND ${flowDate}>=${periodStart}::date AND ${flowDate}<=${periodEnd}::date GROUP BY c.id,c.name ORDER BY sum(e.amount) DESC`,
      );
      const [start] = await rows(
        db,
        sql`SELECT min(opening_date)::text AS date FROM accounts WHERE user_id=${user}`,
      );
      const from = shiftMonth(m, -11);
      const flows = await rows(
        db,
        sql`SELECT to_char(reference_month,'YYYY-MM') AS month,coalesce(sum(amount) FILTER(WHERE kind='income'),0)::text AS income,coalesce(sum(amount) FILTER(WHERE kind='expense'),0)::text AS expense FROM cash_effects WHERE user_id=${user} AND reference_month>=${from + '-01'}::date AND reference_month<${shiftMonth(m, 1) + '-01'}::date GROUP BY 1 ORDER BY 1`,
      );
      const evolution = [];
      for (let index = 0; index < 12; index++) {
        const period = shiftMonth(from, index);
        if (!start.date || period < start.date.slice(0, 7) || period > today().slice(0, 7))
          continue;
        const f = flows.find((f) => f.month === period) || { income: '0.00', expense: '0.00' };
        const periodEnd = monthDate(period, 31) > today() ? today() : monthDate(period, 31);
        const balances = await this.store.balances(db, user, periodEnd);
        evolution.push({
          month: period,
          income: f.income,
          expense: f.expense,
          surplus: money(new Decimal(f.income).minus(f.expense)),
          balance: money(sum(balances.map((a) => a.balance))),
          complete: period < today().slice(0, 7) && period + '-01' >= start.date,
        });
      }
      const complete = evolution.filter((e) => e.complete);
      const totalIncome = sum(complete.map((e) => e.income));
      const totalSurplus = sum(complete.map((e) => e.surplus));
      const total = sum(accounts.map((a) => a.balance));
      return {
        month: m,
        as_of: asOf,
        accounts,
        total: money(total),
        available: money(
          sum(accounts.filter((a) => a.purpose === 'available').map((a) => a.balance)),
        ),
        reserved: money(
          sum(accounts.filter((a) => a.purpose === 'reserved').map((a) => a.balance)),
        ),
        restricted: money(
          sum(accounts.filter((a) => a.purpose === 'restricted').map((a) => a.balance)),
        ),
        income: money(flow.income),
        expense: money(flow.expense),
        surplus: money(new Decimal(flow.income).minus(flow.expense)),
        debt: money(debt.amount),
        net: money(total.minus(debt.amount)),
        average_surplus: complete.length ? money(totalSurplus.div(complete.length)) : null,
        savings_rate: totalIncome.gt(0)
          ? totalSurplus.div(totalIncome).times(100).toFixed(1)
          : null,
        average_months: complete.length,
        period: range ? 'custom' : annual ? 'year' : 'month',
        evolution,
        categories: byCategory,
        budgets: annual || range ? [] : await this.planning.budget(db, user, m),
      };
    });
  }
}
