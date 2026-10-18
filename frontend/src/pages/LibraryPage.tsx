import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDownToLine, ArrowUpDown, FolderPlus, Pencil, Plus, QrCode, Search, Trash2, X } from 'lucide-react';
import { api } from '../api/client';
import { useToast } from '../app/toast';
import { downloadQr } from '../components/qr';
import { Button, EmptyState, Field, Modal, PageHeading, SelectField } from '../components/ui';
import type { QRCodeRecord, QRFolder } from '../types';

export function LibraryPage() {
  const { notify } = useToast();
  const navigate = useNavigate();
  const [codes, setCodes] = useState<QRCodeRecord[]>([]);
  const [folders, setFolders] = useState<QRFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All');
  const [type, setType] = useState('All');
  const [folderFilter, setFolderFilter] = useState('All');
  const [sort, setSort] = useState('newest');
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [editing, setEditing] = useState<QRCodeRecord | null>(null);
  const [editName, setEditName] = useState('');
  const [editFolder, setEditFolder] = useState('');
  const [busyId, setBusyId] = useState('');
  const reload = async () => {
    setLoading(true);
    try {
      const [codeResult, folderResult] = await Promise.all([api<{ codes: QRCodeRecord[] }>('/api/codes'), api<{ folders: QRFolder[] }>('/api/folders')]);
      setCodes(codeResult.codes); setFolders(folderResult.folders);
    } catch (error) { notify(error instanceof Error ? error.message : 'Could not load your workspace.', 'error'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void reload(); }, []);
  const filtered = useMemo(() => codes.filter((code) => {
    const matchesSearch = !search || `${code.name} ${code.type} ${code.payload}`.toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (status === 'All' || code.status === status) && (type === 'All' || code.type === type.toLowerCase()) && (folderFilter === 'All' || (folderFilter === 'Unfiled' ? !code.folderId : code.folderId === folderFilter));
  }).sort((a, b) => sort === 'oldest' ? a.createdAt.localeCompare(b.createdAt) : sort === 'name' ? a.name.localeCompare(b.name) : b.updatedAt.localeCompare(a.updatedAt)), [codes, search, status, type, folderFilter, sort]);
  const createFolder = async () => {
    try { await api('/api/folders', { method: 'POST', body: { name: folderName } }); setFolderName(''); setFolderOpen(false); await reload(); notify('Folder created.'); }
    catch (error) { notify(error instanceof Error ? error.message : 'Could not create the folder.', 'error'); }
  };
  const saveCode = async () => {
    if (!editing) return;
    try { await api(`/api/codes/${editing.id}`, { method: 'PATCH', body: { name: editName.trim(), folderId: editFolder || null } }); setEditing(null); await reload(); notify('QR code updated.'); }
    catch (error) { notify(error instanceof Error ? error.message : 'Could not update this QR code.', 'error'); }
  };
  const updateStatus = async (code: QRCodeRecord) => {
    setBusyId(code.id);
    try { await api(`/api/codes/${code.id}`, { method: 'PATCH', body: { status: code.status === 'Active' ? 'Paused' : 'Active' } }); await reload(); }
    catch (error) { notify(error instanceof Error ? error.message : 'Could not update this QR code.', 'error'); }
    finally { setBusyId(''); }
  };
  const removeCode = async (code: QRCodeRecord) => {
    if (!window.confirm(`Delete “${code.name}”? This cannot be undone.`)) return;
    try { await api(`/api/codes/${code.id}`, { method: 'DELETE' }); await reload(); notify('QR code deleted.'); }
    catch (error) { notify(error instanceof Error ? error.message : 'Could not delete this QR code.', 'error'); }
  };
  const download = async (code: QRCodeRecord) => {
    try { await downloadQr(code.payload, code.design, 'png', code.name); }
    catch (error) { notify(error instanceof Error ? error.message : 'Could not download the QR code.', 'error'); }
  };
  const folderNameById = (id: string | null) => folders.find((folder) => folder.id === id)?.name || 'Unfiled';
  return <>
    <PageHeading eyebrow="YOUR WORKSPACE" title="My QR codes" description="All the codes you’ve made, ready to edit or download." action={<div className="heading-actions"><Button variant="secondary" icon={<FolderPlus size={17} />} onClick={() => setFolderOpen(true)}>New folder</Button><Button icon={<Plus size={18} />} onClick={() => navigate('/')}>Create QR code</Button></div>} />
    <div className="library-banner"><span className="banner-mark">i</span><span><strong>Your static QR codes have no expiry.</strong> They’ll keep working as long as the destination does.</span><Link to="/faq">How static codes work <ArrowUpDown size={14} /></Link></div>
    <div className="folder-section"><div className="section-title"><div><p className="eyebrow">ORGANISE</p><h2>Folders</h2></div><Button variant="ghost" size="sm" icon={<Plus size={16} />} onClick={() => setFolderOpen(true)}>New folder</Button></div>{folders.length ? <div className="folder-grid">{folders.map((folder) => <button className={`folder-card ${folderFilter === folder.id ? 'selected' : ''}`} key={folder.id} onClick={() => setFolderFilter(folderFilter === folder.id ? 'All' : folder.id)}><span className="folder-symbol"><FolderPlus size={21} /></span><strong>{folder.name}</strong><small>{folder.codeCount} {folder.codeCount === 1 ? 'code' : 'codes'}</small></button>)}</div> : <button className="new-folder-card" onClick={() => setFolderOpen(true)}><span><FolderPlus size={22} /></span><strong>Create a folder</strong><small>Group codes by project or campaign.</small></button>}</div>
    <section className="library-section"><div className="section-title"><div><p className="eyebrow">LIBRARY</p><h2>Saved codes <span className="count-pill">{codes.length}</span></h2></div></div><div className="filter-bar"><label className="search-field"><Search size={18} /><input placeholder="Search names, links and types" value={search} onChange={(e) => setSearch(e.target.value)} /><button onClick={() => setSearch('')} aria-label="Clear search">{search && <X size={16} />}</button></label><SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option>All</option><option>Active</option><option>Paused</option></SelectField><SelectField label="Type" value={type} onChange={(e) => setType(e.target.value)}><option>All</option>{Array.from(new Set(codes.map((code) => code.type))).map((value) => <option key={value} value={value}>{value.charAt(0).toUpperCase() + value.slice(1)}</option>)}</SelectField><SelectField label="Folder" value={folderFilter} onChange={(e) => setFolderFilter(e.target.value)}><option value="All">All folders</option><option value="Unfiled">Unfiled</option>{folders.map((folder) => <option value={folder.id} key={folder.id}>{folder.name}</option>)}</SelectField><SelectField label="Sort" value={sort} onChange={(e) => setSort(e.target.value)}><option value="newest">Most recent</option><option value="oldest">Oldest</option><option value="name">Name A–Z</option></SelectField></div>
    {loading ? <div className="loading-state"><span className="spinner" />Loading your QR codes…</div> : filtered.length ? <div className="code-list">{filtered.map((code) => <article className="code-row" key={code.id}><div className="code-thumb">{code.svg ? <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(code.svg)}`} alt="" /> : <QrCode size={28} />}</div><div className="code-main"><div className="code-title"><h3>{code.name}</h3><span className={`status-tag ${code.status.toLowerCase()}`}>{code.status}</span></div><p className="code-url">{code.payload}</p><div className="code-meta"><span>{code.type}</span><span>{folderNameById(code.folderId)}</span><span>Added {new Date(code.createdAt).toLocaleDateString()}</span></div></div><div className="code-actions"><Button variant="secondary" size="sm" icon={<ArrowDownToLine size={15} />} onClick={() => void download(code)}>Download</Button><Button variant="ghost" size="sm" icon={<Pencil size={15} />} onClick={() => { setEditing(code); setEditName(code.name); setEditFolder(code.folderId || ''); }}>Edit</Button><button className="icon-button action-delete" onClick={() => void removeCode(code)} aria-label={`Delete ${code.name}`}><Trash2 size={16} /></button></div></article>)}</div> : <EmptyState title={codes.length ? 'No codes match those filters.' : 'Your first QR code starts here.'} description={codes.length ? 'Clear a filter or try a different search.' : 'Make a code, save it to your workspace, and you can find it here any time.'} action={!codes.length ? <Button onClick={() => navigate('/')}>Create your first QR code <ArrowRightSmall /></Button> : undefined} />}
    </section>
    <Modal open={folderOpen} onClose={() => setFolderOpen(false)} title="Create a folder" footer={<><Button variant="secondary" onClick={() => setFolderOpen(false)}>Cancel</Button><Button onClick={() => void createFolder()} disabled={!folderName.trim()}>Create folder</Button></>}><p className="modal-copy">A name helps you keep related codes together.</p><Field label="Folder name" autoFocus maxLength={80} value={folderName} onChange={(e) => setFolderName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void createFolder()} placeholder="For example: Summer menu" /></Modal>
    <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="Edit QR code" footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={() => void saveCode()} disabled={!editName.trim()}>Save changes</Button></>}><div className="form-stack"><Field label="Code name" value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={120} /><SelectField label="Folder" value={editFolder} onChange={(e) => setEditFolder(e.target.value)}><option value="">No folder</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</SelectField>{editing && <Button variant="ghost" onClick={() => void updateStatus(editing)} loading={busyId === editing.id}>{editing.status === 'Active' ? 'Pause this QR code' : 'Activate this QR code'}</Button>}</div></Modal>
  </>;
}

function ArrowRightSmall() { return <span aria-hidden="true">→</span>; }
