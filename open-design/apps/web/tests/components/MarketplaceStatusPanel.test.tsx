// @vitest-environment jsdom
// SPDX-License-Identifier: Apache-2.0

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MarketplaceStatusPanel } from '../../src/components/MarketplaceStatusPanel';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}

describe('MarketplaceStatusPanel', () => {
  it('does not fetch while the production surface is hidden', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<MarketplaceStatusPanel buyerId="project-1" visible={false} />);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText('Marketplace Supply')).toBeNull();
  });

  it('renders online marketplace stats and published creator listings', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === '/api/marketplace/status') {
        return Promise.resolve(jsonResponse({
          configured: true,
          status: 'online',
          service: 'greybox-marketplace',
          stats: {
            gmvCents: 25_000,
            platformRevenueCents: 3_750,
            creatorNetCents: 21_250,
            orders: 5,
            activeCreatorsWithSales: 3,
            publishedListings: 2,
          },
        }));
      }
      if (url === '/api/marketplace/listings?status=published') {
        return Promise.resolve(jsonResponse({
          configured: true,
          status: 'online',
          listings: [
            {
              id: 'listing-1',
              creatorId: 'creator-1',
              title: 'Readable Boss Arena Template',
              description: 'AI-assisted boss arena pacing and counterplay.',
              category: 'template',
              priceCents: 5_000,
              currency: 'usd',
              tags: ['boss', 'combat'],
              status: 'published',
              createdAt: 100,
              updatedAt: 200,
              publishedAt: 200,
            },
          ],
        }));
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<MarketplaceStatusPanel buyerId="project-1" visible />);

    await waitFor(() => expect(screen.getByText('Readable Boss Arena Template')).toBeTruthy());
    expect(screen.getByText('$250')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('Template')).toBeTruthy();
    expect(screen.getByText('$50')).toBeTruthy();
  });

  it('renders an unconfigured state without requesting listings', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === '/api/marketplace/status') {
        return Promise.resolve(jsonResponse({ configured: false, status: 'unconfigured' }));
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<MarketplaceStatusPanel buyerId="project-1" visible />);

    await waitFor(() => expect(screen.getByText(/Closed-core marketplace is not connected yet/u)).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('queues a marketplace purchase for the current project', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/marketplace/status') {
        return Promise.resolve(jsonResponse({
          configured: true,
          status: 'online',
          service: 'greybox-marketplace',
          stats: {
            gmvCents: 25_000,
            platformRevenueCents: 3_750,
            creatorNetCents: 21_250,
            orders: 5,
            activeCreatorsWithSales: 3,
            publishedListings: 1,
          },
        }));
      }
      if (url === '/api/marketplace/listings?status=published') {
        return Promise.resolve(jsonResponse({
          configured: true,
          status: 'online',
          listings: [
            {
              id: 'listing-1',
              creatorId: 'creator-1',
              title: 'Readable Boss Arena Template',
              description: 'AI-assisted boss arena pacing and counterplay.',
              category: 'template',
              priceCents: 5_000,
              currency: 'usd',
              tags: ['boss', 'combat'],
              status: 'published',
              createdAt: 100,
              updatedAt: 200,
              publishedAt: 200,
            },
          ],
        }));
      }
      if (url === '/api/marketplace/orders') {
        expect(init?.method).toBe('POST');
        expect(JSON.parse(String(init?.body))).toEqual({
          buyerId: 'project-1',
          listingId: 'listing-1',
        });
        return Promise.resolve(jsonResponse({
          configured: true,
          status: 'online',
          order: {
            id: 'order-1',
            buyerId: 'project-1',
            creatorId: 'creator-1',
            listingId: 'listing-1',
            grossCents: 5_000,
            platformFeeCents: 750,
            creatorNetCents: 4_250,
            currency: 'usd',
            createdAt: 300,
          },
        }));
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<MarketplaceStatusPanel buyerId="project-1" visible />);

    await waitFor(() => expect(screen.getByText('Readable Boss Arena Template')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Start purchase' }));

    await waitFor(() => expect(screen.getByText('Order order-1 queued')).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('surfaces a checkout handoff when the marketplace returns one', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/marketplace/status') {
        return Promise.resolve(jsonResponse({
          configured: true,
          status: 'online',
          service: 'greybox-marketplace',
          stats: {
            gmvCents: 0,
            platformRevenueCents: 0,
            creatorNetCents: 0,
            orders: 0,
            activeCreatorsWithSales: 1,
            publishedListings: 1,
          },
        }));
      }
      if (url === '/api/marketplace/listings?status=published') {
        return Promise.resolve(jsonResponse({
          configured: true,
          status: 'online',
          listings: [
            {
              id: 'listing-1',
              creatorId: 'creator-1',
              title: 'Soulslike Combat Pack',
              description: 'Enemy tuning loops and readable attack tells.',
              category: 'custom-skill',
              priceCents: 7_900,
              currency: 'usd',
              tags: ['combat'],
              status: 'published',
              createdAt: 100,
              updatedAt: 200,
              publishedAt: 200,
            },
          ],
        }));
      }
      if (url === '/api/marketplace/orders') {
        expect(init?.method).toBe('POST');
        return Promise.resolve(jsonResponse({
          configured: true,
          status: 'online',
          checkoutUrl: 'https://cloud.greybox.studio/marketplace/checkout?buyerId=project-1&listingId=listing-1',
          nextAction: 'checkout',
        }));
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<MarketplaceStatusPanel buyerId="project-1" visible />);

    await waitFor(() => expect(screen.getByText('Soulslike Combat Pack')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Start purchase' }));

    const checkout = await screen.findByRole('link', { name: 'Open checkout' });
    expect(checkout.getAttribute('href')).toBe(
      'https://cloud.greybox.studio/marketplace/checkout?buyerId=project-1&listingId=listing-1',
    );
  });
});
