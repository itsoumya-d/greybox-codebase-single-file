// Builds the literal text the Continue in CLI button copies to the
// clipboard. Inline single-source-of-truth template per #451 / spec §3.4.
// The trailing TODO is the "blank task slot" the issue body specifies —
// do NOT pre-fill it.

import type { Project } from '@ai-game-design-studio/contracts';

export interface GameDesignDocSummary {
  generatedAt: Date | null;
  transcriptMessageCount: number | null;
  gameArtBibleId?: string | null;
  currentArtifact: string | null;
}

export interface BuildClipboardPromptInput {
  project: Pick<Project, 'id' | 'name'>;
  gameDesignDocState: GameDesignDocSummary;
  projectDir: string;
}

export function buildClipboardPrompt({
  project,
  gameDesignDocState,
  projectDir,
}: BuildClipboardPromptInput): string {
  const generatedAt =
    gameDesignDocState.generatedAt && Number.isFinite(gameDesignDocState.generatedAt.getTime())
      ? gameDesignDocState.generatedAt.toISOString()
      : 'unknown';
  const transcriptCount =
    typeof gameDesignDocState.transcriptMessageCount === 'number'
      ? String(gameDesignDocState.transcriptMessageCount)
      : 'unknown';
  const gameArtBibleId = gameDesignDocState.gameArtBibleId ?? null;

  return `# Continue in CLI — ${project.name}

You're picking up an AI Game Design Studio project mid-flight in a fresh \`claude\` CLI session. Run \`claude\` at the working directory below; the game design intent is captured in \`DESIGN.md\` at the project root.

## Working directory

\`\`\`
${projectDir}
\`\`\`

## Authoritative spec

Read \`DESIGN.md\` first. It contains:
- Summary
- Game Identity
- Gameplay / Level Architecture
- Gameplay Modules & HUD Patterns
- Art Bible / Visual System
- Open Questions
- Provenance

The Provenance section names the project ID, game art bible, current artifact, transcript message count, and generated UTC timestamp. If the spec is stale (current state has moved past the provenance), surface that to the creator before acting.

## Operating rules for this session

- Treat \`DESIGN.md\` as the authoritative source of game design intent. Don't re-derive design decisions from chat history unless \`DESIGN.md\` is missing or contradicts current artifacts.
- The art bible, game-state table, gameplay module contracts, and player-facing state rules are documented in the existing project files — read what's there before introducing new patterns.
- No new build steps, lockfile churn, or dependency additions without surfacing.
- For shell-out tooling (\`pnpm\`, \`curl\`, \`ps\`), filesystem traversal beyond the project, or daemon-level debugging, you're in the right place — proceed.

## Project context

- Project name: ${project.name}
- Project ID: ${project.id}
- Game art bible: ${gameArtBibleId ?? 'none'}
- Current artifact: ${gameDesignDocState.currentArtifact ?? 'none'}
- Transcript message count when DESIGN.md was generated: ${transcriptCount}
- DESIGN.md generated at: ${generatedAt}

## Your task

<!-- TODO: describe what you want this session to do. -->
`;
}
