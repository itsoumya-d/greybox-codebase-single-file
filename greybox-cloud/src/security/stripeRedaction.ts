// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { redactPiiText } from '../safety/piiRedactor.js';

const STRIPE_SECRET_PATTERN = /\b(?:Bearer\s+)?(?:sk|rk)_(?:live|test)_[A-Za-z0-9_]+\b|\bwhsec_[A-Za-z0-9_]+\b/giu;
const STRIPE_OBJECT_ID_PATTERN = /\b(?:acct|ch|cs|cus|dp|evt|in|pi|price|prod|re|seti|sub|taxcalc|tr|txr)_[A-Za-z0-9_]+\b/gu;

export function sanitizeStripeOperationalText(text: string | undefined, fallback = 'Stripe operation failed'): string {
  const stripeSanitized = (text ?? fallback)
    .replace(STRIPE_SECRET_PATTERN, '[REDACTED_STRIPE_SECRET]')
    .replace(STRIPE_OBJECT_ID_PATTERN, '[REDACTED_STRIPE_ID]');
  const sanitized = redactPiiText(stripeSanitized)
    .replace(/\s+/gu, ' ')
    .trim();
  if (!sanitized) return fallback;
  return sanitized.length > 500 ? `${sanitized.slice(0, 497)}...` : sanitized;
}
