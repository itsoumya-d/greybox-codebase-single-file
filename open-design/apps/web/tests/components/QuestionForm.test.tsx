// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatFormAnswers } from '../../src/artifacts/question-form';
import { QuestionFormView, parseSubmittedAnswers } from '../../src/components/QuestionForm';
import type { QuestionForm } from '../../src/artifacts/question-form';

const form: QuestionForm = {
  id: 'discovery',
  title: 'Quick brief',
  questions: [
    {
      id: 'tone',
      label: 'Visual tone (pick up to two)',
      type: 'checkbox',
      options: ['Editorial / magazine', 'Modern minimal', 'Soft gradients'],
      maxSelections: 2,
      required: true,
    },
  ],
};

describe('QuestionFormView', () => {
  afterEach(() => cleanup());

  it('updates locked answers when submitted history arrives after the initial render', () => {
    const onSubmit = vi.fn();
    const { container, rerender } = render(
      <QuestionFormView form={form} interactive submittedAnswers={undefined} onSubmit={onSubmit} />,
    );

    expect(container.querySelectorAll('input[type="checkbox"]:checked')).toHaveLength(0);

    rerender(
      <QuestionFormView
        form={form}
        interactive={false}
        submittedAnswers={{ tone: ['Editorial / magazine', 'Modern minimal'] }}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByText('answered')).toBeTruthy();
    expect(container.querySelectorAll('input[type="checkbox"]:checked')).toHaveLength(2);
  });

  it('emits game-brief answer headers and keeps legacy form-answer parsing', () => {
    const submitted = formatFormAnswers(form, { tone: ['Editorial / magazine'] });

    expect(submitted).toContain('[game brief answers — discovery]');
    expect(parseSubmittedAnswers(form, submitted)).toEqual({ tone: ['Editorial / magazine'] });
    expect(parseSubmittedAnswers(form, '[form answers — discovery]\n- Visual tone (pick up to two): Modern minimal')).toEqual({
      tone: ['Modern minimal'],
    });
  });
});
