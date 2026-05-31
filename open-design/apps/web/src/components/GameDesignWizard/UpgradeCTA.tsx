import { navigate } from '../../router';

interface Props {
  requiredTier: 'indie' | 'studio';
  featureName: string;
}

export function UpgradeCTA({ requiredTier, featureName }: Props) {
  const tierLabel = requiredTier === 'indie' ? 'Indie ($19/mo)' : 'Studio ($49/mo)';
  return (
    <div className="upgrade-cta" role="alert">
      <div className="upgrade-cta-icon">⭐</div>
      <div className="upgrade-cta-body">
        <strong className="upgrade-cta-title">{featureName} requires {tierLabel}</strong>
        <p className="upgrade-cta-desc">
          Upgrade your plan to unlock this feature and continue building your game.
        </p>
      </div>
      <button type="button" className="primary upgrade-cta-btn" onClick={() => navigate({ kind: 'billing' })}>
        Upgrade Plan
      </button>
    </div>
  );
}
