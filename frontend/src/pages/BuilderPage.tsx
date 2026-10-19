import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, CircleHelp, Globe2, ImagePlus, Link2, Mail, MessageSquareText, Palette, Phone, QrCode, Sparkles, Type, Wifi } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../app/auth';
import { useToast } from '../app/toast';
import { Button, Field, SelectField } from '../components/ui';
import { DEFAULT_DESIGN, downloadQr, PhonePreview, useRenderedQr } from '../components/qr';
import type { QRDesign, QRDraft } from '../types';

const TYPE_CHOICES = [
  { id: 'Website', title: 'Website', detail: 'Send someone to a web address.', icon: Globe2 },
  { id: 'Text', title: 'Plain text', detail: 'Share a note, code or short message.', icon: Type },
  { id: 'Email', title: 'Email', detail: 'Open a ready-to-send email.', icon: Mail },
  { id: 'Phone', title: 'Phone number', detail: 'Start a call with one scan.', icon: Phone },
  { id: 'SMS', title: 'Text message', detail: 'Open a text with your message.', icon: MessageSquareText },
  { id: 'WiFi', title: 'Wi-Fi', detail: 'Let guests join your network.', icon: Wifi },
  { id: 'vCard', title: 'Contact card', detail: 'Share your contact details.', icon: QrCode },
  { id: 'Social', title: 'Social profile', detail: 'Link to a profile or page.', icon: Link2 },
];

const BLANK_DRAFT: QRDraft = { type: '', fields: {}, name: '', dynamic: false, design: DEFAULT_DESIGN, step: 1 };
const loadDraft = (): QRDraft => {
  try { const parsed = JSON.parse(sessionStorage.getItem('freeqr-builder-draft') || 'null') as QRDraft | null; return parsed ? { ...BLANK_DRAFT, ...parsed, design: { ...DEFAULT_DESIGN, ...parsed.design } } : BLANK_DRAFT; } catch { return BLANK_DRAFT; }
};
const esc = (value: string) => value.replace(/([\\;,:])/g, '\\$1');

/* Shrinks an uploaded logo to a small PNG data URL (max 256px on the longest side).
   A logo in the middle of a QR code never needs more, and a full-size image is what
   pushed the save request over the server's 500,000-character field limit. */
const resizeLogo = (file: File, max = 256): Promise<string> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const w0 = img.naturalWidth || max;
      const h0 = img.naturalHeight || max;
      const scale = Math.min(1, max / Math.max(w0, h0));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w0 * scale));
      canvas.height = Math.max(1, Math.round(h0 * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('Canvas not supported')); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png')); // PNG keeps transparency
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
    img.src = url;
  });

function makePayload(type: string, fields: Record<string, string>) {
  switch (type) {
    case 'Website': case 'Social': {
      const value = fields.url?.trim() || '';
      return /^https?:\/\//i.test(value) || !value ? value : `https://${value}`;
    }
    case 'Email': return fields.email ? `mailto:${fields.email}?subject=${encodeURIComponent(fields.subject || '')}&body=${encodeURIComponent(fields.message || '')}` : '';
    case 'Phone': return fields.phone ? `tel:${fields.phone.replace(/[^\d+]/g, '')}` : '';
    case 'SMS': return fields.phone ? `SMSTO:${fields.phone}:${fields.message || ''}` : '';
    case 'WiFi': return fields.ssid ? `WIFI:T:${fields.security || 'WPA'};S:${esc(fields.ssid)};P:${esc(fields.password || '')};H:${fields.hidden ? 'true' : 'false'};;` : '';
    case 'vCard': return fields.name ? `BEGIN:VCARD\nVERSION:3.0\nN:${fields.name}\nFN:${fields.name}\nORG:${fields.company || ''}\nTEL:${fields.phone || ''}\nEMAIL:${fields.email || ''}\nURL:${fields.website || ''}\nEND:VCARD` : '';
    default: return fields.text?.trim() || '';
  }
}

function ContentFields({ type, values, change }: { type: string; values: Record<string, string>; change: (key: string, value: string) => void }) {
  if (type === 'Website' || type === 'Social') return <Field label={type === 'Website' ? 'Website address' : 'Profile link'} name="url" placeholder="https://example.com" value={values.url || ''} onChange={(e) => change('url', e.target.value)} type="url" autoFocus hint="Include your full link, or just the domain." />;
  if (type === 'Email') return <div className="form-stack"><Field label="Email address" name="email" type="email" placeholder="hello@example.com" value={values.email || ''} onChange={(e) => change('email', e.target.value)} autoFocus /><Field label="Subject (optional)" name="subject" value={values.subject || ''} onChange={(e) => change('subject', e.target.value)} /><label className="field"><span className="field-label">Message (optional)</span><textarea rows={4} value={values.message || ''} onChange={(e) => change('message', e.target.value)} /></label></div>;
  if (type === 'Phone') return <Field label="Phone number" name="phone" type="tel" placeholder="+233 20 000 0000" value={values.phone || ''} onChange={(e) => change('phone', e.target.value)} autoFocus hint="Include a country code for international callers." />;
  if (type === 'SMS') return <div className="form-stack"><Field label="Phone number" name="phone" type="tel" placeholder="+233 20 000 0000" value={values.phone || ''} onChange={(e) => change('phone', e.target.value)} autoFocus /><label className="field"><span className="field-label">Message</span><textarea rows={4} value={values.message || ''} onChange={(e) => change('message', e.target.value)} /></label></div>;
  if (type === 'WiFi') return <div className="form-stack"><Field label="Network name (SSID)" name="ssid" placeholder="Guest Wi-Fi" value={values.ssid || ''} onChange={(e) => change('ssid', e.target.value)} autoFocus /><Field label="Password" name="password" placeholder="Network password" value={values.password || ''} onChange={(e) => change('password', e.target.value)} /><SelectField label="Security" name="security" value={values.security || 'WPA'} onChange={(e) => change('security', e.target.value)}><option value="WPA">WPA / WPA2</option><option value="WEP">WEP</option><option value="nopass">No password</option></SelectField><label className="check-row"><input type="checkbox" checked={values.hidden === 'true'} onChange={(e) => change('hidden', String(e.target.checked))} /> Hidden network</label></div>;
  if (type === 'vCard') return <div className="form-stack"><Field label="Full name" name="name" value={values.name || ''} onChange={(e) => change('name', e.target.value)} autoFocus /><Field label="Company (optional)" name="company" value={values.company || ''} onChange={(e) => change('company', e.target.value)} /><Field label="Phone (optional)" name="phone" type="tel" value={values.phone || ''} onChange={(e) => change('phone', e.target.value)} /><Field label="Email (optional)" name="email" type="email" value={values.email || ''} onChange={(e) => change('email', e.target.value)} /><Field label="Website (optional)" name="website" value={values.website || ''} onChange={(e) => change('website', e.target.value)} /></div>;
  return <label className="field"><span className="field-label">Text to share</span><textarea autoFocus rows={6} maxLength={10000} placeholder="Write the message people will see after scanning…" value={values.text || ''} onChange={(e) => change('text', e.target.value)} /><small className="field-hint">{(values.text || '').length} of 10,000 characters</small></label>;
}

function DesignPicker({ design, setDesign }: { design: QRDesign; setDesign: (value: QRDesign) => void }) {
  const [open, setOpen] = useState('frame');
  const update = (patch: Partial<QRDesign>) => setDesign({ ...design, ...patch });
  const rows = [
    { id: 'frame', title: 'Frame', note: 'Give the code a clear edge and a call to scan.', icon: Sparkles },
    { id: 'pattern', title: 'QR pattern', note: 'Change the marks that make up your QR code.', icon: QrCode },
    { id: 'corners', title: 'QR corners', note: 'Choose the shape of the three finder corners.', icon: CircleHelp },
    { id: 'logo', title: 'Add a logo', note: 'Put your brand mark in the centre.', icon: ImagePlus },
    { id: 'colours', title: 'Colours', note: 'Set the foreground and background colours.', icon: Palette },
  ];
  const logoUpload = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return window.alert('Choose an image file for your logo.');
    if (file.size > 5 * 1024 * 1024) return window.alert('Choose an image smaller than 5 MB.');
    try { update({ logo: await resizeLogo(file) }); }
    catch { window.alert('Could not read that image. Try a PNG or JPG.'); }
  };
  return <div className="design-rows">{rows.map(({ id, title, note, icon: Icon }) => <section className="design-card" key={id}><button className="design-card-head" onClick={() => setOpen(open === id ? '' : id)} aria-expanded={open === id}><span className="design-icon"><Icon size={22} /></span><span><strong>{title}</strong><small>{note}</small></span><span className={`chevron ${open === id ? 'open' : ''}`}>›</span></button>{open === id && <div className="design-options">
    {id === 'frame' && <><div className="choice-row">{[['none','No frame'],['outline','Outline'],['label','Label'],['ribbon','Ribbon'],['ticket','Ticket']].map(([value,label]) => <button key={value} className={`choice-chip ${design.frame === value ? 'selected' : ''}`} onClick={() => update({ frame: value })}><span className={`frame-sample frame-sample-${value}`}><i /><em>SCAN</em></span>{label}</button>)}</div>{design.frame !== 'none' && <Field label="Frame text" maxLength={24} value={design.frameLabel} onChange={(e) => update({ frameLabel: e.target.value.toUpperCase() })} />}</>}
    {id === 'pattern' && <div className="choice-row">{[['square','Square'],['rounded','Rounded'],['dots','Dots'],['classy','Classy'],['soft','Soft'],['extra','Extra round']].map(([value,label]) => <button key={value} className={`choice-chip ${design.pattern === value ? 'selected' : ''}`} onClick={() => update({ pattern: value })}><span className={`pattern-sample pattern-${value}`}><i /><i /><i /><i /><i /><i /><i /><i /><i /></span>{label}</button>)}</div>}
    {id === 'corners' && <div className="choice-row">{[['square','Square'],['rounded','Round'],['dot','Dot']].map(([value,label]) => <button key={value} className={`choice-chip ${design.corners === value ? 'selected' : ''}`} onClick={() => update({ corners: value })}><span className={`corner-sample corner-${value}`}><i /></span>{label}</button>)}</div>}
    {id === 'logo' && <div className="logo-controls">{design.logo ? <img src={design.logo} className="logo-thumb" alt="Logo preview" /> : <span className="logo-thumb empty"><ImagePlus size={20} /></span>}<label className="button button-secondary button-sm upload-button">Choose image<input type="file" accept="image/*" onChange={(e) => { const input = e.currentTarget; const file = input.files?.[0]; void logoUpload(file).finally(() => { input.value = ''; }); }} /></label>{design.logo && <Button variant="ghost" size="sm" onClick={() => update({ logo: null })}>Remove logo</Button>}<label className="field logo-size"><span className="field-label">Logo size</span><input type="range" min="18" max="32" value={design.logoSize} onChange={(e) => update({ logoSize: Number(e.target.value) })} /></label><small className="field-hint">Use a small, high-contrast logo so the QR still scans reliably.</small></div>}
    {id === 'colours' && <div className="colour-controls"><label className="colour-field"><span>Code colour</span><input type="color" value={design.foreground} onChange={(e) => update({ foreground: e.target.value })} /><code>{design.foreground}</code></label><label className="colour-field"><span>Background</span><input type="color" value={design.background} onChange={(e) => update({ background: e.target.value })} /><code>{design.background}</code></label><Button variant="secondary" size="sm" onClick={() => update({ foreground: DEFAULT_DESIGN.foreground, background: DEFAULT_DESIGN.background })}>Reset colours</Button></div>}
  </div>}</section>)}</div>;
}

export function BuilderPage() {
  const { user } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<QRDraft>(loadDraft);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const payload = useMemo(() => makePayload(draft.type, draft.fields), [draft.type, draft.fields]);
  const svg = useRenderedQr(payload, draft.design);
  const setDraftField = <K extends keyof QRDraft,>(key: K, value: QRDraft[K]) => setDraft((current) => {
    const next = { ...current, [key]: value }; sessionStorage.setItem('freeqr-builder-draft', JSON.stringify(next)); return next;
  });
  const changeContent = (key: string, value: string) => setDraft((current) => {
    const next = { ...current, fields: { ...current.fields, [key]: value } }; sessionStorage.setItem('freeqr-builder-draft', JSON.stringify(next)); return next;
  });
  const chooseType = (type: string) => setDraft((current) => { const next = { ...current, type, step: 2 }; sessionStorage.setItem('freeqr-builder-draft', JSON.stringify(next)); return next; });
  const canContinue = payload.trim().length > 0;
  const saveAndDownload = async () => {
    if (!canContinue) return notify('Add the QR code content before continuing.', 'error');
    if (!user) {
      sessionStorage.setItem('freeqr-builder-draft', JSON.stringify({ ...draft, step: 3 }));
      notify('Sign in to save your QR code to your workspace.');
      navigate('/signup?return=builder');
      return;
    }
    if (!svg) return notify('Your QR code is still rendering. Try again in a moment.', 'error');
    setSaving(true);
    try {
      const fields = Object.entries(draft.fields).map(([key, value]) => `${key}: ${value}`).filter((item) => !item.endsWith(': '));
      await api<{ code: { id: string } }>('/api/codes', { method: 'POST', body: { name: draft.name || `${draft.type} QR code`, type: draft.type.toLowerCase(), payload, fields, svg, format: 'png', design: draft.design, dynamic: draft.dynamic } });
      await downloadQr(payload, draft.design, 'png', draft.name || `${draft.type}-qr`);
      sessionStorage.removeItem('freeqr-builder-draft');
      notify('QR code saved to your workspace and downloaded.');
      navigate('/qr-codes');
    } catch (error) { notify(error instanceof Error ? error.message : 'Could not save the QR code.', 'error'); }
    finally { setSaving(false); }
  };
  const stepTitles = ['Choose a type', 'Add your content', 'Make it yours'];
  return <div className="builder-page">
    {sidebarOpen && <div className="builder-drawer-shade" onClick={() => setSidebarOpen(false)} />}
    <div className={`builder-grid ${draft.step === 3 ? 'design-mode' : ''}`}>
      <main className="builder-work">
        <div className="stepper">{stepTitles.map((title, index) => <div className={`stepper-item ${draft.step === index + 1 ? 'current' : draft.step > index + 1 ? 'done' : ''}`} key={title}><span>{draft.step > index + 1 ? <Check size={15} /> : index + 1}</span><b>{title}</b>{index < 2 && <i />}</div>)}</div>
        {draft.step === 1 && <section className="type-step"><div className="step-copy"><p className="eyebrow">START WITH THE SCAN</p><h1>What should your QR code do?</h1><p>Pick a destination. You can change the look in the next step.</p></div><div className="type-grid">{TYPE_CHOICES.map(({ id, title, detail, icon: Icon }) => <button className="type-card" key={id} onClick={() => chooseType(id)}><span className="type-icon"><Icon size={24} /></span><strong>{title}</strong><small>{detail}</small><ArrowRight className="type-arrow" size={17} /></button>)}</div><div className="trust-note"><span><Check size={16} /></span>Static QR codes stay free and do not expire.</div></section>}
        {draft.step === 2 && <section className="content-step"><div className="step-copy"><p className="eyebrow">STEP 02 · CONTENT</p><h1>Where should this take people?</h1><p>A clear destination makes a QR code useful. You can come back and change this later.</p></div><div className="content-card"><div className="content-card-head"><span className="type-icon"><QrCode size={22} /></span><div><strong>{draft.type}</strong><small>Content encoded in this QR code</small></div><button className="text-button" onClick={() => setDraftField('step', 1)}>Change type</button></div><ContentFields type={draft.type} values={draft.fields} change={changeContent} /><Field label="Code name (optional)" value={draft.name} onChange={(e) => setDraftField('name', e.target.value)} placeholder={`My ${draft.type} QR code`} maxLength={120} /></div><div className="dynamic-note"><div><strong>Need to change this link later?</strong><p>Dynamic codes can be edited and include scan analytics with a paid plan.</p></div>{user?.subscription.status === 'active' ? <label className="check-row"><input type="checkbox" checked={draft.dynamic} onChange={(e) => setDraftField('dynamic', e.target.checked)} /> Dynamic QR code</label> : <Button variant="secondary" size="sm" onClick={() => navigate('/billing')}>View plans</Button>}</div></section>}
        {draft.step === 3 && <section className="design-step"><div className="step-copy"><p className="eyebrow">STEP 03 · DESIGN</p><h1>Make it yours</h1><p>Adjust the look. Your phone preview updates as you go.</p></div><DesignPicker design={draft.design} setDesign={(design) => setDraftField('design', design)} /><div className="name-card"><Field label="Give this QR a name" value={draft.name} onChange={(e) => setDraftField('name', e.target.value)} placeholder={`${draft.type} QR code`} maxLength={120} /></div></section>}
        {draft.step > 1 && <footer className="builder-footer">
          {draft.step > 1 ? <Button variant="secondary" icon={<ArrowLeft size={17} />} onClick={() => setDraftField('step', draft.step - 1)}>Back</Button> : <span />}
          {draft.step === 2 && <Button onClick={() => canContinue ? setDraftField('step', 3) : notify('Fill in the required content first.', 'error')} disabled={!canContinue}>Continue <ArrowRight size={17} /></Button>}
          {draft.step === 3 && <Button loading={saving} onClick={() => void saveAndDownload()}>Save & download <ArrowRight size={17} /></Button>}
        </footer>}
      </main>
      <aside className="builder-preview"><div className="preview-toggle"><span>Preview</span><span className="preview-toggle-active">QR code</span></div><PhonePreview svg={svg} design={draft.design} title={draft.step === 1 ? 'Choose a type to begin' : draft.type || 'Your QR preview'} /><p className="preview-footnote"><CircleHelp size={14} />Keep the code dark against a light background for reliable scans.</p></aside>
    </div>
  </div>;
}
