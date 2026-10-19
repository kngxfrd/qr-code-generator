import { useState, type FormEvent } from 'react';
import { ChevronDown, Mail, MessageCircle } from 'lucide-react';
import { api } from '../api/client';
import { useToast } from '../app/toast';
import { Button, Field, PageHeading } from '../components/ui';

const FAQS = [
  ['Do static QR codes expire?', 'No. A static QR code stores its destination in the pattern itself. It keeps working as long as the destination is available and the code is printed clearly.'],
  ['Can I change a QR code after printing it?', 'Static QR codes cannot be changed after they have been downloaded. Dynamic QR codes can be edited from your workspace while a paid plan is active.'],
  ['Can I add a logo or change the colours?', 'Yes. In the design step, choose a pattern, corner style, frame, foreground and background colours, and an optional logo. The phone preview updates while you work.'],
  ['What files can I download?', 'You can download a finished QR code as PNG, SVG or JPG from the builder or your workspace.'],
  ['Are dynamic QR codes and analytics available?', 'Dynamic codes and scan analytics belong to the paid plans. Checkout is not connected yet, so upgrades cannot be purchased at this time.'],
  ['Do I need an account to make a QR code?', 'You can design and preview a QR code without an account. Sign in to save it in your workspace and download it from your library later.'],
];

export function FaqPage() {
  const [open, setOpen] = useState(0);
  return <div className="public-content"><PageHeading eyebrow="HELPFUL ANSWERS" title="Questions, answered" description="A few things worth knowing before you print." /><div className="faq-list">{FAQS.map(([question, answer], index) => <section className={`faq-item ${open === index ? 'open' : ''}`} key={question}><button onClick={() => setOpen(open === index ? -1 : index)} aria-expanded={open === index}><span>{question}</span><ChevronDown size={18} /></button>{open === index && <p>{answer}</p>}</section>)}</div></div>;
}

export function LegalPage({ page }: { page: 'privacy' | 'terms' | 'cookies' }) {
  const copy = {
    privacy: { kicker: 'PLAIN-LANGUAGE PRIVACY', title: 'Privacy policy', date: 'Last updated 18 October 2026', sections: [['What we store', 'When you create an account, we store your email address, display name and password hash. QR codes, folder names and settings you save are stored so you can use your workspace. We never store your raw password.'], ['Scan data', 'Dynamic QR codes may record the scan time, broad device category and a country code supplied by a trusted proxy when configured. We do not store IP addresses. Static QR codes do not report scan activity.'], ['Cookies and sessions', 'Essential cookies maintain your signed-in session and protect forms from cross-site request forgery. We do not use advertising cookies.'], ['Your choices', 'You can update your profile, change your password or delete your account from account settings. Deleting the account also removes its saved QR codes, folders and scan records.'], ['Contact', 'For privacy questions, use the contact form or write to hello@freeqrgenerator.com.']] },
    terms: { kicker: 'SERVICE TERMS', title: 'Terms of use', date: 'Last updated 19 October 2026', sections: [['Using the service', 'You may use Free QR Generator to create, design and manage QR codes. Keep your login details private and use the service lawfully.'], ['Static and dynamic QR codes', 'Static codes store their content directly and cannot be edited after download. Dynamic codes route through our server and can be changed while an active subscription is available.'], ['Plans and payments', 'Static QR codes are sold in one-time packs of three for $2. Dynamic QR plans and their billing intervals are shown on the plans page. A static QR credit is used when a new static code is saved and downloaded.'], ['Your content', 'You remain responsible for the content and destinations encoded in your QR codes. You retain ownership of content you submit, and allow us to process it only to provide the service.'], ['Availability', 'We work to keep the service available, but cannot guarantee uninterrupted access. QR Code is a trademark of DENSO WAVE INCORPORATED.']] },
    cookies: { kicker: 'ESSENTIAL ONLY', title: 'Cookie policy', date: 'Last updated 18 October 2026', sections: [['Cookies we use', 'We use essential cookies to keep sign-in working and protect account forms. These cookies are required for account features.'], ['Analytics and advertising', 'We do not currently use optional analytics cookies or advertising cookies.'], ['Managing cookies', 'You can clear cookies through your browser settings. Blocking essential cookies may prevent sign-in and workspace features from working.']] },
  }[page];
  return <div className="public-content legal-content"><PageHeading eyebrow={copy.kicker} title={copy.title} description={copy.date} />{copy.sections.map(([title, body]) => <section key={title}><h2>{title}</h2><p>{body}</p></section>)}</div>;
}

export function ContactPage() {
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [subject, setSubject] = useState(''); const [message, setMessage] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true);
    try { await api('/api/contact', { method: 'POST', body: { name, email, subject, message } }); notify('Your note has been sent to our support inbox.'); setName(''); setEmail(''); setSubject(''); setMessage(''); }
    catch (error) { notify(error instanceof Error ? error.message : 'Could not send your note.', 'error'); }
    finally { setBusy(false); }
  };
  return <div className="contact-layout"><div className="contact-copy"><PageHeading eyebrow="WE’RE HERE TO HELP" title="Send us a note" description="Tell us what you’re trying to do or where you got stuck. A real person will read it." /><div className="contact-detail"><span><Mail size={17} /></span><div><strong>Prefer email?</strong><a href="mailto:hello@freeqrgenerator.com">hello@freeqrgenerator.com</a></div></div><div className="contact-detail"><span><MessageCircle size={17} /></span><div><strong>Tell us what’s happening</strong><p>Include the QR type and what you expected to see. Leave out passwords and private details.</p></div></div></div><form className="contact-form" onSubmit={(event) => void submit(event)}><Field label="Your name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} /><Field label="Email address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /><Field label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} required maxLength={160} /><label className="field"><span className="field-label">Message</span><textarea rows={7} value={message} onChange={(e) => setMessage(e.target.value)} required minLength={10} maxLength={8000} /></label><Button type="submit" loading={busy}>Send message</Button></form></div>;
}
