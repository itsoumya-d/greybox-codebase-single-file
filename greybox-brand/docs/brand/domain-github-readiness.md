# Greybox Domain And GitHub Readiness

Status: local readiness packet complete; external registration is blocked on
founder credentials.

## Domain Matrix

DNS checked locally on 2026-05-18 with `dig +short`. DNS results are operational
signals only; they are not registrar availability or ownership proof.

External refresh on 2026-05-21 used official/public lookup surfaces only. ICANN
Lookup remains the authoritative domain-registration check before purchase.
Public search results still indicate `greybox.com` is registered, but registrar
checkout is required before making any availability or acquisition claim.

| Name | `.studio` | `.gg` | `.ai` | `.com` | Decision |
| --- | --- | --- | --- | --- | --- |
| Greybox | A records observed | no A/AAAA observed | A record observed | A record observed | primary pending counsel |
| Pillar | A record observed for `pillar.studio` | unchecked | unchecked | unchecked | fallback 1 |
| Preplay | no A/AAAA observed for `preplay.studio` | unchecked | unchecked | unchecked | fallback 2 |
| Loopforge | A/AAAA records observed for `loopforge.studio` | unchecked | unchecked | unchecked | fallback 3 |
| Mechanic | A/AAAA records observed for `mechanic.studio` | unchecked | unchecked | unchecked | fallback 4 |

Required registrar checks:

- ICANN Lookup: https://lookup.icann.org/en
- `.ai` registry or registrar WHOIS
- `.gg` registrar WHOIS
- Purchase path for the selected `.studio`, `.gg`, `.ai`, and `.com` domains.

## GitHub Organization

Preferred organization: `@greybox-studio`

Create this organization only after counsel clears the name or selects a
fallback. The eight private repos must be created exactly:

External refresh on 2026-05-21 did not produce an authoritative public ownership
record for `@greybox-studio`. Treat the handle as unclaimed-but-unverified until
the founder signs in and attempts organization creation.

- `greybox-pro`
- `greybox-unity-plugin`
- `greybox-unreal-plugin`
- `greybox-godot-plugin`
- `greybox-cloud`
- `greybox-marketplace`
- `greybox-brand`
- `greybox-playtest`

Local repo parity:

| Repo | Local path | Status |
| --- | --- | --- |
| `greybox-pro` | `../greybox-pro` | exists locally |
| `greybox-unity-plugin` | `../greybox-unity-plugin` | exists locally |
| `greybox-unreal-plugin` | `../greybox-unreal-plugin` | exists locally |
| `greybox-godot-plugin` | `../greybox-godot-plugin` | exists locally |
| `greybox-cloud` | `../greybox-cloud` | exists locally |
| `greybox-marketplace` | `../greybox-marketplace` | exists locally |
| `greybox-brand` | `../greybox-brand` | exists locally |
| `greybox-playtest` | `../greybox-playtest` | exists locally |

## Credential Blockers

- Domain registrar account and payment method.
- GitHub account with organization creation rights.
- Trademark counsel approval before public launch.
- Publisher credentials for Unity, Unreal, Godot, itch.io, and Steamworks.

## Naming Consistency Rule

If Greybox is rejected, rename every public artifact to the selected fallback in
one migration. Do not mix primary and fallback names in package manifests,
Asset Store listings, docs, legal templates, or generated assets.
