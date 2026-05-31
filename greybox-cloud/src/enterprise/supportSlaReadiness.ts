// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

export type SupportSlaStatus = 'pass' | 'warn' | 'fail';
export type SupportTicketSeverity = 'sev1' | 'sev2' | 'sev3' | 'sev4';
export type SupportTicketStatus = 'open' | 'pending-customer' | 'resolved' | 'closed';
export type SupportCustomerTier = 'free' | 'indie' | 'studio' | 'enterprise';
export type SupportProductArea =
  | 'unity-plugin'
  | 'cloud'
  | 'marketplace'
  | 'playtest'
  | 'pro-module'
  | 'billing'
  | 'other';
export type SupportChannel = 'email' | 'discord' | 'slack-connect' | 'portal' | 'asset-store' | 'phone';

export interface SupportSlaTicketInput {
  id?: string;
  productArea?: string;
  severity?: string;
  customerTier?: string;
  status?: string;
  channel?: string;
  createdAt?: string;
  firstResponseAt?: string;
  resolvedAt?: string;
  owner?: string;
  escalationOwner?: string;
  postmortemUrl?: string;
  blocker?: boolean;
}

export interface SupportSlaTicket {
  id: string;
  productArea: SupportProductArea;
  severity: SupportTicketSeverity;
  customerTier: SupportCustomerTier;
  status: SupportTicketStatus;
  channel: SupportChannel;
  createdAt: string;
  firstResponseAt?: string;
  resolvedAt?: string;
  owner?: string;
  escalationOwner?: string;
  postmortemUrl?: string;
  blocker: boolean;
  firstResponseMinutes?: number;
  resolutionMinutes?: number;
  firstResponseDueMinutes: number;
  resolutionDueMinutes: number;
  firstResponseWithinSla: boolean;
  resolutionWithinSla: boolean;
  open: boolean;
  highSeverity: boolean;
  unityBlocker: boolean;
  enterpriseHighSeverityBreach: boolean;
}

export interface SupportSlaCheck {
  id: string;
  label: string;
  status: SupportSlaStatus;
  current: string;
  target: string;
  owner: string;
  detail: string;
  evidence: string[];
  remediation?: string;
}

export interface SupportSlaReadinessReport {
  generatedAt: string;
  disclaimer: string;
  targets: {
    firstResponseCompliancePct: number;
    resolutionCompliancePct: number;
    unityOpenBlockers: number;
    enterpriseHighSeverityBreaches: number;
    ticketEvidenceMinimum: number;
  };
  summary: {
    status: SupportSlaStatus;
    checks: number;
    pass: number;
    warn: number;
    fail: number;
    totalTickets: number;
    openTickets: number;
    firstResponseCompliancePct: number;
    resolutionCompliancePct: number;
    openUnityBlockers: number;
    enterpriseHighSeverityBreaches: number;
    missingSev1Postmortems: number;
    highSeverityOwnershipPct: number;
    readyForUnityVerifiedSolution: boolean;
    readyForEnterprisePilots: boolean;
  };
  checks: SupportSlaCheck[];
  tickets: SupportSlaTicket[];
}

const severities = new Set<SupportTicketSeverity>(['sev1', 'sev2', 'sev3', 'sev4']);
const statuses = new Set<SupportTicketStatus>(['open', 'pending-customer', 'resolved', 'closed']);
const tiers = new Set<SupportCustomerTier>(['free', 'indie', 'studio', 'enterprise']);
const productAreas = new Set<SupportProductArea>([
  'unity-plugin',
  'cloud',
  'marketplace',
  'playtest',
  'pro-module',
  'billing',
  'other',
]);
const channels = new Set<SupportChannel>(['email', 'discord', 'slack-connect', 'portal', 'asset-store', 'phone']);

const slaMinutesBySeverity: Record<SupportTicketSeverity, { firstResponse: number; resolution: number }> = {
  sev1: { firstResponse: 60, resolution: 24 * 60 },
  sev2: { firstResponse: 4 * 60, resolution: 48 * 60 },
  sev3: { firstResponse: 24 * 60, resolution: 7 * 24 * 60 },
  sev4: { firstResponse: 48 * 60, resolution: 14 * 24 * 60 },
};

export function supportSlaTicketsFromEnv(
  env: Record<string, string | undefined> = process.env,
): SupportSlaTicketInput[] {
  const raw = env.GREYBOX_SUPPORT_SLA_JSON;
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    const records = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.tickets)
        ? parsed.tickets
        : [];
    return records
      .filter(isRecord)
      .map(sanitizeTicketInput)
      .filter((record) => Boolean(record.id && record.createdAt && record.severity));
  } catch {
    return [];
  }
}

export function buildSupportSlaReadinessReport({
  tickets = supportSlaTicketsFromEnv(),
  now = new Date(),
}: {
  tickets?: readonly SupportSlaTicketInput[];
  now?: Date;
} = {}): SupportSlaReadinessReport {
  const normalized = tickets
    .map((ticket) => normalizeTicket(ticket, now))
    .filter((ticket): ticket is SupportSlaTicket => Boolean(ticket));
  const checks = supportSlaChecks(normalized);
  const pass = checks.filter((check) => check.status === 'pass').length;
  const warn = checks.filter((check) => check.status === 'warn').length;
  const fail = checks.filter((check) => check.status === 'fail').length;
  const firstResponseCompliancePct = compliancePct(normalized, 'firstResponseWithinSla');
  const resolutionCompliancePct = compliancePct(normalized, 'resolutionWithinSla');
  const openUnityBlockers = normalized.filter((ticket) => ticket.unityBlocker).length;
  const enterpriseHighSeverityBreaches = normalized.filter((ticket) => ticket.enterpriseHighSeverityBreach).length;
  const missingSev1Postmortems = missingSev1PostmortemCount(normalized);
  const highSeverityOwnershipPct = highSeverityOwnership(normalized).pct;
  const status: SupportSlaStatus = fail > 0 ? 'fail' : warn > 0 ? 'warn' : 'pass';
  return {
    generatedAt: now.toISOString(),
    disclaimer: 'Support SLA readiness is internal operating evidence only. Zendesk/Intercom/Jira exports, customer contracts, and signed SLAs remain authoritative.',
    targets: {
      firstResponseCompliancePct: 95,
      resolutionCompliancePct: 90,
      unityOpenBlockers: 0,
      enterpriseHighSeverityBreaches: 0,
      ticketEvidenceMinimum: 10,
    },
    summary: {
      status,
      checks: checks.length,
      pass,
      warn,
      fail,
      totalTickets: normalized.length,
      openTickets: normalized.filter((ticket) => ticket.open).length,
      firstResponseCompliancePct,
      resolutionCompliancePct,
      openUnityBlockers,
      enterpriseHighSeverityBreaches,
      missingSev1Postmortems,
      highSeverityOwnershipPct,
      readyForUnityVerifiedSolution: status === 'pass' && openUnityBlockers === 0,
      readyForEnterprisePilots: status === 'pass' && enterpriseHighSeverityBreaches === 0,
    },
    checks,
    tickets: normalized,
  };
}

export function formatSupportSlaReadinessMarkdown(report: SupportSlaReadinessReport): string {
  const lines = [
    '# Greybox Support SLA Readiness',
    '',
    `Generated: ${report.generatedAt}`,
    `Status: ${report.summary.status}`,
    `Unity Verified Solution support-ready: ${report.summary.readyForUnityVerifiedSolution ? 'yes' : 'no'}`,
    `Enterprise pilot support-ready: ${report.summary.readyForEnterprisePilots ? 'yes' : 'no'}`,
    `Disclaimer: ${report.disclaimer}`,
    '',
    '## Summary',
    '',
    `- Tickets evaluated: ${report.summary.totalTickets}`,
    `- Open tickets: ${report.summary.openTickets}`,
    `- First response compliance: ${report.summary.firstResponseCompliancePct}%`,
    `- Resolution compliance: ${report.summary.resolutionCompliancePct}%`,
    `- Open Unity blockers: ${report.summary.openUnityBlockers}`,
    `- Enterprise high-severity breaches: ${report.summary.enterpriseHighSeverityBreaches}`,
    '',
    '## Checks',
    '',
    '| Check | Status | Current | Target | Owner |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const check of report.checks) {
    lines.push(`| ${escapeTableCell(check.label)} | ${check.status} | ${escapeTableCell(check.current)} | ${escapeTableCell(check.target)} | ${escapeTableCell(check.owner)} |`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function supportSlaChecks(tickets: readonly SupportSlaTicket[]): SupportSlaCheck[] {
  const firstResponseCompliance = compliancePct(tickets, 'firstResponseWithinSla');
  const resolutionCompliance = compliancePct(tickets, 'resolutionWithinSla');
  const openUnityBlockers = tickets.filter((ticket) => ticket.unityBlocker).length;
  const enterpriseBreaches = tickets.filter((ticket) => ticket.enterpriseHighSeverityBreach).length;
  const missingPostmortems = missingSev1PostmortemCount(tickets);
  const ownership = highSeverityOwnership(tickets);
  return [
    {
      id: 'ticket-evidence-volume',
      label: 'Ticket evidence volume',
      status: tickets.length >= 10 ? 'pass' : tickets.length > 0 ? 'warn' : 'fail',
      current: `${tickets.length} sanitized ticket(s)`,
      target: '10+ recent sanitized support tickets or a no-ticket export for launch week',
      owner: 'Customer Success',
      detail: 'Verified Solution and enterprise pilots need support evidence beyond a manually typed blocker count.',
      evidence: ['GREYBOX_SUPPORT_SLA_JSON', 'support queue export'],
      ...(tickets.length >= 10 ? {} : { remediation: 'Export recent sanitized support tickets with severity, tier, timestamps, owner, and product area.' }),
    },
    complianceCheck({
      id: 'first-response-sla',
      label: 'First response SLA',
      pct: firstResponseCompliance,
      passAt: 95,
      warnAt: 90,
      target: '95%+ tickets inside first-response SLA',
      owner: 'Support',
      detail: 'Fast first response is required for Studio/Enterprise trust and Unity partner review.',
      remediation: 'Add coverage or escalation rules until first responses meet the severity matrix.',
    }),
    complianceCheck({
      id: 'resolution-sla',
      label: 'Resolution SLA',
      pct: resolutionCompliance,
      passAt: 90,
      warnAt: 80,
      target: '90%+ tickets inside resolution SLA',
      owner: 'Support',
      detail: 'Enterprise customers need evidence that install, import, and sync issues close predictably.',
      remediation: 'Triage unresolved tickets, add owner handoffs, and backfill resolution timestamps.',
    }),
    {
      id: 'unity-plugin-blockers',
      label: 'Unity plugin blockers',
      status: openUnityBlockers === 0 ? 'pass' : 'fail',
      current: `${openUnityBlockers} open blocker(s)`,
      target: '0 open Unity plugin sev1/sev2 or explicitly blocking tickets',
      owner: 'Unity Plugin',
      detail: 'Unity v1 growth and Verified Solution application should stop while import/sync blockers remain open.',
      evidence: ['support tickets where productArea=unity-plugin', 'Unity release-readiness report'],
      ...(openUnityBlockers === 0 ? {} : { remediation: 'Clear Unity install/import/sync blockers before paid traffic or partner submission.' }),
    },
    {
      id: 'studio-enterprise-breaches',
      label: 'Studio/Enterprise high-severity breaches',
      status: enterpriseBreaches === 0 ? 'pass' : 'fail',
      current: `${enterpriseBreaches} breach(es)`,
      target: '0 sev1/sev2 SLA breaches for Studio or Enterprise customers',
      owner: 'Customer Success',
      detail: 'High-ACV accounts need cleaner support evidence than self-serve tiers.',
      evidence: ['Studio/Enterprise support export', 'customer success coverage plan'],
      ...(enterpriseBreaches === 0 ? {} : { remediation: 'Escalate breached Studio/Enterprise tickets and add named CSM ownership.' }),
    },
    {
      id: 'sev1-postmortems',
      label: 'Sev1 postmortems',
      status: missingPostmortems === 0 ? 'pass' : 'fail',
      current: `${missingPostmortems} missing postmortem(s)`,
      target: 'Every resolved sev1 ticket has a customer-safe postmortem URL',
      owner: 'Security Engineering',
      detail: 'Enterprise diligence expects incident-style closure for critical support events.',
      evidence: ['postmortem URLs', 'incident ledger'],
      ...(missingPostmortems === 0 ? {} : { remediation: 'Attach customer-safe postmortems to resolved sev1 support tickets.' }),
    },
    {
      id: 'high-severity-ownership',
      label: 'High-severity ownership',
      status: ownership.pct >= 100 ? 'pass' : ownership.pct >= 90 ? 'warn' : 'fail',
      current: `${ownership.owned}/${ownership.total} high-severity ticket(s) owned (${ownership.pct}%)`,
      target: '100% sev1/sev2 tickets have an owner or escalation owner',
      owner: 'Support',
      detail: 'Escalation ownership is the proof line between founder-led support and repeatable customer success.',
      evidence: ['support queue owner fields', 'customer success coverage plan'],
      ...(ownership.pct >= 100 ? {} : { remediation: 'Assign owners and escalation owners to every sev1/sev2 ticket.' }),
    },
  ];
}

function complianceCheck(input: {
  id: string;
  label: string;
  pct: number;
  passAt: number;
  warnAt: number;
  target: string;
  owner: string;
  detail: string;
  remediation: string;
}): SupportSlaCheck {
  const status: SupportSlaStatus = input.pct >= input.passAt ? 'pass' : input.pct >= input.warnAt ? 'warn' : 'fail';
  return {
    id: input.id,
    label: input.label,
    status,
    current: `${input.pct}%`,
    target: input.target,
    owner: input.owner,
    detail: input.detail,
    evidence: ['support queue export', 'SLA severity matrix'],
    ...(status === 'pass' ? {} : { remediation: input.remediation }),
  };
}

function normalizeTicket(input: SupportSlaTicketInput, now: Date): SupportSlaTicket | undefined {
  const id = safeLabel(input.id);
  const severity = enumValue(severities, input.severity);
  const createdAt = dateMs(input.createdAt);
  if (!id || !severity || createdAt === undefined) return undefined;
  const firstResponseAt = dateMs(input.firstResponseAt);
  const resolvedAt = dateMs(input.resolvedAt);
  const productArea = enumValue(productAreas, input.productArea) ?? 'other';
  const customerTier = enumValue(tiers, input.customerTier) ?? 'free';
  const status = enumValue(statuses, input.status) ?? 'open';
  const channel = enumValue(channels, input.channel) ?? 'portal';
  const open = status === 'open' || status === 'pending-customer';
  const highSeverity = severity === 'sev1' || severity === 'sev2';
  const firstResponseDueMinutes = slaMinutesBySeverity[severity].firstResponse;
  const resolutionDueMinutes = slaMinutesBySeverity[severity].resolution;
  const firstResponseMinutes = firstResponseAt === undefined ? undefined : elapsedMinutes(createdAt, firstResponseAt);
  const resolutionMinutes = resolvedAt === undefined ? undefined : elapsedMinutes(createdAt, resolvedAt);
  const firstResponseWithinSla = firstResponseAt === undefined
    ? now.getTime() <= createdAt + firstResponseDueMinutes * 60_000
    : firstResponseAt <= createdAt + firstResponseDueMinutes * 60_000;
  const resolutionWithinSla = resolvedAt === undefined
    ? now.getTime() <= createdAt + resolutionDueMinutes * 60_000
    : resolvedAt <= createdAt + resolutionDueMinutes * 60_000;
  const unityBlocker = productArea === 'unity-plugin' && open && (input.blocker === true || highSeverity);
  const enterpriseHighSeverityBreach = (customerTier === 'studio' || customerTier === 'enterprise')
    && highSeverity
    && (!firstResponseWithinSla || !resolutionWithinSla);
  return {
    id,
    productArea,
    severity,
    customerTier,
    status,
    channel,
    createdAt: new Date(createdAt).toISOString(),
    ...(firstResponseAt === undefined ? {} : { firstResponseAt: new Date(firstResponseAt).toISOString() }),
    ...(resolvedAt === undefined ? {} : { resolvedAt: new Date(resolvedAt).toISOString() }),
    ...(safeLabel(input.owner) ? { owner: safeLabel(input.owner) } : {}),
    ...(safeLabel(input.escalationOwner) ? { escalationOwner: safeLabel(input.escalationOwner) } : {}),
    ...(safeUrl(input.postmortemUrl) ? { postmortemUrl: safeUrl(input.postmortemUrl) } : {}),
    blocker: input.blocker === true,
    ...(firstResponseMinutes === undefined ? {} : { firstResponseMinutes }),
    ...(resolutionMinutes === undefined ? {} : { resolutionMinutes }),
    firstResponseDueMinutes,
    resolutionDueMinutes,
    firstResponseWithinSla,
    resolutionWithinSla,
    open,
    highSeverity,
    unityBlocker,
    enterpriseHighSeverityBreach,
  };
}

function compliancePct(tickets: readonly SupportSlaTicket[], field: 'firstResponseWithinSla' | 'resolutionWithinSla'): number {
  if (tickets.length === 0) return 0;
  return Math.round((tickets.filter((ticket) => ticket[field]).length / tickets.length) * 100);
}

function missingSev1PostmortemCount(tickets: readonly SupportSlaTicket[]): number {
  return tickets.filter((ticket) => (
    ticket.severity === 'sev1'
    && (ticket.status === 'resolved' || ticket.status === 'closed')
    && !ticket.postmortemUrl
  )).length;
}

function highSeverityOwnership(tickets: readonly SupportSlaTicket[]): { total: number; owned: number; pct: number } {
  const high = tickets.filter((ticket) => ticket.highSeverity);
  const owned = high.filter((ticket) => Boolean(ticket.owner || ticket.escalationOwner)).length;
  return {
    total: high.length,
    owned,
    pct: high.length === 0 ? 100 : Math.round((owned / high.length) * 100),
  };
}

function sanitizeTicketInput(record: Record<string, unknown>): SupportSlaTicketInput {
  return {
    ...(typeof record.id === 'string' ? { id: record.id } : {}),
    ...(typeof record.productArea === 'string' ? { productArea: record.productArea } : {}),
    ...(typeof record.severity === 'string' ? { severity: record.severity } : {}),
    ...(typeof record.customerTier === 'string' ? { customerTier: record.customerTier } : {}),
    ...(typeof record.status === 'string' ? { status: record.status } : {}),
    ...(typeof record.channel === 'string' ? { channel: record.channel } : {}),
    ...(typeof record.createdAt === 'string' ? { createdAt: record.createdAt } : {}),
    ...(typeof record.firstResponseAt === 'string' ? { firstResponseAt: record.firstResponseAt } : {}),
    ...(typeof record.resolvedAt === 'string' ? { resolvedAt: record.resolvedAt } : {}),
    ...(typeof record.owner === 'string' ? { owner: record.owner } : {}),
    ...(typeof record.escalationOwner === 'string' ? { escalationOwner: record.escalationOwner } : {}),
    ...(typeof record.postmortemUrl === 'string' ? { postmortemUrl: record.postmortemUrl } : {}),
    ...(typeof record.blocker === 'boolean' ? { blocker: record.blocker } : {}),
  };
}

function enumValue<T extends string>(values: Set<T>, raw: unknown): T | undefined {
  const clean = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return values.has(clean as T) ? clean as T : undefined;
}

function dateMs(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
}

function elapsedMinutes(startMs: number, endMs: number): number {
  return Math.max(0, Math.round((endMs - startMs) / 60_000));
}

function safeLabel(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value.trim().replace(/\s+/gu, ' ');
  if (!clean || clean.length > 80 || clean.includes('@')) return undefined;
  return clean;
}

function safeUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return undefined;
    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function escapeTableCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', '<br>');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
