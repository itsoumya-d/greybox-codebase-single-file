// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

/**
 * Auth helpers for the marketplace web app.
 *
 * The web app uses an httpOnly cookie `gb_mkt_session` set by the proxy when
 * the user authenticates. For now this is a thin shim that pulls the actor's
 * ID (creator or buyer) from the session cookie or from a header set by the
 * Next.js proxy. SSO integration will replace this once the auth service is
 * available across all Greybox properties.
 *
 * The admin bearer token never lands in client code; the proxy injects it
 * server-side from `GREYBOX_MARKETPLACE_ADMIN_TOKEN`.
 */

import { cookies, headers } from 'next/headers';

export interface SessionActor {
  id: string;
  role: 'guest' | 'buyer' | 'creator' | 'admin';
  displayName?: string;
}

const SESSION_COOKIE = 'gb_mkt_session';
const ROLE_HEADER = 'x-greybox-marketplace-role';
const ACTOR_HEADER = 'x-greybox-marketplace-actor';

export async function getSessionActor(): Promise<SessionActor> {
  // headers() and cookies() are async in Next.js 15.
  const headerList = await headers();
  const headerRole = headerList.get(ROLE_HEADER) as SessionActor['role'] | null;
  const headerActor = headerList.get(ACTOR_HEADER);
  if (headerActor && headerRole) {
    return { id: headerActor, role: headerRole };
  }

  const cookieJar = await cookies();
  const raw = cookieJar.get(SESSION_COOKIE)?.value;
  if (!raw) return { id: 'guest', role: 'guest' };
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as SessionActor;
    if (parsed && typeof parsed.id === 'string' && typeof parsed.role === 'string') return parsed;
  } catch {
    // Fall through to guest.
  }
  return { id: 'guest', role: 'guest' };
}

export function isAdmin(actor: SessionActor): boolean {
  return actor.role === 'admin';
}

export function isCreator(actor: SessionActor): boolean {
  return actor.role === 'creator' || actor.role === 'admin';
}

export function isBuyer(actor: SessionActor): boolean {
  return actor.role === 'buyer' || actor.role === 'admin';
}
