# Sports Broadcast
> Category: Game Art Direction
> Scorebugs, replay packages, team branding, live match telemetry, career screens, ranked ladders, and spectator-ready UI.

## 1. Art Direction & Atmosphere

Sports Broadcast should feel like a premium live production: clean scorebugs, fast lower-thirds, matchup graphics, team identity, instant replay, stat packages, bracket context, and audience-readable hierarchy. It supports sports sims, racing, esports, competitive arenas, fantasy leagues, coaching tools, and spectator modes.

The style must serve both player and viewer. In play, the HUD should preserve field visibility. In menus and broadcasts, it can become data-rich and dramatic.

## 2. Color Palette & Semantic Roles

Core broadcast palette:

- Broadcast black: `oklch(12% 0.02 250)` for overlays.
- Studio charcoal: `oklch(22% 0.025 250)` for panels.
- Ice white: `oklch(94% 0.015 250)` for primary text.
- Signal blue: `oklch(62% 0.15 245)` for neutral broadcast accents.
- Energy red: `oklch(58% 0.20 28)` for live, record, foul, danger, penalty.
- Field green: `oklch(55% 0.13 145)` for pitch/field-positive states.
- Gold: `oklch(78% 0.14 85)` for champion, highlight, MVP, record.
- Team colors: reserved for teams and must not conflict with state colors.

Gameplay tokens:

- Home team and away team: team palette plus abbreviation.
- Possession: white outline, glow, arrow, or ball icon.
- Live state: red dot and "LIVE" label.
- Replay: blue/white frame and timeline scrub.
- Penalty/foul: red or amber with rule icon.
- Momentum: gradient meter but with numeric support.
- Stamina/fatigue: green to amber to red with icon and text.
- Ranked change: up/down arrow, delta, division badge.

Team identity can be expressive; rules and status must remain universal.

## 3. Typography Rules

Use bold broadcast sans-serif, condensed only for large labels. Numerals must be tabular. Team abbreviations need fixed width. Small stats require high contrast and minimal decoration.

Rules:

- Score and timer must be readable in motion and on mobile.
- Use consistent abbreviations.
- Avoid tiny all-caps paragraphs.
- Highlight records, streaks, and deltas with icon plus color.
- Keep subtitles/commentary accessible in spectator modes.

## 4. HUD Density & Layout

Sports HUDs depend on camera and sport.

- Top or bottom scorebug: teams, score, period/lap/round, timer.
- Corners: possession, stamina, boost, player indicator, mini-map.
- Lower third: player intro, stat package, replay label, injury/foul.
- Pause/coaching: formation, roster, tactics, substitutions, objectives.
- Career/franchise: calendar, standings, contracts, training, morale.
- Esports/spectator: team economies, ultimates, cooldowns, minimap, kill feed.

Use collapsible or timed overlays so field visibility wins during active play.

## 5. Gameplay Module Styling

- Scorebug: compact rectangle with team colors, readable score, clock.
- Stat card: player/team photo or icon, key stat, trend, comparison.
- Replay package: branded frame, timeline, angle label, speed control.
- Matchup screen: team marks, form, key players, venue, stakes.
- Leaderboard: rank, name, delta, score, region/team badge.
- Bracket: clean connectors, match status, seed, date.
- Coaching board: field diagram, routes, roles, substitutions.

Cards are appropriate for repeated player, team, matchup, and stat items. Avoid card-heavy hero marketing layouts.

## 6. Motion, Game Feel & Feedback

Broadcast motion is crisp and confident.

- Score update: quick slide or flip, then hold.
- Goal/touchdown/win: larger package, team color sweep, replay hook.
- Foul/penalty: sharp red/amber tag, rule icon, official cue.
- Replay transition: wipe, freeze-frame, timeline marker.
- Player lower-third: slide in under 240 ms, exit cleanly.
- Leaderboard delta: brief up/down movement, no layout shift.
- Stamina warning: localized pulse, not full-screen.

Motion must not hide gameplay. Any celebratory package should respect online match timing and player control.

## 7. VFX, Materials & Scene Direction

Use glossy broadcast panels, field lines, subtle glass, metal trims, team graphics, stadium lighting, ticker movement, and data visualization. Keep overlays rectangular, aligned, and grid-based.

For racing:

- Speed, gear, lap, delta, position, minimap, tire/fuel.

For field sports:

- Scorebug, possession, stamina, player indicator, tactical mini-map.

For esports:

- Team resources, cooldowns/ultimates, kill feed, objective timers, map control.

VFX should make highlights replayable without changing match truth.

## 8. Audio Direction Tokens

- Score update: short broadcast tick.
- Goal/win: crowd swell and sting, with volume controls.
- Penalty/foul: whistle or official cue.
- Replay: whoosh into muted replay bed.
- Timer low: subtle urgency tick.
- Menu select: clean studio click.
- Ranked up: celebratory but short sting.
- Injury/fatigue: subdued alert, not panic unless severe.

Commentary should not talk over critical player choices. Provide commentary volume and subtitle options.

## 9. Do's and Don'ts

Do:

- Protect field visibility.
- Make score, clock, possession, and rules instantly clear.
- Let team branding be strong but secondary to state readability.
- Design both player HUD and spectator overlays.
- Use stat packages to tell story, not dump every number.
- Include colorblind-safe team differentiation.

Do not:

- Use team colors for universal danger without backup.
- Animate scorebugs so much they distract from play.
- Hide the ball, puck, car, target, or active player under overlays.
- Make career/franchise menus look like generic reporting panels instead of broadcast-ready game control centers.
- Let replay packages delay online control or matchmaking.

## 10. Agent Prompt Guide

When using Sports Broadcast, specify sport or mode, camera angle, scorebug contents, team identity, possession rules, replay needs, stat hierarchy, and spectator requirements. Prefer broadcast clarity, fixed-width numerical layouts, and overlays that feel live without covering the action.
