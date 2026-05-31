import { describe, expect, it } from 'vitest';
import {
  APP_VERSION_FALLBACK,
  isPackagedRuntime,
  resolveAppVersionInfo,
} from '../src/app-version.js';

describe('app version helpers', () => {
  it('resolves version info from package metadata', () => {
    expect(resolveAppVersionInfo({
      packageMetadata: { version: '1.2.3' },
      env: {},
      resourcesPath: undefined,
      execPath: '/usr/local/bin/node',
      platform: 'linux',
      arch: 'x64',
    })).toEqual({
      version: '1.2.3',
      channel: 'development',
      packaged: false,
      platform: 'linux',
      arch: 'x64',
    });
  });

  it('uses a safe fallback when package metadata is missing', () => {
    expect(resolveAppVersionInfo({ packageMetadata: null, env: {} }).version).toBe(APP_VERSION_FALLBACK);
  });

  it('prefers packaged studio version metadata from the environment', () => {
    expect(resolveAppVersionInfo({
      packageMetadata: { version: '0.3.0' },
      env: { AGDS_APP_VERSION: '0.3.1-beta.1' },
      resourcesPath: '/Applications/AI Game Design Studio.app/Contents/Resources',
      execPath: '/Applications/AI Game Design Studio.app/Contents/Resources/agds/bin/node',
      platform: 'darwin',
      arch: 'arm64',
    })).toEqual({
      version: '0.3.1-beta.1',
      channel: 'beta',
      packaged: true,
      platform: 'darwin',
      arch: 'arm64',
    });
  });

  it('ignores deprecated packaged version metadata aliases', () => {
    expect(resolveAppVersionInfo({
      packageMetadata: { version: '0.3.0' },
      env: {
        AGDS_APP_VERSION: '0.4.0-beta.2',
        OD_APP_VERSION: '0.3.1-beta.1',
        AGDS_RELEASE_CHANNEL: 'canary',
        OD_RELEASE_CHANNEL: 'legacy-beta',
      },
      resourcesPath: '/Applications/AI Game Design Studio.app/Contents/Resources',
      execPath: '/Applications/AI Game Design Studio.app/Contents/Resources/agds/bin/node',
      platform: 'darwin',
      arch: 'arm64',
    })).toMatchObject({
      version: '0.4.0-beta.2',
      channel: 'canary',
      packaged: true,
    });
    expect(resolveAppVersionInfo({
      packageMetadata: { version: '0.3.0' },
      env: {
        OD_APP_VERSION: '0.3.1-beta.1',
        OD_RELEASE_CHANNEL: 'legacy-beta',
      },
    })).toMatchObject({
      version: '0.3.0',
      channel: 'development',
    });
  });

  it('detects packaged runtimes without sidecar protocol knowledge', () => {
    expect(isPackagedRuntime({ resourcesPath: '/Applications/AI Game Design Studio.app/Contents/Resources' })).toBe(true);
    expect(isPackagedRuntime({
      execPath: '/Applications/AI Game Design Studio.app/Contents/Resources/agds/bin/node',
      platform: 'darwin',
    })).toBe(true);
    expect(isPackagedRuntime({
      execPath: 'C:\\Users\\Ada\\AppData\\Local\\Programs\\AI Game Design Studio\\resources\\agds\\bin\\node.exe',
      platform: 'win32',
    })).toBe(true);
    expect(isPackagedRuntime({
      execPath: '/opt/AI Game Design Studio/resources/agds/bin/node',
      platform: 'linux',
    })).toBe(true);
    expect(isPackagedRuntime({ execPath: '/usr/local/bin/node', platform: 'linux' })).toBe(false);
  });

  it('honors an explicit release channel', () => {
    expect(resolveAppVersionInfo({
      packageMetadata: { version: '1.2.3' },
      env: { AGDS_RELEASE_CHANNEL: 'beta' },
    }).channel).toBe('beta');
  });

  it('infers prerelease channel from semver metadata', () => {
    expect(resolveAppVersionInfo({
      packageMetadata: { version: '0.1.0-beta.6' },
      env: {},
    }).channel).toBe('beta');
  });
});
