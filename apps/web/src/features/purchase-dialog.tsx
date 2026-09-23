import Decimal from 'decimal.js';
import { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { EntityCombobox, LoadState } from '../components/ui';
import { currentDate, euro, useData, useSave, type Row } from '../lib/api';
import { options } from './forms';

export type PurchaseEditorSpec = {
  cards: Row[];
  categories: Row[];
  purchaseId?: string;
};

type Values = {
  description: string;
  card_id: string;
  category_id: string;
  amount: string;
  installments: string;
  purchased_on: string;
};
type ScheduleItem = { number: number; amount: string; due_on: string; paid: boolean };

const decimal = (value: string) => value.trim().replace(',', '.');
const validMoney = (value: string) =>
  /^(0|[1-9]\d{0,16})([.,]\d{1,2})?$/.test(value) && /[1-9]/.test(value);
const monthDate = (month: string, day: number) => {
  const [year, index] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, index, 0)).getUTCDate();
  return `${month}-${String(Math.min(day, last)).padStart(2, '0')}`;
};
const shiftMonth = (month: string, delta: number) => {
  const [year, index] = month.split('-').map(Number);
  return new Date(Date.UTC(year, index - 1 + delta, 1)).toISOString().slice(0, 7);
};
const shiftDueDate = (date: string, delta: number) =>
  monthDate(shiftMonth(date.slice(0, 7), delta), Number(date.slice(8, 10)));
const suggestedDueDate = (purchasedOn: string, card?: Row) => {
  if (!card || !purchasedOn) return '';
  const purchaseMonth = purchasedOn.slice(0, 7);
  const closingMonth =
    purchasedOn > monthDate(purchaseMonth, Number(card.closing_day))
      ? shiftMonth(purchaseMonth, 1)
      : purchaseMonth;
  const closesOn = monthDate(closingMonth, Number(card.closing_day));
  const sameMonthDue = monthDate(closingMonth, Number(card.due_day));
  return sameMonthDue > closesOn
    ? sameMonthDue
    : monthDate(shiftMonth(closingMonth, 1), Number(card.due_day));
};
const scheduleSource = (values: Values) =>
  [values.card_id, values.amount, values.installments, values.purchased_on].join('|');

export function buildPurchaseSchedule(values: Values, firstDueOn: string): ScheduleItem[] {
  const count = Math.max(1, Math.min(60, Number(values.installments) || 1));
  let amounts = Array.from({ length: count }, () => '');
  if (validMoney(values.amount)) {
    const cents = new Decimal(decimal(values.amount)).times(100);
    if (cents.isInteger() && cents.greaterThanOrEqualTo(count)) {
      const base = cents.div(count).floor();
      const remainder = cents.mod(count).toNumber();
      amounts = amounts.map((_, index) =>
        base
          .plus(index >= count - remainder ? 1 : 0)
          .div(100)
          .toFixed(2),
      );
    }
  }
  return amounts.map((amount, index) => ({
    number: index + 1,
    amount,
    due_on: firstDueOn ? shiftDueDate(firstDueOn, index) : '',
    paid: false,
  }));
}

export function PurchaseDialog({
  spec,
  onClose,
}: {
  spec: PurchaseEditorSpec;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    titleId = useId(),
    key = useRef(crypto.randomUUID()),
    loaded = useRef(false);
  const firstCard = spec.cards.find((card) => !card.archived);
  const initialDate = currentDate();
  const [values, setValues] = useState<Values>({
    description: '',
    card_id: firstCard?.id || '',
    category_id: '',
    amount: '',
    installments: '1',
    purchased_on: initialDate,
  });
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [generatedFrom, setGeneratedFrom] = useState('');
  const [step, setStep] = useState<'details' | 'schedule'>('details');
  const [error, setError] = useState('');
  const details = useData<Row>(
    spec.purchaseId ? `/purchases/${spec.purchaseId}` : '/purchases/new',
    !!spec.purchaseId,
  );
  const save = useSave();

  useEffect(() => ref.current?.showModal(), []);
  useEffect(() => {
    if (!details.data || loaded.current) return;
    loaded.current = true;
    const loadedValues = {
      description: details.data.description,
      card_id: details.data.card_id,
      category_id: details.data.category_id,
      amount: details.data.amount,
      installments: String(details.data.installments),
      purchased_on: details.data.purchased_on,
    };
    setValues(loadedValues);
    setGeneratedFrom(scheduleSource(loadedValues));
    setSchedule(
      details.data.schedule.map((item: Row) => ({
        number: Number(item.number),
        amount: item.amount,
        due_on: item.due_on,
        paid: Boolean(item.settled_before_tracking),
      })),
    );
  }, [details.data]);

  const updateValue = (name: keyof Values, value: string) =>
    setValues({ ...values, [name]: value });
  const reviewSchedule = () => {
    setError('');
    if (
      !values.description.trim() ||
      !values.card_id ||
      !values.category_id ||
      !validMoney(values.amount) ||
      !Number.isInteger(Number(values.installments)) ||
      Number(values.installments) < 1 ||
      Number(values.installments) > 60 ||
      !values.purchased_on
    ) {
      setError('Preencha os dados da compra antes de continuar.');
      return;
    }
    const card = spec.cards.find((item) => item.id === values.card_id);
    const firstDueOn = suggestedDueDate(values.purchased_on, card);
    if (!firstDueOn) {
      setError('Não foi possível calcular as faturas deste cartão.');
      return;
    }
    if (generatedFrom !== scheduleSource(values)) {
      setSchedule(buildPurchaseSchedule(values, firstDueOn));
      setGeneratedFrom(scheduleSource(values));
    }
    setStep('schedule');
  };
  const total = schedule.reduce(
    (sum, item) => (validMoney(item.amount) ? sum.plus(decimal(item.amount)) : sum),
    new Decimal(0),
  );
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (step === 'details') {
      reviewSchedule();
      return;
    }
    setError('');
    if (
      schedule.some((item) => !validMoney(item.amount) || !item.due_on)
    ) {
      setError('Preencha os dados da compra e confira todas as parcelas.');
      return;
    }
    try {
      await save.mutateAsync({
        path: spec.purchaseId ? `/purchases/${spec.purchaseId}` : '/purchases',
        method: spec.purchaseId ? 'PATCH' : 'POST',
        key: spec.purchaseId ? undefined : key.current,
        data: {
          card_id: values.card_id,
          category_id: values.category_id,
          description: values.description.trim(),
          purchased_on: values.purchased_on,
          amount: decimal(values.amount),
          installments: Number(values.installments),
          schedule: schedule.map((item) => ({ ...item, amount: decimal(item.amount) })),
        },
      });
      onClose();
    } catch {
      // The mutation error is rendered below and the draft remains intact.
    }
  };

  return (
    <dialog ref={ref} aria-labelledby={titleId} className="modal purchase-modal">
      <div className="modal-header">
        <div>
          <span className="eyebrow">CARTÃO DE CRÉDITO</span>
          <h2 id={titleId}>{spec.purchaseId ? 'Editar compra' : 'Registrar compra'}</h2>
        </div>
        <button className="icon-button" aria-label="Fechar" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      <p className="muted">
        Confira as faturas previstas antes de guardar. O saldo da conta só muda quando uma fatura
        for paga.
      </p>
      <LoadState loading={details.isLoading} error={details.error} />
      {(!spec.purchaseId || details.data) && (
        step === 'details' ? (
          <div>
            <fieldset className="form-grid" disabled={save.isPending}>
              <label className="wide">
                Descrição
                <input
                  value={values.description}
                  onChange={(event) => updateValue('description', event.target.value)}
                />
              </label>
              <label>
                Cartão
                <EntityCombobox
                  options={options(spec.cards)}
                  value={values.card_id}
                  onChange={(value) => updateValue('card_id', value)}
                  optional={false}
                  invalid={!values.card_id}
                />
              </label>
              <label>
                Categoria
                <EntityCombobox
                  options={options(spec.categories.filter((category) => category.kind === 'expense'))}
                  value={values.category_id}
                  onChange={(value) => updateValue('category_id', value)}
                  optional={false}
                  invalid={!values.category_id}
                />
              </label>
              <label>
                Valor da compra
                <input
                  inputMode="decimal"
                  value={values.amount}
                  onChange={(event) => updateValue('amount', event.target.value)}
                />
              </label>
              <label>
                Número de parcelas
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={values.installments}
                  onChange={(event) => updateValue('installments', event.target.value)}
                />
              </label>
              <label>
                Data da compra
                <input
                  type="date"
                  max={currentDate()}
                  value={values.purchased_on}
                  onChange={(event) => updateValue('purchased_on', event.target.value)}
                />
              </label>
            </fieldset>
            {error && (
              <p className="error-box" role="alert">
                {error}
              </p>
            )}
            <div className="modal-footer">
              <button type="button" className="button secondary" onClick={onClose}>
                Cancelar
              </button>
              <button type="button" className="button" onClick={reviewSchedule}>
                Rever faturas
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit}>
            <section className="purchase-schedule" aria-labelledby={`${titleId}-schedule`}>
              <div className="split">
                <div>
                  <h3 id={`${titleId}-schedule`}>Rever faturas</h3>
                  <p>Confira e ajuste os valores e vencimentos antes de guardar.</p>
                </div>
                <strong>Total das parcelas {euro(total.toFixed(2))}</strong>
              </div>
              <div className="purchase-schedule-list">
                {schedule.map((item, index) => (
                  <div className="purchase-installment" key={item.number}>
                    <span className="installment-number">{item.number}</span>
                    <label>
                      Vencimento
                      <input
                        aria-label={`Vencimento da parcela ${item.number}`}
                        type="date"
                        value={item.due_on}
                        onChange={(event) =>
                          setSchedule(
                            schedule.map((current, position) =>
                              position === index
                                ? { ...current, due_on: event.target.value }
                                : current,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Valor
                      <input
                        aria-label={`Valor da parcela ${item.number}`}
                        inputMode="decimal"
                        value={item.amount}
                        onChange={(event) =>
                          setSchedule(
                            schedule.map((current, position) =>
                              position === index
                                ? { ...current, amount: event.target.value }
                                : current,
                            ),
                          )
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className={`button small ${item.paid ? '' : 'secondary'}`}
                      aria-pressed={item.paid}
                      onClick={() =>
                        setSchedule(
                          schedule.map((current, position) =>
                            position === index ? { ...current, paid: !current.paid } : current,
                          ),
                        )
                      }
                    >
                      {item.paid ? 'Já estava paga' : 'Marcar como já paga'}
                    </button>
                  </div>
                ))}
              </div>
            </section>
            {(error || save.error) && (
              <p className="error-box" role="alert">
                {error || save.error?.message}
              </p>
            )}
            <div className="modal-footer">
              <button type="button" className="button secondary" onClick={() => setStep('details')}>
                Voltar
              </button>
              <button type="submit" className="button" disabled={save.isPending}>
                {save.isPending
                  ? 'A guardar…'
                  : spec.purchaseId
                    ? 'Guardar alterações'
                    : 'Criar compra'}
              </button>
            </div>
          </form>
        )
      )}
    </dialog>
  );
}
