# Greybox Playtest

Closed-core autonomous playtest loop for Greybox Studio.

Alpha scope:

- 10 first-party persona definitions.
- Headless Chromium runner surface with persona-specific input replay for
  instrumented playable artifacts.
- Browser instrumentation helper that wraps playable HTML, emits
  `greybox:playtest:event` frames for seeded bugs/completion, and supports
  time-scaled smoke runs while preserving 10-minute event timestamps.
- Deterministic scripted runner for CI and seeded sample validation.
- Rule-based observer that turns persona traces into structured issues.
- Async vision-observer seam for GPT-4V/Claude-style screenshot findings,
  deduped with rule evidence and redacted before reports.
- Report generator for completion time, deaths, frustration, unused content,
  and seeded bug evidence.
- Balance tuner that proposes HUD, enemy HP, checkpoint, and level-layout diffs.
- Human decision recording for accepted/rejected tuner suggestions.
- Privacy-preserving human playtester study ledger for accepted/rejected tuner
  suggestions, with hashed participant ids and redacted notes.
- Benchmark readiness packet for the 10-persona / 10-minute / 3-seeded-bug
  alpha target, including human acceptance and PII leakage gates.
- Privacy-preserving adoption report for the 100-paying-studio production
  target, including active studios, paid usage, reports, and accepted tuner
  suggestions. Unpaid Studio/Enterprise trials stay visible as active usage but
  do not count toward paying-studio proof.
- Conservative QA-savings report that estimates avoided manual regression,
  bug triage, and tuner-review effort against a target QA budget replacement
  percentage. Savings evidence is credited from billed non-free usage only.
- Before/after regression proof for the repeat playtest loop, confirming
  accepted tuner suggestions resolved seeded bugs without new critical issues
  or completion regressions.
- Bounded-parallel multi-persona orchestration via `runPlaytestLoop`.
- Authenticated HTTP API for Cloud/Enterprise orchestration:
  `GET /health`, `POST /v1/playtest/run`, and
  `POST /v1/playtest/benchmark`. Responses omit playable HTML and raw event
  traces, return per-persona summaries, enforce bounded request bodies, and
  redact obvious email/phone/IP material from serialized evidence.

## Local Commands

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm rehearse:business-proof --output /tmp/playtest-proof.json --markdown /tmp/playtest-proof.md
```

## Alpha Acceptance Target

The seeded 2D Platformer sample must run 10 personas for a 10-minute slice,
complete at least 5 runs, identify at least 3 seeded bugs, and produce tuner
suggestions that a consented human playtester can accept or reject without
storing participant PII.

Production adoption proof requires 100 active paying studios, at least one
report per paying studio, and accepted tuner suggestions across 20 studios.
External studio identifiers are hashed before entering the usage ledger.

`buildPlaytestBusinessModelProofExport()` maps adoption, QA-savings, and
before/after regression reports into the `playtest` slice of
`GREYBOX_BUSINESS_MODEL_PROOF_JSON` for Greybox Cloud. It returns aggregate
paid-studio, persona, accepted-tuning, completed-run, and QA-savings fields plus
`sourceBusinessModelReady` only when all source reports are ready; otherwise it
exports zeroed proof counters so Cloud cannot pass on weak playtest evidence. It
excludes studio ids, external contacts, raw traces, screenshots, prompts,
artifacts, or game IP.

`pnpm rehearse:business-proof` builds the same Cloud-safe proof from deterministic
rehearsal fixtures and writes a sanitized JSON packet plus a short markdown
summary. The JSON includes `cloudHandoff.value`, which is the exact
`GREYBOX_BUSINESS_MODEL_PROOF_JSON` payload Cloud should receive. Defaults model
100 paying studios across 350 paid usage records so the rehearsal clears Cloud's
$500K annualized QA-savings gate. Use `--weak-adoption`, `--weak-qa`,
`--weak-regression`, or `--personas-in-production <n>` to rehearse fail-closed
behavior before a release.
