// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { createHmac, timingSafeEqual } from 'node:crypto';

const STRIPE_LIVE_SECRET_PREFIX = 'sk_live_';
const STRIPE_WEBHOOK_SECRET_PREFIX = 'whsec_';
const HOSTED_STRIPE_SECRET_MIN_LENGTH = 24;
const HOSTED_STRIPE_SECRET_PLACEHOLDER_PATTERN =
  /^(?:test|example|sample|dummy|placeholder|changeme|change-me|replace-me|not-a-secret|dev-only)(?:[_-]|$)/iu;
const STRIPE_WEBHOOK_SIGNATURE_TOLERANCE_SECONDS = 300;

export function hostedStripeSecretKeyIsSafe(key: string | undefined): boolean {
  const normalized = key?.trim();
  if (!normalized) return false;
  if (!normalized.startsWith(STRIPE_LIVE_SECRET_PREFIX)) return false;
  if (normalized.length < HOSTED_STRIPE_SECRET_MIN_LENGTH) return false;
  return !HOSTED_STRIPE_SECRET_PLACEHOLDER_PATTERN.test(normalized.slice(STRIPE_LIVE_SECRET_PREFIX.length));
}

export function assertHostedStripeSecretKey(service: string, key: string | undefined): void {
  if (hostedStripeSecretKeyIsSafe(key)) return;
  throw new Error(
    `${service} refused to start in NODE_ENV=production because STRIPE_SECRET_KEY must be ` +
    'a live Stripe secret key (sk_live_*) and not a placeholder.',
  );
}

export function hostedStripeWebhookSecretIsSafe(secret: string | undefined): boolean {
  const normalized = secret?.trim();
  if (!normalized) return false;
  if (!normalized.startsWith(STRIPE_WEBHOOK_SECRET_PREFIX)) return false;
  if (normalized.length < HOSTED_STRIPE_SECRET_MIN_LENGTH) return false;
  return !HOSTED_STRIPE_SECRET_PLACEHOLDER_PATTERN.test(normalized.slice(STRIPE_WEBHOOK_SECRET_PREFIX.length));
}

export function assertHostedStripeWebhookSecret(service: string, secret: string | undefined): void {
  if (hostedStripeWebhookSecretIsSafe(secret)) return;
  throw new Error(
    `${service} refused to start in NODE_ENV=production because ` +
    'GREYBOX_MARKETPLACE_STRIPE_WEBHOOK_SECRET must be a Stripe webhook signing secret (whsec_*) and not a placeholder.',
  );
}

export function stripeWebhookSignatureHeader(input: {
  payload: string;
  secret: string;
  timestampSeconds: number;
}): string {
  const signature = createHmac('sha256', input.secret)
    .update(`${input.timestampSeconds}.${input.payload}`, 'utf8')
    .digest('hex');
  return `t=${input.timestampSeconds},v1=${signature}`;
}

export function stripeWebhookSignatureIsValid(input: {
  payload: string;
  secret: string;
  signatureHeader: string | undefined;
  nowMs?: number;
  toleranceSeconds?: number;
}): boolean {
  const parsed = stripeSignatureParts(input.signatureHeader);
  if (!parsed) return false;
  const toleranceSeconds = input.toleranceSeconds ?? STRIPE_WEBHOOK_SIGNATURE_TOLERANCE_SECONDS;
  const nowMs = input.nowMs ?? Date.now();
  if (Math.abs(Math.floor(nowMs / 1000) - parsed.timestampSeconds) > toleranceSeconds) return false;
  const expected = stripeWebhookSignatureHeader({
    payload: input.payload,
    secret: input.secret,
    timestampSeconds: parsed.timestampSeconds,
  }).split('v1=')[1];
  if (!expected) return false;
  return parsed.signatures.some((signature) => stripeSignatureDigestMatches(signature, expected));
}

function stripeSignatureParts(signatureHeader: string | undefined): {
  timestampSeconds: number;
  signatures: string[];
} | undefined {
  if (!signatureHeader) return undefined;
  const parts = signatureHeader.split(',').map((part) => part.trim()).filter(Boolean);
  let timestampSeconds: number | undefined;
  const signatures: string[] = [];
  for (const part of parts) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const key = part.slice(0, separator);
    const value = part.slice(separator + 1);
    if (key === 't') {
      const parsed = Number(value);
      if (Number.isInteger(parsed) && parsed > 0) timestampSeconds = parsed;
    } else if (key === 'v1' && value) {
      signatures.push(value);
    }
  }
  if (!timestampSeconds || signatures.length === 0) return undefined;
  return { timestampSeconds, signatures };
}

function stripeSignatureDigestMatches(candidateHex: string, expectedHex: string): boolean {
  if (!/^[a-f0-9]{64}$/iu.test(candidateHex)) return false;
  const candidate = Buffer.from(candidateHex, 'hex');
  const expected = Buffer.from(expectedHex, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
