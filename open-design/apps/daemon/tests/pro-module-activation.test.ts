// SPDX-License-Identifier: Apache-2.0

import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_GREYBOX_CLOUD_URL,
  SAVED_PRO_MODULE_ENTITLEMENT_LOOKUP_KEY_MASK,
  SAVED_PRO_MODULE_LICENSE_KEY_MASK,
  readProModuleActivationConfig,
  readPublicProModuleActivationConfig,
  writeProModuleActivationConfig,
} from '../src/pro-module-activation.js';

async function tempDataDir() {
  return mkdtemp(path.join(tmpdir(), 'agds-pro-module-activation-'));
}

describe('Pro module activation config', () => {
  it('returns a masked public config and stores private fields chmod 600', async () => {
    const dataDir = await tempDataDir();

    const publicConfig = await writeProModuleActivationConfig(dataDir, {
      cloudUrl: 'https://cloud.greybox.studio/',
      licenseKey: 'gbx_indie_test_123',
      entitlementLookupKey: 'gbx_studio-buyer_soulslike-combat-pack_aaaaaaaaaaaa',
    });

    expect(publicConfig).toEqual({
      cloudUrl: 'https://cloud.greybox.studio',
      licenseKeyConfigured: true,
      licenseKeyMask: SAVED_PRO_MODULE_LICENSE_KEY_MASK,
      entitlementLookupKeyConfigured: true,
      entitlementLookupKeyMask: SAVED_PRO_MODULE_ENTITLEMENT_LOOKUP_KEY_MASK,
      entitlementLookupKeyCount: 1,
    });
    expect(await readProModuleActivationConfig(dataDir)).toMatchObject({
      cloudUrl: 'https://cloud.greybox.studio',
      licenseKey: 'gbx_indie_test_123',
      entitlementLookupKeys: {
        '*': 'gbx_studio-buyer_soulslike-combat-pack_aaaaaaaaaaaa',
      },
    });
    expect((await stat(path.join(dataDir, 'pro-module-activation.json'))).mode & 0o777).toBe(0o600);
  });

  it('preserves masked values and supports explicit clears', async () => {
    const dataDir = await tempDataDir();
    await writeProModuleActivationConfig(dataDir, {
      licenseKey: 'gbx_indie_test_123',
      entitlementLookupKey: 'gbx_studio-buyer_soulslike-combat-pack_aaaaaaaaaaaa',
    });

    await writeProModuleActivationConfig(dataDir, {
      cloudUrl: 'http://localhost:8787',
      licenseKey: SAVED_PRO_MODULE_LICENSE_KEY_MASK,
      entitlementLookupKey: SAVED_PRO_MODULE_ENTITLEMENT_LOOKUP_KEY_MASK,
    });
    expect(await readProModuleActivationConfig(dataDir)).toMatchObject({
      cloudUrl: 'http://localhost:8787',
      licenseKey: 'gbx_indie_test_123',
      entitlementLookupKeys: {
        '*': 'gbx_studio-buyer_soulslike-combat-pack_aaaaaaaaaaaa',
      },
    });

    const cleared = await writeProModuleActivationConfig(dataDir, {
      clearLicenseKey: true,
      clearEntitlementLookupKeys: true,
    });
    expect(cleared.licenseKeyConfigured).toBe(false);
    expect(cleared.entitlementLookupKeyConfigured).toBe(false);
  });

  it('fails closed on malformed config and unsafe activation values', async () => {
    const dataDir = await tempDataDir();
    await mkdir(dataDir, { recursive: true });
    await writeFile(path.join(dataDir, 'pro-module-activation.json'), '{ bad json', 'utf8');

    expect(await readPublicProModuleActivationConfig(dataDir)).toMatchObject({
      cloudUrl: DEFAULT_GREYBOX_CLOUD_URL,
      licenseKeyConfigured: false,
      entitlementLookupKeyConfigured: false,
    });

    await writeProModuleActivationConfig(dataDir, {
      cloudUrl: 'http://evil.example.test',
      licenseKey: 'x'.repeat(300),
      entitlementLookupKey: 'not-a-greybox-key',
    });
    const raw = await readFile(path.join(dataDir, 'pro-module-activation.json'), 'utf8');
    expect(raw).not.toContain('evil.example');
    expect(await readProModuleActivationConfig(dataDir)).toEqual({
      cloudUrl: '',
      licenseKey: '',
      entitlementLookupKeys: {},
    });
  });
});
