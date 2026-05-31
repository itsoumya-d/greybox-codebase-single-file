// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import type { IncomingMessage } from 'node:http';

export class PayloadTooLargeError extends Error {
  readonly maxBytes: number;
  readonly receivedBytes: number;
  constructor(maxBytes: number, receivedBytes: number) {
    super(`request body exceeded ${maxBytes} bytes (received at least ${receivedBytes})`);
    this.name = 'PayloadTooLargeError';
    this.maxBytes = maxBytes;
    this.receivedBytes = receivedBytes;
  }
}

const DEFAULT_MAX_BYTES = 1_048_576;

export function maxPayloadBytesFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  const value = env.GREYBOX_CLOUD_MAX_PAYLOAD_BYTES;
  if (!value) return DEFAULT_MAX_BYTES;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_BYTES;
  return parsed;
}

export async function readRawBodyWithLimit(request: IncomingMessage, maxBytes: number): Promise<string> {
  if (maxBytes <= 0) throw new Error('maxBytes must be > 0');
  const declared = request.headers['content-length'];
  if (declared) {
    const length = Number.parseInt(Array.isArray(declared) ? (declared[0] ?? '') : declared, 10);
    if (Number.isFinite(length) && length > maxBytes) {
      throw new PayloadTooLargeError(maxBytes, length);
    }
  }

  // Use event-based reading rather than `for await` so that semantics are
  // stable across Node versions. Node 25 changed when the async iterator on
  // IncomingMessage flushes pending chunks, and consumers that subscribe via
  // `for await` after the stream has buffered data can miss chunks.
  return await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let received = 0;
    let settled = false;

    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      request.removeListener('data', onData);
      request.removeListener('end', onEnd);
      request.removeListener('error', fail);
      request.removeListener('aborted', onAborted);
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    const onData = (chunk: unknown): void => {
      if (settled) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      received += buffer.length;
      if (received > maxBytes) {
        fail(new PayloadTooLargeError(maxBytes, received));
        try {
          request.destroy();
        } catch {
          // Swallow: stream may already be closed.
        }
        return;
      }
      chunks.push(buffer);
    };

    const onEnd = (): void => {
      if (settled) return;
      settled = true;
      request.removeListener('data', onData);
      request.removeListener('end', onEnd);
      request.removeListener('error', fail);
      request.removeListener('aborted', onAborted);
      resolve(Buffer.concat(chunks).toString('utf8'));
    };

    const onAborted = (): void => fail(new Error('request aborted before body received'));

    request.on('data', onData);
    request.on('end', onEnd);
    request.on('error', fail);
    request.on('aborted', onAborted);

    if ((request as IncomingMessage & { complete?: boolean }).complete === true) {
      // Stream already finished (e.g. body buffered before listeners attached).
      // The `end` event won't fire again on a finished stream, so resolve now.
      onEnd();
    }
  });
}

export async function readJsonWithLimit(request: IncomingMessage, maxBytes: number): Promise<unknown> {
  const text = await readRawBodyWithLimit(request, maxBytes);
  return text ? JSON.parse(text) : {};
}
