<!-- SPDX-License-Identifier: Apache-2.0 -->

# Naming Memo - Workstream 1

Date: May 15, 2026

This is a founder-facing first-pass clearance memo, not legal advice. I checked the official search entry points for USPTO, IP India, and WIPO, then used live RDAP lookups for `.com`, `.gg`, `.studio`, and `.ai`. Official registry portals can be rate-limited, JavaScript-heavy, or challenge-protected, so counsel should repeat the searches before filing.

## Sources Checked

- USPTO official trademark search entry point: <https://www.uspto.gov/trademarks/search>
- IP India official trademark search entry point: <https://ipindia.gov.in/trade-marks-before-you-apply-search-existing-trademarks>
- WIPO Global Brand Database entry point: <https://www.wipo.int/en/web/global-brand-database/index>
- RDAP domain lookups through `https://rdap.org/domain/<domain>`
- Public conflict pointers reviewed: [GREYBOX India class 9](https://www.indiafilings.com/search/greybox-tm-2460445), [GREYBOX cancelled US record](https://www.trademarkia.com/greybox-86401507), [GREYBOX pending US record](https://www.trademarkelite.com/trademark/trademark-detail/98888738/GREYBOX), [PILLAR US software-related record](https://uspto.report/TM/88002434), [PREPLAY cancelled US record](https://furm.com/trademarks/preplay-76340964), and [MECHANIC US record](https://uspto.report/TM/75313535/).

## Ranking

| Rank | Name | Availability | Memorability | Category fit | Notes |
|---:|---|---|---|---|---|
| 1 | Loopforge | Best | Good | Good | No obvious exact USPTO hit surfaced in this pass. `loopforge.gg` returned RDAP 404, while `.com`, `.studio`, and `.ai` are registered. Existing `loopforge.io` usage means counsel should inspect common-law and adjacent AI-tool usage. |
| 2 | Preplay | Medium | Strong | Strong | `preplay.gg` and `preplay.studio` returned RDAP 404; `.com` and `.ai` are registered. Risk: old cancelled PREPLAY mark for simulation software and visible PrePlay sports/mobile-game history. |
| 3 | Greybox | Weak | Very strong | Excellent | `greybox.gg` returned RDAP 404, but `.com`, `.studio`, and `.ai` are registered. Risk signals include GRAYBOX/GREYBOX marks, a US software/services registration, a newer GREYBOX filing, and an India class 9 registration for a computer software platform. |
| 4 | Pillar | Weak | Good | Good | `pillar.gg` returned RDAP 404, but `.com`, `.studio`, and `.ai` are registered. USPTO mirrors show many live and pending PILLAR marks, including software-related records. Crowded and less ownable. |
| 5 | Mechanic | Weak | Medium | Medium | `mechanic.gg` returned RDAP 404, but `.com`, `.studio`, and `.ai` are registered. The word is generic, crowded with mechanic-service marks, and harder to protect for game tooling. |

## Domain Snapshot

| Name | .com | .gg | .studio | .ai |
|---|---|---|---|---|
| Greybox | Registered | RDAP 404 | Registered | Registered |
| Pillar | Registered | RDAP 404 | Registered | Registered |
| Preplay | Registered | RDAP 404 | RDAP 404 | Registered |
| Loopforge | Registered | RDAP 404 | Registered | Registered |
| Mechanic | Registered | RDAP 404 | Registered | Registered |

`RDAP 404` means no RDAP record was returned during this lookup; verify availability with the chosen registrar before purchase.

## Recommendation

Use `Loopforge` as the lowest-risk working commercial name if legal availability is the priority. Use `Preplay` if the founder wants a tighter pre-production/playtest signal and is comfortable clearing sports/game history. Keep `Greybox` only if counsel believes a qualified mark such as `Greybox Studio` can coexist with existing marks and domains, because it has the best category meaning but the highest visible conflict load.

No registration, filing, or open-core rename should happen until founder/legal approval.

## Execution Update

The active working brand is `Greybox` because the founder brief explicitly
chose it as primary. This does not remove the clearance risk above. The local
closed-core shells use Greybox naming for consistency, while public filing,
domain purchase, GitHub organization creation, and open-core rename remain
blocked on legal/credential access.
