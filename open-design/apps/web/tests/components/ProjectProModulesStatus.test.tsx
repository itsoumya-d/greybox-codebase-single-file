// @vitest-environment jsdom
// SPDX-License-Identifier: Apache-2.0

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProjectProModulesStatus } from '../../src/components/ProjectProModulesStatus';
import type { ProjectProModulesResponse } from '../../src/types';

function response(overrides: Partial<ProjectProModulesResponse> = {}): ProjectProModulesResponse {
  return {
    projectId: 'project-1',
    trustedKeyCount: 1,
    modules: [
      {
        fileName: 'soulslike.gbpro',
        status: 'licensed',
        mountCount: 3,
        payloadSha256: 'a'.repeat(64),
        signature: { algorithm: 'ed25519', keyId: 'greybox-test' },
        manifest: {
          id: 'soulslike-combat-pack',
          name: 'Soulslike Combat Pack',
          version: '1.0.0',
          mounts: {
            skills: [{ kind: 'skill', id: 'soulslike-combat' }],
          },
        },
        mounted: {
          skills: [{ kind: 'skill', id: 'soulslike-combat' }],
          gameArtBibles: [],
          engineTargets: [],
        },
      },
      {
        fileName: 'hero.gbpro',
        status: 'license-required',
        mountCount: 3,
        payloadSha256: 'b'.repeat(64),
        signature: { algorithm: 'ed25519', keyId: 'greybox-test' },
        manifest: {
          id: 'hero-shooter-toolkit',
          name: 'Hero Shooter Toolkit',
          version: '1.0.0',
          mounts: {
            skills: [{ kind: 'skill', id: 'hero-shooter' }],
          },
        },
      },
    ],
    registries: {
      skills: [],
      gameArtBibles: [],
      engineTargets: [
        {
          kind: 'engine-target',
          id: 'soulslike-unity-target',
          source: 'pro-module',
          moduleId: 'soulslike-combat-pack',
          moduleName: 'Soulslike Combat Pack',
          moduleVersion: '1.0.0',
          fileName: 'soulslike.gbpro',
          digestSha256: 'c'.repeat(64),
          title: 'Soulslike Unity Target',
        },
      ],
    },
    rejected: [
      { fileName: 'tampered.gbpro', code: 'PRO_MODULE_PAYLOAD_DIGEST_MISMATCH', message: 'tampered' },
    ],
    ...overrides,
  };
}

describe('ProjectProModulesStatus', () => {
  it('summarizes licensed, license-required, and blocked Pro bundles without payload bodies', () => {
    render(<ProjectProModulesStatus response={response()} />);

    expect(screen.getByTestId('project-pro-modules-status').textContent).toContain('Pro');
    expect(screen.getByText('1 licensed')).toBeTruthy();
    expect(screen.getByText('1 needs license')).toBeTruthy();
    expect(screen.getByText('1 engine target')).toBeTruthy();
    expect(screen.getByText('1 blocked')).toBeTruthy();
    expect(screen.queryByText(/closed payload/u)).toBeNull();
  });

  it('offers an explicit activation handoff for license-required bundles', () => {
    const onActivate = vi.fn();
    render(<ProjectProModulesStatus response={response()} onActivate={onActivate} />);

    const activate = screen.getByRole('button', { name: /activate pro module licenses/i });
    expect(activate.getAttribute('title')).toContain('Hero Shooter Toolkit');

    fireEvent.click(activate);
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/closed payload/u)).toBeNull();
  });

  it('stays hidden when there are no project-local Pro bundles', () => {
    const { container } = render(<ProjectProModulesStatus response={response({
      modules: [],
      registries: { skills: [], gameArtBibles: [], engineTargets: [] },
      rejected: [],
    })} />);
    expect(container.textContent).toBe('');
  });
});
