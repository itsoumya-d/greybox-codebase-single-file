import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'vitest';
import Database from 'better-sqlite3';
import { GAME_ENTITY_TYPES } from '@ai-game-design-studio/contracts/api/projects';

import { closeDatabase, insertProject, openDatabase, updateProject } from '../src/db.js';

const tempDirs: string[] = [];
const retiredArtBibleColumn = ['design', 'system', 'id'].join('_');

afterEach(() => {
  closeDatabase();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function createDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agds-game-schema-'));
  tempDirs.push(dir);
  return openDatabase(dir, { dataDir: path.join(dir, '.agds') });
}

function tableColumns(db: Database.Database, table: string) {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
    (row) => row.name,
  );
}

test('creates projects with only the canonical game art bible column', () => {
  const db = createDb();
  const columns = new Set(tableColumns(db, 'projects'));

  assert.equal(columns.has('game_art_bible_id'), true);
  assert.equal(columns.has(retiredArtBibleColumn), false);
});

test('creates game memory with a strict shared entity-type union', () => {
  const db = createDb();
  const table = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'game_entities'`)
    .get() as { sql: string };

  for (const type of GAME_ENTITY_TYPES) {
    assert.match(table.sql, new RegExp(`'${type}'`));
  }
  assert.doesNotMatch(table.sql, /'pricing_card'/);

  db.prepare(
    `INSERT INTO projects
      (id, name, skill_id, game_art_bible_id, pending_prompt, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run('schema-project', 'Schema Project', null, null, null, null, 1, 1);

  assert.throws(
    () => db
      .prepare(
        `INSERT INTO game_entities
          (id, project_id, type, name, summary, payload_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run('bad-pricing-card', 'schema-project', 'pricing_card', 'Pricing Card', '', '{}', 1, 1),
    /CHECK constraint failed|constraint failed/i,
  );
});

test('upgrades legacy game memory tables to the strict entity-type union', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agds-legacy-game-memory-'));
  tempDirs.push(dir);
  const dataDir = path.join(dir, '.agds');
  fs.mkdirSync(dataDir, { recursive: true });
  const sqliteFile = path.join(dataDir, 'app.sqlite');
  const legacyDb = new Database(sqliteFile);
  legacyDb.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      skill_id TEXT,
      pending_prompt TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE game_entities (
      id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(project_id, id)
    );

    CREATE TABLE game_entity_links (
      id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      from_entity_id TEXT NOT NULL,
      to_entity_id TEXT NOT NULL,
      relationship TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(project_id, id)
    );

    INSERT INTO projects
      (id, name, skill_id, pending_prompt, created_at, updated_at)
    VALUES
      ('legacy-memory-project', 'Legacy Memory Project', 'game-design-document', NULL, 10, 20);

    INSERT INTO game_entities
      (id, project_id, type, name, summary, payload_json, created_at, updated_at)
    VALUES
      ('faction-1', 'legacy-memory-project', 'faction', 'Ash Wardens', '', '{}', 10, 20),
      ('biome-1', 'legacy-memory-project', 'biome', 'Glass Marsh', '', '{}', 10, 20),
      ('survival-1', 'legacy-memory-project', 'survival_system', 'Storm Survival Pressure', '', '{}', 10, 20),
      ('pricing-1', 'legacy-memory-project', 'pricing_card', 'Legacy Pricing Card', '', '{}', 10, 20);

    INSERT INTO game_entity_links
      (id, project_id, from_entity_id, to_entity_id, relationship, payload_json, created_at, updated_at)
    VALUES
      ('valid-link', 'legacy-memory-project', 'faction-1', 'biome-1', 'controls', '{}', 10, 20),
      ('advanced-link', 'legacy-memory-project', 'biome-1', 'survival-1', 'pressurizes', '{}', 10, 20),
      ('invalid-link', 'legacy-memory-project', 'faction-1', 'pricing-1', 'references', '{}', 10, 20);
  `);
  legacyDb.close();

  const db = openDatabase(dir, { dataDir });
  const table = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'game_entities'`)
    .get() as { sql: string };

  for (const type of GAME_ENTITY_TYPES) {
    assert.match(table.sql, new RegExp(`'${type}'`));
  }
  assert.doesNotMatch(table.sql, /'pricing_card'/);
  assert.throws(
    () => db
      .prepare(
        `INSERT INTO game_entities
          (id, project_id, type, name, summary, payload_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'bad-dashboard',
        'legacy-memory-project',
        'dashboard_widget',
        'Dashboard Widget',
        '',
        '{}',
        30,
        40,
      ),
    /CHECK constraint failed|constraint failed/i,
  );

  const entities = db
    .prepare(`SELECT id FROM game_entities WHERE project_id = ? ORDER BY id`)
    .all('legacy-memory-project') as Array<{ id: string }>;
  assert.deepEqual(entities.map((entity) => entity.id), ['biome-1', 'faction-1', 'survival-1']);

  const links = db
    .prepare(`SELECT id FROM game_entity_links WHERE project_id = ? ORDER BY id`)
    .all('legacy-memory-project') as Array<{ id: string }>;
  assert.deepEqual(links.map((link) => link.id), ['advanced-link', 'valid-link']);
});

test('migrates legacy project art-bible ids into game art bible ids', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agds-legacy-schema-'));
  tempDirs.push(dir);
  const dataDir = path.join(dir, '.agds');
  fs.mkdirSync(dataDir, { recursive: true });
  const sqliteFile = path.join(dataDir, 'app.sqlite');
  const legacyDb = new Database(sqliteFile);
  legacyDb.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      skill_id TEXT,
      ${retiredArtBibleColumn} TEXT,
      pending_prompt TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    INSERT INTO projects
      (id, name, skill_id, ${retiredArtBibleColumn}, pending_prompt, created_at, updated_at)
    VALUES
      ('legacy-project', 'Legacy Arena', 'combat-system', 'arcade-neon', NULL, 10, 20);
  `);
  legacyDb.close();

  const db = openDatabase(dir, { dataDir });
  const row = db
    .prepare(`SELECT game_art_bible_id AS gameArtBibleId FROM projects WHERE id = ?`)
    .get('legacy-project') as { gameArtBibleId: string };

  assert.equal(row.gameArtBibleId, 'arcade-neon');
});

test('project DB helpers ignore retired art-bible request aliases', () => {
  const db = createDb();
  const retiredArtBibleAlias = 'design'.concat('SystemId');

  const created = insertProject(db, {
    id: 'retired-request-alias',
    name: 'Retired Request Alias',
    skillId: 'game-design-document',
    [retiredArtBibleAlias]: 'arcade-neon',
    createdAt: 10,
    updatedAt: 10,
  });

  assert.equal(created?.gameArtBibleId, null);

  const patchedCanonical = updateProject(db, 'retired-request-alias', {
    gameArtBibleId: 'fantasy-rpg',
  });
  assert.equal(patchedCanonical?.gameArtBibleId, 'fantasy-rpg');

  const patchedRetired = updateProject(db, 'retired-request-alias', {
    [retiredArtBibleAlias]: 'soulslike-dark',
  });
  assert.equal(patchedRetired?.gameArtBibleId, 'fantasy-rpg');
});

test('migrates project-scoped game design memory tables', () => {
  const db = createDb();
  const requiredTables = [
    'game_world',
    'faction',
    'enemy_type',
    'item_rarity',
    'skill_tree',
    'progression_curve',
    'quest_arc',
    'gameplay_loop',
    'biome',
    'combat_style',
    'character_class',
    'crafting_recipe',
    'loot_table',
    'weapon_system',
    'mission_flow',
    'dungeon_layout',
    'dialogue_branch',
    'boss_phase',
    'economy_system',
    'multiplayer_mode',
    'game_entities',
    'game_entity_links',
  ];

  const rows = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
    .all() as Array<{ name: string }>;
  const names = new Set(rows.map((row) => row.name));

  for (const table of requiredTables) {
    assert.equal(names.has(table), true, `${table} table should exist`);
  }
});
