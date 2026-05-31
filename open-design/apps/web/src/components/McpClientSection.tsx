// External studio MCP servers panel.
//
// AI Game Design Studio connects to the configured servers as a CLIENT and surfaces
// their tools to the underlying agent (Claude Code, Hermes, Kimi for v1).
// This panel is the creator-facing connector setup; persistence flows through
// `state/mcp.ts` -> daemon `/api/mcp/servers`.

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  disconnectMcpOAuth,
  fetchMcpOAuthStatus,
  fetchMcpServers,
  saveMcpServers,
  startMcpOAuth,
  suggestMcpServerId,
} from '../state/mcp';
import type {
  McpOAuthStatusResponse,
  McpServerConfig,
  McpTemplate,
} from '../state/mcp';
import { useT } from '../i18n';
import { Icon } from './Icon';

type Translator = (key: string, vars?: Record<string, string | number>) => string;

interface Props {
  // Receive a notification when servers list changes so the parent can
  // re-render dependent affordances (e.g. composer chip count). Optional.
  onServersChanged?: (servers: McpServerConfig[]) => void;
  // Surface the dirty/save state up to the dialog footer so a single
  // "Save" button can drive both the global config and this section.
  onDirtyChange?: (dirty: boolean) => void;
}

// Imperative handle: lets the dialog footer Save button trigger this
// section's save without us having to lift the entire row state up.
export interface McpClientSectionHandle {
  save: () => Promise<boolean>;
  hasDirty: () => boolean;
}

interface DraftRow extends McpServerConfig {
  // Local-only flags. Stripped before sending to the daemon.
  _isNew?: boolean;
  // Free-form text for the env / headers panel — committed back to a real
  // map when the creator steps away from the field.
  _envText?: string;
  _headersText?: string;
  // Per-instance local id to use as a stable React `key` independent of
  // the editable `id` field (avoids remounts & focus loss while editing).
  _localId: string;
}

// Simple incrementing local id generator for row keys. Kept module-scoped
// and deterministic for the lifetime of this UI instance.
let NEXT_LOCAL_ID = 1;
function genLocalId(): string {
  return `mcp-row-${NEXT_LOCAL_ID++}`;
}

function rowsFromServers(servers: McpServerConfig[]): DraftRow[] {
  return servers.map((s) => ({
    ...s,
    _envText: s.env ? mapToText(s.env) : '',
    _headersText: s.headers ? mapToText(s.headers) : '',
    _localId: genLocalId(),
  }));
}

function mapToText(m: Record<string, string>): string {
  return Object.entries(m)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
}

function textToMap(text: string | undefined): Record<string, string> | undefined {
  if (!text) return undefined;
  const out: Record<string, string> = {};
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim();
    if (!k) continue;
    out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function rowsToServers(rows: DraftRow[]): McpServerConfig[] {
  return rows.map((r) => {
    const out: McpServerConfig = {
      id: r.id,
      transport: r.transport,
      enabled: r.enabled,
    };
    if (r.label) out.label = r.label;
    if (r.templateId) out.templateId = r.templateId;
    if (r.transport === 'stdio') {
      if (r.command) out.command = r.command;
      if (r.args && r.args.length > 0) out.args = r.args;
      const env = textToMap(r._envText);
      if (env) out.env = env;
    } else {
      if (r.url) out.url = r.url;
      const headers = textToMap(r._headersText);
      if (headers) out.headers = headers;
    }
    return out;
  });
}

function rowFromTemplate(
  tpl: McpTemplate,
  taken: ReadonlySet<string>,
): DraftRow {
  const id = suggestMcpServerId(tpl.id, taken);
  const env: Record<string, string> = {};
  for (const f of tpl.envFields ?? []) env[f.key] = '';
  const headers: Record<string, string> = {};
  for (const f of tpl.headerFields ?? []) headers[f.key] = '';
  return {
    id,
    label: tpl.label,
    templateId: tpl.id,
    transport: tpl.transport,
    enabled: true,
    command: tpl.command,
    args: tpl.args ? [...tpl.args] : undefined,
    url: tpl.url,
    _envText: Object.keys(env).length > 0 ? mapToText(env) : '',
    _headersText: Object.keys(headers).length > 0 ? mapToText(headers) : '',
    _isNew: true,
    _localId: genLocalId(),
  };
}

function rowFromBlank(taken: ReadonlySet<string>): DraftRow {
  return {
    id: suggestMcpServerId('custom', taken),
    label: '',
    transport: 'stdio',
    enabled: true,
    command: '',
    args: [],
    _envText: '',
    _headersText: '',
    _isNew: true,
    _localId: genLocalId(),
  };
}

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

// Picker grouping. Mirrors `McpTemplateCategory` in `packages/contracts`.
// The order here is the *display* order in the picker — keep it intentional
// so the most useful categories for AI Game Design Studio (game-asset
// generation, then editing, then publishing surfaces) sit at the top.
const CATEGORY_ORDER: ReadonlyArray<{
  id: NonNullable<McpTemplate['category']>;
  labelKey: string;
  hintKey: string;
}> = [
  {
    id: 'image-generation',
    labelKey: 'settings.externalMcpCategoryImageGeneration',
    hintKey: 'settings.externalMcpCategoryImageGenerationHint',
  },
  {
    id: 'image-editing',
    labelKey: 'settings.externalMcpCategoryImageEditing',
    hintKey: 'settings.externalMcpCategoryImageEditingHint',
  },
  {
    id: 'web-capture',
    labelKey: 'settings.externalMcpCategoryWebCapture',
    hintKey: 'settings.externalMcpCategoryWebCaptureHint',
  },
  {
    id: 'art-bibles',
    labelKey: 'settings.externalMcpCategoryArtBibles',
    hintKey: 'settings.externalMcpCategoryArtBiblesHint',
  },
  {
    id: 'game-ui-modules',
    labelKey: 'settings.externalMcpCategoryGameUiModules',
    hintKey: 'settings.externalMcpCategoryGameUiModulesHint',
  },
  {
    id: 'data-viz',
    labelKey: 'settings.externalMcpCategoryDataViz',
    hintKey: 'settings.externalMcpCategoryDataVizHint',
  },
  {
    id: 'publishing',
    labelKey: 'settings.externalMcpCategoryPublishing',
    hintKey: 'settings.externalMcpCategoryPublishingHint',
  },
  {
    id: 'utilities',
    labelKey: 'settings.externalMcpCategoryUtilities',
    hintKey: 'settings.externalMcpCategoryUtilitiesHint',
  },
];

const LEGACY_ART_BIBLE_CATEGORY = `design-${'systems'}` as const;
const LEGACY_GAME_UI_MODULE_CATEGORY = `ui-${'components'}` as const;

type LegacyMcpTemplateCategory =
  | McpTemplate['category']
  | typeof LEGACY_ART_BIBLE_CATEGORY
  | typeof LEGACY_GAME_UI_MODULE_CATEGORY;

function normalizeTemplateCategory(category: LegacyMcpTemplateCategory): McpTemplate['category'] {
  if (category === LEGACY_ART_BIBLE_CATEGORY) return 'art-bibles'; // legacy alias for saved/template payloads
  if (category === LEGACY_GAME_UI_MODULE_CATEGORY) return 'game-ui-modules'; // legacy alias for saved/template payloads
  return category;
}

function templateMatchesQuery(tpl: McpTemplate, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    tpl.label.toLowerCase().includes(needle) ||
    tpl.id.toLowerCase().includes(needle) ||
    (tpl.description?.toLowerCase().includes(needle) ?? false) ||
    (tpl.example?.toLowerCase().includes(needle) ?? false)
  );
}

function validateRow(r: DraftRow, t: Translator): string | null {
  if (!ID_PATTERN.test(r.id)) {
    return t('settings.externalMcpInvalidId');
  }
  if (r.transport === 'stdio') {
    if (!r.command || !r.command.trim()) return t('settings.externalMcpCommandRequired');
  } else {
    if (!r.url || !r.url.trim()) return t('settings.externalMcpUrlRequired');
    try {
      const parsed = new URL(r.url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return t('settings.externalMcpUrlProtocol');
      }
    } catch {
      return t('settings.externalMcpUrlMalformed');
    }
  }
  return null;
}

// Stable signature used to detect dirty state — cheap diff against the
// last-known-saved server list. Avoids a deep equality library.
function signature(rows: DraftRow[]): string {
  return JSON.stringify(rowsToServers(rows));
}

export const McpClientSection = forwardRef<McpClientSectionHandle, Props>(
  function McpClientSection({ onServersChanged, onDirtyChange }, ref) {
  const t = useT() as Translator;
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [savedSig, setSavedSig] = useState<string>('[]');
  const [templates, setTemplates] = useState<McpTemplate[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Free-text filter at the top of the picker. Empty string = show all.
  // Lives in the section (not the picker render block) so toggling the
  // picker preserves the creator's last query while they scan through it.
  const [pickerQuery, setPickerQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await fetchMcpServers();
      if (cancelled) return;
      if (!data) {
        setError(t('settings.externalMcpDaemonUnreachable'));
        setLoaded(true);
        return;
      }
      const fresh = rowsFromServers(data.servers);
      setRows(fresh);
      setSavedSig(signature(fresh));
      setTemplates(data.templates);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = useMemo(() => signature(rows) !== savedSig, [rows, savedSig]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const updateRow = (idx: number, patch: Partial<DraftRow>) => {
    setRows((curr) => curr.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const removeRow = (idx: number) => {
    setRows((curr) => curr.filter((_, i) => i !== idx));
  };

  const moveRow = (idx: number, dir: -1 | 1) => {
    setRows((curr) => {
      const next = [...curr];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return curr;
      [next[idx], next[target]] = [next[target]!, next[idx]!];
      return next;
    });
  };

  const addFromTemplate = (tpl: McpTemplate) => {
    setPickerOpen(false);
    setRows((curr) => [...curr, rowFromTemplate(tpl, new Set(curr.map((r) => r.id)))]);
  };

  const addBlank = () => {
    setPickerOpen(false);
    setRows((curr) => [...curr, rowFromBlank(new Set(curr.map((r) => r.id)))]);
  };

  const save = async (): Promise<boolean> => {
    for (const r of rows) {
      const err = validateRow(r, t);
      if (err) {
        setError(`${r.label || r.id}: ${err}`);
        return false;
      }
    }
    setError(null);
    setSaving(true);
    const payload = rowsToServers(rows);
    const data = await saveMcpServers(payload);
    setSaving(false);
    if (!data) {
      setError(t('settings.externalMcpSaveFailed'));
      return false;
    }
    const fresh = rowsFromServers(data.servers);
    setRows(fresh);
    setSavedSig(signature(fresh));
    setTemplates(data.templates);
    setSavedAt(Date.now());
    onServersChanged?.(data.servers);
    return true;
  };

  useImperativeHandle(ref, () => ({
    save,
    hasDirty: () => dirty,
  }), [save, dirty]);

  if (!loaded) {
    return (
      <section className="settings-section">
        <div className="section-head">
          <div>
            <h3>{t('settings.externalMcpHeading')}</h3>
            <p className="hint">{t('settings.externalMcpLoading')}</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="settings-section">
      <div className="section-head">
        <div>
          <h3>{t('settings.externalMcpHeading')}</h3>
          <p className="hint">
            {t('settings.externalMcpDescription')}
          </p>
        </div>
        <button
          type="button"
          className="primary mcp-add-btn"
          onClick={() => setPickerOpen((v) => !v)}
          aria-expanded={pickerOpen}
        >
          <Icon name="sparkles" size={13} />
          <span>{t('settings.externalMcpAddServer')}</span>
        </button>
      </div>

      {pickerOpen ? (
        <PickerPanel
          templates={templates}
          query={pickerQuery}
          onQueryChange={setPickerQuery}
          onPick={addFromTemplate}
          onPickBlank={addBlank}
          onClose={() => setPickerOpen(false)}
          t={t}
        />
      ) : null}

      {error ? (
        <div className="mcp-error">{error}</div>
      ) : null}

      {rows.length === 0 ? (
        <div className="empty-card">
          <strong>{t('settings.externalMcpEmptyTitle')}</strong>
          <p className="hint">
            {t('settings.externalMcpEmptyBody')}
          </p>
        </div>
      ) : (
        <div className="mcp-rows">
          {rows.map((row, idx) => (
            <McpRow
              key={row._localId}
              row={row}
              idx={idx}
              total={rows.length}
              template={
                row.templateId
                  ? templates.find((t) => t.id === row.templateId)
                  : undefined
              }
              onChange={(patch) => updateRow(idx, patch)}
              onRemove={() => removeRow(idx)}
              onMoveUp={idx > 0 ? () => moveRow(idx, -1) : undefined}
              onMoveDown={idx < rows.length - 1 ? () => moveRow(idx, 1) : undefined}
              t={t}
            />
          ))}
        </div>
      )}

      <div className="mcp-foot">
        <button
          type="button"
          className="primary"
          onClick={() => void save()}
          disabled={saving || !dirty}
        >
          {saving ? t('settings.externalMcpSaving') : dirty ? t('settings.externalMcpSaveChanges') : t('settings.externalMcpSaved')}
        </button>
        {savedAt && !dirty ? (
          <span className="hint mcp-saved-msg">{t('settings.externalMcpSavedMessage')}</span>
        ) : null}
        <span className="mcp-foot-spacer" />
        <span className="hint">
          {t('settings.externalMcpStoredPrefix')} <code>mcp-config.json</code>
        </span>
      </div>
    </section>
  );
});

interface PickerPanelProps {
  templates: McpTemplate[];
  query: string;
  onQueryChange: (q: string) => void;
  onPick: (tpl: McpTemplate) => void;
  onPickBlank: () => void;
  onClose: () => void;
  t: Translator;
}

/**
 * The "Add server" picker, broken out so we can give it categorized
 * `<details>` groups, an inline filter and a sticky close affordance.
 *
 * Player-experience rules:
 *  - Groups are collapsed by default once the catalog crosses ~12 entries
 *    so the picker fits in a normal viewport. We pre-expand all groups
 *    when the creator types a search so matches are immediately visible.
 *  - Groups with zero matching templates are hidden entirely while a
 *    search is active to avoid a wall of empty headers.
 *  - "Custom studio server" lives in its own footer card pinned below the groups
 *    so creators can always reach it even after scrolling through templates.
 */
function PickerPanel({
  templates,
  query,
  onQueryChange,
  onPick,
  onPickBlank,
  onClose,
  t,
}: PickerPanelProps) {
  const grouped = useMemo(() => {
    const buckets = new Map<McpTemplate['category'], McpTemplate[]>();
    for (const tpl of templates) {
      const category = normalizeTemplateCategory(tpl.category);
      const list = buckets.get(category) ?? [];
      list.push(tpl);
      buckets.set(category, list);
    }
    return buckets;
  }, [templates]);

  const trimmed = query.trim();
  const hasQuery = trimmed.length > 0;

  // Total visible across all groups so we can show an empty-state if the
  // search filters everything out.
  let visibleTotal = 0;
  const renderGroups = CATEGORY_ORDER.map((cat) => {
    const all = grouped.get(cat.id) ?? [];
    const matched = all.filter((t) => templateMatchesQuery(t, trimmed));
    visibleTotal += matched.length;
    if (all.length === 0) return null;
    if (hasQuery && matched.length === 0) return null;
    // Default-expanded for the first three groups (the visual-asset
    // pipeline most creators will land here for); collapsed otherwise.
    // Active query forces every visible group open so matches surface
    // without an extra click.
    const defaultOpen =
      hasQuery ||
      cat.id === 'image-generation' ||
      cat.id === 'image-editing' ||
      cat.id === 'web-capture';
    return (
      <details
        key={cat.id}
        className="mcp-picker-group"
        open={defaultOpen}
      >
        <summary className="mcp-picker-group-summary">
          <span className="mcp-picker-group-summary-title">{t(cat.labelKey)}</span>
          <span className="mcp-picker-group-summary-count">
            {hasQuery ? `${matched.length}/${all.length}` : all.length}
          </span>
          <span className="mcp-picker-group-summary-hint">{t(cat.hintKey)}</span>
        </summary>
        <div className="mcp-picker-grid">
          {matched.map((tpl) => (
            <PickerCard key={tpl.id} tpl={tpl} onPick={() => onPick(tpl)} t={t} />
          ))}
        </div>
      </details>
    );
  });

  return (
    <div className="mcp-picker">
      <div className="mcp-picker-head">
        <div className="mcp-picker-head-row">
          <strong>{t('settings.externalMcpPickerTitle')}</strong>
          <button
            type="button"
            className="icon-btn mcp-picker-close"
            onClick={onClose}
            title={t('settings.externalMcpClosePicker')}
            aria-label={t('settings.externalMcpClosePicker')}
          >
            ×
          </button>
        </div>
        <span className="hint">
          {t('settings.externalMcpPickerHint')}
        </span>
        <input
          type="search"
          className="mcp-picker-search"
          placeholder={t('settings.externalMcpFilterPlaceholder')}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          spellCheck={false}
          autoFocus
        />
      </div>

      <div className="mcp-picker-groups">
        {renderGroups}
        {hasQuery && visibleTotal === 0 ? (
          <div className="mcp-picker-empty hint">
            {t('settings.externalMcpNoTemplates', { query: trimmed })}
          </div>
        ) : null}
      </div>

      <div className="mcp-picker-foot">
        <button
          type="button"
          className="mcp-picker-item mcp-picker-item-action mcp-picker-custom"
          onClick={onPickBlank}
        >
          <span className="mcp-picker-item-head">
            <Icon name="settings" size={13} />
            <strong>{t('settings.externalMcpCustomTitle')}</strong>
          </span>
          <span className="mcp-picker-desc">
            {t('settings.externalMcpCustomDescription')}
          </span>
        </button>
      </div>
    </div>
  );
}

function PickerCard({
  tpl,
  onPick,
  t,
}: {
  tpl: McpTemplate;
  onPick: () => void;
  t: Translator;
}) {
  return (
    <div className="mcp-picker-item">
      <button
        type="button"
        className="mcp-picker-item-action"
        onClick={onPick}
        title={tpl.description}
      >
        <span className="mcp-picker-item-head">
          <Icon name="link" size={13} />
          <strong>{tpl.label}</strong>
          <span className="mcp-picker-transport">{tpl.transport}</span>
        </span>
        <span className="mcp-picker-desc">{tpl.description}</span>
        {tpl.example ? (
          <span className="mcp-picker-example">
            <span className="mcp-picker-example-label">{t('settings.externalMcpTryLabel')}</span>
            <span className="mcp-picker-example-text">"{tpl.example}"</span>
          </span>
        ) : null}
      </button>
      {tpl.homepage ? (
        <a
          className="mcp-picker-homepage"
          href={tpl.homepage}
          target="_blank"
          rel="noreferrer noopener"
          title={tpl.homepage}
        >
          <Icon name="external-link" size={11} />
          <span>{t('settings.externalMcpHomepage')}</span>
        </a>
      ) : null}
    </div>
  );
}

interface RowProps {
  row: DraftRow;
  idx: number;
  total: number;
  // The original built-in template this row was instantiated from, when the
  // creator picked a preset. Lets us surface description / homepage / example
  // hints inline so the saved row is still readable in studio settings.
  template?: McpTemplate;
  onChange: (patch: Partial<DraftRow>) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  t: Translator;
}

function McpRow({ row, idx, total, template, onChange, onRemove, onMoveUp, onMoveDown, t }: RowProps) {
  const isHttpLike = row.transport === 'http' || row.transport === 'sse';
  const [expanded, setExpanded] = useState<boolean>(false);
  const summaryTitle = row.label?.trim() || row.id || t('settings.externalMcpUnnamedServer');
  const [showMcpExample, setShowMcpExample] = useState<boolean>(false);
  const helperId = `mcp-json-helper-panel-${row._localId}`;

  return (
    <div
      className={`mcp-row${row.enabled ? '' : ' mcp-row-disabled'}${
        expanded ? ' mcp-row-expanded' : ''
      }`}
    >
      <div className="mcp-row-head">
        <label className="mcp-row-toggle" title={row.enabled ? t('common.active') : t('common.offline')}>
          <input
            type="checkbox"
            checked={row.enabled}
            onChange={(e) => onChange({ enabled: e.target.checked })}
            aria-label={t('settings.externalMcpEnableServer')}
          />
        </label>
        {expanded ? (
          <input
            type="text"
            className="mcp-row-label"
            value={row.label ?? ''}
            placeholder={t('settings.externalMcpDisplayNamePlaceholder')}
            onChange={(e) => onChange({ label: e.target.value })}
          />
        ) : (
          <button
            type="button"
            className="mcp-row-summary-title"
            onClick={() => setExpanded(true)}
            title={t('settings.externalMcpExpandEdit')}
          >
            <span className="mcp-row-summary-name">{summaryTitle}</span>
            <span
              className="mcp-row-summary-transport"
              aria-label={t('settings.externalMcpTransportAria', { transport: row.transport })}
            >
              {row.transport}
            </span>
          </button>
        )}
        <span className="mcp-row-counter hint">
          {idx + 1} / {total}
        </span>
        <div className="mcp-row-actions">
          {onMoveUp ? (
            <button type="button" className="icon-btn" onClick={onMoveUp} title={t('settings.externalMcpMoveUp')}>
              ↑
            </button>
          ) : null}
          {onMoveDown ? (
            <button type="button" className="icon-btn" onClick={onMoveDown} title={t('settings.externalMcpMoveDown')}>
              ↓
            </button>
          ) : null}
          <button
            type="button"
            className="icon-btn"
            onClick={onRemove}
            title={t('settings.externalMcpRemoveServer')}
          >
            ×
          </button>
          <button
            type="button"
            className="icon-btn mcp-row-toggle-btn"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? t('settings.externalMcpCollapseServer') : t('settings.externalMcpExpandServer')}
            title={expanded ? t('settings.externalMcpCollapse') : t('settings.externalMcpExpand')}
          >
            <Icon name="chevron-down" size={13} />
          </button>
        </div>
      </div>

      {expanded ? (
        <>
          {template ? (
            <details className="mcp-row-info">
              <summary className="mcp-row-info-summary">
                <span className="mcp-row-info-summary-label">
                  {t('settings.externalMcpAboutTemplate', { name: template.label })}
                </span>
                {template.homepage ? (
                  <a
                    className="mcp-row-info-link"
                    href={template.homepage}
                    target="_blank"
                    rel="noreferrer noopener"
                    title={template.homepage}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Icon name="external-link" size={11} />
                    <span>{t('settings.externalMcpHomepage')}</span>
                  </a>
                ) : null}
              </summary>
              <div className="mcp-row-info-body">
                {template.description ? (
                  <p className="mcp-row-info-desc hint">{template.description}</p>
                ) : null}
                {template.example ? (
                  <p
                    className="mcp-row-info-example"
                    title={t('settings.externalMcpTryTitle')}
                  >
                    <span className="mcp-row-info-example-label">{t('settings.externalMcpTryLabel')}</span>{' '}
                    <span className="mcp-row-info-example-text">"{template.example}"</span>
                  </p>
                ) : null}
              </div>
            </details>
          ) : null}

          {isHttpLike && !row._isNew && row.id ? (
            <McpOAuthControl serverId={row.id} t={t} />
          ) : null}
          {isHttpLike && row._isNew ? (
            <div className="mcp-oauth-hint hint">
              {t('settings.externalMcpOauthSaveFirstPrefix')} <strong>{t('settings.externalMcpConnect')}</strong>{' '}
              {t('settings.externalMcpOauthSaveFirstSuffix')}
            </div>
          ) : null}

          <div className="mcp-row-grid">
            <label className="mcp-row-field">
              <span className="mcp-row-field-label">ID</span>
              <input
                type="text"
                value={row.id}
                onChange={(e) => onChange({ id: e.target.value })}
                spellCheck={false}
              />
            </label>
            <label className="mcp-row-field">
              <span className="mcp-row-field-label">{t('settings.externalMcpTransportLabel')}</span>
              <select
                value={row.transport}
                onChange={(e) =>
                  onChange({ transport: e.target.value as DraftRow['transport'] })
                }
              >
                <option value="stdio">stdio</option>
                <option value="sse">SSE</option>
                <option value="http">streamable HTTP</option>
              </select>
            </label>
          </div>

          {row.transport === 'stdio' ? (
            <>
              <label className="mcp-row-field mcp-row-field-stack">
                <span className="mcp-row-field-label">{t('settings.externalMcpCommandLabel')}</span>
                <input
                  type="text"
                  value={row.command ?? ''}
                  placeholder={t('settings.externalMcpCommandPlaceholder')}
                  onChange={(e) => onChange({ command: e.target.value })}
                  spellCheck={false}
                />
              </label>
              <label className="mcp-row-field mcp-row-field-stack">
                <span className="mcp-row-field-label">{t('settings.externalMcpArgsLabel')}</span>
                <input
                  type="text"
                  value={(row.args ?? []).join(' ')}
                  placeholder={t('settings.externalMcpArgsPlaceholder')}
                  onChange={(e) =>
                    onChange({
                      args: e.target.value
                        .split(/\s+/)
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  spellCheck={false}
                />
              </label>
              <label className="mcp-row-field mcp-row-field-stack">
                <span className="mcp-row-field-label">{t('settings.externalMcpEnvLabel')}</span>
                <textarea
                  rows={Math.max(2, (row._envText ?? '').split('\n').length)}
                  value={row._envText ?? ''}
                  placeholder={t('settings.externalMcpEnvPlaceholder')}
                  onChange={(e) => onChange({ _envText: e.target.value })}
                  spellCheck={false}
                />
              </label>
            </>
          ) : (
            <>
              <label className="mcp-row-field mcp-row-field-stack">
                <span className="mcp-row-field-label">{t('settings.externalMcpUrlLabel')}</span>
                <input
                  type="text"
                  value={row.url ?? ''}
                  placeholder={t('settings.externalMcpUrlPlaceholder')}
                  onChange={(e) => onChange({ url: e.target.value })}
                  spellCheck={false}
                />
              </label>
              <label className="mcp-row-field mcp-row-field-stack">
                <span className="mcp-row-field-label">{t('settings.externalMcpHeadersLabel')}</span>
                <textarea
                  rows={Math.max(2, (row._headersText ?? '').split('\n').length)}
                  value={row._headersText ?? ''}
                  placeholder={t('settings.externalMcpHeadersPlaceholder')}
                  onChange={(e) => onChange({ _headersText: e.target.value })}
                  spellCheck={false}
                />
              </label>
            </>
          )}

          <div className={`mcp-json-helper ${showMcpExample ? 'is-open' : ''}`}>
            <button
              type="button"
              className="mcp-json-helper-toggle"
              aria-expanded={showMcpExample}
              aria-controls={helperId}
              onClick={() => setShowMcpExample((prev) => !prev)}
            >
              <span className="mcp-json-helper-toggle-content">
                <span className="mcp-json-helper-eye">
                  <Icon name="eye" />
                </span>
                <span className="mcp-json-helper-toggle-text">
                  {t('settings.externalMcpJsonHelperToggle')}
                </span>
              </span>
              <span className="mcp-json-helper-toggle-icon">
                {showMcpExample ? (
                  <Icon name="arrow-up" />
                ) : (
                  <Icon name="chevron-down" />
                )}
              </span>
            </button>

            {showMcpExample && (
              <div className="mcp-json-helper-example" id={helperId}>
                <div className="mcp-json-helper-example-head">
                  {t('settings.externalMcpJsonHelperHead')}
                </div>
                <pre className="mcp-json-helper-code">
                  <code>
                    <span className="json-punctuation">{"{"}</span>
                    {"\n  "}
                    <span className="json-key">"mcpServers"</span>
                    <span className="json-punctuation">: {"{"}</span>
                    {"\n    "}
                    <span className="json-key">"tdesign"</span>
                    <span className="json-punctuation">: {"{"}</span>
                    {"\n      "}
                    <span className="json-key">"command"</span>
                    <span className="json-punctuation">:</span>{" "}
                    <span className="json-string">"npx"</span>
                    <span className="json-punctuation">,</span>
                    {"\n      "}
                    <span className="json-key">"args"</span>
                    <span className="json-punctuation">: [</span>
                    <span className="json-string">"-y"</span>
                    <span className="json-punctuation">, </span>
                    <span className="json-string">"tdesign-mcp-server@latest"</span>
                    <span className="json-punctuation">],</span>
                    {"\n      "}
                    <span className="json-key">"env"</span>
                    <span className="json-punctuation">: {"{"}</span>
                    {"\n        "}
                    <span className="json-key">"API_KEY"</span>
                    <span className="json-punctuation">:</span>{" "}
                    <span className="json-string">"your-key-here"</span>
                    {"\n      "}
                    <span className="json-punctuation">{"}"}</span>
                    {"\n    "}
                    <span className="json-punctuation">{"}"}</span>
                    {"\n  "}
                    <span className="json-punctuation">{"}"}</span>
                    {"\n"}
                    <span className="json-punctuation">{"}"}</span>
                  </code>
                </pre>
                <div className="mcp-json-helper-conversion">
                  <div>
                    <strong>{t('settings.externalMcpCommandLabel')}</strong>
                    <code>npx</code>
                  </div>
                  <div>
                    <strong>{t('settings.externalMcpArgsLabel')}</strong>
                    <code>-y tdesign-mcp-server@latest</code>
                  </div>
                  <div>
                    <strong>{t('settings.externalMcpEnvShortLabel')}</strong>
                    <code>API_KEY = your-key-here</code>
                  </div>
                  <div>
                    <strong>HTTP / SSE</strong>
                    <code>{t('settings.externalMcpHttpSseHint')}</code>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

/**
 * "Connect" / "Disconnect" panel for an HTTP/SSE MCP server.
 *
 * The OAuth flow is fully owned by the daemon — this section just kicks
 * it off (POST /api/mcp/oauth/start), opens the returned authorize URL in
 * a new tab, listens for the postMessage from the callback page, and
 * refreshes the local status badge. There's also a fallback poll every
 * 2 seconds while a connect is pending in case the callback page can't
 * reach back via postMessage (cross-origin tab opener edge cases).
 */
function McpOAuthControl({ serverId, t }: { serverId: string; t: Translator }) {
  const [status, setStatus] = useState<McpOAuthStatusResponse | null>(null);
  const [busy, setBusy] = useState<'idle' | 'starting' | 'awaiting' | 'disconnecting' | 'refreshing'>('idle');
  const [error, setError] = useState<string | null>(null);
  // Holds the authorize URL while we are waiting on the creator to complete
  // OAuth in their browser. Surfaced as a fallback `<a>` so the creator can
  // re-open the tab if they accidentally closed it (or if the system
  // browser ate the popup-open call without giving us feedback).
  const [pendingAuthUrl, setPendingAuthUrl] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = async () => {
    const data = await fetchMcpOAuthStatus(serverId);
    if (data) setStatus(data);
    return data;
  };

  useEffect(() => {
    void refresh();
  }, [serverId]);

  // Listen for the postMessage that the callback HTML page emits when the
  // OAuth flow completes. We accept messages from any origin because the
  // callback page is served by THIS daemon, but we still validate the
  // payload shape before reacting to it.
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const data = ev.data;
      if (!data || typeof data !== 'object') return;
      if (data.type !== 'mcp-oauth') return;
      if (data.serverId && data.serverId !== serverId) return;
      if (data.ok) {
        setError(null);
        setPendingAuthUrl(null);
        void refresh();
      } else if (typeof data.message === 'string') {
        setError(data.message);
      }
      setBusy('idle');
      stopPoll();
    }
    window.addEventListener('message', onMessage);
    let bc: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel('agds-mcp-oauth');
      bc.onmessage = (ev) => onMessage(ev as MessageEvent);
    }
    return () => {
      window.removeEventListener('message', onMessage);
      if (bc) bc.close();
      stopPoll();
    };
  }, [serverId]);

  function stopPoll() {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }

  function startPoll() {
    stopPoll();
    let elapsed = 0;
    pollTimer.current = setInterval(() => {
      elapsed += 2000;
      void (async () => {
        const data = await refresh();
        // Auto-stop when the daemon reports connected — handles the
        // Electron / system-browser case where postMessage can never
        // reach back across processes, so polling IS the delivery
        // channel for "auth completed" events.
        if (data?.connected) {
          setBusy('idle');
          setError(null);
          setPendingAuthUrl(null);
          stopPoll();
        }
      })();
      // Top out at 5 minutes — same as the daemon-side state cache TTL.
      if (elapsed >= 5 * 60 * 1000) stopPoll();
    }, 2000);
  }

  const onConnect = async () => {
    setError(null);
    setPendingAuthUrl(null);
    setBusy('starting');
    const result = await startMcpOAuth(serverId);
    if (!result.ok) {
      setBusy('idle');
      setError(result.message);
      return;
    }
    setBusy('awaiting');
    setPendingAuthUrl(result.response.authorizeUrl);
    startPoll();
    // Best-effort: try to open the tab automatically. We deliberately do
    // NOT treat a null return value as failure — Electron's
    // setWindowOpenHandler always returns deny (so window.open returns
    // null) but actually invokes shell.openExternal under the hood, so
    // the URL DID open in the system browser. The fallback link below
    // covers the rare case where neither path actually opens a tab.
    try {
      window.open(
        result.response.authorizeUrl,
        '_blank',
        'noopener=no,noreferrer=no',
      );
    } catch {
      // ignore — fallback anchor is always rendered while pending
    }
  };

  // Manual fallback for the creator to push when they've completed auth in
  // another tab/window but the postMessage handshake didn't fire (closed
  // opener tab, cross-origin Electron BrowserWindow, etc.).
  const onRefreshStatus = async () => {
    setBusy('refreshing');
    const data = await refresh();
    setBusy('idle');
    if (data?.connected) {
      setError(null);
      setPendingAuthUrl(null);
      stopPoll();
    } else if (busy === 'awaiting' || pendingAuthUrl) {
      // Still pending — keep the awaiting indicator visible so the creator
      // knows we're still listening for the callback.
      setBusy('awaiting');
    }
  };

  const onCancelPending = () => {
    setPendingAuthUrl(null);
    setBusy('idle');
    setError(null);
    stopPoll();
  };

  const onDisconnect = async () => {
    setBusy('disconnecting');
    const ok = await disconnectMcpOAuth(serverId);
    setBusy('idle');
    if (ok) {
      setError(null);
      setPendingAuthUrl(null);
      setStatus({ connected: false });
    } else {
      setError(t('settings.externalMcpDisconnectFailed'));
    }
  };

  const connected = Boolean(status?.connected);
  const expiresLabel =
    status?.expiresAt && status.expiresAt > 0
      ? new Date(status.expiresAt).toLocaleString()
      : null;
  const isAwaiting = busy === 'awaiting' || (Boolean(pendingAuthUrl) && !connected);

  return (
    <div className={`mcp-oauth-control${connected ? ' connected' : ''}`}>
      <div className="mcp-oauth-status" aria-live="polite">
        {connected ? (
          <>
            <span className="mcp-oauth-dot mcp-oauth-dot-ok" aria-hidden />
            <span>
              <strong>{t('settings.externalMcpConnected')}</strong>{' '}
              {expiresLabel ? (
                <span className="hint">{t('settings.externalMcpTokenExpires', { time: expiresLabel })}</span>
              ) : (
                <span className="hint">{t('settings.externalMcpNonExpiringToken')}</span>
              )}
            </span>
          </>
        ) : isAwaiting ? (
          <>
            <span className="mcp-oauth-dot mcp-oauth-dot-pending" aria-hidden />
            <span>
              <strong>{t('settings.externalMcpWaitingAuthorization')}</strong>{' '}
              <span className="hint">
                {t('settings.externalMcpWaitingHint')}
              </span>
            </span>
          </>
        ) : (
          <>
            <span className="mcp-oauth-dot" aria-hidden />
            <span>
              <strong>{t('settings.externalMcpNotConnected')}</strong>{' '}
              <span className="hint">
                {t('settings.externalMcpNotConnectedHint')}
              </span>
            </span>
          </>
        )}
      </div>

      <div className="mcp-oauth-actions">
        {connected ? (
          <>
            <button
              type="button"
              className="primary"
              onClick={onConnect}
              disabled={busy !== 'idle' && busy !== 'refreshing'}
              title={t('settings.externalMcpReauthTitle')}
            >
              {busy === 'starting' || busy === 'awaiting' ? t('settings.externalMcpConnecting') : t('settings.externalMcpReconnect')}
            </button>
            <button
              type="button"
              onClick={onRefreshStatus}
              disabled={busy !== 'idle' && busy !== 'refreshing'}
              title={t('settings.externalMcpRefreshTitle')}
            >
              {busy === 'refreshing' ? t('settings.externalMcpChecking') : t('settings.externalMcpRefresh')}
            </button>
            <button
              type="button"
              onClick={onDisconnect}
              disabled={busy !== 'idle' && busy !== 'refreshing'}
            >
              {busy === 'disconnecting' ? t('settings.externalMcpDisconnecting') : t('settings.externalMcpDisconnect')}
            </button>
          </>
        ) : isAwaiting ? (
          <>
            <button
              type="button"
              className="primary"
              onClick={onRefreshStatus}
              disabled={busy === 'refreshing'}
              title={t('settings.externalMcpApprovedRefreshTitle')}
            >
              {busy === 'refreshing' ? t('settings.externalMcpChecking') : t('settings.externalMcpApprovedRefresh')}
            </button>
            <button type="button" onClick={onCancelPending}>
              {t('common.cancel')}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="primary"
            onClick={onConnect}
            disabled={busy !== 'idle'}
          >
            {busy === 'starting' ? t('settings.externalMcpStarting') : t('settings.externalMcpConnect')}
          </button>
        )}
      </div>

      {pendingAuthUrl && !connected ? (
        <div className="mcp-oauth-fallback">
          <span className="hint">
            {t('settings.externalMcpBrowserDidNotOpen')}{' '}
            <a
              href={pendingAuthUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="md-link"
            >
              {t('settings.externalMcpOpenAuthorization')}
            </a>
            .
          </span>
        </div>
      ) : null}

      {error ? <div className="mcp-oauth-error">{error}</div> : null}
    </div>
  );
}
