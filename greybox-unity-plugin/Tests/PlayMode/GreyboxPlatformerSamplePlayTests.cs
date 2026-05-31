// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using Greybox.Runtime;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.UI;

namespace Greybox.Tests.PlayMode
{
    public sealed class GreyboxPlatformerSamplePlayTests
    {
        [Test]
        public void PlayerSimulateMovesAndRespawnsToSpawnPoint()
        {
            var playerObject = new GameObject("Player");
            try
            {
                playerObject.AddComponent<BoxCollider2D>();
                var body = playerObject.AddComponent<Rigidbody2D>();
                var player = playerObject.AddComponent<GreyboxPlatformerSamplePlayer>();
                player.SpawnPoint = new Vector3(2f, 3f, 0f);
                player.MoveSpeed = 5f;
                player.CanJump = true;

                player.Simulate(1f, false);
                Assert.AreEqual(5f, body.velocity.x, 0.001f);

                Assert.IsTrue(player.ApplyDamage(2, "gameview.hazard", "spike_row_b", "Spike Row After Checkpoint"));
                Assert.AreEqual(2, player.LastDamageTaken);
                Assert.AreEqual("gameview.hazard", player.LastDamageSourceKind);
                Assert.AreEqual("spike_row_b", player.LastDamageSourceId);
                Assert.AreEqual("Spike Row After Checkpoint", player.LastDamageSourceDisplayName);
                Assert.AreEqual(1, player.DeathCount);
                Assert.AreEqual(1, player.CurrentHearts);
                Assert.AreEqual(2, player.TotalDamageTaken);

                player.Respawn();
                Assert.AreEqual(player.SpawnPoint, playerObject.transform.position);
                Assert.AreEqual(Vector2.zero, body.velocity);
                Assert.AreEqual(2, player.DeathCount);
                Assert.AreEqual(0, player.CurrentHearts);
                Assert.AreEqual(3, player.TotalDamageTaken);

                player.ResetHealth();
                Assert.AreEqual(3, player.CurrentHearts);
                Assert.AreEqual(0, player.TotalDamageTaken);
                Assert.AreEqual(0, player.LastDamageTaken);
            }
            finally
            {
                Object.DestroyImmediate(playerObject);
            }
        }

        [Test]
        public void PlayerResetRunProgressClearsReplayState()
        {
            var playerObject = new GameObject("Player");
            var enemyObject = new GameObject("Enemy");
            var goalObject = new GameObject("Goal");
            var lootObject = new GameObject("Loot");
            try
            {
                playerObject.AddComponent<BoxCollider2D>();
                var body = playerObject.AddComponent<Rigidbody2D>();
                var player = playerObject.AddComponent<GreyboxPlatformerSamplePlayer>();
                player.SpawnPoint = new Vector3(2f, 3f, 0f);
                player.MaxHearts = 5;
                player.AttackRange = 2f;
                playerObject.transform.position = player.SpawnPoint;

                enemyObject.transform.position = player.SpawnPoint + Vector3.right;
                var enemy = enemyObject.AddComponent<GreyboxPlatformerSampleEnemy>();
                enemy.EnemyId = "boss";
                enemy.DisplayName = "Boss";
                enemy.Health = 1;
                enemy.LootTableId = "boss-loot";
                enemy.ResetEnemy();

                var goal = goalObject.AddComponent<GreyboxPlatformerSampleGoal>();
                goal.Reward = "open-boss-door";
                goal.MarkReached(player, null, 10f);

                var loot = lootObject.AddComponent<GreyboxPlatformerSampleCollectible>();
                loot.CoinId = "loot-boss";
                loot.SourceArtifactKind = "gameview.loot-table";
                loot.SourceArtifactId = "boss-loot";
                loot.SourceObjectiveType = "loot";
                Assert.IsTrue(loot.Collect(player));
                Assert.IsTrue(player.ApplyDamage(2, "gameview.hazard", "spike_row_b", "Spike Row After Checkpoint"));
                Assert.IsTrue(player.Attack(enemy, 20f));
                body.velocity = new Vector2(3f, 4f);
                body.angularVelocity = 12f;
                playerObject.transform.position = new Vector3(12f, -2f, 0f);

                player.ResetRunProgress();

                Assert.AreEqual(player.SpawnPoint, playerObject.transform.position);
                Assert.AreEqual(Vector2.zero, body.velocity);
                Assert.AreEqual(0f, body.angularVelocity, 0.001f);
                Assert.AreEqual(0, player.DeathCount);
                Assert.AreEqual(5, player.CurrentHearts);
                Assert.AreEqual(0, player.TotalDamageTaken);
                Assert.AreEqual(0, player.AttackCount);
                Assert.AreEqual(0, player.DefeatedEnemyCount);
                Assert.IsFalse(player.HasDefeatedEnemy("boss"));
                Assert.AreEqual("", player.LastDefeatedEnemyLootTableId);
                Assert.AreEqual(0, player.LootPickupCount);
                Assert.AreEqual("", player.LastCollectedLootTableId);
                Assert.AreEqual(0, player.GoalRewardCount);
                Assert.AreEqual("", player.LastCompletedGoalId);
                Assert.AreEqual("", player.LastCompletedGoalDisplayName);
                Assert.AreEqual("", player.LastCompletedGoalRewardId);
                Assert.AreEqual(0, player.JumpCount);
                Assert.IsTrue(player.CanJump);
            }
            finally
            {
                Object.DestroyImmediate(playerObject);
                Object.DestroyImmediate(enemyObject);
                Object.DestroyImmediate(goalObject);
                Object.DestroyImmediate(lootObject);
            }
        }

        [Test]
        public void SampleRunResetControllerRestartsPlayableSampleState()
        {
            var rootObject = new GameObject("Sample Root");
            var hudObject = new GameObject("HUD");
            var playerObject = new GameObject("Player");
            var checkpointObject = new GameObject("Checkpoint");
            var goalObject = new GameObject("Goal");
            var enemyObject = new GameObject("Enemy");
            var coinObject = new GameObject("Coin");
            try
            {
                var initialSpawn = new Vector3(1f, 2f, 0f);
                var checkpointSpawn = new Vector3(8f, 2f, 0f);

                playerObject.AddComponent<BoxCollider2D>();
                playerObject.AddComponent<Rigidbody2D>();
                var player = playerObject.AddComponent<GreyboxPlatformerSamplePlayer>();
                player.PlayerId = "player_runner";
                player.SpawnPoint = initialSpawn;
                playerObject.transform.position = initialSpawn;

                var checkpoint = checkpointObject.AddComponent<GreyboxPlatformerSampleCheckpoint>();
                checkpoint.RespawnPoint = checkpointSpawn;
                checkpoint.ActorIds = new[] { "player_runner" };
                checkpoint.MaxActivations = 2;

                var goal = goalObject.AddComponent<GreyboxPlatformerSampleGoal>();
                goal.Reward = "open-exit";

                var hud = hudObject.AddComponent<GreyboxPlatformerSampleHud>();
                hud.Player = player;
                hud.Goal = goal;
                hud.Checkpoint = checkpoint;
                hud.TotalCoins = 1;
                goal.Hud = hud;

                var enemy = enemyObject.AddComponent<GreyboxPlatformerSampleEnemy>();
                enemy.EnemyId = "boss";
                enemy.Health = 1;
                enemy.ResetEnemy();

                var coin = coinObject.AddComponent<GreyboxPlatformerSampleCollectible>();
                coin.Hud = hud;
                coin.CoinId = "coin-01";
                coin.SourceObjectiveType = "collectible";

                var reset = rootObject.AddComponent<GreyboxPlatformerSampleRunReset>();
                reset.Player = player;
                reset.Hud = hud;
                reset.Goal = goal;
                reset.Checkpoint = checkpoint;
                reset.CaptureInitialState();

                Assert.IsTrue(reset.ResetOnKeyPress);
                Assert.AreEqual(KeyCode.R, reset.LegacyResetKey);
                Assert.IsTrue(GreyboxPlatformerSampleRunReset.ComposeResetPressed(true, false));
                Assert.IsTrue(GreyboxPlatformerSampleRunReset.ComposeResetPressed(false, true));
                Assert.IsFalse(GreyboxPlatformerSampleRunReset.ComposeResetPressed(false, false));
                Assert.IsTrue(reset.CanHandleHudAction("reset-run"));
                Assert.IsTrue(reset.CanHandleHudAction("RESET-RUN"));
                Assert.IsFalse(reset.CanHandleHudAction("start-run"));

                Assert.IsTrue(checkpoint.Activate(player, 10f));
                Assert.AreEqual(checkpointSpawn, player.SpawnPoint);
                Assert.IsTrue(player.ApplyDamage(1, "gameview.hazard", "pit", "Pit"));
                Assert.IsTrue(goal.MarkReached(player, hud, 11f));
                Assert.IsTrue(enemy.TakeHit(1));
                Assert.IsTrue(coin.Collect(player));
                Assert.IsTrue(coin.Collected);
                Assert.IsFalse(coinObject.activeSelf);

                GreyboxHudActionDispatcher.Raise("start-run", "hud-reset", "start-run", "//*[@data-agds-id=\"hud-reset\"]", "START RUN", hud);
                Assert.AreEqual(0, reset.LastHudActionResetCount);
                Assert.IsTrue(coin.Collected);

                GreyboxHudActionDispatcher.Raise("reset-run", "hud-reset", "reset-run", "//*[@data-agds-id=\"hud-reset\"]", "RESET RUN", hud);
                Assert.AreEqual(1, reset.LastHudActionResetCount);

                Assert.AreEqual(initialSpawn, player.SpawnPoint);
                Assert.AreEqual(initialSpawn, playerObject.transform.position);
                Assert.AreEqual(0, player.DeathCount);
                Assert.AreEqual(0, player.GoalRewardCount);
                Assert.IsFalse(goal.Completed);
                Assert.AreEqual(0, goal.CompletionCount);
                Assert.IsFalse(checkpoint.Activated);
                Assert.AreEqual(0, checkpoint.ActivationCount);
                Assert.IsFalse(enemy.Defeated);
                Assert.IsTrue(enemyObject.activeSelf);
                Assert.AreEqual(1, enemy.CurrentHealth);
                Assert.IsFalse(coin.Collected);
                Assert.IsTrue(coinObject.activeSelf);
                Assert.AreEqual(0, hud.CoinsCollected);
                Assert.AreEqual(1, reset.LastResetEnemyCount);
                Assert.AreEqual(1, reset.LastResetCollectibleCount);
                Assert.IsTrue(reset.HasInitialPlayerSpawnPoint);
                Assert.AreEqual(initialSpawn, reset.InitialPlayerSpawnPoint);
                reset.ResetSampleRun();
            }
            finally
            {
                Object.DestroyImmediate(rootObject);
                Object.DestroyImmediate(hudObject);
                Object.DestroyImmediate(playerObject);
                Object.DestroyImmediate(checkpointObject);
                Object.DestroyImmediate(goalObject);
                Object.DestroyImmediate(enemyObject);
                Object.DestroyImmediate(coinObject);
            }
        }

        [Test]
        public void PlayerInputCompositionPrefersInputSystemAndFallsBackToLegacyKeyboard()
        {
            Assert.AreEqual(-1f, GreyboxPlatformerSamplePlayer.ComposeHorizontal(true, false, false, true));
            Assert.AreEqual(1f, GreyboxPlatformerSamplePlayer.ComposeHorizontal(false, true, true, false));
            Assert.AreEqual(-1f, GreyboxPlatformerSamplePlayer.ComposeHorizontal(false, false, true, false));
            Assert.AreEqual(1f, GreyboxPlatformerSamplePlayer.ComposeHorizontal(false, false, false, true));
            Assert.AreEqual(0f, GreyboxPlatformerSamplePlayer.ComposeHorizontal(false, false, true, true));
            Assert.True(GreyboxPlatformerSamplePlayer.ComposeJumpPressed(true, false));
            Assert.True(GreyboxPlatformerSamplePlayer.ComposeJumpPressed(false, true));
            Assert.False(GreyboxPlatformerSamplePlayer.ComposeJumpPressed(false, false));
        }

        [Test]
        public void PlayerUsesAuthoredDoubleJumpAbility()
        {
            var playerObject = new GameObject("Player");
            try
            {
                playerObject.AddComponent<BoxCollider2D>();
                var body = playerObject.AddComponent<Rigidbody2D>();
                var player = playerObject.AddComponent<GreyboxPlatformerSamplePlayer>();
                player.JumpImpulse = 8f;
                player.CanJump = true;
                player.AbilityIds = new[] { "double-jump" };

                player.Simulate(0f, true);
                Assert.AreEqual(1, player.JumpCount);
                Assert.AreEqual("", player.LastUsedAbilityId);

                player.Simulate(0f, true);
                Assert.AreEqual(2, player.JumpCount);
                Assert.AreEqual("double-jump", player.LastUsedAbilityId);

                float velocityAfterDoubleJump = body.velocity.y;
                player.Simulate(0f, true);
                Assert.AreEqual(2, player.JumpCount);
                Assert.AreEqual(velocityAfterDoubleJump, body.velocity.y, 0.001f);
                Assert.IsTrue(player.HasAbility("double-jump"));

                player.Respawn();
                Assert.AreEqual(0, player.JumpCount);
                Assert.IsTrue(player.CanJump);
            }
            finally
            {
                Object.DestroyImmediate(playerObject);
            }
        }

        [Test]
        public void HazardRespawnsPlayer()
        {
            var playerObject = new GameObject("Player");
            var hazardObject = new GameObject("Hazard");
            try
            {
                playerObject.AddComponent<BoxCollider2D>();
                playerObject.AddComponent<Rigidbody2D>();
                var player = playerObject.AddComponent<GreyboxPlatformerSamplePlayer>();
                player.SpawnPoint = new Vector3(-2f, 1f, 0f);
                playerObject.transform.position = new Vector3(8f, -4f, 0f);
                player.Role = "controller";

                hazardObject.AddComponent<BoxCollider2D>().isTrigger = true;
                var hazard = hazardObject.AddComponent<GreyboxPlatformerSampleHazard>();
                hazard.Effect = "stagger";
                hazard.Damage = 2f;
                hazard.TickSeconds = 0.5f;
                hazard.Knockback = 4.5f;
                hazard.AffectedTags = new[] { "controller" };
                hazard.SourceArtifactKind = "gameview.hazard";
                hazard.SourceArtifactId = "spike_row_b";
                hazard.SourceArtifactDisplayName = "Spike Row After Checkpoint";

                Assert.IsTrue(hazard.AffectsPlayer(player));
                Assert.IsTrue(hazard.Apply(player, 10f));
                Assert.AreEqual(player.SpawnPoint, playerObject.transform.position);
                Assert.AreEqual(1, player.DeathCount);
                Assert.AreEqual(2, player.LastDamageTaken);
                Assert.AreEqual("gameview.hazard", player.LastDamageSourceKind);
                Assert.AreEqual("spike_row_b", player.LastDamageSourceId);
                Assert.AreEqual("Spike Row After Checkpoint", player.LastDamageSourceDisplayName);
                Assert.AreEqual("stagger", player.LastStatusEffect);
                Assert.AreEqual("stagger", hazard.LastAppliedEffect);
                Assert.AreEqual(4.5f, player.LastKnockbackImpulse.magnitude, 0.01f);
                Assert.AreEqual(player.LastKnockbackImpulse, playerObject.GetComponent<Rigidbody2D>().velocity);
                Assert.AreEqual(1, player.CurrentHearts);
                Assert.AreEqual(2, player.TotalDamageTaken);
                Assert.AreEqual(10f, hazard.LastApplyTimeSeconds, 0.001f);
                Assert.IsFalse(hazard.Apply(player, 10.25f));
                Assert.AreEqual(1, player.DeathCount);
                Assert.IsTrue(hazard.IsReady(10.5f));
                Assert.IsTrue(hazard.Apply(player, 10.5f));
                Assert.AreEqual(2, player.DeathCount);
                Assert.AreEqual(0, player.CurrentHearts);

                player.ResetHealth();
                hazard.AffectedTags = new[] { "boss" };
                Assert.IsFalse(hazard.AffectsPlayer(player));
                Assert.IsFalse(hazard.Apply(player, 11f));
                Assert.AreEqual(2, player.DeathCount);
                Assert.AreEqual("", player.LastStatusEffect);

                hazard.AffectedTags = new[] { "Player" };
                hazard.Effect = "bleed";
                hazard.IsLethal = true;
                hazard.Damage = 1f;
                Assert.IsTrue(hazard.Apply(player, 11f));
                Assert.AreEqual(3, player.LastDamageTaken);
                Assert.AreEqual(0, player.CurrentHearts);
                Assert.AreEqual("bleed", player.LastStatusEffect);
            }
            finally
            {
                Object.DestroyImmediate(playerObject);
                Object.DestroyImmediate(hazardObject);
            }
        }

        [Test]
        public void EnemyPatrolsAndRespawnsPlayer()
        {
            var playerObject = new GameObject("Player");
            var enemyObject = new GameObject("Enemy");
            try
            {
                playerObject.AddComponent<BoxCollider2D>();
                playerObject.AddComponent<Rigidbody2D>();
                var player = playerObject.AddComponent<GreyboxPlatformerSamplePlayer>();
                player.SpawnPoint = new Vector3(-2f, 1f, 0f);
                player.Faction = "runners";
                playerObject.transform.position = new Vector3(8f, 1f, 0f);

                enemyObject.AddComponent<BoxCollider2D>().isTrigger = true;
                var enemy = enemyObject.AddComponent<GreyboxPlatformerSampleEnemy>();
                enemy.EnemyId = "slime-patrol";
                enemy.Origin = new Vector3(5f, 2f, 0f);
                enemy.Faction = "slimes";
                enemy.Behavior = "patrol-aggro";
                enemy.AbilityIds = new[] { "slam" };
                enemy.PatrolPointIds = new[] { "patrol-a", "patrol-b" };
                enemy.PatrolWaypoints = new[] { new Vector3(7f, 2f, 0f), new Vector3(3f, 2f, 0f) };
                enemy.LootTableId = "starter-slime-drops";
                enemy.PatrolRadius = 2f;
                enemy.PatrolSpeed = 1f;
                enemy.AttackRange = 2.5f;
                enemy.AggroRadius = 3f;
                enemy.Health = 2;
                enemy.Damage = 2;
                enemy.AbilityKnockback = 4f;
                enemy.AttackCooldownSeconds = 0.75f;
                enemy.SourceArtifactKind = "gameview.actor";
                enemy.SourceArtifactId = "slime_patrol_b";
                enemy.SourceArtifactDisplayName = "Slime Patrol B";
                enemyObject.transform.position = enemy.Origin;

                Vector3 next = enemy.Simulate(0.5f);
                Assert.AreEqual(enemy.Origin.y, next.y, 0.001f);
                Assert.Greater(next.x, enemy.Origin.x);
                Assert.AreEqual("patrol-a", enemy.ActivePatrolPointId);
                Assert.AreEqual(enemy.PatrolWaypoints[0], enemy.CurrentPatrolTarget);
                Assert.IsTrue(enemy.CanPatrol());
                Assert.IsTrue(enemy.CanAggro());
                Assert.IsTrue(enemy.HasAbility("slam"));

                enemy.Behavior = "guard-aggro";
                enemyObject.transform.position = enemy.Origin + Vector3.right * 2f;
                Vector3 guarded = enemy.Simulate(0.5f);
                Assert.AreEqual(enemy.Origin.x, guarded.x, 0.001f);
                Assert.AreEqual("", enemy.ActivePatrolPointId);
                Assert.AreEqual(enemy.Origin, enemy.CurrentPatrolTarget);
                Assert.IsFalse(enemy.CanPatrol());
                Assert.IsTrue(enemy.CanAggro());
                enemy.Behavior = "patrol-aggro";
                enemyObject.transform.position = enemy.Origin;
                Assert.IsTrue(enemy.CanTargetPlayer(player));
                Assert.IsTrue(enemy.IsPlayerInRange(player));
                Assert.IsTrue(enemy.IsPlayerInAggroRange(player));
                player.Faction = "slimes";
                Assert.IsFalse(enemy.CanTargetPlayer(player));
                Assert.IsFalse(enemy.IsPlayerInAggroRange(player));
                Assert.IsFalse(enemy.Apply(player, 9.5f));
                Assert.AreEqual(0, enemy.HitCount);
                Assert.AreEqual(0, player.DeathCount);
                player.Faction = "runners";

                Assert.IsTrue(enemy.Apply(player, 10f));
                Assert.AreEqual(player.SpawnPoint, playerObject.transform.position);
                Assert.AreEqual(1, player.DeathCount);
                Assert.AreEqual(1, enemy.HitCount);
                Assert.AreEqual(10f, enemy.LastAttackTimeSeconds, 0.001f);
                Assert.AreEqual(2, player.LastDamageTaken);
                Assert.AreEqual("gameview.actor", player.LastDamageSourceKind);
                Assert.AreEqual("slime_patrol_b", player.LastDamageSourceId);
                Assert.AreEqual("Slime Patrol B", player.LastDamageSourceDisplayName);
                Assert.AreEqual("slam", enemy.LastUsedAbilityId);
                Assert.AreEqual("slam", enemy.LastAppliedAbilityEffect);
                Assert.AreEqual("slam", player.LastStatusEffect);
                Assert.Greater(player.LastKnockbackImpulse.magnitude, 0f);
                Assert.AreEqual(1, player.CurrentHearts);
                Assert.AreEqual(2, player.TotalDamageTaken);
                playerObject.transform.position = enemyObject.transform.position;
                Assert.IsFalse(enemy.Apply(player, 10.25f));
                Assert.IsFalse(enemy.IsAttackReady(10.25f));
                Assert.AreEqual(1, enemy.HitCount);
                Assert.AreEqual(1, player.DeathCount);
                playerObject.transform.position = new Vector3(20f, 20f, 0f);
                Assert.IsFalse(enemy.IsPlayerInRange(player));
                Assert.IsFalse(enemy.Apply(player, 10.75f));
                Assert.AreEqual(1, enemy.HitCount);
                enemy.AggroRadius = 1f;
                playerObject.transform.position = enemyObject.transform.position + Vector3.right * 1.2f;
                Assert.IsTrue(enemy.IsPlayerInRange(player));
                Assert.IsFalse(enemy.IsPlayerInAggroRange(player));
                Assert.IsFalse(enemy.Apply(player, 10.75f));
                Assert.AreEqual(1, enemy.HitCount);
                enemy.AggroRadius = 3f;
                playerObject.transform.position = enemyObject.transform.position;
                Assert.IsTrue(enemy.Apply(player, 10.75f));
                Assert.AreEqual(2, enemy.HitCount);
                Assert.AreEqual(2, player.DeathCount);
                Assert.AreEqual(0, player.CurrentHearts);

                Assert.IsTrue(enemy.TakeHit(1));
                Assert.IsFalse(enemy.Defeated);
                Assert.AreEqual(1, enemy.CurrentHealth);
                Assert.AreEqual(1, enemy.DamageTaken);
                Assert.IsTrue(enemy.TakeHit(1));
                Assert.IsTrue(enemy.Defeated);
                Assert.AreEqual(0, enemy.CurrentHealth);
                Assert.AreEqual(2, enemy.DamageTaken);
                Assert.IsFalse(enemyObject.activeSelf);
                Assert.IsFalse(enemy.Apply(player));

                enemy.ResetEnemy();
                Assert.IsFalse(enemy.Defeated);
                Assert.AreEqual(2, enemy.CurrentHealth);
                Assert.AreEqual(0, enemy.DamageTaken);
                Assert.IsTrue(enemyObject.activeSelf);
            }
            finally
            {
                Object.DestroyImmediate(playerObject);
                Object.DestroyImmediate(enemyObject);
            }
        }

        [Test]
        public void PlayerAttackUsesAuthoredDamageAgainstEnemyHealth()
        {
            var playerObject = new GameObject("Player");
            var enemyObject = new GameObject("Enemy");
            try
            {
                var player = playerObject.AddComponent<GreyboxPlatformerSamplePlayer>();
                player.Faction = "runners";
                player.AttackDamage = 1;
                player.AttackRange = 1.6f;
                player.AttackCooldownSeconds = 0.5f;
                var enemy = enemyObject.AddComponent<GreyboxPlatformerSampleEnemy>();
                enemy.EnemyId = "slime_patrol_a";
                enemy.DisplayName = "Slime Patrol A";
                enemy.Faction = "runners";
                enemy.LootTableId = "starter-slime-drops";
                enemy.LootDropColor = Color.yellow;
                enemy.Health = 2;
                enemy.ResetEnemy();

                enemyObject.transform.position = new Vector3(1f, 0f, 0f);
                Assert.IsFalse(player.CanAttack(enemy), "Player attacks should reject same-faction imported actors.");
                Assert.IsFalse(player.Attack(enemy));
                Assert.AreEqual(0, player.AttackCount);

                enemy.Faction = "slimes";
                enemyObject.transform.position = new Vector3(3f, 0f, 0f);
                Assert.IsFalse(player.IsEnemyInAttackRange(enemy), "Player attack range should be driven by authored metadata.");
                Assert.IsFalse(player.Attack(enemy));
                Assert.AreEqual(0, player.AttackCount);

                enemyObject.transform.position = new Vector3(1f, 0f, 0f);
                Assert.IsTrue(player.CanAttack(enemy));
                Assert.IsTrue(player.IsAttackReady(10f));
                Assert.IsTrue(player.Attack(enemy, 10f));
                Assert.IsFalse(enemy.Defeated);
                Assert.AreEqual(1, enemy.CurrentHealth);
                Assert.AreEqual(1, player.AttackCount);
                Assert.AreEqual(10f, player.LastAttackTimeSeconds, 0.001f);
                Assert.AreEqual(0, player.DefeatedEnemyCount);
                Assert.AreEqual("slime_patrol_a", player.LastAttackedEnemyId);
                Assert.AreEqual("Slime Patrol A", player.LastAttackedEnemyDisplayName);
                Assert.AreEqual("", player.LastDefeatedEnemyLootTableId);

                Assert.IsFalse(player.IsAttackReady(10.25f));
                Assert.IsFalse(player.Attack(enemy, 10.25f));
                Assert.AreEqual(1, enemy.CurrentHealth);
                Assert.AreEqual(1, player.AttackCount);

                Assert.IsTrue(player.IsAttackReady(10.5f));
                Assert.IsTrue(player.Attack(enemy, 10.5f));
                Assert.IsTrue(enemy.Defeated);
                Assert.AreEqual(0, enemy.CurrentHealth);
                Assert.AreEqual(2, player.AttackCount);
                Assert.AreEqual(10.5f, player.LastAttackTimeSeconds, 0.001f);
                Assert.AreEqual(1, player.DefeatedEnemyCount);
                Assert.AreEqual("starter-slime-drops", player.LastDefeatedEnemyLootTableId);
                Assert.IsTrue(player.HasDefeatedEnemy("slime_patrol_a"));
                Assert.AreEqual("loot-slime_patrol_a-starter-slime-drops", enemy.LastLootDropId);
                Assert.NotNull(enemy.LastLootDrop);
                Assert.AreEqual(new Vector3(0.35f, 0.35f, 0.1f), enemy.LastLootDrop.transform.localScale);
                var lootRenderer = enemy.LastLootDrop.GetComponent<Renderer>();
                Assert.NotNull(lootRenderer);
                Assert.AreEqual(Color.yellow.r, lootRenderer.material.color.r, 0.01f);
                Assert.AreEqual(Color.yellow.g, lootRenderer.material.color.g, 0.01f);
                var loot = enemy.LastLootDrop.GetComponent<GreyboxPlatformerSampleCollectible>();
                Assert.NotNull(loot);
                Assert.AreEqual("gameview.loot-table", loot.SourceArtifactKind);
                Assert.AreEqual("starter-slime-drops", loot.SourceArtifactId);
                Assert.AreEqual("loot", loot.SourceObjectiveType);
                Assert.IsTrue(loot.IsLoot());
                Assert.AreEqual(0, player.LootPickupCount);
                Assert.IsTrue(loot.Collect(player));
                Assert.IsTrue(loot.Collected);
                Assert.AreEqual(1, player.LootPickupCount);
                Assert.AreEqual("loot-slime_patrol_a-starter-slime-drops", player.LastCollectedLootDropId);
                Assert.AreEqual("starter-slime-drops", player.LastCollectedLootTableId);
                Assert.AreEqual("Loot: starter-slime-drops", player.LastCollectedLootDisplayName);
                Assert.IsFalse(loot.gameObject.activeSelf);
                Assert.IsFalse(loot.Collect(player));
                Assert.AreEqual(1, player.LootPickupCount);
                player.ResetLootInventory();
                Assert.AreEqual(0, player.LootPickupCount);
                Assert.AreEqual("", player.LastCollectedLootTableId);
                Assert.IsFalse(player.Attack(enemy));
                Assert.AreEqual(2, player.AttackCount);
                enemy.ResetEnemy();
                Assert.IsNull(enemy.LastLootDrop);
                Assert.AreEqual("", enemy.LastLootDropId);
            }
            finally
            {
                Object.DestroyImmediate(playerObject);
                Object.DestroyImmediate(enemyObject);
            }
        }

        [Test]
        public void PlayerAttackNearestEnemyUsesAuthoredRangeAndFaction()
        {
            var playerObject = new GameObject("Player");
            var allyObject = new GameObject("Ally");
            var nearEnemyObject = new GameObject("Near Enemy");
            var farEnemyObject = new GameObject("Far Enemy");
            try
            {
                var player = playerObject.AddComponent<GreyboxPlatformerSamplePlayer>();
                player.Faction = "runners";
                player.AttackDamage = 1;
                player.AttackRange = 1.6f;

                var ally = allyObject.AddComponent<GreyboxPlatformerSampleEnemy>();
                ally.EnemyId = "runner_ally";
                ally.Faction = "runners";
                ally.Health = 2;
                ally.ResetEnemy();
                allyObject.transform.position = new Vector3(0.75f, 0f, 0f);

                var nearEnemy = nearEnemyObject.AddComponent<GreyboxPlatformerSampleEnemy>();
                nearEnemy.EnemyId = "slime_near";
                nearEnemy.DisplayName = "Near Slime";
                nearEnemy.Faction = "slimes";
                nearEnemy.Health = 2;
                nearEnemy.ResetEnemy();
                nearEnemyObject.transform.position = new Vector3(1f, 0f, 0f);

                var farEnemy = farEnemyObject.AddComponent<GreyboxPlatformerSampleEnemy>();
                farEnemy.EnemyId = "slime_far";
                farEnemy.Faction = "slimes";
                farEnemy.Health = 2;
                farEnemy.ResetEnemy();
                farEnemyObject.transform.position = new Vector3(3f, 0f, 0f);

                Assert.AreEqual(nearEnemy, player.FindNearestAttackableEnemy(10f));
                player.Simulate(0f, false, true, 10f);
                Assert.AreEqual(1, nearEnemy.CurrentHealth);
                Assert.AreEqual(2, ally.CurrentHealth);
                Assert.AreEqual(2, farEnemy.CurrentHealth);
                Assert.AreEqual("slime_near", player.LastAttackedEnemyId);
                Assert.AreEqual(10f, player.LastAttackTimeSeconds, 0.001f);

                nearEnemyObject.transform.position = new Vector3(4f, 0f, 0f);
                Assert.IsNull(player.FindNearestAttackableEnemy());
                Assert.IsFalse(player.AttackNearestEnemy());
                Assert.AreEqual(1, player.AttackCount);
            }
            finally
            {
                Object.DestroyImmediate(playerObject);
                Object.DestroyImmediate(allyObject);
                Object.DestroyImmediate(nearEnemyObject);
                Object.DestroyImmediate(farEnemyObject);
            }
        }

        [Test]
        public void CameraFollowTracksTargetWithOffsetAndOptionalLockedY()
        {
            var cameraObject = new GameObject("Camera");
            var playerObject = new GameObject("Player");
            try
            {
                playerObject.transform.position = new Vector3(10f, 2f, 0f);
                var follow = cameraObject.AddComponent<GreyboxPlatformerSampleCameraFollow>();
                follow.Target = playerObject.transform;
                follow.SourceArtifactKind = "gameview.camera";
                follow.SourceArtifactId = "sample-camera";
                follow.SourceArtifactDisplayName = "Imported Game View Camera";
                follow.Offset = new Vector3(0f, 3f, -18f);
                follow.ApplyCameraMode("side-scroll");
                follow.LockedY = 4f;
                Assert.AreEqual("gameview.camera", follow.SourceArtifactKind);
                Assert.AreEqual("sample-camera", follow.SourceArtifactId);
                Assert.AreEqual("Imported Game View Camera", follow.SourceArtifactDisplayName);
                Assert.AreEqual("side-scroll", follow.CameraMode);
                Assert.AreEqual(new Vector3(0f, 3f, -18f), follow.Offset);
                Assert.IsTrue(follow.LockY);
                Assert.IsTrue(GreyboxPlatformerSampleCameraFollow.IsSideScrollCameraMode("side-scroll"));
                Assert.IsTrue(GreyboxPlatformerSampleCameraFollow.ShouldLockY("side-scroll"));
                Assert.IsFalse(GreyboxPlatformerSampleCameraFollow.ShouldLockY("top-down"));
                Assert.AreEqual(new Vector3(0f, 0f, -18f), GreyboxPlatformerSampleCameraFollow.OffsetForMode("top-down", follow.Offset));

                Assert.AreEqual(new Vector3(10f, 4f, -18f), GreyboxPlatformerSampleCameraFollow.ComposeTargetPosition(playerObject.transform.position, follow.Offset, true, 4f));
                follow.SnapToTarget();
                Assert.AreEqual(new Vector3(10f, 4f, -18f), cameraObject.transform.position);

                playerObject.transform.position = new Vector3(12f, 5f, 0f);
                follow.ApplyCameraMode("top-down");
                Assert.AreEqual(new Vector3(0f, 0f, -18f), follow.Offset);
                Assert.IsFalse(follow.LockY);
                follow.SnapToTarget();
                Assert.AreEqual(new Vector3(12f, 5f, -18f), cameraObject.transform.position);
            }
            finally
            {
                Object.DestroyImmediate(cameraObject);
                Object.DestroyImmediate(playerObject);
            }
        }

        [Test]
        public void CheckpointUpdatesRespawnPoint()
        {
            var playerObject = new GameObject("Player");
            var checkpointObject = new GameObject("Checkpoint");
            try
            {
                playerObject.AddComponent<BoxCollider2D>();
                playerObject.AddComponent<Rigidbody2D>();
                var player = playerObject.AddComponent<GreyboxPlatformerSamplePlayer>();
                player.SpawnPoint = new Vector3(-2f, 1f, 0f);

                checkpointObject.AddComponent<BoxCollider2D>().isTrigger = true;
                var checkpoint = checkpointObject.AddComponent<GreyboxPlatformerSampleCheckpoint>();
                checkpoint.RespawnPoint = new Vector3(12f, 3f, 0f);
                checkpoint.SpawnGroup = "mid-run";
                checkpoint.ActorIds = new[] { "player_runner" };
                checkpoint.MaxActivations = 2;
                checkpoint.CooldownSeconds = 0.75f;
                checkpoint.SpawnOnStart = false;

                Assert.IsFalse(checkpoint.ApplySpawnOnStart(player));
                Assert.IsFalse(checkpoint.SpawnOnStartApplied);
                Assert.AreEqual(new Vector3(-2f, 1f, 0f), player.SpawnPoint);
                player.PlayerId = "spectator";
                Assert.IsFalse(checkpoint.CanActivatePlayer(player));
                Assert.IsFalse(checkpoint.Activate(player, 9f));
                Assert.AreEqual(0, checkpoint.ActivationCount);
                Assert.AreEqual(new Vector3(-2f, 1f, 0f), player.SpawnPoint);
                player.PlayerId = "player_runner";
                Assert.IsTrue(checkpoint.CanActivatePlayer(player));
                Assert.IsTrue(checkpoint.Activate(player, 10f));
                Assert.IsTrue(checkpoint.Activated);
                Assert.AreEqual(1, checkpoint.ActivationCount);
                Assert.AreEqual(1, checkpoint.RemainingActivations);
                Assert.AreEqual(10f, checkpoint.LastActivationTimeSeconds, 0.001f);
                Assert.AreEqual("mid-run", checkpoint.SpawnGroup);
                CollectionAssert.AreEqual(new[] { "player_runner" }, checkpoint.ActorIds);
                Assert.IsFalse(checkpoint.SpawnOnStart);
                Assert.AreEqual(new Vector3(12f, 3f, 0f), player.SpawnPoint);
                Assert.IsFalse(checkpoint.Activate(player, 10.25f));
                Assert.AreEqual(1, checkpoint.ActivationCount);
                Assert.IsTrue(checkpoint.IsReady(10.75f));
                Assert.IsTrue(checkpoint.Activate(player, 10.75f));
                Assert.AreEqual(2, checkpoint.ActivationCount);
                Assert.AreEqual(0, checkpoint.RemainingActivations);
                Assert.IsFalse(checkpoint.Activate(player, 11.5f));

                playerObject.transform.position = new Vector3(30f, -3f, 0f);
                player.Respawn();
                Assert.AreEqual(checkpoint.RespawnPoint, playerObject.transform.position);
            }
            finally
            {
                Object.DestroyImmediate(playerObject);
                Object.DestroyImmediate(checkpointObject);
            }
        }

        [Test]
        public void CheckpointSpawnOnStartMovesAuthoredActorWithoutConsumingActivation()
        {
            var playerObject = new GameObject("Player");
            var checkpointObject = new GameObject("Checkpoint");
            try
            {
                var player = playerObject.AddComponent<GreyboxPlatformerSamplePlayer>();
                player.PlayerId = "spectator";
                player.SpawnPoint = new Vector3(-2f, 1f, 0f);
                playerObject.transform.position = player.SpawnPoint;

                var checkpoint = checkpointObject.AddComponent<GreyboxPlatformerSampleCheckpoint>();
                checkpoint.RespawnPoint = new Vector3(12f, 3f, 0f);
                checkpoint.ActorIds = new[] { "player_runner" };
                checkpoint.MaxActivations = 2;
                checkpoint.CooldownSeconds = 0.75f;
                checkpoint.SpawnOnStart = true;

                Assert.IsFalse(checkpoint.ApplySpawnOnStart(player));
                Assert.IsFalse(checkpoint.SpawnOnStartApplied);
                Assert.AreEqual(new Vector3(-2f, 1f, 0f), player.SpawnPoint);
                Assert.AreEqual(0, checkpoint.ActivationCount);

                player.PlayerId = "player_runner";
                Assert.IsTrue(checkpoint.ApplySpawnOnStart(player));
                Assert.IsTrue(checkpoint.SpawnOnStartApplied);
                Assert.AreEqual(checkpoint.RespawnPoint, player.SpawnPoint);
                Assert.AreEqual(checkpoint.RespawnPoint, playerObject.transform.position);
                Assert.AreEqual(0, checkpoint.ActivationCount);
                Assert.AreEqual(2, checkpoint.RemainingActivations);
                Assert.IsTrue(checkpoint.IsReady(10f));
            }
            finally
            {
                Object.DestroyImmediate(playerObject);
                Object.DestroyImmediate(checkpointObject);
            }
        }

        [Test]
        public void GoalMarksCompletion()
        {
            var playerObject = new GameObject("Player");
            var goalObject = new GameObject("Goal");
            try
            {
                playerObject.AddComponent<BoxCollider2D>();
                playerObject.AddComponent<Rigidbody2D>();
                var player = playerObject.AddComponent<GreyboxPlatformerSamplePlayer>();
                goalObject.AddComponent<BoxCollider2D>().isTrigger = true;
                var goal = goalObject.AddComponent<GreyboxPlatformerSampleGoal>();
                goal.RequiredCount = 2;
                goal.TargetIds = new[] { "coin_line" };
                goal.Reward = "unlock-exit";
                goal.TimeLimitSeconds = 30f;
                goal.IsPrimary = true;

                Assert.IsTrue(goal.MarkReached(player, null, 10f));
                Assert.IsFalse(goal.Completed);
                Assert.AreEqual(1, goal.CompletionCount);
                Assert.AreEqual(1, goal.RemainingCount);
                Assert.IsTrue(goal.IsPrimary);
                CollectionAssert.AreEqual(new[] { "coin_line" }, goal.TargetIds);
                Assert.AreEqual(0, player.GoalRewardCount);
                Assert.AreEqual("", player.LastCompletedGoalRewardId);

                Assert.IsTrue(goal.MarkReached(player, null, 12f));
                Assert.IsTrue(goal.Completed);
                Assert.AreEqual(2, goal.CompletionCount);
                Assert.AreEqual(0, goal.RemainingCount);
                Assert.AreEqual("unlock-exit", goal.LastReward);
                Assert.AreEqual(1, player.GoalRewardCount);
                Assert.AreEqual("exit_gate", player.LastCompletedGoalId);
                Assert.AreEqual("Exit Gate", player.LastCompletedGoalDisplayName);
                Assert.AreEqual("unlock-exit", player.LastCompletedGoalRewardId);
                Assert.IsFalse(goal.MarkReached(player));
                Assert.AreEqual(2, goal.CompletionCount);

                goal.ResetGoal();
                Assert.IsFalse(goal.Completed);
                Assert.AreEqual(0, goal.CompletionCount);
                Assert.AreEqual(2, goal.RemainingCount);
                Assert.AreEqual("", goal.LastReward);
                Assert.IsTrue(goal.IsExpired(31f));
                Assert.IsFalse(goal.MarkReached(player, null, 31f));
                Assert.AreEqual(0, goal.CompletionCount);
                Assert.AreEqual(1, player.GoalRewardCount);
            }
            finally
            {
                Object.DestroyImmediate(playerObject);
                Object.DestroyImmediate(goalObject);
            }
        }

        [Test]
        public void GoalRequiresAuthoredCoinsBeforeCompletion()
        {
            var hudObject = new GameObject("HUD");
            var playerObject = new GameObject("Player");
            var goalObject = new GameObject("Goal");
            try
            {
                BuildTextSlot(hudObject.transform, "hud-objective", "label", "REACH EXIT");

                playerObject.AddComponent<BoxCollider2D>();
                playerObject.AddComponent<Rigidbody2D>();
                var player = playerObject.AddComponent<GreyboxPlatformerSamplePlayer>();
                var goal = goalObject.AddComponent<GreyboxPlatformerSampleGoal>();
                var hud = hudObject.AddComponent<GreyboxPlatformerSampleHud>();
                hud.HudRoot = hudObject;
                hud.Goal = goal;
                hud.TotalCoins = 2;
                hud.ObjectiveLockedText = "COLLECT";
                hud.ObjectiveReadyText = "REACH EXIT";
                goal.Hud = hud;
                goal.RequiredCoins = 2;
                goal.TargetIds = new[] { "coin_line" };

                hud.Refresh();
                Assert.IsTrue(goal.IsLockedByCoins);
                Assert.IsTrue(goal.IsLockedByTargetIds);
                Assert.IsTrue(goal.IsLocked);
                Assert.AreEqual(2, goal.RemainingCoins);
                Assert.AreEqual(1, goal.RemainingTargetIds);
                Assert.AreEqual(2, goal.RemainingProgress);
                Assert.AreEqual("COLLECT 2 COINS", SlotText(hudObject.transform, "hud-objective", "label").text);
                Assert.IsFalse(goal.MarkReached(player));
                Assert.AreEqual(0, goal.CompletionCount);

                Assert.IsTrue(hud.CollectCoin("coin-01", "bonus_line"));
                Assert.IsTrue(goal.IsLockedByCoinsFor(hud));
                Assert.IsTrue(goal.IsLockedByTargetIdsFor(hud));
                Assert.IsTrue(goal.IsLockedFor(hud));
                Assert.IsFalse(hud.HasCollectedObjective("coin_line"));
                Assert.AreEqual(1, goal.RemainingCoinsFor(hud));
                Assert.AreEqual(1, goal.RemainingTargetIdsFor(hud));
                Assert.AreEqual(1, goal.RemainingProgressFor(hud));
                Assert.AreEqual("COLLECT 1 COIN", SlotText(hudObject.transform, "hud-objective", "label").text);
                Assert.IsFalse(goal.MarkReached(player, hud));
                Assert.AreEqual(0, goal.CompletionCount);

                Assert.IsTrue(hud.CollectCoin("coin-02", "coin_line"));
                Assert.IsFalse(goal.IsLockedByCoins);
                Assert.IsFalse(goal.IsLockedByTargetIds);
                Assert.IsFalse(goal.IsLocked);
                Assert.IsTrue(hud.HasCollectedObjective("coin_line"));
                Assert.AreEqual(0, goal.RemainingCoins);
                Assert.AreEqual(0, goal.RemainingTargetIds);
                Assert.AreEqual(0, goal.RemainingProgress);
                Assert.AreEqual("REACH EXIT", SlotText(hudObject.transform, "hud-objective", "label").text);
                Assert.IsTrue(goal.MarkReached(player, hud));
                Assert.IsTrue(goal.Completed);
            }
            finally
            {
                Object.DestroyImmediate(hudObject);
                Object.DestroyImmediate(playerObject);
                Object.DestroyImmediate(goalObject);
            }
        }

        [Test]
        public void GoalTargetIdsUnlockFromDefeatedEnemies()
        {
            var hudObject = new GameObject("HUD");
            var playerObject = new GameObject("Player");
            var enemyObject = new GameObject("Enemy");
            var goalObject = new GameObject("Goal");
            try
            {
                BuildTextSlot(hudObject.transform, "hud-objective", "label", "DEFEAT TARGET");

                playerObject.AddComponent<BoxCollider2D>();
                playerObject.AddComponent<Rigidbody2D>();
                var player = playerObject.AddComponent<GreyboxPlatformerSamplePlayer>();
                player.AttackDamage = 2;
                player.AttackRange = 2f;

                enemyObject.transform.position = Vector3.right;
                var enemy = enemyObject.AddComponent<GreyboxPlatformerSampleEnemy>();
                enemy.EnemyId = "boss";
                enemy.DisplayName = "Boss";
                enemy.Health = 2;
                enemy.LootTableId = "boss-loot";
                enemy.ResetEnemy();

                var goal = goalObject.AddComponent<GreyboxPlatformerSampleGoal>();
                goal.TargetIds = new[] { "boss" };
                goal.Reward = "open-boss-door";

                var hud = hudObject.AddComponent<GreyboxPlatformerSampleHud>();
                hud.HudRoot = hudObject;
                hud.Player = player;
                hud.Goal = goal;
                hud.ObjectiveLockedText = "DEFEAT";
                hud.ObjectiveReadyText = "REACH EXIT";
                goal.Hud = hud;

                hud.Refresh();
                Assert.IsTrue(goal.IsLockedByTargetIds);
                Assert.IsTrue(goal.IsLocked);
                Assert.AreEqual(1, goal.RemainingTargetIds);
                Assert.AreEqual(1, goal.RemainingProgress);
                Assert.IsTrue(goal.IsLockedByTargetIdsFor(player, hud));
                Assert.IsTrue(goal.IsLockedFor(player, hud));
                Assert.AreEqual(1, goal.RemainingTargetIdsFor(player, hud));
                Assert.AreEqual("DEFEAT 1 TARGET", SlotText(hudObject.transform, "hud-objective", "label").text);
                Assert.IsFalse(goal.MarkReached(player, hud));

                Assert.IsTrue(player.Attack(enemy, 10f));
                Assert.IsTrue(enemy.Defeated);
                Assert.IsTrue(player.HasDefeatedEnemy("boss"));
                hud.Refresh();
                Assert.IsFalse(goal.IsLockedByTargetIds);
                Assert.IsFalse(goal.IsLocked);
                Assert.AreEqual(0, goal.RemainingTargetIds);
                Assert.AreEqual(0, goal.RemainingProgress);
                Assert.IsFalse(goal.IsLockedByTargetIdsFor(player, hud));
                Assert.IsFalse(goal.IsLockedFor(player, hud));
                Assert.AreEqual(0, goal.RemainingTargetIdsFor(player, hud));
                Assert.AreEqual("REACH EXIT", SlotText(hudObject.transform, "hud-objective", "label").text);
                Assert.IsTrue(goal.MarkReached(player, hud, 11f));
                Assert.IsTrue(goal.Completed);
                Assert.AreEqual("open-boss-door", player.LastCompletedGoalRewardId);

                goal.ResetGoal();
                enemy.ResetEnemy();
                player.ResetCombatProgress();
                hud.Refresh();
                Assert.IsFalse(player.HasDefeatedEnemy("boss"));
                Assert.AreEqual(0, player.AttackCount);
                Assert.AreEqual(0, player.DefeatedEnemyCount);
                Assert.AreEqual(float.NegativeInfinity, player.LastAttackTimeSeconds);
                Assert.AreEqual("", player.LastDefeatedEnemyLootTableId);
                Assert.IsTrue(goal.IsLockedByTargetIds);
                Assert.IsTrue(goal.IsLocked);
                Assert.AreEqual(1, goal.RemainingTargetIds);
                Assert.AreEqual(1, goal.RemainingProgress);
                Assert.IsTrue(goal.IsLockedByTargetIdsFor(player, hud));
                Assert.AreEqual("DEFEAT 1 TARGET", SlotText(hudObject.transform, "hud-objective", "label").text);
            }
            finally
            {
                Object.DestroyImmediate(hudObject);
                Object.DestroyImmediate(playerObject);
                Object.DestroyImmediate(enemyObject);
                Object.DestroyImmediate(goalObject);
            }
        }

        [Test]
        public void HudTracksDeathsCoinsAndGoalCompletion()
        {
            var hudObject = new GameObject("HUD");
            var playerObject = new GameObject("Player");
            var goalObject = new GameObject("Goal");
            var checkpointObject = new GameObject("Checkpoint");
            var lootObject = new GameObject("Loot");
            try
            {
                BuildTextSlot(hudObject.transform, "hud-hearts", "value", "3");
                Slider hearts = BuildSliderSlot(hudObject.transform, "hud-hearts", "health", 3f, 3f);
                BuildTextSlot(hudObject.transform, "hud-coins", "value", "0 / 24");
                BuildTextSlot(hudObject.transform, "hud-loot", "value", "0");
                BuildTextSlot(hudObject.transform, "hud-objective", "label", "REACH THE EXIT");
                BuildTextSlot(hudObject.transform, "hud-checkpoint", "label", "CHECKPOINT READY");

                playerObject.AddComponent<BoxCollider2D>();
                playerObject.AddComponent<Rigidbody2D>();
                var player = playerObject.AddComponent<GreyboxPlatformerSamplePlayer>();
                player.SpawnPoint = new Vector3(1f, 1f, 0f);
                var goal = goalObject.AddComponent<GreyboxPlatformerSampleGoal>();
                var checkpoint = checkpointObject.AddComponent<GreyboxPlatformerSampleCheckpoint>();
                checkpoint.RespawnPoint = new Vector3(10f, 2f, 0f);

                var hud = hudObject.AddComponent<GreyboxPlatformerSampleHud>();
                hud.Player = player;
                hud.Goal = goal;
                hud.Checkpoint = checkpoint;
                hud.HudRoot = hudObject;
                hud.TotalCoins = 24;
                hud.ObjectiveReadyText = "REACH EXIT GATE";
                hud.ObjectiveCompletedText = "EXIT GATE REACHED";
                hud.CheckpointReadyText = "CHECKPOINT FLAG READY";
                hud.CheckpointActivatedText = "CHECKPOINT FLAG SET";
                hud.Refresh();
                Assert.AreEqual("3", SlotText(hudObject.transform, "hud-hearts", "value").text);
                Assert.AreEqual(3f, hearts.value, 0.001f);
                Assert.AreEqual("0", SlotText(hudObject.transform, "hud-loot", "value").text);
                Assert.AreEqual("CHECKPOINT FLAG READY", SlotText(hudObject.transform, "hud-checkpoint", "label").text);

                Assert.IsTrue(player.ApplyDamage(2, "gameview.hazard", "spike_row_b", "Spike Row After Checkpoint"));
                hud.Refresh();
                Assert.AreEqual("1", SlotText(hudObject.transform, "hud-hearts", "value").text);
                Assert.AreEqual(1f, hearts.value, 0.001f);

                Assert.IsTrue(checkpoint.Activate(player));
                hud.Refresh();
                Assert.AreEqual("CHECKPOINT FLAG SET", SlotText(hudObject.transform, "hud-checkpoint", "label").text);

                Assert.IsTrue(hud.CollectCoin("coin-01"));
                Assert.AreEqual("1 / 24", SlotText(hudObject.transform, "hud-coins", "value").text);
                Assert.IsFalse(hud.CollectCoin("coin-01"));
                Assert.AreEqual(1, hud.CoinsCollected);
                Assert.AreEqual("1 / 24", SlotText(hudObject.transform, "hud-coins", "value").text);
                Assert.IsTrue(hud.CollectCoin("coin-02"));
                Assert.AreEqual(2, hud.CoinsCollected);
                Assert.AreEqual("2 / 24", SlotText(hudObject.transform, "hud-coins", "value").text);
                hud.ResetCoins();
                Assert.AreEqual(0, hud.CoinsCollected);
                Assert.AreEqual("0 / 24", SlotText(hudObject.transform, "hud-coins", "value").text);
                Assert.IsTrue(hud.CollectCoin("coin-01"));
                Assert.AreEqual(1, hud.CoinsCollected);

                var loot = lootObject.AddComponent<GreyboxPlatformerSampleCollectible>();
                loot.CoinId = "loot-slime_patrol_a-starter-slime-drops";
                loot.DisplayName = "Loot: starter-slime-drops";
                loot.SourceArtifactKind = "gameview.loot-table";
                loot.SourceArtifactId = "starter-slime-drops";
                loot.SourceObjectiveType = "loot";
                Assert.IsTrue(loot.Collect(player));
                hud.Refresh();
                Assert.AreEqual(1, player.LootPickupCount);
                Assert.AreEqual("1", SlotText(hudObject.transform, "hud-loot", "value").text);

                Assert.IsTrue(goal.MarkReached(player));
                hud.Refresh();
                Assert.AreEqual("EXIT GATE REACHED", SlotText(hudObject.transform, "hud-objective", "label").text);
            }
            finally
            {
                Object.DestroyImmediate(hudObject);
                Object.DestroyImmediate(playerObject);
                Object.DestroyImmediate(goalObject);
                Object.DestroyImmediate(checkpointObject);
                Object.DestroyImmediate(lootObject);
            }
        }

        [Test]
        public void HudTracksHeartProgressForUguiAndUiToolkit()
        {
            var uguiHudObject = new GameObject("uGUI HUD");
            var uiToolkitHudObject = new GameObject("UI Toolkit HUD");
            var playerObject = new GameObject("Player");
            try
            {
                BuildTextSlot(uguiHudObject.transform, "hud-hearts", "value", "3");
                Slider slider = BuildSliderSlot(uguiHudObject.transform, "hud-hearts", "health", 3f, 3f);
                var binding = slider.GetComponent<GreyboxHudBinding>();

                playerObject.AddComponent<BoxCollider2D>();
                playerObject.AddComponent<Rigidbody2D>();
                var player = playerObject.AddComponent<GreyboxPlatformerSamplePlayer>();
                player.SpawnPoint = new Vector3(1f, 1f, 0f);

                var uguiHud = uguiHudObject.AddComponent<GreyboxPlatformerSampleHud>();
                uguiHud.Player = player;
                uguiHud.HudRoot = uguiHudObject;
                uguiHud.MaxHearts = 3;
                uguiHud.Refresh();
                Assert.AreEqual(3f, slider.value, 0.001f);

                var uiToolkitHud = uiToolkitHudObject.AddComponent<GreyboxUiToolkitHud>();
                var progress = new GreyboxUiToolkitHudElement
                {
                    SlotId = "hud-hearts",
                    BindingId = "health",
                    Role = "progress",
                    IsProgress = true,
                    ProgressMax = 3f,
                    ProgressValue = 3f,
                };
                uiToolkitHud.Elements.Add(progress);
                var uiController = uiToolkitHudObject.AddComponent<GreyboxPlatformerSampleHud>();
                uiController.Player = player;
                uiController.HudRoot = uiToolkitHudObject;
                uiController.MaxHearts = 3;

                Assert.IsTrue(player.ApplyDamage(2, "gameview.hazard", "spike_row_b", "Spike Row After Checkpoint"));
                uguiHud.Refresh();
                uiController.Refresh();

                Assert.AreEqual(1f, slider.value, 0.001f);
                Assert.AreEqual(3f, slider.maxValue, 0.001f);
                Assert.AreEqual("1 / 3", binding.Text);
                Assert.True(binding.IsProgress);
                Assert.AreEqual(0f, binding.ProgressMin, 0.001f);
                Assert.AreEqual(1f, binding.ProgressValue, 0.001f);
                Assert.AreEqual(3f, binding.ProgressMax, 0.001f);
                Assert.AreEqual(1f, progress.ProgressValue, 0.001f);
                Assert.AreEqual(3f, progress.ProgressMax, 0.001f);
                Assert.AreEqual(2, player.TotalDamageTaken);
            }
            finally
            {
                Object.DestroyImmediate(uguiHudObject);
                Object.DestroyImmediate(uiToolkitHudObject);
                Object.DestroyImmediate(playerObject);
            }
        }

        [Test]
        public void CollectibleIncrementsHudAndDisablesItself()
        {
            var hudObject = new GameObject("HUD");
            var playerObject = new GameObject("Player");
            var coinObject = new GameObject("Coin");
            try
            {
                BuildTextSlot(hudObject.transform, "hud-coins", "value", "0 / 24");
                var hud = hudObject.AddComponent<GreyboxPlatformerSampleHud>();
                hud.HudRoot = hudObject;
                hud.TotalCoins = 24;

                playerObject.AddComponent<BoxCollider2D>();
                playerObject.AddComponent<Rigidbody2D>();
                var player = playerObject.AddComponent<GreyboxPlatformerSamplePlayer>();

                coinObject.AddComponent<CircleCollider2D>().isTrigger = true;
                var collectible = coinObject.AddComponent<GreyboxPlatformerSampleCollectible>();
                collectible.Hud = hud;
                collectible.CoinId = "coin-01";
                collectible.DisplayName = "Readable Coin Line 01";
                collectible.SourceArtifactKind = "gameview.objective";
                collectible.SourceArtifactId = "coin_line";
                collectible.SourceArtifactDisplayName = "Readable Coin Line";
                collectible.SourceObjectiveId = "coin_line";
                collectible.SourceObjectiveDisplayName = "Readable Coin Line";
                collectible.SourceObjectiveType = "collectible";

                Assert.IsTrue(collectible.Collect(player));
                Assert.IsTrue(collectible.Collected);
                Assert.AreEqual("Readable Coin Line 01", collectible.DisplayName);
                Assert.AreEqual("gameview.objective", collectible.SourceArtifactKind);
                Assert.AreEqual("coin_line", collectible.SourceArtifactId);
                Assert.AreEqual("Readable Coin Line", collectible.SourceArtifactDisplayName);
                Assert.AreEqual("coin_line", collectible.SourceObjectiveId);
                Assert.AreEqual("Readable Coin Line", collectible.SourceObjectiveDisplayName);
                Assert.AreEqual("collectible", collectible.SourceObjectiveType);
                Assert.False(coinObject.activeSelf);
                Assert.AreEqual(1, hud.CoinsCollected);
                Assert.IsTrue(hud.HasCollectedObjective("coin_line"));
                Assert.AreEqual("1 / 24", SlotText(hudObject.transform, "hud-coins", "value").text);
            }
            finally
            {
                Object.DestroyImmediate(hudObject);
                Object.DestroyImmediate(playerObject);
                Object.DestroyImmediate(coinObject);
            }
        }

        [Test]
        public void CollectibleRejectsDuplicateStableCoinIdsFromHud()
        {
            var hudObject = new GameObject("HUD");
            var playerObject = new GameObject("Player");
            var firstCoinObject = new GameObject("Coin A");
            var duplicateCoinObject = new GameObject("Coin B");
            try
            {
                BuildTextSlot(hudObject.transform, "hud-coins", "value", "0 / 24");
                var hud = hudObject.AddComponent<GreyboxPlatformerSampleHud>();
                hud.HudRoot = hudObject;
                hud.TotalCoins = 24;

                playerObject.AddComponent<BoxCollider2D>();
                playerObject.AddComponent<Rigidbody2D>();
                var player = playerObject.AddComponent<GreyboxPlatformerSamplePlayer>();

                var first = BuildCollectible(firstCoinObject, hud, "coin-01");
                var duplicate = BuildCollectible(duplicateCoinObject, hud, "coin-01");

                Assert.IsTrue(first.Collect(player));
                Assert.AreEqual(1, hud.CoinsCollected);
                Assert.False(firstCoinObject.activeSelf);

                Assert.IsFalse(duplicate.Collect(player));
                Assert.AreEqual(1, hud.CoinsCollected);
                Assert.IsFalse(duplicate.Collected);
                Assert.IsTrue(duplicateCoinObject.activeSelf);
                Assert.AreEqual("1 / 24", SlotText(hudObject.transform, "hud-coins", "value").text);
            }
            finally
            {
                Object.DestroyImmediate(hudObject);
                Object.DestroyImmediate(playerObject);
                Object.DestroyImmediate(firstCoinObject);
                Object.DestroyImmediate(duplicateCoinObject);
            }
        }

        private static void BuildTextSlot(Transform parent, string slotId, string role, string value)
        {
            var slot = new GameObject(slotId);
            slot.transform.SetParent(parent, false);
            var slotMarker = slot.AddComponent<GreyboxMarker>();
            slotMarker.Collection = "hud-slot";
            slotMarker.MarkerId = slotId;

            var textObject = new GameObject(role, typeof(Text));
            textObject.transform.SetParent(slot.transform, false);
            var text = textObject.GetComponent<Text>();
            text.text = value;
            var textMarker = textObject.AddComponent<GreyboxMarker>();
            textMarker.Collection = "hud-text";
            textMarker.MarkerId = role;
        }

        private static Slider BuildSliderSlot(Transform parent, string slotId, string bindingId, float max, float value)
        {
            Transform slot = parent.Find(slotId);
            if (!slot)
            {
                var slotObject = new GameObject(slotId);
                slotObject.transform.SetParent(parent, false);
                slot = slotObject.transform;
                var marker = slotObject.AddComponent<GreyboxMarker>();
                marker.Collection = "hud-slot";
                marker.MarkerId = slotId;
            }

            var sliderObject = new GameObject(bindingId, typeof(Slider));
            sliderObject.transform.SetParent(slot, false);
            var slider = sliderObject.GetComponent<Slider>();
            slider.minValue = 0f;
            slider.maxValue = max;
            slider.value = value;
            var binding = sliderObject.AddComponent<GreyboxHudBinding>();
            binding.SlotId = slotId;
            binding.BindingId = bindingId;
            binding.Role = "progress";
            return slider;
        }

        private static Text SlotText(Transform root, string slotId, string role)
        {
            Transform slot = root.Find(slotId);
            Assert.NotNull(slot, "Missing HUD slot: " + slotId);
            Transform text = slot.Find(role);
            Assert.NotNull(text, "Missing HUD role: " + role);
            return text.GetComponent<Text>();
        }

        private static GreyboxPlatformerSampleCollectible BuildCollectible(GameObject coinObject, GreyboxPlatformerSampleHud hud, string coinId)
        {
            coinObject.AddComponent<CircleCollider2D>().isTrigger = true;
            var collectible = coinObject.AddComponent<GreyboxPlatformerSampleCollectible>();
            collectible.Hud = hud;
            collectible.CoinId = coinId;
            return collectible;
        }
    }
}
