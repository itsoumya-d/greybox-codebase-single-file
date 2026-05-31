# Greybox Studio — Privacy Policy (Template)

**Status:** TEMPLATE. This document must be reviewed and finalized by counsel before any customer signup goes live. The structure below is industry-standard for an AI-native SaaS that handles PII and payment data; the language is conservative and intended to survive a U.S. + EU launch.

**Effective Date:** TBD by counsel.
**Operator:** Greybox Studio Inc. (Delaware C-corp, formation pending).
**Contact:** `privacy@greybox.studio`.

## 1. Information We Collect

### 1.1 Account information
- Email address (required for signup).
- Name (optional, for collaborative surfaces).
- Organization affiliation (for Studio + Enterprise tiers).
- Payment method metadata (last 4, brand, expiry) — full card data never touches Greybox infrastructure; it is handled exclusively by Stripe.

### 1.2 Content you create
- Game design artifacts (GDDs, art bibles, level boards, HUDs, palettes, prompts) you author or generate within the studio.
- Files you upload (reference images, audio, video).
- Comments and collaboration messages.

### 1.3 Usage data
- Pages visited, features used, errors encountered.
- IP address (truncated to /24 for IPv4, /48 for IPv6) for security and analytics.
- Browser type, OS, screen resolution (for layout adaptation).
- Inference proxy: tokens consumed per model (counts only; not request bodies).

### 1.4 Telemetry
- Sentry (errors): stack traces, user id (hashed), and the URL of the error. Request bodies and form values are scrubbed before transmission.
- PostHog (product analytics): page views, click events, feature usage. Opt-in only.

### 1.5 We do **not** collect
- Government identifiers (SSN, passport, driver's license).
- Biometric data.
- Children's information (service is not directed at users under 13/16 per jurisdiction).
- Precise geolocation (no GPS or coordinate-level data).

## 2. How We Use Information

- To provide and improve the service.
- To process payments via Stripe (we never store full card data).
- To send transactional emails (signup confirmation, password reset, billing receipts, invoices).
- To send product updates if you have opted in.
- To investigate and prevent fraud, abuse, and security incidents.
- To comply with legal obligations (tax reporting, subpoena response, etc.).

We do **not** sell personal information. We do **not** train AI models on customer content.

## 3. Sharing

We share information only with:
- **Payment processors:** Stripe (billing, refunds, payouts), Stripe Connect (creator marketplace payouts).
- **Inference providers:** Anthropic, OpenAI, AWS Bedrock — only when you use the managed inference SKU. Request bodies for the BYOK tier go directly to your provider; Greybox is not an intermediary.
- **Identity providers:** WorkOS (SSO/SCIM for Enterprise tier).
- **Communication providers:** Resend or Postmark (transactional email).
- **Observability:** Sentry (errors), PostHog (analytics — opt-in).
- **Hosting:** Render or Fly.io (US-East primary; EU region pending).
- **Authorities:** in response to a valid legal request, with notice to the affected user where legally permissible.

A current subprocessor list is published at `https://greybox.studio/subprocessors` (pending domain).

## 4. Your Rights

### 4.1 All users
- Access: request a copy of your personal data.
- Correction: amend inaccurate information.
- Deletion: request account closure and data deletion. Some data (audit logs, billing records) may be retained for legal/tax compliance; this is itemised on request.
- Portability: export your projects as a `.zip`.
- Opt-out of marketing communications.
- Opt-out of product analytics (PostHog).

### 4.2 EU / UK residents (GDPR)
- Right to object to processing.
- Right to restriction of processing.
- Right to lodge a complaint with a supervisory authority.
- Right not to be subject to solely automated decisions with legal effect (we make no such decisions).

### 4.3 California residents (CCPA / CPRA)
- Right to know.
- Right to delete.
- Right to opt-out of "sale" or "sharing" — we do not sell or share personal information for targeted advertising.
- Right to non-discrimination.

### 4.4 How to exercise rights
Email `privacy@greybox.studio` from the email address associated with your account. We respond within 30 days (GDPR) or 45 days (CCPA).

## 5. Data Retention

| Data | Retention |
|---|---|
| Account information | While account is active + 90 days |
| Content (projects, files) | While account is active + 30 days after closure |
| Billing records | 7 years (legal/tax obligation) |
| Audit logs (security, compliance) | 7 years |
| Inference logs (tokens consumed) | 13 months (rolling) |
| Sentry error data | 30 days |
| PostHog analytics | 13 months |
| Backups | 30 days |

## 6. Security

We use industry-standard practices including TLS for all transit, AES-256-GCM for sensitive data at rest, Ed25519 signing for license + Pro module integrity, and append-only hash-chained audit logs for tamper-evidence. See `SECURITY.md` for technical detail and `https://greybox.studio/security` for the public posture page (pending domain).

Despite our efforts, no system can guarantee absolute security. Notify us immediately at `security@greybox.studio` if you believe your account has been compromised.

## 7. International Transfers

Greybox is operated from the United States. EU data is transferred to the U.S. under Standard Contractual Clauses (SCCs). An EU region (Frankfurt) is on the roadmap.

## 8. Cookies

We use functional cookies (auth, preferences) and — only with consent — analytics cookies (PostHog). A cookie banner is shown to first-time visitors.

## 9. Changes to This Policy

We will notify users by email at least 30 days before any material change takes effect.

## 10. Contact

Greybox Studio Inc.
Privacy team: `privacy@greybox.studio`
General: `hello@greybox.studio`
EU representative: TBD

---
**Internal note:** This template must be reviewed by counsel and finalized before public launch. Open items: name + address of EU representative, DPA template for enterprise, cookie consent vendor selection (currently planning to use cookie-only with no third-party manager — confirm with counsel).
