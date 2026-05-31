import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');

const manifestPath = path.join(repoRoot, 'docs/game-design-compatibility-manifest.md');
const matrixPath = path.join(repoRoot, 'docs/game-design-requirement-matrix.md');
const auditPath = path.join(repoRoot, 'docs/game-design-transformation-audit.md');
const guardPath = path.join(repoRoot, 'scripts/guard.ts');

describe('game design compatibility manifest', () => {
  it('documents the guard-enforced legacy alias boundaries', () => {
    const manifest = readFileSync(manifestPath, 'utf8');
    const guard = readFileSync(guardPath, 'utf8');

    for (const guardName of [
      'checkCompatibilityAliasTargets',
      'checkLegacyArtBibleCompatibilityConfinement',
      'checkLegacyRuntimeProtocolConfinement',
    ]) {
      expect(manifest).toContain(guardName);
      expect(guard).toContain(guardName);
    }

    for (const surface of [
      'Legacy art-bible manifest/frontmatter keys',
      'Runtime environment aliases',
      'Stored data roots',
      'Release and installer naming aliases',
    ]) {
      expect(manifest).toContain(surface);
    }
  });

  it('states that aliases are migration-only and barred from active game-studio surfaces', () => {
    const manifest = readFileSync(manifestPath, 'utf8');

    for (const phrase of [
      'not product identity',
      'active prompts',
      'visible UI copy',
      'first-class catalog entries',
      'must not appear as first-class skill folders',
      'must resolve to canonical game-native implementations',
    ]) {
      expect(manifest).toContain(phrase);
    }
  });

  it('keeps the matrix and audit linked to the manifest', () => {
    const matrix = readFileSync(matrixPath, 'utf8');
    const audit = readFileSync(auditPath, 'utf8');

    expect(matrix).toContain('game-design-compatibility-manifest.md');
    expect(audit).toContain('game-design-compatibility-manifest.md');
  });
});
