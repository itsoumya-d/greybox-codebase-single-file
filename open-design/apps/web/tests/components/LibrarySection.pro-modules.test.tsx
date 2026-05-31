// @vitest-environment jsdom
// SPDX-License-Identifier: Apache-2.0

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';

import { LibrarySection } from '../../src/components/LibrarySection';
import { I18nProvider } from '../../src/i18n';
import { DEFAULT_CONFIG } from '../../src/state/config';
import type { AppConfig, ProModuleActivationConfigResponse } from '../../src/types';

const registryMocks = vi.hoisted(() => ({
  fetchSkills: vi.fn(),
  fetchGameArtBibles: vi.fn(),
  fetchSkill: vi.fn(),
  fetchGameArtBible: vi.fn(),
  fetchProModuleActivationConfig: vi.fn(),
  saveProModuleActivationConfig: vi.fn(),
  installSkill: vi.fn(),
  uninstallSkill: vi.fn(),
  installGameArtBible: vi.fn(),
  uninstallGameArtBible: vi.fn(),
}));

vi.mock('../../src/providers/registry', () => registryMocks);

const savedConfig: ProModuleActivationConfigResponse = {
  cloudUrl: 'https://cloud.greybox.studio',
  licenseKeyConfigured: true,
  licenseKeyMask: 'saved-greybox-license-key',
  entitlementLookupKeyConfigured: true,
  entitlementLookupKeyMask: 'saved-greybox-entitlement-lookup-key',
  entitlementLookupKeyCount: 1,
};

function Harness({ initial }: { initial?: Partial<AppConfig> }) {
  const [cfg, setCfg] = useState<AppConfig>({ ...DEFAULT_CONFIG, ...initial });
  return (
    <I18nProvider initial="en">
      <LibrarySection cfg={cfg} setCfg={setCfg} />
    </I18nProvider>
  );
}

describe('LibrarySection Pro module activation', () => {
  beforeEach(() => {
    registryMocks.fetchSkills.mockResolvedValue([]);
    registryMocks.fetchGameArtBibles.mockResolvedValue([]);
    registryMocks.fetchSkill.mockResolvedValue(null);
    registryMocks.fetchGameArtBible.mockResolvedValue(null);
    registryMocks.fetchProModuleActivationConfig.mockResolvedValue(savedConfig);
    registryMocks.saveProModuleActivationConfig.mockResolvedValue(savedConfig);
    registryMocks.installSkill.mockResolvedValue({ skill: {} });
    registryMocks.uninstallSkill.mockResolvedValue({ ok: true });
    registryMocks.installGameArtBible.mockResolvedValue({ gameArtBible: {} });
    registryMocks.uninstallGameArtBible.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('loads masked activation settings and preserves them when saved', async () => {
    render(<Harness />);

    await waitFor(() => {
      expect((screen.getByLabelText('License key') as HTMLInputElement).value).toBe(
        'saved-greybox-license-key',
      );
    });

    expect(screen.getByText('License saved')).toBeTruthy();
    expect(screen.getByText('1 entitlement key')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Save activation' }));

    await waitFor(() => {
      expect(registryMocks.saveProModuleActivationConfig).toHaveBeenCalledWith({
        cloudUrl: 'https://cloud.greybox.studio',
        licenseKey: 'saved-greybox-license-key',
        entitlementLookupKey: 'saved-greybox-entitlement-lookup-key',
      });
    });
    expect(screen.queryByText(/closed payload/u)).toBeNull();
  });

  it('clears Pro activation keys only through the explicit clear action', async () => {
    registryMocks.saveProModuleActivationConfig.mockResolvedValue({
      cloudUrl: 'https://cloud.greybox.studio',
      licenseKeyConfigured: false,
      licenseKeyMask: '',
      entitlementLookupKeyConfigured: false,
      entitlementLookupKeyMask: '',
      entitlementLookupKeyCount: 0,
    } satisfies ProModuleActivationConfigResponse);

    render(<Harness />);

    await waitFor(() => {
      expect(screen.getByText('License saved')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clear keys' }));

    await waitFor(() => {
      expect(registryMocks.saveProModuleActivationConfig).toHaveBeenCalledWith({
        cloudUrl: 'https://cloud.greybox.studio',
        clearLicenseKey: true,
        clearEntitlementLookupKeys: true,
      });
    });
    expect(screen.getByText('License missing')).toBeTruthy();
    expect(screen.getByText('No entitlement key')).toBeTruthy();
  });
});
