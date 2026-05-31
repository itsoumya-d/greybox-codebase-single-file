// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ExamplesTab } from '../../src/components/ExamplesTab';
import { fetchSkillExample } from '../../src/providers/registry';
import {
  exportAsHtml,
  exportAsPdf,
  exportAsZip,
  openSandboxedPreviewInNewTab,
} from '../../src/runtime/exports';
import type { SkillSummary } from '../../src/types';

vi.mock('../../src/providers/registry', () => ({
  fetchSkillExample: vi.fn(async (id: string) => ({
    html: `<main><h1>${id} preview</h1></main>`,
  })),
}));

vi.mock('../../src/runtime/exports', () => ({
  exportAsHtml: vi.fn(),
  exportAsPdf: vi.fn(),
  exportAsZip: vi.fn(),
  openSandboxedPreviewInNewTab: vi.fn(),
}));

const originalIntersectionObserver = globalThis.IntersectionObserver;

class IdleIntersectionObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  globalThis.IntersectionObserver =
    IdleIntersectionObserver as unknown as typeof IntersectionObserver;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  globalThis.IntersectionObserver = originalIntersectionObserver;
});

function skill(overrides: Partial<SkillSummary> & Pick<SkillSummary, 'id' | 'name'>): SkillSummary {
  return {
    id: overrides.id,
    name: overrides.name,
    description: overrides.description ?? `${overrides.name} example`,
    triggers: overrides.triggers ?? [],
    mode: overrides.mode ?? 'prototype',
    surface: overrides.surface ?? 'web',
    platform: overrides.platform ?? 'desktop',
    scenario: overrides.scenario ?? 'general',
    previewType: overrides.previewType ?? 'html',
    gameArtBibleRequired: overrides.gameArtBibleRequired ?? false,
    defaultFor: overrides.defaultFor ?? [],
    upstream: overrides.upstream ?? null,
    featured: overrides.featured ?? null,
    fidelity: overrides.fidelity ?? null,
    speakerNotes: overrides.speakerNotes ?? null,
    animations: overrides.animations ?? null,
    craftRequires: overrides.craftRequires ?? [],
    hasBody: overrides.hasBody ?? true,
    examplePrompt: overrides.examplePrompt ?? `Build ${overrides.name}.`,
    aggregatesExamples: overrides.aggregatesExamples ?? false,
  };
}

const skills: SkillSummary[] = [
  skill({
    id: 'playable-game-prototype',
    name: 'playable-game-prototype',
    description: 'Playable dungeon crawler prototype',
    examplePrompt: 'Build a playable dungeon crawler.',
    scenario: 'gameplay',
    featured: 1,
  }),
  skill({
    id: 'game-hud-system',
    name: 'game-hud-system',
    description: 'Tactical HUD system',
    examplePrompt: 'Produce a tactical game HUD.',
    scenario: 'hud',
    featured: 2,
  }),
  skill({
    id: 'mobile-game-flow',
    name: 'mobile-game-flow',
    description: 'Mobile game flow prototype',
    mode: 'prototype',
    platform: 'mobile',
    scenario: 'menu',
  }),
  skill({
    id: 'game-pitch-deck',
    name: 'game-pitch-deck',
    description: 'Slides for game pitch',
    mode: 'deck',
    scenario: 'pitch',
  }),
  skill({
    id: 'game-key-art',
    name: 'game-key-art',
    description: 'Game image generation prompt',
    mode: 'image',
    surface: 'image',
    platform: null,
    scenario: 'asset',
  }),
  skill({
    id: 'game-trailer-motion',
    name: 'game-trailer-motion',
    description: 'Game trailer prompt',
    mode: 'video',
    surface: 'video',
    platform: null,
    scenario: 'trailer',
  }),
  skill({
    id: 'game-template',
    name: 'game-template',
    description: 'Reusable game template',
    examplePrompt: 'Create a reusable game template.',
    mode: 'template',
    surface: 'web',
    platform: null,
    scenario: 'systems',
  }),
];

function renderExamples(onUsePrompt = vi.fn()) {
  render(<ExamplesTab skills={skills} onUsePrompt={onUsePrompt} />);
  return { onUsePrompt };
}

function filterRow(name: string) {
  return screen.getByRole('tablist', { name });
}

describe('ExamplesTab', () => {
  it('shows the empty skills state when the catalog is unavailable', () => {
    render(<ExamplesTab skills={[]} onUsePrompt={vi.fn()} />);

    expect(screen.getByText('No game skills available. Is the daemon running?')).toBeTruthy();
  });

  it('filters examples by free-text search and shows an empty match state', () => {
    renderExamples();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search game examples by name' }), {
      target: { value: 'dungeon' },
    });

    expect(screen.getByTestId('example-card-playable-game-prototype')).toBeTruthy();
    expect(screen.queryByTestId('example-card-game-hud-system')).toBeNull();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search game examples by name' }), {
      target: { value: 'no matching example' },
    });

    expect(screen.getByText('No game examples match these filters.')).toBeTruthy();
  });

  it('narrows by surface, type, and scenario filter pills', () => {
    renderExamples();

    fireEvent.click(within(filterRow('Surface')).getByRole('tab', { name: /Assets1/ }));
    expect(screen.getByTestId('example-card-game-key-art')).toBeTruthy();
    expect(screen.queryByTestId('example-card-playable-game-prototype')).toBeNull();

    fireEvent.click(within(filterRow('Surface')).getByRole('tab', { name: /All7/ }));
    fireEvent.click(within(filterRow('Game type')).getByRole('tab', { name: /Playable · Mobile1/ }));
    expect(screen.getByTestId('example-card-mobile-game-flow')).toBeTruthy();
    expect(screen.queryByTestId('example-card-playable-game-prototype')).toBeNull();

    fireEvent.click(within(filterRow('Game type')).getByRole('tab', { name: /All7/ }));
    fireEvent.click(within(filterRow('Game area')).getByRole('button', { name: /HUD1/ }));
    expect(screen.getByTestId('example-card-game-hud-system')).toBeTruthy();
    expect(screen.queryByTestId('example-card-playable-game-prototype')).toBeNull();
  });

  it('filters Docs & templates examples and uses the selected template prompt', () => {
    const { onUsePrompt } = renderExamples();

    fireEvent.click(within(filterRow('Game type')).getByRole('tab', { name: /Game templates1/ }));

    expect(screen.getByTestId('example-card-game-template')).toBeTruthy();
    expect(screen.getByText('Game template')).toBeTruthy();
    expect(screen.queryByTestId('example-card-playable-game-prototype')).toBeNull();

    fireEvent.click(screen.getByTestId('example-use-prompt-game-template'));

    expect(onUsePrompt).toHaveBeenCalledTimes(1);
    expect(onUsePrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'game-template',
        mode: 'template',
        examplePrompt: 'Create a reusable game template.',
      }),
    );
  });

  it('passes the selected example to the Use this prompt callback', () => {
    const { onUsePrompt } = renderExamples();

    fireEvent.click(screen.getByTestId('example-use-prompt-game-hud-system'));

    expect(onUsePrompt).toHaveBeenCalledTimes(1);
    expect(onUsePrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'game-hud-system',
        examplePrompt: 'Produce a tactical game HUD.',
      }),
    );
  });

  it('loads previews on demand and enables the share export menu', async () => {
    renderExamples();

    const card = screen.getByTestId('example-card-playable-game-prototype');
    const shareButton = within(card).getByRole('button', { name: 'Share ▾' }) as HTMLButtonElement;
    expect(shareButton.disabled).toBe(true);

    fireEvent.mouseEnter(card);

    await waitFor(() => {
      expect(fetchSkillExample).toHaveBeenCalledWith('playable-game-prototype', 'html');
      expect(shareButton.disabled).toBe(false);
    });

    fireEvent.click(shareButton);
    fireEvent.click(screen.getByRole('menuitem', { name: /Export as PDF/i }));
    expect(exportAsPdf).toHaveBeenCalledWith(
      '<main><h1>playable-game-prototype preview</h1></main>',
      'playable-game-prototype',
      { deck: false },
    );

    fireEvent.click(shareButton);
    fireEvent.click(screen.getByRole('menuitem', { name: /Download as \.zip/i }));
    expect(exportAsZip).toHaveBeenCalledWith(
      '<main><h1>playable-game-prototype preview</h1></main>',
      'playable-game-prototype',
    );

    fireEvent.click(shareButton);
    fireEvent.click(screen.getByRole('menuitem', { name: /Export as standalone HTML/i }));
    expect(exportAsHtml).toHaveBeenCalledWith(
      '<main><h1>playable-game-prototype preview</h1></main>',
      'playable-game-prototype',
    );
  });

  it('opens the full preview modal and exercises its toolbar actions', async () => {
    renderExamples();

    const card = screen.getByTestId('example-card-playable-game-prototype');
    fireEvent.click(within(card).getByRole('button', { name: /Open preview/ }));

    const dialog = await screen.findByRole('dialog', { name: 'playable-game-prototype preview' });
    await waitFor(() => {
      expect(screen.getByTitle('playable-game-prototype Preview')).toBeTruthy();
    });

    fireEvent.click(within(dialog).getByRole('button', { name: /Fullscreen/i }));
    const modal = dialog.querySelector('.preview-modal') as HTMLElement;
    expect(modal.classList.contains('preview-modal-fullscreen')).toBe(true);
    expect(within(dialog).getByRole('button', { name: /Exit/i })).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(modal.classList.contains('preview-modal-fullscreen')).toBe(false);
    expect(screen.getByRole('dialog', { name: 'playable-game-prototype preview' })).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: /Fullscreen/i }));
    expect(modal.classList.contains('preview-modal-fullscreen')).toBe(true);
    fireEvent.click(within(dialog).getByRole('button', { name: /Exit/i }));
    expect(modal.classList.contains('preview-modal-fullscreen')).toBe(false);
    expect(within(dialog).getByRole('button', { name: /Fullscreen/i })).toBeTruthy();

    const shareButton = within(dialog).getByRole('button', { name: 'Share ▾' });
    fireEvent.click(shareButton);
    fireEvent.click(within(dialog).getByRole('menuitem', { name: /Export as PDF/i }));
    expect(exportAsPdf).toHaveBeenCalledWith(
      '<main><h1>playable-game-prototype preview</h1></main>',
      'playable-game-prototype',
      { deck: false },
    );

    fireEvent.click(shareButton);
    fireEvent.click(within(dialog).getByRole('menuitem', { name: /Download as \.zip/i }));
    expect(exportAsZip).toHaveBeenCalledWith(
      '<main><h1>playable-game-prototype preview</h1></main>',
      'playable-game-prototype',
    );

    fireEvent.click(shareButton);
    fireEvent.click(within(dialog).getByRole('menuitem', { name: /Export as standalone HTML/i }));
    expect(exportAsHtml).toHaveBeenCalledWith(
      '<main><h1>playable-game-prototype preview</h1></main>',
      'playable-game-prototype',
    );

    fireEvent.click(shareButton);
    fireEvent.click(within(dialog).getByRole('menuitem', { name: /Open in new tab/i }));
    expect(openSandboxedPreviewInNewTab).toHaveBeenCalledWith(
      '<main><h1>playable-game-prototype preview</h1></main>',
      'playable-game-prototype',
      { deck: false },
    );

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog', { name: 'playable-game-prototype preview' })).toBeNull();
  });
});
