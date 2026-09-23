import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { PgDialect } from 'drizzle-orm/pg-core';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { AuthGuard, IDENTITY_PROVIDER } from './auth';
import { DatabaseService, Db } from '../database/database.service';
import { migrationFiles } from '../database/migrations';
import { FinanceStore } from '../modules/finance.store';
import { AccountsController } from '../modules/accounts.controller';
import { TransactionsController } from '../modules/transactions.controller';
import { ApiErrorFilter } from '../common/errors';

describe('HTTP contract and authentication boundary', () => {
  const pg = new PGlite({ parsers: { 1082: (value) => value } }),
    dialect = new PgDialect();
  const userA = randomUUID(),
    userB = randomUUID();
  let app: INestApplication, accountId: string, categoryId: string;
  let queue: Promise<unknown> = Promise.resolve();
  const db = {
    execute: async (query: any) => {
      const q = dialect.sqlToQuery(query);
      return pg.query(q.sql, q.params);
    },
  } as Db;
  const database = {
    identity: async (_provider: string, subject: string) => (subject === 'alice' ? userA : userB),
    tenant: <T>(user: string, fn: (db: Db) => Promise<T>) => {
      // PGlite has one connection. Queue whole transactions instead of interleaving BEGINs.
      const task = queue.then(async () => {
        await pg.exec('BEGIN; SET LOCAL ROLE finance_app');
        try {
          await pg.query("SELECT set_config('app.user_id',$1,true)", [user]);
          const result = await fn(db);
          await pg.exec('COMMIT');
          return result;
        } catch (error) {
          await pg.exec('ROLLBACK');
          throw error;
        }
      });
      queue = task.catch(() => {});
      return task;
    },
  };
  beforeAll(async () => {
    for (const migration of await migrationFiles()) await pg.exec(migration.text);
    await pg.query('INSERT INTO users(id) VALUES($1),($2)', [userA, userB]);
    const module = await Test.createTestingModule({
      controllers: [AccountsController, TransactionsController],
      providers: [
        { provide: DatabaseService, useValue: database },
        FinanceStore,
        {
          provide: IDENTITY_PROVIDER,
          useValue: {
            authenticate: async (token: string) => {
              if (!['alice', 'bob'].includes(token))
                throw new UnauthorizedException('Sessão inválida.');
              return { provider: 'test-only', subject: token };
            },
          },
        },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new ApiErrorFilter());
    await app.init();
  });
  afterAll(async () => {
    await app.close();
    await pg.close();
  });
  it('rejects unauthenticated and forged sessions', async () => {
    await request(app.getHttpServer()).get('/api/accounts').expect(401);
    await request(app.getHttpServer())
      .get('/api/accounts')
      .set('Authorization', 'Bearer invalid')
      .expect(401);
  });
  it('creates an isolated account and rejects client-supplied identity', async () => {
    const data = {
      name: 'Minha conta',
      nature: 'bank',
      purpose: 'available',
      opening_balance: '10.00',
      opening_date: '2026-01-01',
    };
    await request(app.getHttpServer())
      .post('/api/accounts')
      .set('Authorization', 'Bearer alice')
      .send({ ...data, user_id: userB })
      .expect(400);
    const response = await request(app.getHttpServer())
      .post('/api/accounts')
      .set('Authorization', 'Bearer alice')
      .send(data)
      .expect(201);
    accountId = response.body.id;
    expect(response.body.user_id).toBe(userA);
    const bob = await request(app.getHttpServer())
      .get('/api/accounts')
      .set('Authorization', 'Bearer bob')
      .expect(200);
    expect(bob.body).toEqual([]);
    await request(app.getHttpServer())
      .patch(`/api/accounts/${accountId}`)
      .set('Authorization', 'Bearer bob')
      .send({ name: 'Invadida' })
      .expect(404);
    const categories = await request(app.getHttpServer())
      .get('/api/categories')
      .set('Authorization', 'Bearer alice')
      .expect(200);
    categoryId = categories.body.find((c: any) => c.kind === 'income').id;
  });
  it('rejects invalid dates, numeric money and missing idempotency', async () => {
    const data = {
      kind: 'income',
      description: 'Receita',
      destination_id: accountId,
      category_id: categoryId,
      amount: '5.50',
      occurred_on: '2026-01-02',
    };
    await request(app.getHttpServer())
      .post('/api/transactions')
      .set('Authorization', 'Bearer alice')
      .send(data)
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/transactions')
      .set('Authorization', 'Bearer alice')
      .set('Idempotency-Key', randomUUID())
      .send({ ...data, amount: 5.5 })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/transactions')
      .set('Authorization', 'Bearer alice')
      .set('Idempotency-Key', randomUUID())
      .send({ ...data, occurred_on: '2026-02-30' })
      .expect(400);
  });
  it('repeated HTTP submissions do not duplicate financial records', async () => {
    const data = {
        kind: 'income',
        description: 'Receita',
        destination_id: accountId,
        category_id: categoryId,
        amount: '5.50',
        occurred_on: '2026-01-02',
      },
      key = randomUUID();
    const responses = await Promise.all(
      Array.from({ length: 3 }, () =>
        request(app.getHttpServer())
          .post('/api/transactions')
          .set('Authorization', 'Bearer alice')
          .set('Idempotency-Key', key)
          .send(data)
          .expect(201),
      ),
    );
    expect(new Set(responses.map((r) => r.body.id)).size).toBe(1);
    const accounts = await request(app.getHttpServer())
      .get('/api/accounts')
      .set('Authorization', 'Bearer alice')
      .expect(200);
    expect(accounts.body[0].balance).toBe('15.50');
    const list = await request(app.getHttpServer())
      .get('/api/transactions?month=2026-01')
      .set('Authorization', 'Bearer alice')
      .expect(200);
    expect(list.body).toHaveLength(1);
  });
});
