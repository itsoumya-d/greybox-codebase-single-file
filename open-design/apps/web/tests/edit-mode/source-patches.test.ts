import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  applyManualEditPatch,
  readManualEditAttributes,
  readManualEditFields,
  readManualEditOuterHtml,
  readManualEditStyles,
} from '../../src/edit-mode/source-patches';

const baseSource = `<!doctype html>
<html>
  <head>
    <style>:root { --brand: #111; }</style>
  </head>
  <body>
    <main>
      <h1 data-agds-id="hero-title">Original title</h1>
      <a data-agds-id="objective" href="/start">Start</a>
      <button data-agds-id="button-objective">Start button</button>
      <a data-agds-id="nested-objective" href="/nested"><span>Inspect build</span><svg viewBox="0 0 1 1"></svg></a>
      <img data-agds-id="hero-image" src="/old.png" alt="Old image">
      <section data-agds-id="card" class="hero" style="color: red; padding: 8px;" data-keep="yes">Card</section>
      <p data-agds-id="nested"><strong>Nested</strong> copy</p>
      <p>Generated path text</p>
    </main>
  </body>
</html>`;

describe('manual edit source patches', () => {
  beforeEach(() => {
    const dom = new JSDOM('');
    globalThis.DOMParser = dom.window.DOMParser;
    globalThis.CSS = { escape: (value: string) => value.replace(/"/g, '\\"') } as typeof CSS;
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'DOMParser');
    Reflect.deleteProperty(globalThis, 'CSS');
  });

  it('updates only the selected text target', () => {
    const result = applyManualEditPatch(baseSource, { kind: 'set-text', id: 'hero-title', value: 'Edited title' });

    expect(result.ok).toBe(true);
    expect(readManualEditFields(result.source, 'hero-title').text).toBe('Edited title');
    expect(readManualEditFields(result.source, 'objective').text).toBe('Start');
  });

  it('still edits legacy data-od-id annotated targets', () => {
    const legacySource = '<main><h1 data-od-id="legacy-title">Original</h1></main>';
    const result = applyManualEditPatch(legacySource, { kind: 'set-text', id: 'legacy-title', value: 'Edited' });

    expect(result.ok).toBe(true);
    expect(result.source).toBe('<main><h1 data-od-id="legacy-title">Edited</h1></main>');
  });

  it('updates link label and href', () => {
    const result = applyManualEditPatch(baseSource, { kind: 'set-link', id: 'objective', text: 'Inspect build', href: '/inspect' });

    expect(result.ok).toBe(true);
    expect(readManualEditFields(result.source, 'objective')).toEqual({ text: 'Inspect build', href: '/inspect' });
  });

  it('treats buttons as label-only text targets instead of persisting href attributes', () => {
    const result = applyManualEditPatch(baseSource, { kind: 'set-text', id: 'button-objective', value: 'Inspect button' });

    expect(result.ok).toBe(true);
    const html = readManualEditOuterHtml(result.source, 'button-objective');
    expect(html).toContain('Inspect button');
    expect(html).not.toContain('href=');
    expect(readManualEditFields(result.source, 'button-objective')).toEqual({ text: 'Inspect button' });
  });

  it('preserves nested link markup when only href changes', () => {
    const result = applyManualEditPatch(baseSource, { kind: 'set-link', id: 'nested-objective', text: 'Inspect build', href: '/inspect' });

    expect(result.ok).toBe(true);
    const html = readManualEditOuterHtml(result.source, 'nested-objective');
    expect(html).toContain('href="/inspect"');
    expect(html).toContain('<span>Inspect build</span>');
    expect(html).toContain('<svg');
  });

  it('rejects label edits for links with nested markup', () => {
    const result = applyManualEditPatch(baseSource, { kind: 'set-link', id: 'nested-objective', text: 'Inspect', href: '/inspect' });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('nested markup');
  });

  it('updates image src and alt', () => {
    const result = applyManualEditPatch(baseSource, { kind: 'set-image', id: 'hero-image', src: '/new.png', alt: 'New image' });

    expect(result.ok).toBe(true);
    expect(readManualEditFields(result.source, 'hero-image')).toEqual({ src: '/new.png', alt: 'New image' });
  });

  it('adds and removes inline style properties', () => {
    const result = applyManualEditPatch(baseSource, {
      kind: 'set-style',
      id: 'card',
      styles: { color: '', backgroundColor: 'blue', fontSize: '24px' },
    });

    expect(result.ok).toBe(true);
    const styles = readManualEditStyles(result.source, 'card');
    expect(styles.color).toBe('');
    expect(styles.backgroundColor).toBe('blue');
    expect(styles.fontSize).toBe('24px');
    expect(styles.padding).toBe('8px');
  });

  it('applies attributes additively and preserves class/style unless explicitly updated', () => {
    const result = applyManualEditPatch(baseSource, {
      kind: 'set-attributes',
      id: 'card',
      attributes: { 'aria-label': 'Hero card', 'data-empty': '', 'data-agds-id': 'blocked' },
    });

    expect(result.ok).toBe(true);
    const attrs = readManualEditAttributes(result.source, 'card');
    expect(attrs['aria-label']).toBe('Hero card');
    expect(attrs.class).toBe('hero');
    expect(attrs.style).toContain('color: red');
    expect(attrs['data-agds-id']).toBe('card');
    expect(attrs['data-empty']).toBeUndefined();
  });

  it('preserves data-agds-id when selected outerHTML omits it', () => {
    const result = applyManualEditPatch(baseSource, {
      kind: 'set-outer-html',
      id: 'card',
      html: '<section class="replacement">Replaced</section>',
    });

    expect(result.ok).toBe(true);
    const html = readManualEditOuterHtml(result.source, 'card');
    expect(html).toContain('data-agds-id="card"');
    expect(html).toContain('class="replacement"');
  });

  it('replaces full source for snapshot-based undo history', () => {
    const source = '<!doctype html><html><body><h1 data-agds-id="hero-title">Snapshot</h1></body></html>';
    const result = applyManualEditPatch(baseSource, { kind: 'set-full-source', source });

    expect(result).toEqual({ ok: true, source });
  });

  it('updates CSS tokens in style tags', () => {
    const result = applyManualEditPatch(baseSource, { kind: 'set-token', token: '--brand', value: '#f00' });

    expect(result.ok).toBe(true);
    expect(result.source).toContain('--brand: #f00;');
  });

  it('preserves fragment-shaped HTML when saving patches', () => {
    const source = '<main><h1 data-agds-id="hero-title">Original title</h1></main>';
    const result = applyManualEditPatch(source, { kind: 'set-text', id: 'hero-title', value: 'Edited title' });

    expect(result.ok).toBe(true);
    expect(result.source).toBe('<main><h1 data-agds-id="hero-title">Edited title</h1></main>');
    expect(result.source).not.toContain('<!doctype');
    expect(result.source).not.toContain('<html');
    expect(result.source).not.toContain('<body');
  });

  it('preserves full documents with leading comments when saving patches', () => {
    const source = [
      '<!-- generated by AI Game Design Studio -->',
      '<!doctype html><html><head><style>:root { --brand: #111; }</style></head>',
      '<body><main><h1 data-agds-id="hero-title">Original title</h1></main></body></html>',
    ].join('\n');
    const result = applyManualEditPatch(source, { kind: 'set-text', id: 'hero-title', value: 'Edited title' });

    expect(result.ok).toBe(true);
    expect(result.source).toContain('<!doctype html>');
    expect(result.source).toContain('<html>');
    expect(result.source).toContain('<head><style>:root { --brand: #111; }</style></head>');
    expect(result.source).toContain('<h1 data-agds-id="hero-title">Edited title</h1>');
  });

  it('addresses unannotated elements with generated DOM path ids', () => {
    const result = applyManualEditPatch(baseSource, { kind: 'set-text', id: 'path-0-7', value: 'Path target' });

    expect(result.ok).toBe(true);
    expect(result.source).toContain('Path target');
  });

  it('rejects text patches for nested markup', () => {
    const result = applyManualEditPatch(baseSource, { kind: 'set-text', id: 'nested', value: 'Flat text' });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('nested markup');
  });
});
