// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import type { BillingLedger } from '../metering/billingLedger.js';
import type { AuditLog } from './auditLog.js';
import type { LegalHoldStore } from './retention.js';
import type { ScimUser, ScimUserStore } from './scim.js';
import {
  adminPrivacyRequestView,
  type PrivacyRequestRecord,
  type PrivacyRequestStore,
  type PrivacyRequestType,
} from './privacyRequests.js';

export interface PrivacyFulfillmentSource {
  id: string;
  label: string;
  action: 'export' | 'delete-review' | 'retain' | 'manual-review';
  matchCount: number;
  retention: string;
  records?: unknown[];
  note?: string;
}

export interface PrivacyFulfillmentPackage {
  requestId: string;
  tenantId: string;
  generatedAt: string;
  subjectEmails: string[];
  requestType: PrivacyRequestType;
  dueAt: string;
  extensionDueAt?: string;
  request: ReturnType<typeof adminPrivacyRequestView>;
  sources: PrivacyFulfillmentSource[];
  recommendedActions: string[];
}

export async function buildPrivacyFulfillmentPackage(options: {
  request: PrivacyRequestRecord;
  privacyRequestStore: PrivacyRequestStore;
  scimStore?: ScimUserStore;
  billingLedger?: BillingLedger;
  auditLog?: AuditLog;
  legalHoldStore?: LegalHoldStore;
  now?: Date;
}): Promise<PrivacyFulfillmentPackage> {
  const subjectEmails = privacySubjectEmails(options.request);
  const [privacyRequests, scimUsers, billingRecords, auditEntries, activeHolds] = await Promise.all([
    matchingPrivacyRequests(options.privacyRequestStore, options.request.tenantId, subjectEmails),
    matchingScimUsers(options.scimStore, subjectEmails),
    tenantBillingEvidence(options.billingLedger, options.request.tenantId),
    tenantAuditEvidence(options.auditLog, options.request.tenantId),
    tenantLegalHolds(options.legalHoldStore, options.request.tenantId),
  ]);

  return {
    requestId: options.request.id,
    tenantId: options.request.tenantId,
    generatedAt: (options.now ?? new Date()).toISOString(),
    subjectEmails,
    requestType: options.request.requestType,
    dueAt: options.request.dueAt,
    ...(options.request.extensionDueAt ? { extensionDueAt: options.request.extensionDueAt } : {}),
    request: adminPrivacyRequestView(options.request),
    sources: [
      {
        id: 'privacy-requests',
        label: 'Privacy rights request ledger',
        action: options.request.requestType === 'delete' || options.request.requestType === 'parental-delete'
          ? 'delete-review'
          : 'export',
        matchCount: privacyRequests.length,
        retention: 'Retain request evidence for legal, security, and compliance audit purposes.',
        records: privacyRequests.map(adminPrivacyRequestView),
      },
      {
        id: 'scim-users',
        label: 'Enterprise SSO/SCIM user directory',
        action: options.request.requestType === 'delete' || options.request.requestType === 'parental-delete'
          ? 'delete-review'
          : 'export',
        matchCount: scimUsers.length,
        retention: 'Deactivate or delete through the customer IdP/SCIM source of truth before local removal.',
        records: scimUsers.map(sanitizeScimUser),
      },
      {
        id: 'billing-ledger',
        label: 'Billing and metered-usage ledger',
        action: 'retain',
        matchCount: billingRecords.length,
        retention: 'Tenant-level billing records are retained for tax, accounting, dispute, and fraud-prevention obligations.',
        note: billingRecords.length > 0
          ? 'Return tenant-level billing metadata only after confirming requester authority for the customer account.'
          : 'No tenant-level billing records found in this deployment.',
      },
      {
        id: 'audit-log',
        label: 'Security and enterprise audit log',
        action: 'retain',
        matchCount: auditEntries.length,
        retention: 'Security audit logs are retained to protect the service, investigate abuse, and satisfy enterprise audit duties.',
        note: auditEntries.length > 0
          ? 'Audit logs may contain account identifiers but intentionally exclude prompt text and customer game IP.'
          : 'No tenant-level audit entries found in this deployment.',
      },
      {
        id: 'legal-holds',
        label: 'Legal holds and retention exceptions',
        action: activeHolds.length > 0 ? 'retain' : 'manual-review',
        matchCount: activeHolds.length,
        retention: activeHolds.length > 0
          ? 'Active legal holds block deletion for scoped datasets until released.'
          : 'No active legal holds found; still apply billing, security, privacy, and abuse-prevention retention policies.',
        records: activeHolds.map(sanitizeLegalHold),
      },
    ],
    recommendedActions: recommendedPrivacyActions(options.request.requestType),
  };
}

export function privacySubjectEmails(request: PrivacyRequestRecord): string[] {
  return [...new Set([
    request.subjectEmail,
    request.contactEmail,
    request.parentEmail,
  ].filter((email): email is string => Boolean(email)).map((email) => email.toLowerCase()))];
}

function recommendedPrivacyActions(requestType: PrivacyRequestType): string[] {
  switch (requestType) {
    case 'access':
    case 'export':
    case 'parental-review':
      return [
        'Verify requester identity and authority before disclosure.',
        'Export matching account, privacy-request, and SCIM profile records.',
        'Review tenant-level billing and audit metadata before deciding whether it belongs in the response.',
      ];
    case 'delete':
    case 'parental-delete':
      return [
        'Verify requester identity and authority before deletion.',
        'Deactivate SCIM/user records through the identity source of truth.',
        'Delete or anonymize product data not subject to legal, billing, security, or abuse-prevention retention.',
        'Mark retained billing and audit records as legal/security retention exceptions in the response.',
      ];
    case 'correct':
      return [
        'Verify requester identity and the corrected value.',
        'Apply corrections in the system of record, usually the customer IdP/SCIM directory.',
        'Record the correction in the privacy request timeline.',
      ];
    case 'opt-out-sale-share':
      return [
        'Confirm the requester identity when required.',
        'Record the opt-out on the customer account and marketing suppression list.',
        'Confirm Greybox does not sell customer game IP or personal data.',
      ];
    case 'model-training-opt-out':
      return [
        'Record the opt-out on the customer tenant.',
        'Remove the tenant from future opt-in training datasets.',
        'Confirm Greybox requires separate explicit opt-in before model training on customer data.',
      ];
    case 'grievance':
      return [
        'Route to privacy operations owner.',
        'Record investigation notes in the timeline.',
        'Respond before the internal SLA due date or escalate to counsel.',
      ];
  }
}

async function matchingPrivacyRequests(
  store: PrivacyRequestStore,
  tenantId: string,
  subjectEmails: string[],
): Promise<PrivacyRequestRecord[]> {
  const emailSet = new Set(subjectEmails);
  return (await store.list({ tenantId })).filter((request) => (
    emailSet.has(request.contactEmail)
    || Boolean(request.subjectEmail && emailSet.has(request.subjectEmail))
    || Boolean(request.parentEmail && emailSet.has(request.parentEmail))
  ));
}

async function matchingScimUsers(store: ScimUserStore | undefined, subjectEmails: string[]): Promise<ScimUser[]> {
  if (!store) return [];
  const emailSet = new Set(subjectEmails);
  const users = (await store.list(undefined, 1, 1_000)).Resources;
  return users.filter((user) => (
    emailSet.has(user.userName.toLowerCase())
    || (user.emails ?? []).some((email) => emailSet.has(email.value.toLowerCase()))
  ));
}

async function tenantBillingEvidence(ledger: BillingLedger | undefined, tenantId: string): Promise<unknown[]> {
  if (!ledger) return [];
  return (await ledger.readRecords()).filter((record) => {
    const payload = record.payload as { tenantId?: string };
    return payload.tenantId === tenantId;
  });
}

async function tenantAuditEvidence(auditLog: AuditLog | undefined, tenantId: string): Promise<unknown[]> {
  if (!auditLog) return [];
  return auditLog.readEntries({ tenantId });
}

async function tenantLegalHolds(store: LegalHoldStore | undefined, tenantId: string): Promise<unknown[]> {
  if (!store) return [];
  return store.list({ tenantId, status: 'active' });
}

function sanitizeScimUser(user: ScimUser): unknown {
  return {
    id: user.id,
    userName: user.userName,
    externalId: user.externalId,
    displayName: user.displayName,
    name: user.name,
    emails: user.emails,
    active: user.active,
    created: user.meta.created,
    lastModified: user.meta.lastModified,
  };
}

function sanitizeLegalHold(value: unknown): unknown {
  const hold = value as {
    id?: string;
    title?: string;
    status?: string;
    datasets?: unknown[];
    projectIds?: unknown[];
    userIds?: unknown[];
    createdAt?: string;
    expiresAt?: string;
  };
  return {
    id: hold.id,
    title: hold.title,
    status: hold.status,
    datasets: hold.datasets,
    projectCount: hold.projectIds?.length ?? 0,
    userCount: hold.userIds?.length ?? 0,
    createdAt: hold.createdAt,
    expiresAt: hold.expiresAt,
  };
}
