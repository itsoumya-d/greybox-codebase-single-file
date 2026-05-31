#!/usr/bin/env node
// @ts-nocheck
import { startServer } from './server.js';
import { runLiveArtifactsMcpServer } from './mcp-live-artifacts-server.js';
import { runConnectorsToolCli } from './tools-connectors-cli.js';
import { runLiveArtifactsToolCli } from './tools-live-artifacts-cli.js';
import { splitResearchSubcommand } from './research/cli-args.js';
import { openBrowser } from './browser-open.js';
import { initDaemonTelemetry, telemetryConsentFromAppConfig } from './telemetry.js';
import { readAppConfig } from './app-config.js';

const argv = process.argv.slice(2);

// ---- Subcommand router ----------------------------------------------------
//
// `agds` is two CLIs glued together:
//   - default mode: starts the daemon + opens the web UI.
//   - `agds media …`: a thin client that POSTs to the running daemon. This
//     is what the code agent invokes from inside a chat to actually
//     produce image / video / audio bytes (the unifying contract).
//
// We dispatch on the first positional argument so flags like --port keep
// working unchanged. Subcommand routing is keyword-based; flags are
// parsed inside each handler.

// Flags accepted by `agds media generate`. Whitelisted so a hallucinated
// `--length 5` from the LLM fails fast instead of silently no-op'ing
// while we route a bogus body to the daemon.
//
// Hoisted to the top of the module *before* the subcommand dispatch
// below: top-level `await SUBCOMMAND_MAP[first](rest)` runs runMedia
// synchronously during module evaluation, and runMedia references these
// `const` Sets — leaving them at the bottom of the file would hit the
// TDZ ("Cannot access 'MEDIA_GENERATE_STRING_FLAGS' before
// initialization") and crash every `agds media …` invocation.
const MEDIA_GENERATE_STRING_FLAGS = new Set([
  'project',
  'surface',
  'model',
  'prompt',
  'output',
  'aspect',
  'length',
  'duration',
  'voice',
  'audio-kind',
  'composition-dir',
  'image',
  'daemon-url',
  'language',
]);
const MEDIA_GENERATE_BOOLEAN_FLAGS = new Set([
  'help',
  'h',
]);

const MCP_STRING_FLAGS = new Set([
  'daemon-url',
]);
const MCP_BOOLEAN_FLAGS = new Set([
  'help',
  'h',
]);

const RESEARCH_SEARCH_STRING_FLAGS = new Set([
  'query',
  'max-sources',
  'daemon-url',
]);
const RESEARCH_SEARCH_BOOLEAN_FLAGS = new Set([
  'help',
  'h',
]);

const STUDIO_SCHEDULER_STRING_FLAGS = new Set([
  'project',
  'task',
  'data-dir',
]);
const STUDIO_SCHEDULER_BOOLEAN_FLAGS = new Set([
  'force',
  'help',
  'h',
]);

const SUBCOMMAND_MAP = {
  init: runInit,
  media: runMedia,
  mcp: runMcp,
  research: runResearch,
  skill: runSkillCli,
  skills: runSkillCli,
  'studio-scheduler': runStudioScheduler,
};

const DEFAULT_DAEMON_URL = 'http://127.0.0.1:7456';

function resolveEnvironmentAlias(canonical, legacy) {
  const canonicalValue = typeof canonical === 'string' && canonical.trim().length > 0
    ? canonical.trim()
    : undefined;
  if (canonicalValue != null) return canonicalValue;
  return typeof legacy === 'string' && legacy.trim().length > 0
    ? legacy.trim()
    : undefined;
}

function resolveDaemonUrl(flagUrl) {
  return resolveEnvironmentAlias(flagUrl, undefined)
    || resolveEnvironmentAlias(process.env.AGDS_DAEMON_URL, undefined)
    || DEFAULT_DAEMON_URL;
}

if (argv[0] === 'mcp' && argv[1] === 'live-artifacts') {
  try {
    const { exitCode } = await runLiveArtifactsMcpServer();
    process.exit(exitCode);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${JSON.stringify({ ok: false, error: { message } })}\n`);
    process.exit(1);
  }
}

const first = argv.find((a) => !a.startsWith('-'));
if (first && SUBCOMMAND_MAP[first]) {
  const idx = argv.indexOf(first);
  const rest = [...argv.slice(0, idx), ...argv.slice(idx + 1)];
  await SUBCOMMAND_MAP[first](rest);
  process.exit(0);
}

if (argv[0] === 'tools' && argv[1] === 'live-artifacts') {
  runLiveArtifactsToolCli(argv.slice(2))
    .then(({ exitCode }) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${JSON.stringify({ ok: false, error: { message } })}\n`);
      process.exitCode = 1;
    });
} else if (argv[0] === 'tools' && argv[1] === 'connectors') {
  runConnectorsToolCli(argv.slice(2))
    .then(({ exitCode }) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${JSON.stringify({ ok: false, error: { message } })}\n`);
      process.exitCode = 1;
    });
} else {
// Default: daemon mode.
let port = Number(process.env.AGDS_PORT?.trim() || undefined) || 7456;
let host = typeof process.env.AGDS_BIND_HOST === 'string' && process.env.AGDS_BIND_HOST.trim().length > 0
  ? process.env.AGDS_BIND_HOST.trim()
  : '127.0.0.1';
let open = true;

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '-p' || a === '--port') {
    port = Number(argv[++i]);
  } else if (a === '--host') {
    host = argv[++i];
  } else if (a === '--no-open') {
    open = false;
  } else if (a === '-h' || a === '--help') {
    printRootHelp();
    process.exit(0);
  }
}

// Initialise opt-in error telemetry before the server boots so any startup
// crash gets reported. The adapter is a no-op unless the creator has stored
// telemetry consent in app-config.json AND AGDS_SENTRY_DSN is set.
(async () => {
  try {
    const { resolveDataDir, resolveProjectRoot } = await import('./server.js');
    const moduleDir = new URL('.', import.meta.url).pathname;
    const projectRoot = resolveProjectRoot(moduleDir);
    const dataDir = resolveDataDir(process.env.AGDS_DATA_DIR, projectRoot);
    const prefs = await readAppConfig(dataDir);
    const consent = telemetryConsentFromAppConfig(prefs);
    await initDaemonTelemetry({
      installationId: consent.installationId,
      allowErrors: consent.allowErrors,
      release: process.env.AGDS_VERSION,
    });
  } catch {
    // Telemetry bootstrap must never block the daemon. Swallow.
  }
})();

startServer({ port, host, returnServer: true }).then((started) => {
  const { url, server, shutdown } = started;
  const closeTimeoutMs = 5_000;
  const closeServer = () => new Promise((resolve) => {
    let resolved = false;
    const resolveOnce = () => {
      if (resolved) return;
      resolved = true;
      resolve();
    };
    const idleTimer = setTimeout(() => {
      server.closeIdleConnections?.();
    }, Math.min(1_000, closeTimeoutMs));
    const hardTimer = setTimeout(() => {
      server.closeAllConnections?.();
      resolveOnce();
    }, closeTimeoutMs);
    idleTimer.unref?.();
    hardTimer.unref?.();
    server.close(() => resolveOnce());
  }).finally(() => {
    server.closeIdleConnections?.();
  });
  let shuttingDown = false;
  const stop = () => {
    if (shuttingDown) {
      process.exit(0);
    }
    shuttingDown = true;
    const closePromise = closeServer();
    const shutdownPromise = Promise.resolve().then(() => shutdown?.());
    void Promise.resolve()
      .then(() => Promise.allSettled([shutdownPromise, closePromise]))
      .finally(() => process.exit(0));
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  console.log(`[agds] listening on ${url}`);
  if (open) {
    openBrowser(url);
  }
});
}

function printRootHelp() {
  console.log(`Usage:
  agds [--port <n>] [--host <addr>] [--no-open]
      Start the local daemon and open the web UI.

  agds init [dir] [--name <title>] [--template <id>] [--designer <name>] [--force]
      Scaffold a game project folder with DESIGN.md and a first
      gameplay-encounter.gameview.json blockout.

  agds skills install <github-url|owner/repo|path>
  agds skill <add|list|remove|test> ...
      Manage creator-installed game skills in the AGDS data directory.

  agds tools live-artifacts <create|list|update|refresh> [options]
      Manage live game artifacts through daemon wrapper commands.

  agds tools connectors <list|execute> [options]
      Discover and execute configured connectors.

  agds mcp live-artifacts
      Start the MCP server exposing live-artifact and connector tools.

  agds research search --query <text> [--max-sources 5] [--daemon-url <url>]
      Run agent-callable Tavily research through the local daemon.

  agds studio-scheduler run --project <id> [--task all] [--force]
      Run due game-studio loops from the AGDS data directory without
      requiring the HTTP daemon to be alive. Intended for launchd,
      systemd timers, cron, or Windows Task Scheduler.

  "$AGDS_NODE_BIN" "$AGDS_BIN" tools ...
      Recommended agent-runtime form; avoids relying on creator PATH for agds or node.

  agds media generate --surface <image|video|audio> --model <id> [opts]
      Generate a media artifact and write it into the active project.
      Designed to be invoked by a code agent - picks up AGDS_DAEMON_URL
      and AGDS_PROJECT_ID from the env that the daemon injected on spawn.

  agds mcp [--daemon-url <url>]
      Run a stdio MCP server that proxies read-only tool calls to a
      running AI Game Design Studio daemon. Wire it into a coding agent
      (Claude Code, Cursor, VS Code, Zed, Windsurf) in another repo
      to pull files from a local AI Game Design Studio project without
      exporting a zip.

Options:
  --port <n>       Port to listen on (default: 7456, env: AGDS_PORT).
  --host <addr>    Interface address to bind to (default: 127.0.0.1, env: AGDS_BIND_HOST).
                   Set to a specific IP (e.g. a Tailscale address) to restrict access
                   to that interface only.
  --no-open        Do not open the browser after start.

What the daemon does:
  * scans PATH for installed code-agent CLIs (claude, codex, devin, gemini, opencode, cursor-agent, ...)
  * serves the chat UI at http://<host>:<port>
  * proxies messages (text + images) to the selected agent via child-process spawn
  * exposes /api/projects/:id/media/generate — the unified image/video/audio
     dispatcher that the agent calls via \`agds media generate\`.`);
}

// ---------------------------------------------------------------------------
// Subcommand: agds init …
// ---------------------------------------------------------------------------

async function runInit(args) {
  let parsed;
  try {
    parsed = parseInitArgs(args);
  } catch (err) {
    console.error(err.message);
    printInitHelp();
    process.exit(2);
  }

  if (parsed.help) {
    printInitHelp();
    return;
  }

  try {
    const { initGameProject } = await import('./project-init.js');
    const result = await initGameProject({
      targetDir: parsed.targetDir,
      name: parsed.name,
      template: parsed.template,
      designer: parsed.designer,
      force: parsed.force,
    });
    process.stdout.write(`Created ${result.name} in ${result.targetDir}\n`);
    for (const file of result.created) {
      process.stdout.write(`  + ${file}\n`);
    }
    process.stdout.write('\nNext steps:\n');
    for (const step of result.nextSteps) {
      process.stdout.write(`  - ${step}\n`);
    }
  } catch (err) {
    console.error(err?.message || String(err));
    process.exit(1);
  }
}

function parseInitArgs(args) {
  const out = {
    targetDir: undefined,
    name: undefined,
    template: undefined,
    designer: undefined,
    force: false,
    help: false,
  };
  const stringFlags = new Set(['name', 'template', 'designer']);
  const booleanFlags = new Set(['force', 'help', 'h']);

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg) continue;
    if (!arg.startsWith('-')) {
      if (out.targetDir != null) {
        throw new Error(`unexpected positional argument: ${arg}`);
      }
      out.targetDir = arg;
      continue;
    }
    if (!arg.startsWith('--')) {
      if (arg === '-h') {
        out.help = true;
        continue;
      }
      throw new Error(`unknown flag: ${arg}`);
    }

    const eq = arg.indexOf('=');
    const key = eq >= 0 ? arg.slice(2, eq) : arg.slice(2);
    if (!stringFlags.has(key) && !booleanFlags.has(key)) {
      throw new Error(`unknown flag: --${key}`);
    }
    if (booleanFlags.has(key)) {
      if (key === 'force') out.force = true;
      else out.help = true;
      continue;
    }
    const value = eq >= 0 ? arg.slice(eq + 1) : args[i + 1];
    if (value == null || value.startsWith('--')) {
      throw new Error(`flag --${key} requires a value`);
    }
    out[key] = value;
    if (eq < 0) i += 1;
  }

  return out;
}

function printInitHelp() {
  console.log(`Usage:
  agds init [dir] [--name <title>] [--template <id>] [--designer <name>] [--force]
  npx agds init [dir] [--name <title>] [--template <id>] [--designer <name>] [--force]

Scaffold a game-project folder with a durable DESIGN.md, README.md, and
a gameplay-encounter.gameview.json blockout ready for engine export,
playtest simulation, and agent iteration.

Templates:
  2d-platformer       Side-on movement/combat vertical slice (default).
  top-down-roguelike  Room pressure, loot, dodge/readability loop.
  mobile-idle         Portrait idle RPG loop with ethical progression.
  blank               Neutral blockout with only the core Greybox guardrails.

Options:
  --name <title>       Project display name. Defaults to the directory name.
  --designer <name>    Human designer credited in DESIGN.md metadata.
  --template <id>      One of the templates above.
  --force              Overwrite scaffold files if they already exist.`);
}

// ---------------------------------------------------------------------------
// Subcommand: agds skill / agds skills …
// ---------------------------------------------------------------------------

async function runSkillCli(args) {
  const { runSkillsCli } = await import('./skill-cli.js');
  const exitCode = await runSkillsCli(args);
  process.exit(exitCode);
}

// ---------------------------------------------------------------------------
// Subcommand: agds studio-scheduler …
// ---------------------------------------------------------------------------

async function runStudioScheduler(args) {
  const sub = args.find((a) => !a.startsWith('-')) || '';
  if (!sub || sub === 'help' || args.includes('--help') || args.includes('-h')) {
    printStudioSchedulerHelp();
    process.exit(!sub || sub === 'help' || args.includes('--help') || args.includes('-h') ? 0 : 2);
  }
  if (sub !== 'run') {
    console.error(`unknown subcommand: agds studio-scheduler ${sub}`);
    printStudioSchedulerHelp();
    process.exit(2);
  }

  const idx = args.indexOf(sub);
  const subArgs = [...args.slice(0, idx), ...args.slice(idx + 1)];
  let flags;
  try {
    flags = parseFlags(subArgs, {
      string: STUDIO_SCHEDULER_STRING_FLAGS,
      boolean: STUDIO_SCHEDULER_BOOLEAN_FLAGS,
    });
  } catch (err) {
    console.error(err.message);
    printStudioSchedulerHelp();
    process.exit(2);
  }
  if (flags.help || flags.h) {
    printStudioSchedulerHelp();
    return;
  }

  const projectId = resolveEnvironmentAlias(flags.project, undefined)
    || resolveEnvironmentAlias(process.env.AGDS_PROJECT_ID, undefined);
  if (!projectId) {
    console.error('project id required. Pass --project <id> or set AGDS_PROJECT_ID.');
    process.exit(2);
  }

  try {
    const { normalizeStudioSchedulerTasks, runStudioSchedulerOnce } = await import('./game-studio-scheduler.js');
    const result = await runStudioSchedulerOnce({
      projectId,
      dataDir: flags['data-dir'],
      tasks: normalizeStudioSchedulerTasks(flags.task),
      force: Boolean(flags.force),
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.results.some((entry) => entry.status === 'error')) process.exitCode = 1;
  } catch (err) {
    console.error(err?.message || String(err));
    process.exit(1);
  }
}

function printStudioSchedulerHelp() {
  console.log(`Usage:
  agds studio-scheduler run --project <id> [--task all] [--force] [--data-dir <path>]

Runs due game-studio background loops directly from the AGDS data directory
without starting the HTTP daemon. This is the scheduler-friendly path for
launchd, systemd timers, cron, and Windows Task Scheduler.

Tasks:
  all                     Run world-simulation, autonomous-iteration, balance-loop, and studio-orchestration when due.
  world-simulation        Run the project world-simulation loop.
  autonomous-iteration    Run the project autonomous-iteration loop.
  balance-loop            Run the project telemetry/playtest balance loop.
  studio-orchestration    Run the studio-agent work-order orchestration loop.

Options:
  --project <id>    Project id. Defaults to AGDS_PROJECT_ID when set.
  --task <task>     all | world-simulation | autonomous-iteration | balance-loop | studio-orchestration.
                    Comma-separated values are accepted.
  --force           Run selected loops even when disabled or not due.
  --data-dir <dir>  AGDS data directory. Defaults to AGDS_DATA_DIR, then .agds.

Example external timer command:
  agds studio-scheduler run --project my-game --task all`);
}

// ---------------------------------------------------------------------------
// Subcommand: agds research …
// ---------------------------------------------------------------------------

async function runResearch(args) {
  const { sub, subArgs } = splitResearchSubcommand(args);
  if (!sub || sub === 'help' || args.includes('--help') || args.includes('-h')) {
    printResearchHelp();
    process.exit(sub === 'help' || args.includes('--help') || args.includes('-h') ? 0 : 2);
  }
  if (sub !== 'search') {
    console.error(`unknown subcommand: agds research ${sub}`);
    printResearchHelp();
    process.exit(2);
  }
  return runResearchSearch(subArgs);
}

async function runResearchSearch(rawArgs) {
  let flags;
  try {
    flags = parseFlags(rawArgs, {
      string: RESEARCH_SEARCH_STRING_FLAGS,
      boolean: RESEARCH_SEARCH_BOOLEAN_FLAGS,
    });
  } catch (err) {
    console.error(err.message);
    printResearchHelp();
    process.exit(2);
  }
  const query = typeof flags.query === 'string' ? flags.query.trim() : '';
  if (!query) {
    console.error('--query required');
    process.exit(2);
  }
  const daemonUrl = resolveDaemonUrl(flags['daemon-url']);
  const maxSources =
    flags['max-sources'] == null ? undefined : Number(flags['max-sources']);
  const url = `${daemonUrl.replace(/\/$/, '')}/api/research/search`;
  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query,
        ...(Number.isFinite(maxSources) ? { maxSources } : {}),
      }),
    });
  } catch (err) {
    surfaceFetchError(err, daemonUrl);
    process.exit(3);
  }
  if (!resp.ok) {
    const text = await resp.text();
    console.error(`daemon ${resp.status}: ${text}`);
    process.exit(4);
  }
  process.stdout.write(`${await resp.text()}\n`);
}

function printResearchHelp() {
  console.log(`Usage:
  agds research search --query <text> [--max-sources 5] [--daemon-url <url>]

Runs Tavily-backed shallow research through the local AI Game Design Studio daemon.
Output is JSON only on stdout:
  { "query": "...", "summary": "...", "sources": [...], "provider": "tavily", "depth": "shallow", "fetchedAt": 0 }

Flags:
  --query        Required search query.
  --max-sources  Optional source cap. Defaults to 5, clamped to Tavily's max.
  --daemon-url   Local daemon URL. Defaults to AGDS_DAEMON_URL or http://127.0.0.1:7456.`);
}

// ---------------------------------------------------------------------------
// Subcommand: agds media …
// ---------------------------------------------------------------------------

async function runMedia(args) {
  const sub = args.find((a) => !a.startsWith('-')) || '';
  if (sub === 'help' || sub === '-h' || sub === '--help' || sub === '') {
    printMediaHelp();
    return;
  }
  if (sub !== 'generate' && sub !== 'wait') {
    console.error(`unknown subcommand: agds media ${sub}`);
    printMediaHelp();
    process.exit(1);
  }

  const idx = args.indexOf(sub);
  const subArgs = [...args.slice(0, idx), ...args.slice(idx + 1)];
  if (sub === 'wait') return runMediaWait(subArgs);
  return runMediaGenerate(subArgs);
}

async function runMediaGenerate(rawArgs) {
  let flags;
  try {
    flags = parseFlags(rawArgs, {
      string: MEDIA_GENERATE_STRING_FLAGS,
      boolean: MEDIA_GENERATE_BOOLEAN_FLAGS,
    });
  } catch (err) {
    console.error(err.message);
    printMediaHelp();
    process.exit(2);
  }

  const daemonUrl = resolveDaemonUrl(flags['daemon-url']);
  const projectId = resolveEnvironmentAlias(flags.project, undefined)
    || resolveEnvironmentAlias(process.env.AGDS_PROJECT_ID, undefined);
  if (!projectId) {
    console.error(
      'project id required. Pass --project <id> or set AGDS_PROJECT_ID. The daemon injects this when it spawns the code agent.',
    );
    process.exit(2);
  }

  const surface = flags.surface;
  if (!surface || !['image', 'video', 'audio'].includes(surface)) {
    console.error('--surface must be one of: image | video | audio');
    process.exit(2);
  }
  if (!flags.model) {
    console.error('--model required (see http://<daemon>/api/media/models)');
    process.exit(2);
  }

  const body = {
    surface,
    model: flags.model,
    prompt: flags.prompt,
    output: flags.output,
    aspect: flags.aspect,
    voice: flags.voice,
    audioKind: flags['audio-kind'],
    compositionDir: flags['composition-dir'],
    image: flags.image,
    language: flags.language,
  };
  if (flags.length != null) body.length = Number(flags.length);
  if (flags.duration != null) body.duration = Number(flags.duration);

  const url = `${daemonUrl.replace(/\/$/, '')}/api/projects/${encodeURIComponent(projectId)}/media/generate`;
  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    surfaceFetchError(err, daemonUrl);
    process.exit(3);
  }
  if (!resp.ok) {
    const text = await resp.text();
    console.error(`daemon ${resp.status}: ${text}`);
    process.exit(4);
  }
  const accepted = await resp.json();
  const { taskId } = accepted;
  if (!taskId) {
    console.error('daemon did not return a taskId');
    process.exit(4);
  }
  console.error(`task ${taskId} queued (${accepted.status || 'queued'})`);
  await pollUntilDoneOrBudget(daemonUrl, taskId, 0);
}

async function runMediaWait(rawArgs) {
  const taskId = rawArgs.find((a) => a && !a.startsWith('--'));
  if (!taskId) {
    console.error('usage: agds media wait <taskId> [--since <n>] [--daemon-url <url>]');
    process.exit(2);
  }
  const flagsOnly = rawArgs.filter((a) => a !== taskId);
  let flags;
  try {
    flags = parseFlags(flagsOnly, {
      string: new Set(['since', 'daemon-url']),
      boolean: new Set(['help', 'h']),
    });
  } catch (err) {
    console.error(err.message);
    printMediaHelp();
    process.exit(2);
  }
  const daemonUrl = resolveDaemonUrl(flags['daemon-url']);
  const since = Number.isFinite(Number(flags.since))
    ? Number(flags.since)
    : 0;
  await pollUntilDoneOrBudget(daemonUrl, taskId, since);
}

async function pollUntilDoneOrBudget(daemonUrl, taskId, sinceStart) {
  const totalBudgetMs = 25_000;
  const perCallTimeoutMs = 4_000;
  const startedAt = Date.now();
  const url = `${daemonUrl.replace(/\/$/, '')}/api/media/tasks/${encodeURIComponent(taskId)}/wait`;

  let since = Number.isFinite(sinceStart) ? sinceStart : 0;
  let lastSnapshot = null;

  while (Date.now() - startedAt < totalBudgetMs) {
    const remaining = totalBudgetMs - (Date.now() - startedAt);
    const callTimeout = Math.max(500, Math.min(perCallTimeoutMs, remaining));
    let resp;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ since, timeoutMs: callTimeout }),
      });
    } catch (err) {
      surfaceFetchError(err, daemonUrl);
      process.exit(3);
    }
    if (resp.status === 404) {
      console.error(`task ${taskId} not found (expired or never queued)`);
      process.exit(4);
    }
    if (!resp.ok) {
      const text = await resp.text();
      console.error(`daemon ${resp.status}: ${text}`);
      process.exit(4);
    }
    let snap;
    try {
      snap = await resp.json();
    } catch {
      console.error('daemon returned non-JSON for /wait');
      process.exit(4);
    }
    lastSnapshot = snap;
    if (Array.isArray(snap.progress)) {
      for (const line of snap.progress) {
        process.stderr.write(line + '\n');
        process.stdout.write(`# ${line}\n`);
      }
    }
    if (typeof snap.nextSince === 'number') since = snap.nextSince;

    if (snap.status === 'done') {
      const file = snap.file || {};
      const warnings = Array.isArray(file.warnings) ? file.warnings : [];
      for (const w of warnings) {
        if (typeof w === 'string' && w) console.error(`WARN: ${w}`);
      }
      if (file.providerError) {
        const provider = file.providerId || 'provider';
        console.error(
          `WARN: ${provider} call failed — wrote stub fallback (${file.size} bytes) to ${file.name}`,
        );
        console.error(`WARN: reason: ${file.providerError}`);
        console.error(
          'WARN: surface this verbatim to the creator. Do NOT claim the stub is the final result.',
        );
      }
      process.stdout.write(JSON.stringify({ file }) + '\n');
      process.exit(file.providerError ? 5 : 0);
    }
    if (snap.status === 'failed') {
      const msg = snap.error?.message || 'task failed';
      console.error(`task failed: ${msg}`);
      process.stdout.write(
        JSON.stringify({ taskId, status: 'failed', error: snap.error || {} }) + '\n',
      );
      process.exit(snap.error?.status || 5);
    }
    if (snap.status === 'interrupted') {
      const msg = snap.error?.message || 'task interrupted';
      console.error(`task interrupted: ${msg}`);
      process.stdout.write(
        JSON.stringify({ taskId, status: 'interrupted', error: snap.error || {} }) + '\n',
      );
      process.exit(snap.error?.status || 5);
    }
  }

  const handoff = {
    taskId,
    status: lastSnapshot?.status || 'running',
    nextSince: since,
    elapsed: Math.round((Date.now() - startedAt) / 1000),
  };
  process.stdout.write(JSON.stringify(handoff) + '\n');
  process.stderr.write(
    `task ${taskId} still running after ${handoff.elapsed}s. ` +
      `Run \`"$AGDS_NODE_BIN" "$AGDS_BIN" media wait ${taskId} --since ${since}\` to continue in an agent runtime ` +
      `(exit code 2 = still running).\n`,
  );
  process.exit(2);
}

function surfaceFetchError(err, daemonUrl) {
  const cause = err && typeof err === 'object' ? err.cause : null;
  const code =
    cause && typeof cause === 'object' && typeof cause.code === 'string'
      ? cause.code
      : null;
  const causeMsg =
    cause && typeof cause === 'object' && typeof cause.message === 'string'
      ? cause.message
      : '';
  let detail = err && err.message ? err.message : String(err);
  if (code) detail = `${code}${causeMsg ? ` — ${causeMsg}` : ''}`;
  else if (causeMsg) detail = causeMsg;
  console.error(`failed to reach daemon at ${daemonUrl}: ${detail}`);
  if (code === 'EPERM' || code === 'ENETUNREACH') {
    console.error(
      'hint: outbound connect was denied by a sandbox. If you launched ' +
        'this command from a code agent, check the agent\'s sandbox / ' +
        'network policy. The AI Game Design Studio daemon itself is unaffected - it can be ' +
        'reached from a regular shell.',
    );
  }
}

function parseFlags(argv, opts = {}) {
  const stringFlags = opts.string instanceof Set ? opts.string : new Set();
  const booleanFlags = opts.boolean instanceof Set ? opts.boolean : new Set();
  const knownFlags = new Set([...stringFlags, ...booleanFlags]);
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a || !a.startsWith('--')) {
      throw new Error(`unexpected positional argument: ${a}`);
    }
    const eq = a.indexOf('=');
    const key = eq >= 0 ? a.slice(2, eq) : a.slice(2);
    if (knownFlags.size > 0 && !knownFlags.has(key)) {
      throw new Error(
        `unknown flag: --${key}. Run with --help for the list of accepted flags.`,
      );
    }
    if (eq >= 0) {
      out[key] = a.slice(eq + 1);
      continue;
    }
    if (booleanFlags.has(key)) {
      out[key] = true;
      continue;
    }
    if (stringFlags.has(key)) {
      const next = argv[i + 1];
      if (next == null) {
        throw new Error(`flag --${key} requires a value`);
      }
      out[key] = next;
      i++;
      continue;
    }
    const next = argv[i + 1];
    if (next != null && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function printMediaHelp() {
  console.log(`Usage: agds media generate --surface <image|video|audio> --model <id> [opts]
       "$AGDS_NODE_BIN" "$AGDS_BIN" media generate --surface <image|video|audio> --model <id> [opts]

Required:
  --surface  image | video | audio
  --model    Model id from /api/media/models (e.g. gpt-image-2, seedance-2, suno-v5).
  --project  Project id. Auto-resolved from AGDS_PROJECT_ID when invoked by the daemon.

Common options:
  --prompt "<text>"         Generation prompt.
  --output <filename>       File to write under the project. Auto-named if omitted.
  --aspect 1:1|16:9|9:16|4:3|3:4
  --length <seconds>        Video length.
  --duration <seconds>      Audio duration.
  --voice <voice-id>        Speech / TTS voice.
  --language <lang>         Language boost for TTS (e.g. Chinese,Yue for Cantonese).
  --audio-kind music|speech|sfx
  --composition-dir <path>  hyperframes-html only — project-relative path
                            to the dir containing hyperframes.json /
                            meta.json / index.html. The daemon runs
                            \`npx hyperframes render\` against it.
  --image <path>            Project-relative path to a reference image
                            (image-to-video for Seedance i2v models, or
                            future image-edit endpoints). Daemon reads
                            the file from the project, base64-encodes
                            it, and forwards it to the upstream API.
  --daemon-url http://127.0.0.1:7456

Output: a single line of JSON: {"file": { name, size, kind, mime, ... }}.

Skills should call this and then reference the returned filename in their
artifact / message body. The daemon writes the bytes into the project's
files folder so the FileViewer can preview them immediately.`);
}

// ---------------------------------------------------------------------------
// Subcommand: agds mcp
// ---------------------------------------------------------------------------

async function runMcp(args) {
  let flags;
  try {
    flags = parseFlags(args, {
      string: MCP_STRING_FLAGS,
      boolean: MCP_BOOLEAN_FLAGS,
    });
  } catch (err) {
    console.error(err.message);
    printMcpHelp();
    process.exit(2);
  }
  if (flags.help || flags.h) {
    printMcpHelp();
    return;
  }

  const { resolveMcpDaemonUrl } = await import('./mcp-daemon-url.js');
  const daemonUrl = await resolveMcpDaemonUrl({ flagUrl: flags['daemon-url'] });

  const { runMcpStdio } = await import('./mcp.js');
  await runMcpStdio({ daemonUrl });
}

function printMcpHelp() {
  console.log(`Usage: agds mcp [--daemon-url <url>]

Run a stdio MCP (Model Context Protocol) server that proxies read-only
tool calls to a running AI Game Design Studio daemon. Wire it into a coding agent
in another repo so the agent can pull files from a local AI Game Design Studio
project without exporting a zip every iteration.

Options:
  --daemon-url <url>   AI Game Design Studio daemon HTTP base URL. Resolution
                       order: this flag, AGDS_DAEMON_URL, the running
                       daemon's sidecar IPC status socket
                       (/tmp/agds/ipc/<namespace>/daemon.sock),
                       then http://127.0.0.1:7456. Each new MCP spawn
                       discovers the live daemon URL at startup, so
                       MCP client configs stay valid across daemon
                       restarts even when the port is ephemeral. A
                       running MCP server caches the URL; restart the
                       MCP client after a daemon restart to pick up a
                       new port.

Tools exposed:
  list_projects                  list every AI Game Design Studio project
  get_active_context             what project/file the creator has open right now
  get_artifact([project, entry]) bundle: entry file + every referenced sibling
  get_project([project])         single project metadata
  get_file([project, path])      file contents (textual mimes only for now)
  search_files(query[, project]) literal substring search across textual files
  list_files([project])          project files + artifactManifest sidecars

When project is omitted, get_artifact / get_project / get_file /
search_files / list_files default to the project the creator has open in
AI Game Design Studio; get_artifact and get_file additionally default to the
active file. The response stamps usedActiveContext so callers can see
which project/file got resolved.

For the copy-paste, per-client snippet (with absolute paths resolved
for your machine, plus a one-click deeplink for Cursor), open Settings
→ MCP server in the AI Game Design Studio app. Read-only by design; the daemon
must be running locally for tool calls to succeed.`);
}
