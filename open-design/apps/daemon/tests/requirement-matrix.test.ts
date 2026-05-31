import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');
const matrixPath = path.join(repoRoot, 'docs/game-design-requirement-matrix.md');
const auditPath = path.join(repoRoot, 'docs/game-design-transformation-audit.md');
const completionAuditPath = path.join(repoRoot, 'docs/game-design-completion-audit.md');
const tsxBin = path.join(repoRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');

function matrixRows(body: string): Array<{ number: number; area: string; evidence: string; status: string }> {
  return body
    .split(/\n/)
    .map((line) => {
      const match = line.match(/^\|\s*(\d+)\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|$/);
      if (!match) return null;
      return {
        number: Number(match[1]!),
        area: match[2]!.trim(),
        evidence: match[3]!.trim(),
        status: match[4]!.trim(),
      };
    })
    .filter((row): row is { number: number; area: string; evidence: string; status: string } => row !== null);
}

function hasConcreteEvidence(evidence: string): boolean {
  return /`[^`]+`|tests?\/|\.test\.|\.ts\b|\.tsx\b|\.md\b|\.json\b|pnpm|apps\/|packages\/|docs\/|skills\/|craft\/|templates\/|prompt-templates\//.test(evidence);
}

function matrixEvidencePaths(evidence: string): string[] {
  return [...evidence.matchAll(/`([^`]+)`/g)]
    .map((match) => match[1] ?? '')
    .filter((value) => /^(?:apps|packages|docs|skills|craft|templates|prompt-templates|game-art-bibles|e2e|tools|scripts)\/|^(?:README\.md|package\.json)$/.test(value));
}

describe('game design requirement matrix', () => {
  it('maps every numbered transformation requirement to evidence and current status', () => {
    const body = readFileSync(matrixPath, 'utf8');
    const rows = matrixRows(body);
    const numbers = rows.map((row) => row.number);

    expect(numbers).toEqual(Array.from({ length: 100 }, (_, index) => index + 1));
    expect(new Set(numbers).size).toBe(100);

    const weakRows = rows.filter((row) => row.evidence.length < 20 || row.status.length < 7);
    expect(weakRows).toEqual([]);

    const proseOnlyRows = rows.filter((row) => !hasConcreteEvidence(row.evidence));
    expect(proseOnlyRows).toEqual([]);

    const missingPathRows = rows.filter((row) => {
      return !matrixEvidencePaths(row.evidence).some((repositoryPath) =>
        existsSync(path.join(repoRoot, repositoryPath)),
      );
    });
    expect(missingPathRows).toEqual([]);
  });

  it('keeps known non-completion findings explicit instead of treating guard success as completion', () => {
    const body = readFileSync(matrixPath, 'utf8');
    const rows = matrixRows(body);
    const statusByNumber = new Map(rows.map((row) => [row.number, row.status]));

    for (const requirement of [27, 69, 98, 99]) {
      expect(statusByNumber.get(requirement)).toMatch(/\b(Partial|Not complete|not complete)\b/);
    }

    for (const finding of [
      'native-language review',
      'compact locale fallback inventory',
      'game-design-compatibility-manifest.md',
      'Final end-state claims remain not independently provable',
    ]) {
      expect(body).toContain(finding);
    }

    expect(body).not.toContain('compatibility alias removal are unresolved');
  });

  it('is linked from the transformation audit', () => {
    const audit = readFileSync(auditPath, 'utf8');
    expect(audit).toContain('game-design-requirement-matrix.md');
    expect(audit).toContain('game-design-completion-audit.md');
    expect(audit).toContain('maps all 100 numbered transformation requirements');
  });

  it('keeps a prompt-to-artifact completion audit with required gates', () => {
    const completionAudit = readFileSync(completionAuditPath, 'utf8');
    const matrix = readFileSync(matrixPath, 'utf8');

    for (const section of ['Objective Deliverables', 'Prompt-To-Artifact Checklist', 'Required Commands', 'Current Open Findings']) {
      expect(completionAudit).toContain(section);
    }

    for (const artifact of [
      'packages/contracts/src/game-studio.ts',
      'apps/web/tests/components/NewProjectPanel.test.tsx',
      'apps/web/tests/components/GameStudioDocumentEditor.render.test.tsx',
      'apps/daemon/tests/game-schema.test.ts',
      'apps/daemon/tests/prompt-templates.test.ts',
      'docs/game-design-compatibility-manifest.md',
    ]) {
      expect(completionAudit).toContain(artifact);
    }

    for (const command of [
      'pnpm completion:audit',
      'pnpm guard',
      'pnpm residual:language-audit',
      'pnpm i18n:fallback-audit',
      'pnpm typecheck',
      'tests/i18n-fallback-audit.test.ts',
      'tests/i18n/locales.test.ts',
      'tests/lib/parse-provenance.test.ts',
      'tests/lib/build-clipboard-prompt.test.ts',
      'pnpm --filter @ai-game-design-studio/daemon test',
      'pnpm --filter @ai-game-design-studio/web test',
      'pnpm --filter @ai-game-design-studio/contracts test',
      'pnpm --filter @ai-game-design-studio/tools-dev test',
      'pnpm --filter @ai-game-design-studio/tools-pack test',
      'pnpm --filter @ai-game-design-studio/e2e typecheck',
      'ui/game-studio-first-screen.test.ts',
      'ui/game-studio-documents.test.ts',
      'ui/game-template-render.test.ts',
      'ui/game-studio-collaboration.test.ts',
      'ui/game-studio-presence.test.ts',
      'ui/game-runtime-player-bot.test.ts',
      'pnpm tools-dev run web --namespace agds-smoke --daemon-port 17645 --web-port 17646',
      'git diff --check',
    ]) {
      expect(completionAudit).toContain(command);
    }

    expect(matrix).toContain('game-design-completion-audit.md');
  });

  it('runs the completion audit against concrete game-studio surface inventory', () => {
    const result = spawnSync(tsxBin, ['./scripts/game-design-completion-audit.ts'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: process.env,
      timeout: 30_000,
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/Agent inventory: 13 studio roles, 10 collaboration handoffs, 4 debate checkpoints/);
    expect(result.stdout).toMatch(/Surface inventory: \d+ skills, \d+ templates, \d+ image prompts, \d+ video prompts, \d+ art bibles/);
    expect(result.stdout).toMatch(/Media prompt inventory: 17 required image prompts and 20 required video prompts/);
    expect(result.stdout).toMatch(/Schema inventory: 20 required game entity types in contracts and daemon DB tables/);
    expect(result.stdout).toMatch(/Game token inventory: 22 required token families in contracts, prompt rules, and systems template/);
    expect(result.stdout).toMatch(/Evaluation inventory: 38 studio-grade axes with artifact lint enforcement/);
    expect(result.stdout).toMatch(/Onboarding inventory: 12 required game-brief prompts with retired app\/website onboarding copy blocked/);
    expect(result.stdout).toMatch(/Community\/modding inventory: skill, craft guide, memory schema, and evaluator axis verified/);
    expect(result.stdout).toMatch(/Difficulty-director inventory: skill, craft guide, memory schema, behavior-tree template, and evaluator axis verified/);
    expect(result.stdout).toMatch(/Companion\/party inventory: skill, craft guide, memory schema, narrative template, and evaluator axis verified/);
    expect(result.stdout).toMatch(/Dungeon\/raid inventory: skill, craft guide, memory schema, dungeon\/live-ops templates, and evaluator axis verified/);
    expect(result.stdout).toMatch(/Narrative-simulation inventory: skill, craft guide, memory schema, narrative template, and evaluator axis verified/);
    expect(result.stdout).toMatch(/Adaptive-scaling inventory: skill, craft guide, memory schema, systems template, prompt memory ids, and evaluator axis verified/);
  });
});
