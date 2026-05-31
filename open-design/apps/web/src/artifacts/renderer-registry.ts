import { inferLegacyManifest } from './manifest';
import { renderMarkdownToSafeHtml } from './markdown';
import type { ArtifactManifest, ArtifactRendererId } from './types';
import type { ProjectFile } from '../types';

const LEGACY_REACT_COMPONENT_KIND = 'react-component';
const REACT_GAME_MODULE_KIND = 'react-game-module';

export interface ArtifactRendererContext {
  file: ProjectFile;
  isDeckHint: boolean;
}

export interface ArtifactRenderer {
  id: ArtifactRendererId;
  /**
   * Whether this renderer can receive partial content during streaming.
   * - true + renderPartial defined → renderer produces useful intermediate output
   * - true without renderPartial → renderer tolerates partial content but
   *   should be considered visually meaningful only when status === "complete"
   * - false → consumer should show skeleton/loading state until status === "complete"
   */
  supportsStreaming: boolean;
  renderPartial?: (content: string) => string;
  canRender: (ctx: ArtifactRendererContext) => boolean;
}

export interface ArtifactRenderMatch {
  renderer: ArtifactRenderer;
  manifest: ArtifactManifest;
}

function resolveManifest(file: ProjectFile): ArtifactManifest | null {
  return file.artifactManifest ?? inferLegacyManifest({ entry: file.name });
}

export const HtmlRenderer: ArtifactRenderer = {
  id: 'html',
  supportsStreaming: false,
  canRender: ({ file, isDeckHint }) => {
    const manifest = resolveManifest(file);
    if (!manifest) return false;
    if (manifest.kind === 'deck' || manifest.renderer === 'deck-html') return false;
    if (
      manifest.renderer === 'html' ||
      manifest.kind === 'html' ||
      manifest.renderer === 'playable-prototype' ||
      manifest.kind === 'playable-prototype'
    ) {
      return true;
    }
    return file.kind === 'html' && !isDeckHint;
  },
};

export const DeckHtmlRenderer: ArtifactRenderer = {
  id: 'deck-html',
  supportsStreaming: false,
  canRender: ({ file, isDeckHint }) => {
    const manifest = resolveManifest(file);
    if (!manifest) return false;
    if (manifest.kind === 'deck' || manifest.renderer === 'deck-html') return true;
    return file.kind === 'html' && isDeckHint;
  },
};

export const ReactGameModuleRenderer: ArtifactRenderer = {
  id: REACT_GAME_MODULE_KIND,
  supportsStreaming: false,
  canRender: ({ file }) => {
    const manifest = resolveManifest(file);
    if (!manifest) return false;
    return (
      manifest.kind === REACT_GAME_MODULE_KIND ||
      manifest.renderer === REACT_GAME_MODULE_KIND ||
      (manifest.kind as string) === LEGACY_REACT_COMPONENT_KIND ||
      (manifest.renderer as string) === LEGACY_REACT_COMPONENT_KIND
    );
  },
};

export const MarkdownRenderer: ArtifactRenderer = {
  id: 'markdown',
  supportsStreaming: true,
  renderPartial: renderMarkdownToSafeHtml,
  canRender: ({ file }) => {
    const manifest = resolveManifest(file);
    if (!manifest) return false;
    if (
      manifest.renderer === 'markdown' ||
      manifest.kind === 'markdown-document' ||
      manifest.renderer === 'game-art-bible' ||
      manifest.kind === 'game-art-bible'
    ) {
      return true;
    }
    return file.kind === 'text' && /\.md$/i.test(file.name);
  },
};

export const SvgRenderer: ArtifactRenderer = {
  id: 'svg',
  supportsStreaming: false,
  canRender: ({ file }) => {
    const manifest = resolveManifest(file);
    if (!manifest) return false;
    if (manifest.renderer === 'svg' || manifest.kind === 'svg') return true;
    return (file.kind === 'image' || file.kind === 'sketch') && /\.svg$/i.test(file.name);
  },
};

export class RendererRegistry {
  constructor(private readonly renderers: ArtifactRenderer[]) {}

  resolve(ctx: ArtifactRendererContext): ArtifactRenderMatch | null {
    const manifest = resolveManifest(ctx.file);
    if (!manifest) return null;
    const renderer = this.renderers.find((item) => item.canRender(ctx));
    if (!renderer) return null;
    return { renderer, manifest };
  }
}

export const artifactRendererRegistry = new RendererRegistry([
  ReactGameModuleRenderer,
  DeckHtmlRenderer,
  HtmlRenderer,
  MarkdownRenderer,
  SvgRenderer,
]);
