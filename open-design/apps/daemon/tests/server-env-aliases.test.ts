import { describe, expect, it } from 'vitest';
import {
  getPublicBaseUrl,
  resolveChatRunInactivityTimeoutMs,
  resolveChatRunShutdownGraceMs,
  resolveProModuleEntitlementLookupKeysFromEnv,
  resolveServerBindHost,
} from '../src/server.js';

describe('daemon environment alias resolution', () => {
  it('keeps AGDS chat-run timing as the canonical override', () => {
    expect(resolveChatRunInactivityTimeoutMs({
      AGDS_CHAT_RUN_INACTIVITY_TIMEOUT_MS: '2500',
      OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS: '100',
    } as NodeJS.ProcessEnv)).toBe(2500);
    expect(resolveChatRunShutdownGraceMs({
      AGDS_CHAT_RUN_SHUTDOWN_GRACE_MS: '400',
      OD_CHAT_RUN_SHUTDOWN_GRACE_MS: '100',
    } as NodeJS.ProcessEnv)).toBe(400);
  });

  it('ignores deprecated OD chat-run timing fallbacks', () => {
    expect(resolveChatRunInactivityTimeoutMs({
      AGDS_CHAT_RUN_INACTIVITY_TIMEOUT_MS: ' ',
      OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS: '100',
    } as NodeJS.ProcessEnv)).toBe(600_000);
    expect(resolveChatRunShutdownGraceMs({
      OD_CHAT_RUN_SHUTDOWN_GRACE_MS: '75',
    } as NodeJS.ProcessEnv)).toBe(3_000);
  });

  it('does not let OD override an invalid AGDS value', () => {
    expect(resolveChatRunInactivityTimeoutMs({
      AGDS_CHAT_RUN_INACTIVITY_TIMEOUT_MS: 'invalid',
      OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS: '100',
    } as NodeJS.ProcessEnv)).toBe(600_000);
  });

  it('resolves the studio bind host through AGDS only', () => {
    expect(resolveServerBindHost({
      AGDS_BIND_HOST: ' 0.0.0.0 ',
      OD_BIND_HOST: '127.0.0.2',
    } as NodeJS.ProcessEnv)).toBe('0.0.0.0');
    expect(resolveServerBindHost({
      AGDS_BIND_HOST: '',
      OD_BIND_HOST: '127.0.0.2',
    } as NodeJS.ProcessEnv)).toBe('127.0.0.1');
  });

  it('resolves public base URL and fallback port through AGDS only', () => {
    const req = {
      protocol: 'https',
      get: (_name: string) => undefined,
    };

    expect(getPublicBaseUrl(req, {
      AGDS_PUBLIC_BASE_URL: ' https://studio.example.com/path/ ',
      OD_PUBLIC_BASE_URL: 'https://legacy.example.com',
      AGDS_PORT: '17800',
      OD_PORT: '17900',
    } as NodeJS.ProcessEnv)).toBe('https://studio.example.com/path');

    expect(getPublicBaseUrl(req, {
      OD_PUBLIC_BASE_URL: 'https://legacy.example.com',
      OD_PORT: '17900',
    } as NodeJS.ProcessEnv)).toBe('http://localhost:7456');

    expect(getPublicBaseUrl(req, {
      AGDS_PORT: '17800',
      OD_PORT: '17900',
    } as NodeJS.ProcessEnv)).toBe('http://localhost:17800');
  });

  it('resolves Pro module entitlement lookup keys for cloud activation', () => {
    expect(resolveProModuleEntitlementLookupKeysFromEnv({
      AGDS_PRO_MODULE_ENTITLEMENT_LOOKUP_KEYS_JSON: JSON.stringify({
        'soulslike-combat-pack': 'gbx_studio-buyer_soulslike-combat-pack_aaaaaaaaaaaa',
      }),
      AGDS_PRO_MODULE_ENTITLEMENT_LOOKUP_KEY: 'gbx_global_lookup',
    } as NodeJS.ProcessEnv)).toEqual({
      'soulslike-combat-pack': 'gbx_studio-buyer_soulslike-combat-pack_aaaaaaaaaaaa',
      '*': 'gbx_global_lookup',
    });
  });
});
