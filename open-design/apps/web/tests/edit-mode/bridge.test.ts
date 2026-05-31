import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  buildManualEditBridge,
  isMeaningfulManualEditElement,
  isManualEditHostNode,
  isSourceMappableManualEditElement,
  manualEditDomPathForElement,
  manualEditStableIdForElement,
} from '../../src/edit-mode/bridge';

describe('manual edit bridge target normalization', () => {
  it('prefers explicit data-agds-id over generated ids', () => {
    const dom = new JSDOM('<main><h1 data-agds-id="hero">Title</h1></main>');
    const target = dom.window.document.querySelector('h1')!;

    expect(manualEditStableIdForElement(target)).toBe('hero');
    expect(target.getAttribute('data-agds-runtime-id')).toBeNull();
  });

  it('still reads legacy data-od-id markers as compatibility annotations', () => {
    const dom = new JSDOM('<main><h1 data-od-id="legacy-hero">Title</h1></main>');
    const target = dom.window.document.querySelector('h1')!;

    expect(manualEditStableIdForElement(target)).toBe('legacy-hero');
    expect(isSourceMappableManualEditElement(target)).toBe(true);
  });

  it('generates stable DOM path ids for unannotated elements', () => {
    const dom = new JSDOM('<main><section><p>First</p><p>Second</p></section></main>');
    const target = dom.window.document.querySelectorAll('p')[1]!;

    expect(manualEditDomPathForElement(target)).toBe('path-0-0-1');
    expect(manualEditStableIdForElement(target)).toBe('path-0-0-1');
    expect(manualEditStableIdForElement(target)).toBe('path-0-0-1');
    expect(target.getAttribute('data-agds-runtime-id')).toBe('path-0-0-1');
  });

  it('generates DOM path ids against source-shaped children, ignoring host shim nodes', () => {
    const dom = new JSDOM(
      '<script data-agds-sandbox-shim></script><main><section><p>First</p><p>Second</p></section></main><script data-agds-edit-bridge></script>',
    );
    const target = dom.window.document.querySelectorAll('p')[1]!;

    expect(isManualEditHostNode(dom.window.document.querySelector('[data-agds-sandbox-shim]')!)).toBe(true);
    expect(manualEditDomPathForElement(target)).toBe('path-0-0-1');
  });

  it('still treats legacy sandbox shim nodes as host-owned compatibility nodes', () => {
    const dom = new JSDOM('<script data-od-sandbox-shim></script>');
    expect(isManualEditHostNode(dom.window.document.querySelector('[data-od-sandbox-shim]')!)).toBe(true);
  });

  it('discovers meaningful elements and ignores tiny or irrelevant elements', () => {
    const dom = new JSDOM('<main><h1 data-agds-source-path="path-0-0">Title</h1><script>1</script></main>');
    const title = dom.window.document.querySelector('h1')!;
    const script = dom.window.document.querySelector('script')!;

    expect(isMeaningfulManualEditElement(title, { width: 80, height: 24 })).toBe(true);
    expect(isMeaningfulManualEditElement(title, { width: 3, height: 24 })).toBe(false);
    expect(isMeaningfulManualEditElement(script, { width: 80, height: 24 })).toBe(false);
  });

  it('does not expose path targets unless they carry a source path marker', () => {
    const dom = new JSDOM('<main><h1>Runtime title</h1><p data-agds-source-path="path-0-1">Source text</p></main>');
    const runtimeTitle = dom.window.document.querySelector('h1')!;
    const sourceText = dom.window.document.querySelector('p')!;

    expect(isSourceMappableManualEditElement(runtimeTitle)).toBe(false);
    expect(isSourceMappableManualEditElement(sourceText)).toBe(true);
    expect(isMeaningfulManualEditElement(runtimeTitle, { width: 80, height: 24 })).toBe(false);
  });

  it('still treats legacy source-path markers as source-mappable', () => {
    const dom = new JSDOM('<main><p data-od-source-path="path-0-0">Legacy source text</p></main>');
    const sourceText = dom.window.document.querySelector('p')!;

    expect(isSourceMappableManualEditElement(sourceText)).toBe(true);
    expect(manualEditStableIdForElement(sourceText)).toBe('path-0-0');
    expect(sourceText.getAttribute('data-agds-runtime-id')).toBe('path-0-0');
  });

  it('omits selected outerHTML from bulk target posts but includes it for selected targets', () => {
    const bridge = buildManualEditBridge(true);

    expect(bridge).toContain('targets.push(targetFrom(nodes[i], false))');
    expect(bridge).toContain("target: targetFrom(el, true)");
    expect(bridge).toContain("type: 'agds-edit-targets'");
    expect(bridge).toContain("ev.data.type !== 'agds-edit-mode'");
    expect(bridge).toContain("ev.data.type !== 'od-edit-mode'");
    expect(bridge).toContain("type: 'agds-edit-select'");
    expect(bridge).toContain('if (!isSourceMappable(nodes[i])) continue;');
    expect(bridge).toContain('if (isPrimaryTarget(el)) return el;');
  });
});
