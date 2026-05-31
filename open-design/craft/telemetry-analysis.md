# Telemetry Analysis

Telemetry turns playtest behavior into design questions, not vanity metrics.

## What To Produce

- Event taxonomy for onboarding, combat, economy, progression, quests, UI/HUD, matchmaking, retention, and accessibility.
- Telemetry boards or reports framed as game telemetry: drop-off, heatmaps, retry count, time to objective, resource flow, and frustration signals.
- Hypotheses that connect metric changes to design changes.

## Design Rules

- Track player decisions and outcomes, not only totals.
- Pair every metric with an action the team can take.
- Segment by platform, input method, skill level, session length, and player mode where relevant.
- Treat retention carefully; optimize healthy return, not compulsion.
- Combine quantitative data with playtest notes before changing core feel.

## Production Gates

- Define privacy, consent, retention period, sampling, and debug-event filtering.
- Keep event names stable and documented before live operations depend on them.
- Avoid high-cardinality payloads that break telemetry boards or violate privacy expectations.

## Agent Checklist

- Include telemetry events and why they matter.
- Include interpretation risks.
- Include design responses.
- Include privacy and ethical engagement notes.
