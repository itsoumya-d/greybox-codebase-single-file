# Level Design Patterns

Use when designing maps, rooms, missions, traversal spaces, objective flow, sightlines, encounter placement, and spatial pacing. A level is a playable argument: it teaches the player what matters through space, pressure, reward, and surprise.

## What To Produce

- A level thesis: what the level teaches, tests, or expresses.
- A critical path with optional branches, loops, shortcuts, and safe rooms.
- Encounter beats with pressure, recovery, and reward.
- Sightline, cover, traversal, and objective rules.
- Landmarks and readable orientation cues.
- Accessibility and navigation support.
- A content budget for enemies, pickups, hazards, secrets, and scripted moments.

## Spatial Flow

Good flow alternates compression and release.

- Compression: corridors, doors, cliffs, chokepoints, stealth routes, time pressure.
- Release: vistas, hub spaces, safe rooms, reward rooms, wide arenas, quiet paths.
- Reorientation: landmarks, lighting, audio, signage, map shape, terrain silhouette.
- Commitment: drops, gates, elevators, boss doors, one-way slides, extraction calls.

The player should rarely be confused about where they can go, but they can be uncertain about what it will cost.

## Beat Structure

Use beats to control attention:

| Beat | Function | Example |
|---|---|---|
| Arrival | Establish mood, goal, and landmark | View of fortress, radio call, quest marker |
| Teach | Introduce one spatial or mechanical rule | First climb, first cover lane, first patrol |
| Vary | Repeat rule with a twist | Same climb under enemy fire |
| Test | Combine rules under pressure | Multi-route arena with hazard |
| Reward | Pay out knowledge, loot, story, vista | Shortcut, secret, rare item |
| Recover | Lower intensity and let player plan | Safe room, campfire, vendor |
| Escalate | Raise stakes or reveal new condition | Alarm, storm, boss phase, timer |
| Exit | Close the arc and hint next goal | Elevator, extraction, cutscene, hub return |

Do not stack too many new ideas in one beat. A level can be dense without being noisy.

## Critical Path And Optional Space

The critical path should be legible. Optional space should be tempting.

- Use light, motion, architecture, enemy patrols, and objective framing to mark the main route.
- Place secrets in spaces that look intentional, not random.
- Reward exploration with distinct value: lore, alternate angle, resource cache, shortcut, build option, cosmetic, or tactical advantage.
- Let optional space loop back cleanly so curiosity does not become navigation tax.

If a side path is longer than the main path, give it a meaningful payoff or a memorable scene.

## Sightlines

Sightlines are promises. If players can see a place, enemy, object, or landmark, they will assume it matters.

- Long sightlines build anticipation and orientation.
- Short sightlines build tension and threat.
- Vertical sightlines support goals, threats, and fantasy.
- Occlusion supports surprise but must not hide unfair damage.
- Framing can teach routes without UI markers.

For shooters and tactical games, sightlines define balance. For horror, limited sightlines define dread. For cozy games, soft sightlines invite wandering without stress.

## Encounter Placement

Place encounters where space supports the intended decision.

- Ambushes need warning language: disturbed props, sound, enemy silhouettes, suspicious openings.
- Snipers need counter-routes, cover, or suppression options.
- Bosses need arena readability, recovery zones, and hazard contrast.
- Puzzles need clear input objects and consequence feedback.
- Stealth spaces need patrol readability, hiding affordances, and fallback states.
- Survival spaces need resource logic: why shelter, food, water, or risk appears there.

The encounter should fit the room. Do not drop a melee swarm into a cramped camera-hostile space unless panic is the explicit goal and recovery exists.

## Traversal

Traversal design is level grammar.

- Jumping needs readable distances, landing affordances, and failure recovery.
- Climbing needs clear surfaces and interruption rules.
- Vehicles need turning radius, speed framing, and crash recovery.
- Swimming or flying needs orientation cues and camera comfort.
- Grappling, dashing, wall-running, and teleporting need generous target readability.

Teach traversal in low-risk spaces, test it in pressure spaces, then combine it with combat or puzzle demands.

## Pacing Density

Content density should follow session expectations.

- High-intensity action: 30-120 seconds of pressure, then a short reset.
- Tactical missions: fewer, richer encounters with planning space.
- Horror: longer quiet stretches, sharper spikes, safe rooms that feel earned.
- Cozy: dense interactables but low threat; use rhythm and ritual.
- Open world: landmark-to-landmark travel with micro-discoveries and optional detours.

Empty space is valid when it creates anticipation, scale, or reflection. Empty space is weak when it only fills distance.

## Navigation Support

Use layered navigation:

- World: landmarks, skyline, terrain shape, roads, rivers, color zones.
- Local: doors, lighting, signage, props, enemy direction, audio cues.
- UI: compass, map, objective text, breadcrumb, minimap, accessibility assist.

Do not solve every navigation issue with markers. Fix the space first; then add UI for clarity and accessibility.

## Content Budget

Give each level a budget so scope stays controllable.

```text
Level: Abandoned Reactor
Thesis: teach heat vents as hazard and traversal gate.
Runtime: 18-25 minutes
Combat beats: 5
Puzzle beats: 2
Secrets: 4
New mechanics: 1
Enemy roles: grunt, shield, vent crawler
Recovery rooms: 2
Signature moment: coolant flood escape
```

Budgets help production. They also help players; too many signature moments make none of them land.

## Anti-Patterns

- A beautiful space with no playable thesis.
- Critical paths and side paths that look equally important.
- Surprise damage from enemies the camera could not reasonably show.
- Secrets hidden by arbitrary wall-hugging rather than observation.
- Repeated arenas with different props but identical decisions.
- Navigation markers compensating for unreadable environment design.
- Traversal challenges that punish camera or input ambiguity more than skill.

## Agent Checklist

- What does this level teach, test, or express?
- Can the player identify the main route and optional routes?
- Are sightlines doing orientation, anticipation, threat, or reward work?
- Does every encounter use the room's shape?
- Are recovery spaces placed after pressure peaks?
- Do secrets reward observation rather than random searching?
- Is there a content budget that fits the expected runtime and team scope?
