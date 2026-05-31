# Greybox Trust Controls Evidence Map

Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

This file is auditor-prep evidence, not a SOC 2 report, ISO/IEC 27001
certificate, legal opinion, or substitute for a Vanta/Drata/auditor engagement.

## Product Control

`GET /v1/enterprise/trust-controls` returns the current control map and runtime
evidence. The route is admin protected and covers:

- Tenant identity and access boundary.
- Tamper-evident audit logging.
- Security incident response.
- Encryption and key management readiness.
- Privacy rights intake and fulfillment.
- Subprocessor disclosure.
- CCPA/CPRA, COPPA, and India DPDPA disclosure readiness.
- US/EU/India data-residency operations.
- AWS/Azure private-network access readiness.
- Retention and legal holds.
- ROPA, DPIA, and DPO privacy governance.
- Usage metering and billing reconciliation.
- On-prem deployment readiness.
- AI safety, explicit model-training consent, and log minimization.

Each control includes frameworks, owner, status, evidence items, and the next
action when evidence is partial. The report intentionally includes a
non-certification disclaimer.

`GET /v1/enterprise/trust-packet` wraps this map with subprocessors, privacy
disclosures, privacy governance, retention policies, document pointers, and
open risks for enterprise diligence.

`GET /v1/enterprise/security-questionnaire` converts the same packet into
conservative JSON or CSV answers for customer security questionnaires.

`GET /v1/enterprise/certification-roadmap` maps the same trust evidence to the
month 6 GDPR/privacy, month 12 SOC 2 Type I, month 18 SOC 2 Type II, and month
24 ISO 27001 roadmap. It never claims certification.

## Current Framework Pointers

- AICPA/CIMA describes SOC 2 reports as control assurance for systems relevant
  to security, availability, processing integrity, confidentiality, and privacy.
- ISO/IEC 27001:2022 is the current ISO information security management system
  standard and is used here as the ISMS readiness target.

## Evidence

- `tests/trust-controls.test.ts` verifies admin protection, configured evidence
  aggregation, and the non-certification disclaimer.
- `tests/trust-packet.test.ts` verifies the combined enterprise diligence
  packet and open-risk summary.
- `tests/security-questionnaire.test.ts` verifies generated questionnaire
  answers, CSV export, admin protection, and secret minimization.
- `tests/certification-roadmap.test.ts` verifies certification-roadmap
  milestone months, costs, blockers, admin protection, and caveats.
- `tests/audit-log.test.ts` verifies tamper-evident audit-chain export.
- `tests/incidents.test.ts` verifies incident authorization, GDPR breach clocks,
  containment workflow, and sanitized incident audit entries.
- `tests/encryption-readiness.test.ts` verifies KMS, storage encryption,
  TLS/HSTS, backup, secret-manager evidence, endpoint auth, and secret
  minimization.
- `tests/privacy-requests.test.ts` verifies rights intake and fulfillment
  evidence generation.
- `tests/subprocessors.test.ts` verifies default disclosure, filters,
  deployment overrides, and the public registry endpoint.
- `tests/privacy-disclosures.test.ts` verifies public disclosure readiness for
  CCPA/CPRA, COPPA, and India DPDPA launch requirements.
- `tests/data-residency-readiness.test.ts` verifies US/EU/India readiness
  checks and blocked cross-region evidence.
- `tests/private-network-readiness.test.ts` verifies AWS VPC and Azure VNet
  readiness checks, filters, overrides, and admin protection.
- `tests/privacy-governance.test.ts` verifies ROPA, DPIA, DPO evidence,
  endpoint protection, and sanitized defaults.
- `tests/retention.test.ts` verifies default retention policies, legal-hold
  blocking, sanitized hold audits, and privacy fulfillment integration.
- `tests/billing.test.ts` and `tests/billing-jobs.test.ts` verify metering and
  billing reconciliation paths.
- `tests/onprem-readiness.test.ts` verifies on-prem install evidence.
- `tests/pii-redactor.test.ts` and `tests/safety.test.ts` verify AI safety and
  log minimization regressions.
- `tests/model-training-consent.test.ts` verifies explicit opt-in rules,
  default opt-out behavior, revocation, and sanitized consent audit entries.

## Official Reference Pointers

- AICPA/CIMA SOC 2 topic:
  https://www.aicpa-cima.com/topic/audit-assurance/audit-and-assurance-greater-than-soc-2
- ISO/IEC 27001:2022:
  https://www.iso.org/standard/27001
