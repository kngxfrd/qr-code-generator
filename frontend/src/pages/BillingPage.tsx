import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, CircleHelp } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../app/auth';
import { Button, PageHeading } from '../components/ui';
import { useToast } from '../app/toast';
import type { Plan } from '../types';

type StaticQrPack = { id: string; name: string; price: number; credits: number; description: string; features: string[] };

type Interval = 'monthly' | 'quarterly' | 'annual';

export function BillingPage() {
  const { user, refresh } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [staticQrPack, setStaticQrPack] = useState<StaticQrPack | null>(null);
  const [interval, setInterval] = useState<Interval>('monthly');
  const [loading, setLoading] = useState(true);
  const [paymentConfigured, setPaymentConfigured] = useState(false);
  const [checkoutCurrency, setCheckoutCurrency] = useState('');
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    api<{ plans: Plan[]; staticQrPack: StaticQrPack; paymentConfigured: boolean; checkoutCurrency?: string }>('/api/billing/plans')
      .then((result) => { setPlans(result.plans); setStaticQrPack(result.staticQrPack); setPaymentConfigured(result.paymentConfigured); setCheckoutCurrency(result.checkoutCurrency || ''); })
      .catch((error: Error) => notify(error.message, 'error'))
      .finally(() => setLoading(false));
  }, []);

  // Paystack sends people back to /billing?reference=... after they pay (or cancel).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get('reference') || params.get('trxref');
    if (!reference) return;
    const clean = (staticPack = false) => window.history.replaceState({}, '', staticPack ? '/billing?required=static' : '/billing');
    setVerifying(true);
    api<{ status: string; planId: string }>(`/api/billing/paystack/verify?reference=${encodeURIComponent(reference)}`)
      .then((result) => {
        if (result.status === 'success') {
          if (result.planId === 'static_qr_pack') {
            void refresh();
            clean(true);
            notify('Payment received. Your 3 static QR code credits are ready.');
          } else {
            notify('Payment received. Your plan is now active.');
            void refresh();
            clean();
          }
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

  const startCheckout = async (planId: string, purchaseInterval: string) => {
    const plan = plans.find((item) => item.id === planId);
    if (plan && plan[purchaseInterval as Interval] === null) { navigate('/contact'); return; }
    if (!user) { notify('Create an account or sign in before checkout.', 'info'); navigate('/signup?return=billing'); return; }
    setBusyPlan(planId);
    try {
      const result = await api<{ authorizationUrl: string }>('/api/billing/checkout', { method: 'POST', body: { planId, interval: purchaseInterval } });
      window.location.href = result.authorizationUrl; // hand over to Paystack's secure checkout page
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not start checkout.', 'error');
      setBusyPlan(null);
    }
  };

  const formatPrice = (price: number | null) => price === null ? 'Let’s talk' : new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(price);
  const currentId = user?.subscription.planId;
  const buttonLabel = (plan: Plan) => {
    if (plan[interval] === null) return 'Contact sales';
    if (currentId === plan.id) return 'Renew plan';
    return 'Upgrade';
  };
  const buttonDisabled = (plan: Plan) => {
    if (busyPlan !== null || verifying) return true;
    if (plan[interval] === null) return false;
    return !paymentConfigured;
  };

  const requiredPack = new URLSearchParams(window.location.search).get('required') === 'static';
  return <><PageHeading eyebrow="PLANS THAT STAY CLEAR" title="Plans & billing" description="Buy static QR codes when you need them, or choose a subscription for editable links and scan insights." />
    {requiredPack && <div className="billing-note"><CircleHelp size={17} /><span>You need a static QR credit to save and download this code. Buy a pack here, then return to your design.</span><Button variant="secondary" size="sm" onClick={() => navigate('/')}>Back to QR design</Button></div>}
    {verifying && <div className="billing-note"><span className="spinner" /><span>Confirming your payment…</span></div>}
    {!paymentConfigured && !loading && <div className="billing-note"><CircleHelp size={17} /><span>Online checkout is not available yet. No payment will be taken from this page.</span></div>}
    {loading ? <div className="loading-state"><span className="spinner" />Loading plans…</div> : <>
      {staticQrPack && <article className="plan-card static-qr-pack"><div className="plan-card-top"><h2>{staticQrPack.name}</h2><p>{staticQrPack.description}</p></div><div className="plan-price"><strong>{formatPrice(staticQrPack.price)}</strong><span>one time</span></div><p className="credit-balance">{user?.staticQrCredits ?? 0} QR credits available</p><Button disabled={!paymentConfigured || busyPlan !== null || verifying} loading={busyPlan === staticQrPack.id} onClick={() => void startCheckout(staticQrPack.id, 'one_time')}>Buy 3 QR codes</Button><ul>{staticQrPack.features.map((feature) => <li key={feature}><Check size={15} />{feature}</li>)}</ul></article>}
      <h2 className="billing-subheading">Dynamic QR subscriptions</h2>
      <div className="billing-intervals" role="group" aria-label="Billing interval">{(['monthly', 'quarterly', 'annual'] as Interval[]).map((value) => <button className={interval === value ? 'active' : ''} onClick={() => setInterval(value)} key={value}>{value === 'annual' ? 'Yearly' : value.charAt(0).toUpperCase() + value.slice(1)}</button>)}</div>
      <div className="plan-grid">{plans.map((plan) => <article className={`plan-card ${plan.id === 'growth' ? 'popular' : ''}`} key={plan.id}>{plan.id === 'growth' && <span className="popular-tag">GOOD FOR GROWING TEAMS</span>}<div className="plan-card-top"><h2>{plan.name}</h2><p>{plan.description}</p></div><div className="plan-price"><strong>{formatPrice(plan[interval])}</strong>{plan[interval] !== null && <span>/{interval === 'monthly' ? 'month' : interval === 'quarterly' ? '3 months' : 'year'}</span>}</div><Button disabled={buttonDisabled(plan)} loading={busyPlan === plan.id} onClick={() => void startCheckout(plan.id, interval)}>{buttonLabel(plan)}</Button><ul>{plan.features.map((feature) => <li key={feature}><Check size={15} />{feature}</li>)}</ul></article>)}</div>
    </>}
    <div className="billing-footnote">{paymentConfigured ? `Secure payment by Paystack${checkoutCurrency ? `. Prices are shown in USD and charged in ${checkoutCurrency} at checkout` : ''}. QR packs are paid once; subscriptions do not renew automatically.` : 'Checkout will be available once a payment provider is connected.'}</div>
  </>;
}
