// SPDX-License-Identifier: Apache-2.0
'use client';
/**
 * Right-rail property inspector.
 *
 * Branches:
 *  - A component is selected → render fields driven by {@link COMPONENT_FIELDS}.
 *  - A screen (but no component) is selected → render screen meta editors.
 *  - Nothing selected → render project-level meta hint.
 *
 * Every field commits via a `component/update` or `screen/update` action; the
 * provider's debounced REST PUT picks the change up.
 */
import { Fragment } from 'react';

import type { Component, ComponentKind, Screen, ScreenKind } from '@greybox/schema';

import {
  COMPONENT_FIELDS,
  PARTIAL_INSPECTOR_KINDS,
  type FieldSpec,
} from '../lib/componentFields.js';
import { getScreen, getSelectedComponent } from '../store/projectStore.js';
import { useProjectEditor } from './ProjectContext.js';

const SCREEN_KIND_OPTIONS: readonly ScreenKind[] = [
  'main-menu',
  'gameplay',
  'cutscene',
  'pause',
  'game-over',
  'loading',
  'settings',
  'inventory',
  'shop',
  'credits',
  'custom',
];

export function PropertyInspector() {
  const { state, dispatch } = useProjectEditor();
  const component = getSelectedComponent(state);
  const screen = getScreen(state, state.selectedScreenId);

  if (component && screen) {
    return (
      <div className='design-inspector' data-testid='design-inspector'>
        <h3 className='design-h3'>Component: {component.kind}</h3>
        <ComponentFields component={component} screenId={screen.id} />
        <button
          type='button'
          className='design-btn design-btn--danger'
          data-testid='delete-component'
          onClick={() =>
            dispatch({
              type: 'component/delete',
              screenId: screen.id,
              componentId: component.id,
            })
          }
        >
          Delete component
        </button>
      </div>
    );
  }

  if (screen) {
    return (
      <div className='design-inspector' data-testid='design-inspector'>
        <h3 className='design-h3'>Screen meta</h3>
        <Field
          label='Name'
          inputId={`screen-name-${screen.id}`}
          input={
            <input
              data-testid='screen-name-input'
              type='text'
              value={screen.name}
              onChange={(e) =>
                dispatch({
                  type: 'screen/update',
                  screenId: screen.id,
                  patch: { name: e.target.value },
                })
              }
            />
          }
        />
        <Field
          label='Kind'
          inputId={`screen-kind-${screen.id}`}
          input={
            <select
              data-testid='screen-kind-input'
              value={screen.kind}
              onChange={(e) =>
                dispatch({
                  type: 'screen/update',
                  screenId: screen.id,
                  patch: { kind: e.target.value as ScreenKind },
                })
              }
            >
              {SCREEN_KIND_OPTIONS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          }
        />
        <Field
          label='Background color'
          inputId={`screen-bg-${screen.id}`}
          input={
            <input
              type='color'
              value={
                screen.background?.type === 'color' ? screen.background.color : '#0F0F12'
              }
              onChange={(e) =>
                dispatch({
                  type: 'screen/update',
                  screenId: screen.id,
                  patch: { background: { type: 'color', color: e.target.value } },
                })
              }
            />
          }
        />
        <Field
          label='Notes'
          inputId={`screen-notes-${screen.id}`}
          input={
            <textarea
              data-testid='screen-notes-input'
              value={screen.notes ?? ''}
              onChange={(e) =>
                dispatch({
                  type: 'screen/update',
                  screenId: screen.id,
                  patch: { notes: e.target.value },
                })
              }
            />
          }
        />
      </div>
    );
  }

  return (
    <div className='design-inspector' data-testid='design-inspector'>
      <p className='design-muted'>Select a screen or component to edit.</p>
    </div>
  );
}

function ComponentFields({
  component,
  screenId,
}: {
  component: Component;
  screenId: Screen['id'];
}) {
  const { dispatch } = useProjectEditor();
  const fields = COMPONENT_FIELDS[component.kind as ComponentKind];
  const isPartial = PARTIAL_INSPECTOR_KINDS.includes(component.kind);

  // Name + visible are common across every Component.
  const onCommonChange = (patch: Record<string, unknown>) =>
    dispatch({ type: 'component/update', screenId, componentId: component.id, patch });

  return (
    <Fragment>
      <Field
        label='Name'
        inputId={`comp-name-${component.id}`}
        input={
          <input
            data-testid='comp-name-input'
            type='text'
            value={component.name}
            onChange={(e) => onCommonChange({ name: e.target.value })}
          />
        }
      />
      <Field
        label='Visible'
        inputId={`comp-visible-${component.id}`}
        input={
          <input
            type='checkbox'
            data-testid='comp-visible-input'
            checked={component.visible}
            onChange={(e) => onCommonChange({ visible: e.target.checked })}
          />
        }
      />
      <Field
        label='Position X'
        inputId={`comp-x-${component.id}`}
        input={
          <input
            type='number'
            data-testid='comp-x-input'
            value={component.transform.position.x}
            onChange={(e) =>
              onCommonChange({
                transform: {
                  ...component.transform,
                  position: {
                    ...component.transform.position,
                    x: Number(e.target.value),
                  },
                },
              })
            }
          />
        }
      />
      <Field
        label='Position Y'
        inputId={`comp-y-${component.id}`}
        input={
          <input
            type='number'
            data-testid='comp-y-input'
            value={component.transform.position.y}
            onChange={(e) =>
              onCommonChange({
                transform: {
                  ...component.transform,
                  position: {
                    ...component.transform.position,
                    y: Number(e.target.value),
                  },
                },
              })
            }
          />
        }
      />
      {fields.map((field) => (
        <KindField
          key={field.key}
          field={field}
          component={component}
          onChange={(patch) => onCommonChange(patch)}
        />
      ))}
      {isPartial && (
        <p className='design-muted' data-testid='partial-inspector-note'>
          This kind has a limited inspector — nested items can be edited via the
          JSON view (coming soon).
        </p>
      )}
    </Fragment>
  );
}

interface FieldRowProps {
  label: string;
  inputId: string;
  input: React.ReactNode;
}

function Field({ label, inputId, input }: FieldRowProps) {
  return (
    <label className='design-field' htmlFor={inputId}>
      <span className='design-field__label'>{label}</span>
      <span className='design-field__input'>{input}</span>
    </label>
  );
}

function KindField({
  field,
  component,
  onChange,
}: {
  field: FieldSpec;
  component: Component;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const value = (component as unknown as Record<string, unknown>)[field.key];
  const inputId = `comp-${component.id}-${field.key}`;

  switch (field.kind) {
    case 'string':
      return (
        <Field
          label={field.label}
          inputId={inputId}
          input={
            <input
              id={inputId}
              data-testid={`field-${field.key}`}
              type='text'
              value={typeof value === 'string' ? value : ''}
              onChange={(e) => onChange({ [field.key]: e.target.value })}
            />
          }
        />
      );
    case 'text':
      return (
        <Field
          label={field.label}
          inputId={inputId}
          input={
            <textarea
              id={inputId}
              data-testid={`field-${field.key}`}
              value={typeof value === 'string' ? value : ''}
              onChange={(e) => onChange({ [field.key]: e.target.value })}
            />
          }
        />
      );
    case 'number':
      return (
        <Field
          label={field.label}
          inputId={inputId}
          input={
            <input
              id={inputId}
              data-testid={`field-${field.key}`}
              type='number'
              value={typeof value === 'number' ? value : ''}
              onChange={(e) => {
                const raw = e.target.value;
                onChange({ [field.key]: raw === '' ? undefined : Number(raw) });
              }}
            />
          }
        />
      );
    case 'boolean':
      return (
        <Field
          label={field.label}
          inputId={inputId}
          input={
            <input
              id={inputId}
              data-testid={`field-${field.key}`}
              type='checkbox'
              checked={Boolean(value)}
              onChange={(e) => onChange({ [field.key]: e.target.checked })}
            />
          }
        />
      );
    case 'color':
      return (
        <Field
          label={field.label}
          inputId={inputId}
          input={
            <input
              id={inputId}
              data-testid={`field-${field.key}`}
              type='color'
              value={typeof value === 'string' ? value : '#ffffff'}
              onChange={(e) => onChange({ [field.key]: e.target.value })}
            />
          }
        />
      );
    case 'enum':
      return (
        <Field
          label={field.label}
          inputId={inputId}
          input={
            <select
              id={inputId}
              data-testid={`field-${field.key}`}
              value={typeof value === 'string' ? value : (field.options?.[0] ?? '')}
              onChange={(e) => onChange({ [field.key]: e.target.value })}
            >
              {(field.options ?? []).map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          }
        />
      );
    default:
      return null;
  }
}
