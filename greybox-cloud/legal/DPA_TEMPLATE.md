# Greybox Data Processing Addendum Template

Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

This Data Processing Addendum ("DPA") forms part of the agreement between
Greybox Studio ("Processor") and the customer identified in the order form
("Controller").

## 1. Processing Details

- Subject matter: AI-assisted game design, managed inference, engine export,
  collaboration, billing, support, security, and audit services.
- Duration: the subscription term plus deletion/return period.
- Data subjects: customer users, collaborators, playtest participants supplied
  by customer, and customer administrators.
- Personal data: account identifiers, email, organization membership, audit
  events, support correspondence, optional project metadata, and telemetry only
  where customer has opted in.
- Special categories: not intended for processing; customer must not upload
  special-category data without a signed enterprise amendment.

## 2. Processor Commitments

Greybox will process customer personal data only on documented instructions,
including this DPA, the MSA, the order form, and in-product configuration.
Greybox will not sell customer game IP, will not train models on customer data
without a separate explicit opt-in, and will describe outputs as AI-assisted.

## 3. Security Measures

Greybox will maintain appropriate technical and organizational measures,
including tenant isolation, least-privilege access, encryption in transit,
encrypted durable storage, audit logs, PII redaction for logs, signed offline
licenses for on-prem deployments, SCIM offboarding, and incident response.

## 4. Sub-Processors

Greybox may use hosting, authentication, payment, observability, and model
provider sub-processors. Greybox will keep a sub-processor list available to
enterprise customers at `GET /v1/enterprise/subprocessors`, give at least
30 days' notice of material changes where feasible, and remain responsible for
sub-processor performance.

## 5. International Transfers

For EU/EEA, UK, Swiss, India, or other regulated transfers, Greybox will use
the transfer mechanism listed in the order form, such as SCCs, UK IDTA/Addendum,
or another lawful transfer basis. Customer residency region is governed by
`legal/DATA_RESIDENCY.md` and the order form.

## 6. Assistance

Greybox will provide reasonable assistance for data subject requests, DPIAs,
security questionnaires, regulator inquiries, and deletion/export requests.
Where enabled, `POST /v1/privacy/requests` records rights requests in a durable
workflow for access, export, deletion, correction, opt-out, parent/guardian
review, and model-training opt-out handling. `POST /v1/model-training-consent`
records separate explicit opt-ins, opt-outs, and revocations for future Greybox
Native training. `GET /v1/enterprise/retention-report` and
`GET/POST/PATCH /v1/enterprise/legal-holds` document retention exceptions and
active holds for deletion review. `GET /v1/enterprise/privacy-governance`
exposes ROPA, DPIA, and DPO readiness evidence for security and legal review.
`GET /v1/privacy/disclosures` exposes public CCPA/CPRA, COPPA, and India DPDPA
disclosure readiness.
`GET /v1/enterprise/encryption-readiness` exposes KMS, storage encryption,
TLS/HSTS, backup, and secret-manager readiness evidence without raw key
material.
`GET /v1/enterprise/private-network/readiness` exposes private-network
readiness evidence for AWS VPC and Azure VNet peering pilots.
`GET /v1/enterprise/security-questionnaire` generates conservative JSON/CSV
answers for customer security review.
Customer remains responsible for
validating that its use of Greybox complies with GDPR, CCPA/CPRA, COPPA, India
DPDPA, and applicable game-platform rules.

## 7. Breach Notice

Greybox will notify customer without undue delay and, where feasible, within
72 hours after confirming a personal data breach affecting customer data. Notice
will include known facts, affected systems, mitigation steps, and contact point.

## 8. Return And Deletion

On termination or written request, Greybox will return or delete customer data
within 30 days unless retention is required by law, billing records, security
logs, privacy compliance evidence, abuse-prevention needs, or an active legal
hold. Backup deletion follows the normal backup cycle.

## 9. Audit

Enterprise customers may request current SOC 2, ISO 27001, penetration test, or
security documentation when available. Until certification is complete, Greybox
will provide reasonable written evidence and may limit audits to once per year.
The internal readiness map at `GET /v1/enterprise/trust-controls` is evidence
for security review only and is not itself a certification or auditor opinion.

## 10. Signatures

Greybox Studio: __________________ Date: __________

Customer: ________________________ Date: __________
