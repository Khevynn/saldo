import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { UserId } from '../auth/auth';
import {
  budgetInput,
  goalInput,
  id,
  month,
  occurrenceConfirm,
  parse,
  recurrenceInput,
  positiveMoney,
  date,
} from '../common/validation';
import { rows } from '../database/database.service';
import { shiftMonth, today } from '../domain/money';
import { FinanceStore, account, audit, category } from './finance.store';
import Decimal from 'decimal.js';
import { ConflictException } from '@nestjs/common';
import { PlanningService } from './planning.service';

@Controller()
export class PlanningController {
  constructor(
    @Inject(FinanceStore) private readonly store: FinanceStore,
    @Inject(PlanningService) private readonly planning: PlanningService,
  ) {}
  @Get('recurrences') recurrences(@UserId() user: string) {
    return this.store.read(user, (db) =>
      rows(db, sql`SELECT * FROM recurrences WHERE user_id=${user} ORDER BY description`),
    );
  }
  @Post('recurrences') createRecurrence(@UserId() user: string, @Body() input: unknown) {
    const d = parse(recurrenceInput, input);
    return this.store.run(user, async (db) => {
      await account(db, user, d.account_id);
      if (d.kind === 'transfer') {
        if (!d.destination_id || d.destination_id === d.account_id || d.category_id)
          throw new BadRequestException('Informe contas distintas e nenhuma categoria.');
        await account(db, user, d.destination_id);
      } else {
        if (!d.category_id || d.destination_id)
          throw new BadRequestException('Informe categoria compatível.');
        await category(db, user, d.category_id, d.kind);
      }
      const [result] = await rows(
        db,
        sql`INSERT INTO recurrences(user_id,description,kind,account_id,destination_id,category_id,amount,expected_day,starts_on,ends_on)
        VALUES(${user},${d.description},${d.kind},${d.account_id},${d.destination_id || null},${d.category_id || null},${d.amount},${d.expected_day},${d.starts_on},${d.ends_on || null}) RETURNING *`,
      );
      await audit(db, user, 'recurrence', result.id, 'create', null, result);
      return result;
    });
  }
  @Patch('recurrences/:id') toggle(
    @UserId() user: string,
    @Param('id') rawId: string,
    @Body() input: unknown,
  ) {
    const recurrenceId = parse(id, rawId);
    const d = parse(
      z
        .object({
          active: z.boolean().optional(),
          description: z.string().trim().min(1).max(100).optional(),
          amount: positiveMoney.optional(),
        })
        .strict(),
      input,
    );
    return this.store.run(user, async (db) => {
      const [before] = await rows(
        db,
        sql`SELECT * FROM recurrences WHERE user_id=${user} AND id=${recurrenceId}`,
      );
      if (!before) throw new NotFoundException('Recorrência não encontrada.');
      const [result] = await rows(
        db,
        sql`UPDATE recurrences SET active=${d.active ?? before.active},description=${d.description ?? before.description},amount=${d.amount ?? before.amount} WHERE user_id=${user} AND id=${recurrenceId} RETURNING *`,
      );
      if (d.amount !== undefined || d.description !== undefined)
        await db.execute(
          sql`UPDATE occurrences SET amount=${d.amount ?? before.amount},description=${d.description ?? before.description} WHERE user_id=${user} AND recurrence_id=${recurrenceId} AND state='pending' AND due_on>=${today()}::date`,
        );
      if (d.active === false)
        await db.execute(
          sql`UPDATE occurrences SET state='skipped' WHERE user_id=${user} AND recurrence_id=${recurrenceId} AND state='pending' AND due_on>=${today()}::date`,
        );
      await audit(db, user, 'recurrence', recurrenceId, 'update', before, result);
      return result;
    });
  }
  @Get('occurrences') occurrences(@UserId() user: string, @Query('month') rawMonth: string) {
    const m = parse(month, rawMonth || today().slice(0, 7));
    return this.store.run(user, async (db) => {
      await this.planning.materialize(db, user, m);
      return rows(
        db,
        sql`SELECT * FROM occurrences WHERE user_id=${user} AND due_on>=${m + '-01'}::date AND due_on<${shiftMonth(m, 1) + '-01'}::date ORDER BY due_on,description`,
      );
    });
  }
  @Post('occurrences/:id/confirm') confirm(
    @UserId() user: string,
    @Param('id') rawId: string,
    @Headers('idempotency-key') rawKey: string,
    @Body() input: unknown,
  ) {
    const occurrenceId = parse(id, rawId),
      key = parse(id, rawKey),
      d = parse(occurrenceConfirm, input);
    return this.store.run(user, (db) =>
      this.store.once(db, user, key, { action: 'confirm', occurrenceId, d }, async () => {
        const [o] = await rows(
          db,
          sql`SELECT * FROM occurrences WHERE user_id=${user} AND id=${occurrenceId}`,
        );
        if (!o) throw new NotFoundException('Ocorrência não encontrada.');
        if (o.state === 'confirmed') {
          const existing = (
            await rows(
              db,
              sql`SELECT * FROM transactions WHERE user_id=${user} AND id=${o.transaction_id}`,
            )
          )[0];
          if (
            (existing.kind === 'income' ? existing.destination_id : existing.source_id) !==
              d.account_id ||
            existing.occurred_on !== d.occurred_on ||
            !new Decimal(existing.amount).eq(d.amount)
          )
            throw new ConflictException(
              'A ocorrência já foi confirmada com outros dados. Atualize a página.',
            );
          return existing;
        }
        if (o.state === 'skipped')
          throw new BadRequestException('Reabra a ocorrência antes de confirmar.');
        const tx = await this.store.insertTransaction(db, user, {
          kind: o.kind,
          description: o.description,
          source_id: o.kind === 'income' ? null : d.account_id,
          destination_id: o.kind === 'income' ? d.account_id : o.destination_id,
          category_id: o.category_id,
          amount: d.amount,
          received: o.kind === 'transfer' ? d.amount : null,
          occurred_on: d.occurred_on,
        });
        await db.execute(
          sql`UPDATE occurrences SET state='confirmed',transaction_id=${tx.id} WHERE user_id=${user} AND id=${occurrenceId}`,
        );
        await audit(db, user, 'occurrence', o.id, 'confirm', o, { transaction_id: tx.id });
        return tx;
      }),
    );
  }
  @Post('occurrences/:id/link-transaction') link(
    @UserId() user: string,
    @Param('id') rawId: string,
    @Body() input: unknown,
  ) {
    const occurrenceId = parse(id, rawId);
    const d = parse(z.object({ transaction_id: id }).strict(), input);
    return this.store.run(user, async (db) => {
      const [o] = await rows(
        db,
        sql`SELECT * FROM occurrences WHERE user_id=${user} AND id=${occurrenceId}`,
      );
      const [t] = await rows(
        db,
        sql`SELECT * FROM transactions WHERE user_id=${user} AND id=${d.transaction_id} AND deleted_at IS NULL`,
      );
      if (!o || !t) throw new NotFoundException('Registro não encontrado.');
      if (
        o.state !== 'pending' ||
        o.kind !== t.kind ||
        o.category_id !== t.category_id ||
        (o.kind === 'income' ? t.destination_id : t.source_id) !== o.account_id ||
        (o.kind === 'transfer' && t.destination_id !== o.destination_id)
      )
        throw new BadRequestException('Movimentação incompatível com esta ocorrência.');
      await db.execute(
        sql`UPDATE occurrences SET state='confirmed',transaction_id=${t.id} WHERE user_id=${user} AND id=${o.id}`,
      );
      await audit(db, user, 'occurrence', o.id, 'link', o, { transaction_id: t.id });
      return { linked: true };
    });
  }
  @Patch('occurrences/:id') occurrenceState(
    @UserId() user: string,
    @Param('id') rawId: string,
    @Body() input: unknown,
  ) {
    const occurrenceId = parse(id, rawId);
    const d = parse(
      z
        .object({
          state: z.enum(['pending', 'skipped']).optional(),
          amount: positiveMoney.optional(),
          description: z.string().trim().min(1).max(100).optional(),
        })
        .strict(),
      input,
    );
    return this.store.run(user, async (db) => {
      const [before] = await rows(
        db,
        sql`SELECT * FROM occurrences WHERE user_id=${user} AND id=${occurrenceId}`,
      );
      if (!before) throw new NotFoundException('Ocorrência não encontrada.');
      if (before.state === 'confirmed')
        throw new BadRequestException('Exclua a movimentação vinculada para reabrir.');
      const [result] = await rows(
        db,
        sql`UPDATE occurrences SET state=${d.state ?? before.state},amount=${d.amount ?? before.amount},description=${d.description ?? before.description} WHERE user_id=${user} AND id=${occurrenceId} RETURNING *`,
      );
      await audit(db, user, 'occurrence', occurrenceId, 'update', before, result);
      return result;
    });
  }
  @Get('budgets/:month') budget(@UserId() user: string, @Param('month') rawMonth: string) {
    const m = parse(month, rawMonth);
    return this.store.run(user, (db) => this.planning.budget(db, user, m));
  }
  @Delete('budgets/:month/:categoryId/override') removeBudgetOverride(
    @UserId() user: string,
    @Param('month') rawMonth: string,
    @Param('categoryId') rawCategoryId: string,
  ) {
    const m = parse(month, rawMonth),
      categoryId = parse(id, rawCategoryId);
    return this.store.run(user, async (db) => {
      const [removed] = await rows(
        db,
        sql`DELETE FROM budgets WHERE user_id=${user} AND month=${m + '-01'}::date AND category_id=${categoryId} RETURNING *`,
      );
      if (!removed) throw new NotFoundException('Exceção mensal não encontrada.');
      await audit(db, user, 'budget_override', removed.id, 'remove', removed, null);
      return { removed: true };
    });
  }
  @Put('budgets/:month') saveBudget(
    @UserId() user: string,
    @Param('month') rawMonth: string,
    @Body() input: unknown,
  ) {
    const m = parse(month, rawMonth),
      d = parse(budgetInput, input);
    return this.store.run(user, async (db) => {
      await category(db, user, d.category_id, 'expense');
      if (d.scope === 'month') {
        const [before] = await rows(
          db,
          sql`SELECT * FROM budgets WHERE user_id=${user} AND month=${m + '-01'}::date AND category_id=${d.category_id}`,
        );
        const [result] = await rows(
          db,
          sql`INSERT INTO budgets(user_id,month,category_id,amount) VALUES(${user},${m + '-01'},${d.category_id},${d.amount}) ON CONFLICT(user_id,month,category_id) DO UPDATE SET amount=excluded.amount RETURNING *`,
        );
        await audit(db, user, 'budget_override', result.id, 'save-month', before || null, result);
        return { ...result, scope: 'month' };
      }

      const start = m + '-01',
        previousMonth = shiftMonth(m, -1) + '-01';
      const futureRules = await rows(
        db,
        sql`SELECT * FROM budget_rules WHERE user_id=${user} AND category_id=${d.category_id} AND starts_month>${start}::date ORDER BY starts_month`,
      );
      for (const future of futureRules) {
        await audit(db, user, 'budget_rule', future.id, 'replace-future', future, null);
      }
      await db.execute(
        sql`DELETE FROM budget_rules WHERE user_id=${user} AND category_id=${d.category_id} AND starts_month>${start}::date`,
      );
      const [covering] = await rows(
        db,
        sql`SELECT * FROM budget_rules WHERE user_id=${user} AND category_id=${d.category_id} AND starts_month<${start}::date AND (ends_month IS NULL OR ends_month>=${start}::date) ORDER BY starts_month DESC LIMIT 1`,
      );
      if (covering) {
        const [closed] = await rows(
          db,
          sql`UPDATE budget_rules SET ends_month=${previousMonth}::date WHERE user_id=${user} AND id=${covering.id} RETURNING *`,
        );
        await audit(db, user, 'budget_rule', covering.id, 'close', covering, closed);
      }
      const [before] = await rows(
        db,
        sql`SELECT * FROM budget_rules WHERE user_id=${user} AND category_id=${d.category_id} AND starts_month=${start}::date`,
      );
      const [result] = await rows(
        db,
        sql`INSERT INTO budget_rules(user_id,category_id,amount,starts_month) VALUES(${user},${d.category_id},${d.amount},${start}) ON CONFLICT(user_id,category_id,starts_month) DO UPDATE SET amount=excluded.amount,ends_month=NULL RETURNING *`,
      );
      const [monthlyOverride] = await rows(
        db,
        sql`DELETE FROM budgets WHERE user_id=${user} AND category_id=${d.category_id} AND month=${start}::date RETURNING *`,
      );
      if (monthlyOverride)
        await audit(
          db,
          user,
          'budget_override',
          monthlyOverride.id,
          'remove-for-future-rule',
          monthlyOverride,
          null,
        );
      await audit(db, user, 'budget_rule', result.id, 'save-future', before || null, result);
      return { ...result, scope: 'future' };
    });
  }
  @Get('goals') goals(@UserId() user: string) {
    return this.store.read(user, async (db) => {
      const accounts = await this.store.balances(db, user);
      return (
        await rows(db, sql`SELECT * FROM goals WHERE user_id=${user} ORDER BY archived,name`)
      ).map((g) => {
        const balance = accounts.find((a) => a.id === g.account_id)?.balance || '0.00';
        const remaining = Decimal.max(0, new Decimal(g.target).minus(balance));
        return {
          ...g,
          balance,
          remaining: remaining.toFixed(2),
          progress: new Decimal(balance).div(g.target).times(100).toFixed(1),
          months_to_goal: new Decimal(g.monthly_contribution).gt(0)
            ? remaining.div(g.monthly_contribution).ceil().toString()
            : null,
        };
      });
    });
  }
  @Post('goals') createGoal(@UserId() user: string, @Body() input: unknown) {
    const d = parse(goalInput, input);
    return this.store.run(user, async (db) => {
      const a = await account(db, user, d.account_id);
      if (a.purpose !== 'reserved')
        throw new BadRequestException('Associe a meta a uma conta reservada.');
      const [result] = await rows(
        db,
        sql`INSERT INTO goals(user_id,account_id,name,target,monthly_contribution,deadline) VALUES(${user},${d.account_id},${d.name},${d.target},${d.monthly_contribution},${d.deadline || null}) RETURNING *`,
      );
      await audit(db, user, 'goal', result.id, 'create', null, result);
      return result;
    });
  }
  @Patch('goals/:id') editGoal(
    @UserId() user: string,
    @Param('id') rawId: string,
    @Body() input: unknown,
  ) {
    const goalId = parse(id, rawId);
    const d = parse(
      goalInput
        .omit({ account_id: true })
        .partial()
        .extend({ archived: z.boolean().optional() })
        .strict(),
      input,
    );
    return this.store.run(user, async (db) => {
      const [before] = await rows(
        db,
        sql`SELECT * FROM goals WHERE user_id=${user} AND id=${goalId}`,
      );
      if (!before) throw new NotFoundException('Meta não encontrada.');
      const [result] = await rows(
        db,
        sql`UPDATE goals SET name=${d.name ?? before.name},target=${d.target ?? before.target},monthly_contribution=${d.monthly_contribution ?? before.monthly_contribution},deadline=${d.deadline === undefined ? before.deadline : d.deadline},archived=${d.archived ?? before.archived} WHERE user_id=${user} AND id=${goalId} RETURNING *`,
      );
      await audit(db, user, 'goal', goalId, 'update', before, result);
      return result;
    });
  }
}
