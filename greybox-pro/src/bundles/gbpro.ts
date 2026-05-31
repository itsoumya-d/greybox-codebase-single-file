// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  sign,
  type KeyObject,
  verify,
} from 'node:crypto';

import type {
  GbproEncryptedPayloadEnvelope,
  GbproPayload,
  ProModuleBundleEnvelope,
  ProModuleDefinition,
  ProModuleManifest,
} from '../types.js';
import { PRO_MODULE_BUNDLE_FORMAT } from '../types.js';
import { stableStringify } from './stableStringify.js';

export type KeyLike = KeyObject | string | Buffer;

export type GbproVerifyCode =
  | 'GBPRO_BAD_JSON'
  | 'GBPRO_BAD_FORMAT'
  | 'GBPRO_UNSIGNED'
  | 'GBPRO_UNKNOWN_KEY'
  | 'GBPRO_BAD_SIGNATURE'
  | 'GBPRO_SIGNATURE_INVALID'
  | 'GBPRO_PAYLOAD_MISSING'
  | 'GBPRO_PAYLOAD_DIGEST_MISMATCH';

export type GbproVerifyResult =
  | { ok: true; envelope: ProModuleBundleEnvelope }
  | { ok: false; code: GbproVerifyCode; message: string };

export interface GbproBundleOptions {
  privateKey: KeyLike;
  keyId: string;
  licenseSecret: string | Buffer;
  nonce?: Buffer;
}

const MIN_LICENSE_SECRET_BYTES = 24;

function sha256(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

function keyFromSecret(secret: string | Buffer): Buffer {
  const bytes = licenseSecretBytes(secret);
  return createHash('sha256').update(bytes).digest();
}

function licenseSecretBytes(secret: string | Buffer): Buffer {
  const bytes = Buffer.isBuffer(secret) ? secret : Buffer.from(secret, 'utf8');
  if (typeof secret === 'string' && secret.trim() !== secret) {
    throw new Error('gbpro license secret must not include leading or trailing whitespace');
  }
  if (bytes.length < MIN_LICENSE_SECRET_BYTES) {
    throw new Error(`gbpro license secret must be at least ${MIN_LICENSE_SECRET_BYTES} bytes`);
  }
  return bytes;
}

function normalizePrivateKey(key: KeyLike): KeyObject {
  return typeof key === 'string' || Buffer.isBuffer(key) ? createPrivateKey(key) : key;
}

function normalizePublicKey(key: KeyLike): KeyObject {
  return typeof key === 'string' || Buffer.isBuffer(key) ? createPublicKey(key) : key;
}

function parseEnvelope(raw: ProModuleBundleEnvelope | Buffer | string): ProModuleBundleEnvelope | undefined {
  if (typeof raw === 'object' && !Buffer.isBuffer(raw) && 'format' in raw) return raw;
  try {
    const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : raw;
    return JSON.parse(text) as ProModuleBundleEnvelope;
  } catch {
    return undefined;
  }
}

export function createProModuleSigningPayload(input: {
  format: typeof PRO_MODULE_BUNDLE_FORMAT;
  manifest: ProModuleManifest;
  payloadSha256: string;
}): string {
  return stableStringify({
    format: input.format,
    manifest: input.manifest,
    payloadSha256: input.payloadSha256.toLowerCase(),
  });
}

export function encryptedPayloadDigest(encryptedPayload: string): string {
  return sha256(Buffer.from(encryptedPayload, 'utf8'));
}

export function createGbproPayload(module: ProModuleDefinition): GbproPayload {
  return {
    generatedBy: 'greybox-pro',
    license: 'proprietary',
    moduleId: module.manifest.id,
    version: module.manifest.version,
    files: module.files,
  };
}

export function createEncryptedPayload(
  module: ProModuleDefinition,
  licenseSecret: string | Buffer,
  nonce: Buffer = randomBytes(12),
): string {
  if (nonce.length !== 12) throw new Error('gbpro AES-GCM nonce must be 12 bytes');
  const cipher = createCipheriv('aes-256-gcm', keyFromSecret(licenseSecret), nonce);
  cipher.setAAD(Buffer.from(stableStringify(module.manifest), 'utf8'));
  const plaintext = Buffer.from(stableStringify(createGbproPayload(module)), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const envelope: GbproEncryptedPayloadEnvelope = {
    algorithm: 'aes-256-gcm',
    keyDerivation: 'sha256-license-secret',
    nonce: nonce.toString('base64url'),
    authTag: cipher.getAuthTag().toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
  };
  return Buffer.from(stableStringify(envelope), 'utf8').toString('base64url');
}

export function createGbproBundle(module: ProModuleDefinition, options: GbproBundleOptions): ProModuleBundleEnvelope {
  const encryptedPayload = createEncryptedPayload(module, options.licenseSecret, options.nonce);
  const payloadSha256 = encryptedPayloadDigest(encryptedPayload);
  const signingPayload = createProModuleSigningPayload({
    format: PRO_MODULE_BUNDLE_FORMAT,
    manifest: module.manifest,
    payloadSha256,
  });
  const signature = sign(null, Buffer.from(signingPayload, 'utf8'), normalizePrivateKey(options.privateKey));
  return {
    format: PRO_MODULE_BUNDLE_FORMAT,
    manifest: module.manifest,
    payloadSha256,
    encryptedPayload,
    signature: {
      algorithm: 'ed25519',
      keyId: options.keyId,
      value: signature.toString('base64url'),
      signedFields: 'format+manifest+payloadSha256',
    },
  };
}

export function verifyGbproBundleSignature(
  raw: ProModuleBundleEnvelope | Buffer | string,
  publicKeys: Readonly<Record<string, KeyLike>>,
): GbproVerifyResult {
  const envelope = parseEnvelope(raw);
  if (!envelope) return { ok: false, code: 'GBPRO_BAD_JSON', message: 'bundle must be a JSON envelope' };
  if (envelope.format !== PRO_MODULE_BUNDLE_FORMAT) {
    return { ok: false, code: 'GBPRO_BAD_FORMAT', message: `expected ${PRO_MODULE_BUNDLE_FORMAT}` };
  }
  if (!envelope.signature) return { ok: false, code: 'GBPRO_UNSIGNED', message: 'bundle is unsigned' };
  if (!/^[a-f0-9]{64}$/u.test(envelope.payloadSha256)) {
    return { ok: false, code: 'GBPRO_BAD_SIGNATURE', message: 'payloadSha256 must be a lowercase SHA-256 digest' };
  }
  if (typeof envelope.signature.value !== 'string' || envelope.signature.value.length === 0) {
    return { ok: false, code: 'GBPRO_BAD_SIGNATURE', message: 'signature value is required' };
  }
  if (envelope.signature.signedFields && envelope.signature.signedFields !== 'format+manifest+payloadSha256') {
    return { ok: false, code: 'GBPRO_BAD_SIGNATURE', message: 'signature signedFields are not supported' };
  }
  const trustedKey = publicKeys[envelope.signature.keyId];
  if (!trustedKey) return { ok: false, code: 'GBPRO_UNKNOWN_KEY', message: 'signature key is not trusted' };
  if (envelope.signature.algorithm !== 'ed25519') {
    return { ok: false, code: 'GBPRO_BAD_SIGNATURE', message: 'signature must use ed25519' };
  }
  if (typeof envelope.encryptedPayload !== 'string' || envelope.encryptedPayload.length === 0) {
    return { ok: false, code: 'GBPRO_PAYLOAD_MISSING', message: 'encrypted payload is required' };
  }
  if (encryptedPayloadDigest(envelope.encryptedPayload) !== envelope.payloadSha256) {
    return { ok: false, code: 'GBPRO_PAYLOAD_DIGEST_MISMATCH', message: 'encrypted payload digest does not match' };
  }
  const signingPayload = createProModuleSigningPayload({
    format: PRO_MODULE_BUNDLE_FORMAT,
    manifest: envelope.manifest,
    payloadSha256: envelope.payloadSha256,
  });
  const valid = verify(
    null,
    Buffer.from(signingPayload, 'utf8'),
    normalizePublicKey(trustedKey),
    Buffer.from(envelope.signature.value, 'base64url'),
  );
  if (!valid) return { ok: false, code: 'GBPRO_SIGNATURE_INVALID', message: 'signature does not match bundle metadata' };
  return { ok: true, envelope };
}

export function decryptGbproBundle(raw: ProModuleBundleEnvelope | Buffer | string, licenseSecret: string | Buffer): GbproPayload {
  const envelope = parseEnvelope(raw);
  if (!envelope?.encryptedPayload) throw new Error('gbpro bundle is missing encrypted payload');
  if (encryptedPayloadDigest(envelope.encryptedPayload) !== envelope.payloadSha256) {
    throw new Error('gbpro encrypted payload digest mismatch');
  }
  const encrypted = JSON.parse(Buffer.from(envelope.encryptedPayload, 'base64url').toString('utf8')) as GbproEncryptedPayloadEnvelope;
  if (encrypted.algorithm !== 'aes-256-gcm' || encrypted.keyDerivation !== 'sha256-license-secret') {
    throw new Error('unsupported gbpro encryption envelope');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    keyFromSecret(licenseSecret),
    Buffer.from(encrypted.nonce, 'base64url'),
  );
  decipher.setAAD(Buffer.from(stableStringify(envelope.manifest), 'utf8'));
  decipher.setAuthTag(Buffer.from(encrypted.authTag, 'base64url'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, 'base64url')),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString('utf8')) as GbproPayload;
}
