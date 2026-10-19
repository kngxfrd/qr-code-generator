import { useState, type ReactNode } from 'react';
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import { AlignJustify, ArrowUpRight, BarChart3, CircleHelp, CreditCard, LogOut, Menu, QrCode, Settings2, X } from 'lucide-react';
import { useAuth } from '../app/auth';
import { api } from '../api/client';
import { useToast } from '../app/toast';

const links = [
  { to: '/qr-codes', label: 'My QR codes', icon: QrCode },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/account', label: 'My account', icon: Settings2 },
  { to: '/billing', label: 'Plans & billing', icon: CreditCard },
];

export function Brand() {
  return <Link className="brand" to="/" aria-label="Free QR Generator home"><span className="brand-mark"><QrCode size={24} strokeWidth={2.4} /></span><span>free qr<span className="brand-period">.</span></span></Link>;
}

export function AppHeader({ builder = false, onMenu }: { builder?: boolean; onMenu?: () => void }) {
  const { user } = useAuth();
  return <header className="app-header"><div className="header-left">{builder && <button className="icon-button menu-button" onClick={onMenu} aria-label="Open menu"><Menu size={21} /></button>}<Brand /></div><div className="header-actions">{user ? <><span className="header-user">{user.name}</span><Link className="button button-secondary button-sm" to="/qr-codes">Workspace <ArrowUpRight size={15} /></Link></> : <><Link className="header-link" to="/signin">Sign in</Link><Link className="button button-primary button-sm" to="/signup">Create account</Link></>}</div></header>;
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, setUser } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const signOut = async () => {
    try { await api('/api/auth/signout', { method: 'POST', body: {} }); } catch (error) { notify(error instanceof Error ? error.message : 'Could not sign out.', 'error'); }
    setUser(null); onClose(); navigate('/');
  };
  return <><div className={`sidebar-overlay ${open ? 'open' : ''}`} onClick={onClose} /><aside className={`workspace-sidebar ${open ? 'open' : ''}`}><div className="sidebar-top"><Brand /><button className="icon-button sidebar-close" onClick={onClose} aria-label="Close menu"><X size={20} /></button></div><div className="sidebar-user"><span className="avatar">{user?.name.slice(0, 1).toUpperCase() || 'F'}</span><div><strong>{user?.name || 'Your workspace'}</strong><small>{user?.email || 'Sign in to save your codes'}</small></div></div><nav className="side-nav">{links.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} onClick={onClose} className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}><Icon size={19} /><span>{label}</span></NavLink>)}</nav><div className="sidebar-spacer" /><div className="sidebar-plan"><span className="plan-kicker">STATIC QR CREDITS</span><strong>{user ? `${user.staticQrCredits} available` : '3 for $2'}</strong><p>Pay once for a pack of three downloadable codes.</p><Link to="/billing" onClick={onClose}>View pricing <ArrowUpRight size={14} /></Link></div><div className="sidebar-bottom"><Link className="side-link" to="/contact" onClick={onClose}><CircleHelp size={18} /><span>Help & contact</span></Link>{user && <button className="side-link side-button" onClick={() => void signOut()}><LogOut size={18} /><span>Sign out</span></button>}</div></aside></>;
}

export function WorkspaceLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <div className="workspace-layout"><Sidebar open={open} onClose={() => setOpen(false)} /><div className="workspace-main"><header className="workspace-mobile-head"><button className="icon-button" onClick={() => setOpen(true)} aria-label="Open navigation"><AlignJustify size={20} /></button><Brand /></header><main className="workspace-content">{children}</main></div></div>;
}

export function PublicLayout({ children }: { children: ReactNode }) {
  return <div className="public-layout"><AppHeader /><main>{children}</main><footer className="public-footer"><Brand /><div><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/cookies">Cookies</Link><Link to="/faq">FAQs</Link><Link to="/contact">Contact</Link></div><span>© {new Date().getFullYear()} Free QR Generator</span></footer></div>;
}

export function BuilderLayout({ children, sidebarOpen, setSidebarOpen }: { children: ReactNode; sidebarOpen: boolean; setSidebarOpen: (open: boolean) => void }) {
  const location = useLocation();
  return <div className="builder-layout"><AppHeader builder onMenu={() => setSidebarOpen(!sidebarOpen)} /><Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} /><main className="builder-content" key={location.pathname}>{children}</main></div>;
}
