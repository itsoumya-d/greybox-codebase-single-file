// SPDX-License-Identifier: Apache-2.0

export type EngineShipmentEngine = 'unity' | 'unreal' | 'godot';

export type ActivationFunnelStep =
  | 'signup'
  | 'first_project'
  | 'first_artifact'
  | 'first_save'
  | 'first_engine_export';

export type ProductUsageKind = 'skill' | 'game_art_bible' | 'playtest_persona';
export type ProductUsageOutcome = 'used' | 'attempted' | 'completed';
export type RetentionPeriod = 'd1' | 'd7' | 'd28' | 'm3' | 'm6';

export interface EngineShipmentRecord {
  id: string;
  type: 'engine_shipment';
  projectId: string;
  engine: EngineShipmentEngine;
  designerId: string;
  shippedAt: number;
  receivedAt: number;
  artifactId?: string;
  fileName?: string;
  source?: string;
}

export interface NorthStarWeek {
  weekStart: string;
  activeDesigners: number;
  shipments: number;
  projectCount: number;
  byEngine: Record<EngineShipmentEngine, number>;
}

export interface NorthStarAnalytics {
  metric: 'weekly_active_designers_shipping_to_engines';
  label: string;
  generatedAt: number;
  currentWeekStart: string;
  currentWeekActiveDesigners: number;
  previousWeekActiveDesigners: number;
  weeks: NorthStarWeek[];
}

export interface ActivationFunnelEvent {
  id: string;
  type: 'activation_funnel';
  step: ActivationFunnelStep;
  designerId: string;
  occurredAt: number;
  receivedAt: number;
  projectId?: string;
  fileName?: string;
  source?: string;
}

export interface ActivationFunnelStepSummary {
  step: ActivationFunnelStep;
  label: string;
  activeDesigners: number;
  events: number;
}

export interface ProductUsageEvent {
  id: string;
  type: 'product_usage';
  kind: ProductUsageKind;
  itemId: string;
  designerId: string;
  occurredAt: number;
  receivedAt: number;
  projectId?: string;
  source?: string;
  outcome?: ProductUsageOutcome;
}

export interface ProductUsageSummaryItem {
  id: string;
  activeDesigners: number;
  events: number;
}

export interface PlaytestPersonaUsageSummaryItem extends ProductUsageSummaryItem {
  attempts: number;
  completions: number;
  completionRate: number;
}

export interface RetentionPeriodSummary {
  period: RetentionPeriod;
  label: string;
  eligibleDesigners: number;
  retainedDesigners: number;
  retentionRate: number;
}

export interface RetentionCohortSummary {
  cohortStart: string;
  cohortSize: number;
  periods: RetentionPeriodSummary[];
}

export interface RevenueRetentionEvent {
  id: string;
  type: 'revenue_retention';
  accountId: string;
  signupMonth: string;
  periodMonth: string;
  startingMrrCents: number;
  currentMrrCents: number;
  receivedAt: number;
  source?: string;
}

export interface RevenueRetentionCohortSummary {
  signupMonth: string;
  accountCount: number;
  startingMrrCents: number;
  currentMrrCents: number;
  expansionMrrCents: number;
  contractionMrrCents: number;
  churnedAccountCount: number;
  nrr: number;
}

export interface ProductAnalyticsWeeklyReportMetrics {
  activeDesigners: number;
  previousWeekActiveDesigners: number;
  activeDesignerDelta: number;
  shipments: number;
  projectCount: number;
  byEngine: Record<EngineShipmentEngine, number>;
  signupDesigners: number;
  firstProjectDesigners: number;
  firstArtifactDesigners: number;
  firstSaveDesigners: number;
  firstEngineExportDesigners: number;
  d1RetentionRate?: number;
  d1EligibleDesigners?: number;
  d7RetentionRate?: number;
  d7EligibleDesigners?: number;
  d28RetentionRate?: number;
  d28EligibleDesigners?: number;
  m3RetentionRate?: number;
  m3EligibleDesigners?: number;
  m6RetentionRate?: number;
  m6EligibleDesigners?: number;
  nrr?: number;
  nrrSignupMonth?: string;
  topSkillId?: string;
  topSkillEvents?: number;
  topGameArtBibleId?: string;
  topGameArtBibleEvents?: number;
  topPlaytestPersonaId?: string;
  topPlaytestPersonaCompletionRate?: number;
}

export interface ProductAnalyticsSlackText {
  type: 'plain_text' | 'mrkdwn';
  text: string;
}

export interface ProductAnalyticsSlackBlock {
  type: 'header' | 'section' | 'context';
  text?: ProductAnalyticsSlackText;
  elements?: ProductAnalyticsSlackText[];
}

export interface ProductAnalyticsSlackPayload {
  text: string;
  blocks: ProductAnalyticsSlackBlock[];
}

export interface ProductAnalyticsWeeklyReport {
  generatedAt: number;
  weekStart: string;
  title: string;
  markdown: string;
  metrics: ProductAnalyticsWeeklyReportMetrics;
  slack: ProductAnalyticsSlackPayload;
}

export interface ProductAnalyticsPostHogProperties {
  metric: 'weekly_active_designers_shipping_to_engines';
  week_start: string;
  active_designers: number;
  previous_week_active_designers: number;
  active_designer_delta: number;
  shipments: number;
  project_count: number;
  unity_shipments: number;
  unreal_shipments: number;
  godot_shipments: number;
  signup_designers: number;
  first_project_designers: number;
  first_artifact_designers: number;
  first_save_designers: number;
  first_engine_export_designers: number;
  d1_retention_rate?: number;
  d1_eligible_designers?: number;
  d7_retention_rate?: number;
  d7_eligible_designers?: number;
  d28_retention_rate?: number;
  d28_eligible_designers?: number;
  m3_retention_rate?: number;
  m3_eligible_designers?: number;
  m6_retention_rate?: number;
  m6_eligible_designers?: number;
  nrr?: number;
  nrr_signup_month?: string;
  top_skill_id?: string;
  top_skill_events?: number;
  top_game_art_bible_id?: string;
  top_game_art_bible_events?: number;
  top_playtest_persona_id?: string;
  top_playtest_persona_completion_rate?: number;
  privacy_scope: 'aggregate_only_no_artifact_content_designer_names_or_game_ip';
  source: 'greybox_daemon_weekly_report';
  $process_person_profile: false;
}

export interface ProductAnalyticsPostHogPayload {
  api_key: string;
  event: 'greybox_weekly_north_star';
  distinct_id: string;
  properties: ProductAnalyticsPostHogProperties;
  timestamp: string;
}

export interface ProductAnalyticsPostHogDeliveryResponse {
  delivered: boolean;
  status: number;
  endpoint: string;
  event: ProductAnalyticsPostHogPayload['event'];
  weekStart: string;
  report: ProductAnalyticsWeeklyReport;
}

export interface ProductAnalyticsPostHogDashboardRequest {
  name: string;
  description: string;
  pinned: boolean;
  tags: string[];
}

export interface ProductAnalyticsPostHogInsightSeed {
  key: string;
  name: string;
  description: string;
  order: number;
  tags: string[];
  query: Record<string, unknown>;
}

export interface ProductAnalyticsPostHogDashboardSeed {
  version: 1;
  generatedAt: string;
  privacyScope: ProductAnalyticsPostHogProperties['privacy_scope'];
  eventContract: {
    event: ProductAnalyticsPostHogPayload['event'];
    requiredProperties: Array<keyof ProductAnalyticsPostHogProperties>;
  };
  api: {
    dashboardEndpoint: string;
    insightEndpoint: string;
    requiredScopes: string[];
  };
  dashboard: ProductAnalyticsPostHogDashboardRequest;
  insights: ProductAnalyticsPostHogInsightSeed[];
}

export interface ProductAnalyticsPostHogDashboardProvisionResponse {
  dryRun: boolean;
  seed: ProductAnalyticsPostHogDashboardSeed;
  dashboard?: {
    id: number | string;
    url?: string;
  };
  insights: Array<{
    key: string;
    id?: number | string;
    status: 'planned' | 'created';
  }>;
}

export interface EngineExportVolumeWeek extends NorthStarWeek {}

export interface ProductAnalyticsDashboard {
  generatedAt: number;
  northStar: NorthStarAnalytics;
  activationFunnel: ActivationFunnelStepSummary[];
  engineExportVolume: {
    weeks: EngineExportVolumeWeek[];
  };
  skillUsage: {
    top: ProductUsageSummaryItem[];
  };
  gameArtBibleUsage: {
    top: ProductUsageSummaryItem[];
  };
  playtestPersonaUsage: {
    top: PlaytestPersonaUsageSummaryItem[];
  };
  retention: {
    cohorts: RetentionCohortSummary[];
  };
  revenueRetention: {
    cohorts: RevenueRetentionCohortSummary[];
  };
}
