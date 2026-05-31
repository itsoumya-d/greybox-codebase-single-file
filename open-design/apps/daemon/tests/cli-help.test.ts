// SPDX-License-Identifier: Apache-2.0

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const cliPath = path.resolve(import.meta.dirname, '../src/cli.ts');

function runCliHelp(...args: string[]): string {
  return execFileSync(process.execPath, ['--import', 'tsx', cliPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      AGDS_PORT: '',
      OD_PORT: '',
    },
  });
}

describe('daemon CLI help', () => {
  it('presents agds as the primary root command', () => {
    const help = runCliHelp('--help');

    expect(help).toContain('agds [--port <n>] [--host <addr>] [--no-open]');
    expect(help).toContain('agds init [dir] [--name <title>]');
    expect(help).toContain('agds skills install <github-url|owner/repo|path>');
    expect(help).toContain('agds studio-scheduler run --project <id>');
    expect(help).toContain('env: AGDS_PORT');
    expect(help).toContain('"$AGDS_NODE_BIN" "$AGDS_BIN" tools ...');
    expect(help).not.toMatch(/^  od\b/m);
    expect(help).not.toContain('OD_BIN');
    expect(help).not.toContain('OD_PORT');
  });

  it('presents agds for media, research, and MCP subcommands', () => {
    const mediaHelp = runCliHelp('media', '--help');
    const researchHelp = runCliHelp('research', '--help');
    const mcpHelp = runCliHelp('mcp', '--help');
    const schedulerHelp = runCliHelp('studio-scheduler', '--help');
    const initHelp = runCliHelp('init', '--help');
    const skillHelp = runCliHelp('skill', '--help');

    expect(mediaHelp).toContain('Usage: agds media generate');
    expect(mediaHelp).toContain('"$AGDS_NODE_BIN" "$AGDS_BIN" media generate');
    expect(mediaHelp).not.toContain('Usage: od media');

    expect(researchHelp).toContain('agds research search --query <text>');
    expect(researchHelp).not.toContain('od research search');

    expect(mcpHelp).toContain('Usage: agds mcp [--daemon-url <url>]');
    expect(mcpHelp).toContain('AGDS_DAEMON_URL');
    expect(mcpHelp).not.toContain('Usage: od mcp');

    expect(schedulerHelp).toContain('Usage:');
    expect(schedulerHelp).toContain('agds studio-scheduler run --project <id>');
    expect(schedulerHelp).toContain('world-simulation');
    expect(schedulerHelp).toContain('autonomous-iteration');
    expect(schedulerHelp).toContain('balance-loop');
    expect(schedulerHelp).toContain('studio-orchestration');
    expect(schedulerHelp).not.toContain('od studio-scheduler');

    expect(initHelp).toContain('Usage:');
    expect(initHelp).toContain('npx agds init [dir]');
    expect(initHelp).toContain('top-down-roguelike');
    expect(initHelp).not.toContain('npx od init');

    expect(skillHelp).toContain('agds skills install <github-url|owner/repo|path>');
    expect(skillHelp).toContain('agds skill add <path>');
    expect(skillHelp).not.toContain('od skill');

    expect(`${mediaHelp}${researchHelp}${mcpHelp}${schedulerHelp}${initHelp}${skillHelp}`).not.toContain('OD_DAEMON_URL');
    expect(`${mediaHelp}${researchHelp}${mcpHelp}${schedulerHelp}${initHelp}${skillHelp}`).not.toContain('OD_PROJECT_ID');
  });
});
