// SPDX-License-Identifier: Apache-2.0

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFromTarget, uninstallById } from './library-install.js';
import { resolveProjectRelativePath } from './home-expansion.js';
import { findSkillById, listSkills } from './skills.js';

type SkillCliIo = {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
};

interface SkillCliOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  io?: SkillCliIo;
  moduleDir?: string;
}

interface SkillCliFlags {
  dataDir?: string;
  json: boolean;
  installed: boolean;
  builtIn: boolean;
  help: boolean;
}

interface SkillCliDirs {
  projectRoot: string;
  dataDir: string;
  builtInSkillsDir: string;
  installedSkillsDir: string;
}

type SkillSource = 'built-in' | 'installed';

const GITHUB_SHORTHAND_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const HTTPS_GITHUB_RE = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?\/?$/;

export async function runSkillsCli(rawArgs: string[], options: SkillCliOptions = {}): Promise<number> {
  const io = options.io ?? {
    stdout: (text: string) => process.stdout.write(text),
    stderr: (text: string) => process.stderr.write(text),
  };
  const sub = rawArgs.find((arg) => arg && !arg.startsWith('-')) ?? '';
  if (!sub || sub === 'help') {
    printSkillsHelp(io.stdout);
    return 0;
  }

  const subIndex = rawArgs.indexOf(sub);
  const args = [...rawArgs.slice(0, subIndex), ...rawArgs.slice(subIndex + 1)];
  let parsed: { flags: SkillCliFlags; positional: string[] };
  try {
    parsed = parseSkillCliArgs(args);
  } catch (error) {
    io.stderr(`${messageFrom(error)}\n`);
    printSkillsHelp(io.stderr);
    return 2;
  }
  if (parsed.flags.help) {
    printSkillsHelp(io.stdout);
    return 0;
  }

  const dirInput: { dataDir?: string; env: NodeJS.ProcessEnv; moduleDir?: string } = {
    env: options.env ?? process.env,
  };
  if (parsed.flags.dataDir) dirInput.dataDir = parsed.flags.dataDir;
  if (options.moduleDir) dirInput.moduleDir = options.moduleDir;
  const dirs = resolveSkillCliDirs(dirInput);

  try {
    switch (sub) {
      case 'install':
        return await installSkill(parsed.positional, parsed.flags, dirs, options.cwd, io);
      case 'add':
        return await addLocalSkill(parsed.positional, parsed.flags, dirs, options.cwd, io);
      case 'list':
        return await listSkillCatalog(parsed.flags, dirs, io);
      case 'remove':
      case 'uninstall':
        return await removeSkill(parsed.positional, parsed.flags, dirs, io);
      case 'test':
        return await testSkill(parsed.positional, parsed.flags, dirs, options.cwd, io);
      default:
        io.stderr(`unknown subcommand: agds skill ${sub}\n`);
        printSkillsHelp(io.stderr);
        return 2;
    }
  } catch (error) {
    io.stderr(`${messageFrom(error)}\n`);
    return 1;
  }
}

export function resolveSkillCliDirs(input: {
  dataDir?: string;
  env?: NodeJS.ProcessEnv;
  moduleDir?: string;
} = {}): SkillCliDirs {
  const env = input.env ?? process.env;
  const moduleDir = input.moduleDir ?? path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = resolveDaemonProjectRoot(moduleDir);
  const configuredDataDir = cleanString(input.dataDir) ?? cleanString(env.AGDS_DATA_DIR);
  const dataDir = configuredDataDir
    ? resolveProjectRelativePath(configuredDataDir, projectRoot)
    : path.join(projectRoot, '.agds');
  const resourceRoot = cleanString(env.AGDS_RESOURCE_ROOT);
  const builtInSkillsDir = resourceRoot
    ? path.join(resolveProjectRelativePath(resourceRoot, projectRoot), 'skills')
    : path.join(projectRoot, 'skills');
  return {
    projectRoot,
    dataDir,
    builtInSkillsDir,
    installedSkillsDir: path.join(dataDir, 'skills'),
  };
}

export function normalizeGitHubSkillTarget(value: string): string | null {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (HTTPS_GITHUB_RE.test(trimmed)) return trimmed.replace(/\.git$/, '');
  if (GITHUB_SHORTHAND_RE.test(trimmed)) return `https://github.com/${trimmed}`;
  return null;
}

function parseSkillCliArgs(args: string[]): { flags: SkillCliFlags; positional: string[] } {
  const flags: SkillCliFlags = {
    json: false,
    installed: false,
    builtIn: false,
    help: false,
  };
  const positional: string[] = [];
  const stringFlags = new Set(['data-dir']);
  const booleanFlags = new Set(['json', 'installed', 'built-in', 'help', 'h']);

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg) continue;
    if (!arg.startsWith('-')) {
      positional.push(arg);
      continue;
    }
    if (!arg.startsWith('--')) {
      if (arg === '-h') {
        flags.help = true;
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
      if (key === 'json') flags.json = true;
      else if (key === 'installed') flags.installed = true;
      else if (key === 'built-in') flags.builtIn = true;
      else flags.help = true;
      continue;
    }
    const value = eq >= 0 ? arg.slice(eq + 1) : args[i + 1];
    if (value == null || value.startsWith('--')) {
      throw new Error(`flag --${key} requires a value`);
    }
    flags.dataDir = value;
    if (eq < 0) i += 1;
  }

  return { flags, positional };
}

async function installSkill(
  positional: string[],
  flags: SkillCliFlags,
  dirs: SkillCliDirs,
  cwd: string | undefined,
  io: SkillCliIo,
): Promise<number> {
  const target = positional[0];
  if (!target) throw new Error('skill install requires a GitHub repo URL, owner/repo, or local path');
  if (positional.length > 1) throw new Error(`unexpected positional argument: ${positional[1]}`);
  const githubUrl = normalizeGitHubSkillTarget(target);
  if (githubUrl) {
    return await installSkillTarget({ source: 'github', url: githubUrl }, flags, dirs, io);
  }
  const localPath = path.resolve(cwd ?? process.cwd(), target);
  return await installSkillTarget({ source: 'local', path: localPath }, flags, dirs, io);
}

async function addLocalSkill(
  positional: string[],
  flags: SkillCliFlags,
  dirs: SkillCliDirs,
  cwd: string | undefined,
  io: SkillCliIo,
): Promise<number> {
  const target = positional[0];
  if (!target) throw new Error('skill add requires a local skill directory');
  if (positional.length > 1) throw new Error(`unexpected positional argument: ${positional[1]}`);
  return await installSkillTarget(
    { source: 'local', path: path.resolve(cwd ?? process.cwd(), target) },
    flags,
    dirs,
    io,
  );
}

async function installSkillTarget(
  target: { source: 'github'; url: string } | { source: 'local'; path: string },
  flags: SkillCliFlags,
  dirs: SkillCliDirs,
  io: SkillCliIo,
): Promise<number> {
  await mkdir(dirs.installedSkillsDir, { recursive: true });
  const result = await installFromTarget(target, dirs.installedSkillsDir, 'skill');
  if (!result.ok) throw new Error(result.error);
  const installedDir = result.dir;
  if (typeof installedDir !== 'string' || installedDir.length === 0) {
    throw new Error('skill installed without a directory result');
  }
  const installed = await listSkills(dirs.installedSkillsDir);
  const skill = installed.find((entry) => path.resolve(entry.dir) === path.resolve(installedDir))
    ?? installed.find((entry) => entry.id === path.basename(installedDir));
  const payload = {
    ok: true,
    dir: installedDir,
    skill: skill ? publicSkill(entryWithSource(skill, 'installed')) : null,
  };
  if (flags.json) {
    io.stdout(`${JSON.stringify(payload)}\n`);
  } else {
    const label = payload.skill?.id ?? path.basename(installedDir);
    io.stdout(`Installed skill ${label} at ${installedDir}\n`);
  }
  return 0;
}

async function listSkillCatalog(
  flags: SkillCliFlags,
  dirs: SkillCliDirs,
  io: SkillCliIo,
): Promise<number> {
  const skills = await listAllSkills(dirs);
  const filtered = skills.filter((skill) => {
    if (flags.installed && skill.source !== 'installed') return false;
    if (flags.builtIn && skill.source !== 'built-in') return false;
    return true;
  });
  if (flags.json) {
    io.stdout(`${JSON.stringify({ skills: filtered.map(publicSkill) })}\n`);
    return 0;
  }
  if (filtered.length === 0) {
    io.stdout('No skills found.\n');
    return 0;
  }
  for (const skill of filtered) {
    io.stdout(`${skill.id}\t${skill.source}\t${skill.mode}/${skill.scenario}\t${skill.description}\n`);
  }
  return 0;
}

async function removeSkill(
  positional: string[],
  flags: SkillCliFlags,
  dirs: SkillCliDirs,
  io: SkillCliIo,
): Promise<number> {
  const id = positional[0];
  if (!id) throw new Error('skill remove requires a skill id');
  if (positional.length > 1) throw new Error(`unexpected positional argument: ${positional[1]}`);
  const result = await uninstallById(id, dirs.installedSkillsDir, dirs.builtInSkillsDir, 'skill');
  if (!result.ok) throw new Error(result.error);
  if (flags.json) io.stdout(`${JSON.stringify({ ok: true, id })}\n`);
  else io.stdout(`Removed skill ${id}\n`);
  return 0;
}

async function testSkill(
  positional: string[],
  flags: SkillCliFlags,
  dirs: SkillCliDirs,
  cwd: string | undefined,
  io: SkillCliIo,
): Promise<number> {
  const idOrPath = positional[0];
  if (!idOrPath) throw new Error('skill test requires a skill id or path');
  if (positional.length > 1) throw new Error(`unexpected positional argument: ${positional[1]}`);

  const pathCandidate = path.resolve(cwd ?? process.cwd(), idOrPath);
  const candidate = idOrPath.includes(path.sep) || idOrPath.startsWith('.') || path.isAbsolute(idOrPath)
    ? await findSkillInDirectory(pathCandidate)
    : null;
  const skill = candidate ?? findSkillById(await listAllSkills(dirs), idOrPath);
  if (!skill) {
    throw new Error(`skill ${idOrPath} was not found or does not contain a valid SKILL.md`);
  }
  const payload = { ok: true, skill: publicSkill(skill) };
  if (flags.json) io.stdout(`${JSON.stringify(payload)}\n`);
  else io.stdout(`Skill ${skill.id} passed manifest scan (${skill.mode}/${skill.scenario}).\n`);
  return 0;
}

async function listAllSkills(dirs: SkillCliDirs) {
  const builtIn = (await listSkills(dirs.builtInSkillsDir)).map((skill) => entryWithSource(skill, 'built-in'));
  const installed = (await listSkills(dirs.installedSkillsDir)).map((skill) => entryWithSource(skill, 'installed'));
  const seen = new Set(builtIn.map((skill) => skill.id));
  return [...builtIn, ...installed.filter((skill) => !seen.has(skill.id))];
}

async function findSkillInDirectory(dir: string) {
  const skills = await listSkills(path.dirname(dir));
  return skills.find((skill) => path.resolve(skill.dir) === path.resolve(dir)) ?? null;
}

function entryWithSource<T extends { dir: string }>(skill: T, source: SkillSource): T & { source: SkillSource } {
  return { ...skill, source };
}

function publicSkill(skill: {
  id: string;
  description?: string | null;
  mode?: string | null;
  scenario?: string | null;
  surface?: string | null;
  platform?: string | null;
  source?: string | null;
  dir?: string;
}) {
  const out = {
    id: skill.id,
    description: skill.description ?? '',
    mode: skill.mode ?? '',
    scenario: skill.scenario ?? '',
    surface: skill.surface ?? '',
    platform: skill.platform ?? '',
    source: skill.source ?? 'unknown',
  };
  return skill.dir ? { ...out, dir: skill.dir } : out;
}

function resolveDaemonProjectRoot(moduleDir: string): string {
  return path.resolve(moduleDir, '../../..');
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function printSkillsHelp(write: (text: string) => void): void {
  write(`Usage:
  agds skills install <github-url|owner/repo|path> [--data-dir <dir>] [--json]
  agds skill add <path> [--data-dir <dir>] [--json]
  agds skill list [--installed|--built-in] [--data-dir <dir>] [--json]
  agds skill remove <id> [--data-dir <dir>] [--json]
  agds skill test <id|path> [--data-dir <dir>] [--json]

Commands:
  skills install   Install a game skill from GitHub or a local folder.
  skill add        Alias for installing a local skill folder.
  skill list       List built-in and creator-installed game skills.
  skill remove     Remove a creator-installed skill. Built-ins are protected.
  skill test       Verify that a skill id or folder is discoverable via SKILL.md.

Options:
  --data-dir <dir>  AGDS data directory. Defaults to AGDS_DATA_DIR, then .agds.
  --installed       skill list only: show creator-installed skills.
  --built-in        skill list only: show built-in skills.
  --json            Emit machine-readable JSON.
`);
}
