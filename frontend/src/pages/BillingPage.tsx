import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, CircleHelp } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../app/auth';
import { Button, PageHeading } from '../components/ui';
import { useToast } from '../app/toast';
import type { Plan } from '../types';

type Interval = 'monthly' | 'quarterly' | 'annual';

export function BillingPage() {
  const { user } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [interval, setInterval] = useState<Interval>('annual');
  const [loading, setLoading] = useState(true);
  const [paymentConfigured, setPaymentConfigured] = useState(false);
  const [checkoutCurrency, setCheckoutCurrency] = useState('');
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    api<{ plans: Plan[]; paymentConfigured: boolean; checkoutCurrency?: string }>('/api/billing/plans')
      .then((result) => { setPlans(result.plans); setPaymentConfigured(result.paymentConfigured); setCheckoutCurrency(result.checkoutCurrency || ''); })
      .catch((error: Error) => notify(error.message, 'error'))
      .finally(() => setLoading(false));
  }, []);

  // Paystack sends people back to /billing?reference=... after they pay (or cancel).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get('reference') || params.get('trxref');
    if (!reference) return;
    const clean = () => window.history.replaceState({}, '', '/billing');
    setVerifying(true);
    api<{ status: string }>(`/api/billing/paystack/verify?reference=${encodeURIComponent(reference)}`)
      .then((result) => {
        if (result.status === 'success') {
          notify('Payment received. Your plan is now active.');
          window.setTimeout(() => window.location.replace('/billing'), 1200); // reload so the account shows the new plan
        } else if (result.status === 'pending') {
          clean();
          notify('Your payment is still processing. Refresh this page in a minute.', 'info');
        } else {
          clean();
          notify('The payment was not completed. You have not been charged.', 'error');
        }
      })
      .catch((error: Error) => { clean(); notify(error.message, 'error'); })
      .finally(() => setVerifying(false));
  }, []);

  const startCheckout = async (plan: Plan) => {
    if (plan.id === 'free') { navigate(user ? '/qr-codes' : '/signup'); return; }
    if (plan[interval] === null) { navigate('/contact'); return; }
    if (!user) { notify('Create an account or sign in to upgrade.', 'info'); navigate('/signup?return=billing'); return; }
    setBusyPlan(plan.id);
    try {
      const result = await api<{ authorizationUrl: string }>('/api/billing/checkout', { method: 'POST', body: { planId: plan.id, interval } });
      window.location.href = result.authorizationUrl; // hand over to Paystack's secure checkout page
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not start checkout.', 'error');
      setBusyPlan(null);
    }
  };

  const formatPrice = (price: number | null) => price === null ? 'Let’s talk' : price === 0 ? 'Free' : new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(price);
  const currentId = user?.subscription.planId;
  const buttonLabel = (plan: Plan) => {
    if (plan.id === 'free') return currentId === 'free' || !currentId ? 'Current plan' : 'Start free';
    if (plan[interval] === null) return 'Contact sales';
    if (currentId === plan.id) return 'Renew plan';
    return 'Upgrade with Paystack';
  };
  const buttonDisabled = (plan: Plan) => {
    if (busyPlan !== null || verifying) return true;
    if (plan.id === 'free') return currentId === 'free' || !currentId;
    if (plan[interval] === null) return false;
    return !paymentConfigured;
  };

  return <><PageHeading eyebrow="PLANS THAT STAY CLEAR" title="Plans & billing" description="Static QR codes stay free. Choose a paid plan when you need editable links or scan insights." />
    {verifying && <div className="billing-note"><span className="spinner" /><span>Confirming your payment…</span></div>}
    {!paymentConfigured && !loading && <div className="billing-note"><CircleHelp size={17} /><span>Online checkout is not available yet. No payment will be taken from this page.</span></div>}
    <div className="billing-intervals" role="group" aria-label="Billing interval">{(['monthly', 'quarterly', 'annual'] as Interval[]).map((value) => <button className={interval === value ? 'active' : ''} onClick={() => setInterval(value)} key={value}>{value === 'annual' ? 'Yearly' : value.charAt(0).toUpperCase() + value.slice(1)}</button>)}</div>
    {loading ? <div className="loading-state"><span className="spinner" />Loading plans…</div> : <div className="plan-grid">{plans.map((plan) => <article className={`plan-card ${plan.id === 'growth' ? 'popular' : ''}`} key={plan.id}>{plan.id === 'growth' && <span className="popular-tag">GOOD FOR GROWING TEAMS</span>}<div className="plan-card-top"><h2>{plan.name}</h2><p>{plan.description}</p></div><div className="plan-price"><strong>{formatPrice(plan[interval])}</strong>{plan[interval] !== null && plan[interval] !== 0 && <span>/{interval === 'monthly' ? 'month' : interval === 'quarterly' ? '3 months' : 'year'}</span>}</div><Button variant={currentId === plan.id && plan.id === 'free' ? 'secondary' : 'primary'} disabled={buttonDisabled(plan)} loading={busyPlan === plan.id} onClick={() => void startCheckout(plan)}>{buttonLabel(plan)}</Button><ul>{plan.features.map((feature) => <li key={feature}><Check size={15} />{feature}</li>)}</ul></article>)}</div>}
    <div className="billing-footnote">{paymentConfigured ? `Secure payment by Paystack${checkoutCurrency ? `. Prices are shown in USD and charged in ${checkoutCurrency} at checkout` : ''}. Paid plans last for the period you buy and do not renew automatically.` : 'Checkout will be available once a payment provider is connected.'}</div>
  </>;
}