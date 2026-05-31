// SQLite-backed persistence for projects, conversations, messages, and the
// per-project set of open file tabs. The on-disk project folder under
// .agds/projects/<id>/ is the repo-local owner of the creator's game files
// (HTML artifacts, sketches, uploads); this database tracks the metadata
// that used to live in localStorage.

import Database from 'better-sqlite3';
import { GAME_ENTITY_TYPES } from '@ai-game-design-studio/contracts/api/projects';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { migrateCritique } from './critique/persistence.js';
import { migrateMediaTasks } from './media-tasks.js';

type SqliteDb = Database.Database;
type DbRow = Record<string, any>;
type JsonObject = Record<string, unknown>;

let dbInstance: SqliteDb | null = null;
let dbFile: string | null = null;

const GAME_ENTITY_TYPE_SQL = GAME_ENTITY_TYPES
  .map((type) => `'${type.replace(/'/g, "''")}'`)
  .join(', ');
const LEGACY_ART_BIBLE_COLUMN = ['design', 'system', 'id'].join('_');

function hasStrictGameEntityTypeCheck(sql: string | null | undefined): boolean {
  if (!sql) return false;
  const match = sql.match(/\bCHECK\s*\(\s*type\s+IN\s*\(([^)]+)\)\s*\)/i);
  const rawAllowedTypes = match?.[1];
  if (!rawAllowedTypes) return false;
  const allowedTypes = new Set(
    Array.from(rawAllowedTypes.matchAll(/'((?:''|[^'])*)'/g), (item) =>
      (item[1] ?? '').replace(/''/g, "'"),
    ),
  );
  return (
    allowedTypes.size === GAME_ENTITY_TYPES.length &&
    GAME_ENTITY_TYPES.every((type) => allowedTypes.has(type))
  );
}

function migrateGameEntityTypeConstraint(db: SqliteDb): void {
  const table = row(
    db
      .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'game_entities'`)
      .get(),
  );
  if (hasStrictGameEntityTypeCheck(typeof table?.sql === 'string' ? table.sql : null)) return;

  const foreignKeysEnabled = db.pragma('foreign_keys', { simple: true }) === 1;
  db.pragma('foreign_keys = OFF');
  try {
    db.exec(`
    DROP TABLE IF EXISTS game_entity_links__agds_type_migration;

    CREATE TABLE game_entity_links__agds_type_migration AS
      SELECT * FROM game_entity_links;

    DROP TABLE IF EXISTS game_entity_links;

    CREATE TABLE game_entities__agds_type_migration (
      id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN (${GAME_ENTITY_TYPE_SQL})),
      name TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(project_id, id),
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    INSERT OR REPLACE INTO game_entities__agds_type_migration
      (id, project_id, type, name, summary, payload_json, created_at, updated_at)
    SELECT id, project_id, type, name, summary, payload_json, created_at, updated_at
      FROM game_entities
     WHERE type IN (${GAME_ENTITY_TYPE_SQL});

    DROP TABLE game_entities;
    ALTER TABLE game_entities__agds_type_migration RENAME TO game_entities;

    CREATE TABLE game_entity_links (
      id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      from_entity_id TEXT NOT NULL,
      to_entity_id TEXT NOT NULL,
      relationship TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(project_id, id),
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY(project_id, from_entity_id) REFERENCES game_entities(project_id, id) ON DELETE CASCADE,
      FOREIGN KEY(project_id, to_entity_id) REFERENCES game_entities(project_id, id) ON DELETE CASCADE
    );

    INSERT OR REPLACE INTO game_entity_links
      (id, project_id, from_entity_id, to_entity_id, relationship, payload_json, created_at, updated_at)
    SELECT l.id, l.project_id, l.from_entity_id, l.to_entity_id, l.relationship,
           l.payload_json, l.created_at, l.updated_at
      FROM game_entity_links__agds_type_migration l
     WHERE EXISTS (
             SELECT 1 FROM game_entities e
              WHERE e.project_id = l.project_id
                AND e.id = l.from_entity_id
           )
       AND EXISTS (
             SELECT 1 FROM game_entities e
              WHERE e.project_id = l.project_id
                AND e.id = l.to_entity_id
           );

    DROP TABLE game_entity_links__agds_type_migration;

    CREATE INDEX IF NOT EXISTS idx_game_entities_project_type
      ON game_entities(project_id, type, name);
    CREATE INDEX IF NOT EXISTS idx_game_entity_links_project
      ON game_entity_links(project_id, from_entity_id, to_entity_id);
  `);
  } finally {
    db.pragma(`foreign_keys = ${foreignKeysEnabled ? 'ON' : 'OFF'}`);
  }
}

function row(value: unknown): DbRow | null {
  return value && typeof value === 'object' ? value as DbRow : null;
}

function rows(value: unknown[]): DbRow[] {
  return value.map((item) => row(item) ?? {});
}

export function openDatabase(projectRoot: string, { dataDir }: { dataDir?: string } = {}): SqliteDb {
  const dir = dataDir ? path.resolve(dataDir) : path.join(projectRoot, '.agds');
  const file = path.join(dir, 'app.sqlite');
  if (dbInstance && dbFile === file) return dbInstance;
  if (dbInstance) closeDatabase();
  fs.mkdirSync(dir, { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  dbInstance = db;
  dbFile = file;
  return db;
}

export function closeDatabase() {
  if (!dbInstance) return;
  dbInstance.close();
  dbInstance = null;
  dbFile = null;
}

function migrate(db: SqliteDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      skill_id TEXT,
      game_art_bible_id TEXT,
      pending_prompt TEXT,
      metadata_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      source_project_id TEXT,
      files_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_conv_project
      ON conversations(project_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      agent_id TEXT,
      agent_name TEXT,
      events_json TEXT,
      attachments_json TEXT,
      produced_files_json TEXT,
      started_at INTEGER,
      ended_at INTEGER,
      position INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conv
      ON messages(conversation_id, position);

    CREATE TABLE IF NOT EXISTS preview_comments (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      element_id TEXT NOT NULL,
      selector TEXT NOT NULL,
      label TEXT NOT NULL,
      text TEXT NOT NULL,
      position_json TEXT NOT NULL,
      html_hint TEXT NOT NULL,
      anchor_json TEXT,
      note TEXT NOT NULL,
      thread_json TEXT,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(project_id, conversation_id, file_path, element_id),
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_preview_comments_conversation
      ON preview_comments(project_id, conversation_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS tabs (
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      position INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(project_id, name),
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tabs_project
      ON tabs(project_id, position);

    CREATE TABLE IF NOT EXISTS deployments (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      url TEXT NOT NULL,
      deployment_id TEXT,
      deployment_count INTEGER NOT NULL DEFAULT 1,
      target TEXT NOT NULL DEFAULT 'preview',
      status TEXT NOT NULL DEFAULT 'ready',
      status_message TEXT,
      reachable_at INTEGER,
      provider_metadata_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(project_id, file_name, provider_id),
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_deployments_project
      ON deployments(project_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS game_world (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT,
      description TEXT,
      tags_json TEXT,
      data_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS faction (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT,
      description TEXT,
      tags_json TEXT,
      data_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS enemy_type (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT,
      description TEXT,
      tags_json TEXT,
      data_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS item_rarity (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT,
      description TEXT,
      tags_json TEXT,
      data_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS skill_tree (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT,
      description TEXT,
      tags_json TEXT,
      data_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS progression_curve (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT,
      description TEXT,
      tags_json TEXT,
      data_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS quest_arc (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT,
      description TEXT,
      tags_json TEXT,
      data_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS gameplay_loop (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT,
      description TEXT,
      tags_json TEXT,
      data_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS biome (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT,
      description TEXT,
      tags_json TEXT,
      data_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS combat_style (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT,
      description TEXT,
      tags_json TEXT,
      data_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS character_class (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT,
      description TEXT,
      tags_json TEXT,
      data_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS crafting_recipe (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT,
      description TEXT,
      tags_json TEXT,
      data_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS loot_table (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT,
      description TEXT,
      tags_json TEXT,
      data_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS weapon_system (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT,
      description TEXT,
      tags_json TEXT,
      data_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mission_flow (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT,
      description TEXT,
      tags_json TEXT,
      data_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS dungeon_layout (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT,
      description TEXT,
      tags_json TEXT,
      data_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS dialogue_branch (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT,
      description TEXT,
      tags_json TEXT,
      data_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS boss_phase (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT,
      description TEXT,
      tags_json TEXT,
      data_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS economy_system (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT,
      description TEXT,
      tags_json TEXT,
      data_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS multiplayer_mode (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT,
      description TEXT,
      tags_json TEXT,
      data_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_game_world_project ON game_world(project_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_faction_project ON faction(project_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_enemy_type_project ON enemy_type(project_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_item_rarity_project ON item_rarity(project_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_skill_tree_project ON skill_tree(project_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_progression_curve_project ON progression_curve(project_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_quest_arc_project ON quest_arc(project_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_gameplay_loop_project ON gameplay_loop(project_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_biome_project ON biome(project_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_combat_style_project ON combat_style(project_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_character_class_project ON character_class(project_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_crafting_recipe_project ON crafting_recipe(project_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_loot_table_project ON loot_table(project_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_weapon_system_project ON weapon_system(project_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_mission_flow_project ON mission_flow(project_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_dungeon_layout_project ON dungeon_layout(project_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_dialogue_branch_project ON dialogue_branch(project_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_boss_phase_project ON boss_phase(project_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_economy_system_project ON economy_system(project_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_multiplayer_mode_project ON multiplayer_mode(project_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS routines (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      prompt TEXT NOT NULL,
      schedule_kind TEXT NOT NULL,
      schedule_value TEXT NOT NULL,
      schedule_json TEXT,
      project_mode TEXT NOT NULL,
      project_id TEXT,
      skill_id TEXT,
      agent_id TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS routine_runs (
      id TEXT PRIMARY KEY,
      routine_id TEXT NOT NULL,
      trigger TEXT NOT NULL,
      status TEXT NOT NULL,
      project_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      agent_run_id TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      summary TEXT,
      error TEXT,
      FOREIGN KEY(routine_id) REFERENCES routines(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_routine_runs_routine
      ON routine_runs(routine_id, started_at DESC);

    CREATE TABLE IF NOT EXISTS game_entities (
      id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN (${GAME_ENTITY_TYPE_SQL})),
      name TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(project_id, id),
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_game_entities_project_type
      ON game_entities(project_id, type, name);

    CREATE TABLE IF NOT EXISTS game_entity_links (
      id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      from_entity_id TEXT NOT NULL,
      to_entity_id TEXT NOT NULL,
      relationship TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(project_id, id),
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY(project_id, from_entity_id) REFERENCES game_entities(project_id, id) ON DELETE CASCADE,
      FOREIGN KEY(project_id, to_entity_id) REFERENCES game_entities(project_id, id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_game_entity_links_project
      ON game_entity_links(project_id, from_entity_id, to_entity_id);
  `);
  migrateGameEntityTypeConstraint(db);
  // Forward-compatible column add for databases created before metadata_json.
  // SQLite has no IF NOT EXISTS for ALTER, so we check pragma_table_info.
  const cols = db.prepare(`PRAGMA table_info(projects)`).all() as DbRow[];
  const hasGameArtBibleId = cols.some((c: DbRow) => c.name === 'game_art_bible_id');
  const hasLegacyArtBibleId = cols.some((c: DbRow) => c.name === LEGACY_ART_BIBLE_COLUMN);
  if (!hasGameArtBibleId) {
    db.exec(`ALTER TABLE projects ADD COLUMN game_art_bible_id TEXT`);
  }
  if (hasLegacyArtBibleId) {
    db.exec(`
      UPDATE projects
         SET game_art_bible_id = ${LEGACY_ART_BIBLE_COLUMN}
       WHERE game_art_bible_id IS NULL
         AND ${LEGACY_ART_BIBLE_COLUMN} IS NOT NULL
    `);
  }
  if (!cols.some((c: DbRow) => c.name === 'metadata_json')) {
    db.exec(`ALTER TABLE projects ADD COLUMN metadata_json TEXT`);
  }
  const messageCols = db.prepare(`PRAGMA table_info(messages)`).all() as DbRow[];
  if (!messageCols.some((c: DbRow) => c.name === 'agent_id')) {
    db.exec(`ALTER TABLE messages ADD COLUMN agent_id TEXT`);
  }
  if (!messageCols.some((c: DbRow) => c.name === 'agent_name')) {
    db.exec(`ALTER TABLE messages ADD COLUMN agent_name TEXT`);
  }
  if (!messageCols.some((c: DbRow) => c.name === 'run_id')) {
    db.exec(`ALTER TABLE messages ADD COLUMN run_id TEXT`);
  }
  if (!messageCols.some((c: DbRow) => c.name === 'run_status')) {
    db.exec(`ALTER TABLE messages ADD COLUMN run_status TEXT`);
  }
  if (!messageCols.some((c: DbRow) => c.name === 'last_run_event_id')) {
    db.exec(`ALTER TABLE messages ADD COLUMN last_run_event_id TEXT`);
  }
  if (!messageCols.some((c: DbRow) => c.name === 'comment_attachments_json')) {
    db.exec(`ALTER TABLE messages ADD COLUMN comment_attachments_json TEXT`);
  }

  const previewCommentCols = db.prepare(`PRAGMA table_info(preview_comments)`).all() as DbRow[];
  if (!previewCommentCols.some((c: DbRow) => c.name === 'selection_kind')) {
    db.exec(`ALTER TABLE preview_comments ADD COLUMN selection_kind TEXT`);
  }
  if (!previewCommentCols.some((c: DbRow) => c.name === 'member_count')) {
    db.exec(`ALTER TABLE preview_comments ADD COLUMN member_count INTEGER`);
  }
  if (!previewCommentCols.some((c: DbRow) => c.name === 'pod_members_json')) {
    db.exec(`ALTER TABLE preview_comments ADD COLUMN pod_members_json TEXT`);
  }
  if (!previewCommentCols.some((c: DbRow) => c.name === 'thread_json')) {
    db.exec(`ALTER TABLE preview_comments ADD COLUMN thread_json TEXT`);
  }
  if (!previewCommentCols.some((c: DbRow) => c.name === 'anchor_json')) {
    db.exec(`ALTER TABLE preview_comments ADD COLUMN anchor_json TEXT`);
  }
  const deploymentCols = db.prepare(`PRAGMA table_info(deployments)`).all() as DbRow[];
  if (!deploymentCols.some((c: DbRow) => c.name === 'status')) {
    db.exec(`ALTER TABLE deployments ADD COLUMN status TEXT NOT NULL DEFAULT 'ready'`);
  }
  if (!deploymentCols.some((c: DbRow) => c.name === 'status_message')) {
    db.exec(`ALTER TABLE deployments ADD COLUMN status_message TEXT`);
  }
  if (!deploymentCols.some((c: DbRow) => c.name === 'reachable_at')) {
    db.exec(`ALTER TABLE deployments ADD COLUMN reachable_at INTEGER`);
  }
  if (!deploymentCols.some((c: DbRow) => c.name === 'provider_metadata_json')) {
    db.exec(`ALTER TABLE deployments ADD COLUMN provider_metadata_json TEXT`);
  }
  // schedule_json holds the full RoutineSchedule object (kind discriminator
  // plus kind-specific fields like time/timezone/weekday). The legacy
  // schedule_kind/schedule_value columns are kept populated for query
  // convenience and as a fallback when reading rows written before this
  // column existed.
  const routineCols = db.prepare(`PRAGMA table_info(routines)`).all() as DbRow[];
  if (routineCols.length > 0 && !routineCols.some((c: DbRow) => c.name === 'schedule_json')) {
    db.exec(`ALTER TABLE routines ADD COLUMN schedule_json TEXT`);
  }
  migrateCritique(db);
  migrateMediaTasks(db);
}

// ---------- deployments ----------

const DEPLOYMENT_COLS = `id, project_id AS projectId, file_name AS fileName,
  provider_id AS providerId, url, deployment_id AS deploymentId,
  deployment_count AS deploymentCount, target, status,
  status_message AS statusMessage, reachable_at AS reachableAt,
  provider_metadata_json AS providerMetadataJson,
  created_at AS createdAt, updated_at AS updatedAt`;

export function listDeployments(db: SqliteDb, projectId: string) {
  return (db
    .prepare(
      `SELECT ${DEPLOYMENT_COLS}
         FROM deployments
        WHERE project_id = ?
        ORDER BY updated_at DESC`,
    )
    .all(projectId) as DbRow[])
    .map(normalizeDeployment);
}

export function getDeployment(db: SqliteDb, projectId: string, fileName: string, providerId: string) {
  const row = db
    .prepare(
      `SELECT ${DEPLOYMENT_COLS}
         FROM deployments
        WHERE project_id = ? AND file_name = ? AND provider_id = ?`,
    )
    .get(projectId, fileName, providerId) as DbRow | undefined;
  return row ? normalizeDeployment(row) : null;
}

export function getDeploymentById(db: SqliteDb, projectId: string, id: string) {
  const row = db
    .prepare(
      `SELECT ${DEPLOYMENT_COLS}
         FROM deployments
        WHERE project_id = ? AND id = ?`,
    )
    .get(projectId, id) as DbRow | undefined;
  return row ? normalizeDeployment(row) : null;
}

export function upsertDeployment(db: SqliteDb, deployment: DbRow) {
  const existing = getDeployment(
    db,
    deployment.projectId,
    deployment.fileName,
    deployment.providerId,
  );
  const now = Date.now();
  const inputProviderMetadata =
    deployment.providerMetadata === undefined
      ? existing?.providerMetadata
      : deployment.providerMetadata;
  const providerMetadata =
    deployment.cloudflarePages && typeof deployment.cloudflarePages === 'object'
      ? {
          ...(inputProviderMetadata && typeof inputProviderMetadata === 'object' && !Array.isArray(inputProviderMetadata)
            ? inputProviderMetadata
            : {}),
          cloudflarePages: deployment.cloudflarePages,
        }
      : inputProviderMetadata;
  const next = {
    id: existing?.id ?? deployment.id,
    projectId: deployment.projectId,
    fileName: deployment.fileName,
    providerId: deployment.providerId,
    url: deployment.url,
    deploymentId: deployment.deploymentId ?? null,
    deploymentCount:
      typeof deployment.deploymentCount === 'number'
        ? deployment.deploymentCount
        : (existing?.deploymentCount ?? 0) + 1,
    target: deployment.target ?? 'preview',
    status: deployment.status ?? existing?.status ?? 'ready',
    statusMessage: deployment.statusMessage ?? null,
    reachableAt: deployment.reachableAt ?? null,
    providerMetadata,
    createdAt: existing?.createdAt ?? deployment.createdAt ?? now,
    updatedAt: deployment.updatedAt ?? now,
  };
  const providerMetadataJson = stringifyJsonObjectOrNull(next.providerMetadata);
  db.prepare(
    `INSERT INTO deployments
       (id, project_id, file_name, provider_id, url, deployment_id,
        deployment_count, target, status, status_message, reachable_at,
        provider_metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(project_id, file_name, provider_id) DO UPDATE SET
       url = excluded.url,
       deployment_id = excluded.deployment_id,
       deployment_count = excluded.deployment_count,
       target = excluded.target,
       status = excluded.status,
       status_message = excluded.status_message,
       reachable_at = excluded.reachable_at,
       provider_metadata_json = excluded.provider_metadata_json,
       updated_at = excluded.updated_at`,
  ).run(
    next.id,
    next.projectId,
    next.fileName,
    next.providerId,
    next.url,
    next.deploymentId,
    next.deploymentCount,
    next.target,
    next.status,
    next.statusMessage,
    next.reachableAt,
    providerMetadataJson,
    next.createdAt,
    next.updatedAt,
  );
  return getDeployment(db, next.projectId, next.fileName, next.providerId);
}

function normalizeDeployment(row: DbRow) {
  const providerMetadata = parseJsonOrUndef(row.providerMetadataJson);
  const normalizedProviderMetadata =
    providerMetadata && typeof providerMetadata === 'object' && !Array.isArray(providerMetadata)
      ? providerMetadata
      : undefined;
  return {
    id: row.id,
    projectId: row.projectId,
    fileName: row.fileName,
    providerId: row.providerId,
    url: row.url,
    deploymentId: row.deploymentId ?? undefined,
    deploymentCount: Number(row.deploymentCount ?? 1),
    target: 'preview',
    status: row.status || 'ready',
    statusMessage: row.statusMessage ?? undefined,
    reachableAt: row.reachableAt == null ? undefined : Number(row.reachableAt),
    cloudflarePages:
      normalizedProviderMetadata?.cloudflarePages &&
      typeof normalizedProviderMetadata.cloudflarePages === 'object' &&
      !Array.isArray(normalizedProviderMetadata.cloudflarePages)
        ? normalizedProviderMetadata.cloudflarePages
        : undefined,
    providerMetadata: normalizedProviderMetadata,
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
  };
}

function stringifyJsonObjectOrNull(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return Object.keys(value).length > 0 ? JSON.stringify(value) : null;
}

// ---------- projects ----------

const PROJECT_COLS = `id, name, skill_id AS skillId,
  game_art_bible_id AS gameArtBibleId,
  pending_prompt AS pendingPrompt,
  metadata_json AS metadataJson,
  created_at AS createdAt,
  updated_at AS updatedAt`;

export function listProjects(db: SqliteDb) {
  const rows = db
    .prepare(
      `SELECT ${PROJECT_COLS}
         FROM projects
        ORDER BY updated_at DESC`,
    )
    .all() as DbRow[];
  return rows.map(normalizeProject);
}

export function listLatestProjectRunStatuses(db: SqliteDb) {
  const rows = db
    .prepare(
      `SELECT c.project_id AS projectId,
              m.run_id AS runId,
              m.run_status AS status,
              COALESCE(m.ended_at, m.started_at, m.created_at) AS updatedAt
         FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
        WHERE m.run_status IS NOT NULL
        ORDER BY updatedAt DESC`,
    )
    .all() as DbRow[];
  const latestByProject = new Map<string, DbRow>();
  for (const row of rows) {
    if (!latestByProject.has(row.projectId)) {
      latestByProject.set(row.projectId, {
        value: normalizeProjectRunStatus(row.status),
        updatedAt: Number(row.updatedAt),
        runId: row.runId ?? undefined,
      });
    }
  }
  return latestByProject;
}

export function listProjectsAwaitingInput(db: SqliteDb) {
  const rows = db
    .prepare(
      `SELECT latest.projectId
         FROM (
           SELECT c.project_id AS projectId,
                  m.conversation_id AS conversationId,
                  m.created_at AS createdAt,
                  m.position AS position,
                  ROW_NUMBER() OVER (
                    PARTITION BY c.project_id
                    ORDER BY m.created_at DESC, m.position DESC
                  ) AS rowNum
             FROM messages m
             JOIN conversations c ON c.id = m.conversation_id
            WHERE m.role = 'assistant'
              AND LOWER(m.content) LIKE '%<question-form%'
         ) latest
        WHERE latest.rowNum = 1
          AND NOT EXISTS (
            SELECT 1
              FROM messages reply
             WHERE reply.conversation_id = latest.conversationId
               AND reply.role = 'user'
               AND (
                 reply.created_at > latest.createdAt
                 OR (reply.created_at = latest.createdAt AND reply.position > latest.position)
               )
          )`,
    )
    .all() as DbRow[];
  return new Set((rows as DbRow[]).map((row: DbRow) => row.projectId));
}

export function getProject(db: SqliteDb, id: string) {
  const row = db
    .prepare(`SELECT ${PROJECT_COLS} FROM projects WHERE id = ?`)
    .get(id) as DbRow | undefined;
  return row ? normalizeProject(row) : null;
}

export function insertProject(db: SqliteDb, p: DbRow) {
  db.prepare(
    `INSERT INTO projects
       (id, name, skill_id, game_art_bible_id, pending_prompt,
        metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    p.id,
    p.name,
    p.skillId ?? null,
    p.gameArtBibleId ?? null,
    p.pendingPrompt ?? null,
    p.metadata ? JSON.stringify(p.metadata) : null,
    p.createdAt,
    p.updatedAt,
  );
  return getProject(db, p.id);
}

export function updateProject(db: SqliteDb, id: string, patch: DbRow) {
  const existing = getProject(db, id);
  if (!existing) return null;
  const patchHasGameArtBible = Object.prototype.hasOwnProperty.call(patch, 'gameArtBibleId');
  const gameArtBibleId = patchHasGameArtBible
    ? patch.gameArtBibleId ?? null
    : existing.gameArtBibleId ?? null;
  const merged = {
    ...existing,
    ...patch,
    gameArtBibleId,
    updatedAt: typeof patch.updatedAt === 'number' ? patch.updatedAt : Date.now(),
  };
  db.prepare(
    `UPDATE projects
        SET name = ?,
            skill_id = ?,
            game_art_bible_id = ?,
            pending_prompt = ?,
            metadata_json = ?,
            updated_at = ?
      WHERE id = ?`,
  ).run(
    merged.name,
    merged.skillId ?? null,
    merged.gameArtBibleId ?? null,
    merged.pendingPrompt ?? null,
    merged.metadata ? JSON.stringify(merged.metadata) : null,
    merged.updatedAt,
    id,
  );
  return getProject(db, id);
}

export function deleteProject(db: SqliteDb, id: string) {
  db.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
}

function normalizeProject(row: DbRow) {
  let metadata;
  if (row.metadataJson) {
    try {
      metadata = JSON.parse(row.metadataJson);
    } catch {
      metadata = undefined;
    }
  }
  return {
    id: row.id,
    name: row.name,
    gameSkillId: row.skillId,
    gameArtBibleId: row.gameArtBibleId,
    skillId: row.skillId,
    pendingPrompt: row.pendingPrompt ?? undefined,
    metadata,
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
  };
}

function normalizeProjectRunStatus(status: unknown) {
  if (status === 'starting') return 'running';
  if (status === 'cancelled') return 'canceled';
  if (
    status === 'queued' ||
    status === 'running' ||
    status === 'succeeded' ||
    status === 'failed' ||
    status === 'canceled'
  ) {
    return status;
  }
  return 'not_started';
}

// ---------- game memory ----------

const GAME_ENTITY_COLS = `id, project_id AS projectId, type, name, summary,
  payload_json AS payloadJson, created_at AS createdAt, updated_at AS updatedAt`;

const GAME_ENTITY_LINK_COLS = `id, project_id AS projectId,
  from_entity_id AS fromEntityId, to_entity_id AS toEntityId,
  relationship, payload_json AS payloadJson,
  created_at AS createdAt, updated_at AS updatedAt`;

export function listGameEntities(
  db: SqliteDb,
  projectId: string,
  filter: { type?: string } = {},
) {
  const hasType = typeof filter.type === 'string' && filter.type.length > 0;
  const rows = db
    .prepare(
      `SELECT ${GAME_ENTITY_COLS}
         FROM game_entities
        WHERE project_id = ?
          ${hasType ? 'AND type = ?' : ''}
        ORDER BY type ASC, name ASC, updated_at DESC`,
    )
    .all(...(hasType ? [projectId, filter.type] : [projectId])) as DbRow[];
  return rows.map(normalizeGameEntity);
}

export function listGameEntityLinks(db: SqliteDb, projectId: string) {
  const rows = db
    .prepare(
      `SELECT ${GAME_ENTITY_LINK_COLS}
         FROM game_entity_links
        WHERE project_id = ?
        ORDER BY relationship ASC, updated_at DESC`,
    )
    .all(projectId) as DbRow[];
  return rows.map(normalizeGameEntityLink);
}

export function upsertGameEntity(db: SqliteDb, input: DbRow) {
  const now =
    typeof input.updatedAt === 'number' && Number.isFinite(input.updatedAt)
      ? input.updatedAt
      : Date.now();
  const createdAt =
    typeof input.createdAt === 'number' && Number.isFinite(input.createdAt)
      ? input.createdAt
      : now;
  const payloadJson = stringifyGameMemoryPayload(input.payload);
  db.prepare(
    `INSERT INTO game_entities
       (id, project_id, type, name, summary, payload_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(project_id, id) DO UPDATE SET
       type = excluded.type,
       name = excluded.name,
       summary = excluded.summary,
       payload_json = excluded.payload_json,
       updated_at = excluded.updated_at`,
  ).run(
    input.id,
    input.projectId,
    input.type,
    input.name,
    input.summary ?? '',
    payloadJson,
    createdAt,
    now,
  );
  const row = db
    .prepare(`SELECT ${GAME_ENTITY_COLS} FROM game_entities WHERE id = ? AND project_id = ?`)
    .get(input.id, input.projectId) as DbRow | undefined;
  return row ? normalizeGameEntity(row) : null;
}

export function deleteGameEntity(db: SqliteDb, projectId: string, id: string): boolean {
  const result = db
    .prepare(`DELETE FROM game_entities WHERE project_id = ? AND id = ?`)
    .run(projectId, id);
  return result.changes > 0;
}

export function upsertGameEntityLink(db: SqliteDb, input: DbRow) {
  const now =
    typeof input.updatedAt === 'number' && Number.isFinite(input.updatedAt)
      ? input.updatedAt
      : Date.now();
  const createdAt =
    typeof input.createdAt === 'number' && Number.isFinite(input.createdAt)
      ? input.createdAt
      : now;
  const payloadJson = stringifyGameMemoryPayload(input.payload);
  db.prepare(
    `INSERT INTO game_entity_links
       (id, project_id, from_entity_id, to_entity_id, relationship,
        payload_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(project_id, id) DO UPDATE SET
       from_entity_id = excluded.from_entity_id,
       to_entity_id = excluded.to_entity_id,
       relationship = excluded.relationship,
       payload_json = excluded.payload_json,
       updated_at = excluded.updated_at`,
  ).run(
    input.id,
    input.projectId,
    input.fromEntityId,
    input.toEntityId,
    input.relationship,
    payloadJson,
    createdAt,
    now,
  );
  const row = db
    .prepare(`SELECT ${GAME_ENTITY_LINK_COLS} FROM game_entity_links WHERE id = ? AND project_id = ?`)
    .get(input.id, input.projectId) as DbRow | undefined;
  return row ? normalizeGameEntityLink(row) : null;
}

function stringifyGameMemoryPayload(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '{}';
  return JSON.stringify(value);
}

function normalizeGameEntity(row: DbRow) {
  const payload = parseJsonOrUndef(row.payloadJson);
  return {
    id: row.id,
    projectId: row.projectId,
    type: row.type,
    name: row.name,
    summary: row.summary ?? '',
    payload: payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {},
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
  };
}

function normalizeGameEntityLink(row: DbRow) {
  const payload = parseJsonOrUndef(row.payloadJson);
  return {
    id: row.id,
    projectId: row.projectId,
    fromEntityId: row.fromEntityId,
    toEntityId: row.toEntityId,
    relationship: row.relationship,
    payload: payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {},
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
  };
}

// ---------- templates ----------

export function listTemplates(db: SqliteDb) {
  return (db
    .prepare(
      `SELECT id, name, description, source_project_id AS sourceProjectId,
              files_json AS filesJson, created_at AS createdAt
         FROM templates
        ORDER BY created_at DESC`,
    )
    .all() as DbRow[])
    .map(normalizeTemplate);
}

export function getTemplate(db: SqliteDb, id: string) {
  const row = db
    .prepare(
      `SELECT id, name, description, source_project_id AS sourceProjectId,
              files_json AS filesJson, created_at AS createdAt
         FROM templates WHERE id = ?`,
    )
    .get(id) as DbRow | undefined;
  return row ? normalizeTemplate(row) : null;
}

export function insertTemplate(db: SqliteDb, t: DbRow) {
  db.prepare(
    `INSERT INTO templates (id, name, description, source_project_id, files_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    t.id,
    t.name,
    t.description ?? null,
    t.sourceProjectId ?? null,
    JSON.stringify(t.files ?? []),
    t.createdAt,
  );
  return getTemplate(db, t.id);
}

export function deleteTemplate(db: SqliteDb, id: string) {
  db.prepare(`DELETE FROM templates WHERE id = ?`).run(id);
}

function normalizeTemplate(row: DbRow) {
  let files = [];
  try {
    files = JSON.parse(row.filesJson || '[]');
  } catch {
    files = [];
  }
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    sourceProjectId: row.sourceProjectId ?? undefined,
    files,
    createdAt: Number(row.createdAt),
  };
}

// ---------- conversations ----------

export function listConversations(db: SqliteDb, projectId: string) {
  return (db
    .prepare(
      `SELECT id, project_id AS projectId, title,
              created_at AS createdAt, updated_at AS updatedAt
         FROM conversations
        WHERE project_id = ?
        ORDER BY updated_at DESC`,
    )
    .all(projectId) as DbRow[])
    .map((r: DbRow) => ({
      id: r.id,
      projectId: r.projectId,
      title: r.title ?? null,
      createdAt: Number(r.createdAt),
      updatedAt: Number(r.updatedAt),
    }));
}

export function getConversation(db: SqliteDb, id: string) {
  const r = db
    .prepare(
      `SELECT id, project_id AS projectId, title,
              created_at AS createdAt, updated_at AS updatedAt
         FROM conversations WHERE id = ?`,
    )
    .get(id) as DbRow | undefined;
  if (!r) return null;
  return {
    id: r.id,
    projectId: r.projectId,
    title: r.title ?? null,
    createdAt: Number(r.createdAt),
    updatedAt: Number(r.updatedAt),
  };
}

export function insertConversation(db: SqliteDb, c: DbRow) {
  db.prepare(
    `INSERT INTO conversations
       (id, project_id, title, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(c.id, c.projectId, c.title ?? null, c.createdAt, c.updatedAt);
  return getConversation(db, c.id);
}

export function updateConversation(db: SqliteDb, id: string, patch: DbRow) {
  const existing = getConversation(db, id);
  if (!existing) return null;
  const merged = {
    ...existing,
    ...patch,
    updatedAt: typeof patch.updatedAt === 'number' ? patch.updatedAt : Date.now(),
  };
  db.prepare(
    `UPDATE conversations
        SET title = ?, updated_at = ? WHERE id = ?`,
  ).run(merged.title ?? null, merged.updatedAt, id);
  return getConversation(db, id);
}

export function deleteConversation(db: SqliteDb, id: string) {
  db.prepare(`DELETE FROM conversations WHERE id = ?`).run(id);
}

// ---------- messages ----------

export function listMessages(db: SqliteDb, conversationId: string) {
  return (db
    .prepare(
      `SELECT id, role, content, agent_id AS agentId, agent_name AS agentName,
              run_id AS runId, run_status AS runStatus,
              last_run_event_id AS lastRunEventId,
              events_json AS eventsJson,
              attachments_json AS attachmentsJson,
              comment_attachments_json AS commentAttachmentsJson,
              produced_files_json AS producedFilesJson,
              created_at AS createdAt, started_at AS startedAt, ended_at AS endedAt,
              position
         FROM messages
        WHERE conversation_id = ?
        ORDER BY position ASC`,
    )
    .all(conversationId) as DbRow[])
    .map(normalizeMessage);
}

export function upsertMessage(db: SqliteDb, conversationId: string, m: DbRow) {
  const existing = db
    .prepare(`SELECT position FROM messages WHERE id = ?`)
    .get(m.id) as DbRow | undefined;
  const now = Date.now();
  if (existing) {
    db.prepare(
      `UPDATE messages
          SET role = ?, content = ?, agent_id = ?, agent_name = ?,
              run_id = ?, run_status = ?, last_run_event_id = ?,
              events_json = ?, attachments_json = ?, comment_attachments_json = ?,
              produced_files_json = ?, started_at = ?, ended_at = ?
        WHERE id = ?`,
    ).run(
      m.role,
      m.content,
      m.agentId ?? null,
      m.agentName ?? null,
      m.runId ?? null,
      m.runStatus ?? null,
      m.lastRunEventId ?? null,
      m.events ? JSON.stringify(m.events) : null,
      m.attachments ? JSON.stringify(m.attachments) : null,
      m.commentAttachments ? JSON.stringify(m.commentAttachments) : null,
      m.producedFiles ? JSON.stringify(m.producedFiles) : null,
      m.startedAt ?? null,
      m.endedAt ?? null,
      m.id,
    );
  } else {
    const max = db
      .prepare(
        `SELECT COALESCE(MAX(position), -1) AS m FROM messages WHERE conversation_id = ?`,
      )
      .get(conversationId) as DbRow | undefined;
    const position = (max?.m ?? -1) + 1;
    // 17 values: id, conversation_id, role, content, agent_id, agent_name,
    // run_id, run_status, last_run_event_id, events_json, attachments_json,
    // comment_attachments_json, produced_files_json, started_at, ended_at,
    // position, created_at.
    db.prepare(
      `INSERT INTO messages
         (id, conversation_id, role, content, agent_id, agent_name,
          run_id, run_status, last_run_event_id, events_json,
          attachments_json, comment_attachments_json, produced_files_json,
          started_at, ended_at, position, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      m.id,
      conversationId,
      m.role,
      m.content,
      m.agentId ?? null,
      m.agentName ?? null,
      m.runId ?? null,
      m.runStatus ?? null,
      m.lastRunEventId ?? null,
      m.events ? JSON.stringify(m.events) : null,
      m.attachments ? JSON.stringify(m.attachments) : null,
      m.commentAttachments ? JSON.stringify(m.commentAttachments) : null,
      m.producedFiles ? JSON.stringify(m.producedFiles) : null,
      m.startedAt ?? null,
      m.endedAt ?? null,
      position,
      now,
    );
  }
  // Bump conversation activity so the sidebar's recency sort works.
  db.prepare(`UPDATE conversations SET updated_at = ? WHERE id = ?`).run(
    now,
    conversationId,
  );
  const row = db
    .prepare(
      `SELECT id, role, content, agent_id AS agentId, agent_name AS agentName,
              run_id AS runId, run_status AS runStatus,
              last_run_event_id AS lastRunEventId,
              events_json AS eventsJson,
              attachments_json AS attachmentsJson,
              comment_attachments_json AS commentAttachmentsJson,
              produced_files_json AS producedFilesJson,
              created_at AS createdAt, started_at AS startedAt, ended_at AS endedAt,
              position
         FROM messages WHERE id = ?`,
    )
    .get(m.id) as DbRow | undefined;
  return row ? normalizeMessage(row) : null;
}

export function deleteMessage(db: SqliteDb, id: string) {
  db.prepare(`DELETE FROM messages WHERE id = ?`).run(id);
}

// ---------- preview comments ----------

const PREVIEW_COMMENT_STATUSES = new Set([
  'open',
  'attached',
  'applying',
  'needs_review',
  'resolved',
  'failed',
]);

export function listPreviewComments(db: SqliteDb, projectId: string, conversationId: string) {
  return (db
    .prepare(
      `SELECT id, project_id AS projectId, conversation_id AS conversationId,
              file_path AS filePath, element_id AS elementId, selector, label,
              text, position_json AS positionJson, html_hint AS htmlHint,
              anchor_json AS anchorJson,
              selection_kind AS selectionKind, member_count AS memberCount,
              pod_members_json AS podMembersJson,
              thread_json AS threadJson,
              note, status, created_at AS createdAt, updated_at AS updatedAt
         FROM preview_comments
        WHERE project_id = ? AND conversation_id = ?
        ORDER BY updated_at DESC`,
    )
    .all(projectId, conversationId) as DbRow[])
    .map(normalizePreviewComment);
}

export function upsertPreviewComment(db: SqliteDb, projectId: string, conversationId: string, input: DbRow) {
  const target = input?.target ?? {};
  const note = typeof input?.note === 'string' ? input.note.trim() : '';
  if (!note) throw new Error('comment note required');
  const filePath = cleanRequiredString(target.filePath, 'filePath');
  const elementId = cleanRequiredString(target.elementId, 'elementId');
  const selector = cleanRequiredString(target.selector, 'selector');
  const label = cleanRequiredString(target.label, 'label');
  const text = typeof target.text === 'string' ? compactWhitespace(target.text).slice(0, 160) : '';
  const htmlHint = typeof target.htmlHint === 'string' ? compactWhitespace(target.htmlHint).slice(0, 180) : '';
  const position = normalizePosition(target.position);
  const anchor = normalizePreviewCommentAnchor(target.anchor, selector, position);
  const selectionKind = target.selectionKind === 'pod' ? 'pod' : 'element';
  const podMembers = selectionKind === 'pod' ? normalizePodMembers(target.podMembers) : [];
  const memberCount = selectionKind === 'pod'
    ? (podMembers.length > 0
        ? podMembers.length
        : Number.isFinite(target.memberCount)
          ? Math.max(0, Math.round(target.memberCount))
          : 0)
    : 0;
  const now = Date.now();
  const existing = db
    .prepare(
      `SELECT id, created_at AS createdAt
              , note, thread_json AS threadJson
         FROM preview_comments
        WHERE project_id = ? AND conversation_id = ? AND file_path = ? AND element_id = ?`,
    )
    .get(projectId, conversationId, filePath, elementId) as DbRow | undefined;
  const id = existing?.id ?? randomCommentId();
  const createdAt = existing?.createdAt ?? now;
  const thread = withPrimaryPreviewCommentThread(
    normalizePreviewCommentThread(
      Array.isArray(input?.thread) ? input.thread : parseJsonOrUndef(existing?.threadJson),
      existing?.note,
      createdAt,
      'open',
    ),
    note,
    createdAt,
    'open',
  );
  db.prepare(
    `INSERT INTO preview_comments
       (id, project_id, conversation_id, file_path, element_id, selector, label,
        text, position_json, html_hint, anchor_json, selection_kind, member_count, pod_members_json,
        note, thread_json, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(project_id, conversation_id, file_path, element_id) DO UPDATE SET
       selector = excluded.selector,
       label = excluded.label,
       text = excluded.text,
       position_json = excluded.position_json,
       html_hint = excluded.html_hint,
       anchor_json = excluded.anchor_json,
       selection_kind = excluded.selection_kind,
       member_count = excluded.member_count,
       pod_members_json = excluded.pod_members_json,
       note = excluded.note,
       thread_json = excluded.thread_json,
       status = 'open',
       updated_at = excluded.updated_at`,
  ).run(
    id,
    projectId,
    conversationId,
    filePath,
    elementId,
    selector,
    label,
    text,
    JSON.stringify(position),
    htmlHint,
    JSON.stringify(anchor),
    selectionKind,
    selectionKind === 'pod' ? memberCount : null,
    selectionKind === 'pod' ? JSON.stringify(podMembers) : null,
    note,
    JSON.stringify(thread),
    'open',
    createdAt,
    now,
  );
  return getPreviewComment(db, projectId, conversationId, id);
}

export function updatePreviewCommentStatus(db: SqliteDb, projectId: string, conversationId: string, id: string, status: string) {
  if (!PREVIEW_COMMENT_STATUSES.has(status)) throw new Error('invalid comment status');
  const now = Date.now();
  db.prepare(
    `UPDATE preview_comments
        SET status = ?,
            thread_json = ?,
            updated_at = ?
      WHERE id = ? AND project_id = ? AND conversation_id = ?`,
  ).run(
    status,
    JSON.stringify(withResolvedPreviewCommentThread(existingPreviewCommentThread(db, projectId, conversationId, id), status)),
    now,
    id,
    projectId,
    conversationId,
  );
  return getPreviewComment(db, projectId, conversationId, id);
}

export function appendPreviewCommentReply(db: SqliteDb, projectId: string, conversationId: string, id: string, input: DbRow) {
  const body = typeof input?.body === 'string' ? compactWhitespace(input.body).slice(0, 1000) : '';
  if (!body) throw new Error('reply body required');
  const authorId = typeof input?.authorId === 'string' && input.authorId.trim()
    ? input.authorId.trim().slice(0, 120)
    : 'designer';
  const existing = getPreviewComment(db, projectId, conversationId, id);
  if (!existing) return null;
  const now = Date.now();
  const thread = normalizePreviewCommentThread(existing.thread, existing.note, existing.createdAt, existing.status);
  thread.push({ authorId, body, createdAt: now });
  db.prepare(
    `UPDATE preview_comments
        SET thread_json = ?, updated_at = ?
      WHERE id = ? AND project_id = ? AND conversation_id = ?`,
  ).run(JSON.stringify(thread), now, id, projectId, conversationId);
  return getPreviewComment(db, projectId, conversationId, id);
}

export function deletePreviewComment(db: SqliteDb, projectId: string, conversationId: string, id: string) {
  const result = db
    .prepare(
      `DELETE FROM preview_comments
        WHERE id = ? AND project_id = ? AND conversation_id = ?`,
    )
    .run(id, projectId, conversationId);
  return result.changes > 0;
}

function getPreviewComment(db: SqliteDb, projectId: string, conversationId: string, id: string) {
  const row = db
    .prepare(
      `SELECT id, project_id AS projectId, conversation_id AS conversationId,
              file_path AS filePath, element_id AS elementId, selector, label,
              text, position_json AS positionJson, html_hint AS htmlHint,
              anchor_json AS anchorJson,
              selection_kind AS selectionKind, member_count AS memberCount,
              pod_members_json AS podMembersJson,
              thread_json AS threadJson,
              note, status, created_at AS createdAt, updated_at AS updatedAt
         FROM preview_comments
        WHERE id = ? AND project_id = ? AND conversation_id = ?`,
    )
    .get(id, projectId, conversationId) as DbRow | undefined;
  return row ? normalizePreviewComment(row) : null;
}

function normalizePreviewComment(row: DbRow) {
  const podMembers = parseJsonOrUndef(row.podMembersJson);
  const normalizedPodMembers = Array.isArray(podMembers) ? podMembers : undefined;
  const position = parseJsonOrUndef(row.positionJson) ?? { x: 0, y: 0, width: 0, height: 0 };
  const thread = normalizePreviewCommentThread(parseJsonOrUndef(row.threadJson), row.note, row.createdAt, row.status);
  return {
    id: row.id,
    projectId: row.projectId,
    conversationId: row.conversationId,
    filePath: row.filePath,
    elementId: row.elementId,
    selector: row.selector,
    label: row.label,
    text: row.text,
    position,
    htmlHint: row.htmlHint,
    anchor: normalizePreviewCommentAnchor(parseJsonOrUndef(row.anchorJson), row.selector, position),
    selectionKind: row.selectionKind === 'pod' ? 'pod' : 'element',
    memberCount:
      normalizedPodMembers && normalizedPodMembers.length > 0
        ? normalizedPodMembers.length
        : Number.isFinite(row.memberCount)
          ? row.memberCount
          : undefined,
    podMembers: normalizedPodMembers,
    note: row.note,
    thread,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function existingPreviewCommentThread(db: SqliteDb, projectId: string, conversationId: string, id: string) {
  const row = db
    .prepare(
      `SELECT note, thread_json AS threadJson, status, created_at AS createdAt
         FROM preview_comments
        WHERE id = ? AND project_id = ? AND conversation_id = ?`,
    )
    .get(id, projectId, conversationId) as DbRow | undefined;
  return normalizePreviewCommentThread(row ? parseJsonOrUndef(row.threadJson) : undefined, row?.note, row?.createdAt, row?.status);
}

function normalizePreviewCommentThread(input: unknown, fallbackNote: unknown, fallbackCreatedAt: unknown, status: unknown) {
  const entries = Array.isArray(input)
    ? input
        .map((entry) => {
          if (!entry || typeof entry !== 'object') return null;
          const body = typeof entry.body === 'string' ? compactWhitespace(entry.body).slice(0, 1000) : '';
          if (!body) return null;
          const createdAt =
            typeof entry.createdAt === 'number' && Number.isFinite(entry.createdAt)
              ? Math.round(entry.createdAt)
              : Date.now();
          return {
            authorId: typeof entry.authorId === 'string' && entry.authorId.trim()
              ? entry.authorId.trim().slice(0, 120)
              : 'designer',
            body,
            createdAt,
            ...(entry.resolved === true ? { resolved: true } : {}),
          };
        })
        .filter(isPreviewCommentThreadEntry)
    : [];
  const note = typeof fallbackNote === 'string' && fallbackNote.trim()
    ? compactWhitespace(fallbackNote).slice(0, 1000)
    : '';
  if (entries.length === 0 && note) {
    const createdAt =
      typeof fallbackCreatedAt === 'number' && Number.isFinite(fallbackCreatedAt)
        ? Math.round(fallbackCreatedAt)
        : Date.now();
    return [{
      authorId: 'designer',
      body: note,
      createdAt,
      ...(status === 'resolved' ? { resolved: true } : {}),
    }];
  }
  if (entries.length > 0) return withResolvedPreviewCommentThread(entries, status);
  return [];
}

type PreviewCommentThreadRecord = {
  authorId: string;
  body: string;
  createdAt: number;
  resolved?: boolean;
};

function isPreviewCommentThreadEntry(entry: PreviewCommentThreadRecord | null): entry is PreviewCommentThreadRecord {
  return entry !== null;
}

function withPrimaryPreviewCommentThread(
  thread: PreviewCommentThreadRecord[],
  note: string,
  createdAt: number,
  status: string,
) {
  const [first, ...rest] = thread;
  return [
    {
      authorId: first?.authorId ?? 'designer',
      body: compactWhitespace(note).slice(0, 1000),
      createdAt: first?.createdAt ?? createdAt,
      ...(status === 'resolved' ? { resolved: true } : {}),
    },
    ...rest,
  ];
}

function withResolvedPreviewCommentThread(
  thread: PreviewCommentThreadRecord[],
  status: unknown,
) {
  return thread.map((entry, index) => {
    if (index !== 0) return entry;
    const { resolved: _resolved, ...rest } = entry;
    return status === 'resolved' ? { ...rest, resolved: true } : rest;
  });
}

function normalizePreviewCommentAnchor(input: unknown, fallbackXpath: string, position: DbRow) {
  const record = input && typeof input === 'object' ? input as DbRow : {};
  const xpath = typeof record.xpath === 'string' && record.xpath.trim()
    ? compactWhitespace(record.xpath).slice(0, 400)
    : compactWhitespace(fallbackXpath || '').slice(0, 400);
  return {
    xpath: xpath || '/*',
    charOffset:
      typeof record.charOffset === 'number' && Number.isFinite(record.charOffset)
        ? Math.max(0, Math.round(record.charOffset))
        : 0,
    pixelX:
      typeof record.pixelX === 'number' && Number.isFinite(record.pixelX)
        ? Math.round(record.pixelX)
        : finitePositionCoordinate(position?.x),
    pixelY:
      typeof record.pixelY === 'number' && Number.isFinite(record.pixelY)
        ? Math.round(record.pixelY)
        : finitePositionCoordinate(position?.y),
  };
}

function finitePositionCoordinate(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 0;
}

function cleanRequiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} required`);
  return value.trim();
}

function normalizePodMembers(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input
    .map((member) => {
      if (!member || typeof member !== 'object') return null;
      const elementId = cleanRequiredString(member.elementId, 'podMember.elementId');
      const selector = cleanRequiredString(member.selector, 'podMember.selector');
      const label = cleanRequiredString(member.label, 'podMember.label');
      return {
        elementId,
        selector,
        label,
        text:
          typeof member.text === 'string'
            ? compactWhitespace(member.text).slice(0, 160)
            : '',
        position: normalizePosition(member.position),
        htmlHint:
          typeof member.htmlHint === 'string'
            ? compactWhitespace(member.htmlHint).slice(0, 180)
            : '',
      };
    })
    .filter(Boolean);
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizePosition(input: unknown) {
  const value: DbRow = input && typeof input === 'object' ? input as DbRow : {};
  return {
    x: finiteNumber(value.x),
    y: finiteNumber(value.y),
    width: finiteNumber(value.width),
    height: finiteNumber(value.height),
  };
}

function finiteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 0;
}

function randomCommentId(): string {
  return `cmt_${randomUUID().slice(0, 8)}`;
}

function normalizeMessage(row: DbRow) {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    agentId: row.agentId ?? undefined,
    agentName: row.agentName ?? undefined,
    runId: row.runId ?? undefined,
    runStatus: row.runStatus ?? undefined,
    lastRunEventId: row.lastRunEventId ?? undefined,
    events: parseJsonOrUndef(row.eventsJson),
    attachments: parseJsonOrUndef(row.attachmentsJson),
    commentAttachments: parseJsonOrUndef(row.commentAttachmentsJson),
    producedFiles: parseJsonOrUndef(row.producedFilesJson),
    createdAt: row.createdAt ?? undefined,
    startedAt: row.startedAt ?? undefined,
    endedAt: row.endedAt ?? undefined,
  };
}

function parseJsonOrUndef(s: unknown): any {
  if (typeof s !== 'string' || !s) return undefined;
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

// ---------- routines ----------

const ROUTINE_COLS = `id, name, prompt,
  schedule_kind AS scheduleKind, schedule_value AS scheduleValue,
  schedule_json AS scheduleJson,
  project_mode AS projectMode, project_id AS projectId,
  skill_id AS skillId, agent_id AS agentId,
  enabled, created_at AS createdAt, updated_at AS updatedAt`;

const ROUTINE_RUN_COLS = `id, routine_id AS routineId, trigger, status,
  project_id AS projectId, conversation_id AS conversationId,
  agent_run_id AS agentRunId, started_at AS startedAt,
  completed_at AS completedAt, summary, error`;

export function listRoutines(db: SqliteDb) {
  return (db
    .prepare(`SELECT ${ROUTINE_COLS} FROM routines ORDER BY created_at ASC`)
    .all() as DbRow[])
    .map(normalizeRoutine);
}

export function getRoutine(db: SqliteDb, id: string) {
  const r = db
    .prepare(`SELECT ${ROUTINE_COLS} FROM routines WHERE id = ?`)
    .get(id) as DbRow | undefined;
  return r ? normalizeRoutine(r) : null;
}

export function insertRoutine(db: SqliteDb, r: DbRow) {
  db.prepare(
    `INSERT INTO routines
       (id, name, prompt, schedule_kind, schedule_value, schedule_json,
        project_mode, project_id, skill_id, agent_id, enabled,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    r.id,
    r.name,
    r.prompt,
    r.scheduleKind,
    r.scheduleValue,
    r.scheduleJson ?? null,
    r.projectMode,
    r.projectId ?? null,
    r.skillId ?? null,
    r.agentId ?? null,
    r.enabled ? 1 : 0,
    r.createdAt,
    r.updatedAt,
  );
  return getRoutine(db, r.id);
}

export function updateRoutine(db: SqliteDb, id: string, patch: DbRow) {
  const existing = getRoutine(db, id);
  if (!existing) return null;
  const merged = {
    ...existing,
    ...patch,
    updatedAt: typeof patch.updatedAt === 'number' ? patch.updatedAt : Date.now(),
  };
  db.prepare(
    `UPDATE routines
        SET name = ?, prompt = ?,
            schedule_kind = ?, schedule_value = ?, schedule_json = ?,
            project_mode = ?, project_id = ?,
            skill_id = ?, agent_id = ?,
            enabled = ?, updated_at = ?
      WHERE id = ?`,
  ).run(
    merged.name,
    merged.prompt,
    merged.scheduleKind,
    merged.scheduleValue,
    merged.scheduleJson ?? null,
    merged.projectMode,
    merged.projectId ?? null,
    merged.skillId ?? null,
    merged.agentId ?? null,
    merged.enabled ? 1 : 0,
    merged.updatedAt,
    id,
  );
  return getRoutine(db, id);
}

export function deleteRoutine(db: SqliteDb, id: string): boolean {
  const result = db.prepare(`DELETE FROM routines WHERE id = ?`).run(id);
  return result.changes > 0;
}

function normalizeRoutine(row: DbRow) {
  return {
    id: row.id,
    name: row.name,
    prompt: row.prompt,
    scheduleKind: row.scheduleKind,
    scheduleValue: row.scheduleValue,
    scheduleJson: row.scheduleJson ?? null,
    projectMode: row.projectMode,
    projectId: row.projectId ?? null,
    skillId: row.skillId ?? null,
    agentId: row.agentId ?? null,
    enabled: Number(row.enabled) === 1,
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
  };
}

export function listRoutineRuns(db: SqliteDb, routineId: string, limit = 20) {
  return (db
    .prepare(
      `SELECT ${ROUTINE_RUN_COLS}
         FROM routine_runs
        WHERE routine_id = ?
        ORDER BY started_at DESC
        LIMIT ?`,
    )
    .all(routineId, limit) as DbRow[])
    .map(normalizeRoutineRun);
}

export function getLatestRoutineRun(db: SqliteDb, routineId: string) {
  const r = db
    .prepare(
      `SELECT ${ROUTINE_RUN_COLS}
         FROM routine_runs
        WHERE routine_id = ?
        ORDER BY started_at DESC
        LIMIT 1`,
    )
    .get(routineId) as DbRow | undefined;
  return r ? normalizeRoutineRun(r) : null;
}

export function getRoutineRun(db: SqliteDb, id: string) {
  const r = db
    .prepare(`SELECT ${ROUTINE_RUN_COLS} FROM routine_runs WHERE id = ?`)
    .get(id) as DbRow | undefined;
  return r ? normalizeRoutineRun(r) : null;
}

export function insertRoutineRun(db: SqliteDb, r: DbRow) {
  db.prepare(
    `INSERT INTO routine_runs
       (id, routine_id, trigger, status, project_id, conversation_id,
        agent_run_id, started_at, completed_at, summary, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    r.id,
    r.routineId,
    r.trigger,
    r.status,
    r.projectId,
    r.conversationId,
    r.agentRunId,
    r.startedAt,
    r.completedAt ?? null,
    r.summary ?? null,
    r.error ?? null,
  );
  return getRoutineRun(db, r.id);
}

export function updateRoutineRun(db: SqliteDb, id: string, patch: DbRow) {
  const existing = getRoutineRun(db, id);
  if (!existing) return null;
  const merged = {
    ...existing,
    ...patch,
  };
  db.prepare(
    `UPDATE routine_runs
        SET status = ?, completed_at = ?, summary = ?, error = ?
      WHERE id = ?`,
  ).run(
    merged.status,
    merged.completedAt ?? null,
    merged.summary ?? null,
    merged.error ?? null,
    id,
  );
  return getRoutineRun(db, id);
}

function normalizeRoutineRun(row: DbRow) {
  return {
    id: row.id,
    routineId: row.routineId,
    trigger: row.trigger,
    status: row.status,
    projectId: row.projectId,
    conversationId: row.conversationId,
    agentRunId: row.agentRunId,
    startedAt: Number(row.startedAt),
    completedAt: row.completedAt == null ? null : Number(row.completedAt),
    summary: row.summary ?? null,
    error: row.error ?? null,
  };
}

// ---------- tabs ----------

export function listTabs(db: SqliteDb, projectId: string) {
  const rows = db
    .prepare(
      `SELECT name, position, is_active AS isActive
         FROM tabs WHERE project_id = ? ORDER BY position ASC`,
    )
    .all(projectId) as DbRow[];
  const active = (rows as DbRow[]).find((r: DbRow) => r.isActive) ?? null;
  return {
    tabs: (rows as DbRow[]).map((r: DbRow) => r.name),
    active: active ? active.name : null,
  };
}

export function setTabs(db: SqliteDb, projectId: string, names: string[], activeName: string | null) {
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM tabs WHERE project_id = ?`).run(projectId);
    const ins = db.prepare(
      `INSERT INTO tabs (project_id, name, position, is_active)
       VALUES (?, ?, ?, ?)`,
    );
    names.forEach((name: string, i: number) => {
      ins.run(projectId, name, i, name === activeName ? 1 : 0);
    });
  });
  tx();
  return listTabs(db, projectId);
}
