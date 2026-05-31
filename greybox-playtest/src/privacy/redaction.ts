// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { createHash } from 'node:crypto';

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const IP_ADDRESS_PATTERN = /\b(?:\d{1,3}\.){3}\d{1,3}\b/gu;
const PHONE_PATTERN = /(?<!\d)(?:\+\d{1,3}[\s.-]*)?(?:\(\d{3}\)|\d{3}[\s.-])[\s.-]*\d{3}[\s.-]\d{4}\b/gu;
const CARD_PATTERN = /\b(?:\d{4}[ -]){3}\d{4}\b|\b\d{15,16}\b/gu;
const BEARER_TOKEN_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}(?=$|[^A-Za-z0-9._~+/=-])/giu;
const STRIPE_SECRET_PATTERN = /\b(?:Bearer\s+)?(?:sk|rk)_(?:live|test)_[A-Za-z0-9_]+\b|\bwhsec_[A-Za-z0-9_]+\b/giu;
const STRIPE_OBJECT_ID_PATTERN = /\b(?:acct|ch|cs|cus|dp|evt|in|pi|price|prod|re|seti|sub|taxcalc|tr|txr)_[A-Za-z0-9_]+\b/gu;

export function redactPlaytestText(value: string): string {
  return value
    .replace(BEARER_TOKEN_PATTERN, '[redacted-secret]')
    .replace(STRIPE_SECRET_PATTERN, '[redacted-secret]')
    .replace(EMAIL_PATTERN, '[redacted-email]')
    .replace(IP_ADDRESS_PATTERN, '[redacted-ip]')
    .replace(CARD_PATTERN, '[redacted-card]')
    .replace(PHONE_PATTERN, '[redacted-phone]')
    .replace(STRIPE_OBJECT_ID_PATTERN, '[redacted-stripe-id]');
}

export function redactPlaytestJson(value: unknown): unknown {
  if (typeof value === 'string') return redactPlaytestText(value);
  if (Array.isArray(value)) return value.map((item) => redactPlaytestJson(item));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [redactObjectKey(key), redactPlaytestJson(child)]));
}

function redactObjectKey(key: string): string {
  const redacted = redactPlaytestText(key);
  if (redacted === key) return key;
  return `${redacted}#${createHash('sha256').update(key).digest('hex').slice(0, 8)}`;
}
