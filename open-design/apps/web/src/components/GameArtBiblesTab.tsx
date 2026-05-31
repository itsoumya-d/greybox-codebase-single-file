import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import {
  localizeGameArtBibleCategory,
  localizeGameArtBibleSummary,
} from '../i18n/content';
import { fetchGameArtBibleShowcase } from '../providers/registry';
import { buildSrcdoc } from '../runtime/srcdoc';
import type { GameArtBibleSummary, Surface } from '../types';

interface Props {
  gameArtBibles?: GameArtBibleSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onPreview: (id: string) => void;
}

const CATEGORY_ORDER = [
  'Game Art Direction',
  'Game Genres',
  'Aesthetic Styles',
  'Platform Targets',
  'Legacy / Inspiration',
];

const GAME_ART_BIBLE_CATEGORIES = new Set([
  'Game Art Direction',
  'Game Genres',
  'Aesthetic Styles',
  'Platform Targets',
]);
const LEGACY_INSPIRATION_CATEGORY = 'Legacy / Inspiration';

type SurfaceFilter = 'all' | Surface;

const SURFACE_PILLS: { value: SurfaceFilter; labelKey: 'examples.modeAll' | 'gameArtBible.surfaceWeb' | 'gameArtBible.surfaceImage' | 'gameArtBible.surfaceVideo' | 'gameArtBible.surfaceAudio' }[] = [
  { value: 'all', labelKey: 'examples.modeAll' },
  { value: 'web', labelKey: 'gameArtBible.surfaceWeb' },
  { value: 'image', labelKey: 'gameArtBible.surfaceImage' },
  { value: 'video', labelKey: 'gameArtBible.surfaceVideo' },
  { value: 'audio', labelKey: 'gameArtBible.surfaceAudio' },
];

function surfaceOf(gameArtBible: GameArtBibleSummary): Surface {
  return gameArtBible.surface ?? 'web';
}

function categoryGroup(gameArtBible: GameArtBibleSummary): string {
  const category = gameArtBible.category || 'Uncategorized';
  if (category === 'Uncategorized') return category;
  return GAME_ART_BIBLE_CATEGORIES.has(category)
    ? category
    : LEGACY_INSPIRATION_CATEGORY;
}

export function GameArtBiblesTab({
  gameArtBibles,
  selectedId,
  onSelect,
  onPreview,
}: Props) {
  const { locale, t } = useI18n();
  const bibles = gameArtBibles ?? [];
  const [filter, setFilter] = useState('');
  const [surfaceFilter, setSurfaceFilter] = useState<SurfaceFilter>('all');
  const [category, setCategory] = useState<string>('All');
  // Cache fetched showcase HTML across re-renders so cards never re-flicker
  // when the creator filters / scrolls back. null = "in flight"; undefined =
  // "not yet requested". Mirrors the pattern used by ExamplesTab.
  const [thumbs, setThumbs] = useState<Record<string, string | null>>({});

  const surfaceScoped = useMemo(
    () => surfaceFilter === 'all' ? bibles : bibles.filter((s) => surfaceOf(s) === surfaceFilter),
    [bibles, surfaceFilter],
  );

  const surfaceCounts = useMemo(() => {
    const counts: Record<SurfaceFilter, number> = { all: bibles.length, web: 0, image: 0, video: 0, audio: 0 };
    for (const s of bibles) counts[surfaceOf(s)]++;
    return counts;
  }, [bibles]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const s of surfaceScoped) cats.add(categoryGroup(s));
    const ordered: string[] = [];
    for (const c of CATEGORY_ORDER) if (cats.has(c)) ordered.push(c);
    for (const c of [...cats].sort()) if (!ordered.includes(c)) ordered.push(c);
    return ['All', ...ordered];
  }, [surfaceScoped]);

  // Keep surfaceFilter and category in sync when game art bibles change dynamically.
  // If the currently selected surface has zero items, fall back to 'all'.
  // If the current category is no longer present in the filtered list, fall back to 'All'.
  useEffect(() => {
    if (surfaceFilter !== 'all' && surfaceCounts[surfaceFilter] === 0) {
      setSurfaceFilter('all');
      setCategory('All');
    } else if (category !== 'All' && !categories.includes(category)) {
      setCategory('All');
    }
  }, [bibles, surfaceFilter, surfaceCounts, category, categories]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return surfaceScoped.filter((s) => {
      if (category !== 'All' && categoryGroup(s) !== category) return false;
      if (!q) return true;
      const summary = localizeGameArtBibleSummary(locale, s).toLowerCase();
      const categoryLabel = localizeGameArtBibleCategory(
        locale,
        categoryGroup(s),
      ).toLowerCase();
      return (
        s.title.toLowerCase().includes(q) ||
        s.summary.toLowerCase().includes(q) ||
        summary.includes(q) ||
        categoryLabel.includes(q)
      );
    });
  }, [surfaceScoped, filter, category, locale]);

  // Category metadata is authored in English; keep raw values in state for
  // filtering while localizing the visible labels for the current UI locale.
  const renderCategory = (c: string) => {
    if (c === 'All') return t('gameArtBible.categoryAll');
    if (c === 'Uncategorized') return t('gameArtBible.categoryUncategorized');
    return localizeGameArtBibleCategory(locale, c);
  };

  function loadThumb(id: string) {
    setThumbs((prev) => {
      if (prev[id] !== undefined) return prev;
      void fetchGameArtBibleShowcase(id).then((html) => {
        setThumbs((p) => ({ ...p, [id]: html }));
      });
      return { ...prev, [id]: null };
    });
  }

  return (
    <div className="tab-panel">
      <div className="tab-panel-toolbar">
        <input
          placeholder={t('gameArtBible.searchPlaceholder')}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {categories.map((c) => (
            <option key={c} value={c}>
              {renderCategory(c)}
            </option>
          ))}
        </select>
      </div>
      <div
        className="examples-filter-row"
        role="tablist"
        aria-label={t('gameArtBible.surfaceLabel')}
      >
        <span className="examples-filter-label">{t('gameArtBible.surfaceLabel')}</span>
        {SURFACE_PILLS.filter((p) => p.value === 'all' || surfaceCounts[p.value] > 0).map((p) => (
          <button
            key={p.value}
            type="button"
            role="tab"
            aria-selected={surfaceFilter === p.value}
            className={`filter-pill ${surfaceFilter === p.value ? 'active' : ''}`}
            onClick={() => {
              setSurfaceFilter(p.value);
              setCategory('All');
            }}
          >
            {t(p.labelKey)}
            <span className="filter-pill-count">{surfaceCounts[p.value]}</span>
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div className="tab-empty">{t('gameArtBible.emptyNoMatch')}</div>
      ) : (
        <div className="game-art-bible-grid">
          {filtered.map((s) => (
            <GameArtBibleCard
              key={s.id}
              gameArtBible={s}
              active={s.id === selectedId}
              thumbHtml={thumbs[s.id]}
              onIntersect={() => loadThumb(s.id)}
              onSelect={() => onSelect(s.id)}
              onPreview={() => onPreview(s.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface CardProps {
  gameArtBible: GameArtBibleSummary;
  active: boolean;
  thumbHtml: string | null | undefined;
  onIntersect: () => void;
  onSelect: () => void;
  onPreview: () => void;
}

function GameArtBibleCard({
  gameArtBible,
  active,
  thumbHtml,
  onIntersect,
  onSelect,
  onPreview,
}: CardProps) {
  const { locale, t } = useI18n();
  const ref = useRef<HTMLDivElement | null>(null);

  // Lazy-load the showcase iframe only when the card scrolls into the
  // viewport. Even a curated art-bible catalog can become expensive if every
  // srcDoc iframe mounts up front, so we gate via IntersectionObserver.
  useEffect(() => {
    if (thumbHtml !== undefined) return;
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      onIntersect();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            onIntersect();
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [thumbHtml, onIntersect]);

  const localizedSummary = localizeGameArtBibleSummary(locale, gameArtBible);
  const categoryLabel = localizeGameArtBibleCategory(
    locale,
    categoryGroup(gameArtBible),
  );

  return (
    <div
      ref={ref}
      className={`game-art-bible-card ${active ? 'active' : ''}`}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div
        className="game-art-bible-card-thumb"
        onClick={(e) => {
          e.stopPropagation();
          onPreview();
        }}
        title={t('gameArtBible.previewTitle')}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            onPreview();
          }
        }}
      >
        {thumbHtml ? (
          <iframe
            title={`${gameArtBible.title} preview`}
            sandbox="allow-scripts"
            srcDoc={buildSrcdoc(thumbHtml)}
            tabIndex={-1}
            aria-hidden
          />
        ) : (
          <div className="game-art-bible-card-thumb-fallback" aria-hidden>
            {gameArtBible.swatches && gameArtBible.swatches.length > 0 ? (
              <div className="game-art-bible-card-thumb-swatches">
                {gameArtBible.swatches.map((c, i) => (
                  <span key={i} style={{ background: c }} />
                ))}
              </div>
            ) : (
              <span className="game-art-bible-card-thumb-placeholder">
                {thumbHtml === null ? '' : ''}
              </span>
            )}
          </div>
        )}
        <span className="game-art-bible-card-thumb-overlay" aria-hidden>
          {t('gameArtBible.preview')}
        </span>
      </div>
      <div className="game-art-bible-card-meta">
        <div className="game-art-bible-card-title-row">
          <span className="game-art-bible-card-title">{gameArtBible.title}</span>
          {active ? (
            <span className="game-art-bible-card-badge">{t('gameArtBible.badgeDefault')}</span>
          ) : null}
        </div>
        <div className="game-art-bible-card-summary">{localizedSummary}</div>
        <div className="game-art-bible-card-footer">
          <span className="game-art-bible-card-category">{categoryLabel}</span>
          {gameArtBible.swatches && gameArtBible.swatches.length > 0 ? (
            <div className="game-art-bible-card-swatches" aria-hidden>
              {gameArtBible.swatches.map((c, i) => (
                <span key={i} style={{ background: c }} title={c} />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
