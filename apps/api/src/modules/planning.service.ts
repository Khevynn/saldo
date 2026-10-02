import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Db, rows } from '../database/database.service';
import { monthDate, shiftMonth, today } from '../domain/money';
import Decimal from 'decimal.js';

@Injectable()
export class PlanningService {
  projectFuturePlan(
    plan: Record<string, any>,
    items: Record<string, any>[],
    pockets: Record<string, any>[] = [],
  ) {
    const now = new Date(today() + 'T12:00:00Z');
    const target = new Date(plan.target_date + 'T12:00:00Z');
    const months = Math.max(
      1,
      (target.getUTCFullYear() - now.getUTCFullYear()) * 12 +
        target.getUTCMonth() -
        now.getUTCMonth() +
        (target.getUTCDate() > now.getUTCDate() ? 1 : 0),
    );
    const monthsRemaining = target < now ? 0 : months;
    const periods = Math.max(1, monthsRemaining);
    const startMonth = today().slice(0, 7);
    const monthDistance = (month: string) => {
      const [startYear, startIndex] = startMonth.split('-').map(Number);
      const [year, index] = month.split('-').map(Number);
      return (year - startYear) * 12 + index - startIndex;
    };
    const activePockets = pockets.length
      ? pockets
      : [
          {
            id: 'principal',
            name: 'Principal',
            kind: 'principal',
            opening_balance: plan.reserved_amount,
          },
        ];
    const defaultPocket = activePockets.find((pocket) => pocket.kind === 'principal')!;
    const events = Array.from({ length: periods }, () => ({
      income: new Decimal(0),
      expense: new Decimal(0),
    }));
    const projectedItems: Record<string, any>[] = items.map((item) => {
      const interval = Number(item.interval_months || 1);
      const first = monthDistance(String(item.due_on || `${startMonth}-01`).slice(0, 7));
      const occurrenceIndexes: number[] = [];
      if (item.cadence === 'once') {
        const index = Math.max(0, first);
        if (index < periods) occurrenceIndexes.push(index);
      } else {
        for (let index = 0; index < periods; index += 1)
          if (index >= first && (index - first) % interval === 0) occurrenceIndexes.push(index);
      }
      const amount = new Decimal(item.amount);
      for (const index of occurrenceIndexes)
        events[index][item.kind as 'income' | 'expense'] =
          events[index][item.kind as 'income' | 'expense'].plus(amount);
      const pocket =
        activePockets.find((candidate) => candidate.id === item.pocket_id) || defaultPocket;
      return {
        ...item,
        pocket_id: pocket.id,
        pocket_name: pocket.name,
        interval_months: interval,
        occurrence_count: occurrenceIndexes.length,
        occurrence_indexes: occurrenceIndexes,
        projected_total: amount.times(occurrenceIndexes.length).toFixed(2),
      };
    });
    const sum = (kind: string, filter?: (item: Record<string, any>) => boolean): Decimal =>
      projectedItems
        .filter((item) => item.kind === kind && (!filter || filter(item)))
        .reduce<Decimal>((total, item) => total.plus(item.projected_total), new Decimal(0));
    const totalCost = sum('expense');
    const totalIncome = sum('income');
    const monthlyIncome = projectedItems
      .filter(
        (item) =>
          item.kind === 'income' && item.cadence === 'recurring' && item.interval_months === 1,
      )
      .reduce((total, item) => total.plus(item.amount), new Decimal(0));
    const monthlyExpenses = projectedItems
      .filter(
        (item) =>
          item.kind === 'expense' && item.cadence === 'recurring' && item.interval_months === 1,
      )
      .reduce((total, item) => total.plus(item.amount), new Decimal(0));
    const periodicExpenses = sum(
      'expense',
      (item) => item.cadence === 'recurring' && item.interval_months > 1,
    );
    const openingBalance = activePockets.reduce(
      (total, pocket) => total.plus(pocket.opening_balance),
      new Decimal(0),
    );
    const monthlyCapacity = monthlyIncome.minus(monthlyExpenses);
    const pocketProjections = activePockets.map((pocket) => {
      const pocketItems = projectedItems.filter((item) => item.pocket_id === pocket.id);
      const opening = new Decimal(pocket.opening_balance);
      const upfrontCost = pocketItems
        .filter(
          (item) =>
            item.kind === 'expense' &&
            item.cadence === 'once' &&
            item.occurrence_indexes.includes(0),
        )
        .reduce((total, item) => total.plus(item.amount), new Decimal(0));
      const recurringIncome = pocketItems
        .filter(
          (item) =>
            item.kind === 'income' && item.cadence === 'recurring' && item.interval_months === 1,
        )
        .reduce((total, item) => total.plus(item.amount), new Decimal(0));
      const recurringExpenses = pocketItems
        .filter(
          (item) =>
            item.kind === 'expense' && item.cadence === 'recurring' && item.interval_months === 1,
        )
        .reduce((total, item) => total.plus(item.amount), new Decimal(0));
      let balance = opening;
      let minimum = opening;
      let firstDeficit: string | null = null;
      const pocketTimeline = Array.from({ length: periods }, (_, index) => {
        const dueItems = pocketItems.filter((item) => item.occurrence_indexes.includes(index));
        const income = dueItems
          .filter((item) => item.kind === 'income')
          .reduce<Decimal>((total, item) => total.plus(item.amount), new Decimal(0));
        const expense = dueItems
          .filter((item) => item.kind === 'expense')
          .reduce<Decimal>((total, item) => total.plus(item.amount), new Decimal(0));
        balance = balance.plus(income).minus(expense);
        minimum = Decimal.min(minimum, balance);
        const projectionMonth = shiftMonth(startMonth, index);
        if (!firstDeficit && balance.lt(0)) firstDeficit = projectionMonth;
        return {
          month: projectionMonth,
          income: income.toFixed(2),
          expense: expense.toFixed(2),
          balance: balance.toFixed(2),
        };
      });
      return {
        ...pocket,
        opening_balance: opening.toFixed(2),
        upfront_cost: upfrontCost.toFixed(2),
        upfront_gap: Decimal.max(0, upfrontCost.minus(opening)).toFixed(2),
        monthly_income: recurringIncome.toFixed(2),
        monthly_expenses: recurringExpenses.toFixed(2),
        monthly_margin: recurringIncome.minus(recurringExpenses).toFixed(2),
        closing_balance: balance.toFixed(2),
        minimum_balance: minimum.toFixed(2),
        first_deficit_month: firstDeficit,
        items: pocketItems,
        timeline: pocketTimeline,
      };
    });
    const upfrontCost = pocketProjections.reduce(
      (total, pocket) => total.plus(pocket.upfront_cost),
      new Decimal(0),
    );
    const upfrontGap = pocketProjections.reduce(
      (total, pocket) => total.plus(pocket.upfront_gap),
      new Decimal(0),
    );
    const projectedBalance = openingBalance.plus(totalIncome).minus(totalCost);
    const remaining = Decimal.max(0, projectedBalance.negated());
    const monthlyNeeded = remaining.div(periods);
    const progress = totalCost.gt(0)
      ? Decimal.min(100, openingBalance.plus(totalIncome).div(totalCost).times(100))
      : new Decimal(100);
    const viability =
      upfrontGap.gt(0) ||
      pocketProjections.some((pocket) => new Decimal(pocket.minimum_balance).lt(0))
        ? 'not_viable'
        : projectedBalance.lt(Decimal.max(100, totalCost.times(0.1)))
          ? 'tight'
          : 'viable';
    return {
      ...plan,
      initial_estimate: plan.estimated_cost,
      principal_balance: String(defaultPocket.opening_balance),
      reserved_amount: openingBalance.toFixed(2),
      estimated_cost: totalCost.toFixed(2),
      total_cost: totalCost.toFixed(2),
      total_income: totalIncome.toFixed(2),
      upfront_cost: upfrontCost.toFixed(2),
      upfront_available: openingBalance.toFixed(2),
      upfront_gap: upfrontGap.toFixed(2),
      periodic_expenses: periodicExpenses.toFixed(2),
      monthly_income: monthlyIncome.toFixed(2),
      monthly_expenses: monthlyExpenses.toFixed(2),
      monthly_capacity: monthlyCapacity.toFixed(2),
      monthly_needed: monthlyNeeded.toDecimalPlaces(2).toFixed(2),
      monthly_margin: monthlyCapacity.toFixed(2),
      projected_balance: projectedBalance.toFixed(2),
      remaining: remaining.toFixed(2),
      progress: progress.toFixed(1),
      months_remaining: monthsRemaining,
      viability,
      items: projectedItems,
      pockets: pocketProjections,
      timeline: events.map((event, index) => ({
        month: shiftMonth(startMonth, index),
        income: event.income.toFixed(2),
        expense: event.expense.toFixed(2),
        balance: pocketProjections
          .reduce((total, pocket) => total.plus(pocket.timeline[index].balance), new Decimal(0))
          .toFixed(2),
      })),
    };
  }

  async materialize(db: Db, user: string, month: string) {
    const rules = await rows(
      db,
      sql`SELECT * FROM recurrences WHERE user_id=${user} AND active AND deleted_at IS NULL AND starts_on<${shiftMonth(month, 1) + '-01'}::date AND (ends_on IS NULL OR ends_on>=${month + '-01'}::date)`,
    );
    for (const rule of rules) {
      const [startYear, startMonth] = String(rule.starts_on).slice(0, 7).split('-').map(Number);
      const [targetYear, targetMonth] = month.split('-').map(Number);
      const elapsed = (targetYear - startYear) * 12 + targetMonth - startMonth;
      if (elapsed < 0 || elapsed % Number(rule.interval_months || 1) !== 0) continue;
      const due = monthDate(month, rule.expected_day);
      if (due < rule.starts_on || (rule.ends_on && due > rule.ends_on)) continue;
      await db.execute(sql`INSERT INTO occurrences(user_id,recurrence_id,due_on,description,kind,account_id,destination_id,category_id,amount)
        VALUES(${user},${rule.id},${due},${rule.description},${rule.kind},${rule.account_id},${rule.destination_id},${rule.category_id},${rule.amount}) ON CONFLICT(user_id,recurrence_id,due_on) DO NOTHING`);
    }
  }
  async budget(db: Db, user: string, month: string) {
    await this.materialize(db, user, month);
    const result = await rows<{
      category_id: string;
      name: string;
      budget: string | null;
      budget_scope: string | null;
      spent: string;
      expected: string;
      committed: string;
    }>(
      db,
      sql`SELECT c.id AS category_id,c.name,
      coalesce(o.amount,r.amount)::text AS budget,
      CASE WHEN o.id IS NOT NULL THEN 'month' WHEN r.id IS NOT NULL THEN 'future' ELSE NULL END AS budget_scope,
      coalesce((SELECT sum(e.amount) FROM cash_effects e WHERE e.user_id=c.user_id AND e.category_id=c.id AND e.kind='expense' AND e.occurred_on>=${month + '-01'}::date AND e.occurred_on<${shiftMonth(month, 1) + '-01'}::date),0)::text AS spent,
      coalesce((SELECT sum(o.amount) FROM occurrences o WHERE o.user_id=c.user_id AND o.category_id=c.id AND o.kind='expense' AND o.state='pending' AND o.due_on>=${month + '-01'}::date AND o.due_on<${shiftMonth(month, 1) + '-01'}::date),0)::text AS expected,
      coalesce((SELECT sum(s.amount) FROM installments s JOIN invoices i ON i.user_id=s.user_id AND i.id=s.invoice_id JOIN purchases p ON p.user_id=s.user_id AND p.id=s.purchase_id
        WHERE s.user_id=c.user_id AND p.category_id=c.id AND p.deleted_at IS NULL AND i.payment_id IS NULL AND NOT s.settled_before_tracking AND i.due_on>=${month + '-01'}::date AND i.due_on<${shiftMonth(month, 1) + '-01'}::date),0)::text AS committed
      FROM categories c
      LEFT JOIN budgets o ON o.user_id=c.user_id AND o.category_id=c.id AND o.month=${month + '-01'}::date
      LEFT JOIN LATERAL (
        SELECT br.id,br.amount FROM budget_rules br
        WHERE br.user_id=c.user_id AND br.category_id=c.id
          AND br.starts_month<=${month + '-01'}::date
          AND (br.ends_month IS NULL OR br.ends_month>=${month + '-01'}::date)
        ORDER BY br.starts_month DESC LIMIT 1
      ) r ON true
      WHERE c.user_id=${user} AND c.kind='expense' ORDER BY c.name`,
    );
    return result.map((b) => ({
      ...b,
      remaining: b.budget === null ? null : new Decimal(b.budget).minus(b.spent).toFixed(2),
      margin:
        b.budget === null
          ? null
          : new Decimal(b.budget).minus(b.spent).minus(b.expected).minus(b.committed).toFixed(2),
      utilization:
        b.budget !== null && new Decimal(b.budget).gt(0)
          ? new Decimal(b.spent).div(b.budget).times(100).toFixed(1)
          : null,
    }));
  }
}
