import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runConnectorsToolCli } from '../src/tools-connectors-cli.js';

const ORIGINAL_ENV = { ...process.env };

describe('connectors tool CLI', () => {
  let stdoutWrite: { mockRestore: () => void };
  let stderrWrite: { mockRestore: () => void };
  let stdoutOutput: string[];
  let stderrOutput: string[];
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    stdoutOutput = [];
    stderrOutput = [];
    stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdoutOutput.push(String(chunk));
      return true;
    });
    stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderrOutput.push(String(chunk));
      return true;
    });
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ connectors: [] }), { headers: { 'Content-Type': 'application/json' }, status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    stdoutWrite.mockRestore();
    stderrWrite.mockRestore();
    process.env = ORIGINAL_ENV;
  });

  it('appends curated useCase query params for connector listing', async () => {
    process.env.AGDS_DAEMON_URL = 'http://127.0.0.1:7456/base/';
    process.env.AGDS_TOOL_TOKEN = 'agent-run-token';
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ connectors: [] }), { headers: { 'Content-Type': 'application/json' }, status: 200 }));

    const result = await runConnectorsToolCli(['list', '--use-case', 'personal_daily_digest']);

    expect(result.exitCode).toBe(0);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:7456/base/api/tools/connectors/list?useCase=personal_daily_digest',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer agent-run-token' }),
      }),
    );
  });

  it('prefers AGDS tool env over deprecated OD aliases', async () => {
    process.env.AGDS_DAEMON_URL = 'http://127.0.0.1:7456/agds/';
    process.env.OD_DAEMON_URL = 'http://127.0.0.1:7456/legacy/';
    process.env.AGDS_TOOL_TOKEN = 'agds-token';
    process.env.OD_TOOL_TOKEN = 'legacy-token';

    const result = await runConnectorsToolCli(['list']);

    expect(result.exitCode).toBe(0);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:7456/agds/api/tools/connectors/list',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer agds-token',
        }),
      }),
    );
  });

  it('ignores deprecated OD tool env when AGDS values are blank', async () => {
    process.env.AGDS_DAEMON_URL = '';
    process.env.OD_DAEMON_URL = 'http://127.0.0.1:7456/legacy/';
    process.env.AGDS_TOOL_TOKEN = ' ';
    process.env.OD_TOOL_TOKEN = 'legacy-token';

    const result = await runConnectorsToolCli(['list']);

    expect(result.exitCode).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.parse(stderrOutput.join(''))).toMatchObject({
      ok: false,
      error: { message: 'AGDS_DAEMON_URL is required' },
    });
  });

  it('includes curation in compact connector output', async () => {
    process.env.AGDS_DAEMON_URL = 'http://127.0.0.1:7456';
    process.env.AGDS_TOOL_TOKEN = 'agent-run-token';
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      connectors: [{
        id: 'slack',
        name: 'Slack',
        provider: 'composio',
        category: 'Communication',
        status: 'connected',
        tools: [{
          name: 'slack.slack_list_channels',
          description: 'List Slack channels',
          safety: { sideEffect: 'read', approval: 'auto', reason: 'read-only' },
          curation: { useCases: ['personal_daily_digest'], reason: 'Digest source' },
        }],
      }],
    }), { headers: { 'Content-Type': 'application/json' }, status: 200 }));

    const result = await runConnectorsToolCli(['list']);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(stdoutOutput.join(''))).toEqual({
      ok: true,
      connectors: [{
        id: 'slack',
        name: 'Slack',
        provider: 'composio',
        category: 'Communication',
        status: 'connected',
        accountLabel: undefined,
        tools: [{
          name: 'slack.slack_list_channels',
          description: 'List Slack channels',
          safety: { sideEffect: 'read', approval: 'auto', reason: 'read-only' },
          curation: { useCases: ['personal_daily_digest'], reason: 'Digest source' },
          inputSchema: undefined,
        }],
      }],
    });
    expect(stderrOutput.join('')).toBe('');
  });
});
