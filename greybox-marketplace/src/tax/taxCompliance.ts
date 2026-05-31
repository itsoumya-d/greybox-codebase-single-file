// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import type {
  Creator,
  ListingCategory,
  MarketplaceListing,
  MarketplaceOrder,
  MarketplaceTaxPreview,
  StripeTaxCalculationRequest,
  StripeTaxTransactionCreateRequest,
  TaxAddress,
  TaxRecord,
} from '../types.js';

export interface TaxComplianceOptions {
  stripeTaxDelegated?: boolean;
  taxProfileCollectionRequired?: boolean;
  buyerTaxAddress?: TaxAddress;
  listing?: MarketplaceListing;
  stripeTaxCalculationId?: string;
  stripeTaxTransactionId?: string;
  stripeCheckoutSessionId?: string;
  stripePaymentIntentId?: string;
  stripeAutomaticTaxStatus?: string;
  stripeTaxLiabilityType?: string;
  stripeTaxLiabilityAccount?: string;
  taxAmountCents?: number;
}

export function createTaxRecord(
  order: MarketplaceOrder,
  creator: Creator,
  options: TaxComplianceOptions = {},
): TaxRecord {
  const taxCode = options.listing ? stripeTaxCodeForCategory(options.listing.category) : undefined;
  const calculationRequest = options.listing && options.buyerTaxAddress
    ? buildStripeTaxCalculationRequest({
        order,
        listing: options.listing,
        buyerTaxAddress: options.buyerTaxAddress,
      })
    : undefined;
  const transactionRequest = options.listing && options.stripeTaxCalculationId
    ? buildStripeTaxTransactionCreateRequest({
        order,
        listing: options.listing,
        calculationId: options.stripeTaxCalculationId,
      })
    : undefined;
  return {
    id: `tax-${order.id}`,
    creatorId: creator.id,
    orderId: order.id,
    listingId: order.listingId,
    buyerId: order.buyerId,
    country: creator.country,
    ...(options.buyerTaxAddress?.country ? { buyerCountry: options.buyerTaxAddress.country.toUpperCase() } : {}),
    ...(options.buyerTaxAddress?.postalCode ? { buyerPostalCode: options.buyerTaxAddress.postalCode } : {}),
    grossCents: order.grossCents,
    platformFeeCents: order.platformFeeCents,
    stripeTaxDelegated: options.stripeTaxDelegated ?? true,
    requiresTaxProfile: options.taxProfileCollectionRequired ?? !creator.taxProfileId,
    ...(taxCode ? { stripeTaxCode: taxCode } : {}),
    ...(options.stripeTaxCalculationId ? { stripeTaxCalculationId: options.stripeTaxCalculationId } : {}),
    ...(options.stripeTaxTransactionId ? { stripeTaxTransactionId: options.stripeTaxTransactionId } : {}),
    ...(options.stripeCheckoutSessionId ? { stripeCheckoutSessionId: options.stripeCheckoutSessionId } : {}),
    ...(options.stripePaymentIntentId ? { stripePaymentIntentId: options.stripePaymentIntentId } : {}),
    ...(options.stripeAutomaticTaxStatus ? { stripeAutomaticTaxStatus: options.stripeAutomaticTaxStatus } : {}),
    ...(options.stripeTaxLiabilityType ? { stripeTaxLiabilityType: options.stripeTaxLiabilityType } : {}),
    ...(options.stripeTaxLiabilityAccount ? { stripeTaxLiabilityAccount: options.stripeTaxLiabilityAccount } : {}),
    ...(options.taxAmountCents !== undefined ? { taxAmountCents: options.taxAmountCents } : {}),
    ...(calculationRequest ? { calculationRequest } : {}),
    ...(transactionRequest ? { transactionRequest } : {}),
    createdAt: order.createdAt,
  };
}

export function stripeTaxCodeForCategory(category: ListingCategory): string {
  switch (category) {
    case 'consulting-hour':
      return 'txcd_20060000';
    case 'asset-pack':
    case 'custom-art-bible':
    case 'custom-skill':
    case 'pro-module':
    case 'template':
      return 'txcd_10000000';
  }
}

export function buildStripeTaxCalculationRequest(input: {
  order: MarketplaceOrder;
  listing: MarketplaceListing;
  buyerTaxAddress: TaxAddress;
}): StripeTaxCalculationRequest {
  if (!input.buyerTaxAddress.country || !/^[A-Za-z]{2}$/u.test(input.buyerTaxAddress.country)) {
    throw new Error('buyerTaxAddress.country must be an ISO 3166-1 alpha-2 country code');
  }
  const address = stripeAddress(input.buyerTaxAddress);
  return {
    method: 'POST',
    endpoint: '/v1/tax/calculations',
    idempotencyKey: `greybox-taxcalc-${input.order.id}`,
    body: {
      currency: input.order.currency,
      customer_details: {
        address,
        address_source: 'billing',
      },
      line_items: [{
        reference: input.listing.id,
        amount: input.order.grossCents,
        tax_behavior: 'exclusive',
        tax_code: stripeTaxCodeForCategory(input.listing.category),
        metadata: {
          greybox_listing_id: input.listing.id,
          greybox_creator_id: input.listing.creatorId,
          greybox_buyer_id: input.order.buyerId,
          greybox_category: input.listing.category,
        },
      }],
      metadata: {
        greybox_order_id: input.order.id,
        greybox_listing_id: input.listing.id,
        greybox_creator_id: input.listing.creatorId,
        greybox_buyer_id: input.order.buyerId,
      },
    },
  };
}

export function buildStripeTaxTransactionCreateRequest(input: {
  order: MarketplaceOrder;
  listing: MarketplaceListing;
  calculationId: string;
}): StripeTaxTransactionCreateRequest {
  if (!/^taxcalc_[A-Za-z0-9_]+$/u.test(input.calculationId)) {
    throw new Error('calculationId must be a Stripe tax calculation id');
  }
  return {
    method: 'POST',
    endpoint: '/v1/tax/transactions/create_from_calculation',
    idempotencyKey: `greybox-tax-transaction-${input.order.id}`,
    body: {
      calculation: input.calculationId,
      reference: input.order.id,
      metadata: {
        greybox_order_id: input.order.id,
        greybox_listing_id: input.listing.id,
        greybox_creator_id: input.listing.creatorId,
        greybox_buyer_id: input.order.buyerId,
      },
    },
  };
}

export function buildMarketplaceTaxPreview(input: {
  listing: MarketplaceListing;
  buyerId: string;
  buyerTaxAddress?: TaxAddress;
}): MarketplaceTaxPreview {
  const missingAddress = !input.buyerTaxAddress?.country;
  const order: MarketplaceOrder = {
    id: `preview-${input.listing.id}-${input.buyerId}`,
    buyerId: input.buyerId,
    creatorId: input.listing.creatorId,
    listingId: input.listing.id,
    grossCents: input.listing.priceCents,
    platformFeeCents: 0,
    creatorNetCents: input.listing.priceCents,
    currency: input.listing.currency,
    createdAt: 0,
  };
  const calculationRequest = !missingAddress && input.buyerTaxAddress
    ? buildStripeTaxCalculationRequest({ order, listing: input.listing, buyerTaxAddress: input.buyerTaxAddress })
    : undefined;
  return {
    listingId: input.listing.id,
    buyerId: input.buyerId,
    readiness: {
      status: missingAddress ? 'needs-customer-address' : 'ready',
      requirements: missingAddress ? ['buyerTaxAddress.country is required for Stripe Tax calculation'] : [],
    },
    ...(calculationRequest ? { calculationRequest } : {}),
  };
}

function stripeAddress(address: TaxAddress): StripeTaxCalculationRequest['body']['customer_details']['address'] {
  return {
    country: address.country.toUpperCase(),
    ...(address.postalCode ? { postal_code: address.postalCode } : {}),
    ...(address.state ? { state: address.state } : {}),
    ...(address.city ? { city: address.city } : {}),
    ...(address.line1 ? { line1: address.line1 } : {}),
    ...(address.line2 ? { line2: address.line2 } : {}),
  };
}
