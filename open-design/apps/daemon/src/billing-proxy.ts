// SPDX-License-Identifier: Apache-2.0

import type { IncomingMessage } from 'node:http';

/**
 * Billing proxy: thin forwarder from the local daemon to the Greybox Cloud
 * Stripe-Checkout / Customer-Portal endpoints. Mirrors the marketplace-proxy
 * shape (resolve base URL, scope timeout, sanitize response). The cloud owns
 * Stripe credentials and idempotency keys; the daemon only forwards the
 * creator's request body and an optional bearer token from env so creators
 * never see Stripe secrets locally.
 *
 * Endpoint shapes are sourced from greybox-cloud/src/routers/billing.ts:
 *   - POST /v1/billing/checkout-session → { url, id, dryRun }
 *   - POST /v1/billing/portal-session    → { url, id, dryRun }
 *   - GET  /v1/billing/me                → tenant subscription snapshot
 */

const BILLING_TIMEOUT_MS = 4_500;

const CLOUD_URL_ENV_NAMES = [
  'AGDS_BILLING_CLOUD_URL',
  'GREYBOX_CLOUD_URL',
  'AGDS_GREYBOX_CLOUD_URL',
] as const;

const CLOUD_TOKEN_ENV_NAMES = [
  'AGDS_BILLING_CLOUD_TOKEN',
  'GREYBOX_CLOUD_TOKEN',
  'GREYBOX_LICENSE_KEY',
] as const;

const DEFAULT_CLOUD_URL = 'http://localhost:38900';

export interface BillingProxyEnv {
  AGDS_BILLING_CLOUD_URL?: string;
  AGDS_GREYBOX_CLOUD_URL?: string;
  GREYBOX_CLOUD_URL?: string;
  AGDS_BILLING_CLOUD_TOKEN?: string;
  GREYBOX_CLOUD_TOKEN?: string;
  GREYBOX_LICENSE_KEY?: string;
}

export interface BillingCheckoutRequestInput {
  tier: 'indie' | 'studio' | 'pro';
  seats?: number;
  successUrl: string;
  cancelUrl: string;
  customerId?: string;
  customerEmail?: string;
  customerContact?: string;
  provider?: 'stripe' | 'razorpay' | 'dodo';
}

export interface BillingCheckoutSessionResult {
  url: string;
  id?: string;
  dryRun?: boolean;
}

export interface BillingPortalRequestInput {
  customerId: string;
  returnUrl: string;
}

export interface BillingPortalSessionResult {
  url: string;
  id?: string;
  dryRun?: boolean;
}

export type BillingMeResult =
  | {
      configured: false;
      status: 'unconfigured';
    }
  | {
      configured: true;
      status: 'ok';
      tier: 'free' | 'indie' | 'studio' | 'enterprise';
      seats?: number;
      customerId?: string;
      currentPeriodEnd?: number;
      cancelAtPeriodEnd?: boolean;
      includedInputTokens?: number;
      includedOutputTokens?: number;
      portalAvailable?: boolean;
    }
  | {
      configured: true;
      status: 'error';
      error: string;
    };

function cleanEnvValue(value: string | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function firstEnvValue(env: BillingProxyEnv, names: readonly string[]): string | null {
  for (const name of names) {
    const raw = cleanEnvValue((env as Record<string, string | undefined>)[name]);
    if (raw) return raw;
  }
  return null;
}

/**
 * Resolve the cloud base URL. The task spec calls for a localhost default,
 * which we honor when no env override is configured. Returns a normalized
 * URL with trailing slash stripped so subsequent joins are unambiguous.
 */
export function resolveBillingCloudUrl(
  env: BillingProxyEnv = process.env,
): URL {
  const configured = firstEnvValue(env, CLOUD_URL_ENV_NAMES);
  const raw = configured ?? DEFAULT_CLOUD_URL;
  const url = new URL(raw);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${CLOUD_URL_ENV_NAMES[0]} must be an http(s) URL`);
  }
  url.pathname = url.pathname.replace(/\/+$/u, '');
  url.search = '';
  url.hash = '';
  return url;
}

function billingHeaders(env: BillingProxyEnv, init?: Record<string, string>): Record<string, string> {
  const token = firstEnvValue(env, CLOUD_TOKEN_ENV_NAMES);
  return {
    'content-type': 'application/json',
    accept: 'application/json',
    ...(init ?? {}),
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

function joinCloudUrl(baseUrl: URL, pathname: string): string {
  const next = new URL(baseUrl.toString());
  next.pathname = `${next.pathname}/${pathname.replace(/^\/+/u, '')}`.replace(/\/{2,}/gu, '/');
  return next.toString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function trimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function safeBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function safeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function safeTier(value: unknown): 'free' | 'indie' | 'studio' | 'enterprise' | undefined {
  if (value === 'free' || value === 'indie' || value === 'studio' || value === 'enterprise') {
    return value;
  }
  return undefined;
}

function sanitizeReturnUrl(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BillingProxyError(400, 'BAD_REQUEST', `${field} is required`);
  }
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new BillingProxyError(400, 'BAD_REQUEST', `${field} must be an absolute URL`);
  }
  const host = parsed.hostname.replace(/^\[|\]$/gu, '').toLowerCase();
  const localHttpAllowed =
    parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(host);
  if (parsed.protocol !== 'https:' && !localHttpAllowed) {
    throw new BillingProxyError(400, 'BAD_REQUEST', `${field} must be an https URL`);
  }
  if (parsed.username || parsed.password) {
    throw new BillingProxyError(400, 'BAD_REQUEST', `${field} must not contain credentials`);
  }
  return parsed.toString();
}

export function resolveProviderFromCountry(country: string): 'razorpay' | 'dodo' {
  return country.trim().toUpperCase() === 'IN' ? 'razorpay' : 'dodo';
}

export function extractGeoCountry(req: IncomingMessage): string {
  const cf = typeof req.headers['cf-ipcountry'] === 'string' ? req.headers['cf-ipcountry'] : '';
  const fallback =
    typeof req.headers['x-geoip-country'] === 'string' ? req.headers['x-geoip-country'] : '';
  const raw = (cf || fallback || 'US').trim().toUpperCase();
  const match = /^[A-Z]{2}/u.exec(raw);
  return match ? match[0] : 'US';
}

export class BillingProxyError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'BillingProxyError';
  }
}

/**
 * Parse and validate a checkout-session request body sent by the studio
 * front-end. Throws BillingProxyError so the daemon handler can return the
 * matching HTTP status.
 */
export function parseCheckoutRequest(input: unknown): BillingCheckoutRequestInput {
  if (!isRecord(input)) {
    throw new BillingProxyError(400, 'BAD_REQUEST', 'request body must be an object');
  }
  const tier = trimmedString(input.tier);
  if (tier !== 'indie' && tier !== 'studio' && tier !== 'pro') {
    throw new BillingProxyError(400, 'BAD_REQUEST', 'tier must be indie, studio, or pro');
  }
  const successUrl = sanitizeReturnUrl(input.successUrl, 'successUrl');
  const cancelUrl = sanitizeReturnUrl(input.cancelUrl, 'cancelUrl');
  const seats =
    typeof input.seats === 'number' && Number.isFinite(input.seats) && input.seats > 0
      ? Math.floor(input.seats)
      : undefined;
  const customerId = trimmedString(input.customerId);
  const customerEmail = trimmedString(input.customerEmail);
  const customerContact = trimmedString(input.customerContact);
  const rawProvider = trimmedString(input.provider);
  const provider: 'stripe' | 'razorpay' | 'dodo' =
    rawProvider === 'razorpay' || rawProvider === 'dodo' ? rawProvider : 'stripe';
  return {
    tier,
    successUrl,
    cancelUrl,
    provider,
    ...(seats != null ? { seats } : {}),
    ...(customerId ? { customerId } : {}),
    ...(customerEmail ? { customerEmail } : {}),
    ...(customerContact ? { customerContact } : {}),
  };
}

export function parsePortalRequest(input: unknown): BillingPortalRequestInput {
  if (!isRecord(input)) {
    throw new BillingProxyError(400, 'BAD_REQUEST', 'request body must be an object');
  }
  const customerId = trimmedString(input.customerId);
  if (!customerId) {
    throw new BillingProxyError(400, 'BAD_REQUEST', 'customerId is required');
  }
  const returnUrl = sanitizeReturnUrl(input.returnUrl, 'returnUrl');
  return { customerId, returnUrl };
}

function sanitizeRedirectUrl(value: unknown): string | undefined {
  const raw = trimmedString(value);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    if (url.username || url.password) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function sanitizeCheckoutSession(value: unknown): BillingCheckoutSessionResult | null {
  if (!isRecord(value)) return null;
  const url = sanitizeRedirectUrl(value.url);
  if (!url) return null;
  const id = trimmedString(value.id);
  const dryRun = safeBoolean(value.dryRun);
  return {
    url,
    ...(id ? { id } : {}),
    ...(dryRun != null ? { dryRun } : {}),
  };
}

async function postJson(
  url: string,
  body: Record<string, unknown>,
  env: BillingProxyEnv,
): Promise<{ status: number; payload: unknown }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BILLING_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: billingHeaders(env),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let payload: unknown = {};
    if (text.length > 0) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { error: 'malformed_response', body: text.slice(0, 1024) };
      }
    }
    return { status: response.status, payload };
  } finally {
    clearTimeout(timeout);
  }
}

async function getJson(
  url: string,
  env: BillingProxyEnv,
): Promise<{ status: number; payload: unknown }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BILLING_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: billingHeaders(env),
      signal: controller.signal,
    });
    const text = await response.text();
    let payload: unknown = {};
    if (text.length > 0) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { error: 'malformed_response', body: text.slice(0, 1024) };
      }
    }
    return { status: response.status, payload };
  } finally {
    clearTimeout(timeout);
  }
}

export async function forwardCheckoutSession(
  input: BillingCheckoutRequestInput,
  env: BillingProxyEnv = process.env,
): Promise<BillingCheckoutSessionResult> {
  const baseUrl = resolveBillingCloudUrl(env);
  const cloudPath = '/v1/billing/checkout-session';
  const target = joinCloudUrl(baseUrl, cloudPath);
  const body: Record<string, unknown> = {
    tier: input.tier,
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
    ...(input.seats != null ? { seats: input.seats } : {}),
    ...(input.customerId ? { customerId: input.customerId } : {}),
    ...(input.customerEmail ? { customerEmail: input.customerEmail } : {}),
  };
  const { status, payload } = await postJson(target, body, env);
  if (status < 200 || status >= 300) {
    const code = (isRecord(payload) && trimmedString(payload.error)) || `cloud_${status}`;
    const message =
      (isRecord(payload) && trimmedString(payload.message)) || `billing cloud responded ${status}`;
    throw new BillingProxyError(status >= 400 && status < 600 ? status : 502, code, message);
  }
  const sanitized = sanitizeCheckoutSession(payload);
  if (!sanitized) {
    throw new BillingProxyError(502, 'malformed_response', 'cloud did not return a checkout url');
  }
  return sanitized;
}

export async function forwardPortalSession(
  input: BillingPortalRequestInput,
  env: BillingProxyEnv = process.env,
): Promise<BillingPortalSessionResult> {
  const baseUrl = resolveBillingCloudUrl(env);
  const target = joinCloudUrl(baseUrl, '/v1/billing/portal-session');
  const body: Record<string, unknown> = {
    customerId: input.customerId,
    returnUrl: input.returnUrl,
  };
  const { status, payload } = await postJson(target, body, env);
  if (status < 200 || status >= 300) {
    const code = (isRecord(payload) && trimmedString(payload.error)) || `cloud_${status}`;
    const message = (isRecord(payload) && trimmedString(payload.message)) || `billing cloud responded ${status}`;
    throw new BillingProxyError(status >= 400 && status < 600 ? status : 502, code, message);
  }
  const sanitized = sanitizeCheckoutSession(payload);
  if (!sanitized) {
    throw new BillingProxyError(502, 'malformed_response', 'cloud did not return a portal url');
  }
  return sanitized;
}

export async function forwardRazorpayCheckout(
  input: BillingCheckoutRequestInput,
  env: BillingProxyEnv = process.env,
): Promise<BillingCheckoutSessionResult> {
  const baseUrl = resolveBillingCloudUrl(env);
  const target = joinCloudUrl(baseUrl, '/v1/billing/razorpay/create-subscription');
  const body: Record<string, unknown> = {
    tier: input.tier,
    ...(input.customerEmail ? { customerEmail: input.customerEmail } : {}),
    ...(input.customerContact ? { customerContact: input.customerContact } : {}),
  };
  const { status, payload } = await postJson(target, body, env);
  if (status < 200 || status >= 300) {
    const code = (isRecord(payload) && trimmedString(payload.error)) || `cloud_${status}`;
    const message =
      (isRecord(payload) && trimmedString(payload.message)) || `billing cloud responded ${status}`;
    throw new BillingProxyError(status >= 400 && status < 600 ? status : 502, code, message);
  }
  if (!isRecord(payload)) {
    throw new BillingProxyError(502, 'malformed_response', 'cloud did not return a razorpay response');
  }
  const url = sanitizeRedirectUrl(payload.shortUrl);
  if (!url) {
    throw new BillingProxyError(502, 'malformed_response', 'cloud did not return a razorpay short url');
  }
  const id = trimmedString(payload.subscriptionId);
  const dryRun = safeBoolean(payload.dryRun);
  return {
    url,
    ...(id ? { id } : {}),
    ...(dryRun != null ? { dryRun } : {}),
  };
}

export async function forwardDodoCheckout(
  input: BillingCheckoutRequestInput,
  env: BillingProxyEnv = process.env,
): Promise<BillingCheckoutSessionResult> {
  const baseUrl = resolveBillingCloudUrl(env);
  const target = joinCloudUrl(baseUrl, '/v1/billing/dodo/create-checkout');
  const body: Record<string, unknown> = {
    tier: input.tier,
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
    ...(input.customerEmail ? { customerEmail: input.customerEmail } : {}),
  };
  const { status, payload } = await postJson(target, body, env);
  if (status < 200 || status >= 300) {
    const code = (isRecord(payload) && trimmedString(payload.error)) || `cloud_${status}`;
    const message =
      (isRecord(payload) && trimmedString(payload.message)) || `billing cloud responded ${status}`;
    throw new BillingProxyError(status >= 400 && status < 600 ? status : 502, code, message);
  }
  if (!isRecord(payload)) {
    throw new BillingProxyError(502, 'malformed_response', 'cloud did not return a dodo response');
  }
  const url = sanitizeRedirectUrl(payload.checkoutUrl);
  if (!url) {
    throw new BillingProxyError(502, 'malformed_response', 'cloud did not return a dodo checkout url');
  }
  const id = trimmedString(payload.sessionId);
  const dryRun = safeBoolean(payload.dryRun);
  return {
    url,
    ...(id ? { id } : {}),
    ...(dryRun != null ? { dryRun } : {}),
  };
}

export async function fetchBillingMe(
  env: BillingProxyEnv = process.env,
): Promise<BillingMeResult> {
  let baseUrl: URL;
  try {
    baseUrl = resolveBillingCloudUrl(env);
  } catch (error) {
    return {
      configured: true,
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
  // /v1/billing/me may not exist yet on the cloud; treat 404 as the "free"
  // baseline so the web UI can still render the plans grid + Subscribe.
  const target = joinCloudUrl(baseUrl, '/v1/billing/me');
  try {
    const { status, payload } = await getJson(target, env);
    if (status === 404 || status === 401) {
      return {
        configured: true,
        status: 'ok',
        tier: 'free',
        portalAvailable: false,
      };
    }
    if (status < 200 || status >= 300) {
      const error = (isRecord(payload) && trimmedString(payload.error)) || `cloud_${status}`;
      return { configured: true, status: 'error', error };
    }
    if (!isRecord(payload)) {
      return { configured: true, status: 'error', error: 'malformed_response' };
    }
    const tier = safeTier(payload.tier) ?? 'free';
    const seats = safeNumber(payload.seats);
    const customerId = trimmedString(payload.customerId);
    const currentPeriodEnd = safeNumber(payload.currentPeriodEnd);
    const cancelAtPeriodEnd = safeBoolean(payload.cancelAtPeriodEnd);
    const includedInputTokens = safeNumber(payload.includedInputTokens);
    const includedOutputTokens = safeNumber(payload.includedOutputTokens);
    const portalAvailable = Boolean(customerId);
    return {
      configured: true,
      status: 'ok',
      tier,
      ...(seats != null ? { seats } : {}),
      ...(customerId ? { customerId } : {}),
      ...(currentPeriodEnd != null ? { currentPeriodEnd } : {}),
      ...(cancelAtPeriodEnd != null ? { cancelAtPeriodEnd } : {}),
      ...(includedInputTokens != null ? { includedInputTokens } : {}),
      ...(includedOutputTokens != null ? { includedOutputTokens } : {}),
      portalAvailable,
    };
  } catch (error) {
    return {
      configured: true,
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Test seam: lets the test suite override the BILLING_TIMEOUT_MS budget. */
export function _billingProxyTimeoutMs(): number {
  return BILLING_TIMEOUT_MS;
}
