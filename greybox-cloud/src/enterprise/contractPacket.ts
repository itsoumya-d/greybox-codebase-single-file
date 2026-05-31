// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export type ContractDocumentStatus = 'ready-to-sign' | 'supporting-evidence' | 'blocked';

export interface ContractClauseCheck {
  id: string;
  label: string;
  status: 'pass' | 'fail';
  evidence: string;
}

export interface ContractPacketDocument {
  id: string;
  title: string;
  path: string;
  status: ContractDocumentStatus;
  sha256: string | null;
  bytes: number;
  requiredSignature: boolean;
  clauseChecks: ContractClauseCheck[];
  blockingIssues: string[];
}

export interface EnterpriseContractPacket {
  generatedAt: string;
  disclaimer: string;
  summary: {
    documents: number;
    readyToSign: number;
    supportingEvidence: number;
    blocked: number;
    blockingIssues: number;
  };
  documents: ContractPacketDocument[];
  orderFormFields: string[];
  signingSequence: string[];
}

export interface ContractPacketOptions {
  root?: string;
  now?: Date;
}

interface ContractDocumentDefinition {
  id: string;
  title: string;
  path: string;
  requiredSignature: boolean;
  supportingEvidence?: boolean;
  clauses: Array<{
    id: string;
    label: string;
    patterns: RegExp[];
  }>;
}

const contractDocuments: ContractDocumentDefinition[] = [
  {
    id: 'order-form',
    title: 'Enterprise Order Form',
    path: 'legal/ORDER_FORM_TEMPLATE.md',
    requiredSignature: true,
    clauses: [
      clause('customer-term', 'Customer identity, billing address, and term', /## 1\. Customer And Term/u, /Customer legal name/u, /Billing address/u, /Initial term/u, /Renewal term/u),
      clause('enterprise-tier', 'Enterprise tier, seats, and ACV', /## 2\. Subscription Tier And Seats/u, /Purchased tier: Enterprise plan/u, /Minimum annual contract value: \$40,000/u, /Seat count/u),
      clause('managed-inference', 'Managed inference tokens, rates, and provider preference', /## 3\. Managed Inference/u, /included tokens, overage rates, and provider preference/u, /Preferred provider/u, /BYOK fallback/u),
      clause('no-training-default', 'No training without separate explicit opt-in', /will not train models on customer data without a separate explicit\nopt-in/u),
      clause('engine-plugins', 'Engine plugin and Pro module entitlements', /## 4\. Engine Plugins And Pro Modules/u, /Unity Studio site license/u, /Unreal plugin/u, /Godot plugin/u, /Pro modules included/u),
      clause('enterprise-controls', 'SSO, SCIM, audit, on-prem, networking, and residency controls', /## 5\. Enterprise Controls/u, /SSO\/SCIM/u, /Audit export/u, /On-prem Docker bundle/u, /Private-network pilot support/u, /Data residency region/u),
      clause('support-security', 'Support, service level, and security package', /## 6\. Support, Service Level, And Security/u, /Support response targets/u, /Service level target/u, /trust packet/u, /security questionnaire/u),
      clause('fees', 'Fees, taxes, and payment terms', /## 7\. Fees, Taxes, And Payment/u, /Subscription fees/u, /Usage overage fees/u, /Payment terms/u, /Taxes are customer responsibility/u),
      clause('special-terms', 'Customer-specific special terms hook', /## 8\. Special Terms/u, /liability\ncap changes/u, /purchase-order requirements/u),
      clause('signatures', 'Mutual signature block', /## 9\. Signatures/u, /Greybox Studio: __+/u, /Customer: __+/u),
    ],
  },
  {
    id: 'msa',
    title: 'Master Services Agreement',
    path: 'legal/MSA_TEMPLATE.md',
    requiredSignature: true,
    clauses: [
      clause('services', 'Services and purchased entitlements', /## 1\. Services/u, /entitlements, seats,\nusage, regions, service levels, and fees/u),
      clause('customer-ip', 'Customer owns game IP', /## 2\. Customer Data And Game IP/u, /Customer owns its game concepts/u),
      clause('no-ip-sale', 'No sale of customer game IP', /will not\nsell customer game IP/u),
      clause('training-opt-in', 'No model training without separate opt-in', /will not train models on customer data without a\nseparate explicit opt-in/u),
      clause('ai-assisted', 'AI-assisted output and human review', /## 4\. AI-Assisted Output/u, /Greybox output is AI-assisted/u),
      clause('fees', 'Fees, metering, taxes, and suspension', /## 5\. Fees And Billing/u, /Managed inference usage is metered/u),
      clause('security', 'Security, SSO/SCIM, and DPA reference', /## 6\. Security And Compliance/u, /SCIM\/SSO where purchased/u, /The DPA governs personal data processing/u),
      clause('confidentiality', 'Confidentiality obligations', /## 7\. Confidentiality/u),
      clause('support', 'Support and availability order-form hook', /## 8\. Support And Availability/u),
      clause('termination', 'Termination and data return/deletion', /## 10\. Term And Termination/u, /data return\/deletion follows the DPA/u),
      clause('liability', 'Liability cap and excluded claims', /## 12\. Liability/u, /Excluded claims should be specified in the order form/u),
      clause('signatures', 'Mutual signature block', /## 13\. Signatures/u, /Greybox Studio: __+/u, /Customer: __+/u),
    ],
  },
  {
    id: 'dpa',
    title: 'Data Processing Addendum',
    path: 'legal/DPA_TEMPLATE.md',
    requiredSignature: true,
    clauses: [
      clause('processing-details', 'Processing details and data categories', /## 1\. Processing Details/u, /Data subjects:/u, /Personal data:/u),
      clause('documented-instructions', 'Documented instruction commitment', /process customer personal data only on documented instructions/u),
      clause('no-training-default', 'No training without separate explicit opt-in', /will not train models on customer data\nwithout a separate explicit opt-in/u),
      clause('security-measures', 'Technical and organizational measures', /## 3\. Security Measures/u, /tenant isolation/u, /PII redaction/u, /SCIM offboarding/u),
      clause('subprocessors', 'Subprocessor notice and accountability', /## 4\. Sub-Processors/u, /30 days' notice/u),
      clause('international-transfers', 'International transfer mechanism', /## 5\. International Transfers/u, /SCCs, UK IDTA\/Addendum/u),
      clause('privacy-assistance', 'DSAR, DPIA, retention, and disclosure assistance', /## 6\. Assistance/u, /POST \/v1\/privacy\/requests/u, /GET \/v1\/enterprise\/privacy-governance/u),
      clause('breach-notice', 'Personal data breach notice clock', /## 7\. Breach Notice/u, /within\n72 hours/u),
      clause('return-deletion', 'Return and deletion period', /## 8\. Return And Deletion/u, /within 30 days/u),
      clause('audit', 'Audit and certification evidence caveat', /## 9\. Audit/u, /not itself a certification or auditor opinion/u),
      clause('signatures', 'Mutual signature block', /## 10\. Signatures/u, /Greybox Studio: __+/u, /Customer: __+/u),
    ],
  },
  {
    id: 'data-residency',
    title: 'Data residency controls',
    path: 'legal/DATA_RESIDENCY.md',
    requiredSignature: false,
    supportingEvidence: true,
    clauses: [
      clause('regions', 'US, EU, and India coverage', /United States/u, /European Union/u, /India/u),
      clause('evidence', 'Readiness route evidence', /\/v1\/enterprise\/data-residency\/readiness/u),
    ],
  },
  {
    id: 'subprocessors',
    title: 'Subprocessor registry',
    path: 'legal/SUBPROCESSORS.md',
    requiredSignature: false,
    supportingEvidence: true,
    clauses: [
      clause('notice', 'Material change notice period', /30-day/u),
      clause('registry', 'Subprocessor registry route', /\/v1\/enterprise\/subprocessors/u),
    ],
  },
  {
    id: 'security-questionnaire',
    title: 'Security questionnaire',
    path: 'legal/SECURITY_QUESTIONNAIRE.md',
    requiredSignature: false,
    supportingEvidence: true,
    clauses: [
      clause('conservative-answers', 'Conservative answers only', /not legal advice/u, /auditor assurance/u, /intentionally conservative/u),
      clause('endpoint', 'Questionnaire endpoint', /\/v1\/enterprise\/security-questionnaire/u),
    ],
  },
];

export function buildEnterpriseContractPacket(options: ContractPacketOptions = {}): EnterpriseContractPacket {
  const root = resolve(options.root ?? process.cwd());
  const documents = contractDocuments.map((definition) => contractDocument(root, definition));
  return {
    generatedAt: (options.now ?? new Date()).toISOString(),
    disclaimer: 'Contract packet is procurement readiness evidence and template material only. It is not legal advice, counsel approval, customer-specific order terms, or auditor assurance.',
    summary: {
      documents: documents.length,
      readyToSign: documents.filter((document) => document.status === 'ready-to-sign').length,
      supportingEvidence: documents.filter((document) => document.status === 'supporting-evidence').length,
      blocked: documents.filter((document) => document.status === 'blocked').length,
      blockingIssues: documents.reduce((sum, document) => sum + document.blockingIssues.length, 0),
    },
    documents,
    orderFormFields: [
      'customer legal name and billing address',
      'subscription tier, seats, plugin licenses, and Pro modules',
      'managed inference included tokens, overage rates, and provider preference',
      'data residency region and model-provider egress approvals',
      'SSO/SCIM, audit export, on-prem, private-network, and support entitlements',
      'service level, support response targets, and renewal term',
      'liability cap, excluded claims, and governing law',
      'signature authority, effective date, and purchase-order references',
    ],
    signingSequence: [
      'Attach order form with commercial terms and regional controls.',
      'Attach MSA and DPA templates without unresolved placeholders.',
      'Attach subprocessor, data-residency, trust-packet, and security-questionnaire evidence.',
      'Route to counsel for customer-specific edits and signature authority confirmation.',
      'Capture signed documents and archive hash/version metadata in the enterprise tenant record.',
    ],
  };
}

export function formatEnterpriseContractPacketMarkdown(packet: EnterpriseContractPacket): string {
  const lines = [
    '# Greybox Enterprise Contract Packet',
    '',
    `Generated: ${packet.generatedAt}`,
    `Disclaimer: ${packet.disclaimer}`,
    '',
    '## Summary',
    '',
    `- Documents: ${packet.summary.documents}`,
    `- Ready to sign templates: ${packet.summary.readyToSign}`,
    `- Supporting evidence: ${packet.summary.supportingEvidence}`,
    `- Blocked: ${packet.summary.blocked}`,
    `- Blocking issues: ${packet.summary.blockingIssues}`,
    '',
    '## Documents',
    '',
    '| Document | Status | SHA-256 | Blocking issues |',
    '| --- | --- | --- | ---: |',
  ];
  for (const document of packet.documents) {
    lines.push(`| ${escapeTableCell(document.title)} | ${document.status} | ${document.sha256 ? `\`${document.sha256}\`` : '-'} | ${document.blockingIssues.length} |`);
  }
  lines.push(
    '',
    '## Order Form Fields',
    '',
    ...packet.orderFormFields.map((field) => `- ${field}`),
    '',
    '## Signing Sequence',
    '',
    ...packet.signingSequence.map((step) => `- ${step}`),
    '',
  );
  return lines.join('\n');
}

function contractDocument(root: string, definition: ContractDocumentDefinition): ContractPacketDocument {
  const path = join(root, definition.path);
  if (!existsSync(path)) {
    return {
      id: definition.id,
      title: definition.title,
      path: definition.path,
      status: 'blocked',
      sha256: null,
      bytes: 0,
      requiredSignature: definition.requiredSignature,
      clauseChecks: [],
      blockingIssues: [`Missing contract document: ${definition.path}`],
    };
  }
  const body = readFileSync(path);
  const text = body.toString('utf8');
  const clauseChecks = definition.clauses.map((check) => ({
    id: check.id,
    label: check.label,
    status: check.patterns.every((pattern) => pattern.test(text)) ? 'pass' as const : 'fail' as const,
    evidence: check.patterns.map((pattern) => pattern.source).join(' && '),
  }));
  const blockingIssues = [
    ...clauseChecks.filter((check) => check.status === 'fail').map((check) => `Missing required clause: ${check.label}`),
    ...placeholderIssues(text),
  ];
  const status: ContractDocumentStatus = blockingIssues.length > 0
    ? 'blocked'
    : definition.supportingEvidence
      ? 'supporting-evidence'
      : 'ready-to-sign';
  return {
    id: definition.id,
    title: definition.title,
    path: definition.path,
    status,
    sha256: createHash('sha256').update(body).digest('hex'),
    bytes: body.length,
    requiredSignature: definition.requiredSignature,
    clauseChecks,
    blockingIssues,
  };
}

function clause(id: string, label: string, ...patterns: RegExp[]) {
  return { id, label, patterns };
}

function placeholderIssues(text: string): string[] {
  const issues = [];
  for (const pattern of [/TODO/u, /TBD/u, /\{\{/u, /\[\[/u]) {
    if (pattern.test(text)) issues.push(`Unresolved placeholder pattern: ${pattern.source}`);
  }
  return issues;
}

function escapeTableCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', '<br>');
}
