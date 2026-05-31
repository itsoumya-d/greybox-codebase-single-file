# Community And Modding Systems

Community and modding systems let players extend the life of a game without handing production control to chaos. Use this guide when a design needs UGC pipelines, mod tools, creator ecosystems, community events, replay sharing, screenshot modes, spectator culture, clan/guild support, or player-authored worlds.

## What To Produce

- Community promise: why players gather, share, mentor, compete, or co-create.
- UGC/modding scope: what creators may change, package, publish, remix, and monetize.
- Tooling model: in-game editor, external SDK, level importer, scripting layer, asset-pack format, or curated challenge maker.
- Moderation and trust model: review queues, reporting, age rating, IP rules, unsafe content handling, and creator reputation.
- Discovery loop: tags, playlists, featured rotations, creator profiles, seasonal prompts, and social sharing.
- Production boundary: supported surfaces, engine constraints, QA responsibility, compatibility policy, and patch migration plan.

## Design Rules

- Give creators constrained expressive power first. A reliable level editor with clear tiles, objectives, enemy budgets, and validation usually beats an unrestricted scripting sandbox.
- Separate creative status from competitive advantage. Creator rewards should be cosmetics, profile identity, featuring, revenue share, or prestige, not power that damages matchmaking trust.
- Build for players who only consume UGC. Browsing, rating, filtering, previewing, and safe rollback are part of the gameplay loop.
- Treat moderation as production design. Define blocked content classes, escalation paths, appeal flow, evidence capture, and regional compliance before launch.
- Preserve game readability. Mods can expand fantasy, but shipped playlists need stable controls, camera assumptions, HUD scale, accessibility, and performance budgets.
- Plan compatibility. Every major patch needs a migration rule for saved maps, scripts, replay files, economy data, and creator-authored progression.

## Modding Scope Ladder

| Scope | Best For | Risk |
|---|---|---|
| Cosmetic sharing | Skins, banners, emblems, photo modes | IP infringement, moderation load |
| Challenge authoring | Races, arenas, puzzles, encounter seeds | Exploits, low-quality spam |
| Level editor | Platformers, tactics maps, puzzle games | Validation, content discovery |
| Data mods | Balance packs, item tables, enemy variants | Fragmented matchmaking, save migration |
| Scripting SDK | Sandbox, sim, automation games | Security, support burden, compatibility |
| Full asset import | PC creator ecosystems | Performance, licensing, malware concerns |

Move up the ladder only when the production team can support the review, documentation, migration, and support load.

## Community Health Signals

- Creator funnel: editor open rate, publish rate, first approved creation, repeat creator rate.
- Consumer funnel: browse-to-play, completion, rating, favorite, replay, share.
- Trust metrics: report rate, takedown rate, appeal success, blocked content classes, moderation response time.
- Quality metrics: completion spread, crash rate by content id, performance outliers, abandoned sessions.
- Social metrics: guild participation, event contribution, mentor activity, spectator/replay views, community challenge retention.

## Anti-Patterns

- Shipping mod tools without documentation, examples, validation, or migration policy.
- Making user-generated levels count for ranked progression without exploit controls.
- Hiding moderation behind vague "community guidelines" instead of concrete rules and appeal paths.
- Letting creator monetization override player trust, age rating, accessibility, or IP safety.
- Treating social features as endless obligations. Community goals should invite cooperation, not punish players for missing a group grind.

## Agent Checklist

- What can players create, remix, publish, and discover?
- What is forbidden, who reviews it, and how are appeals handled?
- How do UGC and mods preserve gameplay readability, accessibility, performance, and save compatibility?
- What rewards motivate creators without damaging economy or competitive fairness?
- What telemetry proves the community ecosystem is healthy rather than noisy?
