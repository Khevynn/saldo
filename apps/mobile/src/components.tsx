import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
} from 'lucide-react-native';
import type { Field, FormSpec, Option } from './forms';
import { currentDate, dateLabel, errorMessage, monthLabel, useSave, type Row } from './api';
import { useTheme, type ThemeColors } from './theme';

function useUi() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme.colors), [theme.colors]);
  return { ...theme, styles };
}

export function Screen({
  children,
  refreshing = false,
  onRefresh,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const { common } = useUi();
  return (
    <ScrollView
      style={common.screen}
      contentContainerStyle={common.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined
      }
    >
      {children}
    </ScrollView>
  );
}

export function Header({
  eyebrow,
  title,
  description,
  action,
  divider = true,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
  divider?: boolean;
}) {
  const { common, styles } = useUi();
  return (
    <View style={[styles.pageHeader, !divider && styles.withoutBottomBorder]}>
      <View style={{ gap: 6 }}>
        <Text style={common.eyebrow}>{eyebrow}</Text>
        <Text style={common.title}>{title}</Text>
        {description ? <Text style={common.subtitle}>{description}</Text> : null}
      </View>
      {action ? <View style={styles.headerAction}>{action}</View> : null}
    </View>
  );
}

export function Card({
  children,
  title,
  topBorder = true,
}: {
  children: ReactNode;
  title?: string;
  topBorder?: boolean;
}) {
  const { common, styles } = useUi();
  return (
    <View style={[common.card, !topBorder && styles.withoutTopBorder]}>
      {title ? (
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{title}</Text>
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function PrimaryButton({
  children,
  onPress,
  disabled = false,
}: {
  children: ReactNode;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { common } = useUi();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={[common.button, disabled && { opacity: 0.5 }]}
      onPress={onPress}
      disabled={disabled}
    >
      {typeof children === 'string' ? <Text style={common.buttonText}>{children}</Text> : children}
    </Pressable>
  );
}

export function SecondaryButton({
  children,
  onPress,
  disabled = false,
}: {
  children: ReactNode;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { common } = useUi();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={[common.secondaryButton, disabled && { opacity: 0.5 }]}
      onPress={onPress}
      disabled={disabled}
    >
      {typeof children === 'string' ? (
        <Text style={common.secondaryText}>{children}</Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

export function AddButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { common } = useUi();
  return (
    <PrimaryButton onPress={onPress}>
      <Plus color="#fff" size={18} />
      <Text style={common.buttonText}>{label}</Text>
    </PrimaryButton>
  );
}

export type ChoiceOption = {
  value: string;
  label: string;
  description?: string;
  tone?: 'default' | 'danger';
};

export function ChoiceModal({
  visible,
  title,
  options,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: ChoiceOption[];
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  const { colors, common, styles } = useUi();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <SafeAreaView style={styles.choiceSheet} edges={['bottom']}>
          <View style={common.between}>
            <Text style={styles.choiceTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <X color={colors.ink} size={22} />
            </Pressable>
          </View>
          <View style={styles.choiceList}>
            {options.map((option) => (
              <Pressable
                key={option.value}
                style={({ pressed }) => [
                  styles.choiceOption,
                  pressed && styles.choiceOptionPressed,
                ]}
                onPress={() => onSelect(option.value)}
              >
                <View style={common.grow}>
                  <Text
                    style={[
                      styles.choiceLabel,
                      option.tone === 'danger' && { color: colors.danger },
                    ]}
                  >
                    {option.label}
                  </Text>
                  {option.description ? (
                    <Text style={common.muted}>{option.description}</Text>
                  ) : null}
                </View>
                <ChevronRight
                  color={option.tone === 'danger' ? colors.danger : colors.muted}
                  size={20}
                />
              </Pressable>
            ))}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

export function DateRangeModal({
  initialFrom,
  initialTo,
  onApply,
  onClose,
}: {
  initialFrom: string;
  initialTo: string;
  onApply: (from: string, to: string) => void;
  onClose: () => void;
}) {
  const { colors, common, styles } = useUi();
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [selectingEnd, setSelectingEnd] = useState(false);
  const [cursor, setCursor] = useState(() => new Date(`${initialFrom.slice(0, 7)}-15T12:00:00`));
  const year = cursor.getFullYear();
  const monthIndex = cursor.getMonth();
  const monthTitle = new Intl.DateTimeFormat('pt-PT', {
    month: 'long',
    year: 'numeric',
  }).format(cursor);
  const firstWeekday = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const monthLength = new Date(year, monthIndex + 1, 0).getDate();
  const cells: Array<number | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: monthLength }, (_, index) => index + 1),
  ];
  while (cells.length % 7) cells.push(null);
  const iso = (day: number) =>
    `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const pick = (day: number) => {
    const value = iso(day);
    if (!selectingEnd || value < from) {
      setFrom(value);
      setTo(value);
      setSelectingEnd(true);
      return;
    }
    setTo(value);
    setSelectingEnd(false);
  };
  const moveMonth = (amount: number) =>
    setCursor((before) => new Date(before.getFullYear(), before.getMonth() + amount, 15, 12));
  const rangeLabel = (value: string) =>
    new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' }).format(
      new Date(`${value}T12:00:00`),
    );
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <SafeAreaView style={styles.calendarSheet} edges={['bottom']}>
          <View style={common.between}>
            <Text style={styles.choiceTitle}>Selecionar período</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <X color={colors.ink} size={22} />
            </Pressable>
          </View>
          <View style={styles.rangeSummary}>
            <CalendarDays size={20} color={colors.green} />
            <View style={common.grow}>
              <Text style={common.label}>
                {selectingEnd ? 'Agora escolha a data final' : 'Período selecionado'}
              </Text>
              <Text style={styles.rangeValue}>
                {rangeLabel(from)} — {rangeLabel(to)}
              </Text>
            </View>
          </View>
          <View style={styles.calendarHeader}>
            <Pressable style={styles.calendarArrow} onPress={() => moveMonth(-1)}>
              <ChevronLeft color={colors.ink} size={21} />
            </Pressable>
            <Text style={styles.calendarTitle}>{monthTitle}</Text>
            <Pressable style={styles.calendarArrow} onPress={() => moveMonth(1)}>
              <ChevronRight color={colors.ink} size={21} />
            </Pressable>
          </View>
          <View style={styles.weekRow}>
            {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((label, index) => (
              <Text key={`${label}-${index}`} style={styles.weekday}>
                {label}
              </Text>
            ))}
          </View>
          <View style={styles.calendarGrid}>
            {cells.map((day, index) => {
              if (!day) return <View key={`blank-${index}`} style={styles.dayCell} />;
              const value = iso(day);
              const endpoint = value === from || value === to;
              const inRange = value >= from && value <= to;
              return (
                <Pressable
                  key={value}
                  style={[
                    styles.dayCell,
                    inRange && styles.dayInRange,
                    endpoint && styles.daySelected,
                  ]}
                  onPress={() => pick(day)}
                >
                  <Text style={[styles.dayText, endpoint && styles.dayTextSelected]}>{day}</Text>
                </Pressable>
              );
            })}
          </View>
          <PrimaryButton onPress={() => onApply(from, to)}>Aplicar período</PrimaryButton>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

export function LoadState({ loading, error }: { loading?: boolean; error?: unknown }) {
  const { colors, common, styles } = useUi();
  if (loading)
    return (
      <View style={styles.state}>
        <ActivityIndicator color={colors.green} />
        <Text style={common.muted}>Buscando seus dados…</Text>
      </View>
    );
  if (error)
    return (
      <View style={[styles.state, { backgroundColor: colors.dangerSoft }]}>
        <Text style={common.dangerText}>{errorMessage(error)}</Text>
      </View>
    );
  return null;
}

export function Empty({
  children,
  topBorder = true,
  action,
}: {
  children: string;
  topBorder?: boolean;
  action?: ReactNode;
}) {
  const { common, styles } = useUi();
  return (
    <View style={[styles.state, !topBorder && styles.withoutTopBorder]}>
      <Text style={common.muted}>{children}</Text>
      {action}
    </View>
  );
}

export function MonthPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { colors, common, styles } = useUi();
  const shift = (amount: number) => {
    const date = new Date(`${value}-15T12:00:00`);
    date.setMonth(date.getMonth() + amount);
    onChange(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  };
  const label = new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric' }).format(
    new Date(`${value}-15T12:00:00`),
  );
  return (
    <View style={[common.between, styles.month]}>
      <Pressable onPress={() => shift(-1)} hitSlop={12}>
        <ChevronLeft color={colors.ink} />
      </Pressable>
      <Text style={[common.body, { fontWeight: '700', textTransform: 'capitalize' }]}>{label}</Text>
      <Pressable onPress={() => shift(1)} hitSlop={12}>
        <ChevronRight color={colors.ink} />
      </Pressable>
    </View>
  );
}

export type PeriodMode = 'month' | 'year' | 'custom';
export type DateRange = { from: string; to: string };

export function periodBounds(mode: PeriodMode, month: string, range: DateRange): DateRange {
  if (mode === 'custom') return range;
  if (mode === 'year')
    return { from: `${month.slice(0, 4)}-01-01`, to: `${month.slice(0, 4)}-12-31` };
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}` };
}

export function PeriodSelector({
  mode,
  onModeChange,
  month,
  onMonthChange,
  range,
  onRangeChange,
}: {
  mode: PeriodMode;
  onModeChange: (value: PeriodMode) => void;
  month: string;
  onMonthChange: (value: string) => void;
  range: DateRange;
  onRangeChange: (value: DateRange) => void;
}) {
  const { colors, styles } = useUi();
  const [menu, setMenu] = useState(false);
  const [calendar, setCalendar] = useState(false);
  const annual = mode === 'year';
  const custom = mode === 'custom';
  const shift = (amount: number) => {
    const date = new Date(`${month}-15T12:00:00`);
    if (annual) date.setFullYear(date.getFullYear() + amount);
    else date.setMonth(date.getMonth() + amount);
    onMonthChange(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  };
  const label = custom
    ? `${dateLabel(range.from)} — ${dateLabel(range.to)}`
    : annual
      ? month.slice(0, 4)
      : monthLabel(month);
  return (
    <>
      <View style={styles.periodBar}>
        {!custom ? (
          <Pressable style={styles.periodArrow} onPress={() => shift(-1)}>
            <ChevronLeft color={colors.ink} size={22} />
          </Pressable>
        ) : null}
        <Pressable style={styles.periodChoice} onPress={() => setMenu(true)}>
          <CalendarDays color={colors.green} size={20} />
          <View style={styles.periodCopy}>
            <Text style={styles.periodCaption}>
              {custom ? 'PERÍODO PERSONALIZADO' : annual ? 'VISÃO ANUAL' : 'VISÃO MENSAL'}
            </Text>
            <Text style={styles.periodValue}>{label}</Text>
          </View>
          <ChevronDown color={colors.muted} size={18} />
        </Pressable>
        {!custom ? (
          <Pressable style={styles.periodArrow} onPress={() => shift(1)}>
            <ChevronRight color={colors.ink} size={22} />
          </Pressable>
        ) : null}
      </View>
      <ChoiceModal
        visible={menu}
        title="Período da visualização"
        options={[
          { value: 'month', label: 'Mensal', description: 'Dados de um mês' },
          { value: 'year', label: 'Anual', description: 'Resultado acumulado do ano' },
          {
            value: 'custom',
            label: 'Personalizado',
            description: 'Escolha as datas no calendário',
          },
        ]}
        onSelect={(value) => {
          setMenu(false);
          onModeChange(value as PeriodMode);
          if (value === 'custom') setCalendar(true);
        }}
        onClose={() => setMenu(false)}
      />
      {calendar ? (
        <DateRangeModal
          initialFrom={range.from}
          initialTo={range.to}
          onClose={() => setCalendar(false)}
          onApply={(from, to) => {
            onRangeChange({ from, to });
            setCalendar(false);
          }}
        />
      ) : null}
    </>
  );
}

export function Progress({ value, danger = false }: { value: number; danger?: boolean }) {
  const { colors, styles } = useUi();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Progresso"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(Math.max(0, Math.min(100, value))) }}
      style={styles.progress}
    >
      <View
        style={[
          styles.progressFill,
          danger && { backgroundColor: colors.danger },
          { width: `${Math.max(0, Math.min(100, value))}%` },
        ]}
      />
    </View>
  );
}

function SelectInput({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: string;
  onChange: (value: string) => void;
}) {
  const { colors, common, styles } = useUi();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = field.options?.find((option) => option.value === value);
  const filteredOptions = (field.options || []).filter((option) =>
    option.label.toLocaleLowerCase('pt-PT').includes(query.toLocaleLowerCase('pt-PT')),
  );
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${field.label}: ${selected?.label || 'não selecionado'}`}
        style={[common.input, common.between]}
        onPress={() => setOpen(true)}
      >
        <Text style={[common.body, !selected && common.muted]}>
          {selected?.label || 'Selecione'}
        </Text>
        <ChevronDown size={17} color={colors.muted} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.scrim}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <SafeAreaView style={styles.optionSheet} edges={['bottom']}>
            <Text style={[common.value, { fontSize: 16 }]}>{field.label}</Text>
            {(field.options?.length || 0) > 10 ? (
              <TextInput
                accessibilityLabel={`Pesquisar ${field.label}`}
                placeholder="Pesquisar…"
                placeholderTextColor={colors.muted}
                style={common.input}
                value={query}
                onChangeText={setQuery}
              />
            ) : null}
            <ScrollView style={{ maxHeight: 390 }}>
              {field.required === false ? (
                <Pressable
                  style={styles.option}
                  onPress={() => {
                    onChange('');
                    setOpen(false);
                  }}
                >
                  <Text style={common.body}>Nenhum</Text>
                </Pressable>
              ) : null}
              {filteredOptions.map((option: Option) => (
                <Pressable
                  key={option.value}
                  style={[styles.option, option.value === value && styles.optionSelected]}
                  onPress={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <View style={styles.optionCopy}>
                    <Text
                      style={[
                        common.body,
                        option.value === value && { color: colors.green, fontWeight: '700' },
                      ]}
                    >
                      {option.label}
                    </Text>
                    {option.description ? (
                      <Text style={common.muted}>{option.description}</Text>
                    ) : null}
                  </View>
                  <View style={styles.optionIndicator}>
                    {option.value === value ? <Check size={18} color={colors.green} /> : null}
                  </View>
                </Pressable>
              ))}
              {!filteredOptions.length ? (
                <Text style={[common.muted, { paddingVertical: 16 }]}>Nenhum resultado</Text>
              ) : null}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}

function DateInput({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: string;
  onChange: (value: string) => void;
}) {
  const { colors, common, styles } = useUi();
  const [open, setOpen] = useState(false);
  const base = value || currentDate();
  const [cursor, setCursor] = useState(() => new Date(`${base.slice(0, 7)}-15T12:00:00`));
  const year = cursor.getFullYear();
  const monthIndex = cursor.getMonth();
  const firstWeekday = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const monthLength = new Date(year, monthIndex + 1, 0).getDate();
  const cells: Array<number | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: monthLength }, (_, index) => index + 1),
  ];
  while (cells.length % 7) cells.push(null);
  const selectDay = (day: number) => {
    onChange(`${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    setOpen(false);
  };
  const selectMonth = (index: number) => {
    onChange(`${year}-${String(index + 1).padStart(2, '0')}`);
    setOpen(false);
  };
  const move = (amount: number) =>
    setCursor((before) =>
      field.type === 'month'
        ? new Date(before.getFullYear() + amount, before.getMonth(), 15, 12)
        : new Date(before.getFullYear(), before.getMonth() + amount, 15, 12),
    );
  const title =
    field.type === 'month'
      ? String(year)
      : new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric' }).format(cursor);
  return (
    <>
      <Pressable style={[common.input, common.between]} onPress={() => setOpen(true)}>
        <Text style={[common.body, !value && common.muted]}>
          {value
            ? field.type === 'month'
              ? monthLabel(value)
              : dateLabel(value)
            : field.type === 'month'
              ? 'Selecionar mês'
              : 'Selecionar data'}
        </Text>
        <CalendarDays size={18} color={colors.green} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.scrim}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <SafeAreaView style={styles.calendarSheet} edges={['bottom']}>
            <View style={common.between}>
              <Text style={styles.choiceTitle}>{field.label}</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={12}>
                <X color={colors.ink} size={22} />
              </Pressable>
            </View>
            <View style={styles.calendarHeader}>
              <Pressable style={styles.calendarArrow} onPress={() => move(-1)}>
                <ChevronLeft color={colors.ink} size={21} />
              </Pressable>
              <Text style={styles.calendarTitle}>{title}</Text>
              <Pressable style={styles.calendarArrow} onPress={() => move(1)}>
                <ChevronRight color={colors.ink} size={21} />
              </Pressable>
            </View>
            {field.type === 'month' ? (
              <View style={styles.monthGrid}>
                {Array.from({ length: 12 }, (_, index) => {
                  const monthValue = `${year}-${String(index + 1).padStart(2, '0')}`;
                  const selected = value === monthValue;
                  return (
                    <Pressable
                      key={monthValue}
                      accessibilityRole="button"
                      accessibilityLabel={monthLabel(monthValue)}
                      disabled={
                        (!!field.min && monthValue < String(field.min).slice(0, 7)) ||
                        (!!field.max && monthValue > String(field.max).slice(0, 7))
                      }
                      style={[
                        styles.monthCell,
                        selected && styles.monthCellSelected,
                        ((!!field.min && monthValue < String(field.min).slice(0, 7)) ||
                          (!!field.max && monthValue > String(field.max).slice(0, 7))) && {
                          opacity: 0.3,
                        },
                      ]}
                      onPress={() => selectMonth(index)}
                    >
                      <Text style={[styles.monthCellText, selected && styles.dayTextSelected]}>
                        {new Intl.DateTimeFormat('pt-PT', { month: 'short' }).format(
                          new Date(year, index, 15, 12),
                        )}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <>
                <View style={styles.weekRow}>
                  {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((label, index) => (
                    <Text key={`${label}-${index}`} style={styles.weekday}>
                      {label}
                    </Text>
                  ))}
                </View>
                <View style={styles.calendarGrid}>
                  {cells.map((day, index) => {
                    if (!day) return <View key={`blank-${index}`} style={styles.dayCell} />;
                    const dateValue = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const selected = value === dateValue;
                    const disabled =
                      (!!field.min && dateValue < String(field.min).slice(0, 10)) ||
                      (!!field.max && dateValue > String(field.max).slice(0, 10));
                    return (
                      <Pressable
                        key={dateValue}
                        accessibilityRole="button"
                        accessibilityLabel={dateLabel(dateValue)}
                        disabled={disabled}
                        style={[
                          styles.dayCell,
                          selected && styles.daySelected,
                          disabled && { opacity: 0.3 },
                        ]}
                        onPress={() => selectDay(day)}
                      >
                        <Text style={[styles.dayText, selected && styles.dayTextSelected]}>
                          {day}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}
            {field.required === false && value ? (
              <SecondaryButton
                onPress={() => {
                  onChange('');
                  setOpen(false);
                }}
              >
                Remover seleção
              </SecondaryButton>
            ) : null}
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}

function shiftMonth(month: string, delta: number) {
  const [year = 0, index = 1] = month.split('-').map(Number);
  return new Date(Date.UTC(year, index - 1 + delta, 1)).toISOString().slice(0, 7);
}

function monthDate(month: string, day: number) {
  const [year = 0, index = 1] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, index, 0)).getUTCDate();
  return `${month}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

function buildPurchaseSchedule(values: Record<string, string>, card?: Row) {
  if (!card || !values.purchased_on || !values.amount) return [];
  const count = Math.max(1, Math.min(60, Number(values.installments) || 1));
  const normalized = values.amount.replace(',', '.');
  const [whole = '', fraction = ''] = normalized.split('.');
  if (!/^\d+$/.test(whole) || !/^\d{0,2}$/.test(fraction)) return [];
  const cents = BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
  if (cents < BigInt(count)) return [];
  const base = cents / BigInt(count);
  const remainder = Number(cents % BigInt(count));
  const purchaseMonth = values.purchased_on.slice(0, 7);
  const closingMonth =
    values.purchased_on > monthDate(purchaseMonth, Number(card.closing_day))
      ? shiftMonth(purchaseMonth, 1)
      : purchaseMonth;
  const closesOn = monthDate(closingMonth, Number(card.closing_day));
  const sameMonthDue = monthDate(closingMonth, Number(card.due_day));
  const firstDue =
    sameMonthDue > closesOn
      ? sameMonthDue
      : monthDate(shiftMonth(closingMonth, 1), Number(card.due_day));
  return Array.from({ length: count }, (_, index) => {
    const itemCents = base + (index >= count - remainder ? 1n : 0n);
    return {
      number: index + 1,
      amount: `${itemCents / 100n}.${String(itemCents % 100n).padStart(2, '0')}`,
      due_on: monthDate(shiftMonth(firstDue.slice(0, 7), index), Number(firstDue.slice(8, 10))),
      paid: index < Number(values.paid_installments || 0),
    };
  });
}

export function FormModal({ spec, onClose }: { spec: FormSpec | null; onClose: () => void }) {
  const { colors, common, styles } = useUi();
  const initial = useMemo(
    () =>
      Object.fromEntries(
        (spec?.fields || []).map((field) => [field.name, String(field.value ?? '')]),
      ),
    [spec],
  );
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [submitError, setSubmitError] = useState('');
  const [reviewingSchedule, setReviewingSchedule] = useState(false);
  const [schedule, setSchedule] = useState<
    { number: number; amount: string; due_on: string; paid: boolean }[]
  >(
    spec?.purchaseSchedule?.existing?.schedule?.map((item: Row) => ({
      number: Number(item.number),
      amount: String(item.amount),
      due_on: String(item.due_on).slice(0, 10),
      paid: Boolean(item.settled_before_tracking),
    })) || [],
  );
  const [scheduleSource, setScheduleSource] = useState(
    spec?.purchaseSchedule?.existing
      ? [initial.card_id, initial.amount, initial.installments, initial.purchased_on].join('|')
      : '',
  );
  const idempotencyKey = useRef(
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
      const random = Math.floor(Math.random() * 16);
      return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16);
    }),
  );
  const save = useSave();
  if (!spec) return null;
  const persist = async () => {
    setSubmitError('');
    try {
      const method = spec.method || 'POST';
      await save.mutateAsync({
        path: spec.path,
        method,
        data: (() => {
          const mapped = (spec.map ? spec.map(values) : values) as Record<string, unknown>;
          return spec.purchaseSchedule ? { ...mapped, schedule } : mapped;
        })(),
        idempotencyKey: method === 'POST' ? idempotencyKey.current : undefined,
      });
      onClose();
    } catch (error) {
      setSubmitError(errorMessage(error));
    }
  };
  const submit = () => {
    setSubmitError('');
    const visibleFields = spec.fields.filter(
      (field) => !field.visibleWhen || field.visibleWhen(values),
    );
    const missing = visibleFields.find(
      (field) => field.required !== false && !values[field.name]?.trim(),
    );
    if (missing) return Alert.alert('Preencha os dados', `Informe: ${missing.label}.`);
    const invalid = visibleFields.find((field) => {
      const raw = values[field.name]?.trim();
      if (!raw) return false;
      if ((field.type === 'date' || field.type === 'month') && field.min && raw < String(field.min))
        return true;
      if ((field.type === 'date' || field.type === 'month') && field.max && raw > String(field.max))
        return true;
      if (field.type !== 'number') return false;
      const normalized = raw.replace(',', '.');
      if (field.integer && !/^-?\d+$/.test(normalized)) return true;
      if (field.currency && !/^-?(0|[1-9]\d{0,16})(\.\d{1,2})?$/.test(normalized)) return true;
      const numeric = Number(normalized);
      if (!Number.isFinite(numeric)) return true;
      if (field.min !== undefined && numeric < Number(field.min)) return true;
      if (field.max !== undefined && numeric > Number(field.max)) return true;
      return false;
    });
    if (invalid)
      return Alert.alert(
        'Revise os dados',
        `O valor informado em “${invalid.label}” não é válido.`,
      );
    if (spec.purchaseSchedule && !reviewingSchedule) {
      const source = [values.card_id, values.amount, values.installments, values.purchased_on].join(
        '|',
      );
      if (source !== scheduleSource) {
        const card = spec.purchaseSchedule.cards.find((item) => item.id === values.card_id);
        const generated = buildPurchaseSchedule(values, card);
        if (!generated.length) {
          return setSubmitError('Não foi possível calcular as faturas deste cartão.');
        }
        setSchedule(generated);
        setScheduleSource(source);
      }
      setReviewingSchedule(true);
      return;
    }
    if (spec.purchaseSchedule) {
      const invalidInstallment = schedule.find(
        (item) => !item.due_on || !/^(0|[1-9]\d{0,16})([.,]\d{1,2})?$/.test(item.amount),
      );
      if (invalidInstallment)
        return setSubmitError('Confira o vencimento e o valor de todas as parcelas.');
    }
    const confirmation = spec.confirm?.(values);
    if (!confirmation) return void persist();
    Alert.alert(confirmation.title, confirmation.message, [
      { text: 'Voltar e rever', style: 'cancel' },
      {
        text: confirmation.confirmLabel || 'Confirmar',
        onPress: () => void persist(),
      },
    ]);
  };
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => {
        if (!save.isPending) onClose();
      }}
    >
      <SafeAreaView style={styles.modalPage} edges={['top', 'bottom']}>
        <View style={styles.modalHeader}>
          <View style={common.grow}>
            <Text style={[common.title, { fontSize: 23 }]}>{spec.title}</Text>
            {spec.description ? <Text style={common.muted}>{spec.description}</Text> : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fechar formulário"
            disabled={save.isPending}
            onPress={onClose}
            hitSlop={12}
          >
            <X color={colors.ink} />
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={{ padding: 18, gap: 14 }}
          keyboardShouldPersistTaps="handled"
        >
          {reviewingSchedule ? (
            <>
              <Text style={common.value}>Rever faturas</Text>
              <Text style={common.muted}>
                Confira e ajuste valores, vencimentos e parcelas que já estavam pagas.
              </Text>
              {schedule.map((item, index) => (
                <View key={item.number} style={{ gap: 8, paddingVertical: 8 }}>
                  <Text style={common.label}>PARCELA {item.number}</Text>
                  <DateInput
                    field={{ name: `due_${item.number}`, label: 'Vencimento', type: 'date' }}
                    value={item.due_on}
                    onChange={(value) =>
                      setSchedule((before) =>
                        before.map((current, position) =>
                          position === index ? { ...current, due_on: value } : current,
                        ),
                      )
                    }
                  />
                  <TextInput
                    accessibilityLabel={`Valor da parcela ${item.number}`}
                    style={common.input}
                    keyboardType="decimal-pad"
                    value={item.amount}
                    onChangeText={(value) =>
                      setSchedule((before) =>
                        before.map((current, position) =>
                          position === index ? { ...current, amount: value } : current,
                        ),
                      )
                    }
                  />
                  <View style={common.between}>
                    <Text style={common.muted}>Já estava paga</Text>
                    <Switch
                      value={item.paid}
                      onValueChange={(paid) =>
                        setSchedule((before) =>
                          before.map((current, position) =>
                            position === index ? { ...current, paid } : current,
                          ),
                        )
                      }
                    />
                  </View>
                </View>
              ))}
              <SecondaryButton onPress={() => setReviewingSchedule(false)}>Voltar</SecondaryButton>
            </>
          ) : (
            spec.fields
              .filter((field) => !field.visibleWhen || field.visibleWhen(values))
              .map((field) => (
                <View key={field.name} style={{ gap: 6 }}>
                  <Text style={common.label}>{field.label}</Text>
                  {field.type === 'checkbox' ? (
                    <View style={[common.between, { minHeight: 44 }]}>
                      <Text style={common.muted}>
                        {values[field.name] === 'yes' ? 'Sim' : 'Não'}
                      </Text>
                      <Switch
                        value={values[field.name] === 'yes'}
                        onValueChange={(checked) =>
                          setValues((before) => ({
                            ...before,
                            [field.name]: checked ? 'yes' : 'no',
                          }))
                        }
                        trackColor={{ false: colors.lineStrong, true: colors.greenSoft }}
                        thumbColor={values[field.name] === 'yes' ? colors.green : colors.muted}
                      />
                    </View>
                  ) : field.type === 'select' ? (
                    <SelectInput
                      field={field}
                      value={values[field.name] || ''}
                      onChange={(value) =>
                        setValues((before) => ({ ...before, [field.name]: value }))
                      }
                    />
                  ) : field.type === 'date' || field.type === 'month' ? (
                    <DateInput
                      field={field}
                      value={values[field.name] || ''}
                      onChange={(value) =>
                        setValues((before) => ({ ...before, [field.name]: value }))
                      }
                    />
                  ) : (
                    <TextInput
                      style={[
                        common.input,
                        field.type === 'textarea' && {
                          minHeight: 100,
                          textAlignVertical: 'top',
                          paddingTop: 13,
                        },
                      ]}
                      value={values[field.name] || ''}
                      onChangeText={(value) =>
                        setValues((before) => ({ ...before, [field.name]: value }))
                      }
                      keyboardType={field.type === 'number' ? 'decimal-pad' : 'default'}
                      autoCapitalize="sentences"
                      multiline={field.type === 'textarea'}
                    />
                  )}
                  {field.hint ? <Text style={common.muted}>{field.hint}</Text> : null}
                </View>
              ))
          )}
          {submitError ? (
            <Text accessibilityRole="alert" style={common.dangerText}>
              {submitError}
            </Text>
          ) : null}
          <PrimaryButton onPress={submit} disabled={save.isPending}>
            {save.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={common.buttonText}>
                {spec.purchaseSchedule
                  ? reviewingSchedule
                    ? spec.method === 'PATCH'
                      ? 'Guardar alterações'
                      : 'Criar compra'
                    : 'Rever faturas'
                  : spec.submitLabel || 'Guardar'}
              </Text>
            )}
          </PrimaryButton>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

export function confirmAction(title: string, message: string, action: () => Promise<unknown>) {
  Alert.alert(title, message, [
    { text: 'Cancelar', style: 'cancel' },
    {
      text: 'Confirmar',
      style: 'destructive',
      onPress: () =>
        void action().catch((error) =>
          Alert.alert('Não foi possível concluir', errorMessage(error)),
        ),
    },
  ]);
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    pageHeader: {
      gap: 18,
      marginBottom: 22,
      paddingBottom: 24,
      borderBottomColor: colors.lineStrong,
      borderBottomWidth: 1,
    },
    headerAction: { width: '100%' },
    withoutTopBorder: { borderTopWidth: 0 },
    withoutBottomBorder: { borderBottomWidth: 0 },
    cardHeader: {
      paddingBottom: 12,
      marginBottom: 2,
      borderBottomColor: colors.line,
      borderBottomWidth: 1,
    },
    cardTitle: { color: colors.ink, fontSize: 16, lineHeight: 22, fontWeight: '700' },
    state: {
      minHeight: 96,
      padding: 18,
      borderRadius: 0,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surfaceSoft,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    month: {
      borderWidth: 1,
      borderColor: colors.lineStrong,
      borderRadius: 4,
      backgroundColor: colors.surface,
      minHeight: 44,
      paddingHorizontal: 10,
      marginBottom: 14,
    },
    periodBar: {
      flexDirection: 'row',
      alignItems: 'stretch',
      minHeight: 68,
      borderWidth: 1,
      borderColor: colors.lineStrong,
      borderRadius: 12,
      backgroundColor: colors.surface,
      overflow: 'hidden',
      marginBottom: 18,
    },
    periodArrow: { width: 48, alignItems: 'center', justifyContent: 'center' },
    periodChoice: {
      flex: 1,
      paddingHorizontal: 12,
      paddingVertical: 11,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    periodCopy: { flex: 1, alignItems: 'center', gap: 2 },
    periodCaption: { color: colors.green, fontSize: 9, fontWeight: '700', letterSpacing: 1.1 },
    periodValue: { color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: '700' },
    progress: { height: 5, backgroundColor: colors.line, borderRadius: 3, overflow: 'hidden' },
    progressFill: { height: 5, backgroundColor: colors.green, borderRadius: 3 },
    scrim: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
    optionSheet: {
      maxHeight: '70%',
      padding: 20,
      paddingBottom: 34,
      borderTopLeftRadius: 6,
      borderTopRightRadius: 6,
      backgroundColor: colors.surface,
      gap: 12,
    },
    choiceSheet: {
      padding: 20,
      paddingBottom: 34,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      backgroundColor: colors.surface,
      gap: 18,
    },
    choiceTitle: { color: colors.ink, fontSize: 20, lineHeight: 26, fontWeight: '700' },
    choiceList: { gap: 10 },
    choiceOption: {
      minHeight: 72,
      paddingHorizontal: 16,
      paddingVertical: 13,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 12,
      backgroundColor: colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    choiceOptionPressed: { backgroundColor: colors.greenSoft, borderColor: colors.green },
    choiceLabel: { color: colors.ink, fontSize: 15, lineHeight: 21, fontWeight: '700' },
    calendarSheet: {
      padding: 20,
      paddingBottom: 20,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      backgroundColor: colors.surface,
      gap: 16,
    },
    rangeSummary: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 13,
      borderRadius: 12,
      backgroundColor: colors.greenSoft,
    },
    rangeValue: { color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: '700' },
    calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    calendarArrow: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    calendarTitle: {
      color: colors.ink,
      fontSize: 15,
      fontWeight: '700',
      textTransform: 'capitalize',
    },
    weekRow: { flexDirection: 'row' },
    weekday: {
      width: '14.2857%',
      textAlign: 'center',
      color: colors.muted,
      fontSize: 10,
      fontWeight: '700',
    },
    calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    monthCell: {
      width: '31%',
      minHeight: 48,
      borderRadius: 10,
      backgroundColor: colors.surfaceSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    monthCellSelected: { backgroundColor: colors.green },
    monthCellText: {
      color: colors.ink,
      fontSize: 13,
      fontWeight: '600',
      textTransform: 'capitalize',
    },
    dayCell: {
      width: '14.2857%',
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayInRange: { backgroundColor: colors.greenSoft },
    daySelected: { backgroundColor: colors.green, borderRadius: 20 },
    dayText: { color: colors.ink, fontSize: 13, fontWeight: '500' },
    dayTextSelected: { color: '#fff', fontWeight: '700' },
    option: {
      minHeight: 58,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.line,
      paddingHorizontal: 6,
      paddingVertical: 9,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      justifyContent: 'center',
    },
    optionSelected: { backgroundColor: colors.greenSoft },
    optionCopy: { flex: 1, minWidth: 0, justifyContent: 'center' },
    optionIndicator: { width: 22, alignItems: 'center', justifyContent: 'center' },
    modalPage: { flex: 1, backgroundColor: colors.paper },
    modalHeader: {
      padding: 18,
      paddingTop: 16,
      backgroundColor: colors.surface,
      borderBottomColor: colors.line,
      borderBottomWidth: 1,
      flexDirection: 'row',
      gap: 12,
    },
  });
