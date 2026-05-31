// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using UnityEngine;

namespace Greybox.Runtime
{
    [RequireComponent(typeof(BoxCollider2D))]
    public sealed class GreyboxPlatformerSampleCheckpoint : MonoBehaviour
    {
        public string CheckpointId = "sample-checkpoint";
        public string DisplayName = "Checkpoint";
        public string SpawnId = "";
        public string SourceArtifactKind = "";
        public string SourceArtifactId = "";
        public string SourceArtifactDisplayName = "";
        public string SpawnGroup = "";
        public string[] ActorIds = new string[0];
        public int MaxActivations = 1;
        public float CooldownSeconds;
        public bool SpawnOnStart = true;
        public Vector3 RespawnPoint;

        public bool Activated { get; private set; }
        public bool SpawnOnStartApplied { get; private set; }
        public int ActivationCount { get; private set; }
        public float LastActivationTimeSeconds { get; private set; } = float.NegativeInfinity;
        public int RemainingActivations => Mathf.Max(0, SafeMaxActivations() - ActivationCount);

        private void Awake()
        {
            if (RespawnPoint == Vector3.zero) RespawnPoint = transform.position;
        }

        private void Reset()
        {
            var hitbox = GetComponent<Collider2D>();
            hitbox.isTrigger = true;
            RespawnPoint = transform.position;
        }

        private void OnTriggerEnter2D(Collider2D other)
        {
            Activate(other ? other.GetComponentInParent<GreyboxPlatformerSamplePlayer>() : null, Time.time);
        }

        public bool Activate(GreyboxPlatformerSamplePlayer player)
        {
            return Activate(player, Time.time);
        }

        public bool Activate(GreyboxPlatformerSamplePlayer player, float timeSeconds)
        {
            if (!player) return false;
            if (!CanActivatePlayer(player)) return false;
            if (RemainingActivations <= 0) return false;
            if (!IsReady(timeSeconds)) return false;
            if (RespawnPoint == Vector3.zero) RespawnPoint = transform.position;
            player.SpawnPoint = RespawnPoint;
            Activated = true;
            ActivationCount += 1;
            LastActivationTimeSeconds = timeSeconds;
            return true;
        }

        public bool ApplySpawnOnStart(GreyboxPlatformerSamplePlayer player)
        {
            if (!SpawnOnStart || !player) return false;
            if (!CanActivatePlayer(player)) return false;
            if (RespawnPoint == Vector3.zero) RespawnPoint = transform.position;
            player.SpawnPoint = RespawnPoint;
            player.transform.position = RespawnPoint;
            SpawnOnStartApplied = true;
            return true;
        }

        public bool CanActivatePlayer(GreyboxPlatformerSamplePlayer player)
        {
            if (!player) return false;
            if (!HasActorRestrictions()) return true;
            foreach (string actorId in ActorIds)
            {
                if (MatchesPlayerIdentity(player, actorId)) return true;
            }

            return false;
        }

        public bool IsReady(float timeSeconds)
        {
            return timeSeconds - LastActivationTimeSeconds >= SafeCooldownSeconds();
        }

        public void ResetCheckpoint()
        {
            Activated = false;
            SpawnOnStartApplied = false;
            ActivationCount = 0;
            LastActivationTimeSeconds = float.NegativeInfinity;
        }

        private bool HasActorRestrictions()
        {
            if (ActorIds == null || ActorIds.Length == 0) return false;
            foreach (string actorId in ActorIds)
            {
                if (!string.IsNullOrWhiteSpace(actorId)) return true;
            }

            return false;
        }

        private int SafeMaxActivations()
        {
            return Mathf.Max(1, MaxActivations);
        }

        private float SafeCooldownSeconds()
        {
            return Mathf.Max(0f, CooldownSeconds);
        }

        private static bool MatchesPlayerIdentity(GreyboxPlatformerSamplePlayer player, string actorId)
        {
            string wanted = (actorId ?? "").Trim();
            if (string.IsNullOrWhiteSpace(wanted)) return false;
            if (SameIdentity(wanted, player.PlayerId)) return true;
            if (SameIdentity(wanted, player.SourceArtifactId)) return true;
            if (SameIdentity(wanted, player.DisplayName)) return true;
            if (SameIdentity(wanted, player.Role)) return true;
            return player.gameObject && SameIdentity(wanted, player.gameObject.tag);
        }

        private static bool SameIdentity(string left, string right)
        {
            return string.Equals((left ?? "").Trim(), (right ?? "").Trim(), System.StringComparison.OrdinalIgnoreCase);
        }
    }
}
