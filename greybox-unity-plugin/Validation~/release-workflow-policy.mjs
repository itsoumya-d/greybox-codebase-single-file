#!/usr/bin/env node
// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const RELEASE_TAG_PATTERN = /^v(?<version>\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/u;

export function parseReleaseTag(ref) {
  const clean = String(ref ?? '').trim();
  const match = clean.match(RELEASE_TAG_PATTERN);
  if (!match?.groups?.version) {
    throw new Error(`Release tag must be vMAJOR.MINOR.PATCH, got ${clean || '<empty>'}`);
  }
  const version = match.groups.version;
  return {
    ref: clean,
    version,
    prerelease: version.includes('-'),
  };
}

export function packageVersion(packageJsonText) {
  const manifest = JSON.parse(packageJsonText);
  const version = typeof manifest.version === 'string' ? manifest.version.trim() : '';
  if (!version) throw new Error('package.json must include a version string');
  return version;
}

export function verifyPackageVersionMatchesTag(packageJsonText, ref) {
  const release = parseReleaseTag(ref);
  const actualVersion = packageVersion(packageJsonText);
  if (actualVersion !== release.version) {
    throw new Error(`Tag ${release.ref} does not match package.json version ${actualVersion}`);
  }
  return release;
}

export function extractChangelogSection(changelogText, version) {
  const lines = String(changelogText ?? '').split(/\r?\n/u);
  const collected = [];
  let capture = false;
  for (const line of lines) {
    const headingVersion = changelogHeadingVersion(line);
    if (headingVersion) {
      if (capture) break;
      capture = headingVersion === version;
      continue;
    }
    if (capture) collected.push(line);
  }
  const body = collected.join('\n').trim();
  if (!body) throw new Error(`CHANGELOG.md must include non-empty release notes for ${version}`);
  return body;
}

export function formatReleaseNotes({ ref, version, changelogText }) {
  const body = extractChangelogSection(changelogText, version);
  return `${body}

## Artifacts

- \`com.greybox.studio-${ref}.tgz\` UPM tarball
- \`com.greybox.studio.manifest.json\` deterministic package manifest
- \`com.greybox.studio.unitypackage\` Unity Asset Store package (stable releases only)
- \`unitypackage-export.json\` Unity export manifest (stable releases only)
- \`package-summary.md\` release evidence summary
- \`release-readiness.json\` static release readiness evidence
- \`stable-release-candidate.json\` final release candidate gate evidence
- \`SHA256SUMS-${ref}.txt\` integrity checksums

True Asset Store .unitypackage export is intentionally not faked by CI; stable releases attach it only after editor smoke, Unity export, and stable-candidate gates pass.
`;
}

export function validateReleaseWorkflowPolicy(workflowText) {
  const text = String(workflowText ?? '');
  const errors = [];
  const steps = {
    policy: findWorkflowStep(text, 'Validate release workflow policy'),
    readiness: findWorkflowStep(text, 'Write release readiness evidence'),
    submission: findWorkflowStep(text, 'Verify final submission evidence'),
    stableCandidate: findWorkflowStep(text, 'Write stable release candidate evidence'),
    checksums: findWorkflowStep(text, 'Generate SHA-256 checksums'),
    stableRelease: findWorkflowStep(text, 'Create stable GitHub Release'),
  };

  requireStep(errors, steps.policy, 'Validate release workflow policy');
  requireStepSnippet(errors, steps.policy, 'release-workflow-policy.mjs workflow', 'release workflow must run its own static policy gate');
  requireStepSnippet(errors, steps.policy, '--workflow .github/workflows/release.yml', 'release workflow policy gate must inspect the checked-in release workflow');

  requireStep(errors, steps.readiness, 'Write release readiness evidence');
  requireStepSnippet(errors, steps.readiness, 'Validation~/release-readiness.mjs', 'release workflow must write release readiness evidence');
  requireStepSnippet(errors, steps.readiness, '--dry-run-only', 'prerelease readiness must stay dry-run only');
  requireStepSnippet(errors, steps.readiness, '--submission', 'stable release readiness must run in final submission mode');
  requireStepSnippet(errors, steps.readiness, '--require-unity', 'stable release readiness must require Unity editor smoke/export evidence');
  requireStepSnippet(errors, steps.readiness, '--output Validation~/artifacts/release-readiness.json', 'release readiness evidence path must be deterministic');

  requireStep(errors, steps.submission, 'Verify final submission evidence');
  requireStableOnlyStep(errors, steps.submission, 'final submission evidence');
  requireStepSnippet(errors, steps.submission, 'Validation~/asset-store-submission-check.mjs --submission', 'stable releases must re-check final submission evidence after readiness');

  requireStep(errors, steps.stableCandidate, 'Write stable release candidate evidence');
  requireStepSnippet(errors, steps.stableCandidate, 'Validation~/stable-release-candidate.mjs', 'release workflow must write stable release candidate evidence');
  requireStepSnippet(errors, steps.stableCandidate, '--require-ready', 'stable release candidate must require ready evidence for stable tags');
  requireStepSnippet(errors, steps.stableCandidate, '--output Validation~/artifacts/stable-release-candidate.json', 'stable release candidate path must be deterministic');

  requireStep(errors, steps.checksums, 'Generate SHA-256 checksums');
  requireStepSnippet(errors, steps.checksums, 'com.greybox.studio.unitypackage', 'stable checksums must include the Asset Store .unitypackage');
  requireStepSnippet(errors, steps.checksums, '../Validation~/artifacts/unitypackage-export.json', 'stable checksums must include the Unity export manifest');
  requireStepSnippet(errors, steps.checksums, 'if [ "$IS_PRERELEASE" != "true" ]; then', 'stable-only checksum branch must guard Unity export artifacts');

  requireStep(errors, steps.stableRelease, 'Create stable GitHub Release');
  requireStableOnlyStep(errors, steps.stableRelease, 'stable GitHub release');
  requireStepSnippet(errors, steps.stableRelease, 'dist/com.greybox.studio.unitypackage', 'stable release must upload the Asset Store .unitypackage');
  requireStepSnippet(errors, steps.stableRelease, 'Validation~/artifacts/unitypackage-export.json', 'stable release must upload the Unity export manifest');
  requireStepSnippet(errors, steps.stableRelease, 'Validation~/artifacts/stable-release-candidate.json', 'stable release must upload the stable candidate gate artifact');

  requireStepOrder(errors, steps.readiness, steps.submission, 'release readiness must run before final submission evidence verification');
  requireStepOrder(errors, steps.submission, steps.stableCandidate, 'final submission evidence verification must run before stable release candidate evidence');
  requireStepOrder(errors, steps.stableCandidate, steps.checksums, 'stable release candidate evidence must be written before checksums');
  requireStepOrder(errors, steps.checksums, steps.stableRelease, 'checksums must be generated before the stable GitHub release upload');

  return {
    status: errors.length === 0 ? 'pass' : 'fail',
    errors,
  };
}

function changelogHeadingVersion(line) {
  const match = String(line ?? '').match(/^##\s+(?:\[(?<bracket>[^\]]+)\]|(?<plain>[^\s]+))/u);
  return match?.groups?.bracket ?? match?.groups?.plain ?? '';
}

function findWorkflowStep(workflowText, name) {
  const pattern = new RegExp(`^\\s*- name:\\s*${escapeRegExp(name)}\\s*$`, 'mu');
  const match = pattern.exec(workflowText);
  if (!match) {
    return {
      index: -1,
      name,
      text: '',
    };
  }
  const nextStepPattern = /^\s*- name:\s+/mu;
  const rest = workflowText.slice(match.index + match[0].length);
  const next = nextStepPattern.exec(rest);
  const end = next ? match.index + match[0].length + next.index : workflowText.length;
  return {
    index: match.index,
    name,
    text: workflowText.slice(match.index, end),
  };
}

function requireStep(errors, step, name) {
  if (!step || step.index < 0) errors.push(`release workflow must include step: ${name}`);
}

function requireStepSnippet(errors, step, snippet, message) {
  if (!step || step.index < 0) return;
  if (!step.text.includes(snippet)) errors.push(message);
}

function requireStableOnlyStep(errors, step, label) {
  requireStepSnippet(
    errors,
    step,
    "if: steps.version.outputs.prerelease != 'true'",
    `${label} step must be stable-only`,
  );
}

function requireStepOrder(errors, earlier, later, message) {
  if (!earlier || !later || earlier.index < 0 || later.index < 0) return;
  if (earlier.index >= later.index) errors.push(message);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {
    changelog: 'CHANGELOG.md',
    githubOutput: '',
    output: '',
    packageJson: 'package.json',
    tag: '',
    workflow: '.github/workflows/release.yml',
  };
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--changelog') options.changelog = rest[++index] ?? options.changelog;
    else if (arg === '--github-output') options.githubOutput = rest[++index] ?? '';
    else if (arg === '--output') options.output = rest[++index] ?? '';
    else if (arg === '--package') options.packageJson = rest[++index] ?? options.packageJson;
    else if (arg === '--tag') options.tag = rest[++index] ?? '';
    else if (arg === '--workflow') options.workflow = rest[++index] ?? options.workflow;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return { command, options };
}

function writeOutput(text, path) {
  if (path) writeFileSync(path, text);
  else process.stdout.write(text);
}

function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (command === 'version') {
    const release = verifyPackageVersionMatchesTag(readFileSync(options.packageJson, 'utf8'), options.tag);
    const output = [
      `version=${release.version}`,
      `ref=${release.ref}`,
      `prerelease=${release.prerelease ? 'true' : 'false'}`,
      '',
    ].join('\n');
    if (options.githubOutput) appendFileSync(options.githubOutput, output);
    else process.stdout.write(output);
    return;
  }

  if (command === 'notes') {
    const release = parseReleaseTag(options.tag);
    const notes = formatReleaseNotes({
      ref: release.ref,
      version: release.version,
      changelogText: readFileSync(options.changelog, 'utf8'),
    });
    writeOutput(notes, options.output);
    return;
  }

  if (command === 'workflow') {
    const report = validateReleaseWorkflowPolicy(readFileSync(options.workflow, 'utf8'));
    if (report.status !== 'pass') {
      process.stderr.write(`Release workflow policy failed:\n${report.errors.map((error) => `- ${error}`).join('\n')}\n`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write('PASS release workflow policy\n');
    return;
  }

  throw new Error('Usage: release-workflow-policy.mjs <version|notes|workflow> --tag <vX.Y.Z> [--package package.json] [--github-output $GITHUB_OUTPUT] [--changelog CHANGELOG.md] [--output release-notes.md] [--workflow .github/workflows/release.yml]');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
