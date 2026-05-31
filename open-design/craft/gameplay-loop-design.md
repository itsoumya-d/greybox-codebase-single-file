# Gameplay Loop Design

Use when defining the actions, rewards, returns, and long-term reasons a player keeps playing. A good loop is not a diagram of repeated activity; it is a pressure system that makes the next choice feel obvious, tempting, and fair.

## What To Produce

- Name the core loop in one sentence: what the player does every 10-90 seconds.
- Name the session loop: what a complete sitting contains, how it starts, peaks, and ends.
- Name the meta loop: what persists between sessions and why it matters.
- Define resources, risks, rewards, failure costs, and recovery paths.
- Show the first-session version, mid-game version, and late-game version of the loop.
- Explain what changes when the player improves: speed, mastery, options, stakes, or social status.

## Loop Layers

### Core Loop

The core loop is the smallest repeatable unit of play. It should contain a verb, a feedback moment, and a changed state.

Examples:

- Action RPG: scout enemy -> commit attack -> read retaliation -> loot or reposition.
- Farming sim: inspect needs -> spend energy -> collect output -> plan next day.
- Tactical game: evaluate board -> commit unit action -> enemy responds -> update plan.
- Horror game: explore unsafe space -> detect threat -> spend scarce resource -> reach temporary safety.

Core loops fail when they are only chores. Every repetition needs at least one changing variable: a new constraint, a better route, a different enemy mix, a richer tool, a tighter timer, or a meaningful player goal.

### Session Loop

The session loop gives the player a satisfying arc. It should have a warm start, a decision-rich middle, and a clean exit.

- Start: remind the player what matters now without dumping logs.
- Build: introduce a target, friction, or opportunity.
- Peak: create a test of skill, planning, timing, creativity, or nerve.
- Resolve: pay out rewards, reveal consequences, unlock new choices.
- Exit: give a next-session hook without punishing the player for stopping.

Short-session games need faster closure. Long-session games need sub-goals, checkpoints, and readable fatigue relief.

### Meta Loop

The meta loop determines whether repeated sessions compound into meaning. It can be narrative progress, mastery, collection, social rank, base growth, map control, character build depth, or player-authored identity.

Healthy meta loops widen choices. Weak meta loops only inflate numbers. A level-up that unlocks a new combat decision is stronger than a level-up that adds two percent damage without changing play.

## Reward Cadence

Rewards should vary by scale and emotional texture.

| Cadence | Timeframe | Reward Type | Design Risk |
|---|---:|---|---|
| Micro | 1-10 seconds | Hit spark, sound, pickup, combo tick | Noise, overstimulation |
| Short | 30-180 seconds | Room clear, quest step, crafting output | Predictable grind |
| Session | 10-45 minutes | Boss defeated, chapter complete, new district | Exhausting peaks |
| Meta | Days/weeks | Build identity, season goal, prestige, collection | Obligation pressure |

Do not make every reward louder. Use contrast: a quiet discovery can be as valuable as a loot burst if the game has trained the player to care.

## Risk And Recovery

Loop tension comes from a visible risk and a believable recovery path.

- Risk can be health loss, time loss, resource depletion, exposure, lost positioning, social reputation, or opportunity cost.
- Recovery can be healing, retreat, tradeoff upgrades, alternate routes, help from companions, respecs, or knowledge gained.
- Failure should usually teach. Total loss is appropriate only when the genre contract supports it and the player had warning.

For roguelikes, recovery often happens across runs through knowledge and unlocks. For cozy games, recovery is usually emotional: a missed day should become a small detour, not shame. For competitive games, recovery depends on comeback mechanics that reward skill without invalidating the leading player's success.

## Onboarding The Loop

Introduce loops in playable order, not lore order.

1. Give the player one verb and one readable goal.
2. Let them see feedback immediately.
3. Add a resource or constraint only after the verb feels safe.
4. Add choice after the player understands consequence.
5. Add meta progression once the session loop is legible.

Avoid tutorializing the whole game before the player has felt why the loop is fun. Early prompts should clarify actions, not narrate the design document.

## Retention Without Burnout

Retention design should create anticipation, not anxiety.

- Use daily or weekly goals as optional direction, not mandatory debt.
- Let players bank progress or miss days without losing identity.
- Prefer "come back because something interesting changed" over "come back or lose value."
- Show finite goals for events, seasons, and battle passes.
- Rotate content at a pace the asset pipeline can support.
- Include low-pressure sessions for players who want maintenance, decoration, practice, or story.

Ethical retention respects sleep, attention, and spending limits. A system that succeeds only by creating fear of missing out is fragile and corrosive.

## Genre Patterns

### Roguelike

Strong roguelike loops convert failure into knowledge. Each run needs a build identity, a risk fork, and a memorable loss or triumph. Meta unlocks should add variety before they add raw power.

### RPG

RPG loops need a braid of combat, exploration, story, and build planning. The player should regularly ask: who am I becoming, what do I believe, and how does my build solve this problem differently?

### Survival

Survival loops use need pressure. Hunger, cold, durability, and shelter should create routes and priorities, not constant meter babysitting. The best survival loop turns the environment into an opponent with rules.

### Tactical

Tactical loops live in forecasting. Show enough information for planning, hide enough uncertainty for adaptation, and make losses traceable to choices rather than opaque dice.

### Cozy

Cozy loops are not shallow loops. They use gentle compounding, collection, relationship, customization, and ritual. The pressure is self-directed aspiration rather than threat.

## Anti-Patterns

- A loop where the reward is only "number goes up" and new decisions never appear.
- A session that cannot end cleanly without losing progress.
- A meta system that makes early mistakes permanently punishing.
- A tutorial that explains five loops before the player has completed one.
- A reward cadence with no quiet space, making all feedback feel equally meaningless.
- A retention system that turns a game into a calendar obligation.

## Agent Checklist

- Can the loop be explained in one sentence without generic verbs like "engage" or "experience"?
- Does the player state change after each loop?
- Are rewards readable at micro, session, and meta scale?
- Does failure create information, drama, or a new plan?
- Is there a clean exit point for the expected session length?
- Does progression create new decisions, not just bigger numbers?
- Are retention hooks optional, transparent, and respectful?
