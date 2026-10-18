import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, KeyRound, Save, UserRound } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../app/auth';
import { useToast } from '../app/toast';
import { Button, Field, PageHeading } from '../components/ui';
import type { User } from '../types';

export function AccountPage() {
  const { user, setUser } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [profileBusy, setProfileBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const updateProfile = async (event: FormEvent) => {
    event.preventDefault(); setProfileBusy(true);
    try { const result = await api<{ user: User }>('/api/account/profile', { method: 'PATCH', body: { name, email } }); setUser(result.user); notify('Account details saved.'); }
    catch (error) { notify(error instanceof Error ? error.message : 'Could not save account details.', 'error'); }
    finally { setProfileBusy(false); }
  };
  const updatePassword = async (event: FormEvent) => {
    event.preventDefault(); setPasswordBusy(true);
    try { await api('/api/account/password', { method: 'PATCH', body: { currentPassword, newPassword } }); setCurrentPassword(''); setNewPassword(''); notify('Password changed.'); }
    catch (error) { notify(error instanceof Error ? error.message : 'Could not change password.', 'error'); }
    finally { setPasswordBusy(false); }
  };
  const deleteAccount = async () => {
    if (!window.confirm('Delete your account and all saved QR codes? This cannot be undone.')) return;
    setDeleteBusy(true);
    try { await api('/api/account', { method: 'DELETE' }); setUser(null); navigate('/'); notify('Your account has been deleted.'); }
    catch (error) { notify(error instanceof Error ? error.message : 'Could not delete your account.', 'error'); }
    finally { setDeleteBusy(false); }
  };
  return <><PageHeading eyebrow="ACCOUNT SETTINGS" title="My account" description="Keep your profile and sign-in details up to date." />
    <div className="settings-stack"><section className="settings-card"><div className="settings-card-heading"><span className="settings-icon"><UserRound size={20} /></span><div><h2>Profile details</h2><p>Used for your account and workspace.</p></div></div><form onSubmit={(event) => void updateProfile(event)} className="settings-form"><Field label="Name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} /><Field label="Email address" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /><Button type="submit" loading={profileBusy} icon={<Save size={16} />}>Save changes</Button></form></section>
    <section className="settings-card"><div className="settings-card-heading"><span className="settings-icon"><KeyRound size={20} /></span><div><h2>Change password</h2><p>Use at least 10 characters for your new password.</p></div></div><form onSubmit={(event) => void updatePassword(event)} className="settings-form"><Field label="Current password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required autoComplete="current-password" /><Field label="New password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required minLength={10} autoComplete="new-password" /><Button type="submit" variant="secondary" loading={passwordBusy}>Update password</Button></form></section>
    <section className="settings-card danger-zone"><div className="settings-card-heading"><span className="settings-icon danger"><AlertTriangle size={20} /></span><div><h2>Delete account</h2><p>Deletes your account, saved codes, folders and scan records.</p></div></div><Button variant="danger" loading={deleteBusy} onClick={() => void deleteAccount()}>Delete account</Button></section></div>
  </>;
}
