// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { publishBundles } from '../src/cli/publishBundles.js';
import { validateProModuleCloudHandoff } from '../src/cli/validateCloudHandoff.js';
import { releaseBundles } from '../src/cli/releaseBundles.js';
import type {
  ProModuleBundleReleaseUploadPlan,
  ProModuleCloudHandoffReport,
  ProModuleCloudSourceEnvExport,
} from '../src/index.js';

const licenseSecret = 'cloud-handoff-license-secret';

test('validate-cloud-handoff accepts production-backed Pro source evidence', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-pro-cloud-handoff-'));
  try {
    const release = await createRelease(dir);
    const cloudEnvPath = path.join(dir, 'publish', 'cloud-source-env.json');
    const reportPath = path.join(dir, 'publish', 'cloud-handoff-report.json');
    const uploadPlan = JSON.parse(await readFile(release.uploadPlanPath, 'utf8')) as ProModuleBundleReleaseUploadPlan;

    publishBundles({
      releaseDir: release.outputDir,
      uploadPlan: release.uploadPlanPath,
      storageDir: path.join(dir, 'cdn'),
      receipt: path.join(dir, 'publish', 'receipt.json'),
      proof: path.join(dir, 'publish', 'proof.json'),
      cloudEnv: cloudEnvPath,
      provider: 'r2',
      publicBaseUrl: 'https://cdn.greybox.studio',
    }, uploadPlan.generatedAt + 1_000);

    const result = validateProModuleCloudHandoff({
      cloudEnv: cloudEnvPath,
      report: reportPath,
      minBundleModules: 2,
    }, uploadPlan.generatedAt + 2_000);

    assert.equal(result.report.ready, true);
    assert.equal(result.report.provider, 'r2');
    assert.equal(result.report.objectCount, 3);
    assert.deepEqual(result.report.moduleIds, [
      'roguelike-generator-pro',
      'soulslike-combat-pack',
    ]);
    assert.equal(result.report.checks.every((check) => check.status === 'pass'), true);
    assert.equal(result.reportPath, reportPath);
    assert.equal(
      result.report.checks.find((check) => check.id === 'parse-GREYBOX_PRO_MODULE_ENTITLEMENT_REGISTRY_JSON')?.status,
      'pass',
    );
    assert.equal(result.report.checks.find((check) => check.id === 'entitlement-registry-ready')?.status, 'pass');
    assert.equal(result.report.checks.find((check) => check.id === 'entitlement-registry-alignment')?.status, 'pass');

    const persisted = JSON.parse(await readFile(reportPath, 'utf8')) as ProModuleCloudHandoffReport;
    assert.equal(persisted.format, 'greybox.pro.cloud-handoff-report/v1');
    assert.equal(persisted.ready, true);

    const serialized = `${JSON.stringify(result.report)}\n${await readFile(reportPath, 'utf8')}`;
    assert.doesNotMatch(serialized, /encryptedPayload|ciphertext|PRIVATE|cloud-handoff-license-secret|gbx_pro_|X-Amz-Signature|token=/u);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('validate-cloud-handoff accepts legacy Cloud source env without entitlement registry', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-pro-legacy-handoff-'));
  try {
    const release = await createRelease(dir);
    const cloudEnvPath = path.join(dir, 'publish', 'cloud-source-env.json');
    const legacyCloudEnvPath = path.join(dir, 'publish', 'legacy-cloud-source-env.json');
    const uploadPlan = JSON.parse(await readFile(release.uploadPlanPath, 'utf8')) as ProModuleBundleReleaseUploadPlan;

    publishBundles({
      releaseDir: release.outputDir,
      uploadPlan: release.uploadPlanPath,
      storageDir: path.join(dir, 'cdn'),
      receipt: path.join(dir, 'publish', 'receipt.json'),
      proof: path.join(dir, 'publish', 'proof.json'),
      cloudEnv: cloudEnvPath,
      provider: 'r2',
    }, uploadPlan.generatedAt + 1_000);

    const legacyCloudEnv = JSON.parse(await readFile(cloudEnvPath, 'utf8')) as ProModuleCloudSourceEnvExport;
    const legacyVariables = legacyCloudEnv.variables as Record<string, string | undefined>;
    delete legacyVariables.GREYBOX_PRO_MODULE_ENTITLEMENT_REGISTRY_JSON;
    await writeFile(legacyCloudEnvPath, `${JSON.stringify(legacyCloudEnv)}\n`, 'utf8');

    const result = validateProModuleCloudHandoff({
      cloudEnv: legacyCloudEnvPath,
      minBundleModules: 2,
    }, uploadPlan.generatedAt + 2_000);

    assert.equal(result.report.ready, true);
    assert.equal(
      result.report.checks.find((check) => check.id === 'parse-GREYBOX_PRO_MODULE_ENTITLEMENT_REGISTRY_JSON')?.status,
      'pass',
    );
    assert.equal(result.report.checks.find((check) => check.id === 'entitlement-registry-ready'), undefined);
    assert.equal(result.report.checks.find((check) => check.id === 'entitlement-registry-alignment'), undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('validate-cloud-handoff rejects local dry-run provider evidence', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-pro-local-handoff-'));
  try {
    const release = await createRelease(dir);
    const cloudEnvPath = path.join(dir, 'publish', 'cloud-source-env.json');
    const uploadPlan = JSON.parse(await readFile(release.uploadPlanPath, 'utf8')) as ProModuleBundleReleaseUploadPlan;

    publishBundles({
      releaseDir: release.outputDir,
      uploadPlan: release.uploadPlanPath,
      storageDir: path.join(dir, 'cdn'),
      receipt: path.join(dir, 'publish', 'receipt.json'),
      proof: path.join(dir, 'publish', 'proof.json'),
      cloudEnv: cloudEnvPath,
      provider: 'local-dry-run',
    }, uploadPlan.generatedAt + 1_000);

    const result = validateProModuleCloudHandoff({
      cloudEnv: cloudEnvPath,
      minBundleModules: 2,
    }, uploadPlan.generatedAt + 2_000);

    assert.equal(result.report.ready, false);
    assert.equal(result.report.checks.find((check) => check.id === 'publish-proof-ready')?.status, 'pass');
    assert.equal(result.report.checks.find((check) => check.id === 'production-provider')?.status, 'fail');
    assert.equal(result.report.checks.find((check) => check.id === 'entitlement-registry-ready')?.status, 'fail');
    assert.match(
      result.report.checks.find((check) => check.id === 'production-provider')?.detail ?? '',
      /local, dry-run, mock, fixture, or test/u,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('validate-cloud-handoff rejects sandbox provider evidence', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-pro-sandbox-handoff-'));
  try {
    const release = await createRelease(dir);
    const cloudEnvPath = path.join(dir, 'publish', 'cloud-source-env.json');
    const uploadPlan = JSON.parse(await readFile(release.uploadPlanPath, 'utf8')) as ProModuleBundleReleaseUploadPlan;

    publishBundles({
      releaseDir: release.outputDir,
      uploadPlan: release.uploadPlanPath,
      storageDir: path.join(dir, 'cdn'),
      receipt: path.join(dir, 'publish', 'receipt.json'),
      proof: path.join(dir, 'publish', 'proof.json'),
      cloudEnv: cloudEnvPath,
      provider: 'sandbox',
    }, uploadPlan.generatedAt + 1_000);

    const result = validateProModuleCloudHandoff({
      cloudEnv: cloudEnvPath,
      minBundleModules: 2,
    }, uploadPlan.generatedAt + 2_000);

    assert.equal(result.report.ready, false);
    assert.equal(result.report.checks.find((check) => check.id === 'production-provider')?.status, 'fail');
    assert.equal(result.report.checks.find((check) => check.id === 'entitlement-registry-ready')?.status, 'fail');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('validate-cloud-handoff rejects mismatched release, upload, and proof evidence', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-pro-mismatch-handoff-'));
  try {
    const release = await createRelease(dir);
    const cloudEnvPath = path.join(dir, 'publish', 'cloud-source-env.json');
    const tamperedCloudEnvPath = path.join(dir, 'publish', 'tampered-cloud-source-env.json');
    const uploadPlan = JSON.parse(await readFile(release.uploadPlanPath, 'utf8')) as ProModuleBundleReleaseUploadPlan;

    publishBundles({
      releaseDir: release.outputDir,
      uploadPlan: release.uploadPlanPath,
      storageDir: path.join(dir, 'cdn'),
      receipt: path.join(dir, 'publish', 'receipt.json'),
      proof: path.join(dir, 'publish', 'proof.json'),
      cloudEnv: cloudEnvPath,
      provider: 'r2',
    }, uploadPlan.generatedAt + 1_000);

    const cloudEnv = JSON.parse(await readFile(cloudEnvPath, 'utf8')) as ProModuleCloudSourceEnvExport;
    const publishProof = JSON.parse(cloudEnv.variables.GREYBOX_PRO_MODULE_BUNDLE_PUBLISH_PROOF_JSON) as {
      uploadPlan: { bundleModuleIds: string[] };
    };
    publishProof.uploadPlan.bundleModuleIds = ['soulslike-combat-pack'];
    cloudEnv.variables.GREYBOX_PRO_MODULE_BUNDLE_PUBLISH_PROOF_JSON = JSON.stringify(publishProof);
    await writeFile(tamperedCloudEnvPath, `${JSON.stringify(cloudEnv)}\n`, 'utf8');

    const result = validateProModuleCloudHandoff({
      cloudEnv: tamperedCloudEnvPath,
      minBundleModules: 2,
    }, uploadPlan.generatedAt + 2_000);

    assert.equal(result.report.ready, false);
    assert.equal(result.report.checks.find((check) => check.id === 'module-coverage')?.status, 'fail');
    assert.equal(result.report.checks.find((check) => check.id === 'release-fields-match')?.status, 'pass');
    assert.equal(result.report.checks.find((check) => check.id === 'object-counts-match')?.status, 'pass');
    assert.equal(result.report.checks.find((check) => check.id === 'entitlement-registry-ready')?.status, 'pass');
    assert.equal(result.report.checks.find((check) => check.id === 'entitlement-registry-alignment')?.status, 'fail');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

async function createRelease(dir: string): Promise<ReturnType<typeof releaseBundles>> {
  const { privateKey } = generateKeyPairSync('ed25519');
  const privateKeyPath = path.join(dir, 'release-key.pem');
  await writeFile(privateKeyPath, privateKey.export({ format: 'pem', type: 'pkcs8' }), 'utf8');
  return releaseBundles({
    privateKey: privateKeyPath,
    keyId: 'greybox-cloud-handoff-test',
    licenseSecretEnv: 'GBPRO_LICENSE_SECRET',
    outputDir: path.join(dir, 'dist'),
    channel: 'launch',
    prefix: 'greybox-pro',
    moduleIds: ['soulslike-combat-pack', 'roguelike-generator-pro'],
  }, {
    GBPRO_LICENSE_SECRET: licenseSecret,
  });
}
