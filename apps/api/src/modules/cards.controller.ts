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
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { UserId } from '../auth/auth';
import { cardInput, id, invoicePayment, parse, purchaseInput } from '../common/validation';
import { Db, rows } from '../database/database.service';
import {
  dueDate,
  firstInvoiceMonth,
  invoiceMonthFromDueDate,
  monthDate,
  shiftMonth,
  splitInstallments,
} from '../domain/money';
import { FinanceStore, account, audit, category } from './finance.store';
import { ConflictException } from '@nestjs/common';
import Decimal from 'decimal.js';

@Controller()
export class CardsController {
  constructor(@Inject(FinanceStore) private readonly store: FinanceStore) {}
  private async createInstallments(db: Db, user: string, purchase: any, card: any, data: any) {
    let schedule: { number: number; amount: string; due_on: string; paid?: boolean }[];
    if (data.schedule) schedule = data.schedule;
    else {
      let amounts: string[];
      try {
        amounts = data.installment_amount
          ? Array.from({ length: data.installments }, () => data.installment_amount)
          : splitInstallments(data.amount, data.installments);
      } catch {
        throw new BadRequestException('Cada parcela deve ter pelo menos €0,01.');
      }
      if (data.first_invoice_on && data.first_invoice_on < data.purchased_on)
        throw new BadRequestException('A primeira fatura não pode vencer antes da compra.');
      const firstMonth = data.first_invoice_on
        ? invoiceMonthFromDueDate(data.first_invoice_on, card.closing_day)
        : data.first_invoice_month || firstInvoiceMonth(data.purchased_on, card.closing_day);
      if (firstMonth < data.purchased_on.slice(0, 7))
        throw new BadRequestException('A primeira fatura não pode anteceder o mês da compra.');
      schedule = amounts.map((amount, index) => {
        const month = shiftMonth(firstMonth, index);
        return {
          number: index + 1,
          amount,
          due_on:
            index === 0 && data.first_invoice_on
              ? data.first_invoice_on
              : dueDate(month, card.closing_day, card.due_day),
        };
      });
    }
    const invoiceMonths = schedule.map((item) =>
      invoiceMonthFromDueDate(item.due_on, card.closing_day),
    );
    if (new Set(invoiceMonths).size !== invoiceMonths.length)
      throw new BadRequestException('Cada parcela deve pertencer a uma fatura diferente.');
    for (let index = 0; index < schedule.length; index++) {
      const item = schedule[index],
        month = invoiceMonths[index];
      await db.execute(
        sql`INSERT INTO invoices(user_id,card_id,month,closes_on,due_on) VALUES(${user},${card.id},${month + '-01'},${monthDate(month, card.closing_day)},${item.due_on}) ON CONFLICT(user_id,card_id,month) DO NOTHING`,
      );
      const [invoice] = await rows(
        db,
        sql`SELECT * FROM invoices WHERE user_id=${user} AND card_id=${card.id} AND month=${month + '-01'}::date`,
      );
      if (invoice.due_on !== item.due_on)
        throw new BadRequestException(
          'Já existe uma fatura neste período com outra data de vencimento.',
        );
      const settledBeforeTracking = item.paid ?? index < data.paid_installments;
      if (invoice.payment_id && !settledBeforeTracking)
        throw new BadRequestException(
          'Uma das faturas já foi paga. Reabra o pagamento antes de alterar sua composição.',
        );
      await db.execute(
        sql`INSERT INTO installments(user_id,purchase_id,invoice_id,number,amount,settled_before_tracking) VALUES(${user},${purchase.id},${invoice.id},${item.number},${item.amount},${settledBeforeTracking})`,
      );
    }
    return schedule;
  }
  @Get('cards') list(@UserId() user: string) {
    return this.store.read(user, (db) =>
      rows(db, sql`SELECT * FROM cards WHERE user_id=${user} ORDER BY name`),
    );
  }
  @Post('cards') create(@UserId() user: string, @Body() input: unknown) {
    const d = parse(cardInput, input);
    return this.store.run(user, async (db) => {
      const [result] = await rows(
        db,
        sql`INSERT INTO cards(user_id,name,closing_day,due_day) VALUES(${user},${d.name},${d.closing_day},${d.due_day}) RETURNING *`,
      );
      await audit(db, user, 'card', result.id, 'create', null, result);
      return result;
    });
  }
  @Get('invoices') invoices(@UserId() user: string) {
    return this.store.read(user, (db) =>
      rows(
        db,
        sql`SELECT i.*,c.name AS card_name,
          coalesce(sum(s.amount) FILTER(WHERE p.deleted_at IS NULL AND NOT s.settled_before_tracking),0)::text AS amount,
          coalesce(sum(s.amount) FILTER(WHERE p.deleted_at IS NULL AND s.settled_before_tracking),0)::text AS historical_amount
      FROM invoices i JOIN cards c ON c.user_id=i.user_id AND c.id=i.card_id
      LEFT JOIN installments s ON s.user_id=i.user_id AND s.invoice_id=i.id LEFT JOIN purchases p ON p.user_id=s.user_id AND p.id=s.purchase_id
      WHERE i.user_id=${user} GROUP BY i.id,c.name ORDER BY i.due_on DESC`,
      ),
    );
  }
  @Get('invoices/:id') invoice(@UserId() user: string, @Param('id') rawId: string) {
    const invoiceId = parse(id, rawId);
    return this.store.read(user, async (db) => {
      const [invoice] = await rows(
        db,
        sql`SELECT * FROM invoices WHERE user_id=${user} AND id=${invoiceId}`,
      );
      if (!invoice) throw new NotFoundException('Fatura não encontrada.');
      const installments = await rows(
        db,
        sql`SELECT s.*,p.description,p.installments,p.category_id,c.name AS category_name FROM installments s JOIN purchases p ON p.user_id=s.user_id AND p.id=s.purchase_id JOIN categories c ON c.user_id=p.user_id AND c.id=p.category_id WHERE s.user_id=${user} AND s.invoice_id=${invoiceId} AND p.deleted_at IS NULL ORDER BY p.purchased_on,s.number`,
      );
      return { ...invoice, installments };
    });
  }
  @Get('purchases') purchases(@UserId() user: string) {
    return this.store.read(user, (db) =>
      rows(
        db,
        sql`SELECT p.*,c.name AS card_name,
      coalesce((SELECT sum(s.amount) FROM installments s WHERE s.user_id=p.user_id AND s.purchase_id=p.id),0)::text AS financed_total,
      coalesce((SELECT sum(s.amount) FROM installments s JOIN invoices i ON i.user_id=s.user_id AND i.id=s.invoice_id WHERE s.user_id=p.user_id AND s.purchase_id=p.id AND i.payment_id IS NULL AND NOT s.settled_before_tracking),0)::text AS remaining,
      NOT EXISTS (
        SELECT 1 FROM installments s JOIN invoices i ON i.user_id=s.user_id AND i.id=s.invoice_id
        WHERE s.user_id=p.user_id AND s.purchase_id=p.id
          AND (i.payment_id IS NOT NULL OR s.settled_before_tracking)
      ) AS editable
      FROM purchases p JOIN cards c ON c.user_id=p.user_id AND c.id=p.card_id WHERE p.user_id=${user} AND p.deleted_at IS NULL ORDER BY p.purchased_on DESC,p.id`,
      ),
    );
  }
  @Get('purchases/:id') purchase(@UserId() user: string, @Param('id') rawId: string) {
    const purchaseId = parse(id, rawId);
    return this.store.read(user, async (db) => {
      const [purchase] = await rows(
        db,
        sql`SELECT p.*,c.name AS card_name FROM purchases p JOIN cards c ON c.user_id=p.user_id AND c.id=p.card_id WHERE p.user_id=${user} AND p.id=${purchaseId} AND p.deleted_at IS NULL`,
      );
      if (!purchase) throw new NotFoundException('Compra não encontrada.');
      const installments = await rows(
        db,
        sql`SELECT s.*,i.due_on,i.closes_on,i.payment_id
          FROM installments s JOIN invoices i ON i.user_id=s.user_id AND i.id=s.invoice_id
          WHERE s.user_id=${user} AND s.purchase_id=${purchaseId} ORDER BY s.number`,
      );
      return { ...purchase, schedule: installments };
    });
  }
  @Post('purchases') createPurchase(
    @UserId() user: string,
    @Headers('idempotency-key') rawKey: string,
    @Body() input: unknown,
  ) {
    const d = parse(purchaseInput, input),
      key = parse(id, rawKey);
    return this.store.run(user, (db) =>
      this.store.once(db, user, key, { action: 'purchase', d }, async () => {
        const [card] = await rows(
          db,
          sql`SELECT * FROM cards WHERE user_id=${user} AND id=${d.card_id} AND NOT archived`,
        );
        if (!card) throw new NotFoundException('Cartão não encontrado.');
        await category(db, user, d.category_id, 'expense');
        const [purchase] = await rows(
          db,
          sql`INSERT INTO purchases(user_id,card_id,category_id,description,purchased_on,amount,installments) VALUES(${user},${d.card_id},${d.category_id},${d.description},${d.purchased_on},${d.amount},${d.installments}) RETURNING *`,
        );
        const schedule = await this.createInstallments(db, user, purchase, card, d);
        await audit(db, user, 'purchase', purchase.id, 'create', null, {
          ...purchase,
          paid_installments: d.paid_installments,
          schedule,
        });
        return purchase;
      }),
    );
  }
  @Patch('purchases/:id') editPurchase(
    @UserId() user: string,
    @Param('id') rawId: string,
    @Body() input: unknown,
  ) {
    const purchaseId = parse(id, rawId),
      data = parse(purchaseInput, input);
    return this.store.run(user, async (db) => {
      const [before] = await rows(
        db,
        sql`SELECT * FROM purchases WHERE user_id=${user} AND id=${purchaseId} AND deleted_at IS NULL FOR UPDATE`,
      );
      if (!before) throw new NotFoundException('Compra não encontrada.');
      const existingInstallments = await rows(
        db,
        sql`SELECT s.*,i.payment_id FROM installments s JOIN invoices i ON i.user_id=s.user_id AND i.id=s.invoice_id WHERE s.user_id=${user} AND s.purchase_id=${purchaseId} ORDER BY s.number FOR UPDATE OF s,i`,
      );
      if (existingInstallments.some((item) => item.payment_id))
        throw new BadRequestException(
          'Uma compra com parcelas quitadas em uma fatura paga não pode ser reescrita. Reabra o pagamento da fatura primeiro.',
        );
      const [card] = await rows(
        db,
        sql`SELECT * FROM cards WHERE user_id=${user} AND id=${data.card_id} AND NOT archived`,
      );
      if (!card) throw new NotFoundException('Cartão não encontrado.');
      await category(db, user, data.category_id, 'expense');
      await db.execute(
        sql`DELETE FROM installments WHERE user_id=${user} AND purchase_id=${purchaseId}`,
      );
      await db.execute(
        sql`DELETE FROM invoices i WHERE i.user_id=${user} AND i.payment_id IS NULL
          AND i.card_id IN (${before.card_id},${data.card_id})
          AND NOT EXISTS (SELECT 1 FROM installments s WHERE s.user_id=i.user_id AND s.invoice_id=i.id)`,
      );
      const [result] = await rows(
        db,
        sql`UPDATE purchases SET card_id=${data.card_id},category_id=${data.category_id},description=${data.description},purchased_on=${data.purchased_on},amount=${data.amount},installments=${data.installments}
          WHERE user_id=${user} AND id=${purchaseId}
          RETURNING *`,
      );
      const schedule = await this.createInstallments(db, user, result, card, data);
      await audit(db, user, 'purchase', purchaseId, 'update', before, { ...result, schedule });
      return result;
    });
  }
  @Delete('purchases/:id') deletePurchase(@UserId() user: string, @Param('id') rawId: string) {
    const purchaseId = parse(id, rawId);
    return this.store.run(user, async (db) => {
      const [before] = await rows(
        db,
        sql`SELECT * FROM purchases WHERE user_id=${user} AND id=${purchaseId} AND deleted_at IS NULL`,
      );
      if (!before) throw new NotFoundException('Compra não encontrada.');
      const paid = await rows(
        db,
        sql`SELECT i.id FROM invoices i JOIN installments s ON s.user_id=i.user_id AND s.invoice_id=i.id WHERE s.user_id=${user} AND s.purchase_id=${purchaseId} AND i.payment_id IS NOT NULL LIMIT 1`,
      );
      if (paid.length)
        throw new BadRequestException('Reabra as faturas pagas antes de excluir esta compra.');
      await db.execute(
        sql`UPDATE purchases SET deleted_at=now() WHERE user_id=${user} AND id=${purchaseId}`,
      );
      await audit(db, user, 'purchase', purchaseId, 'delete', before, null);
      return { deleted: true };
    });
  }
  @Post('invoices/:id/pay') pay(
    @UserId() user: string,
    @Param('id') rawId: string,
    @Headers('idempotency-key') rawKey: string,
    @Body() input: unknown,
  ) {
    const invoiceId = parse(id, rawId),
      key = parse(id, rawKey),
      d = parse(invoicePayment, input);
    return this.store.run(user, (db) =>
      this.store.once(db, user, key, { action: 'invoice-payment', invoiceId, d }, async () => {
        const [invoice] = await rows(
          db,
          sql`SELECT * FROM invoices WHERE user_id=${user} AND id=${invoiceId}`,
        );
        if (!invoice) throw new NotFoundException('Fatura não encontrada.');
        if (invoice.payment_id) {
          const existing = (
            await rows(
              db,
              sql`SELECT * FROM transactions WHERE user_id=${user} AND id=${invoice.payment_id}`,
            )
          )[0];
          if (
            existing.source_id !== d.account_id ||
            existing.occurred_on !== d.occurred_on ||
            !new Decimal(existing.amount).eq(d.expected_amount)
          )
            throw new ConflictException(
              'A fatura já foi paga com outros dados. Atualize a página.',
            );
          return existing;
        }
        await account(db, user, d.account_id, d.occurred_on);
        const [total] = await rows(
          db,
          sql`SELECT coalesce(sum(s.amount),0)::text AS amount,max(p.purchased_on)::text AS latest_purchase FROM installments s JOIN purchases p ON p.user_id=s.user_id AND p.id=s.purchase_id WHERE s.user_id=${user} AND s.invoice_id=${invoiceId} AND p.deleted_at IS NULL AND NOT s.settled_before_tracking`,
        );
        if (total.amount === '0') throw new BadRequestException('A fatura está vazia.');
        if (!new Decimal(total.amount).eq(d.expected_amount))
          throw new ConflictException(
            'O total da fatura mudou. Atualize a página e confira antes de pagar.',
          );
        if (d.occurred_on < total.latest_purchase)
          throw new BadRequestException('Pagamento anterior a uma compra da fatura.');
        const [payment] = await rows(
          db,
          sql`INSERT INTO transactions(user_id,kind,description,source_id,amount,occurred_on) VALUES(${user},'card_payment',${'Pagamento de fatura ' + invoice.month.slice(0, 7)},${d.account_id},${total.amount},${d.occurred_on}) RETURNING *`,
        );
        await db.execute(
          sql`UPDATE invoices SET payment_id=${payment.id} WHERE user_id=${user} AND id=${invoiceId}`,
        );
        await audit(db, user, 'transaction', payment.id, 'create', null, payment);
        await audit(db, user, 'invoice', invoiceId, 'pay', invoice, { payment_id: payment.id });
        return payment;
      }),
    );
  }
}
