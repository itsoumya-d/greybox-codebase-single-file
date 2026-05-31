// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { isIP } from 'node:net';

const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const ipv4CandidatePattern = /\b(?:\d{1,3}\.){3}\d{1,3}\b/gu;
const ipv6CandidatePattern = /(?<![\w:])(?:[A-F0-9]{0,4}:){2,7}[A-F0-9]{0,4}(?:%[0-9A-Z._-]+)?(?![\w:])/giu;
const phonePattern = /(?<!\w)(?:\+?\d[\d\s().-]{7,}\d)(?!\w)/gu;
const cardCandidatePattern = /(?<!\d)(?:\d[ -]?){13,19}(?!\d)/gu;
const dottedQuadLikePattern = /^\d{1,3}(?:\.\d{1,3}){3}$/u;
const bearerTokenPattern = /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}(?=$|[^A-Za-z0-9._~+/=-])/giu;
const secretPattern = /\b(?:Bearer\s+)?(?:(?:sk|rk)_(?:live|test)_[A-Za-z0-9_]+|sk-(?:proj|ant|or)-[A-Za-z0-9_-]{12,}|sk-ant-api[0-9]{2}-[A-Za-z0-9_-]{12,}|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16})\b|\bwhsec_[A-Za-z0-9_]+\b|\bgbx_(?:indie|pro|studio|enterprise)_[A-Za-z0-9_-]{12,}\b/giu;
const stripeObjectIdPattern = /\b(?:acct|ch|cs|cus|dp|evt|in|pi|price|prod|re|seti|sub|taxcalc|tr|txr)_[A-Za-z0-9_]+\b/gu;

export type PiiType = 'email' | 'phone' | 'ip' | 'card';

export interface PiiClassification {
  readonly redacted: boolean;
  readonly types: PiiType[];
  readonly counts: Record<PiiType, number>;
}

function luhnValid(input: string): boolean {
  const digits = input.replace(/\D/gu, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let doubleDigit = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (doubleDigit) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
}

function normalizedIp(input: string): string {
  const zoneIndex = input.indexOf('%');
  return zoneIndex === -1 ? input : input.slice(0, zoneIndex);
}

function redactIpCandidate(candidate: string): string {
  return isIP(normalizedIp(candidate)) === 0 ? candidate : '[REDACTED_IP]';
}

function redactPhoneCandidate(candidate: string): string {
  if (dottedQuadLikePattern.test(candidate.trim())) return candidate;
  const digits = candidate.replace(/\D/gu, '');
  return digits.length >= 9 && digits.length <= 15 ? '[REDACTED_PHONE]' : candidate;
}

export function redactPiiText(input: string): string {
  return input
    .replace(bearerTokenPattern, '[REDACTED_SECRET]')
    .replace(secretPattern, '[REDACTED_SECRET]')
    .replace(emailPattern, '[REDACTED_EMAIL]')
    .replace(ipv4CandidatePattern, redactIpCandidate)
    .replace(ipv6CandidatePattern, redactIpCandidate)
    .replace(cardCandidatePattern, (candidate) => (luhnValid(candidate) ? '[REDACTED_CARD]' : candidate))
    .replace(phonePattern, redactPhoneCandidate)
    .replace(stripeObjectIdPattern, '[REDACTED_STRIPE_ID]');
}

export function classifyPiiText(input: string): PiiClassification {
  const counts = emptyPiiCounts();
  counts.email += Array.from(input.matchAll(emailPattern)).length;
  counts.ip += Array.from(input.matchAll(ipv4CandidatePattern), ([candidate]) => redactIpCandidate(candidate))
    .filter((candidate) => candidate === '[REDACTED_IP]').length;
  counts.ip += Array.from(input.matchAll(ipv6CandidatePattern), ([candidate]) => redactIpCandidate(candidate))
    .filter((candidate) => candidate === '[REDACTED_IP]').length;
  counts.card += Array.from(input.matchAll(cardCandidatePattern), ([candidate]) => luhnValid(candidate))
    .filter(Boolean).length;
  counts.phone += Array.from(input.matchAll(phonePattern), ([candidate]) => redactPhoneCandidate(candidate))
    .filter((candidate) => candidate === '[REDACTED_PHONE]').length;
  return classificationFromCounts(counts);
}

export function classifyPii(value: unknown): PiiClassification {
  if (typeof value === 'string') return classifyPiiText(value);
  if (Array.isArray(value)) return mergeClassifications(value.map((item) => classifyPii(item)));
  if (value && typeof value === 'object') {
    return mergeClassifications(Object.entries(value).flatMap(([key, child]) => [
      classifyPiiText(key),
      classifyPii(child),
    ]));
  }
  return classificationFromCounts(emptyPiiCounts());
}

export function redactPii<T>(value: T): T {
  if (typeof value === 'string') return redactPiiText(value) as T;
  if (Array.isArray(value)) return value.map((item) => redactPii(item)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [redactPiiText(key), redactPii(child)])) as T;
  }
  return value;
}

function emptyPiiCounts(): Record<PiiType, number> {
  return { email: 0, phone: 0, ip: 0, card: 0 };
}

function mergeClassifications(classifications: PiiClassification[]): PiiClassification {
  const counts = emptyPiiCounts();
  for (const classification of classifications) {
    counts.email += classification.counts.email;
    counts.phone += classification.counts.phone;
    counts.ip += classification.counts.ip;
    counts.card += classification.counts.card;
  }
  return classificationFromCounts(counts);
}

function classificationFromCounts(counts: Record<PiiType, number>): PiiClassification {
  const types = (Object.keys(counts) as PiiType[]).filter((type) => counts[type] > 0);
  return { redacted: types.length > 0, types, counts };
}
