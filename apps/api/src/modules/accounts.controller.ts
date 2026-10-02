import { Body, Controller, Get, Inject, Param, Patch, Post } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { UserId } from '../auth/auth';
import { rows } from '../database/database.service';
import {
  accountInput,
  accountPatch,
  categoryInput,
  categoryPatch,
  id,
  parse,
} from '../common/validation';
import { FinanceStore, audit } from './finance.store';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import Decimal from 'decimal.js';

@Controller()
export class AccountsController {
  constructor(@Inject(FinanceStore) private readonly store: FinanceStore) {}
  @Get('me') me(@UserId() user: string) {
    return this.store.read(
      user,
      async (db) =>
        (
          await rows(
            db,
            sql`SELECT id,currency,timezone,expense_rollover_day FROM users WHERE id=${user}`,
          )
        )[0],
    );
  }
  @Patch('me') patchMe(@UserId() user: string, @Body() input: unknown) {
    const data = parse(
      z.object({ expense_rollover_day: z.number().int().min(1).max(31) }).strict(),
      input,
    );
    return this.store.run(
      user,
      async (db) =>
        (
          await rows(
            db,
            sql`UPDATE users SET expense_rollover_day=${data.expense_rollover_day} WHERE id=${user} RETURNING id,currency,timezone,expense_rollover_day`,
          )
        )[0],
    );
  }
  @Get('accounts') list(@UserId() user: string) {
    return this.store.read(user, (db) => this.store.balances(db, user));
  }
  @Post('accounts') create(@UserId() user: string, @Body() input: unknown) {
    const data = parse(accountInput, input);
    return this.store.run(user, async (db) => {
      const [result] = await rows(
        db,
        sql`INSERT INTO accounts(user_id,name,nature,purpose,opening_balance,opening_date) VALUES(${user},${data.name},${data.nature},${data.purpose},${data.opening_balance},${data.opening_date}) RETURNING *`,
      );
      await audit(db, user, 'account', result.id, 'create', null, result);
      return result;
    });
  }
  @Patch('accounts/:id') patch(
    @UserId() user: string,
    @Param('id') rawId: string,
    @Body() input: unknown,
  ) {
    const accountId = parse(id, rawId);
    const data = parse(accountPatch, input);
    return this.store.run(user, async (db) => {
      const balances = await this.store.balances(db, user);
      const before = balances.find((a) => a.id === accountId);
      if (!before) throw new NotFoundException('Conta não encontrada.');
      const revisedBalance = new Decimal(before.balance).plus(
        new Decimal(data.opening_balance ?? before.opening_balance).minus(before.opening_balance),
      );
      if ((data.archived ?? before.archived) && !revisedBalance.isZero())
        throw new BadRequestException('Transfira o saldo antes de arquivar a conta.');
      if (data.opening_date) {
        const [earlier] = await rows(
          db,
          sql`SELECT transaction_id FROM account_effects WHERE user_id=${user} AND account_id=${accountId} AND occurred_on<${data.opening_date}::date LIMIT 1`,
        );
        if (earlier)
          throw new BadRequestException(
            'Existem movimentações anteriores à nova data de abertura.',
          );
      }
      const [result] = await rows(
        db,
        sql`UPDATE accounts SET name=${data.name ?? before.name},archived=${data.archived ?? before.archived},opening_balance=${data.opening_balance ?? before.opening_balance},opening_date=${data.opening_date ?? before.opening_date} WHERE user_id=${user} AND id=${accountId} RETURNING *`,
      );
      await audit(db, user, 'account', accountId, 'update', before, result);
      return result;
    });
  }
  @Get('categories') categories(@UserId() user: string) {
    return this.store.run(user, async (db) => {
      await this.store.seedCategories(db, user);
      return rows(db, sql`SELECT * FROM categories WHERE user_id=${user} ORDER BY kind,name`);
    });
  }
  @Post('categories') createCategory(@UserId() user: string, @Body() input: unknown) {
    const data = parse(categoryInput, input);
    return this.store.run(user, async (db) => {
      const [result] = await rows(
        db,
        sql`INSERT INTO categories(user_id,name,kind) VALUES(${user},${data.name},${data.kind}) RETURNING *`,
      );
      await audit(db, user, 'category', result.id, 'create', null, result);
      return result;
    });
  }
  @Patch('categories/:id') patchCategory(
    @UserId() user: string,
    @Param('id') rawId: string,
    @Body() input: unknown,
  ) {
    const categoryId = parse(id, rawId);
    const data = parse(categoryPatch, input);
    return this.store.run(user, async (db) => {
      const [before] = await rows(
        db,
        sql`SELECT * FROM categories WHERE user_id=${user} AND id=${categoryId}`,
      );
      if (!before) throw new NotFoundException('Categoria não encontrada.');
      const [result] = await rows(
        db,
        sql`UPDATE categories SET name=${data.name ?? before.name},archived=${data.archived ?? before.archived} WHERE user_id=${user} AND id=${categoryId} RETURNING *`,
      );
      await audit(db, user, 'category', categoryId, 'update', before, result);
      return result;
    });
  }
}
