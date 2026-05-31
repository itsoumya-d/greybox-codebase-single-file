import { describe, expect, it } from 'vitest';
import {
  GAME_STUDIO_PANELIST_ROLES,
  LEGACY_PANELIST_ROLES,
  PANELIST_ROLES,
  defaultCritiqueConfig,
  panelEventToSse,
  CRITIQUE_SSE_EVENT_NAMES,
  type PanelEvent,
} from '../src/critique';

describe('CritiqueSseEvent', () => {
  it('defaults to the game-studio review cast while preserving legacy parse roles', () => {
    const cfg = defaultCritiqueConfig();
    expect(cfg.cast).toEqual([...GAME_STUDIO_PANELIST_ROLES]);
    expect(PANELIST_ROLES).toEqual([
      ...GAME_STUDIO_PANELIST_ROLES,
      ...LEGACY_PANELIST_ROLES,
    ]);
    expect(cfg.weights['game-director']).toBe(0);
    expect(cfg.weights['gameplay-mechanics']).toBeGreaterThan(0);
    expect(cfg.weights['accessibility-design']).toBeGreaterThan(0);
    expect(cfg.weights['production-planning']).toBeGreaterThan(0);
    const gameStudioWeightTotal = GAME_STUDIO_PANELIST_ROLES.reduce((total, role) => total + (cfg.weights[role] ?? 0), 0);
    expect(gameStudioWeightTotal).toBeCloseTo(1, 5);
    expect(cfg.weights.critic).toBeGreaterThan(0);
  });

  it('panelEventToSse maps PanelEvent.type "run_started" to event "critique.run_started"', () => {
    const e: PanelEvent = {
      type: 'run_started', runId: 'r1', protocolVersion: 1,
      cast: ['game-director', 'gameplay-mechanics', 'art-direction', 'accessibility-design'],
      maxRounds: 3, threshold: 8, scale: 10,
    };
    const sse = panelEventToSse(e);
    expect(sse.event).toBe('critique.run_started');
    expect(sse.data).toMatchObject({
      runId: 'r1', protocolVersion: 1, maxRounds: 3, threshold: 8, scale: 10,
    });
    // No 'type' field on the SSE payload.
    expect((sse.data as Record<string, unknown>).type).toBeUndefined();
  });

  it('panelEventToSse round-trips every PanelEvent type', () => {
    const samples: PanelEvent[] = [
      { type: 'run_started', runId: 'r', protocolVersion: 1, cast: ['gameplay-mechanics'], maxRounds: 3, threshold: 8, scale: 10 },
      { type: 'panelist_open', runId: 'r', round: 1, role: 'game-director' },
      { type: 'panelist_dim', runId: 'r', round: 1, role: 'gameplay-mechanics', dimName: 'combat-readability', dimScore: 4, dimNote: '' },
      { type: 'panelist_must_fix', runId: 'r', round: 1, role: 'accessibility-design', text: '' },
      { type: 'panelist_close', runId: 'r', round: 1, role: 'gameplay-mechanics', score: 6 },
      { type: 'round_end', runId: 'r', round: 1, composite: 6, mustFix: 7, decision: 'continue', reason: '' },
      { type: 'ship', runId: 'r', round: 3, composite: 8.6, status: 'shipped', artifactRef: { projectId: 'p', artifactId: 'a' }, summary: '' },
      { type: 'degraded', runId: 'r', reason: 'malformed_block', adapter: 'pi-rpc' },
      { type: 'interrupted', runId: 'r', bestRound: 2, composite: 7.86 },
      { type: 'failed', runId: 'r', cause: 'cli_exit_nonzero' },
      { type: 'parser_warning', runId: 'r', kind: 'weak_debate', position: 0 },
    ];
    for (const e of samples) {
      const sse = panelEventToSse(e);
      expect(sse.event).toBe(`critique.${e.type}`);
    }
  });

  it('CRITIQUE_SSE_EVENT_NAMES contains all 11 critique.* names', () => {
    expect(CRITIQUE_SSE_EVENT_NAMES).toContain('critique.run_started');
    expect(CRITIQUE_SSE_EVENT_NAMES).toContain('critique.parser_warning');
    expect(CRITIQUE_SSE_EVENT_NAMES.length).toBe(11);
    // Each name has the 'critique.' prefix.
    for (const name of CRITIQUE_SSE_EVENT_NAMES) {
      expect(name.startsWith('critique.')).toBe(true);
    }
  });
});
