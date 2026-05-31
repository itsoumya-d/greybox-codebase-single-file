import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import path from 'node:path';
import { test } from 'vitest';
import { attachAcpSession, buildAcpSessionNewParams } from '../src/acp.js';

test('ACP session params do not require MCP servers by default', () => {
  assert.deepEqual(buildAcpSessionNewParams('/tmp/agds-project'), {
    cwd: path.resolve('/tmp/agds-project'),
    mcpServers: [],
  });
});

test('ACP session params do not request global MCP config mutation', () => {
  const params = buildAcpSessionNewParams('/tmp/agds-project');

  assert.equal('mcpConfigPath' in params, false);
  assert.equal('writeMcpConfig' in params, false);
  assert.equal('installMcpServers' in params, false);
});

test('ACP session params normalize explicit MCP servers to ACP stdio shape', () => {
  const mcpServers = [{ name: 'ai-game-design-studio-live-artifacts', command: 'agds', args: ['mcp', 'live-artifacts'] }];

  assert.deepEqual(buildAcpSessionNewParams('/tmp/agds-project', { mcpServers }), {
    cwd: path.resolve('/tmp/agds-project'),
    mcpServers: [
      {
        type: 'stdio',
        name: 'ai-game-design-studio-live-artifacts',
        command: 'agds',
        args: ['mcp', 'live-artifacts'],
        env: [],
      },
    ],
  });
});

test('ACP session params preserve caller-provided type and env fields', () => {
  const mcpServers = [
    { type: 'http', name: 'http-server', url: 'http://localhost:3000', headers: {}, env: [{ key: 'TOKEN', value: 'secret' }] },
  ];

  const result = buildAcpSessionNewParams('/tmp/agds-project', { mcpServers });
  const server = result.mcpServers[0];
  assert.ok(server);
  assert.equal(server.type, 'http');
  assert.equal(server.name, 'http-server');
  assert.deepEqual(server.env, [{ key: 'TOKEN', value: 'secret' }]);
});

test('attachAcpSession exposes abort and sends session cancel after session creation', () => {
  const child = new FakeAcpChild();
  const writes: string[] = [];
  child.stdin.on('data', (chunk) => writes.push(String(chunk)));

  const session = attachAcpSession({
    child: child as never,
    prompt: 'hello',
    cwd: '/tmp/agds-project',
    model: null,
    mcpServers: [],
    send: () => {},
  });

  child.stdout.write(`${JSON.stringify({ id: 1, result: {} })}\n`);
  child.stdout.write(`${JSON.stringify({ id: 2, result: { sessionId: 'session-1' } })}\n`);

  assert.equal(typeof session.abort, 'function');
  session.abort();
  session.abort();

  const parsed = writes
    .join('')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const cancelRequests = parsed.filter((entry) => entry.method === 'session/cancel');
  assert.equal(cancelRequests.length, 1);
  assert.deepEqual(cancelRequests[0].params, { sessionId: 'session-1' });
});

class FakeAcpChild extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  killed = false;

  kill() {
    this.killed = true;
    return true;
  }
}
