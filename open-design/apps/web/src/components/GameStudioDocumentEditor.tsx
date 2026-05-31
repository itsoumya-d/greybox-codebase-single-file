import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  GAME_STUDIO_DOCUMENT_SCHEMAS,
  type ProjectStudioDocumentOperation,
  type ProjectStudioDocumentDraftOperationSsePayload,
} from '@ai-game-design-studio/contracts';
import {
  applyProjectStudioDocumentDraftOperations,
  applyProjectStudioDocumentOperations,
  fetchProjectFileText,
  writeProjectTextFile,
} from '../providers/registry';
import { useT } from '../i18n';
import { randomUUID } from '../utils/uuid';
import type {
  BehaviorTreeDocument,
  BehaviorTreeNode,
  GameNodeGraphDocument,
  GameNodeGraphNode,
  GameSystemSpecDocument,
  GameViewportDocument,
  GameViewportEntity,
  ProjectFile,
  ProjectStudioPresenceCursor,
  ProjectStudioPresenceSsePayload,
} from '../types';

type GameStudioDocument =
  | GameViewportDocument
  | GameNodeGraphDocument
  | BehaviorTreeDocument
  | GameSystemSpecDocument;

type GameViewportCameraPlan = NonNullable<GameViewportDocument['cameraPlan']>[number];
type GameViewportTerrainZone = NonNullable<GameViewportDocument['terrainZones']>[number];
type GameViewportTerrainPaintStroke = NonNullable<GameViewportDocument['terrainPaintStrokes']>[number];
type GameViewportTerrainSculptPatch = NonNullable<GameViewportDocument['terrainSculptPatches']>[number];
type StudioTranslator = ReturnType<typeof useT>;

type StudioDocKind = Extract<
  ProjectFile['kind'],
  'game-viewport' | 'node-graph' | 'behavior-tree' | 'game-system'
>;

const STUDIO_DOCUMENT_ACTOR_ID_STORAGE_KEY = 'agds:studioDocumentActorId';
const LIVE_SOURCE_MERGE_DELAY_MS = 650;

interface HierarchyItem {
  id: string;
  label: string;
  meta: string;
}

interface StudioInsightItem {
  id: string;
  label: string;
  meta?: string;
  body: string;
}

interface StudioDocumentChromeLabels {
  collaborator: string;
  liveCursors: string;
}

interface Props {
  projectId: string;
  file: ProjectFile & { kind: StudioDocKind };
  onFileSaved?: () => Promise<void> | void;
  onPresenceCursorChange?: (cursor: ProjectStudioPresenceCursor) => void;
  remotePresence?: ProjectStudioPresenceSsePayload[];
  sourceDraft?: ProjectStudioDocumentDraftOperationSsePayload;
}

export function isGameStudioDocumentKind(kind: ProjectFile['kind']): kind is StudioDocKind {
  return (
    kind === 'game-viewport' ||
    kind === 'node-graph' ||
    kind === 'behavior-tree' ||
    kind === 'game-system'
  );
}

export function normalizeGameStudioDocumentForKind(
  kind: StudioDocKind,
  value: unknown,
  fileName = 'studio-document',
): GameStudioDocument {
  const record = isRecord(value) ? value : {};
  if (kind === 'game-viewport') return normalizeViewport(record, fileName);
  if (kind === 'node-graph') return normalizeNodeGraph(record, fileName);
  if (kind === 'behavior-tree') return normalizeBehaviorTree(record, fileName);
  return normalizeGameSystem(record, fileName);
}

export function validateGameStudioDocumentForKind(
  kind: StudioDocKind,
  value: GameStudioDocument,
  t?: StudioTranslator,
): { ok: true; document: GameStudioDocument } | { ok: false; error: string } {
  const result = GAME_STUDIO_DOCUMENT_SCHEMAS[kind].safeParse(value);
  if (result.success) {
    return { ok: true, document: result.data as GameStudioDocument };
  }
  return { ok: false, error: formatStudioSchemaError(result.error, t) };
}

function readOrCreateStudioDocumentActorId(): string {
  if (typeof window === 'undefined') return `studio-doc-${randomUUID()}`;
  try {
    const existing = window.localStorage.getItem(STUDIO_DOCUMENT_ACTOR_ID_STORAGE_KEY);
    if (existing && /^[A-Za-z0-9._-]{1,128}$/.test(existing)) return existing;
    const next = `studio-doc-${randomUUID()}`;
    window.localStorage.setItem(STUDIO_DOCUMENT_ACTOR_ID_STORAGE_KEY, next);
    return next;
  } catch {
    return `studio-doc-${randomUUID()}`;
  }
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

function buildStudioDocumentTextSpliceOperation(
  previousContent: string,
  nextContent: string,
  actorId: string,
): ProjectStudioDocumentOperation | null {
  if (previousContent === nextContent) return null;
  let start = 0;
  while (
    start < previousContent.length &&
    start < nextContent.length &&
    previousContent[start] === nextContent[start]
  ) {
    start += 1;
  }
  let previousEnd = previousContent.length - 1;
  let nextEnd = nextContent.length - 1;
  while (
    previousEnd >= start &&
    nextEnd >= start &&
    previousContent[previousEnd] === nextContent[nextEnd]
  ) {
    previousEnd -= 1;
    nextEnd -= 1;
  }
  const now = Date.now();
  return {
    id: `browser-${randomUUID()}`,
    actorId,
    type: 'text-splice',
    path: ['__source__'],
    value: {
      index: start,
      deleteCount: Math.max(0, previousEnd - start + 1),
      insertText: nextContent.slice(start, nextEnd + 1),
    },
    lamport: now,
    createdAt: now,
  };
}

function buildStudioDocumentOperations(
  previousDocument: GameStudioDocument,
  nextDocument: GameStudioDocument,
  actorId: string,
): ProjectStudioDocumentOperation[] {
  const previous: Record<string, unknown> = isRecord(previousDocument) ? previousDocument : {};
  const next: Record<string, unknown> = isRecord(nextDocument) ? nextDocument : {};
  const keys = Array.from(new Set([...Object.keys(previous), ...Object.keys(next)])).sort();
  const now = Date.now();
  const operations: ProjectStudioDocumentOperation[] = [];
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(next, key)) {
      operations.push({
        id: `browser-${randomUUID()}`,
        actorId,
        type: 'json-delete',
        path: [key],
        lamport: now + operations.length,
        createdAt: now,
      });
      continue;
    }
    if (
      Object.prototype.hasOwnProperty.call(previous, key) &&
      stableJson(previous[key]) === stableJson(next[key])
    ) {
      continue;
    }
    operations.push({
      id: `browser-${randomUUID()}`,
      actorId,
      type: 'json-set',
      path: [key],
      value: next[key],
      lamport: now + operations.length,
      createdAt: now,
    });
  }
  return operations;
}

function presenceSelectionKindForDocument(kind: StudioDocKind): ProjectStudioPresenceCursor['selectionKind'] {
  return kind === 'game-viewport' ? 'region' : 'node';
}

function sourceCursorForOffset(text: string, offset: number, label: string): ProjectStudioPresenceCursor {
  const safeOffset = Math.max(0, Math.min(text.length, offset));
  const beforeCursor = text.slice(0, safeOffset);
  const lines = beforeCursor.split('\n');
  return {
    selectionKind: 'cursor',
    selectionLabel: label,
    line: lines.length,
    column: (lines.at(-1) ?? '').length + 1,
  };
}

function remotePresenceCursorLabel(presence: ProjectStudioPresenceSsePayload, viewingLabel: string): string {
  const cursor = presence.cursor;
  if (!cursor) return viewingLabel;
  const parts: string[] = [];
  if (cursor.selectionLabel) parts.push(cursor.selectionLabel);
  if (cursor.line && cursor.column) {
    parts.push(`L${cursor.line}:${cursor.column}`);
  } else if (cursor.line) {
    parts.push(`L${cursor.line}`);
  }
  if (parts.length === 0 && cursor.selectionKind) parts.push(cursor.selectionKind);
  return parts.join(' · ') || viewingLabel;
}

function RemoteStudioCursors({
  entries,
  labels,
  viewingLabel,
}: {
  entries: ProjectStudioPresenceSsePayload[];
  labels: StudioDocumentChromeLabels;
  viewingLabel: string;
}) {
  const visible = entries.filter((entry) => entry.cursor).slice(0, 4);
  if (visible.length === 0) return null;
  return (
    <div
      className="studio-doc-remote-cursors"
      data-testid="studio-doc-remote-cursors"
      aria-label={labels.liveCursors}
    >
      <span>{labels.liveCursors}</span>
      {visible.map((entry) => (
        <strong key={entry.clientId} title={remotePresenceCursorLabel(entry, viewingLabel)}>
          {entry.actorName || labels.collaborator}
          <small>{remotePresenceCursorLabel(entry, viewingLabel)}</small>
        </strong>
      ))}
    </div>
  );
}

function RemoteSourceCursors({
  entries,
  source,
  collaboratorLabel,
  sourceCursorsLabel,
  viewingLabel,
}: {
  entries: ProjectStudioPresenceSsePayload[];
  source: string;
  collaboratorLabel: string;
  sourceCursorsLabel: string;
  viewingLabel: string;
}) {
  const lineCount = Math.max(1, source.split('\n').length);
  const visible = entries
    .filter((entry) => entry.cursor?.selectionKind === 'cursor' && entry.cursor.line)
    .slice(0, 6);
  if (visible.length === 0) return null;
  return (
    <div
      className="studio-doc-source-cursors"
      data-testid="studio-doc-source-collab-cursors"
      aria-label={sourceCursorsLabel}
    >
      {visible.map((entry) => {
        const cursor = entry.cursor!;
        const line = Math.max(1, Math.min(lineCount, cursor.line ?? 1));
        const topPercent = lineCount <= 1 ? 0 : ((line - 1) / (lineCount - 1)) * 100;
        return (
          <span
            key={entry.clientId}
            className="studio-doc-source-cursor"
            style={{ top: `${topPercent}%` }}
            title={remotePresenceCursorLabel(entry, viewingLabel)}
          >
            <b>{(entry.actorName || collaboratorLabel).slice(0, 1).toUpperCase()}</b>
            <small>
              {entry.actorName || collaboratorLabel} · L{line}
              {cursor.column ? `:${cursor.column}` : ''}
            </small>
          </span>
        );
      })}
    </div>
  );
}

export function GameStudioDocumentEditor({
  projectId,
  file,
  onFileSaved,
  onPresenceCursorChange,
  remotePresence = [],
  sourceDraft,
}: Props) {
  const t = useT();
  const [rawDraft, setRawDraft] = useState('');
  const [persistedDraft, setPersistedDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [liveMergeError, setLiveMergeError] = useState<string | null>(null);
  const [sourceEditVersion, setSourceEditVersion] = useState(0);
  const rawDraftRef = useRef(rawDraft);
  const liveMergeInFlightRef = useRef(false);
  const lastLiveMergeVersionRef = useRef(0);
  const lastRemoteDraftRevisionRef = useRef(0);
  const sourceDraftQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    rawDraftRef.current = rawDraft;
  }, [rawDraft]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void fetchProjectFileText(projectId, file.name, {
      cache: 'no-store',
      cacheBustKey: file.mtime,
    }).then((text) => {
      if (cancelled) return;
      const nextText =
        text && text.trim().length > 0
          ? text
          : JSON.stringify(normalizeGameStudioDocumentForKind(file.kind, null, file.name), null, 2);
      setRawDraft(nextText);
      setPersistedDraft(nextText);
      setSourceEditVersion(0);
      lastLiveMergeVersionRef.current = 0;
      lastRemoteDraftRevisionRef.current = 0;
      setLoading(false);
    }).catch((err) => {
      if (cancelled) return;
      const fallback = JSON.stringify(normalizeGameStudioDocumentForKind(file.kind, null, file.name), null, 2);
      setLoadError(err instanceof Error ? err.message : String(err));
      setRawDraft(fallback);
      setPersistedDraft(fallback);
      setSourceEditVersion(0);
      lastLiveMergeVersionRef.current = 0;
      lastRemoteDraftRevisionRef.current = 0;
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [file.kind, file.mtime, file.name, projectId]);

  useEffect(() => {
    if (!sourceDraft || sourceDraft.fileName !== file.name) return;
    if (sourceDraft.revision <= lastRemoteDraftRevisionRef.current) return;
    lastRemoteDraftRevisionRef.current = sourceDraft.revision;
    const actorId = readOrCreateStudioDocumentActorId();
    if (sourceDraft.actorIds.includes(actorId)) return;
    if (sourceDraft.content === rawDraftRef.current) return;
    setRawDraft(sourceDraft.content);
    setLiveMergeError(t('studioDoc.remoteDraftVisible'));
  }, [file.name, sourceDraft, t]);

  const parsed = useMemo(() => parseJson(rawDraft), [rawDraft]);
  const parseError = parsed.ok ? null : parsed.error;
  const document = useMemo(
    () => normalizeGameStudioDocumentForKind(file.kind, parsed.ok ? parsed.value : null, file.name),
    [file.kind, file.name, parsed],
  );
  const hierarchy = useMemo(() => hierarchyForDocument(document, t), [document, t]);
  const activeSelection = hierarchy.find((item) => item.id === selectedId) ?? hierarchy[0] ?? null;
  const selectedViewportEntity =
    document.kind === 'game-viewport'
      ? document.entities?.find((entity) => entity.id === activeSelection?.id) ?? null
      : null;
  const selectedViewportTerrainZone =
    document.kind === 'game-viewport'
      ? document.terrainZones?.find((zone) => zone.id === activeSelection?.id) ?? null
      : null;
  const selectedViewportTerrainPaintStroke =
    document.kind === 'game-viewport'
      ? document.terrainPaintStrokes?.find((stroke) => stroke.id === activeSelection?.id) ?? null
      : null;
  const selectedViewportTerrainSculptPatch =
    document.kind === 'game-viewport'
      ? document.terrainSculptPatches?.find((patch) => patch.id === activeSelection?.id) ?? null
      : null;
  const selectedViewportPath =
    document.kind === 'game-viewport'
      ? document.paths?.find((path) => path.id === activeSelection?.id) ?? null
      : null;
  const selectedViewportCamera =
    document.kind === 'game-viewport'
      ? document.cameraPlan?.find((camera) => camera.id === activeSelection?.id) ?? null
      : null;
  const selectedViewportCameraIndex =
    document.kind === 'game-viewport' && selectedViewportCamera
      ? Math.max(0, document.cameraPlan?.findIndex((camera) => camera.id === selectedViewportCamera.id) ?? 0)
      : 0;

  useEffect(() => {
    if (!activeSelection) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (activeSelection.id !== selectedId) setSelectedId(activeSelection.id);
  }, [activeSelection, selectedId]);

  useEffect(() => {
    if (!activeSelection) return;
    onPresenceCursorChange?.({
      selectionKind: presenceSelectionKindForDocument(file.kind),
      selectionLabel: activeSelection.label,
    });
  }, [activeSelection, file.kind, onPresenceCursorChange]);

  useEffect(() => {
    if (loading || saving || liveMergeInFlightRef.current || rawDraft === persistedDraft) {
      if (rawDraft === persistedDraft) setLiveMergeError(null);
      return;
    }
    if (sourceEditVersion <= lastLiveMergeVersionRef.current) return;
    const nextParsed = parseJson(rawDraft);
    if (!nextParsed.ok) return;
    const normalized = normalizeGameStudioDocumentForKind(file.kind, nextParsed.value, file.name);
    const validation = validateGameStudioDocumentForKind(file.kind, normalized, t);
    if (!validation.ok) return;
    const actorId = readOrCreateStudioDocumentActorId();
    const operation = buildStudioDocumentTextSpliceOperation(persistedDraft, rawDraft, actorId);
    if (!operation) return;

    const scheduledDraft = rawDraft;
    const scheduledVersion = sourceEditVersion;
    const timer = window.setTimeout(() => {
      liveMergeInFlightRef.current = true;
      void applyProjectStudioDocumentOperations(projectId, {
        fileName: file.name,
        operations: [operation],
      }).then(async (merged) => {
        if (!merged) return;
        const conflict = merged.skippedOperations.find((candidate) => candidate.status === 'conflict');
        if (conflict) {
          setLiveMergeError(`Live studio merge conflict at ${conflict.path}: ${conflict.reason ?? 'operation could not be applied'}`);
          return;
        }
        setLiveMergeError(null);
        setPersistedDraft(merged.content);
        lastLiveMergeVersionRef.current = Math.max(lastLiveMergeVersionRef.current, scheduledVersion);
        if (rawDraftRef.current === scheduledDraft) {
          setRawDraft(merged.content);
          setSavedAt(Date.now());
        }
        await onFileSaved?.();
      }).finally(() => {
        liveMergeInFlightRef.current = false;
      });
    }, LIVE_SOURCE_MERGE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [file.kind, file.name, loading, onFileSaved, persistedDraft, projectId, rawDraft, saving, sourceEditVersion]);

  async function handleSave() {
    setSaveError(null);
    const nextParsed = parseJson(rawDraft);
    if (!nextParsed.ok) {
      setSaveError(nextParsed.error);
      return;
    }
    const normalized = normalizeGameStudioDocumentForKind(file.kind, nextParsed.value, file.name);
    const validation = validateGameStudioDocumentForKind(file.kind, normalized, t);
    if (!validation.ok) {
      setSaveError(validation.error);
      return;
    }
    const content = JSON.stringify(validation.document, null, 2);
    const persistedParsed = parseJson(persistedDraft);
    const previousDocument = normalizeGameStudioDocumentForKind(
      file.kind,
      persistedParsed.ok ? persistedParsed.value : null,
      file.name,
    );
    const actorId = readOrCreateStudioDocumentActorId();
    const textOperation = buildStudioDocumentTextSpliceOperation(persistedDraft, content, actorId);
    const operations = textOperation
      ? [textOperation]
      : buildStudioDocumentOperations(
        previousDocument,
        validation.document,
        actorId,
      );
    setSaving(true);
    try {
      if (operations.length > 0) {
        const merged = await applyProjectStudioDocumentOperations(projectId, {
          fileName: file.name,
          operations,
        });
        if (merged) {
          const conflict = merged.skippedOperations.find((operation) => operation.status === 'conflict');
          if (conflict) {
            setSaveError(t('studioDoc.mergeConflict', {
              path: conflict.path,
              reason: conflict.reason ?? t('studioDoc.operationCouldNotApply'),
            }));
            return;
          }
          setLiveMergeError(null);
          setRawDraft(merged.content);
          setPersistedDraft(merged.content);
          lastLiveMergeVersionRef.current = Math.max(lastLiveMergeVersionRef.current, sourceEditVersion);
          setSavedAt(Date.now());
          await onFileSaved?.();
          return;
        }
      }
      const saved = await writeProjectTextFile(projectId, file.name, content);
      if (!saved) {
        setSaveError(t('studioDoc.saveFailed'));
        return;
      }
      setLiveMergeError(null);
      setRawDraft(content);
      setPersistedDraft(content);
      lastLiveMergeVersionRef.current = Math.max(lastLiveMergeVersionRef.current, sourceEditVersion);
      setSavedAt(Date.now());
      await onFileSaved?.();
    } finally {
      setSaving(false);
    }
  }

  function emitSourceCursor(element: HTMLTextAreaElement) {
    onPresenceCursorChange?.(
      sourceCursorForOffset(element.value, element.selectionStart ?? 0, t('studioDoc.jsonSource')),
    );
  }

  function handleSourceDraftChange(next: string) {
    const previous = rawDraftRef.current;
    const actorId = readOrCreateStudioDocumentActorId();
    const draftOperation = buildStudioDocumentTextSpliceOperation(previous, next, actorId);
    rawDraftRef.current = next;
    setRawDraft(next);
    setSourceEditVersion((version) => version + 1);
    if (draftOperation) {
      sourceDraftQueueRef.current = sourceDraftQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          await applyProjectStudioDocumentDraftOperations(projectId, {
            fileName: file.name,
            operations: [draftOperation],
          });
        });
      void sourceDraftQueueRef.current;
    }
  }

  function commitViewportDraft(nextDocument: GameViewportDocument, nextSelectedId?: string) {
    setRawDraft(JSON.stringify(nextDocument, null, 2));
    setSaveError(null);
    setSavedAt(null);
    if (nextSelectedId) setSelectedId(nextSelectedId);
  }

  function handleAddViewportMarker() {
    if (document.kind !== 'game-viewport') return;
    const markerId = uniqueViewportEntityId(document, 'interaction-marker');
    const source = selectedViewportEntity;
    const marker: GameViewportEntity = {
      id: markerId,
      name: 'Interaction Marker',
      type: 'interaction-zone',
      x: clampViewportCoordinate((source?.x ?? 460) + 36, 0, 900),
      y: clampViewportCoordinate((source?.y ?? 300) + 24, 0, 560),
      w: 92,
      h: 52,
      layerId: source?.layerId ?? 'simulation',
      interaction: 'Player-facing test marker: tune prompt, range, reward, and failure feedback.',
      notes: 'Added from the spatial editor. Replace with a concrete objective, hazard, traversal, or reward role before handoff.',
    };
    commitViewportDraft(
      {
        ...document,
        entities: [...(document.entities ?? []), marker],
      },
      marker.id,
    );
  }

  function handleAddViewportTerrainZone() {
    if (document.kind !== 'game-viewport') return;
    const zoneId = uniqueViewportTerrainZoneId(document, 'terrain-zone');
    const zone: GameViewportTerrainZone = {
      id: zoneId,
      name: 'Terrain Zone',
      type: 'cover-field',
      x: 280,
      y: 220,
      w: 220,
      h: 140,
      layerId: 'terrain',
      traversal: 'Defines a readable movement pocket for cover, hazard, biome, or arena tuning.',
      cover: 'Tune sightline breaks, recovery windows, and enemy approach angles before playtest.',
      notes: 'Added from the spatial editor. Replace with concrete terrain gameplay, readability, and production notes.',
    };
    commitViewportDraft(
      {
        ...document,
        terrainZones: [...(document.terrainZones ?? []), zone],
      },
      zone.id,
    );
  }

  function handleAddViewportPolygonTerrainZone() {
    if (document.kind !== 'game-viewport') return;
    const zoneId = uniqueViewportTerrainZoneId(document, 'polygon-terrain');
    const zone: GameViewportTerrainZone = {
      id: zoneId,
      name: 'Polygon Terrain',
      shape: 'polygon',
      type: 'hazard-field',
      x: 300,
      y: 180,
      w: 270,
      h: 170,
      points: [
        { x: 300, y: 220 },
        { x: 410, y: 180 },
        { x: 560, y: 230 },
        { x: 500, y: 340 },
        { x: 330, y: 330 },
      ],
      layerId: 'terrain',
      traversal: 'Irregular terrain footprint for hazard fields, biome edges, arenas, or stealth pockets.',
      cover: 'Use the polygon edges to tune readable entry angles and avoid invisible collision surprises.',
      notes: 'Added from the spatial editor. Replace with concrete polygon terrain rules and playtest notes.',
    };
    commitViewportDraft(
      {
        ...document,
        terrainZones: [...(document.terrainZones ?? []), zone],
      },
      zone.id,
    );
  }

  function handleAddViewportTerrainPaintStroke() {
    if (document.kind !== 'game-viewport') return;
    const strokeId = uniqueViewportTerrainPaintStrokeId(document, 'terrain-paint');
    const stroke: GameViewportTerrainPaintStroke = {
      id: strokeId,
      name: 'Terrain Paint Stroke',
      type: 'material',
      material: 'ash-scorch traversal read',
      brushSize: 30,
      opacity: 0.55,
      layerId: 'terrain',
      points: [
        { x: 250, y: 410 },
        { x: 340, y: 395 },
        { x: 455, y: 425 },
        { x: 560, y: 405 },
      ],
      notes: 'Added from the spatial editor. Use brush strokes for readable terrain material, danger, biome, or traversal paint planning.',
    };
    commitViewportDraft(
      {
        ...document,
        terrainPaintStrokes: [...(document.terrainPaintStrokes ?? []), stroke],
      },
      stroke.id,
    );
  }

  function handleAddViewportTerrainSculptPatch() {
    if (document.kind !== 'game-viewport') return;
    const patchId = uniqueViewportTerrainSculptPatchId(document, 'terrain-sculpt');
    const patch: GameViewportTerrainSculptPatch = {
      id: patchId,
      name: 'Terrain Sculpt Patch',
      type: 'mesh-deformation',
      x: 420,
      y: 255,
      radius: 82,
      height: 1.2,
      falloff: 'smooth',
      layerId: 'terrain',
      samples: [
        { x: 360, y: 245, height: 0.6, radius: 48 },
        { x: 420, y: 255, height: 1.2, radius: 82 },
        { x: 488, y: 282, height: 0.8, radius: 56 },
      ],
      meshIntent: 'Readable elevation ridge that changes sightlines, traversal commitment, and cover value.',
      traversalImpact: 'Tune slope readability, climb timing, and combat camera framing before engine blockout.',
      notes: 'Added from the spatial editor. Use sculpt patches to describe heightfield edits, ridges, craters, ramps, and mesh-deformation intent.',
    };
    commitViewportDraft(
      {
        ...document,
        terrainSculptPatches: [...(document.terrainSculptPatches ?? []), patch],
      },
      patch.id,
    );
  }

  function handleAddViewportCamera() {
    if (document.kind !== 'game-viewport') return;
    const cameraId = uniqueViewportCameraId(document, 'camera-handle');
    const camera: GameViewportCameraPlan = {
      id: cameraId,
      mode: 'gameplay camera handle',
      framing: 'Frame the selected route, active threat, and next readable objective without hiding combat telegraphs.',
      x: 260,
      y: 180,
      targetX: 520,
      targetY: 320,
      comfort: 'Keep transitions smooth and avoid sudden spins.',
      readability: 'Protect enemy tells, objective markers, and HUD safe zones.',
    };
    commitViewportDraft(
      {
        ...document,
        cameraPlan: [...(document.cameraPlan ?? []), camera],
      },
      camera.id,
    );
  }

  function handleNudgeViewportEntity(entityId: string, dx: number, dy: number) {
    if (document.kind !== 'game-viewport') return;
    const entities = document.entities ?? [];
    if (!entities.some((entity) => entity.id === entityId)) return;
    commitViewportDraft(
      {
        ...document,
        entities: entities.map((entity) =>
          entity.id === entityId
            ? {
              ...entity,
              x: clampViewportCoordinate(entity.x + dx, 0, 940),
              y: clampViewportCoordinate(entity.y + dy, 0, 580),
            }
            : entity,
        ),
      },
      entityId,
    );
  }

  function handleNudgeViewportTerrainZone(zoneId: string, dx: number, dy: number) {
    if (document.kind !== 'game-viewport') return;
    const zones = document.terrainZones ?? [];
    if (!zones.some((zone) => zone.id === zoneId)) return;
    commitViewportDraft(
      {
        ...document,
        terrainZones: zones.map((zone) =>
          zone.id === zoneId
            ? {
              ...zone,
              x: clampViewportCoordinate(zone.x + dx, 0, Math.max(0, 940 - zone.w)),
              y: clampViewportCoordinate(zone.y + dy, 0, Math.max(0, 580 - zone.h)),
              points: zone.points?.map((point) => ({
                x: clampViewportCoordinate(point.x + dx, 0, 940),
                y: clampViewportCoordinate(point.y + dy, 0, 580),
              })),
            }
            : zone,
        ),
      },
      zoneId,
    );
  }

  function handleNudgeViewportTerrainPaintStroke(strokeId: string, dx: number, dy: number) {
    if (document.kind !== 'game-viewport') return;
    const strokes = document.terrainPaintStrokes ?? [];
    if (!strokes.some((stroke) => stroke.id === strokeId)) return;
    commitViewportDraft(
      {
        ...document,
        terrainPaintStrokes: strokes.map((stroke) =>
          stroke.id === strokeId
            ? {
              ...stroke,
              points: stroke.points.map((point) => ({
                x: clampViewportCoordinate(point.x + dx, 0, 940),
                y: clampViewportCoordinate(point.y + dy, 0, 580),
              })),
            }
            : stroke,
        ),
      },
      strokeId,
    );
  }

  function handleNudgeViewportTerrainSculptPatch(patchId: string, dx: number, dy: number) {
    if (document.kind !== 'game-viewport') return;
    const patches = document.terrainSculptPatches ?? [];
    if (!patches.some((patch) => patch.id === patchId)) return;
    commitViewportDraft(
      {
        ...document,
        terrainSculptPatches: patches.map((patch) =>
          patch.id === patchId
            ? {
              ...patch,
              x: clampViewportCoordinate(patch.x + dx, 0, 940),
              y: clampViewportCoordinate(patch.y + dy, 0, 580),
              samples: patch.samples?.map((sample) => ({
                ...sample,
                x: clampViewportCoordinate(sample.x + dx, 0, 940),
                y: clampViewportCoordinate(sample.y + dy, 0, 580),
              })),
            }
            : patch,
        ),
      },
      patchId,
    );
  }

  function handleAdjustViewportTerrainSculptHeight(patchId: string, delta: number) {
    if (document.kind !== 'game-viewport') return;
    const patches = document.terrainSculptPatches ?? [];
    if (!patches.some((patch) => patch.id === patchId)) return;
    commitViewportDraft(
      {
        ...document,
        terrainSculptPatches: patches.map((patch) =>
          patch.id === patchId
            ? {
              ...patch,
              height: roundViewportHeight(patch.height + delta),
              samples: patch.samples?.map((sample) => ({
                ...sample,
                height: roundViewportHeight(sample.height + delta),
              })),
            }
            : patch,
        ),
      },
      patchId,
    );
  }

  function handleAddViewportTerrainSculptSample(patchId: string) {
    if (document.kind !== 'game-viewport') return;
    const patches = document.terrainSculptPatches ?? [];
    const target = patches.find((patch) => patch.id === patchId);
    if (!target) return;
    const samples = terrainSculptPatchSamples(target);
    const last = samples.at(-1) ?? { x: target.x, y: target.y, height: target.height, radius: target.radius };
    const sampleRadius = clampViewportRadius((target.radius ?? last.radius ?? 64) - 20);
    const sample = {
      x: clampViewportCoordinate(last.x + 52, 0, 940),
      y: clampViewportCoordinate(last.y + 22, 0, 580),
      height: roundViewportHeight(target.height - 0.2),
      radius: sampleRadius,
    };
    commitViewportDraft(
      {
        ...document,
        terrainSculptPatches: patches.map((patch) =>
          patch.id === patchId
            ? {
              ...patch,
              radius: clampViewportRadius(Math.max(patch.radius ?? sampleRadius, sampleRadius)),
              samples: [...terrainSculptPatchSamples(patch), sample],
            }
            : patch,
        ),
      },
      patchId,
    );
  }

  function handleAdjustViewportTerrainSculptRadius(patchId: string, delta: number) {
    if (document.kind !== 'game-viewport') return;
    const patches = document.terrainSculptPatches ?? [];
    if (!patches.some((patch) => patch.id === patchId)) return;
    commitViewportDraft(
      {
        ...document,
        terrainSculptPatches: patches.map((patch) =>
          patch.id === patchId
            ? {
              ...patch,
              radius: clampViewportRadius((patch.radius ?? 64) + delta),
              samples: terrainSculptPatchSamples(patch).map((sample) => ({
                ...sample,
                radius: clampViewportRadius((sample.radius ?? patch.radius ?? 64) + delta),
              })),
            }
            : patch,
        ),
      },
      patchId,
    );
  }

  function handleNudgeViewportPath(pathId: string, dx: number, dy: number) {
    if (document.kind !== 'game-viewport') return;
    const paths = document.paths ?? [];
    if (!paths.some((path) => path.id === pathId)) return;
    commitViewportDraft(
      {
        ...document,
        paths: paths.map((path) =>
          path.id === pathId
            ? {
              ...path,
              points: path.points.map((point) => ({
                x: clampViewportCoordinate(point.x + dx, 0, 940),
                y: clampViewportCoordinate(point.y + dy, 0, 580),
              })),
            }
            : path,
        ),
      },
      pathId,
    );
  }

  function handleNudgeViewportCamera(cameraId: string, dx: number, dy: number) {
    if (document.kind !== 'game-viewport') return;
    const cameraPlan = document.cameraPlan ?? [];
    const cameraIndex = cameraPlan.findIndex((camera) => camera.id === cameraId);
    if (cameraIndex < 0) return;
    commitViewportDraft(
      {
        ...document,
        cameraPlan: cameraPlan.map((camera, index) => {
          if (camera.id !== cameraId) return camera;
          const position = cameraHandlePosition(camera, index);
          return {
            ...camera,
            x: clampViewportCoordinate(position.x + dx, 0, 940),
            y: clampViewportCoordinate(position.y + dy, 0, 580),
          };
        }),
      },
      cameraId,
    );
  }

  function handleNudgeViewportSelection(selectionId: string, dx: number, dy: number) {
    if (document.kind !== 'game-viewport') return;
    if (document.entities?.some((entity) => entity.id === selectionId)) {
      handleNudgeViewportEntity(selectionId, dx, dy);
      return;
    }
    if (document.terrainZones?.some((zone) => zone.id === selectionId)) {
      handleNudgeViewportTerrainZone(selectionId, dx, dy);
      return;
    }
    if (document.terrainPaintStrokes?.some((stroke) => stroke.id === selectionId)) {
      handleNudgeViewportTerrainPaintStroke(selectionId, dx, dy);
      return;
    }
    if (document.terrainSculptPatches?.some((patch) => patch.id === selectionId)) {
      handleNudgeViewportTerrainSculptPatch(selectionId, dx, dy);
      return;
    }
    if (document.paths?.some((path) => path.id === selectionId)) {
      handleNudgeViewportPath(selectionId, dx, dy);
      return;
    }
    if (document.cameraPlan?.some((camera) => camera.id === selectionId)) {
      handleNudgeViewportCamera(selectionId, dx, dy);
    }
  }

  function handleAddViewportWaypoint(pathId: string) {
    if (document.kind !== 'game-viewport') return;
    const paths = document.paths ?? [];
    const target = paths.find((path) => path.id === pathId);
    if (!target) return;
    const last = target.points.at(-1) ?? { x: 500, y: 300 };
    const waypoint = {
      x: clampViewportCoordinate(last.x + 72, 0, 940),
      y: clampViewportCoordinate(last.y + 28, 0, 580),
    };
    commitViewportDraft(
      {
        ...document,
        paths: paths.map((path) =>
          path.id === pathId
            ? { ...path, points: [...path.points, waypoint] }
            : path,
        ),
      },
      pathId,
    );
  }

  return (
    <div className="studio-doc-editor" data-testid="game-studio-document-editor">
      <aside className="studio-doc-rail" aria-label={t('studioDoc.sceneHierarchy')}>
        <div className="studio-doc-rail-head">
          <span>{t('studioDoc.sceneHierarchy')}</span>
          <strong>{document.title}</strong>
        </div>
        <div className="studio-doc-tree">
          {hierarchy.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === activeSelection?.id ? 'active' : ''}
              onClick={() => setSelectedId(item.id)}
            >
              <span>{item.label}</span>
              <small>{item.meta}</small>
            </button>
          ))}
        </div>
      </aside>

      <main className="studio-doc-canvas">
        <div className="studio-doc-toolbar">
          <div>
            <span className="studio-doc-kind">{labelForKind(file.kind, t)}</span>
            <h3>{document.title}</h3>
          </div>
          <div className="studio-doc-actions">
            {loading ? <span>{t('common.loading')}</span> : null}
            {parseError ? <span className="studio-doc-error">{t('studioDoc.invalidJson')}</span> : null}
            {savedAt ? <span>{t('studioDoc.savedAt', { time: new Date(savedAt).toLocaleTimeString() })}</span> : null}
            {document.kind === 'game-viewport' ? (
              <>
                <button
                  type="button"
                  data-testid="game-viewport-add-marker"
                  onClick={handleAddViewportMarker}
                >
                  {t('studioDoc.addMarker')}
                </button>
                <button
                  type="button"
                  data-testid="game-viewport-add-terrain"
                  onClick={handleAddViewportTerrainZone}
                >
                  {t('studioDoc.addTerrain')}
                </button>
                <button
                  type="button"
                  data-testid="game-viewport-add-polygon-terrain"
                  onClick={handleAddViewportPolygonTerrainZone}
                >
                  {t('studioDoc.addPolygonTerrain')}
                </button>
                <button
                  type="button"
                  data-testid="game-viewport-add-terrain-paint"
                  onClick={handleAddViewportTerrainPaintStroke}
                >
                  {t('studioDoc.addTerrainPaint')}
                </button>
                <button
                  type="button"
                  data-testid="game-viewport-add-terrain-sculpt"
                  onClick={handleAddViewportTerrainSculptPatch}
                >
                  {t('studioDoc.addSculptPatch')}
                </button>
                <button
                  type="button"
                  data-testid="game-viewport-add-camera"
                  onClick={handleAddViewportCamera}
                >
                  {t('studioDoc.addCamera')}
                </button>
              </>
            ) : null}
            <button
              type="button"
              className="primary"
              data-testid="game-studio-document-save"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving ? t('studioDoc.saving') : t('common.save')}
            </button>
          </div>
        </div>

        {loadError ? <div className="studio-doc-error-banner">{loadError}</div> : null}
          <RemoteStudioCursors
            entries={remotePresence}
            labels={{
              collaborator: t('studioDoc.collaborator'),
              liveCursors: t('studioDoc.liveCursors'),
            }}
            viewingLabel={t('studioDoc.presenceViewing')}
          />
        {document.kind === 'game-viewport' ? (
          <ViewportCanvas
            doc={document}
            selectedId={activeSelection?.id ?? null}
            onSelect={setSelectedId}
            onNudge={handleNudgeViewportSelection}
          />
        ) : document.kind === 'node-graph' ? (
          <NodeGraphCanvas doc={document} selectedId={activeSelection?.id ?? null} onSelect={setSelectedId} />
        ) : document.kind === 'behavior-tree' ? (
          <BehaviorTreeCanvas doc={document} selectedId={activeSelection?.id ?? null} onSelect={setSelectedId} />
        ) : (
          <SystemSpecCanvas doc={document} selectedId={activeSelection?.id ?? null} onSelect={setSelectedId} />
        )}
      </main>

      <aside className="studio-doc-inspector" aria-label={t('studioDoc.inspector')}>
        <div className="studio-doc-inspector-section">
          <span className="studio-doc-kind">{t('studioDoc.inspector')}</span>
          {activeSelection ? (
            <>
              <h3>{activeSelection.label}</h3>
              <p>{detailsForSelection(document, activeSelection.id, t)}</p>
              {selectedViewportEntity ? (
                <div className="studio-spatial-controls" data-testid="game-viewport-spatial-controls">
                  <span>
                    {t('studioDoc.position', {
                      x: Math.round(selectedViewportEntity.x),
                      y: Math.round(selectedViewportEntity.y),
                    })}
                  </span>
                  <div>
                    <button type="button" onClick={() => handleNudgeViewportEntity(selectedViewportEntity.id, 0, -20)}>
                      {t('studioDoc.nudgeUp')}
                    </button>
                    <button type="button" onClick={() => handleNudgeViewportEntity(selectedViewportEntity.id, -20, 0)}>
                      {t('studioDoc.nudgeLeft')}
                    </button>
                    <button type="button" onClick={() => handleNudgeViewportEntity(selectedViewportEntity.id, 20, 0)}>
                      {t('studioDoc.nudgeRight')}
                    </button>
                    <button type="button" onClick={() => handleNudgeViewportEntity(selectedViewportEntity.id, 0, 20)}>
                      {t('studioDoc.nudgeDown')}
                    </button>
                  </div>
                </div>
              ) : null}
              {selectedViewportTerrainZone ? (
                <div className="studio-spatial-controls" data-testid="game-viewport-terrain-controls">
                  <span>{terrainZonePositionLabel(selectedViewportTerrainZone)}</span>
                  <div>
                    <button type="button" onClick={() => handleNudgeViewportTerrainZone(selectedViewportTerrainZone.id, 0, -20)}>
                      {t('studioDoc.nudgeUp')}
                    </button>
                    <button type="button" onClick={() => handleNudgeViewportTerrainZone(selectedViewportTerrainZone.id, -20, 0)}>
                      {t('studioDoc.nudgeLeft')}
                    </button>
                    <button type="button" onClick={() => handleNudgeViewportTerrainZone(selectedViewportTerrainZone.id, 20, 0)}>
                      {t('studioDoc.nudgeRight')}
                    </button>
                    <button type="button" onClick={() => handleNudgeViewportTerrainZone(selectedViewportTerrainZone.id, 0, 20)}>
                      {t('studioDoc.nudgeDown')}
                    </button>
                  </div>
                </div>
              ) : null}
              {selectedViewportTerrainPaintStroke ? (
                <div className="studio-spatial-controls" data-testid="game-viewport-terrain-paint-controls">
                  <span>{terrainPaintStrokePositionLabel(selectedViewportTerrainPaintStroke)}</span>
                  <div>
                    <button type="button" onClick={() => handleNudgeViewportTerrainPaintStroke(selectedViewportTerrainPaintStroke.id, 0, -20)}>
                      {t('studioDoc.nudgeUp')}
                    </button>
                    <button type="button" onClick={() => handleNudgeViewportTerrainPaintStroke(selectedViewportTerrainPaintStroke.id, -20, 0)}>
                      {t('studioDoc.nudgeLeft')}
                    </button>
                    <button type="button" onClick={() => handleNudgeViewportTerrainPaintStroke(selectedViewportTerrainPaintStroke.id, 20, 0)}>
                      {t('studioDoc.nudgeRight')}
                    </button>
                    <button type="button" onClick={() => handleNudgeViewportTerrainPaintStroke(selectedViewportTerrainPaintStroke.id, 0, 20)}>
                      {t('studioDoc.nudgeDown')}
                    </button>
                  </div>
                </div>
              ) : null}
              {selectedViewportTerrainSculptPatch ? (
                <div className="studio-spatial-controls" data-testid="game-viewport-terrain-sculpt-controls">
                  <span>
                    {terrainSculptPatchPositionLabel(selectedViewportTerrainSculptPatch)}
                    {' · '}
                    {t('studioDoc.meshVerts', {
                      count: terrainSculptMeshVertices(selectedViewportTerrainSculptPatch).length,
                    })}
                  </span>
                  <div>
                    <button type="button" onClick={() => handleNudgeViewportTerrainSculptPatch(selectedViewportTerrainSculptPatch.id, 0, -20)}>
                      {t('studioDoc.nudgeUp')}
                    </button>
                    <button type="button" onClick={() => handleNudgeViewportTerrainSculptPatch(selectedViewportTerrainSculptPatch.id, -20, 0)}>
                      {t('studioDoc.nudgeLeft')}
                    </button>
                    <button type="button" onClick={() => handleNudgeViewportTerrainSculptPatch(selectedViewportTerrainSculptPatch.id, 20, 0)}>
                      {t('studioDoc.nudgeRight')}
                    </button>
                    <button type="button" onClick={() => handleNudgeViewportTerrainSculptPatch(selectedViewportTerrainSculptPatch.id, 0, 20)}>
                      {t('studioDoc.nudgeDown')}
                    </button>
                    <button type="button" onClick={() => handleAdjustViewportTerrainSculptHeight(selectedViewportTerrainSculptPatch.id, 0.25)}>
                      {t('studioDoc.raiseHeight')}
                    </button>
                    <button type="button" onClick={() => handleAdjustViewportTerrainSculptHeight(selectedViewportTerrainSculptPatch.id, -0.25)}>
                      {t('studioDoc.lowerHeight')}
                    </button>
                    <button type="button" onClick={() => handleAddViewportTerrainSculptSample(selectedViewportTerrainSculptPatch.id)}>
                      {t('studioDoc.addBrushSample')}
                    </button>
                    <button type="button" onClick={() => handleAdjustViewportTerrainSculptRadius(selectedViewportTerrainSculptPatch.id, 8)}>
                      {t('studioDoc.broadenBrush')}
                    </button>
                    <button type="button" onClick={() => handleAdjustViewportTerrainSculptRadius(selectedViewportTerrainSculptPatch.id, -8)}>
                      {t('studioDoc.tightenBrush')}
                    </button>
                  </div>
                </div>
              ) : null}
              {selectedViewportPath ? (
                <div className="studio-spatial-controls" data-testid="game-viewport-path-controls">
                  <span>
                    {t(
                      selectedViewportPath.points.length === 1
                        ? 'studioDoc.waypointCountOne'
                        : 'studioDoc.waypointCountMany',
                      { count: selectedViewportPath.points.length },
                    )}
                  </span>
                  <div>
                    <button type="button" onClick={() => handleAddViewportWaypoint(selectedViewportPath.id)}>
                      {t('studioDoc.addWaypoint')}
                    </button>
                    <button type="button" onClick={() => handleNudgeViewportPath(selectedViewportPath.id, 0, -20)}>
                      {t('studioDoc.nudgeUp')}
                    </button>
                    <button type="button" onClick={() => handleNudgeViewportPath(selectedViewportPath.id, -20, 0)}>
                      {t('studioDoc.nudgeLeft')}
                    </button>
                    <button type="button" onClick={() => handleNudgeViewportPath(selectedViewportPath.id, 20, 0)}>
                      {t('studioDoc.nudgeRight')}
                    </button>
                    <button type="button" onClick={() => handleNudgeViewportPath(selectedViewportPath.id, 0, 20)}>
                      {t('studioDoc.nudgeDown')}
                    </button>
                  </div>
                </div>
              ) : null}
              {selectedViewportCamera ? (
                <div className="studio-spatial-controls" data-testid="game-viewport-camera-controls">
                  <span>{cameraPositionLabel(selectedViewportCamera, selectedViewportCameraIndex)}</span>
                  <div>
                    <button type="button" onClick={() => handleNudgeViewportCamera(selectedViewportCamera.id, 0, -20)}>
                      {t('studioDoc.nudgeUp')}
                    </button>
                    <button type="button" onClick={() => handleNudgeViewportCamera(selectedViewportCamera.id, -20, 0)}>
                      {t('studioDoc.nudgeLeft')}
                    </button>
                    <button type="button" onClick={() => handleNudgeViewportCamera(selectedViewportCamera.id, 20, 0)}>
                      {t('studioDoc.nudgeRight')}
                    </button>
                    <button type="button" onClick={() => handleNudgeViewportCamera(selectedViewportCamera.id, 0, 20)}>
                      {t('studioDoc.nudgeDown')}
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <p>{t('studioDoc.noSelectableNode')}</p>
          )}
        </div>
        <div className="studio-doc-inspector-section">
          <span className="studio-doc-kind">{t('studioDoc.jsonSource')}</span>
          {saveError ? <div className="studio-doc-error-banner">{saveError}</div> : null}
          {liveMergeError ? <div className="studio-doc-error-banner">{liveMergeError}</div> : null}
          <div className="studio-doc-source-shell">
            <RemoteSourceCursors
              entries={remotePresence}
              source={rawDraft}
              collaboratorLabel={t('studioDoc.collaborator')}
              sourceCursorsLabel={t('studioDoc.sourceCursorsAria')}
              viewingLabel={t('studioDoc.presenceViewing')}
            />
            <textarea
              className="studio-doc-json-editor"
              data-testid="game-studio-document-source"
              spellCheck={false}
              value={rawDraft}
              onChange={(event) => handleSourceDraftChange(event.target.value)}
              onClick={(event) => emitSourceCursor(event.currentTarget)}
              onKeyUp={(event) => emitSourceCursor(event.currentTarget)}
              onSelect={(event) => emitSourceCursor(event.currentTarget)}
            />
          </div>
        </div>
      </aside>
    </div>
  );
}

function ViewportCanvas({
  doc,
  selectedId,
  onSelect,
  onNudge,
}: {
  doc: GameViewportDocument;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNudge: (id: string, dx: number, dy: number) => void;
}) {
  const t = useT();

  function handleKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (!selectedId) return;
    const step = event.shiftKey ? 40 : 20;
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      onNudge(selectedId, 0, -step);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      onNudge(selectedId, 0, step);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      onNudge(selectedId, -step, 0);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      onNudge(selectedId, step, 0);
    }
  }

  return (
    <div className="studio-svg-shell">
      <svg
        viewBox="0 0 1000 620"
        role="img"
        aria-label={`${doc.title} spatial editor`}
        tabIndex={0}
        data-testid="game-viewport-canvas"
        onKeyDown={handleKeyDown}
      >
        <defs>
          <pattern id="studio-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(118, 140, 170, 0.16)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="1000" height="620" rx="18" fill="url(#studio-grid)" />
        <rect x="30" y="30" width="940" height="560" rx="18" fill="rgba(9, 13, 18, 0.48)" stroke="rgba(132, 213, 255, 0.18)" />
        {doc.terrainZones?.map((zone) => {
          const polygonPoints = terrainZonePolygonPoints(zone);
          return (
            <g key={zone.id} onClick={() => onSelect(zone.id)} className="studio-svg-selectable">
              {polygonPoints.length >= 3 ? (
                <polygon
                  points={polygonPoints.map((point) => `${scaleX(point.x)},${scaleY(point.y)}`).join(' ')}
                  fill={fillForTerrainZone(zone)}
                  stroke={zone.id === selectedId ? '#ffd166' : 'rgba(132, 213, 255, 0.38)'}
                  strokeWidth={zone.id === selectedId ? 4 : 1.5}
                  strokeDasharray={zone.id === selectedId ? '0' : '12 8'}
                />
              ) : (
                <rect
                  x={scaleX(zone.x)}
                  y={scaleY(zone.y)}
                  width={zone.w}
                  height={zone.h}
                  rx="16"
                  fill={fillForTerrainZone(zone)}
                  stroke={zone.id === selectedId ? '#ffd166' : 'rgba(132, 213, 255, 0.38)'}
                  strokeWidth={zone.id === selectedId ? 4 : 1.5}
                  strokeDasharray={zone.id === selectedId ? '0' : '12 8'}
                />
              )}
              <text x={scaleX(zone.x) + 14} y={scaleY(zone.y) + 30} fill="#dff4ff" fontSize="14" fontWeight="700">
                {zone.name.slice(0, 24)}
              </text>
              <text x={scaleX(zone.x) + 14} y={scaleY(zone.y) + 52} fill="#9fb1c7" fontSize="12">
                {zone.type ?? 'terrain'}
              </text>
            </g>
          );
        })}
        {doc.terrainPaintStrokes?.map((stroke) => {
          const points = stroke.points ?? [];
          const anchor = terrainPaintStrokeAnchor(stroke);
          return (
            <g key={stroke.id} onClick={() => onSelect(stroke.id)} className="studio-svg-selectable">
              <polyline
                points={points.map((point) => `${scaleX(point.x)},${scaleY(point.y)}`).join(' ')}
                fill="none"
                stroke={stroke.id === selectedId ? '#ffd166' : fillForTerrainPaintStroke(stroke)}
                strokeWidth={stroke.id === selectedId ? (stroke.brushSize ?? 28) + 6 : (stroke.brushSize ?? 28)}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={stroke.opacity ?? 0.55}
              />
              <text x={scaleX(anchor.x) + 12} y={scaleY(anchor.y) - 16} fill="#dff4ff" fontSize="13" fontWeight="700">
                {stroke.name.slice(0, 24)}
              </text>
            </g>
          );
        })}
        {doc.terrainSculptPatches?.map((patch) => {
          const samples = terrainSculptPatchSamples(patch);
          const meshVertices = terrainSculptMeshVertices(patch);
          const selected = patch.id === selectedId;
          return (
            <g key={patch.id} onClick={() => onSelect(patch.id)} className="studio-svg-selectable">
              <g pointerEvents="none" opacity={selected ? 0.92 : 0.46}>
                {meshVertices.map((vertex, index) => (
                  <circle
                    key={`${patch.id}-mesh-vertex-${index}`}
                    data-testid={`terrain-sculpt-vertex-${patch.id}-${index}`}
                    data-height={vertex.height}
                    data-influence={vertex.influence}
                    cx={scaleX(vertex.x)}
                    cy={scaleY(vertex.y)}
                    r={selected ? 4 : 3}
                    fill={vertex.influence > 0 ? strokeForTerrainSculptHeight(vertex.height) : 'rgba(159, 177, 199, 0.44)'}
                    stroke={selected ? 'rgba(255, 209, 102, 0.72)' : 'rgba(214, 245, 255, 0.28)'}
                    strokeWidth={selected ? 1.5 : 0.75}
                  />
                ))}
              </g>
              <polyline
                points={samples.map((sample) => `${scaleX(sample.x)},${scaleY(sample.y)}`).join(' ')}
                fill="none"
                stroke={selected ? '#ffd166' : 'rgba(214, 245, 255, 0.5)'}
                strokeWidth={selected ? 4 : 2}
                strokeDasharray="6 6"
              />
              {samples.map((sample, index) => (
                <g key={`${patch.id}-sample-${index}`}>
                  <circle
                    cx={scaleX(sample.x)}
                    cy={scaleY(sample.y)}
                    r={Math.max(16, sample.radius ?? patch.radius ?? 54)}
                    fill={fillForTerrainSculptPatch(patch)}
                    opacity={selected ? 0.34 : 0.22}
                    stroke={selected ? '#ffd166' : strokeForTerrainSculptHeight(sample.height)}
                    strokeWidth={selected ? 3 : 1.5}
                  />
                  <text
                    x={scaleX(sample.x) + 10}
                    y={scaleY(sample.y) + 4}
                    fill="#eef6ff"
                    fontSize="12"
                    fontWeight="800"
                  >
                    {heightLabel(sample.height)}
                  </text>
                </g>
              ))}
              <text x={scaleX(patch.x) + 14} y={scaleY(patch.y) - 44} fill="#dff4ff" fontSize="13" fontWeight="700">
                {patch.name.slice(0, 24)}
              </text>
              <text x={scaleX(patch.x) + 14} y={scaleY(patch.y) - 24} fill="#9fb1c7" fontSize="12">
                {patch.type ?? 'heightfield'}
              </text>
            </g>
          );
        })}
        {doc.paths?.map((path) => (
          <polyline
            key={path.id}
            points={(path.points ?? []).map((point) => `${scaleX(point.x)},${scaleY(point.y)}`).join(' ')}
            fill="none"
            stroke={path.id === selectedId ? '#ffd166' : '#49d2ff'}
            strokeWidth={path.id === selectedId ? 6 : 3}
            strokeLinecap="round"
            strokeLinejoin="round"
            onClick={() => onSelect(path.id)}
          />
        ))}
        {doc.cameraPlan?.map((camera, index) => {
          const position = cameraHandlePosition(camera, index);
          const target = cameraTargetPosition(camera, index);
          const selected = camera.id === selectedId;
          return (
            <g key={camera.id} onClick={() => onSelect(camera.id)} className="studio-svg-selectable">
              <line
                x1={scaleX(position.x)}
                y1={scaleY(position.y)}
                x2={scaleX(target.x)}
                y2={scaleY(target.y)}
                stroke={selected ? '#ffd166' : 'rgba(132, 213, 255, 0.58)'}
                strokeWidth={selected ? 4 : 2}
                strokeDasharray="8 7"
              />
              <path
                d={`M ${scaleX(position.x)} ${scaleY(position.y) - 18} L ${scaleX(position.x) + 24} ${scaleY(position.y) + 18} L ${scaleX(position.x) - 24} ${scaleY(position.y) + 18} Z`}
                fill={selected ? 'rgba(255, 209, 102, 0.78)' : 'rgba(132, 213, 255, 0.34)'}
                stroke={selected ? '#ffd166' : 'rgba(234, 242, 255, 0.65)'}
                strokeWidth={selected ? 3 : 1.5}
              />
              <circle
                cx={scaleX(target.x)}
                cy={scaleY(target.y)}
                r={selected ? 9 : 6}
                fill={selected ? '#ffd166' : '#84d5ff'}
              />
              <text x={scaleX(position.x) + 30} y={scaleY(position.y) + 6} fill="#dff4ff" fontSize="13" fontWeight="700">
                {camera.mode.slice(0, 20)}
              </text>
            </g>
          );
        })}
        {doc.entities?.map((entity) => (
          <g key={entity.id} onClick={() => onSelect(entity.id)} className="studio-svg-selectable">
            <rect
              x={scaleX(entity.x)}
              y={scaleY(entity.y)}
              width={entity.w ?? 76}
              height={entity.h ?? 48}
              rx="10"
              fill={fillForEntity(entity)}
              stroke={entity.id === selectedId ? '#ffd166' : 'rgba(234, 242, 255, 0.55)'}
              strokeWidth={entity.id === selectedId ? 4 : 1.5}
            />
            <text x={scaleX(entity.x) + 12} y={scaleY(entity.y) + 28} fill="#eef6ff" fontSize="15" fontWeight="700">
              {entity.name.slice(0, 22)}
            </text>
          </g>
        ))}
      </svg>
      <div className="studio-canvas-caption">
        <strong>{doc.surface}</strong>
        <span>
          {doc.objective ?? t('studioDoc.defaultObjective')}
          {' '}
          {t('studioDoc.selectEntityHint')}
        </span>
      </div>
      <div className="studio-insight-grid">
        <StudioInsightPanel
          title={t('studioDoc.panelSpatialReadability')}
          items={(doc.spatialReads ?? []).map((read) => ({
            id: read.id,
            label: read.name,
            meta: t('studioDoc.metaSightlineTraversalTension'),
            body: compactText([
              read.sightline,
              read.cover,
              read.chokepoint,
              read.stealthRoute,
              read.traversalRhythm,
              read.tensionSpacing,
            ], t('studioDoc.needsStudioReviewNotes')),
          }))}
        />
        <StudioInsightPanel title={t('studioDoc.panelWorldSimulation')} items={worldSimulationItems(doc.worldSimulation, t)} />
        <StudioInsightPanel
          title={t('studioDoc.panelCameraPlan')}
          items={(doc.cameraPlan ?? []).map((camera) => ({
            id: camera.id,
            label: camera.mode,
            meta: t('studioDoc.metaFramingComfortReadability'),
            body: compactText([camera.framing, camera.comfort, camera.readability], t('studioDoc.needsStudioReviewNotes')),
          }))}
        />
      </div>
    </div>
  );
}

function NodeGraphCanvas({
  doc,
  selectedId,
  onSelect,
}: {
  doc: GameNodeGraphDocument;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const t = useT();
  const nodeMap = new Map(doc.nodes.map((node) => [node.id, node]));
  return (
    <div className="studio-svg-shell">
      <svg viewBox="0 0 1000 620" role="img" aria-label={doc.title}>
        <rect width="1000" height="620" rx="18" fill="rgba(7, 11, 17, 0.88)" />
        {doc.edges.map((edge) => {
          const from = nodeMap.get(edge.from);
          const to = nodeMap.get(edge.to);
          if (!from || !to) return null;
          const start = { x: scaleX(from.x) + 160, y: scaleY(from.y) + 42 };
          const end = { x: scaleX(to.x), y: scaleY(to.y) + 42 };
          const mid = Math.max(40, Math.abs(end.x - start.x) / 2);
          return (
            <path
              key={edge.id}
              d={`M ${start.x} ${start.y} C ${start.x + mid} ${start.y}, ${end.x - mid} ${end.y}, ${end.x} ${end.y}`}
              fill="none"
              stroke={edge.id === selectedId ? '#ffd166' : '#4ee7b2'}
              strokeWidth={edge.id === selectedId ? 5 : 2.5}
              onClick={() => onSelect(edge.id)}
            />
          );
        })}
        {doc.nodes.map((node) => (
          <GraphNode
            key={node.id}
            node={node}
            selected={node.id === selectedId}
            onSelect={() => onSelect(node.id)}
          />
        ))}
      </svg>
      <div className="studio-canvas-caption">
        <strong>{doc.graphType}</strong>
        <span>{doc.owner ?? t('studioDoc.defaultNodeLogicOwner')}</span>
      </div>
      <div className="studio-insight-grid">
        <StudioInsightPanel
          title={t('studioDoc.panelStudioCollaboration')}
          items={(doc.collaborationNotes ?? []).map((note, index) => ({
            id: `${note.agent}-${index}`,
            label: note.agent,
            meta: note.concern,
            body: note.decision ?? note.concern,
          }))}
        />
        <StudioInsightPanel
          title={t('studioDoc.panelRuntimeVariables')}
          items={(doc.variables ?? []).map((variable) => ({
            id: variable.id,
            label: variable.name,
            meta: String(variable.value),
            body: variable.notes ?? t('studioDoc.defaultRuntimeVariableNote'),
          }))}
        />
        <StudioInsightPanel title={t('studioDoc.panelDesignCritique')} items={stringInsightItems(doc.critiqueNotes, 'critique', t('studioDoc.labelCritique'))} />
      </div>
    </div>
  );
}

function GraphNode({
  node,
  selected,
  onSelect,
}: {
  node: GameNodeGraphNode;
  selected: boolean;
  onSelect: () => void;
}) {
  const x = scaleX(node.x);
  const y = scaleY(node.y);
  return (
    <g onClick={onSelect} className="studio-svg-selectable">
      <rect
        x={x}
        y={y}
        width="170"
        height="84"
        rx="12"
        fill={selected ? 'rgba(255, 209, 102, 0.18)' : 'rgba(16, 25, 37, 0.95)'}
        stroke={selected ? '#ffd166' : 'rgba(78, 231, 178, 0.45)'}
        strokeWidth={selected ? 3 : 1.5}
      />
      <text x={x + 14} y={y + 28} fill="#eef6ff" fontSize="15" fontWeight="700">
        {node.title.slice(0, 18)}
      </text>
      <text x={x + 14} y={y + 54} fill="#9fb1c7" fontSize="12">
        {node.category}
      </text>
    </g>
  );
}

function BehaviorTreeCanvas({
  doc,
  selectedId,
  onSelect,
}: {
  doc: BehaviorTreeDocument;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const t = useT();
  const layout = layoutBehaviorTree(doc.nodes, doc.rootId);
  const byId = new Map(layout.map((node) => [node.id, node]));
  return (
    <div className="studio-svg-shell">
      <svg viewBox="0 0 1000 620" role="img" aria-label={doc.title}>
        <rect width="1000" height="620" rx="18" fill="rgba(7, 11, 17, 0.88)" />
        {layout.map((node) => {
          if (!node.parentId) return null;
          const parent = byId.get(node.parentId);
          if (!parent) return null;
          return (
            <line
              key={`${node.parentId}-${node.id}`}
              x1={parent.x + 75}
              y1={parent.y + 66}
              x2={node.x + 75}
              y2={node.y}
              stroke="rgba(132, 213, 255, 0.32)"
              strokeWidth="2"
            />
          );
        })}
        {layout.map((node) => (
          <g key={node.id} onClick={() => onSelect(node.id)} className="studio-svg-selectable">
            <rect
              x={node.x}
              y={node.y}
              width="150"
              height="66"
              rx="12"
              fill={node.id === selectedId ? 'rgba(255, 209, 102, 0.18)' : 'rgba(16, 25, 37, 0.95)'}
              stroke={node.id === selectedId ? '#ffd166' : 'rgba(132, 213, 255, 0.5)'}
              strokeWidth={node.id === selectedId ? 3 : 1.5}
            />
            <text x={node.x + 12} y={node.y + 26} fill="#eef6ff" fontSize="14" fontWeight="700">
              {node.name.slice(0, 16)}
            </text>
            <text x={node.x + 12} y={node.y + 48} fill="#9fb1c7" fontSize="12">
              {node.type}
            </text>
          </g>
        ))}
      </svg>
      <div className="studio-canvas-caption">
        <strong>{doc.owner}</strong>
        <span>{doc.behaviorType ?? t('studioDoc.defaultBehaviorType')}</span>
      </div>
      <div className="studio-insight-grid">
        <StudioInsightPanel title={t('studioDoc.panelReadableTells')} items={stringInsightItems(doc.readableTells, 'tell', t('studioDoc.labelTell'))} />
        <StudioInsightPanel title={t('studioDoc.panelCounterplayRules')} items={stringInsightItems(doc.counterplayRules, 'counterplay', t('studioDoc.labelRule'))} />
        <StudioInsightPanel
          title={t('studioDoc.panelDifficultyDirector')}
          items={[
            ...stringInsightItems(doc.dynamicDifficultyRules, 'dynamic-difficulty', t('studioDoc.labelRule')),
            ...stringInsightItems(doc.difficultyNotes, 'difficulty-note', t('studioDoc.labelNote')),
          ]}
        />
        <StudioInsightPanel title={t('studioDoc.panelAccessibility')} items={stringInsightItems(doc.accessibilityNotes, 'accessibility', t('studioDoc.labelAssist'))} />
      </div>
    </div>
  );
}

function SystemSpecCanvas({
  doc,
  selectedId,
  onSelect,
}: {
  doc: GameSystemSpecDocument;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const t = useT();
  const cards = [
    ...(doc.metrics ?? []).map((metric) => ({
      id: metric.id,
      label: metric.label,
      meta: t('studioDoc.metricTarget', { value: metric.target }),
      body: metric.current
        ? t('studioDoc.metricCurrent', { value: metric.current })
        : metric.risk
          ? t('studioDoc.metricRisk', { value: metric.risk })
          : t('studioDoc.metricNeedsTelemetry'),
    })),
    ...(doc.loops ?? []).map((loop) => ({
      id: loop.id,
      label: loop.name,
      meta: loop.cadence ?? t('studioDoc.labelLoop'),
      body: loop.steps.join(' -> '),
    })),
    ...(doc.risks ?? []).map((risk) => ({
      id: risk.id,
      label: risk.label,
      meta: risk.severity,
      body: risk.mitigation,
    })),
  ];
  return (
    <div className="studio-system-board">
      <div className="studio-system-hero">
        <span className="studio-doc-kind">{doc.systemType}</span>
        <h3>{doc.title}</h3>
        <p>{doc.pillars?.join(' / ') || t('studioDoc.defaultSystemPillars')}</p>
      </div>
      <div className="studio-system-grid">
        {cards.map((card) => (
          <button
            key={card.id}
            type="button"
            className={card.id === selectedId ? 'active' : ''}
            onClick={() => onSelect(card.id)}
          >
            <span>{card.meta}</span>
            <strong>{card.label}</strong>
            <p>{card.body}</p>
          </button>
        ))}
      </div>
      <div className="studio-insight-grid">
        <StudioInsightPanel
          title={t('studioDoc.panelProductionScaling')}
          items={[
            ...productionItems(doc.production, t),
            ...feasibilityItems(doc.feasibility, t),
          ]}
        />
        <StudioInsightPanel
          title={t('studioDoc.panelTelemetryIteration')}
          items={[
            ...(doc.telemetry ?? []).map((signal) => ({
              id: signal.id,
              label: signal.id,
              meta: signal.designQuestion,
              body: compactText([signal.signal, signal.action], t('studioDoc.needsStudioReviewNotes')),
            })),
            ...stringInsightItems(doc.iterationGoals, 'iteration-goal', t('studioDoc.labelIteration')),
          ]}
        />
        <StudioInsightPanel title={t('studioDoc.panelDesignTokens')} items={designTokenItems(doc.designTokens, t)} />
        <StudioInsightPanel
          title={t('studioDoc.panelPlatformAdaptation')}
          items={(doc.platformAdaptation ?? []).map((platform) => ({
            id: platform.platform,
            label: platform.platform,
            meta: platform.input,
            body: compactText([platform.performance, platform.readability], t('studioDoc.needsStudioReviewNotes')),
          }))}
        />
        <StudioInsightPanel
          title={t('studioDoc.panelEthicsAccessibility')}
          items={[
            ...stringInsightItems(doc.ethics, 'ethic', t('studioDoc.labelEthic')),
            ...stringInsightItems(doc.accessibility, 'accessibility', t('studioDoc.labelAccess')),
            ...stringInsightItems(doc.playtestQuestions, 'playtest-question', t('studioDoc.labelPlaytest')),
          ]}
        />
        <StudioInsightPanel
          title={t('studioDoc.panelGenreBenchmarks')}
          items={(doc.benchmarks ?? []).map((benchmark) => ({
            id: benchmark.id,
            label: benchmark.game,
            meta: t('studioDoc.labelBenchmark'),
            body: compactText([benchmark.lesson, benchmark.caution], t('studioDoc.needsStudioReviewNotes')),
          }))}
        />
      </div>
    </div>
  );
}

function StudioInsightPanel({ title, items }: { title: string; items: StudioInsightItem[] }) {
  const visibleItems = items.filter((item) => item.label.trim() || item.body.trim());
  if (visibleItems.length === 0) return null;
  return (
    <section className="studio-insight-panel" aria-label={title}>
      <h4>{title}</h4>
      <div className="studio-insight-list">
        {visibleItems.map((item) => (
          <article key={item.id} className="studio-insight-item">
            <span>{item.meta ?? title}</span>
            <strong>{item.label}</strong>
            <p>{item.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function worldSimulationItems(simulation: GameViewportDocument['worldSimulation'], t: StudioTranslator): StudioInsightItem[] {
  if (!simulation) return [];
  return [
    simulation.ecosystem
      ? {
        id: 'ecosystem',
        label: t('studioDoc.labelEcosystem'),
        meta: t('studioDoc.metaReactiveWorldLoop'),
        body: simulation.ecosystem,
      }
      : null,
    ...stringInsightItems(simulation.npcSchedules, 'npc-schedule', t('studioDoc.labelNpcSchedule')),
    ...stringInsightItems(simulation.factionTerritory, 'faction-territory', t('studioDoc.labelFactionTerritory')),
    simulation.weather
      ? {
        id: 'weather',
        label: t('studioDoc.labelWeather'),
        meta: t('studioDoc.metaDynamicEventPressure'),
        body: simulation.weather,
      }
      : null,
    simulation.persistence
      ? {
        id: 'persistence',
        label: t('studioDoc.labelPersistence'),
        meta: t('studioDoc.metaWorldState'),
        body: simulation.persistence,
      }
      : null,
    simulation.destruction
      ? {
        id: 'destruction',
        label: t('studioDoc.labelDestruction'),
        meta: t('studioDoc.metaReactiveEnvironment'),
        body: simulation.destruction,
      }
      : null,
    ...stringInsightItems(simulation.reactiveRules, 'reactive-rule', t('studioDoc.labelReactiveRule')),
  ].filter(Boolean) as StudioInsightItem[];
}

function productionItems(production: GameSystemSpecDocument['production'], t: StudioTranslator): StudioInsightItem[] {
  if (!production) return [];
  return [
    production.milestone
      ? {
        id: 'milestone',
        label: t('studioDoc.labelMilestone'),
        meta: t('studioDoc.metaProductionTarget'),
        body: production.milestone,
      }
      : null,
    production.assetBudget
      ? {
        id: 'asset-budget',
        label: t('studioDoc.labelAssetBudget'),
        meta: t('studioDoc.metaContentLoad'),
        body: production.assetBudget,
      }
      : null,
    ...stringInsightItems(production.qaFocus, 'qa-focus', t('studioDoc.labelQA')),
    ...stringInsightItems(production.engineNotes, 'engine-note', t('studioDoc.labelEngine')),
    ...(production.scalingVariants ?? []).map((variant) => ({
      id: `scale-${variant.scale}`,
      label: variant.scale,
      meta: t('studioDoc.metaScopeVariant'),
      body: variant.tradeoff,
    })),
  ].filter(Boolean) as StudioInsightItem[];
}

function feasibilityItems(feasibility: GameSystemSpecDocument['feasibility'], t: StudioTranslator): StudioInsightItem[] {
  if (!feasibility) return [];
  return [
    feasibility.teamSize
      ? {
        id: 'team-size',
        label: t('studioDoc.labelTeamSize'),
        meta: t('studioDoc.labelFeasibility'),
        body: feasibility.teamSize,
      }
      : null,
    feasibility.timeline
      ? {
        id: 'timeline',
        label: t('studioDoc.labelTimeline'),
        meta: feasibility.complexity ?? t('studioDoc.labelFeasibility'),
        body: feasibility.timeline,
      }
      : null,
    ...stringInsightItems(feasibility.constraints, 'constraint', t('studioDoc.labelConstraint')),
  ].filter(Boolean) as StudioInsightItem[];
}

function designTokenItems(tokens: GameSystemSpecDocument['designTokens'], t: StudioTranslator): StudioInsightItem[] {
  if (!tokens) return [];
  return [
    recordInsightItem('rarity-colors', t('studioDoc.tokenRarityColors'), tokens.rarityColors, t),
    recordInsightItem('faction-palettes', t('studioDoc.tokenFactionPalettes'), tokens.factionPalettes, t),
    recordInsightItem('biome-palettes', t('studioDoc.tokenBiomePalettes'), tokens.biomePalettes, t),
    recordInsightItem('status-effect-colors', t('studioDoc.tokenStatusEffectColors'), tokens.statusEffectColors, t),
    recordInsightItem('motion-profiles', t('studioDoc.tokenMotionProfiles'), tokens.motionProfiles, t),
    recordInsightItem('audio-cues', t('studioDoc.tokenAudioCues'), tokens.audioCues, t),
  ].filter(Boolean) as StudioInsightItem[];
}

function recordInsightItem(
  id: string,
  label: string,
  values: Record<string, string | number> | undefined,
  t: StudioTranslator,
): StudioInsightItem | null {
  if (!values || Object.keys(values).length === 0) return null;
  return {
    id,
    label,
    meta: t('studioDoc.metaGameTokenGroup'),
    body: Object.entries(values).map(([key, value]) => `${key}: ${String(value)}`).join(' / '),
  };
}

function stringInsightItems(items: string[] | undefined, idPrefix: string, labelPrefix: string): StudioInsightItem[] {
  return (items ?? []).map((item, index) => ({
    id: `${idPrefix}-${index}`,
    label: `${labelPrefix} ${index + 1}`,
    body: item,
  }));
}

function compactText(parts: Array<string | undefined>, fallback = 'Needs studio review notes.'): string {
  const clean = parts.filter((part): part is string => Boolean(part && part.trim().length > 0));
  return clean.length > 0 ? clean.join(' ') : fallback;
}

function hierarchyForDocument(doc: GameStudioDocument, t: StudioTranslator): HierarchyItem[] {
  if (doc.kind === 'game-viewport') {
    return [
      ...(doc.entities ?? []).map((entity) => ({
        id: entity.id,
        label: entity.name,
        meta: entity.type,
      })),
      ...(doc.terrainZones ?? []).map((zone) => ({
        id: zone.id,
        label: zone.name,
        meta: zone.type ?? t('studioDoc.metaTerrainZone'),
      })),
      ...(doc.terrainPaintStrokes ?? []).map((stroke) => ({
        id: stroke.id,
        label: stroke.name,
        meta: stroke.material ?? stroke.type ?? t('studioDoc.metaTerrainPaint'),
      })),
      ...(doc.terrainSculptPatches ?? []).map((patch) => ({
        id: patch.id,
        label: patch.name,
        meta: patch.type ?? t('studioDoc.metaTerrainSculpt'),
      })),
      ...(doc.paths ?? []).map((path) => ({
        id: path.id,
        label: path.name,
        meta: path.type ?? t('studioDoc.metaPath'),
      })),
      ...(doc.beats ?? []).map((beat) => ({
        id: beat.id,
        label: beat.name,
        meta: beat.timing ?? t('studioDoc.metaBeat'),
      })),
      ...(doc.dynamicEvents ?? []).map((event) => ({
        id: event.id,
        label: event.name,
        meta: t('studioDoc.metaDynamicEvent'),
      })),
      ...(doc.spatialReads ?? []).map((read) => ({
        id: read.id,
        label: read.name,
        meta: t('studioDoc.metaSpatialRead'),
      })),
      ...(doc.cameraPlan ?? []).map((camera) => ({
        id: camera.id,
        label: camera.mode,
        meta: t('studioDoc.metaCamera'),
      })),
    ];
  }
  if (doc.kind === 'node-graph') {
    return [
      ...doc.nodes.map((node) => ({ id: node.id, label: node.title, meta: node.category })),
      ...doc.edges.map((edge) => ({ id: edge.id, label: edge.label ?? `${edge.from} -> ${edge.to}`, meta: t('studioDoc.metaEdge') })),
    ];
  }
  if (doc.kind === 'behavior-tree') {
    return doc.nodes.map((node) => ({ id: node.id, label: node.name, meta: node.type }));
  }
  return [
    ...(doc.metrics ?? []).map((metric) => ({ id: metric.id, label: metric.label, meta: t('studioDoc.metaMetric') })),
    ...(doc.loops ?? []).map((loop) => ({ id: loop.id, label: loop.name, meta: t('studioDoc.labelLoop') })),
    ...(doc.risks ?? []).map((risk) => ({ id: risk.id, label: risk.label, meta: risk.severity })),
  ];
}

function detailsForSelection(doc: GameStudioDocument, id: string, t: StudioTranslator): string {
  if (doc.kind === 'game-viewport') {
    const entity = doc.entities?.find((item) => item.id === id);
    if (entity) return entity.notes ?? t('studioDoc.detailEntityPosition', { type: entity.type, x: entity.x, y: entity.y });
    const terrainZone = doc.terrainZones?.find((item) => item.id === id);
    if (terrainZone) {
      return terrainZone.notes ?? compactText([terrainZone.traversal, terrainZone.cover, terrainZone.mood], t('studioDoc.needsStudioReviewNotes'));
    }
    const terrainPaintStroke = doc.terrainPaintStrokes?.find((item) => item.id === id);
    if (terrainPaintStroke) {
      return terrainPaintStroke.notes ?? t('studioDoc.detailControlPoints', {
        type: terrainPaintStroke.material ?? terrainPaintStroke.type ?? t('studioDoc.metaTerrainPaint'),
        count: terrainPaintStroke.points.length,
      });
    }
    const terrainSculptPatch = doc.terrainSculptPatches?.find((item) => item.id === id);
    if (terrainSculptPatch) {
      return terrainSculptPatch.notes ?? compactText([terrainSculptPatch.meshIntent, terrainSculptPatch.traversalImpact], t('studioDoc.needsStudioReviewNotes'));
    }
    const path = doc.paths?.find((item) => item.id === id);
    if (path) {
      return path.notes ?? t('studioDoc.detailControlPoints', {
        type: path.type ?? t('studioDoc.metaPath'),
        count: path.points.length,
      });
    }
    const beat = doc.beats?.find((item) => item.id === id);
    if (beat) return beat.notes ?? beat.objective ?? t('studioDoc.detailSceneBeatNeedsPacing');
    const event = doc.dynamicEvents?.find((item) => item.id === id);
    if (event) return `${event.trigger ?? t('studioDoc.detailTriggerTbd')} -> ${event.impact ?? t('studioDoc.detailImpactTbd')}`;
    const read = doc.spatialReads?.find((item) => item.id === id);
    if (read) return read.sightline ?? read.traversalRhythm ?? read.tensionSpacing ?? t('studioDoc.detailSpatialReadNeedsNotes');
    const camera = doc.cameraPlan?.find((item) => item.id === id);
    if (camera) return `${camera.framing}${camera.readability ? `. ${camera.readability}` : ''}`;
  }
  if (doc.kind === 'node-graph') {
    const node = doc.nodes.find((item) => item.id === id);
    if (node) return node.description ?? t('studioDoc.detailNodeWithOutputs', { category: node.category, count: node.outputs?.length ?? 0 });
    const edge = doc.edges.find((item) => item.id === id);
    if (edge) return edge.condition ?? edge.label ?? t('studioDoc.detailRoutesTo', { from: edge.from, to: edge.to });
  }
  if (doc.kind === 'behavior-tree') {
    const node = doc.nodes.find((item) => item.id === id);
    if (node) {
      return node.counterplay ?? node.readability ?? node.condition ?? node.action ?? node.notes ?? t('studioDoc.detailBehaviorNodeNeedsCounterplay');
    }
  }
  if (doc.kind === 'game-system') {
    const metric = doc.metrics?.find((item) => item.id === id);
    if (metric) {
      return metric.current
        ? t('studioDoc.detailMetricTargetCurrent', { target: metric.target, current: metric.current })
        : t('studioDoc.detailMetricTargetOnly', { target: metric.target });
    }
    const loop = doc.loops?.find((item) => item.id === id);
    if (loop) return `${loop.steps.join(' -> ')}${loop.reward ? ` ${t('studioDoc.detailLoopReward', { reward: loop.reward })}` : ''}`;
    const risk = doc.risks?.find((item) => item.id === id);
    if (risk) return risk.mitigation;
  }
  return t('studioDoc.noInspectorDetails');
}

function normalizeViewport(record: Record<string, unknown>, fileName: string): GameViewportDocument {
  const doc = defaultViewportDocument(fileName);
  return {
    ...doc,
    ...pickCommon(record, doc.title),
    kind: 'game-viewport',
    surface: stringField(record.surface) ?? doc.surface,
    objective: stringField(record.objective) ?? doc.objective,
    camera: stringField(record.camera) ?? doc.camera,
    scale: stringField(record.scale) ?? doc.scale,
    layers: arrayField(record.layers) as GameViewportDocument['layers'] ?? doc.layers,
    entities: normalizeViewportEntities(record.entities) ?? doc.entities,
    terrainZones: normalizeViewportTerrainZones(record.terrainZones) ?? doc.terrainZones,
    terrainPaintStrokes: normalizeViewportTerrainPaintStrokes(record.terrainPaintStrokes) ?? doc.terrainPaintStrokes,
    terrainSculptPatches: normalizeViewportTerrainSculptPatches(record.terrainSculptPatches) ?? doc.terrainSculptPatches,
    paths: normalizeViewportPaths(record.paths) ?? doc.paths,
    beats: arrayField(record.beats) as GameViewportDocument['beats'] ?? doc.beats,
    dynamicEvents: arrayField(record.dynamicEvents) as GameViewportDocument['dynamicEvents'] ?? doc.dynamicEvents,
    spatialReads: arrayField(record.spatialReads) as GameViewportDocument['spatialReads'] ?? doc.spatialReads,
    worldSimulation: isRecord(record.worldSimulation) ? record.worldSimulation as GameViewportDocument['worldSimulation'] : doc.worldSimulation,
    cameraPlan: arrayField(record.cameraPlan) as GameViewportDocument['cameraPlan'] ?? doc.cameraPlan,
    accessibilityNotes: stringArrayField(record.accessibilityNotes) ?? doc.accessibilityNotes,
  };
}

function normalizeNodeGraph(record: Record<string, unknown>, fileName: string): GameNodeGraphDocument {
  const doc = defaultNodeGraphDocument(fileName);
  return {
    ...doc,
    ...pickCommon(record, doc.title),
    kind: 'node-graph',
    graphType: stringField(record.graphType) ?? doc.graphType,
    owner: stringField(record.owner) ?? doc.owner,
    nodes: normalizeGraphNodes(record.nodes) ?? doc.nodes,
    edges: normalizeGraphEdges(record.edges) ?? doc.edges,
    variables: arrayField(record.variables) as GameNodeGraphDocument['variables'] ?? doc.variables,
    collaborationNotes: arrayField(record.collaborationNotes) as GameNodeGraphDocument['collaborationNotes'] ?? doc.collaborationNotes,
    critiqueNotes: stringArrayField(record.critiqueNotes) ?? doc.critiqueNotes,
  };
}

function normalizeBehaviorTree(record: Record<string, unknown>, fileName: string): BehaviorTreeDocument {
  const doc = defaultBehaviorTreeDocument(fileName);
  const nodes = normalizeBehaviorNodes(record.nodes) ?? doc.nodes;
  return {
    ...doc,
    ...pickCommon(record, doc.title),
    kind: 'behavior-tree',
    owner: stringField(record.owner) ?? doc.owner,
    behaviorType: stringField(record.behaviorType) ?? doc.behaviorType,
    rootId: stringField(record.rootId) ?? nodes[0]?.id ?? doc.rootId,
    nodes,
    transitions: arrayField(record.transitions) as BehaviorTreeDocument['transitions'] ?? doc.transitions,
    readableTells: stringArrayField(record.readableTells) ?? doc.readableTells,
    counterplayRules: stringArrayField(record.counterplayRules) ?? doc.counterplayRules,
    dynamicDifficultyRules: stringArrayField(record.dynamicDifficultyRules) ?? doc.dynamicDifficultyRules,
    difficultyNotes: stringArrayField(record.difficultyNotes) ?? doc.difficultyNotes,
    accessibilityNotes: stringArrayField(record.accessibilityNotes) ?? doc.accessibilityNotes,
  };
}

function normalizeGameSystem(record: Record<string, unknown>, fileName: string): GameSystemSpecDocument {
  const doc = defaultSystemDocument(fileName);
  return {
    ...doc,
    ...pickCommon(record, doc.title),
    kind: 'game-system',
    systemType: stringField(record.systemType) ?? doc.systemType,
    pillars: stringArrayField(record.pillars) ?? doc.pillars,
    metrics: arrayField(record.metrics) as GameSystemSpecDocument['metrics'] ?? doc.metrics,
    loops: arrayField(record.loops) as GameSystemSpecDocument['loops'] ?? doc.loops,
    tuning: isRecord(record.tuning) ? record.tuning as Record<string, string | number | boolean> : doc.tuning,
    designTokens: isRecord(record.designTokens) ? record.designTokens as GameSystemSpecDocument['designTokens'] : doc.designTokens,
    risks: arrayField(record.risks) as GameSystemSpecDocument['risks'] ?? doc.risks,
    benchmarks: arrayField(record.benchmarks) as GameSystemSpecDocument['benchmarks'] ?? doc.benchmarks,
    feasibility: isRecord(record.feasibility) ? record.feasibility as GameSystemSpecDocument['feasibility'] : doc.feasibility,
    production: isRecord(record.production) ? record.production as GameSystemSpecDocument['production'] : doc.production,
    telemetry: arrayField(record.telemetry) as GameSystemSpecDocument['telemetry'] ?? doc.telemetry,
    iterationGoals: stringArrayField(record.iterationGoals) ?? doc.iterationGoals,
    ethics: stringArrayField(record.ethics) ?? doc.ethics,
    platformAdaptation: arrayField(record.platformAdaptation) as GameSystemSpecDocument['platformAdaptation'] ?? doc.platformAdaptation,
    accessibility: stringArrayField(record.accessibility) ?? doc.accessibility,
    playtestQuestions: stringArrayField(record.playtestQuestions) ?? doc.playtestQuestions,
  };
}

function defaultViewportDocument(fileName: string): GameViewportDocument {
  const surface = fileName.includes('world') ? 'world-map' : fileName.includes('narrative') ? 'narrative' : fileName.includes('level') ? 'level' : 'gameplay';
  return {
    version: 1,
    kind: 'game-viewport',
    surface,
    title: titleFromFile(fileName),
    objective: 'Block out the player objective, readable route, encounter pressure, and reward cadence.',
    camera: 'top-down planning camera',
    scale: '1 unit = 1 meter',
    layers: [
      { id: 'terrain', name: 'Terrain and cover', type: 'terrain', visible: true },
      { id: 'encounters', name: 'Encounters', type: 'combat', visible: true },
      { id: 'simulation', name: 'Simulation and events', type: 'simulation', visible: true },
    ],
    entities: [
      { id: 'player-spawn', name: 'Player Spawn', type: 'player-spawn', x: 90, y: 300, notes: 'Start with a landmark and a safe camera read.' },
      { id: 'objective', name: 'Objective Core', type: 'objective', x: 770, y: 280, notes: 'Primary goal is visible before pressure peaks.' },
      { id: 'enemy-wave-a', name: 'Enemy Wave A', type: 'enemy-spawn', x: 470, y: 210, danger: 2, notes: 'Introduces the main counterplay pattern.' },
      { id: 'checkpoint', name: 'Checkpoint', type: 'checkpoint', x: 610, y: 420, notes: 'Recovery beat before escalation.' },
    ],
    terrainZones: [
      {
        id: 'cover-pocket',
        name: 'Cover Pocket',
        type: 'cover-field',
        x: 280,
        y: 230,
        w: 240,
        h: 120,
        layerId: 'terrain',
        cover: 'Breaks ranged pressure while preserving objective sightlines.',
        notes: 'Tune cover density before adding more enemy pressure.',
      },
    ],
    terrainPaintStrokes: [
      {
        id: 'readability-paint',
        name: 'Readable Terrain Paint',
        type: 'traversal',
        material: 'worn safe path',
        brushSize: 24,
        opacity: 0.5,
        layerId: 'terrain',
        points: [{ x: 160, y: 360 }, { x: 280, y: 340 }, { x: 420, y: 370 }],
        notes: 'Paints a subtle traversal read without becoming a hard route.',
      },
    ],
    terrainSculptPatches: [
      {
        id: 'teaching-ridge',
        name: 'Teaching Ridge Sculpt',
        type: 'ridge',
        x: 410,
        y: 255,
        radius: 72,
        height: 0.9,
        falloff: 'smooth',
        layerId: 'terrain',
        samples: [
          { x: 350, y: 250, height: 0.45, radius: 42 },
          { x: 410, y: 255, height: 0.9, radius: 72 },
          { x: 480, y: 278, height: 0.55, radius: 46 },
        ],
        meshIntent: 'Low ridge changes cover value and camera visibility without blocking the critical path.',
        traversalImpact: 'Slope should read as dashable and avoid hidden collision catches.',
      },
    ],
    paths: [
      { id: 'critical-path', name: 'Critical Path', type: 'objective', points: [{ x: 120, y: 330 }, { x: 330, y: 270 }, { x: 560, y: 360 }, { x: 800, y: 310 }] },
      { id: 'stealth-route', name: 'Optional Stealth Route', type: 'stealth', points: [{ x: 130, y: 430 }, { x: 370, y: 500 }, { x: 650, y: 470 }, { x: 830, y: 370 }] },
    ],
    beats: [
      { id: 'beat-intro', name: 'Teach Objective', timing: '0:00-0:45', objective: 'Read the landmark and reach first cover.' },
      { id: 'beat-escalate', name: 'Pressure Window', timing: '0:45-2:00', objective: 'Enemy wave tests movement and resource use.' },
    ],
    dynamicEvents: [
      { id: 'weather-shift', name: 'Visibility Shift', trigger: 'after first objective pickup', impact: 'reduces sightline and pushes HUD threat indicators' },
    ],
    spatialReads: [
      {
        id: 'arena-readability',
        name: 'Arena Readability',
        sightline: 'Player sees objective, cover, and first threat before entering the pressure zone.',
        chokepoint: 'Middle lane narrows to teach ability timing without trapping retreat.',
        tensionSpacing: 'Recovery beat sits between wave pressure and objective reveal.',
      },
    ],
    worldSimulation: {
      ecosystem: 'Small reactive loop: patrols react to weather shift and objective pickup.',
      factionTerritory: ['Enemy pressure owns center lane; neutral shortcut wraps the edge.'],
      weather: 'Visibility shift after pickup.',
      persistence: 'Checkpoint, opened shortcut, and collected reward persist.',
      reactiveRules: ['If player takes stealth route, reduce first wave and spawn a scout near objective.'],
    },
    cameraPlan: [
      {
        id: 'planning-camera',
        mode: 'top-down',
        framing: 'Keep player, next cover, and objective marker in frame during pressure beats.',
        x: 170,
        y: 120,
        targetX: 390,
        targetY: 270,
        readability: 'Never hide enemy telegraphs behind HUD chrome.',
      },
    ],
    accessibilityNotes: ['Keep objective markers distinguishable without relying only on hue.'],
  };
}

function defaultNodeGraphDocument(fileName: string): GameNodeGraphDocument {
  return {
    version: 1,
    kind: 'node-graph',
    graphType: 'gameplay-logic',
    title: titleFromFile(fileName),
    owner: 'Gameplay Systems',
    nodes: [
      { id: 'input-enter-zone', title: 'Player Enters Zone', category: 'input', x: 70, y: 120, description: 'Trigger when the player crosses the encounter boundary.' },
      { id: 'condition-ready', title: 'Has Ability Ready', category: 'condition', x: 310, y: 120, description: 'Checks cooldown and resource state before escalation.' },
      { id: 'spawn-wave', title: 'Spawn Pressure Wave', category: 'spawn', x: 550, y: 120, description: 'Creates readable enemy pressure with recovery spacing.' },
      { id: 'reward', title: 'Grant Route Reward', category: 'reward', x: 760, y: 240, description: 'Rewards route mastery with loot, lore, or shortcut unlock.' },
    ],
    edges: [
      { id: 'edge-ready-check', from: 'input-enter-zone', to: 'condition-ready', label: 'on enter' },
      { id: 'edge-spawn', from: 'condition-ready', to: 'spawn-wave', condition: 'ability ready or tutorial skip' },
      { id: 'edge-reward', from: 'spawn-wave', to: 'reward', condition: 'wave cleared or stealth bypassed' },
    ],
    variables: [{ id: 'difficulty', name: 'difficultyScalar', value: 1, notes: 'Scales spawn count and reward payout.' }],
    collaborationNotes: [
      { agent: 'gameplay', concern: 'Pressure must teach the core verb before reward payout.', decision: 'Spawn one readable wave before the first upgrade.' },
      { agent: 'level', concern: 'Route choice needs visible consequences.', decision: 'Stealth bypass alters spawn composition and reward notes.' },
    ],
    critiqueNotes: ['Watch for hidden fail states that the player cannot read.'],
  };
}

function defaultBehaviorTreeDocument(fileName: string): BehaviorTreeDocument {
  return {
    version: 1,
    kind: 'behavior-tree',
    title: titleFromFile(fileName),
    owner: 'Enemy Captain',
    behaviorType: 'enemy-ai',
    rootId: 'root',
    nodes: [
      { id: 'root', name: 'Combat Director', type: 'root', readability: 'The enemy always telegraphs mode shifts.' },
      { id: 'select-state', parentId: 'root', name: 'Select State', type: 'selector', priority: 1 },
      { id: 'has-line', parentId: 'select-state', name: 'Has Line Of Sight', type: 'condition', condition: 'player visible for 0.4s', counterplay: 'Break sightline or use smoke.' },
      { id: 'ranged-burst', parentId: 'has-line', name: 'Ranged Burst', type: 'action', action: 'fire three-shot burst with 0.25s tell', counterplay: 'Dodge after muzzle flare.' },
      { id: 'flank', parentId: 'select-state', name: 'Flank Cover', type: 'action', action: 'move to nearest side cover if suppressed', readability: 'Voice bark announces reposition.' },
    ],
    transitions: [
      { id: 'suppressed-to-flank', from: 'ranged-burst', to: 'flank', trigger: 'suppression > 60%', cooldown: '8s' },
    ],
    readableTells: ['Muzzle flare before burst', 'Voice bark before flank', 'Distinct stance for suppressed state'],
    counterplayRules: ['Break sightline', 'Use smoke', 'Punish flank recovery window'],
    dynamicDifficultyRules: ['Increase flank frequency before increasing burst damage.'],
    difficultyNotes: ['Raise aggression by shortening recovery windows, not by hiding telegraphs.'],
    accessibilityNotes: ['Pair visual tells with audio cues and subtitle barks.'],
  };
}

function defaultSystemDocument(fileName: string): GameSystemSpecDocument {
  return {
    version: 1,
    kind: 'game-system',
    systemType: fileName.includes('camera') ? 'camera' : fileName.includes('economy') ? 'economy' : 'combat',
    title: titleFromFile(fileName),
    pillars: ['Readable pressure', 'Fair mastery', 'Production-feasible tuning'],
    metrics: [
      { id: 'time-to-master', label: 'Time To Master Core Verb', target: '8 minutes', risk: 'medium' },
      { id: 'fail-readability', label: 'Readable Failure Rate', target: '90% explainable deaths', risk: 'high' },
    ],
    loops: [
      { id: 'core-loop', name: 'Core Loop', cadence: '30-90 seconds', steps: ['scan', 'commit', 'execute', 'recover', 'upgrade'], reward: 'new route, loot, or mastery tell' },
    ],
    tuning: { difficultyScalar: 1, assistWindowMs: 180, cooldownPressure: 0.65 },
    designTokens: {
      rarityColors: { common: 'oklch(74% 0.03 245)', rare: 'oklch(67% 0.14 242)', legendary: 'oklch(74% 0.18 78)' },
      statusEffectColors: { danger: 'oklch(64% 0.2 28)', healing: 'oklch(72% 0.16 155)', cooldown: 'oklch(68% 0.12 250)' },
      motionProfiles: { hitstopMs: 80, dodgeIFramesMs: 180, cameraShake: 'short-low-amplitude' },
      audioCues: { rareDrop: 'two-note shimmer', bossPhase: 'low brass hit + UI pulse' },
    },
    risks: [
      { id: 'scope-risk', label: 'Animation workload', severity: 'medium', mitigation: 'Limit launch weapon families and share anticipation poses.' },
      { id: 'clarity-risk', label: 'Feedback overload', severity: 'high', mitigation: 'Reserve brightest VFX for damage, healing, objective, and boss phase changes.' },
    ],
    benchmarks: [
      { id: 'benchmark-clarity', game: 'Genre leader', lesson: 'Readable tells beat raw effect density.', caution: 'Avoid cloning specific UI or mechanics.' },
    ],
    feasibility: {
      teamSize: '2-5 developers',
      timeline: '6-10 week vertical slice',
      complexity: 'indie',
      constraints: ['Reuse animation state machine clips', 'Keep telemetry lightweight for v1'],
    },
    production: {
      milestone: 'Vertical slice',
      assetBudget: 'One hero kit, two enemy kits, one biome, one boss arena, shared VFX library.',
      qaFocus: ['Readable deaths', 'Input buffering', 'HUD scaling', 'checkpoint persistence'],
      engineNotes: ['Keep logic data-driven so Unity, Godot, or WebGL can share tuning tables.'],
      scalingVariants: [
        { scale: 'solo', tradeoff: 'Ship one weapon family and procedural room modifiers.' },
        { scale: 'aaa', tradeoff: 'Expand faction AI, cinematic boss phases, and bespoke biome traversal.' },
      ],
    },
    telemetry: [
      { id: 'death-readability', signal: 'death reason survey + combat event log', designQuestion: 'Do players understand why they failed?', action: 'Retune telegraphs or HUD warnings.' },
    ],
    iterationGoals: ['Improve first 90 seconds readability', 'Reduce reward delay after recovery beats'],
    ethics: ['No pay-to-win tuning gates', 'Avoid retention pressure that punishes missed days'],
    platformAdaptation: [
      { platform: 'mobile', input: 'one-thumb dodge + auto-target option', performance: 'limit particles during hitstop', readability: 'larger threat arrows' },
      { platform: 'pc/console', input: 'keyboard/mouse and gamepad prompts', performance: 'scalable VFX and ultrawide-safe HUD', readability: 'couch-distance HUD scale' },
    ],
    accessibility: ['Remappable controls', 'Reduced motion camera shake', 'Subtitle and audio cue pairing'],
    playtestQuestions: ['Do players understand why they failed?', 'Which reward beat makes them want one more run?'],
  };
}

function pickCommon(
  record: Record<string, unknown>,
  fallbackTitle: string,
): Pick<GameStudioDocument, 'version' | 'title'> {
  return {
    version: 1,
    title: stringField(record.title) ?? fallbackTitle,
  };
}

function normalizeViewportEntities(value: unknown): GameViewportEntity[] | undefined {
  const items = arrayField(value);
  if (!items) return undefined;
  const entities = items.filter(isRecord).map((item, index) => ({
    id: stringField(item.id) ?? `entity-${index + 1}`,
    name: stringField(item.name) ?? `Entity ${index + 1}`,
    type: stringField(item.type) ?? 'objective',
    x: numberField(item.x) ?? 80 + index * 120,
    y: numberField(item.y) ?? 120 + index * 60,
    w: numberField(item.w),
    h: numberField(item.h),
    layerId: stringField(item.layerId),
    faction: stringField(item.faction),
    danger: numberField(item.danger),
    objective: stringField(item.objective),
    spawnRule: stringField(item.spawnRule),
    interaction: stringField(item.interaction),
    reward: stringField(item.reward),
    counterplay: stringField(item.counterplay),
    notes: stringField(item.notes),
  }));
  return entities.length > 0 ? entities : undefined;
}

function normalizeViewportTerrainZones(value: unknown): GameViewportTerrainZone[] | undefined {
  const items = arrayField(value);
  if (!items) return undefined;
  const zones = items.filter(isRecord).map((item, index) => {
    const points = (arrayField(item.points) ?? [])
      .filter(isRecord)
      .map((point) => ({ x: numberField(point.x) ?? 0, y: numberField(point.y) ?? 0 }));
    return {
      id: stringField(item.id) ?? `terrain-zone-${index + 1}`,
      name: stringField(item.name) ?? `Terrain Zone ${index + 1}`,
      shape: stringField(item.shape),
      type: stringField(item.type),
      x: numberField(item.x) ?? 220 + index * 80,
      y: numberField(item.y) ?? 180 + index * 55,
      w: numberField(item.w) ?? 220,
      h: numberField(item.h) ?? 140,
      ...(points.length >= 3 ? { points } : {}),
      layerId: stringField(item.layerId),
      traversal: stringField(item.traversal),
      cover: stringField(item.cover),
      mood: stringField(item.mood),
      notes: stringField(item.notes),
    };
  });
  return zones.length > 0 ? zones : undefined;
}

function normalizeViewportTerrainPaintStrokes(value: unknown): GameViewportTerrainPaintStroke[] | undefined {
  const items = arrayField(value);
  if (!items) return undefined;
  const strokes = items.filter(isRecord).map((item, index) => ({
    id: stringField(item.id) ?? `terrain-paint-${index + 1}`,
    name: stringField(item.name) ?? `Terrain Paint ${index + 1}`,
    type: stringField(item.type),
    material: stringField(item.material),
    brushSize: numberField(item.brushSize),
    opacity: numberField(item.opacity),
    layerId: stringField(item.layerId),
    points: (arrayField(item.points) ?? [])
      .filter(isRecord)
      .map((point) => ({ x: numberField(point.x) ?? 0, y: numberField(point.y) ?? 0 })),
    notes: stringField(item.notes),
  })).filter((stroke) => stroke.points.length >= 2);
  return strokes.length > 0 ? strokes : undefined;
}

function normalizeViewportTerrainSculptPatches(value: unknown): GameViewportTerrainSculptPatch[] | undefined {
  const items = arrayField(value);
  if (!items) return undefined;
  const patches = items.filter(isRecord).map((item, index) => {
    const samples = (arrayField(item.samples) ?? [])
      .filter(isRecord)
      .map((sample) => ({
        x: numberField(sample.x) ?? 0,
        y: numberField(sample.y) ?? 0,
        height: numberField(sample.height) ?? 0,
        radius: numberField(sample.radius),
      }));
    return {
      id: stringField(item.id) ?? `terrain-sculpt-${index + 1}`,
      name: stringField(item.name) ?? `Terrain Sculpt ${index + 1}`,
      type: stringField(item.type),
      x: numberField(item.x) ?? 260 + index * 90,
      y: numberField(item.y) ?? 210 + index * 60,
      radius: numberField(item.radius),
      height: numberField(item.height) ?? 0,
      falloff: stringField(item.falloff),
      layerId: stringField(item.layerId),
      ...(samples.length > 0 ? { samples } : {}),
      meshIntent: stringField(item.meshIntent),
      traversalImpact: stringField(item.traversalImpact),
      notes: stringField(item.notes),
    };
  });
  return patches.length > 0 ? patches : undefined;
}

function normalizeViewportPaths(value: unknown): GameViewportDocument['paths'] | undefined {
  const items = arrayField(value);
  if (!items) return undefined;
  const paths = items.filter(isRecord).map((item, index) => ({
    id: stringField(item.id) ?? `path-${index + 1}`,
    name: stringField(item.name) ?? `Path ${index + 1}`,
    type: stringField(item.type),
    notes: stringField(item.notes),
    points: (arrayField(item.points) ?? [])
      .filter(isRecord)
      .map((point) => ({ x: numberField(point.x) ?? 0, y: numberField(point.y) ?? 0 })),
  })).filter((path) => path.points.length > 0);
  return paths.length > 0 ? paths : undefined;
}

function normalizeGraphNodes(value: unknown): GameNodeGraphNode[] | undefined {
  const items = arrayField(value);
  if (!items) return undefined;
  const nodes = items.filter(isRecord).map((item, index) => ({
    id: stringField(item.id) ?? `node-${index + 1}`,
    title: stringField(item.title) ?? stringField(item.name) ?? `Node ${index + 1}`,
    category: stringField(item.category) ?? 'action',
    x: numberField(item.x) ?? 80 + index * 180,
    y: numberField(item.y) ?? 120 + (index % 3) * 130,
    description: stringField(item.description),
    inputs: arrayField(item.inputs) as GameNodeGraphNode['inputs'],
    outputs: arrayField(item.outputs) as GameNodeGraphNode['outputs'],
    tuning: isRecord(item.tuning) ? item.tuning as GameNodeGraphNode['tuning'] : undefined,
  }));
  return nodes.length > 0 ? nodes : undefined;
}

function normalizeGraphEdges(value: unknown): GameNodeGraphDocument['edges'] | undefined {
  const items = arrayField(value);
  if (!items) return undefined;
  const edges = items.filter(isRecord).map((item, index) => ({
    id: stringField(item.id) ?? `edge-${index + 1}`,
    from: stringField(item.from) ?? '',
    to: stringField(item.to) ?? '',
    label: stringField(item.label),
    condition: stringField(item.condition),
  })).filter((edge) => edge.from && edge.to);
  return edges.length > 0 ? edges : undefined;
}

function normalizeBehaviorNodes(value: unknown): BehaviorTreeNode[] | undefined {
  const items = arrayField(value);
  if (!items) return undefined;
  const nodes = items.filter(isRecord).map((item, index) => ({
    id: stringField(item.id) ?? `btree-${index + 1}`,
    parentId: stringField(item.parentId),
    name: stringField(item.name) ?? `Behavior ${index + 1}`,
    type: stringField(item.type) ?? (index === 0 ? 'root' : 'action'),
    priority: numberField(item.priority),
    condition: stringField(item.condition),
    action: stringField(item.action),
    counterplay: stringField(item.counterplay),
    readability: stringField(item.readability),
    notes: stringField(item.notes),
  }));
  return nodes.length > 0 ? nodes : undefined;
}

function layoutBehaviorTree(nodes: BehaviorTreeNode[], rootId: string) {
  const children = new Map<string, BehaviorTreeNode[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    const list = children.get(node.parentId) ?? [];
    list.push(node);
    children.set(node.parentId, list);
  }
  const root = nodes.find((node) => node.id === rootId) ?? nodes[0];
  if (!root) return [];
  const rows: BehaviorTreeNode[][] = [];
  const queue: Array<{ node: BehaviorTreeNode; depth: number }> = [{ node: root, depth: 0 }];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const item = queue.shift()!;
    if (visited.has(item.node.id)) continue;
    visited.add(item.node.id);
    rows[item.depth] = rows[item.depth] ?? [];
    rows[item.depth]!.push(item.node);
    for (const child of children.get(item.node.id) ?? []) queue.push({ node: child, depth: item.depth + 1 });
  }
  return rows.flatMap((row, depth) => {
    const gap = 820 / Math.max(row.length, 1);
    return row.map((node, index) => ({
      ...node,
      x: 90 + index * gap,
      y: 70 + depth * 118,
    }));
  });
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  if (!text.trim()) return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function formatStudioSchemaError(error: { issues?: Array<{ path: Array<string | number>; message: string }> }, t?: StudioTranslator): string {
  const issue = error.issues?.[0];
  if (!issue) return t ? t('studioDoc.schemaMismatch') : 'Studio document does not match the game schema.';
  const path = issue.path.length > 0 ? issue.path.join('.') : t ? t('studioDoc.schemaDocumentPath') : 'document';
  return `${path}: ${issue.message}`;
}

function labelForKind(kind: StudioDocKind, t: StudioTranslator): string {
  if (kind === 'game-viewport') return t('studioDoc.kindGameViewport');
  if (kind === 'node-graph') return t('studioDoc.kindNodeGraph');
  if (kind === 'behavior-tree') return t('studioDoc.kindBehaviorTree');
  return t('studioDoc.kindGameSystem');
}

function titleFromFile(name: string): string {
  const base = name.split('/').pop() ?? name;
  return base
    .replace(/\.(gameview|nodegraph|btree|systems)\.json$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function scaleX(value: number): number {
  if (value <= 1) return value * 1000;
  if (value <= 100) return value * 10;
  return Math.max(0, Math.min(960, value));
}

function scaleY(value: number): number {
  if (value <= 1) return value * 620;
  if (value <= 100) return value * 6.2;
  return Math.max(0, Math.min(590, value));
}

function clampViewportCoordinate(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function roundViewportHeight(value: number): number {
  return Math.round(value * 100) / 100;
}

function clampViewportRadius(value: number): number {
  return Math.max(16, Math.min(180, Math.round(value)));
}

function uniqueViewportEntityId(doc: GameViewportDocument, base: string): string {
  const existing = new Set((doc.entities ?? []).map((entity) => entity.id));
  let index = (doc.entities?.length ?? 0) + 1;
  let id = `${base}-${index}`;
  while (existing.has(id)) {
    index += 1;
    id = `${base}-${index}`;
  }
  return id;
}

function uniqueViewportTerrainZoneId(doc: GameViewportDocument, base: string): string {
  const existing = new Set((doc.terrainZones ?? []).map((zone) => zone.id));
  let index = (doc.terrainZones?.length ?? 0) + 1;
  let id = `${base}-${index}`;
  while (existing.has(id)) {
    index += 1;
    id = `${base}-${index}`;
  }
  return id;
}

function uniqueViewportTerrainPaintStrokeId(doc: GameViewportDocument, base: string): string {
  const existing = new Set((doc.terrainPaintStrokes ?? []).map((stroke) => stroke.id));
  let index = (doc.terrainPaintStrokes?.length ?? 0) + 1;
  let id = `${base}-${index}`;
  while (existing.has(id)) {
    index += 1;
    id = `${base}-${index}`;
  }
  return id;
}

function uniqueViewportTerrainSculptPatchId(doc: GameViewportDocument, base: string): string {
  const existing = new Set((doc.terrainSculptPatches ?? []).map((patch) => patch.id));
  let index = (doc.terrainSculptPatches?.length ?? 0) + 1;
  let id = `${base}-${index}`;
  while (existing.has(id)) {
    index += 1;
    id = `${base}-${index}`;
  }
  return id;
}

function uniqueViewportCameraId(doc: GameViewportDocument, base: string): string {
  const existing = new Set((doc.cameraPlan ?? []).map((camera) => camera.id));
  let index = (doc.cameraPlan?.length ?? 0) + 1;
  let id = `${base}-${index}`;
  while (existing.has(id)) {
    index += 1;
    id = `${base}-${index}`;
  }
  return id;
}

function cameraHandlePosition(camera: GameViewportCameraPlan, index: number): { x: number; y: number } {
  return {
    x: numberField(camera.x) ?? 170 + index * 170,
    y: numberField(camera.y) ?? 120 + (index % 2) * 120,
  };
}

function cameraTargetPosition(camera: GameViewportCameraPlan, index: number): { x: number; y: number } {
  const handle = cameraHandlePosition(camera, index);
  return {
    x: numberField(camera.targetX) ?? clampViewportCoordinate(handle.x + 220, 0, 940),
    y: numberField(camera.targetY) ?? clampViewportCoordinate(handle.y + 150, 0, 580),
  };
}

function cameraPositionLabel(camera: GameViewportCameraPlan, index: number): string {
  const position = cameraHandlePosition(camera, index);
  return `Camera ${Math.round(position.x)}, ${Math.round(position.y)}`;
}

function terrainZonePositionLabel(zone: GameViewportTerrainZone): string {
  const pointCount = terrainZonePolygonPoints(zone).length;
  if (pointCount >= 3) return `Terrain ${Math.round(zone.x)}, ${Math.round(zone.y)} (${pointCount} pts)`;
  return `Terrain ${Math.round(zone.x)}, ${Math.round(zone.y)} (${Math.round(zone.w)}x${Math.round(zone.h)})`;
}

function terrainZonePolygonPoints(zone: GameViewportTerrainZone): Array<{ x: number; y: number }> {
  return (zone.points ?? []).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function terrainPaintStrokeAnchor(stroke: GameViewportTerrainPaintStroke): { x: number; y: number } {
  return stroke.points[0] ?? { x: 0, y: 0 };
}

function terrainPaintStrokePositionLabel(stroke: GameViewportTerrainPaintStroke): string {
  const anchor = terrainPaintStrokeAnchor(stroke);
  return `Paint ${Math.round(anchor.x)}, ${Math.round(anchor.y)} (${stroke.points.length} pts)`;
}

function terrainSculptPatchSamples(patch: GameViewportTerrainSculptPatch): Array<{ x: number; y: number; height: number; radius?: number }> {
  const samples = (patch.samples ?? []).filter((sample) => (
    Number.isFinite(sample.x) &&
    Number.isFinite(sample.y) &&
    Number.isFinite(sample.height)
  ));
  return samples.length > 0 ? samples : [{ x: patch.x, y: patch.y, height: patch.height, radius: patch.radius }];
}

type TerrainSculptMeshVertex = {
  x: number;
  y: number;
  height: number;
  influence: number;
};

function terrainSculptMeshVertices(patch: GameViewportTerrainSculptPatch): TerrainSculptMeshVertex[] {
  const samples = terrainSculptPatchSamples(patch);
  const maxRadius = Math.max(32, ...samples.map((sample) => sample.radius ?? patch.radius ?? 54));
  const minX = clampViewportCoordinate(Math.min(...samples.map((sample) => sample.x)) - maxRadius, 0, 940);
  const maxX = clampViewportCoordinate(Math.max(...samples.map((sample) => sample.x)) + maxRadius, 0, 940);
  const minY = clampViewportCoordinate(Math.min(...samples.map((sample) => sample.y)) - maxRadius, 0, 580);
  const maxY = clampViewportCoordinate(Math.max(...samples.map((sample) => sample.y)) + maxRadius, 0, 580);
  const steps = 5;
  const vertices: TerrainSculptMeshVertex[] = [];
  for (let row = 0; row < steps; row += 1) {
    for (let column = 0; column < steps; column += 1) {
      const x = clampViewportCoordinate(minX + ((maxX - minX) * column) / (steps - 1), 0, 940);
      const y = clampViewportCoordinate(minY + ((maxY - minY) * row) / (steps - 1), 0, 580);
      vertices.push(terrainSculptMeshVertexAt(patch, samples, x, y));
    }
  }
  return vertices;
}

function terrainSculptMeshVertexAt(
  patch: GameViewportTerrainSculptPatch,
  samples: Array<{ x: number; y: number; height: number; radius?: number }>,
  x: number,
  y: number,
): TerrainSculptMeshVertex {
  let weightedHeight = 0;
  let totalWeight = 0;
  for (const sample of samples) {
    const radius = Math.max(1, sample.radius ?? patch.radius ?? 54);
    const distance = Math.hypot(sample.x - x, sample.y - y);
    if (distance > radius) continue;
    const linearWeight = 1 - distance / radius;
    const weight = terrainSculptFalloffWeight(linearWeight, patch.falloff);
    weightedHeight += sample.height * weight;
    totalWeight += weight;
  }
  return {
    x,
    y,
    height: totalWeight > 0 ? roundViewportHeight(weightedHeight / totalWeight) : 0,
    influence: roundViewportHeight(Math.min(1, totalWeight)),
  };
}

function terrainSculptFalloffWeight(weight: number, falloff?: string): number {
  const clamped = Math.max(0, Math.min(1, weight));
  if (falloff === 'linear') return clamped;
  if (falloff === 'sharp') return Math.pow(clamped, 0.55);
  if (falloff === 'flat') return clamped > 0 ? 1 : 0;
  return clamped * clamped * (3 - 2 * clamped);
}

function terrainSculptPatchPositionLabel(patch: GameViewportTerrainSculptPatch): string {
  const samples = terrainSculptPatchSamples(patch);
  return `Sculpt ${Math.round(patch.x)}, ${Math.round(patch.y)} height ${heightLabel(patch.height)} (${samples.length} samples)`;
}

function heightLabel(height: number): string {
  const rounded = roundViewportHeight(height);
  return `${rounded > 0 ? '+' : ''}${rounded}m`;
}

function fillForEntity(entity: GameViewportEntity): string {
  if (entity.type.includes('enemy')) return 'rgba(255, 107, 107, 0.55)';
  if (entity.type.includes('player')) return 'rgba(78, 231, 178, 0.5)';
  if (entity.type.includes('reward')) return 'rgba(255, 209, 102, 0.55)';
  if (entity.type.includes('hazard')) return 'rgba(255, 132, 74, 0.55)';
  if (entity.type.includes('checkpoint')) return 'rgba(132, 213, 255, 0.45)';
  return 'rgba(90, 127, 255, 0.45)';
}

function fillForTerrainZone(zone: GameViewportTerrainZone): string {
  const type = zone.type ?? '';
  if (type.includes('hazard')) return 'rgba(255, 132, 74, 0.2)';
  if (type.includes('high-ground')) return 'rgba(255, 209, 102, 0.18)';
  if (type.includes('water')) return 'rgba(73, 210, 255, 0.18)';
  if (type.includes('safe')) return 'rgba(78, 231, 178, 0.18)';
  if (type.includes('biome')) return 'rgba(162, 124, 255, 0.18)';
  if (type.includes('arena')) return 'rgba(255, 107, 107, 0.16)';
  return 'rgba(132, 213, 255, 0.16)';
}

function fillForTerrainPaintStroke(stroke: GameViewportTerrainPaintStroke): string {
  const type = stroke.type ?? '';
  if (type.includes('hazard')) return '#ff844a';
  if (type.includes('cover')) return '#84d5ff';
  if (type.includes('biome')) return '#a27cff';
  if (type.includes('traversal')) return '#4ee7b2';
  return '#ffd166';
}

function fillForTerrainSculptPatch(patch: GameViewportTerrainSculptPatch): string {
  if (patch.height < 0) return 'rgba(73, 210, 255, 0.38)';
  if ((patch.type ?? '').includes('crater')) return 'rgba(255, 132, 74, 0.28)';
  if ((patch.type ?? '').includes('ramp')) return 'rgba(78, 231, 178, 0.26)';
  return 'rgba(255, 209, 102, 0.3)';
}

function strokeForTerrainSculptHeight(height: number): string {
  if (height < 0) return '#49d2ff';
  if (height > 1.5) return '#ff844a';
  return '#ffd166';
}

function arrayField(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function stringArrayField(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const clean = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return clean.length > 0 ? clean : undefined;
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
