// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http';
import test from 'node:test';

import {
  CorsPolicyConfigurationError,
  corsPolicyFromEnv,
  applyCorsHeaders,
  handleCorsPreflight,
  isOriginAllowed,
} from '../src/security/cors.js';
import { HttpRateLimiter, httpRateLimiterFromEnv, clientKey } from '../src/security/httpRateLimit.js';
import {
  PayloadTooLargeError,
  maxPayloadBytesFromEnv,
  readJsonWithLimit,
  readRawBodyWithLimit,
} from '../src/security/payloadLimit.js';

test('corsPolicyFromEnv parses comma-separated allowed origins', () => {
  const policy = corsPolicyFromEnv({
    GREYBOX_CLOUD_ALLOWED_ORIGINS: 'https://app.greybox.studio, https://staging.greybox.studio',
  });
  assert.ok(policy);
  assert.deepEqual(
    Array.from(policy.allowedOrigins).sort(),
    ['https://app.greybox.studio', 'https://staging.greybox.studio'],
  );
  assert.equal(policy.allowCredentials, false);
});

test('corsPolicyFromEnv returns undefined when env var is empty', () => {
  assert.equal(corsPolicyFromEnv({}), undefined);
  assert.equal(corsPolicyFromEnv({ GREYBOX_CLOUD_ALLOWED_ORIGINS: '   ' }), undefined);
});

test('corsPolicyFromEnv honours credentials opt-in', () => {
  const policy = corsPolicyFromEnv({
    GREYBOX_CLOUD_ALLOWED_ORIGINS: 'https://app.greybox.studio',
    GREYBOX_CLOUD_ALLOW_CREDENTIALS: 'true',
  });
  assert.ok(policy);
  assert.equal(policy.allowCredentials, true);
});

test('corsPolicyFromEnv rejects wildcard credentials and malformed origins', () => {
  assert.throws(
    () => corsPolicyFromEnv({
      GREYBOX_CLOUD_ALLOWED_ORIGINS: '*',
      GREYBOX_CLOUD_ALLOW_CREDENTIALS: 'true',
    }),
    CorsPolicyConfigurationError,
  );

  for (const origin of [
    'https://user:pass@app.greybox.studio',
    'https://app.greybox.studio/callback',
    'https://app.greybox.studio?token=secret',
    'file:///tmp/app.html',
    'not-a-url',
  ]) {
    assert.throws(
      () => corsPolicyFromEnv({ GREYBOX_CLOUD_ALLOWED_ORIGINS: origin }),
      CorsPolicyConfigurationError,
    );
  }
});

test('isOriginAllowed honours wildcard but not arbitrary origins by default', () => {
  const policy = corsPolicyFromEnv({ GREYBOX_CLOUD_ALLOWED_ORIGINS: 'https://app.greybox.studio' });
  assert.ok(policy);
  assert.equal(isOriginAllowed(policy, 'https://app.greybox.studio'), true);
  assert.equal(isOriginAllowed(policy, 'https://evil.example.com'), false);
  assert.equal(isOriginAllowed(policy, undefined), false);

  const wildcard = corsPolicyFromEnv({ GREYBOX_CLOUD_ALLOWED_ORIGINS: '*' });
  assert.ok(wildcard);
  assert.equal(isOriginAllowed(wildcard, 'https://anything.example'), true);
});

test('handleCorsPreflight returns 204 with allow headers for trusted origins', async () => {
  const policy = corsPolicyFromEnv({ GREYBOX_CLOUD_ALLOWED_ORIGINS: 'https://app.greybox.studio' })!;
  const { request, response, completed, output } = await runMockHandler(
    'OPTIONS',
    '/v1/anything',
    { origin: 'https://app.greybox.studio' },
    '',
    async (req, res) => {
      const handled = handleCorsPreflight(req, res, policy);
      if (!handled) {
        res.writeHead(200);
        res.end();
      }
    },
  );
  await completed;
  assert.equal(response.statusCode, 204);
  const headers = output.headers;
  assert.equal(headers['access-control-allow-origin'], 'https://app.greybox.studio');
  assert.ok(headers['access-control-allow-methods'].includes('POST'));
  assert.ok(headers['access-control-allow-headers'].includes('authorization'));
  void request;
});

test('handleCorsPreflight rejects untrusted origins with 403', async () => {
  const policy = corsPolicyFromEnv({ GREYBOX_CLOUD_ALLOWED_ORIGINS: 'https://app.greybox.studio' })!;
  const { response, completed } = await runMockHandler(
    'OPTIONS',
    '/v1/anything',
    { origin: 'https://evil.example.com' },
    '',
    async (req, res) => {
      handleCorsPreflight(req, res, policy);
    },
  );
  await completed;
  assert.equal(response.statusCode, 403);
});

test('applyCorsHeaders is a no-op for non-allowed origins', async () => {
  const policy = corsPolicyFromEnv({ GREYBOX_CLOUD_ALLOWED_ORIGINS: 'https://app.greybox.studio' })!;
  const { response, completed, output } = await runMockHandler(
    'GET',
    '/healthz',
    { origin: 'https://evil.example.com' },
    '',
    async (req, res) => {
      applyCorsHeaders(res, policy, req.headers.origin?.toString());
      res.writeHead(200);
      res.end();
    },
  );
  await completed;
  assert.equal(response.statusCode, 200);
  assert.equal(output.headers['access-control-allow-origin'], undefined);
});

test('HttpRateLimiter rejects requests exceeding capacity', () => {
  let clock = 1_000;
  const limiter = new HttpRateLimiter({ capacity: 3, refillPerSecond: 1, now: () => clock });
  assert.equal(limiter.reserve('1.1.1.1').allowed, true);
  assert.equal(limiter.reserve('1.1.1.1').allowed, true);
  assert.equal(limiter.reserve('1.1.1.1').allowed, true);
  const denied = limiter.reserve('1.1.1.1');
  assert.equal(denied.allowed, false);
  assert.ok(denied.resetAt > clock, 'denied decision must include a future resetAt');

  clock += 1100;
  assert.equal(limiter.reserve('1.1.1.1').allowed, true, 'refill should restore one token after one second');
});

test('HttpRateLimiter scopes buckets by key', () => {
  const limiter = new HttpRateLimiter({ capacity: 1, refillPerSecond: 1, now: () => 0 });
  assert.equal(limiter.reserve('a').allowed, true);
  assert.equal(limiter.reserve('a').allowed, false, 'second hit from same key must be denied');
  assert.equal(limiter.reserve('b').allowed, true, 'different key gets a fresh bucket');
});

test('httpRateLimiterFromEnv requires both burst and per-second values', () => {
  assert.equal(httpRateLimiterFromEnv({}), undefined);
  assert.equal(
    httpRateLimiterFromEnv({ GREYBOX_CLOUD_HTTP_RATE_LIMIT_BURST: '60' }),
    undefined,
  );
  const limiter = httpRateLimiterFromEnv({
    GREYBOX_CLOUD_HTTP_RATE_LIMIT_BURST: '60',
    GREYBOX_CLOUD_HTTP_RATE_LIMIT_PER_SECOND: '1',
  });
  assert.ok(limiter, 'limiter must materialize when both env vars are configured');
});

test('clientKey prefers the leading x-forwarded-for entry', async () => {
  const { request, completed } = await runMockHandler(
    'GET',
    '/healthz',
    { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' },
    '',
    async (_req, res) => {
      res.writeHead(200);
      res.end();
    },
  );
  assert.equal(clientKey(request), '203.0.113.5');
  await completed;
});

test('clientKey falls back to socket remoteAddress without proxy header', async () => {
  const { request, completed } = await runMockHandler(
    'GET',
    '/healthz',
    {},
    '',
    async (_req, res) => {
      res.writeHead(200);
      res.end();
    },
  );
  const key = clientKey(request);
  assert.ok(typeof key === 'string' && key.length > 0);
  await completed;
});

test('maxPayloadBytesFromEnv returns default when unset and parses configured size', () => {
  assert.equal(maxPayloadBytesFromEnv({}), 1_048_576);
  assert.equal(maxPayloadBytesFromEnv({ GREYBOX_CLOUD_MAX_PAYLOAD_BYTES: '2048' }), 2048);
  assert.equal(
    maxPayloadBytesFromEnv({ GREYBOX_CLOUD_MAX_PAYLOAD_BYTES: 'not-a-number' }),
    1_048_576,
    'falls back to default on invalid input',
  );
});

test('readRawBodyWithLimit accepts bodies under the configured cap', async () => {
  const body = JSON.stringify({ message: 'ok' });
  const { request, completed } = await runMockHandler(
    'POST',
    '/v1/echo',
    { 'content-type': 'application/json' },
    body,
    async (_req, res) => {
      res.writeHead(200);
      res.end();
    },
  );
  const text = await readRawBodyWithLimit(request, 1024);
  assert.equal(text, body);
  await completed;
});

test('readJsonWithLimit throws PayloadTooLargeError when content-length exceeds cap', async () => {
  const body = 'x'.repeat(200);
  const { request, completed } = await runMockHandler(
    'POST',
    '/v1/echo',
    { 'content-type': 'application/json', 'content-length': String(body.length) },
    body,
    async (_req, res) => {
      res.writeHead(200);
      res.end();
    },
  );
  await assert.rejects(() => readJsonWithLimit(request, 64), PayloadTooLargeError);
  await completed;
});

test('readRawBodyWithLimit throws when streamed bytes exceed cap with no content-length', async () => {
  const body = 'x'.repeat(200);
  const { request, completed } = await runMockHandler(
    'POST',
    '/v1/echo',
    { 'content-type': 'application/json' },
    body,
    async (_req, res) => {
      res.writeHead(200);
      res.end();
    },
    /* stripContentLength */ true,
  );
  await assert.rejects(() => readRawBodyWithLimit(request, 64), PayloadTooLargeError);
  await completed;
});

interface MockHandlerResult {
  request: IncomingMessage;
  response: ServerResponse;
  completed: Promise<void>;
  output: { headers: Record<string, string> };
}

async function runMockHandler(
  method: string,
  pathname: string,
  headers: Record<string, string>,
  body: string,
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
  stripContentLength = false,
): Promise<MockHandlerResult> {
  return await new Promise((resolve, reject) => {
    const output: { headers: Record<string, string> } = { headers: {} };
    const server = createServer((req, res) => {
      // Buffer body chunks as they arrive on the wire and re-emit them via a
      // wrapped async iterator. Without this Node 25 flushes the request
      // stream as soon as the handler ends the response, leaving any later
      // consumer (the test calling readRawBodyWithLimit) with zero bytes.
      // The wrapper preserves the IncomingMessage shape (headers, method,
      // url, content-length) so payloadLimit.ts's logic exercises unchanged.
      const bufferedChunks: Buffer[] = [];
      req.on('data', (chunk) => {
        bufferedChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      const bodyReceived = new Promise<void>((resolveBody) => {
        req.once('end', () => resolveBody());
        req.once('close', () => resolveBody());
      });
      // Replay buffered events when a late consumer registers .on('data'|'end').
      // payloadLimit.ts uses event-based reads (more reliable across Node
      // versions than for-await), so the proxy must support both modes.
      const replayEvent = (event: string, listener: (...args: unknown[]) => void): void => {
        void bodyReceived.then(() => {
          if (event === 'data') {
            for (const chunk of bufferedChunks) listener(chunk);
          } else if (event === 'end' || event === 'close') {
            listener();
          }
        });
      };
      const wrappedRequest = new Proxy(req, {
        get(target, prop, receiver) {
          if (prop === Symbol.asyncIterator) {
            return async function* (): AsyncIterableIterator<Buffer> {
              await bodyReceived;
              for (const chunk of bufferedChunks) yield chunk;
            };
          }
          if (prop === 'complete') {
            // Lie about completion so readRawBodyWithLimit's early-return
            // doesn't fire before we've replayed buffered events.
            return false;
          }
          if (prop === 'on' || prop === 'addListener') {
            return (event: string, listener: (...args: unknown[]) => void) => {
              if (event === 'data' || event === 'end' || event === 'close') {
                replayEvent(event, listener);
                return wrappedRequest;
              }
              return (target as IncomingMessage).on(event, listener);
            };
          }
          if (prop === 'once') {
            return (event: string, listener: (...args: unknown[]) => void) => {
              if (event === 'data' || event === 'end' || event === 'close') {
                replayEvent(event, listener);
                return wrappedRequest;
              }
              return (target as IncomingMessage).once(event, listener);
            };
          }
          if (prop === 'removeListener' || prop === 'off') {
            // No-op: replayEvent uses one-shot listeners via the promise.
            return () => wrappedRequest;
          }
          return Reflect.get(target, prop, receiver);
        },
      }) as IncomingMessage;
      const writeHead = res.writeHead.bind(res);
      const setHeader = res.setHeader.bind(res);
      res.setHeader = (name: string, value: number | string | readonly string[]) => {
        output.headers[name.toLowerCase()] = String(value);
        return setHeader(name, value);
      };
      res.writeHead = ((status: number, ...rest: unknown[]) => {
        const last = rest[rest.length - 1];
        if (last && typeof last === 'object' && !Array.isArray(last)) {
          for (const [k, v] of Object.entries(last as Record<string, string>)) {
            output.headers[k.toLowerCase()] = String(v);
          }
        }
        return writeHead(status, ...(rest as []));
      }) as typeof res.writeHead;
      const finished = new Promise<void>((finishedResolve) => {
        if (res.writableEnded) finishedResolve();
        else res.on('finish', () => finishedResolve());
      });
      void handler(req, res)
        .then(() => {
          resolve({
            request: wrappedRequest,
            response: res,
            completed: finished.then(() => {
              server.close();
            }),
            output,
          });
        })
        .catch((error) => {
          server.close();
          reject(error);
        });
    });
    server.on('error', (error) => {
      server.close();
      reject(error);
    });
    server.listen(0, '127.0.0.1', () => {
      try {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('no server address');
        const port = address.port;
        const requestHeaders: Record<string, string> = { ...headers };
        if (!stripContentLength && body && !requestHeaders['content-length']) {
          requestHeaders['content-length'] = String(Buffer.byteLength(body, 'utf8'));
        }
        const clientRequest = httpRequest({
          host: '127.0.0.1',
          port,
          method,
          path: pathname,
          headers: requestHeaders,
        });
        clientRequest.on('error', (error) => {
          server.close();
          reject(error);
        });
        clientRequest.on('response', (response) => {
          response.resume();
        });
        if (body) clientRequest.write(body);
        clientRequest.end();
      } catch (error) {
        server.close();
        reject(error);
      }
    });
  });
}
