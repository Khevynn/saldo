-- Editing a purchase replaces its unpaid installment schedule transactionally.
-- Empty, unpaid invoices may then be removed before the revised schedule is created.
GRANT DELETE ON installments,invoices TO finance_app;

