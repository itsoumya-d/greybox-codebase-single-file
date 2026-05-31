# Greybox Marketplace

Closed-core creator marketplace for Greybox Studio.

Alpha scope:

- Listing categories for custom art bibles, custom skills, asset packs,
  templates, Pro modules, and consulting hours.
- Pro module listings accept signed public bundle manifests only; encrypted
  payloads, file bodies, and bundle file inventories are rejected at the API
  boundary.
- Pro module purchases issue high-entropy marketplace entitlements with a
  Greybox license lookup key for later cloud activation; lookup keys do not
  embed buyer ids, module ids, or payload digests.
- `POST /v1/marketplace/entitlements/claim` binds a lookup key to a short
  Greybox license hash so cloud activation can fail closed on stolen keys.
- Public creator storefronts expose active creators, published listings, and
  non-sensitive sales/listing stats for supply discovery.
- Public catalog search supports query, category, tag, creator, limit, and
  offset filters across published listings only.
- Price-band enforcement matching the platform strategy.
- Creator take-rate schedule: 15% below $10K monthly GMV, scaling to 8% above
  $50K monthly GMV.
- Critique-assisted listing review with IP-risk flags and honest AI-assisted
  language checks.
- Mandatory human review for the top 10% of creators by GMV.
- Admin review dashboard with a prioritized human-review queue, severity
  counts, and no listing descriptions, creator emails, Stripe ids, or buyer
  metadata.
- Stripe Connect payout abstraction with a deterministic test provider.
- Creator payout readiness checks for active creator, Stripe Connect account,
  Connect onboarding/transfer status, and tax-profile blockers.
- Stripe Connect Express account, account-link, and transfer request builders
  with stable idempotency keys and no API-key leakage.
- Stripe Tax calculation preview, transaction request evidence, tax-code
  assignment, and tax-profile evidence delegated to payment operations.
- Stripe Checkout session plans for destination charges, application fees,
  automatic tax liability, and Pro-module entitlement previews without
  exposing Stripe secrets.
- Live Stripe Checkout session creation returns the hosted Checkout URL while
  keeping Stripe secrets server-side.
- Idempotent Checkout fulfillment records completed sessions as orders, tax
  evidence, destination-charge payout records, and Pro-module entitlements.
- Admin reconciliation report for orders, payouts, Stripe Tax evidence,
  Checkout destination charges, and Pro-module entitlements.
- Creator settlement reports in JSON or CSV for monthly finance close,
  including gross, platform fee, creator net, payout status, payout settlement
  evidence, and tax evidence.
- Tax compliance reports in JSON or CSV for creator 1099-K ops review,
  buyer-country GST/VAT summaries, missing tax profiles, and missing Stripe
  evidence.
- Admin risk-reserve report for refund, dispute, reserve, direct-transfer, and
  unreserved payout exposure before opening higher-GMV paid traffic.
- Durable refund/dispute risk-event ledger so risk reserve checks can use
  auditable marketplace records instead of spreadsheet-only reported losses.
- Admin launch-readiness report that combines growth targets, catalog depth,
  human review backlog, payout blockers, and tax blockers into one go/no-go
  packet.
- Admin creator-activation report for the 50 selling creators/$25K GMV launch
  target, including repeat sellers, inactive supply, top creators, and payout
  blockers.
- Admin platform-readiness report for the 200 active sellers/$250K monthly GMV
  marketplace milestone, including repeat sellers, concentration, take-rate,
  Checkout order and GMV coverage, review, payout, and tax health.
- Optional file-backed snapshot persistence for marketplace finance records so
  creators, listings, orders, payouts, tax evidence, and entitlements survive
  service restarts.
- Admin marketplace stats for GMV, platform revenue, and creators with at
  least one sale.
- Admin growth target tracking for the 6-month launch milestone: 50 creators
  with at least one current-month sale and $25K current-month GMV.

## Payout Readiness

Admin routes:

- `GET /v1/marketplace/creators/:id/storefront` (public)
- `GET /v1/marketplace/catalog?q=<text>&category=<category>&tag=<tag>&limit=<n>` (public)
- `GET /v1/marketplace/stats`
- `GET /v1/marketplace/growth-targets`
- `GET /v1/marketplace/creators/:id/payout-readiness`
- `POST /v1/marketplace/creators/:id/stripe-connect/onboarding-plan`
- `POST /v1/marketplace/creators/:id/stripe-connect/account-status`
- `POST /v1/marketplace/tax/preview`
- `POST /v1/marketplace/checkout/session-plan`
- `POST /v1/marketplace/checkout/sessions`
- `POST /v1/marketplace/checkout/fulfill`
- `GET /v1/marketplace/creator-activation?monthlyGmvCents=<cents>&activeCreatorsWithSales=<n>&repeatSellers=<n>`
- `GET /v1/marketplace/platform-readiness?monthlyGmvCents=<cents>&activeSellers=<n>&maximumTopCreatorGmvShareBps=<bps>&maximumTopBuyerGmvShareBps=<bps>&minimumCheckoutOrderShareBps=<bps>&minimumCheckoutGmvShareBps=<bps>&minimumSettledPayoutShareBps=<bps>&availableReserveCents=<cents>`
- `GET /v1/marketplace/business-model-proof?monthlyGmvCents=<cents>&activeSellers=<n>&minimumCheckoutOrderShareBps=<bps>&minimumCheckoutGmvShareBps=<bps>&minimumSettledPayoutShareBps=<bps>`
- `GET /v1/marketplace/launch-readiness?monthlyGmvCents=<cents>&activeCreatorsWithSales=<n>&minimumPublishedListings=<n>`
- `GET /v1/marketplace/review-dashboard?limit=<n>`
- `GET /v1/marketplace/reviews?humanReviewRequired=true`
- `GET /v1/marketplace/reconciliation?from=<ms>&to=<ms>`
- `GET /v1/marketplace/settlements?creatorId=<id>&from=<ms>&to=<ms>&format=csv`
- `GET /v1/marketplace/tax-compliance?year=<yyyy>&thresholdCents=<cents>&format=csv`
- `GET /v1/marketplace/risk-reserve?availableReserveCents=<cents>&reportedRefundsCents=<cents>&reportedDisputeCents=<cents>`
- `GET/POST /v1/marketplace/risk-events`
- `pnpm rehearse:stripe-webhooks` runs a local signed Checkout + dispute +
  refund webhook rehearsal and emits a sanitized proof packet.

The onboarding plan returns the exact Stripe Connect account or account-link
request body the cloud service should send with a scoped Stripe secret. Secrets
are never stored in marketplace listings, orders, payouts, or API responses.
Newly created Connect accounts are marked payout-blocked until
`account-status` records `onboardingComplete=true` and `transfersEnabled=true`
from a trusted Stripe account sync or verified webhook. Disabled reasons are
stored as Stripe status codes only, never raw account payloads.

The tax preview returns the exact Stripe Tax calculation request body for the
buyer address and listing category. Paid orders can store Stripe calculation and
transaction identifiers so tax reports reconcile against payment records.

The Checkout session plan returns the exact `POST /v1/checkout/sessions`
payload for the cloud service to execute: one line item, automatic tax enabled,
connected-account tax liability, destination-charge transfer data, platform
application fee, stable idempotency key, and Greybox metadata for webhook
reconciliation.

The Checkout sessions route executes that same plan with `STRIPE_SECRET_KEY`
and returns `{ plan, checkout: { id, url } }`. The open-design daemon should
set `AGDS_MARKETPLACE_URL`, `AGDS_MARKETPLACE_TOKEN`,
`AGDS_MARKETPLACE_CHECKOUT_SUCCESS_URL`, and
`AGDS_MARKETPLACE_CHECKOUT_CANCEL_URL` so web purchases become hosted Checkout
handoffs instead of direct/manual orders.

The fulfillment route expects the cloud layer to verify Stripe's raw-body
webhook signature first, then forward the parsed `checkout.session.completed`
event with an admin token. Dispute/refund webhook routes require the admin token
and verify Stripe's `Stripe-Signature` header against the forwarded raw body when
`GREYBOX_MARKETPLACE_STRIPE_WEBHOOK_SECRET` is configured. They reject unpaid
sessions, incomplete automatic tax, metadata mismatches, and subtotal mismatches.
Replayed events return the stored order and stored high-entropy entitlement
without incrementing GMV or issuing duplicate entitlements.

The launch-readiness route is the operator-facing go/no-go packet for opening
paid marketplace traffic. It fails closed unless the configured GMV and creator
supply targets are met for the current UTC month, the public catalog is deep
enough, human reviews are clear, payouts are unblocked, and tax compliance
issues are below threshold. It returns aggregate counts and structured
remediations only; it excludes customer PII, tax identifiers, Stripe secrets,
admin tokens, and payload material.

The creator-activation route is the supply-growth packet for marketplace ops.
It reports current-month GMV, sellers with at least one sale, repeat sellers,
active versus inactive creators, top creators by GMV, pending human review
load, and selling creators blocked from payout. It omits creator emails, buyer
ids, tax identifiers, Stripe account ids, admin tokens, and bundle payload
material.

The platform-readiness route is the scale-stage marketplace packet for the
200 active sellers and $250K current-month GMV success criterion. It checks
catalog depth, repeat sellers, top-creator and top-buyer GMV concentration,
weighted take rate, Checkout destination-charge coverage by both order count and GMV,
human-review backlog, blocked payouts, tax compliance issues, and risk-reserve
health. Manual/direct orders can prove early demand but do not count as
platform-grade scale unless the configured Checkout order and GMV coverage
thresholds are met. The underlying reconciliation packet must also be ready,
so payout, tax, Checkout, and entitlement ledger errors fail closed before GMV
can be used as business-model proof. Reserve assumptions still have to cover
current GMV, refunds, disputes, and payout exposure. It returns
aggregate seller rows only; it excludes creator emails, buyer ids, tax
identifiers, Stripe account ids, admin tokens, and bundle payload material.

The business-model-proof route returns the marketplace slice of
`GREYBOX_BUSINESS_MODEL_PROOF_JSON` for Greybox Cloud. It maps the same
platform-readiness packet into aggregate `monthlyGmvUsd`, `activeSellers`,
`platformReady`, `sourceBusinessModelReady`, seller/buyer concentration,
`checkoutOrderShareBps`, `checkoutGmvShareBps`,
`settlementPayoutShareBps`, `settlementReady`, `payoutBlockers`,
`taxBlockers`, reconciliation, and risk-reserve fields so Cloud acquisition
readiness never needs marketplace internals. By default, marketplace scale
proof requires at least 90% of creator payout value to be settled, not merely
queued.

The reconciliation route returns pass/warn/fail checks plus structured issues
for settlement review. It verifies that order splits balance, payouts match
creator net, Checkout records point at destination-charge payout and tax
evidence, and paid Pro modules have exactly one active entitlement. Blocked
payouts are warnings so ops can separate ledger integrity from creator
onboarding follow-up.

The settlement route returns creator-level and order-level finance lines. Use
`format=csv` for monthly close or Stripe/Tax ops review. The JSON summary
separates settled and queued payout cents so readiness reports can prove
creator liquidity. The export includes order ids, creator ids, listing ids,
fees, payout status, payout settlement status, Stripe Tax ids, Checkout ids,
and sanitized payout evidence. Manual transfers count as settled only when a
`payout` event receipt backs a real Stripe `tr_...` transfer id and the order,
creator, amount, and currency still match. Checkout destination charges record
payout receipts from the Checkout Session evidence. Mock `po_...`, dry-run
`po_dryrun_...`, and blocked payouts remain queued or blocked for settlement.
The export does not include customer email, buyer addresses, admin tokens,
Stripe API keys, raw Stripe Connect account ids, tax profile ids, or bundle
payload material.

The tax-compliance route returns creator-level filing-readiness summaries,
buyer-country totals for GST/VAT review, and structured issues for missing
creator tax profiles, Stripe Connect accounts, buyer countries, or Stripe Tax
evidence. `thresholdCents` is an operations review threshold, not legal advice;
finance can adjust it as filing rules change. The CSV intentionally excludes
creator emails, buyer addresses, admin tokens, Stripe API keys, and payload
material. JSON reports expose account/profile presence booleans, not raw
provider reference ids.

The risk-reserve route is the finance gate for marketplace scale. It compares
available reserve cash against current-period GMV, reported refunds, reported
disputes, and payout exposure. It fails closed on underfunded reserves, high
refund or dispute rates, and excessive unreserved payout exposure, and it warns
on direct/manual-transfer orders that are not backed by Checkout destination
charges. It returns only aggregate evidence.

The risk-events route records order-linked refunds and disputes with amount,
status, and optional Stripe evidence ids. Risk events persist in the marketplace
snapshot and are automatically included in risk-reserve calculations for the
selected period. The route returns order, creator, listing, amount, status, and
Stripe evidence ids only; it does not expose buyer addresses, customer emails,
admin tokens, Stripe API keys, or payload material.
Refund retries are store-idempotent by order, amount, and Stripe refund id, so
operator retries do not double-count reserve exposure or duplicate audit events.
Stripe refund and dispute webhook replays are idempotent by Stripe evidence id;
full-refund webhook records revoke Pro-module entitlements through the same
audited path as admin refunds, and conflicting replays fail closed before they
can distort risk reserves.
Checkout webhook replays are idempotent only when the stored buyer, listing,
creator, amount, currency, reference, and payment intent still match.

The public catalog and storefront routes expose only active creators and
published listings. They include aggregate sales counts and public listing
metadata, but exclude creator emails, Stripe Connect accounts, tax profiles,
buyer ids, order ids, tax records, admin tokens, and bundle payload material.

Set `GREYBOX_MARKETPLACE_STORE_FILE=/secure/greybox/marketplace/snapshot.json`
to enable atomic JSON snapshot persistence. The API loads the snapshot on
startup and rewrites it after successful creator, listing, order, Checkout,
review approval, entitlement-claim, or risk-event mutations. This is the
local/on-prem durability bridge until the production database is provisioned.
Hosted production refuses to boot unless `GREYBOX_MARKETPLACE_ADMIN_TOKEN`,
`GREYBOX_MARKETPLACE_STORE_FILE`, `GREYBOX_MARKETPLACE_AUDIT_LOG_PATH`, and an
explicit `STRIPE_CONNECT_DRY_RUN=0` or `STRIPE_CONNECT_DRY_RUN=1` are present.
The admin token must be at least 32 non-placeholder characters. Any configured
`STRIPE_SECRET_KEY` must be a live `sk_live_*` key, not a testmode or placeholder
secret. `GREYBOX_MARKETPLACE_STRIPE_WEBHOOK_SECRET` must be a non-placeholder
`whsec_*` signing secret. A Stripe key or injected checkout client is also
required before live Checkout routes can be exposed. `STRIPE_CONNECT_DRY_RUN=1`
is blocked in production unless `GREYBOX_MARKETPLACE_ALLOW_PRODUCTION_DRY_RUN=1`
is also set with `GREYBOX_MARKETPLACE_ALLOW_PRODUCTION_DRY_RUN_REASON` and a
<=24 hour `GREYBOX_MARKETPLACE_ALLOW_PRODUCTION_DRY_RUN_EXPIRES_AT` rehearsal
window.

## Local Commands

```bash
pnpm install
pnpm rehearse:stripe-webhooks
pnpm typecheck
pnpm test
pnpm build
```

## Alpha Acceptance Target

The package must prove the 6-month marketplace motion in miniature: 50 creators
with at least one sale each, $25K GMV/month, review gating, payout instructions,
and tax evidence records.
