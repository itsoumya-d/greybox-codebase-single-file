// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { OnboardingWizard } from './OnboardingWizard';

export const dynamic = 'force-dynamic';

export default function CreatorOnboardPage() {
  return (
    <div className="gb-page" style={{ maxWidth: 720 }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>Become a creator</h1>
        <p className="gb-muted" style={{ marginTop: 4 }}>
          Five steps: profile, Stripe Connect, tax, banking, and approval. Progress is saved server-side after every step.
        </p>
      </header>
      <OnboardingWizard />
    </div>
  );
}
