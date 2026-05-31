// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { authorModule } from '../src/cli/authorModule.js';
import { decryptGbproBundle, verifyGbproBundleSignature } from '../src/index.js';
import type { ProModuleBundleEnvelope } from '../src/index.js';

const licenseSecret = 'test-license-secret-from-author-cli';
const envName = 'GREYBOX_AUTHOR_MODULE_TEST_LICENSE_SECRET';

const skillEntry = 'skills/cli-combat/SKILL.md';
const artBibleEntry = 'game-art-bibles/test-cli-module/DESIGN.md';
const engineEntry = 'engine-targets/test-cli-module/unity.json';
const playbookEntry = 'playbooks/test-cli-module/PLAYBOOK.md';
const telemetryEntry = 'telemetry/test-cli-module/signals.json';

function withTempDir<T>(callback: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'greybox-author-cli-'));
  try {
    return callback(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function writeFile(dir: string, name: string, body: string): string {
  const path = join(dir, name);
  writeFileSync(path, body, 'utf8');
  return path;
}

function sha256(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex');
}

function releaseCandidateBodies(): Record<string, string> {
  return {
    [skillEntry]: [
      '# CLI Test Module',
      '',
      'Use this closed-core skill for AI-assisted design work only when a licensed Greybox Pro key is present.',
      'Preserve human designer authorship and require review notes before engine export.',
      '',
      '## Paid Pack Recipes',
      '- Build a four-phase arena read with stamina cost, boss recovery, camera anchor, and fail-state copy.',
      '- Convert accepted notes into Unity prefab deltas with inspector-visible tuning fields.',
      '- Reject any combat suggestion that cannot explain player counterplay and recovery timing.',
      '- Produce QA prompts for first-read clarity, five-death mastery, and controller-only replay.',
    ].join('\n'),
    [artBibleEntry]: [
      '# CLI Test Module Art Bible',
      '',
      'Positioning: A paid combat module with production-ready authored content.',
      '',
      '## Closed-Core Art Direction',
      '- Boss armor stays graphite while recoverable weak points use ember accents at phase breaks.',
      '- Lock-on reticles sit below the head mass and avoid covering facial anticipation frames.',
      '- Dodge feedback uses one cyan edge frame followed by a short low-saturation afterimage.',
      '- Hit sparks are directional and separate parry, blocked stamina damage, and lethal damage.',
    ].join('\n'),
    [engineEntry]: JSON.stringify({
      schemaVersion: 'greybox.pro.engine-target/v1',
      id: 'test-cli-module-unity-target',
      moduleId: 'test-cli-module',
      engine: 'unity',
      targetEngines: ['unity'],
      aiDisclosure: 'AI-assisted',
      humanDesignerCreditRequired: true,
      designerReviewRequired: true,
      exports: ['skill', 'artBible', 'engineTarget'],
      supportedValueTypes: ['int', 'float', 'string', 'Color', 'Vector3'],
      roundTripSafeFields: ['enemyHealth', 'poiseDamage', 'arenaTintColor', 'lockOnCameraOffset'],
      tuningFields: ['enemyHealth', 'poiseDamage', 'arenaTintColor', 'lockOnCameraOffset'],
      fieldContracts: [
        {
          field: 'enemyHealth',
          designerLabel: 'Enemy Health',
          valueType: 'int',
          reviewRequired: true,
          conflictPolicy: 'designer-review',
          mergeStrategy: 'three-way-last-synced-base',
          engineBindings: { unity: { serializedProperty: 'enemyHealth', inspectorEditable: true } },
        },
        {
          field: 'poiseDamage',
          designerLabel: 'Poise Damage',
          valueType: 'int',
          reviewRequired: true,
          conflictPolicy: 'designer-review',
          mergeStrategy: 'three-way-last-synced-base',
          engineBindings: { unity: { serializedProperty: 'poiseDamage', inspectorEditable: true } },
        },
        {
          field: 'arenaTintColor',
          designerLabel: 'Arena Tint Color',
          valueType: 'Color',
          reviewRequired: true,
          conflictPolicy: 'designer-review',
          mergeStrategy: 'three-way-last-synced-base',
          engineBindings: { unity: { serializedProperty: 'arenaTintColor', inspectorEditable: true } },
        },
        {
          field: 'lockOnCameraOffset',
          designerLabel: 'Lock On Camera Offset',
          valueType: 'Vector3',
          reviewRequired: true,
          conflictPolicy: 'designer-review',
          mergeStrategy: 'three-way-last-synced-base',
          engineBindings: { unity: { serializedProperty: 'lockOnCameraOffset', inspectorEditable: true } },
        },
      ],
      proprietaryPayload: {
        referenceEncounter: {
          id: 'ash-cli-sentinel',
          name: 'Ash CLI Sentinel',
          beats: [
            'Phase one teaches a horizontal sweep with a clear non-lethal rehearsal.',
            'Phase two adds a delayed overhead after an ember ignition tell.',
            'Phase break staggers at half health and creates one heavy punish window.',
            'Arena pillar is camera stress only and cannot trivialize the encounter.',
          ],
        },
        unityObjects: [
          'GreyboxBossEncounterProfile ScriptableObject with phase table and stamina budgets.',
          'GreyboxLockOnHud prefab with reticle pulse and camera offset binding.',
          'GreyboxStaminaTuning MonoBehaviour with inspector fields mapped to contracts.',
          'GreyboxArenaMarker objects for entrance, checkpoint, spawn, and safe flask zones.',
        ],
        tuningDefaults: {
          enemyHealth: 1250,
          poiseDamage: 34,
          arenaTintColor: '#ff8844',
          lockOnCameraOffset: '0,1.4,-4.8',
        },
      },
    }, null, 2),
    [playbookEntry]: [
      '# CLI Test Module Production Playbook',
      '',
      'This paid pack turns a combat encounter into reviewable Unity deltas.',
      '',
      '## Reference Encounter Beats',
      '- Phase one teaches horizontal sweep, dodge timing, and safe punish spacing.',
      '- Phase two adds ember lunge only after a readable kneel-and-ignite tell.',
      '- Phase break staggers at half health and guarantees one heavy punish window.',
      '- The arena includes one camera stress pillar without creating cheese cover.',
      '',
      '## Engine Implementation Steps',
      '- Create the Ash CLI Sentinel reference scene before authoring customer content.',
      '- Tune enemyHealth and poiseDamage before color and camera offset fields.',
      '- Run first-read, five-death mastery, controller-only, and replay capture passes.',
      '- Export accepted diffs only after the designer approves windup and retry distance.',
    ].join('\n'),
    [telemetryEntry]: JSON.stringify({
      moduleId: 'test-cli-module',
      aiDisclosure: 'AI-assisted',
      noTrainingWithoutOptIn: true,
      northStarContribution: 'weekly_active_designer_engine_shipments',
      signals: [
        { id: 'death-by-phase', label: 'Death by phase', privacy: 'aggregate-only' },
        { id: 'stamina-empty-rate', label: 'Stamina empty rate', privacy: 'aggregate-only' },
        { id: 'boss-retry-depth', label: 'Boss retry depth', privacy: 'aggregate-only' },
        { id: 'parry-window-acceptance', label: 'Parry window acceptance', privacy: 'aggregate-only' },
      ],
      dashboards: [
        'activation-to-engine-export',
        'module-retention-cohort',
        'accepted-tuning-diffs',
      ],
    }, null, 2),
  };
}

function writeReleaseCandidateSpec(
  dir: string,
  mutate?: (bodies: Record<string, string>, spec: Record<string, unknown>) => void,
): string {
  const bodies = releaseCandidateBodies();
  const files = Object.entries(bodies).map(([path, body], index) => ({
    path,
    mediaType: path.endsWith('.json') ? 'application/json' : 'text/markdown',
    bodyPath: writeFile(dir, `payload-${index}`, body),
  }));
  const spec: Record<string, unknown> = {
    order: 1,
    category: 'combat',
    price: { currency: 'USD', oneTimeUsd: 79 },
    audience: 'Action-RPG indies',
    status: 'alpha-ready',
    targetShipWindowWeeks: 2,
    positioning: 'A paid combat module with production-ready authored content.',
    manifest: {
      id: 'test-cli-module',
      name: 'CLI Test Module',
      version: '0.1.0',
      description: 'A paid combat module with production-ready authored content.',
      licenseTier: 'pro',
      minAgdsVersion: '0.1.0',
      mounts: {
        skills: [{ kind: 'skill', id: 'cli-combat', entry: skillEntry, digestSha256: sha256(bodies[skillEntry]!) }],
        gameArtBibles: [{ kind: 'game-art-bible', id: 'test-cli-module-art', entry: artBibleEntry, digestSha256: sha256(bodies[artBibleEntry]!) }],
        engineTargets: [{ kind: 'engine-target', id: 'test-cli-module-unity-target', entry: engineEntry, digestSha256: sha256(bodies[engineEntry]!) }],
      },
    },
    files,
  };
  mutate?.(bodies, spec);
  return writeFile(dir, 'module-spec.json', JSON.stringify(spec));
}

function authorWithFixture(dir: string, specPath: string): ReturnType<typeof authorModule> {
  const { privateKey } = generateKeyPairSync('ed25519');
  const privateKeyPath = writeFile(dir, 'signing.pem', privateKey.export({ format: 'pem', type: 'pkcs8' }).toString());
  return authorModule({
    spec: specPath,
    privateKey: privateKeyPath,
    keyId: 'greybox-author-cli-key',
    licenseSecretEnv: envName,
    output: join(dir, 'dist', 'test-cli-module.gbpro.json'),
  });
}

test('author-module CLI emits a signed encrypted release-candidate bundle that round-trips', () => {
  withTempDir((dir) => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const privateKeyPath = writeFile(dir, 'signing.pem', privateKey.export({ format: 'pem', type: 'pkcs8' }).toString());
    const specPath = writeReleaseCandidateSpec(dir);
    const outputPath = join(dir, 'dist', 'test-cli-module.gbpro.json');

    const previousSecret = process.env[envName];
    process.env[envName] = licenseSecret;
    try {
      const result = authorModule({
        spec: specPath,
        privateKey: privateKeyPath,
        keyId: 'greybox-author-cli-key',
        licenseSecretEnv: envName,
        output: outputPath,
      });
      assert.equal(result.moduleId, 'test-cli-module');
      assert.equal(result.fileCount, 5);
      assert.match(result.payloadSha256, /^[a-f0-9]{64}$/u);

      const written = JSON.parse(readFileSync(outputPath, 'utf8')) as ProModuleBundleEnvelope;
      const verified = verifyGbproBundleSignature(written, { 'greybox-author-cli-key': publicKey });
      if (verified.ok === false) throw new Error(`expected signature verification to succeed: ${verified.message}`);
      assert.equal(verified.ok, true);
      const payload = decryptGbproBundle(written, licenseSecret);
      assert.equal(payload.moduleId, 'test-cli-module');
      assert.equal(payload.files.length, 5);
      assert.ok(payload.files.some((file) => file.path === playbookEntry));
      assert.ok(payload.files.some((file) => file.path === telemetryEntry));
    } finally {
      if (previousSecret === undefined) delete process.env[envName];
      else process.env[envName] = previousSecret;
    }
  });
});

test('author-module CLI rejects missing playbook and telemetry payload classes', () => {
  withTempDir((dir) => {
    const specPath = writeReleaseCandidateSpec(dir, (_bodies, spec) => {
      const files = spec.files as Array<{ path: string }>;
      spec.files = files.filter((file) => file.path !== playbookEntry && file.path !== telemetryEntry);
    });
    process.env[envName] = licenseSecret;
    try {
      assert.throws(
        () => authorWithFixture(dir, specPath),
        /production playbook.*aggregate telemetry/u,
      );
    } finally {
      delete process.env[envName];
    }
  });
});

test('author-module CLI rejects shallow authored sections', () => {
  withTempDir((dir) => {
    const specPath = writeReleaseCandidateSpec(dir, (_bodies, spec) => {
      const files = spec.files as Array<{ path: string; bodyPath: string }>;
      for (const file of files) {
        if (file.path === skillEntry) {
          writeFileSync(file.bodyPath, [
            '# CLI Test Module',
            '',
            'Use this for AI-assisted design work with human designer authorship.',
            '',
            '## Paid Pack Recipes',
            '- One generic recipe is not enough.',
          ].join('\n'), 'utf8');
        }
        if (file.path === artBibleEntry) {
          writeFileSync(file.bodyPath, [
            '# CLI Test Module Art Bible',
            '',
            '## Closed-Core Art Direction',
            '- One generic art note is not enough.',
          ].join('\n'), 'utf8');
        }
        if (file.path === playbookEntry) {
          writeFileSync(file.bodyPath, [
            '# CLI Test Module Production Playbook',
            '',
            '## Reference Encounter Beats',
            '- One beat is not enough.',
            '',
            '## Engine Implementation Steps',
            '- One engine step is not enough.',
          ].join('\n'), 'utf8');
        }
      }
    });
    process.env[envName] = licenseSecret;
    try {
      assert.throws(
        () => authorWithFixture(dir, specPath),
        /needs at least four paid pack recipes.*needs at least four closed-core art direction notes.*needs at least four reference encounter beats.*needs at least four engine implementation steps/u,
      );
    } finally {
      delete process.env[envName];
    }
  });
});

test('author-module CLI rejects invalid engine contract', () => {
  withTempDir((dir) => {
    const specPath = writeReleaseCandidateSpec(dir, (_bodies, spec) => {
      const files = spec.files as Array<{ path: string; bodyPath: string }>;
      const engineFile = files.find((file) => file.path === engineEntry);
      assert.ok(engineFile);
      const engine = JSON.parse(readFileSync(engineFile.bodyPath, 'utf8')) as Record<string, unknown>;
      writeFileSync(engineFile.bodyPath, JSON.stringify({
        ...engine,
        schemaVersion: 'greybox.pro.engine-target/draft',
        designerReviewRequired: false,
        roundTripSafeFields: ['int', 'float', 'string', 'Color', 'Vector3'],
        fieldContracts: [],
      }), 'utf8');
    });
    process.env[envName] = licenseSecret;
    try {
      assert.throws(
        () => authorWithFixture(dir, specPath),
        /engine_target_contract_missing.*schemaVersion greybox\.pro\.engine-target\/v1.*does not require designer review.*round-trip safe fields/u,
      );
    } finally {
      delete process.env[envName];
    }
  });
});

test('author-module CLI rejects scaffold-only telemetry', () => {
  withTempDir((dir) => {
    const specPath = writeReleaseCandidateSpec(dir, (_bodies, spec) => {
      const files = spec.files as Array<{ path: string; bodyPath: string }>;
      const telemetryFile = files.find((file) => file.path === telemetryEntry);
      assert.ok(telemetryFile);
      writeFileSync(telemetryFile.bodyPath, JSON.stringify({
        moduleId: 'test-cli-module',
        aiDisclosure: 'AI-assisted',
        noTrainingWithoutOptIn: true,
        signals: [
          { id: 'placeholder', label: 'Placeholder', privacy: 'user-level' },
        ],
        dashboards: [],
      }), 'utf8');
    });
    process.env[envName] = licenseSecret;
    try {
      assert.throws(
        () => authorWithFixture(dir, specPath),
        /needs at least four aggregate telemetry signals.*telemetry signals must stay aggregate-only.*needs at least three telemetry dashboards/u,
      );
    } finally {
      delete process.env[envName];
    }
  });
});

test('author-module CLI rejects empty license secret', () => {
  withTempDir((dir) => {
    const { privateKey } = generateKeyPairSync('ed25519');
    const privateKeyPath = writeFile(dir, 'signing.pem', privateKey.export({ format: 'pem', type: 'pkcs8' }).toString());
    const specPath = writeReleaseCandidateSpec(dir);
    const previousSecret = process.env[envName];
    delete process.env[envName];
    try {
      assert.throws(
        () => authorModule({
          spec: specPath,
          privateKey: privateKeyPath,
          keyId: 'k',
          licenseSecretEnv: envName,
          output: join(dir, 'out.json'),
        }),
        /Environment variable .* is empty/u,
      );
    } finally {
      if (previousSecret !== undefined) process.env[envName] = previousSecret;
    }
  });
});

test('author-module CLI rejects spec with zero files', () => {
  withTempDir((dir) => {
    const { privateKey } = generateKeyPairSync('ed25519');
    const privateKeyPath = writeFile(dir, 'signing.pem', privateKey.export({ format: 'pem', type: 'pkcs8' }).toString());
    const spec = {
      order: 1,
      category: 'combat',
      price: { currency: 'USD', oneTimeUsd: 79 },
      audience: 'Action-RPG indies',
      status: 'alpha-ready',
      targetShipWindowWeeks: 2,
      positioning: 'A paid combat module with production-ready authored content.',
      manifest: {
        id: 'empty',
        name: 'Empty',
        version: '0.1.0',
        description: 'A paid combat module with production-ready authored content.',
        licenseTier: 'pro',
        minAgdsVersion: '0.1.0',
        mounts: {},
      },
      files: [],
    };
    const specPath = writeFile(dir, 'spec.json', JSON.stringify(spec));
    process.env[envName] = licenseSecret;
    try {
      assert.throws(
        () => authorModule({
          spec: specPath,
          privateKey: privateKeyPath,
          keyId: 'k',
          licenseSecretEnv: envName,
          output: join(dir, 'out.json'),
        }),
        /declares zero files/u,
      );
    } finally {
      delete process.env[envName];
    }
  });
});
