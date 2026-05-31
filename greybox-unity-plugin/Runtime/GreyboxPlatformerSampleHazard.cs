// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using UnityEngine;

namespace Greybox.Runtime
{
    [RequireComponent(typeof(BoxCollider2D))]
    public sealed class GreyboxPlatformerSampleHazard : MonoBehaviour
    {
        public string HazardId = "sample-hazard";
        public string DisplayName = "Hazard";
        public string HazardType = "hazard";
        public string SourceArtifactKind = "";
        public string SourceArtifactId = "";
        public string SourceArtifactDisplayName = "";
        public string Effect = "";
        public float Damage = 1f;
        public float TickSeconds = 1f;
        public float Knockback;
        public string[] AffectedTags = new string[0];
        public bool IsLethal;
        public float LastApplyTimeSeconds { get; private set; } = float.NegativeInfinity;
        public string LastAppliedEffect { get; private set; } = "";

        private void Reset()
        {
            var hitbox = GetComponent<Collider2D>();
            hitbox.isTrigger = true;
        }

        private void OnTriggerEnter2D(Collider2D other)
        {
            GreyboxPlatformerSamplePlayer player = other ? other.GetComponentInParent<GreyboxPlatformerSamplePlayer>() : null;
            Apply(player, Time.time);
        }

        public bool Apply(GreyboxPlatformerSamplePlayer player)
        {
            return Apply(player, Time.time);
        }

        public bool Apply(GreyboxPlatformerSamplePlayer player, float timeSeconds)
        {
            if (!player) return false;
            if (!AffectsPlayer(player)) return false;
            if (!IsReady(timeSeconds)) return false;
            int damage = DamageFor(player);
            if (damage <= 0) return false;
            if (!player.ApplyDamage(
                    damage,
                    SourceArtifactKind,
                    SourceArtifactId,
                    string.IsNullOrWhiteSpace(SourceArtifactDisplayName) ? DisplayName : SourceArtifactDisplayName,
                    KnockbackImpulseFor(player),
                    Effect))
            {
                return false;
            }

            LastAppliedEffect = SafeEffect();
            LastApplyTimeSeconds = timeSeconds;
            return true;
        }

        public bool AffectsPlayer(GreyboxPlatformerSamplePlayer player)
        {
            if (!player) return false;
            if (AffectedTags == null || AffectedTags.Length == 0) return true;
            foreach (string affectedTag in AffectedTags)
            {
                if (MatchesPlayerIdentity(player, affectedTag)) return true;
            }

            return false;
        }

        public bool IsReady(float timeSeconds)
        {
            if (float.IsPositiveInfinity(timeSeconds)) return true;
            return timeSeconds - LastApplyTimeSeconds >= SafeTickSeconds();
        }

        private int DamageFor(GreyboxPlatformerSamplePlayer player)
        {
            if (IsLethal && player) return Mathf.Max(1, player.CurrentHearts);
            return Mathf.CeilToInt(Damage);
        }

        private float SafeTickSeconds()
        {
            return Mathf.Max(0.01f, TickSeconds);
        }

        private string SafeEffect()
        {
            return (Effect ?? "").Trim();
        }

        private static bool MatchesPlayerIdentity(GreyboxPlatformerSamplePlayer player, string affectedTag)
        {
            string wanted = (affectedTag ?? "").Trim();
            if (string.IsNullOrWhiteSpace(wanted)) return false;
            if (SameIdentity(wanted, "Player")) return true;
            if (SameIdentity(wanted, player.PlayerId)) return true;
            if (SameIdentity(wanted, player.Role)) return true;
            if (SameIdentity(wanted, player.SourceArtifactId)) return true;
            return player.gameObject && SameIdentity(wanted, player.gameObject.tag);
        }

        private static bool SameIdentity(string left, string right)
        {
            return string.Equals((left ?? "").Trim(), (right ?? "").Trim(), System.StringComparison.OrdinalIgnoreCase);
        }

        private Vector2 KnockbackImpulseFor(GreyboxPlatformerSamplePlayer player)
        {
            float strength = Mathf.Max(0f, Knockback);
            if (strength <= 0f || !player) return Vector2.zero;
            Vector2 direction = player.transform.position - transform.position;
            if (direction.sqrMagnitude < 0.0001f) direction = Vector2.up;
            return direction.normalized * strength;
        }
    }
}
