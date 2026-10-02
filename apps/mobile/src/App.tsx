import { ClerkProvider, useAuth } from '@clerk/expo';
import { useSignInWithGoogle } from '@clerk/expo/google';
import { AuthView, UserButton, useAuthViewState } from '@clerk/expo/native';
import { tokenCache } from '@clerk/expo/token-cache';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import * as Updates from 'expo-updates';
import { Component, useEffect, useMemo, useState, type ErrorInfo, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeftRight,
  CreditCard,
  LayoutDashboard,
  Menu,
  PieChart,
  Repeat2,
  ShieldCheck,
  Tags,
  Target,
  Telescope,
  Wallet,
  Settings as SettingsIcon,
  X,
} from 'lucide-react-native';
import { currentDate, useData, type Row } from './api';
import {
  AccountsScreen,
  BudgetsScreen,
  CardsScreen,
  CategoriesScreen,
  DashboardScreen,
  FuturePlansScreen,
  GoalsScreen,
  RecurrencesScreen,
  TransactionsScreen,
  SettingsScreen,
} from './screens';
import { ThemeProvider, useTheme, type ThemeColors } from './theme';

function useAppUi() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme.colors), [theme.colors]);
  return { ...theme, styles };
}

const clerkPublishableKey = String(
  process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ||
    Constants.expoConfig?.extra?.clerkPublishableKey ||
    '',
);
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 20_000, gcTime: 10 * 60_000 } },
});

type RouteKey =
  | 'dashboard'
  | 'transactions'
  | 'accounts'
  | 'cards'
  | 'budgets'
  | 'goals'
  | 'plans'
  | 'recurrences'
  | 'categories'
  | 'settings';
const routes = [
  ['dashboard', 'Visão geral', LayoutDashboard],
  ['transactions', 'Movimentações', ArrowLeftRight],
  ['accounts', 'Contas', Wallet],
  ['cards', 'Cartões', CreditCard],
  ['budgets', 'Orçamento', PieChart],
  ['goals', 'Metas', Target],
  ['plans', 'Planos futuros', Telescope],
  ['recurrences', 'Recorrentes', Repeat2],
  ['categories', 'Categorias', Tags],
  ['settings', 'Configurações', SettingsIcon],
] as const;

function SignedOut() {
  const { colors, styles } = useAppUi();
  const { isLoaded, isAuthFlowComplete } = useAuthViewState();
  const { startGoogleAuthenticationFlow } = useSignInWithGoogle();
  const [showOtherMethods, setShowOtherMethods] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const signInWithGoogle = async () => {
    if (googleLoading) return;
    setGoogleLoading(true);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const { createdSessionId, setActive } = await Promise.race([
        startGoogleAuthenticationFlow(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('O Google não respondeu após a seleção da conta.')),
            60_000,
          );
        }),
      ]);
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
      } else {
        Alert.alert(
          'Login do Google não concluído',
          'O Google abriu o seletor, mas não autorizou este APK. Confira se o SHA-1 da chave do EAS está cadastrado no cliente Android do Google Cloud.',
        );
      }
    } catch (error) {
      const authError = error as { code?: string | number; message?: string };
      if (
        authError.code === 'SIGN_IN_CANCELLED' ||
        authError.code === '-5' ||
        authError.code === -5
      ) {
        return;
      }
      Alert.alert(
        'Não foi possível entrar',
        authError.message || 'Confira sua conexão e tente novamente.',
      );
    } finally {
      if (timeout) clearTimeout(timeout);
      setGoogleLoading(false);
    }
  };

  if (isLoaded && isAuthFlowComplete) return null;
  return (
    <View style={styles.authPage}>
      <View style={styles.authBrand}>
        <Text style={[styles.logo, { color: '#fff' }]}>
          saldo<Text style={{ color: '#8dc4b3' }}>.</Text>
        </Text>
        <Text style={styles.authCopy}>Mais clareza. Melhores decisões.</Text>
        <Text style={styles.authCopy}>
          Suas contas, seus objetivos e seu futuro financeiro, em um só lugar.
        </Text>
      </View>
      {showOtherMethods ? (
        <View style={styles.authNative}>
          <Pressable style={styles.authBack} onPress={() => setShowOtherMethods(false)}>
            <Text style={styles.authBackText}>← Voltar para entrar com Google</Text>
          </Pressable>
          <View style={styles.authNativeView}>
            <AuthView mode="signInOrUp" isDismissible={false} logoMaxHeight={48} />
          </View>
        </View>
      ) : (
        <View style={styles.authChoice}>
          <View style={styles.authChoiceHeader}>
            <Text style={styles.authTitle}>Entre no seu espaço</Text>
            <Text style={styles.authDescription}>
              Acesse seu caderno financeiro com a conta que você já usa no celular.
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continuar com Google"
            disabled={googleLoading}
            style={({ pressed }) => [
              styles.googleButton,
              pressed && styles.googleButtonPressed,
              googleLoading && styles.googleButtonDisabled,
            ]}
            onPress={() => void signInWithGoogle()}
          >
            <View style={styles.googleMark}>
              <Text style={styles.googleMarkText}>G</Text>
            </View>
            <Text style={styles.googleButtonText}>
              {googleLoading ? 'Abrindo contas…' : 'Continuar com Google'}
            </Text>
            {googleLoading ? <ActivityIndicator size="small" color={colors.green} /> : null}
          </Pressable>
          <View style={styles.authDividerRow}>
            <View style={styles.authDivider} />
            <Text style={styles.authDividerText}>OU</Text>
            <View style={styles.authDivider} />
          </View>
          <Pressable style={styles.emailButton} onPress={() => setShowOtherMethods(true)}>
            <Text style={styles.emailButtonText}>Entrar com e-mail</Text>
          </Pressable>
          <Text style={styles.authPrivacy}>
            O Google mostra o seletor seguro de contas do próprio Android.
          </Text>
        </View>
      )}
    </View>
  );
}

function SignedInApp() {
  const { colors, common, styles } = useAppUi();
  const [route, setRoute] = useState<RouteKey>('dashboard');
  const [menu, setMenu] = useState(false);
  const [month, setMonth] = useState(currentDate().slice(0, 7));
  const accounts = useData<Row[]>('/accounts');
  const categories = useData<Row[]>('/categories');
  const profile = useData<Row>('/me');
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (menu) {
        setMenu(false);
        return true;
      }
      if (route !== 'dashboard') {
        setRoute('dashboard');
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [menu, route]);
  const shared = useMemo(
    () => ({
      month,
      setMonth,
      accounts: accounts.data || [],
      categories: categories.data || [],
      expenseRolloverDay: profile.data?.expense_rollover_day || 25,
      navigate: (next: string) => setRoute(next as RouteKey),
    }),
    [month, accounts.data, categories.data, profile.data],
  );
  const content = {
    dashboard: <DashboardScreen {...shared} />,
    transactions: <TransactionsScreen {...shared} />,
    accounts: <AccountsScreen {...shared} />,
    cards: <CardsScreen {...shared} />,
    budgets: <BudgetsScreen {...shared} />,
    goals: <GoalsScreen {...shared} />,
    plans: <FuturePlansScreen />,
    recurrences: <RecurrencesScreen {...shared} />,
    categories: <CategoriesScreen {...shared} />,
    settings: <SettingsScreen />,
  }[route];
  return (
    <View style={common.screen}>
      <View style={styles.topbar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Abrir navegação"
          accessibilityState={{ expanded: menu }}
          style={styles.menuTrigger}
          onPress={() => setMenu(true)}
          hitSlop={8}
        >
          <Menu size={20} color={colors.muted} />
        </Pressable>
        <Text style={styles.topbarLabel}>
          <Text style={styles.topbarLabelStrong}>SALDO</Text>
          <Text style={styles.topbarDivider}> / </Text>
          CADERNO FINANCEIRO
        </Text>
        <UserButton />
      </View>
      {menu ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fechar navegação"
            style={styles.menuScrim}
            onPress={() => setMenu(false)}
          />
          <View style={styles.menu}>
            <View style={styles.menuBrandRow}>
              <Text style={styles.menuBrand}>
                saldo<Text style={styles.menuBrandDot}>.</Text>
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Fechar navegação"
                style={styles.menuClose}
                onPress={() => setMenu(false)}
                hitSlop={8}
              >
                <X size={20} color="#fff" />
              </Pressable>
            </View>
            <Text style={styles.workspaceLabel}>ESPAÇO PESSOAL</Text>
            <ScrollView contentContainerStyle={styles.menuContent}>
              {routes.map(([key, label, Icon], index) => (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityState={{ selected: route === key }}
                  style={[styles.menuItem, route === key && styles.menuItemActive]}
                  onPress={() => {
                    setRoute(key);
                    setMenu(false);
                  }}
                >
                  <Text style={styles.menuIndex}>{String(index + 1).padStart(2, '0')}</Text>
                  <Icon size={19} color={route === key ? '#fff' : colors.sidebarText} />
                  <Text style={[styles.menuItemText, route === key && styles.menuItemTextActive]}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={styles.menuPrivacy}>
              <ShieldCheck size={18} color="#9fb4ac" />
              <View>
                <Text style={styles.menuPrivacyTitle}>Seu espaço é só seu.</Text>
                <Text style={styles.menuPrivacyCopy}>Dados financeiros individuais</Text>
              </View>
            </View>
            <Text style={styles.menuFooter}>Saldo · Valores em euros · Regime de caixa</Text>
          </View>
        </>
      ) : null}
      <View style={{ flex: 1 }}>{content}</View>
    </View>
  );
}

function Root() {
  const { colors, styles } = useAppUi();
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  if (!isLoaded) {
    return (
      <View style={styles.boot}>
        <Text style={styles.logo}>
          saldo<Text style={{ color: colors.green }}>.</Text>
        </Text>
        <ActivityIndicator color={colors.green} />
      </View>
    );
  }
  return isSignedIn ? <SignedInApp /> : <SignedOut />;
}

function UpdateNotice() {
  const { styles } = useAppUi();
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => {
    if (!Updates.isEnabled || __DEV__) return;
    void (async () => {
      try {
        const update = await Updates.checkForUpdateAsync();
        if (!update.isAvailable) return;
        setStatus('Atualizando o aplicativo…');
        await Updates.fetchUpdateAsync();
        await Updates.reloadAsync();
      } catch {
        // A atualização é opcional; uma falha de rede nunca bloqueia a abertura do app.
      }
    })();
  }, []);
  if (!status) return null;
  return (
    <View style={styles.updateNotice}>
      <ActivityIndicator size="small" color="#fff" />
      <Text style={styles.updateText}>{status}</Text>
    </View>
  );
}

function ThemedApp() {
  const { colors, common, isDark, styles } = useAppUi();
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.paper).catch(() => undefined);
  }, [colors.paper]);
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <SafeAreaView style={styles.appSafeArea} edges={['top', 'right', 'bottom', 'left']}>
        {!clerkPublishableKey ? (
          <View style={styles.boot}>
            <Text style={common.title}>Configuração incompleta</Text>
            <Text style={common.subtitle}>
              Defina EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY antes de compilar o aplicativo.
            </Text>
          </View>
        ) : (
          <ClerkProvider publishableKey={clerkPublishableKey} tokenCache={tokenCache}>
            <QueryClientProvider client={queryClient}>
              <View style={styles.appContent}>
                <UpdateNotice />
                <Root />
              </View>
            </QueryClientProvider>
          </ClerkProvider>
        )}
      </SafeAreaView>
    </>
  );
}

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : 'Falha desconhecida.' };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Falha ao iniciar o Saldo', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <SafeAreaView style={styles.fallbackPage}>
        <Text style={styles.fallbackBrand}>saldo.</Text>
        <Text style={styles.fallbackTitle}>Não foi possível abrir o aplicativo.</Text>
        <Text style={styles.fallbackText}>
          Feche o Saldo e tente novamente. Se continuar, envie esta mensagem: {this.state.error}
        </Text>
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  fallbackPage: {
    flex: 1,
    justifyContent: 'center',
    padding: 28,
    gap: 14,
    backgroundColor: '#f6f5ef',
  },
  fallbackBrand: { color: '#193f33', fontSize: 34, fontWeight: '800' },
  fallbackTitle: { color: '#1d2924', fontSize: 24, lineHeight: 31, fontWeight: '800' },
  fallbackText: { color: '#5f6f67', fontSize: 14, lineHeight: 21 },
});

export default function App() {
  return (
    <SafeAreaProvider>
      <AppErrorBoundary>
        <ThemeProvider>
          <ThemedApp />
        </ThemeProvider>
      </AppErrorBoundary>
    </SafeAreaProvider>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    appSafeArea: { flex: 1, backgroundColor: colors.paper },
    appContent: { flex: 1 },
    boot: {
      flex: 1,
      backgroundColor: colors.paper,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 18,
      padding: 30,
    },
    authPage: { flex: 1, backgroundColor: colors.paper },
    authBrand: {
      backgroundColor: colors.sidebar,
      paddingHorizontal: 25,
      paddingTop: 58,
      paddingBottom: 28,
      gap: 7,
    },
    logo: { color: colors.ink, fontSize: 39, fontWeight: '800', letterSpacing: -1.5 },
    authCopy: { color: '#d7e7e0', fontSize: 14 },
    authNative: { flex: 1 },
    authNativeView: { flex: 1 },
    authBack: {
      minHeight: 48,
      justifyContent: 'center',
      paddingHorizontal: 22,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
      backgroundColor: colors.surface,
    },
    authBackText: { color: colors.green, fontSize: 13, fontWeight: '700' },
    authChoice: {
      flex: 1,
      paddingHorizontal: 24,
      paddingTop: 42,
    },
    authChoiceHeader: { marginBottom: 30, gap: 8 },
    authTitle: { color: colors.ink, fontSize: 25, lineHeight: 31, fontWeight: '800' },
    authDescription: { color: colors.muted, fontSize: 14, lineHeight: 21 },
    googleButton: {
      minHeight: 54,
      paddingHorizontal: 15,
      borderWidth: 1,
      borderColor: colors.lineStrong,
      borderRadius: 9,
      backgroundColor: colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    googleButtonPressed: { backgroundColor: colors.pressed },
    googleButtonDisabled: { opacity: 0.7 },
    googleMark: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: '#e1e5e3',
      backgroundColor: '#fff',
      alignItems: 'center',
      justifyContent: 'center',
    },
    googleMarkText: { color: '#4285f4', fontSize: 16, fontWeight: '800' },
    googleButtonText: { flex: 1, color: colors.ink, fontSize: 14, fontWeight: '700' },
    authDividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 24 },
    authDivider: { flex: 1, height: 1, backgroundColor: colors.line },
    authDividerText: { color: colors.muted, fontSize: 9, fontWeight: '700', letterSpacing: 1.4 },
    emailButton: {
      minHeight: 50,
      borderRadius: 9,
      backgroundColor: colors.sidebar,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emailButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
    authPrivacy: {
      marginTop: 20,
      color: colors.muted,
      fontSize: 11,
      lineHeight: 17,
      textAlign: 'center',
    },
    topbar: {
      height: 64,
      backgroundColor: colors.surface,
      borderBottomColor: colors.line,
      borderBottomWidth: 1,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    menuTrigger: {
      width: 40,
      height: 40,
      borderRadius: 3,
      alignItems: 'center',
      justifyContent: 'center',
    },
    topbarLabel: {
      flex: 1,
      marginHorizontal: 12,
      color: colors.muted,
      fontSize: 9,
      letterSpacing: 1.05,
    },
    topbarLabelStrong: { color: colors.ink, fontWeight: '700' },
    topbarDivider: { color: colors.lineStrong },
    menuScrim: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      zIndex: 19,
      backgroundColor: colors.overlay,
    },
    menu: {
      position: 'absolute',
      zIndex: 20,
      top: 0,
      bottom: 0,
      left: 0,
      width: 280,
      backgroundColor: colors.sidebar,
      paddingHorizontal: 18,
      paddingTop: 20,
      paddingBottom: 18,
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 18,
      elevation: 16,
    },
    menuBrandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginHorizontal: 10,
    },
    menuBrand: { color: '#fff', fontSize: 28, fontWeight: '800', letterSpacing: -1.2 },
    menuBrandDot: { color: '#9fc4b1' },
    menuClose: {
      width: 40,
      height: 40,
      borderRadius: 3,
      alignItems: 'center',
      justifyContent: 'center',
    },
    workspaceLabel: {
      marginHorizontal: 12,
      marginTop: 32,
      marginBottom: 12,
      color: '#718f84',
      fontSize: 9,
      letterSpacing: 1.45,
    },
    menuContent: { gap: 3 },
    menuItem: {
      minHeight: 43,
      borderRadius: 8,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
    },
    menuItemActive: { backgroundColor: '#2a4d42' },
    menuIndex: { width: 22, color: '#708d82', fontSize: 9, fontWeight: '700' },
    menuItemText: { color: colors.sidebarText, fontSize: 13, lineHeight: 20, fontWeight: '500' },
    menuItemTextActive: { color: '#fff' },
    themeSection: { marginTop: 18 },
    themeOptions: { flexDirection: 'row', gap: 6, marginHorizontal: 10 },
    themeOption: {
      flex: 1,
      minHeight: 54,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: '#315047',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
    },
    themeOptionActive: { backgroundColor: '#2a4d42', borderColor: '#6a9c8c' },
    themeOptionText: { color: colors.sidebarText, fontSize: 10, fontWeight: '600' },
    themeOptionTextActive: { color: '#fff' },
    menuPrivacy: {
      marginTop: 'auto',
      marginHorizontal: 10,
      paddingTop: 24,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 9,
    },
    menuPrivacyTitle: { color: '#9fb4ac', fontSize: 11, lineHeight: 16 },
    menuPrivacyCopy: { color: '#708d82', fontSize: 10, lineHeight: 16 },
    menuFooter: { marginHorizontal: 10, marginTop: 12, color: '#708d82', fontSize: 9 },
    updateNotice: {
      minHeight: 42,
      backgroundColor: colors.green,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 9,
    },
    updateText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  });
