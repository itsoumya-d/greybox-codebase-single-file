// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildGameArtBibleCreateSelection,
  defaultGameArtBibleSelection,
  NewProjectPanel,
} from '../../src/components/NewProjectPanel';
import type { GameArtBibleSummary, ProjectTemplate, SkillSummary } from '../../src/types';

const skills: SkillSummary[] = [
  {
    id: 'prototype-skill',
    name: 'Prototype',
    description: 'Build playable concepts',
    mode: 'prototype',
    surface: 'web',
    previewType: 'html',
    gameArtBibleRequired: true,
    defaultFor: ['prototype'],
    triggers: [],
    upstream: null,
    hasBody: true,
    examplePrompt: 'Build a playable concept.',
    aggregatesExamples: false,
  },
];

const gameArtBibles: GameArtBibleSummary[] = [
  {
    id: 'clay',
    title: 'Arcane Forge',
    summary: 'Hand-painted fantasy HUD, inventory, and world-map language.',
    category: 'Fantasy RPG',
    swatches: ['#f4efe7', '#25211d'],
  },
  {
    id: 'noir',
    title: 'Neon Raid',
    summary: 'Cyberpunk combat overlays, stealth readability, and loot rarity cues.',
    category: 'Cyberpunk FPS',
    swatches: ['#111111', '#f7f0e8'],
  },
];

const templates: ProjectTemplate[] = [
  {
    id: 'tmpl-main-menu',
    name: 'Main Menu',
    description: 'A saved game main-menu starter.',
    files: [{ name: 'prototype/App.jsx', path: 'prototype/App.jsx' }],
    createdAt: '2026-05-07T00:00:00.000Z',
  },
];

afterEach(() => {
  cleanup();
  globalThis.ResizeObserver = originalResizeObserver;
  Element.prototype.scrollIntoView = originalScrollIntoView;
});

const originalResizeObserver = globalThis.ResizeObserver;
const originalScrollIntoView = Element.prototype.scrollIntoView;

class ResizeObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
  Element.prototype.scrollIntoView = vi.fn();
});

describe('NewProjectPanel game art bible defaults', () => {
  it('uses the configured default game art bible when it exists in the catalog', () => {
    expect(defaultGameArtBibleSelection('clay', gameArtBibles)).toEqual(['clay']);
    expect(defaultGameArtBibleSelection('missing', gameArtBibles)).toEqual([]);
    expect(defaultGameArtBibleSelection(null, gameArtBibles)).toEqual([]);
  });

  it('shows the configured default game art bible as the active project selection', () => {
    const markup = renderToStaticMarkup(
      <NewProjectPanel
        skills={skills}
        gameArtBibles={gameArtBibles}
        defaultGameArtBibleId="clay"
        templates={[]}
        promptTemplates={[]}
        onCreate={vi.fn()}
      />,
    );

    expect(markup).toContain('Arcane Forge');
    expect(markup).toContain('Default');
    expect(markup).not.toContain('Freeform');
  });

  it('keeps media project creation from inheriting a hidden game art bible pick', () => {
    expect(buildGameArtBibleCreateSelection(true, ['clay', 'bmw'])).toEqual({
      primary: 'clay',
      inspirations: ['bmw'],
    });
    expect(buildGameArtBibleCreateSelection(false, ['clay', 'bmw'])).toEqual({
      primary: null,
      inspirations: [],
    });
  });

  it('preserves playable-concept fidelity across tab switches and saves it into the create payload', () => {
    const onCreate = vi.fn();
    render(
      <NewProjectPanel
        skills={skills}
        gameArtBibles={gameArtBibles}
        defaultGameArtBibleId="clay"
        templates={[]}
        promptTemplates={[]}
        onCreate={onCreate}
      />,
    );

    fireEvent.change(screen.getByTestId('new-project-name'), {
      target: { value: 'Wireframe fidelity payload' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Playable wireframe' }));
    expect(screen.getByRole('button', { name: 'Playable wireframe' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('tab', { name: 'Game pitch / GDD' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Playable concept' }));
    expect(screen.getByRole('button', { name: 'Playable wireframe' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByTestId('create-project'));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Wireframe fidelity payload',
        gameArtBibleId: 'clay',
        metadata: expect.objectContaining({
          kind: 'prototype',
          deliverableKind: 'prototype',
          fidelity: 'wireframe',
        }),
      }),
    );
  });

  it('captures game-design onboarding metadata in the create payload', () => {
    const onCreate = vi.fn();
    render(
      <NewProjectPanel
        skills={skills}
        gameArtBibles={gameArtBibles}
        defaultGameArtBibleId="clay"
        templates={[]}
        promptTemplates={[]}
        onCreate={onCreate}
      />,
    );

    fireEvent.change(screen.getByTestId('new-project-name'), {
      target: { value: 'Dungeon crawler' },
    });
    fireEvent.change(screen.getByTestId('new-project-game-genre'), {
      target: { value: 'mobile roguelike dungeon crawler' },
    });
    fireEvent.change(screen.getByLabelText('Player mode'), {
      target: { value: 'co-op' },
    });
    fireEvent.change(screen.getByLabelText('Platform'), {
      target: { value: 'console' },
    });
    fireEvent.change(screen.getByLabelText('2D / 3D'), {
      target: { value: '3D' },
    });
    fireEvent.change(screen.getByLabelText('Design focus'), {
      target: { value: 'competitive / ranked' },
    });
    fireEvent.change(screen.getByLabelText('Camera'), {
      target: { value: 'third-person' },
    });
    fireEvent.change(screen.getByLabelText('Engine target'), {
      target: { value: 'unreal' },
    });
    fireEvent.change(screen.getByLabelText('Input'), {
      target: { value: 'controller-first' },
    });
    fireEvent.change(screen.getByLabelText('Session'), {
      target: { value: '15-30 minutes' },
    });
    fireEvent.change(screen.getByLabelText('Audience'), {
      target: { value: 'teen co-op players' },
    });
    fireEvent.change(screen.getByLabelText('Emotional goal'), {
      target: { value: 'tension into mastery' },
    });
    fireEvent.change(screen.getByLabelText('Monetization'), {
      target: { value: 'ethical cosmetics' },
    });
    fireEvent.change(screen.getByLabelText('Art style'), {
      target: { value: 'stylized dark fantasy' },
    });
    fireEvent.change(screen.getByLabelText('Inspirations'), {
      target: { value: 'Hades, Remnant 2, Monster Hunter' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Behavior tree' }));
    fireEvent.click(screen.getByRole('button', { name: 'Level viewport' }));
    fireEvent.click(screen.getByTestId('create-project'));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Dungeon crawler',
        metadata: expect.objectContaining({
          gameDesign: expect.objectContaining({
            genre: 'mobile roguelike dungeon crawler',
            playerMode: 'co-op',
            platforms: ['console'],
            dimensionality: '3D',
            designEmphasis: 'competitive / ranked',
            camera: 'third-person',
            engine: 'unreal',
            inputModel: ['controller-first'],
            sessionLength: '15-30 minutes',
            audienceAge: 'teen co-op players',
            emotionalGoal: 'tension into mastery',
            monetization: 'ethical cosmetics',
            artStyle: 'stylized dark fantasy',
            inspirations: ['Hades', 'Remnant 2', 'Monster Hunter'],
            editorSurfaces: expect.arrayContaining([
              'gameplay-viewport',
              'logic-graph',
              'production-board',
              'behavior-tree',
              'level-viewport',
            ]),
          }),
        }),
      }),
    );
  });

  it('clears game art bible metadata when freeform is selected in multi mode', () => {
    const onCreate = vi.fn();
    render(
      <NewProjectPanel
        skills={skills}
        gameArtBibles={gameArtBibles}
        defaultGameArtBibleId="clay"
        templates={[]}
        promptTemplates={[]}
        onCreate={onCreate}
      />,
    );

    fireEvent.change(screen.getByTestId('new-project-name'), {
      target: { value: 'Freeform concept' },
    });
    fireEvent.click(screen.getByTestId('game-art-bible-trigger'));
    fireEvent.click(screen.getByRole('tab', { name: 'Multi' }));
    fireEvent.click(screen.getByRole('option', { name: /Neon Raid/i }));
    expect(screen.getByTestId('game-art-bible-trigger').textContent).toContain('Arcane Forge');
    expect(screen.getByTestId('game-art-bible-trigger').textContent).toContain('+1');

    fireEvent.click(screen.getByRole('option', { name: /None — freeform game style/i }));
    expect(screen.getByTestId('game-art-bible-trigger').textContent).toContain('None — freeform game style');
    expect(screen.getByTestId('game-art-bible-trigger').textContent ?? '').not.toContain('+');

    fireEvent.click(screen.getByTestId('create-project'));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Freeform concept',
        gameArtBibleId: null,
        metadata: expect.not.objectContaining({
          inspirationGameArtBibleIds: expect.anything(),
        }),
      }),
    );
  });

  it('stores canonical inspiration game art bible ids in the create payload', () => {
    const onCreate = vi.fn();
    render(
      <NewProjectPanel
        skills={skills}
        gameArtBibles={gameArtBibles}
        defaultGameArtBibleId="clay"
        templates={[]}
        promptTemplates={[]}
        onCreate={onCreate}
      />,
    );

    fireEvent.change(screen.getByTestId('new-project-name'), {
      target: { value: 'Inspired concept' },
    });
    fireEvent.click(screen.getByTestId('game-art-bible-trigger'));
    fireEvent.click(screen.getByRole('tab', { name: 'Multi' }));
    fireEvent.click(screen.getByRole('option', { name: /Neon Raid/i }));
    fireEvent.click(screen.getByTestId('create-project'));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Inspired concept',
        gameArtBibleId: 'clay',
        metadata: expect.objectContaining({
          inspirationGameArtBibleIds: ['noir'],
        }),
      }),
    );
  });

  it('falls back to the generated default title when the playable-concept name is blank', () => {
    const onCreate = vi.fn();
    render(
      <NewProjectPanel
        skills={skills}
        gameArtBibles={gameArtBibles}
        defaultGameArtBibleId={null}
        templates={[]}
        promptTemplates={[]}
        onCreate={onCreate}
      />,
    );

    fireEvent.change(screen.getByTestId('new-project-name'), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByTestId('create-project'));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: expect.stringMatching(/^Playable concept\b/),
        metadata: expect.objectContaining({
          kind: 'prototype',
          fidelity: 'high-fidelity',
        }),
      }),
    );
  });

  it('saves live game artifact creation with prototype kind, live-artifact intent, and fidelity metadata', () => {
    const onCreate = vi.fn();
    render(
      <NewProjectPanel
        skills={skills}
        gameArtBibles={gameArtBibles}
        defaultGameArtBibleId="clay"
        templates={[]}
        promptTemplates={[]}
        onCreate={onCreate}
        connectors={[]}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Live ops center' }));
    fireEvent.change(screen.getByTestId('new-project-name'), {
      target: { value: 'Realtime artifact payload' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Playable wireframe' }));
    fireEvent.click(screen.getByTestId('create-project'));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Realtime artifact payload',
        metadata: expect.objectContaining({
          kind: 'prototype',
          intent: 'live-artifact',
          fidelity: 'wireframe',
        }),
      }),
    );
  });

  it('saves deck creation with speaker notes metadata when the toggle is enabled', () => {
    const onCreate = vi.fn();
    render(
      <NewProjectPanel
        skills={skills}
        gameArtBibles={gameArtBibles}
        defaultGameArtBibleId="clay"
        templates={[]}
        promptTemplates={[]}
        onCreate={onCreate}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Game pitch / GDD' }));
    fireEvent.change(screen.getByTestId('new-project-name'), {
      target: { value: 'Deck speaker notes payload' },
    });
    fireEvent.click(screen.getByRole('button', { name: /use pitch notes/i }));
    fireEvent.click(screen.getByTestId('create-project'));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Deck speaker notes payload',
        metadata: expect.objectContaining({
          kind: 'deck',
          speakerNotes: true,
        }),
      }),
    );
  });

  it('prevents template creation when there are no saved templates and enables creation once one exists', () => {
    const emptyOnCreate = vi.fn();
    const first = render(
      <NewProjectPanel
        skills={skills}
        gameArtBibles={gameArtBibles}
        defaultGameArtBibleId="clay"
        templates={[]}
        promptTemplates={[]}
        onCreate={emptyOnCreate}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Game template' }));
    const createFromTemplate = screen.getByTestId('create-project') as HTMLButtonElement;
    expect(createFromTemplate.disabled).toBe(true);
    fireEvent.click(createFromTemplate);
    expect(emptyOnCreate).not.toHaveBeenCalled();
    first.unmount();

    const templateOnCreate = vi.fn();
    render(
      <NewProjectPanel
        skills={skills}
        gameArtBibles={gameArtBibles}
        defaultGameArtBibleId="clay"
        templates={templates}
        promptTemplates={[]}
        onCreate={templateOnCreate}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Game template' }));
    fireEvent.change(screen.getByTestId('new-project-name'), {
      target: { value: 'Template creation payload' },
    });
    const createReady = screen.getByTestId('create-project') as HTMLButtonElement;
    expect(createReady.disabled).toBe(false);
    fireEvent.click(createReady);

    expect(templateOnCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Template creation payload',
        metadata: expect.objectContaining({
          kind: 'template',
          templateId: 'tmpl-main-menu',
          templateLabel: 'Main Menu',
        }),
      }),
    );
    expect(templateOnCreate.mock.calls[0]?.[0]).not.toHaveProperty('pendingPrompt');
  });

  it('saves image creation with the selected aspect and trimmed style notes metadata', () => {
    const onCreate = vi.fn();
    render(
      <NewProjectPanel
        skills={skills}
        gameArtBibles={gameArtBibles}
        defaultGameArtBibleId="clay"
        templates={[]}
        promptTemplates={[]}
        onCreate={onCreate}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Image' }));
    fireEvent.change(screen.getByTestId('new-project-name'), {
      target: { value: 'Image payload metadata' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Tall3:4/i }));
    fireEvent.change(screen.getByPlaceholderText('Key art, sprite reference, stylized 3D prop, UI icon set'), {
      target: { value: '  cinematic still life  ' },
    });
    fireEvent.click(screen.getByTestId('create-project'));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Image payload metadata',
        gameArtBibleId: null,
        metadata: expect.objectContaining({
          kind: 'image',
          imageModel: 'gpt-image-2',
          imageAspect: '3:4',
          imageStyle: 'cinematic still life',
        }),
      }),
    );
  });

  it('saves video creation with the selected aspect and duration metadata', () => {
    const onCreate = vi.fn();
    render(
      <NewProjectPanel
        skills={skills}
        gameArtBibles={gameArtBibles}
        defaultGameArtBibleId="clay"
        templates={[]}
        promptTemplates={[]}
        onCreate={onCreate}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Video' }));
    fireEvent.change(screen.getByTestId('new-project-name'), {
      target: { value: 'Video payload metadata' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Portrait9:16/i }));
    fireEvent.change(screen.getByLabelText('Length'), {
      target: { value: '10' },
    });
    fireEvent.click(screen.getByTestId('create-project'));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Video payload metadata',
        gameArtBibleId: null,
        metadata: expect.objectContaining({
          kind: 'video',
          videoModel: 'doubao-seedance-2-0-260128',
          videoAspect: '9:16',
          videoLength: 10,
        }),
      }),
    );
  });

  it('saves audio creation with the selected duration and trimmed voice metadata', () => {
    const onCreate = vi.fn();
    render(
      <NewProjectPanel
        skills={skills}
        gameArtBibles={gameArtBibles}
        defaultGameArtBibleId="clay"
        templates={[]}
        promptTemplates={[]}
        onCreate={onCreate}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Audio' }));
    fireEvent.change(screen.getByTestId('new-project-name'), {
      target: { value: 'Audio payload metadata' },
    });
    fireEvent.change(screen.getByLabelText('Duration'), {
      target: { value: '30' },
    });
    fireEvent.change(screen.getByPlaceholderText('Provider voice id, optional'), {
      target: { value: '  soft contralto guide  ' },
    });
    fireEvent.click(screen.getByTestId('create-project'));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Audio payload metadata',
        gameArtBibleId: null,
        metadata: expect.objectContaining({
          kind: 'audio',
          audioKind: 'speech',
          audioModel: 'minimax-tts',
          audioDuration: 30,
          voice: 'soft contralto guide',
        }),
      }),
    );
  });
});
