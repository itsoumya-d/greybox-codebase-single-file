// Canonical billing plan list shown on the /billing route. Mirrors the PLAN_METERING
// table in greybox-cloud/src/routers/billing.ts; we redeclare it locally because
// the cloud package is not a workspace dependency of this Next.js runtime. The
// cloud remains authoritative for prices charged at Checkout; this list is
// presentation-only.
//
// Pricing in this module is the "shopping cart" price the creator sees on
// /billing. The cloud's PLAN_METERING table charges $29 / $79; the product
// landing copy advertises $19 / $49 in the launch plan referenced from
// MEMORY.md; we ship the displayed prices the task description prescribes
// here and keep the in-cloud meter independent so the actual charge follows
// the price IDs configured at the Stripe end.

export type BillingTierId = 'free' | 'indie' | 'studio' | 'enterprise';

export interface BillingPlanFeature {
  label: string;
  /** Whether this feature is included in the plan (vs marked as not-included). */
  included: boolean;
}

export interface BillingPlan {
  id: BillingTierId;
  /** Human-readable plan name. */
  title: string;
  /** Display price string (e.g. "$19/mo"). Use 'Custom' for enterprise. */
  priceLabel: string;
  /** Cents per month for sort/test purposes; null for enterprise/free if untracked. */
  monthlyPriceCents: number | null;
  /** Short pitch shown under the title. */
  description: string;
  /** Feature comparison rows. */
  features: BillingPlanFeature[];
  /** Action-button copy shown on the plan card. */
  ctaLabel: string;
  /** True if the plan represents a Stripe-checkout-eligible paid subscription. */
  checkoutEligible: boolean;
  /** Optional badge text shown on the plan card. */
  badge?: string;
  /** INR price string shown to India users (e.g. "₹1,999/mo"). Undefined for free/enterprise. */
  inrPriceLabel?: string;
}

export const BILLING_PLANS: BillingPlan[] = [
  {
    id: 'free',
    title: 'Free',
    priceLabel: '$0',
    monthlyPriceCents: 0,
    description: 'For solo creators evaluating Greybox.',
    features: [
      { label: '1 active project', included: true },
      { label: 'Local-only artifact storage', included: true },
      { label: 'Bring-your-own AI API key', included: true },
      { label: 'Stripe-managed billing portal', included: false },
      { label: 'Priority support', included: false },
    ],
    ctaLabel: 'Current plan',
    checkoutEligible: false,
  },
  {
    id: 'indie',
    title: 'Pro',
    priceLabel: '$19/mo',
    monthlyPriceCents: 1900,
    description: 'For indie studios shipping their first commercial title.',
    features: [
      { label: 'Unlimited projects', included: true },
      { label: 'Cloud-managed token budget', included: true },
      { label: 'Pro game-art-bible modules', included: true },
      { label: 'Stripe-managed billing portal', included: true },
      { label: 'Priority support', included: false },
    ],
    ctaLabel: 'Choose Pro',
    checkoutEligible: true,
    badge: 'Most popular',
    inrPriceLabel: '₹1,999/mo',
  },
  {
    id: 'studio',
    title: 'Studio',
    priceLabel: '$49/mo',
    monthlyPriceCents: 4900,
    description: 'For small studios with shared cloud-backed assets.',
    features: [
      { label: 'Everything in Pro', included: true },
      { label: 'Up to 5 seats', included: true },
      { label: 'Engine-package emit (Unity/Unreal/Godot)', included: true },
      { label: 'Stripe-managed billing portal', included: true },
      { label: 'Priority support', included: true },
    ],
    ctaLabel: 'Choose Studio',
    checkoutEligible: true,
    inrPriceLabel: '₹4,999/mo',
  },
  {
    id: 'enterprise',
    title: 'Enterprise',
    priceLabel: 'Custom',
    monthlyPriceCents: null,
    description: 'For studios that need bespoke SLAs and SSO.',
    features: [
      { label: 'Everything in Studio', included: true },
      { label: 'SAML / OIDC SSO', included: true },
      { label: 'Custom token allotments', included: true },
      { label: 'Dedicated success engineer', included: true },
      { label: 'Negotiated commercial terms', included: true },
    ],
    ctaLabel: 'Contact us',
    checkoutEligible: false,
  },
];

/**
 * Return the localized price label for a plan: INR for India users, USD otherwise.
 */
export function planPriceLabel(plan: BillingPlan, country: string): string {
  if (country.toUpperCase() === 'IN' && plan.inrPriceLabel) {
    return plan.inrPriceLabel;
  }
  return plan.priceLabel;
}

/**
 * Map a UI tier id (the IDs used in BILLING_PLANS above) to the tier the cloud
 * expects in /v1/billing/checkout-session. The cloud expects `indie | studio`;
 * the in-studio surface labels them Pro / Studio for creator clarity.
 */
export function uiTierToCloudTier(id: BillingTierId): 'indie' | 'studio' | null {
  if (id === 'indie') return 'indie';
  if (id === 'studio') return 'studio';
  return null;
}
