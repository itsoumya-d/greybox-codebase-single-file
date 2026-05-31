// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { todoPlanItemId } from '@ai-game-design-studio/realtime/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssistantMessage } from '../../src/components/AssistantMessage';
import type { AgentEvent, ChatMessage } from '../../src/types';

function messageWithEvents(events: AgentEvent[]): ChatMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: '',
    events,
    startedAt: 1_000,
    endedAt: 3_000,
  };
}

describe('AssistantMessage unfinished todo state', () => {
  afterEach(() => cleanup());

  it('keeps Done for a completed latest TodoWrite fixture', () => {
    render(
      <AssistantMessage
        message={messageWithEvents([
          {
            kind: 'tool_use',
            id: 'todo-1',
            name: 'TodoWrite',
            input: { todos: [{ content: 'Ship layout', status: 'completed' }] },
          },
        ])}
        streaming={false}
        projectId="project-1"
        isLast
      />,
    );

    expect(screen.getByText('Done')).toBeTruthy();
    expect(screen.queryByText('Stopped with unfinished work')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Continue studio work' })).toBeNull();
  });

  it('shows unfinished state and passes unfinished studio todos to the continue callback', () => {
    const onContinue = vi.fn();
    render(
      <AssistantMessage
        message={messageWithEvents([
          {
            kind: 'tool_use',
            id: 'todo-1',
            name: 'TodoWrite',
            input: {
              todos: [
                { content: 'Draft layout', status: 'completed' },
                {
                  content: 'Build components',
                  status: 'in_progress',
                  activeForm: 'Building components',
                },
                { content: 'Run QA', status: 'pending' },
              ],
            },
          },
        ])}
        streaming={false}
        projectId="project-1"
        isLast
        onContinueRemainingTasks={onContinue}
      />,
    );

    expect(screen.getByText('Stopped with unfinished work')).toBeTruthy();
    expect(screen.getByText('2 studio task(s) remain')).toBeTruthy();
    const remainingList = screen.getByText('2 studio task(s) remain').closest('.unfinished-todos');
    expect(remainingList).not.toBeNull();
    expect(within(remainingList as HTMLElement).getByText('Building components')).toBeTruthy();
    expect(within(remainingList as HTMLElement).getByText('Run QA')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Continue studio work' }));

    expect(onContinue).toHaveBeenCalledWith([
      {
        content: 'Build components',
        status: 'in_progress',
        activeForm: 'Building components',
      },
      { content: 'Run QA', status: 'pending', activeForm: undefined },
    ]);
  });

  it('hides the continue button on older assistant turns', () => {
    render(
      <AssistantMessage
        message={messageWithEvents([
          {
            kind: 'tool_use',
            id: 'todo-1',
            name: 'TodoWrite',
            input: { todos: [{ content: 'Run QA', status: 'pending' }] },
          },
        ])}
        streaming={false}
        projectId="project-1"
        isLast={false}
        onContinueRemainingTasks={vi.fn()}
      />,
    );

    expect(screen.getByText('Stopped with unfinished work')).toBeTruthy();
    expect(screen.getByText('1 studio task(s) remain')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Continue studio work' })).toBeNull();
  });

  it('surfaces shared TodoWrite claim controls from the realtime plan', () => {
    const onClaim = vi.fn();
    const onRelease = vi.fn();
    render(
      <AssistantMessage
        message={messageWithEvents([
          {
            kind: 'tool_use',
            id: 'todo-1',
            name: 'TodoWrite',
            input: {
              todos: [
                { content: 'Build components', status: 'pending' },
                { content: 'Run QA', status: 'in_progress' },
              ],
            },
          },
        ])}
        streaming={false}
        projectId="project-1"
        isLast
        todoPlanItems={[
          {
            id: todoPlanItemId('Build components'),
            body: 'Build components',
            status: 'pending',
            updatedAt: 1,
          },
          {
            id: todoPlanItemId('Run QA'),
            body: 'Run QA',
            status: 'in_progress',
            claimedBy: 'studio-1',
            updatedAt: 2,
          },
        ]}
        todoClaimantId="studio-1"
        onClaimTodo={onClaim}
        onReleaseTodo={onRelease}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Claim Build components' }));
    fireEvent.click(screen.getByRole('button', { name: 'Release Run QA' }));

    expect(onClaim).toHaveBeenCalledWith(todoPlanItemId('Build components'));
    expect(onRelease).toHaveBeenCalledWith(todoPlanItemId('Run QA'));
  });
});
