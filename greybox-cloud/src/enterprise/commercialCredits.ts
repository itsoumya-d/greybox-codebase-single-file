// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

export type CommercialCreditEngine = 'Unity' | 'Unreal' | 'Godot' | 'Other';
export type CommercialCreditStore =
  | 'Steam'
  | 'itch.io'
  | 'App Store'
  | 'Google Play'
  | 'Epic Games Store'
  | 'Console'
  | 'Web'
  | 'Other';
export type CommercialCreditEvidenceType =
  | 'store-page'
  | 'credits-page'
  | 'credits-screenshot'
  | 'case-study'
  | 'customer-approval';
export type CommercialCreditStatus = 'pass' | 'warn' | 'fail';

export interface CommercialCreditEvidenceInput {
  type?: CommercialCreditEvidenceType;
  capturedAt?: string;
  sourceHash?: string;
  sourceUrl?: string;
  approvedForPublicUse?: boolean;
}

export interface CommercialGameCreditRecordInput {
  gameSlug?: string;
  title?: string;
  studioName?: string;
  engine?: CommercialCreditEngine;
  store?: CommercialCreditStore;
  shippedAt?: string;
  commercialRelease?: boolean;
  greyboxCredited?: boolean;
  humanDesignerCredited?: boolean;
  generatorMetaTag?: boolean;
  evidence?: readonly CommercialCreditEvidenceInput[];
}

interface CommercialCreditEvidence {
  type: CommercialCreditEvidenceType;
  capturedAt: string;
  sourceHash: string;
  sourceUrl?: string;
  approvedForPublicUse: boolean;
}

interface CommercialGameCreditRecord {
  gameSlug: string;
  title: string;
  studioName: string;
  engine: CommercialCreditEngine;
  store: CommercialCreditStore;
  shippedAt: string;
  commercialRelease: boolean;
  greyboxCredited: boolean;
  humanDesignerCredited: boolean;
  generatorMetaTag: boolean;
  evidence: CommercialCreditEvidence[];
}

export interface CommercialCreditCheck {
  id: string;
  label: string;
  status: CommercialCreditStatus;
  current: string;
  target: string;
  owner: string;
  detail: string;
  evidence: string[];
  remediation?: string;
}

export interface CommercialCreditReport {
  generatedAt: string;
  disclaimer: string;
  targets: {
    verifiedCommercialCredits: number;
    minimumEnginesRepresented: number;
    approvedCaseStudies: number;
  };
  summary: {
    status: CommercialCreditStatus;
    checks: number;
    pass: number;
    warn: number;
    fail: number;
    submittedGames: number;
    commercialReleases: number;
    verifiedCommercialCredits: number;
    enginesRepresented: number;
    evidenceItems: number;
    publicEvidenceItems: number;
    approvedCaseStudies: number;
    humanDesignerCredits: number;
    generatorMetaTags: number;
    requirementMet: boolean;
    acquisitionNarrativeReady: boolean;
  };
  games: Array<{
    gameSlug: string;
    title: string;
    studioName: string;
    engine: CommercialCreditEngine;
    store: CommercialCreditStore;
    shippedAt: string;
    verified: boolean;
    evidenceItems: number;
    evidenceTypes: CommercialCreditEvidenceType[];
    publicEvidenceHosts: string[];
    humanDesignerCredited: boolean;
    generatorMetaTag: boolean;
  }>;
  checks: CommercialCreditCheck[];
}

const ENGINES = new Set<CommercialCreditEngine>(['Unity', 'Unreal', 'Godot', 'Other']);
const STORES = new Set<CommercialCreditStore>([
  'Steam',
  'itch.io',
  'App Store',
  'Google Play',
  'Epic Games Store',
  'Console',
  'Web',
  'Other',
]);
const EVIDENCE_TYPES = new Set<CommercialCreditEvidenceType>([
  'store-page',
  'credits-page',
  'credits-screenshot',
  'case-study',
  'customer-approval',
]);
const CREDIT_EVIDENCE_TYPES = new Set<CommercialCreditEvidenceType>([
  'credits-page',
  'credits-screenshot',
  'case-study',
  'customer-approval',
]);

export function commercialCreditRecordsFromEnv(
  env: Record<string, string | undefined> = process.env,
): CommercialGameCreditRecordInput[] {
  const raw = env.GREYBOX_COMMERCIAL_CREDITS_JSON;
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((value) => {
      if (!isRecord(value)) return [];
      const record = creditRecordFromRecord(value);
      return record ? [record] : [];
    });
  } catch {
    return [];
  }
}

export function buildCommercialCreditReport(options: {
  records?: readonly CommercialGameCreditRecordInput[];
  now?: Date;
} = {}): CommercialCreditReport {
  const now = options.now ?? new Date();
  const records = normalizeRecords(options.records ?? commercialCreditRecordsFromEnv(), now);
  const verifiedRecords = records.filter(isVerifiedCommercialCredit);
  const enginesRepresented = new Set(verifiedRecords.map((record) => record.engine)).size;
  const evidenceItems = records.reduce((sum, record) => sum + record.evidence.length, 0);
  const publicEvidenceItems = records.reduce(
    (sum, record) => sum + record.evidence.filter((item) => item.sourceUrl).length,
    0,
  );
  const approvedCaseStudies = verifiedRecords.filter((record) => record.evidence.some((item) => {
    return item.type === 'case-study' && item.approvedForPublicUse;
  })).length;
  const humanDesignerCredits = verifiedRecords.filter((record) => record.humanDesignerCredited).length;
  const generatorMetaTags = verifiedRecords.filter((record) => record.generatorMetaTag).length;
  const checks = buildChecks(records, {
    verifiedCommercialCredits: verifiedRecords.length,
    enginesRepresented,
    approvedCaseStudies,
    humanDesignerCredits,
    generatorMetaTags,
  });
  const pass = checks.filter((check) => check.status === 'pass').length;
  const warn = checks.filter((check) => check.status === 'warn').length;
  const fail = checks.filter((check) => check.status === 'fail').length;
  return {
    generatedAt: now.toISOString(),
    disclaimer: 'Commercial credit evidence is internal operating evidence only. Public store pages, approved case studies, credits captures, and customer approvals remain authoritative. Do not include emails, private builds, raw game IP, contracts, or unpublished revenue data.',
    targets: {
      verifiedCommercialCredits: 5,
      minimumEnginesRepresented: 2,
      approvedCaseStudies: 1,
    },
    summary: {
      status: fail > 0 ? 'fail' : warn > 0 ? 'warn' : 'pass',
      checks: checks.length,
      pass,
      warn,
      fail,
      submittedGames: records.length,
      commercialReleases: records.filter((record) => record.commercialRelease).length,
      verifiedCommercialCredits: verifiedRecords.length,
      enginesRepresented,
      evidenceItems,
      publicEvidenceItems,
      approvedCaseStudies,
      humanDesignerCredits,
      generatorMetaTags,
      requirementMet: verifiedRecords.length >= 5,
      acquisitionNarrativeReady: verifiedRecords.length >= 5
        && enginesRepresented >= 2
        && approvedCaseStudies >= 1
        && humanDesignerCredits === verifiedRecords.length
        && generatorMetaTags === verifiedRecords.length,
    },
    games: records.map((record) => ({
      gameSlug: record.gameSlug,
      title: record.title,
      studioName: record.studioName,
      engine: record.engine,
      store: record.store,
      shippedAt: record.shippedAt,
      verified: isVerifiedCommercialCredit(record),
      evidenceItems: record.evidence.length,
      evidenceTypes: [...new Set(record.evidence.map((item) => item.type))].sort(),
      publicEvidenceHosts: [...new Set(record.evidence.flatMap((item) => {
        return item.sourceUrl ? [new URL(item.sourceUrl).host] : [];
      }))].sort(),
      humanDesignerCredited: record.humanDesignerCredited,
      generatorMetaTag: record.generatorMetaTag,
    })),
    checks,
  };
}

export function formatCommercialCreditMarkdown(report: CommercialCreditReport): string {
  const lines = [
    '# Greybox Commercial Credit Readiness',
    '',
    `Generated: ${report.generatedAt}`,
    `Status: ${report.summary.status}`,
    `Requirement met: ${report.summary.requirementMet ? 'yes' : 'no'}`,
    `Acquisition narrative ready: ${report.summary.acquisitionNarrativeReady ? 'yes' : 'no'}`,
    `Disclaimer: ${report.disclaimer}`,
    '',
    '## Summary',
    '',
    `- Verified commercial credits: ${report.summary.verifiedCommercialCredits}/${report.targets.verifiedCommercialCredits}`,
    `- Engines represented: ${report.summary.enginesRepresented}/${report.targets.minimumEnginesRepresented}`,
    `- Approved case studies: ${report.summary.approvedCaseStudies}/${report.targets.approvedCaseStudies}`,
    `- Evidence items: ${report.summary.evidenceItems}`,
    `- Public evidence items: ${report.summary.publicEvidenceItems}`,
    '',
    '## Games',
    '',
    '| Game | Studio | Engine | Store | Verified | Evidence | Public hosts |',
    '| --- | --- | --- | --- | --- | ---: | --- |',
  ];
  for (const game of report.games) {
    lines.push(`| ${escapeTableCell(game.title)} | ${escapeTableCell(game.studioName)} | ${game.engine} | ${game.store} | ${game.verified ? 'yes' : 'no'} | ${game.evidenceItems} | ${escapeTableCell(game.publicEvidenceHosts.join(', ') || '-')} |`);
  }
  lines.push(
    '',
    '## Checks',
    '',
    '| Check | Status | Current | Target | Owner |',
    '| --- | --- | --- | --- | --- |',
  );
  for (const check of report.checks) {
    lines.push(`| ${escapeTableCell(check.label)} | ${check.status} | ${escapeTableCell(check.current)} | ${escapeTableCell(check.target)} | ${escapeTableCell(check.owner)} |`);
  }
  lines.push('');
  return lines.join('\n');
}

function creditRecordFromRecord(record: Record<string, unknown>): CommercialGameCreditRecordInput | undefined {
  const gameSlug = optionalSlug(record.gameSlug);
  const title = optionalSafeText(record.title, 96);
  const studioName = optionalSafeText(record.studioName, 96);
  const engine = optionalEngine(record.engine);
  const store = optionalStore(record.store);
  const shippedAt = optionalIsoDate(record.shippedAt);
  if (!gameSlug || !title || !studioName || !engine || !store || !shippedAt) return undefined;
  return {
    gameSlug,
    title,
    studioName,
    engine,
    store,
    shippedAt,
    ...optionalBoolField('commercialRelease', record.commercialRelease),
    ...optionalBoolField('greyboxCredited', record.greyboxCredited),
    ...optionalBoolField('humanDesignerCredited', record.humanDesignerCredited),
    ...optionalBoolField('generatorMetaTag', record.generatorMetaTag),
    evidence: Array.isArray(record.evidence)
      ? record.evidence.flatMap((item) => isRecord(item) ? evidenceFromRecord(item) : [])
      : [],
  };
}

function evidenceFromRecord(record: Record<string, unknown>): CommercialCreditEvidenceInput[] {
  const type = optionalEvidenceType(record.type);
  const capturedAt = optionalIsoDate(record.capturedAt);
  const sourceHash = optionalSourceHash(record.sourceHash);
  if (!type || !capturedAt || !sourceHash) return [];
  return [{
    type,
    capturedAt,
    sourceHash,
    ...optionalUrlField('sourceUrl', record.sourceUrl),
    ...optionalBoolField('approvedForPublicUse', record.approvedForPublicUse),
  }];
}

function normalizeRecords(
  records: readonly CommercialGameCreditRecordInput[],
  now: Date,
): CommercialGameCreditRecord[] {
  return records
    .map((record) => normalizeRecord(record, now))
    .sort((left, right) => left.shippedAt.localeCompare(right.shippedAt) || left.gameSlug.localeCompare(right.gameSlug));
}

function normalizeRecord(record: CommercialGameCreditRecordInput, now: Date): CommercialGameCreditRecord {
  const gameSlug = normalizeSlug(record.gameSlug);
  const title = normalizeSafeText(record.title, 'title', 96);
  const studioName = normalizeSafeText(record.studioName, 'studioName', 96);
  if (!record.engine || !ENGINES.has(record.engine)) throw new Error('commercial credit engine is invalid');
  if (!record.store || !STORES.has(record.store)) throw new Error('commercial credit store is invalid');
  const shippedAt = normalizeIsoDate(record.shippedAt, 'shippedAt');
  if (Date.parse(shippedAt) > now.getTime()) throw new Error('commercial credit shippedAt cannot be in the future');
  return {
    gameSlug,
    title,
    studioName,
    engine: record.engine,
    store: record.store,
    shippedAt,
    commercialRelease: record.commercialRelease === true,
    greyboxCredited: record.greyboxCredited === true,
    humanDesignerCredited: record.humanDesignerCredited === true,
    generatorMetaTag: record.generatorMetaTag === true,
    evidence: (record.evidence ?? []).map((evidence) => normalizeEvidence(evidence, now)),
  };
}

function normalizeEvidence(evidence: CommercialCreditEvidenceInput, now: Date): CommercialCreditEvidence {
  if (!evidence.type || !EVIDENCE_TYPES.has(evidence.type)) throw new Error('commercial credit evidence type is invalid');
  const capturedAt = normalizeIsoDate(evidence.capturedAt, 'evidence.capturedAt');
  if (Date.parse(capturedAt) > now.getTime()) throw new Error('commercial credit evidence capturedAt cannot be in the future');
  if (!evidence.sourceHash || !/^[a-f0-9]{64}$/iu.test(evidence.sourceHash)) {
    throw new Error('commercial credit evidence sourceHash must be a SHA-256 hex digest');
  }
  return {
    type: evidence.type,
    capturedAt,
    sourceHash: evidence.sourceHash.toLowerCase(),
    ...(evidence.sourceUrl ? { sourceUrl: normalizePublicUrl(evidence.sourceUrl) } : {}),
    approvedForPublicUse: evidence.approvedForPublicUse === true,
  };
}

function isVerifiedCommercialCredit(record: CommercialGameCreditRecord): boolean {
  const hasStoreProof = record.evidence.some((item) => item.type === 'store-page');
  const hasCreditProof = record.evidence.some((item) => CREDIT_EVIDENCE_TYPES.has(item.type));
  return record.commercialRelease
    && record.greyboxCredited
    && hasStoreProof
    && hasCreditProof;
}

function buildChecks(
  records: readonly CommercialGameCreditRecord[],
  summary: {
    verifiedCommercialCredits: number;
    enginesRepresented: number;
    approvedCaseStudies: number;
    humanDesignerCredits: number;
    generatorMetaTags: number;
  },
): CommercialCreditCheck[] {
  const commercialRecords = records.filter((record) => record.commercialRelease);
  const unverifiedRecords = commercialRecords.filter((record) => !isVerifiedCommercialCredit(record));
  const verifiedRecords = records.filter(isVerifiedCommercialCredit);
  const missingHumanCredit = verifiedRecords.filter((record) => !record.humanDesignerCredited);
  const missingGeneratorMeta = verifiedRecords.filter((record) => !record.generatorMetaTag);
  return [
    {
      id: 'verified-commercial-credits',
      label: 'Verified commercial credits',
      status: summary.verifiedCommercialCredits >= 5 ? 'pass' : summary.verifiedCommercialCredits >= 3 ? 'warn' : 'fail',
      current: `${summary.verifiedCommercialCredits} verified commercial credit(s)`,
      target: '5+ shipped commercial games publicly crediting Greybox',
      owner: 'Developer Relations',
      detail: 'The acquisition narrative needs public proof that Greybox helped real commercial games ship.',
      evidence: ['store-page proof', 'credits capture hash', 'approved case study'],
      remediation: 'Convert customer launches into public credits before counting them in acquisition or distribution scorecards.',
    },
    {
      id: 'evidence-chain',
      label: 'Credit evidence chain',
      status: unverifiedRecords.length === 0 && records.length > 0 ? 'pass' : summary.verifiedCommercialCredits > 0 ? 'warn' : 'fail',
      current: `${unverifiedRecords.length} commercial record(s) missing store or credit proof`,
      target: 'Every counted commercial release has store proof and Greybox credit proof',
      owner: 'Developer Relations',
      detail: 'A game should not count toward the five-credit gate unless both release and credit evidence are present.',
      evidence: ['public store page', 'credits page or screenshot', 'case study approval'],
      remediation: 'Attach hashed store evidence plus a credits capture, approved case study, or customer approval.',
    },
    {
      id: 'engine-spread',
      label: 'Engine spread',
      status: summary.enginesRepresented >= 2 ? 'pass' : summary.enginesRepresented === 1 ? 'warn' : 'fail',
      current: `${summary.enginesRepresented} engine(s) represented`,
      target: '2+ engines represented across verified commercial credits',
      owner: 'Partnerships',
      detail: 'Engine spread turns isolated customer proof into a cross-engine strategic story.',
      evidence: ['Unity/Unreal/Godot store evidence', 'case study engine tags'],
      remediation: 'Prioritize public credits from the next non-Unity launch once Unity proof is established.',
    },
    {
      id: 'human-credit-hygiene',
      label: 'Human designer credit hygiene',
      status: missingHumanCredit.length === 0 && missingGeneratorMeta.length === 0 && verifiedRecords.length > 0 ? 'pass' : 'fail',
      current: `${missingHumanCredit.length} missing human designer credit, ${missingGeneratorMeta.length} missing generator meta tag`,
      target: 'Every verified game credits the human designer and includes Greybox generator metadata',
      owner: 'Product Trust',
      detail: 'Greybox must stay honest about AI assistance in shipped artifacts.',
      evidence: ['credits capture hash', 'artifact metadata capture'],
      remediation: 'Do not count the game until the public artifact credits the human designer and Greybox-assisted metadata.',
    },
    {
      id: 'approved-case-study',
      label: 'Approved case study',
      status: summary.approvedCaseStudies >= 1 ? 'pass' : 'warn',
      current: `${summary.approvedCaseStudies} approved case study/studies`,
      target: '1+ approved case study tied to a shipped commercial game',
      owner: 'Developer Relations',
      detail: 'Case studies turn credits into repeatable GTM proof for founders, partners, and buyers.',
      evidence: ['published case study URL', 'customer approval digest'],
      remediation: 'Secure written approval for at least one shipped-game case study before strategic outreach.',
    },
  ];
}

function normalizeSlug(value: string | undefined): string {
  if (!value || !/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/u.test(value)) {
    throw new Error('commercial credit gameSlug must be a lowercase URL-safe slug');
  }
  return value;
}

function normalizeSafeText(value: string | undefined, label: string, maxLength: number): string {
  const sanitized = optionalSafeText(value, maxLength);
  if (!sanitized) throw new Error(`commercial credit ${label} is invalid`);
  return sanitized;
}

function normalizeIsoDate(value: string | undefined, label: string): string {
  if (!value || Number.isNaN(Date.parse(value))) throw new Error(`commercial credit ${label} must be an ISO timestamp`);
  return new Date(value).toISOString();
}

function normalizePublicUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('commercial credit sourceUrl must be a valid HTTPS URL');
  }
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.')) {
    throw new Error('commercial credit sourceUrl must be a public HTTPS URL');
  }
  url.hash = '';
  return url.toString();
}

function optionalSlug(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/u.test(value) ? value : undefined;
}

function optionalSafeText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (!text || text.length > maxLength) return undefined;
  if (/[\u0000-\u001f\u007f]/u.test(text)) return undefined;
  if (/@|api[_-]?key|secret|token|password|private build|unpublished revenue/iu.test(text)) return undefined;
  return text;
}

function optionalEngine(value: unknown): CommercialCreditEngine | undefined {
  return typeof value === 'string' && ENGINES.has(value as CommercialCreditEngine)
    ? value as CommercialCreditEngine
    : undefined;
}

function optionalStore(value: unknown): CommercialCreditStore | undefined {
  return typeof value === 'string' && STORES.has(value as CommercialCreditStore)
    ? value as CommercialCreditStore
    : undefined;
}

function optionalEvidenceType(value: unknown): CommercialCreditEvidenceType | undefined {
  return typeof value === 'string' && EVIDENCE_TYPES.has(value as CommercialCreditEvidenceType)
    ? value as CommercialCreditEvidenceType
    : undefined;
}

function optionalIsoDate(value: unknown): string | undefined {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : undefined;
}

function optionalSourceHash(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-f0-9]{64}$/iu.test(value) ? value.toLowerCase() : undefined;
}

function optionalUrlField(field: string, value: unknown): Record<string, string> {
  if (typeof value !== 'string') return {};
  try {
    return { [field]: normalizePublicUrl(value) };
  } catch {
    return {};
  }
}

function optionalBoolField(field: string, value: unknown): Record<string, boolean> {
  return typeof value === 'boolean' ? { [field]: value } : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function escapeTableCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', '<br>');
}
