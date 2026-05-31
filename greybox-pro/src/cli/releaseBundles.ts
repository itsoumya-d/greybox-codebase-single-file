// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { createPublicKey } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildProModuleBundleUploadPlan,
  buildProModuleBundleRelease,
  type ProModuleBundleReleaseManifest,
  type ProModuleBundleReleaseUploadPlan,
} from '../release/bundleRelease.js';
import { stableStringify } from '../bundles/stableStringify.js';

export interface ParsedReleaseArgs {
  privateKey: string;
  keyId: string;
  licenseSecretEnv: string;
  outputDir: string;
  channel: string;
  prefix: string;
  moduleIds: string[];
}

export interface ReleaseBundlesResult {
  outputDir: string;
  manifestPath: string;
  uploadPlanPath: string;
  artifactCount: number;
  totalEnvelopeBytes: number;
  moduleIds: string[];
}

function parseArgs(argv: readonly string[]): ParsedReleaseArgs {
  const values = new Map<string, string[]>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined || !arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }
    values.set(key, [...(values.get(key) ?? []), next]);
    i++;
  }

  for (const key of ['private-key', 'key-id', 'license-secret-env', 'output-dir']) {
    if (!values.has(key)) throw new Error(`Missing required flag --${key}`);
  }

  return {
    privateKey: one(values, 'private-key'),
    keyId: one(values, 'key-id'),
    licenseSecretEnv: one(values, 'license-secret-env'),
    outputDir: one(values, 'output-dir'),
    channel: values.get('channel')?.at(-1) ?? 'alpha',
    prefix: values.get('prefix')?.at(-1) ?? 'pro-modules',
    moduleIds: values.get('module') ?? [],
  };
}

function one(values: Map<string, string[]>, key: string): string {
  const [value] = values.get(key) ?? [];
  if (!value) throw new Error(`Missing required flag --${key}`);
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

function loadLicenseSecret(envName: string, env: NodeJS.ProcessEnv): string {
  const value = env[envName];
  if (!value || value.trim().length === 0) {
    throw new Error(`Environment variable ${envName} is empty; cannot encrypt bundles`);
  }
  return value;
}

function writeJson(path: string, value: ProModuleBundleReleaseManifest | ProModuleBundleReleaseUploadPlan): void {
  writeFileSync(path, stableStringify(value), 'utf8');
}

export function releaseBundles(
  parsed: ParsedReleaseArgs,
  env: NodeJS.ProcessEnv = process.env,
): ReleaseBundlesResult {
  const privateKey = loadPrivateKey(parsed.privateKey);
  const outputDir = isAbsolute(parsed.outputDir)
    ? parsed.outputDir
    : resolvePath(process.cwd(), parsed.outputDir);
  assertCleanOutputDir(outputDir);
  mkdirSync(outputDir, { recursive: true });

  const release = buildProModuleBundleRelease({
    ...(parsed.moduleIds.length > 0 ? { moduleIds: parsed.moduleIds } : {}),
    privateKey,
    publicKeys: { [parsed.keyId]: createPublicKey(privateKey) },
    keyId: parsed.keyId,
    licenseSecret: loadLicenseSecret(parsed.licenseSecretEnv, env),
    releaseChannel: parsed.channel,
    outputPrefix: parsed.prefix,
  });

  for (const artifact of release.artifacts) {
    writeFileSync(join(outputDir, artifact.fileName), artifact.body, 'utf8');
  }
  const manifestPath = join(outputDir, 'manifest.json');
  writeJson(manifestPath, release.manifest);
  const uploadPlanPath = join(outputDir, 'upload-plan.json');
  writeJson(uploadPlanPath, buildProModuleBundleUploadPlan(release));
  return {
    outputDir,
    manifestPath,
    uploadPlanPath,
    artifactCount: release.artifacts.length,
    totalEnvelopeBytes: release.manifest.totalEnvelopeBytes,
    moduleIds: release.manifest.items.map((item) => item.moduleId),
  };
}

function assertCleanOutputDir(outputDir: string): void {
  if (!existsSync(outputDir)) return;
  const staleReleaseFiles = readdirSync(outputDir)
    .filter((entry) => entry === 'manifest.json' || entry === 'upload-plan.json' || entry.endsWith('.gbpro'))
    .sort();
  if (staleReleaseFiles.length > 0) {
    throw new Error(`output directory contains previous release artifacts: ${staleReleaseFiles.join(', ')}`);
  }
}

function printUsage(): void {
  const usage = [
    'Usage: pnpm release-bundles --private-key <pem> --key-id <id> --license-secret-env <ENV> --output-dir <path> [--channel <name>] [--prefix <cdn-prefix>] [--module <id> ...]',
    '',
    'Required flags:',
    '  --private-key          Path to PEM-encoded Ed25519 private signing key.',
    '  --key-id               Identifier of the signing key used by Cloud trust config.',
    '  --license-secret-env   Name of env var holding the license secret used to derive AES-GCM keys.',
    '  --output-dir           Directory for manifest.json and signed .gbpro artifacts.',
    '                         The command also writes upload-plan.json for exact CDN object publishing.',
    '',
    'Optional flags:',
    '  --channel              Release channel path segment. Defaults to alpha.',
    '  --prefix               CDN storage prefix. Defaults to pro-modules.',
    '  --module               Module id to include. Repeat to build a subset; omitted builds every alpha-ready module.',
  ];
  for (const line of usage) console.log(line);
}

export function main(argv: readonly string[]): number {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    printUsage();
    return 0;
  }
  try {
    const result = releaseBundles(parseArgs(argv));
    console.log(stableStringify({
      ok: true,
      outputDir: result.outputDir,
      manifest: result.manifestPath,
      uploadPlan: result.uploadPlanPath,
      artifactCount: result.artifactCount,
      totalEnvelopeBytes: result.totalEnvelopeBytes,
      moduleIds: result.moduleIds,
    }));
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`release-bundles: ${message}\n`);
    return 1;
  }
}

if (process.argv[1] && resolvePath(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
