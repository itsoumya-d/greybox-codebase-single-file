// SPDX-License-Identifier: Apache-2.0
/**
 * Tiny id helper. Call-sites stay imperative (`generateId()`) and can be
 * swapped in tests for deterministic ids.
 */

/** Default id length matches the schema's permissive constraints (<=128). */
const DEFAULT_LENGTH = 10;

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Generate a fresh url-safe id. */
export function generateId(length: number = DEFAULT_LENGTH): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => B64URL[b & 63]!).join('');
}
