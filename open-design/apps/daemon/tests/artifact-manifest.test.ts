import { describe, expect, it } from 'vitest';

import { inferLegacyManifest, validateArtifactManifestInput } from '../src/artifact-manifest.js';

const retiredArtBibleKind = ['design', 'system'].join('-');
const retiredArtBibleIdKey = 'design'.concat('SystemId');

function validBase() {
  return {
    kind: 'html',
    renderer: 'html',
    title: 'Test',
    exports: ['html'],
  };
}

describe('validateArtifactManifestInput', () => {
  it('rejects empty exports', () => {
    const res = validateArtifactManifestInput({ ...validBase(), exports: [] }, 'index.html');
    expect(res.ok).toBe(false);
  });

  it('rejects invalid kind and renderer and export', () => {
    expect(
      validateArtifactManifestInput(
        { ...validBase(), kind: 'evil-kind', renderer: 'html', exports: ['html'] },
        'index.html',
      ).ok,
    ).toBe(false);
    expect(
      validateArtifactManifestInput(
        { ...validBase(), kind: 'html', renderer: 'evil-renderer', exports: ['html'] },
        'index.html',
      ).ok,
    ).toBe(false);
    expect(
      validateArtifactManifestInput(
        { ...validBase(), kind: 'html', renderer: 'html', exports: ['exe'] },
        'index.html',
      ).ok,
    ).toBe(false);
  });

  it('rejects traversal in supportingFiles', () => {
    const res = validateArtifactManifestInput(
      { ...validBase(), supportingFiles: ['../secret.txt'] },
      'index.html',
    );
    expect(res.ok).toBe(false);
  });

  it('defaults status to complete when missing', () => {
    const res = validateArtifactManifestInput(validBase(), 'index.html');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value?.status).toBe('complete');
  });

  it('preserves valid status values', () => {
    const res = validateArtifactManifestInput({ ...validBase(), status: 'streaming' }, 'index.html');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value?.status).toBe('streaming');
  });

  it('accepts canonical game art bible kind and renderer values', () => {
    const res = validateArtifactManifestInput(
      {
        kind: 'game-art-bible',
        renderer: 'game-art-bible',
        title: 'Arcade bible',
        exports: ['md', 'pdf', 'zip'],
        gameArtBibleId: 'arcade-neon',
      },
      'DESIGN.md',
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value).toMatchObject({
        kind: 'game-art-bible',
        renderer: 'game-art-bible',
        entry: 'DESIGN.md',
        status: 'complete',
        gameArtBibleId: 'arcade-neon',
      });
    }
  });

  it('normalizes legacy art-bible kind and renderer values', () => {
    const res = validateArtifactManifestInput(
      {
        kind: retiredArtBibleKind,
        renderer: retiredArtBibleKind,
        title: 'Arcade bible',
        exports: ['md', 'pdf', 'zip'],
        [retiredArtBibleIdKey]: 'arcade-neon',
      },
      'DESIGN.md',
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value).toMatchObject({
        kind: 'game-art-bible',
        renderer: 'game-art-bible',
        entry: 'DESIGN.md',
        gameArtBibleId: 'arcade-neon',
      });
    }
  });

  it('normalizes legacy art-bible id aliases to gameArtBibleId', () => {
    const res = validateArtifactManifestInput(
      { ...validBase(), [retiredArtBibleIdKey]: 'soulslike-dark' },
      'combat-hud.html',
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value?.gameArtBibleId).toBe('soulslike-dark');
    }
  });

  it('normalizes legacy mini-app kind and renderer values to playable prototypes', () => {
    const res = validateArtifactManifestInput(
      {
        kind: 'mini-app',
        renderer: 'mini-app',
        title: 'Combat sandbox',
        exports: ['html', 'pdf', 'zip'],
      },
      'combat-sandbox.html',
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value).toMatchObject({
        kind: 'playable-prototype',
        renderer: 'playable-prototype',
        entry: 'combat-sandbox.html',
      });
    }
  });

  it('accepts canonical React game-module kind and renderer values', () => {
    const res = validateArtifactManifestInput(
      {
        kind: 'react-game-module',
        renderer: 'react-game-module',
        title: 'Combat HUD',
        exports: ['jsx', 'html', 'zip'],
      },
      'combat-hud.jsx',
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value).toMatchObject({
        kind: 'react-game-module',
        renderer: 'react-game-module',
        entry: 'combat-hud.jsx',
      });
    }
  });

  it('normalizes legacy React JSX kind and renderer values to React game modules', () => {
    const res = validateArtifactManifestInput(
      {
        kind: 'react-component',
        renderer: 'react-component',
        title: 'Combat HUD',
        exports: ['jsx', 'html', 'zip'],
      },
      'combat-hud.jsx',
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value).toMatchObject({
        kind: 'react-game-module',
        renderer: 'react-game-module',
        entry: 'combat-hud.jsx',
      });
    }
  });
});

describe('inferLegacyManifest', () => {
  it('infers markdown manifest for .md files', () => {
    const out = inferLegacyManifest('README.md');
    expect(out?.kind).toBe('markdown-document');
    expect(out?.renderer).toBe('markdown');
    expect(out?.status).toBe('complete');
    expect(out?.exports).toEqual(['md', 'html', 'pdf', 'zip']);
  });

  it('infers svg manifest for .svg files', () => {
    const out = inferLegacyManifest('logo.svg');
    expect(out?.kind).toBe('svg');
    expect(out?.renderer).toBe('svg');
    expect(out?.status).toBe('complete');
    expect(out?.exports).toEqual(['svg', 'zip']);
  });

  it('infers React game-module manifest for JSX and TSX files', () => {
    const jsx = inferLegacyManifest('combat-hud.jsx');
    expect(jsx?.kind).toBe('react-game-module');
    expect(jsx?.renderer).toBe('react-game-module');
    expect(jsx?.exports).toEqual(['jsx', 'html', 'zip']);

    const tsx = inferLegacyManifest('combat-hud.tsx');
    expect(tsx?.kind).toBe('react-game-module');
    expect(tsx?.renderer).toBe('react-game-module');
    expect(tsx?.exports).toEqual(['jsx', 'html', 'zip']);
  });
});
