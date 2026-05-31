// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System.Collections.Generic;
using UnityEngine;
using UnityEngine.InputSystem;

namespace Greybox.Runtime
{
    [RequireComponent(typeof(Rigidbody2D))]
    [RequireComponent(typeof(BoxCollider2D))]
    public sealed class GreyboxPlatformerSamplePlayer : MonoBehaviour
    {
        public string PlayerId = "player_runner";
        public string DisplayName = "Player Runner";
        public string Role = "controller";
        public string Faction = "";
        public string Behavior = "";
        public string[] AbilityIds = new string[0];
        public string LootTableId = "";
        public string SourceArtifactKind = "";
        public string SourceArtifactId = "";
        public string SourceArtifactDisplayName = "";
        public Vector3 SpawnPoint;
        public float MoveSpeed = 6f;
        public float JumpImpulse = 11f;
        public float FallRespawnY = -8f;
        public bool CanJump = true;
        public int MaxHearts = 3;
        public int AttackDamage = 1;
        public float AttackRange = 1.5f;
        public float AttackCooldownSeconds = 0f;

        public int DeathCount { get; private set; }
        public int CurrentHearts { get; private set; }
        public int TotalDamageTaken { get; private set; }
        public int AttackCount { get; private set; }
        public int JumpCount { get; private set; }
        public int DefeatedEnemyCount { get; private set; }
        public int GoalRewardCount { get; private set; }
        public int LootPickupCount { get; private set; }
        public float LastAttackTimeSeconds { get; private set; } = float.NegativeInfinity;
        public int LastDamageTaken { get; private set; }
        public Vector2 LastKnockbackImpulse { get; private set; }
        public string LastDamageSourceKind { get; private set; } = "";
        public string LastDamageSourceId { get; private set; } = "";
        public string LastDamageSourceDisplayName { get; private set; } = "";
        public string LastStatusEffect { get; private set; } = "";
        public string LastUsedAbilityId { get; private set; } = "";
        public string LastAttackedEnemyId { get; private set; } = "";
        public string LastAttackedEnemyDisplayName { get; private set; } = "";
        public string LastDefeatedEnemyLootTableId { get; private set; } = "";
        public string LastCollectedLootDropId { get; private set; } = "";
        public string LastCollectedLootTableId { get; private set; } = "";
        public string LastCollectedLootDisplayName { get; private set; } = "";
        public string LastCompletedGoalId { get; private set; } = "";
        public string LastCompletedGoalDisplayName { get; private set; } = "";
        public string LastCompletedGoalRewardId { get; private set; } = "";

        private Rigidbody2D body;
        private readonly HashSet<string> collectedLootDropIds = new HashSet<string>();
        private readonly HashSet<string> defeatedEnemyIds = new HashSet<string>();
        private float queuedHorizontal;
        private bool queuedJump;
        private bool queuedAttack;

        private void Awake()
        {
            EnsureBody();
            EnsureHealthInitialized();
            if (SpawnPoint == Vector3.zero) SpawnPoint = transform.position;
        }

        private void Update()
        {
            QueueInput(ReadHorizontal(), ReadJumpPressed(), ReadAttackPressed());
        }

        private void FixedUpdate()
        {
            Simulate(queuedHorizontal, queuedJump, queuedAttack);
            queuedJump = false;
            queuedAttack = false;
            if (transform.position.y < FallRespawnY) Respawn();
        }

        private void OnCollisionStay2D(Collision2D collision)
        {
            foreach (ContactPoint2D contact in collision.contacts)
            {
                if (contact.normal.y > 0.45f)
                {
                    CanJump = true;
                    JumpCount = 0;
                    return;
                }
            }
        }

        public void QueueInput(float horizontal, bool jumpPressed)
        {
            QueueInput(horizontal, jumpPressed, false);
        }

        public void QueueInput(float horizontal, bool jumpPressed, bool attackPressed)
        {
            queuedHorizontal = Mathf.Clamp(horizontal, -1f, 1f);
            queuedJump = queuedJump || jumpPressed;
            queuedAttack = queuedAttack || attackPressed;
        }

        public void Simulate(float horizontal, bool jumpPressed)
        {
            Simulate(horizontal, jumpPressed, false);
        }

        public void Simulate(float horizontal, bool jumpPressed, bool attackPressed)
        {
            Simulate(horizontal, jumpPressed, attackPressed, Time.time);
        }

        public void Simulate(float horizontal, bool jumpPressed, bool attackPressed, float timeSeconds)
        {
            EnsureBody();
            Vector2 velocity = body.velocity;
            velocity.x = Mathf.Clamp(horizontal, -1f, 1f) * MoveSpeed;
            body.velocity = velocity;
            if (attackPressed) AttackNearestEnemy(timeSeconds);
            if (!jumpPressed) return;
            if (CanJump)
            {
                CanJump = false;
                JumpCount = 1;
                LastUsedAbilityId = "";
                ApplyJumpImpulse();
                return;
            }

            string airJumpAbility = AirJumpAbilityId();
            if (!string.IsNullOrWhiteSpace(airJumpAbility) && JumpCount == 1)
            {
                JumpCount = 2;
                LastUsedAbilityId = airJumpAbility;
                ApplyJumpImpulse();
            }
        }

        public void Respawn()
        {
            RespawnWithDamage(1, Vector2.zero);
        }

        public void ResetHealth()
        {
            MaxHearts = Mathf.Clamp(MaxHearts, 1, 10);
            CurrentHearts = MaxHearts;
            TotalDamageTaken = 0;
            LastDamageTaken = 0;
            LastKnockbackImpulse = Vector2.zero;
            LastDamageSourceKind = "";
            LastDamageSourceId = "";
            LastDamageSourceDisplayName = "";
            LastStatusEffect = "";
            LastUsedAbilityId = "";
        }

        private void RespawnWithDamage(int damage, Vector2 knockbackImpulse)
        {
            EnsureBody();
            EnsureHealthInitialized();
            int safeDamage = Mathf.Max(0, damage);
            if (safeDamage > 0)
            {
                TotalDamageTaken += safeDamage;
                CurrentHearts = Mathf.Max(0, CurrentHearts - safeDamage);
            }

            DeathCount += 1;
            transform.position = SpawnPoint;
            LastKnockbackImpulse = knockbackImpulse;
            body.velocity = knockbackImpulse;
            body.angularVelocity = 0f;
            CanJump = true;
            JumpCount = 0;
        }

        public bool ApplyDamage(int damage, string sourceKind = "", string sourceId = "", string sourceDisplayName = "")
        {
            return ApplyDamage(damage, sourceKind, sourceId, sourceDisplayName, Vector2.zero);
        }

        public bool ApplyDamage(int damage, string sourceKind, string sourceId, string sourceDisplayName, Vector2 knockbackImpulse)
        {
            return ApplyDamage(damage, sourceKind, sourceId, sourceDisplayName, knockbackImpulse, "");
        }

        public bool ApplyDamage(int damage, string sourceKind, string sourceId, string sourceDisplayName, Vector2 knockbackImpulse, string statusEffect)
        {
            int safeDamage = Mathf.Max(0, damage);
            if (safeDamage <= 0) return false;
            LastDamageTaken = safeDamage;
            LastDamageSourceKind = (sourceKind ?? "").Trim();
            LastDamageSourceId = (sourceId ?? "").Trim();
            LastDamageSourceDisplayName = (sourceDisplayName ?? "").Trim();
            LastStatusEffect = (statusEffect ?? "").Trim();
            RespawnWithDamage(safeDamage, knockbackImpulse);
            return true;
        }

        public bool Attack(GreyboxPlatformerSampleEnemy enemy)
        {
            return Attack(enemy, Time.time);
        }

        public bool Attack(GreyboxPlatformerSampleEnemy enemy, float timeSeconds)
        {
            if (!CanAttack(enemy, timeSeconds)) return false;
            int safeDamage = Mathf.Max(1, AttackDamage);
            if (!enemy.TakeHit(safeDamage)) return false;
            AttackCount += 1;
            LastAttackTimeSeconds = timeSeconds;
            LastAttackedEnemyId = (enemy.EnemyId ?? "").Trim();
            LastAttackedEnemyDisplayName = (enemy.DisplayName ?? "").Trim();
            if (enemy.Defeated)
            {
                DefeatedEnemyCount += 1;
                LastDefeatedEnemyLootTableId = (enemy.LootTableId ?? "").Trim();
                if (!string.IsNullOrWhiteSpace(LastAttackedEnemyId)) defeatedEnemyIds.Add(LastAttackedEnemyId);
            }
            return true;
        }

        public bool AttackNearestEnemy()
        {
            return AttackNearestEnemy(Time.time);
        }

        public bool AttackNearestEnemy(float timeSeconds)
        {
            GreyboxPlatformerSampleEnemy nearest = FindNearestAttackableEnemy(timeSeconds);
            return nearest && Attack(nearest, timeSeconds);
        }

        public GreyboxPlatformerSampleEnemy FindNearestAttackableEnemy()
        {
            return FindNearestAttackableEnemy(Time.time);
        }

        public GreyboxPlatformerSampleEnemy FindNearestAttackableEnemy(float timeSeconds)
        {
            GreyboxPlatformerSampleEnemy best = null;
            float bestDistance = float.PositiveInfinity;
            foreach (GreyboxPlatformerSampleEnemy enemy in FindObjectsOfType<GreyboxPlatformerSampleEnemy>())
            {
                if (!CanAttack(enemy, timeSeconds)) continue;
                float distance = Vector2.Distance(transform.position, enemy.transform.position);
                if (distance >= bestDistance) continue;
                best = enemy;
                bestDistance = distance;
            }

            return best;
        }

        public bool CanAttack(GreyboxPlatformerSampleEnemy enemy)
        {
            return CanAttack(enemy, Time.time);
        }

        public bool CanAttack(GreyboxPlatformerSampleEnemy enemy, float timeSeconds)
        {
            return enemy
                && !enemy.Defeated
                && IsAttackReady(timeSeconds)
                && !SameFaction(enemy.Faction)
                && IsEnemyInAttackRange(enemy);
        }

        public bool IsAttackReady(float timeSeconds)
        {
            float cooldown = Mathf.Max(0f, AttackCooldownSeconds);
            return cooldown <= 0f || timeSeconds - LastAttackTimeSeconds >= cooldown;
        }

        public bool IsEnemyInAttackRange(GreyboxPlatformerSampleEnemy enemy)
        {
            if (!enemy) return false;
            return Vector2.Distance(transform.position, enemy.transform.position) <= SafeAttackRange();
        }

        private float SafeAttackRange()
        {
            return Mathf.Max(0.05f, AttackRange);
        }

        public bool ReceiveGoalReward(GreyboxPlatformerSampleGoal goal)
        {
            if (!goal || !goal.Completed) return false;
            string rewardId = string.IsNullOrWhiteSpace(goal.LastReward) ? (goal.Reward ?? "").Trim() : goal.LastReward.Trim();
            if (string.IsNullOrWhiteSpace(rewardId)) return false;

            GoalRewardCount += 1;
            LastCompletedGoalId = (goal.GoalId ?? "").Trim();
            LastCompletedGoalDisplayName = (goal.DisplayName ?? "").Trim();
            LastCompletedGoalRewardId = rewardId;
            return true;
        }

        public bool ReceiveLoot(GreyboxPlatformerSampleCollectible collectible)
        {
            if (!collectible || !collectible.IsLoot()) return false;
            string dropId = (collectible.CoinId ?? "").Trim();
            if (string.IsNullOrWhiteSpace(dropId)) return false;
            if (!collectedLootDropIds.Add(dropId)) return false;

            LootPickupCount += 1;
            LastCollectedLootDropId = dropId;
            LastCollectedLootTableId = (collectible.SourceArtifactId ?? "").Trim();
            LastCollectedLootDisplayName = (collectible.DisplayName ?? "").Trim();
            return true;
        }

        public void ResetLootInventory()
        {
            collectedLootDropIds.Clear();
            LootPickupCount = 0;
            LastCollectedLootDropId = "";
            LastCollectedLootTableId = "";
            LastCollectedLootDisplayName = "";
        }

        public void ResetCombatProgress()
        {
            defeatedEnemyIds.Clear();
            AttackCount = 0;
            DefeatedEnemyCount = 0;
            LastAttackTimeSeconds = float.NegativeInfinity;
            LastAttackedEnemyId = "";
            LastAttackedEnemyDisplayName = "";
            LastDefeatedEnemyLootTableId = "";
        }

        public void ResetRunProgress()
        {
            EnsureBody();
            ResetHealth();
            ResetLootInventory();
            ResetCombatProgress();
            DeathCount = 0;
            GoalRewardCount = 0;
            JumpCount = 0;
            CanJump = true;
            LastCompletedGoalId = "";
            LastCompletedGoalDisplayName = "";
            LastCompletedGoalRewardId = "";
            queuedHorizontal = 0f;
            queuedJump = false;
            queuedAttack = false;
            transform.position = SpawnPoint;
            body.velocity = Vector2.zero;
            body.angularVelocity = 0f;
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

        public bool HasDefeatedEnemy(string enemyId)
        {
            string wanted = (enemyId ?? "").Trim();
            if (string.IsNullOrWhiteSpace(wanted)) return false;
            foreach (string defeatedEnemyId in defeatedEnemyIds)
            {
                if (string.Equals(defeatedEnemyId, wanted, System.StringComparison.OrdinalIgnoreCase)) return true;
            }

            return false;
        }

        private bool SameFaction(string otherFaction)
        {
            string own = SafeFaction(Faction);
            string other = SafeFaction(otherFaction);
            return !string.IsNullOrWhiteSpace(own)
                && !string.IsNullOrWhiteSpace(other)
                && string.Equals(own, other, System.StringComparison.OrdinalIgnoreCase);
        }

        private static string SafeFaction(string faction)
        {
            return (faction ?? "").Trim();
        }

        public static float ComposeHorizontal(bool inputSystemLeft, bool inputSystemRight, bool legacyLeft, bool legacyRight)
        {
            float inputSystemHorizontal = ComposeAxis(inputSystemLeft, inputSystemRight);
            return Mathf.Abs(inputSystemHorizontal) > 0.01f
                ? inputSystemHorizontal
                : ComposeAxis(legacyLeft, legacyRight);
        }

        public static bool ComposeJumpPressed(bool inputSystemJump, bool legacyJump)
        {
            return inputSystemJump || legacyJump;
        }

        private void EnsureBody()
        {
            if (body) return;
            body = GetComponent<Rigidbody2D>();
            body.freezeRotation = true;
            body.gravityScale = Mathf.Max(1f, body.gravityScale);
        }

        private void ApplyJumpImpulse()
        {
            EnsureBody();
            Vector2 velocity = body.velocity;
            if (velocity.y < 0f)
            {
                velocity.y = 0f;
                body.velocity = velocity;
            }

            body.AddForce(Vector2.up * JumpImpulse, ForceMode2D.Impulse);
        }

        private string AirJumpAbilityId()
        {
            if (HasAbility("double-jump")) return "double-jump";
            if (HasAbility("air-jump")) return "air-jump";
            return "";
        }

        private void EnsureHealthInitialized()
        {
            MaxHearts = Mathf.Clamp(MaxHearts, 1, 10);
            if (CurrentHearts <= 0 && TotalDamageTaken == 0 && DeathCount == 0) CurrentHearts = MaxHearts;
        }

        private static float ReadHorizontal()
        {
            Keyboard keyboard = Keyboard.current;
            return ComposeHorizontal(
                IsInputSystemLeftPressed(keyboard),
                IsInputSystemRightPressed(keyboard),
                TryReadLegacyKey(KeyCode.A) || TryReadLegacyKey(KeyCode.LeftArrow),
                TryReadLegacyKey(KeyCode.D) || TryReadLegacyKey(KeyCode.RightArrow)
            );
        }

        private static bool ReadJumpPressed()
        {
            return ComposeJumpPressed(
                ReadInputSystemJumpPressed(Keyboard.current),
                TryReadLegacyKeyDown(KeyCode.Space)
                    || TryReadLegacyKeyDown(KeyCode.W)
                    || TryReadLegacyKeyDown(KeyCode.UpArrow)
            );
        }

        private static bool ReadAttackPressed()
        {
            return ReadInputSystemAttackPressed(Keyboard.current)
                || TryReadLegacyKeyDown(KeyCode.J)
                || TryReadLegacyKeyDown(KeyCode.Return);
        }

        private static float ComposeAxis(bool left, bool right)
        {
            float horizontal = 0f;
            if (left) horizontal -= 1f;
            if (right) horizontal += 1f;
            return Mathf.Clamp(horizontal, -1f, 1f);
        }

        private static bool IsInputSystemLeftPressed(Keyboard keyboard)
        {
            return keyboard != null && (keyboard.aKey.isPressed || keyboard.leftArrowKey.isPressed);
        }

        private static bool IsInputSystemRightPressed(Keyboard keyboard)
        {
            return keyboard != null && (keyboard.dKey.isPressed || keyboard.rightArrowKey.isPressed);
        }

        private static bool ReadInputSystemJumpPressed(Keyboard keyboard)
        {
            return keyboard != null
                && (keyboard.spaceKey.wasPressedThisFrame
                    || keyboard.wKey.wasPressedThisFrame
                    || keyboard.upArrowKey.wasPressedThisFrame);
        }

        private static bool ReadInputSystemAttackPressed(Keyboard keyboard)
        {
            return keyboard != null
                && (keyboard.jKey.wasPressedThisFrame
                    || keyboard.enterKey.wasPressedThisFrame);
        }

        private static bool TryReadLegacyKey(KeyCode key)
        {
            try
            {
                return Input.GetKey(key);
            }
            catch (System.InvalidOperationException)
            {
                return false;
            }
        }

        private static bool TryReadLegacyKeyDown(KeyCode key)
        {
            try
            {
                return Input.GetKeyDown(key);
            }
            catch (System.InvalidOperationException)
            {
                return false;
            }
        }
    }
}
