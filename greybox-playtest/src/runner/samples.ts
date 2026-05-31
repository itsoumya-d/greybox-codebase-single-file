// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import type { PlayableArtifact } from '../types.js';
import { createInstrumentedPlayableHtml } from './instrumentation.js';

export function createSeededPlatformerSample(): PlayableArtifact {
  const artifact: PlayableArtifact = {
    id: 'sample-2d-platformer',
    title: 'Greybox 2D Platformer Sample',
    engine: 'html-canvas',
    durationTargetMs: 10 * 60 * 1_000,
    contentIds: [
      'intro-room',
      'checkpoint-a',
      'upper-route',
      'secret-room',
      'boss-door',
      'exit-flag',
      'lore-cache',
    ],
    seededBugs: [
      {
        id: 'bug-invisible-spike-hitbox',
        label: 'Invisible spike hitbox clips the lower bridge',
        kind: 'collision',
        severity: 'high',
        targetId: 'lower-bridge',
        triggerAtMs: 91_000,
        detectorHints: ['unexpected death', 'no visible hazard', 'bridge'],
        suggestedFix: 'Move the spike collider below the bridge visual or add visible warning tiles.',
      },
      {
        id: 'bug-checkpoint-softlock',
        label: 'Checkpoint respawn can trap the player behind the boss door',
        kind: 'softlock',
        severity: 'critical',
        targetId: 'checkpoint-a',
        triggerAtMs: 214_000,
        detectorHints: ['respawn loop', 'closed door', 'no exit'],
        suggestedFix: 'Relocate checkpoint after the door trigger or reopen the door on respawn.',
      },
      {
        id: 'bug-hud-overlap',
        label: 'Low-health HUD overlaps the jump prompt',
        kind: 'readability',
        severity: 'medium',
        targetId: 'hud-low-health',
        triggerAtMs: 132_000,
        detectorHints: ['hud overlap', 'prompt unreadable', 'low health'],
        suggestedFix: 'Scale the low-health warning to 0.86 and reserve prompt-safe HUD space.',
      },
      {
        id: 'bug-boss-health-spike',
        label: 'Boss takes too many hits after the tutorial pacing',
        kind: 'balance',
        severity: 'medium',
        targetId: 'boss-captain',
        triggerAtMs: 430_000,
        detectorHints: ['damage sponge', 'long fight', 'repeated deaths'],
        suggestedFix: 'Reduce boss HP from 5 to 2 for the first playable slice.',
      },
    ],
  };
  return {
    ...artifact,
    html: createInstrumentedPlayableHtml(artifact),
  };
}
