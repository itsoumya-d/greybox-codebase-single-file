// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

export interface SlopSignal {
  score: number;
  reasons: string[];
}

const filler = [
  'delve',
  'tapestry',
  'game-changer',
  'unlock your potential',
  'seamlessly',
  'revolutionize',
  'robust and scalable',
];

export function scoreSlop(text: string): SlopSignal {
  const lower = text.toLowerCase();
  const reasons = filler.filter((phrase) => lower.includes(phrase));
  const longGeneric = /\b(?:immersive|engaging|dynamic|innovative)\b/giu;
  const genericHits = lower.match(longGeneric)?.length ?? 0;
  if (genericHits >= 5) reasons.push('generic_adjective_density');
  return { score: Math.min(1, reasons.length / 4), reasons };
}
