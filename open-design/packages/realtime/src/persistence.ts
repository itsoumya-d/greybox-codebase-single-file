// SPDX-License-Identifier: Apache-2.0

import * as Y from "yjs";

export interface RealtimeSnapshot {
  projectId: string;
  update: Uint8Array;
  savedAt: number;
}

export interface RealtimeSnapshotStore {
  load(projectId: string): Promise<RealtimeSnapshot | null> | RealtimeSnapshot | null;
  save(snapshot: RealtimeSnapshot): Promise<void> | void;
}

export interface SqliteStatement<T = unknown> {
  run(...values: unknown[]): unknown;
  get(...values: unknown[]): T | undefined;
}

export interface SqliteLikeDatabase {
  exec(sql: string): unknown;
  prepare<T = unknown>(sql: string): SqliteStatement<T>;
}

export interface RealtimeSnapshotRow {
  project_id: string;
  update_blob: Buffer | Uint8Array;
  saved_at: number;
}

export function ensureRealtimeSnapshotSchema(db: SqliteLikeDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS realtime_snapshots (
      project_id TEXT PRIMARY KEY,
      update_blob BLOB NOT NULL,
      saved_at INTEGER NOT NULL
    )
  `);
}

export function createSqliteSnapshotStore(db: SqliteLikeDatabase): RealtimeSnapshotStore {
  ensureRealtimeSnapshotSchema(db);
  const select = db.prepare<RealtimeSnapshotRow>(
    "SELECT project_id, update_blob, saved_at FROM realtime_snapshots WHERE project_id = ?",
  );
  const upsert = db.prepare(
    `INSERT INTO realtime_snapshots (project_id, update_blob, saved_at)
       VALUES (?, ?, ?)
       ON CONFLICT(project_id)
       DO UPDATE SET update_blob = excluded.update_blob, saved_at = excluded.saved_at`,
  );
  return {
    load(projectId) {
      const row = select.get(projectId);
      if (!row) return null;
      return {
        projectId: row.project_id,
        update: new Uint8Array(row.update_blob),
        savedAt: row.saved_at,
      };
    },
    save(snapshot) {
      upsert.run(snapshot.projectId, Buffer.from(snapshot.update), snapshot.savedAt);
    },
  };
}

export function encodeSnapshot(projectId: string, doc: Y.Doc, savedAt = Date.now()): RealtimeSnapshot {
  return {
    projectId,
    update: Y.encodeStateAsUpdate(doc),
    savedAt,
  };
}

export async function restoreSnapshot(doc: Y.Doc, store: RealtimeSnapshotStore, projectId: string): Promise<boolean> {
  const snapshot = await store.load(projectId);
  if (!snapshot) return false;
  Y.applyUpdate(doc, snapshot.update, "snapshot-restore");
  return true;
}

export interface SnapshotScheduler {
  flush(): Promise<void>;
  stop(): void;
}

type IntervalHandle = ReturnType<typeof setInterval>;

export function createSnapshotScheduler(options: {
  projectId: string;
  doc: Y.Doc;
  store: RealtimeSnapshotStore;
  intervalMs?: number;
  setIntervalFn?: (callback: () => void, intervalMs: number) => IntervalHandle;
  clearIntervalFn?: (timer: IntervalHandle) => void;
  now?: () => number;
}): SnapshotScheduler {
  const intervalMs = options.intervalMs ?? 10_000;
  const now = options.now ?? Date.now;
  let dirty = true;
  let stopped = false;
  const markDirty = (): void => {
    dirty = true;
  };
  options.doc.on("update", markDirty);

  async function flush(): Promise<void> {
    if (stopped || !dirty) return;
    dirty = false;
    await options.store.save(encodeSnapshot(options.projectId, options.doc, now()));
  }

  const timer = (options.setIntervalFn ?? setInterval)(() => {
    void flush();
  }, intervalMs);

  return {
    flush,
    stop() {
      stopped = true;
      options.doc.off("update", markDirty);
      (options.clearIntervalFn ?? clearInterval)(timer);
    },
  };
}
