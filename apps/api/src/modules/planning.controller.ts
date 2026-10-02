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
  futurePlanInput,
  futurePlanItemInput,
  futurePlanPocketInput,
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
      rows(
        db,
        sql`SELECT * FROM recurrences WHERE user_id=${user} AND deleted_at IS NULL ORDER BY description`,
      ),
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
        sql`INSERT INTO recurrences(user_id,description,kind,account_id,destination_id,category_id,amount,expected_day,interval_months,starts_on,ends_on)
        VALUES(${user},${d.description},${d.kind},${d.account_id},${d.destination_id || null},${d.category_id || null},${d.amount},${d.expected_day},${d.interval_months},${d.starts_on},${d.ends_on || null}) RETURNING *`,
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
          interval_months: z.number().int().min(1).max(24).optional(),
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
        sql`UPDATE recurrences SET active=${d.active ?? before.active},description=${d.description ?? before.description},amount=${d.amount ?? before.amount},interval_months=${d.interval_months ?? before.interval_months} WHERE user_id=${user} AND id=${recurrenceId} RETURNING *`,
      );
      if (d.interval_months !== undefined && d.interval_months !== before.interval_months)
        await db.execute(
          sql`DELETE FROM occurrences WHERE user_id=${user} AND recurrence_id=${recurrenceId} AND state<>'confirmed' AND due_on>=${today()}::date`,
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
  @Delete('recurrences/:id') deleteRecurrence(@UserId() user: string, @Param('id') rawId: string) {
    const recurrenceId = parse(id, rawId);
    return this.store.run(user, async (db) => {
      const [before] = await rows(
        db,
        sql`SELECT * FROM recurrences WHERE user_id=${user} AND id=${recurrenceId} AND deleted_at IS NULL`,
      );
      if (!before) throw new NotFoundException('Recorrência não encontrada.');
      const [result] = await rows(
        db,
        sql`UPDATE recurrences SET active=false,deleted_at=now() WHERE user_id=${user} AND id=${recurrenceId} RETURNING *`,
      );
      await db.execute(
        sql`UPDATE occurrences SET state='skipped' WHERE user_id=${user} AND recurrence_id=${recurrenceId} AND state='pending'`,
      );
      await audit(db, user, 'recurrence', recurrenceId, 'delete', before, result);
      return { deleted: true };
    });
  }
  @Get('future-plans') futurePlans(@UserId() user: string) {
    return this.store.read(user, async (db) => {
      const plans = await rows(
        db,
        sql`SELECT * FROM future_plans WHERE user_id=${user} ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'completed' THEN 1 ELSE 2 END,target_date,name`,
      );
      const items = await rows(
        db,
        sql`SELECT * FROM future_plan_items WHERE user_id=${user} ORDER BY kind DESC,cadence,name`,
      );
      const pockets = await rows(
        db,
        sql`SELECT * FROM future_plan_pockets WHERE user_id=${user} ORDER BY CASE kind WHEN 'principal' THEN 0 WHEN 'benefit' THEN 1 ELSE 2 END,name`,
      );
      return plans.map((plan) =>
        this.planning.projectFuturePlan(
          plan,
          items.filter((item) => item.plan_id === plan.id),
          pockets.filter((pocket) => pocket.plan_id === plan.id),
        ),
      );
    });
  }
  @Post('future-plans') createFuturePlan(@UserId() user: string, @Body() input: unknown) {
    const d = parse(futurePlanInput, input);
    return this.store.run(user, async (db) => {
      const [result] = await rows(
        db,
        sql`INSERT INTO future_plans(user_id,name,theme,target_date,estimated_cost,reserved_amount,notes)
          VALUES(${user},${d.name},${d.theme},${d.target_date},${d.estimated_cost},${d.reserved_amount},${d.notes || null}) RETURNING *`,
      );
      const [pocket] = await rows(
        db,
        sql`INSERT INTO future_plan_pockets(user_id,plan_id,name,kind,opening_balance)
          VALUES(${user},${result.id},'Principal','principal',${d.reserved_amount}) RETURNING *`,
      );
      await db.execute(
        sql`INSERT INTO future_plan_items(user_id,plan_id,pocket_id,kind,name,cadence,interval_months,amount,is_baseline)
          VALUES(${user},${result.id},${pocket.id},'expense','Estimativa inicial','once',1,${d.estimated_cost},true)`,
      );
      await audit(db, user, 'future_plan', result.id, 'create', null, result);
      return result;
    });
  }
  @Patch('future-plans/:id') editFuturePlan(
    @UserId() user: string,
    @Param('id') rawId: string,
    @Body() input: unknown,
  ) {
    const planId = parse(id, rawId);
    const d = parse(
      futurePlanInput
        .partial()
        .extend({ status: z.enum(['active', 'completed', 'archived']).optional() })
        .strict(),
      input,
    );
    return this.store.run(user, async (db) => {
      const [before] = await rows(
        db,
        sql`SELECT * FROM future_plans WHERE user_id=${user} AND id=${planId}`,
      );
      if (!before) throw new NotFoundException('Plano futuro não encontrado.');
      const [result] = await rows(
        db,
        sql`UPDATE future_plans SET
          name=${d.name ?? before.name},theme=${d.theme ?? before.theme},target_date=${d.target_date ?? before.target_date},
          estimated_cost=${d.estimated_cost ?? before.estimated_cost},reserved_amount=${d.reserved_amount ?? before.reserved_amount},
          notes=${d.notes === undefined ? before.notes : d.notes || null},status=${d.status ?? before.status},updated_at=now()
          WHERE user_id=${user} AND id=${planId} RETURNING *`,
      );
      if (d.estimated_cost !== undefined)
        await db.execute(
          sql`UPDATE future_plan_items SET amount=${d.estimated_cost},updated_at=now()
            WHERE user_id=${user} AND plan_id=${planId} AND is_baseline`,
        );
      if (d.reserved_amount !== undefined)
        await db.execute(
          sql`UPDATE future_plan_pockets SET opening_balance=${d.reserved_amount},updated_at=now()
            WHERE user_id=${user} AND plan_id=${planId} AND kind='principal'`,
        );
      await audit(db, user, 'future_plan', planId, 'update', before, result);
      return result;
    });
  }
  @Delete('future-plans/:id') deleteFuturePlan(@UserId() user: string, @Param('id') rawId: string) {
    const planId = parse(id, rawId);
    return this.store.run(user, async (db) => {
      const [before] = await rows(
        db,
        sql`DELETE FROM future_plans WHERE user_id=${user} AND id=${planId} RETURNING *`,
      );
      if (!before) throw new NotFoundException('Plano futuro não encontrado.');
      await audit(db, user, 'future_plan', planId, 'delete', before, null);
      return { deleted: true };
    });
  }
  @Post('future-plans/:id/items') createFuturePlanItem(
    @UserId() user: string,
    @Param('id') rawId: string,
    @Body() input: unknown,
  ) {
    const planId = parse(id, rawId);
    const d = parse(futurePlanItemInput, input);
    return this.store.run(user, async (db) => {
      const [plan] = await rows(
        db,
        sql`SELECT id FROM future_plans WHERE user_id=${user} AND id=${planId}`,
      );
      if (!plan) throw new NotFoundException('Plano futuro não encontrado.');
      const [pocket] = await rows(
        db,
        d.pocket_id
          ? sql`SELECT * FROM future_plan_pockets WHERE user_id=${user} AND plan_id=${planId} AND id=${d.pocket_id}`
          : sql`SELECT * FROM future_plan_pockets WHERE user_id=${user} AND plan_id=${planId} AND kind='principal'`,
      );
      if (!pocket) throw new BadRequestException('Caixa do cenário não encontrada.');
      const [result] = await rows(
        db,
        sql`INSERT INTO future_plan_items(user_id,plan_id,pocket_id,kind,name,cadence,interval_months,amount,due_on,notes)
          VALUES(${user},${planId},${pocket.id},${d.kind},${d.name},${d.cadence},${d.interval_months},${d.amount},${d.due_on || null},${d.notes || null}) RETURNING *`,
      );
      await audit(db, user, 'future_plan_item', result.id, 'create', null, result);
      return result;
    });
  }
  @Patch('future-plans/:planId/items/:itemId') editFuturePlanItem(
    @UserId() user: string,
    @Param('planId') rawPlanId: string,
    @Param('itemId') rawItemId: string,
    @Body() input: unknown,
  ) {
    const planId = parse(id, rawPlanId);
    const itemId = parse(id, rawItemId);
    const d = parse(futurePlanItemInput.partial().strict(), input);
    return this.store.run(user, async (db) => {
      const [before] = await rows(
        db,
        sql`SELECT * FROM future_plan_items WHERE user_id=${user} AND plan_id=${planId} AND id=${itemId}`,
      );
      if (!before) throw new NotFoundException('Item do plano não encontrado.');
      const nextPocketId = d.pocket_id ?? before.pocket_id;
      const [pocket] = await rows(
        db,
        sql`SELECT id FROM future_plan_pockets WHERE user_id=${user} AND plan_id=${planId} AND id=${nextPocketId}`,
      );
      if (!pocket) throw new BadRequestException('Caixa do cenário não encontrada.');
      const [result] = await rows(
        db,
        sql`UPDATE future_plan_items SET kind=${d.kind ?? before.kind},name=${d.name ?? before.name},
          cadence=${d.cadence ?? before.cadence},interval_months=${d.interval_months ?? before.interval_months},
          pocket_id=${nextPocketId},amount=${d.amount ?? before.amount},
          due_on=${d.due_on === undefined ? before.due_on : d.due_on || null},
          notes=${d.notes === undefined ? before.notes : d.notes || null},updated_at=now()
          WHERE user_id=${user} AND plan_id=${planId} AND id=${itemId} RETURNING *`,
      );
      await audit(db, user, 'future_plan_item', itemId, 'update', before, result);
      return result;
    });
  }
  @Delete('future-plans/:planId/items/:itemId') deleteFuturePlanItem(
    @UserId() user: string,
    @Param('planId') rawPlanId: string,
    @Param('itemId') rawItemId: string,
  ) {
    const planId = parse(id, rawPlanId);
    const itemId = parse(id, rawItemId);
    return this.store.run(user, async (db) => {
      const [before] = await rows(
        db,
        sql`DELETE FROM future_plan_items WHERE user_id=${user} AND plan_id=${planId} AND id=${itemId} RETURNING *`,
      );
      if (!before) throw new NotFoundException('Item do plano não encontrado.');
      await audit(db, user, 'future_plan_item', itemId, 'delete', before, null);
      return { deleted: true };
    });
  }
  @Post('future-plans/:id/pockets') createFuturePlanPocket(
    @UserId() user: string,
    @Param('id') rawId: string,
    @Body() input: unknown,
  ) {
    const planId = parse(id, rawId);
    const d = parse(futurePlanPocketInput, input);
    return this.store.run(user, async (db) => {
      const [plan] = await rows(
        db,
        sql`SELECT id FROM future_plans WHERE user_id=${user} AND id=${planId}`,
      );
      if (!plan) throw new NotFoundException('Plano futuro não encontrado.');
      const [result] = await rows(
        db,
        sql`INSERT INTO future_plan_pockets(user_id,plan_id,name,kind,opening_balance)
          VALUES(${user},${planId},${d.name},${d.kind},${d.opening_balance}) RETURNING *`,
      );
      await audit(db, user, 'future_plan_pocket', result.id, 'create', null, result);
      return result;
    });
  }
  @Patch('future-plans/:planId/pockets/:pocketId') editFuturePlanPocket(
    @UserId() user: string,
    @Param('planId') rawPlanId: string,
    @Param('pocketId') rawPocketId: string,
    @Body() input: unknown,
  ) {
    const planId = parse(id, rawPlanId);
    const pocketId = parse(id, rawPocketId);
    const d = parse(futurePlanPocketInput.partial().strict(), input);
    return this.store.run(user, async (db) => {
      const [before] = await rows(
        db,
        sql`SELECT * FROM future_plan_pockets WHERE user_id=${user} AND plan_id=${planId} AND id=${pocketId}`,
      );
      if (!before) throw new NotFoundException('Caixa do cenário não encontrada.');
      const [result] = await rows(
        db,
        sql`UPDATE future_plan_pockets SET name=${d.name ?? before.name},
          kind=${before.kind === 'principal' ? 'principal' : (d.kind ?? before.kind)},
          opening_balance=${d.opening_balance ?? before.opening_balance},updated_at=now()
          WHERE user_id=${user} AND plan_id=${planId} AND id=${pocketId} RETURNING *`,
      );
      if (before.kind === 'principal')
        await db.execute(
          sql`UPDATE future_plans SET reserved_amount=${d.opening_balance ?? before.opening_balance},updated_at=now()
            WHERE user_id=${user} AND id=${planId}`,
        );
      await audit(db, user, 'future_plan_pocket', pocketId, 'update', before, result);
      return result;
    });
  }
  @Delete('future-plans/:planId/pockets/:pocketId') deleteFuturePlanPocket(
    @UserId() user: string,
    @Param('planId') rawPlanId: string,
    @Param('pocketId') rawPocketId: string,
  ) {
    const planId = parse(id, rawPlanId);
    const pocketId = parse(id, rawPocketId);
    return this.store.run(user, async (db) => {
      const [before] = await rows(
        db,
        sql`SELECT * FROM future_plan_pockets WHERE user_id=${user} AND plan_id=${planId} AND id=${pocketId}`,
      );
      if (!before) throw new NotFoundException('Caixa do cenário não encontrada.');
      if (before.kind === 'principal')
        throw new BadRequestException(
          'A caixa principal faz parte do plano e não pode ser excluída.',
        );
      const [usage] = await rows<{ count: string }>(
        db,
        sql`SELECT count(*)::text AS count FROM future_plan_items WHERE user_id=${user} AND plan_id=${planId} AND pocket_id=${pocketId}`,
      );
      if (Number(usage.count))
        throw new BadRequestException('Mova ou exclua os itens desta caixa antes de apagá-la.');
      await db.execute(
        sql`DELETE FROM future_plan_pockets WHERE user_id=${user} AND plan_id=${planId} AND id=${pocketId}`,
      );
      await audit(db, user, 'future_plan_pocket', pocketId, 'delete', before, null);
      return { deleted: true };
    });
  }
  @Get('occurrences') occurrences(
    @UserId() user: string,
    @Query('month') rawMonth?: string,
    @Query('from') rawFrom?: string,
    @Query('to') rawTo?: string,
  ) {
    if (!!rawFrom !== !!rawTo)
      throw new BadRequestException('Informe as datas inicial e final do período.');
    const m = parse(month, rawMonth || today().slice(0, 7));
    const from = rawFrom ? parse(date, rawFrom) : `${m}-01`;
    const to = rawTo ? parse(date, rawTo) : `${shiftMonth(m, 1)}-01`;
    const toExclusive = rawTo
      ? new Date(new Date(`${to}T12:00:00`).getTime() + 86400000).toISOString().slice(0, 10)
      : to;
    const monthCount =
      (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 +
      Number(to.slice(5, 7)) -
      Number(from.slice(5, 7)) +
      1;
    if (from > to || monthCount < 1 || monthCount > 24)
      throw new BadRequestException('Escolha um período válido de até 24 meses.');
    return this.store.run(user, async (db) => {
      for (let cursor = from.slice(0, 7); cursor <= to.slice(0, 7); cursor = shiftMonth(cursor, 1))
        await this.planning.materialize(db, user, cursor);
      return rows(
        db,
        sql`SELECT o.* FROM occurrences o
          JOIN recurrences r ON r.user_id=o.user_id AND r.id=o.recurrence_id
          WHERE o.user_id=${user} AND o.due_on>=${from}::date AND o.due_on<${toExclusive}::date
            AND (r.deleted_at IS NULL OR o.state='confirmed')
          ORDER BY o.due_on,o.description`,
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
            (existing.reference_month?.slice(0, 7) || null) !== (d.reference_month || null) ||
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
          reference_month: d.reference_month || null,
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
  @Get('budgets/range') budgetRange(
    @UserId() user: string,
    @Query('from') rawFrom: string,
    @Query('to') rawTo: string,
  ) {
    const from = parse(date, rawFrom);
    const to = parse(date, rawTo);
    const monthCount =
      (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 +
      Number(to.slice(5, 7)) -
      Number(from.slice(5, 7)) +
      1;
    if (from > to || monthCount < 1 || monthCount > 24)
      throw new BadRequestException('Escolha um período válido de até 24 meses.');
    return this.store.run(user, async (db) => {
      const totals = new Map<
        string,
        {
          category_id: string;
          name: string;
          budget: Decimal;
          budgetMonths: number;
        }
      >();
      for (
        let cursor = from.slice(0, 7);
        cursor <= to.slice(0, 7);
        cursor = shiftMonth(cursor, 1)
      ) {
        const monthRows = await this.planning.budget(db, user, cursor);
        for (const row of monthRows) {
          const total = totals.get(row.category_id) || {
            category_id: row.category_id,
            name: row.name,
            budget: new Decimal(0),
            budgetMonths: 0,
          };
          if (row.budget !== null) {
            total.budget = total.budget.plus(row.budget);
            total.budgetMonths += 1;
          }
          totals.set(row.category_id, total);
        }
      }
      const toExclusive = new Date(new Date(`${to}T12:00:00`).getTime() + 86400000)
        .toISOString()
        .slice(0, 10);
      const actuals = await rows<{
        category_id: string;
        name: string;
        spent: string;
        expected: string;
        committed: string;
      }>(
        db,
        sql`SELECT c.id AS category_id,c.name,
        coalesce((SELECT sum(e.amount) FROM cash_effects e WHERE e.user_id=c.user_id AND e.category_id=c.id AND e.kind='expense' AND e.occurred_on>=${from}::date AND e.occurred_on<${toExclusive}::date),0)::text AS spent,
        coalesce((SELECT sum(o.amount) FROM occurrences o WHERE o.user_id=c.user_id AND o.category_id=c.id AND o.kind='expense' AND o.state='pending' AND o.due_on>=${from}::date AND o.due_on<${toExclusive}::date),0)::text AS expected,
        coalesce((SELECT sum(s.amount) FROM installments s JOIN invoices i ON i.user_id=s.user_id AND i.id=s.invoice_id JOIN purchases p ON p.user_id=s.user_id AND p.id=s.purchase_id
          WHERE s.user_id=c.user_id AND p.category_id=c.id AND p.deleted_at IS NULL AND i.payment_id IS NULL AND NOT s.settled_before_tracking AND i.due_on>=${from}::date AND i.due_on<${toExclusive}::date),0)::text AS committed
        FROM categories c WHERE c.user_id=${user} AND c.kind='expense' ORDER BY c.name`,
      );
      return actuals.map((actual) => {
        const total = totals.get(actual.category_id)!;
        const budget = total.budgetMonths ? total.budget : null;
        const spent = new Decimal(actual.spent);
        const expected = new Decimal(actual.expected);
        const committed = new Decimal(actual.committed);
        return {
          ...actual,
          budget: budget?.toFixed(2) || null,
          budget_scope: 'range',
          remaining: budget ? budget.minus(spent).toFixed(2) : null,
          margin: budget ? budget.minus(spent).minus(expected).minus(committed).toFixed(2) : null,
          utilization: budget?.gt(0) ? spent.div(budget).times(100).toFixed(1) : null,
        };
      });
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
