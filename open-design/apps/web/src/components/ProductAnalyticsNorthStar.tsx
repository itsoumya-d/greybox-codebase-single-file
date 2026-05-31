import { useEffect, useState } from 'react';
import type {
  EngineShipmentEngine,
  NorthStarAnalytics,
  NorthStarWeek,
  PlaytestPersonaUsageSummaryItem,
  ProductAnalyticsDashboard,
  ProductUsageSummaryItem,
  RetentionCohortSummary,
  RevenueRetentionCohortSummary,
} from '@ai-game-design-studio/contracts/api/product-analytics';
import { Icon } from './Icon';

interface ProductAnalyticsNorthStarProps {
  visible: boolean;
  weeks?: number;
}

type NorthStarState =
  | { status: 'idle' | 'loading' }
  | { status: 'ready'; data: ProductAnalyticsDashboard }
  | { status: 'opt-in-required' }
  | { status: 'error'; message: string };

const ENGINES: EngineShipmentEngine[] = ['unity', 'unreal', 'godot'];
const ENGINE_LABELS: Record<EngineShipmentEngine, string> = {
  unity: 'Unity',
  unreal: 'Unreal',
  godot: 'Godot',
};

function currentWeek(data: NorthStarAnalytics): NorthStarWeek | undefined {
  return data.weeks.find((week) => week.weekStart === data.currentWeekStart) ?? data.weeks.at(-1);
}

function totalShipments(week: NorthStarWeek | undefined): number {
  return week?.shipments ?? 0;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatMrr(cents: number): string {
  const dollars = Math.round(cents / 100);
  return `$${dollars.toLocaleString()} MRR`;
}

async function northStarError(response: Response): Promise<NorthStarState> {
  if (response.status === 403) return { status: 'opt-in-required' };
  const body = await response.text().catch(() => '');
  return {
    status: 'error',
    message: `North Star request failed (${response.status})${body ? `: ${body.slice(0, 120)}` : ''}`,
  };
}

async function weeklyReportDeliveryError(response: Response): Promise<string> {
  const body = await response.text().catch(() => '');
  if (!body) return `Slack delivery failed (${response.status})`;
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    const message = parsed.error?.message;
    if (message) return `Slack delivery failed (${response.status}): ${message.slice(0, 140)}`;
  } catch {
    // Fall back to the raw text below.
  }
  return `Slack delivery failed (${response.status}): ${body.slice(0, 140)}`;
}

export function ProductAnalyticsNorthStar({ visible, weeks = 8 }: ProductAnalyticsNorthStarProps) {
  const [state, setState] = useState<NorthStarState>({ status: visible ? 'loading' : 'idle' });

  useEffect(() => {
    if (!visible) {
      setState({ status: 'idle' });
      return;
    }

    const controller = new AbortController();
    setState({ status: 'loading' });

    void (async () => {
      try {
        const response = await fetch(`/api/product-analytics/dashboard?weeks=${encodeURIComponent(String(weeks))}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          const next = await northStarError(response);
          if (!controller.signal.aborted) setState(next);
          return;
        }
        const data = (await response.json()) as ProductAnalyticsDashboard;
        if (!controller.signal.aborted) setState({ status: 'ready', data });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    })();

    return () => controller.abort();
  }, [visible, weeks]);

  if (!visible) return null;

  return (
    <section className="game-telemetry-board product-analytics-north-star" aria-label="North Star product analytics">
      <div className="game-telemetry-board-header">
        <div>
          <span className="game-telemetry-board-eyebrow">Product Analytics</span>
          <h2>North Star</h2>
        </div>
        <span className="game-telemetry-board-pill">
          {state.status === 'ready'
            ? `${state.data.northStar.currentWeekActiveDesigners} designers this week`
            : state.status === 'opt-in-required'
              ? 'Metrics opt-in required'
              : state.status === 'error'
                ? 'Unavailable'
                : 'Loading'}
        </span>
      </div>

      {state.status === 'loading' ? (
        <p className="game-telemetry-board-empty">Loading engine shipment analytics...</p>
      ) : null}

      {state.status === 'opt-in-required' ? (
        <p className="game-telemetry-board-empty">
          Enable anonymous metrics in Settings - Privacy to count engine shipments. Greybox keeps artifact content out of this metric.
        </p>
      ) : null}

      {state.status === 'error' ? (
        <p className="game-telemetry-board-error">{state.message}</p>
      ) : null}

      {state.status === 'ready' ? (
        <NorthStarReadyContent data={state.data} weeks={weeks} />
      ) : null}
    </section>
  );
}

type SlackDeliveryState =
  | { status: 'idle' }
  | { status: 'sending' }
  | { status: 'sent' }
  | { status: 'error'; message: string };

function NorthStarReadyContent({ data, weeks }: { data: ProductAnalyticsDashboard; weeks: number }) {
  const activeWeek = currentWeek(data.northStar);
  const currentShipments = totalShipments(activeWeek);
  const [slackDelivery, setSlackDelivery] = useState<SlackDeliveryState>({ status: 'idle' });

  async function sendWeeklyReportToSlack() {
    setSlackDelivery({ status: 'sending' });
    try {
      const response = await fetch(`/api/product-analytics/weekly-report/slack?weeks=${encodeURIComponent(String(weeks))}`, {
        method: 'POST',
      });
      if (!response.ok) {
        setSlackDelivery({ status: 'error', message: await weeklyReportDeliveryError(response) });
        return;
      }
      setSlackDelivery({ status: 'sent' });
    } catch (error) {
      setSlackDelivery({ status: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }

  return (
    <div className="game-telemetry-board-grid product-analytics-north-star-grid">
      <div className="product-analytics-report-actions">
        <button
          type="button"
          className="product-analytics-report-action-button"
          disabled={slackDelivery.status === 'sending'}
          onClick={() => void sendWeeklyReportToSlack()}
        >
          <Icon name={slackDelivery.status === 'sent' ? 'check' : 'share'} size={14} />
          {slackDelivery.status === 'sending' ? 'Sending...' : 'Send to Slack'}
        </button>
        <span
          className={`product-analytics-report-status ${slackDelivery.status}`}
          role={slackDelivery.status === 'error' ? 'alert' : 'status'}
        >
          {slackDelivery.status === 'sent'
            ? 'Sent to Slack'
            : slackDelivery.status === 'error'
              ? slackDelivery.message
              : ''}
        </span>
      </div>

      <div className="game-telemetry-board-stat">
        <span>This week</span>
        <strong>{data.northStar.currentWeekActiveDesigners}</strong>
      </div>
      <div className="game-telemetry-board-stat">
        <span>Previous week</span>
        <strong>{data.northStar.previousWeekActiveDesigners}</strong>
      </div>
      <div className="game-telemetry-board-stat">
        <span>Engine shipments</span>
        <strong>{currentShipments}</strong>
      </div>

      <div className="game-telemetry-board-panel">
        <h3>Engine Split</h3>
        {activeWeek ? (
          <ul className="product-analytics-engine-list">
            {ENGINES.map((engine) => (
              <li key={engine}>
                <strong>{ENGINE_LABELS[engine]}</strong>
                <span>{activeWeek.byEngine[engine]}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p>No engine shipments this week.</p>
        )}
      </div>

      <div className="game-telemetry-board-panel">
        <h3>Activation Funnel</h3>
        <ul className="product-analytics-funnel-list">
          {data.activationFunnel.map((step) => (
            <li key={step.step}>
              <strong>{step.label}</strong>
              <span>{step.activeDesigners} designers</span>
            </li>
          ))}
        </ul>
      </div>

      <UsagePanel title="Skill Usage" empty="No skill usage recorded yet." items={data.skillUsage.top} />
      <UsagePanel
        title="Game Art Bibles"
        empty="No game art bible usage recorded yet."
        items={data.gameArtBibleUsage.top}
      />
      <PersonaUsagePanel items={data.playtestPersonaUsage.top} />
      <RetentionPanel cohorts={data.retention.cohorts} />
      <RevenueRetentionPanel cohorts={data.revenueRetention.cohorts} />

      <div className="game-telemetry-board-panel">
        <h3>Weekly Trend</h3>
        {data.engineExportVolume.weeks.some((week) => week.shipments > 0) ? (
          <ul className="product-analytics-week-list">
            {data.engineExportVolume.weeks.map((week) => (
              <li key={week.weekStart}>
                <strong>{week.weekStart}</strong>
                <span>
                  {week.activeDesigners} designers, {week.shipments} shipments, {week.projectCount} projects
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p>No engine shipments recorded yet.</p>
        )}
      </div>
    </div>
  );
}

function RetentionPanel({ cohorts }: { cohorts: RetentionCohortSummary[] }) {
  const cohort = cohorts[0];
  return (
    <div className="game-telemetry-board-panel">
      <h3>Retention</h3>
      {cohort ? (
        <ul className="product-analytics-usage-list">
          {cohort.periods.map((period) => (
            <li key={period.period}>
              <strong>{period.label}</strong>
              <span>
                {period.eligibleDesigners > 0
                  ? `${formatPercent(period.retentionRate)} retained`
                  : 'pending'}, {cohort.cohortSize} cohort
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p>No retention cohorts recorded yet.</p>
      )}
    </div>
  );
}

function RevenueRetentionPanel({ cohorts }: { cohorts: RevenueRetentionCohortSummary[] }) {
  return (
    <div className="game-telemetry-board-panel">
      <h3>NRR by Cohort</h3>
      {cohorts.length > 0 ? (
        <ul className="product-analytics-usage-list">
          {cohorts.map((cohort) => (
            <li key={cohort.signupMonth}>
              <strong>{cohort.signupMonth}</strong>
              <span>
                {formatPercent(cohort.nrr)} NRR, {formatMrr(cohort.currentMrrCents)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p>No revenue retention cohorts recorded yet.</p>
      )}
    </div>
  );
}

function UsagePanel({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: ProductUsageSummaryItem[];
}) {
  return (
    <div className="game-telemetry-board-panel">
      <h3>{title}</h3>
      {items.length > 0 ? (
        <ul className="product-analytics-usage-list">
          {items.map((item) => (
            <li key={item.id}>
              <strong>{item.id}</strong>
              <span>{item.events} uses, {item.activeDesigners} designers</span>
            </li>
          ))}
        </ul>
      ) : (
        <p>{empty}</p>
      )}
    </div>
  );
}

function PersonaUsagePanel({ items }: { items: PlaytestPersonaUsageSummaryItem[] }) {
  return (
    <div className="game-telemetry-board-panel">
      <h3>Playtest Personas</h3>
      {items.length > 0 ? (
        <ul className="product-analytics-usage-list">
          {items.map((item) => (
            <li key={item.id}>
              <strong>{item.id}</strong>
              <span>
                {Math.round(item.completionRate * 100)}% complete, {item.completions}/{item.attempts} runs
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p>No persona playtests recorded yet.</p>
      )}
    </div>
  );
}
