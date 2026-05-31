// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createGbproBundle } from '../bundles/gbpro.js';
import { stableStringify } from '../bundles/stableStringify.js';
import { validateProModuleReleaseCandidate } from '../release/readiness.js';
import type {
  ProModuleBundleEnvelope,
  ProModuleCategory,
  ProModuleDefinition,
  ProModuleFile,
  ProModuleManifest,
  ProModulePrice,
  ProModuleStatus,
} from '../types.js';

interface ModuleSpecFile {
  path: string;
  mediaType: 'text/markdown' | 'application/json';
  bodyPath: string;
}

interface ModuleSpec {
  order: number;
  category: ProModuleCategory;
  price: ProModulePrice;
  audience: string;
  status: ProModuleStatus;
  targetShipWindowWeeks: number;
  manifest: ProModuleManifest;
  files: ModuleSpecFile[];
  positioning: string;
}

export interface ParsedArgs {
  spec: string;
  privateKey: string;
  keyId: string;
  licenseSecretEnv: string;
  output: string;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const map = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }
    map.set(key, next);
    i++;
  }
  const required = ['spec', 'private-key', 'key-id', 'license-secret-env', 'output'];
  for (const key of required) {
    if (!map.has(key)) throw new Error(`Missing required flag --${key}`);
  }
  return {
    spec: map.get('spec')!,
    privateKey: map.get('private-key')!,
    keyId: map.get('key-id')!,
    licenseSecretEnv: map.get('license-secret-env')!,
    output: map.get('output')!,
  };
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function resolveRelativeTo(specPath: string, target: string): string {
  return isAbsolute(target) ? target : resolvePath(dirname(specPath), target);
}

function readModuleFile(specPath: string, file: ModuleSpecFile): ProModuleFile {
  const absoluteBodyPath = resolveRelativeTo(specPath, file.bodyPath);
  const body = readFileSync(absoluteBodyPath, 'utf8');
  return {
    path: file.path,
    mediaType: file.mediaType,
    body,
    digestSha256: sha256Hex(body),
  };
}

function buildDefinition(spec: ModuleSpec, files: ProModuleFile[]): ProModuleDefinition {
  return {
    order: spec.order,
    category: spec.category,
    price: spec.price,
    audience: spec.audience,
    status: spec.status,
    targetShipWindowWeeks: spec.targetShipWindowWeeks,
    manifest: spec.manifest,
    files,
    positioning: spec.positioning,
  };
}

function loadLicenseSecret(envName: string): string {
  const value = process.env[envName];
  if (!value || value.trim().length === 0) {
    throw new Error(`Environment variable ${envName} is empty; cannot encrypt bundle`);
  }
  return value;
}

function loadPrivateKey(path: string): string {
  const absolute = isAbsolute(path) ? path : resolvePath(process.cwd(), path);
  const body = readFileSync(absolute, 'utf8');
  if (!body.includes('-----BEGIN')) {
    throw new Error(`Private key at ${absolute} is not in PEM format`);
  }
  return body;
}

function ensureOutputDirectory(outputPath: string): void {
  const directory = dirname(outputPath);
  mkdirSync(directory, { recursive: true });
}

function writeBundleEnvelope(outputPath: string, envelope: ProModuleBundleEnvelope): void {
  ensureOutputDirectory(outputPath);
  writeFileSync(outputPath, `${stableStringify(envelope)}\n`, 'utf8');
}

function loadSpec(specPath: string): ModuleSpec {
  const raw = readFileSync(specPath, 'utf8');
  const parsed = JSON.parse(raw) as ModuleSpec;
  if (!parsed.manifest || !parsed.manifest.id) {
    throw new Error(`Module spec at ${specPath} is missing manifest.id`);
  }
  if (!Array.isArray(parsed.files) || parsed.files.length === 0) {
    throw new Error(`Module spec at ${specPath} declares zero files; bundle would be empty`);
  }
  return parsed;
}

function assertReleaseCandidate(definition: ProModuleDefinition): void {
  const validation = validateProModuleReleaseCandidate(definition);
  if (validation.ready) return;
  const details = validation.issues.map((issue) => `${issue.code}: ${issue.detail}`).join('\n- ');
  throw new Error(`Module spec is not a release-candidate .gbpro bundle:\n- ${details}`);
}

export interface AuthorModuleResult {
  outputPath: string;
  moduleId: string;
  version: string;
  fileCount: number;
  payloadSha256: string;
}

export function authorModule(parsed: ParsedArgs): AuthorModuleResult {
  const specPath = isAbsolute(parsed.spec) ? parsed.spec : resolvePath(process.cwd(), parsed.spec);
  const spec = loadSpec(specPath);
  const files = spec.files.map((file) => readModuleFile(specPath, file));
  const definition = buildDefinition(spec, files);
  assertReleaseCandidate(definition);
  const licenseSecret = loadLicenseSecret(parsed.licenseSecretEnv);
  const privateKey = loadPrivateKey(parsed.privateKey);
  const envelope = createGbproBundle(definition, {
    privateKey,
    keyId: parsed.keyId,
    licenseSecret,
  });
  const outputPath = isAbsolute(parsed.output) ? parsed.output : resolvePath(process.cwd(), parsed.output);
  writeBundleEnvelope(outputPath, envelope);
  return {
    outputPath,
    moduleId: envelope.manifest.id,
    version: envelope.manifest.version,
    fileCount: files.length,
    payloadSha256: envelope.payloadSha256,
  };
}

function printUsage(): void {
  const usage = [
    'Usage: pnpm author-module --spec <path> --private-key <pem> --key-id <id> --license-secret-env <ENV> --output <path>',
    '',
    'Required flags:',
    '  --spec                 Path to release-candidate module-spec.json defining full metadata, manifest, and file list.',
    '  --private-key          Path to PEM-encoded Ed25519 private signing key.',
    '  --key-id               Identifier of the signing key (must match a public key in cloud trust store).',
    '  --license-secret-env   Name of env var holding the license secret used to derive the AES-GCM key.',
    '  --output               Destination path for the signed .gbpro bundle JSON.',
    '',
    'Authored files referenced by --spec are resolved relative to the spec file location.',
  ];
  for (const line of usage) console.log(line);
}

export function main(argv: readonly string[]): number {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    printUsage();
    return 0;
  }
  try {
    const parsed = parseArgs(argv);
    const result = authorModule(parsed);
    console.log(stableStringify({
      ok: true,
      output: result.outputPath,
      moduleId: result.moduleId,
      version: result.version,
      fileCount: result.fileCount,
      payloadSha256: result.payloadSha256,
    }));
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`author-module: ${message}\n`);
    return 1;
  }
}

if (process.argv[1] && resolvePath(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
