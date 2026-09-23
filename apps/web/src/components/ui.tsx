import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { X, Plus, Inbox, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { useSave } from '../lib/api';
import { z } from 'zod';

function validateField(name: string, value: string) {
  if (!value || !/amount|balance|received|target|contribution/.test(name)) return true;
  const pattern =
    name === 'opening_balance'
      ? /^-?(0|[1-9]\d{0,16})(\.\d{1,2})?$/
      : /^(0|[1-9]\d{0,16})(\.\d{1,2})?$/;
  return (
    z.string().regex(pattern).safeParse(value.trim().replace(',', '.')).success ||
    'Use um valor em euros com até duas casas decimais.'
  );
}

export type Field = {
  name: string;
  label: string;
  type?: string;
  options?: EntityOption[];
  searchable?: boolean;
  value?: string | number;
  required?: boolean;
  min?: string | number;
  max?: string | number;
  hint?: string;
};
export type EntityOption = { value: string; label: string; group?: string };
export type FormSpec = {
  title: string;
  description?: string;
  path: string;
  method?: string;
  fields: Field[];
  map?: (data: Record<string, string>) => unknown;
  submit?: string;
  variants?: { value: string; label: string; spec: FormSpec }[];
};

export function EntityCombobox({
  options,
  value,
  onChange,
  optional,
  invalid,
  emptyLabel = 'Nenhuma',
}: {
  options: EntityOption[];
  value: string;
  onChange: (value: string) => void;
  optional: boolean;
  invalid: boolean;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(''),
    listId = useId(),
    root = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value),
    filtered = options.filter((option) =>
      option.label.toLocaleLowerCase('pt-PT').includes(query.toLocaleLowerCase('pt-PT')),
    ),
    grouped = filtered.reduce<Map<string, EntityOption[]>>((result, option) => {
      const group = option.group || '';
      result.set(group, [...(result.get(group) || []), option]);
      return result;
    }, new Map());
  useEffect(() => {
    if (!open) return;
    const closeWhenOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeWhenOutside, true);
    return () => document.removeEventListener('pointerdown', closeWhenOutside, true);
  }, [open]);
  return (
    <div className="combobox" ref={root}>
      <input
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-invalid={invalid}
        autoComplete="off"
        placeholder="Pesquisar…"
        value={open ? query : selected?.label || ''}
        onFocus={() => {
          setQuery('');
          setOpen(true);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
        }}
      />
      {open && (
        <div className="combobox-options" id={listId} role="listbox">
          {optional && (
            <button
              type="button"
              role="option"
              aria-selected={!value}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
            >
              {emptyLabel}
            </button>
          )}
          {[...grouped].map(([group, groupOptions]) => (
            <Fragment key={group || 'ungrouped'}>
              {group && <span className="combobox-group">{group}</span>}
              {groupOptions.map((option) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  key={option.value}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange(option.value);
                    setQuery('');
                    setOpen(false);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </Fragment>
          ))}
          {!filtered.length && <span>Nenhum resultado</span>}
        </div>
      )}
    </div>
  );
}

export function FormDialog({ spec, onClose }: { spec: FormSpec; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null),
    key = useRef(crypto.randomUUID()),
    titleId = useId();
  const [variant, setVariant] = useState(spec.variants?.[0]?.value || '');
  const active = spec.variants?.find((item) => item.value === variant)?.spec || spec;
  const drafts = useRef<Record<string, Record<string, string>>>({});
  const save = useSave();
  const {
    register,
    handleSubmit,
    reset,
    getValues,
    setValue,
    watch,
    formState: { errors },
  } = useForm<Record<string, string>>({
    defaultValues: Object.fromEntries(active.fields.map((f) => [f.name, String(f.value ?? '')])),
  });
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const changeVariant = (nextVariant: string) => {
    const current = getValues();
    drafts.current[variant] = current;
    const next = spec.variants?.find((item) => item.value === nextVariant)?.spec;
    if (!next) return;
    const nextValues = {
      ...Object.fromEntries(next.fields.map((field) => [field.name, String(field.value ?? '')])),
      ...(drafts.current[nextVariant] || {}),
    };
    const fieldAliases: Record<string, string[]> = {
      source_id: ['destination_id', 'account_id'],
      destination_id: ['source_id', 'account_id'],
      account_id: ['source_id', 'destination_id'],
    };
    for (const field of next.fields) {
      const currentValue =
        current[field.name] ||
        fieldAliases[field.name]?.map((name) => current[name]).find(Boolean) ||
        '';
      if (!currentValue) continue;
      if (field.options && !field.options.some((option) => option.value === currentValue)) continue;
      nextValues[field.name] = currentValue;
    }
    setVariant(nextVariant);
    reset(nextValues);
    key.current = crypto.randomUUID();
  };
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        if (save.isPending) event.preventDefault();
        else onClose();
      }}
      className="modal"
    >
      <div className="modal-header">
        <div>
          <span className="eyebrow">SUAS FINANÇAS</span>
          <h2 id={titleId}>{spec.variants ? spec.title : active.title}</h2>
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label="Fechar"
          onClick={onClose}
          disabled={save.isPending}
        >
          <X size={20} />
        </button>
      </div>
      {spec.variants && (
        <div className="segmented" aria-label="Tipo de movimentação">
          {spec.variants.map((item) => (
            <button
              type="button"
              className={item.value === variant ? 'active' : ''}
              aria-pressed={item.value === variant}
              key={item.value}
              onClick={() => changeVariant(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      {active.description && <p className="muted">{active.description}</p>}
      <form
        onSubmit={handleSubmit(async (data) => {
          try {
            await save.mutateAsync({
              path: active.path,
              method: active.method,
              data: active.map ? active.map(data) : data,
              key: key.current,
            });
            onClose();
          } catch {
            /* mutation renders the error; keep form values */
          }
        })}
      >
        <fieldset className="form-grid" disabled={save.isPending}>
          {active.fields.map((field) => (
            <label key={field.name} className={field.type === 'wide' ? 'wide' : ''}>
              {field.label}
              {field.options && field.searchable ? (
                <>
                  <input
                    type="hidden"
                    {...register(field.name, {
                      required: field.required !== false ? 'Preencha este campo.' : false,
                    })}
                  />
                  <EntityCombobox
                    options={field.options}
                    value={watch(field.name) || ''}
                    onChange={(value) =>
                      setValue(field.name, value, { shouldDirty: true, shouldValidate: true })
                    }
                    optional={field.required === false}
                    invalid={!!errors[field.name]}
                  />
                </>
              ) : field.options ? (
                <select
                  aria-invalid={!!errors[field.name]}
                  {...register(field.name, {
                    required: field.required !== false ? 'Preencha este campo.' : false,
                  })}
                >
                  <option value="">Selecione</option>
                  {field.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type === 'wide' ? 'text' : field.type || 'text'}
                  step={field.type === 'number' ? '1' : undefined}
                  inputMode={
                    field.name.match(/amount|balance|received|target|contribution/)
                      ? 'decimal'
                      : undefined
                  }
                  min={field.min}
                  max={field.max}
                  aria-invalid={!!errors[field.name]}
                  {...register(field.name, {
                    required: field.required !== false ? 'Preencha este campo.' : false,
                    validate: (value) => validateField(field.name, value),
                  })}
                />
              )}
              {field.hint && <small>{field.hint}</small>}
              {errors[field.name] && (
                <small className="danger">{errors[field.name]?.message}</small>
              )}
            </label>
          ))}
        </fieldset>
        {save.error && (
          <p className="error-box" role="alert">
            {save.error.message}
          </p>
        )}
        <div className="modal-footer">
          <button
            type="button"
            className="button secondary"
            onClick={onClose}
            disabled={save.isPending}
          >
            Cancelar
          </button>
          <button className="button" disabled={save.isPending}>
            {save.isPending ? 'A guardar…' : active.submit || 'Guardar'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function moveMonth(month: string, change: number) {
  const [year, index] = month.split('-').map(Number),
    date = new Date(Date.UTC(year, index - 1 + change, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function PeriodNavigator({
  month,
  onChange,
}: {
  month: string;
  onChange: (month: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null),
    current = new Date().toISOString().slice(0, 7),
    label = new Date(`${month}-02T12:00:00`).toLocaleDateString('pt-PT', {
      month: 'long',
      year: 'numeric',
    });
  return (
    <div className="period-navigator" aria-label="Período da página">
      <button
        type="button"
        className="icon-button"
        aria-label="Mês anterior"
        onClick={() => onChange(moveMonth(month, -1))}
      >
        <ChevronLeft size={17} />
      </button>
      <strong>{label.charAt(0).toUpperCase() + label.slice(1)}</strong>
      <button
        type="button"
        className="icon-button"
        aria-label="Mês seguinte"
        onClick={() => onChange(moveMonth(month, 1))}
      >
        <ChevronRight size={17} />
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label="Escolher mês"
        onClick={() => input.current?.showPicker()}
      >
        <CalendarDays size={16} />
      </button>
      <input
        ref={input}
        className="sr-only"
        type="month"
        min="2000-01"
        max="2100-12"
        value={month}
        onChange={(event) => event.target.value && onChange(event.target.value)}
      />
      {month !== current && (
        <button type="button" className="text-link" onClick={() => onChange(current)}>
          Este mês
        </button>
      )}
    </div>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}
export function AddButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button className="button" onClick={onClick}>
      <Plus size={17} />
      {children}
    </button>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Inbox size={26} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Panel({
  title,
  description,
  action,
  children,
  className = '',
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-header">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export function Progress({ value }: { value: number }) {
  return (
    <div
      className="progress"
      role="progressbar"
      aria-label="Progresso"
      aria-valuenow={Math.round(Math.max(0, Math.min(value, 100)))}
      aria-valuetext={`${value.toFixed(1).replace('.', ',')}%`}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ width: `${Math.max(0, Math.min(value, 100))}%` }} />
    </div>
  );
}
export function LoadState({ loading, error }: { loading: boolean; error: Error | null }) {
  if (error)
    return (
      <div className="error-box" role="alert">
        {error.message}
      </div>
    );
  if (loading)
    return (
      <div className="loading" role="status">
        A carregar suas finanças…
      </div>
    );
  return null;
}
