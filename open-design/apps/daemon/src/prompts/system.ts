/**
 * Prompt composer. The base is the AI Game Design Studio creative-director system
 * prompt (see ./official-system.ts) — a full identity, workflow, and
 * game-design philosophy charter. Stacked on top:
 *
 *   1. The studio discovery + game planning layer (./discovery.ts)
 *      — interactive discovery-brief syntax, direction-picker fork,
 *      art-bible extraction, TodoWrite reinforcement, 5-dim critique,
 *      and the embedded `directions.ts` library.
 *   2. The active game art bible's DESIGN.md (if any) — palette,
 *      typography, spacing, HUD, mood, and gameplay-module rules treated as
 *      authoritative game tokens.
 *   3. The active skill's SKILL.md (if any) — workflow specific to the
 *      kind of artifact being built. When the skill ships a seed
 *      (`assets/template.html`) and references (`references/layouts.md`,
 *      `references/checklist.md`), we inject a hard pre-flight rule above
 *      the skill body so the agent reads them BEFORE writing any code.
 *   4. For decks (skillMode === 'deck' OR metadata.kind === 'deck'), the
 *      deck framework directive (./deck-framework.ts) is pinned LAST so it
 *      overrides any softer slide-handling wording earlier in the stack —
 *      this is the load-bearing nav / counter / scroll JS / print
 *      stylesheet contract that PDF stitching depends on. We also fire on
 *      the metadata path so deck-kind projects without a bound skill
 *      (skill_id null) still get a framework, instead of having the agent
 *      re-author scaling / nav / print logic from scratch each turn. When
 *      the active skill ships its own seed (skill body references
 *      `assets/template.html`), we defer to that seed and skip the generic
 *      skeleton — the skill's framework wins to avoid double-injection.
 *
 * The composed string is what the daemon sees as `systemPrompt` and what
 * the Anthropic path sends as `system`.
 */
import { OFFICIAL_DESIGNER_PROMPT } from './official-system.js';
import { DISCOVERY_AND_PHILOSOPHY } from './discovery.js';
import { DECK_FRAMEWORK_DIRECTIVE } from './deck-framework.js';
import { IMAGE_MODELS } from '../media-models.js';
import { renderPanelPrompt } from './panel.js';
import { defaultCritiqueConfig, type CritiqueConfig } from '@ai-game-design-studio/contracts/critique';
import { MEDIA_GENERATION_CONTRACT } from '@ai-game-design-studio/contracts/prompts/media-contract';
import type {
  ProjectMetadata,
  ProjectTemplate,
} from '@ai-game-design-studio/contracts/api/projects';
import {
  derivePreflight as deriveSharedPreflight,
  renderMetadataBlock as renderSharedMetadataBlock,
  renderPersistentGameMemoryBlock as renderSharedPersistentGameMemoryBlock,
  type GameMemoryPromptContext,
} from '@ai-game-design-studio/contracts/prompts/system';
import * as gameStudioContracts from '@ai-game-design-studio/contracts';

const renderGameStudioCollaborationHandoffs = (
  gameStudioContracts as unknown as {
    renderGameStudioCollaborationHandoffs(): string;
  }
).renderGameStudioCollaborationHandoffs;

export const BASE_SYSTEM_PROMPT = OFFICIAL_DESIGNER_PROMPT;

export interface ComposeInput {
  agentId?: string | null | undefined;
  includeCodexImagegenOverride?: boolean | undefined;
  streamFormat?: string | undefined;
  skillBody?: string | undefined;
  skillName?: string | undefined;
  skillMode?:
    | 'prototype'
    | 'deck'
    | 'template'
    | 'game-art-bible'
    | 'image'
    | 'video'
    | 'audio'
    | undefined;
  gameArtBibleBody?: string | undefined;
  gameArtBibleTitle?: string | undefined;
  // Craft references the active skill opted into via `agds.craft.requires`.
  // The daemon resolves the slug list to file contents and concatenates
  // them with section headers; we inject them between the DESIGN.md and
  // the skill body so game-art-bible tokens win on conflict but craft rules
  // (letter-spacing, accent caps, anti-slop) cover everything below.
  craftBody?: string | undefined;
  craftSections?: string[] | undefined;
  // Project-level metadata captured by the new-project panel. Drives the
  // agent's understanding of artifact kind, fidelity, speaker-notes intent
  // and animation intent. Missing fields here are exactly what the
  // discovery brief should re-ask the creator about on turn 1.
  metadata?: ProjectMetadata | undefined;
  // The template the creator picked in the From-template tab, when present.
  // Snapshot of HTML files that the agent should treat as a starting
  // reference rather than a fixed deliverable.
  template?: ProjectTemplate | undefined;
  // Durable game memory rows from game_entities/game_entity_links. These
  // are long-lived lore/system facts, separate from high-level onboarding
  // metadata, and should be treated as the studio source of truth.
  gameMemory?: GameMemoryPromptContext | undefined;
  // When present and enabled, the Critique Theater protocol addendum is
  // concatenated to the end of the composed prompt. Omitting this field
  // (or passing cfg.enabled === false) preserves legacy behavior unchanged.
  critique?: CritiqueConfig | undefined;
  // Game art bible name and DESIGN.md body. Required when critique is enabled;
  // ignored when critique is disabled or omitted.
  critiqueGameArtBible?: { name: string; design_md: string } | undefined;
  // Skill identifier. Required when critique is enabled;
  // ignored when critique is disabled or omitted.
  critiqueSkill?: { id: string } | undefined;
  // External MCP servers the daemon already holds a valid OAuth Bearer
  // token for at spawn time. We surface the list to the model so it does
  // NOT chase Claude Code's synthetic `*_authenticate` /
  // `*_complete_authentication` tools that get injected when the HTTP
  // transport's first connect transiently flips a server into
  // needs-auth state — the Bearer is in `.mcp.json`, the real tools are
  // available, and burning a turn on a redundant OAuth dance just
  // confuses the creator.
  connectedExternalMcp?: ReadonlyArray<{ id: string; label?: string | undefined }>
    | undefined;
}

export function composeSystemPrompt({
  agentId,
  includeCodexImagegenOverride = true,
  skillBody,
  skillName,
  skillMode,
  gameArtBibleBody,
  gameArtBibleTitle,
  craftBody,
  craftSections,
  metadata,
  template,
  gameMemory,
  critique,
  critiqueGameArtBible,
  critiqueSkill,
  connectedExternalMcp,
  streamFormat,
}: ComposeInput): string {
  const activeGameArtBibleBody = gameArtBibleBody;
  const activeGameArtBibleTitle = gameArtBibleTitle;
  // Discovery + philosophy goes FIRST so its hard rules ("emit a discovery brief on
  // turn 1", "branch on art direction on turn 2", "TodoWrite on turn 3", run
  // checklist + critique before <artifact>) win precedence over softer
  // wording later in the official base prompt.
  const parts: string[] = [
    DISCOVERY_AND_PHILOSOPHY,
    '\n\n---\n\n# Identity and workflow charter (background)\n\n',
    BASE_SYSTEM_PROMPT,
    '\n\n' + renderGameStudioCollaborationHandoffs(),
  ];

  if (activeGameArtBibleBody && activeGameArtBibleBody.trim().length > 0) {
    parts.push(
      `\n\n## Active game art bible${activeGameArtBibleTitle ? ` — ${activeGameArtBibleTitle}` : ''}\n\nTreat the following DESIGN.md as authoritative for palette, typography, HUD density, motion posture, mood, spacing, and game-interface rules. Do not invent tokens outside this game art bible unless the brief requires a new semantic token such as danger, healing, rarity, faction, biome, cooldown, or objective. When you copy the active skill's seed template, bind these tokens into its \`:root\` block before generating any layout.\n\n${activeGameArtBibleBody.trim()}`,
    );
  }

  if (craftBody && craftBody.trim().length > 0) {
    const sectionLabel =
      Array.isArray(craftSections) && craftSections.length > 0
        ? ` — ${craftSections.join(', ')}`
        : '';
    parts.push(
      `\n\n## Active game craft references${sectionLabel}\n\nThe following craft rules are universal — they apply on top of the active game art bible above. The DESIGN.md decides *which* tokens to use; craft rules decide *how* to use them for player readability, game feel, input, HUD stability, accessibility, and anti-slop. On any conflict between a craft rule and a game art bible, the art bible wins for token values; craft rules still apply to anything the art bible does not override.\n\n${craftBody.trim()}`,
    );
  }

  if (skillBody && skillBody.trim().length > 0) {
    const preflight = deriveSharedPreflight(skillBody);
    parts.push(
      `\n\n## Active skill${skillName ? ` — ${skillName}` : ''}\n\nFollow this skill's workflow exactly.${preflight}\n\n${skillBody.trim()}`,
    );
  }

  const metaBlock = renderSharedMetadataBlock(metadata, template);
  if (metaBlock) parts.push(metaBlock);
  const gameMemoryBlock = renderSharedPersistentGameMemoryBlock(gameMemory);
  if (gameMemoryBlock) parts.push(gameMemoryBlock);

  // Decks have a load-bearing framework (nav, counter, scroll JS, print
  // stylesheet for PDF stitching). Pin it last so it overrides any softer
  // wording earlier in the stack ("write a script that handles arrows…").
  //
  // We fire on either (a) the active skill is a deck skill OR (b) the
  // project metadata declares kind=deck. Case (b) catches projects created
  // without a skill (skill_id null) — without this, a deck-kind project
  // with no bound skill gets neither a skill seed nor the framework
  // skeleton, and the agent writes scaling / nav / print logic from scratch
  // with the same buggy `place-items: center` + transform pattern we keep
  // having to fix at runtime. Skill seeds (when present) win — they
  // already define their own opinionated game-pitch framework and
  // re-pinning the generic skeleton would conflict. The skill-seed path takes over via
  // `derivePreflight` above, so we only fire the generic skeleton when no
  // skill seed is on offer.
  const isDeckProject = skillMode === 'deck' || metadata?.kind === 'deck';
  const hasSkillSeed =
    !!skillBody && /assets\/template\.html/.test(skillBody);
  if (isDeckProject && !hasSkillSeed) {
    parts.push(`\n\n---\n\n${DECK_FRAMEWORK_DIRECTIVE}`);
  }

  const isMediaSurface =
    skillMode === 'image' ||
    skillMode === 'video' ||
    skillMode === 'audio' ||
    metadata?.kind === 'image' ||
    metadata?.kind === 'video' ||
    metadata?.kind === 'audio';
  if (isMediaSurface) {
    parts.push(MEDIA_GENERATION_CONTRACT);
  }

  if (includeCodexImagegenOverride) {
    const codexImagegenOverride = renderCodexImagegenOverride(
      agentId,
      metadata,
    );
    if (codexImagegenOverride) {
      parts.push(codexImagegenOverride);
    }
  }

  // Critique Theater addendum. When cfg.enabled is true the panel protocol
  // is pinned last so it overrides any softer critique wording earlier in the
  // stack. When disabled (the default) this block is a no-op so no consumer
  // needs to opt in.
  //
  // The panel block requires <ARTIFACT mime="text/html"> inside <CRITIQUE_RUN>,
  // which conflicts with MEDIA_GENERATION_CONTRACT (image/video/audio surfaces
  // explicitly forbid HTML output). Skip the addendum on media surfaces so
  // the critique flag is a no-op there until a media-aware panel template
  // lands.
  const cfg = critique ?? defaultCritiqueConfig();
  if (cfg.enabled && critiqueGameArtBible && critiqueSkill && !isMediaSurface) {
    parts.push('\n\n' + renderPanelPrompt({ cfg, gameArtBible: critiqueGameArtBible, skill: critiqueSkill }));
  }

  const mcpDirective = renderConnectedExternalMcpDirective(connectedExternalMcp);
  if (mcpDirective) parts.push(mcpDirective);

  // Suppress tool_calls in API/BYOK mode (streamFormat === 'plain').
  // Only fires when the caller explicitly passes streamFormat='plain';
  // does NOT fire when streamFormat is omitted, so non-plain (tool-using)
  // adapters are unaffected and normal chat runs can still use tools.
  if (streamFormat === 'plain') {
    parts.push(
      '\n\n## API mode rule\n\nDo not emit tool_calls. Output only <artifact> HTML blocks. Any tool description in your internal reasoning must not appear in the response.',
    );
  }

  return parts.join('');
}

// Defense-in-depth against Claude Code's synthetic OAuth tools.
//
// When Claude Code's built-in HTTP MCP transport gets a 401 on its first
// initialize (transient propagation lag, edge cache miss, header
// re-canonicalization quirk, etc.), it injects two synthetic tools per
// server — `mcp__<server>__authenticate` and
// `mcp__<server>__complete_authentication` — that drive a per-process
// OAuth dance with a `localhost:<random>/callback` redirect_uri. That
// listener dies with the agent process, so the round-trip never
// completes, and meanwhile the model burns a turn pasting an
// unreachable URL into the chat. By the time the creator is back, our
// daemon-issued Bearer is already in `.mcp.json` and the real tools
// (`generate_image`, `models_explore`, …) are reachable on the next
// turn — but the model doesn't know that and keeps escalating the
// fake auth flow.
//
// The fix is to tell the model up front: these specific servers are
// already authenticated by the daemon, do NOT call any
// `*_authenticate` / `*_complete_authentication` tool for them. If
// the real tools really are missing, surface that as a separate
// failure instead of pivoting to the synthetic flow.
function renderConnectedExternalMcpDirective(
  connectedExternalMcp:
    | ReadonlyArray<{ id: string; label?: string | undefined }>
    | undefined,
): string {
  if (!connectedExternalMcp || connectedExternalMcp.length === 0) return '';
  const lines = connectedExternalMcp
    .map((s) => {
      const id = typeof s?.id === 'string' ? s.id.trim() : '';
      if (!id) return null;
      const label = typeof s?.label === 'string' && s.label.trim() ? s.label.trim() : id;
      return `- \`${id}\`${label !== id ? ` (${label})` : ''}`;
    })
    .filter((line): line is string => typeof line === 'string');
  if (lines.length === 0) return '';
  return [
    '\n\n---\n\n',
    '## External MCP servers — already authenticated\n\n',
    'The following external MCP servers are already authenticated for this run via an OAuth Bearer token the daemon injected into `.mcp.json`. You can call their real tools directly:\n\n',
    lines.join('\n'),
    '\n\n',
    '**Do NOT call any tool whose name matches `mcp__<server>__authenticate` or `mcp__<server>__complete_authentication` for the servers above.** Those are synthetic fallback tools Claude Code exposes when its first HTTP connect briefly flipped the server into a needs-auth state. The flow they drive (a `localhost:<random>/callback` redirect) cannot complete in this environment, and the real tools (e.g. `generate_image`, `models_explore`, `balance`, …) are already reachable.\n\n',
    'If a real tool actually fails with an auth-related error, report the exact tool name and error text and stop — the creator will reconnect the server in Settings → External MCP. Do not retry by invoking any `*_authenticate` tool.\n',
  ].join('');
}

const CODEX_IMAGEGEN_MODEL_IDS = new Set(
  IMAGE_MODELS.filter(
    (model) =>
      model?.provider === 'openai' &&
      typeof model?.id === 'string' &&
      model.id.startsWith('gpt-image-'),
  ).map((model) => model.id),
);

export function resolveCodexImagegenModelId(
  metadata: ProjectMetadata | undefined,
): string {
  const imageModel =
    typeof metadata?.imageModel === 'string' ? metadata.imageModel.trim() : '';
  return CODEX_IMAGEGEN_MODEL_IDS.has(imageModel) ? imageModel : '';
}

export function shouldRenderCodexImagegenOverride(
  agentId: string | null | undefined,
  metadata: ProjectMetadata | undefined,
): boolean {
  const normalizedAgentId =
    typeof agentId === 'string' ? agentId.trim().toLowerCase() : '';
  return (
    normalizedAgentId === 'codex' &&
    metadata?.kind === 'image' &&
    resolveCodexImagegenModelId(metadata).length > 0
  );
}

export function renderCodexImagegenOverride(
  agentId: string | null | undefined,
  metadata: ProjectMetadata | undefined,
): string {
  if (!shouldRenderCodexImagegenOverride(agentId, metadata)) {
    return '';
  }
  const imageModel = resolveCodexImagegenModelId(metadata);

  return `

---

## Codex built-in imagegen override (load-bearing — Codex only)

The active agent is Codex and this image project selected \`${imageModel}\`.
For this specific case, use Codex's built-in image generation capability
instead of \`"$AGDS_NODE_BIN" "$AGDS_BIN" media generate\` for the first generation
attempt. This is an intentional exception to the media generation contract and
the active image skill's dispatcher wording.

Do not require, request, or mention \`OPENAI_API_KEY\` before trying the
built-in path. Reuse the project metadata, reference prompt template, aspect
ratio, style notes, and the creator's current brief to shape the final image
prompt. Generate the image with Codex built-in imagegen, then use the actual
output path returned by the built-in imagegen result as the source file first.
Only if the built-in result does not return a usable path should you search
\`\${CODEX_HOME:-$HOME/.codex}/generated_images/.../ig_*.png\` as a fallback
source. Never leave a project-referenced asset only under \`$CODEX_HOME\`.

Copy or move the selected generated file into \`$AGDS_PROJECT_DIR\` with a short
descriptive filename, then verify the exact destination file exists under
\`$AGDS_PROJECT_DIR\` before claiming success. If reading the source path,
creating the destination directory, copying/moving, or verifying the copied
asset fails, report the exact source path, destination path, and access/copy
error. Do not claim success, silently fall back, or ask about OpenAI/Azure
fallback after a generated image exists but the project copy fails; stop after
reporting the failure unless the creator explicitly chooses fallback in a later
turn, because fallback may create a different image.

After the file exists under \`$AGDS_PROJECT_DIR\`, reply with the project-local
filename and a short summary of the prompt used. Do not emit an \`<artifact>\`
block for media.

If Codex built-in imagegen is unavailable or generation fails before producing
an image, surface the actual failure message and ask the creator for one-time
confirmation before falling back to the existing OpenAI/Azure API-key provider
path via \`"$AGDS_NODE_BIN" "$AGDS_BIN" media generate --surface image --model ${imageModel}\`.
Do not silently fall back.`;
}
