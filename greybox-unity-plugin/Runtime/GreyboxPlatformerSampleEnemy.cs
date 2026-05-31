// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using UnityEngine;

namespace Greybox.Runtime
{
    [RequireComponent(typeof(BoxCollider2D))]
    public sealed class GreyboxPlatformerSampleEnemy : MonoBehaviour
    {
        public string EnemyId = "sample-enemy";
        public string DisplayName = "Enemy";
        public string Role = "enemy";
        public string Faction = "";
        public string Behavior = "";
        public string[] AbilityIds = new string[0];
        public string[] PatrolPointIds = new string[0];
        public string LootTableId = "";
        public bool SpawnLootOnDefeat = true;
        public Color LootDropColor = new Color(1f, 0.82f, 0.23f);
        public Material LootDropMaterial;
        public string SourceArtifactKind = "";
        public string SourceArtifactId = "";
        public string SourceArtifactDisplayName = "";
        public Vector3 Origin;
        public Vector3[] PatrolWaypoints = new Vector3[0];
        public float PatrolRadius = 1.2f;
        public float PatrolSpeed = 1.6f;
        public float AttackRange = 1.2f;
        public float AggroRadius = 5f;
        public int Health = 1;
        public int Damage = 1;
        public float AbilityKnockback = 3f;
        public float AttackCooldownSeconds = 0.75f;

        public int HitCount { get; private set; }
        public int DamageTaken { get; private set; }
        public int CurrentHealth { get; private set; }
        public bool Defeated { get; private set; }
        public GameObject LastLootDrop { get; private set; }
        public string LastLootDropId { get; private set; } = "";
        public float LastAttackTimeSeconds { get; private set; } = float.NegativeInfinity;
        public string LastUsedAbilityId { get; private set; } = "";
        public string LastAppliedAbilityEffect { get; private set; } = "";
        public string ActivePatrolPointId { get; private set; } = "";
        public Vector3 CurrentPatrolTarget { get; private set; }

        private float elapsed;
        private int patrolWaypointIndex;
        private int authoredHealthSnapshot;

        private void Awake()
        {
            if (Origin == Vector3.zero) Origin = transform.position;
            ResetEnemy();
        }

        private void Reset()
        {
            Origin = transform.position;
            var hitbox = GetComponent<Collider2D>();
            hitbox.isTrigger = true;
        }

        private void FixedUpdate()
        {
            Simulate(Time.fixedDeltaTime);
        }

        private void OnTriggerEnter2D(Collider2D other)
        {
            Apply(other ? other.GetComponentInParent<GreyboxPlatformerSamplePlayer>() : null);
        }

        public Vector3 Simulate(float deltaTime)
        {
            if (Origin == Vector3.zero) Origin = transform.position;
            elapsed += Mathf.Max(0f, deltaTime);
            float speed = Mathf.Max(0f, PatrolSpeed);

            if (!CanPatrol())
            {
                ActivePatrolPointId = "";
                CurrentPatrolTarget = Origin;
                transform.position = Origin;
                return Origin;
            }

            if (TryGetAuthoredPatrolTarget(out Vector3 target, out string targetId))
            {
                ActivePatrolPointId = targetId;
                CurrentPatrolTarget = target;
                Vector3 next = Vector3.MoveTowards(transform.position, target, speed * Mathf.Max(0f, deltaTime));
                transform.position = next;
                if (Vector3.Distance(next, target) <= 0.025f) AdvancePatrolWaypoint();
                return next;
            }

            float radius = Mathf.Max(0f, PatrolRadius);
            Vector3 next = Origin;
            if (radius > 0f && speed > 0f) next.x += Mathf.Sin(elapsed * speed) * radius;
            ActivePatrolPointId = "";
            CurrentPatrolTarget = next;
            transform.position = next;
            return next;
        }

        public bool Apply(GreyboxPlatformerSamplePlayer player)
        {
            return Apply(player, Time.time);
        }

        public bool Apply(GreyboxPlatformerSamplePlayer player, float timeSeconds)
        {
            if (Defeated || !player) return false;
            if (!CanTargetPlayer(player)) return false;
            if (!IsPlayerInAggroRange(player)) return false;
            if (!IsPlayerInRange(player)) return false;
            if (!IsAttackReady(timeSeconds)) return false;
            string abilityId = FirstAbilityId();
            string abilityEffect = AbilityStatusEffect(abilityId);
            if (!player.ApplyDamage(
                    Mathf.Max(1, Damage),
                    SourceArtifactKind,
                    SourceArtifactId,
                    string.IsNullOrWhiteSpace(SourceArtifactDisplayName) ? DisplayName : SourceArtifactDisplayName,
                    AbilityKnockbackImpulseFor(player, abilityId),
                    abilityEffect))
            {
                return false;
            }

            LastAttackTimeSeconds = timeSeconds;
            LastUsedAbilityId = abilityId;
            LastAppliedAbilityEffect = abilityEffect;
            HitCount += 1;
            return true;
        }

        public bool IsAttackReady(float timeSeconds)
        {
            if (Defeated) return false;
            float cooldown = Mathf.Max(0f, AttackCooldownSeconds);
            return cooldown <= 0f || timeSeconds - LastAttackTimeSeconds >= cooldown;
        }

        public bool IsPlayerInRange(GreyboxPlatformerSamplePlayer player)
        {
            if (!player) return false;
            return Vector3.Distance(transform.position, player.transform.position) <= SafeAttackRange();
        }

        public bool IsPlayerInAggroRange(GreyboxPlatformerSamplePlayer player)
        {
            if (!player) return false;
            if (!CanAggro()) return false;
            if (!CanTargetPlayer(player)) return false;
            return Vector3.Distance(transform.position, player.transform.position) <= SafeAggroRadius();
        }

        public bool CanTargetPlayer(GreyboxPlatformerSamplePlayer player)
        {
            if (!player) return false;
            return !SameFaction(Faction, player.Faction);
        }

        public bool CanPatrol()
        {
            string behavior = SafeBehavior();
            if (string.IsNullOrWhiteSpace(behavior)) return true;
            if (BehaviorContains(behavior, "patrol")) return true;
            if (BehaviorContains(behavior, "roam")) return true;
            if (BehaviorContains(behavior, "wander")) return true;
            if (BehaviorContains(behavior, "guard")) return false;
            if (BehaviorContains(behavior, "stationary")) return false;
            return true;
        }

        public bool CanAggro()
        {
            string behavior = SafeBehavior();
            if (string.IsNullOrWhiteSpace(behavior)) return true;
            if (BehaviorContains(behavior, "passive")) return false;
            if (BehaviorContains(behavior, "aggro")) return true;
            if (BehaviorContains(behavior, "attack")) return true;
            if (BehaviorContains(behavior, "guard")) return true;
            if (BehaviorContains(behavior, "chase")) return true;
            if (BehaviorContains(behavior, "hostile")) return true;
            return true;
        }

        public bool HasAbility(string abilityId)
        {
            string wanted = (abilityId ?? "").Trim();
            if (string.IsNullOrWhiteSpace(wanted) || AbilityIds == null) return false;
            foreach (string ability in AbilityIds)
            {
                if (string.Equals((ability ?? "").Trim(), wanted, System.StringComparison.OrdinalIgnoreCase)) return true;
            }

            return false;
        }

        private float SafeAttackRange()
        {
            return Mathf.Max(0.05f, AttackRange);
        }

        private float SafeAggroRadius()
        {
            return Mathf.Max(0.05f, AggroRadius);
        }

        public bool TakeHit(int damage = 1)
        {
            if (Defeated) return false;
            EnsureCurrentHealth();
            int safeDamage = Mathf.Max(1, damage);
            DamageTaken += safeDamage;
            CurrentHealth = Mathf.Max(0, CurrentHealth - safeDamage);
            if (CurrentHealth > 0) return true;

            Defeated = true;
            SpawnLootDrop();
            gameObject.SetActive(false);
            return true;
        }

        public GreyboxPlatformerSampleCollectible SpawnLootDrop()
        {
            string lootTableId = SafeToken(LootTableId);
            if (!SpawnLootOnDefeat || string.IsNullOrWhiteSpace(lootTableId)) return null;
            if (LastLootDrop) return LastLootDrop.GetComponent<GreyboxPlatformerSampleCollectible>();

            string dropId = BuildLootDropId(lootTableId);
            GameObject lootDrop = GameObject.CreatePrimitive(PrimitiveType.Cube);
            lootDrop.name = string.IsNullOrWhiteSpace(DisplayName) ? "Loot Drop" : $"Loot Drop - {DisplayName}";
            lootDrop.transform.SetParent(transform.parent, false);
            lootDrop.transform.position = transform.position + Vector3.up * 0.35f;
            lootDrop.transform.localScale = new Vector3(0.35f, 0.35f, 0.1f);
            foreach (Collider collider in lootDrop.GetComponents<Collider>()) DestroyRuntimeObject(collider);
            var renderer = lootDrop.GetComponent<Renderer>();
            if (renderer)
            {
                if (LootDropMaterial)
                {
                    renderer.sharedMaterial = LootDropMaterial;
                }
                else
                {
                    renderer.material.color = LootDropColor;
                }
            }

            var hitbox = lootDrop.AddComponent<CircleCollider2D>();
            hitbox.isTrigger = true;
            var collectible = lootDrop.AddComponent<GreyboxPlatformerSampleCollectible>();
            collectible.CoinId = dropId;
            collectible.DisplayName = $"Loot: {lootTableId}";
            collectible.SourceArtifactKind = "gameview.loot-table";
            collectible.SourceArtifactId = lootTableId;
            collectible.SourceArtifactDisplayName = lootTableId;
            collectible.SourceObjectiveType = "loot";
            LastLootDrop = lootDrop;
            LastLootDropId = dropId;
            return collectible;
        }

        public void ResetEnemy()
        {
            DestroyLootDrop();
            DamageTaken = 0;
            authoredHealthSnapshot = Mathf.Max(1, Health);
            CurrentHealth = authoredHealthSnapshot;
            Defeated = false;
            LastLootDropId = "";
            LastAttackTimeSeconds = float.NegativeInfinity;
            LastUsedAbilityId = "";
            LastAppliedAbilityEffect = "";
            gameObject.SetActive(true);
        }

        private void DestroyLootDrop()
        {
            if (!LastLootDrop) return;
            DestroyRuntimeObject(LastLootDrop);
            LastLootDrop = null;
        }

        private static void DestroyRuntimeObject(UnityEngine.Object item)
        {
            if (!item) return;
            if (Application.isPlaying)
            {
                Destroy(item);
            }
            else
            {
                DestroyImmediate(item);
            }
        }

        private string BuildLootDropId(string lootTableId)
        {
            string sourceId = SafeToken(EnemyId);
            if (string.IsNullOrWhiteSpace(sourceId)) sourceId = SafeToken(DisplayName);
            if (string.IsNullOrWhiteSpace(sourceId)) sourceId = "enemy";
            return $"loot-{sourceId}-{lootTableId}";
        }

        private static string SafeToken(string value)
        {
            string text = (value ?? "").Trim();
            if (string.IsNullOrWhiteSpace(text)) return "";
            char[] chars = text.ToLowerInvariant().ToCharArray();
            for (int i = 0; i < chars.Length; i++)
            {
                char c = chars[i];
                if (char.IsLetterOrDigit(c) || c == '-' || c == '_') continue;
                chars[i] = '-';
            }

            return new string(chars).Trim('-');
        }

        private void EnsureCurrentHealth()
        {
            int authoredHealth = Mathf.Max(1, Health);
            if (!Defeated && (CurrentHealth <= 0 || (DamageTaken == 0 && authoredHealthSnapshot != authoredHealth)))
            {
                authoredHealthSnapshot = authoredHealth;
                CurrentHealth = authoredHealth;
            }
        }

        private bool TryGetAuthoredPatrolTarget(out Vector3 target, out string targetId)
        {
            target = Vector3.zero;
            targetId = "";
            if (PatrolWaypoints == null || PatrolWaypoints.Length == 0) return false;

            int index = Mathf.Clamp(patrolWaypointIndex, 0, PatrolWaypoints.Length - 1);
            target = PatrolWaypoints[index];
            targetId = PatrolPointIdAt(index);
            return true;
        }

        private void AdvancePatrolWaypoint()
        {
            if (PatrolWaypoints == null || PatrolWaypoints.Length == 0)
            {
                patrolWaypointIndex = 0;
                return;
            }

            patrolWaypointIndex = (patrolWaypointIndex + 1) % PatrolWaypoints.Length;
        }

        private string PatrolPointIdAt(int index)
        {
            if (PatrolPointIds != null && index >= 0 && index < PatrolPointIds.Length)
            {
                string safe = (PatrolPointIds[index] ?? "").Trim();
                if (!string.IsNullOrWhiteSpace(safe)) return safe;
            }

            return $"waypoint-{index + 1:00}";
        }

        private string SafeBehavior()
        {
            return (Behavior ?? "").Trim();
        }

        private static bool SameFaction(string left, string right)
        {
            string safeLeft = SafeFaction(left);
            string safeRight = SafeFaction(right);
            if (string.IsNullOrWhiteSpace(safeLeft) || string.IsNullOrWhiteSpace(safeRight)) return false;
            return string.Equals(safeLeft, safeRight, System.StringComparison.OrdinalIgnoreCase);
        }

        private static string SafeFaction(string faction)
        {
            return (faction ?? "").Trim();
        }

        private static bool BehaviorContains(string behavior, string token)
        {
            return behavior.IndexOf(token, System.StringComparison.OrdinalIgnoreCase) >= 0;
        }

        private Vector2 AbilityKnockbackImpulseFor(GreyboxPlatformerSamplePlayer player, string abilityId)
        {
            if (!player || string.IsNullOrWhiteSpace(abilityId)) return Vector2.zero;
            float magnitude = AbilityKnockbackMagnitude(abilityId);
            if (magnitude <= 0f) return Vector2.zero;
            Vector2 direction = player.transform.position - transform.position;
            if (direction.sqrMagnitude <= 0.0001f) direction = Vector2.right;
            return direction.normalized * magnitude;
        }

        private float AbilityKnockbackMagnitude(string abilityId)
        {
            string safe = (abilityId ?? "").Trim();
            if (string.IsNullOrWhiteSpace(safe)) return 0f;
            float baseKnockback = Mathf.Max(0f, AbilityKnockback);
            if (AbilityContains(safe, "slam")) return Mathf.Max(baseKnockback * 1.5f, Mathf.Max(1, Damage) * 2f);
            if (AbilityContains(safe, "bump")) return Mathf.Max(baseKnockback, Mathf.Max(1, Damage));
            return baseKnockback;
        }

        private string AbilityStatusEffect(string abilityId)
        {
            return (abilityId ?? "").Trim();
        }

        private static bool AbilityContains(string abilityId, string token)
        {
            return abilityId.IndexOf(token, System.StringComparison.OrdinalIgnoreCase) >= 0;
        }

        private string FirstAbilityId()
        {
            if (AbilityIds == null) return "";
            foreach (string ability in AbilityIds)
            {
                string safe = (ability ?? "").Trim();
                if (!string.IsNullOrWhiteSpace(safe)) return safe;
            }

            return "";
        }
    }
}
