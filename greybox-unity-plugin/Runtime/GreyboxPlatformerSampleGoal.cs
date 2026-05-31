// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using UnityEngine;

namespace Greybox.Runtime
{
    [RequireComponent(typeof(BoxCollider2D))]
    public sealed class GreyboxPlatformerSampleGoal : MonoBehaviour
    {
        public string GoalId = "exit_gate";
        public string DisplayName = "Exit Gate";
        public string ObjectiveType = "exit";
        public string SourceArtifactKind = "";
        public string SourceArtifactId = "";
        public string SourceArtifactDisplayName = "";
        public string[] TargetIds = new string[0];
        public string Reward = "";
        public float TimeLimitSeconds;
        public bool IsPrimary;
        public GreyboxPlatformerSampleHud Hud;
        public int RequiredCount = 1;
        public int RequiredCoins;
        public bool Completed { get; private set; }
        public int CompletionCount { get; private set; }
        public string LastReward { get; private set; } = "";
        public bool Expired => IsExpired(Time.time);
        public int RemainingCount => Mathf.Max(0, SafeRequiredCount() - CompletionCount);
        public int RemainingCoins => RemainingCoinsFor(Hud);
        public int RemainingTargetIds => RemainingTargetIdsFor(CurrentHudPlayer(), Hud);
        public int RemainingProgress => RemainingProgressFor(CurrentHudPlayer(), Hud);
        public bool IsLockedByCoins => IsLockedByCoinsFor(Hud);
        public bool IsLockedByTargetIds => IsLockedByTargetIdsFor(CurrentHudPlayer(), Hud);
        public bool IsLocked => IsLockedFor(CurrentHudPlayer(), Hud);

        private void Reset()
        {
            var hitbox = GetComponent<Collider2D>();
            hitbox.isTrigger = true;
        }

        private void OnTriggerEnter2D(Collider2D other)
        {
            MarkReached(other ? other.GetComponentInParent<GreyboxPlatformerSamplePlayer>() : null, Hud, Time.time);
        }

        public bool MarkReached(GreyboxPlatformerSamplePlayer player)
        {
            return MarkReached(player, Hud);
        }

        public bool MarkReached(GreyboxPlatformerSamplePlayer player, GreyboxPlatformerSampleHud hud)
        {
            return MarkReached(player, hud, Time.time);
        }

        public bool MarkReached(GreyboxPlatformerSamplePlayer player, GreyboxPlatformerSampleHud hud, float timeSeconds)
        {
            if (!player) return false;
            if (Completed) return false;
            if (IsLockedFor(player, hud)) return false;
            if (IsExpired(timeSeconds)) return false;
            CompletionCount += 1;
            Completed = CompletionCount >= SafeRequiredCount();
            if (Completed)
            {
                LastReward = SafeReward();
                player.ReceiveGoalReward(this);
            }
            return true;
        }

        public void ResetGoal()
        {
            Completed = false;
            CompletionCount = 0;
            LastReward = "";
        }

        private int SafeRequiredCount()
        {
            return Mathf.Max(1, RequiredCount);
        }

        public bool IsLockedByCoinsFor(GreyboxPlatformerSampleHud hud)
        {
            return RemainingCoinsFor(hud) > 0;
        }

        public bool IsLockedByTargetIdsFor(GreyboxPlatformerSampleHud hud)
        {
            return IsLockedByTargetIdsFor(null, hud);
        }

        public bool IsLockedByTargetIdsFor(GreyboxPlatformerSamplePlayer player, GreyboxPlatformerSampleHud hud)
        {
            return RemainingTargetIdsFor(player, hud) > 0;
        }

        public bool IsLockedFor(GreyboxPlatformerSampleHud hud)
        {
            return IsLockedFor(null, hud);
        }

        public bool IsLockedFor(GreyboxPlatformerSamplePlayer player, GreyboxPlatformerSampleHud hud)
        {
            return IsLockedByCoinsFor(hud) || IsLockedByTargetIdsFor(player, hud);
        }

        public int RemainingProgressFor(GreyboxPlatformerSampleHud hud)
        {
            return RemainingProgressFor(null, hud);
        }

        public int RemainingProgressFor(GreyboxPlatformerSamplePlayer player, GreyboxPlatformerSampleHud hud)
        {
            return Mathf.Max(RemainingCoinsFor(hud), RemainingTargetIdsFor(player, hud));
        }

        public int RemainingCoinsFor(GreyboxPlatformerSampleHud hud)
        {
            int required = SafeRequiredCoins();
            if (required <= 0) return 0;
            int collected = hud ? hud.CoinsCollected : 0;
            return Mathf.Max(0, required - collected);
        }

        public int RemainingTargetIdsFor(GreyboxPlatformerSampleHud hud)
        {
            return RemainingTargetIdsFor(null, hud);
        }

        public int RemainingTargetIdsFor(GreyboxPlatformerSamplePlayer player, GreyboxPlatformerSampleHud hud)
        {
            if (TargetIds == null || TargetIds.Length == 0) return 0;
            if (!player && !hud) return 0;
            int remaining = 0;
            foreach (string targetId in TargetIds)
            {
                string safeTargetId = (targetId ?? "").Trim();
                if (string.IsNullOrWhiteSpace(safeTargetId)) continue;
                bool collectedObjective = hud && hud.HasCollectedObjective(safeTargetId);
                bool defeatedEnemy = player && player.HasDefeatedEnemy(safeTargetId);
                if (!collectedObjective && !defeatedEnemy) remaining += 1;
            }

            return remaining;
        }

        private int SafeRequiredCoins()
        {
            return Mathf.Max(0, RequiredCoins);
        }

        private GreyboxPlatformerSamplePlayer CurrentHudPlayer()
        {
            return Hud ? Hud.Player : null;
        }

        public bool IsExpired(float timeSeconds)
        {
            float limit = SafeTimeLimitSeconds();
            return limit > 0f && timeSeconds > limit;
        }

        private float SafeTimeLimitSeconds()
        {
            return Mathf.Max(0f, TimeLimitSeconds);
        }

        private string SafeReward()
        {
            return (Reward ?? "").Trim();
        }
    }
}
