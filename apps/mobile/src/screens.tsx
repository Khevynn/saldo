import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Archive,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  CreditCard,
  Landmark,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Trash2,
  Wallet,
} from 'lucide-react-native';
import {
  currentDate,
  dateLabel,
  errorMessage,
  euro,
  monthLabel,
  type Row,
  useData,
  useSave,
} from './api';
import {
  accountForm,
  budgetForm,
  cardForm,
  categoryForm,
  createBudgetForm,
  futurePlanItemForm,
  futurePlanForm,
  futurePlanPocketForm,
  goalForm,
  purchaseForm,
  recurrenceEditForm,
  recurrenceForm,
  transactionForm,
  type FormSpec,
} from './forms';
import {
  AddButton,
  Card,
  ChoiceModal,
  confirmAction,
  type DateRange,
  Empty,
  FormModal,
  Header,
  LoadState,
  periodBounds,
  type PeriodMode,
  PeriodSelector,
  PrimaryButton,
  Progress,
  Screen,
  SecondaryButton,
} from './components';
import { useTheme, type ThemeColors, type ThemePreference } from './theme';

type Shared = {
  month: string;
  setMonth: (value: string) => void;
  accounts: Row[];
  categories: Row[];
  expenseRolloverDay: number;
  navigate: (route: string) => void;
};

export function SettingsScreen() {
  const { colors, common, preference, setPreference } = useTheme();
  const profile = useData<Row>('/me');
  const save = useSave();
  const [day, setDay] = useState(25);
  useEffect(() => {
    if (profile.data?.expense_rollover_day) setDay(Number(profile.data.expense_rollover_day));
  }, [profile.data?.expense_rollover_day]);
  const storeDay = async () => {
    try {
      const result = (await save.mutateAsync({
        path: '/me',
        method: 'PATCH',
        data: { expense_rollover_day: day },
      })) as Row;
      Alert.alert(
        'Preferência guardada',
        `Despesas feitas a partir do dia ${result.expense_rollover_day} serão sugeridas para o mês seguinte.`,
      );
    } catch (error) {
      Alert.alert('Não foi possível guardar', errorMessage(error));
    }
  };
  const themes: { value: ThemePreference; label: string }[] = [
    { value: 'system', label: 'Automático' },
    { value: 'light', label: 'Claro' },
    { value: 'dark', label: 'Escuro' },
  ];
  return (
    <Screen refreshing={profile.isFetching} onRefresh={() => void profile.refetch()}>
      <Header
        eyebrow="PREFERÊNCIAS"
        title="Configurações"
        description="Ajustes gerais do seu espaço financeiro."
      />
      <LoadState loading={profile.isLoading} error={profile.error} />
      <Card title="Mês financeiro">
        <Text style={common.body}>
          Escolha o dia em que as despesas passam a pertencer ao mês seguinte.
        </Text>
        <Text style={common.muted}>
          Exemplo: com dia {day}, uma despesa nessa data será sugerida para o mês seguinte.
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {Array.from({ length: 31 }, (_, index) => index + 1).map((value) => (
            <Pressable
              key={value}
              onPress={() => setDay(value)}
              style={{
                width: 43,
                height: 43,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: day === value ? colors.green : colors.lineStrong,
                backgroundColor: day === value ? colors.green : colors.surface,
                borderRadius: 22,
              }}
            >
              <Text style={{ color: day === value ? '#fff' : colors.ink, fontWeight: '700' }}>
                {value}
              </Text>
            </Pressable>
          ))}
        </View>
        <PrimaryButton
          onPress={() => void storeDay()}
          disabled={save.isPending || day === Number(profile.data?.expense_rollover_day)}
        >
          Guardar dia {day}
        </PrimaryButton>
      </Card>
      <Card title="Aparência">
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {themes.map((item) => (
            <Pressable
              key={item.value}
              onPress={() => setPreference(item.value)}
              style={{
                flex: 1,
                paddingVertical: 13,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: preference === item.value ? colors.green : colors.lineStrong,
                backgroundColor: preference === item.value ? colors.greenSoft : colors.surface,
                borderRadius: 8,
              }}
            >
              <Text
                style={{
                  color: preference === item.value ? colors.green : colors.ink,
                  fontWeight: '700',
                }}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </Card>
    </Screen>
  );
}

const makeDashboardStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    metricGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      borderBottomWidth: 1,
      borderColor: colors.lineStrong,
      marginBottom: 0,
    },
    metric: { width: '50%', minHeight: 142, paddingVertical: 15, paddingHorizontal: 12 },
    metricOdd: { paddingLeft: 0, borderRightWidth: 1, borderRightColor: colors.line },
    metricTop: { borderBottomWidth: 1, borderBottomColor: colors.line },
    metricHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    metricValue: {
      color: colors.ink,
      fontSize: 22,
      lineHeight: 29,
      fontWeight: '700',
      letterSpacing: -0.7,
      marginTop: 18,
    },
    insightGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
      marginBottom: 12,
    },
    insight: { width: '50%', paddingVertical: 7, paddingRight: 10 },
    insightValue: {
      color: colors.ink,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '700',
      marginTop: 2,
    },
    listRow: {
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.line,
    },
    accountIcon: {
      width: 36,
      height: 36,
      borderRadius: 4,
      backgroundColor: colors.greenSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    category: { paddingVertical: 5, gap: 7 },
  });

const makeCardStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    overview: {
      padding: 18,
      borderRadius: 14,
      backgroundColor: colors.greenSoft,
      gap: 5,
      marginBottom: 18,
    },
    overviewLabel: { color: colors.greenDark, fontSize: 12, fontWeight: '600' },
    overviewValue: { color: colors.ink, fontSize: 28, lineHeight: 35, fontWeight: '700' },
    wallet: {
      minHeight: 166,
      padding: 20,
      borderRadius: 16,
      backgroundColor: colors.sidebar,
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    walletBrand: { color: '#b7c7c1', fontSize: 11, fontWeight: '700', letterSpacing: 1.6 },
    walletName: { color: '#fff', fontSize: 21, lineHeight: 27, fontWeight: '700' },
    walletMeta: { color: '#d8e3df', fontSize: 12, lineHeight: 18 },
    tabs: {
      flexDirection: 'row',
      padding: 4,
      borderRadius: 10,
      backgroundColor: colors.surfaceSoft,
      marginBottom: 4,
    },
    tab: {
      flex: 1,
      minHeight: 42,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
    },
    tabActive: { backgroundColor: colors.surface },
    tabText: { color: colors.muted, fontSize: 13, fontWeight: '600' },
    tabTextActive: { color: colors.green, fontWeight: '700' },
    entry: { gap: 10, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line },
    status: {
      alignSelf: 'flex-start',
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: colors.greenSoft,
    },
    statusText: { color: colors.greenDark, fontSize: 10, fontWeight: '700' },
  });

const makeAccountStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    section: {
      marginBottom: 24,
      backgroundColor: 'transparent',
    },
    sectionHeader: {
      minHeight: 62,
      paddingHorizontal: 10,
      paddingVertical: 12,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.lineStrong,
      backgroundColor: 'transparent',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    sectionIdentity: { flexDirection: 'row', alignItems: 'center', gap: 9 },
    sectionIcon: {
      width: 34,
      height: 34,
      borderRadius: 8,
      backgroundColor: colors.greenSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sectionTitle: {
      color: colors.ink,
      fontSize: 15,
      lineHeight: 21,
      fontWeight: '700',
    },
    count: {
      minWidth: 25,
      height: 25,
      paddingHorizontal: 7,
      borderRadius: 13,
      backgroundColor: colors.surfaceSoft,
      color: colors.muted,
      fontSize: 11,
      lineHeight: 25,
      fontWeight: '700',
      textAlign: 'center',
    },
    accountRow: {
      paddingHorizontal: 10,
      paddingVertical: 15,
      gap: 12,
      backgroundColor: 'transparent',
    },
    accountRowDivider: { borderTopWidth: 1, borderTopColor: colors.line },
    accountMain: { flexDirection: 'row', alignItems: 'center', gap: 11 },
    accountIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: colors.greenSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
    action: {
      minHeight: 32,
      paddingHorizontal: 6,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
    },
    editAction: { backgroundColor: 'transparent' },
    actionText: { color: colors.muted, fontSize: 11, fontWeight: '600' },
    editText: { color: colors.greenDark },
  });

const makeFilterStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      padding: 4,
      marginBottom: 18,
      borderRadius: 12,
      backgroundColor: colors.surfaceSoft,
      borderWidth: 1,
      borderColor: colors.line,
    },
    option: {
      flex: 1,
      minHeight: 40,
      paddingHorizontal: 4,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    optionActive: { backgroundColor: colors.green },
    text: { color: colors.muted, fontSize: 10, fontWeight: '600' },
    textActive: { color: '#fff', fontWeight: '700' },
  });

function suggestedReferenceMonth(dueOn: string, rolloverDay = 25) {
  const year = Number(dueOn.slice(0, 4));
  const month = Number(dueOn.slice(5, 7));
  const day = Number(dueOn.slice(8, 10));
  const monthIndex = year * 12 + month - 1 + (day >= rolloverDay ? 1 : 0);
  return `${Math.floor(monthIndex / 12)}-${String((monthIndex % 12) + 1).padStart(2, '0')}`;
}

function Actions({ onEdit, onDelete }: { onEdit?: () => void; onDelete?: () => void }) {
  const { colors, common } = useTheme();
  return (
    <View style={common.row}>
      {onEdit ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Editar"
          onPress={onEdit}
          hitSlop={10}
        >
          <Pencil size={18} color={colors.green} />
        </Pressable>
      ) : null}
      {onDelete ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Excluir"
          onPress={onDelete}
          hitSlop={10}
        >
          <Trash2 size={18} color={colors.danger} />
        </Pressable>
      ) : null}
    </View>
  );
}

function FormHost({ spec, close }: { spec: FormSpec | null; close: () => void }) {
  return spec ? <FormModal key={`${spec.path}-${spec.title}`} spec={spec} onClose={close} /> : null;
}

export function DashboardScreen({ month, setMonth }: Shared) {
  const { colors, common } = useTheme();
  const dashboardStyles = useMemo(() => makeDashboardStyles(colors), [colors]);
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month');
  const [range, setRange] = useState<DateRange>({ from: `${month}-01`, to: currentDate() });
  const annual = periodMode === 'year';
  const custom = periodMode === 'custom';
  const query = useData<Row>(
    custom
      ? `/reports/period?from=${range.from}&to=${range.to}`
      : annual
        ? `/reports/annual?year=${month.slice(0, 4)}`
        : `/reports/overview?month=${month}`,
  );
  const goals = useData<Row[]>('/goals');
  const result = query.data;
  return (
    <Screen
      refreshing={query.isFetching || goals.isFetching}
      onRefresh={() => {
        void query.refetch();
        void goals.refetch();
      }}
    >
      <Header
        eyebrow="VISÃO GERAL"
        title="Resumo financeiro"
        divider={false}
        action={
          <PeriodSelector
            mode={periodMode}
            onModeChange={setPeriodMode}
            month={month}
            onMonthChange={setMonth}
            range={range}
            onRangeChange={setRange}
          />
        }
      />
      <LoadState loading={query.isLoading} error={query.error} />
      {result ? (
        <>
          <View style={dashboardStyles.metricGrid}>
            {[
              ['Total nas contas', result.total, Wallet, `Posição em ${dateLabel(result.as_of)}`],
              [
                custom ? 'Receitas do período' : `Receitas do ${annual ? 'ano' : 'mês'}`,
                result.income,
                ArrowDownLeft,
                'Apenas valores recebidos',
              ],
              [
                custom ? 'Despesas do período' : `Despesas do ${annual ? 'ano' : 'mês'}`,
                result.expense,
                ArrowUpRight,
                'Pagamentos e perdas realizados',
              ],
              [
                custom ? 'Sobra do período' : `Sobra do ${annual ? 'ano' : 'mês'}`,
                result.surplus,
                Landmark,
                'Receitas menos despesas',
              ],
            ].map(([label, value, Icon, note], index) => (
              <View
                key={String(label)}
                style={[
                  dashboardStyles.metric,
                  index % 2 === 0 && dashboardStyles.metricOdd,
                  index < 2 && dashboardStyles.metricTop,
                ]}
              >
                <View style={dashboardStyles.metricHeader}>
                  <Text style={common.label}>{String(label)}</Text>
                  <Icon size={18} color={colors.muted} />
                </View>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={[
                    dashboardStyles.metricValue,
                    String(label).startsWith('Sobra do') && Number(value) < 0 && common.dangerText,
                  ]}
                >
                  {euro(value)}
                </Text>
                <Text style={common.muted}>{String(note)}</Text>
              </View>
            ))}
          </View>
          <View style={dashboardStyles.insightGrid}>
            {[
              ['Reservas', result.reserved],
              ['Disponível no dia a dia', result.available],
              ['Benefícios', result.restricted],
              ['Dívidas do cartão', result.debt],
              ['Saldo líquido acompanhado', result.net],
            ].map(([label, value]) => (
              <View key={String(label)} style={dashboardStyles.insight}>
                <Text style={common.muted}>{String(label)}</Text>
                <Text style={dashboardStyles.insightValue}>{euro(value)}</Text>
              </View>
            ))}
          </View>
          <Card title="Suas contas">
            {result.accounts?.length ? (
              result.accounts.slice(0, 6).map((row: Row) => (
                <View style={[common.between, dashboardStyles.listRow]} key={row.id}>
                  <View style={dashboardStyles.accountIcon}>
                    <Wallet size={17} color={colors.green} />
                  </View>
                  <View style={common.grow}>
                    <Text style={common.body}>{row.name}</Text>
                    <Text style={common.muted}>
                      {row.purpose === 'reserved'
                        ? 'Reserva'
                        : row.purpose === 'restricted'
                          ? 'Restrito'
                          : 'Disponível'}
                    </Text>
                  </View>
                  <Text style={common.value}>{euro(row.balance)}</Text>
                </View>
              ))
            ) : (
              <Empty>Cadastre sua primeira conta para começar.</Empty>
            )}
          </Card>
          <Card title="Evolução das contas">
            {result.evolution?.length ? (
              result.evolution.slice(-6).map((row: Row) => (
                <View key={row.month} style={common.between}>
                  <Text style={common.muted}>{monthLabel(row.month)}</Text>
                  <Text style={common.value}>{euro(row.balance)}</Text>
                </View>
              ))
            ) : (
              <Empty>O histórico aparecerá conforme você acompanhar suas contas.</Empty>
            )}
          </Card>
          <Card title="Entradas e saídas">
            {result.evolution?.length ? (
              result.evolution.slice(-6).map((row: Row) => (
                <View key={row.month} style={{ gap: 5 }}>
                  <Text style={common.muted}>{monthLabel(row.month)}</Text>
                  <View style={common.between}>
                    <Text style={{ color: colors.green }}>Receitas {euro(row.income)}</Text>
                    <Text style={common.body}>Despesas {euro(row.expense)}</Text>
                  </View>
                </View>
              ))
            ) : (
              <Empty>Nenhuma movimentação neste período.</Empty>
            )}
          </Card>
          <Card title="Despesas por categoria">
            {result.categories?.length ? (
              result.categories.slice(0, 8).map((row: Row) => {
                const largest = Math.max(
                  0,
                  ...result.categories.map((category: Row) => Number(category.amount)),
                );
                const budget = result.budgets?.find(
                  (item: Row) => item.category_id === row.category_id || item.name === row.name,
                );
                const exceeded =
                  budget?.budget != null && Number(row.amount) > Number(budget.budget);
                return (
                  <View style={dashboardStyles.category} key={row.category_id || row.name}>
                    <View style={common.between}>
                      <Text style={common.body}>{row.name}</Text>
                      <Text style={[common.value, { fontSize: 13 }, exceeded && common.dangerText]}>
                        {euro(row.amount)}
                      </Text>
                    </View>
                    <Progress value={largest ? (Number(row.amount) / largest) * 100 : 0} />
                  </View>
                );
              })
            ) : (
              <Empty>Nenhuma despesa neste período.</Empty>
            )}
          </Card>
          <Card title="Seus objetivos">
            {goals.data?.filter((row) => !row.archived).length ? (
              goals.data
                .filter((row) => !row.archived)
                .slice(0, 3)
                .map((row) => (
                  <View key={row.id} style={{ gap: 6 }}>
                    <View style={common.between}>
                      <Text style={common.body}>{row.name}</Text>
                      <Text style={common.value}>{row.progress}%</Text>
                    </View>
                    <Text style={common.muted}>
                      {euro(row.balance)} de {euro(row.target)}
                    </Text>
                    <Progress value={Number(row.progress)} />
                  </View>
                ))
            ) : (
              <Empty>Associe uma meta a um cofrinho para acompanhar o progresso.</Empty>
            )}
          </Card>
          {!custom ? (
            <Card title="Atenção ao orçamento">
              {result.budgets?.filter(
                (row: Row) =>
                  row.budget != null &&
                  Number(row.spent) >= Number(row.budget) * 0.8 &&
                  Number(row.spent) > 0,
              ).length ? (
                result.budgets
                  .filter(
                    (row: Row) =>
                      row.budget != null &&
                      Number(row.spent) >= Number(row.budget) * 0.8 &&
                      Number(row.spent) > 0,
                  )
                  .slice(0, 3)
                  .map((row: Row) => (
                    <View key={row.category_id} style={common.between}>
                      <Text style={common.body}>{row.name}</Text>
                      <Text
                        style={[
                          common.value,
                          Number(row.spent) > Number(row.budget) && common.dangerText,
                        ]}
                      >
                        {euro(row.spent)} / {euro(row.budget)}
                      </Text>
                    </View>
                  ))
              ) : (
                <Text style={common.muted}>Nenhuma categoria próxima do limite.</Text>
              )}
            </Card>
          ) : null}
          {!custom ? (
            <Card title="Consistência">
              <View style={common.between}>
                <Text style={common.body}>Sobra média mensal</Text>
                <Text style={common.value}>
                  {result.average_surplus == null ? '—' : euro(result.average_surplus)}
                </Text>
              </View>
              <View style={common.between}>
                <Text style={common.body}>Taxa de poupança</Text>
                <Text style={common.value}>
                  {result.savings_rate == null ? '—' : `${result.savings_rate}%`}
                </Text>
              </View>
            </Card>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

export function AccountsScreen({ accounts }: Shared) {
  const { colors, common } = useTheme();
  const accountStyles = useMemo(() => makeAccountStyles(colors), [colors]);
  const [form, setForm] = useState<FormSpec | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const save = useSave();
  const query = useData('/accounts');
  const rows = (query.data as Row[] | undefined) || accounts;
  const activeGroups = [
    {
      title: 'Dia a dia',
      icon: Wallet,
      rows: rows.filter((row) => !row.archived && row.purpose === 'available'),
    },
    {
      title: 'Reservas',
      icon: Landmark,
      rows: rows.filter((row) => !row.archived && row.purpose === 'reserved'),
    },
    {
      title: 'Benefícios',
      icon: CreditCard,
      rows: rows.filter((row) => !row.archived && row.purpose === 'restricted'),
    },
  ].filter((group) => group.rows.length);
  const archivedRows = rows.filter((row) => row.archived);
  const groups = showArchived
    ? [{ title: 'Arquivadas', icon: Archive, rows: archivedRows }]
    : activeGroups;
  return (
    <Screen refreshing={query.isFetching} onRefresh={() => void query.refetch()}>
      <Header
        eyebrow="CONTAS"
        title="Cada saldo no seu lugar."
        description="Contas, benefícios e cofrinhos. Sem duplicar seu dinheiro."
        action={<AddButton label="Nova conta" onPress={() => setForm(accountForm())} />}
      />
      <LoadState loading={query.isLoading} error={query.error} />
      {archivedRows.length ? (
        <SecondaryButton onPress={() => setShowArchived((value) => !value)}>
          {showArchived ? 'Voltar às contas ativas' : `Ver arquivadas (${archivedRows.length})`}
        </SecondaryButton>
      ) : null}
      {!rows.length ? (
        <Empty>Cadastre sua primeira conta.</Empty>
      ) : (
        groups.map((group) => (
          <View key={group.title} style={accountStyles.section}>
            <View style={accountStyles.sectionHeader}>
              <View style={accountStyles.sectionIdentity}>
                <View style={accountStyles.sectionIcon}>
                  <group.icon size={17} color={colors.green} />
                </View>
                <Text style={accountStyles.sectionTitle}>{group.title}</Text>
              </View>
              <Text style={accountStyles.count}>{group.rows.length}</Text>
            </View>
            {group.rows.map((row, index) => (
              <View
                key={row.id}
                style={[accountStyles.accountRow, index > 0 && accountStyles.accountRowDivider]}
              >
                <View style={accountStyles.accountMain}>
                  <View style={accountStyles.accountIcon}>
                    <group.icon size={17} color={colors.green} />
                  </View>
                  <View style={common.grow}>
                    <Text style={common.value}>{row.name}</Text>
                    <Text style={common.muted}>Desde {dateLabel(row.opening_date)}</Text>
                  </View>
                  <Text style={[common.value, Number(row.balance) < 0 && common.dangerText]}>
                    {euro(row.balance)}
                  </Text>
                </View>
                <View style={accountStyles.actions}>
                  <Pressable
                    style={[accountStyles.action, accountStyles.editAction]}
                    onPress={() => setForm(accountForm(row))}
                  >
                    <Pencil size={15} color={colors.green} />
                    <Text style={[accountStyles.actionText, accountStyles.editText]}>Editar</Text>
                  </Pressable>
                  <Pressable
                    style={accountStyles.action}
                    onPress={() =>
                      confirmAction(
                        row.archived ? 'Reativar conta' : 'Arquivar conta',
                        'O histórico será preservado. Para arquivar, o saldo precisa estar zerado.',
                        () =>
                          save.mutateAsync({
                            path: `/accounts/${row.id}`,
                            method: 'PATCH',
                            data: { archived: !row.archived },
                          }),
                      )
                    }
                  >
                    <Archive size={15} color={colors.ink} />
                    <Text style={accountStyles.actionText}>
                      {row.archived ? 'Reativar' : 'Arquivar'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        ))
      )}
      <FormHost spec={form} close={() => setForm(null)} />
    </Screen>
  );
}

export function TransactionsScreen({
  month,
  setMonth,
  accounts,
  categories,
  expenseRolloverDay,
  navigate,
}: Shared) {
  const { colors, common } = useTheme();
  const filterStyles = useMemo(() => makeFilterStyles(colors), [colors]);
  const [form, setForm] = useState<FormSpec | null>(null);
  const [kindPicker, setKindPicker] = useState(false);
  const [kindFilter, setKindFilter] = useState<'all' | 'income' | 'expense' | 'transfer'>('all');
  const [accountPicker, setAccountPicker] = useState(false);
  const [accountId, setAccountId] = useState('');
  const [page, setPage] = useState(1);
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month');
  const [range, setRange] = useState<DateRange>({ from: `${month}-01`, to: currentDate() });
  const bounds = periodBounds(periodMode, month, range);
  const query = useData<Row[]>(
    `/transactions?from=${bounds.from}&to=${bounds.to}&page=${page}&limit=50${accountId ? `&account_id=${accountId}` : ''}`,
  );
  const transfers = useData<Row[]>('/transactions/transfers');
  const save = useSave();
  const hasActiveAccount = accounts.some((account) => !account.archived);
  const choose = (kind: string) => {
    setKindPicker(false);
    setForm(
      transactionForm(
        accounts,
        categories,
        kind,
        undefined,
        transfers.data || [],
        expenseRolloverDay,
      ),
    );
  };
  const visibleRows =
    query.data?.filter((row) => kindFilter === 'all' || row.kind === kindFilter) || [];
  const filters = [
    { value: 'all', label: 'Todas' },
    { value: 'income', label: 'Entradas' },
    { value: 'expense', label: 'Saídas' },
    { value: 'transfer', label: 'Transf.' },
  ] as const;
  return (
    <Screen
      refreshing={query.isFetching || transfers.isFetching}
      onRefresh={() => {
        void query.refetch();
        void transfers.refetch();
      }}
    >
      <Header
        eyebrow="MOVIMENTAÇÕES"
        title="O que aconteceu de verdade."
        description="Receitas, despesas e transferências registradas por você."
        action={
          hasActiveAccount ? (
            <AddButton label="Nova movimentação" onPress={() => setKindPicker(true)} />
          ) : undefined
        }
      />
      <PeriodSelector
        mode={periodMode}
        onModeChange={(value) => {
          setPeriodMode(value);
          setPage(1);
        }}
        month={month}
        onMonthChange={(value) => {
          setMonth(value);
          setPage(1);
        }}
        range={range}
        onRangeChange={(value) => {
          setRange(value);
          setPage(1);
        }}
      />
      {!hasActiveAccount ? (
        <Empty
          topBorder={false}
          action={
            <SecondaryButton onPress={() => navigate('accounts')}>Ir para Contas</SecondaryButton>
          }
        >
          Crie uma conta ativa na área de Contas antes de registrar movimentações.
        </Empty>
      ) : null}
      <View style={filterStyles.bar}>
        {filters.map((filter) => {
          const active = kindFilter === filter.value;
          return (
            <Pressable
              key={filter.value}
              style={[filterStyles.option, active && filterStyles.optionActive]}
              onPress={() => setKindFilter(filter.value)}
            >
              <Text style={[filterStyles.text, active && filterStyles.textActive]}>
                {filter.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <SecondaryButton onPress={() => setAccountPicker(true)}>
        {accountId
          ? `Conta: ${accounts.find((account) => account.id === accountId)?.name || 'selecionada'}`
          : 'Todas as contas'}
      </SecondaryButton>
      <ChoiceModal
        visible={accountPicker}
        title="Filtrar por conta"
        options={[
          { value: '', label: 'Todas as contas' },
          ...accounts
            .filter((account) => !account.archived)
            .map((account) => ({ value: account.id, label: account.name })),
        ]}
        onSelect={(value) => {
          setAccountId(value);
          setPage(1);
          setAccountPicker(false);
        }}
        onClose={() => setAccountPicker(false)}
      />
      <ChoiceModal
        visible={kindPicker}
        title="O que deseja adicionar?"
        options={[
          { value: 'expense', label: 'Despesa', description: 'Pagamento ou dinheiro que saiu' },
          { value: 'income', label: 'Receita', description: 'Dinheiro recebido em uma conta' },
          { value: 'transfer', label: 'Transferência', description: 'Movimento entre suas contas' },
        ]}
        onSelect={choose}
        onClose={() => setKindPicker(false)}
      />
      <LoadState loading={query.isLoading} error={query.error} />
      {!query.isLoading && !visibleRows.length ? (
        <Empty topBorder={false}>Nenhuma movimentação com este filtro.</Empty>
      ) : (
        visibleRows.map((row, index) => (
          <Card key={row.id} topBorder={index !== 0}>
            <View style={common.between}>
              <View style={common.grow}>
                <Text style={common.value}>{row.description}</Text>
                <Text style={common.muted}>
                  {row.category_name ||
                    (row.kind === 'income'
                      ? 'Receita'
                      : row.kind === 'transfer'
                        ? 'Transferência'
                        : 'Despesa')}{' '}
                  · {dateLabel(row.occurred_on)}
                </Text>
              </View>
              <Text style={[common.value, row.kind === 'income' && { color: colors.green }]}>
                {row.kind === 'income' ? '+' : row.kind === 'transfer' ? '' : '−'}
                {euro(row.amount)}
              </Text>
            </View>
            <Text style={common.muted}>
              {row.kind === 'transfer'
                ? `${row.source_name} → ${row.destination_name}`
                : row.source_name || row.destination_name}
            </Text>
            {row.kind === 'income' && row.reference_month ? (
              <Text style={common.muted}>
                Considerada no orçamento de {monthLabel(row.reference_month)}
              </Text>
            ) : null}
            {row.kind === 'expense' && row.funding_transfer_id ? (
              <Text style={common.muted}>
                Pago com transferência:{' '}
                {row.funding_transfer_description || 'transferência vinculada'}
              </Text>
            ) : null}
            <Actions
              onEdit={
                row.kind === 'card_payment'
                  ? undefined
                  : () =>
                      setForm(
                        transactionForm(
                          accounts,
                          categories,
                          row.kind,
                          row,
                          transfers.data || [],
                          expenseRolloverDay,
                        ),
                      )
              }
              onDelete={() =>
                confirmAction(
                  'Excluir movimentação',
                  'O saldo e vínculos relacionados serão recalculados.',
                  () =>
                    save.mutateAsync({
                      path: `/transactions/${row.id}?version=${row.version}`,
                      method: 'DELETE',
                    }),
                )
              }
            />
          </Card>
        ))
      )}
      {query.data?.length ? (
        <View style={[common.between, { marginTop: 14 }]}>
          {page > 1 ? (
            <SecondaryButton onPress={() => setPage((value) => value - 1)}>
              Anterior
            </SecondaryButton>
          ) : (
            <View />
          )}
          <Text style={common.muted}>Página {page}</Text>
          {query.data.length === 50 &&
          page * 50 < Number(query.data[0]?.total_count || Number.POSITIVE_INFINITY) ? (
            <SecondaryButton onPress={() => setPage((value) => value + 1)}>Próxima</SecondaryButton>
          ) : (
            <View />
          )}
        </View>
      ) : null}
      <FormHost spec={form} close={() => setForm(null)} />
    </Screen>
  );
}

export function BudgetsScreen({ month, setMonth, categories }: Shared) {
  const { colors, common } = useTheme();
  const save = useSave();
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month');
  const [range, setRange] = useState<DateRange>({ from: `${month}-01`, to: currentDate() });
  const bounds = periodBounds(periodMode, month, range);
  const monthly = periodMode === 'month';
  const query = useData<Row[]>(
    monthly ? `/budgets/${month}` : `/budgets/range?from=${bounds.from}&to=${bounds.to}`,
  );
  const [form, setForm] = useState<FormSpec | null>(null);
  const expenseCategories = categories.filter((row) => row.kind === 'expense' && !row.archived);
  const budgetRows = (query.data || []).filter((row) => row.budget !== null);
  const creatableCategories = expenseCategories.filter(
    (category) => !budgetRows.some((row) => row.category_id === category.id),
  );
  return (
    <Screen refreshing={query.isFetching} onRefresh={() => void query.refetch()}>
      <Header
        eyebrow="ORÇAMENTO"
        title="Um plano para o seu mês."
        description="O realizado mostra o que saiu. Previsões e parcelas mostram o que ainda pode sair."
        action={
          monthly && creatableCategories.length ? (
            <AddButton
              label="Criar orçamento"
              onPress={() => setForm(createBudgetForm(month, creatableCategories))}
            />
          ) : undefined
        }
      />
      <PeriodSelector
        mode={periodMode}
        onModeChange={setPeriodMode}
        month={month}
        onMonthChange={setMonth}
        range={range}
        onRangeChange={setRange}
      />
      {!monthly ? (
        <Text style={common.muted}>Para alterar um limite, selecione a visão mensal.</Text>
      ) : null}
      <LoadState loading={query.isLoading} error={query.error} />
      {!query.isLoading && !budgetRows.length ? (
        <Empty topBorder={false}>
          {monthly
            ? 'Nenhum orçamento criado neste mês. Use “Criar orçamento” para definir o primeiro limite.'
            : 'Nenhum orçamento criado neste período. Selecione a visão mensal para definir um limite.'}
        </Empty>
      ) : null}
      {budgetRows.map((row, index) => {
        const category =
          expenseCategories.find((item) => item.id === row.category_id) ||
          ({ id: row.category_id, name: row.name } as Row);
        const percentage = Number(row.budget) ? (Number(row.spent) / Number(row.budget)) * 100 : 0;
        return (
          <Card key={row.category_id} topBorder={index !== 0}>
            <View style={common.between}>
              <View style={common.grow}>
                <Text style={common.value}>{row.name || category.name}</Text>
                <Text style={common.muted}>
                  {euro(row.spent)} gastos · {euro(row.budget)} de limite
                </Text>
                <Text style={common.muted}>
                  {row.budget_scope === 'month' ? 'Exceção deste mês' : 'Orçamento padrão'}
                </Text>
              </View>
              {monthly ? (
                <Pressable onPress={() => setForm(budgetForm(month, category, row))}>
                  <Pencil size={18} color={colors.green} />
                </Pressable>
              ) : null}
            </View>
            <Progress value={percentage} danger={Number(row.spent) > Number(row.budget)} />
            <View style={{ gap: 7 }}>
              <View style={common.between}>
                <Text style={common.muted}>Realizado</Text>
                <Text style={common.body}>{euro(row.spent)}</Text>
              </View>
              <View style={common.between}>
                <Text style={common.muted}>Recorrências previstas</Text>
                <Text style={common.body}>{euro(row.expected)}</Text>
              </View>
              <View style={common.between}>
                <Text style={common.muted}>Parcelas pendentes</Text>
                <Text style={common.body}>{euro(row.committed)}</Text>
              </View>
              <View style={common.between}>
                <Text style={common.muted}>
                  {Number(row.remaining) < 0 ? 'Excedente atual' : 'Restante atual'}
                </Text>
                <Text style={[common.body, Number(row.remaining) < 0 && common.dangerText]}>
                  {euro(Math.abs(Number(row.remaining || 0)))}
                </Text>
              </View>
              <View style={common.between}>
                <Text style={common.muted}>Margem após pendências</Text>
                <Text style={[common.body, Number(row.margin) < 0 && common.dangerText]}>
                  {euro(row.margin)}
                </Text>
              </View>
            </View>
            {monthly && row.budget_scope === 'month' ? (
              <SecondaryButton
                onPress={() =>
                  confirmAction(
                    'Usar orçamento padrão',
                    'A exceção deste mês será removida e o orçamento padrão voltará a valer.',
                    () =>
                      save.mutateAsync({
                        path: `/budgets/${month}/${row.category_id}/override`,
                        method: 'DELETE',
                      }),
                  )
                }
              >
                Remover exceção mensal
              </SecondaryButton>
            ) : null}
          </Card>
        );
      })}
      <FormHost spec={form} close={() => setForm(null)} />
    </Screen>
  );
}

export function GoalsScreen({ accounts, navigate }: Shared) {
  const { colors, common } = useTheme();
  const query = useData<Row[]>('/goals');
  const [form, setForm] = useState<FormSpec | null>(null);
  const save = useSave();
  const reservedAccounts = accounts.filter(
    (account) => !account.archived && account.purpose === 'reserved',
  );
  return (
    <Screen refreshing={query.isFetching} onRefresh={() => void query.refetch()}>
      <Header
        eyebrow="METAS"
        title="Dê um destino aos seus planos."
        description="O progresso vem do saldo real do cofrinho associado."
        action={
          reservedAccounts.length ? (
            <AddButton label="Nova meta" onPress={() => setForm(goalForm(accounts))} />
          ) : undefined
        }
      />
      <LoadState loading={query.isLoading} error={query.error} />
      {!query.data?.length ? (
        <Empty
          action={
            !reservedAccounts.length ? (
              <SecondaryButton onPress={() => navigate('accounts')}>Ir para Contas</SecondaryButton>
            ) : undefined
          }
        >
          {reservedAccounts.length
            ? 'Associe uma meta a uma conta reservada.'
            : 'Crie primeiro uma conta do tipo cofrinho na área de Contas.'}
        </Empty>
      ) : (
        query.data.map((row) => (
          <Card key={row.id}>
            <View style={common.between}>
              <View style={common.grow}>
                <Text style={common.value}>{row.name}</Text>
                <Text style={common.muted}>
                  {euro(row.balance)} de {euro(row.target)}
                </Text>
                <Text style={common.muted}>
                  {row.archived
                    ? 'Arquivada'
                    : accounts.find((account) => account.id === row.account_id)?.name || 'Cofrinho'}
                </Text>
              </View>
              <Text style={common.value}>{row.progress}%</Text>
            </View>
            <Progress value={Number(row.progress)} />
            <Text style={common.muted}>
              Faltam {euro(row.remaining)}
              {row.deadline ? ` · prazo ${dateLabel(row.deadline)}` : ''}
            </Text>
            <Text style={common.muted}>
              Aporte planejado: {euro(row.monthly_contribution)}/mês ·{' '}
              {Number(row.remaining) === 0
                ? 'objetivo atingido'
                : row.months_to_goal == null
                  ? 'sem previsão de conclusão'
                  : `conclusão estimada em ${row.months_to_goal} ${Number(row.months_to_goal) === 1 ? 'mês' : 'meses'}`}
            </Text>
            <View style={common.between}>
              <Actions onEdit={() => setForm(goalForm(accounts, row))} />
              <SecondaryButton
                onPress={() =>
                  confirmAction(
                    row.archived ? 'Reativar meta' : 'Arquivar meta',
                    'O saldo do cofrinho e todo o histórico serão preservados.',
                    () =>
                      save.mutateAsync({
                        path: `/goals/${row.id}`,
                        method: 'PATCH',
                        data: { archived: !row.archived },
                      }),
                  )
                }
              >
                {row.archived ? 'Reativar' : 'Arquivar'}
              </SecondaryButton>
            </View>
          </Card>
        ))
      )}
      <FormHost spec={form} close={() => setForm(null)} />
    </Screen>
  );
}

export function CardsScreen({ accounts, categories }: Shared) {
  const { colors, common } = useTheme();
  const cardStyles = useMemo(() => makeCardStyles(colors), [colors]);
  const cards = useData<Row[]>('/cards');
  const invoices = useData<Row[]>('/invoices');
  const purchases = useData<Row[]>('/purchases');
  const [purchaseEditorId, setPurchaseEditorId] = useState<string | null>(null);
  const purchaseDetails = useData<Row>(
    purchaseEditorId ? `/purchases/${purchaseEditorId}` : '/purchases/new',
    !!purchaseEditorId,
  );
  const [form, setForm] = useState<FormSpec | null>(null);
  const [addPicker, setAddPicker] = useState(false);
  const save = useSave();
  const [showInvoices, setShowInvoices] = useState(true);
  const [showPaidInvoices, setShowPaidInvoices] = useState(false);
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null);
  useEffect(() => {
    if (!purchaseEditorId || !purchaseDetails.data) return;
    setForm(purchaseForm(cards.data || [], categories, purchaseDetails.data));
    setPurchaseEditorId(null);
  }, [purchaseEditorId, purchaseDetails.data, cards.data, categories]);
  const openInvoices = (invoices.data || []).filter(
    (row) => !row.payment_id && Number(row.amount) > 0,
  );
  const openTotal = openInvoices.reduce((total, row) => total + Number(row.amount), 0);
  const visibleInvoices = (invoices.data || []).filter((row) => {
    const settledBeforeTracking = Number(row.amount) === 0 && Number(row.historical_amount) > 0;
    return row.payment_id || settledBeforeTracking ? showPaidInvoices : Number(row.amount) > 0;
  });
  const nextDue = [...openInvoices].sort((a, b) =>
    String(a.due_on).localeCompare(String(b.due_on)),
  )[0];
  const chooseAdd = (choice: string) => {
    setAddPicker(false);
    if (choice === 'card') {
      setForm(cardForm());
      return;
    }
    if (!cards.data?.length) {
      Alert.alert('Cadastre um cartão primeiro', 'A compra precisa estar vinculada a um cartão.');
      return;
    }
    setForm(purchaseForm(cards.data, categories));
  };
  const pay = (invoice: Row) => {
    const activeAccounts = accounts.filter((row) => !row.archived);
    if (!activeAccounts.length)
      return Alert.alert('Cadastre uma conta disponível antes de pagar a fatura.');
    setForm({
      title: `Pagar fatura · ${invoice.card_name}`,
      description: `Valor atual: ${euro(invoice.amount)}`,
      path: `/invoices/${invoice.id}/pay`,
      fields: [
        {
          name: 'account_id',
          label: 'Conta de pagamento',
          type: 'select',
          options: activeAccounts.map((row) => ({ label: row.name, value: row.id })),
        },
        { name: 'occurred_on', label: 'Data do pagamento', type: 'date', value: currentDate() },
        {
          name: 'reference_month',
          label: 'Mês a que esta fatura pertence',
          type: 'month',
          value: String(invoice.month).slice(0, 7),
          hint: 'Assim uma fatura de outubro paga no fim de setembro continua no orçamento de outubro.',
        },
      ],
      map: (values) => ({
        ...values,
        expected_amount: invoice.amount,
        reference_month: values.reference_month || null,
      }),
    });
  };
  return (
    <Screen
      refreshing={cards.isFetching || invoices.isFetching || purchases.isFetching}
      onRefresh={() => {
        void cards.refetch();
        void invoices.refetch();
        void purchases.refetch();
      }}
    >
      <Header
        eyebrow="CARTÕES E DÍVIDAS"
        title="Compromissos sob controle."
        description="Parcelas e faturas separadas do dinheiro que já saiu da conta."
        action={<AddButton label="Adicionar" onPress={() => setAddPicker(true)} />}
      />
      <ChoiceModal
        visible={addPicker}
        title="O que deseja adicionar?"
        options={[
          {
            value: 'purchase',
            label: 'Compra no cartão',
            description: 'Registre uma compra à vista ou parcelada',
          },
          { value: 'card', label: 'Cartão', description: 'Cadastre um novo cartão de crédito' },
        ]}
        onSelect={chooseAdd}
        onClose={() => setAddPicker(false)}
      />
      <LoadState
        loading={
          cards.isLoading || invoices.isLoading || purchases.isLoading || purchaseDetails.isLoading
        }
        error={cards.error || invoices.error || purchases.error || purchaseDetails.error}
      />
      <View style={cardStyles.overview}>
        <Text style={cardStyles.overviewLabel}>Faturas em aberto</Text>
        <Text style={cardStyles.overviewValue}>{euro(openTotal)}</Text>
        <Text style={common.muted}>
          {nextDue ? `Próximo vencimento em ${dateLabel(nextDue.due_on)}` : 'Nenhum valor pendente'}
        </Text>
      </View>
      <Card title="Seus cartões">
        {!cards.data?.length ? <Empty>Nenhum cartão cadastrado.</Empty> : null}
        {cards.data?.map((row) => (
          <View key={row.id} style={cardStyles.wallet}>
            <View style={common.between}>
              <Text style={cardStyles.walletBrand}>SALDO</Text>
              <CreditCard size={23} color="#b7c7c1" />
            </View>
            <View style={{ gap: 5 }}>
              <Text style={cardStyles.walletName}>{row.name}</Text>
              <Text style={cardStyles.walletMeta}>
                Fecha dia {row.closing_day} · vence dia {row.due_day}
              </Text>
            </View>
          </View>
        ))}
      </Card>
      <View style={cardStyles.tabs}>
        {[
          [true, 'Faturas'],
          [false, 'Compras'],
        ].map(([value, label]) => (
          <Pressable
            key={String(label)}
            style={[cardStyles.tab, showInvoices === value && cardStyles.tabActive]}
            onPress={() => setShowInvoices(Boolean(value))}
          >
            <Text style={[cardStyles.tabText, showInvoices === value && cardStyles.tabTextActive]}>
              {String(label)}
            </Text>
          </Pressable>
        ))}
      </View>
      <Card title={showInvoices ? 'Faturas' : 'Compras'}>
        {showInvoices ? (
          <SecondaryButton onPress={() => setShowPaidInvoices((value) => !value)}>
            {showPaidInvoices ? 'Mostrar somente pendentes' : 'Mostrar quitadas'}
          </SecondaryButton>
        ) : null}
        {showInvoices && !visibleInvoices.length ? <Empty>Nenhuma fatura pendente.</Empty> : null}
        {!showInvoices && !purchases.data?.length ? <Empty>Nenhuma compra.</Empty> : null}
        {showInvoices
          ? visibleInvoices.map((row) => (
              <View key={row.id} style={cardStyles.entry}>
                <View style={common.between}>
                  <View style={common.grow}>
                    <Text style={common.value}>{row.card_name}</Text>
                    <Text style={common.muted}>Vence {dateLabel(row.due_on)}</Text>
                  </View>
                  <Text style={common.value}>
                    {euro(
                      Number(row.amount) === 0 && Number(row.historical_amount) > 0
                        ? row.historical_amount
                        : row.amount,
                    )}
                  </Text>
                </View>
                {row.payment_id ? (
                  <View style={cardStyles.status}>
                    <Text style={cardStyles.statusText}>PAGA</Text>
                  </View>
                ) : Number(row.amount) > 0 ? (
                  <PrimaryButton onPress={() => pay(row)}>Pagar fatura</PrimaryButton>
                ) : Number(row.historical_amount) > 0 ? (
                  <View style={cardStyles.status}>
                    <Text style={cardStyles.statusText}>PAGA ANTES DO ACOMPANHAMENTO</Text>
                  </View>
                ) : (
                  <Text style={common.muted}>Sem compras nesta fatura</Text>
                )}
                <SecondaryButton
                  onPress={() => setExpandedInvoice(expandedInvoice === row.id ? null : row.id)}
                >
                  {expandedInvoice === row.id ? 'Fechar detalhes' : 'Rever fatura'}
                </SecondaryButton>
                {!row.payment_id ? (
                  <SecondaryButton
                    onPress={() =>
                      setForm({
                        title: `Editar fatura · ${row.card_name}`,
                        description:
                          'O valor é calculado pelas compras. Aqui você ajusta apenas as datas.',
                        path: `/invoices/${row.id}`,
                        method: 'PATCH',
                        fields: [
                          {
                            name: 'closes_on',
                            label: 'Data de fechamento',
                            type: 'date',
                            value: row.closes_on,
                          },
                          {
                            name: 'due_on',
                            label: 'Data de vencimento',
                            type: 'date',
                            value: row.due_on,
                          },
                        ],
                      })
                    }
                  >
                    Editar datas
                  </SecondaryButton>
                ) : null}
                {expandedInvoice === row.id ? <MobileInvoiceDetails id={row.id} /> : null}
              </View>
            ))
          : purchases.data?.map((row) => (
              <View key={row.id} style={cardStyles.entry}>
                <View style={common.between}>
                  <View style={common.grow}>
                    <Text style={common.value}>{row.description}</Text>
                    <Text style={common.muted}>
                      {row.card_name} · {dateLabel(row.purchased_on)} · {row.installments}x
                    </Text>
                  </View>
                  <Text style={common.value}>{euro(row.amount)}</Text>
                </View>
                <Text style={common.muted}>Restante: {euro(row.remaining)}</Text>
                <Actions
                  onEdit={row.editable ? () => setPurchaseEditorId(row.id) : undefined}
                  onDelete={() =>
                    confirmAction(
                      'Excluir compra',
                      'As parcelas ainda não pagas serão removidas.',
                      () => save.mutateAsync({ path: `/purchases/${row.id}`, method: 'DELETE' }),
                    )
                  }
                />
              </View>
            ))}
      </Card>
      <FormHost spec={form} close={() => setForm(null)} />
    </Screen>
  );
}

function MobileInvoiceDetails({ id }: { id: string }) {
  const query = useData<Row>(`/invoices/${id}`);
  const { common } = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <LoadState loading={query.isLoading} error={query.error} />
      {query.data?.installments?.map((item: Row) => (
        <View key={item.id} style={common.between}>
          <View style={common.grow}>
            <Text style={common.body}>{item.description}</Text>
            <Text style={common.muted}>
              {item.number}/{item.installments} · {item.category_name}
            </Text>
          </View>
          <Text style={common.value}>{euro(item.amount)}</Text>
        </View>
      ))}
    </View>
  );
}

export function RecurrencesScreen({
  month,
  setMonth,
  accounts,
  categories,
  expenseRolloverDay,
  navigate,
}: Shared) {
  const { colors, common } = useTheme();
  const groupStyles = useMemo(() => makeAccountStyles(colors), [colors]);
  const tabStyles = useMemo(() => makeFilterStyles(colors), [colors]);
  const rules = useData<Row[]>('/recurrences');
  const [view, setView] = useState<'occurrences' | 'rules'>('occurrences');
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month');
  const [range, setRange] = useState<DateRange>({ from: `${month}-01`, to: currentDate() });
  const bounds = periodBounds(periodMode, month, range);
  const occurrences = useData<Row[]>(`/occurrences?from=${bounds.from}&to=${bounds.to}`);
  const history = useData<Row[]>(
    `/transactions?from=${bounds.from}&to=${bounds.to}&page=1&limit=500`,
  );
  const save = useSave();
  const [form, setForm] = useState<FormSpec | null>(null);
  const [kindPicker, setKindPicker] = useState(false);
  const [ruleActions, setRuleActions] = useState<Row | null>(null);
  const hasActiveAccount = accounts.some((account) => !account.archived);
  const editOccurrence = (row: Row) =>
    setForm({
      title: 'Editar esta previsão',
      description: 'Esta alteração afeta apenas a ocorrência selecionada.',
      path: `/occurrences/${row.id}`,
      method: 'PATCH',
      fields: [
        { name: 'description', label: 'Descrição', value: row.description },
        { name: 'amount', label: 'Valor previsto (€)', type: 'number', value: row.amount },
      ],
      map: (values) => ({
        description: values.description,
        amount: (values.amount || '').replace(',', '.'),
      }),
    });
  const linkOccurrence = (row: Row) => {
    const compatible = (history.data || []).filter(
      (transaction) =>
        transaction.kind === row.kind &&
        transaction.category_id === row.category_id &&
        (row.kind === 'income' ? transaction.destination_id : transaction.source_id) ===
          row.account_id &&
        (row.kind !== 'transfer' || transaction.destination_id === row.destination_id),
    );
    if (!compatible.length) {
      Alert.alert(
        'Nenhuma movimentação compatível',
        'Registre a movimentação ou amplie o período selecionado antes de vinculá-la.',
      );
      return;
    }
    setForm({
      title: 'Vincular registro existente',
      description: 'Nenhuma nova movimentação será criada.',
      path: `/occurrences/${row.id}/link-transaction`,
      fields: [
        {
          name: 'transaction_id',
          label: 'Movimentação já registrada',
          type: 'select',
          options: compatible.map((transaction) => ({
            value: transaction.id,
            label: `${transaction.description} · ${euro(transaction.amount)} · ${dateLabel(transaction.occurred_on)}`,
          })),
        },
      ],
      submitLabel: 'Vincular',
    });
  };
  const confirmOccurrence = (row: Row) => {
    const suggestedMonth = suggestedReferenceMonth(row.due_on, expenseRolloverDay);
    const movesToNextMonth = Number(String(row.due_on).slice(8, 10)) >= expenseRolloverDay;
    setForm({
      title:
        row.kind === 'income'
          ? 'Confirmar recebimento'
          : row.kind === 'expense'
            ? 'Confirmar pagamento'
            : 'Confirmar transferência',
      description:
        'Revise os dados abaixo. Ao confirmar, esta previsão vira uma movimentação real e altera os saldos.',
      submitLabel: row.kind === 'income' ? 'Rever e confirmar' : 'Confirmar movimentação',
      path: `/occurrences/${row.id}/confirm`,
      fields: [
        {
          name: 'account_id',
          label: 'Conta',
          type: 'select',
          value: row.account_id,
          options: accounts
            .filter((account) => !account.archived)
            .map((account) => ({ label: account.name, value: account.id })),
        },
        { name: 'amount', label: 'Valor (€)', type: 'number', value: row.amount },
        {
          name: 'occurred_on',
          label:
            row.kind === 'income'
              ? 'Data em que recebeu'
              : row.kind === 'expense'
                ? 'Data em que pagou'
                : 'Data da transferência',
          type: 'date',
          value: row.due_on > currentDate() ? currentDate() : row.due_on,
          max: currentDate(),
          hint: 'Esta data altera o saldo real das contas.',
        },
        ...(row.kind === 'income'
          ? [
              {
                name: 'reference_month',
                label: 'Mês do orçamento',
                type: 'month' as const,
                value: suggestedMonth,
                hint: movesToNextMonth
                  ? `Como o recebimento está previsto para o dia ${String(row.due_on).slice(8, 10)}, sugerimos ${monthLabel(suggestedMonth)}. Você pode alterar antes de confirmar.`
                  : `Sugerimos ${monthLabel(suggestedMonth)}, o mesmo mês do recebimento. Você pode alterar antes de confirmar.`,
              },
            ]
          : []),
      ],
      map: (values) => ({
        ...values,
        amount: (values.amount || '').replace(',', '.'),
        reference_month: row.kind === 'income' ? values.reference_month || null : null,
      }),
      confirm:
        row.kind === 'income'
          ? (values) => ({
              title: 'Confirmar mês do orçamento',
              message: `O valor de ${euro(values.amount)} entra no saldo em ${dateLabel(values.occurred_on)} e será contado no orçamento de ${monthLabel(values.reference_month)}. Está correto?`,
              confirmLabel: 'Sim, confirmar',
            })
          : undefined,
    });
  };
  const chooseRuleAction = (action: string) => {
    const row = ruleActions;
    setRuleActions(null);
    if (!row) return;
    if (action === 'edit') {
      setForm(recurrenceEditForm(row));
      return;
    }
    if (action === 'toggle') {
      confirmAction(
        row.active ? 'Desativar recorrência' : 'Reativar recorrência',
        row.active
          ? 'As previsões pendentes serão ignoradas. As movimentações já confirmadas permanecem iguais.'
          : 'A recorrência voltará a gerar previsões futuras. Ocorrências ignoradas anteriormente permanecem ignoradas.',
        () =>
          save.mutateAsync({
            path: `/recurrences/${row.id}`,
            method: 'PATCH',
            data: { active: !row.active },
          }),
      );
      return;
    }
    confirmAction(
      'Excluir recorrência',
      'A regra e suas previsões não confirmadas deixarão de aparecer. Movimentações já confirmadas e saldos serão preservados.',
      () => save.mutateAsync({ path: `/recurrences/${row.id}`, method: 'DELETE' }),
    );
  };
  const kindSections = [
    {
      kind: 'income',
      icon: ArrowDownLeft,
      occurrenceTitle: 'Entradas previstas',
      ruleTitle: 'Entradas recorrentes',
    },
    {
      kind: 'expense',
      icon: ArrowUpRight,
      occurrenceTitle: 'Saídas previstas',
      ruleTitle: 'Saídas recorrentes',
    },
    {
      kind: 'transfer',
      icon: RotateCcw,
      occurrenceTitle: 'Transferências previstas',
      ruleTitle: 'Transferências recorrentes',
    },
  ];
  const occurrenceSections = kindSections
    .map((section) => ({
      ...section,
      rows: occurrences.data?.filter((row) => row.kind === section.kind) || [],
    }))
    .filter((section) => section.rows.length);
  const ruleSections = kindSections
    .map((section) => ({
      ...section,
      rows: rules.data?.filter((row) => row.kind === section.kind) || [],
    }))
    .filter((section) => section.rows.length);
  return (
    <Screen
      refreshing={rules.isFetching || occurrences.isFetching || history.isFetching}
      onRefresh={() => {
        void rules.refetch();
        void occurrences.refetch();
        void history.refetch();
      }}
    >
      <Header
        eyebrow="RECORRENTES"
        title="Antecipe. Confira. Confirme."
        description="Previsões não são pagamentos. Você decide quando viram realidade."
        action={
          hasActiveAccount ? (
            <AddButton label="Novo recorrente" onPress={() => setKindPicker(true)} />
          ) : undefined
        }
      />
      <ChoiceModal
        visible={kindPicker}
        title="Qual recorrência deseja criar?"
        options={[
          { value: 'expense', label: 'Despesa', description: 'Conta ou pagamento recorrente' },
          { value: 'income', label: 'Receita', description: 'Salário ou outra entrada recorrente' },
          {
            value: 'transfer',
            label: 'Transferência',
            description: 'Movimento periódico entre contas',
          },
        ]}
        onSelect={(kind) => {
          setKindPicker(false);
          setForm(recurrenceForm(accounts, categories, kind));
        }}
        onClose={() => setKindPicker(false)}
      />
      {!hasActiveAccount ? (
        <Empty
          topBorder={false}
          action={
            <SecondaryButton onPress={() => navigate('accounts')}>Ir para Contas</SecondaryButton>
          }
        >
          Crie uma conta ativa na área de Contas antes de cadastrar recorrências.
        </Empty>
      ) : null}
      <ChoiceModal
        visible={!!ruleActions}
        title={ruleActions ? `Opções · ${ruleActions.description}` : 'Opções da recorrência'}
        options={[
          {
            value: 'edit',
            label: 'Editar recorrência',
            description: 'Alterar descrição, valor ou frequência',
          },
          {
            value: 'toggle',
            label: ruleActions?.active ? 'Desativar recorrência' : 'Reativar recorrência',
            description: ruleActions?.active
              ? 'Interromper novas previsões sem apagar o histórico'
              : 'Voltar a gerar previsões futuras',
          },
          {
            value: 'delete',
            label: 'Excluir recorrência',
            description: 'Remover a regra e manter movimentações confirmadas',
            tone: 'danger',
          },
        ]}
        onSelect={chooseRuleAction}
        onClose={() => setRuleActions(null)}
      />
      <View style={tabStyles.bar}>
        {[
          { value: 'occurrences', label: 'Previsões' },
          { value: 'rules', label: 'Regras' },
        ].map((option) => {
          const active = view === option.value;
          return (
            <Pressable
              key={option.value}
              style={[tabStyles.option, active && tabStyles.optionActive]}
              onPress={() => setView(option.value as 'occurrences' | 'rules')}
            >
              <Text style={[tabStyles.text, active && tabStyles.textActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {view === 'occurrences' ? (
        <>
          <PeriodSelector
            mode={periodMode}
            onModeChange={setPeriodMode}
            month={month}
            onMonthChange={setMonth}
            range={range}
            onRangeChange={setRange}
          />
          <LoadState loading={occurrences.isLoading} error={occurrences.error} />
          {!occurrenceSections.length ? (
            <Card title="Ocorrências do período" topBorder={false}>
              <Empty>Nenhuma previsão neste período.</Empty>
            </Card>
          ) : (
            occurrenceSections.map((section) => (
              <View key={section.kind} style={groupStyles.section}>
                <View style={groupStyles.sectionHeader}>
                  <View style={groupStyles.sectionIdentity}>
                    <View style={groupStyles.sectionIcon}>
                      <section.icon size={17} color={colors.green} />
                    </View>
                    <Text style={groupStyles.sectionTitle}>{section.occurrenceTitle}</Text>
                  </View>
                  <Text style={groupStyles.count}>{section.rows.length}</Text>
                </View>
                {section.rows.map((row) => (
                  <View
                    key={row.id}
                    style={[
                      groupStyles.accountRow,
                      row !== section.rows[0] && groupStyles.accountRowDivider,
                    ]}
                  >
                    <View style={common.between}>
                      <View style={common.grow}>
                        <Text style={common.body}>{row.description}</Text>
                        <Text style={common.muted}>
                          {dateLabel(row.due_on)} ·{' '}
                          {row.state === 'confirmed'
                            ? 'Confirmada'
                            : row.state === 'skipped'
                              ? 'Ignorada'
                              : 'Pendente'}
                        </Text>
                      </View>
                      <Text style={common.value}>{euro(row.amount)}</Text>
                    </View>
                    {row.state === 'pending' ? (
                      <View style={groupStyles.actions}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Editar previsão de ${row.description}`}
                          style={groupStyles.action}
                          onPress={() => editOccurrence(row)}
                        >
                          <Pencil size={15} color={colors.green} />
                          <Text style={groupStyles.editText}>Editar</Text>
                        </Pressable>
                        <Pressable
                          style={groupStyles.action}
                          onPress={() => confirmOccurrence(row)}
                        >
                          <Check size={16} color={colors.green} />
                          <Text style={groupStyles.editText}>Confirmar</Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Vincular movimentação a ${row.description}`}
                          style={groupStyles.action}
                          onPress={() => linkOccurrence(row)}
                        >
                          <Text style={groupStyles.editText}>Já registrei</Text>
                        </Pressable>
                        <Pressable
                          style={groupStyles.action}
                          onPress={() =>
                            save.mutate({
                              path: `/occurrences/${row.id}`,
                              method: 'PATCH',
                              data: { state: 'skipped' },
                            })
                          }
                        >
                          <Text style={groupStyles.actionText}>Ignorar</Text>
                        </Pressable>
                      </View>
                    ) : row.state === 'skipped' ? (
                      <Pressable
                        style={[groupStyles.action, { alignSelf: 'flex-end' }]}
                        onPress={() =>
                          save.mutate({
                            path: `/occurrences/${row.id}`,
                            method: 'PATCH',
                            data: { state: 'pending' },
                          })
                        }
                      >
                        <RotateCcw size={15} color={colors.muted} />
                        <Text style={groupStyles.actionText}>Reabrir</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ))}
              </View>
            ))
          )}
        </>
      ) : (
        <>
          <LoadState loading={rules.isLoading} error={rules.error} />
          <Text style={[common.muted, { marginBottom: 12 }]}>
            Desativar interrompe as próximas previsões, mas mantém o histórico. Excluir remove a
            regra das listas sem apagar movimentações já confirmadas.
          </Text>
          {!ruleSections.length ? (
            <Card title="Regras">
              <Empty>Nenhuma regra recorrente.</Empty>
            </Card>
          ) : (
            ruleSections.map((section) => (
              <View key={section.kind} style={groupStyles.section}>
                <View style={groupStyles.sectionHeader}>
                  <View style={groupStyles.sectionIdentity}>
                    <View style={groupStyles.sectionIcon}>
                      <section.icon size={17} color={colors.green} />
                    </View>
                    <Text style={groupStyles.sectionTitle}>{section.ruleTitle}</Text>
                  </View>
                  <Text style={groupStyles.count}>{section.rows.length}</Text>
                </View>
                {section.rows.map((row) => (
                  <View
                    key={row.id}
                    style={[
                      groupStyles.accountRow,
                      row !== section.rows[0] && groupStyles.accountRowDivider,
                    ]}
                  >
                    <View style={common.between}>
                      <View>
                        <Text style={common.body}>{row.description}</Text>
                        <Text style={common.muted}>
                          {euro(row.amount)} ·{' '}
                          {Number(row.interval_months || 1) === 1
                            ? 'Todo mês'
                            : `A cada ${row.interval_months} meses`}
                        </Text>
                      </View>
                      <Text style={{ color: row.active ? colors.green : colors.muted }}>
                        {row.active ? 'Ativa' : 'Inativa'}
                      </Text>
                    </View>
                    <Pressable
                      style={[groupStyles.action, { alignSelf: 'flex-end' }]}
                      onPress={() => setRuleActions(row)}
                    >
                      <MoreHorizontal size={17} color={colors.green} />
                      <Text style={groupStyles.editText}>Opções</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ))
          )}
        </>
      )}
      <FormHost spec={form} close={() => setForm(null)} />
    </Screen>
  );
}

export function FuturePlansScreen() {
  const { colors, common } = useTheme();
  const groupStyles = useMemo(() => makeAccountStyles(colors), [colors]);
  const query = useData<Row[]>('/future-plans');
  const save = useSave();
  const [form, setForm] = useState<FormSpec | null>(null);
  const [selected, setSelected] = useState<Row | null>(null);
  const activePlans = (query.data || []).filter((row) => row.status === 'active');
  const report = activePlans.reduce(
    (total, row) => ({
      upfrontGap: total.upfrontGap + Number(row.upfront_gap || 0),
      monthlyMargin: total.monthlyMargin + Number(row.monthly_margin || 0),
      periodicExpenses: total.periodicExpenses + Number(row.periodic_expenses || 0),
      projectedBalance: total.projectedBalance + Number(row.projected_balance || 0),
    }),
    { upfrontGap: 0, monthlyMargin: 0, periodicExpenses: 0, projectedBalance: 0 },
  );
  const active = selected ? query.data?.find((row) => row.id === selected.id) || selected : null;
  if (active) {
    return (
      <Screen refreshing={query.isFetching} onRefresh={() => void query.refetch()}>
        <SecondaryButton onPress={() => setSelected(null)}>Voltar aos planos</SecondaryButton>
        <Header
          eyebrow="DASHBOARD DO PLANO"
          title={active.name}
          description="Analise caixas, desembolsos, fluxo mensal, contas periódicas e a projeção completa deste cenário."
        />
        <Card>
          <Text
            style={[
              common.value,
              (Number(active.upfront_gap) > 0 || Number(active.monthly_margin) < 0) &&
                common.dangerText,
            ]}
          >
            {Number(active.upfront_gap) > 0
              ? `Faltam ${euro(active.upfront_gap)} para o desembolso imediato`
              : Number(active.monthly_margin) < 0
                ? `Défice mensal de ${euro(Math.abs(Number(active.monthly_margin)))}`
                : 'Cenário sustentável'}
          </Text>
          <View style={common.between}>
            <Text style={common.body}>Data desejada</Text>
            <Text style={common.value}>{dateLabel(active.target_date)}</Text>
          </View>
          <View style={common.between}>
            <Text style={common.body}>Custo projetado</Text>
            <Text style={common.value}>{euro(active.total_cost || active.estimated_cost)}</Text>
          </View>
          <View style={common.between}>
            <Text style={common.body}>Saldo projetado</Text>
            <Text style={common.value}>
              {euro(active.projected_balance || active.principal_balance)}
            </Text>
          </View>
          <View style={common.between}>
            <Text style={common.body}>Disponível agora</Text>
            <Text style={common.value}>{euro(active.upfront_available)}</Text>
          </View>
          <View style={common.between}>
            <Text style={common.body}>Contas periódicas</Text>
            <Text style={common.value}>{euro(active.periodic_expenses)}</Text>
          </View>
          <Progress value={Number(active.progress || 0)} />
        </Card>
        <View style={common.row}>
          <PrimaryButton onPress={() => setForm(futurePlanForm(active))}>Editar</PrimaryButton>
          {active.status === 'active' ? (
            <>
              <SecondaryButton
                onPress={() =>
                  confirmAction(
                    'Concluir plano',
                    'Isso encerra somente o cenário; nenhuma movimentação real será criada.',
                    () =>
                      save.mutateAsync({
                        path: `/future-plans/${active.id}`,
                        method: 'PATCH',
                        data: { status: 'completed' },
                      }),
                  )
                }
              >
                Concluir
              </SecondaryButton>
              <SecondaryButton
                onPress={() =>
                  confirmAction(
                    'Arquivar plano',
                    'O cenário ficará guardado sem alterar suas finanças reais.',
                    () =>
                      save.mutateAsync({
                        path: `/future-plans/${active.id}`,
                        method: 'PATCH',
                        data: { status: 'archived' },
                      }),
                  )
                }
              >
                Arquivar
              </SecondaryButton>
            </>
          ) : (
            <SecondaryButton
              onPress={() =>
                save.mutate({
                  path: `/future-plans/${active.id}`,
                  method: 'PATCH',
                  data: { status: 'active' },
                })
              }
            >
              Reativar
            </SecondaryButton>
          )}
        </View>
        <Card title="Caixas do cenário">
          <AddButton label="Nova caixa" onPress={() => setForm(futurePlanPocketForm(active.id))} />
          {active.pockets?.map((row: Row) => (
            <View key={row.id} style={common.between}>
              <View style={common.grow}>
                <Text style={common.body}>{row.name}</Text>
                <Text style={common.muted}>
                  {row.kind === 'principal'
                    ? 'Principal'
                    : row.kind === 'benefit'
                      ? 'Benefício'
                      : 'Reserva'}{' '}
                  · agora {euro(row.opening_balance)} · final {euro(row.closing_balance)}
                </Text>
                {Number(row.upfront_gap) > 0 ? (
                  <Text style={common.dangerText}>
                    Faltam {euro(row.upfront_gap)} para pagamentos imediatos.
                  </Text>
                ) : null}
                {row.first_deficit_month ? (
                  <Text style={common.dangerText}>
                    Saldo negativo a partir de {monthLabel(row.first_deficit_month)}.
                  </Text>
                ) : null}
              </View>
              <Actions
                onEdit={() => setForm(futurePlanPocketForm(active.id, row))}
                onDelete={
                  row.kind === 'principal'
                    ? undefined
                    : () =>
                        confirmAction('Excluir caixa', 'A caixa precisa estar sem itens.', () =>
                          save.mutateAsync({
                            path: `/future-plans/${active.id}/pockets/${row.id}`,
                            method: 'DELETE',
                          }),
                        )
                }
              />
            </View>
          )) || <Empty>Nenhuma caixa.</Empty>}
        </Card>
        <View style={[common.row, { marginTop: 18, marginBottom: 14 }]}>
          <SecondaryButton
            onPress={() => setForm(futurePlanItemForm(active.id, active.pockets || [], 'income'))}
          >
            Novo recurso
          </SecondaryButton>
          <SecondaryButton
            onPress={() => setForm(futurePlanItemForm(active.id, active.pockets || [], 'expense'))}
          >
            Novo gasto
          </SecondaryButton>
        </View>
        {[
          { kind: 'income', title: 'Entradas do plano', icon: ArrowDownLeft },
          { kind: 'expense', title: 'Saídas do plano', icon: ArrowUpRight },
        ].map((section) => {
          const sectionRows = (active.items || []).filter((row: Row) => row.kind === section.kind);
          if (!sectionRows.length) return null;
          return (
            <View key={section.kind} style={groupStyles.section}>
              <View style={groupStyles.sectionHeader}>
                <View style={groupStyles.sectionIdentity}>
                  <View style={groupStyles.sectionIcon}>
                    <section.icon size={17} color={colors.green} />
                  </View>
                  <Text style={groupStyles.sectionTitle}>{section.title}</Text>
                </View>
                <Text style={groupStyles.count}>{sectionRows.length}</Text>
              </View>
              {sectionRows.map((row: Row, index: number) => (
                <View
                  key={row.id}
                  style={[
                    groupStyles.accountRow,
                    index > 0 && groupStyles.accountRowDivider,
                    common.between,
                  ]}
                >
                  <View style={common.grow}>
                    <Text style={common.body}>{row.name}</Text>
                    <Text style={common.muted}>
                      {row.cadence === 'recurring'
                        ? `a cada ${row.interval_months} mês(es)`
                        : 'uma vez'}{' '}
                      · {euro(row.amount)}
                    </Text>
                    {row.due_on ? (
                      <Text style={common.muted}>Data prevista: {dateLabel(row.due_on)}</Text>
                    ) : null}
                    {row.notes ? <Text style={common.muted}>{row.notes}</Text> : null}
                    {row.cadence === 'recurring' && row.projected_total ? (
                      <Text style={common.muted}>
                        Total no período: {euro(row.projected_total)}
                      </Text>
                    ) : null}
                  </View>
                  <Actions
                    onEdit={() =>
                      setForm(futurePlanItemForm(active.id, active.pockets || [], row.kind, row))
                    }
                    onDelete={
                      row.is_baseline
                        ? undefined
                        : () =>
                            confirmAction('Excluir item', 'A projeção será recalculada.', () =>
                              save.mutateAsync({
                                path: `/future-plans/${active.id}/items/${row.id}`,
                                method: 'DELETE',
                              }),
                            )
                    }
                  />
                </View>
              ))}
            </View>
          );
        })}
        {!active.items?.length ? <Empty>Nenhum item.</Empty> : null}
        <Card title="Análise mensal">
          <View style={common.between}>
            <Text style={common.muted}>Entradas mensais</Text>
            <Text style={common.value}>{euro(active.monthly_income)}</Text>
          </View>
          <View style={common.between}>
            <Text style={common.muted}>Saídas mensais</Text>
            <Text style={common.value}>{euro(active.monthly_expenses)}</Text>
          </View>
          <View style={common.between}>
            <Text style={common.muted}>Margem mensal</Text>
            <Text style={[common.value, Number(active.monthly_margin) < 0 && common.dangerText]}>
              {euro(active.monthly_margin)}
            </Text>
          </View>
        </Card>
        {active.timeline?.length ? (
          <Card title="Projeção mês a mês">
            {active.timeline.map((period: Row) => (
              <View key={period.month} style={{ gap: 4 }}>
                <Text style={common.value}>{monthLabel(period.month)}</Text>
                <View style={common.between}>
                  <Text style={common.muted}>Entradas {euro(period.income)}</Text>
                  <Text style={common.muted}>Saídas {euro(period.expense)}</Text>
                  <Text style={[common.body, Number(period.balance) < 0 && common.dangerText]}>
                    Saldo {euro(period.balance)}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        ) : null}
        <SecondaryButton
          onPress={() =>
            confirmAction(
              'Excluir plano',
              'Todo o cenário, caixas e itens serão removidos.',
              async () => {
                await save.mutateAsync({ path: `/future-plans/${active.id}`, method: 'DELETE' });
                setSelected(null);
              },
            )
          }
        >
          <Trash2 color={colors.danger} size={18} />
        </SecondaryButton>
        <FormHost spec={form} close={() => setForm(null)} />
      </Screen>
    );
  }
  return (
    <Screen refreshing={query.isFetching} onRefresh={() => void query.refetch()}>
      <Header
        eyebrow="HORIZONTES"
        title="Seus planos, sem ruído."
        description="Compare os cenários rapidamente e abra um deles quando quiser analisar cada detalhe."
        action={<AddButton label="Novo plano" onPress={() => setForm(futurePlanForm())} />}
      />
      <LoadState loading={query.isLoading} error={query.error} />
      {activePlans.length ? (
        <Card title="Relatório geral">
          <Text style={common.muted}>
            {activePlans.length} {activePlans.length === 1 ? 'cenário ativo' : 'cenários ativos'}
          </Text>
          <View style={common.between}>
            <Text style={common.muted}>Falta disponível agora</Text>
            <Text style={[common.value, report.upfrontGap > 0 && common.dangerText]}>
              {euro(report.upfrontGap)}
            </Text>
          </View>
          <View style={common.between}>
            <Text style={common.muted}>Resultado mensal</Text>
            <Text style={[common.value, report.monthlyMargin < 0 && common.dangerText]}>
              {euro(report.monthlyMargin)}
            </Text>
          </View>
          <View style={common.between}>
            <Text style={common.muted}>Contas periódicas</Text>
            <Text style={common.value}>{euro(report.periodicExpenses)}</Text>
          </View>
          <View style={common.between}>
            <Text style={common.muted}>Saldo final projetado</Text>
            <Text style={[common.value, report.projectedBalance < 0 && common.dangerText]}>
              {euro(report.projectedBalance)}
            </Text>
          </View>
        </Card>
      ) : null}
      {!query.data?.length ? (
        <Empty>Crie um cenário para uma viagem, mudança ou projeto.</Empty>
      ) : (
        query.data.map((row) => (
          <Pressable key={row.id} onPress={() => setSelected(row)}>
            <Card>
              <View style={common.between}>
                <View style={common.grow}>
                  <Text style={common.value}>{row.name}</Text>
                  <Text style={common.muted}>
                    {dateLabel(row.target_date)} ·{' '}
                    {row.status === 'active'
                      ? 'Ativo'
                      : row.status === 'completed'
                        ? 'Concluído'
                        : 'Arquivado'}
                  </Text>
                </View>
                <Text style={common.value}>{euro(row.total_cost || row.estimated_cost)}</Text>
              </View>
              <Progress value={Number(row.progress || 0)} />
            </Card>
          </Pressable>
        ))
      )}
      <FormHost spec={form} close={() => setForm(null)} />
    </Screen>
  );
}

export function CategoriesScreen({ categories }: Shared) {
  const { colors, common } = useTheme();
  const groupStyles = useMemo(() => makeAccountStyles(colors), [colors]);
  const query = useData<Row[]>('/categories');
  const [form, setForm] = useState<FormSpec | null>(null);
  const save = useSave();
  const rows = query.data || categories;
  const groups = [
    {
      kind: 'income',
      title: 'Categorias de entrada',
      icon: ArrowDownLeft,
      rows: rows.filter((row) => row.kind === 'income'),
    },
    {
      kind: 'expense',
      title: 'Categorias de saída',
      icon: ArrowUpRight,
      rows: rows.filter((row) => row.kind === 'expense'),
    },
  ];
  return (
    <Screen refreshing={query.isFetching} onRefresh={() => void query.refetch()}>
      <Header
        eyebrow="CATEGORIAS"
        title="Organize do seu jeito."
        description="Suas categorias são individuais. Arquivar mantém o histórico."
        action={<AddButton label="Nova categoria" onPress={() => setForm(categoryForm())} />}
      />
      <LoadState loading={query.isLoading} error={query.error} />
      {groups.map((group) => (
        <View key={group.kind} style={groupStyles.section}>
          <View style={groupStyles.sectionHeader}>
            <View style={groupStyles.sectionIdentity}>
              <View style={groupStyles.sectionIcon}>
                <group.icon size={17} color={colors.green} />
              </View>
              <Text style={groupStyles.sectionTitle}>{group.title}</Text>
            </View>
            <Text style={groupStyles.count}>{group.rows.length}</Text>
          </View>
          {group.rows.map((row, index) => (
            <View
              key={row.id}
              style={[
                groupStyles.accountRow,
                index > 0 && groupStyles.accountRowDivider,
                common.between,
              ]}
            >
              <View>
                <Text style={common.body}>{row.name}</Text>
                {row.archived ? <Text style={common.muted}>Arquivada</Text> : null}
              </View>
              <View style={common.row}>
                <Actions onEdit={() => setForm(categoryForm(row))} />
                <Pressable
                  onPress={() =>
                    save.mutate({
                      path: `/categories/${row.id}`,
                      method: 'PATCH',
                      data: { archived: !row.archived },
                    })
                  }
                >
                  <Archive size={18} color={colors.muted} />
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      ))}
      <FormHost spec={form} close={() => setForm(null)} />
    </Screen>
  );
}
