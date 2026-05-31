# VFX Design

VFX must communicate gameplay before spectacle.

## What To Produce

- VFX language for damage, healing, status effects, rarity, objectives, environment, weather, cinematics, and UI feedback.
- Priority rules for combat readability, team colors, enemy tells, cooldowns, and boss phases.
- Performance and accessibility budgets by platform.

## Design Rules

- Gameplay-critical VFX need clear shape, timing, and screen-space priority.
- Avoid stacking particles that hide enemy silhouettes, telegraphs, HUD warnings, or interact prompts.
- Use color, motion, sound, and iconography together for status effects.
- Rarity and reward VFX should scale by player value, not arbitrary glow.
- Cinematic VFX should not make the gameplay camera unreadable when control returns.

## Production Gates

- Budget particle count, overdraw, shader cost, texture memory, transparent layers, and screen shake.
- Provide mobile/browser fallback variants for heavy effects.
- Include reduced-flash, reduced-motion, and colorblind-safe alternatives.

## Agent Checklist

- Include gameplay meaning for each effect.
- Include hierarchy and readability rules.
- Include performance budgets.
- Include accessibility-safe variants.
