import {
  Component,
  StrictMode,
  useEffect,
  useRef,
  useState,
  type ErrorInfo,
  type FormEvent,
  type ReactNode,
} from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import {
  ClerkProvider,
  ClerkLoaded,
  ClerkLoading,
  SignIn,
  SignUp,
  SignedIn,
  SignedOut,
  useUser,
} from '@clerk/clerk-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './app';
import { BrandMark } from './components/brand';
import './styles.css';
import './redesign.css';

const key = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: unknown) {
    return {
      error: error instanceof Error ? error.message : 'Falha desconhecida ao iniciar o aplicativo.',
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Falha ao iniciar o Saldo', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="setup-page" role="alert">
        <span className="brand">saldo.</span>
        <h1>Não foi possível abrir o aplicativo.</h1>
        <p>Feche o Saldo e tente novamente. Se continuar, envie a mensagem abaixo.</p>
        <div className="setup-note">
          <strong>Detalhes técnicos</strong>
          <br />
          {this.state.error}
          <br />
          <small>Origem: {window.location.origin}</small>
        </div>
      </div>
    );
  }
}

function AuthPage({ children }: { children: ReactNode }) {
  return (
    <div className="auth-page">
      <div className="auth-copy">
        <span className="brand light">
          <BrandMark />
          saldo.
        </span>
        <h1>
          Mais clareza.
          <br />
          Melhores decisões.
        </h1>
        <p>Suas contas, seus objetivos e seu futuro financeiro, em um só lugar.</p>
        <small>Receitas e despesas reais. Planejamento separado.</small>
      </div>
      {children}
    </div>
  );
}

if (
  import.meta.env.PROD &&
  'serviceWorker' in navigator &&
  ['http:', 'https:'].includes(window.location.protocol)
) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}

function AuthForm() {
  const [status, setStatus] = useState('');
  const timeout = useRef<number | undefined>(undefined);
  const isSignUp = new URLSearchParams(window.location.search).get('flow') === 'sign-up';
  const showProgress = (event: FormEvent) => {
    if (!(event.target instanceof HTMLFormElement)) return;
    window.clearTimeout(timeout.current);
    setStatus('A verificar os seus dados…');
    timeout.current = window.setTimeout(
      () => setStatus('O login não respondeu. Verifique a internet e tente novamente.'),
      15000,
    );
  };
  useEffect(() => () => window.clearTimeout(timeout.current), []);
  return (
    <div
      className="auth-form"
      onSubmitCapture={showProgress}
      onInputCapture={() => status.includes('não respondeu') && setStatus('')}
    >
      {isSignUp ? (
        <SignUp routing="hash" signInUrl="/" />
      ) : (
        <SignIn routing="hash" signUpUrl="/?flow=sign-up" />
      )}
      {status && (
        <p
          className={`auth-submit-status${status.includes('não respondeu') ? ' error' : ''}`}
          role="status"
        >
          {status}
        </p>
      )}
    </div>
  );
}

function SessionApp() {
  const { user } = useUser();
  return <Session key={user?.id} />;
}
function Session() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 20000, refetchOnWindowFocus: true } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      {key ? (
        <ClerkProvider
          publishableKey={key}
          afterSignOutUrl="/"
          localization={{
            locale: 'pt-PT',
            dividerText: 'ou',
            formFieldLabel__emailAddress: 'E-mail',
            formFieldLabel__password: 'Palavra-passe',
            formFieldAction__forgotPassword: 'Esqueceu a palavra-passe?',
            formButtonPrimary: 'Continuar',
            backButton: 'Voltar',
            signIn: {
              start: {
                title: 'Entre no seu espaço',
                subtitle: 'Use a sua conta para continuar no Saldo.',
                actionText: 'Ainda não tem conta?',
                actionLink: 'Criar conta',
              },
            },
            signUp: {
              start: {
                title: 'Crie o seu espaço',
                subtitle: 'Comece a organizar a sua vida financeira.',
                actionText: 'Já tem conta?',
                actionLink: 'Entrar',
              },
            },
          }}
        >
          <ClerkLoading>
            <AuthPage>
              <div className="auth-form" aria-hidden="true" />
            </AuthPage>
          </ClerkLoading>
          <ClerkLoaded>
            <SignedIn>
              <SessionApp />
            </SignedIn>
            <SignedOut>
              <AuthPage>
                <AuthForm />
              </AuthPage>
            </SignedOut>
          </ClerkLoaded>
        </ClerkProvider>
      ) : (
        <div className="setup-page">
          <span className="brand">
            <BrandMark />
            saldo.
          </span>
          <h1>
            Seu espaço financeiro
            <br />
            está quase pronto.
          </h1>
          <p>Configure a chave pública do Clerk para habilitar o acesso seguro ao aplicativo.</p>
          <div className="setup-note">
            Defina <code>VITE_CLERK_PUBLISHABLE_KEY</code> no arquivo de ambiente e reinicie o
            frontend. As instruções completas estão no README do projeto.
          </div>
          <small>Nenhum dado financeiro é exibido sem autenticação.</small>
        </div>
      )}
    </AppErrorBoundary>
  </StrictMode>,
);
