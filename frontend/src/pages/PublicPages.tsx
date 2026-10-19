import { useState } from 'react';
import { ChevronDown, Mail, MessageCircle } from 'lucide-react';
import { PageHeading } from '../components/ui';

const FAQS = [
  ['Do static QR codes expire?', 'No. A static QR code stores its destination in the pattern itself. It keeps working as long as the destination is available and the code is printed clearly.'],
  ['Can I change a QR code after printing it?', 'Static QR codes cannot be changed after they have been downloaded. Dynamic QR codes can be edited from your workspace while a paid plan is active.'],
  ['Can I add a logo or change the colours?', 'Yes. In the design step, choose a pattern, corner style, frame, foreground and background colours, and an optional logo. The phone preview updates while you work.'],
  ['What files can I download?', 'You can download a finished QR code as PNG, SVG or JPG from the builder or your workspace.'],
  ['Are dynamic QR codes and analytics available?', 'Yes. With an active dynamic plan, each QR code uses a tracked link that redirects to your saved destination. Your workspace shows recorded scans, recent activity, device types and coarse country data where available. Monthly scan limits depend on your plan.'],
  ['Do I need an account to make a QR code?', 'You can design and preview a QR code without an account. Sign in to save it in your workspace and download it from your library later.'],
];

export function FaqPage() {
  const [open, setOpen] = useState(0);
  return <div className="public-content"><PageHeading eyebrow="HELPFUL ANSWERS" title="Questions, answered" description="A few things worth knowing before you print." /><div className="faq-list">{FAQS.map(([question, answer], index) => <section className={`faq-item ${open === index ? 'open' : ''}`} key={question}><button onClick={() => setOpen(open === index ? -1 : index)} aria-expanded={open === index}><span>{question}</span><ChevronDown size={18} /></button>{open === index && <p>{answer}</p>}</section>)}</div></div>;
}

export function LegalPage({ page }: { page: 'privacy' | 'terms' | 'cookies' }) {
  const copy = {
    privacy: { kicker: 'PLAIN-LANGUAGE PRIVACY', title: 'Privacy policy', date: 'Last updated 18 October 2026', sections: [['What we store', 'When you create an account, we store your email address, display name and password hash. QR codes, folder names and settings you save are stored so you can use your workspace. We never store your raw password.'], ['Scan data', 'Dynamic QR codes may record the scan time, broad device category and a country code supplied by a trusted proxy when configured. We do not store IP addresses. Static QR codes do not report scan activity.'], ['Cookies and sessions', 'Essential cookies maintain your signed-in session and protect forms from cross-site request forgery. We do not use advertising cookies.'], ['Your choices', 'You can update your profile, change your password or delete your account from account settings. Deleting the account also removes its saved QR codes, folders and scan records.'], ['Contact', 'For privacy questions, use the contact form or write to support.togethere@gmail.com.']] },
    terms: { kicker: 'SERVICE TERMS', title: 'Terms of use', date: 'Last updated 19 October 2026', sections: [['Using the service', 'You may use Free QR Generator to create, design and manage QR codes. Keep your login details private and use the service lawfully.'], ['Static and dynamic QR codes', 'Static codes store their content directly and cannot be edited after download. Dynamic codes route through our server and can be changed while an active subscription is available.'], ['Plans and payments', 'Static QR codes are sold in one-time packs of three for $2. Dynamic QR plans and their billing intervals are shown on the plans page. A static QR credit is used when a new static code is saved and downloaded.'], ['Your content', 'You remain responsible for the content and destinations encoded in your QR codes. You retain ownership of content you submit, and allow us to process it only to provide the service.'], ['Availability', 'We work to keep the service available, but cannot guarantee uninterrupted access. QR Code is a trademark of DENSO WAVE INCORPORATED.']] },
    cookies: { kicker: 'ESSENTIAL ONLY', title: 'Cookie policy', date: 'Last updated 18 October 2026', sections: [['Cookies we use', 'We use essential cookies to keep sign-in working and protect account forms. These cookies are required for account features.'], ['Analytics and advertising', 'We do not currently use optional analytics cookies or advertising cookies.'], ['Managing cookies', 'You can clear cookies through your browser settings. Blocking essential cookies may prevent sign-in and workspace features from working.']] },
  }[page];
  return <div className="public-content legal-content"><PageHeading eyebrow={copy.kicker} title={copy.title} description={copy.date} />{copy.sections.map(([title, body]) => <section key={title}><h2>{title}</h2><p>{body}</p></section>)}</div>;
}

const SUPPORT_EMAIL = 'support.togethere@gmail.com';
const MAILTO = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Free QR Generator support')}`;

export function ContactPage() {
  return <div className="contact-layout"><div className="contact-copy"><PageHeading eyebrow="WE’RE HERE TO HELP" title="Send us a note" description="Tell us what you’re trying to do or where you got stuck. A real person will read it." /><div className="contact-detail"><span><Mail size={17} /></span><div><strong>Email us</strong><a href={MAILTO}>{SUPPORT_EMAIL}</a></div></div><div className="contact-detail"><span><MessageCircle size={17} /></span><div><strong>Tell us what’s happening</strong><p>Include the QR type and what you expected to see. Leave out passwords and private details.</p></div></div></div><div className="contact-form"><a href={MAILTO} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 20px', borderRadius: 10, background: '#111', color: '#fff', fontWeight: 600, textDecoration: 'none' }}><Mail size={18} /> Write us an email</a><p style={{ marginTop: 14 }}>This opens your email app with our address already filled in. If nothing opens, send your message to <strong>{SUPPORT_EMAIL}</strong> from any email account.</p></div></div>;
}