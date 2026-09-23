import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Db, rows } from '../database/database.service';
import { monthDate, shiftMonth, today } from '../domain/money';
import Decimal from 'decimal.js';

@Injectable()
export class PlanningService {
  async materialize(db: Db, user: string, month: string) {
    const rules = await rows(
      db,
      sql`SELECT * FROM recurrences WHERE user_id=${user} AND active AND starts_on<${shiftMonth(month, 1) + '-01'}::date AND (ends_on IS NULL OR ends_on>=${month + '-01'}::date)`,
    );
    for (const rule of rules) {
      const due = monthDate(month, rule.expected_day);
      if (due < rule.starts_on || (rule.ends_on && due > rule.ends_on)) continue;
      await db.execute(sql`INSERT INTO occurrences(user_id,recurrence_id,due_on,description,kind,account_id,destination_id,category_id,amount)
        VALUES(${user},${rule.id},${due},${rule.description},${rule.kind},${rule.account_id},${rule.destination_id},${rule.category_id},${rule.amount}) ON CONFLICT(user_id,recurrence_id,due_on) DO NOTHING`);
    }
  }
  async budget(db: Db, user: string, month: string) {
    await this.materialize(db, user, month);
    const result = await rows(
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
