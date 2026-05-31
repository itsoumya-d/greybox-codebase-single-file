import { describe, expect, it } from 'vitest';

import { buildReactGameModuleSrcdoc, prepareReactGameModuleSource } from '../../src/runtime/react-game-module';

describe('prepareReactGameModuleSource', () => {
  it('adapts a default function export for iframe rendering', () => {
    const out = prepareReactGameModuleSource(`
import React from 'react';
export default function EncounterHud() {
  return <div>Encounter HUD</div>;
}
`);
    expect(out).not.toContain('import React');
    expect(out).toContain('function EncounterHud()');
    expect(out).toContain('window.__AIGameDesignStudioComponent');
    expect(out).not.toContain('OpenDesign');
    expect(out).toContain("typeof EncounterHud !== 'undefined' ? EncounterHud : null");
  });

  it('adapts a named game module export for iframe rendering', () => {
    const out = prepareReactGameModuleSource('export const Preview = () => <main />;');
    expect(out).toContain('const Preview =');
    expect(out).toContain("typeof Preview !== 'undefined' ? Preview : null");
  });

  it('preserves React hook imports as runtime bindings', () => {
    const out = prepareReactGameModuleSource(`
import { useState, useEffect as useReactEffect } from 'react';
export default function Counter() {
  const [count, setCount] = useState(0);
  useReactEffect(() => setCount(1), []);
  return <button>{count}</button>;
}
`);
    expect(out).not.toContain("import { useState");
    expect(out).toContain('const { useState, useEffect: useReactEffect } = window.React;');
    expect(out).toContain('function Counter()');
  });

  it('detects default re-exports before removing export specifiers', () => {
    const out = prepareReactGameModuleSource(`
const Foo = () => <main />;
export { Foo as default };
`);
    expect(out).not.toContain('export { Foo as default }');
    expect(out).toContain("typeof Foo !== 'undefined' ? Foo : null");
  });
});

describe('buildReactGameModuleSrcdoc', () => {
  it('builds a standalone sandbox document with React runtime scripts', () => {
    const doc = buildReactGameModuleSrcdoc('export default function App(){ return <div /> }', {
      title: 'App',
    });
    expect(doc).toContain('<!doctype html>');
    expect(doc).toContain('react@18/umd/react.development.js');
    expect(doc).toContain('@babel/standalone');
    expect(doc).toContain('artifact.tsx');
    expect(doc).toContain('sandboxed iframe');
    expect(doc).toContain('(0, eval)(compiled)');
    expect(doc).toContain("['__', 'Open', 'Design', 'Component'].join('')");
  });
});
