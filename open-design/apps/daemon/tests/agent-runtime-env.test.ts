import { describe, expect, it } from 'vitest';

import { createAgentRuntimeEnv, createAgentRuntimeToolPrompt } from '../src/server.js';

const retiredEnvPrefix = `OD_${''}`;
const retiredRuntimeEnvKeys = {
  daemonUrl: `OD_${'DAEMON_URL'}`,
  nodeBin: `OD_${'NODE_BIN'}`,
  toolToken: `OD_${'TOOL_TOKEN'}`,
} as const;

describe('agent runtime tool environment', () => {
  it('injects daemon URL and run-scoped tool token into agent sessions', () => {
    const env = createAgentRuntimeEnv(
      {
        PATH: '/bin',
        [retiredRuntimeEnvKeys.daemonUrl]: 'http://127.0.0.1:1111/legacy',
        [retiredRuntimeEnvKeys.nodeBin]: '/legacy/node',
        [retiredRuntimeEnvKeys.toolToken]: 'stale-token',
      },
      'http://127.0.0.1:7456',
      { token: 'fresh-token' },
      '/opt/agds/bin/node',
    );

    expect(env).toMatchObject({
      PATH: '/bin',
      AGDS_DAEMON_URL: 'http://127.0.0.1:7456',
      AGDS_NODE_BIN: '/opt/agds/bin/node',
      AGDS_TOOL_TOKEN: 'fresh-token',
    });
    expect(env[retiredRuntimeEnvKeys.daemonUrl]).toBeUndefined();
    expect(env[retiredRuntimeEnvKeys.nodeBin]).toBeUndefined();
    expect(env[retiredRuntimeEnvKeys.toolToken]).toBeUndefined();
  });

  it('does not leak stale inherited tool tokens when no run token was minted', () => {
    const env = createAgentRuntimeEnv(
      { PATH: '/bin', [retiredRuntimeEnvKeys.toolToken]: 'stale-token' },
      'http://127.0.0.1:7456',
      null,
      '/opt/agds/bin/node',
    );

    expect(env.AGDS_DAEMON_URL).toBe('http://127.0.0.1:7456');
    expect(env.AGDS_NODE_BIN).toBe('/opt/agds/bin/node');
    expect(env.AGDS_TOOL_TOKEN).toBeUndefined();
    expect(env[retiredRuntimeEnvKeys.daemonUrl]).toBeUndefined();
    expect(env[retiredRuntimeEnvKeys.nodeBin]).toBeUndefined();
    expect(env[retiredRuntimeEnvKeys.toolToken]).toBeUndefined();
  });

  it('describes daemon URL and token availability without exposing the token', () => {
    const prompt = createAgentRuntimeToolPrompt('http://127.0.0.1:7456', {
      token: 'secret-run-token',
    });

    expect(prompt).toContain('Daemon URL: `http://127.0.0.1:7456`');
    expect(prompt).toContain('`AGDS_DAEMON_URL`');
    expect(prompt).toContain('`AGDS_NODE_BIN`');
    expect(prompt).toContain('`"$AGDS_NODE_BIN" "$AGDS_BIN" tools ...`');
    expect(prompt).toContain('& $env:AGDS_NODE_BIN $env:AGDS_BIN tools ...');
    expect(prompt).toContain('`AGDS_TOOL_TOKEN` is available');
    expect(prompt).toContain('do not print, persist, or override them');
    expect(prompt).not.toContain(retiredEnvPrefix);
    expect(prompt).not.toContain('secret-run-token');
  });

  it('describes missing token availability without exposing stale internals', () => {
    const prompt = createAgentRuntimeToolPrompt('http://127.0.0.1:7456', null);

    expect(prompt).toContain('Daemon URL: `http://127.0.0.1:7456`');
    expect(prompt).toContain('`AGDS_TOOL_TOKEN` is not available');
    expect(prompt).not.toContain(retiredEnvPrefix);
    expect(prompt).not.toContain('Bearer');
  });
});
