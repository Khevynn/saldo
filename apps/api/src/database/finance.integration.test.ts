import 'reflect-metadata';
import { PGlite } from '@electric-sql/pglite';
import { PgDialect } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { migrationFiles } from './migrations';
import { DatabaseService, Db, rows } from './database.service';
import { FinanceStore } from '../modules/finance.store';
import { AccountsController } from '../modules/accounts.controller';
import { TransactionsController } from '../modules/transactions.controller';
import { PlanningController } from '../modules/planning.controller';
import { PlanningService } from '../modules/planning.service';
import { CardsController } from '../modules/cards.controller';
import { ReportingController } from '../modules/reporting.controller';
import { today, shiftMonth } from '../domain/money';

describe('financial integration with PostgreSQL engine and runtime RLS role', () => {
  const pg = new PGlite({ parsers: { 1082: (value) => value } });
  const dialect = new PgDialect();
  const user = randomUUID(),
    other = randomUUID();
  let source: string, destination: string, income: string, expense: string, foreignAccount: string;
  const db = {
    execute: async (query: any) => {
      const q = dialect.sqlToQuery(query);
      return pg.query(q.sql, q.params);
    },
  } as Db;
  const database = {
    tenant: async <T>(uid: string, fn: (db: Db) => Promise<T>) => {
      await pg.exec('BEGIN; SET LOCAL ROLE finance_app;');
      try {
        await pg.query("SELECT set_config('app.user_id',$1,true)", [uid]);
        const result = await fn(db);
        await pg.exec('COMMIT');
        return result;
      } catch (error) {
        await pg.exec('ROLLBACK');
        throw error;
      }
    },
  } as DatabaseService;
  const store = new FinanceStore(database),
    accounts = new AccountsController(store),
    transactions = new TransactionsController(store),
    planning = new PlanningController(store, new PlanningService()),
    cards = new CardsController(store),
    reports = new ReportingController(store, new PlanningService());
  beforeAll(async () => {
    for (const migration of await migrationFiles()) await pg.exec(migration.text);
    await pg.query('INSERT INTO users(id) VALUES($1),($2)', [user, other]);
    source = (
      await accounts.create(user, {
        name: 'Principal',
        nature: 'bank',
        purpose: 'available',
        opening_balance: '1000',
        opening_date: '2026-01-01',
      })
    ).id;
    destination = (
      await accounts.create(user, {
        name: 'Cofrinho',
        nature: 'pot',
        purpose: 'reserved',
        opening_balance: '0',
        opening_date: '2026-01-01',
      })
    ).id;
    foreignAccount = (
      await accounts.create(other, {
        name: 'Privada',
        nature: 'bank',
        purpose: 'available',
        opening_balance: '500',
        opening_date: '2026-01-01',
      })
    ).id;
    const categories = await accounts.categories(user);
    income = categories.find((c) => c.kind === 'income').id;
    expense = categories.find((c) => c.kind === 'expense').id;
  });
  afterAll(() => pg.close());
  const balance = async (accountId: string) =>
    (await accounts.list(user)).find((a) => a.id === accountId)!.balance;
  it('income, expense, transfer and loss affect balances exactly once', async () => {
    const base = { description: 'Registro', occurred_on: '2026-01-10' };
    await transactions.create(user, randomUUID(), {
      ...base,
      kind: 'income',
      destination_id: source,
      category_id: income,
      amount: '100',
    });
    expect(await balance(source)).toBe('1100.00');
    await transactions.create(user, randomUUID(), {
      ...base,
      kind: 'expense',
      source_id: source,
      category_id: expense,
      amount: '30',
    });
    expect(await balance(source)).toBe('1070.00');
    await transactions.create(user, randomUUID(), {
      ...base,
      kind: 'transfer',
      source_id: source,
      destination_id: destination,
      amount: '100',
      received: '100',
    });
    expect(await balance(source)).toBe('970.00');
    expect(await balance(destination)).toBe('100.00');
    await transactions.create(user, randomUUID(), {
      ...base,
      kind: 'transfer',
      source_id: source,
      destination_id: destination,
      amount: '100',
      received: '90',
      category_id: expense,
    });
    expect(await balance(source)).toBe('870.00');
    expect(await balance(destination)).toBe('190.00');
    const report = await reports.overview(user, '2026-01');
    expect(report.expense).toBe('40.00');
    expect(report.total).toBe('1060.00');
  });
  it('enforces tenant isolation even with a deliberately unfiltered query', async () => {
    expect((await accounts.list(other)).map((a) => a.id)).toEqual([foreignAccount]);
    const own = await database.tenant(user, (db) => rows(db, sql`SELECT * FROM accounts`));
    expect(own).toHaveLength(2);
    await expect(
      transactions.create(user, randomUUID(), {
        kind: 'income',
        description: 'Inválido',
        destination_id: foreignAccount,
        category_id: income,
        amount: '1',
        occurred_on: '2026-01-01',
      }),
    ).rejects.toThrow();
    await expect(
      database.tenant(user, (db) =>
        db.execute(
          sql`INSERT INTO accounts(user_id,name,nature,purpose,opening_balance,opening_date) VALUES(${other},'Ataque','bank','available',0,'2026-01-01')`,
        ),
      ),
    ).rejects.toThrow();
    await expect(
      database.tenant(user, (db) =>
        db.execute(
          sql`INSERT INTO transactions(user_id,kind,description,destination_id,category_id,category_kind,amount,occurred_on) VALUES(${user},'income','Ataque',${foreignAccount},${income},'income',1,'2026-01-01')`,
        ),
      ),
    ).rejects.toThrow();
  });
  it('idempotency replays the result and rejects reuse with another payload', async () => {
    const key = randomUUID(),
      data = {
        kind: 'income',
        description: 'Único',
        destination_id: source,
        category_id: income,
        amount: '5',
        occurred_on: '2026-01-11',
      };
    const one = await transactions.create(user, key, data);
    const two = await transactions.create(user, key, data);
    expect(one.id).toBe(two.id);
    await expect(transactions.create(user, key, { ...data, amount: '6' })).rejects.toThrow();
  });
  it('recurrence stays planned until confirmation; deletion reopens it', async () => {
    const before = await balance(source);
    await planning.createRecurrence(user, {
      description: 'Aluguel',
      kind: 'expense',
      account_id: source,
      category_id: expense,
      amount: '75',
      expected_day: 31,
      starts_on: '2026-01-01',
    });
    const occurrences = await planning.occurrences(user, '2026-02');
    expect(occurrences[0].due_on).toBe('2026-02-28');
    expect(await balance(source)).toBe(before);
    const budget = await planning.budget(user, '2026-02');
    expect(budget.find((b) => b.category_id === expense).expected).toBe('75.00');
    expect(budget.find((b) => b.category_id === expense).spent).toBe('0');
    const payment = await planning.confirm(user, occurrences[0].id, randomUUID(), {
      account_id: source,
      amount: '70',
      occurred_on: '2026-02-28',
    });
    const duplicate = await planning.confirm(user, occurrences[0].id, randomUUID(), {
      account_id: source,
      amount: '70',
      occurred_on: '2026-02-28',
    });
    expect(duplicate.id).toBe(payment.id);
    const confirmed = await planning.budget(user, '2026-02');
    expect(confirmed.find((b) => b.category_id === expense).expected).toBe('0');
    expect(confirmed.find((b) => b.category_id === expense).spent).toBe('70.00');
    await transactions.remove(user, payment.id, '1');
    expect(await balance(source)).toBe(before);
    expect((await planning.occurrences(user, '2026-02'))[0].state).toBe('pending');
  });
  it('materializes recurrences only on the configured month interval', async () => {
    const intervalRule = await planning.createRecurrence(user, {
      description: 'Seguro trimestral',
      kind: 'expense',
      account_id: source,
      category_id: expense,
      amount: '90',
      expected_day: 10,
      interval_months: 3,
      starts_on: '2026-01-01',
    });
    expect(
      (await planning.occurrences(user, '2026-01')).some(
        (o) => o.description === 'Seguro trimestral',
      ),
    ).toBe(true);
    expect(
      (await planning.occurrences(user, '2026-02')).some(
        (o) => o.description === 'Seguro trimestral',
      ),
    ).toBe(false);
    expect(
      (await planning.occurrences(user, '2026-03')).some(
        (o) => o.description === 'Seguro trimestral',
      ),
    ).toBe(false);
    expect(
      (await planning.occurrences(user, '2026-04')).some(
        (o) => o.description === 'Seguro trimestral',
      ),
    ).toBe(true);
    await planning.toggle(user, intervalRule.id, { active: false });
  });
  it('keeps future plans isolated from real balances', async () => {
    const before = await balance(source);
    const plan = await planning.createFuturePlan(user, {
      name: 'Mudança para Lisboa',
      theme: 'move',
      target_date: '2027-06-01',
      estimated_cost: '3000',
      reserved_amount: '600',
      notes: 'Caução e transporte',
    });
    expect(await balance(source)).toBe(before);
    expect((await planning.futurePlans(user))[0]).toMatchObject({
      id: plan.id,
      remaining: '2400.00',
      status: 'active',
    });
    await planning.createFuturePlanItem(user, plan.id, {
      kind: 'income',
      name: 'Salário líquido',
      cadence: 'recurring',
      interval_months: 1,
      amount: '1800',
      due_on: null,
      notes: null,
    });
    await planning.createFuturePlanItem(user, plan.id, {
      kind: 'expense',
      name: 'Custo de vida',
      cadence: 'recurring',
      interval_months: 1,
      amount: '1200',
      due_on: null,
      notes: null,
    });
    const projected = (await planning.futurePlans(user))[0];
    expect(projected).toMatchObject({
      monthly_income: '1800.00',
      monthly_expenses: '1200.00',
      monthly_capacity: '600.00',
      upfront_gap: '2400.00',
      viability: 'not_viable',
    });
    expect(projected.items).toHaveLength(3);
    const livingCost = projected.items.find((item: any) => item.name === 'Custo de vida');
    await planning.editFuturePlanItem(user, plan.id, livingCost.id, { amount: '1900' });
    expect((await planning.futurePlans(user))[0]).toMatchObject({
      monthly_capacity: '-100.00',
      viability: 'not_viable',
    });
    await planning.deleteFuturePlanItem(user, plan.id, livingCost.id);
    expect((await planning.futurePlans(user))[0].items).toHaveLength(2);
    const benefitPocket = await planning.createFuturePlanPocket(user, plan.id, {
      name: 'Alimentação',
      kind: 'benefit',
      opening_balance: '100',
    });
    expect((await planning.futurePlans(user))[0].pockets).toHaveLength(2);
    await planning.editFuturePlanPocket(user, plan.id, benefitPocket.id, {
      opening_balance: '150',
    });
    expect(
      (await planning.futurePlans(user))[0].pockets.find(
        (pocket: any) => pocket.id === benefitPocket.id,
      ).opening_balance,
    ).toBe('150.00');
    await planning.deleteFuturePlanPocket(user, plan.id, benefitPocket.id);
    expect((await planning.futurePlans(user))[0].pockets).toHaveLength(1);
    await planning.editFuturePlan(user, plan.id, { status: 'completed' });
    expect((await planning.futurePlans(user))[0].status).toBe('completed');
    expect(await balance(source)).toBe(before);
    await planning.deleteFuturePlan(user, plan.id);
    expect((await planning.futurePlans(user)).some((item) => item.id === plan.id)).toBe(false);
    expect(await balance(source)).toBe(before);
  });
  it('goals derive from account balance; edits and deletions recalculate history', async () => {
    await planning.createGoal(user, {
      name: 'Reserva',
      account_id: destination,
      target: '1000',
      monthly_contribution: '100',
    });
    expect((await planning.goals(user))[0].balance).toBe(await balance(destination));
    const data = {
      kind: 'transfer',
      description: 'Aporte',
      source_id: source,
      destination_id: destination,
      amount: '10',
      received: '10',
      occurred_on: '2026-03-01',
    };
    const t = await transactions.create(user, randomUUID(), data);
    await transactions.edit(user, t.id, { ...data, amount: '20', received: '20', version: 1 });
    expect((await planning.goals(user))[0].balance).toBe('210.00');
    await expect(transactions.edit(user, t.id, { ...data, version: 1 })).rejects.toThrow();
    await transactions.remove(user, t.id, '2');
    expect((await planning.goals(user))[0].balance).toBe('190.00');
  });
  it('card purchases create debt only, payments allocate expenses without double counting', async () => {
    const card = await cards.create(user, { name: 'Crédito', closing_day: 20, due_day: 5 });
    const before = await balance(source);
    const cardPurchase = await cards.createPurchase(user, randomUUID(), {
      card_id: card.id,
      category_id: expense,
      description: 'Compra parcelada',
      purchased_on: '2026-03-10',
      amount: '100',
      installments: 3,
    });
    expect(await balance(source)).toBe(before);
    const invoices = await cards.invoices(user);
    expect(invoices).toHaveLength(3);
    const first = invoices.find((i) => i.month === '2026-03-01')!;
    const payment = await cards.pay(user, first.id, randomUUID(), {
      account_id: source,
      occurred_on: '2026-04-05',
      expected_amount: '33.33',
    });
    expect(payment.amount).toBe('33.33');
    const report = await reports.overview(user, '2026-04');
    expect(report.expense).toBe('33.33');
    expect(report.debt).toBe('66.67');
    const budget = await planning.budget(user, '2026-04');
    expect(budget.find((b) => b.category_id === expense).committed).toBe('0');
    await expect(
      cards.createPurchase(user, randomUUID(), {
        card_id: card.id,
        category_id: expense,
        description: 'Retroativa',
        purchased_on: '2026-03-11',
        amount: '10',
        installments: 1,
      }),
    ).rejects.toThrow();
    expect(await cards.purchases(user)).toHaveLength(1);
    const paidPurchase = await cards.purchase(user, cardPurchase.id);
    await expect(
      cards.editPurchase(user, cardPurchase.id, {
        card_id: card.id,
        category_id: expense,
        description: cardPurchase.description,
        purchased_on: cardPurchase.purchased_on,
        amount: cardPurchase.amount,
        installments: cardPurchase.installments,
        paid_installments: 0,
        schedule: paidPurchase.schedule.map((item) => ({
          number: item.number,
          amount: item.amount,
          due_on: item.due_on,
        })),
      }),
    ).rejects.toThrow('parcelas quitadas');
    await transactions.remove(user, payment.id, '1');
    expect(await balance(source)).toBe(before);
    expect((await reports.overview(user, '2026-04')).debt).toBe('100.00');
  });
  it('imports previously paid card installments without changing the current balance', async () => {
    const card = await cards.create(user, {
      name: 'Cartão importado',
      closing_day: 20,
      due_day: 5,
    });
    const before = await balance(source);
    await cards.createPurchase(user, randomUUID(), {
      card_id: card.id,
      category_id: expense,
      description: 'Compra antiga',
      purchased_on: '2026-01-10',
      amount: '90',
      installments: 3,
      schedule: [
        { number: 1, amount: '30', due_on: '2026-07-05', paid: true },
        { number: 2, amount: '30', due_on: '2026-08-05', paid: true },
        { number: 3, amount: '30', due_on: '2026-09-05', paid: false },
      ],
    });
    expect(await balance(source)).toBe(before);
    const invoices = (await cards.invoices(user)).filter((invoice) => invoice.card_id === card.id);
    expect(invoices.map((invoice) => invoice.due_on)).toEqual([
      '2026-09-05',
      '2026-08-05',
      '2026-07-05',
    ]);
    expect(invoices.map((invoice) => invoice.amount)).toEqual(['30.00', '0', '0']);
    expect(invoices.map((invoice) => invoice.historical_amount)).toEqual(['0', '30.00', '30.00']);
    const purchase = (await cards.purchases(user)).find(
      (item) => item.description === 'Compra antiga',
    )!;
    expect(purchase.remaining).toBe('30.00');
    const detail = await cards.purchase(user, purchase.id);
    await cards.editPurchase(user, purchase.id, {
      card_id: card.id,
      category_id: expense,
      description: 'Compra antiga corrigida',
      purchased_on: '2026-01-10',
      amount: '90',
      installments: 3,
      schedule: detail.schedule.map((item) => ({
        number: item.number,
        amount: item.amount,
        due_on: item.due_on,
        paid: item.settled_before_tracking,
      })),
    });
    expect((await cards.purchase(user, purchase.id)).description).toBe('Compra antiga corrigida');
    await cards.deletePurchase(user, purchase.id);
    expect(await balance(source)).toBe(before);
  });
  it('supports a fixed installment value and edits only open invoices and installments', async () => {
    const card = await cards.create(user, {
      name: 'Cartão com juros',
      closing_day: 20,
      due_day: 5,
    });
    const purchase = await cards.createPurchase(user, randomUUID(), {
      card_id: card.id,
      category_id: expense,
      description: 'Compra financiada',
      purchased_on: '2026-09-01',
      amount: '338',
      installments: 3,
      installment_amount: '113',
      first_invoice_on: '2027-01-05',
      paid_installments: 0,
    });
    const savedPurchase = (await cards.purchases(user)).find((item) => item.id === purchase.id)!;
    expect(savedPurchase.amount).toBe('338.00');
    expect(savedPurchase.financed_total).toBe('339.00');
    const invoice = (await cards.invoices(user)).find(
      (item) => item.card_id === card.id && item.due_on === '2027-01-05',
    )!;
    expect(invoice.amount).toBe('113.00');
    const detail = await cards.purchase(user, purchase.id);
    await cards.editPurchase(user, purchase.id, {
      card_id: card.id,
      category_id: expense,
      description: 'Compra financiada corrigida',
      purchased_on: '2026-09-01',
      amount: '338',
      installments: 3,
      paid_installments: 0,
      schedule: detail.schedule.map((item, index) => ({
        number: item.number,
        amount: index === 0 ? '114' : item.amount,
        due_on: index === 0 ? '2027-01-06' : item.due_on,
      })),
    });
    const edited = await cards.purchase(user, purchase.id);
    expect(edited.description).toBe('Compra financiada corrigida');
    expect(edited.schedule[0].amount).toBe('114.00');
    expect(edited.schedule[0].due_on).toBe('2027-01-06');
    await cards.deletePurchase(user, purchase.id);
  });
  it('does not allow editing audit history or a NULL category type bypass', async () => {
    await expect(
      database.tenant(user, (db) =>
        db.execute(sql`UPDATE audit_events SET action='tampered' WHERE user_id=${user}`),
      ),
    ).rejects.toThrow();
    await expect(
      database.tenant(user, (db) =>
        db.execute(
          sql`INSERT INTO transactions(user_id,kind,description,destination_id,category_id,amount,occurred_on) VALUES(${user},'income','Inválido',${source},${income},1,'2026-01-01')`,
        ),
      ),
    ).rejects.toThrow();
  });
  it('aggregates the year without counting internal transfers as income or expense', async () => {
    const annual = await reports.annual(user, '2026');
    expect(annual.income).toBe('105.00');
    expect(annual.expense).toBe('40.00');
    expect(annual.surplus).toBe('65.00');
    expect(annual.debt).toBe('100.00');
    expect(annual.period).toBe('year');
  });
  it('keeps a recurring budget with audited monthly and future changes', async () => {
    await planning.saveBudget(user, '2026-01', {
      category_id: expense,
      amount: '200',
      scope: 'future',
    });
    expect(
      (await planning.budget(user, '2026-02')).find((b) => b.category_id === expense),
    ).toMatchObject({ budget: '200.00', budget_scope: 'future' });

    await planning.saveBudget(user, '2026-02', {
      category_id: expense,
      amount: '150',
      scope: 'month',
    });
    expect(
      (await planning.budget(user, '2026-02')).find((b) => b.category_id === expense),
    ).toMatchObject({ budget: '150.00', budget_scope: 'month' });
    expect(
      (await planning.budget(user, '2026-03')).find((b) => b.category_id === expense),
    ).toMatchObject({ budget: '200.00', budget_scope: 'future' });

    await planning.saveBudget(user, '2026-03', {
      category_id: expense,
      amount: '250',
      scope: 'future',
    });
    expect(
      (await planning.budget(user, '2026-04')).find((b) => b.category_id === expense),
    ).toMatchObject({ budget: '250.00', budget_scope: 'future' });
    expect(
      (await planning.budget(user, '2026-01')).find((b) => b.category_id === expense),
    ).toMatchObject({ budget: '200.00', budget_scope: 'future' });
    await planning.removeBudgetOverride(user, '2026-02', expense);
    expect(
      (await planning.budget(user, '2026-02')).find((b) => b.category_id === expense),
    ).toMatchObject({ budget: '200.00', budget_scope: 'future' });
    const actions = await store.run(user, async (tenant) =>
      (
        await rows<{ action: string }>(
          tenant,
          sql`SELECT action FROM audit_events WHERE user_id=${user} AND entity IN ('budget_rule','budget_override') ORDER BY created_at`,
        )
      ).map((event) => event.action),
    );
    expect(actions).toEqual(
      expect.arrayContaining(['save-future', 'save-month', 'close', 'remove']),
    );
  });
  it('edits future recurring forecasts without changing past occurrences or real balances', async () => {
    const [rule] = await planning.recurrences(user),
      future = shiftMonth(today().slice(0, 7), 1);
    const before = await balance(source);
    await planning.occurrences(user, future);
    await planning.toggle(user, rule.id, { description: 'Aluguel revisto', amount: '80' });
    const [upcoming] = await planning.occurrences(user, future);
    expect(upcoming.amount).toBe('80.00');
    expect((await planning.occurrences(user, '2026-02'))[0].amount).toBe('75.00');
    await planning.occurrenceState(user, upcoming.id, { amount: '65' });
    expect((await planning.occurrences(user, future))[0].amount).toBe('65.00');
    expect((await planning.recurrences(user))[0].amount).toBe('80.00');
    expect(await balance(source)).toBe(before);
  });
  it('rejects a changed invoice total instead of recording an unreviewed payment', async () => {
    const invoice = (await cards.invoices(user)).find((i) => i.month === '2026-03-01')!;
    const before = await balance(source);
    await expect(
      cards.pay(user, invoice.id, randomUUID(), {
        account_id: source,
        occurred_on: '2026-04-05',
        expected_amount: '32.00',
      }),
    ).rejects.toThrow('total da fatura mudou');
    expect(await balance(source)).toBe(before);
  });
  it('initializes defaults once even when a custom category was created first', async () => {
    const third = randomUUID();
    await pg.query('INSERT INTO users(id) VALUES($1)', [third]);
    await accounts.createCategory(third, { name: 'Personalizada', kind: 'expense' });
    const first = await accounts.categories(third);
    expect(first.some((c) => c.name === 'Personalizada')).toBe(true);
    expect(first.some((c) => c.name === 'Moradia')).toBe(true);
    const salary = first.find((c) => c.name === 'Salário')!;
    await accounts.patchCategory(third, salary.id, { name: 'Ordenado' });
    const second = await accounts.categories(third);
    expect(second.some((c) => c.name === 'Salário')).toBe(false);
    expect(second.filter((c) => c.name === 'Ordenado')).toHaveLength(1);
  });
  it('enforces expense category kinds in planning and cards at database level', async () => {
    await expect(
      database.tenant(user, (db) =>
        db.execute(
          sql`INSERT INTO budgets(user_id,month,category_id,amount) VALUES(${user},'2026-05-01',${income},10)`,
        ),
      ),
    ).rejects.toThrow();
    const [card] = await cards.list(user);
    await expect(
      database.tenant(user, (db) =>
        db.execute(
          sql`INSERT INTO purchases(user_id,card_id,category_id,description,purchased_on,amount,installments) VALUES(${user},${card.id},${income},'Inválida','2026-05-01',10,1)`,
        ),
      ),
    ).rejects.toThrow();
    await expect(
      database.tenant(user, (db) =>
        db.execute(
          sql`INSERT INTO recurrences(user_id,description,kind,account_id,category_id,amount,expected_day,starts_on) VALUES(${user},'Inválida','expense',${source},${income},10,1,'2026-05-01')`,
        ),
      ),
    ).rejects.toThrow();
  });
  it('corrects opening balance with audit and refuses to hide earlier transactions', async () => {
    const before = await balance(source);
    await accounts.patch(user, source, { opening_balance: '1010' });
    expect(Number(await balance(source)) - Number(before)).toBe(10);
    await expect(accounts.patch(user, source, { opening_date: '2026-02-01' })).rejects.toThrow(
      'movimentações anteriores',
    );
    await accounts.patch(user, source, { opening_balance: '1000' });
    expect(await balance(source)).toBe(before);
  });
});
