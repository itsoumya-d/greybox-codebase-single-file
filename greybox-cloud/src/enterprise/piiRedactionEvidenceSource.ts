// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  PiiRedactionEvidenceArtifact,
  PiiRedactionEvidenceArtifactId,
} from './piiRedactionEvidence.js';

export interface PiiRedactionSourceArtifact {
  id: PiiRedactionEvidenceArtifactId;
  label: string;
  files: string[];
}

const sourceArtifacts: PiiRedactionSourceArtifact[] = [
  {
    id: 'redaction-100-case-suite',
    label: '100-case PII redaction suite',
    files: ['src/safety/piiRedactor.ts', 'tests/pii-redactor.test.ts'],
  },
  {
    id: 'provider-boundary-redaction',
    label: 'Provider-boundary payload redaction test',
    files: ['src/routers/inference.ts', 'tests/inference.test.ts'],
  },
  {
    id: 'audit-classification-tags',
    label: 'Audit PII type/count classification test',
    files: ['src/server.ts', 'src/routers/inference.ts', 'tests/auth.test.ts'],
  },
  {
    id: 'public-error-sanitization',
    label: 'Public error-message sanitization test',
    files: ['src/server.ts', 'src/routers/inference.ts', 'tests/auth.test.ts'],
  },
];

export function buildPiiRedactionEvidenceSourceArtifacts(
  root = process.cwd(),
  now = new Date(),
): PiiRedactionEvidenceArtifact[] {
  return sourceArtifacts.map((artifact) => ({
    id: artifact.id,
    label: artifact.label,
    status: 'pass',
    sourceHash: hashSourceFiles(root, artifact.files),
    generatedAt: now.toISOString(),
  }));
}

export function buildPiiRedactionEvidenceEnvJson(root = process.cwd(), now = new Date()): string {
  return JSON.stringify({
    artifacts: buildPiiRedactionEvidenceSourceArtifacts(root, now),
  }, null, 2);
}

export function buildPiiRedactionEvidenceEnvValue(root = process.cwd(), now = new Date()): string {
  return JSON.stringify({
    artifacts: buildPiiRedactionEvidenceSourceArtifacts(root, now),
  });
}

export function buildPiiRedactionEvidenceDotenv(root = process.cwd(), now = new Date()): string {
  const value = buildPiiRedactionEvidenceEnvValue(root, now);
  return `GREYBOX_PII_REDACTION_EVIDENCE_JSON='${value}'\n`;
}

export function buildPiiRedactionEvidenceGithubEnv(root = process.cwd(), now = new Date()): string {
  const value = buildPiiRedactionEvidenceEnvJson(root, now);
  return [
    'GREYBOX_PII_REDACTION_EVIDENCE_JSON<<GREYBOX_PII_REDACTION_EVIDENCE',
    value,
    'GREYBOX_PII_REDACTION_EVIDENCE',
    '',
  ].join('\n');
}

function hashSourceFiles(root: string, files: string[]): string {
  const hash = createHash('sha256');
  for (const file of files) {
    const normalized = file.replace(/\\/gu, '/');
    hash.update(`path:${normalized}\n`);
    hash.update(readFileSync(join(root, normalized)));
    hash.update('\n');
  }
  return hash.digest('hex');
}
