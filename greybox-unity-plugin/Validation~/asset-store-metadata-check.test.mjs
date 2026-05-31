// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { isSemverAtLeast, isValidSemver, validatePackage } from './asset-store-metadata-check.mjs';

test('semver accepts stable and prerelease package versions', () => {
  assert.equal(isValidSemver('1.0.0'), true);
  assert.equal(isValidSemver('0.1.0-alpha.1'), true);
  assert.equal(isValidSemver('1.0'), false);
  assert.equal(isSemverAtLeast('1.0.0', '1.0.0'), true);
  assert.equal(isSemverAtLeast('1.2.0', '1.0.0'), true);
  assert.equal(isSemverAtLeast('0.9.9', '1.0.0'), false);
  assert.equal(isSemverAtLeast('not-semver', '1.0.0'), false);
});

test('validator catches missing disclosure and malformed manifest metadata', () => {
  const root = mkdtempSync(join(tmpdir(), 'greybox-unity-metadata-'));
  mkdirSync(join(root, 'Samples~/2D Platformer'), { recursive: true });
  mkdirSync(join(root, 'Samples~/Top-Down Roguelike'), { recursive: true });
  mkdirSync(join(root, 'Samples~/Mobile Idle'), { recursive: true });
  mkdirSync(join(root, 'Documentation~'), { recursive: true });
  mkdirSync(join(root, 'Editor/Sync'), { recursive: true });
  mkdirSync(join(root, 'Editor/Windows'), { recursive: true });
  mkdirSync(join(root, 'Runtime'), { recursive: true });

  writeFileSync(join(root, 'package.json'), JSON.stringify({
    name: 'com.bad.name',
    displayName: 'Greybox Studio',
    version: '1.0',
    unity: '2022.3',
    description: 'AI-assisted game design import.',
    author: { name: 'Greybox Studio', url: 'https://greybox.studio' },
    license: 'See LICENSE.md file',
    documentationUrl: 'https://greybox.studio/docs/unity',
    changelogUrl: 'https://greybox.studio/docs/unity/changelog',
    licensesUrl: 'https://greybox.studio/docs/unity/license',
    keywords: ['game design', 'level blockout', 'round-trip', 'Unity Editor', 'MCP'],
    dependencies: {
      'com.unity.editorcoroutines': '1.0.0',
      'com.unity.nuget.newtonsoft-json': '3.2.1',
      'com.unity.inputsystem': '1.7.0',
      'com.unity.addressables': '1.21.21',
      'com.unity.ugui': '1.0.0',
      'com.unity.ui': '1.0.0',
    },
    samples: [
      { displayName: '2D Platformer', description: 'Sample.', path: 'Samples~/2D Platformer' },
      { displayName: 'Top-Down Roguelike', description: 'Sample.', path: 'Samples~/Top-Down Roguelike' },
      { displayName: 'Mobile Idle', description: 'Sample.', path: 'Samples~/Mobile Idle' },
    ],
  }));
  for (const file of [
    'README.md',
    'LICENSE.md',
    'LICENSE.proprietary',
    'Third-Party Notices.txt',
    'CHANGELOG.md',
    'Documentation~/round-trip-sync.md',
    'Samples~/2D Platformer/README.md',
    'Samples~/Top-Down Roguelike/README.md',
    'Samples~/Mobile Idle/README.md',
  ]) {
    writeFileSync(join(root, file), 'placeholder');
  }
  writeFileSync(join(root, 'STORE_LISTING.md'), '# Greybox Studio\n\nAI-assisted design layer.');
  writeFileSync(join(root, 'Runtime/GreyboxArtifact.cs'), 'namespace Greybox.Runtime { public class GreyboxArtifact {} }');
  writeFileSync(join(root, 'Runtime/GreyboxConfig.cs'), 'namespace Greybox.Runtime { public class GreyboxConfig { public string LicenseKey = ""; } }');
  writeFileSync(join(root, 'Editor/Windows/GreyboxSettings.cs'), 'namespace Greybox.Editor.Windows { public static class GreyboxSettings {} }');
  writeFileSync(join(root, 'Editor/Windows/GreyboxLicenseWindow.cs'), 'namespace Greybox.Editor.Windows { public class GreyboxLicenseWindow { void Save(dynamic config) { config.LicenseKey = "secret"; } } }');
  writeFileSync(join(root, 'Editor/Sync/GreyboxCloudClient.cs'), 'namespace Greybox.Editor.Sync { public class GreyboxCloudClient { string Read(dynamic config) => config.LicenseKey; } }');

  const result = validatePackage(root);
  assert.ok(result.errors.some((error) => error.includes('package name')));
  assert.ok(result.errors.some((error) => error.includes('version')));
  assert.ok(result.errors.some((error) => error.includes('external services')));
  assert.ok(result.errors.some((error) => error.includes('must include at least one .gameview artifact')));
  assert.ok(result.errors.some((error) => error.includes('must describe importer coverage')));
  assert.ok(result.errors.some((error) => error.includes('missing MCP bridge definitions')));
  assert.ok(result.errors.some((error) => error.includes('Runtime/GreyboxConfig.cs must not store license keys')));
  assert.ok(result.errors.some((error) => error.includes('GreyboxSettings must store the license key in EditorPrefs')));
  assert.ok(result.errors.some((error) => error.includes('GreyboxLicenseWindow must not write license keys')));
  assert.ok(result.errors.some((error) => error.includes('GreyboxCloudClient must not read license keys')));
});

test('validator catches unqualified AI-generated copy and missing human provenance', () => {
  const root = mkdtempSync(join(tmpdir(), 'greybox-unity-provenance-'));
  mkdirSync(join(root, 'Samples~/2D Platformer'), { recursive: true });
  mkdirSync(join(root, 'Samples~/Top-Down Roguelike'), { recursive: true });
  mkdirSync(join(root, 'Samples~/Mobile Idle'), { recursive: true });
  mkdirSync(join(root, 'Documentation~'), { recursive: true });

  writeFileSync(join(root, 'package.json'), JSON.stringify({
    name: 'com.greybox.studio',
    displayName: 'Greybox Studio',
    version: '1.0.0',
    unity: '2022.3',
    description: 'AI-generated game design import.',
    author: { name: 'Greybox Studio', url: 'https://greybox.studio' },
    license: 'See LICENSE.md file',
    documentationUrl: 'https://greybox.studio/docs/unity',
    changelogUrl: 'https://greybox.studio/docs/unity/changelog',
    licensesUrl: 'https://greybox.studio/docs/unity/license',
    keywords: ['game design', 'level blockout', 'round-trip', 'Unity Editor', 'MCP'],
    dependencies: {
      'com.unity.editorcoroutines': '1.0.0',
      'com.unity.nuget.newtonsoft-json': '3.2.1',
      'com.unity.inputsystem': '1.7.0',
      'com.unity.addressables': '1.21.21',
      'com.unity.ugui': '1.0.0',
      'com.unity.ui': '1.0.0',
    },
    samples: [
      { displayName: '2D Platformer', description: 'Sample.', path: 'Samples~/2D Platformer' },
      { displayName: 'Top-Down Roguelike', description: 'Sample.', path: 'Samples~/Top-Down Roguelike' },
      { displayName: 'Mobile Idle', description: 'Sample.', path: 'Samples~/Mobile Idle' },
    ],
  }));
  for (const file of ['LICENSE.md', 'LICENSE.proprietary', 'Third-Party Notices.txt', 'CHANGELOG.md']) {
    writeFileSync(join(root, file), 'placeholder');
  }
  writeFileSync(join(root, 'README.md'), '# Greybox Studio\n\nAI-generated Unity package.');
  writeFileSync(join(root, 'Documentation~/round-trip-sync.md'), 'Round-trip sync uses AI-assisted design review.');
  writeFileSync(join(root, 'STORE_LISTING.md'), [
    '# Greybox Studio',
    '',
    'External services, API keys, and additional costs are disclosed here.',
    'AI-assisted design layer. Free Personal, Indie, Pro, Studio site license.',
    'See Third-Party Notices.txt.',
  ].join('\n'));
  writeFileSync(
    join(root, 'Samples~/2D Platformer/README.md'),
    'AI-assisted importer coverage and round-trip intent. This deliberately long sample README explains gameview, design, HUD, and level-board imports for validation, but omits the required human designer credit.',
  );
  writeFileSync(join(root, 'Samples~/Top-Down Roguelike/README.md'), 'AI-assisted sample. Human designer credit: Mira Designer. This README describes importer coverage and round-trip intent for room, encounter, HUD, and palette import coverage.');
  writeFileSync(join(root, 'Samples~/Mobile Idle/README.md'), 'AI-assisted sample. Human designer credit: Noor Designer. This README describes importer coverage and round-trip intent for mobile economy board, HUD, and palette imports.');
  writeFileSync(join(root, 'Samples~/2D Platformer/platformer.gameview'), JSON.stringify({
    title: 'No Provenance Viewport',
    actors: [{ id: 'player', name: 'Player', position: { x: 0, y: 0, z: 0 } }],
    spawnPoints: [{ id: 'spawn', name: 'Spawn', position: { x: 0, y: 0, z: 0 } }],
    objectives: [{ id: 'goal', name: 'Goal', position: { x: 1, y: 0, z: 0 } }],
    hazards: [{ id: 'pit', name: 'Pit', position: { x: 2, y: 0, z: 0 } }],
  }));
  writeFileSync(join(root, 'Samples~/2D Platformer/platformer.levelboard'), JSON.stringify({
    title: 'No Provenance Board',
    rooms: [{ id: 'room', name: 'Room', position: { x: 0, y: 0, z: 0 } }],
    encounters: [{ id: 'encounter', name: 'Encounter', position: { x: 1, y: 0, z: 0 } }],
  }));

  const result = validatePackage(root);
  assert.ok(result.errors.some((error) => error.includes('package.json must not use unqualified AI-generated language')));
  assert.ok(result.errors.some((error) => error.includes('README.md must not use unqualified AI-generated language')));
  assert.ok(result.errors.some((error) => error.includes('Samples~/2D Platformer/README.md must credit the human designer')));
  assert.ok(result.errors.some((error) => error.includes('Samples~/2D Platformer/platformer.gameview must use AI-assisted provenance language')));
  assert.ok(result.errors.some((error) => error.includes('Samples~/2D Platformer/platformer.levelboard must credit the human designer')));
});

test('validator catches drifted Asset Store tier pricing copy', () => {
  const root = mkdtempSync(join(tmpdir(), 'greybox-unity-tier-copy-'));
  writeFileSync(join(root, 'STORE_LISTING.md'), [
    '# Greybox Studio',
    '',
    'External services, API keys, and additional costs are disclosed here.',
    'AI-assisted design layer.',
    'Third-Party Notices.txt',
    '',
    '## Tiers',
    '',
    '- Free Personal: 3 projects max, watermarked artifacts, no round-trip sync.',
    '- Indie: $129 one-time. Unlimited projects, no watermark, one-way import only.',
    '- Pro: $399 one-time + $9/mo. Round-trip sync, MCP bridge, priority queue.',
    '- Studio site license: $2,999 one-time + $499/yr. Up to 25 seats, SSO, custom skill packs.',
  ].join('\n'));

  const result = validatePackage(root);
  assert.ok(result.errors.includes(
    'STORE_LISTING.md missing exact pricing tier line: - Indie: $149 one-time. Unlimited projects, no watermark, one-way import only.',
  ));
});

test('validator catches Greybox-derived generic package keywords', () => {
  const root = mkdtempSync(join(tmpdir(), 'greybox-unity-keywords-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    name: 'com.greybox.studio',
    displayName: 'Greybox Studio',
    version: '1.0.0',
    unity: '2022.3',
    description: 'AI-assisted game design import.',
    author: { name: 'Greybox Studio', url: 'https://greybox.studio' },
    license: 'See LICENSE.md file',
    documentationUrl: 'https://greybox.studio/docs/unity',
    changelogUrl: 'https://greybox.studio/docs/unity/changelog',
    licensesUrl: 'https://greybox.studio/docs/unity/license',
    keywords: ['game design', 'greyboxing', 'round-trip', 'Unity Editor', 'MCP'],
    dependencies: {},
    samples: [],
  }));

  const result = validatePackage(root);

  assert.ok(result.errors.includes('package keywords must use blockout language instead of Greybox-derived generic verbs'));
});

test('validator recognizes the real MCP bridge tool surface', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const result = validatePackage(root);
  assert.deepEqual(result.errors.filter((error) => error.includes('MCP')), []);
});

test('validator catches MCP serverInfo version drift from package manifest', () => {
  const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const root = mkdtempSync(join(tmpdir(), 'greybox-unity-mcp-version-'));
  mkdirSync(join(root, 'Editor/McpBridge'), { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    name: 'com.greybox.studio',
    displayName: 'Greybox Studio',
    version: '0.1.0-alpha.1',
    unity: '2022.3',
  }));
  writeFileSync(
    join(root, 'Editor/McpBridge/McpToolDefinitions.cs'),
    readFileSync(join(sourceRoot, 'Editor/McpBridge/McpToolDefinitions.cs'), 'utf8'),
  );
  writeFileSync(
    join(root, 'Editor/McpBridge/GreyboxMcpServer.cs'),
    readFileSync(join(sourceRoot, 'Editor/McpBridge/GreyboxMcpServer.cs'), 'utf8')
      .replace('private const string McpServerVersion = "0.1.0-alpha.1";', 'private const string McpServerVersion = "0.1.0";'),
  );

  const result = validatePackage(root);
  assert.ok(result.errors.includes('MCP initialize serverInfo.version must match package.json version'));
});

test('validator catches missing MCP tool safety annotations', () => {
  const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const root = mkdtempSync(join(tmpdir(), 'greybox-unity-mcp-annotations-'));
  mkdirSync(join(root, 'Editor/McpBridge'), { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    name: 'com.greybox.studio',
    displayName: 'Greybox Studio',
    version: '0.1.0-alpha.1',
    unity: '2022.3',
  }));
  writeFileSync(
    join(root, 'Editor/McpBridge/McpToolDefinitions.cs'),
    readFileSync(join(sourceRoot, 'Editor/McpBridge/McpToolDefinitions.cs'), 'utf8')
      .replace(/, ""annotations"": \{ ""title"": ""Get Scene Hierarchy""[\s\S]*?""openWorldHint"": false \}/u, ''),
  );
  writeFileSync(
    join(root, 'Editor/McpBridge/GreyboxMcpServer.cs'),
    readFileSync(join(sourceRoot, 'Editor/McpBridge/GreyboxMcpServer.cs'), 'utf8'),
  );

  const result = validatePackage(root);
  assert.ok(result.errors.includes('MCP tool must advertise safety annotations: unity.getSceneHierarchy'));
  assert.ok(result.errors.includes('MCP tool annotations must distinguish read-only hierarchy inspection from mutating Unity actions'));
});

test('validator catches asmdef references without matching package dependencies', () => {
  const root = mkdtempSync(join(tmpdir(), 'greybox-unity-asmdef-deps-'));
  mkdirSync(join(root, 'Editor'), { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    name: 'com.greybox.studio',
    displayName: 'Greybox Studio',
    version: '1.0.0',
    unity: '2022.3',
    description: 'AI-assisted game design import.',
    author: { name: 'Greybox Studio', url: 'https://greybox.studio' },
    license: 'See LICENSE.md file',
    documentationUrl: 'https://greybox.studio/docs/unity',
    changelogUrl: 'https://greybox.studio/docs/unity/changelog',
    licensesUrl: 'https://greybox.studio/docs/unity/license',
    keywords: ['game design', 'level blockout', 'round-trip', 'Unity Editor', 'MCP'],
    dependencies: {
      'com.unity.editorcoroutines': '1.0.0',
      'com.unity.nuget.newtonsoft-json': '3.2.1',
      'com.unity.inputsystem': '1.7.0',
      'com.unity.addressables': '1.21.21',
      'com.unity.ugui': '1.0.0',
      'com.unity.ui': '1.0.0',
    },
  }));
  writeFileSync(join(root, 'Editor/Greybox.Editor.asmdef'), JSON.stringify({
    name: 'Greybox.Editor',
    references: ['Unity.TextMeshPro'],
  }));

  const result = validatePackage(root);
  assert.ok(result.errors.some((error) => error.includes('Editor/Greybox.Editor.asmdef references Unity.TextMeshPro but package.json must declare com.unity.textmeshpro')));
});

test('validator requires Unity Test Runner asmdefs for packaged tests', () => {
  const root = mkdtempSync(join(tmpdir(), 'greybox-unity-test-asmdefs-'));
  mkdirSync(join(root, 'Tests/EditMode'), { recursive: true });
  mkdirSync(join(root, 'Tests/PlayMode'), { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    name: 'com.greybox.studio',
    displayName: 'Greybox Studio',
    version: '1.0.0',
    unity: '2022.3',
    description: 'AI-assisted game design import.',
    author: { name: 'Greybox Studio', url: 'https://greybox.studio' },
    license: 'See LICENSE.md file',
    documentationUrl: 'https://greybox.studio/docs/unity',
    changelogUrl: 'https://greybox.studio/docs/unity/changelog',
    licensesUrl: 'https://greybox.studio/docs/unity/license',
    keywords: ['game design', 'level blockout', 'round-trip', 'Unity Editor', 'MCP'],
    dependencies: {
      'com.unity.editorcoroutines': '1.0.0',
      'com.unity.nuget.newtonsoft-json': '3.2.1',
      'com.unity.inputsystem': '1.7.0',
      'com.unity.addressables': '1.21.21',
      'com.unity.ugui': '1.0.0',
      'com.unity.ui': '1.0.0',
    },
  }));
  writeFileSync(join(root, 'Tests/EditMode/FooTests.cs'), 'namespace Greybox.Tests.EditMode { public class FooTests {} }');
  writeFileSync(join(root, 'Tests/PlayMode/FooPlayTests.cs'), 'namespace Greybox.Tests.PlayMode { public class FooPlayTests {} }');

  const missing = validatePackage(root);
  assert.ok(missing.errors.includes('Tests/EditMode tests must include a Unity Test Runner asmdef: Tests/EditMode/Greybox.Editor.Tests.asmdef'));
  assert.ok(missing.errors.includes('Tests/PlayMode tests must include a Unity Test Runner asmdef: Tests/PlayMode/Greybox.Runtime.Tests.asmdef'));

  writeFileSync(join(root, 'Tests/EditMode/Greybox.Editor.Tests.asmdef'), JSON.stringify({
    name: 'Greybox.Bad.Tests',
    rootNamespace: 'Greybox.Tests',
    references: ['Greybox.Runtime'],
    includePlatforms: [],
    optionalUnityReferences: [],
    noEngineReferences: true,
  }));
  writeFileSync(join(root, 'Tests/PlayMode/Greybox.Runtime.Tests.asmdef'), JSON.stringify({
    name: 'Greybox.Runtime.Tests',
    rootNamespace: 'Greybox.Tests.PlayMode',
    references: ['Greybox.Runtime'],
    includePlatforms: ['Editor'],
    optionalUnityReferences: [],
  }));

  const malformed = validatePackage(root);
  assert.ok(malformed.errors.includes('Tests/EditMode/Greybox.Editor.Tests.asmdef name must be Greybox.Editor.Tests'));
  assert.ok(malformed.errors.includes('Tests/EditMode/Greybox.Editor.Tests.asmdef rootNamespace must be Greybox.Tests.EditMode'));
  assert.ok(malformed.errors.includes('Tests/EditMode/Greybox.Editor.Tests.asmdef must reference Greybox.Editor'));
  assert.ok(malformed.errors.includes('Tests/EditMode/Greybox.Editor.Tests.asmdef must reference Unity.Newtonsoft.Json'));
  assert.ok(malformed.errors.includes('Tests/EditMode/Greybox.Editor.Tests.asmdef must opt into Unity Test Runner via optionalUnityReferences TestAssemblies'));
  assert.ok(malformed.errors.includes('Tests/EditMode/Greybox.Editor.Tests.asmdef must be Editor-only for EditMode tests'));
  assert.ok(malformed.errors.includes('Tests/EditMode/Greybox.Editor.Tests.asmdef must keep Unity engine references enabled'));
  assert.ok(malformed.errors.includes('Tests/PlayMode/Greybox.Runtime.Tests.asmdef must reference Unity.InputSystem'));
  assert.ok(malformed.errors.includes('Tests/PlayMode/Greybox.Runtime.Tests.asmdef must opt into Unity Test Runner via optionalUnityReferences TestAssemblies'));
  assert.ok(malformed.errors.includes('Tests/PlayMode/Greybox.Runtime.Tests.asmdef must not be Editor-only; PlayMode tests need player-compatible compilation'));
});

test('validator requires the smoke project to run packaged Unity tests', () => {
  const root = mkdtempSync(join(tmpdir(), 'greybox-unity-smoke-testables-'));
  mkdirSync(join(root, 'Tests/EditMode'), { recursive: true });
  mkdirSync(join(root, 'Validation~'), { recursive: true });
  writeFileSync(join(root, 'Tests/EditMode/FooTests.cs'), 'namespace Greybox.Tests.EditMode { public class FooTests {} }');
  writeFileSync(join(root, 'Tests/EditMode/Greybox.Editor.Tests.asmdef'), JSON.stringify({
    name: 'Greybox.Editor.Tests',
    rootNamespace: 'Greybox.Tests.EditMode',
    references: ['Greybox.Editor', 'Greybox.Runtime', 'Unity.Newtonsoft.Json', 'UnityEngine.UI'],
    includePlatforms: ['Editor'],
    optionalUnityReferences: ['TestAssemblies'],
    noEngineReferences: false,
  }));
  writeFileSync(join(root, 'Validation~/unity-import-smoke.mjs'), 'export function createSmokeProject() { return { dependencies: { "com.greybox.studio": "file:/pkg" } }; }\n');

  const missing = validatePackage(root);
  assert.ok(missing.errors.includes('Unity smoke project manifest must mark com.greybox.studio testable so packaged Unity Test Runner assemblies execute'));

  writeFileSync(join(root, 'Validation~/unity-import-smoke.mjs'), "export function createSmokeProject() { return { testables: ['com.greybox.studio'] }; }\n");
  const passing = validatePackage(root);
  assert.ok(!passing.errors.includes('Unity smoke project manifest must mark com.greybox.studio testable so packaged Unity Test Runner assemblies execute'));
});

test('validator catches third-party notices without dependency versions', () => {
  const root = mkdtempSync(join(tmpdir(), 'greybox-unity-notices-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    name: 'com.greybox.studio',
    displayName: 'Greybox Studio',
    version: '1.0.0',
    unity: '2022.3',
    description: 'AI-assisted game design import.',
    author: { name: 'Greybox Studio', url: 'https://greybox.studio' },
    license: 'See LICENSE.md file',
    documentationUrl: 'https://greybox.studio/docs/unity',
    changelogUrl: 'https://greybox.studio/docs/unity/changelog',
    licensesUrl: 'https://greybox.studio/docs/unity/license',
    keywords: ['game design', 'level blockout', 'round-trip', 'Unity Editor', 'MCP'],
    dependencies: {
      'com.unity.inputsystem': '1.7.0',
    },
  }));
  writeFileSync(join(root, 'Third-Party Notices.txt'), [
    'This package does not bundle third-party source code or binaries.',
    'Dependency notices are distributed by Unity Technologies.',
    '- com.unity.inputsystem',
  ].join('\n'));

  const result = validatePackage(root);
  assert.ok(result.errors.some((error) => error.includes('Third-Party Notices.txt must list com.unity.inputsystem (1.7.0)')));
});

test('validator accepts MCP transform position, scale, and rotation round-trip edits in the real package', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const result = validatePackage(root);
  assert.deepEqual(
    result.errors.filter((error) => /transform position|transform position\/scale|transform position\/scale\/rotation|artifact fields|GreyboxDesignNode transform/i.test(error)),
    [],
  );
});

test('validator accepts MCP object creation round-trip inserts in the real package', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const result = validatePackage(root);
  assert.deepEqual(
    result.errors.filter((error) => /createGameObject|Greybox node inserts|round-trip inserts/i.test(error)),
    [],
  );
});

test('validator accepts MCP asset assignment round-trip edits in the real package', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const result = validatePackage(root);
  assert.deepEqual(
    result.errors.filter((error) => /assignAsset|asset assignment round-trip|asset references to artifact fields/i.test(error)),
    [],
  );
});

test('validator accepts EditorPrefs-only license storage in the real package', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const result = validatePackage(root);
  assert.deepEqual(
    result.errors.filter((error) => /GreyboxConfig|GreyboxSettings|GreyboxLicenseWindow|GreyboxCloudClient|EditorPrefs|password fields/i.test(error)),
    [],
  );
});

test('validator enforces proprietary source headers in the real package', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const result = validatePackage(root);
  assert.deepEqual(
    result.errors.filter((error) => /proprietary source header|Apache\/SPDX open-source headers/i.test(error)),
    [],
  );
});

test('validator rejects Apache or missing headers in proprietary source files', () => {
  const root = mkdtempSync(join(tmpdir(), 'greybox-unity-license-hygiene-'));
  mkdirSync(join(root, 'Runtime'), { recursive: true });
  mkdirSync(join(root, 'Validation~'), { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    name: 'com.greybox.studio',
    displayName: 'Greybox Studio',
    version: '1.0.0',
    unity: '2022.3',
    description: 'AI-assisted game design import.',
    author: { name: 'Greybox Studio', url: 'https://greybox.studio' },
    license: 'See LICENSE.md file',
    documentationUrl: 'https://greybox.studio/docs/unity',
    changelogUrl: 'https://greybox.studio/docs/unity/changelog',
    licensesUrl: 'https://greybox.studio/docs/unity/license',
    keywords: ['game design', 'level blockout', 'round-trip', 'Unity Editor', 'MCP'],
    dependencies: {
      'com.unity.editorcoroutines': '1.0.0',
      'com.unity.nuget.newtonsoft-json': '3.2.1',
      'com.unity.inputsystem': '1.7.0',
      'com.unity.addressables': '1.21.21',
      'com.unity.ugui': '1.0.0',
      'com.unity.ui': '1.0.0',
    },
  }));
  writeFileSync(join(root, 'Runtime/GreyboxArtifact.cs'), '// SPDX-License-Identifier: Apache-2.0\nnamespace Greybox.Runtime { public class GreyboxArtifact {} }\n');
  writeFileSync(join(root, 'Validation~/local-check.mjs'), 'export const ok = true;\n');

  const result = validatePackage(root);
  assert.ok(result.errors.includes('Runtime/GreyboxArtifact.cs must carry the Greybox proprietary source header'));
  assert.ok(result.errors.includes('Runtime/GreyboxArtifact.cs must not carry Apache/SPDX open-source headers in the proprietary Unity package'));
  assert.ok(result.errors.includes('Validation~/local-check.mjs must carry the Greybox proprietary source header'));
});

test('validator accepts the Unity CI smoke matrix in the real package', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const result = validatePackage(root);
  assert.deepEqual(
    result.errors.filter((error) => /Unity package validation workflow|Unity validation workflow|smoke matrix|unity-test-runner|UNITY_LICENSE/i.test(error)),
    [],
  );
});

test('validator accepts deterministic GitHub release packaging in the real package', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const result = validatePackage(root);
  assert.deepEqual(
    result.errors.filter((error) => /Unity release workflow|deterministic release evidence|SHA256SUMS|release-readiness|action-gh-release/i.test(error)),
    [],
  );
});

test('validator accepts real Unity Asset Store package export in the real package', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const result = validatePackage(root);
  assert.deepEqual(
    result.errors.filter((error) => /unitypackage exporter|real Unity export discipline|package-builder or rename|GreyboxAssetStorePackageExporter/i.test(error)),
    [],
  );
});

test('submission mode blocks prerelease package versions', () => {
  const root = mkdtempSync(join(tmpdir(), 'greybox-unity-prerelease-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    name: 'com.greybox.studio',
    displayName: 'Greybox Studio',
    version: '1.0.0-rc.1',
    unity: '2022.3',
    description: 'AI-assisted game design import.',
    author: { name: 'Greybox Studio', url: 'https://greybox.studio' },
    license: 'See LICENSE.md file',
    documentationUrl: 'https://greybox.studio/docs/unity',
    changelogUrl: 'https://greybox.studio/docs/unity/changelog',
    licensesUrl: 'https://greybox.studio/docs/unity/license',
    keywords: ['game design', 'level blockout', 'round-trip', 'Unity Editor', 'MCP'],
    dependencies: {
      'com.unity.editorcoroutines': '1.0.0',
      'com.unity.nuget.newtonsoft-json': '3.2.1',
      'com.unity.inputsystem': '1.7.0',
      'com.unity.addressables': '1.21.21',
      'com.unity.ugui': '1.0.0',
      'com.unity.ui': '1.0.0',
    },
  }));

  const result = validatePackage(root, { submission: true });
  assert.ok(result.errors.includes('submission mode requires a stable package version without prerelease suffix'));
});

test('submission mode blocks stable package versions below 1.0.0', () => {
  const root = mkdtempSync(join(tmpdir(), 'greybox-unity-pre-v1-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    name: 'com.greybox.studio',
    displayName: 'Greybox Studio',
    version: '0.9.0',
    unity: '2022.3',
    description: 'AI-assisted game design import.',
    author: { name: 'Greybox Studio', url: 'https://greybox.studio' },
    license: 'See LICENSE.md file',
    documentationUrl: 'https://greybox.studio/docs/unity',
    changelogUrl: 'https://greybox.studio/docs/unity/changelog',
    licensesUrl: 'https://greybox.studio/docs/unity/license',
    keywords: ['game design', 'level blockout', 'round-trip', 'Unity Editor', 'MCP'],
    dependencies: {
      'com.unity.editorcoroutines': '1.0.0',
      'com.unity.nuget.newtonsoft-json': '3.2.1',
      'com.unity.inputsystem': '1.7.0',
      'com.unity.addressables': '1.21.21',
      'com.unity.ugui': '1.0.0',
      'com.unity.ui': '1.0.0',
    },
  }));

  const result = validatePackage(root, { submission: true });
  assert.ok(result.errors.includes('submission mode requires package version 1.0.0 or later'));
  assert.ok(!result.errors.includes('submission mode requires a stable package version without prerelease suffix'));
});

test('validator accepts paid feature license capability gates in the real package', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const result = validatePackage(root);
  assert.deepEqual(
    result.errors.filter((error) => /license capability|GreyboxLicenseState|GreyboxProjectEntitlements|paid controls|pricing tier|project caps|license tiers|round-trip write paths/i.test(error)),
    [],
  );
});

test('validator accepts Free Personal watermark enforcement in the real package', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const result = validatePackage(root);
  assert.deepEqual(
    result.errors.filter((error) => /watermark|GreyboxWatermark|Watermarked/i.test(error)),
    [],
  );
});

test('validator accepts stable round-trip marker metadata in the real package', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const result = validatePackage(root);
  assert.deepEqual(
    result.errors.filter((error) => /GreyboxMarker|GreyboxSceneChangeWatcher|Scene edit watcher|round-trip marker|PositionJsonPath|marker-based|__greyboxSourceFileName/i.test(error)),
    [],
  );
});

test('validator accepts Unity-side round-trip diff text merge and deletion semantics in the real package', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const result = validatePackage(root);
  assert.deepEqual(
    result.errors.filter((error) => /DiffApplier|typed round-trip merge|deletion semantics|missing array items|DiffApplierTests/i.test(error)),
    [],
  );
});

test('validator accepts the 2-second Unity round-trip latency budget in the real package', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const result = validatePackage(root);
  assert.deepEqual(
    result.errors.filter((error) => /2-second|sync budget|RoundTripLatency|RoundTripLatencyTests|GreyboxDaemonClient must enforce/i.test(error)),
    [],
  );
});

test('validator accepts web-to-Unity artifact refresh wiring in the real package', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const result = validatePackage(root);
  assert.deepEqual(
    result.errors.filter((error) => /GreyboxArtifactRefresher|web-to-Unity|daemon-changed artifacts|artifact changes to the refresher/i.test(error)),
    [],
  );
});

test('validator accepts the project artifact import menu in the real package', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const result = validatePackage(root);
  assert.deepEqual(
    result.errors.filter((error) => /GreyboxProjectArtifactImporter|project artifact import menu|Import Project Artifacts|reviewer import workflow/i.test(error)),
    [],
  );
});

test('validator accepts round-trip conflict inbox UI in the real package', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const result = validatePackage(root);
  assert.deepEqual(
    result.errors.filter((error) => /GreyboxConflictInbox|GreyboxConflictWindow|round-trip conflict|merge conflict UI/i.test(error)),
    [],
  );
});

test('validator accepts generated uGUI and UI Toolkit HUD imports in the real package', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const result = validatePackage(root);
  assert.deepEqual(
    result.errors.filter((error) => /HudLayoutBuilder|HudLayoutImporter|HUD hierarchy|uGUI|UI Toolkit|AssertHudLayout/i.test(error)),
    [],
  );
});

test('validator accepts runtime art-bible palettes and generated materials in the real package', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const result = validatePackage(root);
  assert.deepEqual(
    result.errors.filter((error) => /GreyboxArtBiblePalette|ArtBibleImporter|MaterialBuilder|art-bible material|runtime ScriptableObject palette|material traits/i.test(error)),
    [],
  );
});

test('validator accepts prefab, mesh, and material asset realization in the real package', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const result = validatePackage(root);
  assert.deepEqual(
    result.errors.filter((error) => /PrefabBuilder.*realize|real asset realization|prefab, mesh, and material/i.test(error)),
    [],
  );
});

test('validator accepts the daemon Unity package import contract in the real package', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const result = validatePackage(root);
  assert.deepEqual(
    result.errors.filter((error) => /Unity package import contract|GreyboxProjectManifest|greyboxImportedAssets|blocked private-network/i.test(error)),
    [],
  );
});

test('validator accepts Pro engine-target status surfacing in the real package', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const result = validatePackage(root);
  assert.deepEqual(
    result.errors.filter((error) => /Pro module status client|Pro engine-target|GreyboxProModuleStatusClient|Unity export targets|Open License To Activate Pro Modules|bodyless Pro target metadata/i.test(error)),
    [],
  );
});

test('validator accepts Unity engine package preflight surfacing in the real package', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const result = validatePackage(root);
  assert.deepEqual(
    result.errors.filter((error) => /engine package preflight|GreyboxEnginePackagePreflightClient|Check Unity Export|Unity engine package/i.test(error)),
    [],
  );
});

test('validator accepts Unity engine package checksum verification in the real package', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const result = validatePackage(root);
  assert.deepEqual(
    result.errors.filter((error) => /ManifestEntriesByPath|SHA-256 mismatch|byte count mismatch|duplicate runtime file|checksum-verified|ExtractEnginePackageZipRejectsManifestHashMismatch|ExtractEnginePackageZipRejectsManifestByteMismatch|ExtractEnginePackageZipRejectsDuplicateManifestPaths/i.test(error)),
    [],
  );
});

test('validator accepts honest AI provenance in package surfaces and samples', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const result = validatePackage(root);
  assert.deepEqual(
    result.errors.filter((error) => /AI-assisted|AI-generated|human designer|provenance/i.test(error)),
    [],
  );
});

test('validator accepts runtime provenance metadata for imported Unity artifacts', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const result = validatePackage(root);
  assert.deepEqual(
    result.errors.filter((error) => /GeneratorCredit|HumanDesignerCredit|AiDisclosure|Unity provenance/i.test(error)),
    [],
  );
});

test('validator accepts playable 2D Platformer sample surface in the real package', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const result = validatePackage(root);
  assert.deepEqual(
    result.errors.filter((error) => /2D Platformer playable|Greybox2DPlatformerSampleBuilder|GreyboxPlatformerSample|playable sample/i.test(error)),
    [],
  );
});
