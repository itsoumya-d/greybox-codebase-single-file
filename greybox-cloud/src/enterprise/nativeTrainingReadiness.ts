// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { redactPiiText } from '../safety/piiRedactor.js';
import type {
  ModelTrainingConsentStore,
  ModelTrainingConsentRecord,
} from './modelTrainingConsent.js';

export type NativeTrainingReadinessStatus = 'pass' | 'warn' | 'fail';

export interface NativeTrainingArtifactCandidateInput {
  tenantId?: string;
  projectId?: string;
  artifactId?: string;
  artifactType?: string;
  source?: string;
  contentSha256?: string;
  qualityScore?: number;
  humanReviewed?: boolean;
  acceptedByHuman?: boolean;
  piiDetected?: boolean;
  dataCategories?: string[];
  createdAt?: string;
}

export interface NativeTrainingReadinessCheck {
  id: string;
  label: string;
  status: NativeTrainingReadinessStatus;
  current: string;
  target: string;
  detail: string;
  remediation?: string;
}

export interface NativeTrainingExcludedSample {
  index: number;
  tenantId?: string;
  projectId?: string;
  artifactId?: string;
  artifactType: string;
  reasons: string[];
}

export interface NativeTrainingArtifactTypeSummary {
  artifactType: string;
  candidates: number;
  eligible: number;
}

export interface NativeTrainingReadinessReport {
  generatedAt: string;
  disclaimer: string;
  summary: {
    status: NativeTrainingReadinessStatus;
    readyForTrainingExport: boolean;
    consentStoreConfigured: boolean;
    candidateArtifacts: number;
    eligibleArtifacts: number;
    candidateProjects: number;
    eligibleProjects: number;
    consentedProjects: number;
    revokedOrOptedOutProjects: number;
    rawPayloadBlockedArtifacts: number;
    piiBlockedArtifacts: number;
    nonConsentedCandidateArtifacts: number;
    lowQualityArtifacts: number;
    minimumQualityScore: number;
    targetConsentedProjects: number;
    targetEligibleArtifacts: number;
  };
  checks: NativeTrainingReadinessCheck[];
  artifactTypes: NativeTrainingArtifactTypeSummary[];
  excludedSamples: NativeTrainingExcludedSample[];
}

interface NormalizedNativeTrainingArtifactCandidate {
  index: number;
  tenantId?: string;
  projectId?: string;
  artifactId?: string;
  artifactType: string;
  contentSha256?: string;
  qualityScore: number;
  humanReviewed: boolean;
  piiDetected: boolean;
  rawPayloadFields: string[];
  dataCategories: string[];
}

const DEFAULT_TARGET_CONSENTED_PROJECTS = 10_000;
const DEFAULT_TARGET_ELIGIBLE_ARTIFACTS = 50_000;
const DEFAULT_MINIMUM_QUALITY_SCORE = 4;
const RAW_PAYLOAD_FIELDS = [
  'content',
  'body',
  'prompt',
  'output',
  'html',
  'markdown',
  'designMd',
  'artifactBody',
  'rawArtifact',
  'gameIp',
];

export function nativeTrainingCandidatesFromEnv(
  env: Record<string, string | undefined> = process.env,
): NativeTrainingArtifactCandidateInput[] {
  const raw = env.GREYBOX_NATIVE_TRAINING_CANDIDATES_JSON;
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRecord) as NativeTrainingArtifactCandidateInput[] : [];
  } catch {
    return [];
  }
}

export async function buildNativeTrainingReadinessReport(options: {
  consentStore?: Pick<ModelTrainingConsentStore, 'list'>;
  candidates?: readonly NativeTrainingArtifactCandidateInput[];
  targetConsentedProjects?: number;
  targetEligibleArtifacts?: number;
  minimumQualityScore?: number;
  now?: Date;
} = {}): Promise<NativeTrainingReadinessReport> {
  const now = options.now ?? new Date();
  const minimumQualityScore = positiveNumber(options.minimumQualityScore, DEFAULT_MINIMUM_QUALITY_SCORE);
  const targetConsentedProjects = Math.max(1, Math.floor(
    positiveNumber(options.targetConsentedProjects, DEFAULT_TARGET_CONSENTED_PROJECTS),
  ));
  const targetEligibleArtifacts = Math.max(1, Math.floor(
    positiveNumber(options.targetEligibleArtifacts, DEFAULT_TARGET_ELIGIBLE_ARTIFACTS),
  ));
  const consentRecords = options.consentStore ? await options.consentStore.list() : [];
  const candidates = (options.candidates ?? []).map((candidate, index) => normalizeCandidate(
    candidate,
    index,
    minimumQualityScore,
  ));
  const latestConsents = latestConsentByProject(consentRecords);
  const consentedProjects = [...latestConsents.values()].filter(nativeTrainingConsentIsActive).length;
  const revokedOrOptedOutProjects = latestConsents.size - consentedProjects;
  const evaluated = candidates.map((candidate) => evaluateCandidate(candidate, consentRecords, minimumQualityScore));
  const eligible = evaluated.filter((candidate) => candidate.reasons.length === 0);
  const excluded = evaluated.filter((candidate) => candidate.reasons.length > 0);
  const rawPayloadBlockedArtifacts = evaluated.filter((candidate) => candidate.reasons.includes('raw_payload_present')).length;
  const piiBlockedArtifacts = evaluated.filter((candidate) => candidate.reasons.includes('pii_detected')).length;
  const nonConsentedCandidateArtifacts = evaluated.filter((candidate) => candidate.reasons.some((reason) => reason.startsWith('native_training_'))).length;
  const lowQualityArtifacts = evaluated.filter((candidate) => candidate.reasons.includes('quality_score_below_minimum')).length;
  const checks = buildChecks({
    consentStoreConfigured: Boolean(options.consentStore),
    candidateArtifacts: candidates.length,
    eligibleArtifacts: eligible.length,
    consentedProjects,
    rawPayloadBlockedArtifacts,
    piiBlockedArtifacts,
    nonConsentedCandidateArtifacts,
    lowQualityArtifacts,
    targetConsentedProjects,
    targetEligibleArtifacts,
    minimumQualityScore,
    missingHumanReviewArtifacts: evaluated.filter((candidate) => candidate.reasons.includes('human_review_missing')).length,
  });
  const status = checks.some((check) => check.status === 'fail')
    ? 'fail'
    : checks.some((check) => check.status === 'warn')
      ? 'warn'
      : 'pass';
  return {
    generatedAt: now.toISOString(),
    disclaimer: 'Greybox Native readiness is internal operating evidence only. It is not consent to train, legal advice, a model-quality guarantee, or an export of customer game IP.',
    summary: {
      status,
      readyForTrainingExport: status === 'pass',
      consentStoreConfigured: Boolean(options.consentStore),
      candidateArtifacts: candidates.length,
      eligibleArtifacts: eligible.length,
      candidateProjects: uniqueCount(candidates.map((candidate) => candidate.projectId)),
      eligibleProjects: uniqueCount(eligible.map((item) => item.candidate.projectId)),
      consentedProjects,
      revokedOrOptedOutProjects,
      rawPayloadBlockedArtifacts,
      piiBlockedArtifacts,
      nonConsentedCandidateArtifacts,
      lowQualityArtifacts,
      minimumQualityScore,
      targetConsentedProjects,
      targetEligibleArtifacts,
    },
    checks,
    artifactTypes: artifactTypeSummary(candidates, eligible),
    excludedSamples: excluded.slice(0, 25).map(({ candidate, reasons }) => ({
      index: candidate.index,
      ...(candidate.tenantId ? { tenantId: candidate.tenantId } : {}),
      ...(candidate.projectId ? { projectId: candidate.projectId } : {}),
      ...(candidate.artifactId ? { artifactId: candidate.artifactId } : {}),
      artifactType: candidate.artifactType,
      reasons,
    })),
  };
}

export function formatNativeTrainingReadinessMarkdown(report: NativeTrainingReadinessReport): string {
  const lines = [
    '# Greybox Native Training Readiness',
    '',
    `Generated: ${report.generatedAt}`,
    `Status: ${report.summary.status}`,
    `Ready for training export: ${report.summary.readyForTrainingExport ? 'yes' : 'no'}`,
    `Disclaimer: ${report.disclaimer}`,
    '',
    '## Summary',
    '',
    `- Candidate artifacts: ${report.summary.candidateArtifacts}`,
    `- Eligible artifacts: ${report.summary.eligibleArtifacts}`,
    `- Candidate projects: ${report.summary.candidateProjects}`,
    `- Eligible projects: ${report.summary.eligibleProjects}`,
    `- Consented projects: ${report.summary.consentedProjects}/${report.summary.targetConsentedProjects}`,
    `- Non-consented candidate artifacts: ${report.summary.nonConsentedCandidateArtifacts}`,
    `- Raw payload blocked artifacts: ${report.summary.rawPayloadBlockedArtifacts}`,
    `- PII blocked artifacts: ${report.summary.piiBlockedArtifacts}`,
    `- Low-quality artifacts: ${report.summary.lowQualityArtifacts}`,
    '',
    '## Checks',
    '',
    '| Check | Status | Current | Target |',
    '| --- | --- | --- | --- |',
  ];
  for (const check of report.checks) {
    lines.push(`| ${escapeTableCell(check.label)} | ${check.status} | ${escapeTableCell(check.current)} | ${escapeTableCell(check.target)} |`);
  }
  if (report.excludedSamples.length > 0) {
    lines.push('', '## Excluded Samples', '', '| Index | Artifact type | Reasons |', '| --- | --- | --- |');
    for (const sample of report.excludedSamples) {
      lines.push(`| ${sample.index} | ${escapeTableCell(sample.artifactType)} | ${escapeTableCell(sample.reasons.join(', '))} |`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

function normalizeCandidate(
  input: NativeTrainingArtifactCandidateInput,
  index: number,
  minimumQualityScore: number,
): NormalizedNativeTrainingArtifactCandidate {
  const record = isRecord(input) ? input as Record<string, unknown> : {};
  const rawPayloadFields = RAW_PAYLOAD_FIELDS.filter((field) => typeof record[field] === 'string'
    && String(record[field]).trim().length > 0);
  const metadataPiiDetected = ['title', 'label', 'notes', 'description']
    .map((field) => typeof record[field] === 'string' ? String(record[field]) : '')
    .some((value) => value.length > 0 && redactPiiText(value) !== value);
  const explicitPiiDetected = record.piiDetected === true
    || normalizeDataCategories(record.dataCategories).some((category) => /\bpii\b|personal data|email|phone|credit card/iu.test(category));
  return {
    index,
    ...optionalToken('tenantId', record.tenantId),
    ...optionalToken('projectId', record.projectId),
    ...optionalToken('artifactId', record.artifactId),
    artifactType: cleanArtifactType(record.artifactType),
    ...(typeof record.contentSha256 === 'string' ? { contentSha256: record.contentSha256.trim().toLowerCase() } : {}),
    qualityScore: positiveNumber(record.qualityScore, 0),
    humanReviewed: record.humanReviewed === true || record.acceptedByHuman === true,
    piiDetected: explicitPiiDetected || metadataPiiDetected,
    rawPayloadFields,
    dataCategories: normalizeDataCategories(record.dataCategories).slice(0, 20),
  };
}

function evaluateCandidate(
  candidate: NormalizedNativeTrainingArtifactCandidate,
  consents: readonly ModelTrainingConsentRecord[],
  minimumQualityScore: number,
): { candidate: NormalizedNativeTrainingArtifactCandidate; reasons: string[] } {
  const reasons: string[] = [];
  if (!candidate.projectId) reasons.push('project_id_missing');
  if (!candidate.contentSha256 || !/^[a-f0-9]{64}$/u.test(candidate.contentSha256)) reasons.push('content_hash_missing');
  if (candidate.rawPayloadFields.length > 0) reasons.push('raw_payload_present');
  if (candidate.piiDetected) reasons.push('pii_detected');
  if (candidate.qualityScore < minimumQualityScore) reasons.push('quality_score_below_minimum');
  if (!candidate.humanReviewed) reasons.push('human_review_missing');
  const consent = latestConsentForCandidate(candidate, consents);
  if (!consent) reasons.push('native_training_consent_missing');
  else if (consent.status !== 'opted-in') reasons.push('native_training_not_opted_in');
  else if (!consent.allowedUses.includes('greybox-native-training')) reasons.push('native_training_use_not_allowed');
  return { candidate, reasons };
}

function latestConsentForCandidate(
  candidate: NormalizedNativeTrainingArtifactCandidate,
  consents: readonly ModelTrainingConsentRecord[],
): ModelTrainingConsentRecord | undefined {
  if (!candidate.projectId) return undefined;
  return consents
    .filter((consent) => consent.projectId === candidate.projectId)
    .filter((consent) => !candidate.tenantId || consent.tenantId === candidate.tenantId)
    .filter((consent) => !candidate.artifactId || !consent.artifactId || consent.artifactId === candidate.artifactId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
}

function nativeTrainingConsentIsActive(consent: ModelTrainingConsentRecord): boolean {
  return consent.status === 'opted-in'
    && consent.separateCheckboxAccepted
    && consent.allowedUses.includes('greybox-native-training');
}

function latestConsentByProject(consents: readonly ModelTrainingConsentRecord[]): Map<string, ModelTrainingConsentRecord> {
  const latest = new Map<string, ModelTrainingConsentRecord>();
  for (const consent of [...consents].sort((left, right) => left.createdAt.localeCompare(right.createdAt))) {
    latest.set(`${consent.tenantId}:${consent.projectId}`, consent);
  }
  return latest;
}

function buildChecks(input: {
  consentStoreConfigured: boolean;
  candidateArtifacts: number;
  eligibleArtifacts: number;
  consentedProjects: number;
  rawPayloadBlockedArtifacts: number;
  piiBlockedArtifacts: number;
  nonConsentedCandidateArtifacts: number;
  lowQualityArtifacts: number;
  targetConsentedProjects: number;
  targetEligibleArtifacts: number;
  minimumQualityScore: number;
  missingHumanReviewArtifacts: number;
}): NativeTrainingReadinessCheck[] {
  return [
    {
      id: 'durable-consent-store',
      label: 'Durable consent store',
      status: input.consentStoreConfigured ? 'pass' : 'fail',
      current: input.consentStoreConfigured ? 'configured' : 'missing',
      target: 'Configured before any Greybox Native export',
      detail: 'Missing consent must default to opted-out, and revocations need durable evidence.',
      remediation: 'Set GREYBOX_MODEL_TRAINING_CONSENT_DIR and verify consent audit logging before building a corpus.',
    },
    {
      id: 'candidate-manifest',
      label: 'Candidate artifact manifest',
      status: input.candidateArtifacts > 0 ? 'pass' : 'warn',
      current: `${input.candidateArtifacts} candidates`,
      target: 'Curated candidate manifest from rated artifacts',
      detail: 'Greybox Native should train only from metadata manifests that point to hashed content held in a separate controlled store.',
      remediation: 'Populate GREYBOX_NATIVE_TRAINING_CANDIDATES_JSON with hashed, rated, human-reviewed candidates.',
    },
    thresholdCheck({
      id: 'consented-project-volume',
      label: 'Consented project volume',
      value: input.consentedProjects,
      passAt: input.targetConsentedProjects,
      warnAt: Math.ceil(input.targetConsentedProjects / 2),
      current: `${input.consentedProjects} consented projects`,
      target: `${input.targetConsentedProjects}+ opted-in projects`,
      detail: 'The native model becomes strategic only after opt-in scale is large enough to improve artifact quality.',
      remediation: 'Drive explicit opt-in at artifact rating and project settings while keeping missing consent opted-out.',
    }),
    thresholdCheck({
      id: 'eligible-artifact-volume',
      label: 'Eligible artifact volume',
      value: input.eligibleArtifacts,
      passAt: input.targetEligibleArtifacts,
      warnAt: Math.max(1, Math.ceil(input.targetEligibleArtifacts / 5)),
      current: `${input.eligibleArtifacts} eligible artifacts`,
      target: `${input.targetEligibleArtifacts}+ high-quality hashed artifacts`,
      detail: 'The corpus should be large enough to justify a hosted small-model training job.',
      remediation: 'Select more highly rated artifacts with matching opt-in consent and accepted human review.',
    }),
    {
      id: 'candidate-consent-cleanliness',
      label: 'Candidate consent cleanliness',
      status: input.nonConsentedCandidateArtifacts === 0 ? 'pass' : 'fail',
      current: `${input.nonConsentedCandidateArtifacts} blocked artifacts`,
      target: '0 candidates without active Greybox Native opt-in',
      detail: 'Every candidate in a training manifest must have active native-training consent at project or artifact scope.',
      remediation: 'Remove candidates with missing, opted-out, revoked, or non-native consent before export review.',
    },
    {
      id: 'raw-payload-exclusion',
      label: 'Raw payload exclusion',
      status: input.rawPayloadBlockedArtifacts === 0 ? 'pass' : 'fail',
      current: `${input.rawPayloadBlockedArtifacts} blocked artifacts`,
      target: '0 raw prompt/output/artifact payloads in readiness evidence',
      detail: 'Readiness reports must never become a shadow export of customer game IP.',
      remediation: 'Replace raw content fields with contentSha256 references before export review.',
    },
    {
      id: 'pii-cleanliness',
      label: 'PII cleanliness',
      status: input.piiBlockedArtifacts === 0 ? 'pass' : 'fail',
      current: `${input.piiBlockedArtifacts} blocked artifacts`,
      target: '0 candidates with detected PII or personal-data categories',
      detail: 'PII must be stripped before model-training manifests leave the product boundary.',
      remediation: 'Run artifact PII scanning and remove personal data before candidate selection.',
    },
    {
      id: 'human-quality-gate',
      label: 'Human quality gate',
      status: input.missingHumanReviewArtifacts === 0 && input.lowQualityArtifacts === 0 ? 'pass' : 'fail',
      current: `${input.missingHumanReviewArtifacts} artifacts missing human review; ${input.lowQualityArtifacts} below score ${input.minimumQualityScore}`,
      target: 'All candidates human-reviewed with high quality scores',
      detail: 'The corpus should reflect designer-approved artifacts, not unreviewed model output.',
      remediation: 'Require artifact rating or accepted tuner-review evidence before candidate inclusion.',
    },
  ];
}

function thresholdCheck(input: {
  id: string;
  label: string;
  value: number;
  passAt: number;
  warnAt: number;
  current: string;
  target: string;
  detail: string;
  remediation: string;
}): NativeTrainingReadinessCheck {
  return {
    id: input.id,
    label: input.label,
    status: input.value >= input.passAt ? 'pass' : input.value >= input.warnAt ? 'warn' : 'fail',
    current: input.current,
    target: input.target,
    detail: input.detail,
    remediation: input.value >= input.passAt ? undefined : input.remediation,
  };
}

function artifactTypeSummary(
  candidates: readonly NormalizedNativeTrainingArtifactCandidate[],
  eligible: readonly { candidate: NormalizedNativeTrainingArtifactCandidate; reasons: string[] }[],
): NativeTrainingArtifactTypeSummary[] {
  const eligibleByType = new Map<string, number>();
  for (const item of eligible) {
    eligibleByType.set(item.candidate.artifactType, (eligibleByType.get(item.candidate.artifactType) ?? 0) + 1);
  }
  const candidatesByType = new Map<string, number>();
  for (const candidate of candidates) {
    candidatesByType.set(candidate.artifactType, (candidatesByType.get(candidate.artifactType) ?? 0) + 1);
  }
  return [...candidatesByType.entries()]
    .map(([artifactType, count]) => ({
      artifactType,
      candidates: count,
      eligible: eligibleByType.get(artifactType) ?? 0,
    }))
    .sort((left, right) => right.candidates - left.candidates || left.artifactType.localeCompare(right.artifactType));
}

function cleanArtifactType(value: unknown): string {
  if (typeof value !== 'string') return 'unknown';
  const clean = value.trim().toLowerCase().replace(/[^a-z0-9._-]/gu, '-').slice(0, 80);
  return clean || 'unknown';
}

function optionalToken(key: 'tenantId' | 'projectId' | 'artifactId', value: unknown): Partial<Pick<
  NormalizedNativeTrainingArtifactCandidate,
  'tenantId' | 'projectId' | 'artifactId'
>> {
  if (typeof value !== 'string') return {};
  const clean = value.trim();
  if (!/^[A-Za-z0-9:._-]{1,160}$/u.test(clean)) return {};
  return { [key]: clean };
}

function normalizeDataCategories(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.replace(/\s+/gu, ' ').trim().slice(0, 80).toLowerCase())
    .filter(Boolean))];
}

function positiveNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function uniqueCount(values: Array<string | undefined>): number {
  return new Set(values.filter((value): value is string => Boolean(value))).size;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/gu, '\\|').replace(/\n/gu, ' ');
}
