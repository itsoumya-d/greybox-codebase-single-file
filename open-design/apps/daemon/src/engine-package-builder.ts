// SPDX-License-Identifier: Apache-2.0

import { createHash } from 'node:crypto';
import path from 'node:path';

import type {
  GameEnginePackageManifest,
  GameEnginePackageManifestFile,
  GameEngineRuntimeGeneratedFile,
  GameEngineRuntimeResponse,
} from '@ai-game-design-studio/contracts/api/projects';
import JSZip from 'jszip';

export interface EnginePackageBuildInput {
  projectId: string;
  projectName: string;
  runtime: GameEngineRuntimeResponse;
  designerName?: string;
}

export interface EnginePackageBuildResult {
  buffer: Buffer;
  fileName: string;
  fileCount: number;
  contentRevisionSha256: string;
  manifest: GameEnginePackageManifest;
}

const MAX_PACKAGE_FILE_BYTES = 5 * 1024 * 1024;
const MAX_PACKAGE_FILES = 80;

function safeSlug(value: string): string {
  return value
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'greybox-project';
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function contentRevisionSha256(files: GameEnginePackageManifestFile[]): string {
  const hash = createHash('sha256');
  for (const file of [...files].sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))) {
    hash.update(file.path);
    hash.update('\0');
    hash.update(file.language);
    hash.update('\0');
    hash.update(file.purpose);
    hash.update('\0');
    hash.update(file.sha256);
    hash.update('\0');
    hash.update(String(file.bytes));
    hash.update('\n');
  }
  return hash.digest('hex');
}

function safeZipPath(file: GameEngineRuntimeGeneratedFile): string {
  const normalized = file.path.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  if (
    parts.length === 0
    || normalized.startsWith('/')
    || /^[A-Za-z]:/u.test(normalized)
    || parts.some((part) => part === '.' || part === '..' || part.includes('\0'))
  ) {
    throw new Error(`unsafe engine package path: ${file.path}`);
  }
  return parts.join('/');
}

function safeRuntimeFiles(runtime: GameEngineRuntimeResponse): Array<GameEngineRuntimeGeneratedFile & { zipPath: string }> {
  const files = runtime.files ?? [];
  if (runtime.engine === 'webgl-canvas' || files.length === 0) {
    throw new Error('engine package export requires native runtime files');
  }
  return files.slice(0, MAX_PACKAGE_FILES).map((file) => {
    const bytes = Buffer.byteLength(file.content, 'utf8');
    if (bytes > MAX_PACKAGE_FILE_BYTES) {
      throw new Error(`engine package file is too large: ${file.path}`);
    }
    return {
      ...file,
      zipPath: safeZipPath(file),
    };
  });
}

export async function buildEnginePackageFromRuntime(input: EnginePackageBuildInput): Promise<EnginePackageBuildResult> {
  const engine = input.runtime.engine;
  if (engine === 'webgl-canvas') {
    throw new Error('engine package export requires native runtime files');
  }
  const files = safeRuntimeFiles(input.runtime);
  const generatedAt = new Date(input.runtime.generatedAt || Date.now()).toISOString();
  const manifestFiles = files.map((file) => ({
    path: file.zipPath,
    language: file.language,
    purpose: file.purpose,
    sha256: sha256(file.content),
    bytes: Buffer.byteLength(file.content, 'utf8'),
  }));
  const contentRevision = contentRevisionSha256(manifestFiles);
  const manifest: GameEnginePackageManifest = {
    generator: `Greybox + ${input.designerName?.trim() || 'human designer'}`,
    projectId: input.projectId,
    projectName: input.projectName || input.projectId,
    sourceFileName: input.runtime.fileName,
    engine,
    contentRevisionSha256: contentRevision,
    runtimeHooks: input.runtime.runtimeHooks,
    terrainColliderCount: input.runtime.terrainColliderCount,
    terrainSculptPatchCount: input.runtime.terrainSculptPatchCount,
    dynamicEventCount: input.runtime.dynamicEventCount,
    factionCount: input.runtime.factionCount,
    files: manifestFiles,
    generatedAt,
  };
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.zipPath, file.content);
  }
  zip.file('GreyboxEnginePackageManifest.json', JSON.stringify(manifest, null, 2));
  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    // Native editor plugins parse these tiny runtime-hook archives directly so
    // keep entries stored instead of requiring every engine to ship a deflater.
    compression: 'STORE',
    platform: 'UNIX',
  });
  const engineSlug = safeSlug(input.runtime.engine);
  const projectSlug = safeSlug(input.projectName || input.projectId);
  const sourceSlug = safeSlug(path.basename(input.runtime.fileName).replace(/\.[^.]+(?:\.json)?$/i, ''));
  return {
    buffer,
    fileName: `${projectSlug}-${sourceSlug}-${engineSlug}.zip`,
    fileCount: files.length + 1,
    contentRevisionSha256: contentRevision,
    manifest,
  };
}
