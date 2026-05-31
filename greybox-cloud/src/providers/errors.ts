// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import type { ProviderName } from '../types.js';

const transientHttpStatuses = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

export class ProviderHttpError extends Error {
  readonly transient: boolean;

  constructor(
    readonly provider: ProviderName,
    readonly status: number,
    message = `${provider} ${status}`,
  ) {
    super(message);
    this.name = 'ProviderHttpError';
    this.transient = transientHttpStatuses.has(status) || status >= 500;
  }
}

export function isTransientProviderError(error: unknown): boolean {
  if (error instanceof ProviderHttpError) return error.transient;
  return error instanceof TypeError;
}
