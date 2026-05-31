// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { readFileSync } from 'node:fs';
import { redactPiiText } from '../safety/piiRedactor.js';

export type PiiRedactionEvidenceStatus = 'pass' | 'warn' | 'fail';

export type PiiRedactionEvidenceArtifactId =
  | 'redaction-100-case-suite'
  | 'provider-boundary-redaction'
  | 'audit-classification-tags'
  | 'public-error-sanitization';

export interface PiiRedactionEvidenceArtifact {
  id: PiiRedactionEvidenceArtifactId;
  label: string;
  status: 'pass' | 'missing';
  sourceHash?: string;
  generatedAt?: string;
}

export interface PiiRedactionEvidenceControl {
  id: string;
  label: string;
  status: PiiRedactionEvidenceStatus;
  detail: string;
  remediation?: string;
}

export interface PiiRedactionEvidenceReport {
  generatedAt: string;
  disclaimer: string;
  summary: {
    status: PiiRedactionEvidenceStatus;
    requiredArtifacts: number;
    passingArtifacts: number;
    missingArtifacts: PiiRedactionEvidenceArtifactId[];
  };
  controls: PiiRedactionEvidenceControl[];
  artifacts: PiiRedactionEvidenceArtifact[];
}

export interface PiiRedactionEvidenceOptions {
  env?: Record<string, string | undefined>;
  now?: Date;
}

export interface PiiRedactionEvidenceParseOptions {
  now?: Date;
}

const requiredArtifacts: Array<{ id: PiiRedactionEvidenceArtifactId; label: string }> = [
  { id: 'redaction-100-case-suite', label: '100-case PII redaction suite' },
  { id: 'provider-boundary-redaction', label: 'Provider-boundary payload redaction test' },
  { id: 'audit-classification-tags', label: 'Audit PII type/count classification test' },
  { id: 'public-error-sanitization', label: 'Public error-message sanitization test' },
];

const sha256Pattern = /^[a-f0-9]{64}$/u;
const evidenceJsonEnvName = 'GREYBOX_PII_REDACTION_EVIDENCE_JSON';
const evidenceFileEnvName = 'GREYBOX_PII_REDACTION_EVIDENCE_FILE';
const maxEvidencePayloadBytes = 64 * 1024;
const maxEvidenceAgeDays = 45;
const maxEvidenceAgeMs = maxEvidenceAgeDays * 24 * 60 * 60 * 1000;
const unsafeEvidenceFieldPattern = /(?:raw|prompt|output|customer|contact|email|phone|license|gameIp|ipAddress|portal)/iu;

export function buildPiiRedactionEvidenceReport(
  options: PiiRedactionEvidenceOptions = {},
): PiiRedactionEvidenceReport {
  const now = options.now ?? new Date();
  const artifacts = piiRedactionEvidenceFromEnv(options.env ?? process.env, { now });
  const missingArtifacts = requiredArtifacts
    .filter((required) => !artifacts.some((artifact) => artifact.id === required.id && artifact.status === 'pass' && artifact.sourceHash))
    .map((required) => required.id);
  const controls = [
    control(
      'provider-boundary-redaction',
      'Provider-boundary redaction',
      !missingArtifacts.includes('provider-boundary-redaction'),
      'Managed inference redacts prompt, metadata, and project fields before provider clients receive them.',
      'Attach provider-boundary regression evidence with a SHA-256 source hash.',
    ),
    control(
      'audit-classification',
      'Audit classification',
      !missingArtifacts.includes('audit-classification-tags'),
      'Inference audit entries store PII type/count classifications only, never raw prompt values.',
      'Attach audit-classification regression evidence with a SHA-256 source hash.',
    ),
    control(
      'public-error-sanitization',
      'Public error sanitization',
      !missingArtifacts.includes('public-error-sanitization'),
      'Provider-originated errors are PII-redacted before public HTTP responses are returned.',
      'Attach public-error sanitization evidence with a SHA-256 source hash.',
    ),
    control(
      'redaction-regression-suite',
      'Regression suite',
      !missingArtifacts.includes('redaction-100-case-suite'),
      'The redactor covers emails, phones, payment cards, IPv4, and IPv6 cases.',
      'Attach the 100-case redaction-suite evidence with a SHA-256 source hash.',
    ),
  ];
  const status = controls.some((item) => item.status === 'fail') ? 'fail' : 'pass';
  return {
    generatedAt: now.toISOString(),
    disclaimer: 'PII redaction evidence is customer-safe control evidence only. Test artifacts, source hashes, provider DPAs, and production logs remain authoritative.',
    summary: {
      status,
      requiredArtifacts: requiredArtifacts.length,
      passingArtifacts: requiredArtifacts.length - missingArtifacts.length,
      missingArtifacts,
    },
    controls,
    artifacts,
  };
}

export function piiRedactionEvidenceFromEnv(
  env: Record<string, string | undefined> = process.env,
  options: PiiRedactionEvidenceParseOptions = {},
): PiiRedactionEvidenceArtifact[] {
  const raw = evidenceJsonFromEnv(env);
  if (!raw?.trim()) return requiredArtifacts.map((artifact) => ({ ...artifact, status: 'missing' }));
  const now = options.now ?? new Date();
  try {
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed) ? parsed : isRecord(parsed) && Array.isArray(parsed.artifacts) ? parsed.artifacts : [];
    return requiredArtifacts.map((required) => {
      const item = items.find((candidate): candidate is Record<string, unknown> =>
        isRecord(candidate) && candidate.id === required.id);
      const sourceHash = safeHash(item?.sourceHash) ? String(item?.sourceHash) : '';
      const generatedAt = safeIso(item?.generatedAt) ? String(item?.generatedAt) : '';
      const safeArtifact = item?.status === 'pass'
        && sourceHash.length > 0
        && generatedAt.length > 0
        && evidenceTimestampFresh(generatedAt, now)
        && !artifactContainsUnsafeEvidence(item);
      return {
        ...required,
        status: safeArtifact ? 'pass' : 'missing',
        ...(sourceHash ? { sourceHash } : {}),
        ...(generatedAt ? { generatedAt } : {}),
      };
    });
  } catch {
    return requiredArtifacts.map((artifact) => ({ ...artifact, status: 'missing' }));
  }
}

function evidenceJsonFromEnv(env: Record<string, string | undefined>): string | undefined {
  const direct = env[evidenceJsonEnvName];
  if (direct?.trim()) return direct;

  const filePath = env[evidenceFileEnvName]?.trim();
  if (!filePath) return undefined;
  try {
    const text = readFileSync(filePath, 'utf8');
    if (Buffer.byteLength(text, 'utf8') > maxEvidencePayloadBytes) return undefined;
    return evidenceJsonFromText(text);
  } catch {
    return undefined;
  }
}

function evidenceJsonFromText(text: string): string {
  const trimmed = text.trim();
  const dotenvPrefix = `${evidenceJsonEnvName}=`;
  const githubEnvPrefix = `${evidenceJsonEnvName}<<`;
  if (trimmed.startsWith(githubEnvPrefix)) {
    const firstLineEnd = trimmed.indexOf('\n');
    if (firstLineEnd === -1) return text;
    const delimiter = trimmed.slice(githubEnvPrefix.length, firstLineEnd).trim();
    if (!delimiter || /[\r\n]/u.test(delimiter)) return text;
    const bodyStart = firstLineEnd + 1;
    const terminator = `\n${delimiter}`;
    const bodyEnd = trimmed.indexOf(terminator, bodyStart);
    if (bodyEnd === -1) return text;
    return trimmed.slice(bodyStart, bodyEnd);
  }
  if (!trimmed.startsWith(dotenvPrefix)) return text;

  const value = trimmed.slice(dotenvPrefix.length).trim();
  if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
    return value.slice(1, -1);
  }
  return value;
}

export function formatPiiRedactionEvidenceMarkdown(report: PiiRedactionEvidenceReport): string {
  return [
    '# Greybox PII Redaction Evidence',
    '',
    `Status: ${report.summary.status}`,
    `Generated: ${report.generatedAt}`,
    '',
    '## Controls',
    ...report.controls.map((control) => `- ${control.status.toUpperCase()} ${control.label}: ${control.detail}`),
    '',
    '## Evidence Artifacts',
    ...report.artifacts.map((artifact) => `- ${artifact.id}: ${artifact.status}${artifact.sourceHash ? ` (${artifact.sourceHash})` : ''}`),
    '',
    report.disclaimer,
  ].join('\n');
}

function control(
  id: string,
  label: string,
  passes: boolean,
  detail: string,
  remediation: string,
): PiiRedactionEvidenceControl {
  return passes
    ? { id, label, status: 'pass', detail }
    : { id, label, status: 'fail', detail: 'Required customer-safe evidence is missing.', remediation };
}

function safeHash(value: unknown): boolean {
  return typeof value === 'string' && sha256Pattern.test(value);
}

function safeIso(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function evidenceTimestampFresh(generatedAt: string, now: Date): boolean {
  const generatedAtMs = Date.parse(generatedAt);
  const nowMs = now.getTime();
  return Number.isFinite(generatedAtMs)
    && generatedAtMs <= nowMs
    && nowMs - generatedAtMs <= maxEvidenceAgeMs;
}

function artifactContainsUnsafeEvidence(item: Record<string, unknown>): boolean {
  return Object.entries(item).some(([key, value]) => {
    if (unsafeEvidenceFieldPattern.test(key)) return true;
    return typeof value === 'string' && redactPiiText(value) !== value;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
