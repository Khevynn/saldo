import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import Decimal from 'decimal.js';
import { DatabaseService, Db, rows } from '../database/database.service';
import { money, today } from '../domain/money';
import { TransactionInput } from '../common/validation';

export async function audit(
  db: Db,
  user: string,
  entity: string,
  entityId: string,
  action: string,
  before: unknown,
  after: unknown,
) {
  await db.execute(
    sql`INSERT INTO audit_events(user_id,entity,entity_id,action,before_data,after_data) VALUES(${user},${entity},${entityId},${action},${JSON.stringify(before)}::jsonb,${JSON.stringify(after)}::jsonb)`,
  );
}
export async function account(db: Db, user: string, id: string, occurredOn?: string) {
  const [a] = await rows(db, sql`SELECT * FROM accounts WHERE user_id=${user} AND id=${id}`);
  if (!a) throw new NotFoundException('Conta não encontrada.');
  if (a.archived) throw new BadRequestException('Conta arquivada.');
  if (occurredOn && occurredOn < a.opening_date)
    throw new BadRequestException('Data anterior ao início da conta.');
  return a;
}
export async function category(db: Db, user: string, id: string, kind: string) {
  const [c] = await rows(
    db,
    sql`SELECT * FROM categories WHERE user_id=${user} AND id=${id} AND kind=${kind} AND NOT archived`,
  );
  if (!c) throw new BadRequestException('Categoria indisponível ou incompatível.');
  return c;
}

@Injectable()
export class FinanceStore {
  constructor(@Inject(DatabaseService) readonly database: DatabaseService) {}
  run<T>(user: string, fn: (db: Db) => Promise<T>) {
    return this.database.tenant(user, fn);
  }
  read<T>(user: string, fn: (db: Db) => Promise<T>) {
    const database = this.database as DatabaseService & {
      tenantRead?: <R>(userId: string, action: (db: Db) => Promise<R>) => Promise<R>;
    };
    return database.tenantRead ? database.tenantRead(user, fn) : database.tenant(user, fn);
  }
  async once<T>(
    db: Db,
    user: string,
    key: string,
    input: unknown,
    action: () => Promise<T>,
  ): Promise<T> {
    const days = Number(process.env.IDEMPOTENCY_RETENTION_DAYS || 90);
    const retention = `${Number.isInteger(days) && days > 0 ? days : 90} days`;
    await db.execute(
      sql`DELETE FROM idempotency_keys WHERE user_id=${user} AND created_at<now()-${retention}::interval`,
    );
    const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const [cached] = await rows(
      db,
      sql`SELECT * FROM idempotency_keys WHERE user_id=${user} AND key=${key}`,
    );
    if (cached) {
      if (cached.request_hash !== hash)
        throw new ConflictException('A chave de operação já foi usada com outros dados.');
      return cached.response;
    }
    const response = await action();
    await db.execute(
      sql`INSERT INTO idempotency_keys(user_id,key,request_hash,response) VALUES(${user},${key},${hash},${JSON.stringify(response)}::jsonb)`,
    );
    return response;
  }
  async validateTransaction(db: Db, user: string, data: TransactionInput) {
    if (data.kind === 'income') {
      if (!data.destination_id || data.source_id || data.received || !data.category_id)
        throw new BadRequestException('Receita exige conta de destino e categoria.');
    } else if (data.kind === 'expense') {
      if (!data.source_id || data.destination_id || data.received || !data.category_id)
        throw new BadRequestException('Despesa exige conta de origem e categoria.');
    } else {
      if (
        !data.source_id ||
        !data.destination_id ||
        data.source_id === data.destination_id ||
        !data.received
      )
        throw new BadRequestException('Informe origem e destino distintos e o valor recebido.');
      const loss = new Decimal(data.amount).minus(data.received);
      if (loss.lt(0)) throw new BadRequestException('O recebido não pode exceder o enviado.');
      if (loss.gt(0) && !data.category_id)
        throw new BadRequestException('Informe a categoria da perda.');
      if (loss.isZero() && data.category_id)
        throw new BadRequestException('Transferência sem perda não possui categoria.');
    }
    if (data.source_id) await account(db, user, data.source_id, data.occurred_on);
    if (data.destination_id) await account(db, user, data.destination_id, data.occurred_on);
    if (data.category_id)
      await category(db, user, data.category_id, data.kind === 'income' ? 'income' : 'expense');
  }
  async insertTransaction(db: Db, user: string, data: TransactionInput) {
    await this.validateTransaction(db, user, data);
    const [result] = await rows(
      db,
      sql`INSERT INTO transactions(user_id,kind,description,source_id,destination_id,amount,received,category_id,category_kind,occurred_on)
      VALUES(${user},${data.kind},${data.description},${data.source_id || null},${data.destination_id || null},${data.amount},${data.received || null},${data.category_id || null},${data.category_id ? (data.kind === 'income' ? 'income' : 'expense') : null},${data.occurred_on}) RETURNING *`,
    );
    await audit(db, user, 'transaction', result.id, 'create', null, result);
    return result;
  }
  async balances(db: Db, user: string, asOf = today()) {
    return rows(
      db,
      sql`SELECT a.*, (a.opening_balance+coalesce(sum(e.amount),0))::text AS balance
      FROM accounts a LEFT JOIN account_effects e ON e.user_id=a.user_id AND e.account_id=a.id AND e.occurred_on<=${asOf}::date
      WHERE a.user_id=${user} AND a.opening_date<=${asOf}::date GROUP BY a.id ORDER BY a.created_at,a.id`,
    );
  }
  async seedCategories(db: Db, user: string) {
    const defaults: [string, string][] = [
      ['Salário', 'income'],
      ['Benefícios', 'income'],
      ['Outros rendimentos', 'income'],
      ...[
        'Moradia',
        'Alimentação',
        'Transporte',
        'Saúde',
        'Lazer',
        'Assinaturas',
        'Compras',
        'Educação',
        'Viagens',
        'Dízimo e doações',
        'Taxas e perdas',
        'Outros',
      ].map((n) => [n, 'expense'] as [string, string]),
    ];
    // This flag distinguishes initialization from the existence of custom categories.
    // It also ensures that renamed defaults are not recreated later.
    const [profile] = await rows(
      db,
      sql`SELECT categories_initialized FROM users WHERE id=${user} FOR UPDATE`,
    );
    if (profile?.categories_initialized) return;
    for (const [name, kind] of defaults)
      await db.execute(
        sql`INSERT INTO categories(user_id,name,kind) VALUES(${user},${name},${kind}) ON CONFLICT DO NOTHING`,
      );
    await db.execute(sql`UPDATE users SET categories_initialized=true WHERE id=${user}`);
  }
}
