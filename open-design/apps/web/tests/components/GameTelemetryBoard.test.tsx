// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GameTelemetryBoard } from '../../src/components/GameTelemetryBoard';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe('GameTelemetryBoard', () => {
  it('renders project telemetry insights and heatmap cells only when the production surface is visible', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/playtest-presets')) return Promise.resolve(playtestPresetsResponse([]));
      return Promise.resolve(telemetryResponse());
    });
    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = render(<GameTelemetryBoard projectId="project-1" visible={false} />);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText('Telemetry Board')).toBeNull();

    rerender(<GameTelemetryBoard projectId="project-1" visible />);

    await waitFor(() => expect(screen.getByText('Telemetry Board')).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/game-deliverables/project-1/game-telemetry/insights?limit=500',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(screen.getByText('6 events')).toBeTruthy();
    expect(screen.getByText('Player frustration hotspot detected')).toBeTruthy();
    expect(screen.getByText('Tune the sniper tell and add recovery cover.')).toBeTruthy();
    expect(screen.getByText('arena')).toBeTruthy();
    expect(screen.getByText('3 signals near 500, 350')).toBeTruthy();
  });

  it('runs a persona playtest from the production board and renders persona reports', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/game-telemetry/insights')) return Promise.resolve(telemetryResponse());
      if (url.includes('/playtest-presets')) return Promise.resolve(playtestPresetsResponse([]));
      if (url.includes('/playtest-simulation')) {
        expect(init?.method).toBe('POST');
        expect(JSON.parse(String(init?.body))).toMatchObject({
          runs: 5,
          focus: 'combat',
          personas: ['casual', 'explorer'],
        });
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            fileName: 'arena.gameview.json',
            mode: 'viewport-artifact',
            runs: 5,
            focus: 'combat',
            summary: 'Ran 5 deterministic playtest passes. Persona reports: casual, explorer.',
            metrics: [],
            findings: [],
            personaReports: [
              {
                id: 'casual',
                label: 'Casual Player',
                motivation: 'Look for a clear objective.',
                completionTimeSec: 240,
                deaths: 0,
                frustrationMoments: [],
                unusedContent: [],
                balanceIssues: ['Objective hint is readable for first-session players.'],
                acceptedSignals: ['Runtime loop is detectable.'],
                risk: 'low',
              },
              {
                id: 'explorer',
                label: 'Explorer',
                motivation: 'Probe optional routes.',
                completionTimeSec: 270,
                deaths: 1,
                frustrationMoments: ['Optional route lacks a strong reward tell.'],
                unusedContent: [],
                balanceIssues: [],
                acceptedSignals: ['Objective signal is readable.'],
                risk: 'medium',
              },
            ],
          }),
        });
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<GameTelemetryBoard projectId="project-1" visible />);

    await waitFor(() => expect(screen.getByText('Telemetry Board')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Run persona playtest' }));

    await waitFor(() => expect(screen.getByText('Casual Player')).toBeTruthy());
    expect(screen.getAllByText('Explorer').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Objective hint is readable/)).toBeTruthy();
    expect(screen.getByText(/Optional route lacks a strong reward tell/)).toBeTruthy();
  });

  it('routes persona playtests through the selected mode and target artifact', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/game-telemetry/insights')) return Promise.resolve(telemetryResponse());
      if (url.includes('/playtest-presets')) return Promise.resolve(playtestPresetsResponse([]));
      if (url.includes('/runtime-playtest/browser')) {
        expect(init?.method).toBe('POST');
        expect(JSON.parse(String(init?.body))).toMatchObject({
          runs: 5,
          focus: 'combat',
          fileName: 'runtime-player-bot.html',
          personas: ['casual', 'explorer'],
        });
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            fileName: 'runtime-player-bot.html',
            mode: 'headless-browser',
            runs: 5,
            focus: 'combat',
            summary: 'Ran 5 daemon headless-browser player-bot passes.',
            metrics: [],
            findings: [],
            botActions: [
              {
                id: 'keyboard-probe',
                label: 'Keyboard probe',
                target: 'canvas',
                status: 'passed',
                evidence: 'Movement input changed game state.',
              },
            ],
            personaReports: [
              {
                id: 'casual',
                label: 'Casual Player',
                motivation: 'Check first-session readability.',
                completionTimeSec: 220,
                deaths: 0,
                frustrationMoments: [],
                unusedContent: [],
                balanceIssues: [],
                acceptedSignals: ['HUD objective remains visible after browser input.'],
                risk: 'low',
              },
            ],
          }),
        });
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<GameTelemetryBoard projectId="project-1" visible />);

    await waitFor(() => expect(screen.getByText('Telemetry Board')).toBeTruthy());
    fireEvent.click(screen.getByRole('radio', { name: /Browser Bot/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Target Artifact' }), {
      target: { value: 'runtime-player-bot.html' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Run persona playtest' }));

    await waitFor(() => expect(screen.getByText(/Browser Bot on runtime-player-bot.html/)).toBeTruthy());
    expect(screen.getByText(/HUD objective remains visible after browser input/)).toBeTruthy();
  });

  it('sends the selected persona setup to autonomous iteration without passing runtime HTML as a viewport', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/game-telemetry/insights')) return Promise.resolve(telemetryResponse());
      if (url.includes('/playtest-presets')) return Promise.resolve(playtestPresetsResponse([]));
      if (url.includes('/autonomous-iteration')) {
        expect(init?.method).toBe('POST');
        const body = JSON.parse(String(init?.body));
        expect(body).toMatchObject({
          focus: 'combat',
          maxActions: 10,
          includeTelemetry: true,
          includePlaytest: true,
          includeWorldSimulation: true,
          personas: ['casual', 'explorer'],
        });
        expect(body).not.toHaveProperty('fileName');
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            summary: 'Synthesized 2 prioritized game-studio iteration actions using 2 persona reports; top priority is p1.',
            focus: 'combat',
            generatedAt: 1700000000000,
            sources: {
              telemetryInsights: 1,
              playtestFindings: 1,
              personaReports: 2,
              worldFindings: 0,
            },
            actions: [
              {
                id: 'playtest-persona-explorer',
                priority: 'p1',
                owner: 'level-design',
                source: 'playtest-simulation',
                title: 'Explorer persona reports medium-risk session friction',
                evidence: 'Optional reward route is under-signposted.',
                rationale: 'Persona playtesting captures motivation-specific friction.',
                recommendation: 'Add a stronger optional route reward tell before the next browser-bot pass.',
              },
            ],
          }),
        });
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<GameTelemetryBoard projectId="project-1" visible />);

    await waitFor(() => expect(screen.getByText('Telemetry Board')).toBeTruthy());
    fireEvent.click(screen.getByRole('radio', { name: /Browser Bot/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Target Artifact' }), {
      target: { value: 'runtime-player-bot.html' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send to iteration' }));

    await waitFor(() => expect(screen.getByText(/Synthesized 2 prioritized game-studio iteration actions/)).toBeTruthy());
    expect(screen.getByText('level-design')).toBeTruthy();
    expect(screen.getByText(/Add a stronger optional route reward tell/)).toBeTruthy();
  });

  it('sends the selected persona setup to the balance loop without passing runtime HTML as a viewport', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/game-telemetry/insights')) return Promise.resolve(telemetryResponse());
      if (url.includes('/playtest-presets')) return Promise.resolve(playtestPresetsResponse([]));
      if (url.includes('/balance-loop/adjustments/hud-scale/decision')) {
        expect(init?.method).toBe('POST');
        const body = JSON.parse(String(init?.body));
        expect(body).toMatchObject({
          decision: 'accepted',
          adjustment: {
            id: 'hud-scale',
            targetFileName: 'combat.systems.json',
            suggestedValue: 1.1,
          },
        });
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            projectId: 'project-1',
            decision: 'accepted',
            appliedCount: 1,
            systemFileName: 'combat.systems.json',
            updatedAt: 1700000000001,
            adjustment: {
              ...body.adjustment,
              applyStatus: 'applied',
            },
          }),
        });
      }
      if (url.includes('/balance-loop')) {
        expect(init?.method).toBe('POST');
        const body = JSON.parse(String(init?.body));
        expect(body).toMatchObject({
          focus: 'combat',
          maxAdjustments: 8,
          includeTelemetry: true,
          includePlaytest: true,
          apply: false,
          personas: ['casual', 'explorer'],
        });
        expect(body).not.toHaveProperty('fileName');
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            summary: 'Generated 1 automatic balance adjustment for combat; 0 changes held for review.',
            focus: 'combat',
            generatedAt: 1700000000000,
            appliedCount: 0,
            sources: {
              telemetryInsights: 1,
              playtestFindings: 1,
              systemTuningKeys: 3,
            },
            adjustments: [
              {
                id: 'hud-scale',
                priority: 'p1',
                owner: 'game-ui-hud',
                source: 'playtest-simulation',
                category: 'accessibility',
                title: 'Increase combat HUD scale',
                evidence: 'Persona pass reported combat readability friction.',
                rationale: 'HUD clarity should improve before the next browser-bot pass.',
                recommendation: 'Increase combat HUD scale before the next playtest review.',
                targetFileName: 'combat.systems.json',
                targetPath: ['tuning', 'hudScale'],
                currentValue: 1,
                suggestedValue: 1.1,
                applyStatus: 'suggested',
              },
            ],
          }),
        });
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<GameTelemetryBoard projectId="project-1" visible />);

    await waitFor(() => expect(screen.getByText('Telemetry Board')).toBeTruthy());
    fireEvent.click(screen.getByRole('radio', { name: /Browser Bot/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Target Artifact' }), {
      target: { value: 'runtime-player-bot.html' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send to balance' }));

    await waitFor(() => expect(screen.getByText(/Generated 1 automatic balance adjustment/)).toBeTruthy());
    expect(screen.getByText('game-ui-hud')).toBeTruthy();
    expect(screen.getByText(/Increase combat HUD scale before the next playtest review/)).toBeTruthy();
    expect(screen.getByText('combat.systems.json / tuning.hudScale')).toBeTruthy();
    expect(screen.getByText('1 -> 1.1')).toBeTruthy();
    expect(screen.getByText('suggested')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(screen.getByText('Applied to combat.systems.json')).toBeTruthy());
  });

  it('saves, applies, persists, and removes persona playtest presets per project', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/game-telemetry/insights')) return Promise.resolve(telemetryResponse());
      if (url.includes('/playtest-presets')) {
        if (init?.method === 'PUT') {
          return Promise.resolve(playtestPresetsResponse(JSON.parse(String(init.body)).presets));
        }
        return Promise.reject(new Error('offline preset store'));
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const view = render(<GameTelemetryBoard projectId="project-1" visible />);

    await waitFor(() => expect(screen.getByText('Telemetry Board')).toBeTruthy());
    fireEvent.click(screen.getByRole('radio', { name: /Browser Bot/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Target Artifact' }), {
      target: { value: 'runtime-player-bot.html' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Preset Name' }), {
      target: { value: 'Browser smoke' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Preset' }));

    expect(screen.getByRole('button', { name: 'Browser smoke' })).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem('agds:persona-playtest-presets:project-1') ?? '[]')[0]).toMatchObject({
      name: 'Browser smoke',
      mode: 'headless-browser',
      fileName: 'runtime-player-bot.html',
      personas: ['casual', 'explorer'],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/game-deliverables/project-1/playtest-presets',
      expect.objectContaining({
        method: 'PUT',
        body: expect.stringContaining('runtime-player-bot.html'),
      }),
    );

    fireEvent.click(screen.getByRole('radio', { name: /Scene Simulation/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Target Artifact' }), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Browser smoke' }));

    expect((screen.getByRole('radio', { name: /Browser Bot/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('textbox', { name: 'Target Artifact' }) as HTMLInputElement).value).toBe(
      'runtime-player-bot.html',
    );

    view.unmount();
    render(<GameTelemetryBoard projectId="project-1" visible />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Browser smoke' })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Remove Browser smoke' }));
    expect(screen.queryByRole('button', { name: 'Browser smoke' })).toBeNull();
    expect(window.localStorage.getItem('agds:persona-playtest-presets:project-1')).toBe('[]');
  });

  it('hydrates shared persona playtest presets from the project daemon store', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/game-telemetry/insights')) return Promise.resolve(telemetryResponse());
      if (url.includes('/playtest-presets')) {
        return Promise.resolve(playtestPresetsResponse([
          {
            id: 'preset-shared',
            name: 'Shared browser bot',
            mode: 'headless-browser',
            fileName: 'shared-runtime.html',
            focus: 'combat',
            runs: 5,
            personas: ['speedrunner', 'rage-quitter'],
            updatedAt: 1700000000000,
          },
        ]));
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<GameTelemetryBoard projectId="project-1" visible />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Shared browser bot' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Shared browser bot' }));

    expect((screen.getByRole('radio', { name: /Browser Bot/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('checkbox', { name: /Speedrunner/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('checkbox', { name: /Rage-Quit Risk/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('textbox', { name: 'Target Artifact' }) as HTMLInputElement).value).toBe(
      'shared-runtime.html',
    );
  });
});

function telemetryResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      generatedAt: 10,
      summary: {
        total: 6,
        byType: { death: 2, checkpoint: 1 },
        byScene: { arena: 6 },
        sessionCount: 2,
        latestTimestamp: 1700000000000,
      },
      insights: [
        {
          id: 'frustration-hotspot',
          severity: 'medium',
          category: 'frustration',
          title: 'Player frustration hotspot detected',
          evidence: 'Two deaths near the bridge.',
          recommendation: 'Tune the sniper tell and add recovery cover.',
        },
      ],
      heatmap: [{ sceneId: 'arena', x: 500, y: 350, count: 3 }],
    }),
  };
}

function playtestPresetsResponse(presets: unknown[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ projectId: 'project-1', presets }),
  };
}
