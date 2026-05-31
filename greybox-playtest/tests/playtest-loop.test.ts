// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';

import {
  createPersonaInputPlan,
  createPlaytestInstrumentationScript,
  createSeededPlatformerSample,
  applyUserStudyDecisions,
  buildPlaytestAdoptionReport,
  buildPlaytestBenchmarkReport,
  buildPlaytestBusinessModelProofExport,
  buildPlaytestQaSavingsReport,
  buildPlaytestRegressionReport,
  buildUserStudyAcceptanceReport,
  metricsFromPlaytestEvents,
  personasForAlpha,
  playtestAdoptionMarkdown,
  playtestBenchmarkMarkdown,
  playtestQaSavingsMarkdown,
  playtestRegressionMarkdown,
  playtestStudioIdFromExternal,
  recordHumanDecision,
  recordUserStudyDecision,
  reportMarkdown,
  runPlaytestLoop,
  usageRecordFromBenchmark,
  userStudyAcceptanceMarkdown,
  VisionAugmentedPlaytestObserver,
} from '../src/index.js';
import type {
  PersonaRunTrace,
  PlaytestEvent,
  PlaytestRegressionReport,
  PlaytestRunRequest,
  PlaytestRunner,
  PlaytestStudioUsageRecord,
} from '../src/index.js';

type InstrumentedBrowserEvent = {
  id: string;
  atMs: number;
  type: string;
  targetId?: string;
  metadata?: { bugId?: string; instrumented?: boolean };
};

function runInstrumentedBrowserPersona(personaId: string): InstrumentedBrowserEvent[] {
  const artifact = createSeededPlatformerSample();
  const logs: string[] = [];
  const timers: Array<{ delay: number; callback: () => void }> = [];
  const listeners = new Map<string, Array<(event: { detail?: Record<string, unknown> }) => void>>();
  const sandbox = {
    console: {
      log(value: string) {
        logs.push(value);
      },
    },
    setTimeout(callback: () => void, delay: number) {
      timers.push({ callback, delay });
      return timers.length;
    },
    window: {
      __GREYBOX_PLAYTEST_INSTRUMENTED__: false,
      addEventListener(name: string, listener: (event: { detail?: Record<string, unknown> }) => void) {
        const list = listeners.get(name) ?? [];
        list.push(listener);
        listeners.set(name, list);
      },
    },
  };
  vm.runInNewContext(createPlaytestInstrumentationScript(artifact), sandbox);
  assert.equal(sandbox.window.__GREYBOX_PLAYTEST_INSTRUMENTED__, true);

  for (const listener of listeners.get('greybox:playtest:start') ?? []) {
    listener({ detail: { personaId, runDurationMs: 10 * 60 * 1_000, timeScale: 1_000 } });
  }
  timers.sort((a, b) => a.delay - b.delay).forEach((timer) => timer.callback());

  return logs
    .filter((line) => line.startsWith('greybox:playtest:event '))
    .map((line) => JSON.parse(line.slice('greybox:playtest:event '.length)) as InstrumentedBrowserEvent);
}

test('alpha persona set covers the promised playtest archetypes', () => {
  const personas = personasForAlpha();
  assert.equal(personas.length, 10);
  assert.deepEqual(
    personas.map((persona) => persona.id),
    [
      'speedrunner',
      'completionist',
      'casual',
      'rage-quitter',
      'explorer',
      'lore-hunter',
      'optimizer',
      'button-masher',
      'stealth-only',
      'achievement-chaser',
    ],
  );
});

test('five personas complete a ten-minute seeded 2D platformer run', async () => {
  const report = await runPlaytestLoop({
    artifact: createSeededPlatformerSample(),
    personas: personasForAlpha(),
    durationMs: 10 * 60 * 1_000,
    now: () => 1_800_000_000_000,
  });

  assert.equal(report.personasRun, 10);
  assert.ok(report.completedRuns >= 5);
  assert.ok(report.runs.every((run) => run.durationMs === 10 * 60 * 1_000));
});

test('playtest loop runs personas with bounded parallelism', async () => {
  class TrackingRunner implements PlaytestRunner {
    inFlight = 0;
    maxInFlight = 0;

    async run(request: PlaytestRunRequest): Promise<PersonaRunTrace> {
      this.inFlight += 1;
      this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      this.inFlight -= 1;
      return {
        artifactId: request.artifact.id,
        persona: request.persona,
        durationMs: request.durationMs,
        completed: true,
        events: [],
        metrics: {
          inputs: 0,
          deaths: 0,
          frustrationMoments: 0,
          completionTimeMs: request.durationMs,
          unusedContentIds: [],
          bugsObserved: [],
        },
      };
    }
  }

  const runner = new TrackingRunner();
  const report = await runPlaytestLoop({
    artifact: createSeededPlatformerSample(),
    personas: personasForAlpha(),
    durationMs: 60_000,
    runner,
    concurrency: 4,
  });

  assert.equal(report.personasRun, 10);
  assert.equal(runner.maxInFlight, 4);
  assert.deepEqual(report.runs.map((run) => run.persona.id), personasForAlpha().map((persona) => persona.id));
});

test('chromium runner creates persona-specific input replay plans', () => {
  const personas = personasForAlpha();
  const speedrunner = personas.find((persona) => persona.id === 'speedrunner');
  const stealth = personas.find((persona) => persona.id === 'stealth-only');
  const casual = personas.find((persona) => persona.id === 'casual');
  assert.ok(speedrunner);
  assert.ok(stealth);
  assert.ok(casual);

  const speedPlan = createPersonaInputPlan(speedrunner, 5_000, 1_000);
  assert.deepEqual(speedPlan.filter((action) => action.type === 'key').map((action) => action.key).slice(0, 4), [
    'ArrowRight',
    'ShiftLeft',
    'Space',
    'KeyJ',
  ]);

  const stealthPlan = createPersonaInputPlan(stealth, 4_000, 1_000);
  assert.equal(stealthPlan[0]?.key, 'ArrowDown');

  const casualPlan = createPersonaInputPlan(casual, 7_000, 1_000);
  assert.ok(casualPlan.some((action) => action.type === 'click' && action.x === 420));
  assert.ok(casualPlan.every((action) => action.atMs >= 0 && action.atMs < 7_000));
});

test('chromium event metrics preserve aggregate death and frustration counts', () => {
  const events: PlaytestEvent[] = [
    { id: 'run', atMs: 0, type: 'run-started', message: 'started' },
    { id: 'input', atMs: 100, type: 'input', message: 'jumped' },
    { id: 'death', atMs: 500, type: 'death', message: 'died repeatedly', metadata: { count: 3 } },
    { id: 'frustration', atMs: 800, type: 'frustration', message: 'frustrated', metadata: { count: 2 } },
    { id: 'bug', atMs: 900, type: 'bug-signal', message: 'bug', metadata: { bugId: 'bug-boss-health-spike' } },
    { id: 'unused', atMs: 1_200, type: 'unused-content', targetId: 'secret-room', message: 'skipped' },
    { id: 'complete', atMs: 9_000, type: 'completion', message: 'complete' },
    { id: 'complete-early', atMs: 7_000, type: 'completion', message: 'earlier duplicate completion' },
  ];

  const metrics = metricsFromPlaytestEvents(events);

  assert.equal(metrics.inputs, 1);
  assert.equal(metrics.deaths, 3);
  assert.equal(metrics.frustrationMoments, 2);
  assert.equal(metrics.completionTimeMs, 7_000);
  assert.deepEqual(metrics.bugsObserved, ['bug-boss-health-spike']);
  assert.deepEqual(metrics.unusedContentIds, ['secret-room']);
});

test('seeded sample ships browser instrumentation for Chromium playtest evidence', () => {
  const artifact = createSeededPlatformerSample();
  assert.match(artifact.html ?? '', /greybox:playtest:event/u);
  assert.match(artifact.html ?? '', /<meta name="generator" content="Greybox \+ human designer">/u);

  const logs: string[] = [];
  const timers: Array<{ delay: number; callback: () => void }> = [];
  const listeners = new Map<string, Array<(event: { detail?: Record<string, unknown> }) => void>>();
  const sandbox = {
    console: {
      log(value: string) {
        logs.push(value);
      },
    },
    setTimeout(callback: () => void, delay: number) {
      timers.push({ callback, delay });
      return timers.length;
    },
    window: {
      __GREYBOX_PLAYTEST_INSTRUMENTED__: false,
      addEventListener(name: string, listener: (event: { detail?: Record<string, unknown> }) => void) {
        const list = listeners.get(name) ?? [];
        list.push(listener);
        listeners.set(name, list);
      },
    },
  };
  vm.runInNewContext(createPlaytestInstrumentationScript(artifact), sandbox);
  assert.equal(sandbox.window.__GREYBOX_PLAYTEST_INSTRUMENTED__, true);

  for (const listener of listeners.get('greybox:playtest:start') ?? []) {
    listener({ detail: { personaId: 'completionist', runDurationMs: 10 * 60 * 1_000, timeScale: 1_000 } });
  }
  timers.sort((a, b) => a.delay - b.delay).forEach((timer) => timer.callback());

  const events = logs
    .filter((line) => line.startsWith('greybox:playtest:event '))
    .map((line) => JSON.parse(line.slice('greybox:playtest:event '.length)) as { type: string; metadata?: { bugId?: string }; atMs: number });
  assert.ok(events.some((event) => event.type === 'run-started'));
  assert.ok(events.some((event) => event.type === 'completion' && event.atMs >= 30_000));
  assert.ok(events.some((event) => event.type === 'run-ended' && event.atMs === 10 * 60 * 1_000));
  const bugIds = new Set(events
    .filter((event) => event.type === 'bug-signal')
    .map((event) => event.metadata?.bugId));
  assert.ok(bugIds.has('bug-checkpoint-softlock'));
  assert.ok(bugIds.has('bug-hud-overlap'));
});

test('browser instrumentation completes five archetypes and surfaces seeded bugs', () => {
  const personaIds = ['speedrunner', 'completionist', 'casual', 'explorer', 'achievement-chaser'];
  const runs = personaIds.map((personaId) => ({
    personaId,
    events: runInstrumentedBrowserPersona(personaId),
  }));

  for (const run of runs) {
    const completion = run.events.find((event) => event.type === 'completion');
    const ended = run.events.find((event) => event.type === 'run-ended');
    assert.ok(completion, `${run.personaId} should complete the instrumented slice`);
    assert.ok(ended, `${run.personaId} should end the instrumented slice`);
    assert.ok(completion.atMs >= 30_000 && completion.atMs <= 10 * 60 * 1_000);
    assert.equal(ended.atMs, 10 * 60 * 1_000);
    assert.equal(ended.metadata?.instrumented, true);
  }

  const bugIds = new Set(runs.flatMap((run) => run.events
    .filter((event) => event.type === 'bug-signal')
    .map((event) => event.metadata?.bugId)
    .filter((bugId): bugId is string => Boolean(bugId))));
  assert.ok(bugIds.size >= 3);
  assert.ok(bugIds.has('bug-invisible-spike-hitbox'));
  assert.ok(bugIds.has('bug-checkpoint-softlock'));
  assert.ok(bugIds.has('bug-hud-overlap'));
});

test('reports at least three seeded bugs and proposes tuner diffs', async () => {
  const report = await runPlaytestLoop({
    artifact: createSeededPlatformerSample(),
    personas: personasForAlpha(),
    durationMs: 10 * 60 * 1_000,
    now: () => 1_800_000_000_000,
  });

  const seededIssueIds = report.issues
    .map((issue) => issue.bugId)
    .filter((bugId): bugId is string => Boolean(bugId));
  assert.ok(new Set(seededIssueIds).size >= 3);
  assert.ok(report.suggestions.some((suggestion) => suggestion.kind === 'hud-scale'));
  assert.ok(report.suggestions.some((suggestion) => suggestion.kind === 'enemy-hp'));
  const markdown = reportMarkdown(report);
  assert.ok(markdown.includes('Persona Runs'));
  assert.ok(markdown.includes('Unused Content'));
  assert.ok(markdown.includes('completed in'));
  assert.ok(markdown.includes('deaths'));
  assert.ok(markdown.includes('Tuner Suggestions'));
});

test('report markdown redacts PII from artifact titles and issue evidence', async () => {
  const sample = createSeededPlatformerSample();
  const report = await runPlaytestLoop({
    artifact: {
      ...sample,
      title: 'QA qa@example.com +1 (555) 123-4567 10.0.0.42 sk_live_playtest_secret Bearer playtest-admin-0123456789abcdef 4242 4242 4242 4242 pi_live_report',
      seededBugs: sample.seededBugs.map((bug) => bug.id === 'bug-invisible-spike-hitbox'
        ? {
          ...bug,
          label: 'Invisible spike reported by qa@example.com +1 (555) 123-4567 from 10.0.0.42 using sk_live_bug_secret and Bearer eyJhbGciOiJIUzI1NiJ9.playtesttoken123456',
        }
        : bug),
    },
    personas: personasForAlpha().filter((persona) => persona.id === 'speedrunner'),
    durationMs: 10 * 60 * 1_000,
    now: () => 1_800_000_000_000,
  });

  const markdown = reportMarkdown(report);
  assert.doesNotMatch(markdown, /qa@example\.com|\+1 \(555\) 123-4567|10\.0\.0\.42|sk_live_playtest_secret|playtest-admin-0123456789abcdef|sk_live_bug_secret|eyJhbGciOiJIUzI1NiJ9|4242 4242|pi_live_report/u);
  assert.match(markdown, /\[redacted-email\]/u);
  assert.match(markdown, /\[redacted-phone\]/u);
  assert.match(markdown, /\[redacted-ip\]/u);
  assert.match(markdown, /\[redacted-secret\]/u);
  assert.match(markdown, /\[redacted-card\]/u);
  assert.match(markdown, /\[redacted-stripe-id\]/u);
});

test('vision observer dedupes model findings and redacts unsafe evidence', async () => {
  const artifact = createSeededPlatformerSample();
  const observer = new VisionAugmentedPlaytestObserver({
    provider: {
      inspect: () => [
        {
          id: 'hud-overlap-frame',
          frame: {
            id: 'frame-hud-001',
            artifactId: artifact.id,
            personaId: 'casual',
            atMs: 132_000,
            source: 'screenshot',
            imageSha256: 'a'.repeat(64),
          },
          bugId: 'bug-hud-overlap',
          targetId: 'hud-low-health',
          title: 'Low-health HUD overlaps the jump prompt',
          description: 'Vision model saw prompt text hidden by the low-health banner. Contact qa@example.com with sk_live_vision_secret for raw notes.',
          severity: 'high',
          confidence: 0.93,
          evidence: ['Screenshot also exposed tester phone +1 (555) 123-4567, lab IP 10.0.0.42, card 4242 4242 4242 4242, and pi_live_vision.'],
        },
        {
          id: 'low-confidence-noise',
          frame: {
            id: 'frame-noise-001',
            artifactId: artifact.id,
            personaId: 'explorer',
            atMs: 80_000,
            source: 'screenshot',
          },
          title: 'Maybe a background tile is odd',
          description: 'Low-confidence cosmetic observation.',
          severity: 'low',
          confidence: 0.2,
          kind: 'friction',
          evidence: ['This should not enter the report.'],
        },
      ],
    },
  });

  const report = await runPlaytestLoop({
    artifact,
    personas: personasForAlpha(),
    durationMs: 10 * 60 * 1_000,
    observer,
    now: () => 1_800_000_000_000,
  });

  const hudIssue = report.issues.find((issue) => issue.bugId === 'bug-hud-overlap');
  assert.ok(hudIssue);
  assert.equal(hudIssue.severity, 'high');
  assert.ok(hudIssue.affectedPersonas.includes('casual'));
  assert.ok(hudIssue.evidence.some((item) => item.includes('Vision frame frame-hud-001 at 132000ms')));
  assert.doesNotMatch(JSON.stringify(hudIssue), /qa@example\.com|\+1 \(555\) 123-4567|10\.0\.0\.42|sk_live_vision_secret|4242 4242|pi_live_vision/u);
  assert.match(JSON.stringify(hudIssue), /\[redacted-email\]/u);
  assert.match(JSON.stringify(hudIssue), /\[redacted-phone\]/u);
  assert.match(JSON.stringify(hudIssue), /\[redacted-ip\]/u);
  assert.match(JSON.stringify(hudIssue), /\[redacted-secret\]/u);
  assert.match(JSON.stringify(hudIssue), /\[redacted-card\]/u);
  assert.match(JSON.stringify(hudIssue), /\[redacted-stripe-id\]/u);
  assert.equal(report.issues.some((issue) => issue.id === 'vision-low-confidence-noise'), false);
});

test('vision observer sanitizes model-controlled identifiers before reports', async () => {
  const artifact = createSeededPlatformerSample();
  const observer = new VisionAugmentedPlaytestObserver({
    baseline: { inspect: () => [] },
    provider: {
      inspect: () => [
        {
          id: 'qa@example.com sk_live_observation_secret pi_live_observation',
          frame: {
            id: 'frame qa@example.com +1 (555) 123-4567 10.0.0.42',
            artifactId: artifact.id,
            personaId: 'qa@example.com 10.0.0.42',
            atMs: 42_000,
            source: 'screenshot',
          },
          bugId: 'unknown-bug-from qa@example.com',
          targetId: 'hud qa@example.com 10.0.0.42',
          title: 'Finding for qa@example.com with sk_live_title_secret and pi_live_title',
          description: 'Vision notes are clean enough after redaction.',
          severity: 'medium',
          confidence: 0.9,
          kind: 'readability',
          evidence: [],
        },
      ],
    },
  });

  const issues = await observer.inspect(artifact, []);
  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.bugId, undefined);
  assert.match(issues[0]?.id ?? '', /^vision-[a-f0-9]{16}$/u);
  assert.match(issues[0]?.affectedPersonas[0] ?? '', /^vision-persona-[a-f0-9]{12}$/u);
  assert.doesNotMatch(JSON.stringify(issues[0]), /qa@example\.com|10\.0\.0\.42|sk_live_|pi_live_|\+1 \(555\) 123-4567/u);
  assert.match(JSON.stringify(issues[0]), /\[redacted-email\]/u);
  assert.match(JSON.stringify(issues[0]), /\[redacted-ip\]/u);
  assert.match(JSON.stringify(issues[0]), /\[redacted-secret\]/u);
});

test('records human accept or reject decisions on tuner suggestions', async () => {
  const report = await runPlaytestLoop({
    artifact: createSeededPlatformerSample(),
    personas: personasForAlpha(),
    durationMs: 10 * 60 * 1_000,
    now: () => 1_800_000_000_000,
  });
  const suggestion = report.suggestions[0];
  assert.ok(suggestion);
  const decided = recordHumanDecision(report, suggestion.id, 'accepted', 'designer-1', 1_800_000_100_000);
  assert.equal(decided.suggestions[0]?.status, 'accepted');
  assert.equal(decided.suggestions[0]?.decidedBy, 'designer-1');
});

test('builds privacy-preserving human playtester acceptance evidence', async () => {
  const report = await runPlaytestLoop({
    artifact: createSeededPlatformerSample(),
    personas: personasForAlpha(),
    durationMs: 10 * 60 * 1_000,
    now: () => 1_800_000_000_000,
  });
  const suggestion = report.suggestions.find((item) => item.kind === 'enemy-hp') ?? report.suggestions[0];
  assert.ok(suggestion);

  const decision = recordUserStudyDecision(report, {
    studyId: 'platformer-alpha-study-01',
    suggestionId: suggestion.id,
    participantExternalId: 'human.playtester@example.com',
    participantRole: 'human-playtester',
    decision: 'accepted',
    decidedAt: 1_800_000_200_000,
    consentConfirmed: true,
    notes: 'Accepted after replay; contact human.playtester@example.com or +1 (555) 123-4567 from 10.0.0.42 with sk_live_study_secret, Bearer study-admin-0123456789abcdef, and pi_live_study.',
  });
  assert.equal(decision.participantRole, 'human-playtester');
  assert.match(decision.participantHash, /^[a-f0-9]{64}$/u);
  assert.match(decision.suggestionDiffSha256, /^[a-f0-9]{64}$/u);
  assert.doesNotMatch(JSON.stringify(decision), /human\.playtester@example\.com|\+1 \(555\) 123-4567|10\.0\.0\.42|sk_live_study_secret|study-admin-0123456789abcdef|pi_live_study/u);
  assert.match(decision.notes ?? '', /\[redacted-email\]/u);
  assert.match(decision.notes ?? '', /\[redacted-phone\]/u);
  assert.match(decision.notes ?? '', /\[redacted-ip\]/u);
  assert.match(decision.notes ?? '', /\[redacted-secret\]/u);
  assert.match(decision.notes ?? '', /\[redacted-stripe-id\]/u);

  const acceptance = buildUserStudyAcceptanceReport({
    report,
    studyId: 'platformer-alpha-study-01',
    decisions: [decision],
    generatedAt: 1_800_000_300_000,
  });
  assert.equal(acceptance.summary.acceptedByHumanPlaytester, 1);
  assert.equal(acceptance.summary.targetMet, true);
  assert.deepEqual(acceptance.acceptedSuggestionIds, [suggestion.id]);
  assert.match(userStudyAcceptanceMarkdown(acceptance), /Target met: yes/u);

  const decidedReport = applyUserStudyDecisions(report, [decision]);
  const decidedSuggestion = decidedReport.suggestions.find((item) => item.id === suggestion.id);
  assert.equal(decidedSuggestion?.status, 'accepted');
  assert.match(decidedSuggestion?.decidedBy ?? '', /^participant:[a-f0-9]{12}$/u);
});

test('user-study decisions require explicit consent', async () => {
  const report = await runPlaytestLoop({
    artifact: createSeededPlatformerSample(),
    personas: personasForAlpha(),
    durationMs: 60_000,
    now: () => 1_800_000_000_000,
  });
  const suggestion = report.suggestions[0];
  assert.ok(suggestion);
  assert.throws(() => recordUserStudyDecision(report, {
    studyId: 'platformer-alpha-study-01',
    suggestionId: suggestion.id,
    participantExternalId: 'participant-1',
    participantRole: 'human-playtester',
    decision: 'accepted',
    decidedAt: 1_800_000_200_000,
    consentConfirmed: false,
  }), /explicit participant consent/u);
});

test('benchmark readiness packet proves alpha playtest target without leaking PII', async () => {
  const report = await runPlaytestLoop({
    artifact: createSeededPlatformerSample(),
    personas: personasForAlpha(),
    durationMs: 10 * 60 * 1_000,
    now: () => 1_800_000_000_000,
  });
  const suggestion = report.suggestions.find((item) => item.kind === 'enemy-hp') ?? report.suggestions[0];
  assert.ok(suggestion);
  const decision = recordUserStudyDecision(report, {
    studyId: 'platformer-alpha-study-01',
    suggestionId: suggestion.id,
    participantExternalId: 'human.playtester@example.com',
    participantRole: 'human-playtester',
    decision: 'accepted',
    decidedAt: 1_800_000_200_000,
    consentConfirmed: true,
    notes: 'Accepted after replay; contact human.playtester@example.com or +1 (555) 123-4567.',
  });
  const acceptance = buildUserStudyAcceptanceReport({
    report,
    studyId: 'platformer-alpha-study-01',
    decisions: [decision],
    generatedAt: 1_800_000_300_000,
  });

  const benchmark = buildPlaytestBenchmarkReport({
    report,
    acceptanceReport: acceptance,
    generatedAt: 1_800_000_400_000,
  });

  assert.equal(benchmark.ready, true);
  assert.equal(benchmark.summary.targetMet, true);
  assert.equal(benchmark.summary.personasRun, 10);
  assert.ok(benchmark.summary.completedRuns >= 5);
  assert.ok(benchmark.summary.seededBugsIdentified >= 3);
  assert.equal(benchmark.summary.humanAcceptedSuggestions, 1);
  assert.deepEqual(benchmark.checks.map((check) => check.status), ['pass', 'pass', 'pass', 'pass', 'pass']);
  assert.deepEqual(benchmark.issues, []);
  assert.match(playtestBenchmarkMarkdown(benchmark), /Ready: yes/u);
  const serialized = JSON.stringify(benchmark);
  assert.doesNotMatch(serialized, /human\.playtester@example\.com|\+1 \(555\) 123-4567/u);
});

test('playtest adoption report tracks paying studio usage without leaking external ids', async () => {
  const report = await runPlaytestLoop({
    artifact: createSeededPlatformerSample(),
    personas: personasForAlpha(),
    durationMs: 10 * 60 * 1_000,
    now: () => Date.UTC(2026, 4, 18),
  });
  const suggestion = report.suggestions.find((item) => item.kind === 'enemy-hp') ?? report.suggestions[0];
  assert.ok(suggestion);
  const decision = recordUserStudyDecision(report, {
    studyId: 'platformer-adoption-study-01',
    suggestionId: suggestion.id,
    participantExternalId: 'human.playtester@example.com',
    participantRole: 'human-playtester',
    decision: 'accepted',
    decidedAt: Date.UTC(2026, 4, 18, 1),
    consentConfirmed: true,
  });
  const benchmark = buildPlaytestBenchmarkReport({
    report,
    acceptanceReport: buildUserStudyAcceptanceReport({
      report,
      studyId: 'platformer-adoption-study-01',
      decisions: [decision],
      generatedAt: Date.UTC(2026, 4, 18, 2),
    }),
    generatedAt: Date.UTC(2026, 4, 18, 3),
  });

  const paidRecord = usageRecordFromBenchmark({
    benchmark,
    studioExternalId: 'qa-director@example.com',
    plan: 'studio',
    billed: true,
  });
  const freeRecord = usageRecordFromBenchmark({
    benchmark,
    studioId: 'studio_design_partner_01',
    plan: 'free',
    billed: false,
    runAt: Date.UTC(2026, 4, 18, 4),
  });
  const adoption = buildPlaytestAdoptionReport([paidRecord, freeRecord], {
    generatedAt: Date.UTC(2026, 4, 18, 5),
    targets: {
      activeStudios: 2,
      payingStudios: 1,
      reports: 2,
      acceptedSuggestionStudios: 1,
      minReportsPerPayingStudio: 1,
    },
  });

  assert.equal(adoption.readyForProductionProof, true);
  assert.equal(adoption.period.label, '2026-05');
  assert.equal(adoption.summary.activeStudios, 2);
  assert.equal(adoption.summary.payingStudios, 1);
  assert.equal(adoption.summary.reports, 2);
  assert.equal(adoption.summary.acceptedSuggestionStudios, 2);
  assert.deepEqual(adoption.shortfalls, []);
  assert.equal(paidRecord.studioId, playtestStudioIdFromExternal('qa-director@example.com'));
  const adoptionMarkdown = playtestAdoptionMarkdown(adoption);
  assert.match(adoptionMarkdown, /Ready: yes/u);
  assert.match(adoptionMarkdown, /Studio 01/u);
  assert.doesNotMatch(adoptionMarkdown, /studio_design_partner_01|studio_[a-f0-9]{16}/u);

  const weakAdoption = buildPlaytestAdoptionReport([paidRecord], {
    generatedAt: Date.UTC(2026, 4, 18, 5),
    targets: {
      activeStudios: 2,
      payingStudios: 2,
      reports: 2,
      acceptedSuggestionStudios: 2,
      minReportsPerPayingStudio: 2,
    },
  });
  assert.equal(weakAdoption.readyForProductionProof, false);
  assert.deepEqual(weakAdoption.shortfalls.map((shortfall) => shortfall.code).sort(), [
    'accepted_suggestion_studio_shortfall',
    'active_studio_shortfall',
    'paying_studio_shortfall',
    'paying_studio_usage_shortfall',
    'report_shortfall',
  ]);
  const serialized = JSON.stringify({ adoption, weakAdoption });
  assert.doesNotMatch(serialized, /qa-director@example\.com|human\.playtester@example\.com/u);
});

test('playtest adoption report fails closed on unsafe source identifiers', () => {
  const adoption = buildPlaytestAdoptionReport([{
    id: 'usage-unsafe-adoption',
    studioId: 'qa-director@example.com',
    plan: 'studio',
    reportId: 'report-unsafe-adoption',
    artifactId: 'artifact-unsafe-adoption',
    artifactTitle: 'Unsafe Adoption Proof',
    runAt: Date.UTC(2026, 4, 18),
    billed: true,
    personasRun: 10,
    completedRuns: 8,
    seededBugsIdentified: 3,
    tuningSuggestions: 2,
    acceptedSuggestions: 1,
  }], {
    generatedAt: Date.UTC(2026, 4, 18, 1),
    targets: {
      activeStudios: 1,
      payingStudios: 1,
      reports: 1,
      acceptedSuggestionStudios: 1,
      minReportsPerPayingStudio: 1,
    },
  });

  assert.equal(adoption.readyForProductionProof, false);
  assert.deepEqual(adoption.shortfalls.map((shortfall) => shortfall.code), ['pii_evidence_leak']);
  const markdown = playtestAdoptionMarkdown(adoption);
  assert.match(markdown, /pii_evidence_leak/u);
  assert.doesNotMatch(markdown, /qa-director@example\.com/u);
});

test('playtest production proof excludes unpaid trials from paying and QA savings counts', () => {
  const records: PlaytestStudioUsageRecord[] = [
    {
      id: 'usage-paid-studio',
      studioId: 'studio_paid_01',
      plan: 'studio',
      reportId: 'report-paid',
      artifactId: 'artifact-1',
      artifactTitle: 'Paid Studio Proof',
      runAt: Date.UTC(2026, 4, 18),
      billed: true,
      personasRun: 10,
      completedRuns: 7,
      seededBugsIdentified: 3,
      tuningSuggestions: 2,
      acceptedSuggestions: 1,
    },
    {
      id: 'usage-trial-studio',
      studioId: 'studio_trial_01',
      plan: 'enterprise',
      reportId: 'report-trial',
      artifactId: 'artifact-2',
      artifactTitle: 'Unpaid Trial Proof',
      runAt: Date.UTC(2026, 4, 18, 1),
      billed: false,
      personasRun: 40,
      completedRuns: 35,
      seededBugsIdentified: 10,
      tuningSuggestions: 8,
      acceptedSuggestions: 4,
    },
  ];

  const adoption = buildPlaytestAdoptionReport(records, {
    generatedAt: Date.UTC(2026, 4, 18, 2),
    targets: {
      activeStudios: 2,
      payingStudios: 2,
      reports: 2,
      acceptedSuggestionStudios: 2,
      minReportsPerPayingStudio: 1,
    },
  });
  assert.equal(adoption.summary.activeStudios, 2);
  assert.equal(adoption.summary.payingStudios, 1);
  assert.deepEqual(adoption.shortfalls.map((shortfall) => shortfall.code), ['paying_studio_shortfall']);

  const savings = buildPlaytestQaSavingsReport(records, {
    generatedAt: Date.UTC(2026, 4, 18, 2),
    targets: {
      annualQaBudgetCents: 1,
      targetReplacementBps: 0,
      minimumPayingStudios: 2,
      minimumReports: 2,
      minimumAcceptedSuggestionStudios: 2,
    },
  });
  assert.equal(savings.summary.payingStudios, 1);
  assert.equal(savings.summary.reports, 1);
  assert.equal(savings.summary.personasRun, 10);
  assert.equal(savings.summary.seededBugsIdentified, 3);
  assert.equal(savings.summary.acceptedSuggestions, 1);
  assert.deepEqual(savings.shortfalls.map((shortfall) => shortfall.code).sort(), [
    'accepted_suggestion_studio_shortfall',
    'paying_studio_shortfall',
    'report_shortfall',
  ]);
});

test('QA savings report estimates conservative budget replacement without leaking studio ids', async () => {
  const report = await runPlaytestLoop({
    artifact: createSeededPlatformerSample(),
    personas: personasForAlpha(),
    durationMs: 10 * 60 * 1_000,
    now: () => Date.UTC(2026, 4, 18),
  });
  const suggestion = report.suggestions.find((item) => item.kind === 'enemy-hp') ?? report.suggestions[0];
  assert.ok(suggestion);
  const decision = recordUserStudyDecision(report, {
    studyId: 'platformer-qa-savings-study-01',
    suggestionId: suggestion.id,
    participantExternalId: 'human.playtester@example.com',
    participantRole: 'human-playtester',
    decision: 'accepted',
    decidedAt: Date.UTC(2026, 4, 18, 1),
    consentConfirmed: true,
  });
  const benchmark = buildPlaytestBenchmarkReport({
    report,
    acceptanceReport: buildUserStudyAcceptanceReport({
      report,
      studyId: 'platformer-qa-savings-study-01',
      decisions: [decision],
      generatedAt: Date.UTC(2026, 4, 18, 2),
    }),
    generatedAt: Date.UTC(2026, 4, 18, 3),
  });
  const records = [
    usageRecordFromBenchmark({
      benchmark,
      studioExternalId: 'qa-director@example.com',
      plan: 'studio',
      billed: true,
      runAt: Date.UTC(2026, 4, 18, 4),
    }),
    usageRecordFromBenchmark({
      benchmark,
      studioExternalId: 'lead-producer@example.com',
      plan: 'enterprise',
      billed: true,
      runAt: Date.UTC(2026, 4, 18, 5),
    }),
  ];

  const savings = buildPlaytestQaSavingsReport(records, {
    generatedAt: Date.UTC(2026, 4, 18, 6),
    targets: {
      annualQaBudgetCents: 1_000_000,
      targetReplacementBps: 3_000,
      minimumPayingStudios: 2,
      minimumReports: 2,
      minimumAcceptedSuggestionStudios: 2,
    },
  });

  assert.equal(savings.readyForQaBudgetProof, true);
  assert.equal(savings.period.label, '2026-05');
  assert.equal(savings.summary.payingStudios, 2);
  assert.equal(savings.summary.reports, 2);
  assert.equal(savings.summary.acceptedSuggestionStudios, 2);
  assert.ok(savings.summary.replacementBps >= 3_000);
  assert.deepEqual(savings.shortfalls, []);
  assert.match(playtestQaSavingsMarkdown(savings), /QA budget replacement/u);
  const serialized = JSON.stringify(savings);
  assert.doesNotMatch(serialized, /qa-director@example\.com|lead-producer@example\.com|human\.playtester@example\.com/u);
});

function playtestProofRecords(acceptedSuggestionStudios = 24): PlaytestStudioUsageRecord[] {
  return Array.from({ length: 100 }, (_, index) => ({
    id: `usage-paid-${index}`,
    studioId: `studio_paid_${index}`,
    plan: index % 5 === 0 ? 'enterprise' : 'studio',
    reportId: `report-${index}`,
    artifactId: `artifact-${index}`,
    artifactTitle: `Paid Proof ${index}`,
    runAt: Date.UTC(2026, 4, 18, 1, index % 60),
    billed: true,
    personasRun: 10,
    completedRuns: 7,
    seededBugsIdentified: 3,
    tuningSuggestions: 2,
    acceptedSuggestions: index < acceptedSuggestionStudios ? 1 : 0,
  }));
}

function playtestRegressionProof(readyForRepeatLoop = true): PlaytestRegressionReport {
  const resolved = readyForRepeatLoop ? 1 : 0;
  const completionRegressionBps = readyForRepeatLoop ? 0 : 4_286;
  return {
    readyForRepeatLoop,
    generatedAt: Date.UTC(2026, 4, 18, 6, 30),
    beforeReportId: 'report-before-regression-proof',
    afterReportId: 'report-after-regression-proof',
    artifactId: 'artifact-regression-proof',
    artifactTitle: 'Regression Proof Slice',
    targets: {
      minResolvedSeededBugs: 1,
      maxNewCriticalIssues: 0,
      maxCompletionRegressionBps: 2_000,
      minAcceptedSuggestionsApplied: 1,
    },
    summary: {
      beforeSeededBugs: 3,
      afterSeededBugs: readyForRepeatLoop ? 2 : 3,
      resolvedSeededBugs: resolved,
      persistentSeededBugs: readyForRepeatLoop ? 2 : 3,
      newIssueCount: 0,
      newCriticalIssues: 0,
      beforeCompletedRuns: 7,
      afterCompletedRuns: readyForRepeatLoop ? 7 : 4,
      completionRegressionBps,
      acceptedSuggestionsApplied: readyForRepeatLoop ? 1 : 0,
      targetMet: readyForRepeatLoop,
    },
    resolvedSeededBugIds: readyForRepeatLoop ? ['bug-hud-overlap'] : [],
    persistentSeededBugIds: readyForRepeatLoop
      ? ['bug-checkpoint-softlock', 'bug-invisible-spike-hitbox']
      : ['bug-checkpoint-softlock', 'bug-hud-overlap', 'bug-invisible-spike-hitbox'],
    newIssueIds: [],
    acceptedSuggestionIds: readyForRepeatLoop ? ['suggestion-hud-scale'] : [],
    checks: [
      {
        id: 'bug-resolution',
        label: 'Seeded bug resolution',
        status: readyForRepeatLoop ? 'pass' : 'fail',
        detail: `${resolved} seeded bug(s) resolved after tuning.`,
      },
      {
        id: 'completion-regression',
        label: 'Completion regression',
        status: readyForRepeatLoop ? 'pass' : 'fail',
        detail: `${completionRegressionBps} bps completion regression is within policy.`,
      },
    ],
    issues: readyForRepeatLoop
      ? []
      : [
        {
          code: 'accepted_suggestion_shortfall',
          severity: 'error',
          detail: 'No accepted suggestion was linked to the rerun.',
        },
      ],
  };
}

test('playtest business-model proof exports the cloud playtest slice without leaking studio ids', () => {
  const records = playtestProofRecords();
  const adoption = buildPlaytestAdoptionReport(records, {
    generatedAt: Date.UTC(2026, 4, 18, 5),
  });
  const savings = buildPlaytestQaSavingsReport(records, {
    generatedAt: Date.UTC(2026, 4, 18, 6),
    targets: {
      annualQaBudgetCents: 10_000_000,
      targetReplacementBps: 3_000,
    },
  });
  const regression = playtestRegressionProof();

  const proof = buildPlaytestBusinessModelProofExport({
    adoptionReport: adoption,
    qaSavingsReport: savings,
    regressionReport: regression,
    generatedAt: Date.UTC(2026, 4, 18, 7),
  });

  assert.equal(adoption.readyForProductionProof, true);
  assert.equal(proof.playtest.activePayingStudios, 100);
  assert.equal(proof.playtest.personasInProduction, 10);
  assert.equal(proof.playtest.acceptedTuningSuggestions, 24);
  assert.equal(proof.playtest.completedRuns, 700);
  assert.ok(proof.playtest.qaSavingsUsd > 0);
  assert.equal(proof.playtest.sourceBusinessModelReady, true);
  assert.equal(proof.source.adoptionReady, true);
  assert.equal(proof.source.qaSavingsReady, true);
  assert.equal(proof.source.regressionReady, true);
  assert.equal(proof.source.personaProductionReady, true);
  assert.equal(proof.source.businessModelReady, true);
  assert.deepEqual(proof.source.reports, ['playtest-adoption', 'playtest-qa-savings', 'playtest-regression']);
  assert.equal(proof.source.adoptionPeriod.label, '2026-05');
  const serialized = JSON.stringify(proof);
  assert.doesNotMatch(serialized, /studio_paid_0|qa-director@example\.com|human\.playtester@example\.com/u);
});

test('playtest business-model proof zeroes counters when adoption proof is weak', () => {
  const records = playtestProofRecords(1);
  const adoption = buildPlaytestAdoptionReport(records, {
    generatedAt: Date.UTC(2026, 4, 18, 5),
  });
  const savings = buildPlaytestQaSavingsReport(records, {
    generatedAt: Date.UTC(2026, 4, 18, 6),
    targets: {
      annualQaBudgetCents: 10_000_000,
      targetReplacementBps: 3_000,
      minimumPayingStudios: 100,
      minimumReports: 100,
      minimumAcceptedSuggestionStudios: 1,
    },
  });
  const regression = playtestRegressionProof();

  const proof = buildPlaytestBusinessModelProofExport({
    adoptionReport: adoption,
    qaSavingsReport: savings,
    regressionReport: regression,
    generatedAt: Date.UTC(2026, 4, 18, 7),
  });

  assert.equal(adoption.readyForProductionProof, false);
  assert.equal(savings.readyForQaBudgetProof, true);
  assert.deepEqual(proof.playtest, {
    activePayingStudios: 0,
    personasInProduction: 0,
    acceptedTuningSuggestions: 0,
    completedRuns: 0,
    qaSavingsUsd: 0,
    sourceBusinessModelReady: false,
  });
  assert.equal(proof.source.adoptionReady, false);
  assert.equal(proof.source.qaSavingsReady, true);
  assert.equal(proof.source.regressionReady, true);
  assert.equal(proof.source.personaProductionReady, true);
  assert.equal(proof.source.businessModelReady, false);
});

test('playtest business-model proof zeroes counters when QA savings proof is weak', () => {
  const records = playtestProofRecords();
  const adoption = buildPlaytestAdoptionReport(records, {
    generatedAt: Date.UTC(2026, 4, 18, 5),
  });
  const savings = buildPlaytestQaSavingsReport(records, {
    generatedAt: Date.UTC(2026, 4, 18, 6),
    targets: {
      annualQaBudgetCents: 1_000_000_000_000,
      targetReplacementBps: 3_000,
      minimumPayingStudios: 100,
      minimumReports: 100,
      minimumAcceptedSuggestionStudios: 20,
    },
  });
  const regression = playtestRegressionProof();

  const proof = buildPlaytestBusinessModelProofExport({
    adoptionReport: adoption,
    qaSavingsReport: savings,
    regressionReport: regression,
    generatedAt: Date.UTC(2026, 4, 18, 7),
  });

  assert.equal(adoption.readyForProductionProof, true);
  assert.equal(savings.readyForQaBudgetProof, false);
  assert.deepEqual(proof.playtest, {
    activePayingStudios: 0,
    personasInProduction: 0,
    acceptedTuningSuggestions: 0,
    completedRuns: 0,
    qaSavingsUsd: 0,
    sourceBusinessModelReady: false,
  });
  assert.equal(proof.source.adoptionReady, true);
  assert.equal(proof.source.qaSavingsReady, false);
  assert.equal(proof.source.regressionReady, true);
  assert.equal(proof.source.personaProductionReady, true);
  assert.equal(proof.source.businessModelReady, false);
});

test('playtest business-model proof zeroes counters when regression proof is weak', () => {
  const records = playtestProofRecords();
  const adoption = buildPlaytestAdoptionReport(records, {
    generatedAt: Date.UTC(2026, 4, 18, 5),
  });
  const savings = buildPlaytestQaSavingsReport(records, {
    generatedAt: Date.UTC(2026, 4, 18, 6),
    targets: {
      annualQaBudgetCents: 10_000_000,
      targetReplacementBps: 3_000,
    },
  });
  const regression = playtestRegressionProof(false);

  const proof = buildPlaytestBusinessModelProofExport({
    adoptionReport: adoption,
    qaSavingsReport: savings,
    regressionReport: regression,
    generatedAt: Date.UTC(2026, 4, 18, 7),
  });

  assert.equal(adoption.readyForProductionProof, true);
  assert.equal(savings.readyForQaBudgetProof, true);
  assert.equal(regression.readyForRepeatLoop, false);
  assert.deepEqual(proof.playtest, {
    activePayingStudios: 0,
    personasInProduction: 0,
    acceptedTuningSuggestions: 0,
    completedRuns: 0,
    qaSavingsUsd: 0,
    sourceBusinessModelReady: false,
  });
  assert.equal(proof.source.adoptionReady, true);
  assert.equal(proof.source.qaSavingsReady, true);
  assert.equal(proof.source.regressionReady, false);
  assert.equal(proof.source.personaProductionReady, true);
  assert.equal(proof.source.businessModelReady, false);
});

test('playtest business-model proof rejects partial persona production coverage', () => {
  const records = playtestProofRecords();
  const adoption = buildPlaytestAdoptionReport(records, {
    generatedAt: Date.UTC(2026, 4, 18, 5),
  });
  const savings = buildPlaytestQaSavingsReport(records, {
    generatedAt: Date.UTC(2026, 4, 18, 6),
    targets: {
      annualQaBudgetCents: 10_000_000,
      targetReplacementBps: 3_000,
    },
  });
  const regression = playtestRegressionProof();

  const proof = buildPlaytestBusinessModelProofExport({
    adoptionReport: adoption,
    qaSavingsReport: savings,
    regressionReport: regression,
    personasInProduction: 5,
    generatedAt: Date.UTC(2026, 4, 18, 7),
  });

  assert.equal(proof.source.adoptionReady, true);
  assert.equal(proof.source.qaSavingsReady, true);
  assert.equal(proof.source.regressionReady, true);
  assert.equal(proof.source.personaProductionReady, false);
  assert.equal(proof.source.businessModelReady, false);
  assert.deepEqual(proof.playtest, {
    activePayingStudios: 0,
    personasInProduction: 0,
    acceptedTuningSuggestions: 0,
    completedRuns: 0,
    qaSavingsUsd: 0,
    sourceBusinessModelReady: false,
  });
});

test('QA savings report fails closed on weak savings or unsafe source ids', () => {
  const report = buildPlaytestQaSavingsReport([
    {
      id: 'unsafe-record',
      studioId: 'qa-director@example.com',
      plan: 'studio',
      reportId: 'report-1',
      artifactId: 'artifact-1',
      artifactTitle: 'Unsafe QA Proof',
      runAt: Date.UTC(2026, 4, 18),
      billed: true,
      personasRun: 1,
      completedRuns: 1,
      seededBugsIdentified: 0,
      tuningSuggestions: 0,
      acceptedSuggestions: 0,
    },
  ], {
    generatedAt: Date.UTC(2026, 4, 18),
    targets: {
      annualQaBudgetCents: 50_000_000,
      targetReplacementBps: 3_000,
      minimumPayingStudios: 2,
      minimumReports: 2,
      minimumAcceptedSuggestionStudios: 1,
    },
  });

  assert.equal(report.readyForQaBudgetProof, false);
  assert.deepEqual(report.shortfalls.map((shortfall) => shortfall.code).sort(), [
    'accepted_suggestion_studio_shortfall',
    'paying_studio_shortfall',
    'pii_evidence_leak',
    'replacement_shortfall',
    'report_shortfall',
  ]);
});

test('regression report proves accepted tuner diffs resolved bugs without new regressions', async () => {
  const before = await runPlaytestLoop({
    artifact: createSeededPlatformerSample(),
    personas: personasForAlpha(),
    durationMs: 10 * 60 * 1_000,
    now: () => Date.UTC(2026, 4, 18),
  });
  const suggestion = before.suggestions.find((item) => item.kind === 'enemy-hp') ?? before.suggestions[0];
  assert.ok(suggestion);
  const decided = recordHumanDecision(before, suggestion.id, 'accepted', 'designer-1', Date.UTC(2026, 4, 18, 1));
  const resolvedBugId = decided.issues.find((issue) => issue.bugId)?.bugId;
  assert.ok(resolvedBugId);
  const after = {
    ...decided,
    id: `${decided.id}-rerun`,
    generatedAt: Date.UTC(2026, 4, 18, 2),
    issues: decided.issues.filter((issue) => issue.bugId !== resolvedBugId),
  };

  const regression = buildPlaytestRegressionReport({
    before: decided,
    after,
    acceptedSuggestionIds: [suggestion.id],
    generatedAt: Date.UTC(2026, 4, 18, 3),
  });

  assert.equal(regression.readyForRepeatLoop, true);
  assert.equal(regression.summary.targetMet, true);
  assert.equal(regression.summary.resolvedSeededBugs, 1);
  assert.equal(regression.summary.newCriticalIssues, 0);
  assert.equal(regression.summary.completionRegressionBps, 0);
  assert.deepEqual(regression.acceptedSuggestionIds, [suggestion.id]);
  assert.deepEqual(regression.issues, []);
  assert.match(playtestRegressionMarkdown(regression), /Ready: yes/u);
});

test('regression report fails closed on unresolved bugs, new critical issues, completion loss, or unsafe evidence', async () => {
  const before = await runPlaytestLoop({
    artifact: createSeededPlatformerSample(),
    personas: personasForAlpha(),
    durationMs: 10 * 60 * 1_000,
    now: () => Date.UTC(2026, 4, 18),
  });
  const after = {
    ...before,
    id: `${before.id}-unsafe-rerun`,
    completedRuns: Math.max(0, before.completedRuns - 3),
    issues: [
      ...before.issues,
      {
        id: 'new-critical-contact-leak',
        kind: 'friction' as const,
        severity: 'critical' as const,
        title: 'Critical regression',
        evidence: ['Raw tester contact qa@example.com saw a blocking crash.'],
        affectedPersonas: ['speedrunner'],
      },
    ],
  };

  const regression = buildPlaytestRegressionReport({
    before,
    after,
    generatedAt: Date.UTC(2026, 4, 18, 3),
  });

  assert.equal(regression.readyForRepeatLoop, false);
  assert.equal(regression.summary.resolvedSeededBugs, 0);
  assert.ok(regression.summary.completionRegressionBps > 2_000);
  assert.deepEqual(regression.issues.map((issue) => issue.code).sort(), [
    'accepted_suggestion_shortfall',
    'completion_regression',
    'new_critical_issue',
    'pii_evidence_leak',
    'resolved_bug_shortfall',
  ]);
  assert.equal(regression.checks.find((check) => check.id === 'new-critical-safety')?.status, 'fail');
});

test('benchmark readiness fails closed on weak or unsafe evidence', async () => {
  const report = await runPlaytestLoop({
    artifact: createSeededPlatformerSample(),
    personas: personasForAlpha().slice(0, 2),
    durationMs: 60_000,
    now: () => 1_800_000_000_000,
  });
  const weakReport = {
    ...report,
    completedRuns: 1,
    issues: report.issues.filter((issue) => !issue.bugId).slice(0, 1),
    suggestions: [],
  };
  const unsafeAcceptance = {
    id: 'study-unsafe',
    studyId: 'unsafe-study',
    reportId: weakReport.id,
    artifactId: weakReport.artifactId,
    generatedAt: 1_800_000_300_000,
    summary: {
      decisions: 1,
      participants: 1,
      accepted: 1,
      rejected: 0,
      acceptanceRate: 1,
      acceptedByHumanPlaytester: 1,
      targetMet: true,
    },
    acceptedSuggestionIds: ['suggestion-unsafe'],
    rejectedSuggestionIds: [],
    decisions: [{
      id: 'decision-unsafe',
      studyId: 'unsafe-study',
      reportId: weakReport.id,
      artifactId: weakReport.artifactId,
      suggestionId: 'suggestion-unsafe',
      suggestionKind: 'enemy-hp' as const,
      suggestionTitle: 'Unsafe',
      suggestionDiffSha256: 'a'.repeat(64),
      participantHash: 'b'.repeat(64),
      participantRole: 'human-playtester' as const,
      decision: 'accepted' as const,
      decidedAt: 1_800_000_200_000,
      consentConfirmed: true as const,
      notes: 'raw tester email human.playtester@example.com',
    }],
  };

  const benchmark = buildPlaytestBenchmarkReport({
    report: weakReport,
    acceptanceReport: unsafeAcceptance,
    generatedAt: 1_800_000_400_000,
  });

  assert.equal(benchmark.ready, false);
  assert.deepEqual(benchmark.issues.map((issue) => issue.code).sort(), [
    'completion_shortfall',
    'duration_shortfall',
    'persona_shortfall',
    'pii_evidence_leak',
    'seeded_bug_shortfall',
    'tuner_suggestion_shortfall',
  ]);
  assert.equal(benchmark.checks.find((check) => check.id === 'human-acceptance')?.status, 'fail');
});
