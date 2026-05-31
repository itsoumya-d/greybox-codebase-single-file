// @vitest-environment jsdom
// SPDX-License-Identifier: Apache-2.0

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProjectActionsToolbar } from '../../src/components/ProjectActionsToolbar';
import type { ProjectProModulesResponse } from '../../src/types';

afterEach(() => {
  cleanup();
});

const gameDesignDocState = {
  exists: true,
  isStale: false,
  staleReason: null,
} as const;

const proModules: ProjectProModulesResponse = {
  projectId: 'project-1',
  trustedKeyCount: 1,
  modules: [
    {
      fileName: 'soulslike.gbpro',
      status: 'licensed',
      mountCount: 1,
      payloadSha256: 'a'.repeat(64),
      signature: { algorithm: 'ed25519', keyId: 'greybox-test' },
      manifest: {
        id: 'soulslike-combat-pack',
        name: 'Soulslike Combat Pack',
        version: '1.0.0',
        mounts: { skills: [{ kind: 'skill', id: 'soulslike-combat' }] },
      },
      mounted: {
        skills: [{ kind: 'skill', id: 'soulslike-combat' }],
        gameArtBibles: [],
        engineTargets: [],
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
    { fileName: 'tampered.gbpro', code: 'PRO_MODULE_SIGNATURE_INVALID', message: 'invalid signature' },
  ],
};

const proModulesNeedingLicense: ProjectProModulesResponse = {
  ...proModules,
  modules: [
    ...proModules.modules,
    {
      fileName: 'hero.gbpro',
      status: 'license-required',
      mountCount: 1,
      payloadSha256: 'b'.repeat(64),
      signature: { algorithm: 'ed25519', keyId: 'greybox-test' },
      manifest: {
        id: 'hero-shooter-toolkit',
        name: 'Hero Shooter Toolkit',
        version: '1.0.0',
        mounts: { skills: [{ kind: 'skill', id: 'hero-shooter' }] },
      },
    },
  ],
};

describe('ProjectActionsToolbar Pro modules', () => {
  it('mounts project Pro module status beside the project actions', () => {
    render(
      <ProjectActionsToolbar
        gameDesignDocState={gameDesignDocState}
        finalizeStatus="idle"
        onFinalize={vi.fn()}
        onCancelFinalize={vi.fn()}
        onContinueInCli={vi.fn()}
        enginePackageExportEngine="unity"
        enginePackageExportStatus={null}
        onEnginePackageExportEngineChange={vi.fn()}
        onExportEnginePackage={vi.fn()}
        proModules={proModules}
      />,
    );

    expect(screen.getByRole('toolbar', { name: /project actions/i })).toBeTruthy();
    expect(screen.getByTestId('project-pro-modules-status').textContent).toContain('Pro');
    expect(screen.getByText('1 licensed')).toBeTruthy();
    expect(screen.getByText('1 engine target')).toBeTruthy();
    expect(screen.getByText('1 blocked')).toBeTruthy();
  });

  it('does not render the Pro status when no project bundles exist', () => {
    render(
      <ProjectActionsToolbar
        gameDesignDocState={gameDesignDocState}
        finalizeStatus="idle"
        onFinalize={vi.fn()}
        onCancelFinalize={vi.fn()}
        onContinueInCli={vi.fn()}
        enginePackageExportEngine="unity"
        enginePackageExportStatus={null}
        onEnginePackageExportEngineChange={vi.fn()}
        onExportEnginePackage={vi.fn()}
        proModules={null}
      />,
    );

    expect(screen.queryByTestId('project-pro-modules-status')).toBeNull();
  });

  it('routes license-required Pro bundles to the activation handoff', () => {
    const onActivateProModules = vi.fn();
    render(
      <ProjectActionsToolbar
        gameDesignDocState={gameDesignDocState}
        finalizeStatus="idle"
        onFinalize={vi.fn()}
        onCancelFinalize={vi.fn()}
        onContinueInCli={vi.fn()}
        enginePackageExportEngine="unity"
        enginePackageExportStatus={null}
        onEnginePackageExportEngineChange={vi.fn()}
        onExportEnginePackage={vi.fn()}
        proModules={proModulesNeedingLicense}
        onActivateProModules={onActivateProModules}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /activate pro module licenses/i }));
    expect(onActivateProModules).toHaveBeenCalledTimes(1);
  });

  it('routes selected engine package exports from the project toolbar', () => {
    const onExportEnginePackage = vi.fn();
    const onEnginePackageExportEngineChange = vi.fn();
    const view = render(
      <ProjectActionsToolbar
        gameDesignDocState={gameDesignDocState}
        finalizeStatus="idle"
        onFinalize={vi.fn()}
        onCancelFinalize={vi.fn()}
        onContinueInCli={vi.fn()}
        enginePackageExportEngine="unity"
        enginePackageExportStatus={null}
        enginePackageExportPreflight={{ status: 'ready', fileCount: 5, packageFileName: 'unity.zip', sizeBytes: 2048 }}
        onEnginePackageExportEngineChange={onEnginePackageExportEngineChange}
        onExportEnginePackage={onExportEnginePackage}
        proModules={null}
      />,
    );

    fireEvent.change(screen.getByLabelText('Engine package target'), {
      target: { value: 'unreal' },
    });
    expect(onEnginePackageExportEngineChange).toHaveBeenCalledWith('unreal');

    view.rerender(
      <ProjectActionsToolbar
        gameDesignDocState={gameDesignDocState}
        finalizeStatus="idle"
        onFinalize={vi.fn()}
        onCancelFinalize={vi.fn()}
        onContinueInCli={vi.fn()}
        enginePackageExportEngine="unreal"
        enginePackageExportStatus={null}
        enginePackageExportPreflight={{ status: 'ready', fileCount: 5, packageFileName: 'unreal.zip', sizeBytes: 2048 }}
        onEnginePackageExportEngineChange={onEnginePackageExportEngineChange}
        onExportEnginePackage={onExportEnginePackage}
        proModules={null}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /export unreal engine package/i }));

    expect(onExportEnginePackage).toHaveBeenCalledWith('unreal');
    expect(screen.getByText('5 files - 2.0 KB')).toBeTruthy();
  });

  it('locks the engine package export control while a package is downloading', () => {
    render(
      <ProjectActionsToolbar
        gameDesignDocState={gameDesignDocState}
        finalizeStatus="idle"
        onFinalize={vi.fn()}
        onCancelFinalize={vi.fn()}
        onContinueInCli={vi.fn()}
        enginePackageExportEngine="unity"
        enginePackageExportStatus="godot"
        onEnginePackageExportEngineChange={vi.fn()}
        onExportEnginePackage={vi.fn()}
        proModules={null}
      />,
    );

    expect(screen.getByLabelText('Engine package target')).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: /exporting godot engine package/i })).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.getByText('Exporting Godot...')).toBeTruthy();
  });

  it('disables engine package export when the project has no viewport source', () => {
    const onExportEnginePackage = vi.fn();
    render(
      <ProjectActionsToolbar
        gameDesignDocState={gameDesignDocState}
        finalizeStatus="idle"
        onFinalize={vi.fn()}
        onCancelFinalize={vi.fn()}
        onContinueInCli={vi.fn()}
        enginePackageExportEngine="unity"
        enginePackageExportStatus={null}
        enginePackageExportDisabledReason="No .gameview.json"
        onEnginePackageExportEngineChange={vi.fn()}
        onExportEnginePackage={onExportEnginePackage}
        proModules={null}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /export unity engine package/i }));

    expect(screen.getByText('No .gameview.json')).toBeTruthy();
    expect(screen.getByRole('button', { name: /export unity engine package/i })).toHaveProperty(
      'disabled',
      true,
    );
    expect(onExportEnginePackage).not.toHaveBeenCalled();
  });

  it('blocks export while daemon preflight is checking or failed', () => {
    const { rerender } = render(
      <ProjectActionsToolbar
        gameDesignDocState={gameDesignDocState}
        finalizeStatus="idle"
        onFinalize={vi.fn()}
        onCancelFinalize={vi.fn()}
        onContinueInCli={vi.fn()}
        enginePackageExportEngine="godot"
        enginePackageExportStatus={null}
        enginePackageExportPreflight={{ status: 'loading' }}
        onEnginePackageExportEngineChange={vi.fn()}
        onExportEnginePackage={vi.fn()}
        proModules={null}
      />,
    );

    expect(screen.getByRole('button', { name: /export godot engine package/i })).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.getAllByText('Checking...').length).toBeGreaterThan(0);

    rerender(
      <ProjectActionsToolbar
        gameDesignDocState={gameDesignDocState}
        finalizeStatus="idle"
        onFinalize={vi.fn()}
        onCancelFinalize={vi.fn()}
        onContinueInCli={vi.fn()}
        enginePackageExportEngine="godot"
        enginePackageExportStatus={null}
        enginePackageExportPreflight={{ status: 'error', message: 'bad viewport' }}
        onEnginePackageExportEngineChange={vi.fn()}
        onExportEnginePackage={vi.fn()}
        proModules={null}
      />,
    );

    expect(screen.getByText('Package unavailable')).toHaveProperty('title', 'bad viewport');
    expect(screen.getByRole('button', { name: /export godot engine package/i })).toHaveProperty(
      'disabled',
      true,
    );
  });
});
