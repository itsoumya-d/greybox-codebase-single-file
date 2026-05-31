import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const TEST_DATA_DIR_SYMBOL = Symbol.for('ai-game-design-studio.daemon.vitestDataDir');

const globalState = globalThis as typeof globalThis & {
  [TEST_DATA_DIR_SYMBOL]?: string;
};

if (!globalState[TEST_DATA_DIR_SYMBOL]) {
  globalState[TEST_DATA_DIR_SYMBOL] = mkdtempSync(path.join(tmpdir(), 'agds-daemon-vitest-'));

  process.once('exit', () => {
    rmSync(globalState[TEST_DATA_DIR_SYMBOL]!, { force: true, recursive: true });
  });
}

// Server paths are resolved at module import time. Force every daemon test
// process to use one isolated AGDS data directory before any test imports
// server.ts, so tests can never read or overwrite the developer's real studio
// data roots.
process.env.AGDS_DATA_DIR = globalState[TEST_DATA_DIR_SYMBOL];
