import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { UserId } from '../auth/auth';
import { date, id, month, parse, transactionInput } from '../common/validation';
import { rows } from '../database/database.service';
import { shiftMonth, today } from '../domain/money';
import { FinanceStore, audit, account } from './finance.store';

@Controller('transactions')
export class TransactionsController {
  constructor(@Inject(FinanceStore) private readonly store: FinanceStore) {}
  @Get() list(@UserId() user: string, @Query() input: unknown) {
    const query = parse(
      z
        .object({
          month: month.optional(),
          from: date.optional(),
          to: date.optional(),
          page: z.coerce.number().int().min(1).max(10000).default(1),
          limit: z.coerce.number().int().min(1).max(500).default(50),
          account_id: id.optional(),
          category_id: id.optional(),
        })
        .strict(),
      input,
    );
    if (!!query.from !== !!query.to)
      throw new BadRequestException('Informe as datas inicial e final do período.');
    const selectedMonth = query.month || today().slice(0, 7);
    const from = query.from || `${selectedMonth}-01`;
    const toExclusive = query.to
      ? new Date(`${query.to}T12:00:00`)
      : new Date(`${shiftMonth(selectedMonth, 1)}-01T12:00:00`);
    if (query.to) toExclusive.setDate(toExclusive.getDate() + 1);
    const to = toExclusive.toISOString().slice(0, 10);
    const days = (toExclusive.getTime() - new Date(`${from}T12:00:00`).getTime()) / 86400000;
    if (days <= 0 || days > 366 * 5)
      throw new BadRequestException('Escolha um período válido de até cinco anos.');
    return this.store.read(user, (db) =>
      rows(
        db,
        sql`SELECT t.*,s.name AS source_name,d.name AS destination_name,c.name AS category_name,
        ft.description AS funding_transfer_description,ft.occurred_on AS funding_transfer_date,
        count(*) OVER()::integer AS total_count
      FROM transactions t LEFT JOIN accounts s ON s.user_id=t.user_id AND s.id=t.source_id
      LEFT JOIN accounts d ON d.user_id=t.user_id AND d.id=t.destination_id
      LEFT JOIN categories c ON c.user_id=t.user_id AND c.id=t.category_id
      LEFT JOIN transactions ft ON ft.user_id=t.user_id AND ft.id=t.funding_transfer_id
      WHERE t.user_id=${user} AND t.deleted_at IS NULL AND t.occurred_on>=${from}::date AND t.occurred_on<${to}::date
      ${query.account_id ? sql`AND (t.source_id=${query.account_id} OR t.destination_id=${query.account_id})` : sql``}
      ${query.category_id ? sql`AND (t.category_id=${query.category_id} OR EXISTS(SELECT 1 FROM cash_effects e WHERE e.user_id=t.user_id AND e.transaction_id=t.id AND e.category_id=${query.category_id}))` : sql``}
      ORDER BY t.occurred_on DESC,t.created_at DESC,t.id LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}`,
      ),
    );
  }
  @Get('transfers') transfers(@UserId() user: string) {
    return this.store.read(user, (db) =>
      rows(
        db,
        sql`SELECT t.*,s.name AS source_name,d.name AS destination_name
        FROM transactions t
        JOIN accounts s ON s.user_id=t.user_id AND s.id=t.source_id
        JOIN accounts d ON d.user_id=t.user_id AND d.id=t.destination_id
        WHERE t.user_id=${user} AND t.kind='transfer' AND t.deleted_at IS NULL
        ORDER BY t.occurred_on DESC,t.created_at DESC LIMIT 200`,
      ),
    );
  }
  @Post() create(
    @UserId() user: string,
    @Headers('idempotency-key') rawKey: string,
    @Body() input: unknown,
  ) {
    const key = parse(id, rawKey);
    const data = parse(transactionInput, input);
    return this.store.run(user, (db) =>
      this.store.once(db, user, key, { action: 'transaction', data }, () =>
        this.store.insertTransaction(db, user, data),
      ),
    );
  }
  @Patch(':id') edit(@UserId() user: string, @Param('id') rawId: string, @Body() input: unknown) {
    const transactionId = parse(id, rawId);
    const { version, ...data } = parse(
      transactionInput.extend({ version: z.number().int().positive() }),
      input,
    );
    return this.store.run(user, async (db) => {
      const [before] = await rows(
        db,
        sql`SELECT * FROM transactions WHERE user_id=${user} AND id=${transactionId} AND deleted_at IS NULL`,
      );
      if (!before) throw new NotFoundException('Movimentação não encontrada.');
      if (before.kind === 'card_payment')
        throw new BadRequestException(
          'Exclua o pagamento para reabrir a fatura e registre-o novamente.',
        );
      if (before.version !== version)
        throw new ConflictException('A movimentação foi alterada. Atualize a página.');
      const [linked] = await rows(
        db,
        sql`SELECT id FROM occurrences WHERE user_id=${user} AND transaction_id=${transactionId}`,
      );
      if (
        linked &&
        (before.kind !== data.kind || before.category_id !== (data.category_id || null))
      )
        throw new BadRequestException(
          'Uma ocorrência confirmada deve manter o tipo e a categoria.',
        );
      await this.store.validateTransaction(db, user, data);
      const [result] = await rows(
        db,
        sql`UPDATE transactions SET kind=${data.kind},description=${data.description},source_id=${data.source_id || null},destination_id=${data.destination_id || null},amount=${data.amount},received=${data.received || null},category_id=${data.category_id || null},category_kind=${data.category_id ? (data.kind === 'income' ? 'income' : 'expense') : null},occurred_on=${data.occurred_on},reference_month=${data.reference_month ? data.reference_month + '-01' : null},funding_transfer_id=${data.funding_transfer_id || null},version=version+1,updated_at=now() WHERE user_id=${user} AND id=${transactionId} RETURNING *`,
      );
      await audit(db, user, 'transaction', transactionId, 'update', before, result);
      return result;
    });
  }
  @Delete(':id') remove(
    @UserId() user: string,
    @Param('id') rawId: string,
    @Query('version') rawVersion: string,
  ) {
    const transactionId = parse(id, rawId);
    const version = parse(z.coerce.number().int().positive(), rawVersion);
    return this.store.run(user, async (db) => {
      const [before] = await rows(
        db,
        sql`SELECT * FROM transactions WHERE user_id=${user} AND id=${transactionId} AND deleted_at IS NULL`,
      );
      if (!before) throw new NotFoundException('Movimentação não encontrada.');
      if (before.version !== version)
        throw new ConflictException('A movimentação foi alterada. Atualize a página.');
      if (before.source_id) await account(db, user, before.source_id);
      if (before.destination_id) await account(db, user, before.destination_id);
      await db.execute(
        sql`UPDATE occurrences SET state='pending',transaction_id=NULL WHERE user_id=${user} AND transaction_id=${transactionId}`,
      );
      await db.execute(
        sql`UPDATE invoices SET payment_id=NULL WHERE user_id=${user} AND payment_id=${transactionId}`,
      );
      await db.execute(
        sql`UPDATE transactions SET deleted_at=now(),updated_at=now(),version=version+1 WHERE user_id=${user} AND id=${transactionId}`,
      );
      await audit(db, user, 'transaction', transactionId, 'delete', before, null);
      return { deleted: true };
    });
  }
}
