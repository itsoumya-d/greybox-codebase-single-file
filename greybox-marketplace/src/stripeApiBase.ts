// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

export interface StripeApiBaseOptions {
  readonly allowNonStripeHost?: boolean;
}

export function normalizeStripeApiBase(
  value: string | undefined,
  options: StripeApiBaseOptions = {},
): string {
  const raw = (value?.trim() || 'https://api.stripe.com').replace(/\/+$/u, '');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Stripe API base must be an absolute https URL');
  }
  if (url.protocol !== 'https:') {
    throw new Error('Stripe API base must be an absolute https URL');
  }
  if (url.username || url.password) {
    throw new Error('Stripe API base must not include credentials');
  }
  if (url.search || url.hash) {
    throw new Error('Stripe API base must not include query or fragment');
  }
  if (url.pathname !== '/' && url.pathname !== '') {
    throw new Error('Stripe API base must not include a path');
  }
  if (url.hostname !== 'api.stripe.com' && options.allowNonStripeHost !== true) {
    throw new Error('Stripe API base must be hosted on api.stripe.com');
  }
  return url.origin;
}
