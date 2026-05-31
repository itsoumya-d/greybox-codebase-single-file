import { describe, expect, it } from 'vitest';
import { renderGameArtBiblePreview } from '../src/game-art-bible-preview.js';
import { extractColors, renderGameArtBibleShowcase } from '../src/game-art-bible-showcase.js';

type Color = { name: string; value: string; role: string };

function findColor(colors: Color[], name: string): Color | undefined {
  return colors.find((c) => c.name.toLowerCase() === name.toLowerCase());
}

describe('extractColors / Pattern B', () => {
  it('parses `- **Name:** `#hex`` (colon inside bold) — agentic / warm-editorial shape', () => {
    const md = [
      '## 2. Color',
      '',
      '- **Primary:** `#FF5701` — Token from style foundations.',
      '- **Secondary:** `#F6F6F1` — Token from style foundations.',
      '- **Surface:** `#FFFFFF` — Token from style foundations.',
      '- **Text:** `#111827` — Token from style foundations.',
    ].join('\n');

    const colors = extractColors(md);

    expect(findColor(colors, 'Primary')?.value).toBe('#ff5701');
    expect(findColor(colors, 'Secondary')?.value).toBe('#f6f6f1');
    expect(findColor(colors, 'Surface')?.value).toBe('#ffffff');
    expect(findColor(colors, 'Text')?.value).toBe('#111827');
  });

  it('parses `- Name: `#hex`` bare list shape', () => {
    const md = [
      '### Buttons',
      '',
      '- Background: `#7d2ae8`',
      '- Text: `#ffffff`',
    ].join('\n');

    const colors = extractColors(md);

    expect(findColor(colors, 'Background')?.value).toBe('#7d2ae8');
    expect(findColor(colors, 'Text')?.value).toBe('#ffffff');
  });

  it('parses `**Name** `#hex`: role` (Duolingo / Canva shape with role suffix)', () => {
    const md = [
      '## Color',
      '',
      '- **Owl Green** `#58CC02`: Primary game identity and objective action.',
      '- **Feather Blue** `#1CB0F6`: Secondary accent.',
    ].join('\n');

    const colors = extractColors(md);

    const owl = findColor(colors, 'Owl Green');
    expect(owl?.value).toBe('#58cc02');
    expect(owl?.role).toContain('Primary game identity');

    const feather = findColor(colors, 'Feather Blue');
    expect(feather?.value).toBe('#1cb0f6');
    expect(feather?.role).toContain('Secondary accent');
  });

  it('extracts the first hex from multi-hex `**Name** (`#a` / `#b`): role` (Linear shape)', () => {
    const md = '- **Marketing Black** (`#010102` / `#08090a`): Marketing surface and dark canvas.';

    const colors = extractColors(md);

    const black = findColor(colors, 'Marketing Black');
    expect(black?.value).toBe('#010102');
    expect(black?.role).toContain('Marketing surface');
  });
});

describe('renderGameArtBibleShowcase', () => {
  it('uses canonical game-art-bible source wording in visible footer copy', () => {
    const html = renderGameArtBibleShowcase(
      'arcade-neon',
      [
        '# Arcade Neon',
        '',
        'Fast arcade combat readability.',
        '',
        '## Color',
        '- **Combat Gold:** `#ffbd2e` - Hit confirmation and objective prompts.',
      ].join('\n'),
    );

    expect(html).toContain('game-art-bibles/arcade-neon/DESIGN.md');
    expect(html).not.toContain('design-systems/arcade-neon/DESIGN.md');
  });

  it('cleans retired imported-title prefixes from showcase and preview titles', () => {
    const retiredPrefix = ['Design', 'System'].join(' ');
    const body = [
      `# ${retiredPrefix} Inspired by Boss Arena Readability`,
      '',
      'A combat space with health bars, stamina pressure, readable VFX, and controller-safe HUD composition.',
      '',
      '## Color',
      '- **Boss Warning:** `#ff3355` - Phase change danger.',
    ].join('\n');

    const showcase = renderGameArtBibleShowcase('boss-arena', body);
    const preview = renderGameArtBiblePreview('boss-arena', body);

    expect(showcase).toContain('Boss Arena Readability');
    expect(preview).toContain('Boss Arena Readability');
    expect(showcase).not.toContain(retiredPrefix);
    expect(preview).not.toContain(retiredPrefix);
  });
});
