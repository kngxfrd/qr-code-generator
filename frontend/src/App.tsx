import { useEffect, useState } from 'react';
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './app/auth';
import { ToastProvider, useToast } from './app/toast';
import { BuilderLayout, PublicLayout, WorkspaceLayout } from './components/layout';
import { AccountPage } from './pages/AccountPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { AuthPage } from './pages/AuthPage';
import { BillingPage } from './pages/BillingPage';
import { BuilderPage } from './pages/BuilderPage';
import { ContactPage, FaqPage, LegalPage } from './pages/PublicPages';
import { LibraryPage } from './pages/LibraryPage';

function BuilderRoute() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  return <BuilderLayout sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}><BuilderPage /></BuilderLayout>;
}

function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="app-loading"><span className="spinner" />Loading your workspace…</div>;
  if (!user) return <Navigate to={`/signin?return=${encodeURIComponent(location.pathname)}`} replace />;
  return <WorkspaceLayout><Outlet /></WorkspaceLayout>;
}

function AuthRoute({ mode }: { mode: 'signup' | 'signin' }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="app-loading"><span className="spinner" />Getting things ready…</div>;
  if (user) return <Navigate to="/qr-codes" replace />;
  return <AuthPage mode={mode} />;
}

function NotFoundPage() {
  return <div className="not-found"><p className="eyebrow">404 · NOT FOUND</p><h1>This page isn’t here.</h1><p>The address may have changed. Your QR codes are still in your workspace.</p><Link className="button button-primary" to="/">Go to QR generator</Link></div>;
}

function RouteNotice() {
  const location = useLocation();
  const navigate = useNavigate();
  const { notify } = useToast();
  const { refresh } = useAuth();
  useEffect(() => {
    const result = new URLSearchParams(location.search).get('google');
    if (!result) return;
    void (async () => {
      if (result === 'success') { await refresh(); notify('You’re signed in with Google.'); }
      else if (result === 'unconfigured') notify('Google sign-in needs OAuth credentials on the server.', 'error');
      else notify('Google sign-in did not complete. Please try again.', 'error');
      navigate(location.pathname, { replace: true });
    })();
  }, [location.pathname, location.search]);
  return null;
}

function AppRoutes() {
  return <><RouteNotice /><Routes>
    <Route path="/" element={<BuilderRoute />} />
    <Route path="/signup" element={<AuthRoute mode="signup" />} />
    <Route path="/signin" element={<AuthRoute mode="signin" />} />
    <Route element={<RequireAuth />}>
      <Route path="/qr-codes" element={<LibraryPage />} />
      <Route path="/analytics" element={<AnalyticsPage />} />
      <Route path="/account" element={<AccountPage />} />
      <Route path="/billing" element={<BillingPage />} />
    </Route>
    <Route element={<PublicLayout><Outlet /></PublicLayout>}>
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/faq" element={<FaqPage />} />
      <Route path="/privacy" element={<LegalPage page="privacy" />} />
      <Route path="/terms" element={<LegalPage page="terms" />} />
      <Route path="/cookies" element={<LegalPage page="cookies" />} />
    </Route>
    <Route path="*" element={<NotFoundPage />} />
  </Routes></>;
}

export default function App() {
  return <BrowserRouter><ToastProvider><AuthProvider><AppRoutes /></AuthProvider></ToastProvider></BrowserRouter>;
}
