import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  GameProjectSchema,
  SCHEMA_VERSION,
  getJsonSchemas,
  migrate,
  safeParseGameProject,
  validateGameProject,
} from '../src/index.js';
import { ZodError } from 'zod';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(__dirname, 'fixtures/sample-project.json');

function loadFixture(): unknown {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
}

describe('GameProject', () => {
  it('round-trips the canonical sample fixture', () => {
    const raw = loadFixture();
    const project = validateGameProject(raw);
    expect(project.schemaVersion).toBe(SCHEMA_VERSION);
    expect(project.meta.id).toBe('proj-sample-001');
    expect(project.screens.length).toBe(2);
    expect(project.characters.length).toBe(1);
    expect(project.flow.length).toBe(7);
    // Round-trip preserves the document (modulo Zod defaults filling in).
    const reparsed = validateGameProject(JSON.parse(JSON.stringify(project)));
    expect(reparsed.meta).toEqual(project.meta);
  });

  it('safeParse returns success for the fixture', () => {
    const result = safeParseGameProject(loadFixture());
    expect(result.success).toBe(true);
  });

  it('safeParse returns failure with issues for an empty object', () => {
    const result = safeParseGameProject({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it('rejects missing required fields (no screens)', () => {
    const raw = loadFixture() as { screens: unknown[] };
    raw.screens = [];
    expect(() => validateGameProject(raw)).toThrow(ZodError);
  });

  it('rejects payloads missing meta.id', () => {
    const raw = loadFixture() as { meta: { id?: string } };
    delete raw.meta.id;
    expect(() => validateGameProject(raw)).toThrow(ZodError);
  });

  it('rejects wrong schemaVersion', () => {
    const raw = loadFixture() as { schemaVersion: string };
    raw.schemaVersion = '0.0.1';
    expect(() => validateGameProject(raw)).toThrow(ZodError);
  });

  it('rejects unknown component kinds', () => {
    const raw = loadFixture() as {
      screens: Array<{ components: Array<{ kind: string }> }>;
    };
    raw.screens[0]!.components[0]!.kind = 'NotARealKind';
    expect(() => validateGameProject(raw)).toThrow(ZodError);
  });

  it('rejects unknown target engines in meta', () => {
    const raw = loadFixture() as { meta: { targetEngines: string[] } };
    raw.meta.targetEngines = ['atari'];
    expect(() => validateGameProject(raw)).toThrow(ZodError);
  });

  it('rejects non-SemVer meta.version', () => {
    const raw = loadFixture() as { meta: { version: string } };
    raw.meta.version = 'banana';
    expect(() => validateGameProject(raw)).toThrow(ZodError);
  });

  it('rejects bad sha256 (non-hex / wrong length)', () => {
    const raw = loadFixture() as { assets: Array<{ sha256: string }> };
    raw.assets[0]!.sha256 = 'not-a-hex-sha';
    expect(() => validateGameProject(raw)).toThrow(ZodError);
  });

  it('migrate passes-through when from === to', () => {
    const raw = loadFixture();
    const out = migrate(SCHEMA_VERSION, SCHEMA_VERSION, raw);
    expect(out).toBe(raw);
  });

  it('migrate throws for unknown source version', () => {
    expect(() => migrate('99.99.99', SCHEMA_VERSION, {})).toThrow(
      /Unknown source schemaVersion/,
    );
  });

  it('migrate throws for unknown target version', () => {
    expect(() => migrate(SCHEMA_VERSION, '99.99.99', {})).toThrow(
      /Unknown target schemaVersion/,
    );
  });

  it('exposes a JSON Schema for every top-level entity', () => {
    const schemas = getJsonSchemas();
    const expected = [
      'GameProject',
      'ProjectMeta',
      'Screen',
      'Component',
      'FlowEdge',
      'Character',
      'Asset',
      'Art',
      'ExportPolicy',
    ];
    for (const key of expected) {
      expect(schemas[key]).toBeDefined();
      expect(typeof schemas[key]).toBe('object');
    }
  });

  it('GameProjectSchema is a ZodObject with the expected shape keys', () => {
    const keys = Object.keys(GameProjectSchema.shape).sort();
    expect(keys).toEqual(
      [
        'art',
        'assets',
        'characters',
        'exportPolicy',
        'flow',
        'meta',
        'schemaVersion',
        'screens',
      ].sort(),
    );
  });
});
