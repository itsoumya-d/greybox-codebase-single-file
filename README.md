# Greybox source collection

Greybox brings together game-design tooling, cloud services and game-engine integrations. This repository is an **aggregate source checkout**, not a single application with a root install or start command. Choose a component below before following its setup instructions.

The source includes alpha services, engine-plugin foundations and a vendored studio workspace. Component documentation describes intended capabilities; it does not establish that every integration is deployed, commercially available or validated together.

## Start with the implementation

Two focused reading paths connect implementation to committed tests:

- **GLB inspection:** [cloud inspector](greybox-cloud/src/providers/character-gen/gltf-normalizer.ts) → [synthetic GLB tests](greybox-cloud/tests/gltf-normalizer.test.ts). The inspector reads the GLB container and embedded JSON to validate structure, map joint names and identify animation labels. It does not parse mesh geometry or repair model assets.
- **Unity artifact import:** [prefab builder](greybox-unity-plugin/Editor/Generation/PrefabBuilder.cs) → [EditMode tests](greybox-unity-plugin/Tests/EditMode/PrefabBuilderTests.cs). The builder turns game-viewport and level-board documents into Unity objects and attaches metadata for subsequent synchronization. These tests require Unity; JavaScript checks are not a substitute for editor validation.

## Repository map

| Component | Source and setup | Scope |
| --- | --- | --- |
| Cloud | [greybox-cloud](greybox-cloud/README.md) | Alpha inference routing, character-asset inspection, billing, tenant and readiness services |
| Pro modules | [greybox-pro](greybox-pro/README.md) | Alpha module catalog and signed bundle pipeline |
| Marketplace | [greybox-marketplace](greybox-marketplace/README.md) | Marketplace API, entitlements and billing integration; separate web package |
| Playtest | [greybox-playtest](greybox-playtest/README.md) | Scripted/browser runner surfaces, observations and report generation; rehearsal fixtures are synthetic |
| Unity | [greybox-unity-plugin](greybox-unity-plugin/README.md) | Editor import, prefab generation and round-trip integration; native editor required |
| Unreal | [greybox-unreal-plugin](greybox-unreal-plugin/README.md) | Unreal plugin foundation and import/synchronization surfaces |
| Godot | [greybox-godot-plugin](greybox-godot-plugin/README.md) | Godot addon foundation and import/synchronization surfaces |
| Brand | [greybox-brand](greybox-brand/README.md) | Tokens, logos and brand build tooling |
| Studio workspace | [open-design](open-design/README.md) | Vendored game-design studio fork with web, daemon, desktop and shared packages |

The dated plans, launch/readiness documents and valuation material at the root are planning context. Targets and rehearsal counters should not be read as measured adoption, revenue, certification or runtime performance.

## Component setup and checks

There is no root `package.json` or root `pnpm test` / `pnpm build`. Run commands from the named component directory. The examples below are checked against committed manifests and source; they are not a report of a fresh installation or successful execution.

### Cloud: focused synthetic inspection

The [cloud manifest](greybox-cloud/package.json) pins pnpm **10.33.2** and requires Node **>=24 <27**. With those tools available, start from this repository's root:

```bash
cd greybox-cloud
pnpm install --frozen-lockfile
node --import tsx --test tests/gltf-normalizer.test.ts
```

That test file creates GLB buffers locally and calls the inspector directly. It does not call an AI provider or require provider credentials. After installing dependencies, the component's broader checks are:

```bash
pnpm typecheck
pnpm test
pnpm build
```

For a configured service, read the [cloud README](greybox-cloud/README.md) and [.env.example](greybox-cloud/.env.example). Live inference, billing and persistence integrations have their own configuration requirements. Passing synthetic inspector tests would not verify those integrations.

### Studio: separate workspace

The [studio manifest](open-design/package.json) targets Node **24.x** and pins pnpm **10.33.2**. Its [quickstart](open-design/QUICKSTART.md) and [directory guide](open-design/AGENTS.md) explain the local lifecycle. From this repository's root:

```bash
cd open-design
pnpm install --frozen-lockfile
pnpm tools-dev run web
```

Use the URL printed by the launcher. Generation requires a configured supported coding-agent CLI or a compatible API provider; availability and charges depend on that provider. This is not a bundled free inference service.

The studio keeps checks package-scoped. For example, its [Babylon-based prototype runner](open-design/packages/prototype-runner/README.md) declares:

```bash
pnpm --filter @greybox/prototype-runner typecheck
pnpm --filter @greybox/prototype-runner test
```

Its tests use Babylon's headless `NullEngine`. This does not establish browser rendering, device performance or native-engine behavior. The runner README also identifies placeholder components and remaining runtime work.

For Unity, Unreal and Godot, follow each plugin's own README and engine requirements. There is no single Node command that validates all three native integrations.

## Provenance and component terms

The Greybox-named components contain Greybox-specific service and integration code. Repository ownership alone does not establish sole authorship of every file or asset.

The root [NOTICE](NOTICE) explicitly identifies **open-design as vendored third-party software**. Its original authors' attribution and its [own license](open-design/LICENSE) remain relevant; it should not be presented as entirely original Greybox code.

[Prototype-runner's manifest](open-design/packages/prototype-runner/package.json) declares Babylon.js core, GUI and loader dependencies, recorded in the [studio lockfile](open-design/pnpm-lock.yaml). The runner integrates Babylon; Babylon itself is a third-party rendering engine.

Terms and notices differ by component. Read the root [LICENSE](LICENSE) and [NOTICE](NOTICE), as well as the relevant component files before reuse:

- [Cloud](greybox-cloud/LICENSE.proprietary), [Pro](greybox-pro/LICENSE.proprietary), [Marketplace](greybox-marketplace/LICENSE.proprietary) and [Playtest](greybox-playtest/LICENSE.proprietary)
- [Unity license](greybox-unity-plugin/LICENSE.md) and [third-party notices](greybox-unity-plugin/Third-Party%20Notices.txt)
- [Unreal](greybox-unreal-plugin/LICENSE.proprietary), [Godot](greybox-godot-plugin/LICENSE.proprietary) and [Brand](greybox-brand/LICENSE.proprietary)

Some root license-scope statements and component proprietary notices are inconsistent. This navigation guide does not resolve those differences or change any license terms.

## Verification boundaries

At the documentation review on **9 October 2026**, main was `3c99582a41e42afed8b9a39aba1fabf5635e9a1b`. No GitHub Actions runs were returned for that commit. Workflow files exist inside component directories, but there is no repository-root `.github/workflows` directory in that snapshot.

This guide links committed tests and checks; it does not claim they passed in this aggregate checkout. Documentation review did not run a fresh install, browser session, native editor, paid provider or deployment. A component's test results and configured-environment evidence should be assessed separately.
