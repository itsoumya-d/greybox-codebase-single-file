# Brand / Trademark / Domain Sprint

**Date:** 2026-05-19
**Source:** Audit against `GREYBOX_COMPLETE_ANALYSIS_2026-05-19.md` §4.4
**Effort:** 1–2 weeks + ~$2K legal
**Projected lift:** +2–3x acquisition multiple — moves deal from acqui-hire to company purchase

---

## 1. Brand kit state — 70% complete

| Component | Status | Notes |
|---|---|---|
| Logo system | ✓ Finalized | 5 SVGs (mark, wordmark, lockup × 2, inverse) + mark-mono |
| Design tokens | ✓ Complete | color.json (5 brand + 4 semantic + 3 engine), space, radius, shadow, type |
| Typography | ✓ Specified | Inter Tight 700 (wordmark), Inter (body), JetBrains Mono (code) |
| Tagline/voice | ✓ Defined | "AI-assisted design layer for shipped games" + designer-first vocabulary in BRAND.md |
| Social assets | ✓ Partial | og-image.png, social-square.png, favicon.ico |
| Website / marketing collateral | ✗ Missing | No homepage, no landing pages |
| Style enforcement | ✓ Documented | Clear-space (1× mark), min size 16px, no effects, color constraints |

Logo variants: mark (4×4 greyscale grid + Spark Orange `#FF6B35` play triangle), wordmark (lowercase "greybox" in Inter Tight 700), horizontal + vertical lockups, mono + inverse. **All production-ready SVGs.** No effects/stylization permitted — this strengthens distinctiveness for trademark.

---

## 2. The critical descriptiveness risk

**"Greyboxing"** is a native game-dev term for blockout level design (untextured cube placeholders). This creates a real challenge for trademark registration.

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| USPTO rejects "Greybox" word mark as descriptive in class 9 | ~60% | Delay + fallback rebrand | File stylized mark (mark + wordmark) simultaneously; use class 42 SaaS use evidence for acquired-distinctiveness argument |
| Competitor argues genericide via "greybox" as verb | Medium | Long-term enforcement burden | Enforce "AI-assisted greyboxing" language internally; never use "greybox" as a verb in own copy |
| EU/India examiners reject more aggressively than USPTO | Medium | Multi-jurisdiction delay | File fallback names (Pillar, Preplay, Loopforge) in parallel counsel searches |

---

## 3. Domain shortlist (priority order)

Defer registrar WHOIS lookups to you. Existing A records observed (May 18) suggest some are in use.

| # | Domain | TLD | Strength | Trade-off | Annual cost |
|---|---|---|---|---|---|
| 1 | `greybox.studio` | `.studio` | Vertical marker reduces descriptiveness; premium | Niche TLD, higher cost | $45–60 |
| 2 | `greybox.com` | `.com` | Highest recall, fallback standard | Likely expensive; reinforces descriptiveness | $8–12 or auction |
| 3 | `greybox.ai` | `.ai` | AI-native positioning | Premium $79–150; less game-native | $79–150 |
| 4 | `greybox.gg` | `.gg` | Gaming-native | Registry collision risk; weaker brand weight | $25–35 |
| 5–8 | Fallback names | `.studio` | If "Greybox" rejected | Requires counsel clearance first | $45–60 each |

**Recommendation:** secure `.studio` + `.com` (if affordable) for primary name only. Fallback domains contingent on counsel decision.

**Fallback name priority:** Pillar > Preplay > Loopforge > Mechanic.

---

## 4. Trademark filing strategy

**Jurisdictions:** US (USPTO) primary; EU (EUIPO) + India (IP India) secondary.

**Classes (3 total):**

| Class | Coverage | Why |
|---|---|---|
| 9 | Downloadable software, Unity/Unreal/Godot plugins, SDKs | Core product |
| 42 | SaaS, cloud design sync, managed inference, engineering services | Web app + paid tiers |
| 41 | Training, tutorials, courses, workshops, creator materials | Education distribution (M6–M12) |

**Mark strategy:**
- **Primary:** word mark "GREYBOX"
- **Secondary (file after primary):** stylized mark = lowercase wordmark + 4×4 grid + Spark Orange play triangle

Word mark alone is weak given descriptiveness risk; stylized mark is visually distinctive and helps acquired-distinctiveness argument.

**Costs:**

| Line item | Cost |
|---|---|
| USPTO TEAS Plus filing (3 classes × $250) | $750 |
| Attorney review + clearance search (US/EU/India) | $1,200–1,500 |
| Specimen prep (live tool screenshot with mark visible) | $0–200 |
| **Subtotal trademark** | **~$2,000–2,500** |

**Timeline:**

| Phase | Duration |
|---|---|
| Counsel clearance search (US/EU/India) | 1–2 weeks |
| File USPTO word mark | Day 1 post-clearance — establishes constructive use date |
| Examination response | 3–4 months — expect office action re: descriptiveness |
| Publication if approved | 30 days |
| Registration | 10–12 months total |
| Stylized mark filing | Month 2–3 |
| EU + India filings | Months 2–4 |

**Descriptiveness mitigation:**
1. Build secondary-meaning evidence now (screenshots, press, testimonials showing "Greybox" = your tool, not generic greyboxing)
2. Emphasize Spark Orange play triangle distinctiveness in stylized filing
3. Lean on class 42 SaaS (managed inference + cloud sync are not generic greyboxing)
4. Supplemental Register as fallback (after 5 years' use, can move to Principal)

---

## 5. GitHub organization plan

**Target org:** `@greybox-studio`

**Repos to transfer (8 total):**
- `greybox-pro` (encrypted payloads)
- `greybox-unity-plugin` (~5.2K C#)
- `greybox-unreal-plugin` (headers only — consider archiving)
- `greybox-godot-plugin` (skeleton — consider archiving)
- `greybox-cloud` (~33K TS)
- `greybox-marketplace` (~8.6K TS)
- `greybox-brand` (this repo — design tokens + logo)
- `greybox-playtest` (~3.6K TS)

**Migration sequence (week 1):**
- Day 1: create org, set private-by-default + 2FA required
- Days 2–4: transfer repos one by one; update remote URLs in local clones; verify CI/CD webhooks; update hardcoded URLs in code (especially `greybox-cloud` inference endpoints)
- Day 5: branch protection on `main`, audit access controls, add team members if any

**No-break rule:** keep old personal-namespace repos for at least 30 days after transfer so existing clones don't break.

---

## 6. Cost summary

| Category | Item | Cost |
|---|---|---|
| **Legal — trademark** | USPTO TEAS Plus (3 classes) | $750 |
| | Attorney clearance + review (US/EU/India) | $1,200–1,500 |
| | Specimen prep | $0–200 |
| | **Subtotal** | **$2,000–2,500** |
| **Domains** | `greybox.studio` (1 yr) | $50–60 |
| | `greybox.com` (1 yr, if available) | $8–1,000+ (auction risk) |
| | `.ai` or `.gg` (optional) | $25–150 |
| | **Subtotal** | **$50–200 min; $200–1,100+ all TLDs** |
| **GitHub** | Org + 8 private repos (free tier) | $0 |
| **Total** | | **~$2,100–2,700 expected; up to ~$3,600 with `.com` auction** |

Within the ~$2K cited in the strategic analysis when `.com` is not contested.

---

## 7. Week-1 action checklist

**Owner:** Founder (you). All actions require human execution — I can draft content but not file or buy on your behalf.

### Day 1 — Monday
- [ ] Email 2–3 trademark counsel firms (game-dev/SaaS experience preferred). Request expedited clearance search for "Greybox" in USPTO classes 9, 42, 41. Attach `naming-memo.md` and `trademark-filing-packet.md`.
- [ ] Create GitHub org `@greybox-studio`; confirm private-by-default
- [ ] Confirm domain registrar account active (test that you can buy `.studio` + `.com`)

### Day 2 — Tuesday
- [ ] Follow up with counsel if no response; escalate to expedited tier
- [ ] Transfer `greybox-brand` repo to org; verify CI; update local clone remote URL

### Day 3 — Wednesday
- [ ] If counsel clears "Greybox" → proceed to filing prep. Otherwise flag fallback decision with counsel.
- [ ] Prepare USPTO specimen: 300 DPI PNG/PDF screenshot of web app or plugin showing mark + wordmark visible
- [ ] Transfer remaining 7 repos to org; verify CI per repo

### Day 4 — Thursday
- [ ] On counsel approval → file USPTO TEAS Plus word mark in classes 9 + 42. Record application number.
- [ ] Immediately after filing → buy `greybox.studio` (and `greybox.com` if affordable). Park DNS to Vercel or hosting endpoint.
- [ ] Update READMEs in all repos: "© 2026 Greybox Studio" + "Trademark pending"

### Day 5 — Friday
- [ ] Confirm all 8 repos transferred + CI working
- [ ] Update git author config for future commits: `yourname@greybox.studio` (or the domain you secured)
- [ ] Document filing dates + application numbers in `trademark-filing-packet.md`; commit under new org
- [ ] Set up trademark status dashboard (Notion or GitHub Wiki): track USPTO/EUIPO/IP India numbers + decision dates

### Contingency — if counsel rejects "Greybox"
- [ ] Pick first counsel-approved fallback (Pillar > Preplay > Loopforge > Mechanic)
- [ ] Rename all repos + update naming-memo / domain-readiness docs (1–2 day bulk migration)
- [ ] File fallback trademark immediately
- [ ] Update READMEs + docs (do NOT mix old and new names anywhere)

---

## 8. Weeks 2–4 follow-up

- **Week 2:** file stylized mark (wordmark + grid + play triangle) at USPTO once word-mark receipt is in hand
- **Weeks 2–3:** coordinate EU (EUIPO) + India (IP India) applications with counsel; file by end of week 3 if budget allows
- **Weeks 3–4:** point `greybox.studio` at deployed web app — gives USPTO a live specimen visible from filing date
- **Week 4:** version-cache logo assets in this brand repo; ensure Unity + Unreal package manifests reference correct org namespace

---

## 9. Acquired-distinctiveness evidence — start collecting now

For future trademark defense and office-action response:

- [ ] Screenshots of live web app with logo visible (USPTO specimen)
- [ ] Press mentions, blog posts, case studies referencing "Greybox" by name
- [ ] User testimonials (Discord, Twitter, itch.io) mentioning "Greybox"
- [ ] Usage logs: how many user projects are named "Greybox" or use the mark
- [ ] Awards or recognition (helps acquired-distinctiveness if filing delays)

---

## 10. Valuation math

- Floor today (acqui-hire, 32% closed-source completion): $500K–$3M
- After brand/trademark/domain locked: +2–3x acquisition multiple per strategic analysis
- At $500K floor: registered mark + domain + org adds **$1–$1.5M** in valuation
- Cost: ~$2.5K + 2 weeks of execution

**Highest ROI per dollar of any Tier-1 item.**
