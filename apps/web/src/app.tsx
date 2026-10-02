import { useEffect, useState } from 'react';
import { NavLink, Route, Routes, Navigate } from 'react-router-dom';
import { UserButton } from '@clerk/clerk-react';
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  PieChart,
  Target,
  Repeat2,
  CreditCard,
  Tags,
  Menu,
  ShieldCheck,
  Telescope,
  Settings as SettingsIcon,
} from 'lucide-react';
import { FormDialog, LoadState, type FormSpec } from './components/ui';
import { BrandMark } from './components/brand';
import { useData, currentDate, type Row } from './lib/api';
import { Dashboard } from './features/dashboard';
import { PurchaseDialog, type PurchaseEditorSpec } from './features/purchase-dialog';
import {
  Accounts,
  Budgets,
  Cards,
  Categories,
  Settings,
  Goals,
  FuturePlans,
  Recurrences,
  Transactions,
} from './features/pages';

const navigation = [
  ['/', 'Visão geral', LayoutDashboard],
  ['/transactions', 'Movimentações', ArrowLeftRight],
  ['/accounts', 'Contas', Wallet],
  ['/cards', 'Cartões', CreditCard],
  ['/budgets', 'Orçamento', PieChart],
  ['/goals', 'Metas', Target],
  ['/future-plans', 'Planos futuros', Telescope],
  ['/recurrences', 'Recorrentes', Repeat2],
  ['/categories', 'Categorias', Tags],
  ['/settings', 'Configurações', SettingsIcon],
] as const;
export function App() {
  const [month, setMonth] = useState(currentDate().slice(0, 7)),
    [form, setForm] = useState<FormSpec | null>(null),
    [purchaseEditor, setPurchaseEditor] = useState<PurchaseEditorSpec | null>(null),
    [menu, setMenu] = useState(false),
    [theme, setTheme] = useState<'system' | 'light' | 'dark'>(
      () => (localStorage.getItem('saldo.theme') as 'system' | 'light' | 'dark') || 'system',
    );
  useEffect(() => {
    localStorage.setItem('saldo.theme', theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const accounts = useData('/accounts'),
    categories = useData('/categories'),
    profile = useData<Row>('/me');
  const props = {
    month,
    setMonth,
    open: setForm,
    openPurchase: setPurchaseEditor,
    accounts: accounts.data || [],
    categories: categories.data || [],
    expenseRolloverDay: profile.data?.expense_rollover_day || 25,
    theme,
    setTheme,
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menu ? 'open' : ''}`}>
        <NavLink to="/" className="brand">
          <BrandMark />
          saldo<span className="brand-dot">.</span>
        </NavLink>
        <div className="workspace-label">ESPAÇO PESSOAL</div>
        <nav aria-label="Navegação principal">
          {navigation.map(([to, label, Icon], index) => (
            <NavLink key={to} to={to} end={to === '/'} onClick={() => setMenu(false)}>
              <small className="nav-index">{String(index + 1).padStart(2, '0')}</small>
              <Icon size={19} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <ShieldCheck size={18} />
          <div>
            Seu espaço é só seu.<small>Dados financeiros individuais</small>
          </div>
        </div>
      </aside>
      {menu && (
        <button
          className="sidebar-scrim"
          aria-label="Fechar navegação"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="main-column">
        <div className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Abrir navegação"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            <Menu />
          </button>
          <span className="topbar-label">
            <b>SALDO</b>
            <i>/</i> CADERNO FINANCEIRO
          </span>
          <div className="topbar-actions">
            <UserButton />
          </div>
        </div>
        <main>
          <LoadState
            loading={accounts.isLoading || categories.isLoading}
            error={accounts.error || categories.error}
          />
          {accounts.data && categories.data && (
            <Routes>
              <Route path="/" element={<Dashboard month={month} setMonth={setMonth} />} />
              <Route path="/accounts" element={<Accounts {...props} />} />
              <Route path="/transactions" element={<Transactions key={month} {...props} />} />
              <Route path="/budgets" element={<Budgets {...props} />} />
              <Route path="/goals" element={<Goals {...props} />} />
              <Route path="/future-plans" element={<FuturePlans {...props} />} />
              <Route path="/future-plans/:planId" element={<FuturePlans {...props} />} />
              <Route path="/recurrences" element={<Recurrences {...props} />} />
              <Route path="/cards" element={<Cards {...props} />} />
              <Route path="/categories" element={<Categories {...props} />} />
              <Route path="/settings" element={<Settings {...props} />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          )}
        </main>
        <footer>
          Saldo · Clareza para suas decisões <span>Valores em euros · Regime de caixa</span>
        </footer>
      </div>
      {form && <FormDialog spec={form} onClose={() => setForm(null)} />}
      {purchaseEditor && (
        <PurchaseDialog spec={purchaseEditor} onClose={() => setPurchaseEditor(null)} />
      )}
    </div>
  );
}
