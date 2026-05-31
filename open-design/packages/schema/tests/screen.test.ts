import { describe, expect, it } from 'vitest';

import {
  ScreenSchema,
  validateScreenParentRefs,
  type Screen,
} from '../src/screen.js';

const baseTransform = {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
};

describe('Screen', () => {
  it('accepts a screen with zero components', () => {
    const screen = {
      id: 'screen-empty',
      name: 'Empty',
      kind: 'main-menu' as const,
      components: [],
    };
    const parsed = ScreenSchema.parse(screen);
    expect(parsed.components.length).toBe(0);
  });

  it('accepts a screen with deeply nested components', () => {
    const screen = {
      id: 'screen-nested',
      name: 'Nested',
      kind: 'gameplay' as const,
      components: [
        {
          kind: 'Container' as const,
          id: 'outer',
          name: 'Outer',
          transform: baseTransform,
          layout: 'stack-vertical' as const,
        },
        {
          kind: 'Container' as const,
          id: 'middle',
          name: 'Middle',
          parent: 'outer',
          transform: baseTransform,
          layout: 'stack-horizontal' as const,
        },
        {
          kind: 'Container' as const,
          id: 'inner',
          name: 'Inner',
          parent: 'middle',
          transform: baseTransform,
          layout: 'grid' as const,
        },
        {
          kind: 'Text' as const,
          id: 'leaf',
          name: 'Leaf',
          parent: 'inner',
          transform: baseTransform,
          content: 'Hello',
        },
      ],
    };
    const parsed = ScreenSchema.parse(screen);
    expect(parsed.components.length).toBe(4);
  });

  it('accepts a colour-typed background', () => {
    const screen = {
      id: 'screen-bg',
      name: 'BG',
      kind: 'main-menu' as const,
      background: { type: 'color' as const, color: '#112233' },
      components: [],
    };
    const parsed = ScreenSchema.parse(screen);
    expect(parsed.background?.type).toBe('color');
  });

  it('rejects an unknown screen kind', () => {
    const screen = {
      id: 'screen-bad-kind',
      name: 'Bad',
      kind: 'not-a-kind' as never,
      components: [],
    };
    expect(() => ScreenSchema.parse(screen)).toThrow();
  });

  it('rejects a background with a bad hex colour', () => {
    const screen = {
      id: 'screen-bad-bg',
      name: 'Bad BG',
      kind: 'main-menu' as const,
      background: { type: 'color' as const, color: 'red' },
      components: [],
    };
    expect(() => ScreenSchema.parse(screen)).toThrow();
  });

  it('validateScreenParentRefs detects dangling parent ids', () => {
    const screen = ScreenSchema.parse({
      id: 'screen-dangling',
      name: 'Dangling',
      kind: 'gameplay' as const,
      components: [
        {
          kind: 'Text' as const,
          id: 'child',
          name: 'Child',
          parent: 'no-such-parent',
          transform: baseTransform,
          content: 'orphan',
        },
      ],
    }) satisfies Screen;
    const issues = validateScreenParentRefs(screen);
    expect(issues.length).toBe(1);
    expect(issues[0]).toMatch(/no-such-parent/);
  });

  it('validateScreenParentRefs detects self-parent', () => {
    const screen = ScreenSchema.parse({
      id: 'screen-self',
      name: 'Self',
      kind: 'gameplay' as const,
      components: [
        {
          kind: 'Container' as const,
          id: 'me',
          name: 'Me',
          parent: 'me',
          transform: baseTransform,
        },
      ],
    });
    const issues = validateScreenParentRefs(screen);
    // Self-parent + dangling can both trigger; ensure at least one issue.
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues.join(' ')).toMatch(/itself|me/);
  });

  it('validateScreenParentRefs returns empty array for clean screen', () => {
    const screen = ScreenSchema.parse({
      id: 'screen-clean',
      name: 'Clean',
      kind: 'gameplay' as const,
      components: [
        {
          kind: 'Container' as const,
          id: 'root',
          name: 'Root',
          transform: baseTransform,
        },
        {
          kind: 'Text' as const,
          id: 'child',
          name: 'Child',
          parent: 'root',
          transform: baseTransform,
          content: 'ok',
        },
      ],
    });
    expect(validateScreenParentRefs(screen)).toEqual([]);
  });
});
