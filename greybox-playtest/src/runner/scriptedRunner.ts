// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import type {
  PersonaRunTrace,
  PlaytestEvent,
  PlaytestRunRequest,
  PlaytestRunner,
  PlaytestPersona,
  SeededBug,
} from '../types.js';

function eventId(persona: PlaytestPersona, suffix: string): string {
  return `${persona.id}:${suffix}`;
}

function shouldEncounterBug(persona: PlaytestPersona, bug: SeededBug): boolean {
  if (bug.kind === 'softlock') return persona.tags.includes('softlock') || persona.thoroughness > 0.65;
  if (bug.kind === 'readability') return persona.tags.includes('readability') || persona.inputStyle === 'casual';
  if (bug.kind === 'balance') return persona.tags.includes('balance') || persona.riskTolerance > 0.7;
  if (bug.kind === 'collision') return persona.riskTolerance > 0.45 || persona.inputStyle === 'chaotic';
  return persona.thoroughness > 0.55;
}

function completionTimeFor(persona: PlaytestPersona, durationMs: number): number {
  const speedFactor = persona.id === 'speedrunner'
    ? 0.48
    : persona.inputStyle === 'completionist'
      ? 0.92
      : persona.inputStyle === 'exploratory'
        ? 0.84
        : 0.7;
  return Math.min(durationMs, Math.max(30_000, Math.floor(durationMs * speedFactor)));
}

export class ScriptedPlaytestRunner implements PlaytestRunner {
  async run({ artifact, persona, durationMs }: PlaytestRunRequest): Promise<PersonaRunTrace> {
    const events: PlaytestEvent[] = [
      {
        id: eventId(persona, 'started'),
        atMs: 0,
        type: 'run-started',
        message: `${persona.name} started ${artifact.title}.`,
      },
    ];
    let deaths = 0;
    let frustrationMoments = 0;
    const bugsObserved: string[] = [];
    const unusedContentIds = new Set<string>();
    const visibleContent = new Set<string>(['intro-room', 'checkpoint-a']);

    for (const bug of artifact.seededBugs) {
      if (!shouldEncounterBug(persona, bug)) continue;
      bugsObserved.push(bug.id);
      if (bug.kind === 'collision' || bug.kind === 'balance') deaths += bug.kind === 'balance' ? 2 : 1;
      if (bug.severity === 'high' || bug.severity === 'critical' || persona.patience < 0.5) {
        frustrationMoments += 1;
      }
      events.push({
        id: eventId(persona, bug.id),
        atMs: Math.min(durationMs - 1, bug.triggerAtMs),
        type: 'bug-signal',
        severity: bug.severity,
        targetId: bug.targetId,
        message: `${persona.name} encountered ${bug.label}.`,
        metadata: {
          bugId: bug.id,
          kind: bug.kind,
          hints: bug.detectorHints,
        },
      });
    }

    if (persona.thoroughness < 0.35) unusedContentIds.add('secret-room');
    if (persona.id === 'speedrunner' || persona.inputStyle === 'stealth') unusedContentIds.add('upper-route');
    if (persona.inputStyle !== 'completionist') unusedContentIds.add('lore-cache');
    for (const contentId of artifact.contentIds) {
      if (contentId.includes('secret') && persona.thoroughness >= 0.7) visibleContent.add(contentId);
      if (contentId === 'exit-flag' && persona.patience >= 0.35) visibleContent.add(contentId);
    }

    for (const contentId of unusedContentIds) {
      events.push({
        id: eventId(persona, `unused-${contentId}`),
        atMs: Math.min(durationMs - 1, Math.floor(durationMs * 0.8)),
        type: 'unused-content',
        targetId: contentId,
        message: `${persona.name} did not interact with ${contentId}.`,
      });
    }

    if (deaths > 0) {
      events.push({
        id: eventId(persona, 'deaths'),
        atMs: Math.min(durationMs - 1, Math.floor(durationMs * 0.45)),
        type: 'death',
        severity: deaths > 2 ? 'high' : 'medium',
        message: `${persona.name} died ${deaths} time(s).`,
        metadata: { count: deaths },
      });
    }
    if (frustrationMoments > 0) {
      events.push({
        id: eventId(persona, 'frustration'),
        atMs: Math.min(durationMs - 1, Math.floor(durationMs * 0.58)),
        type: 'frustration',
        severity: frustrationMoments > 1 ? 'high' : 'medium',
        message: `${persona.name} showed ${frustrationMoments} frustration moment(s).`,
        metadata: { count: frustrationMoments },
      });
    }

    const softlocked = bugsObserved.includes('bug-checkpoint-softlock');
    const recoversFromSoftlock = persona.thoroughness >= 0.82 || persona.inputStyle === 'completionist';
    const completed = persona.patience >= 0.35 && (!softlocked || recoversFromSoftlock);
    const completionTimeMs = completed ? completionTimeFor(persona, durationMs) : undefined;
    if (completed && completionTimeMs !== undefined) {
      events.push({
        id: eventId(persona, 'completion'),
        atMs: completionTimeMs,
        type: 'completion',
        targetId: 'exit-flag',
        message: `${persona.name} completed the slice.`,
      });
    }
    events.push({
      id: eventId(persona, 'ended'),
      atMs: durationMs,
      type: 'run-ended',
      message: `${persona.name} ended with ${visibleContent.size} content nodes seen.`,
      metadata: { visibleContent: [...visibleContent] },
    });

    return {
      artifactId: artifact.id,
      persona,
      durationMs,
      completed,
      events: events.sort((a, b) => a.atMs - b.atMs),
      metrics: {
        inputs: Math.floor(durationMs / 900) + Math.floor(persona.riskTolerance * 80),
        deaths,
        frustrationMoments,
        ...(completionTimeMs !== undefined ? { completionTimeMs } : {}),
        unusedContentIds: [...unusedContentIds],
        bugsObserved,
      },
    };
  }
}
