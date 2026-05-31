// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { runOnPremSmoke } from '../enterprise/onPremSmoke.js';

const baseUrl = readArgument('--url') ?? process.env.GREYBOX_ONPREM_BASE_URL ?? 'http://localhost:8080';
const auditAdminToken = readArgument('--token') ?? process.env.GREYBOX_AUDIT_ADMIN_TOKEN;

if (!auditAdminToken?.trim()) {
  console.error('GREYBOX_AUDIT_ADMIN_TOKEN or --token is required for the on-prem smoke run.');
  process.exit(2);
}

const report = await runOnPremSmoke({
  baseUrl,
  auditAdminToken,
  secretSamples: [
    process.env.GREYBOX_BILLING_ADMIN_TOKEN,
    process.env.GREYBOX_SCIM_TOKEN,
    process.env.ANTHROPIC_API_KEY,
    process.env.OPENAI_API_KEY,
    process.env.STRIPE_API_KEY,
  ].filter((sample): sample is string => Boolean(sample?.trim())),
});

console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);

function readArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}
