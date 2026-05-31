# @greybox/schema

Canonical cross-engine schema for Greybox Studio game projects.

This package is the **single source of truth** for the on-disk
representation of a Greybox Studio project. Every other repo on the
platform (open-design daemon, greybox-cloud, Unity / Unreal / Godot
plugins, marketplace, playtest) consumes this schema instead of
inventing its own format.

It ships:

- A **Zod 3.x** validator for every entity in the project tree.
- The **inferred TypeScript types** for those entities.
- A **JSON Schema** emitter so non-TypeScript consumers (C# Unity
  plugin, C++ Unreal plugin, GDScript Godot plugin) can validate the
  same payloads.
- **Branded ID types** so you can't accidentally pass a `ComponentId`
  where a `ScreenId` is expected.
- A migration scaffold for the day the schema goes 0.1.0 → 0.2.0.

## Install

This is a workspace package. From inside the open-design monorepo:

```jsonc
// some-other-package/package.json
{
  "dependencies": {
    "@greybox/schema": "workspace:*"
  }
}
```

```bash
pnpm install
```

## Quickstart

```ts
import {
  validateGameProject,
  safeParseGameProject,
  SCHEMA_VERSION,
  type GameProject,
} from '@greybox/schema';

// Strict: throws ZodError on invalid input.
const project: GameProject = validateGameProject(jsonFromDisk);

// Graceful: returns a discriminated result.
const result = safeParseGameProject(jsonFromDisk);
if (!result.success) {
  for (const issue of result.error.issues) console.error(issue);
}

console.log(SCHEMA_VERSION); // "0.1.0"
```

For non-TS consumers:

```ts
import { getJsonSchemas } from '@greybox/schema';
import { writeFileSync } from 'node:fs';

const schemas = getJsonSchemas();
writeFileSync('GameProject.schema.json', JSON.stringify(schemas.GameProject, null, 2));
```

## Entity tree

A `GameProject` is the root of the tree:

```
GameProject
├── schemaVersion: SCHEMA_VERSION literal ("0.1.0")
├── meta: ProjectMeta
│   ├── id, name, version, genre
│   ├── targetEngines: ["unity" | "unreal" | "godot" | "web", ...]
│   └── platforms:     ["ios" | "android" | "windows" | ..., ...]
├── art: Art
│   ├── palette: { colors: PaletteColor[] }
│   ├── typography: { styles: TypographyStyle[] }
│   └── materials: MaterialRef[]
├── exportPolicy: ExportPolicy
│   ├── unity:  { renderPipeline, inputSystem, scriptingBackend }
│   ├── unreal: { engineVersion, inputSystem }
│   ├── godot:  { engineVersion, renderer }
│   └── web?:   { runtime: "babylon" | "three" | "playcanvas" }
├── assets: Asset[]
│   └── { id, type, uri, sha256, sizeBytes, provenance }
├── characters: Character[]
│   └── { id, meshRef, rig, animations, gameStats, provenance }
├── screens: Screen[]
│   ├── { id, name, kind, background?, components: Component[] }
│   └── Component is a discriminated union (`kind` discriminator):
│       UI:   Button | Image | Text | TextInput | ProgressBar |
│             HUDBar | MenuList | Container
│       Game: Character3DRef | GameObject | Spawner | Trigger |
│             Pickup | Hazard | Checkpoint | Camera
│       3D:   Light | Particle | AudioSource
└── flow: FlowEdge[]
    └── { id, from: ScreenId, to: ScreenId, trigger: FlowTrigger }
        FlowTrigger is a discriminated union (`type` discriminator):
        tap | longPress | swipe | time | scriptEvent | collision | custom
```

## How to add a new component kind

1. Open `src/component.ts`.
2. Add a new schema near the relevant family section:
   ```ts
   export const MyNewComponentSchema = z.object({
     ...ComponentBaseShape,
     kind: z.literal('MyNew'),
     // ...kind-specific required fields
   });
   export type MyNewComponent = z.infer<typeof MyNewComponentSchema>;
   ```
3. Add it to the discriminated union:
   ```ts
   export const ComponentSchema = z.discriminatedUnion('kind', [
     // ...existing,
     MyNewComponentSchema,
   ]);
   ```
4. Add the kind name to `COMPONENT_KINDS`.
5. Update the fixture in `tests/fixtures/sample-project.json` with one
   instance.
6. Add a row to `SAMPLES` in `tests/component.test.ts`.
7. Update this README's entity-tree diagram.

Adding a new kind is **non-breaking** for existing payloads — they
just never had that kind in them. No schema-version bump required.

## How to add a new asset type

Closed enum in `src/asset.ts` — adding a value is a **breaking change**
because importers in each engine plugin must learn how to handle it.
Bump `SCHEMA_VERSION` and write a migration (see below).

## Migration policy

`SCHEMA_VERSION` follows SemVer:

- **Major** bump: a breaking shape change (removed field, changed type,
  closed-enum tightening).
- **Minor** bump: additive only (new optional field, new component
  kind, new flow trigger).
- **Patch** bump: doc / cosmetic only.

When you bump `SCHEMA_VERSION`:

1. Update the literal in `src/version.ts`.
2. Append the previous version to `KNOWN_SCHEMA_VERSIONS`.
3. Add a `migrate_<from>_to_<to>` helper in `src/version.ts` (or a
   sibling `src/migrations/` directory when the volume grows).
4. Wire it into the `migrate(from, to, project)` switch.
5. Add a test under `tests/` covering a sample input at the old
   version migrating to the new one.

Today only the trivial same-version pass-through is implemented;
`migrate` throws for any other path.

## Building

```bash
pnpm --filter @greybox/schema build       # tsc → dist/
pnpm --filter @greybox/schema test        # vitest (run mode)
pnpm --filter @greybox/schema typecheck   # src + tests
```

## Status

- **Schema version:** `0.1.0` (initial).
- **Owner:** Greybox Studio platform team.
- **Stability:** experimental — expect minor-version churn until the
  first cross-engine round-trip is shipped end to end.
