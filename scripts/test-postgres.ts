import 'reflect-metadata';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'node:net';
import { execFile, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import { Pool, types } from 'pg';
import { sql } from 'drizzle-orm';
import type { Db } from '../apps/api/src/database/database.service.ts';

const require = createRequire(resolve('scripts', 'test-postgres.ts'));
const { DatabaseService, rows } = require('../apps/api/dist/database/database.service.js');
const { FinanceStore } = require('../apps/api/dist/modules/finance.store.js');
const { AccountsController } = require('../apps/api/dist/modules/accounts.controller.js');
const { TransactionsController } = require('../apps/api/dist/modules/transactions.controller.js');
const { PlanningController } = require('../apps/api/dist/modules/planning.controller.js');
const { PlanningService } = require('../apps/api/dist/modules/planning.service.js');
const { CardsController } = require('../apps/api/dist/modules/cards.controller.js');

const exec = promisify(execFile);
types.setTypeParser(1082, (value) => value);

async function main() {
  const platform = process.platform === 'win32' ? 'windows' : process.platform;
  const binaries = await import(`@embedded-postgres/${platform}-${process.arch}`);
  const root = resolve('.local', 'postgres-tests');
  const directory = resolve(root, randomUUID());
  assert.ok(directory.startsWith(root + (process.platform === 'win32' ? '\\' : '/')));
  await mkdir(directory, { recursive: true });
  const password = randomBytes(24).toString('hex');
  const passwordFile = resolve(directory, 'init-password');
  await writeFile(passwordFile, password, { mode: 0o600 });
  const server = createServer();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
  const data = resolve(directory, 'data');
  try {
    await exec(
      binaries.initdb,
      [
        '-D',
        data,
        '-U',
        'postgres',
        '--auth=scram-sha-256',
        `--pwfile=${passwordFile}`,
        '--locale=C',
        '--encoding=UTF8',
      ],
      { windowsHide: true },
    );
  } finally {
    await unlink(passwordFile);
  }
  const child = spawn(binaries.postgres, ['-D', data, '-h', '127.0.0.1', '-p', String(port)], {
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let started = false;
  let startupLog = '';
  let database: any;
  let pool: Pool | undefined;
  try {
    await new Promise<void>((r, j) => {
      const timeout = setTimeout(() => j(new Error('PostgreSQL startup timed out.')), 15000);
      child.stderr.on('data', (chunk) => {
        startupLog += String(chunk);
        if (startupLog.includes('ready to accept connections')) {
          clearTimeout(timeout);
          started = true;
          r();
        }
      });
      child.on('error', (error) => {
        clearTimeout(timeout);
        j(error);
      });
      child.on('exit', (code) => {
        if (!started) {
          clearTimeout(timeout);
          j(new Error(`PostgreSQL exited before startup (${code}).`));
        }
      });
    });
    const adminUrl = `postgresql://postgres:${password}@127.0.0.1:${port}/postgres`;
    process.env.DATABASE_ADMIN_URL = adminUrl;
    process.env.APP_DB_PASSWORD = password;
    process.env.DATABASE_URL = `postgresql://finance_app:${password}@127.0.0.1:${port}/postgres`;
    const run = async (file: string) => {
      const { stdout } = await exec(process.execPath, [file], {
        windowsHide: true,
        env: process.env,
      });
      process.stdout.write(stdout);
    };
    await run('apps/api/dist/database/migrate.js');
    await run('apps/api/dist/database/migrate.js');
    await run('apps/api/dist/database/provision.js');
    pool = new Pool({ connectionString: adminUrl });
    const version = await pool.query('SHOW server_version');
    console.log(`PostgreSQL ${version.rows[0].server_version}: migrations and runtime role ready.`);
    database = new DatabaseService();
    await database.onModuleInit();
    const store = new FinanceStore(database),
      accounts = new AccountsController(store),
      transactions = new TransactionsController(store),
      planning = new PlanningController(store, new PlanningService()),
      cards = new CardsController(store);
    const user = await database.identity('test', randomUUID()),
      other = await database.identity('test', randomUUID());
    const account = await accounts.create(user, {
      name: 'Test account',
      nature: 'bank',
      purpose: 'available',
      opening_balance: '500',
      opening_date: '2026-01-01',
    });
    const categories = await accounts.categories(user),
      income = categories.find((c: any) => c.kind === 'income')!.id,
      expense = categories.find((c: any) => c.kind === 'expense')!.id;
    const dataTx = {
      kind: 'income',
      description: 'Concurrent request',
      destination_id: account.id,
      category_id: income,
      amount: '10.50',
      occurred_on: '2026-01-02',
    };
    const key = randomUUID();
    const requests = await Promise.all(
      Array.from({ length: 12 }, () => transactions.create(user, key, dataTx)),
    );
    assert.equal(new Set(requests.map((r) => r.id)).size, 1);
    assert.equal((await accounts.list(user))[0].balance, '510.50');
    await planning.createRecurrence(user, {
      description: 'Recurring',
      kind: 'expense',
      account_id: account.id,
      category_id: expense,
      amount: '20',
      expected_day: 5,
      starts_on: '2026-01-01',
    });
    const [occurrence] = await planning.occurrences(user, '2026-01');
    const confirmations = await Promise.all(
      Array.from({ length: 10 }, () =>
        planning.confirm(user, occurrence.id, randomUUID(), {
          account_id: account.id,
          amount: '20',
          occurred_on: '2026-01-05',
        }),
      ),
    );
    assert.equal(new Set(confirmations.map((r) => r.id)).size, 1);
    assert.equal((await accounts.list(user))[0].balance, '490.50');
    const card = await cards.create(user, { name: 'Card', closing_day: 20, due_day: 5 });
    await cards.createPurchase(user, randomUUID(), {
      card_id: card.id,
      category_id: expense,
      description: 'Purchase',
      purchased_on: '2026-01-10',
      amount: '100',
      installments: 3,
    });
    const invoice = (await cards.invoices(user)).find((i: any) => i.month === '2026-01-01')!;
    const payments = await Promise.all(
      Array.from({ length: 8 }, () =>
        cards.pay(user, invoice.id, randomUUID(), {
          account_id: account.id,
          occurred_on: '2026-02-05',
          expected_amount: '33.33',
        }),
      ),
    );
    assert.equal(new Set(payments.map((p) => p.id)).size, 1);
    assert.equal((await accounts.list(user))[0].balance, '457.17');
    const edits = await Promise.allSettled([
      transactions.edit(user, requests[0].id, { ...dataTx, amount: '11', version: 1 }),
      transactions.edit(user, requests[0].id, { ...dataTx, amount: '12', version: 1 }),
    ]);
    assert.equal(edits.filter((r) => r.status === 'fulfilled').length, 1);
    const crossTenant = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        database!.tenant(i % 2 ? user : other, (db: Db) =>
          rows(db, sql`SELECT user_id FROM accounts`),
        ),
      ),
    );
    crossTenant.forEach((result: any[], i: number) =>
      assert.ok(i % 2 ? result.length === 1 && result[0].user_id === user : result.length === 0),
    );
    await assert.rejects(
      database.tenant(user, async (db: Db) => {
        await db.execute(
          sql`INSERT INTO accounts(user_id,name,nature,purpose,opening_balance,opening_date) VALUES(${user},'rollback','bank','available',0,'2026-01-01')`,
        );
        throw new Error('Injected failure');
      }),
    );
    assert.equal((await accounts.list(user)).length, 1);
    console.log(
      'PASS: 12 repeated writes, 10 confirmations, 8 invoice payments, stale edit conflict, 20 tenant context switches and rollback.',
    );
    console.log(
      'The temporary PostgreSQL server will stop. Test data stays under .local/postgres-tests, outside source control.',
    );
  } finally {
    await database?.onModuleDestroy();
    await pool?.end();
    if (started)
      await exec(binaries.pg_ctl, ['-D', data, 'stop', '-m', 'fast', '-w'], { windowsHide: true });
    else if (child.exitCode === null) child.kill();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
