import { useEffect, useState } from 'react';
import {
  createBillingCheckout,
  createBillingPortal,
  fetchBillingMe,
  type BillingMeResult,
} from '../providers/registry';

const PLANS = [
  {
    id: 'free' as const,
    label: 'Free',
    price: '$0',
    priceInr: '₹0',
    features: [
      '1 project',
      '2 3D character generations',
      '2 sprite generations',
      '10K AI tokens',
      'WebGL export',
      'GDD export (Markdown)',
    ],
    cta: 'Current plan',
    highlight: false,
  },
  {
    id: 'indie' as const,
    label: 'Indie',
    price: '$19',
    priceInr: '₹1,999',
    period: '/month',
    features: [
      '5 projects',
      '5 3D character generations',
      '20 sprite generations',
      '50K AI tokens',
      'Unity engine export',
      'WebGL export',
      'GDD export (Markdown + PDF)',
      'Priority AI generation',
    ],
    cta: 'Upgrade to Indie',
    highlight: false,
  },
  {
    id: 'studio' as const,
    label: 'Studio',
    price: '$49',
    priceInr: '₹4,999',
    period: '/month',
    features: [
      'Unlimited projects',
      '50 3D character generations',
      '200 sprite generations',
      '500K AI tokens',
      'All engine exports (Unity, WebGL)',
      'GDD export (all formats)',
      'Priority AI generation',
      'Team collaboration (coming soon)',
    ],
    cta: 'Upgrade to Studio',
    highlight: true,
  },
];

interface Props {
  onBack: () => void;
}

export function BillingPage({ onBack }: Props) {
  const [billing, setBilling] = useState<BillingMeResult | null>(null);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const successParam = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('success');
  const upgraded = successParam ? successParam : null;

  useEffect(() => {
    void fetchBillingMe().then(setBilling);
  }, []);

  const currentTier =
    billing?.configured && billing.status === 'ok' ? billing.tier : 'free';

  async function handleUpgrade(tier: 'indie' | 'studio') {
    setCheckingOut(tier);
    setError(null);
    const result = await createBillingCheckout({ tier });
    setCheckingOut(null);
    if (!result) {
      setError('Could not start checkout. Please try again.');
      return;
    }
    window.location.href = result.url;
  }

  async function handleManage() {
    const customerId =
      billing?.configured && billing.status === 'ok' ? billing.customerId : undefined;
    if (!customerId) return;
    setOpeningPortal(true);
    setError(null);
    const result = await createBillingPortal({ customerId });
    setOpeningPortal(false);
    if (!result) {
      setError('Could not open billing portal. Please try again.');
      return;
    }
    window.location.href = result.url;
  }

  return (
    <div className="billing-page">
      <div className="billing-header">
        <button type="button" className="billing-back-btn" onClick={onBack}>
          ← Back
        </button>
        <h1 className="billing-title">Greybox Studio Plans</h1>
        <p className="billing-subtitle">
          Design your game, then export to any engine. Upgrade to unlock more generations and engine exports.
        </p>
      </div>

      {upgraded && (
        <div className="billing-success-banner" role="status">
          ✓ You've successfully upgraded to {upgraded === 'indie' ? 'Indie' : 'Studio'}. Enjoy your new limits!
        </div>
      )}

      {error && (
        <div className="billing-error-banner" role="alert">
          {error}
        </div>
      )}

      <div className="billing-plans">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentTier;
          const isUpgrade = plan.id !== 'free' && !isCurrent && (
            currentTier === 'free' || (currentTier === 'indie' && plan.id === 'studio')
          );
          const isDowngrade = plan.id !== 'free' && !isCurrent && !isUpgrade;
          const isProcessing = checkingOut === plan.id;

          return (
            <div
              key={plan.id}
              className={`billing-plan-card${plan.highlight ? ' billing-plan-highlight' : ''}${isCurrent ? ' billing-plan-current' : ''}`}
            >
              {plan.highlight && (
                <div className="billing-plan-badge">Most Popular</div>
              )}
              <div className="billing-plan-name">{plan.label}</div>
              <div className="billing-plan-price">
                {plan.price}
                {plan.period && <span className="billing-plan-period">{plan.period}</span>}
              </div>
              {plan.priceInr && plan.id !== 'free' && (
                <div className="billing-plan-inr">{plan.priceInr}/month (India)</div>
              )}
              <ul className="billing-plan-features">
                {plan.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <div className="billing-plan-actions">
                {isCurrent ? (
                  <>
                    <span className="billing-plan-current-label">Current plan</span>
                    {billing?.configured && billing.status === 'ok' && billing.portalAvailable && billing.customerId && (
                      <button
                        type="button"
                        className="billing-portal-btn"
                        onClick={() => void handleManage()}
                        disabled={openingPortal}
                      >
                        {openingPortal ? 'Opening…' : 'Manage subscription'}
                      </button>
                    )}
                  </>
                ) : isUpgrade ? (
                  <button
                    type="button"
                    className="billing-upgrade-btn"
                    onClick={() => void handleUpgrade(plan.id as 'indie' | 'studio')}
                    disabled={checkingOut !== null}
                  >
                    {isProcessing ? 'Starting checkout…' : plan.cta}
                  </button>
                ) : isDowngrade ? (
                  <span className="billing-plan-downgrade">Manage via portal to downgrade</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="billing-footer">
        <p>All prices shown include applicable taxes. India pricing shown in INR via Razorpay. International pricing via Dodo Payments (VAT handled automatically). Cancel anytime.</p>
        <p>Questions? Email <a href="mailto:soumyadebnath1619@gmail.com">soumyadebnath1619@gmail.com</a></p>
      </div>
    </div>
  );
}
