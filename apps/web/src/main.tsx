import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ClerkProvider, SignIn, SignUp, SignedIn, SignedOut, useUser } from '@clerk/clerk-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './app';
import './styles.css';
import './redesign.css';

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
const key = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {key ? (
      <ClerkProvider publishableKey={key} afterSignOutUrl="/">
        <SignedIn>
          <SessionApp />
        </SignedIn>
        <SignedOut>
          <div className="auth-page">
            <div className="auth-copy">
              <span className="brand light">
                <span className="brand-mark">s</span>saldo.
              </span>
              <h1>
                Mais clareza.
                <br />
                Melhores decisões.
              </h1>
              <p>Suas contas, seus objetivos e seu futuro financeiro, em um só lugar.</p>
              <small>Receitas e despesas reais. Planejamento separado.</small>
            </div>
            <div className="auth-form">
              {new URLSearchParams(window.location.search).get('flow') === 'sign-up' ? (
                <SignUp routing="hash" signInUrl="/" />
              ) : (
                <SignIn routing="hash" signUpUrl="/?flow=sign-up" />
              )}
            </div>
          </div>
        </SignedOut>
      </ClerkProvider>
    ) : (
      <div className="setup-page">
        <span className="brand">
          <span className="brand-mark">s</span>saldo.
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
  </StrictMode>,
);
