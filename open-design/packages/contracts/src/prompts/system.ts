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
import type {
  GameEntityLinkRecord,
  GameEntityRecord,
  ProjectMetadata,
  ProjectTemplate,
} from '../api/projects.js';
import { GAME_DESIGN_METADATA_ENTITY_TYPE_MAP } from '../api/projects.js';
import { OFFICIAL_DESIGNER_PROMPT } from './official-system.js';
import { DISCOVERY_AND_PHILOSOPHY } from './discovery.js';
import { DECK_FRAMEWORK_DIRECTIVE } from './deck-framework.js';
import { MEDIA_GENERATION_CONTRACT } from './media-contract.js';
import { renderGameStudioCollaborationHandoffs } from '../game-studio.js';

export const BASE_SYSTEM_PROMPT = OFFICIAL_DESIGNER_PROMPT;

export interface ComposeInput {
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
  // them with section headers; shared prompt composition injects them
  // between the game art bible and the skill so art-bible token values
  // remain authoritative while craft rules protect player readability.
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
  // When set to 'plain', suppresses tool_calls so API/BYOK-mode models
  // only emit <artifact> blocks (they cannot execute tools).
  streamFormat?: string | undefined;
}

export interface GameMemoryPromptContext {
  entities?: GameEntityRecord[] | undefined;
  links?: GameEntityLinkRecord[] | undefined;
}

export function composeSystemPrompt({
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
    const preflight = derivePreflight(skillBody);
    parts.push(
      `\n\n## Active skill${skillName ? ` — ${skillName}` : ''}\n\nFollow this skill's workflow exactly.${preflight}\n\n${skillBody.trim()}`,
    );
  }

  const metaBlock = renderMetadataBlock(metadata, template);
  if (metaBlock) parts.push(metaBlock);
  const gameMemoryBlock = renderPersistentGameMemoryBlock(gameMemory);
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

export function renderPersistentGameMemoryBlock(
  gameMemory: GameMemoryPromptContext | undefined,
): string {
  const entities = Array.isArray(gameMemory?.entities)
    ? gameMemory.entities.filter((entity) => entity && typeof entity.id === 'string')
    : [];
  const links = Array.isArray(gameMemory?.links)
    ? gameMemory.links.filter((link) => link && typeof link.id === 'string')
    : [];
  if (entities.length === 0 && links.length === 0) return '';

  const lines: string[] = [];
  lines.push('\n\n## Persistent game memory');
  lines.push(
    'These durable game_entities rows are the studio source of truth for lore, factions, economy, systems, level logic, accessibility, telemetry, and production constraints. Preserve consistency with them unless the creator explicitly asks to revise memory.',
  );

  if (entities.length > 0) {
    lines.push('');
    lines.push('### Entities');
    for (const entity of entities.slice(0, 48)) {
      const summary = entity.summary?.trim()
        ? ` — ${entity.summary.trim()}`
        : '';
      const payload = renderMemoryPayload(entity.payload);
      lines.push(
        `- **${entity.type}** \`${entity.id}\`: ${entity.name}${summary}${payload}`,
      );
    }
    if (entities.length > 48) {
      lines.push(`- ... ${entities.length - 48} more memory entities omitted for prompt budget.`);
    }
  }

  if (links.length > 0) {
    lines.push('');
    lines.push('### Entity links');
    for (const link of links.slice(0, 32)) {
      const payload = renderMemoryPayload(link.payload);
      lines.push(
        `- \`${link.fromEntityId}\` -> \`${link.toEntityId}\` (${link.relationship})${payload}`,
      );
    }
    if (links.length > 32) {
      lines.push(`- ... ${links.length - 32} more memory links omitted for prompt budget.`);
    }
  }

  return lines.join('\n');
}

function renderMemoryPayload(payload: unknown): string {
  if (!isRecord(payload)) return '';
  const entries = Object.entries(payload)
    .filter(([, value]) => value !== undefined && value !== null)
    .slice(0, 8)
    .map(([key, value]) => `${key}: ${renderMemoryPayloadValue(value)}`)
    .filter((item) => item.trim().length > 0);
  if (entries.length === 0) return '';
  const rendered = entries.join(', ');
  const clipped =
    rendered.length > 700 ? `${rendered.slice(0, 700)}...` : rendered;
  return ` [${clipped}]`;
}

function renderMemoryPayloadValue(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, 6)
      .map((item) => renderMemoryPayloadValue(item))
      .filter(Boolean)
      .join(' | ');
  }
  if (isRecord(value)) {
    const compact = JSON.stringify(value);
    return compact.length > 180 ? `${compact.slice(0, 180)}...` : compact;
  }
  return '';
}

export function renderMetadataBlock(
  metadata: ProjectMetadata | undefined,
  template: ProjectTemplate | undefined,
): string {
  if (!metadata) return '';
  const lines: string[] = [];
  lines.push('\n\n## Project metadata');
  lines.push(
    'These are the structured choices the creator made (or skipped) when creating this project. Treat known fields as authoritative; for any field marked "(unknown — ask)" you MUST include a matching question in your turn-1 discovery brief.',
  );
  lines.push('');
  lines.push(`- **kind**: ${metadata.kind}`);
  const gameMemory = renderGameDesignMetadata(metadata.gameDesign);
  if (gameMemory.length > 0) {
    lines.push('');
    lines.push('### Game design memory');
    lines.push(
      'Preserve these game-domain facts across turns. Treat them as the current studio source of truth unless the creator explicitly changes them.',
    );
    lines.push(...gameMemory);
  }
  if (metadata.intent === 'live-artifact') {
    lines.push(
      '- **intent**: live-artifact — the creator chose New live game artifact. The first output should be a game live-ops console, economy tuning board, balance report, telemetry mock, production tracker, or other refreshable game-studio artifact rooted in playable systems and game fiction. Prefer the `live-artifact` skill workflow when available, keep source data compact, and register through the daemon live-artifact tool path once that wrapper/tooling is available.',
    );
    lines.push(
      '- **connector-source rule**: if the creator names a connector/source (for example Notion) and daemon connector tools are available, list connectors before asking where the game data comes from. When the named connector is `connected`, use its read-only tools and ask follow-up questions only for missing project/page/database details, multiple equally plausible matches, or an unconnected/missing connector.',
    );
  }

  if (metadata.kind === 'prototype') {
    lines.push(
      `- **fidelity**: ${metadata.fidelity ?? '(unknown — ask: wireframe vs high-fidelity)'}`,
    );
  }
  if (metadata.kind === 'deck') {
    lines.push(
      `- **speakerNotes**: ${typeof metadata.speakerNotes === 'boolean' ? metadata.speakerNotes : '(unknown — ask: include speaker notes?)'}`,
    );
  }
  if (metadata.kind === 'template') {
    lines.push(
      `- **animations**: ${typeof metadata.animations === 'boolean' ? metadata.animations : '(unknown — ask: include motion/animations?)'}`,
    );
    if (metadata.templateLabel) {
      lines.push(`- **template**: ${metadata.templateLabel}`);
    }
  }
  if (metadata.kind === 'image') {
    lines.push(
      `- **imageModel**: ${metadata.imageModel ?? '(unknown - ask: which image model to use)'}`,
    );
    lines.push(
      `- **aspectRatio**: ${metadata.imageAspect ?? '(unknown - ask: 1:1, 16:9, 9:16, 4:3, 3:4)'}`,
    );
    if (metadata.imageStyle) {
      lines.push(`- **styleNotes**: ${metadata.imageStyle}`);
    }
    if (metadata.promptTemplate && metadata.promptTemplate.prompt.trim().length > 0) {
      lines.push(`- **referenceTemplate**: ${metadata.promptTemplate.title}`);
    }
    lines.push('');
    lines.push(
      'This is a **game asset image** project. Plan the concept-art, HUD, key-art, environment, character, item, weapon, map, or splash-screen prompt carefully, then dispatch via the **media generation contract** using `"$AGDS_NODE_BIN" "$AGDS_BIN" media generate --surface image --model <imageModel>`. Do NOT emit `<artifact>` HTML for media surfaces.',
    );
  }
  if (metadata.kind === 'video') {
    lines.push(
      `- **videoModel**: ${metadata.videoModel ?? '(unknown - ask: which video model to use)'}`,
    );
    lines.push(
      `- **lengthSeconds**: ${typeof metadata.videoLength === 'number' ? metadata.videoLength : '(unknown - ask: 3s / 5s / 10s)'}`,
    );
    lines.push(
      `- **aspectRatio**: ${metadata.videoAspect ?? '(unknown - ask: 16:9, 9:16, 1:1)'}`,
    );
    if (metadata.promptTemplate && metadata.promptTemplate.prompt.trim().length > 0) {
      lines.push(`- **referenceTemplate**: ${metadata.promptTemplate.title}`);
    }
    lines.push('');
    lines.push(
      'This is a **game trailer / motion** project. Plan the shotlist, camera, animation beats, UI/gameplay capture moments, VFX, and emotional pacing, then dispatch via the **media generation contract** using `"$AGDS_NODE_BIN" "$AGDS_BIN" media generate --surface video --model <videoModel> --length <seconds> --aspect <ratio>`. Do NOT emit `<artifact>` HTML.',
    );
    if (metadata.videoModel === 'hyperframes-html') {
      lines.push(
        'Special case: `hyperframes-html` is a local HTML-to-MP4 renderer, not a photoreal text-to-video model. Treat it like a game motion-graphics renderer for trailers, HUD callouts, progression trees, title reveals, or live-ops cards; ask at most one clarifying question, then dispatch immediately.',
      );
    }
  }
  if (metadata.kind === 'audio') {
    lines.push(
      `- **audioKind**: ${metadata.audioKind ?? '(unknown - ask: music / speech / sfx)'}`,
    );
    lines.push(
      `- **audioModel**: ${metadata.audioModel ?? '(unknown - ask: which audio model to use)'}`,
    );
    lines.push(
      `- **durationSeconds**: ${typeof metadata.audioDuration === 'number' ? metadata.audioDuration : '(unknown - ask: target duration)'}`,
    );
    if (metadata.voice) {
      lines.push(`- **voice**: ${metadata.voice}`);
    } else if (metadata.audioKind === 'speech') {
      lines.push('- **voice**: (unknown - ask: voice id / accent / pacing)');
    }
    lines.push('');
    lines.push(
      'This is a **game audio** project. Lock soundtrack, adaptive layer, combat SFX, ambient soundscape, UI cue, voice-over, or trailer-audio intent first, then dispatch via the **media generation contract** using `"$AGDS_NODE_BIN" "$AGDS_BIN" media generate --surface audio --audio-kind <kind> --model <audioModel> --duration <seconds>` and add `--voice <voice-id>` for speech when you have a provider-specific voice id. Do NOT emit `<artifact>` HTML.',
    );
  }

  const inspirationGameArtBibleIds = metadata.inspirationGameArtBibleIds ?? [];
  if (inspirationGameArtBibleIds.length > 0) {
    lines.push(
      `- **inspirationGameArtBibleIds**: ${inspirationGameArtBibleIds.join(', ')} — the creator picked these art bibles as *additional* inspiration alongside the primary one. Borrow palette accents, type personality, HUD posture, or gameplay-module patterns from them; don't replace the primary game art bible's tokens.`,
    );
  }

  // Curated prompt template reference for image/video projects. Inlined
  // verbatim (with light truncation) so the agent can borrow structure,
  // mood and phrasing without a separate fetch. The creator may have edited
  // the body before clicking Create — those edits land here and are now
  // authoritative for the brief.
  if (
    (metadata.kind === 'image' || metadata.kind === 'video') &&
    metadata.promptTemplate &&
    metadata.promptTemplate.prompt.trim().length > 0
  ) {
    const tpl = metadata.promptTemplate;
    lines.push('');
    lines.push(`### Reference prompt template — "${tpl.title}"`);
    const meta: string[] = [];
    if (tpl.category) meta.push(`category: ${tpl.category}`);
    if (tpl.model) meta.push(`suggested model: ${tpl.model}`);
    if (tpl.aspect) meta.push(`aspect: ${tpl.aspect}`);
    if (tpl.tags && tpl.tags.length > 0) {
      meta.push(`tags: ${tpl.tags.join(', ')}`);
    }
    if (meta.length > 0) lines.push(meta.join(' · '));
    if (tpl.summary) {
      lines.push('');
      lines.push(tpl.summary);
    }
    lines.push('');
    lines.push(
      'The creator picked this template as inspiration. Treat it as a structural and stylistic reference: borrow composition, palette cues, lighting language, lens/motion direction, and the level of detail. Adapt the wording to the creator\'s actual subject and brief — do NOT generate the template subject verbatim. If a field above is unknown the creator wants you to follow the template\'s defaults.',
    );
    // Escape triple-backticks so a creator who pastes ``` into the editable
    // template body can't break out of the markdown fence below and inject
    // free-form instructions into the agent's system prompt. Zero-width
    // joiner between the backticks keeps the prompt human-readable while
    // preventing the closing fence from matching prematurely.
    const safe = tpl.prompt.replace(/```/g, '`\u200b`\u200b`');
    const truncated =
      safe.length > 4000
        ? `${safe.slice(0, 4000)}\n… (truncated ${safe.length - 4000} chars)`
        : safe;
    lines.push('');
    lines.push('```text');
    lines.push(truncated);
    lines.push('```');
    if (tpl.source) {
      const author = tpl.source.author ? ` by ${tpl.source.author}` : '';
      lines.push('');
      lines.push(
        `Source: ${tpl.source.repo}${author} — license ${tpl.source.license}. Preserve attribution if you echo the template language directly.`,
      );
    }
  }

  if (metadata.kind === 'template' && template && template.files.length > 0) {
    lines.push('');
    lines.push(
      `### Template reference — "${template.name}"${template.description ? ` (${template.description})` : ''}`,
    );
    lines.push(
      'These HTML snapshots are what the creator wants to start FROM. Read them as a game-specific stylistic + structural reference. You may copy structure, palette, typography, HUD/menu/level patterns, and interaction posture; adapt them to the new game brief; do NOT ship them verbatim. The agent should still produce its own game artifact, just one that visibly inherits this template\'s art direction and play-state structure.',
    );
    for (const f of template.files) {
      // Cap each file at ~12k chars so a giant template doesn't blow out
      // the system prompt budget. The agent gets enough to read structure.
      const truncated =
        f.content.length > 12000
          ? `${f.content.slice(0, 12000)}\n<!-- … truncated (${f.content.length - 12000} chars omitted) -->`
          : f.content;
      lines.push('');
      lines.push(`#### \`${f.name}\``);
      lines.push('```html');
      lines.push(truncated);
      lines.push('```');
    }
  }

  return lines.join('\n');
}

function renderGameDesignMetadata(value: unknown): string[] {
  if (!isRecord(value)) return [];
  const lines: string[] = [];
  const scalarKeys = [
    'genre',
    'playerMode',
    'camera',
    'engine',
    'artStyle',
    'sessionLength',
    'audienceAge',
    'emotionalGoal',
    'monetization',
    'dimensionality',
    'designEmphasis',
    'enginePreference',
    'deliveryTarget',
  ];
  for (const key of scalarKeys) {
    const v = value[key];
    if (typeof v === 'string' && v.trim()) {
      lines.push(`- **${key}**: ${v.trim()}`);
    }
  }

  for (const key of [
    'subgenres',
    'platforms',
    'inputModel',
    'editorSurfaces',
    'inspirations',
    'pillars',
    'accessibilityRequirements',
    'technicalConstraints',
    'engineConstraints',
    'targetDevices',
    'deliverableTypes',
  ]) {
    const v = value[key];
    if (Array.isArray(v)) {
      const items = v.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
      if (items.length > 0) lines.push(`- **${key}**: ${items.join(', ')}`);
    }
  }

  const entityKeys = Object.keys(GAME_DESIGN_METADATA_ENTITY_TYPE_MAP);
  for (const key of entityKeys) {
    const v = value[key];
    if (!Array.isArray(v)) continue;
    const items = v
      .map((item) => renderGameEntity(item))
      .filter((item): item is string => item.length > 0);
    if (items.length > 0) lines.push(`- **${key}**: ${items.join('; ')}`);
  }
  return lines;
}

function renderGameEntity(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (!isRecord(value)) return '';
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  if (!name) return '';
  const role = typeof value.role === 'string' && value.role.trim() ? ` (${value.role.trim()})` : '';
  const notes = typeof value.notes === 'string' && value.notes.trim() ? `: ${value.notes.trim()}` : '';
  return `${name}${role}${notes}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Detect the seed/references pattern shipped by the upgraded
 * playable concept / mobile flow / pitch deck / art-bible skills, and
 * inject a hard pre-flight rule that lists which side files to Read
 * before doing anything else. The skill body's own workflow already says
 * this — but skills get truncated under context pressure and the agent
 * sometimes skips Step 0. A short up-front directive helps.
 *
 * Returns an empty string when the skill ships no side files (legacy
 * SKILL.md-only skills) so we don't add noise.
 */
export function derivePreflight(skillBody: string): string {
  const refs: string[] = [];
  if (/assets\/template\.html/.test(skillBody)) refs.push('`assets/template.html`');
  if (/references\/layouts\.md/.test(skillBody)) refs.push('`references/layouts.md`');
  if (/references\/art-direction\.md/.test(skillBody)) refs.push('`references/art-direction.md`');
  if (/references\/themes\.md/.test(skillBody)) refs.push('`references/themes.md` (legacy alias for art-direction rules)');
  if (/references\/gameplay-modules\.md/.test(skillBody)) refs.push('`references/gameplay-modules.md`');
  if (/references\/components\.md/.test(skillBody)) refs.push('`references/components.md` (legacy alias for gameplay modules)');
  if (/references\/checklist\.md/.test(skillBody)) refs.push('`references/checklist.md`');
  if (/references\/artifact-schema\.md/.test(skillBody)) refs.push('`references/artifact-schema.md`');
  if (/references\/connector-policy\.md|connector-policy\.md/.test(skillBody)) {
    refs.push('`references/connector-policy.md`');
  }
  if (/references\/refresh-contract\.md|refresh-contract\.md/.test(skillBody)) {
    refs.push('`references/refresh-contract.md`');
  }
  if (refs.length === 0) return '';
  return ` **Pre-flight (do this before any other tool):** Read ${refs.join(', ')} via the path written in the skill-root preamble. If the skill asks for daemon wrapper commands, use the runtime tool environment documented below; it provides the daemon URL and whether a run-scoped tool token is available without exposing token internals. The seed template defines the class system you'll paste into; the layouts file is the only acceptable source of game-section/game-screen/slide skeletons; the checklist and live-artifact references are your validation gate before emitting \`<artifact>\` or registering a live game artifact. Skipping this step is the #1 reason output regresses to generic non-game drift.`;
}
