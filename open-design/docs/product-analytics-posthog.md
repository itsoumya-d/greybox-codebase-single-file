<!-- SPDX-License-Identifier: Apache-2.0 -->

# Product Analytics PostHog Setup

Greybox product analytics are opt-in. The daemon only exports aggregate weekly
North Star events to PostHog and excludes artifact content, file bodies,
designer names, and game IP.

## Event Export

Set:

- `AGDS_PRODUCT_ANALYTICS_POSTHOG_HOST`
- `AGDS_PRODUCT_ANALYTICS_POSTHOG_PROJECT_TOKEN`
- optional `AGDS_PRODUCT_ANALYTICS_POSTHOG_DISTINCT_ID`

Then run:

```bash
POST /api/product-analytics/weekly-report/posthog
```

The event is `greybox_weekly_north_star` with `$process_person_profile=false`.

## Founder Dashboard Seed

Preview the dashboard seed:

```bash
GET /api/product-analytics/posthog/dashboard-seed?environmentId=<posthog-environment-id>
```

Provision it when a scoped PostHog personal API key is available:

```bash
AGDS_PRODUCT_ANALYTICS_POSTHOG_PERSONAL_API_KEY=...
AGDS_PRODUCT_ANALYTICS_POSTHOG_ENVIRONMENT_ID=...
POST /api/product-analytics/posthog/dashboard-provision?dryRun=false
```

Required PostHog scopes:

- `dashboard:write`
- `insight:write`

Seeded insights:

- North Star weekly active designers shipping to engines.
- Activation funnel: signup, first project, first artifact, first save, first engine export.
- Unity vs Unreal vs Godot export volume.
- Retention cohorts: D1, D7, D28, M3, and M6.
- NRR by signup month.
- Top skill usage.
- Top game art bible usage.
- Playtest persona completion rate.

The PostHog payload is aggregate-only. It includes weekly counts and top-level
IDs for skills, art bibles, and playtest personas, but never exports project
file bodies, artifact content, designer names, or game IP.
