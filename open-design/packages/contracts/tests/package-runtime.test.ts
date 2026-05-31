import { readFileSync } from 'node:fs';
import { access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function readPackageJson(): {
  exports?: Record<string, { default?: string; types?: string }>;
  files?: string[];
  main?: string;
  types?: string;
} {
  return JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
}

function packagePath(target: string): string {
  return join(packageRoot, target.replace(/^\.\//, ''));
}

describe('@ai-game-design-studio/contracts package runtime shape', () => {
  it('exports built JavaScript instead of TypeScript source files', () => {
    const pkg = readPackageJson();

    expect(pkg.main).toBe('./dist/index.mjs');
    expect(pkg.types).toBe('./dist/index.d.ts');
    expect(pkg.files).toEqual(['dist']);
    expect(pkg.exports?.['.']?.default).toBe('./dist/index.mjs');
    expect(pkg.exports?.['.']?.types).toBe('./dist/index.d.ts');
    expect(pkg.exports?.['./api/connectionTest']?.default).toBe('./dist/api/connectionTest.mjs');
    expect(pkg.exports?.['./api/connectionTest']?.types).toBe('./dist/api/connectionTest.d.ts');
    expect(pkg.exports?.['./api/projects']?.default).toBe('./dist/api/projects.mjs');
    expect(pkg.exports?.['./api/projects']?.types).toBe('./dist/api/projects.d.ts');
    expect(pkg.exports?.['./api/files']?.default).toBe('./dist/api/files.mjs');
    expect(pkg.exports?.['./api/files']?.types).toBe('./dist/api/files.d.ts');
    expect(pkg.exports?.['./game-telemetry-sdk']?.default).toBe('./dist/game-telemetry-sdk.mjs');
    expect(pkg.exports?.['./game-telemetry-sdk']?.types).toBe('./dist/game-telemetry-sdk.d.ts');
    expect(pkg.exports?.['./api/research']?.default).toBe('./dist/api/research.mjs');
    expect(pkg.exports?.['./api/research']?.types).toBe('./dist/api/research.d.ts');
    expect(pkg.exports?.['./api/pro-modules']?.default).toBe('./dist/api/pro-modules.mjs');
    expect(pkg.exports?.['./api/pro-modules']?.types).toBe('./dist/api/pro-modules.d.ts');
    expect(pkg.exports?.['./media/models']?.default).toBe('./dist/media/models.mjs');
    expect(pkg.exports?.['./media/models']?.types).toBe('./dist/media/models.d.ts');
    expect(pkg.exports?.['./prompts/system']?.default).toBe('./dist/prompts/system.mjs');
    expect(pkg.exports?.['./prompts/system']?.types).toBe('./dist/prompts/system.d.ts');
    expect(pkg.exports?.['./prompts/discovery']?.default).toBe('./dist/prompts/discovery.mjs');
    expect(pkg.exports?.['./prompts/discovery']?.types).toBe('./dist/prompts/discovery.d.ts');
    expect(pkg.exports?.['./prompts/directions']?.default).toBe('./dist/prompts/directions.mjs');
    expect(pkg.exports?.['./prompts/directions']?.types).toBe('./dist/prompts/directions.d.ts');
    expect(pkg.exports?.['./prompts/media-contract']?.default).toBe('./dist/prompts/media-contract.mjs');
    expect(pkg.exports?.['./prompts/media-contract']?.types).toBe('./dist/prompts/media-contract.d.ts');
    expect(pkg.exports?.['./critique']?.default).toBe('./dist/critique.mjs');
    expect(pkg.exports?.['./critique']?.types).toBe('./dist/critique.d.ts');
  });

  it('points every runtime export at generated files', async () => {
    const pkg = readPackageJson();
    const exports = Object.entries(pkg.exports ?? {});

    expect(exports.length).toBeGreaterThan(0);
    for (const [_name, target] of exports) {
      expect(target.default).toMatch(/^\.\/dist\/.+\.mjs$/);
      expect(target.types).toMatch(/^\.\/dist\/.+\.d\.ts$/);
      await expect(access(packagePath(target.default!))).resolves.toBeUndefined();
      await expect(access(packagePath(target.types!))).resolves.toBeUndefined();
    }
  });

  it('makes runtime exports importable through package exports', async () => {
    const contracts = await import('@ai-game-design-studio/contracts');
    const connectionTest = await import('@ai-game-design-studio/contracts/api/connectionTest');
    const projects = await import('@ai-game-design-studio/contracts/api/projects');
    const files = await import('@ai-game-design-studio/contracts/api/files');
    const telemetrySdk = await import('@ai-game-design-studio/contracts/game-telemetry-sdk');
    const mediaModels = await import('@ai-game-design-studio/contracts/media/models');
    const mediaContract = await import('@ai-game-design-studio/contracts/prompts/media-contract');
    const promptsSystem = await import('@ai-game-design-studio/contracts/prompts/system');
    const discovery = await import('@ai-game-design-studio/contracts/prompts/discovery');
    const directions = await import('@ai-game-design-studio/contracts/prompts/directions');
    const research = await import('@ai-game-design-studio/contracts/api/research');
    const proModules = await import('@ai-game-design-studio/contracts/api/pro-modules');
    const critique = await import('@ai-game-design-studio/contracts/critique');

    expect(contracts.composeSystemPrompt).toEqual(expect.any(Function));
    expect(contracts.derivePreflight).toEqual(expect.any(Function));
    expect(contracts.renderMetadataBlock).toEqual(expect.any(Function));
    expect(contracts.renderPersistentGameMemoryBlock).toEqual(expect.any(Function));
    expect(contracts.renderGameStudioCollaborationHandoffs).toEqual(expect.any(Function));
    expect(contracts.gameStudioDocumentSchema).toEqual(expect.any(Object));
    expect(contracts.gameMemoryEntitySchema).toEqual(expect.any(Object));
    const basePrompt = contracts.composeSystemPrompt({});
    expect(basePrompt).toContain('Studio collaboration handoffs');
    expect(basePrompt).toContain('"id": "playerMode"');
    expect(basePrompt).toContain('"id": "monetization"');
    expect(basePrompt).toContain('"id": "inspirations"');
    expect(basePrompt).toContain('"Session length / audience age / emotional goal"');
    expect(basePrompt).toContain('"PC / desktop"');
    expect(basePrompt).toContain('"Console"');
    expect(basePrompt).toContain('survival_system');
    expect(basePrompt).toContain('difficulty_director');
    expect(basePrompt).toContain('companion_system');
    const promptWithCraft = contracts.composeSystemPrompt({
      gameArtBibleBody: '# Arcade Neon\nuse neon faction colors',
      craftSections: ['hud-readability'],
      craftBody: '# HUD readability\nKeep combat feedback legible.',
      skillName: 'combat-system',
      skillBody: '# Combat system\nDesign stamina pressure.',
    });
    expect(promptWithCraft).toContain('## Active game craft references — hud-readability');
    expect(promptWithCraft.indexOf('## Active game craft references')).toBeGreaterThan(
      promptWithCraft.indexOf('## Active game art bible'),
    );
    expect(promptWithCraft.indexOf('## Active skill — combat-system')).toBeGreaterThan(
      promptWithCraft.indexOf('## Active game craft references'),
    );
    const promptWithInspirations = contracts.composeSystemPrompt({
      metadata: {
        kind: 'prototype',
        inspirationGameArtBibleIds: ['arcade-neon'],
      },
    });
    expect(promptWithInspirations).toContain('inspirationGameArtBibleIds');
    expect(promptWithInspirations).toContain('arcade-neon');
    expect(
      contracts.derivePreflight('# Live game artifact\nRead references/artifact-schema.md and references/refresh-contract.md'),
    ).toContain('`references/artifact-schema.md`');
    expect(promptsSystem.renderMetadataBlock).toEqual(expect.any(Function));
    expect(promptsSystem.renderPersistentGameMemoryBlock).toEqual(expect.any(Function));
    expect(discovery.DISCOVERY_AND_PHILOSOPHY).toContain('"id": "playerMode"');
    expect(discovery.DISCOVERY_AND_PHILOSOPHY).toContain('"Cloud gaming"');
    expect(directions.DESIGN_DIRECTIONS.length).toBeGreaterThanOrEqual(12);
    expect(directions.renderDirectionFormBody()).toContain('tactical-sci-fi-hud');
    expect(mediaModels.IMAGE_MODELS.map((model) => model.id)).toContain('gpt-image-2');
    expect(mediaModels.modelsForSurface('video').map((model) => model.id)).toContain('hyperframes-html');
    expect(mediaContract.MEDIA_GENERATION_CONTRACT).toContain('Allowed model IDs');
    expect(mediaContract.MEDIA_GENERATION_CONTRACT).toContain('hyperframes-html');
    expect(contracts.exampleHealthResponse).toEqual({ ok: true, service: 'daemon' });
    expect(connectionTest.validateBaseUrl).toEqual(expect.any(Function));
    expect(connectionTest.isLoopbackApiHost).toEqual(expect.any(Function));
    expect(connectionTest.isBlockedExternalApiHostname).toEqual(expect.any(Function));
    expect(projects.GAME_ENTITY_TYPES).toContain('game_world');
    expect(projects.GAME_DESIGN_METADATA_ENTITY_TYPE_MAP.survivalSystems).toBe('survival_system');
    expect(projects.GAME_DESIGN_METADATA_ENTITY_TYPE_MAP.audioSystems).toBe('audio_system');
    expect(files).toEqual(expect.any(Object));
    expect(telemetrySdk.createGameTelemetryClient).toEqual(expect.any(Function));
    expect(contracts.GAME_DESIGN_METADATA_ENTITY_TYPE_MAP.companionSystems).toBe('companion_system');
    expect(research.RESEARCH_DEFAULT_MAX_SOURCES.shallow).toBe(5);
    expect(proModules.PRO_MODULE_BUNDLE_FORMAT).toBe('agds-pro-module-bundle/v1');
    expect(critique.defaultCritiqueConfig()).toMatchObject({
      enabled: false,
      protocolVersion: critique.CRITIQUE_PROTOCOL_VERSION,
    });
  }, 15000);
});
