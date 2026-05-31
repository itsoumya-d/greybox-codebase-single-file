# Greybox Certification Roadmap

Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

This roadmap is readiness evidence only. It is not a SOC 2 report, ISO 27001
certificate, regulator filing, legal opinion, auditor engagement letter, or
proof that any certification has been achieved.

## Product Control

`GET /v1/enterprise/certification-roadmap` is admin protected and converts the
current trust packet into the compliance timeline required for enterprise
sales:

- Month 6: GDPR readiness, including ROPA, DPIA, DPO, and rights assistance.
- Month 6: CCPA/CPRA, COPPA, and India DPDPA disclosure readiness.
- Month 12: SOC 2 Type I readiness.
- Month 18: SOC 2 Type II readiness.
- Month 24: ISO/IEC 27001 readiness.

The endpoint returns target months, due dates, approximate costs, owners,
framework pointers, pass/warn/fail evidence, blockers, next actions, and an
explicit `certificationClaims: false` field.

## Operating Use

Use this packet in founder-led enterprise sales and auditor-prep meetings to
separate what is already implemented from what still needs counsel, production
configuration, auditor selection, or certification-body engagement. Do not send
it to customers as a certification artifact.

## Evidence

- `src/enterprise/certificationRoadmap.ts` builds the roadmap from the current
  enterprise trust packet.
- `tests/certification-roadmap.test.ts` verifies milestone months, costs,
  admin protection, overdue blocker behavior, and the non-certification caveat.
- `legal/TRUST_CONTROLS.md` remains the underlying SOC 2 / ISO evidence map.
- `legal/PRIVACY_GOVERNANCE.md`, `legal/PRIVACY_DISCLOSURES.md`, and
  `legal/PRIVACY_RIGHTS.md` remain the underlying privacy readiness evidence.
