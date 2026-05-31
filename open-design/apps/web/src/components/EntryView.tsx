import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ConnectorDetail, ConnectorStatusResponse, ImportFolderResponse } from '@ai-game-design-studio/contracts';
import { useT } from '../i18n';
import {
  DEFAULT_AUDIO_MODEL,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
} from '../media/models';
import type {
  AgentInfo,
  AppConfig,
  GameArtBibleSummary,
  Project,
  ProjectKind,
  ProjectMetadata,
  ProjectTemplate,
  PromptTemplateSummary,
  SkillSummary,
} from '../types';
import { GameProjectsTab } from './GameProjectsTab';
import { GameArtBiblePreviewModal } from './GameArtBiblePreviewModal';
import { GameArtBiblesTab } from './GameArtBiblesTab';
import { ExamplesTab } from './ExamplesTab';
import { StudioChromeHeader } from './StudioChromeHeader';
import { Icon } from './Icon';
import { LanguageMenu } from './LanguageMenu';
import { CenteredLoader } from './Loading';
import { NewProjectPanel, type CreateInput } from './NewProjectPanel';
import { GameDesignWizard } from './GameDesignWizard';
import {
  fetchConnectors,
  fetchConnectorStatuses,
} from '../providers/registry';
import { PetRail } from './pet/PetRail';
import { PromptTemplatePreviewModal } from './PromptTemplatePreviewModal';
import { PromptTemplatesTab } from './PromptTemplatesTab';
import { apiProtocolLabel } from '../utils/apiProtocol';

type TopTab = 'game-projects' | 'examples' | 'game-art-bibles' | 'image-templates' | 'video-templates';

interface Props {
  skills: SkillSummary[];
  gameArtBibles: GameArtBibleSummary[];
  projects: Project[];
  templates: ProjectTemplate[];
  promptTemplates: PromptTemplateSummary[];
  defaultGameArtBibleId: string | null;
  config: AppConfig;
  agents: AgentInfo[];
  // Per-resource loading flags. Each tab gates its own content on whichever
  // flag matches the data it renders, so a slow `/api/agents` probe does
  // not block tabs that don't need agents. Templates are not gated here —
  // the sidebar 'From template' tab renders an empty state until they
  // arrive (fast fetch), which keeps the prop surface narrower.
  skillsLoading?: boolean;
  gameArtBiblesLoading?: boolean;
  projectsLoading?: boolean;
  promptTemplatesLoading?: boolean;
  onCreateProject: (input: CreateInput & { pendingPrompt?: string }) => void;
  onImportGameStudioZip: (file: File) => Promise<void> | void;
  onImportFolder?: (baseDir: string) => Promise<void> | void;
  onImportFolderResponse?: (response: ImportFolderResponse) => Promise<void> | void;
  onOpenProject: (id: string) => void;
  onOpenLiveArtifact: (projectId: string, artifactId: string) => void;
  onDeleteProject: (id: string) => void;
  onChangeDefaultGameArtBible: (id: string) => void;
  onOpenSettings: (section?: 'execution' | 'media' | 'composio' | 'language' | 'appearance' | 'notifications' | 'pet' | 'about') => void;
  onAdoptPet: () => void;
  onAdoptPetInline: (petId: string) => void;
  onTogglePet: () => void;
}

const SIDEBAR_MIN = 320;
const SIDEBAR_MAX = 560;
const SIDEBAR_DEFAULT = 380;
const SIDEBAR_STORAGE_KEY = 'agds:entry-sidebar-width';
const CONNECTOR_CALLBACK_MESSAGE_TYPE = 'agds:connector-connected';

function isConnectorCallbackMessageType(type: unknown): boolean {
  return type === CONNECTOR_CALLBACK_MESSAGE_TYPE;
}

export function isTrustedConnectorCallbackOrigin(origin: string, currentOrigin?: string): boolean {
  const expectedOrigin = currentOrigin ?? (typeof window === 'undefined' ? '' : window.location.origin);
  if (origin === expectedOrigin) return true;
  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]' || url.hostname === '::1';
  } catch {
    return false;
  }
}

// Lets the creator fully remove the right-side pet rail from the entry
// layout. They re-summon it from the entry-view avatar dropdown — the
// PetRail's own collapse toggle only narrows the column, so this state
// is the "the rail isn't there at all" escape hatch.
const PET_RAIL_HIDDEN_KEY = 'agds:pet-rail-hidden';

function loadSidebarWidth(): number {
  try {
    const raw = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (!raw) return SIDEBAR_DEFAULT;
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return SIDEBAR_DEFAULT;
    return Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, n));
  } catch {
    return SIDEBAR_DEFAULT;
  }
}

function applyConnectorStatuses(
  current: ConnectorDetail[],
  statuses: ConnectorStatusResponse['statuses'],
): ConnectorDetail[] {
  if (!Object.keys(statuses).length) return current;
  return current.map((connector) => {
    const next = statuses[connector.id];
    if (!next) return connector;
    const { accountLabel: _accountLabel, lastError: _lastError, ...base } = connector;
    return {
      ...base,
      status: next.status,
      ...(next.accountLabel === undefined ? {} : { accountLabel: next.accountLabel }),
      ...(next.lastError === undefined ? {} : { lastError: next.lastError }),
    };
  });
}

export function sortConnectorsForDisplay(connectors: ConnectorDetail[]): ConnectorDetail[] {
  return [...connectors].sort((a, b) => {
    const aConnected = a.status === 'connected';
    const bConnected = b.status === 'connected';
    if (aConnected !== bConnected) return aConnected ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id);
  });
}

function normalizedSearchValue(value: string | undefined): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function scoreConnectorText(value: string | undefined, query: string, baseScore: number): number | null {
  const normalized = normalizedSearchValue(value);
  if (!normalized) return null;
  if (normalized === query) return baseScore;
  if (normalized.startsWith(query)) return baseScore + 1;
  if (normalized.includes(query)) return baseScore + 2;
  return null;
}

export function getConnectorSearchScore(connector: ConnectorDetail, query: string): number | null {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return 0;

  const scores: number[] = [];
  const collect = (value: string | undefined, baseScore: number) => {
    const score = scoreConnectorText(value, normalizedQuery, baseScore);
    if (score !== null) scores.push(score);
  };

  // Connector identity fields carry the most intent: exact and prefix
  // name/provider matches should beat incidental mentions elsewhere.
  collect(connector.name, 0);
  collect(connector.provider, 0);

  // Secondary connector metadata is still searchable, but lower priority.
  collect(connector.category, 3);
  collect(connector.accountLabel, 3);

  // Tool names/titles are more relevant than prose descriptions, but below
  // connector-level identity matches.
  for (const tool of connector.tools) {
    collect(tool.title, 5);
    collect(tool.name, 5);
  }

  // Prose descriptions are broad and often mention other tools, so they
  // are intentionally down-ranked rather than excluded.
  collect(connector.description, 8);
  for (const tool of connector.tools) {
    collect(tool.description, 8);
  }

  return scores.length ? Math.min(...scores) : null;
}

export function sortConnectorsForSearch(
  connectors: ConnectorDetail[],
  query: string,
): ConnectorDetail[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return sortConnectorsForDisplay(connectors);

  return [...connectors]
    .map((connector) => ({ connector, score: getConnectorSearchScore(connector, normalizedQuery) }))
    .filter((entry): entry is { connector: ConnectorDetail; score: number } => entry.score !== null)
    .sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      const aConnected = a.connector.status === 'connected';
      const bConnected = b.connector.status === 'connected';
      if (aConnected !== bConnected) return aConnected ? -1 : 1;
      return (
        a.connector.name.localeCompare(b.connector.name, undefined, { sensitivity: 'base' }) ||
        a.connector.id.localeCompare(b.connector.id)
      );
    })
    .map((entry) => entry.connector);
}

function loadPetRailHidden(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(PET_RAIL_HIDDEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function EntryView({
  skills,
  gameArtBibles,
  projects,
  templates,
  promptTemplates,
  defaultGameArtBibleId,
  config,
  agents,
  skillsLoading = false,
  gameArtBiblesLoading = false,
  projectsLoading = false,
  promptTemplatesLoading = false,
  onCreateProject,
  onImportGameStudioZip,
  onImportFolder,
  onImportFolderResponse,
  onOpenProject,
  onOpenLiveArtifact,
  onDeleteProject,
  onChangeDefaultGameArtBible,
  onOpenSettings,
  onAdoptPet,
  onAdoptPetInline,
  onTogglePet,
}: Props) {
  const t = useT();
  const [topTab, setTopTab] = useState<TopTab>('game-projects');
  const [previewGameArtBibleId, setPreviewGameArtBibleId] = useState<string | null>(null);
  const [previewPromptTemplate, setPreviewPromptTemplate] =
    useState<PromptTemplateSummary | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => loadSidebarWidth());
  const [resizing, setResizing] = useState(false);
  const [connectors, setConnectors] = useState<ConnectorDetail[]>([]);
  const [connectorsLoading, setConnectorsLoading] = useState(false);
  const [petRailHidden, setPetRailHiddenState] = useState<boolean>(() => loadPetRailHidden());
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const avatarMenuRef = useRef<HTMLDivElement | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  function setPetRailHidden(next: boolean) {
    setPetRailHiddenState(next);
    try {
      window.localStorage.setItem(PET_RAIL_HIDDEN_KEY, next ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  const currentAgent = useMemo(
    () => agents.find((a) => a.id === config.agentId) ?? null,
    [agents, config.agentId],
  );

  const envMetaLine = useMemo(() => {
    if (config.mode === 'api') {
      try {
        return `${config.model} · ${new URL(config.baseUrl).host}`;
      } catch {
        return config.model;
      }
    }
    return currentAgent
      ? `${currentAgent.name}${currentAgent.version ? ` · ${currentAgent.version}` : ''}`
      : t('settings.noAgentSelected');
  }, [config.mode, config.model, config.baseUrl, currentAgent, t]);

  // 'Use this prompt' on an example card is a fast path — skip the setup panel and
  // create the project immediately with sane defaults derived from the skill,
  // seeding the chat composer with the example prompt via pendingPrompt.
  function usePromptFromSkill(skill: SkillSummary) {
    onCreateProject({
      name: skill.name,
      skillId: skill.id,
      gameArtBibleId: null,
      metadata: metadataForSkill(skill),
      pendingPrompt: skill.examplePrompt || skill.description,
    });
  }

  function openGameArtBiblePreview(id: string) {
    setPreviewGameArtBibleId(id);
  }

  const previewGameArtBible = useMemo(
    () => (previewGameArtBibleId ? gameArtBibles.find((d) => d.id === previewGameArtBibleId) ?? null : null),
    [gameArtBibles, previewGameArtBibleId],
  );

  function handleCreate(input: CreateInput) {
    onCreateProject(input);
  }

  const startWidthRef = useRef(0);
  const startXRef = useRef(0);

  useEffect(() => {
    if (!resizing) return;
    function onMove(e: MouseEvent) {
      const dx = e.clientX - startXRef.current;
      const next = Math.max(
        SIDEBAR_MIN,
        Math.min(SIDEBAR_MAX, startWidthRef.current + dx),
      );
      setSidebarWidth(next);
    }
    function onUp() {
      setResizing(false);
    }
    document.body.classList.add('entry-resizing');
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      document.body.classList.remove('entry-resizing');
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizing]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarWidth));
    } catch {
      /* ignore */
    }
  }, [sidebarWidth]);

  const reloadConnectorStatuses = useCallback(async () => {
    const statuses = await fetchConnectorStatuses();
    setConnectors((curr) => applyConnectorStatuses(curr, statuses));
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Fetch connectors on mount so the New project panel can show
    // already-configured connectors on the live-artifact tab without
    // waiting for the creator to open the Settings → Connectors surface.
    setConnectorsLoading(true);
    (async () => {
      const next = await fetchConnectors();
      if (cancelled) return;
      setConnectors(next);
      setConnectorsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data;
      if (!data || typeof data !== 'object' || !isConnectorCallbackMessageType((data as { type?: unknown }).type)) return;
      if (!isTrustedConnectorCallbackOrigin(event.origin)) return;
      void reloadConnectorStatuses();
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [reloadConnectorStatuses]);

  // When the OAuth flow is handed off to the creator's system browser (desktop
  // shell opens connector auth URLs externally rather than in an Electron
  // popup), the callback document has no `window.opener` to postMessage back to.
  // Refresh connector statuses whenever the window regains focus so the UI
  // picks up a just-completed connection without manual intervention.
  useEffect(() => {
    function onFocus() {
      void reloadConnectorStatuses();
    }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [reloadConnectorStatuses]);

  // Dismiss the avatar dropdown on outside-click / Escape so it behaves
  // like the project-view AvatarMenu (which uses the same shell CSS).
  useEffect(() => {
    if (!avatarMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!avatarMenuRef.current) return;
      if (!avatarMenuRef.current.contains(e.target as Node)) {
        setAvatarMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAvatarMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [avatarMenuOpen]);

  const avatarMenu = (
    <div className="avatar-menu" ref={avatarMenuRef}>
      <button
        type="button"
        className="settings-icon-btn"
        onClick={() => setAvatarMenuOpen((v) => !v)}
        title={t('entry.openSettingsTitle')}
        aria-label={t('entry.openSettingsAria')}
        aria-haspopup="menu"
        aria-expanded={avatarMenuOpen}
      >
        <Icon name="settings" size={17} />
      </button>
      {avatarMenuOpen ? (
        <div className="avatar-popover" role="menu">
          <button
            type="button"
            className="avatar-item"
            onClick={() => {
              setPetRailHidden(!petRailHidden);
              setAvatarMenuOpen(false);
            }}
          >
            <span className="avatar-item-icon" aria-hidden>
              <Icon name={petRailHidden ? 'sparkles' : 'eye'} size={14} />
            </span>
            <span>
              {petRailHidden
                ? t('pet.railShow')
                : t('pet.railHide')}
            </span>
          </button>
          <div style={{ height: 1, background: 'var(--border-soft)', margin: '4px 6px' }} />
          <button
            type="button"
            className="avatar-item"
            onClick={() => {
              setAvatarMenuOpen(false);
              onOpenSettings();
            }}
          >
            <span className="avatar-item-icon" aria-hidden>
              <Icon name="settings" size={14} />
            </span>
            <span>{t('avatar.settings')}</span>
          </button>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="entry-shell">
      <StudioChromeHeader actions={avatarMenu} />
      {/* AI Game Design Wizard modal overlay */}
      {wizardOpen && (
        <div
          className="wizard-modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 300,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            className="wizard-modal-shell"
            style={{
              width: '100%',
              maxWidth: 780,
              height: '90vh',
              maxHeight: 860,
              borderRadius: 12,
              overflow: 'hidden',
              boxShadow: '0 16px 48px rgba(0,0,0,0.22)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <GameDesignWizard
              skills={skills}
              gameArtBibles={gameArtBibles}
              onClose={() => setWizardOpen(false)}
              onProjectCreated={(projectId) => {
                setWizardOpen(false);
                onOpenProject(projectId);
              }}
            />
          </div>
        </div>
      )}
      <div
        className={`entry${petRailHidden ? '' : ' has-pet-rail'}`}
        style={{
          gridTemplateColumns: petRailHidden
            ? `${sidebarWidth}px 1fr`
            : `${sidebarWidth}px 1fr auto`,
        }}
      >
      <aside className="entry-side" style={{ width: sidebarWidth }}>
        {/* AI Wizard entry point */}
        <button
          type="button"
          className="wizard-entry-btn"
          onClick={() => setWizardOpen(true)}
          title="Open the AI Game Design Wizard"
        >
          <span className="wizard-entry-icon" aria-hidden>✦</span>
          <span>AI Game Design Wizard</span>
        </button>
        <NewProjectPanel
          skills={skills}
          gameArtBibles={gameArtBibles}
          defaultGameArtBibleId={defaultGameArtBibleId}
          templates={templates}
          promptTemplates={promptTemplates}
          onCreate={handleCreate}
          onImportGameStudioZip={onImportGameStudioZip}
          onImportFolder={onImportFolder}
          onImportFolderResponse={onImportFolderResponse}
          mediaProviders={config.mediaProviders}
          connectors={connectors}
          connectorsLoading={connectorsLoading}
          onOpenConnectorsTab={() => onOpenSettings('composio')}
          loading={skillsLoading || gameArtBiblesLoading}
        />
        <div className="entry-side-foot">
          <div className="entry-side-foot-row">
            <button
              type="button"
              className={`foot-pill pet-pill${config.pet?.adopted ? '' : ' pet-pill-fresh'}`}
              onClick={onAdoptPet}
              title={
                config.pet?.adopted
                  ? t('pet.changePet')
                  : t('pet.adoptCallout')
              }
            >
              <span className="pet-pill-glyph" aria-hidden>
                {config.pet?.adopted
                  ? config.pet.petId === 'custom'
                    ? config.pet.custom.glyph || '🦄'
                    : '🐾'
                  : '🐾'}
              </span>
              <span className="foot-pill-pet-label">
                {config.pet?.adopted
                  ? t('pet.changePet')
                  : t('pet.adoptCallout')}
              </span>
              {!config.pet?.adopted ? <span className="pet-pill-dot" aria-hidden /> : null}
            </button>
            <a
              className="foot-pill foot-pill-follow"
              href="https://github.com/ai-game-design-studio/ai-game-design-studio/releases"
              target="_blank"
              rel="noreferrer noopener"
              title="Open AI Game Design Studio releases on GitHub"
              aria-label="Open AI Game Design Studio releases on GitHub"
            >
              <Icon name="external-link" size={12} />
              <span className="foot-pill-follow-label">Releases</span>
            </a>
          </div>
          <button
            type="button"
            className="foot-pill"
            onClick={() => onOpenSettings()}
            aria-label={t('settings.envConfigure')}
            title={t('settings.envConfigure')}
          >
            <Icon name="settings" size={12} />
            <span>
              {config.mode === 'daemon'
                ? t('settings.localCli')
                : apiProtocolLabel(config.apiProtocol)}
            </span>
            <span style={{ color: 'var(--text-faint)' }}>·</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
              {envMetaLine}
            </span>
          </button>
          <LanguageMenu />
        </div>
        <button
          type="button"
          aria-label={t('entry.resizeAria')}
          className={`entry-side-resizer${resizing ? ' dragging' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault();
            startWidthRef.current = sidebarWidth;
            startXRef.current = e.clientX;
            setResizing(true);
          }}
        />
      </aside>
      <main className="entry-main">
        <div className="entry-header">
          <div className="entry-tabs" role="tablist">
            <TopTabButton current={topTab} value="game-projects" label={t('entry.tabGameProjects')} onClick={setTopTab} />
            <TopTabButton current={topTab} value="examples" label={t('entry.tabExamples')} onClick={setTopTab} />
            <TopTabButton
              current={topTab}
              value="game-art-bibles"
              label={t('entry.tabGameArtBibles')}
              onClick={setTopTab}
            />
            <TopTabButton
              current={topTab}
              value="image-templates"
              label={t('entry.tabImageTemplates')}
              onClick={setTopTab}
            />
            <TopTabButton
              current={topTab}
              value="video-templates"
              label={t('entry.tabVideoTemplates')}
              onClick={setTopTab}
            />
          </div>
        </div>
        <div className="entry-tab-content">
          {topTab === 'game-projects' ? (
            // GameProjectsTab uses skills + game art bibles for tag rendering on
            // each card, so wait until projects + that metadata are present
            // to avoid a flash of "No projects yet" before the real list
            // arrives.
            projectsLoading || skillsLoading || gameArtBiblesLoading ? (
              <CenteredLoader label={t('common.loading')} />
            ) : (
              <GameProjectsTab
                projects={projects}
                skills={skills}
                gameArtBibles={gameArtBibles}
                onOpen={onOpenProject}
                onOpenLiveArtifact={onOpenLiveArtifact}
                onDelete={onDeleteProject}
              />
            )
          ) : null}
          {topTab === 'examples' ? (
            skillsLoading ? (
              <CenteredLoader label={t('common.loading')} />
            ) : (
              <ExamplesTab skills={skills} onUsePrompt={usePromptFromSkill} />
            )
          ) : null}
          {topTab === 'game-art-bibles' ? (
            gameArtBiblesLoading ? (
              <CenteredLoader label={t('common.loading')} />
            ) : (
              <GameArtBiblesTab
                gameArtBibles={gameArtBibles}
                selectedId={defaultGameArtBibleId}
                onSelect={onChangeDefaultGameArtBible}
                onPreview={openGameArtBiblePreview}
              />
            )
          ) : null}
          {topTab === 'image-templates' ? (
            promptTemplatesLoading ? (
              <CenteredLoader label={t('common.loading')} />
            ) : (
              <PromptTemplatesTab
                surface="image"
                templates={promptTemplates}
                onPreview={setPreviewPromptTemplate}
              />
            )
          ) : null}
          {topTab === 'video-templates' ? (
            promptTemplatesLoading ? (
              <CenteredLoader label={t('common.loading')} />
            ) : (
              <PromptTemplatesTab
                surface="video"
                templates={promptTemplates}
                onPreview={setPreviewPromptTemplate}
              />
            )
          ) : null}
        </div>
      </main>
      {petRailHidden ? null : (
        <PetRail
          config={config}
          onAdoptInline={onAdoptPetInline}
          onOpenPetSettings={onAdoptPet}
          onTuck={onTogglePet}
          onHide={() => setPetRailHidden(true)}
        />
      )}
      </div>
      {previewGameArtBible ? (
        <GameArtBiblePreviewModal
          gameArtBible={previewGameArtBible}
          onClose={() => setPreviewGameArtBibleId(null)}
        />
      ) : null}
      {previewPromptTemplate ? (
        <PromptTemplatePreviewModal
          summary={previewPromptTemplate}
          onClose={() => setPreviewPromptTemplate(null)}
        />
      ) : null}
    </div>
  );
}

function TopTabButton({
  current,
  value,
  label,
  onClick,
}: {
  current: TopTab;
  value: TopTab;
  label: string;
  onClick: (v: TopTab) => void;
}) {
  return (
    <button
      role="tab"
      data-testid={`entry-tab-${value}`}
      aria-selected={current === value}
      className={`entry-tab ${current === value ? 'active' : ''}`}
      onClick={() => onClick(value)}
    >
      {label}
    </button>
  );
}

// Map a skill's declared mode to project metadata. Falls back to the same
// defaults the new-project setup panel would apply (high-fidelity playable concept, no
// speaker notes on decks, no template animations) so 'Use this prompt'
// produces a project indistinguishable from one created via the setup panel. Per-
// skill hints in SKILL.md frontmatter (agds.fidelity, agds.speaker_notes,
// agds.animations) override the defaults so each example reproduces the
// shipped example.html — e.g. wireframe-sketch declares fidelity:wireframe.
function metadataForSkill(skill: SkillSummary): ProjectMetadata {
  const kind = kindForSkill(skill);
  if (kind === 'prototype') {
    return { kind, fidelity: skill.fidelity ?? 'high-fidelity' };
  }
  if (kind === 'deck') {
    return {
      kind,
      speakerNotes:
        typeof skill.speakerNotes === 'boolean' ? skill.speakerNotes : false,
    };
  }
  if (kind === 'template') {
    return {
      kind,
      animations:
        typeof skill.animations === 'boolean' ? skill.animations : false,
    };
  }
  if (kind === 'image') {
    return { kind, imageModel: DEFAULT_IMAGE_MODEL, imageAspect: '1:1' };
  }
  if (kind === 'video') {
    return { kind, videoModel: DEFAULT_VIDEO_MODEL, videoAspect: '16:9', videoLength: 5 };
  }
  if (kind === 'audio') {
    return {
      kind,
      audioKind: 'speech',
      audioModel: DEFAULT_AUDIO_MODEL.speech,
      audioDuration: 10,
    };
  }
  return { kind: 'other' };
}

function kindForSkill(skill: SkillSummary): ProjectKind {
  if (skill.mode === 'deck') return 'deck';
  if (skill.mode === 'prototype') return 'prototype';
  if (skill.mode === 'template') return 'template';
  if (skill.mode === 'image' || skill.surface === 'image') return 'image';
  if (skill.mode === 'video' || skill.surface === 'video') return 'video';
  if (skill.mode === 'audio' || skill.surface === 'audio') return 'audio';
  return 'other';
}
