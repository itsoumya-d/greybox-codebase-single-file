import { useCallback, useEffect, useState } from 'react';
import { useT } from '../i18n';
import {
  fetchGameArtBible,
  fetchGameArtBiblePreview,
  fetchGameArtBibleShowcase,
} from '../providers/registry';
import type { GameArtBibleSummary } from '../types';
import { ArtBibleSpecView } from './ArtBibleSpecView';
import { PreviewModal } from './PreviewModal';

type Props = {
  onClose: () => void;
  gameArtBible: GameArtBibleSummary;
};

// Two-tab game art bible preview: a complete Showcase view rendered from the
// bible's tokens, and the original Tokens view (palette / typography /
// game modules + rendered DESIGN.md prose). A toggleable side panel surfaces the
// raw DESIGN.md so creators can compare spec to render at the same time.
export function GameArtBiblePreviewModal({ gameArtBible, onClose }: Props) {
  const bible = gameArtBible;
  const t = useT();
  const [showcaseHtml, setShowcaseHtml] = useState<string | null | undefined>(undefined);
  const [tokensHtml, setTokensHtml] = useState<string | null | undefined>(undefined);
  const [specBody, setSpecBody] = useState<string | null | undefined>(undefined);

  // Lazy-load each view on first reveal. Both endpoints are cheap, but this
  // keeps the network panel quiet when the creator only opens one tab.
  const handleView = useCallback(
    (viewId: string) => {
      if (viewId === 'showcase' && showcaseHtml === undefined) {
        setShowcaseHtml(null);
        void fetchGameArtBibleShowcase(bible.id).then((html) => setShowcaseHtml(html));
      }
      if (viewId === 'tokens' && tokensHtml === undefined) {
        setTokensHtml(null);
        void fetchGameArtBiblePreview(bible.id).then((html) => setTokensHtml(html));
      }
    },
    [bible.id, showcaseHtml, tokensHtml],
  );

  // Fetch DESIGN.md the first time the side panel opens. Once we have it we
  // never re-fetch unless the underlying game art bible swaps.
  const handleSidebarToggle = useCallback(
    (open: boolean) => {
      if (!open || specBody !== undefined) return;
      setSpecBody(null);
      void fetchGameArtBible(bible.id).then((detail) =>
        setSpecBody(detail?.body ?? null),
      );
    },
    [bible.id, specBody],
  );

  // If the game art bible swaps under us (rare but possible), wipe all caches.
  useEffect(() => {
    setShowcaseHtml(undefined);
    setTokensHtml(undefined);
    setSpecBody(undefined);
  }, [bible.id]);

  return (
    <PreviewModal
      title={bible.title}
      subtitle={bible.summary || bible.category}
      views={[
        { id: 'showcase', label: t('gameArtBible.showcase'), html: showcaseHtml },
        { id: 'tokens', label: t('gameArtBible.tokens'), html: tokensHtml },
      ]}
      initialViewId="showcase"
      onView={handleView}
      exportTitleFor={(viewId) => `${bible.title} — ${viewId}`}
      onClose={onClose}
      sidebar={{
        label: t('gameArtBible.specToggle'),
        defaultOpen: true,
        onToggle: handleSidebarToggle,
        // Re-fire onToggle when the game art bible swaps under us so the new
        // DESIGN.md fetch starts even if the sidebar never closed.
        contentKey: bible.id,
        content: (
          <ArtBibleSpecView
            source={specBody}
            loadingLabel={t('gameArtBible.specLoading')}
          />
        ),
      }}
    />
  );
}
