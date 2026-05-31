import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
export const GODOT_COMMUNITY_ADDON_ROOT = 'integrations/godot-community-addon';
export const GODOT_COMMUNITY_ADDON_VERSION = '0.1.0-alpha.1';
export const GODOT_COMMUNITY_REQUIRED_FILES = [
  'README.md',
  'LICENSE',
  'ASSET_LIBRARY_SUBMISSION.md',
  'addons/greybox_studio_community/plugin.cfg',
  'addons/greybox_studio_community/plugin.gd',
  'addons/greybox_studio_community/studio_dock.gd',
  'addons/greybox_studio_community/icon.svg',
  'addons/greybox_studio_community/importers/artifact_importers.gd',
  'addons/greybox_studio_community/runtime/greybox_artifact.gd',
];
const sourceFiles = GODOT_COMMUNITY_REQUIRED_FILES.filter((file) => /\.(gd|cfg|svg|md)$/u.test(file));
const forbiddenSourcePhrases = [
  'Pro module',
  'round-trip sync',
  '/api/sync',
  'Bearer',
  'Authorization',
  'license key',
  'managed inference',
  'Greybox Cloud',
  'telemetry endpoint',
  'MCP',
];

interface ValidationReport {
  status: 'pass' | 'fail';
  checkedFiles: number;
  errors: string[];
}

export function validateGodotCommunityAddon(repoRoot = root): ValidationReport {
  const errors: string[] = [];
  for (const file of GODOT_COMMUNITY_REQUIRED_FILES) {
    if (!existsSync(join(repoRoot, GODOT_COMMUNITY_ADDON_ROOT, file))) {
      errors.push(`missing ${GODOT_COMMUNITY_ADDON_ROOT}/${file}`);
    }
  }

  const allFiles = listFiles(join(repoRoot, GODOT_COMMUNITY_ADDON_ROOT))
    .map((file) => relative(join(repoRoot, GODOT_COMMUNITY_ADDON_ROOT), file).replaceAll('\\', '/'));
  for (const file of allFiles) {
    if (file.includes('node_modules/') || file.includes('.git/')) continue;
    if (!GODOT_COMMUNITY_REQUIRED_FILES.includes(file)) {
      errors.push(`unexpected package file: ${GODOT_COMMUNITY_ADDON_ROOT}/${file}`);
    }
  }

  const pluginConfig = readPackageText(repoRoot, 'addons/greybox_studio_community/plugin.cfg', errors);
  for (const phrase of [
    'name="Greybox Studio Community Importer"',
    'version="0.1.0-alpha.1"',
    'script="plugin.gd"',
  ]) {
    if (!pluginConfig.includes(phrase)) errors.push(`plugin.cfg missing ${phrase}`);
  }

  const readme = readPackageText(repoRoot, 'README.md', errors);
  const submission = readPackageText(repoRoot, 'ASSET_LIBRARY_SUBMISSION.md', errors);
  const license = readPackageText(repoRoot, 'LICENSE', errors);
  const combinedDocs = `${readme}\n${submission}`;
  for (const phrase of [
    'Apache-2.0',
    'Godot 4.2+',
    '.gameview.json',
    'DESIGN.md',
    'HUD HTML',
    'level board JSON',
    'No telemetry',
    'No cloud calls',
    'No model training on project data',
    'custom download provider',
    'Do not claim Godot approval',
  ]) {
    if (!combinedDocs.includes(phrase)) errors.push(`community docs missing: ${phrase}`);
  }
  if (!license.includes('Apache License') || !license.includes('Version 2.0')) {
    errors.push('community package LICENSE must include Apache-2.0 text');
  }

  for (const file of sourceFiles) {
    const text = readPackageText(repoRoot, file, errors);
    if (!text.includes('SPDX-License-Identifier: Apache-2.0')) {
      errors.push(`${GODOT_COMMUNITY_ADDON_ROOT}/${file} missing Apache-2.0 SPDX header`);
    }
    if (/Proprietary and confidential/u.test(text) || /LICENSE\.proprietary/u.test(text)) {
      errors.push(`${GODOT_COMMUNITY_ADDON_ROOT}/${file} must not contain proprietary license language`);
    }
  }

  const gdText = sourceFiles
    .filter((file) => file.endsWith('.gd'))
    .map((file) => readPackageText(repoRoot, file, errors))
    .join('\n');
  for (const phrase of [
    '@tool',
    'GreyboxCommunityArtifactImporter',
    'GreyboxCommunityArtifact',
    'import_gameview_json',
    'import_design_markdown',
    'import_hud_html',
    'import_level_board_json',
    'range(nodes.size())',
    'range(rows.size())',
    'EditorInterface.get_edited_scene_root',
    'human_designer',
    'Greybox +',
  ]) {
    if (!gdText.includes(phrase)) errors.push(`community GDScript missing: ${phrase}`);
  }
  for (const phrase of forbiddenSourcePhrases) {
    if (gdText.includes(phrase)) {
      errors.push(`community GDScript contains forbidden paid/proprietary surface: ${phrase}`);
    }
  }
  if (/\bAI-generated\b/u.test(`${combinedDocs}\n${gdText}`)) {
    errors.push('community addon must say AI-assisted, not AI-generated');
  }

  return {
    status: errors.length === 0 ? 'pass' : 'fail',
    checkedFiles: GODOT_COMMUNITY_REQUIRED_FILES.length,
    errors,
  };
}

function readPackageText(repoRoot: string, file: string, errors: string[]): string {
  try {
    return readFileSync(join(repoRoot, GODOT_COMMUNITY_ADDON_ROOT, file), 'utf8');
  } catch (error) {
    errors.push(`could not read ${GODOT_COMMUNITY_ADDON_ROOT}/${file}: ${error instanceof Error ? error.message : String(error)}`);
    return '';
  }
}

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
  });
}

const invokedPath = process.argv[1] ?? '';
if (invokedPath.endsWith('validate-godot-community-addon.ts')) {
  const result = validateGodotCommunityAddon();
  console.log(`${result.status === 'pass' ? 'PASS' : 'FAIL'} Godot community addon validation (${result.checkedFiles} files)`);
  if (result.errors.length > 0) console.error(result.errors.join('\n'));
  if (result.status !== 'pass') process.exitCode = 1;
}
