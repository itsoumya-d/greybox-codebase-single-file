#!/usr/bin/env node
// Seed the running daemon with pre-baked game-studio projects so the UI has
// real GDD decks, HUDs, encounter boards, and playable concepts to work with
// without waiting for an LLM run. Pulls each project's content from a game
// template or skill example, drops it in as `index.html`, and adds a couple of
// fake chat messages so the conversation panel isn't empty.
//
// Usage (daemon must be running — e.g. `pnpm tools-dev`):
//   pnpm seed:test-projects                    # default bundle
//   pnpm seed:test-projects --decks 2 --prototypes 2 # cap counts
//   pnpm seed:test-projects --daemon http://127.0.0.1:17456
//   pnpm seed:test-projects --clear            # remove previously seeded projects
//
// The daemon URL is resolved in this order: --daemon flag > $AGDS_DAEMON_URL >
// http://127.0.0.1:$AGDS_PORT > legacy aliases > whatever `pnpm tools-dev status --json` reports
// for the daemon service. The discovery step is what makes the two-shell flow
// (`pnpm tools-dev` then `pnpm seed:test-projects`) work without extra flags,
// because tools-dev defaults to an ephemeral daemon port that isn't exported
// to sibling shells.
//
// Seeded project ids start with `seed-` so `--clear` only touches the
// fixtures this script created.

import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');

function envValue(value: string | undefined): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}
const SKILLS_DIR = path.join(REPO_ROOT, 'skills');
const SEED_PREFIX = 'seed-';

type SeedKind = 'deck' | 'prototype';

interface SeedFixture {
  skillId: string;
  kind: SeedKind;
  name: string;
  pendingPrompt: string;
  // Optional source to load as index.html. `templates/...` is resolved from the
  // repository root; any other value is resolved inside skills/<skillId>/.
  // Defaults to example.html for skills that ship a standalone example.
  source?: string;
}

// Local mirror of the daemon `ProjectFile` shape. Kept in sync with
// `packages/contracts/src/api/files.ts` — the assistant message stores
// `producedFiles: ProjectFile[]`, so we type the upload response against
// it instead of fabricating a string array.
interface ProjectFile {
  name: string;
  path?: string;
  type?: 'file' | 'dir';
  size: number;
  mtime: number;
  kind: string;
  mime: string;
}

interface ProjectFileResponse {
  file: ProjectFile;
}

interface SeedProjectSummary {
  id: string;
  metadata?: {
    seeded?: boolean;
    source?: string;
    [k: string]: unknown;
  } | null;
}

const DECKS: SeedFixture[] = [
  {
    skillId: 'game-design-document',
    kind: 'deck',
    name: 'GDD — tactical survival prototype',
    pendingPrompt:
      'Create a studio-ready Game Design Document for a tactical survival game: fantasy, loop, mechanics, progression, levels, risks, and production scope.',
    source: 'templates/game-design-document.html',
  },
  {
    skillId: 'combat-system',
    kind: 'deck',
    name: 'Combat spec — stamina duel',
    pendingPrompt:
      'Design a combat system spec with startup/active/recovery frames, hitstop, stamina costs, enemy readability, and controller feedback.',
    source: 'templates/combat-spec.html',
  },
  {
    skillId: 'economy-progression',
    kind: 'deck',
    name: 'Economy board — RPG progression',
    pendingPrompt:
      'Build a progression and economy board for an RPG, including currencies, sinks, unlock pacing, reward loops, and ethical monetization constraints.',
    source: 'templates/economy-balance-sheet.html',
  },
  {
    skillId: 'live-ops-calendar',
    kind: 'deck',
    name: 'Live-ops calendar — season arc',
    pendingPrompt:
      'Plan a 12-week live-ops season with events, reward cadence, balance patches, retention goals, and production milestones.',
    source: 'templates/live-ops-calendar.html',
  },
];

const WEBS: SeedFixture[] = [
  {
    skillId: 'playable-game-prototype',
    kind: 'prototype',
    name: 'Arena shooter HUD prototype',
    pendingPrompt:
      'Create a browser-playable arena shooter prototype with HUD readability, spawn flow, pickups, encounter pressure, and keyboard/touch controls.',
    source: 'templates/arena-shooter-hud.html',
  },
  {
    skillId: 'mobile-game-flow',
    kind: 'prototype',
    name: 'Mobile idle RPG flow',
    pendingPrompt:
      'Design a mobile idle RPG gameplay flow with session loop, one-thumb HUD, upgrade pacing, offline rewards, and retention checks.',
    source: 'templates/mobile-idle-rpg.html',
  },
  {
    skillId: 'desktop-game-ui',
    kind: 'prototype',
    name: 'Extraction shooter game control center',
    pendingPrompt:
      'Build an extraction-shooter control center with inventory pressure, squad status, contract risk, map intel, and raid readiness.',
    source: 'templates/extraction-shooter-ui.html',
  },
];

interface Args {
  daemonUrl: string | null;
  decks: number;
  webs: number;
  clear: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    daemonUrl: null,
    decks: DECKS.length,
    webs: WEBS.length,
    clear: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--daemon' || a === '--daemon-url') {
      const value = argv[++i];
      if (!value) {
        console.error(`${a} requires a URL argument`);
        process.exit(2);
      }
      out.daemonUrl = value;
    } else if (a === '--decks') {
      out.decks = Math.max(0, Number(argv[++i]) || 0);
    } else if (a === '--webs' || a === '--prototypes') {
      out.webs = Math.max(0, Number(argv[++i]) || 0);
    } else if (a === '--clear') {
      out.clear = true;
    } else if (a === '-h' || a === '--help') {
      printHelp();
      process.exit(0);
    } else {
      console.error(`unknown flag: ${a}`);
      printHelp();
      process.exit(2);
    }
  }
  return out;
}

function printHelp() {
  console.log(`Usage: pnpm seed:test-projects [opts]

Seeds the running daemon with pre-baked game design documents and playable
prototype surfaces loaded from game-native templates. Useful for working on
the studio UI without waiting for an LLM run.

Options:
  --daemon <url>     Daemon base URL. When omitted, the script reads
                     \$AGDS_DAEMON_URL, then \$AGDS_PORT, and finally falls back
                     to discovering the URL from \`pnpm tools-dev status --json\`.
  --decks <n>        Number of slide decks to seed (default: ${DECKS.length}, max: ${DECKS.length})
  --webs <n>         Number of playable prototypes to seed (default: ${WEBS.length}, max: ${WEBS.length})
  --clear            Delete every previously seeded project (id prefix '${SEED_PREFIX}')
  -h, --help         Show this help

Daemon URL resolution (first match wins):
  1. \`--daemon <url>\` on the command line.
  2. \`AGDS_DAEMON_URL\` env var.
  3. \`http://127.0.0.1:\$AGDS_PORT\` when \`AGDS_PORT\` is set to a real port.
  4. Auto-discovered from \`pnpm tools-dev status --json\`. \`tools-dev\` defaults
     to an ephemeral daemon port, so a typical two-shell flow works without
     extra flags:
       pnpm tools-dev          # in one shell
       pnpm seed:test-projects # in another — discovers the running daemon
`);
}

function isDiscoverablePort(value: string | undefined): value is string {
  if (value == null || value.length === 0) return false;
  // tools-dev sets AGDS_PORT=0 to mean "ephemeral, look at runtime status",
  // which is unusable as a target. Treat it the same as unset so we fall
  // through to the discovery path.
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n < 65536;
}

async function discoverDaemonUrlFromToolsDev(): Promise<string | null> {
  return await new Promise<string | null>((resolve) => {
    let child;
    try {
      child = spawn('pnpm', ['exec', 'tools-dev', 'status', '--json'], {
        cwd: REPO_ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      resolve(null);
      return;
    }
    let stdout = '';
    child.stdout?.on('data', (chunk: Buffer | string) => {
      stdout += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    });
    child.stderr?.resume();
    child.on('error', () => resolve(null));
    child.on('exit', () => {
      try {
        const parsed = JSON.parse(stdout) as {
          apps?: { daemon?: { url?: string | null } };
          url?: string | null;
        };
        const url = parsed?.apps?.daemon?.url ?? parsed?.url ?? null;
        resolve(typeof url === 'string' && url.length > 0 ? url : null);
      } catch {
        resolve(null);
      }
    });
  });
}

async function resolveDaemonUrl(args: Args): Promise<string> {
  if (args.daemonUrl) return args.daemonUrl;
  const envDaemonUrl = envValue(process.env.AGDS_DAEMON_URL);
  if (envDaemonUrl) return envDaemonUrl;
  const envPort = envValue(process.env.AGDS_PORT);
  if (envPort && isDiscoverablePort(envPort)) {
    return `http://127.0.0.1:${envPort}`;
  }
  const discovered = await discoverDaemonUrlFromToolsDev();
  if (discovered) return discovered;
  throw new Error(
    'cannot determine daemon URL: no --daemon flag, no AGDS_DAEMON_URL, ' +
      'no usable AGDS_PORT, and `pnpm tools-dev status --json` did not report a ' +
      'running daemon. Start the daemon (e.g. `pnpm tools-dev`) or pass ' +
      '`--daemon http://127.0.0.1:<port>` explicitly.',
  );
}

async function api<T = unknown>(
  daemonUrl: string,
  method: string,
  pathPart: string,
  body?: unknown,
): Promise<T> {
  const url = `${daemonUrl.replace(/\/$/, '')}${pathPart}`;
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  let resp: Response;
  try {
    resp = await fetch(url, init);
  } catch (err) {
    throw new Error(
      `cannot reach daemon at ${daemonUrl} — start it with \`pnpm tools-dev\` ` +
        `(underlying error: ${(err as Error).message || String(err)})`,
    );
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`${method} ${pathPart} → ${resp.status}: ${text}`);
  }
  if (resp.status === 204) return undefined as T;
  return (await resp.json()) as T;
}

function makeSeedId(skillId: string): string {
  // unique-ish, sortable, easy to spot in the UI / db
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  // Slug must match [A-Za-z0-9._-]{1,128}, see daemon validation.
  const slug = skillId.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 60);
  return `${SEED_PREFIX}${slug}-${ts}-${rand}`.slice(0, 128);
}

async function loadExample(fix: SeedFixture): Promise<string> {
  const source = fix.source ?? 'example.html';
  const file = source.startsWith('templates/')
    ? path.join(REPO_ROOT, source)
    : path.join(SKILLS_DIR, fix.skillId, source);
  return readFile(file, 'utf8');
}

async function seedOne(daemonUrl: string, fix: SeedFixture): Promise<void> {
  const html = await loadExample(fix);
  const id = makeSeedId(fix.skillId);
  process.stdout.write(`  - ${fix.kind.padEnd(9)} ${id}  (${fix.skillId})\n`);

  const created = await api<{
    project: { id: string };
    conversationId: string;
  }>(daemonUrl, 'POST', '/api/projects', {
    id,
    name: fix.name,
    skillId: fix.skillId,
    pendingPrompt: fix.pendingPrompt,
    metadata: { kind: fix.kind, seeded: true, source: 'seed-test-projects' },
  });

  const uploaded = await api<ProjectFileResponse>(
    daemonUrl,
    'POST',
    `/api/projects/${id}/files`,
    {
      name: 'index.html',
      content: html,
      encoding: 'utf8',
    },
  );

  await api(daemonUrl, 'PUT', `/api/projects/${id}/tabs`, {
    tabs: ['index.html'],
    active: 'index.html',
  });

  // Fake chat history so the conversation panel isn't empty. Two messages
  // is enough for the recent-activity sort and for the assistant bubble
  // to render with a producedFiles chip.
  const cid = created.conversationId;
  const userMid = `seed-msg-user-${Date.now().toString(36)}`;
  const asstMid = `seed-msg-asst-${Date.now().toString(36)}`;
  const now = Date.now();
  await api(
    daemonUrl,
    'PUT',
    `/api/projects/${id}/conversations/${cid}/messages/${userMid}`,
    {
      role: 'user',
      content: fix.pendingPrompt,
      createdAt: now,
    },
  );
  await api(
    daemonUrl,
    'PUT',
    `/api/projects/${id}/conversations/${cid}/messages/${asstMid}`,
    {
      role: 'assistant',
      content:
        `Seeded \`index.html\` from \`${fix.source ?? `skills/${fix.skillId}/example.html`}\` ` +
        `as a starting point. Open the preview tab to see the rendered ${fix.kind}.`,
      agentId: 'seed-script',
      agentName: 'seed-test-projects',
      runStatus: 'succeeded',
      startedAt: now,
      endedAt: now,
      producedFiles: [uploaded.file],
      createdAt: now,
    },
  );
}

async function clearSeeded(daemonUrl: string): Promise<void> {
  const { projects } = await api<{ projects: SeedProjectSummary[] }>(
    daemonUrl,
    'GET',
    '/api/projects',
  );
  // Project ids are caller-supplied through the public daemon API, so
  // the `seed-` prefix alone is not a strong enough marker for a
  // destructive delete. Require both the prefix AND the metadata stamp
  // we wrote in `seedOne` so a manually-created project that happens to
  // share the prefix is left alone.
  const seeded = projects.filter(
    (p) =>
      p.id.startsWith(SEED_PREFIX) &&
      p.metadata?.seeded === true &&
      p.metadata?.source === 'seed-test-projects',
  );
  if (seeded.length === 0) {
    console.log('no seeded projects to remove.');
    return;
  }
  console.log(`removing ${seeded.length} seeded project(s):`);
  for (const p of seeded) {
    process.stdout.write(`  - ${p.id}\n`);
    await api(daemonUrl, 'DELETE', `/api/projects/${p.id}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const daemonUrl = await resolveDaemonUrl(args);

  if (args.clear) {
    await clearSeeded(daemonUrl);
    return;
  }

  const decks = DECKS.slice(0, args.decks);
  const webs = WEBS.slice(0, args.webs);
  if (decks.length === 0 && webs.length === 0) {
    console.error('--decks 0 and --webs 0 — nothing to do.');
    process.exit(2);
  }

  console.log(`seeding ${decks.length} deck(s) + ${webs.length} web prototype(s) → ${daemonUrl}`);
  const failures: string[] = [];
  for (const fix of [...decks, ...webs]) {
    try {
      await seedOne(daemonUrl, fix);
    } catch (err) {
      failures.push(fix.skillId);
      console.error(`  ! ${fix.skillId} failed: ${(err as Error).message}`);
    }
  }
  if (failures.length > 0) {
    console.error(
      `done with ${failures.length} failure(s): ${failures.join(', ')}`,
    );
    process.exit(1);
  }
  console.log('done. Open the web UI — the seeded projects show up in the project list.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
