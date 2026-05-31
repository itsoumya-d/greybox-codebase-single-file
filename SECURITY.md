# Security Policy

## Reporting a vulnerability

If you believe you have found a security vulnerability in any Greybox Studio repository (`greybox-cloud`, `greybox-pro`, `greybox-marketplace`, `greybox-playtest`, `greybox-brand`, `greybox-unity-plugin`, `greybox-unreal-plugin`, `greybox-godot-plugin`, or `open-design`), please report it privately so we can investigate before public disclosure.

**Preferred channel:** email `security@greybox.studio` (PGP key fingerprint published at `https://greybox.studio/.well-known/security.txt` once the domain is live).

**Acceptable channels until the domain is live:**
- GitHub Security Advisory (Private vulnerability reporting → New advisory) on the affected repo.

**Please do not:**
- Open a public GitHub issue describing the vulnerability.
- Disclose the vulnerability on social media or third-party forums until we have published a fix.
- Test against production endpoints in a way that risks customer data or service availability.

## What to include in your report

- A clear description of the vulnerability and its impact.
- Step-by-step reproduction.
- Affected repository, commit hash, and (where relevant) deployed version.
- Suggested remediation if you have one.

## What you can expect from us

| Stage | Target SLA |
|---|---|
| Initial acknowledgement | within 2 business days |
| Triage + severity assignment | within 5 business days |
| Critical fix in production | within 7 calendar days of triage |
| High-severity fix in production | within 30 calendar days of triage |
| Public advisory (after fix) | coordinated with reporter |

We will credit reporters in the advisory unless requested otherwise.

## Scope

### In scope
- Any code in the public open-source repository (`open-design`).
- Any cloud-hosted service operated by Greybox Studio (once the production environment is live).
- The Unity, Unreal, and Godot plugins shipped from this organization.

### Out of scope
- Vulnerabilities in third-party services (Stripe, WorkOS, Anthropic, OpenAI) — report those to the respective vendor.
- Denial-of-service via rate-limit exhaustion when the rate-limit headers correctly return `429`.
- Issues that require a compromised end-user machine or browser extension.

## Supported versions

| Component | Supported |
|---|---|
| greybox-cloud | latest deployed version |
| greybox-pro | latest published .gbpro bundle format |
| greybox-marketplace | latest deployed version |
| greybox-unity-plugin | latest version on Asset Store / GitHub releases |
| open-design | latest minor release |

Older versions receive critical patches only when the fix is straightforward.

## Hardening conventions

This document is also the canonical pointer for security conventions enforced across the platform:

1. **License validation** must use the Ed25519 signed-token path in production. The legacy prefix-matching fallback (`gbx_indie_*`, etc.) is automatically refused by `hardenLicenseOptionsForProd` in `greybox-cloud/src/security/licenseProdSafety.ts` unless `GREYBOX_CLOUD_ALLOW_PREFIX_FALLBACK=1` is explicitly set.
2. **Mock providers** (e.g. `MockStripeConnectProvider` in `greybox-marketplace/src/payouts/stripeConnect.ts`) refuse to instantiate when `NODE_ENV=production` unless `allowInProduction:true` is passed by a controlled test.
3. **Audit logs** are append-only, hash-chained. Mutation entry points in marketplace + cloud must call `auditLog.append(...)`; integrity is verifiable via `verifyChain()`.
4. **PII redaction** applies to all audit and analytics surfaces. Buyer ids in audit records are SHA-256 hashed (`auditActorId`). Email/phone in playtest records are regex-redacted at write time.
5. **Stripe identifiers** (session ids, payment intent ids) are SHA-256 hashed before being used as public order/payout ids (`hashedStripeKey` in `greybox-marketplace/src/checkout/stripeCheckout.ts`).
6. **CSP headers** must be enabled on the open-design web app in production.
7. **Secret scanning** runs in CI via gitleaks (`.gitleaks.toml` at the repo root).

## Cryptographic primitives

| Use case | Algorithm | Implementation |
|---|---|---|
| Pro module bundle encryption | AES-256-GCM | `greybox-pro/src/bundles/gbpro.ts` |
| Pro module signing | Ed25519 | `greybox-pro/src/bundles/gbpro.ts` |
| License token signing | Ed25519 | `greybox-cloud/src/routers/signedLicenseToken.ts` |
| Audit log chain | SHA-256 | `greybox-marketplace/src/store/auditLog.ts`, `greybox-cloud/src/enterprise/auditLog.ts` |
| Stripe id hashing | SHA-256 (16-char hex) | `greybox-marketplace/src/checkout/stripeCheckout.ts` |
| Playtest PII hashing | SHA-256 (16-char hex) | `greybox-playtest/src/reporter/userStudy.ts` |

Key rotation procedures and HSM integration are tracked in `greybox-cloud/PRODUCTION_GAPS.md`.
