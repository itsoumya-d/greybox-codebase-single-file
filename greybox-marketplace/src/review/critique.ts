// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import type { ListingDraft, ReviewFlag } from '../types.js';

const forbiddenClaims = [
  'guaranteed revenue',
  'guaranteed sales',
  'stolen',
  'ripped from',
  'no attribution required for third party',
  'bypass asset store',
];

const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const phonePattern = /(?<!\d)(?:\+\d{1,3}[\s.-]*)?(?:\(\d{3}\)|\d{3}[\s.-])[\s.-]*\d{3}[\s.-]\d{4}\b/gu;
const offPlatformPattern = /\b(?:contact me|email me|dm me|discord|telegram|whatsapp|paypal|venmo|cash ?app|wire transfer)\b/iu;

export function critiqueListingDraft(draft: ListingDraft): ReviewFlag[] {
  const flags: ReviewFlag[] = [];
  const rawCopy = `${draft.title}\n${draft.description}\n${draft.licenseSummary}`;
  const haystack = rawCopy.toLowerCase();

  for (const claim of forbiddenClaims) {
    if (haystack.includes(claim)) {
      flags.push({
        id: `forbidden-${claim.replace(/\s+/gu, '-')}`,
        severity: claim.includes('stolen') || claim.includes('ripped') ? 'critical' : 'high',
        reason: 'Forbidden marketplace claim or IP risk.',
        evidence: claim,
      });
    }
  }

  const contactEvidence = marketplaceContactEvidence(rawCopy);
  if (contactEvidence) {
    flags.push({
      id: 'off-platform-contact',
      severity: 'high',
      reason: 'Listing copy must not expose contact details or route buyers around marketplace checkout.',
      evidence: contactEvidence,
    });
  }

  if (draft.description.trim().length < 80) {
    flags.push({
      id: 'description-too-short',
      severity: 'medium',
      reason: 'Listing description is too short for buyer review.',
      evidence: `${draft.description.trim().length} characters`,
    });
  }
  if (!/license|royalty|commercial|personal|seat|studio/iu.test(draft.licenseSummary)) {
    flags.push({
      id: 'license-unclear',
      severity: 'high',
      reason: 'License summary must explain commercial usage rights.',
      evidence: draft.licenseSummary,
    });
  }
  if (/ai-generated/iu.test(haystack) && !/ai-assisted/iu.test(haystack)) {
    flags.push({
      id: 'ai-language',
      severity: 'medium',
      reason: 'Marketplace copy must use honest AI-assisted positioning.',
      evidence: 'ai-generated without AI-assisted context',
    });
  }
  return flags;
}

function marketplaceContactEvidence(value: string): string {
  const redactedCopy = value
    .replace(emailPattern, '[redacted-email]')
    .replace(phonePattern, '[redacted-phone]');
  const contactMarkers = [...redactedCopy.matchAll(/\[(?:redacted-email|redacted-phone)\]/giu)]
    .map((match) => match[0].toLowerCase());
  if (contactMarkers.length > 0) return [...new Set(contactMarkers)].join(' ');
  const evidence = redactedCopy
    .match(/\b(?:contact me|email me|dm me|discord|telegram|whatsapp|paypal|venmo|cash ?app|wire transfer)\b/iu)?.[0];
  if (evidence) return evidence.toLowerCase();
  return offPlatformPattern.test(value) ? '[off-platform-contact]' : '';
}
