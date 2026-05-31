'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  createCheckoutSession,
  createPortalSession,
  fetchBillingMe,
  fetchBillingGeo,
  resolveProvider,
  billingReturnUrls,
  type BillingMeResponse,
} from './client';
import { BILLING_PLANS, planPriceLabel, type BillingPlan, type BillingTierId } from './plans';

interface CheckoutBusyState {
  tier: BillingTierId | 'portal' | null;
}

function tierIsCurrent(currentTier: BillingTierId | null, planTier: BillingTierId): boolean {
  if (!currentTier) return planTier === 'free';
  return currentTier === planTier;
}

function PlanCard({
  plan,
  priceLabel,
  isCurrent,
  busy,
  onChoose,
}: {
  plan: BillingPlan;
  priceLabel: string;
  isCurrent: boolean;
  busy: boolean;
  onChoose: (plan: BillingPlan) => void;
}) {
  const buttonLabel = plan.checkoutEligible
    ? isCurrent
      ? 'Manage on portal'
      : plan.ctaLabel
    : plan.id === 'enterprise'
      ? plan.ctaLabel
      : 'Current plan';
  const buttonDisabled = !plan.checkoutEligible && plan.id !== 'enterprise';

  return (
    <article
      className={`billing-plan-card${plan.badge ? ' billing-plan-card--featured' : ''}${isCurrent ? ' billing-plan-card--current' : ''}`}
      data-tier={plan.id}
      aria-current={isCurrent ? 'true' : undefined}
    >
      {plan.badge ? <span className='billing-plan-badge'>{plan.badge}</span> : null}
      <header className='billing-plan-card__header'>
        <h2 className='billing-plan-title'>{plan.title}</h2>
        <p className='billing-plan-price'>{priceLabel}</p>
        <p className='billing-plan-description'>{plan.description}</p>
      </header>
      <ul className='billing-plan-features'>
        {plan.features.map((feature) => (
          <li
            key={feature.label}
            className={`billing-plan-feature${feature.included ? '' : ' billing-plan-feature--excluded'}`}
          >
            <span aria-hidden='true' className='billing-plan-feature-mark'>
              {feature.included ? '✓' : '—'}
            </span>
            <span>{feature.label}</span>
          </li>
        ))}
      </ul>
      <button
        type='button'
        className={`billing-plan-action${plan.checkoutEligible ? ' billing-plan-action--primary' : ' billing-plan-action--ghost'}`}
        disabled={buttonDisabled || busy}
        onClick={() => onChoose(plan)}
      >
        {busy ? 'Working…' : buttonLabel}
      </button>
    </article>
  );
}

export function BillingPage() {
  const [me, setMe] = useState<BillingMeResponse | null>(null);
  const [meLoaded, setMeLoaded] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<CheckoutBusyState>({ tier: null });
  const [country, setCountry] = useState<string>('US');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [meResult, geoResult] = await Promise.all([fetchBillingMe(), fetchBillingGeo()]);
      if (cancelled) return;
      setMe(meResult);
      setMeLoaded(true);
      setCountry(geoResult.country);
    })();
    return () => { cancelled = true; };
  }, []);

  const currentTier = useMemo<BillingTierId | null>(() => {
    if (!me || me.status !== 'ok') return null;
    return me.tier;
  }, [me]);

  const portalAvailable = useMemo(() => {
    if (!me || me.status !== 'ok') return false;
    return Boolean(me.portalAvailable) && Boolean(me.customerId);
  }, [me]);

  const onChoosePlan = useCallback(
    async (plan: BillingPlan) => {
      setErrorMessage(null);
      if (plan.id === 'enterprise') {
        if (typeof window !== 'undefined') {
          window.location.href = 'mailto:sales@greybox.studio?subject=Enterprise%20plan%20inquiry';
        }
        return;
      }
      if (!plan.checkoutEligible) {
        return;
      }
      if (tierIsCurrent(currentTier, plan.id) && portalAvailable) {
        await onManageBilling();
        return;
      }
      setBusy({ tier: plan.id });
      try {
        const { successUrl, cancelUrl } = billingReturnUrls();
        const provider = resolveProvider(country, plan.id);

        const session = await createCheckoutSession({
          tier: plan.id,
          successUrl,
          cancelUrl,
          provider,
        });

        if (!session.url) {
          setErrorMessage('Checkout session returned no redirect URL. Please try again.');
          return;
        }
        if (typeof window !== 'undefined') {
          window.location.href = session.url;
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : String(error));
      } finally {
        setBusy({ tier: null });
      }
    },
    [currentTier, portalAvailable, country],
  );

  const onManageBilling = useCallback(async () => {
    setErrorMessage(null);
    if (!me || me.status !== 'ok' || !me.customerId) {
      setErrorMessage(
        'Billing portal is only available after you finish your first checkout. Choose a paid plan to continue.',
      );
      return;
    }
    setBusy({ tier: 'portal' });
    try {
      const session = await createPortalSession(me.customerId);
      if (!session.url) {
        setErrorMessage('Portal session returned no redirect URL. Please try again.');
        return;
      }
      if (typeof window !== 'undefined') {
        window.location.href = session.url;
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy({ tier: null });
    }
  }, [me]);

  return (
    <main className='billing-page'>
      <a href='/' className='billing-page__back-link'>
        ← Back to studio
      </a>
      <header className='billing-page__header'>
        <h1 className='billing-page__title'>Plans &amp; billing</h1>
        <p className='billing-page__subtitle'>
          Greybox Studio is free for solo creators. Upgrade for cloud-managed token budgets, engine
          packaging, and team seats.
        </p>
        {meLoaded && me?.status === 'ok' && currentTier !== 'free' ? (
          <p className='billing-page__current-plan'>
            Current plan: <strong>{currentTier}</strong>
            {portalAvailable ? (
              <button
                type='button'
                className='billing-plan-action billing-plan-action--ghost billing-page__portal-button'
                onClick={() => void onManageBilling()}
                disabled={busy.tier === 'portal'}
              >
                {busy.tier === 'portal' ? 'Working…' : 'Manage Billing'}
              </button>
            ) : null}
          </p>
        ) : null}
      </header>

      {errorMessage ? (
        <div role='alert' className='billing-page__error'>
          {errorMessage}
        </div>
      ) : null}

      <section className='billing-plans-grid' aria-label='Available plans'>
        {BILLING_PLANS.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            priceLabel={planPriceLabel(plan, country)}
            isCurrent={tierIsCurrent(currentTier, plan.id)}
            busy={busy.tier === plan.id}
            onChoose={onChoosePlan}
          />
        ))}
      </section>

      <footer className='billing-page__footer'>
        <p>
          {country === 'IN'
            ? <>Payments processed by <a href='https://razorpay.com' rel='noopener noreferrer'>Razorpay</a>. Indian pricing shown in INR. Cancel anytime.</>
            : <>Payments processed by <a href='https://dodopayments.com' rel='noopener noreferrer'>Dodo Payments</a> (VAT handled automatically). Enterprise billing via <a href='https://stripe.com' rel='noopener noreferrer'>Stripe</a>. Cancel anytime.</>
          }
        </p>
      </footer>
    </main>
  );
}
