// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using UnityEngine;

namespace Greybox.Runtime
{
    [RequireComponent(typeof(Collider2D))]
    public sealed class GreyboxPlatformerSampleCollectible : MonoBehaviour
    {
        public string CoinId = "coin";
        public string DisplayName = "Coin";
        public string SourceArtifactKind = "";
        public string SourceArtifactId = "";
        public string SourceArtifactDisplayName = "";
        public string SourceObjectiveId = "";
        public string SourceObjectiveDisplayName = "";
        public string SourceObjectiveType = "";
        public GreyboxPlatformerSampleHud Hud;
        public bool Collected { get; private set; }

        private void Reset()
        {
            var hitbox = GetComponent<Collider2D>();
            hitbox.isTrigger = true;
        }

        private void OnTriggerEnter2D(Collider2D other)
        {
            Collect(other ? other.GetComponentInParent<GreyboxPlatformerSamplePlayer>() : null);
        }

        public bool Collect(GreyboxPlatformerSamplePlayer player)
        {
            if (Collected || !player) return false;
            if (IsLoot())
            {
                if (!player.ReceiveLoot(this)) return false;
            }
            else if (Hud && !Hud.CollectCoin(CoinId, SourceObjectiveId)) return false;

            Collected = true;
            gameObject.SetActive(false);
            return true;
        }

        public bool IsLoot()
        {
            return string.Equals((SourceObjectiveType ?? "").Trim(), "loot", System.StringComparison.OrdinalIgnoreCase)
                || string.Equals((SourceArtifactKind ?? "").Trim(), "gameview.loot-table", System.StringComparison.OrdinalIgnoreCase);
        }

        public void ResetCollectible()
        {
            Collected = false;
            gameObject.SetActive(true);
        }
    }
}
