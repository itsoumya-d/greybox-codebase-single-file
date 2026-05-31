# Greybox Studio — Suite Implementation Strategy

This document serves as the master implementation plan and strategy guide for the Greybox Studio product suite, aligning with the elite product strategy and UX principles.

---

## SECTION 1: MOBILE APPS (1–10)

*Note: Greybox Studio is currently a developer-focused desktop, web, and engine integration suite. To establish category-defining leadership, we define the product strategy for **Greybox Companion**, the mobile application designed to expand our ecosystem.*

### App 1: Greybox Companion (Mobile Preview & Analytics)

#### Product Vision
Greybox Companion is a mobile application for iOS and Android that allows game directors, producers, and designers to monitor real-time playtest telemetry, review AI-generated design assets, and approve merges to the main engine branch on the go.
- **Unique Positioning**: The only mobile app that connects directly to in-engine Unity/Unreal instances, allowing real-time scene inspection.
- **Monetization**: Included in the **Studio** and **Enterprise** SaaS subscriptions.
- **AI Advantage**: Predictive anomaly detection on playtest telemetry, sending push notifications when live testers encounter blockages.

#### UX System
- **Aesthetic**: Premium dark mode with HSL-tailored accents (Emerald green for active links, Amber for conflicts). High contrast, high information density.
- **UX Feel**: Fast and transactional. Minimizes cognitive load through action-card feeds.
- **Onboarding Decision**: 2-step onboarding (auth via WorkOS SSO followed by workspace selection) to minimize friction for enterprise users.

#### UI Structure (Screens)
1. **Dashboard (Home)**: Displays active projects, recent AI design changes, and telemetry summary.
2. **Asset Inspector**: Interactive 3D preview of `.gameview.json` node trees and mesh prefabs.
3. **Branch/Merge Manager**: Review incoming changes from the web/desktop editor with diff views and one-tap merge approvals.
4. **Playtest Monitor**: Real-time graphs showing tester retention, session lengths, and bug reports.
5. **Settings & Org**: Team seat allocation, API key management, and billing dashboard.

#### AI Features
- **Smart Summarization**: Summarizes design conflict diffs into human-readable bullet points.
- **Predictive Playtest Alerts**: Machine learning model flags high-churn game regions before developers review manual telemetry.

#### Competitor Comparison
- **Competitors**: Rosebud AI, Ludo AI, Unity Cloud mobile dashboard.
- **Gaps Met**: Competitors do not support real-time 3D asset inspection or branch merges.

#### Task List
- [ ] Research: Mobile 3D rendering engines (Three.js/React Native vs. Native Swift/Kotlin UI).
- [ ] Solution: Build lightweight mobile app shell with WorkOS SSO and R2 bucket asset viewing.
- [ ] Implementation Steps:
  1. Define React Native workspace.
  2. Implement WorkOS auth endpoints.
  3. Wire Expo-Three for 3D model viewing.
- [ ] Animations: Smooth card expand transitions (200ms ease-out) to reduce spatial disorientation.

---

## SECTION 2: WEB APPS (1–10)

### App 1: Greybox Web Studio (`open-design/apps/web`)

#### Product Vision
The primary workspace for editing, generating, and reviewing AI game design assets. It bridges the gap between text prompts and structured, engine-importable `.gameview.json` representations.
- **Unique Positioning**: Low-code design platform that exports directly to Unity/Unreal native components.
- **Monetization**: Usage-based seat pricing ($29/user/month Indie, $99/user/month Studio).
- **AI Advantage**: In-context LLM generation of entire game levels, dialogue trees, and combat systems.

#### UX System
- **Aesthetic**: Glassmorphism dashboard, dynamic neon color palette, clean Outfit typography.
- **UX Feel**: Immersive and creative. Smooth micro-animations on interactive nodes.
- **Onboarding Decision**: 3-step onboarding (role select -> engine select -> first project template instantiation) to curate the initial template gallery.

#### UI Structure (Screens)
1. **Welcome / Onboarding**: Role and engine customization.
2. **Project Dashboard**: List of designs, collaborators, and sync status.
3. **Visual Editor (Canvas)**: Infinite node-based canvas for level layout, recipe crafting, and flow charts.
4. **Stripe Billing Portal**: Indie/Studio checkout and invoice management.
5. **Admin Console**: Team member seats, usage metering metrics, and API tokens.

#### AI Features
- **In-Canvas Co-pilot**: Continuous generation of asset layouts based on natural language prompts.
- **Recipe Translation**: Automatically converts raw game design concepts into structured JSON configurations.

#### Competitor Comparison
- **Competitors**: Miro, Figma, Rosebud AI.
- **Gaps Met**: None of the design tools connect back to game engines with round-trip safety.

#### Task List
- [ ] Research: Collaborative canvas design systems and WebGL editor performance.
- [ ] Problem: Missing Stripe Checkout button on dashboard; lack of light theme.
- [ ] Solution: Add Indie subscription button; implement standard light theme stylesheet variables.
- [ ] Implementation Steps:
  1. Install Stripe JS SDK and wire Checkout button.
  2. Map HSL color tokens to `[data-theme="light"]` wrapper.
  3. Test responsive layout on mobile/tablet viewports.
- [ ] Animations: Spring physics on canvas panning and node connections.

### App 2: Greybox Cloud Platform (`greybox-cloud`)

#### Product Vision
The multi-tenant secure backend that powers database persistence, licensing, Stripe metering, telemetry ingestion, and AI model orchestration.
- **Unique Positioning**: Highly scalable, SOC2-compliant backend with hash-chained audit logs.
- **Monetization**: High-volume usage-based billing infrastructure.
- **AI Advantage**: Dynamic model routing to minimize latency and inference cost.

#### UX System
- **Aesthetic**: CLI-friendly developer dashboard, high readability font (JetBrains Mono).
- **UX Feel**: Calm, reliable, and secure.

#### UI Structure (Endpoints & Management)
1. **Tenant Store**: Organisation isolation.
2. **Billing API**: Stripe Webhook translator.
3. **Telemetry Ingestion**: Direct pipeline from Sentry and PostHog.
4. **Audit Log Console**: Splunk/CSV export of all data mutations.

#### Task List
- [ ] Research: Multi-tenant database partitioning strategies and SOC2 compliance paths.
- [ ] Problem: SQLite file storage must be migrated to Postgres for production scaling.
- [ ] Solution: Finalize Postgres TenantStore persisters and cut over migrations.

---

## SECTION 3: GLOBAL DESIGN SYSTEM

### Shared Principles
1. **Developer First**: Clean, responsive layouts that load in under 1.5 seconds.
2. **Engine Alignment**: Design systems mimic established game engine terminology (prefabs, nodes, scenes, components).
3. **Accessibility**: All interfaces comply with WCAG 2.1 AA standards, ensuring clear color contrast and screen-reader accessibility.

### Performance Standards
- **LCP (Largest Contentful Paint)**: < 1.2s on desktop, < 2.0s on mobile.
- **FID (First Input Delay)**: < 100ms.
- **Canvas Render Rate**: 60fps locked on interactive pages.

### Animation System
- **Transitions**: 150ms cubic-bezier(0.4, 0, 0.2, 1) for normal element toggles.
- **Springs**: Tension 170, friction 26 for spatial canvas elements.

---

## SECTION 4: FILE ORGANIZATION

### Clean Folder Structure
```
/Users/soumyadebnath16/Developer/game desine/
├── open-design/               # Main SaaS front-door and editor core
│   ├── apps/
│   │   ├── web/               # Next.js web application
│   │   └── desktop/           # Electron desktop wrapper
│   └── packages/              # Shared TS UI and utility libraries
├── greybox-unity-plugin/      # Unity Verified Editor Moat
├── greybox-cloud/             # Multi-tenant API backend
├── greybox-marketplace/       # Stripe Connect payouts system
├── greybox-pro/               # Encrypted commercial bundle authoring
└── greybox-brand/             # Brand SVGs and design system tokens
```

### Code Modularization
- **Strict Separation of Concerns**: Logic is isolated into standalone npm packages/modules.
- **Zero-Dependency Core**: Core C# and TS parser logic does not rely on third-party frameworks.

### Documentation System
- **API Reference**: Generated automatically via OpenAPI (Swagger).
- **Architecture Log**: Every major engineering design decision documented in `/docs/architecture/`.
