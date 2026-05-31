// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { RuleBasedPlaytestObserver } from '../observer/ruleObserver.js';
import { generatePlaytestReport } from '../reporter/reportGenerator.js';
import { ScriptedPlaytestRunner } from '../runner/scriptedRunner.js';
import type { PersonaRunTrace, PlaytestLoopRequest, PlaytestPersona, PlaytestReport, PlaytestRunner, PlayableArtifact } from '../types.js';

function normalizedConcurrency(requested: number | undefined, personaCount: number): number {
  if (personaCount <= 0) return 0;
  const fallback = Math.min(3, personaCount);
  if (requested === undefined) return fallback;
  return Math.max(1, Math.min(personaCount, Math.floor(requested)));
}

async function runPersonas(options: {
  artifact: PlayableArtifact;
  personas: PlaytestPersona[];
  durationMs: number;
  runner: PlaytestRunner;
  concurrency: number;
}): Promise<PersonaRunTrace[]> {
  const traces: PersonaRunTrace[] = new Array(options.personas.length);
  let nextIndex = 0;
  const workers = Array.from({ length: options.concurrency }, async () => {
    while (nextIndex < options.personas.length) {
      const index = nextIndex;
      nextIndex += 1;
      const persona = options.personas[index];
      if (!persona) continue;
      traces[index] = await options.runner.run({
        artifact: options.artifact,
        persona,
        durationMs: options.durationMs,
      });
    }
  });
  await Promise.all(workers);
  return traces;
}

export async function runPlaytestLoop(request: PlaytestLoopRequest): Promise<PlaytestReport> {
  if (request.personas.length === 0) throw new Error('At least one persona is required');
  const runner = request.runner ?? new ScriptedPlaytestRunner();
  const observer = request.observer ?? new RuleBasedPlaytestObserver();
  const traces = await runPersonas({
    artifact: request.artifact,
    personas: request.personas,
    durationMs: request.durationMs,
    runner,
    concurrency: normalizedConcurrency(request.concurrency, request.personas.length),
  });
  const issues = await observer.inspect(request.artifact, traces);
  return generatePlaytestReport({
    artifact: request.artifact,
    traces,
    issues,
    durationMs: request.durationMs,
    generatedAt: request.now?.() ?? Date.now(),
  });
}
