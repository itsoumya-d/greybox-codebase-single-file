import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useT } from '../i18n';
import { Icon } from './Icon';
import type { AppConfig, InstallInput, ProModuleActivationConfigResponse } from '../types';
import type { SkillSummary, GameArtBibleSummary } from '@ai-game-design-studio/contracts';
import {
  fetchSkills,
  fetchGameArtBibles,
  fetchSkill,
  fetchGameArtBible,
  fetchProModuleActivationConfig,
  saveProModuleActivationConfig,
  installSkill,
  uninstallSkill,
  installGameArtBible,
  uninstallGameArtBible,
} from '../providers/registry';

type Tab = 'skills' | 'game-art-bibles';

interface Props {
  cfg: AppConfig;
  setCfg: Dispatch<SetStateAction<AppConfig>>;
}

const MODES = [
  'prototype',
  'deck',
  'template',
  'game-art-bible',
  'image',
  'video',
  'audio',
] as const;

const DEFAULT_GREYBOX_CLOUD_URL = 'https://cloud.greybox.studio';

export function LibrarySection({ cfg, setCfg }: Props) {
  const t = useT();
  const [tab, setTab] = useState<Tab>('skills');
  const [search, setSearch] = useState('');
  const [modeFilter, setModeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [gameArtBibles, setGameArtBibles] = useState<GameArtBibleSummary[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewBody, setPreviewBody] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [activationConfig, setActivationConfig] =
    useState<ProModuleActivationConfigResponse | null>(null);
  const [activationCloudUrl, setActivationCloudUrl] = useState(DEFAULT_GREYBOX_CLOUD_URL);
  const [activationLicenseKey, setActivationLicenseKey] = useState('');
  const [activationEntitlementLookupKey, setActivationEntitlementLookupKey] = useState('');
  const [activationSaving, setActivationSaving] = useState(false);
  const [activationMessage, setActivationMessage] = useState<string | null>(null);

  // Install state
  const [installOpen, setInstallOpen] = useState(false);
  const [installTab, setInstallTab] = useState<'github' | 'local'>('github');
  const [installUrl, setInstallUrl] = useState('');
  const [installPath, setInstallPath] = useState('');
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  const reloadData = useCallback(() => {
    fetchSkills().then(setSkills);
    fetchGameArtBibles().then(setGameArtBibles);
  }, []);

  useEffect(() => {
    reloadData();
  }, [reloadData]);

  const applyActivationConfig = useCallback((config: ProModuleActivationConfigResponse) => {
    setActivationConfig(config);
    setActivationCloudUrl(config.cloudUrl || DEFAULT_GREYBOX_CLOUD_URL);
    setActivationLicenseKey(config.licenseKeyMask || '');
    setActivationEntitlementLookupKey(config.entitlementLookupKeyMask || '');
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchProModuleActivationConfig().then((config) => {
      if (!cancelled && config) applyActivationConfig(config);
    });
    return () => {
      cancelled = true;
    };
  }, [applyActivationConfig]);

  const categories = useMemo(() => {
    const cats = new Set(gameArtBibles.map((d) => d.category));
    return ['All', ...Array.from(cats).sort()];
  }, [gameArtBibles]);

  const disabledSkills = useMemo(
    () => new Set(cfg.disabledSkills ?? []),
    [cfg.disabledSkills],
  );
  const disabledGameArtBibles = useMemo(
    () => new Set(cfg.disabledGameArtBibles ?? []),
    [cfg.disabledGameArtBibles],
  );

  const filteredSkills = useMemo(() => {
    const q = search.toLowerCase();
    return skills.filter((s) => {
      if (modeFilter !== 'all' && s.mode !== modeFilter) return false;
      if (q && !s.name.toLowerCase().includes(q) && !s.description.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [skills, modeFilter, search]);

  const filteredGameArtBibles = useMemo(() => {
    const q = search.toLowerCase();
    return gameArtBibles.filter((d) => {
      if (categoryFilter !== 'All' && d.category !== categoryFilter) return false;
      if (q && !d.title.toLowerCase().includes(q) && !d.summary.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [gameArtBibles, categoryFilter, search]);

  const groupedSkills = useMemo(() => {
    const groups = new Map<string, SkillSummary[]>();
    for (const s of filteredSkills) {
      const list = groups.get(s.mode) ?? [];
      list.push(s);
      groups.set(s.mode, list);
    }
    return groups;
  }, [filteredSkills]);

  const groupedGameArtBibles = useMemo(() => {
    const groups = new Map<string, GameArtBibleSummary[]>();
    for (const d of filteredGameArtBibles) {
      const list = groups.get(d.category) ?? [];
      list.push(d);
      groups.set(d.category, list);
    }
    return groups;
  }, [filteredGameArtBibles]);

  const openPreview = useCallback(
    async (id: string) => {
      if (previewId === id) {
        setPreviewId(null);
        setPreviewBody(null);
        return;
      }
      setPreviewId(id);
      setPreviewBody(null);
      setPreviewLoading(true);
      try {
        const detail =
          tab === 'skills'
            ? await fetchSkill(id)
            : await fetchGameArtBible(id);
        setPreviewId((cur) => {
          if (cur === id) setPreviewBody(detail?.body ?? null);
          return cur;
        });
      } catch {
        setPreviewId((cur) => {
          if (cur === id) setPreviewBody(null);
          return cur;
        });
      } finally {
        setPreviewId((cur) => {
          if (cur === id) setPreviewLoading(false);
          return cur;
        });
      }
    },
    [previewId, tab],
  );

  function toggleSkillDisabled(id: string, disabled: boolean) {
    setCfg((c) => {
      const set = new Set(c.disabledSkills ?? []);
      if (disabled) set.add(id);
      else set.delete(id);
      return { ...c, disabledSkills: [...set] };
    });
  }

  function toggleGameArtBibleDisabled(id: string, disabled: boolean) {
    setCfg((c) => {
      const set = new Set(c.disabledGameArtBibles ?? []);
      if (disabled) set.add(id);
      else set.delete(id);
      return { ...c, disabledGameArtBibles: [...set] };
    });
  }

  async function handleInstall() {
    setInstallError(null);
    setInstalling(true);
    const input: InstallInput =
      installTab === 'github'
        ? { source: 'github', url: installUrl.trim() }
        : { source: 'local', path: installPath.trim() };

    const result =
      tab === 'skills'
        ? await installSkill(input)
        : await installGameArtBible(input);

    setInstalling(false);
    if ('error' in result) {
      setInstallError(result.error);
      return;
    }
    setInstallOpen(false);
    setInstallUrl('');
    setInstallPath('');
    setInstallError(null);
    reloadData();
  }

  async function handleUninstallSkill(id: string) {
    const result = await uninstallSkill(id);
    if ('error' in result) return;
    reloadData();
  }

  async function handleUninstallGameArtBible(id: string) {
    const result = await uninstallGameArtBible(id);
    if ('error' in result) return;
    reloadData();
  }

  async function handleSaveActivation() {
    setActivationSaving(true);
    setActivationMessage(null);
    const result = await saveProModuleActivationConfig({
      cloudUrl: activationCloudUrl.trim(),
      licenseKey: activationLicenseKey.trim(),
      entitlementLookupKey: activationEntitlementLookupKey.trim(),
    });
    setActivationSaving(false);
    if (!result) {
      setActivationMessage('Activation settings could not be saved.');
      return;
    }
    applyActivationConfig(result);
    setActivationMessage('Activation settings saved.');
  }

  async function handleClearActivation() {
    setActivationSaving(true);
    setActivationMessage(null);
    const result = await saveProModuleActivationConfig({
      cloudUrl: activationCloudUrl.trim(),
      clearLicenseKey: true,
      clearEntitlementLookupKeys: true,
    });
    setActivationSaving(false);
    if (!result) {
      setActivationMessage('Activation settings could not be cleared.');
      return;
    }
    applyActivationConfig(result);
    setActivationMessage('Activation settings cleared.');
  }

  return (
    <section className="settings-section">
      <div className="section-head">
        <div>
          <h3>{t('settings.library')}</h3>
          <p className="hint">{t('settings.libraryHint')}</p>
        </div>
      </div>

      <div className="pro-module-activation-panel">
        <div className="pro-module-activation-head">
          <div>
            <h4>Greybox Pro activation</h4>
            <p>Unlock local .gbpro bundles through Greybox Cloud or Marketplace entitlements.</p>
          </div>
          <div className="pro-module-activation-status" aria-live="polite">
            <span className={activationConfig?.licenseKeyConfigured ? 'ready' : ''}>
              {activationConfig?.licenseKeyConfigured ? 'License saved' : 'License missing'}
            </span>
            <span className={activationConfig?.entitlementLookupKeyConfigured ? 'ready' : ''}>
              {activationConfig?.entitlementLookupKeyConfigured
                ? `${activationConfig.entitlementLookupKeyCount} entitlement ${activationConfig.entitlementLookupKeyCount === 1 ? 'key' : 'keys'}`
                : 'No entitlement key'}
            </span>
          </div>
        </div>
        <div className="pro-module-activation-grid">
          <label>
            <span>Cloud URL</span>
            <input
              type="url"
              value={activationCloudUrl}
              onChange={(e) => setActivationCloudUrl(e.target.value)}
              placeholder={DEFAULT_GREYBOX_CLOUD_URL}
            />
          </label>
          <label>
            <span>License key</span>
            <input
              type="password"
              value={activationLicenseKey}
              onChange={(e) => setActivationLicenseKey(e.target.value)}
              placeholder="gbx_indie_..."
              autoComplete="off"
            />
          </label>
          <label>
            <span>Marketplace entitlement key</span>
            <input
              type="password"
              value={activationEntitlementLookupKey}
              onChange={(e) => setActivationEntitlementLookupKey(e.target.value)}
              placeholder="gbx_..."
              autoComplete="off"
            />
          </label>
        </div>
        <div className="pro-module-activation-actions">
          <button
            type="button"
            className="library-install-submit"
            disabled={activationSaving}
            onClick={handleSaveActivation}
          >
            {activationSaving ? 'Saving...' : 'Save activation'}
          </button>
          <button
            type="button"
            className="library-install-btn"
            disabled={activationSaving}
            onClick={handleClearActivation}
          >
            Clear keys
          </button>
          {activationMessage && (
            <span className="pro-module-activation-message">{activationMessage}</span>
          )}
        </div>
      </div>

      <div className="seg-control" role="tablist">
        <button
          type="button"
          role="tab"
          className={`seg-btn${tab === 'skills' ? ' active' : ''}`}
          onClick={() => {
            setTab('skills');
            setModeFilter('all');
            setCategoryFilter('All');
            setSearch('');
            setPreviewId(null);
          }}
        >
          <span className="seg-title">
            {t('settings.librarySkills')}
            <span className="seg-meta">{skills.length}</span>
          </span>
        </button>
        <button
          type="button"
          role="tab"
          className={`seg-btn${tab === 'game-art-bibles' ? ' active' : ''}`}
          onClick={() => {
            setTab('game-art-bibles');
            setModeFilter('all');
            setCategoryFilter('All');
            setSearch('');
            setPreviewId(null);
          }}
        >
          <span className="seg-title">
            {t('settings.libraryGameArtBibles')}
            <span className="seg-meta">{gameArtBibles.length}</span>
          </span>
        </button>
      </div>

      <div className="library-toolbar">
        <div className="library-toolbar-row">
          <input
            type="search"
            className="library-search"
            placeholder={t('settings.librarySearch')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            type="button"
            className="library-install-btn"
            onClick={() => setInstallOpen((v) => !v)}
          >
            <Icon name="plus" size={14} />
            {t('settings.libraryInstall')}
          </button>
        </div>

        {installOpen && (
          <div className="library-install-form">
            <div className="seg-control" role="tablist">
              <button
                type="button"
                role="tab"
                className={`seg-btn${installTab === 'github' ? ' active' : ''}`}
                onClick={() => setInstallTab('github')}
              >
                {t('settings.libraryInstallGithub')}
              </button>
              <button
                type="button"
                role="tab"
                className={`seg-btn${installTab === 'local' ? ' active' : ''}`}
                onClick={() => setInstallTab('local')}
              >
                {t('settings.libraryInstallLocal')}
              </button>
            </div>
            <div className="library-install-row">
              {installTab === 'github' ? (
                <input
                  type="url"
                  className="library-search"
                  placeholder={t('settings.libraryInstallUrl')}
                  value={installUrl}
                  onChange={(e) => setInstallUrl(e.target.value)}
                />
              ) : (
                <input
                  type="text"
                  className="library-search"
                  placeholder={t('settings.libraryInstallPath')}
                  value={installPath}
                  onChange={(e) => setInstallPath(e.target.value)}
                />
              )}
              <button
                type="button"
                className="library-install-submit"
                disabled={installing}
                onClick={handleInstall}
              >
                {installing ? t('settings.libraryLoading') : t('settings.libraryInstallButton')}
              </button>
            </div>
            {installError && (
              <p className="library-install-error">{installError}</p>
            )}
          </div>
        )}

        {tab === 'skills' ? (
          <div className="library-filters">
            <button
              type="button"
              className={`filter-pill${modeFilter === 'all' ? ' active' : ''}`}
              onClick={() => setModeFilter('all')}
            >
              {t('settings.libraryAll')}
            </button>
            {MODES.map((mode) => {
              const count = skills.filter((s) => s.mode === mode).length;
              if (count === 0) return null;
              return (
                <button
                  key={mode}
                  type="button"
                  className={`filter-pill${modeFilter === mode ? ' active' : ''}`}
                  onClick={() => setModeFilter(mode)}
                >
                  {mode}
                  <span className="filter-pill-count">{count}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="library-filters">
            {categories.map((cat) => {
              const count =
                cat === 'All'
                  ? gameArtBibles.length
                  : gameArtBibles.filter((d) => d.category === cat).length;
              return (
                <button
                  key={cat}
                  type="button"
                  className={`filter-pill${categoryFilter === cat ? ' active' : ''}`}
                  onClick={() => setCategoryFilter(cat)}
                >
                  {cat}
                  <span className="filter-pill-count">{count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="library-content">
        {tab === 'skills' ? (
          filteredSkills.length === 0 ? (
            <p className="library-empty">{t('settings.libraryNoResults')}</p>
          ) : (
            MODES.filter((m) => groupedSkills.has(m)).map((mode) => (
              <div key={mode} className="library-group">
                <h4 className="library-group-title">
                  {mode}{' '}
                  <span className="library-group-count">{groupedSkills.get(mode)!.length}</span>
                </h4>
                {groupedSkills.get(mode)!.map((skill) => (
                  <div
                    key={skill.id}
                    className={`library-card${disabledSkills.has(skill.id) ? ' disabled' : ''}`}
                  >
                    <div className="library-card-info">
                      <div className="library-card-title-row">
                        <span className="library-card-name">{skill.name}</span>
                        <span className="library-card-badge">{skill.previewType}</span>
                        <span
                          className={`library-source-badge${skill.source === 'installed' ? ' installed' : ''}`}
                        >
                          {skill.source === 'installed'
                            ? t('settings.libraryInstalled')
                            : t('settings.libraryBuiltIn')}
                        </span>
                      </div>
                      <div className="library-card-desc">{skill.description}</div>
                    </div>
                    <button
                      type="button"
                      className="library-card-expand"
                      onClick={() => openPreview(skill.id)}
                      title={t('settings.libraryPreview')}
                    >
                      <Icon
                        name={previewId === skill.id ? 'close' : 'chevron-right'}
                        size={14}
                      />
                    </button>
                    {skill.source === 'installed' && (
                      <button
                        type="button"
                        className="library-uninstall-btn"
                        title={t('settings.libraryUninstall')}
                        onClick={() => handleUninstallSkill(skill.id)}
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    )}
                    <label className="toggle-switch" title={t('settings.libraryToggleLabel')}>
                      <input
                        type="checkbox"
                        checked={!disabledSkills.has(skill.id)}
                        onChange={(e) => toggleSkillDisabled(skill.id, !e.target.checked)}
                      />
                      <span className="toggle-slider" />
                    </label>
                    {previewId === skill.id && (
                      <div className="library-preview">
                        {previewLoading ? (
                          <p>{t('settings.libraryLoading')}</p>
                        ) : previewBody ? (
                          <pre className="library-preview-body">{previewBody}</pre>
                        ) : null}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))
          )
        ) : filteredGameArtBibles.length === 0 ? (
          <p className="library-empty">{t('settings.libraryNoResults')}</p>
        ) : (
          <>
            {Array.from(groupedGameArtBibles.entries()).map(([category, items]) => (
              <div key={category} className="library-group">
                <h4 className="library-group-title">
                  {category} <span className="library-group-count">{items.length}</span>
                </h4>
                <div className="game-art-bible-grid">
                  {items.map((artBible) => (
                    <div
                      key={artBible.id}
                      className={`library-game-art-bible-card${disabledGameArtBibles.has(artBible.id) ? ' disabled' : ''}`}
                    >
                      <div className="library-game-art-bible-card-content" onClick={() => openPreview(artBible.id)}>
                        {artBible.swatches && artBible.swatches.length > 0 && (
                          <div className="library-gab-swatches">
                            {artBible.swatches.slice(0, 4).map((c, i) => (
                              <span
                                key={i}
                                className="library-gab-swatch"
                                style={{ backgroundColor: c }}
                              />
                            ))}
                          </div>
                        )}
                        <div className="library-gab-title-row">
                          <span className="library-gab-title">{artBible.title}</span>
                          <span
                            className={`library-source-badge${artBible.source === 'installed' ? ' installed' : ''}`}
                          >
                            {artBible.source === 'installed'
                              ? t('settings.libraryInstalled')
                              : t('settings.libraryBuiltIn')}
                          </span>
                        </div>
                        <div className="library-gab-summary">{artBible.summary}</div>
                      </div>
                      <div className="library-game-art-bible-card-actions">
                        {artBible.source === 'installed' && (
                          <button
                            type="button"
                            className="library-uninstall-btn"
                            title={t('settings.libraryUninstall')}
                            onClick={() => handleUninstallGameArtBible(artBible.id)}
                          >
                            <Icon name="trash" size={14} />
                          </button>
                        )}
                        <label className="toggle-switch toggle-switch-sm" title={t('settings.libraryToggleLabel')}>
                          <input
                            type="checkbox"
                            checked={!disabledGameArtBibles.has(artBible.id)}
                            onChange={(e) => toggleGameArtBibleDisabled(artBible.id, !e.target.checked)}
                          />
                          <span className="toggle-slider" />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {previewId && filteredGameArtBibles.some((d) => d.id === previewId) && (
              <div className="library-preview">
                {previewLoading ? (
                  <p>{t('settings.libraryLoading')}</p>
                ) : previewBody ? (
                  <pre className="library-preview-body">{previewBody}</pre>
                ) : null}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
