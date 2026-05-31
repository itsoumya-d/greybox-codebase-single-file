// Tiny URL router. We avoid pulling in react-router for two reasons:
// the surface area we need is small (three routes, plain pushState), and
// we want a single source of truth for "what file is open" — encoding
// that in the URL is the simplest way to make it deep-linkable.

import { useEffect, useState } from 'react';
import { WIZARD_STEPS } from './components/GameDesignWizard/useWizardState';
import type { WizardStep } from './components/GameDesignWizard/useWizardState';

export type Route =
  | { kind: 'home' }
  | { kind: 'billing' }
  | { kind: 'project'; projectId: string; fileName: string | null }
  | { kind: 'wizard'; projectId: string; step: WizardStep };

export function parseRoute(pathname: string): Route {
  const parts = pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  if (parts.length === 0) return { kind: 'home' };
  if (parts[0] === 'billing') return { kind: 'billing' };
  if (parts[0] === 'projects' && parts[1]) {
    const projectId = decodeURIComponent(parts[1]);
    if (parts[2] === 'wizard') {
      const rawStep = decodeURIComponent(parts[3] ?? '');
      const step = (WIZARD_STEPS as readonly string[]).includes(rawStep)
        ? (rawStep as WizardStep)
        : 'concept';
      return { kind: 'wizard', projectId, step };
    }
    if (parts[2] === 'files' && parts[3]) {
      return {
        kind: 'project',
        projectId,
        fileName: decodeURIComponent(parts.slice(3).join('/')),
      };
    }
    return { kind: 'project', projectId, fileName: null };
  }
  return { kind: 'home' };
}

export function buildPath(route: Route): string {
  if (route.kind === 'billing') return '/billing';
  if (route.kind === 'home') return '/';
  const id = encodeURIComponent(route.projectId);
  if (route.kind === 'wizard') {
    return `/projects/${id}/wizard/${encodeURIComponent(route.step)}`;
  }
  if (route.fileName) {
    const file = route.fileName
      .split('/')
      .map((s) => encodeURIComponent(s))
      .join('/');
    return `/projects/${id}/files/${file}`;
  }
  return `/projects/${id}`;
}

// Centralized navigation. Callers use this instead of mutating
// `window.location` directly so we can fan the change out to any
// `useRoute()` subscriber via a custom event.
export function navigate(route: Route, opts: { replace?: boolean } = {}): void {
  const target = buildPath(route);
  const current = window.location.pathname;
  if (target === current) return;
  if (opts.replace) {
    window.history.replaceState(null, '', target);
  } else {
    window.history.pushState(null, '', target);
  }
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));
  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  return route;
}
