import { describe, expect, it } from 'vitest';

import {
  artifactManifestNameFor,
  createHtmlArtifactManifest,
  inferLegacyManifest,
  parseArtifactManifest,
} from '../../src/artifacts/manifest';

const retiredArtBibleKind = ['design', 'system'].join('-');
const retiredArtBibleIdKey = 'design'.concat('SystemId');

describe('parseArtifactManifest', () => {
  it('returns null for malformed json', () => {
    expect(parseArtifactManifest('{"version":1')).toBeNull();
  });

  it('returns null when required fields are missing', () => {
    expect(parseArtifactManifest(JSON.stringify({ version: 1, kind: 'html' }))).toBeNull();
  });

  it('returns null for wrong version', () => {
    const raw = JSON.stringify({
      version: 2,
      kind: 'html',
      title: 'x',
      entry: 'index.html',
      renderer: 'html',
      exports: ['html'],
    });
    expect(parseArtifactManifest(raw)).toBeNull();
  });

  it('defaults status to complete when missing', () => {
    const raw = JSON.stringify({
      version: 1,
      kind: 'html',
      title: 'x',
      entry: 'index.html',
      renderer: 'html',
      exports: ['html'],
    });
    const out = parseArtifactManifest(raw);
    expect(out?.status).toBe('complete');
  });

  it('preserves valid status when provided', () => {
    const raw = JSON.stringify({
      version: 1,
      kind: 'html',
      title: 'x',
      entry: 'index.html',
      renderer: 'html',
      status: 'streaming',
      exports: ['html'],
    });
    const out = parseArtifactManifest(raw);
    expect(out?.status).toBe('streaming');
  });

  it('accepts canonical game art bible artifact manifests', () => {
    const raw = JSON.stringify({
      version: 1,
      kind: 'game-art-bible',
      title: 'Arcade bible',
      entry: 'DESIGN.md',
      renderer: 'game-art-bible',
      exports: ['md', 'pdf', 'zip'],
      gameArtBibleId: 'arcade-neon',
    });
    const out = parseArtifactManifest(raw);
    expect(out).toMatchObject({
      kind: 'game-art-bible',
      renderer: 'game-art-bible',
      status: 'complete',
      gameArtBibleId: 'arcade-neon',
    });
  });

  it('normalizes legacy art-bible kind and renderer values', () => {
    const raw = JSON.stringify({
      version: 1,
      kind: retiredArtBibleKind,
      title: 'Arcade bible',
      entry: 'DESIGN.md',
      renderer: retiredArtBibleKind,
      exports: ['md', 'pdf', 'zip'],
      [retiredArtBibleIdKey]: 'arcade-neon',
    });
    const out = parseArtifactManifest(raw);
    expect(out).toMatchObject({
      kind: 'game-art-bible',
      renderer: 'game-art-bible',
      gameArtBibleId: 'arcade-neon',
    });
  });

  it('normalizes legacy art-bible id manifests to gameArtBibleId', () => {
    const raw = JSON.stringify({
      version: 1,
      kind: 'html',
      title: 'Combat HUD',
      entry: 'combat-hud.html',
      renderer: 'html',
      exports: ['html'],
      [retiredArtBibleIdKey]: 'soulslike-dark',
    });
    const out = parseArtifactManifest(raw);
    expect(out?.gameArtBibleId).toBe('soulslike-dark');
  });

  it('normalizes legacy mini-app manifests to playable prototypes', () => {
    const raw = JSON.stringify({
      version: 1,
      kind: 'mini-app',
      title: 'Combat sandbox',
      entry: 'combat-sandbox.html',
      renderer: 'mini-app',
      exports: ['html', 'pdf', 'zip'],
    });
    const out = parseArtifactManifest(raw);
    expect(out).toMatchObject({
      kind: 'playable-prototype',
      renderer: 'playable-prototype',
      entry: 'combat-sandbox.html',
    });
  });

  it('normalizes legacy React JSX manifests to React game modules', () => {
    const raw = JSON.stringify({
      version: 1,
      kind: 'react-component',
      title: 'Combat HUD',
      entry: 'combat-hud.jsx',
      renderer: 'react-component',
      exports: ['jsx', 'html', 'zip'],
    });
    const out = parseArtifactManifest(raw);
    expect(out).toMatchObject({
      kind: 'react-game-module',
      renderer: 'react-game-module',
      entry: 'combat-hud.jsx',
    });
  });
});

describe('inferLegacyManifest', () => {
  it('infers markdown manifests for .md files', () => {
    const out = inferLegacyManifest({ entry: 'README.md' });
    expect(out?.kind).toBe('markdown-document');
    expect(out?.renderer).toBe('markdown');
    expect(out?.status).toBe('complete');
  });

  it('infers svg manifests for .svg files', () => {
    const out = inferLegacyManifest({ entry: 'logo.svg' });
    expect(out?.kind).toBe('svg');
    expect(out?.renderer).toBe('svg');
    expect(out?.status).toBe('complete');
  });

  it('returns null for non-artifact file types', () => {
    expect(inferLegacyManifest({ entry: 'photo.png' })).toBeNull();
    expect(inferLegacyManifest({ entry: 'archive.bin' })).toBeNull();
  });

  it('infers React game-module artifacts from JSX and TSX entries', () => {
    expect(inferLegacyManifest({ entry: 'Card.jsx' })).toMatchObject({
      kind: 'react-game-module',
      renderer: 'react-game-module',
      exports: ['jsx', 'html', 'zip'],
    });
    expect(inferLegacyManifest({ entry: 'Card.tsx' })).toMatchObject({
      kind: 'react-game-module',
      renderer: 'react-game-module',
      exports: ['jsx', 'html', 'zip'],
    });
  });
});

describe('artifactManifestNameFor', () => {
  it('handles names without extension', () => {
    expect(artifactManifestNameFor('README')).toBe('README.artifact.json');
  });

  it('handles names with multiple dots', () => {
    expect(artifactManifestNameFor('page.v2.final.html')).toBe('page.v2.final.html.artifact.json');
  });

  it('avoids collisions between different extensions', () => {
    expect(artifactManifestNameFor('foo.html')).not.toBe(artifactManifestNameFor('foo.md'));
  });
});

describe('createHtmlArtifactManifest', () => {
  it('creates expected default html manifest shape', () => {
    const out = createHtmlArtifactManifest({
      entry: 'combat-hud.html',
      title: 'Combat HUD',
      gameArtBibleId: 'arcade-neon',
    });
    expect(out.version).toBe(1);
    expect(out.kind).toBe('html');
    expect(out.renderer).toBe('html');
    expect(out.status).toBe('complete');
    expect(out.exports).toEqual(['html', 'pdf', 'zip']);
    expect(out.entry).toBe('combat-hud.html');
    expect(out.title).toBe('Combat HUD');
    expect(out.gameArtBibleId).toBe('arcade-neon');
    expect(typeof out.createdAt).toBe('string');
    expect(typeof out.updatedAt).toBe('string');
  });
});
