// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

// Marketplace-side metrics registry. Mirrors greybox-cloud's MetricsRegistry
// shape so ops dashboards can scrape both services without writing two
// different exposition parsers. The marketplace tracks the metrics that
// matter for revenue health (order volume, refund rate, dispute rate,
// payout success/failure) plus the operational vitals (latency on the hot
// admin endpoints).

export interface MetricObservationSummary {
  count: number;
  sum: number;
  min: number;
  max: number;
  buckets: Record<string, number>;
}

const DEFAULT_LATENCY_BUCKETS_MS = [50, 100, 250, 500, 1000, 2500, 5000, 10_000, 30_000];
const DEFAULT_COST_BUCKETS_CENTS = [0.5, 1, 2, 5, 10, 25, 50, 100, 250, 1000];
const DEFAULT_ORDER_VALUE_BUCKETS_CENTS = [100, 500, 1000, 2500, 5000, 10_000, 25_000, 50_000, 100_000];

export class MarketplaceMetricsRegistry {
  private readonly counters = new Map<string, number>();
  private readonly gauges = new Map<string, number>();
  private readonly observations = new Map<string, MetricObservationSummary>();
  private readonly histogramBuckets = new Map<string, number[]>();

  increment(name: string, by = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + by);
  }

  setGauge(name: string, value: number): void {
    if (!Number.isFinite(value)) return;
    this.gauges.set(name, value);
  }

  observe(name: string, value: number, options: {
    bucketsMs?: boolean;
    bucketsCents?: boolean;
    bucketsOrderValueCents?: boolean;
    buckets?: readonly number[];
  } = {}): void {
    if (!Number.isFinite(value)) return;
    let buckets = this.histogramBuckets.get(name);
    if (!buckets) {
      const initial = options.buckets
        ?? (options.bucketsOrderValueCents ? DEFAULT_ORDER_VALUE_BUCKETS_CENTS
          : options.bucketsCents ? DEFAULT_COST_BUCKETS_CENTS
            : DEFAULT_LATENCY_BUCKETS_MS);
      buckets = [...initial];
      this.histogramBuckets.set(name, buckets);
    }
    const existing = this.observations.get(name);
    if (!existing) {
      const bucketMap: Record<string, number> = {};
      for (const b of buckets) bucketMap[String(b)] = value <= b ? 1 : 0;
      bucketMap['+Inf'] = 1;
      this.observations.set(name, {
        count: 1,
        sum: value,
        min: value,
        max: value,
        buckets: bucketMap,
      });
      return;
    }
    existing.count += 1;
    existing.sum += value;
    if (value < existing.min) existing.min = value;
    if (value > existing.max) existing.max = value;
    for (const b of buckets) {
      const key = String(b);
      if (value <= b) existing.buckets[key] = (existing.buckets[key] ?? 0) + 1;
    }
    existing.buckets['+Inf'] = (existing.buckets['+Inf'] ?? 0) + 1;
  }

  snapshot(): Record<string, number | { gauge: number } | MetricObservationSummary> {
    const result: Record<string, number | { gauge: number } | MetricObservationSummary> = {};
    for (const [name, value] of [...this.counters.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      result[name] = value;
    }
    for (const [name, value] of [...this.gauges.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      result[name] = { gauge: value };
    }
    for (const [name, summary] of [...this.observations.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      result[name] = summary;
    }
    return result;
  }

  prometheusText(prefix = 'greybox_marketplace'): string {
    const lines: string[] = [];
    const safePrefix = sanitizePrometheusName(prefix);
    const namespace = (name: string): string =>
      safePrefix ? `${safePrefix}_${sanitizePrometheusName(name)}` : sanitizePrometheusName(name);
    for (const [name, value] of [...this.counters.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const safe = namespace(name);
      lines.push(`# TYPE ${safe} counter`);
      lines.push(`${safe} ${value}`);
    }
    for (const [name, value] of [...this.gauges.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const safe = namespace(name);
      lines.push(`# TYPE ${safe} gauge`);
      lines.push(`${safe} ${value}`);
    }
    for (const [name, summary] of [...this.observations.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const safe = namespace(name);
      lines.push(`# TYPE ${safe} histogram`);
      const buckets = this.histogramBuckets.get(name) ?? [];
      let cumulative = 0;
      for (const bucket of buckets) {
        cumulative = summary.buckets[String(bucket)] ?? cumulative;
        lines.push(`${safe}_bucket{le="${bucket}"} ${cumulative}`);
      }
      lines.push(`${safe}_bucket{le="+Inf"} ${summary.count}`);
      lines.push(`${safe}_sum ${summary.sum}`);
      lines.push(`${safe}_count ${summary.count}`);
    }
    return lines.length > 0 ? `${lines.join('\n')}\n` : '';
  }
}

function sanitizePrometheusName(name: string): string {
  const replaced = name.replace(/[^a-zA-Z0-9_:]/g, '_');
  if (/^[0-9]/.test(replaced)) return `_${replaced}`;
  return replaced;
}
