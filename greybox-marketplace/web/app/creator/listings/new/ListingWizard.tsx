// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Stepper } from '@/components/Stepper';
import { api } from '@/lib/api';
import type { ListingCategory, ListingDraft } from '@/lib/marketplace-types';
import { formatCurrencyCents } from '@/lib/format';

const STORAGE_KEY = 'gb_listing_draft';

const STEPS = [
  { label: 'Type' },
  { label: 'Asset' },
  { label: 'Metadata' },
  { label: 'Pricing' },
  { label: 'Preview' },
  { label: 'Submit' },
];

interface DraftState {
  step: number;
  creatorId: string;
  category: ListingCategory | '';
  assetFileName: string;
  assetSize: number;
  title: string;
  description: string;
  tags: string;
  screenshots: string;
  demoUrl: string;
  priceCents: number;
  pricingModel: 'one-time' | 'subscription';
  licenseSummary: string;
  submitted?: { listingId: string; reviewId: string; reviewStatus: string };
}

const INITIAL: DraftState = {
  step: 0,
  creatorId: '',
  category: '',
  assetFileName: '',
  assetSize: 0,
  title: '',
  description: '',
  tags: '',
  screenshots: '',
  demoUrl: '',
  priceCents: 2900,
  pricingModel: 'one-time',
  licenseSummary: 'Single-team commercial use. No resale.',
};

const TYPE_OPTIONS: { value: ListingCategory; label: string; description: string }[] = [
  { value: 'template', label: 'Template', description: 'Reusable game blueprint or AGDS scene template.' },
  { value: 'asset-pack', label: 'Asset pack', description: 'Bundled art, audio, or VFX assets.' },
  { value: 'custom-skill', label: 'Skill bundle', description: 'AGDS skill or skill pack for downstream agents.' },
  { value: 'custom-art-bible', label: 'Character / Art pack', description: 'Style guide, art bible, or character set.' },
  { value: 'pro-module', label: 'Pro module', description: 'Signed AGDS pro-module bundle.' },
  { value: 'consulting-hour', label: 'Consulting hour', description: 'Booked time with a domain expert.' },
];

export function ListingWizard() {
  const [state, setState] = useState<DraftState>(INITIAL);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setState({ ...INITIAL, ...(JSON.parse(raw) as Partial<DraftState>) });
      const profile = localStorage.getItem('gb_onboarding_state');
      if (profile) {
        const parsed = JSON.parse(profile) as { creatorId?: string };
        if (parsed.creatorId) setState((prev) => ({ ...prev, creatorId: parsed.creatorId! }));
      }
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, hydrated]);

  const doneIndices = useMemo(() => Array.from({ length: state.step }, (_, i) => i), [state.step]);

  function update<K extends keyof DraftState>(key: K, value: DraftState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    update('assetFileName', file.name);
    update('assetSize', file.size);
  }

  function onDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    update('assetFileName', file.name);
    update('assetSize', file.size);
  }

  async function submit() {
    setError(undefined);
    setBusy(true);
    try {
      if (!state.creatorId) {
        setError('No creator ID. Complete onboarding first.');
        return;
      }
      if (!state.category) {
        setError('Pick a listing type.');
        return;
      }
      const draft: ListingDraft = {
        creatorId: state.creatorId,
        title: state.title.trim(),
        description: state.description.trim(),
        category: state.category,
        priceCents: Math.max(0, Math.round(state.priceCents)),
        licenseSummary: state.licenseSummary.trim(),
        tags: state.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      };
      if (!draft.title) {
        setError('Title is required.');
        return;
      }
      if (!draft.description) {
        setError('Description is required.');
        return;
      }
      if (!draft.licenseSummary) {
        setError('License summary is required.');
        return;
      }
      if (!Number.isInteger(draft.priceCents)) {
        setError('Price must be an integer number of cents.');
        return;
      }
      const result = await api.submitListing(draft);
      if (!result.ok) {
        setError(extractError(result.body, `Submit failed (${result.status})`));
        return;
      }
      update('submitted', {
        listingId: result.body.listing.id,
        reviewId: result.body.review.id,
        reviewStatus: result.body.review.status,
      });
      update('step', STEPS.length - 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    localStorage.removeItem(STORAGE_KEY);
    setState({ ...INITIAL, creatorId: state.creatorId });
  }

  if (!hydrated) return <p className="gb-muted">Loading…</p>;

  return (
    <div>
      <Stepper steps={STEPS} activeIndex={state.step} doneIndices={doneIndices} />
      {error && (
        <div className="gb-error" role="alert" data-testid="listing-error">
          {error}
        </div>
      )}

      {!state.creatorId && (
        <div className="gb-card">
          <p style={{ marginTop: 0 }}>You need to complete creator onboarding first.</p>
          <a href="/creator/onboard" className="gb-button">Onboard now</a>
        </div>
      )}

      {state.creatorId && state.step === 0 && (
        <section className="gb-card" data-testid="step-type">
          <h2 style={{ marginTop: 0 }}>Listing type</h2>
          <div className="gb-grid gb-grid-cards">
            {TYPE_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="gb-card"
                style={{
                  cursor: 'pointer',
                  border: state.category === opt.value ? '2px solid var(--gb-accent)' : '1px solid var(--gb-border)',
                }}
                data-testid={`type-option-${opt.value}`}
              >
                <input
                  type="radio"
                  name="category"
                  value={opt.value}
                  checked={state.category === opt.value}
                  onChange={() => update('category', opt.value)}
                  style={{ width: 'auto', marginRight: 8 }}
                />
                <strong>{opt.label}</strong>
                <p className="gb-muted" style={{ marginTop: 4, marginBottom: 0, fontSize: 13 }}>
                  {opt.description}
                </p>
              </label>
            ))}
          </div>
          <div className="gb-sticky-actions">
            <button
              type="button"
              onClick={() => update('step', 1)}
              disabled={!state.category}
              data-testid="step-type-next"
            >
              Continue
            </button>
          </div>
        </section>
      )}

      {state.creatorId && state.step === 1 && (
        <section className="gb-card" data-testid="step-asset">
          <h2 style={{ marginTop: 0 }}>Asset upload</h2>
          <p className="gb-muted">
            For consulting hours, you can skip this step. The file is staged client-side for now; the backend will receive the upload after a final review pass.
          </p>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            data-testid="asset-dropzone"
            style={{
              border: '2px dashed var(--gb-border)',
              borderRadius: 'var(--gb-radius-lg)',
              padding: 48,
              textAlign: 'center',
              cursor: 'pointer',
            }}
          >
            {state.assetFileName ? (
              <>
                <strong>{state.assetFileName}</strong>
                <p className="gb-muted" style={{ marginTop: 4, marginBottom: 0 }}>
                  {(state.assetSize / (1024 * 1024)).toFixed(2)} MB
                </p>
              </>
            ) : (
              <p style={{ margin: 0 }} className="gb-muted">
                Drag a file here, or click to browse.
              </p>
            )}
            <input ref={fileInputRef} type="file" onChange={onFileChange} style={{ display: 'none' }} />
          </div>
          <div className="gb-sticky-actions">
            <button type="button" className="gb-button-secondary" onClick={() => update('step', 0)}>
              Back
            </button>
            <button type="button" onClick={() => update('step', 2)} data-testid="step-asset-next">
              Continue
            </button>
          </div>
        </section>
      )}

      {state.creatorId && state.step === 2 && (
        <section className="gb-card" data-testid="step-metadata">
          <h2 style={{ marginTop: 0 }}>Metadata</h2>
          <div className="gb-form-grid">
            <div style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="title">Title</label>
              <input
                id="title"
                value={state.title}
                onChange={(e) => update('title', e.target.value)}
                placeholder="Hex-grid combat starter template"
                data-testid="listing-title"
              />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="description">Description (Markdown supported)</label>
              <textarea
                id="description"
                rows={6}
                value={state.description}
                onChange={(e) => update('description', e.target.value)}
                placeholder="What this listing contains, who it's for, and what's NOT included."
                data-testid="listing-description"
              />
            </div>
            <div>
              <label htmlFor="tags">Tags (comma separated)</label>
              <input
                id="tags"
                value={state.tags}
                onChange={(e) => update('tags', e.target.value)}
                placeholder="tactics, strategy, hex"
                data-testid="listing-tags"
              />
            </div>
            <div>
              <label htmlFor="demoUrl">Demo URL (optional)</label>
              <input
                id="demoUrl"
                value={state.demoUrl}
                onChange={(e) => update('demoUrl', e.target.value)}
                placeholder="https://"
              />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="screenshots">Screenshot URLs (one per line)</label>
              <textarea
                id="screenshots"
                rows={3}
                value={state.screenshots}
                onChange={(e) => update('screenshots', e.target.value)}
              />
            </div>
          </div>
          <div className="gb-sticky-actions">
            <button type="button" className="gb-button-secondary" onClick={() => update('step', 1)}>
              Back
            </button>
            <button type="button" onClick={() => update('step', 3)} data-testid="step-metadata-next">
              Continue
            </button>
          </div>
        </section>
      )}

      {state.creatorId && state.step === 3 && (
        <section className="gb-card" data-testid="step-pricing">
          <h2 style={{ marginTop: 0 }}>Pricing</h2>
          <div className="gb-form-grid">
            <div>
              <label htmlFor="pricingModel">Pricing model</label>
              <select
                id="pricingModel"
                value={state.pricingModel}
                onChange={(e) => update('pricingModel', e.target.value as DraftState['pricingModel'])}
              >
                <option value="one-time">One-time purchase</option>
                <option value="subscription">Subscription (coming soon)</option>
              </select>
            </div>
            <div>
              <label htmlFor="priceCents">Price (USD)</label>
              <input
                id="priceCents"
                type="number"
                min={0}
                step="0.01"
                value={(state.priceCents / 100).toFixed(2)}
                onChange={(e) => update('priceCents', Math.round(parseFloat(e.target.value) * 100))}
                data-testid="listing-price"
              />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="licenseSummary">License summary</label>
              <textarea
                id="licenseSummary"
                rows={3}
                value={state.licenseSummary}
                onChange={(e) => update('licenseSummary', e.target.value)}
                data-testid="listing-license"
              />
            </div>
          </div>
          <p className="gb-muted" style={{ fontSize: 13 }}>
            Platform take rate is applied at checkout. Your net per sale is shown on the preview screen.
          </p>
          <div className="gb-sticky-actions">
            <button type="button" className="gb-button-secondary" onClick={() => update('step', 2)}>
              Back
            </button>
            <button type="button" onClick={() => update('step', 4)} data-testid="step-pricing-next">
              Continue
            </button>
          </div>
        </section>
      )}

      {state.creatorId && state.step === 4 && (
        <section className="gb-card" data-testid="step-preview">
          <h2 style={{ marginTop: 0 }}>Preview</h2>
          <div className="gb-listing-card" style={{ maxWidth: 320 }}>
            <div
              aria-hidden
              style={{
                height: 140,
                background: 'linear-gradient(135deg, #2c3556 0%, #3b4882 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
                color: 'rgba(255,255,255,0.85)',
              }}
            >
              {state.category || 'category'}
            </div>
            <div className="gb-listing-card-body">
              <div className="gb-listing-card-title">{state.title || 'Untitled listing'}</div>
              <div className="gb-listing-card-creator">by you</div>
              <div className="gb-row" style={{ gap: 8 }}>
                <span className="gb-badge">{state.category}</span>
              </div>
              <div className="gb-listing-card-price">{formatCurrencyCents(state.priceCents)}</div>
            </div>
          </div>
          <div className="gb-sticky-actions">
            <button type="button" className="gb-button-secondary" onClick={() => update('step', 3)}>
              Back
            </button>
            <button type="button" onClick={submit} disabled={busy} data-testid="step-preview-submit">
              {busy ? 'Submitting…' : 'Submit for review'}
            </button>
          </div>
        </section>
      )}

      {state.creatorId && state.step === 5 && state.submitted && (
        <section className="gb-card" data-testid="step-submitted">
          <h2 style={{ marginTop: 0 }}>Submitted</h2>
          <p>
            Your listing was queued for review.
          </p>
          <div className="gb-row" style={{ gap: 8 }}>
            <span className="gb-badge gb-badge-accent">listing: {state.submitted.listingId}</span>
            <span className="gb-badge gb-badge-warning">review: {state.submitted.reviewStatus}</span>
          </div>
          <div className="gb-sticky-actions">
            <button type="button" className="gb-button-secondary" onClick={reset}>
              Start another
            </button>
            <a href="/creator/listings" className="gb-button">
              View my listings
            </a>
          </div>
        </section>
      )}
    </div>
  );
}

function extractError(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'error' in body) {
    const err = (body as { error?: { message?: string } }).error;
    if (err?.message) return err.message;
  }
  return fallback;
}
