// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProductAnalyticsNorthStar } from '../../src/components/ProductAnalyticsNorthStar';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ProductAnalyticsNorthStar', () => {
  it('renders the privacy-gated weekly active designers North Star when visible', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: async () => dashboardResponse(),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = render(<ProductAnalyticsNorthStar visible={false} />);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText('North Star')).toBeNull();

    rerender(<ProductAnalyticsNorthStar visible weeks={2} />);

    await waitFor(() => expect(screen.getByText('2 designers this week')).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/product-analytics/dashboard?weeks=2',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(screen.getByText('Weekly Trend')).toBeTruthy();
    expect(screen.getByText('Engine Split')).toBeTruthy();
    expect(screen.getByText('Activation Funnel')).toBeTruthy();
    expect(screen.getByText('Skill Usage')).toBeTruthy();
    expect(screen.getByText('Game Art Bibles')).toBeTruthy();
    expect(screen.getByText('Playtest Personas')).toBeTruthy();
    expect(screen.getByText('Retention')).toBeTruthy();
    expect(screen.getByText('NRR by Cohort')).toBeTruthy();
    expect(screen.getByText('First project')).toBeTruthy();
    expect(screen.getByText('game-hud-system')).toBeTruthy();
    expect(screen.getByText('cozy-sim-art-bible')).toBeTruthy();
    expect(screen.getByText('explorer')).toBeTruthy();
    expect(screen.getByText('50% complete, 1/2 runs')).toBeTruthy();
    expect(screen.getByText('D7')).toBeTruthy();
    expect(screen.getAllByText('100% retained, 2 cohort').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('2026-05')).toBeTruthy();
    expect(screen.getByText('120% NRR, $240 MRR')).toBeTruthy();
    expect(screen.getAllByText('2 designers').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Unity')).toBeTruthy();
    expect(screen.getByText('Unreal')).toBeTruthy();
    expect(screen.getByText('Godot')).toBeTruthy();
    expect(screen.getByText('2 designers, 3 shipments, 2 projects')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Send to Slack/i })).toBeTruthy();
  });

  it('sends the weekly North Star report to Slack from the dashboard action', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/weekly-report/slack')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: async () => '',
          json: async () => ({ delivered: true }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => dashboardResponse(),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ProductAnalyticsNorthStar visible weeks={2} />);

    await waitFor(() => expect(screen.getByRole('button', { name: /Send to Slack/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Send to Slack/i }));

    await waitFor(() => expect(screen.getByText('Sent to Slack')).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/product-analytics/weekly-report/slack?weeks=2',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('shows an explicit opt-in state when metrics telemetry is disabled', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ error: { code: 'TELEMETRY_OPT_IN_REQUIRED' } }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    render(<ProductAnalyticsNorthStar visible />);

    await waitFor(() => expect(screen.getByText('Metrics opt-in required')).toBeTruthy());
    expect(screen.getByText(/Enable anonymous metrics in Settings - Privacy/)).toBeTruthy();
    expect(screen.getByText(/keeps artifact content out of this metric/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Send to Slack/i })).toBeNull();
  });

  it('shows Slack delivery errors without hiding the dashboard', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/weekly-report/slack')) {
        return Promise.resolve({
          ok: false,
          status: 400,
          text: async () => JSON.stringify({
            error: { message: 'AGDS_PRODUCT_ANALYTICS_SLACK_WEBHOOK_URL must be set' },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => dashboardResponse(),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ProductAnalyticsNorthStar visible weeks={2} />);

    await waitFor(() => expect(screen.getByText('2 designers this week')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Send to Slack/i }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(
      'Slack delivery failed (400): AGDS_PRODUCT_ANALYTICS_SLACK_WEBHOOK_URL must be set',
    ));
    expect(screen.getByText('Weekly Trend')).toBeTruthy();
  });
});

function dashboardResponse() {
  const northStar = {
    metric: 'weekly_active_designers_shipping_to_engines',
    label: 'Weekly Active Designers who shipped at least one artifact to Unity, Unreal, or Godot',
    generatedAt: Date.UTC(2026, 4, 16),
    currentWeekStart: '2026-05-11',
    currentWeekActiveDesigners: 2,
    previousWeekActiveDesigners: 0,
    weeks: [
      {
        weekStart: '2026-05-04',
        activeDesigners: 0,
        shipments: 0,
        projectCount: 0,
        byEngine: { unity: 0, unreal: 0, godot: 0 },
      },
      {
        weekStart: '2026-05-11',
        activeDesigners: 2,
        shipments: 3,
        projectCount: 2,
        byEngine: { unity: 1, unreal: 1, godot: 1 },
      },
    ],
  };
  return {
    generatedAt: Date.UTC(2026, 4, 16),
    northStar,
    activationFunnel: [
      { step: 'signup', label: 'Signup', activeDesigners: 2, events: 2 },
      { step: 'first_project', label: 'First project', activeDesigners: 2, events: 2 },
      { step: 'first_artifact', label: 'First artifact', activeDesigners: 1, events: 1 },
      { step: 'first_save', label: 'First save', activeDesigners: 1, events: 1 },
      { step: 'first_engine_export', label: 'First engine export', activeDesigners: 2, events: 3 },
    ],
    engineExportVolume: { weeks: northStar.weeks },
    skillUsage: {
      top: [{ id: 'game-hud-system', activeDesigners: 2, events: 3 }],
    },
    gameArtBibleUsage: {
      top: [{ id: 'cozy-sim-art-bible', activeDesigners: 1, events: 2 }],
    },
    playtestPersonaUsage: {
      top: [{ id: 'explorer', activeDesigners: 1, events: 3, attempts: 2, completions: 1, completionRate: 0.5 }],
    },
    retention: {
      cohorts: [
        {
          cohortStart: '2026-05-01',
          cohortSize: 2,
          periods: [
            { period: 'd1', label: 'D1', eligibleDesigners: 2, retainedDesigners: 2, retentionRate: 1 },
            { period: 'd7', label: 'D7', eligibleDesigners: 2, retainedDesigners: 2, retentionRate: 1 },
            { period: 'd28', label: 'D28', eligibleDesigners: 0, retainedDesigners: 0, retentionRate: 0 },
            { period: 'm3', label: 'M3', eligibleDesigners: 0, retainedDesigners: 0, retentionRate: 0 },
            { period: 'm6', label: 'M6', eligibleDesigners: 0, retainedDesigners: 0, retentionRate: 0 },
          ],
        },
      ],
    },
    revenueRetention: {
      cohorts: [
        {
          signupMonth: '2026-05',
          accountCount: 2,
          startingMrrCents: 20_000,
          currentMrrCents: 24_000,
          expansionMrrCents: 4_000,
          contractionMrrCents: 0,
          churnedAccountCount: 0,
          nrr: 1.2,
        },
      ],
    },
  };
}
