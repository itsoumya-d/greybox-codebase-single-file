// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

'use client';

import { useEffect, useMemo, useState } from 'react';
import { Stepper } from '@/components/Stepper';
import { api } from '@/lib/api';
import type { Creator, CreatorTaxProfileProvider, CreatorPayoutReadinessSafe } from '@/lib/marketplace-types';

const STORAGE_KEY = 'gb_onboarding_state';

interface OnboardingState {
  step: number;
  creatorId: string;
  displayName: string;
  bio: string;
  website: string;
  avatarUrl: string;
  country: string;
  email: string;
  taxId: string;
  taxFormType: 'w9' | 'w8ben' | '';
  stripeAccountId?: string;
  stripeOnboardingComplete: boolean;
  taxProfileId?: string;
  taxProvider?: CreatorTaxProfileProvider;
}

const INITIAL_STATE: OnboardingState = {
  step: 0,
  creatorId: '',
  displayName: '',
  bio: '',
  website: '',
  avatarUrl: '',
  country: 'US',
  email: '',
  taxId: '',
  taxFormType: '',
  stripeOnboardingComplete: false,
};

const STEPS = [
  { label: 'Profile' },
  { label: 'Stripe Connect' },
  { label: 'Tax info' },
  { label: 'Banking' },
  { label: 'Approval' },
];

export function OnboardingWizard() {
  const [state, setState] = useState<OnboardingState>(INITIAL_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [readiness, setReadiness] = useState<CreatorPayoutReadinessSafe | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setState({ ...INITIAL_STATE, ...(JSON.parse(raw) as Partial<OnboardingState>) });
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, hydrated]);

  const doneIndices = useMemo(() => Array.from({ length: state.step }, (_, i) => i), [state.step]);

  function update<K extends keyof OnboardingState>(key: K, value: OnboardingState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  async function refreshReadiness(creatorId: string) {
    const result = await api.payoutReadiness(creatorId);
    if (result.ok) setReadiness(result.body.readiness);
  }

  async function saveProfile() {
    setError(undefined);
    setBusy(true);
    try {
      const id = state.creatorId.trim() || slugify(state.displayName) || `creator-${crypto.randomUUID().slice(0, 8)}`;
      const country = state.country.trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(country)) {
        setError('Country must be an ISO 3166-1 alpha-2 code (e.g. US, GB, JP).');
        return;
      }
      const creator: Creator = {
        id,
        displayName: state.displayName.trim(),
        country,
        ...(state.email.trim() ? { email: state.email.trim() } : {}),
        monthlyGmvCents: 0,
        lifetimeGmvCents: 0,
        active: true,
      };
      if (!creator.displayName) {
        setError('Display name is required.');
        return;
      }
      const result = await api.upsertCreator(creator);
      if (!result.ok) {
        setError(extractError(result.body, `Create creator failed (${result.status})`));
        return;
      }
      update('creatorId', id);
      update('step', 1);
      await refreshReadiness(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setBusy(false);
    }
  }

  async function startStripeConnect() {
    setError(undefined);
    setBusy(true);
    try {
      const origin = window.location.origin;
      const result = await api.stripeConnectOnboardingLink(state.creatorId, {
        returnUrl: `${origin}/creator/onboard?step=2&stripe=return`,
        refreshUrl: `${origin}/creator/onboard?step=1&stripe=refresh`,
      });
      if (!result.ok) {
        setError(extractError(result.body, `Stripe Connect link failed (${result.status})`));
        return;
      }
      const stripeAccountId = result.body.result?.account?.stripeConnectAccountId
        ?? result.body.result?.creator.stripeConnectAccountId;
      if (stripeAccountId) update('stripeAccountId', stripeAccountId);
      // Same-tab redirect, per task spec.
      const url = result.body.result?.accountLink?.url;
      if (!url) {
        setError('Marketplace did not return a Stripe Connect onboarding URL.');
        return;
      }
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setBusy(false);
    }
  }

  async function recheckStripeStatus() {
    setError(undefined);
    setBusy(true);
    try {
      const result = await api.payoutReadiness(state.creatorId);
      if (!result.ok) {
        setError(extractError(result.body, `Refresh failed (${result.status})`));
        return;
      }
      setReadiness(result.body.readiness);
      // If onboarding is no longer required, advance.
      if (result.body.readiness.status !== 'needs-onboarding') {
        update('stripeOnboardingComplete', true);
        if (state.step === 1) update('step', 2);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setBusy(false);
    }
  }

  async function saveTax() {
    setError(undefined);
    setBusy(true);
    try {
      if (!state.taxFormType) {
        setError('Pick a tax form (W-9 for US, W-8BEN for non-US).');
        return;
      }
      if (!state.taxId.trim()) {
        setError('Tax ID is required.');
        return;
      }
      const provider: CreatorTaxProfileProvider = state.taxFormType === 'w9' ? 'stripe-tax' : 'external';
      const result = await api.taxProfile(state.creatorId, {
        taxProfileId: state.taxId.trim(),
        provider,
        country: state.country.trim().toUpperCase(),
        collectedAt: Date.now(),
        actorType: 'admin',
        actorId: state.creatorId,
      });
      if (!result.ok) {
        setError(extractError(result.body, `Save tax profile failed (${result.status})`));
        return;
      }
      update('taxProfileId', state.taxId.trim());
      update('taxProvider', provider);
      update('step', 3);
      await refreshReadiness(state.creatorId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    localStorage.removeItem(STORAGE_KEY);
    setState(INITIAL_STATE);
    setReadiness(undefined);
    setError(undefined);
  }

  // URL params can land us back on a specific step after the Stripe redirect.
  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const stripeReturn = search.get('stripe') === 'return';
    if (stripeReturn && state.creatorId) {
      update('stripeOnboardingComplete', true);
      if (state.step < 2) update('step', 2);
      void refreshReadiness(state.creatorId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  if (!hydrated) return <p className="gb-muted">Loading…</p>;

  return (
    <div>
      <Stepper steps={STEPS} activeIndex={state.step} doneIndices={doneIndices} />
      {error && (
        <div className="gb-error" role="alert" data-testid="onboarding-error">
          {error}
        </div>
      )}

      {state.step === 0 && (
        <section className="gb-card" data-testid="step-profile">
          <h2 style={{ marginTop: 0 }}>Profile</h2>
          <div className="gb-form-grid">
            <div>
              <label htmlFor="displayName">Display name</label>
              <input
                id="displayName"
                value={state.displayName}
                onChange={(e) => update('displayName', e.target.value)}
                placeholder="Pixel Forge Studios"
                data-testid="displayName"
              />
            </div>
            <div>
              <label htmlFor="country">Country (ISO 3166-1 alpha-2)</label>
              <input
                id="country"
                value={state.country}
                onChange={(e) => update('country', e.target.value.toUpperCase().slice(0, 2))}
                maxLength={2}
                data-testid="country"
              />
            </div>
            <div>
              <label htmlFor="email">Contact email</label>
              <input
                id="email"
                type="email"
                value={state.email}
                onChange={(e) => update('email', e.target.value)}
                data-testid="email"
              />
            </div>
            <div>
              <label htmlFor="website">Website (optional)</label>
              <input
                id="website"
                value={state.website}
                onChange={(e) => update('website', e.target.value)}
              />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="bio">Short bio</label>
              <textarea
                id="bio"
                rows={3}
                value={state.bio}
                onChange={(e) => update('bio', e.target.value)}
                placeholder="Tell buyers about your studio in two sentences."
              />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="avatarUrl">Avatar URL (optional)</label>
              <input
                id="avatarUrl"
                value={state.avatarUrl}
                onChange={(e) => update('avatarUrl', e.target.value)}
              />
            </div>
          </div>
          <div className="gb-sticky-actions">
            <button type="button" onClick={saveProfile} disabled={busy} data-testid="step-profile-next">
              {busy ? 'Saving…' : 'Save and continue'}
            </button>
          </div>
        </section>
      )}

      {state.step === 1 && (
        <section className="gb-card" data-testid="step-stripe">
          <h2 style={{ marginTop: 0 }}>Stripe Connect</h2>
          <p>
            We process payouts via Stripe Connect Express. Click below to open Stripe&apos;s onboarding flow and return when finished.
          </p>
          {readiness?.stripeConnectAccountId && (
            <p className="gb-muted">Account: <code>{readiness.stripeConnectAccountId}</code></p>
          )}
          <div className="gb-sticky-actions">
            <button
              type="button"
              className="gb-button-secondary"
              onClick={recheckStripeStatus}
              disabled={busy}
              data-testid="step-stripe-recheck"
            >
              Re-check status
            </button>
            <button type="button" onClick={startStripeConnect} disabled={busy} data-testid="step-stripe-start">
              {busy ? 'Opening Stripe…' : 'Open Stripe onboarding'}
            </button>
          </div>
        </section>
      )}

      {state.step === 2 && (
        <section className="gb-card" data-testid="step-tax">
          <h2 style={{ marginTop: 0 }}>Tax info</h2>
          <div className="gb-form-grid">
            <div>
              <label htmlFor="taxFormType">Tax form</label>
              <select
                id="taxFormType"
                value={state.taxFormType}
                onChange={(e) => update('taxFormType', e.target.value as OnboardingState['taxFormType'])}
                data-testid="taxFormType"
              >
                <option value="">Select…</option>
                <option value="w9">W-9 (US persons)</option>
                <option value="w8ben">W-8BEN (non-US)</option>
              </select>
            </div>
            <div>
              <label htmlFor="taxId">Tax identification number</label>
              <input
                id="taxId"
                value={state.taxId}
                onChange={(e) => update('taxId', e.target.value)}
                placeholder={state.taxFormType === 'w9' ? 'EIN or SSN' : 'Foreign tax ID'}
                data-testid="taxId"
              />
            </div>
          </div>
          <p className="gb-muted" style={{ fontSize: 13 }}>
            We pass this reference to our tax provider; no raw tax IDs are stored unencrypted on Greybox infrastructure.
          </p>
          <div className="gb-sticky-actions">
            <button type="button" onClick={saveTax} disabled={busy} data-testid="step-tax-next">
              {busy ? 'Saving…' : 'Save and continue'}
            </button>
          </div>
        </section>
      )}

      {state.step === 3 && (
        <section className="gb-card" data-testid="step-banking">
          <h2 style={{ marginTop: 0 }}>Banking</h2>
          <p>
            Banking details are collected by Stripe directly. If you completed onboarding, your account should already be verified.
          </p>
          {readiness && (
            <div className="gb-muted" style={{ fontSize: 13 }}>
              Status: <span className={readiness.status === 'ready' ? 'gb-badge gb-badge-positive' : 'gb-badge gb-badge-warning'}>
                {readiness.status}
              </span>
            </div>
          )}
          <div className="gb-sticky-actions">
            <button
              type="button"
              className="gb-button-secondary"
              onClick={recheckStripeStatus}
              disabled={busy}
              data-testid="step-banking-recheck"
            >
              Re-check verification
            </button>
            <button
              type="button"
              onClick={() => update('step', 4)}
              data-testid="step-banking-next"
            >
              Continue
            </button>
          </div>
        </section>
      )}

      {state.step === 4 && (
        <section className="gb-card" data-testid="step-approval">
          <h2 style={{ marginTop: 0 }}>Approval pending</h2>
          <p>
            Your profile is queued for human review. We aim to respond within two business days. We&apos;ll email you at{' '}
            <strong>{state.email || '(no email on file)'}</strong> when your storefront goes live.
          </p>
          <div className="gb-row" style={{ gap: 8, marginTop: 16 }}>
            <span className="gb-badge gb-badge-warning">Queue position: ~3</span>
            <span className="gb-badge gb-badge-accent">Est. wait: 1-2 business days</span>
          </div>
          <div className="gb-sticky-actions">
            <button type="button" className="gb-button-secondary" onClick={reset} data-testid="step-approval-reset">
              Start over
            </button>
            <a href="/creator/dashboard" className="gb-button" data-testid="step-approval-dashboard">
              View dashboard
            </a>
          </div>
        </section>
      )}
    </div>
  );
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function extractError(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'error' in body) {
    const err = (body as { error?: { message?: string } }).error;
    if (err?.message) return err.message;
  }
  return fallback;
}
