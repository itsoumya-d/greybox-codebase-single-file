// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { ListingWizard } from './ListingWizard';

export const dynamic = 'force-dynamic';

export default function NewListingPage() {
  return (
    <div className="gb-page" style={{ maxWidth: 820 }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>New listing</h1>
        <p className="gb-muted" style={{ marginTop: 4 }}>
          Pick a type, attach an asset, add metadata + pricing, preview, and submit for review.
        </p>
      </header>
      <ListingWizard />
    </div>
  );
}
