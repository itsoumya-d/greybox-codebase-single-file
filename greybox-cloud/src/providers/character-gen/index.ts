// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

// Character generation provider registry + factory.
//
// The registry keeps a small map of provider name -> provider instance so
// the character router can route a submit/poll call to the right provider
// without leaking concrete classes. Tests inject a stub registry with the
// mock provider; production wiring reads env vars and constructs the real
// Meshy / Tripo3D providers (plus the mock as a fallback).

import { MeshyV3Provider } from './meshy-v3.js';
import { MockCharacterGenProvider, type MockCharacterGenProviderOptions } from './mock.js';
import { Tripo3DProvider } from './tripo3d.js';
import {
  CharacterGenConfigError,
  CharacterGenInputError,
  type CharacterGenProvider,
  type CharacterGenProviderDescriptor,
} from './types.js';

export type {
  CharacterGenInput,
  CharacterGenJobStatus,
  CharacterGenProvider,
  CharacterGenProviderDescriptor,
  CharacterStyle,
  FetchLike,
} from './types.js';
export {
  CharacterGenInputError,
  CharacterGenConfigError,
  CharacterGenUpstreamError,
  parseCharacterGenInput,
  parseCharacterStyle,
} from './types.js';
export { MeshyV3Provider } from './meshy-v3.js';
export { MockCharacterGenProvider, mockJobId } from './mock.js';
export { Tripo3DProvider } from './tripo3d.js';

export interface CharacterGenRegistry {
  /** Provider invoked when the request does not name one. */
  readonly defaultProviderName: string;
  /** All registered providers by canonical name. */
  list(): CharacterGenProviderDescriptor[];
  /** Look up a provider by name; throws if missing. */
  get(name?: string): CharacterGenProvider;
  /** Whether a given provider is wired in. */
  has(name: string): boolean;
}

export interface CharacterGenRegistryOptions {
  providers?: CharacterGenProvider[];
  defaultProviderName?: string;
}

/**
 * Default in-memory registry. Holds providers by exact `provider.name`.
 *
 * Concurrency: registries are constructed once at server boot and treated
 * as immutable. Adding providers after construction is *not* supported —
 * tests should pass the full set to the constructor.
 */
export class DefaultCharacterGenRegistry implements CharacterGenRegistry {
  readonly defaultProviderName: string;
  private readonly byName = new Map<string, CharacterGenProvider>();

  constructor(options: CharacterGenRegistryOptions = {}) {
    const providers = options.providers ?? [];
    for (const provider of providers) {
      if (!provider.name) {
        throw new CharacterGenConfigError('CharacterGenProvider missing required `name`');
      }
      if (this.byName.has(provider.name)) {
        throw new CharacterGenConfigError(`duplicate provider name: ${provider.name}`);
      }
      this.byName.set(provider.name, provider);
    }
    const requestedDefault = options.defaultProviderName ?? providers[0]?.name;
    if (!requestedDefault) {
      throw new CharacterGenConfigError('CharacterGenRegistry needs at least one provider');
    }
    if (!this.byName.has(requestedDefault)) {
      throw new CharacterGenConfigError(`default provider not registered: ${requestedDefault}`);
    }
    this.defaultProviderName = requestedDefault;
  }

  list(): CharacterGenProviderDescriptor[] {
    return [...this.byName.values()].map((provider) => provider.descriptor);
  }

  get(name?: string): CharacterGenProvider {
    const key = name?.trim() || this.defaultProviderName;
    const provider = this.byName.get(key);
    if (!provider) {
      throw new CharacterGenInputError(`unknown character provider: ${key}`);
    }
    return provider;
  }

  has(name: string): boolean {
    return this.byName.has(name);
  }
}

export interface RegistryFromEnvOptions {
  /** Allow callers (tests) to override env. */
  env?: Record<string, string | undefined>;
  /** Mock-provider options for offline dev / tests. */
  mockOptions?: MockCharacterGenProviderOptions;
  /** Force include the mock even when other providers are present. */
  includeMock?: boolean;
}

/**
 * Build a registry from process.env. The mock is *always* registered so
 * callers can opt in via `?provider=mock` on the submit endpoint; this is
 * the only reliable way to support an offline development loop. Real
 * providers are wired in only when their API key is present.
 *
 * Default-provider precedence:
 *   1. GREYBOX_CHARACTER_DEFAULT_PROVIDER, if set and registered
 *   2. meshy-v3, if MESHY_API_KEY is set
 *   3. tripo3d, if TRIPO3D_API_KEY is set
 *   4. mock
 */
export function characterGenRegistryFromEnv(
  options: RegistryFromEnvOptions = {},
): DefaultCharacterGenRegistry {
  const env = options.env ?? process.env;
  const providers: CharacterGenProvider[] = [];

  const meshyKey = env.MESHY_API_KEY?.trim();
  if (meshyKey) {
    providers.push(new MeshyV3Provider({
      apiKey: meshyKey,
      ...(env.MESHY_BASE_URL ? { baseUrl: env.MESHY_BASE_URL } : {}),
    }));
  }

  const tripoKey = env.TRIPO3D_API_KEY?.trim();
  if (tripoKey) {
    providers.push(new Tripo3DProvider({
      apiKey: tripoKey,
      ...(env.TRIPO3D_BASE_URL ? { baseUrl: env.TRIPO3D_BASE_URL } : {}),
    }));
  }

  providers.push(new MockCharacterGenProvider(options.mockOptions ?? {}));

  const requestedDefault = env.GREYBOX_CHARACTER_DEFAULT_PROVIDER?.trim();
  const defaultProviderName = requestedDefault
    && providers.some((provider) => provider.name === requestedDefault)
    ? requestedDefault
    : (meshyKey ? 'meshy-v3' : (tripoKey ? 'tripo3d' : 'mock'));

  return new DefaultCharacterGenRegistry({ providers, defaultProviderName });
}
