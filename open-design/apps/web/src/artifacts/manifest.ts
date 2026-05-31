import type {
  ArtifactExportKind,
  ArtifactKind,
  ArtifactManifest,
  ArtifactRendererId,
  ArtifactStatus,
} from './types';

const MANIFEST_VERSION = 1;
const LEGACY_ART_BIBLE_KIND = ['design', 'system'].join('-');
const LEGACY_ART_BIBLE_ID_KEY = 'design'.concat('SystemId');
const LEGACY_PLAYABLE_PROTOTYPE_KIND = 'mini-app'; // legacy manifest alias
const LEGACY_REACT_COMPONENT_KIND = 'react-component'; // legacy manifest alias
const REACT_GAME_MODULE_KIND = 'react-game-module';

type RawArtifactManifest = Omit<Partial<ArtifactManifest>, 'kind' | 'renderer'> & {
  kind?: string;
  renderer?: string;
} & Record<string, unknown>;

const ALLOWED_KINDS: ReadonlySet<string> = new Set([
  'html',
  'deck',
  REACT_GAME_MODULE_KIND,
  'markdown-document',
  'svg',
  'diagram',
  'code-snippet',
  'playable-prototype',
  'game-art-bible',
  LEGACY_REACT_COMPONENT_KIND,
  LEGACY_PLAYABLE_PROTOTYPE_KIND,
  LEGACY_ART_BIBLE_KIND,
]);
const ALLOWED_RENDERERS: ReadonlySet<string> = new Set([
  'html',
  'deck-html',
  REACT_GAME_MODULE_KIND,
  'markdown',
  'svg',
  'diagram',
  'code',
  'playable-prototype',
  'game-art-bible',
  LEGACY_REACT_COMPONENT_KIND,
  LEGACY_PLAYABLE_PROTOTYPE_KIND,
  LEGACY_ART_BIBLE_KIND,
]);
const ALLOWED_EXPORTS: ReadonlySet<ArtifactExportKind> = new Set([
  'html',
  'pdf',
  'zip',
  'pptx',
  'jsx',
  'md',
  'svg',
  'txt',
]);
const ALLOWED_STATUS: ReadonlySet<ArtifactStatus> = new Set(['streaming', 'complete', 'error']);

function normalizeExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

function inferKindFromEntry(entry: string): ArtifactKind | null {
  const ext = normalizeExt(entry);
  if (['.html', '.htm'].includes(ext)) return 'html';
  if (ext === '.svg') return 'svg';
  if (ext === '.md') return 'markdown-document';
  if (['.jsx', '.tsx'].includes(ext)) return REACT_GAME_MODULE_KIND;
  if (['.js', '.ts', '.json', '.css'].includes(ext)) return 'code-snippet';
  return null;
}

function exportsForKind(kind: ArtifactKind): ArtifactExportKind[] {
  if (kind === 'deck') return ['html', 'pdf', 'pptx', 'zip'];
  if (kind === REACT_GAME_MODULE_KIND) return ['jsx', 'html', 'zip'];
  if (kind === 'markdown-document') return ['md', 'html', 'pdf', 'zip'];
  if (kind === 'svg' || kind === 'diagram') return ['svg', 'zip'];
  if (kind === 'code-snippet') return ['txt', 'zip'];
  return ['html', 'pdf', 'zip'];
}

export function artifactManifestNameFor(entry: string): string {
  return `${entry}.artifact.json`;
}

export function createHtmlArtifactManifest(input: {
  entry: string;
  title: string;
  metadata?: Record<string, unknown>;
  sourceSkillId?: string;
  gameArtBibleId?: string | null;
}): ArtifactManifest {
  const now = new Date().toISOString();
  return {
    version: MANIFEST_VERSION,
    kind: 'html',
    title: input.title,
    entry: input.entry,
    renderer: 'html',
    status: 'complete',
    exports: ['html', 'pdf', 'zip'],
    createdAt: now,
    updatedAt: now,
    sourceSkillId: input.sourceSkillId,
    gameArtBibleId: input.gameArtBibleId ?? undefined,
    metadata: input.metadata,
  };
}

export function serializeArtifactManifest(manifest: ArtifactManifest): string {
  return JSON.stringify(manifest, null, 2);
}

export function parseArtifactManifest(raw: string): ArtifactManifest | null {
  try {
    const parsed = JSON.parse(raw) as RawArtifactManifest;
    if (parsed?.version !== MANIFEST_VERSION) return null;
    if (typeof parsed.entry !== 'string' || !parsed.entry) return null;
    if (typeof parsed.title !== 'string' || !parsed.title) return null;
    if (!Array.isArray(parsed.exports)) return null;
    if (typeof parsed.kind !== 'string' || typeof parsed.renderer !== 'string') {
      return null;
    }
    if (!ALLOWED_KINDS.has(parsed.kind)) return null;
    if (!ALLOWED_RENDERERS.has(parsed.renderer)) return null;
    if (parsed.status !== undefined && !ALLOWED_STATUS.has(parsed.status as ArtifactStatus)) {
      return null;
    }
    if (parsed.exports.length === 0) return null;
    if (parsed.exports.some((value) => !ALLOWED_EXPORTS.has(value as ArtifactExportKind))) return null;
    const gameArtBibleId =
      typeof parsed.gameArtBibleId === 'string' || parsed.gameArtBibleId === null
        ? parsed.gameArtBibleId
        : typeof parsed[LEGACY_ART_BIBLE_ID_KEY] === 'string' || parsed[LEGACY_ART_BIBLE_ID_KEY] === null
          ? parsed[LEGACY_ART_BIBLE_ID_KEY]
          : undefined;
    const kind = parsed.kind === LEGACY_ART_BIBLE_KIND
      ? 'game-art-bible'
      : parsed.kind === LEGACY_PLAYABLE_PROTOTYPE_KIND
        ? 'playable-prototype'
        : parsed.kind === LEGACY_REACT_COMPONENT_KIND
          ? REACT_GAME_MODULE_KIND
        : parsed.kind as ArtifactKind;
    const renderer = parsed.renderer === LEGACY_ART_BIBLE_KIND
      ? 'game-art-bible'
      : parsed.renderer === LEGACY_PLAYABLE_PROTOTYPE_KIND
        ? 'playable-prototype'
        : parsed.renderer === LEGACY_REACT_COMPONENT_KIND
          ? REACT_GAME_MODULE_KIND
        : parsed.renderer as ArtifactRendererId;
    return {
      version: MANIFEST_VERSION,
      kind,
      title: parsed.title,
      entry: parsed.entry,
      renderer,
      status: ALLOWED_STATUS.has(parsed.status as ArtifactStatus)
        ? (parsed.status as ArtifactStatus)
        : 'complete',
      exports: parsed.exports as ArtifactExportKind[],
      supportingFiles: Array.isArray(parsed.supportingFiles)
        ? parsed.supportingFiles.filter((x): x is string => typeof x === 'string')
        : undefined,
      createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : undefined,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : undefined,
      sourceSkillId: typeof parsed.sourceSkillId === 'string' ? parsed.sourceSkillId : undefined,
      gameArtBibleId,
      metadata:
        parsed.metadata && typeof parsed.metadata === 'object' && !Array.isArray(parsed.metadata)
          ? parsed.metadata
          : undefined,
    };
  } catch {
    return null;
  }
}

export function inferLegacyManifest(input: {
  entry: string;
  title?: string;
  metadata?: Record<string, unknown>;
}): ArtifactManifest | null {
  const kind = inferKindFromEntry(input.entry);
  if (!kind) return null;
  const lowerEntry = input.entry.toLowerCase();
  const isDeck =
    kind === 'html' &&
    (lowerEntry.includes('deck') || lowerEntry.includes('slides') || lowerEntry.includes('pitch'));
  const renderer: ArtifactRendererId =
    isDeck
      ? 'deck-html'
      : kind === 'html'
        ? 'html'
        : kind === 'markdown-document'
          ? 'markdown'
          : kind === REACT_GAME_MODULE_KIND
            ? REACT_GAME_MODULE_KIND
            : kind === 'code-snippet'
              ? 'code'
              : kind === 'deck'
                ? 'deck-html'
                : kind;
  const resolvedKind = isDeck ? 'deck' : kind;
  return {
    version: MANIFEST_VERSION,
    kind: resolvedKind,
    title: input.title || input.entry,
    entry: input.entry,
    renderer,
    status: 'complete',
    exports: exportsForKind(resolvedKind),
    metadata: input.metadata,
  };
}
