// @vitest-environment jsdom

if (typeof HTMLElement.prototype.scrollTo !== 'function') {
  HTMLElement.prototype.scrollTo = function (
    options?: ScrollToOptions | number,
    _y?: number,
  ) {
    if (typeof options === 'object' && options !== null) {
      if (options.top !== undefined) this.scrollTop = options.top;
      if (options.left !== undefined) this.scrollLeft = options.left;
    }
  };
}

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ChatPane } from '../../src/components/ChatPane';
import type { PreviewComment } from '../../src/types';

describe('ChatPane comment notifications', () => {
  afterEach(() => cleanup());

  it('badges new preview comments while Chat is active and clears when Comments is opened', async () => {
    const { rerender } = renderChatPane([]);

    rerender(chatPane([previewComment({ id: 'c1', updatedAt: 2 })]));

    await waitFor(() => expect(screen.getByTestId('comment-notification-badge').textContent).toBe('1'));
    expect(screen.getByRole('tab', { name: 'Comments (1 new)' })).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Comments (1 new)' }));

    await waitFor(() => expect(screen.queryByTestId('comment-notification-badge')).toBeNull());
    expect(screen.getByRole('tab', { name: 'Comments' })).toBeTruthy();
  });

  it('does not badge initial comment load until a comment changes', async () => {
    const initial = previewComment({ id: 'c1', updatedAt: 2 });
    const { rerender } = renderChatPane([initial]);

    expect(screen.queryByTestId('comment-notification-badge')).toBeNull();

    rerender(chatPane([{ ...initial, note: 'Move the spawn marker left.', updatedAt: 3 }]));

    await waitFor(() => expect(screen.getByTestId('comment-notification-badge').textContent).toBe('1'));
  });
});

function renderChatPane(previewComments: PreviewComment[]) {
  return render(chatPane(previewComments));
}

function chatPane(previewComments: PreviewComment[]) {
  return (
    <ChatPane
      messages={[]}
      streaming={false}
      error={null}
      projectId="project-1"
      projectFiles={[]}
      previewComments={previewComments}
      onEnsureProject={async () => 'project-1'}
      onSend={() => {}}
      onStop={() => {}}
      conversations={[]}
      activeConversationId="conversation-1"
      onSelectConversation={() => {}}
      onDeleteConversation={() => {}}
    />
  );
}

function previewComment(overrides: Partial<PreviewComment> = {}): PreviewComment {
  return {
    id: 'c1',
    projectId: 'project-1',
    conversationId: 'conversation-1',
    filePath: 'index.html',
    elementId: 'spawn-card',
    selector: '#spawn-card',
    label: 'Spawn card',
    text: 'Spawn',
    position: { x: 10, y: 20, width: 120, height: 40 },
    htmlHint: '<section id="spawn-card">Spawn</section>',
    note: 'Move the spawn marker.',
    thread: [{ authorId: 'designer-1', body: 'Move the spawn marker.', createdAt: 1 }],
    status: 'open',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}
