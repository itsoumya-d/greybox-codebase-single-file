// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import type { ReactNode } from 'react';

export interface StepperStep {
  label: string;
  description?: string;
}

interface StepperProps {
  steps: StepperStep[];
  activeIndex: number;
  doneIndices?: number[];
}

export function Stepper({ steps, activeIndex, doneIndices = [] }: StepperProps): ReactNode {
  return (
    <ol className="gb-stepper" data-testid="stepper">
      {steps.map((step, index) => {
        const isActive = index === activeIndex;
        const isDone = doneIndices.includes(index);
        const classes = ['gb-step'];
        if (isActive) classes.push('gb-step-active');
        if (isDone) classes.push('gb-step-done');
        return (
          <li key={step.label} className={classes.join(' ')} aria-current={isActive ? 'step' : undefined}>
            <span className="gb-step-index">{isDone ? '✓' : index + 1}</span>
            <span>{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
