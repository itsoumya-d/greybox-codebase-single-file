// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { randomBytes } from 'node:crypto';

const REQUEST_ID_PREFIX = 'req_';
const REQUEST_ID_ALLOWED_CHARS = /^[A-Za-z0-9_.:-]{1,128}$/u;

export function randomRequestId(): string {
  return `${REQUEST_ID_PREFIX}${randomBytes(8).toString('hex')}`;
}

export function normalizeRequestId(value: unknown): string | undefined {
  if (!value) return undefined;
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== 'string') return undefined;
  const trimmed = candidate.trim();
  if (!trimmed || !REQUEST_ID_ALLOWED_CHARS.test(trimmed)) return undefined;
  return trimmed;
}
