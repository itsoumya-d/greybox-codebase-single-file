import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  GODOT_COMMUNITY_ADDON_ROOT,
  GODOT_COMMUNITY_ADDON_VERSION,
  GODOT_COMMUNITY_REQUIRED_FILES,
  validateGodotCommunityAddon,
} from './validate-godot-community-addon.ts';

const root = process.cwd();
const packageSlug = 'greybox-studio-community-importer';
const packageName = `${packageSlug}-${GODOT_COMMUNITY_ADDON_VERSION}`;
const defaultOutputRoot = '.tmp/godot-community-addon';

interface PackageFile {
  path: string;
  bytes: number;
  sha256: string;
}

interface PackReport {
  packageName: string;
  version: string;
  outputRoot: string;
  stageDir: string;
  zipPath: string;
  zipBytes: number;
  zipSha256: string;
  files: PackageFile[];
}

export function packGodotCommunityAddon(repoRoot = root, outputRoot = defaultOutputRoot): PackReport {
  const validation = validateGodotCommunityAddon(repoRoot);
  if (validation.status !== 'pass') {
    throw new Error(`Godot community addon validation failed:\n${validation.errors.join('\n')}`);
  }

  const absoluteOutputRoot = join(repoRoot, outputRoot);
  const stageDir = join(absoluteOutputRoot, packageName);
  const zipPath = join(absoluteOutputRoot, `${packageName}.zip`);
  rmSync(stageDir, { force: true, recursive: true });
  rmSync(zipPath, { force: true });
  mkdirSync(stageDir, { recursive: true });

  const files: PackageFile[] = [];
  for (const file of GODOT_COMMUNITY_REQUIRED_FILES) {
    const source = join(repoRoot, GODOT_COMMUNITY_ADDON_ROOT, file);
    const destination = join(stageDir, file);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(source, destination);
    const bytes = readFileSync(destination);
    files.push({
      path: file,
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
    });
  }

  const manifest = {
    packageName,
    version: GODOT_COMMUNITY_ADDON_VERSION,
    license: 'Apache-2.0',
    generatedAt: new Date(0).toISOString(),
    source: GODOT_COMMUNITY_ADDON_ROOT,
    godotVersion: '4.2+',
    noTelemetry: true,
    noCloudCalls: true,
    noPaidBridge: true,
    files,
  };
  const manifestPath = join(stageDir, 'PACKAGE_MANIFEST.json');
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const manifestBytes = readFileSync(manifestPath);
  files.push({
    path: 'PACKAGE_MANIFEST.json',
    bytes: manifestBytes.byteLength,
    sha256: sha256(manifestBytes),
  });

  const zip = spawnSync('zip', ['-X', '-r', `${packageName}.zip`, packageName], {
    cwd: absoluteOutputRoot,
    encoding: 'utf8',
  });
  if (zip.error) throw zip.error;
  if (zip.status !== 0 || !existsSync(zipPath)) {
    throw new Error(`zip failed with status ${zip.status ?? 'unknown'}:\n${zip.stderr || zip.stdout}`);
  }
  const zipBytes = readFileSync(zipPath);
  const report: PackReport = {
    packageName,
    version: GODOT_COMMUNITY_ADDON_VERSION,
    outputRoot,
    stageDir: join(outputRoot, packageName),
    zipPath: join(outputRoot, `${packageName}.zip`),
    zipBytes: zipBytes.byteLength,
    zipSha256: sha256(zipBytes),
    files,
  };
  writeFileSync(join(absoluteOutputRoot, `${packageName}.report.json`), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return report;
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function printReport(report: PackReport): void {
  console.log(`Packed ${report.packageName}`);
  console.log(`ZIP: ${report.zipPath}`);
  console.log(`SHA-256: ${report.zipSha256}`);
  console.log(`Files: ${report.files.length}`);
}

const invokedPath = process.argv[1] ?? '';
if (invokedPath.endsWith('pack-godot-community-addon.ts')) {
  try {
    printReport(packGodotCommunityAddon());
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
