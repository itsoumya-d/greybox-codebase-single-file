// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StudioModeStrip } from '../../src/components/StudioModeStrip';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('StudioModeStrip', () => {
  it('renders game-engine studio surfaces and switches modes', () => {
    const onChange = vi.fn();
    render(<StudioModeStrip value="gameplay" onChange={onChange} />);

    expect(screen.getByTestId('studio-mode-strip').textContent).toContain('Gameplay');
    expect(screen.getByRole('tab', { name: 'Gameplay' }).getAttribute('aria-selected')).toBe('true');

    fireEvent.click(screen.getByRole('tab', { name: 'Logic Graph' }));

    expect(onChange).toHaveBeenCalledWith('logic-graph');
  });
});
