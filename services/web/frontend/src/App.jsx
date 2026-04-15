import { useAuth } from './shared/auth/AuthContext';
import { lazy, Suspense, useCallback } from 'react';

const LoginForm = lazy(() => import('./features/auth/LoginForm').then(m => ({ default: m.LoginForm })));
const Shell = lazy(() => import('./features/workspace/Shell').then(m => ({ default: m.Shell })));

function Loader() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: 'var(--bg)', color: 'var(--muted)', fontSize: 12,
    }}>
      Loading...
    </div>
  );
}

export default function App() {
  const { currentUser, loading, logout } = useAuth();

  const handleUnauthorized = useCallback(() => {
    logout();
  }, [logout]);

  if (loading) return <Loader />;

  if (!currentUser) {
    return (
      <Suspense fallback={<Loader />}>
        <LoginForm />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<Loader />}>
      <Shell onUnauthorized={handleUnauthorized} />
    </Suspense>
  );
}
