// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import type { KeyLike } from '../bundles/gbpro.js';
import {
  createGbproBundle,
  decryptGbproBundle,
  verifyGbproBundleSignature,
} from '../bundles/gbpro.js';
import {
  assertCatalogHealthy,
  proModuleCatalog,
  publicCatalog as publicCatalogFor,
} from '../catalog/modules.js';
import type {
  ProModuleDefinition,
  ProModulePublicListing,
  ProModuleReleaseReadinessCheck,
  ProModuleReleaseReadinessIssue,
  ProModuleReleaseReadinessReport,
  ProModuleReleaseReadinessTargets,
  ProModuleReleaseScheduleItem,
} from '../types.js';

const DEFAULT_RELEASE_TARGETS: ProModuleReleaseReadinessTargets = {
  launchModuleCount: 5,
  yearOneModuleCount: 12,
  minModulesByMonth12: 5,
  maxWeeksBetweenReleases: 4,
  month12Weeks: 52,
  minMountsPerModule: 3,
};

const REQUIRED_ENGINE_COMPANION_MODULE_IDS = [
  'unity-full-prefab-export-pro',
  'unreal-blueprint-export-pro',
  'godot-scene-tree-export-pro',
] as const;

const REQUIRED_ROUND_TRIP_VALUE_TYPES = ['int', 'float', 'string', 'Color', 'Vector3'] as const;
const MIN_AUTHORED_BULLETS_PER_PAYLOAD_SECTION = 4;
const MIN_TELEMETRY_SIGNALS_PER_MODULE = 4;
const MIN_TELEMETRY_DASHBOARDS_PER_MODULE = 3;
const RELEASE_CANDIDATE_CATEGORIES = [
  'combat',
  'shooter',
  'cozy-sim',
  'mobile',
  'roguelike',
  'live-ops',
  'monetization',
  'launch',
  'compliance',
  'engine-export',
] as const;

export interface ProModuleBundleVerificationOptions {
  privateKey: KeyLike;
  publicKeys: Readonly<Record<string, KeyLike>>;
  keyId: string;
  licenseSecret: string | Buffer;
  nonceForModule?: (module: ProModuleDefinition, index: number) => Buffer;
}

export interface ProModuleReleaseReadinessOptions {
  catalog?: readonly ProModuleDefinition[];
  targets?: Partial<ProModuleReleaseReadinessTargets>;
  now?: number;
  bundleVerification?: ProModuleBundleVerificationOptions;
}

export interface ProModuleReleaseCandidateValidationReport {
  ready: boolean;
  issues: ProModuleReleaseReadinessIssue[];
}

export function validateProModuleReleaseCandidate(
  module: ProModuleDefinition,
): ProModuleReleaseCandidateValidationReport {
  const issues: ProModuleReleaseReadinessIssue[] = [];

  try {
    assertCatalogHealthy([module]);
  } catch (error) {
    issues.push({
      code: 'catalog_invalid',
      severity: 'error',
      moduleId: module.manifest?.id,
      detail: error instanceof Error ? error.message : String(error),
      remediation: 'Fix unsafe metadata, missing mounted files, or digest drift before authoring a .gbpro bundle.',
    });
  }

  const metadataIssues = releaseCandidateMetadataIssues(module);
  if (metadataIssues.length > 0) {
    issues.push({
      code: 'catalog_invalid',
      severity: 'error',
      moduleId: module.manifest?.id,
      detail: `Release-candidate metadata is incomplete: ${metadataIssues.join('; ')}.`,
      remediation: 'Author specs must include paid release metadata: order, category, price, audience, alpha-ready status, ship window, positioning, Pro license tier, min AGDS version, and manifest description.',
    });
  }

  const mountCount = countMounts(module);
  if (mountCount < DEFAULT_RELEASE_TARGETS.minMountsPerModule) {
    issues.push({
      code: 'mount_shortfall',
      severity: 'error',
      moduleId: module.manifest.id,
      detail: `${module.manifest.name} exposes only ${mountCount} public mount(s).`,
      remediation: 'Every authored .gbpro release candidate needs skill, art-bible, and engine-target mounts.',
    });
  }

  if (module.files.length < 5) {
    issues.push({
      code: 'payload_file_shortfall',
      severity: 'error',
      moduleId: module.manifest.id,
      detail: `${module.manifest.name} carries only ${module.files.length} encrypted payload file(s).`,
      remediation: 'Include skill, art bible, engine target, playbook, and telemetry payload files.',
    });
  }

  const missingClasses = missingPayloadClasses(module);
  if (missingClasses.length > 0) {
    issues.push({
      code: 'payload_class_missing',
      severity: 'error',
      moduleId: module.manifest.id,
      detail: `${module.manifest.name} is missing ${missingClasses.join(', ')} payload class(es).`,
      remediation: 'Every authored .gbpro release candidate must carry skill, art bible, engine target, production playbook, and aggregate telemetry payloads.',
    });
  }

  const contractIssues = engineTargetContractIssues(module);
  if (contractIssues.length > 0) {
    issues.push({
      code: 'engine_target_contract_missing',
      severity: 'error',
      moduleId: module.manifest.id,
      detail: `${module.manifest.name} has incomplete engine target contract(s): ${contractIssues.join('; ')}.`,
      remediation: 'Engine target payloads must expose schema-versioned, typed, designer-reviewed round-trip field contracts.',
    });
  }

  const authoredIssues = authoredPayloadDepthIssues(module);
  if (authoredIssues.length > 0) {
    issues.push({
      code: 'payload_class_missing',
      severity: 'error',
      moduleId: module.manifest.id,
      detail: `${module.manifest.name} has incomplete authored payload depth: ${authoredIssues.join('; ')}.`,
      remediation: 'Every authored .gbpro release candidate must carry concrete skill recipes, art direction, engine object plans, playbook steps, tuning defaults, and aggregate telemetry.',
    });
  }

  const disclosureIssues = aiDisclosureContractIssues(module);
  if (disclosureIssues.length > 0) {
    issues.push({
      code: 'ai_disclosure_contract_missing',
      severity: 'error',
      moduleId: module.manifest.id,
      detail: `${module.manifest.name} has incomplete AI disclosure contract(s): ${disclosureIssues.join('; ')}.`,
      remediation: 'Paid packs must say AI-assisted, require human designer credit, and never claim unattended AI generation.',
    });
  }

  return {
    ready: issues.every((issue) => issue.severity !== 'error'),
    issues,
  };
}

export function buildProModuleReleaseReadinessReport(
  options: ProModuleReleaseReadinessOptions = {},
): ProModuleReleaseReadinessReport {
  const catalog = [...(options.catalog ?? proModuleCatalog)].sort((left, right) => left.order - right.order);
  const targets = releaseReadinessTargets(options.targets ?? {});
  const issues: ProModuleReleaseReadinessIssue[] = [];
  const publicCatalog = publicCatalogFor(catalog);

  try {
    assertCatalogHealthy(catalog);
  } catch (error) {
    issues.push({
      code: 'catalog_invalid',
      severity: 'error',
      detail: error instanceof Error ? error.message : String(error),
      remediation: 'Fix duplicate module ids, missing mounted files, or digest drift before release.',
    });
  }

  const alphaReady = catalog.filter((module) => module.status === 'alpha-ready');
  const scheduledModules = alphaReady.slice(0, targets.yearOneModuleCount);
  const launchModules = scheduledModules.slice(0, targets.launchModuleCount);
  const schedule = scheduledModules.map((module, index) => releaseScheduleItem({
    module,
    publicListing: publicCatalog.find((listing) => listing.id === module.manifest.id),
    bundleVerified: verifyBundleIfRequested(module, index, options.bundleVerification, issues),
  }));

  let shipWeek = 0;
  for (const item of schedule) {
    shipWeek += Math.max(1, catalog.find((module) => module.manifest.id === item.moduleId)?.targetShipWindowWeeks ?? 4);
    item.shipWeek = shipWeek;
  }

  if (launchModules.length < targets.launchModuleCount) {
    issues.push({
      code: 'launch_module_shortfall',
      severity: 'error',
      detail: `Launch train needs ${targets.launchModuleCount - launchModules.length} more alpha-ready module(s).`,
      remediation: 'Promote enough paid modules to alpha-ready before publishing the Pro launch train.',
    });
  }

  if (scheduledModules.length < targets.yearOneModuleCount) {
    issues.push({
      code: 'year_one_module_shortfall',
      severity: 'error',
      detail: `Year-one ship list needs ${targets.yearOneModuleCount - scheduledModules.length} more alpha-ready module(s).`,
      remediation: 'Promote the full paid module queue to alpha-ready before claiming the year-one Pro milestone.',
    });
  }

  if (alphaReady.length < targets.minModulesByMonth12) {
    issues.push({
      code: 'month12_shortfall',
      severity: 'error',
      detail: `Month-12 target needs ${targets.minModulesByMonth12 - alphaReady.length} more alpha-ready module(s).`,
      remediation: 'Ship at least five paid modules by month 12 to keep Pro revenue on plan.',
    });
  }

  for (const [index, item] of schedule.entries()) {
    const module = scheduledModules[index];
    const priorWeek = index === 0 ? 0 : schedule[index - 1]?.shipWeek ?? 0;
    if (item.shipWeek - priorWeek > targets.maxWeeksBetweenReleases) {
      issues.push({
        code: 'release_cadence_slip',
        severity: 'error',
        moduleId: item.moduleId,
        detail: `${item.name} ships ${item.shipWeek - priorWeek} weeks after the prior Pro module.`,
        remediation: 'Keep paid module releases inside the 2-4 week operating cadence.',
      });
    }
    if (item.mountCount < targets.minMountsPerModule) {
      issues.push({
        code: 'mount_shortfall',
        severity: 'error',
        moduleId: item.moduleId,
        detail: `${item.name} exposes only ${item.mountCount} public mount(s).`,
        remediation: 'Every launch module needs skill, art-bible, and engine-target mounts.',
      });
    }
    if (item.fileCount < 5) {
      issues.push({
        code: 'payload_file_shortfall',
        severity: 'error',
        moduleId: item.moduleId,
        detail: `${item.name} carries only ${item.fileCount} encrypted payload file(s).`,
        remediation: 'Include skill, art bible, engine target, playbook, and telemetry payload files.',
      });
    }
    if (module && !item.payloadClassesComplete) {
      const missingClasses = missingPayloadClasses(module);
      issues.push({
        code: 'payload_class_missing',
        severity: 'error',
        moduleId: item.moduleId,
        detail: `${item.name} is missing ${missingClasses.join(', ')} payload class(es).`,
        remediation: 'Every paid module must carry skill, art bible, engine target, production playbook, and aggregate telemetry payloads.',
      });
    }
    if (module && !item.payloadContractsComplete) {
      const contractIssues = engineTargetContractIssues(module);
      issues.push({
        code: 'engine_target_contract_missing',
        severity: 'error',
        moduleId: item.moduleId,
        detail: `${item.name} has incomplete engine target contract(s): ${contractIssues.join('; ')}.`,
        remediation: 'Engine target payloads must expose schema-versioned, typed, designer-reviewed round-trip field contracts.',
      });
    }
    if (module) {
      const authoredIssues = authoredPayloadDepthIssues(module);
      if (authoredIssues.length > 0) {
        issues.push({
          code: 'payload_class_missing',
          severity: 'error',
          moduleId: item.moduleId,
          detail: `${item.name} has incomplete authored payload depth: ${authoredIssues.join('; ')}.`,
          remediation: 'Every alpha-ready paid module must carry concrete skill recipes, art direction, engine object plans, playbook steps, tuning defaults, and aggregate telemetry.',
        });
      }
    }
    if (module && !item.disclosureContractsComplete) {
      const disclosureIssues = aiDisclosureContractIssues(module);
      issues.push({
        code: 'ai_disclosure_contract_missing',
        severity: 'error',
        moduleId: item.moduleId,
        detail: `${item.name} has incomplete AI disclosure contract(s): ${disclosureIssues.join('; ')}.`,
        remediation: 'Paid packs must say AI-assisted, require human designer credit, and never claim unattended AI generation.',
      });
    }
    if (!item.publicListingSafe) {
      issues.push({
        code: 'public_listing_unsafe',
        severity: 'error',
        moduleId: item.moduleId,
        detail: `${item.name} public listing includes payload-shaped or proprietary material.`,
        remediation: 'Expose only manifest metadata and aggregate sellable fields in public listings.',
      });
    }
  }

  const alphaReadyModuleIds = new Set(alphaReady.map((module) => module.manifest.id));
  for (const moduleId of REQUIRED_ENGINE_COMPANION_MODULE_IDS) {
    if (!alphaReadyModuleIds.has(moduleId)) {
      issues.push({
        code: 'engine_companion_missing',
        severity: 'error',
        moduleId,
        detail: `${moduleId} is not alpha-ready in the paid engine companion set.`,
        remediation: 'Keep Unity, Unreal, and Godot paid export companions alpha-ready before the year-one Pro train is green.',
      });
    }
  }

  if (!options.bundleVerification) {
    issues.push({
      code: 'bundle_verification_not_run',
      severity: 'error',
      detail: 'Release readiness requires signed .gbpro dry-run verification.',
      remediation: 'Run the report with a signing key, trusted public key, and license-secret fixture.',
    });
  }

  const latestLaunchShipWeek = schedule
    .slice(0, targets.launchModuleCount)
    .reduce((latest, item) => Math.max(latest, item.shipWeek), 0);
  const latestYearOneShipWeek = schedule.reduce((latest, item) => Math.max(latest, item.shipWeek), 0);
  const month12BoundaryItem = schedule[Math.max(0, targets.minModulesByMonth12 - 1)];
  if (
    alphaReady.length >= targets.minModulesByMonth12
    && month12BoundaryItem
    && month12BoundaryItem.shipWeek > targets.month12Weeks
  ) {
    issues.push({
      code: 'month12_shortfall',
      severity: 'error',
      detail: `First ${targets.minModulesByMonth12} paid modules land at week ${month12BoundaryItem.shipWeek}, after month 12.`,
      remediation: 'Move paid module release windows earlier to protect month-12 Pro revenue.',
    });
  }

  const checks = releaseReadinessChecks(issues, {
    alphaReadyCount: alphaReady.length,
    launchCount: launchModules.length,
    yearOneCount: scheduledModules.length,
    latestLaunchShipWeek,
    latestYearOneShipWeek,
    bundleVerificationRequested: Boolean(options.bundleVerification),
  }, targets);

  return {
    ready: checks.every((check) => check.status !== 'fail'),
    generatedAt: options.now ?? Date.now(),
    targets,
    summary: {
      totalModules: catalog.length,
      alphaReadyModules: alphaReady.length,
      launchModulesScheduled: launchModules.length,
      yearOneModulesScheduled: scheduledModules.length,
      cumulativeLaunchPriceUsd: schedule
        .slice(0, targets.launchModuleCount)
        .reduce((total, item) => total + item.price.oneTimeUsd, 0),
      cumulativeYearOnePriceUsd: schedule.reduce((total, item) => total + item.price.oneTimeUsd, 0),
      monthlyRecurringUsd: schedule.reduce((total, item) => total + (item.price.monthlyUsd ?? 0), 0),
      latestLaunchShipWeek,
      latestYearOneShipWeek,
      engineExportModules: scheduledModules.filter((module) => module.category === 'engine-export').length,
    },
    schedule,
    publicCatalog: [...publicCatalog],
    checks,
    issues,
  };
}

function releaseReadinessTargets(
  overrides: Partial<ProModuleReleaseReadinessTargets>,
): ProModuleReleaseReadinessTargets {
  const targets = { ...DEFAULT_RELEASE_TARGETS, ...overrides };
  for (const [key, value] of Object.entries(targets)) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${key} must be a non-negative integer`);
    }
  }
  return targets;
}

function releaseCandidateMetadataIssues(module: ProModuleDefinition): string[] {
  const issues: string[] = [];
  if (!Number.isInteger(module.order) || module.order <= 0) {
    issues.push('order must be a positive integer');
  }
  if (!RELEASE_CANDIDATE_CATEGORIES.includes(module.category as typeof RELEASE_CANDIDATE_CATEGORIES[number])) {
    issues.push('category must be a known Pro module category');
  }
  if (!module.price || module.price.currency !== 'USD' || !Number.isFinite(module.price.oneTimeUsd) || module.price.oneTimeUsd <= 0) {
    issues.push('price.oneTimeUsd must be a positive USD amount');
  }
  if (module.price?.monthlyUsd !== undefined && (!Number.isFinite(module.price.monthlyUsd) || module.price.monthlyUsd < 0)) {
    issues.push('price.monthlyUsd must be non-negative when present');
  }
  if (!module.audience?.trim()) {
    issues.push('audience is required');
  }
  if (module.status !== 'alpha-ready') {
    issues.push('status must be alpha-ready');
  }
  if (
    !Number.isInteger(module.targetShipWindowWeeks)
    || module.targetShipWindowWeeks < 1
    || module.targetShipWindowWeeks > DEFAULT_RELEASE_TARGETS.maxWeeksBetweenReleases
  ) {
    issues.push(`targetShipWindowWeeks must be 1-${DEFAULT_RELEASE_TARGETS.maxWeeksBetweenReleases}`);
  }
  if (!module.positioning?.trim()) {
    issues.push('positioning is required');
  }
  if (!module.manifest.description?.trim()) {
    issues.push('manifest.description is required');
  }
  if (module.manifest.licenseTier !== 'pro') {
    issues.push('manifest.licenseTier must be pro');
  }
  if (!module.manifest.minAgdsVersion?.trim()) {
    issues.push('manifest.minAgdsVersion is required');
  }
  return issues;
}

function releaseScheduleItem(input: {
  module: ProModuleDefinition;
  publicListing: ProModulePublicListing | undefined;
  bundleVerified: boolean;
}): ProModuleReleaseScheduleItem {
  const mountCount = countMounts(input.module);
  const payloadClassesComplete = missingPayloadClasses(input.module).length === 0;
  const payloadContractsComplete = engineTargetContractIssues(input.module).length === 0;
  const disclosureContractsComplete = aiDisclosureContractIssues(input.module).length === 0;
  return {
    order: input.module.order,
    moduleId: input.module.manifest.id,
    name: input.module.manifest.name,
    status: input.module.status,
    shipWeek: 0,
    price: input.module.price,
    audience: input.module.audience,
    mountCount,
    fileCount: input.module.files.length,
    publicListingSafe: publicListingSafe(input.publicListing),
    payloadClassesComplete,
    payloadContractsComplete,
    disclosureContractsComplete,
    bundleVerified: input.bundleVerified,
  };
}

function verifyBundleIfRequested(
  module: ProModuleDefinition,
  index: number,
  options: ProModuleBundleVerificationOptions | undefined,
  issues: ProModuleReleaseReadinessIssue[],
): boolean {
  if (!options) return false;
  try {
    const bundle = createGbproBundle(module, {
      privateKey: options.privateKey,
      keyId: options.keyId,
      licenseSecret: options.licenseSecret,
      ...(options.nonceForModule ? { nonce: options.nonceForModule(module, index) } : {}),
    });
    const verified = verifyGbproBundleSignature(bundle, options.publicKeys);
    if (verified.ok === false) throw new Error(verified.message);
    const payload = decryptGbproBundle(bundle, options.licenseSecret);
    if (payload.moduleId !== module.manifest.id || payload.version !== module.manifest.version) {
      throw new Error('decrypted payload module metadata does not match manifest');
    }
    if (payload.files.length !== module.files.length) {
      throw new Error('decrypted payload file count does not match module definition');
    }
    if (JSON.stringify(bundle).includes('Proprietary and confidential')) {
      throw new Error('public bundle envelope leaks proprietary payload text');
    }
    return true;
  } catch (error) {
    issues.push({
      code: 'bundle_verification_failed',
      severity: 'error',
      moduleId: module.manifest.id,
      detail: error instanceof Error ? error.message : String(error),
      remediation: 'Regenerate, sign, and verify the .gbpro bundle before release.',
    });
    return false;
  }
}

function countMounts(module: ProModuleDefinition): number {
  return Object.values(module.manifest.mounts).reduce((count, mounts) => count + (mounts?.length ?? 0), 0);
}

function missingPayloadClasses(module: ProModuleDefinition): string[] {
  const paths = module.files.map((file) => file.path);
  const hasMountedSkill = Boolean(module.manifest.mounts.skills?.some((mount) => mount.entry));
  const hasMountedArtBible = Boolean(module.manifest.mounts.gameArtBibles?.some((mount) => mount.entry));
  const hasMountedEngineTarget = Boolean(module.manifest.mounts.engineTargets?.some((mount) => mount.entry));
  const checks = [
    {
      label: 'skill',
      present: hasMountedSkill && paths.some((path) => path.startsWith('skills/') && path.endsWith('/SKILL.md')),
    },
    {
      label: 'art bible',
      present: hasMountedArtBible && paths.some((path) => path.startsWith('game-art-bibles/') && path.endsWith('/DESIGN.md')),
    },
    {
      label: 'engine target',
      present: hasMountedEngineTarget && paths.some((path) => path.startsWith('engine-targets/') && path.endsWith('.json')),
    },
    {
      label: 'production playbook',
      present: paths.some((path) => path.startsWith('playbooks/') && path.endsWith('/PLAYBOOK.md')),
    },
    {
      label: 'aggregate telemetry',
      present: paths.some((path) => path.startsWith('telemetry/') && path.endsWith('/signals.json')),
    },
  ];
  return checks.flatMap((check) => (check.present ? [] : [check.label]));
}

function engineTargetContractIssues(module: ProModuleDefinition): string[] {
  const engineTargetFiles = module.files.filter((file) => (
    file.path.startsWith('engine-targets/') && file.path.endsWith('.json')
  ));
  if (engineTargetFiles.length === 0) return ['missing engine target payload'];

  const issues: string[] = [];
  for (const file of engineTargetFiles) {
    let payload: unknown;
    try {
      payload = JSON.parse(file.body);
    } catch {
      issues.push(`${file.path} is not valid JSON`);
      continue;
    }

    const target = asRecord(payload);
    if (!target) {
      issues.push(`${file.path} is not an object`);
      continue;
    }
    if (target.schemaVersion !== 'greybox.pro.engine-target/v1') {
      issues.push(`${file.path} is missing schemaVersion greybox.pro.engine-target/v1`);
    }
    if (target.designerReviewRequired !== true) {
      issues.push(`${file.path} does not require designer review`);
    }

    const supportedValueTypes = stringArray(target.supportedValueTypes);
    if (!supportedValueTypes || !REQUIRED_ROUND_TRIP_VALUE_TYPES.every((valueType) => supportedValueTypes.includes(valueType))) {
      issues.push(`${file.path} does not list all supported round-trip value types`);
    }

    const targetEngines = stringArray(target.targetEngines);
    if (!targetEngines?.length) {
      issues.push(`${file.path} does not declare target engines`);
    }

    const tuningFields = stringArray(target.tuningFields);
    if (!tuningFields?.length) {
      issues.push(`${file.path} does not declare tuning fields`);
    }
    const roundTripSafeFields = stringArray(target.roundTripSafeFields);
    if (!roundTripSafeFields?.length || !tuningFields?.every((field) => roundTripSafeFields.includes(field))) {
      issues.push(`${file.path} does not declare every tuning field as round-trip safe`);
    }
    if (roundTripSafeFields?.length && tuningFields?.length) {
      const missingSafeFields = tuningFields.filter((field) => !roundTripSafeFields.includes(field));
      const extraSafeFields = roundTripSafeFields.filter((field) => !tuningFields.includes(field));
      const duplicateSafeFields = duplicates(roundTripSafeFields);
      if (missingSafeFields.length || extraSafeFields.length || duplicateSafeFields.length) {
        issues.push(`${file.path} round-trip safe fields must exactly match tuning fields`
          + formatCoverageIssue(missingSafeFields, extraSafeFields, duplicateSafeFields));
      }
    }

    const fieldContracts = Array.isArray(target.fieldContracts) ? target.fieldContracts : undefined;
    if (!fieldContracts?.length) {
      issues.push(`${file.path} does not expose field contracts`);
      continue;
    }
    if (tuningFields && fieldContracts.length !== tuningFields.length) {
      issues.push(`${file.path} field contract count does not match tuning field count`);
    }

    for (const [index, contractValue] of fieldContracts.entries()) {
      const contract = asRecord(contractValue);
      if (!contract) {
        issues.push(`${file.path} field contract ${index + 1} is not an object`);
        continue;
      }
      if (typeof contract.field !== 'string' || !contract.field) {
        issues.push(`${file.path} field contract ${index + 1} is missing field`);
      }
      if (typeof contract.valueType !== 'string' || !supportedValueTypes?.includes(contract.valueType)) {
        issues.push(`${file.path} field contract ${contract.field ?? index + 1} has unsupported valueType`);
      }
      if (contract.reviewRequired !== true) {
        issues.push(`${file.path} field contract ${contract.field ?? index + 1} does not require review`);
      }
      if (contract.conflictPolicy !== 'designer-review') {
        issues.push(`${file.path} field contract ${contract.field ?? index + 1} does not fail into designer review`);
      }
      if (contract.mergeStrategy !== 'three-way-last-synced-base') {
        issues.push(`${file.path} field contract ${contract.field ?? index + 1} does not use three-way merge`);
      }
      const engineBindings = asRecord(contract.engineBindings);
      if (!engineBindings) {
        issues.push(`${file.path} field contract ${contract.field ?? index + 1} does not expose engine bindings`);
        continue;
      }
      for (const engine of targetEngines ?? []) {
        if (!asRecord(engineBindings[engine])) {
          issues.push(`${file.path} field contract ${contract.field ?? index + 1} is missing ${engine} binding`);
        }
      }
    }

    const contractFields = fieldContracts.flatMap((contractValue) => {
      const contract = asRecord(contractValue);
      return typeof contract?.field === 'string' && contract.field
        ? [contract.field]
        : [];
    });
    if (tuningFields?.length && contractFields.length) {
      const missingContractFields = tuningFields.filter((field) => !contractFields.includes(field));
      const extraContractFields = contractFields.filter((field) => !tuningFields.includes(field));
      const duplicateContractFields = duplicates(contractFields);
      if (missingContractFields.length || extraContractFields.length || duplicateContractFields.length) {
        issues.push(`${file.path} field contracts must exactly match tuning fields`
          + formatCoverageIssue(missingContractFields, extraContractFields, duplicateContractFields));
      }
    }
  }

  return issues;
}

function authoredPayloadDepthIssues(module: ProModuleDefinition): string[] {
  const skillFiles = module.files.filter((file) => file.path.startsWith('skills/') && file.path.endsWith('/SKILL.md'));
  const artBibleFiles = module.files.filter((file) => file.path.startsWith('game-art-bibles/') && file.path.endsWith('/DESIGN.md'));
  const engineTargetFiles = module.files.filter((file) => (
    file.path.startsWith('engine-targets/') && file.path.endsWith('.json')
  ));
  const playbookFiles = module.files.filter((file) => file.path.startsWith('playbooks/') && file.path.endsWith('/PLAYBOOK.md'));
  const telemetryFiles = module.files.filter((file) => file.path.startsWith('telemetry/') && file.path.endsWith('/signals.json'));

  const issues: string[] = [];
  if (skillFiles.length === 0) {
    issues.push('missing skill payload');
  }
  for (const file of skillFiles) {
    if (markdownSectionBulletCount(file.body, 'Paid Pack Recipes') < MIN_AUTHORED_BULLETS_PER_PAYLOAD_SECTION) {
      issues.push(`${file.path} needs at least four paid pack recipes`);
    }
  }

  if (artBibleFiles.length === 0) {
    issues.push('missing art bible payload');
  }
  for (const file of artBibleFiles) {
    if (markdownSectionBulletCount(file.body, 'Closed-Core Art Direction') < MIN_AUTHORED_BULLETS_PER_PAYLOAD_SECTION) {
      issues.push(`${file.path} needs at least four closed-core art direction notes`);
    }
  }

  if (playbookFiles.length === 0) {
    issues.push('missing production playbook payload');
  }
  for (const file of playbookFiles) {
    if (markdownSectionBulletCount(file.body, 'Reference Encounter Beats') < MIN_AUTHORED_BULLETS_PER_PAYLOAD_SECTION) {
      issues.push(`${file.path} needs at least four reference encounter beats`);
    }
    const implementationStepCount = Math.max(
      markdownSectionBulletCount(file.body, 'Engine Implementation Steps'),
      markdownSectionBulletCount(file.body, 'Unity Implementation Steps'),
    );
    if (implementationStepCount < MIN_AUTHORED_BULLETS_PER_PAYLOAD_SECTION) {
      issues.push(`${file.path} needs at least four engine implementation steps`);
    }
  }

  if (telemetryFiles.length === 0) {
    issues.push('missing aggregate telemetry payload');
  }
  for (const file of telemetryFiles) {
    const telemetry = parseTelemetryJson(file, issues);
    if (!telemetry) continue;

    const signals = Array.isArray(telemetry.signals) ? telemetry.signals : undefined;
    if (!signals || signals.length < MIN_TELEMETRY_SIGNALS_PER_MODULE) {
      issues.push(`${file.path} needs at least four aggregate telemetry signals`);
    }
    const signalIds = signals?.flatMap((signal) => {
      const record = asRecord(signal);
      return typeof record?.id === 'string' && record.id ? [record.id] : [];
    }) ?? [];
    if (signals && signalIds.length !== signals.length) {
      issues.push(`${file.path} telemetry signals need stable ids`);
    }
    const duplicateSignalIds = duplicates(signalIds);
    if (duplicateSignalIds.length > 0) {
      issues.push(`${file.path} telemetry signal ids must be unique (${duplicateSignalIds.join(', ')})`);
    }
    if (signals?.some((signal) => asRecord(signal)?.privacy !== 'aggregate-only')) {
      issues.push(`${file.path} telemetry signals must stay aggregate-only`);
    }
    const dashboards = stringArray(telemetry.dashboards);
    if (!dashboards || dashboards.length < MIN_TELEMETRY_DASHBOARDS_PER_MODULE) {
      issues.push(`${file.path} needs at least three telemetry dashboards`);
    }
  }

  if (engineTargetFiles.length === 0) return [...issues, 'missing engine target payload'];
  for (const file of engineTargetFiles) {
    let payload: unknown;
    try {
      payload = JSON.parse(file.body);
    } catch {
      issues.push(`${file.path} is not valid JSON`);
      continue;
    }
    const target = asRecord(payload);
    const proprietaryPayload = asRecord(target?.proprietaryPayload);
    if (!target || !proprietaryPayload) {
      issues.push(`${file.path} is missing proprietaryPayload`);
      continue;
    }

    const referenceEncounter = asRecord(proprietaryPayload.referenceEncounter);
    const beats = stringArray(referenceEncounter?.beats);
    if (
      typeof referenceEncounter?.id !== 'string'
      || typeof referenceEncounter?.name !== 'string'
      || !beats
      || beats.length < 4
    ) {
      issues.push(`${file.path} needs a named reference encounter with at least four beats`);
    }

    const unityObjects = stringArray(proprietaryPayload.unityObjects);
    if (!unityObjects || unityObjects.length < 4) {
      issues.push(`${file.path} needs at least four engine object implementation notes`);
    }

    const tuningFields = stringArray(target.tuningFields) ?? [];
    const tuningDefaults = asRecord(proprietaryPayload.tuningDefaults);
    if (!tuningDefaults) {
      issues.push(`${file.path} is missing tuning defaults`);
    } else if (tuningFields.length > 0) {
      const defaultFields = Object.keys(tuningDefaults);
      const missingDefaults = tuningFields.filter((field) => !defaultFields.includes(field));
      const extraDefaults = defaultFields.filter((field) => !tuningFields.includes(field));
      if (missingDefaults.length || extraDefaults.length) {
        issues.push(`${file.path} tuning defaults must exactly match tuning fields`
          + formatCoverageIssue(missingDefaults, extraDefaults, []));
      }
    }
  }

  return issues;
}

function markdownSectionBulletCount(body: string, heading: string): number {
  const headingPattern = new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$`, 'mu');
  const headingMatch = headingPattern.exec(body);
  if (!headingMatch) return 0;
  const sectionStart = headingMatch.index + headingMatch[0].length;
  const nextHeading = body.slice(sectionStart).match(/\n##\s+/u);
  const section = nextHeading?.index === undefined
    ? body.slice(sectionStart)
    : body.slice(sectionStart, sectionStart + nextHeading.index);
  return section
    .split('\n')
    .filter((line) => /^-\s+\S/u.test(line.trim()))
    .length;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function aiDisclosureContractIssues(module: ProModuleDefinition): string[] {
  const issues: string[] = [];
  for (const file of module.files) {
    if (/\bAI[-\s]?generated\b/iu.test(file.body)) {
      issues.push(`${file.path} uses banned AI-generated language`);
    }
  }

  const skillFiles = module.files.filter((file) => file.path.startsWith('skills/') && file.path.endsWith('/SKILL.md'));
  if (skillFiles.length === 0) {
    issues.push('missing skill disclosure payload');
  }
  for (const file of skillFiles) {
    if (!/\bAI-assisted\b/u.test(file.body)) {
      issues.push(`${file.path} does not disclose AI-assisted design`);
    }
    if (!/human designer/u.test(file.body)) {
      issues.push(`${file.path} does not preserve human designer authorship`);
    }
  }

  const engineTargetFiles = module.files.filter((file) => (
    file.path.startsWith('engine-targets/') && file.path.endsWith('.json')
  ));
  if (engineTargetFiles.length === 0) {
    issues.push('missing engine target disclosure payload');
  }
  for (const file of engineTargetFiles) {
    const target = parseDisclosureJson(file, issues);
    if (!target) continue;
    if (target.aiDisclosure !== 'AI-assisted') {
      issues.push(`${file.path} does not declare aiDisclosure=AI-assisted`);
    }
    if (target.humanDesignerCreditRequired !== true) {
      issues.push(`${file.path} does not require human designer credit`);
    }
  }

  const telemetryFiles = module.files.filter((file) => file.path.startsWith('telemetry/') && file.path.endsWith('/signals.json'));
  if (telemetryFiles.length === 0) {
    issues.push('missing telemetry disclosure payload');
  }
  for (const file of telemetryFiles) {
    const telemetry = parseDisclosureJson(file, issues);
    if (!telemetry) continue;
    if (telemetry.aiDisclosure !== 'AI-assisted') {
      issues.push(`${file.path} does not declare aiDisclosure=AI-assisted`);
    }
    if (telemetry.noTrainingWithoutOptIn !== true) {
      issues.push(`${file.path} does not require opt-in before training use`);
    }
  }

  return issues;
}

function parseDisclosureJson(
  file: ProModuleDefinition['files'][number],
  issues: string[],
): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(file.body);
    const record = asRecord(parsed);
    if (!record) issues.push(`${file.path} disclosure payload is not an object`);
    return record;
  } catch {
    issues.push(`${file.path} disclosure payload is not valid JSON`);
    return undefined;
  }
}

function parseTelemetryJson(
  file: ProModuleDefinition['files'][number],
  issues: string[],
): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(file.body);
    const record = asRecord(parsed);
    if (!record) issues.push(`${file.path} telemetry payload is not an object`);
    return record;
  } catch {
    issues.push(`${file.path} telemetry payload is not valid JSON`);
    return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value
    : undefined;
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicated.add(value);
    seen.add(value);
  }
  return [...duplicated].sort();
}

function formatCoverageIssue(
  missing: readonly string[],
  extra: readonly string[],
  duplicate: readonly string[],
): string {
  const details = [
    missing.length ? `missing: ${missing.join(', ')}` : '',
    extra.length ? `extra: ${extra.join(', ')}` : '',
    duplicate.length ? `duplicate: ${duplicate.join(', ')}` : '',
  ].filter(Boolean);
  return details.length ? ` (${details.join('; ')})` : '';
}

function publicListingSafe(listing: ProModulePublicListing | undefined): boolean {
  if (!listing) return false;
  const serialized = JSON.stringify(listing);
  return !serialized.includes('Proprietary and confidential')
    && !serialized.includes('encryptedPayload')
    && !serialized.includes('ciphertext')
    && !serialized.includes('body')
    && !serialized.includes('files');
}

function releaseReadinessChecks(
  issues: ProModuleReleaseReadinessIssue[],
  summary: {
    alphaReadyCount: number;
    launchCount: number;
    yearOneCount: number;
    latestLaunchShipWeek: number;
    latestYearOneShipWeek: number;
    bundleVerificationRequested: boolean;
  },
  targets: ProModuleReleaseReadinessTargets,
): ProModuleReleaseReadinessCheck[] {
  return [
    releaseIssueCheck({
      id: 'catalog-health',
      label: 'Catalog integrity',
      issues,
      codes: [
        'catalog_invalid',
        'mount_shortfall',
        'payload_file_shortfall',
        'payload_class_missing',
        'engine_target_contract_missing',
        'ai_disclosure_contract_missing',
      ],
      passDetail: 'Catalog ids, mounted files, payload classes, engine contracts, AI disclosure, counts, and digests are release-safe.',
    }),
    releaseIssueCheck({
      id: 'year-one-module-count',
      label: 'Year-one module count',
      issues,
      codes: ['year_one_module_shortfall'],
      passDetail: `${summary.yearOneCount} paid module(s) cover the year-one target of ${targets.yearOneModuleCount}.`,
    }),
    releaseIssueCheck({
      id: 'month-12-module-count',
      label: 'Month-12 module count',
      issues,
      codes: ['launch_module_shortfall', 'month12_shortfall'],
      passDetail: `${summary.alphaReadyCount} alpha-ready module(s) cover the month-12 target of ${targets.minModulesByMonth12}.`,
    }),
    releaseIssueCheck({
      id: 'release-cadence',
      label: 'Release cadence',
      issues,
      codes: ['release_cadence_slip'],
      passDetail: `${summary.launchCount} launch module(s) land by week ${summary.latestLaunchShipWeek}; ${summary.yearOneCount} year-one module(s) land by week ${summary.latestYearOneShipWeek}.`,
    }),
    releaseIssueCheck({
      id: 'engine-companions',
      label: 'Engine export companions',
      issues,
      codes: ['engine_companion_missing'],
      passDetail: 'Unity, Unreal, and Godot paid export companions are alpha-ready.',
    }),
    releaseIssueCheck({
      id: 'public-listings',
      label: 'Public listing safety',
      issues,
      codes: ['public_listing_unsafe'],
      passDetail: 'Public module listings contain metadata only, with no proprietary payload bodies.',
    }),
    releaseIssueCheck({
      id: 'bundle-verification',
      label: 'Bundle verification',
      issues,
      codes: ['bundle_verification_not_run', 'bundle_verification_failed'],
      passDetail: summary.bundleVerificationRequested
        ? 'Launch bundles sign, encrypt, verify, and decrypt with the licensed secret fixture.'
        : 'Bundle verification was not requested.',
    }),
  ];
}

function releaseIssueCheck(input: {
  id: string;
  label: string;
  issues: ProModuleReleaseReadinessIssue[];
  codes: ProModuleReleaseReadinessIssue['code'][];
  passDetail: string;
}): ProModuleReleaseReadinessCheck {
  const matched = input.issues.filter((issue) => input.codes.includes(issue.code));
  const errors = matched.filter((issue) => issue.severity === 'error').length;
  const warnings = matched.filter((issue) => issue.severity === 'warning').length;
  if (errors > 0) {
    return {
      id: input.id,
      label: input.label,
      status: 'fail',
      detail: `${errors} release blocker(s) require action.`,
    };
  }
  if (warnings > 0) {
    return {
      id: input.id,
      label: input.label,
      status: 'warn',
      detail: `${warnings} release warning(s) require review.`,
    };
  }
  return {
    id: input.id,
    label: input.label,
    status: 'pass',
    detail: input.passDetail,
  };
}
