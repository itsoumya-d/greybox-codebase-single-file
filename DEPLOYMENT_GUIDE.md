# Deployment Guide — 2026-05-20

How to take the platform from a clean checkout to a running production deployment. Three audiences:
1. **Operator** — running greybox-cloud + greybox-marketplace as a SaaS.
2. **Self-hoster** — running the open-source studio (`open-design`) on their own hardware.
3. **Customer** — installing the Unity plugin into their Unity project.

---

## Part 1: Operator deployment (SaaS production)

### Prerequisites

- A Stripe account with Connect Custom enabled (for marketplace).
- A WorkOS account (for enterprise SSO/SCIM).
- A Cloudflare account (for R2 bucket + WAF/CDN).
- A Render account (or Fly.io — both are supported).
- A managed Postgres provider (Neon Pro or Render PG). *Optional for beta; required for GA.*
- A Sentry account.
- A PostHog account.
- A Resend account (transactional email).
- A 1Password Teams account (secret management).
- Node 24.x locally (the repos pin `engines.node = ~24`).
- pnpm 10.33.2 (`corepack enable && corepack prepare pnpm@10.33.2 --activate`).

### Step 1 — Generate Greybox signing material

Each cloud deployment owns a **license signing keypair** (Ed25519) and a **Pro module master key** (32 random bytes). Generate them locally and store in 1Password.

```bash
# License signing keypair (Ed25519)
node -e "
const { generateKeyPairSync } = require('node:crypto');
const { writeFileSync } = require('node:fs');
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
writeFileSync('license-signing-private.pem', privateKey.export({ type: 'pkcs8', format: 'pem' }));
writeFileSync('license-signing-public.pem', publicKey.export({ type: 'spki', format: 'pem' }));
console.log('Generated license-signing-{private,public}.pem');
"

# Pro module master key (32 bytes, base64)
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"

# Admin tokens (32 bytes, hex)
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Store every artifact in 1Password under "Greybox Production / Cloud Secrets".

### Step 2 — Provision infrastructure

```bash
# Cloudflare R2 bucket for Pro bundles
# Dashboard → R2 → Create bucket → name: greybox-pro-bundles
# Generate an R2 API token with R2:Edit scope on this bucket only.

# Managed Postgres (skip for beta; required for GA)
# Render dashboard → New → PostgreSQL → standard plan
# Capture DATABASE_URL.

# Resend domain
# Dashboard → Domains → Add → greybox.studio
# Add the DNS records they provide (SPF, DKIM, DMARC).

# Sentry projects
# Create three projects: greybox-cloud, open-design-web, open-design-daemon
# Capture each DSN.
```

### Step 3 — Deploy greybox-cloud

Render is the recommended primary host. The blueprint is `greybox-cloud/infra/render.yaml`.

```bash
# Clone
git clone <your-org>/greybox-cloud
cd greybox-cloud

# Render CLI (optional but recommended)
brew install render
render login

# Apply blueprint
render blueprint apply
```

In the Render dashboard, set every `sync: false` secret from `render.yaml`:

```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
GREYBOX_BILLING_ADMIN_TOKEN=<from step 1>
GREYBOX_CLOUD_ADMIN_TOKEN=<from step 1>
GREYBOX_LICENSE_RECORDS_JSON=<JSON array; can start empty>
GREYBOX_LICENSE_SIGNING_KEYS_JSON={"key-2026-05":"<PEM contents of public key>"}
GREYBOX_PRO_MODULE_SECRET_MASTER_KEY=<from step 1>
WORKOS_API_KEY=...
WORKOS_CLIENT_ID=...
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
SENTRY_DSN=https://...@sentry.io/...
GREYBOX_MARKETPLACE_URL=https://marketplace.greybox.studio  # set after marketplace deploy
GREYBOX_MARKETPLACE_ADMIN_TOKEN=<from marketplace step>
```

**Critical:** Do NOT set `GREYBOX_CLOUD_ALLOW_PREFIX_FALLBACK=1`. The license validator refuses the legacy prefix fallback in production unless this is explicitly opted in. Leave it unset.

Deploy. The service will start with a `/data` persistent disk holding `audit.jsonl`, `scim.jsonl`, `tenants.jsonl`.

Health-check: `https://cloud.greybox.studio/healthz` should return 200.

### Step 4 — Deploy greybox-marketplace

```bash
cd greybox-marketplace
# Similar Render blueprint; create one analogous to greybox-cloud's render.yaml
# Or use Fly.io with a hand-rolled fly.toml.
```

Required env (`greybox-marketplace/.env.example` for the full list):

```
STRIPE_SECRET_KEY=sk_live_...  # SAME account as cloud; Marketplace uses Connect
GREYBOX_MARKETPLACE_ADMIN_TOKEN=<generate fresh>
GREYBOX_CLOUD_URL=https://cloud.greybox.studio
GREYBOX_CLOUD_ADMIN_TOKEN=<from cloud step>
GREYBOX_MARKETPLACE_AUDIT_LOG_PATH=/data/marketplace-audit.jsonl
SENTRY_DSN=<separate marketplace project>
```

The marketplace store **will throw at boot** if you forget to wire a `payoutProvider` in production — that's the intended safety. The store bootstrap (in `src/api/server.ts` or wherever you initialize the store) should look like:

```ts
import { InMemoryMarketplaceStore } from './store/marketplaceStore.js';
import { LiveStripeConnectProvider } from './payouts/stripeConnect.js';
import { FileMarketplaceAuditLog } from './store/auditLog.js';

const store = new InMemoryMarketplaceStore({
  payoutProvider: new LiveStripeConnectProvider({
    apiKey: process.env.STRIPE_SECRET_KEY!,
    dryRun: process.env.STRIPE_CONNECT_DRY_RUN === '1',
  }),
  auditLog: new FileMarketplaceAuditLog(process.env.GREYBOX_MARKETPLACE_AUDIT_LOG_PATH ?? '/data/marketplace-audit.jsonl'),
});
```

For the **first 90 days post-launch**, set `STRIPE_CONNECT_DRY_RUN=1` even with a real key. The `LiveStripeConnectProvider` will emit synthetic queued payouts (visible in audit log) without touching real money. Flip to `0` only after end-to-end Stripe testmode verification.

### Step 5 — Configure Stripe

```
Stripe dashboard:
1. Webhooks → Add endpoint → https://cloud.greybox.studio/v1/stripe/webhook
2. Listen for: checkout.session.completed, invoice.paid, invoice.payment_failed,
   customer.subscription.created/updated/deleted, charge.dispute.created.
3. Reveal the signing secret → set as STRIPE_WEBHOOK_SECRET.

4. Products → Create products + prices for each tier (Indie/Studio/Pro/Enterprise).
   Capture the price IDs and document them in your operator runbook.

5. Connect → Get Started → Custom accounts.
   This unlocks LiveStripeConnectProvider's /v1/transfers endpoint.
```

### Step 6 — Deploy open-design

The web app + daemon ship together. Hosting options:

**A. Render (managed):** Use `open-design/deploy/Dockerfile`. Same render.yaml pattern as cloud.

**B. Fly.io:** Use `open-design/deploy/Dockerfile` with a hand-rolled `fly.toml`.

**C. Self-host (Docker):**
```bash
docker build -t greybox-open-design -f open-design/deploy/Dockerfile open-design
docker run -p 7456:7456 -e AGDS_DATA_DIR=/data -v greybox-data:/data greybox-open-design
```

### Step 7 — DNS

```
A    greybox.studio        → Render landing IP
A    app.greybox.studio    → open-design web Render IP
A    cloud.greybox.studio  → greybox-cloud Render IP
A    marketplace.greybox.studio → greybox-marketplace Render IP
A    docs.greybox.studio   → Mintlify or Docusaurus
TXT  greybox.studio        → SPF/DMARC for Resend
CNAME _dmarc.greybox.studio → DMARC record
```

### Step 8 — Smoke test the production stack

```bash
# Health checks
curl https://cloud.greybox.studio/healthz
curl https://marketplace.greybox.studio/healthz
curl https://app.greybox.studio/

# License validation (will fail closed in prod, by design)
curl -H "Authorization: Bearer gbx_indie_legacy_token" \
  https://cloud.greybox.studio/v1/licenses/validate
# Expected: 401 invalid_license (because no signed record exists yet)

# Sign a real license token (operator-side script)
node -e "
const { generateLicenseToken } = require('@greybox-studio/cloud/dist/routers/signedLicenseToken.js');
// Load the Ed25519 private key, generate a token for 'pro' tier, print it.
"
# Then validate that token round-trips correctly.

# Trigger Sentry test event
node -e "
import { createSentryAdapter } from '@greybox-studio/cloud/dist/observability/sentry.js';
const s = await createSentryAdapter({ dsn: process.env.SENTRY_DSN });
s.captureMessage('smoke test from deploy', 'info');
await s.flush(5000);
"
# Verify the message lands in Sentry dashboard.
```

### Step 9 — Backup + monitoring

```
Render:
- Postgres: nightly snapshots × 30-day retention (enable in dashboard).
- Persistent disks: snapshot before every deploy (Render does this automatically).

Statuspage:
- statuspage.io account → Status page → Add components:
  - app.greybox.studio
  - cloud.greybox.studio
  - marketplace.greybox.studio
- Uptime monitors (Better Stack or Cronitor) pointed at /healthz of each.

Sentry:
- Set up Slack/Discord webhook → Alerts → "Error count > 10 in 5 minutes".
- Release tracking: every deploy uploads source maps via @sentry/cli.
```

### Step 10 — Key rotation (quarterly)

1. Generate new admin tokens, license signing key, Pro module master key (per Step 1).
2. Update the new license-signing-public.pem in `GREYBOX_LICENSE_SIGNING_KEYS_JSON` under a new key id (e.g. `key-2026-08`).
3. Re-sign all active license tokens with the new key.
4. After grace period (30 days), remove the old key from the registry.
5. Rotate admin tokens by updating env, restarting cloud, then rotating in customer integrations.
6. Document the rotation in OPERATIONS.md with timestamp + rotated key ids.

---

## Part 2: Self-hoster (open-design only)

Anyone can run the open-source studio on their own hardware without touching greybox-cloud.

### Quick start

```bash
git clone https://github.com/greybox-studio/open-design  # or current repo URL
cd open-design
corepack enable
corepack prepare pnpm@10.33.2 --activate
pnpm install
pnpm tools-dev start web
# Open http://localhost:7573 (or whatever port tools-dev picks)
```

### Provide your own AI provider keys

Open Settings → Providers → enter your Anthropic / OpenAI / Bedrock keys. Keys never leave your machine; they're stored in `.agds/media-config.json` (override with `AGDS_MEDIA_CONFIG_DIR=<path>`).

### Build for distribution

```bash
pnpm tools-pack mac build --to all      # macOS dmg + zip
pnpm tools-pack win build --to nsis     # Windows installer
pnpm tools-pack linux build --to appimage
```

---

## Part 3: Customer (Unity plugin install)

### Install via Unity Package Manager (UPM)

```
Window → Package Manager → + → Add package from tarball
Select: com.greybox.studio-v0.1.0-alpha.1.tgz
```

The package brings in editor coroutines, Newtonsoft JSON, the new Input System, Addressables, and Unity UI.

### Install via Asset Store (post-Verified Solution submission)

```
Asset Store → "Greybox Studio" → Add to My Assets → Open in Unity → Import
```

### Configure license

```
Edit → Project Settings → Greybox → License
Paste the signed Ed25519 license token issued by your operator deployment
(or for the free-personal tier, the `gbx_free_personal_<id>` token — only the
free tier accepts the prefix form because it triggers a watermark, not real
billing).
```

### Verify the install

```
Window → Greybox → Smoke Test
Should produce a prefab, materials, palette, and an addressables label
in Assets/GreyboxGenerated/. If the smoke test fails, capture the Console
output and file an issue.
```

---

## Troubleshooting

### `MockStripeConnectProvider refused to instantiate in NODE_ENV=production`
You forgot to wire a real `payoutProvider` in the marketplace store bootstrap. See Step 4. This is the intended safety behaviour — it prevents accidental "fake" payouts in production.

### License validation returns 401 for a token that worked locally
You're hitting prod where prefix-only tokens are refused. Either:
- Issue a signed Ed25519 token via the operator-side script and use that, or
- (Dangerous, not recommended) set `GREYBOX_CLOUD_ALLOW_PREFIX_FALLBACK=1` and restart.

### Audit log file grows unbounded
Each marketplace mutation appends a JSONL record. Plan for ~200 bytes per record × ~50 records per order × N orders/month. At 10,000 orders/month, expect ~100MB/month. Rotate yearly; archive to S3 cold storage. Postgres migration (R8 in REMAINING_ISSUES.md) replaces this with a proper indexed table.

### Sentry sends nothing
- Verify DSN is set and reachable: `curl <dsn-host>/api/0/`
- Install the SDK: `pnpm add -w @sentry/node` (it's optional by default to keep dev/CI lean)
- Wire the adapter into your boot path (R2 in REMAINING_ISSUES.md)

### Render deploy fails on `pnpm install --frozen-lockfile`
The lockfile was generated with pnpm 10.33.2. Ensure the Render service env has `corepack enable` in the build command, or pin the Render Node image to one that bundles a compatible pnpm.

### Marketplace `verifyAuditLog().valid === false`
The append-only chain has been tampered with or corrupted. Check the broken record id (returned in the result), inspect surrounding records, and restore from the last good snapshot. The chain cannot be "repaired" — that's the design intent.

---

## CI/CD reference

| Repo | Workflow | Trigger |
|---|---|---|
| greybox-cloud | `.github/workflows/ci.yml` | PR, push to main |
| greybox-pro | `.github/workflows/ci.yml` | PR, push to main |
| greybox-marketplace | `.github/workflows/ci.yml` | PR, push to main |
| greybox-unity-plugin | `.github/workflows/unity-validation.yml` | PR, push to main |
| greybox-unity-plugin | `.github/workflows/release.yml` | Tag push `v*.*.*` |
| open-design | `.github/workflows/ci.yml` (pre-existing) | PR, push to main |
| open-design | `.github/workflows/release-{beta,stable}.yml` (pre-existing) | manual |

Every cloud/marketplace PR runs gitleaks against the shared `.gitleaks.toml`.

---

## Capacity planning

| Tier | Concurrent users (beta) | Concurrent users (GA) | Render plan |
|---|---|---|---|
| Cloud daemon | 50 | 500 | Standard × 2 |
| Marketplace | 25 | 250 | Standard × 1 |
| Web (open-design) | 200 | 2,000 | Standard × 2 |

Postgres: 0.5 GB at beta (file-based today), 5 GB at GA (post-migration). Scale storage before scaling read replicas.

Cloudflare R2: <$1/month at beta (1-2 Pro modules); <$50/month at GA (100K downloads × 5 MB avg).

---

## Roll-back procedure

```
1. Render dashboard → service → Rollback to previous deploy.
2. Wait ~2 minutes for replicas to flip.
3. Verify /healthz returns 200.
4. If schema changed: run the down-migration script captured in the migration PR.
5. Open an incident in statuspage.io with the timestamp + roll-back reason.
6. File a post-mortem within 72 hours.
```

The `LiveStripeConnectProvider` is idempotency-key-aware, so re-running a deploy that fired transfers will not double-pay creators. The audit log chain is also tamper-evident across roll-backs — verify it on the new (rolled-back) deploy.

---

## Final readiness checklist (operator)

- [ ] All secrets in 1Password
- [ ] Trademark filed
- [ ] DNS pointed at production
- [ ] Stripe webhook signing secret set
- [ ] Stripe Connect Custom enabled
- [ ] WorkOS SAML + SCIM verified end-to-end
- [ ] Sentry dashboard receiving events
- [ ] PostHog dashboard receiving events
- [ ] Status page published
- [ ] Uptime monitors firing
- [ ] Audit log chain `verifyChain()` returns `valid: true`
- [ ] License validation rejects unsigned tokens in prod
- [ ] Marketplace bootstrap refuses to start without a real payout provider
- [ ] Render Postgres snapshots enabled
- [ ] Domain forwarded `greybox.com` + `greybox.ai` → `greybox.studio`
- [ ] PRIVACY.md + TERMS.md reviewed by counsel and dated
- [ ] First Pro module bundle signed + uploaded to R2
- [ ] First Unity plugin GitHub Release tagged + .unitypackage downloadable
