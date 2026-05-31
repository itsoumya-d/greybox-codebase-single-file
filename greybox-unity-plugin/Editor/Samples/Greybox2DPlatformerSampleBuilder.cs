// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Greybox.Editor.Generation;
using Greybox.Runtime;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Greybox.Editor.Samples
{
    public readonly struct Greybox2DPlatformerSampleBuildResult
    {
        public readonly string ScenePath;
        public readonly int ImportedArtifactCount;
        public readonly int PlayableObjectCount;
        public readonly int LevelBoardDrivenObjectCount;
        public readonly int GameViewDrivenObjectCount;
        public readonly int LevelBoardTileCount;
        public readonly int LevelBoardRouteLength;
        public readonly int ArtBiblePaletteColorCount;
        public readonly int ArtBibleDrivenMaterialCount;
        public readonly int GameViewEnemyCount;
        public readonly int GameViewHazardCount;
        public readonly int GameViewCoinCount;
        public readonly bool GameViewPlayerConfigured;
        public readonly float PlayerMoveSpeed;
        public readonly float PlayerJumpImpulse;
        public readonly int PlayerMaxHearts;
        public readonly int PlayerAttackDamage;
        public readonly float PlayerAttackRange;
        public readonly float PlayerAttackCooldownSeconds;
        public readonly bool GameViewCheckpointConfigured;
        public readonly bool GameViewGoalConfigured;
        public readonly bool CameraFollowEnabled;
        public readonly bool GameViewCameraConfigured;
        public readonly string CameraMode;
        public readonly float CameraOrthographicSize;
        public readonly double BuildDurationSeconds;

        public Greybox2DPlatformerSampleBuildResult(
            string scenePath,
            int importedArtifactCount,
            int playableObjectCount,
            int levelBoardDrivenObjectCount,
            int gameViewDrivenObjectCount,
            int levelBoardTileCount,
            int levelBoardRouteLength,
            int artBiblePaletteColorCount,
            int artBibleDrivenMaterialCount,
            int gameViewEnemyCount,
            int gameViewHazardCount,
            int gameViewCoinCount,
            bool gameViewPlayerConfigured,
            float playerMoveSpeed,
            float playerJumpImpulse,
            int playerMaxHearts,
            int playerAttackDamage,
            float playerAttackRange,
            float playerAttackCooldownSeconds,
            bool gameViewCheckpointConfigured,
            bool gameViewGoalConfigured,
            bool cameraFollowEnabled,
            bool gameViewCameraConfigured,
            string cameraMode,
            float cameraOrthographicSize,
            double buildDurationSeconds)
        {
            ScenePath = scenePath;
            ImportedArtifactCount = importedArtifactCount;
            PlayableObjectCount = playableObjectCount;
            LevelBoardDrivenObjectCount = levelBoardDrivenObjectCount;
            GameViewDrivenObjectCount = gameViewDrivenObjectCount;
            LevelBoardTileCount = levelBoardTileCount;
            LevelBoardRouteLength = levelBoardRouteLength;
            ArtBiblePaletteColorCount = artBiblePaletteColorCount;
            ArtBibleDrivenMaterialCount = artBibleDrivenMaterialCount;
            GameViewEnemyCount = gameViewEnemyCount;
            GameViewHazardCount = gameViewHazardCount;
            GameViewCoinCount = gameViewCoinCount;
            GameViewPlayerConfigured = gameViewPlayerConfigured;
            PlayerMoveSpeed = playerMoveSpeed;
            PlayerJumpImpulse = playerJumpImpulse;
            PlayerMaxHearts = playerMaxHearts;
            PlayerAttackDamage = playerAttackDamage;
            PlayerAttackRange = playerAttackRange;
            PlayerAttackCooldownSeconds = playerAttackCooldownSeconds;
            GameViewCheckpointConfigured = gameViewCheckpointConfigured;
            GameViewGoalConfigured = gameViewGoalConfigured;
            CameraFollowEnabled = cameraFollowEnabled;
            GameViewCameraConfigured = gameViewCameraConfigured;
            CameraMode = cameraMode ?? "";
            CameraOrthographicSize = cameraOrthographicSize;
            BuildDurationSeconds = buildDurationSeconds;
        }
    }

    public static class Greybox2DPlatformerSampleBuilder
    {
        public const string GeneratedScenePath = "Assets/GreyboxGenerated/Samples/2DPlatformer/Greybox2DPlatformerSample.unity";
        public const int SampleCoinCount = 24;

        private readonly struct ImportedSampleArtifacts
        {
            public ImportedSampleArtifacts(int count, GameObject hudRoot, GameObject levelBoardRoot, GameObject gameViewRoot, GreyboxArtBiblePalette artBiblePalette, GreyboxArtifact artBibleArtifact, string gameViewPath, string levelBoardPath, string hudPath, string artBiblePath)
            {
                Count = count;
                HudRoot = hudRoot;
                LevelBoardRoot = levelBoardRoot;
                GameViewRoot = gameViewRoot;
                ArtBiblePalette = artBiblePalette;
                ArtBibleArtifact = artBibleArtifact;
                GameViewPath = gameViewPath ?? "";
                LevelBoardPath = levelBoardPath ?? "";
                HudPath = hudPath ?? "";
                ArtBiblePath = artBiblePath ?? "";
            }

            public int Count { get; }
            public GameObject HudRoot { get; }
            public GameObject LevelBoardRoot { get; }
            public GameObject GameViewRoot { get; }
            public GreyboxArtBiblePalette ArtBiblePalette { get; }
            public GreyboxArtifact ArtBibleArtifact { get; }
            public string GameViewPath { get; }
            public string LevelBoardPath { get; }
            public string HudPath { get; }
            public string ArtBiblePath { get; }
        }

        private readonly struct PlatformSpec
        {
            public PlatformSpec(string name, Vector3 position, Vector3 scale, Color color, string materialSlot)
            {
                Name = name;
                Position = position;
                Scale = scale;
                Color = color;
                MaterialSlot = materialSlot ?? "";
            }

            public string Name { get; }
            public Vector3 Position { get; }
            public Vector3 Scale { get; }
            public Color Color { get; }
            public string MaterialSlot { get; }
        }

        private sealed class SampleArtBibleStyle
        {
            public int PaletteColorCount;
            public int DrivenMaterialCount;
            public Color Sky = new Color(0.85f, 0.91f, 1f);
            public Color Runner = new Color(0.1f, 0.1f, 0.12f);
            public Color Platform = new Color(0.18f, 0.62f, 0.34f);
            public Color PlatformSecondary = new Color(0.2f, 0.58f, 0.36f);
            public Color Checkpoint = new Color(0.24f, 0.76f, 0.88f);
            public Color Hazard = new Color(0.91f, 0.29f, 0.24f);
            public Color Enemy = new Color(0.74f, 0.18f, 0.28f);
            public Color Coin = new Color(1f, 0.82f, 0.23f);
            public Color Goal = new Color(1f, 0.42f, 0.21f);
            public Material RunnerMaterial;
            public Material PlatformMaterial;
            public Material CheckpointMaterial;
            public Material HazardMaterial;
            public Material EnemyMaterial;
            public Material CoinMaterial;
            public Material GoalMaterial;

            public Material MaterialForSlot(string slot)
            {
                switch ((slot ?? "").Trim().ToLowerInvariant())
                {
                    case "runner":
                        return RunnerMaterial;
                    case "platform":
                        return PlatformMaterial;
                    case "checkpoint":
                        return CheckpointMaterial;
                    case "hazard":
                        return HazardMaterial;
                    case "enemy":
                        return EnemyMaterial;
                    case "coin":
                        return CoinMaterial;
                    case "goal":
                        return GoalMaterial;
                    default:
                        return null;
                }
            }
        }

        private readonly struct EnemySpec
        {
            public EnemySpec(string enemyId, string name, string role, string faction, string behavior, string[] abilityIds, string[] patrolPointIds, Vector3[] patrolWaypoints, string lootTableId, Vector3 position, Vector3 scale, float patrolRadius, float patrolSpeed, float attackRange, float aggroRadius, int health, int damage, float attackCooldownSeconds, bool fromGameView)
            {
                EnemyId = enemyId ?? "";
                Name = name ?? "";
                Role = role ?? "";
                Faction = faction ?? "";
                Behavior = behavior ?? "";
                AbilityIds = abilityIds ?? Array.Empty<string>();
                PatrolPointIds = patrolPointIds ?? Array.Empty<string>();
                PatrolWaypoints = patrolWaypoints ?? Array.Empty<Vector3>();
                LootTableId = lootTableId ?? "";
                Position = position;
                Scale = scale;
                PatrolRadius = patrolRadius;
                PatrolSpeed = patrolSpeed;
                AttackRange = attackRange;
                AggroRadius = aggroRadius;
                Health = health;
                Damage = damage;
                AttackCooldownSeconds = attackCooldownSeconds;
                FromGameView = fromGameView;
            }

            public string EnemyId { get; }
            public string Name { get; }
            public string Role { get; }
            public string Faction { get; }
            public string Behavior { get; }
            public string[] AbilityIds { get; }
            public string[] PatrolPointIds { get; }
            public Vector3[] PatrolWaypoints { get; }
            public string LootTableId { get; }
            public Vector3 Position { get; }
            public Vector3 Scale { get; }
            public float PatrolRadius { get; }
            public float PatrolSpeed { get; }
            public float AttackRange { get; }
            public float AggroRadius { get; }
            public int Health { get; }
            public int Damage { get; }
            public float AttackCooldownSeconds { get; }
            public bool FromGameView { get; }
        }

        private readonly struct PlayerSpec
        {
            public PlayerSpec(string playerId, string displayName, string role, string faction, string behavior, string[] abilityIds, string lootTableId, Vector3 spawn, Vector3 scale, float moveSpeed, float jumpImpulse, int maxHearts, int attackDamage, float attackRange, float attackCooldownSeconds, bool fromGameView)
            {
                PlayerId = playerId ?? "";
                DisplayName = displayName ?? "";
                Role = role ?? "";
                Faction = faction ?? "";
                Behavior = behavior ?? "";
                AbilityIds = abilityIds ?? Array.Empty<string>();
                LootTableId = lootTableId ?? "";
                Spawn = spawn;
                Scale = scale;
                MoveSpeed = moveSpeed;
                JumpImpulse = jumpImpulse;
                MaxHearts = maxHearts;
                AttackDamage = attackDamage;
                AttackRange = attackRange;
                AttackCooldownSeconds = attackCooldownSeconds;
                FromGameView = fromGameView;
            }

            public string PlayerId { get; }
            public string DisplayName { get; }
            public string Role { get; }
            public string Faction { get; }
            public string Behavior { get; }
            public string[] AbilityIds { get; }
            public string LootTableId { get; }
            public Vector3 Spawn { get; }
            public Vector3 Scale { get; }
            public float MoveSpeed { get; }
            public float JumpImpulse { get; }
            public int MaxHearts { get; }
            public int AttackDamage { get; }
            public float AttackRange { get; }
            public float AttackCooldownSeconds { get; }
            public bool FromGameView { get; }
        }

        private readonly struct HazardSpec
        {
            public HazardSpec(string hazardId, string displayName, string hazardType, string effect, float damage, float tickSeconds, float knockback, string[] affectedTags, bool isLethal, Vector3 position, Vector3 scale, bool fromGameView)
            {
                HazardId = hazardId ?? "";
                DisplayName = displayName ?? "";
                HazardType = hazardType ?? "";
                Effect = effect ?? "";
                Damage = damage;
                TickSeconds = tickSeconds;
                Knockback = knockback;
                AffectedTags = affectedTags ?? Array.Empty<string>();
                IsLethal = isLethal;
                Position = position;
                Scale = scale;
                FromGameView = fromGameView;
            }

            public string HazardId { get; }
            public string DisplayName { get; }
            public string HazardType { get; }
            public string Effect { get; }
            public float Damage { get; }
            public float TickSeconds { get; }
            public float Knockback { get; }
            public string[] AffectedTags { get; }
            public bool IsLethal { get; }
            public Vector3 Position { get; }
            public Vector3 Scale { get; }
            public bool FromGameView { get; }
        }

        private readonly struct CheckpointSpec
        {
            public CheckpointSpec(string checkpointId, string displayName, string spawnId, string spawnGroup, string[] actorIds, int maxActivations, float cooldownSeconds, bool spawnOnStart, Vector3 position, Vector3 respawnPoint, Vector3 scale, bool fromGameView)
            {
                CheckpointId = checkpointId ?? "";
                DisplayName = displayName ?? "";
                SpawnId = spawnId ?? "";
                SpawnGroup = spawnGroup ?? "";
                ActorIds = actorIds ?? Array.Empty<string>();
                MaxActivations = maxActivations;
                CooldownSeconds = cooldownSeconds;
                SpawnOnStart = spawnOnStart;
                Position = position;
                RespawnPoint = respawnPoint;
                Scale = scale;
                FromGameView = fromGameView;
            }

            public string CheckpointId { get; }
            public string DisplayName { get; }
            public string SpawnId { get; }
            public string SpawnGroup { get; }
            public string[] ActorIds { get; }
            public int MaxActivations { get; }
            public float CooldownSeconds { get; }
            public bool SpawnOnStart { get; }
            public Vector3 Position { get; }
            public Vector3 RespawnPoint { get; }
            public Vector3 Scale { get; }
            public bool FromGameView { get; }
        }

        private readonly struct GoalSpec
        {
            public GoalSpec(string goalId, string displayName, string objectiveType, string[] targetIds, string reward, float timeLimitSeconds, int requiredCount, bool isPrimary, Vector3 position, Vector3 scale, bool fromGameView)
            {
                GoalId = goalId ?? "";
                DisplayName = displayName ?? "";
                ObjectiveType = objectiveType ?? "";
                TargetIds = targetIds ?? Array.Empty<string>();
                Reward = reward ?? "";
                TimeLimitSeconds = timeLimitSeconds;
                RequiredCount = requiredCount;
                IsPrimary = isPrimary;
                Position = position;
                Scale = scale;
                FromGameView = fromGameView;
            }

            public string GoalId { get; }
            public string DisplayName { get; }
            public string ObjectiveType { get; }
            public string[] TargetIds { get; }
            public string Reward { get; }
            public float TimeLimitSeconds { get; }
            public int RequiredCount { get; }
            public bool IsPrimary { get; }
            public Vector3 Position { get; }
            public Vector3 Scale { get; }
            public bool FromGameView { get; }
        }

        private readonly struct CoinSpec
        {
            public CoinSpec(string coinId, string displayName, string sourceObjectiveId, string sourceObjectiveDisplayName, string sourceObjectiveType, Vector3 position, bool fromGameView)
            {
                CoinId = coinId ?? "";
                DisplayName = displayName ?? "";
                SourceObjectiveId = sourceObjectiveId ?? "";
                SourceObjectiveDisplayName = sourceObjectiveDisplayName ?? "";
                SourceObjectiveType = sourceObjectiveType ?? "";
                Position = position;
                FromGameView = fromGameView;
            }

            public string CoinId { get; }
            public string DisplayName { get; }
            public string SourceObjectiveId { get; }
            public string SourceObjectiveDisplayName { get; }
            public string SourceObjectiveType { get; }
            public Vector3 Position { get; }
            public bool FromGameView { get; }
        }

        private readonly struct SampleGameplayPlan
        {
            public SampleGameplayPlan(
                PlatformSpec[] platforms,
                PlayerSpec player,
                CheckpointSpec checkpoint,
                HazardSpec[] hazards,
                EnemySpec[] enemies,
                CoinSpec[] coins,
                int gameViewCoinCount,
                bool gameViewCameraConfigured,
                string cameraMode,
                float cameraOrthographicSize,
                GoalSpec goal,
                bool usesLevelBoard,
                bool usesGameView,
                int levelBoardTileCount,
                int levelBoardRouteLength)
            {
                Platforms = platforms ?? Array.Empty<PlatformSpec>();
                Player = player;
                Checkpoint = checkpoint;
                Hazards = hazards ?? Array.Empty<HazardSpec>();
                Enemies = enemies ?? Array.Empty<EnemySpec>();
                Coins = coins ?? Array.Empty<CoinSpec>();
                GameViewCoinCount = gameViewCoinCount;
                GameViewCameraConfigured = gameViewCameraConfigured;
                CameraMode = cameraMode ?? "";
                CameraOrthographicSize = cameraOrthographicSize;
                Goal = goal;
                UsesLevelBoard = usesLevelBoard;
                UsesGameView = usesGameView;
                LevelBoardTileCount = levelBoardTileCount;
                LevelBoardRouteLength = levelBoardRouteLength;
            }

            public PlatformSpec[] Platforms { get; }
            public PlayerSpec Player { get; }
            public CheckpointSpec Checkpoint { get; }
            public HazardSpec[] Hazards { get; }
            public EnemySpec[] Enemies { get; }
            public CoinSpec[] Coins { get; }
            public int GameViewCoinCount { get; }
            public bool GameViewCameraConfigured { get; }
            public string CameraMode { get; }
            public float CameraOrthographicSize { get; }
            public GoalSpec Goal { get; }
            public bool UsesLevelBoard { get; }
            public bool UsesGameView { get; }
            public int LevelBoardTileCount { get; }
            public int LevelBoardRouteLength { get; }
            public int LevelBoardDrivenObjectCount => UsesLevelBoard ? Platforms.Length + Hazards.Length + 3 : 0;
            public int GameViewDrivenObjectCount => UsesGameView ? Hazards.Length + Enemies.Length + GameViewCoinCount + 3 : 0;
        }

        [MenuItem("Window/Greybox/Samples/Build 2D Platformer Scene")]
        public static void Build2DPlatformerScene()
        {
            Greybox2DPlatformerSampleBuildResult result = BuildScene();
            var sceneAsset = AssetDatabase.LoadAssetAtPath<SceneAsset>(result.ScenePath);
            if (sceneAsset)
            {
                Selection.activeObject = sceneAsset;
                EditorGUIUtility.PingObject(sceneAsset);
            }
        }

        public static Greybox2DPlatformerSampleBuildResult BuildScene(string sampleRoot = "")
        {
            var timer = System.Diagnostics.Stopwatch.StartNew();
            if (string.IsNullOrWhiteSpace(sampleRoot)) sampleRoot = FindImportedSampleRoot();
            EnsureGeneratedFolders();
            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            var root = new GameObject("Greybox 2D Platformer Sample");
            int playableObjects = 0;
            ImportedSampleArtifacts imported = InstantiateImportedArtifacts(sampleRoot, root.transform);
            SampleArtBibleStyle style = BuildArtBibleStyle(imported.ArtBiblePalette, imported.ArtBiblePath);
            SampleGameplayPlan plan = BuildGameplayPlan(imported.LevelBoardRoot, imported.GameViewRoot, style);
            int importedArtifacts = imported.Count;
            Camera sampleCamera = CreateCamera(root.transform, style, plan.CameraOrthographicSize);
            playableObjects += sampleCamera ? 1 : 0;
            playableObjects += CreatePlatforms(root.transform, plan.Platforms, style);
            GreyboxPlatformerSamplePlayer player = CreatePlayer(root.transform, plan.Player, style);
            playableObjects += 1;
            bool cameraFollowEnabled = WireCameraFollow(sampleCamera, player, plan.GameViewCameraConfigured, plan.CameraMode);
            GreyboxPlatformerSampleCheckpoint checkpoint = CreateCheckpoint(root.transform, plan.Checkpoint, style);
            ApplyCheckpointSpawnOnStart(player, checkpoint);
            playableObjects += 1;
            playableObjects += CreateHazards(root.transform, plan.Hazards, style);
            playableObjects += CreateEnemies(root.transform, plan.Enemies, style);
            GreyboxPlatformerSampleGoal goal = CreateGoal(root.transform, plan.Goal, style);
            playableObjects += 1;
            GreyboxPlatformerSampleHud hud = WireHud(root.transform, imported.HudRoot, player, goal, checkpoint, plan.Player.MaxHearts, plan.Coins);
            playableObjects += CreateCoins(root.transform, hud, style, plan.Coins);
            hud.Refresh();
            GreyboxPlatformerSampleRunReset reset = AttachRunReset(root, player, hud, goal, checkpoint);

            EditorSceneManager.SaveScene(scene, GeneratedScenePath);
            RegisterSceneInBuildSettings(GeneratedScenePath);
            AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
            timer.Stop();
            double buildDurationSeconds = timer.Elapsed.TotalSeconds;
            AttachArtifactManifest(root, imported, plan, style, sampleCamera, player, hud, goal, checkpoint, reset, cameraFollowEnabled, playableObjects, buildDurationSeconds);
            EditorSceneManager.SaveScene(scene, GeneratedScenePath);
            AddressablesTagger.TagSampleSceneDeferred(GeneratedScenePath, AddressablesTagger.PlatformerSampleLabel);
            Debug.Log($"Greybox built playable 2D Platformer sample scene at {GeneratedScenePath} in {buildDurationSeconds:0.00}s.");
            return new Greybox2DPlatformerSampleBuildResult(
                GeneratedScenePath,
                importedArtifacts,
                playableObjects,
                plan.LevelBoardDrivenObjectCount,
                plan.GameViewDrivenObjectCount,
                plan.LevelBoardTileCount,
                plan.LevelBoardRouteLength,
                style.PaletteColorCount,
                style.DrivenMaterialCount,
                plan.Enemies.Length,
                plan.Hazards.Count(hazard => hazard.FromGameView),
                plan.GameViewCoinCount,
                plan.Player.FromGameView,
                player ? player.MoveSpeed : 0f,
                player ? player.JumpImpulse : 0f,
                plan.Player.MaxHearts,
                player ? player.AttackDamage : 0,
                player ? player.AttackRange : 0f,
                player ? player.AttackCooldownSeconds : 0f,
                plan.Checkpoint.FromGameView,
                plan.Goal.FromGameView,
                cameraFollowEnabled,
                plan.GameViewCameraConfigured,
                plan.CameraMode,
                sampleCamera ? sampleCamera.orthographicSize : 0f,
                buildDurationSeconds);
        }

        public static string FindImportedSampleRoot()
        {
            string[] paths = AssetDatabase.FindAssets("platformer")
                .Select(AssetDatabase.GUIDToAssetPath)
                .Where(path => path.EndsWith("/platformer.gameview", StringComparison.OrdinalIgnoreCase))
                .OrderBy(path => path, StringComparer.OrdinalIgnoreCase)
                .ToArray();
            if (paths.Length == 0) return "";
            return Path.GetDirectoryName(paths[0])?.Replace('\\', '/') ?? "";
        }

        private static ImportedSampleArtifacts InstantiateImportedArtifacts(string sampleRoot, Transform parent)
        {
            if (string.IsNullOrWhiteSpace(sampleRoot)) return new ImportedSampleArtifacts(0, null, null, null, null, null, "", "", "", "");
            int count = 0;
            string gameViewPath = Path.Combine(sampleRoot, "platformer.gameview").Replace('\\', '/');
            string levelBoardPath = Path.Combine(sampleRoot, "platformer.levelboard").Replace('\\', '/');
            string hudPath = Path.Combine(sampleRoot, "platformer.gbhud").Replace('\\', '/');
            string artBiblePath = Path.Combine(sampleRoot, "platformer.design").Replace('\\', '/');
            GameObject gameViewRoot = InstantiateArtifact(gameViewPath, parent, new Vector3(0f, 0f, 4f), "Imported Greybox Game View");
            if (gameViewRoot) count++;
            GameObject levelBoardRoot = InstantiateArtifact(levelBoardPath, parent, new Vector3(0f, -7f, 4f), "Imported Greybox Level Board");
            if (levelBoardRoot) count++;
            GameObject hudRoot = InstantiateArtifact(hudPath, parent, Vector3.zero, "Imported Greybox HUD");
            if (hudRoot) count++;
            GreyboxArtBiblePalette palette = AssetDatabase.LoadAssetAtPath<GreyboxArtBiblePalette>(artBiblePath);
            GreyboxArtifact artBibleArtifact = AssetDatabase.LoadAllAssetsAtPath(artBiblePath).OfType<GreyboxArtifact>().FirstOrDefault(artifact => artifact && artifact.Kind == GreyboxArtifactKind.ArtBible);
            if (palette) count++;
            return new ImportedSampleArtifacts(count, hudRoot, levelBoardRoot, gameViewRoot, palette, artBibleArtifact, gameViewPath, levelBoardPath, hudPath, artBiblePath);
        }

        private static GameObject InstantiateArtifact(string path, Transform parent, Vector3 position, string name)
        {
            var asset = AssetDatabase.LoadAssetAtPath<GameObject>(path);
            if (!asset) return null;
            GameObject instance = PrefabUtility.InstantiatePrefab(asset) as GameObject;
            if (!instance) instance = UnityEngine.Object.Instantiate(asset);
            instance.name = name;
            instance.transform.SetParent(parent, false);
            instance.transform.position = position;
            return instance;
        }

        private static SampleArtBibleStyle BuildArtBibleStyle(GreyboxArtBiblePalette palette, string artBiblePath)
        {
            var style = new SampleArtBibleStyle();
            if (!palette) return style;

            style.PaletteColorCount = palette.ColorCount;
            style.Sky = palette.ColorOrDefault("Sky Paper", style.Sky);
            style.Runner = palette.ColorOrDefault("Runner Ink", style.Runner);
            style.Platform = palette.ColorOrDefault("Platform Moss", style.Platform);
            style.PlatformSecondary = palette.ColorOrDefault("Platform Moss", style.PlatformSecondary);
            style.Checkpoint = palette.ColorOrDefault("Checkpoint Spark", style.Checkpoint);
            style.Hazard = palette.ColorOrDefault("Hazard Crit", style.Hazard);
            style.Enemy = palette.ColorOrDefault("Hazard Crit", style.Enemy);
            style.Coin = palette.ColorOrDefault("Coin Focus", style.Coin);
            style.Goal = palette.ColorOrDefault("Checkpoint Spark", style.Goal);

            style.RunnerMaterial = LoadPaletteMaterial(palette, artBiblePath, "Runner Ink");
            style.PlatformMaterial = LoadPaletteMaterial(palette, artBiblePath, "Platform Moss");
            style.CheckpointMaterial = LoadPaletteMaterial(palette, artBiblePath, "Checkpoint Spark");
            style.HazardMaterial = LoadPaletteMaterial(palette, artBiblePath, "Hazard Crit");
            style.EnemyMaterial = LoadPaletteMaterial(palette, artBiblePath, "Hazard Crit");
            style.CoinMaterial = LoadPaletteMaterial(palette, artBiblePath, "Coin Focus");
            style.GoalMaterial = LoadPaletteMaterial(palette, artBiblePath, "Checkpoint Spark");
            style.DrivenMaterialCount = new[]
            {
                style.RunnerMaterial,
                style.PlatformMaterial,
                style.CheckpointMaterial,
                style.HazardMaterial,
                style.EnemyMaterial,
                style.CoinMaterial,
                style.GoalMaterial,
            }.Count(material => material != null);
            return style;
        }

        private static Material LoadPaletteMaterial(GreyboxArtBiblePalette palette, string artBiblePath, string colorName)
        {
            if (!palette) return null;
            if (palette.TryGetMaterialAssetPath(colorName, out string materialPath))
            {
                var standalone = AssetDatabase.LoadAssetAtPath<Material>(materialPath);
                if (standalone) return standalone;
            }

            string expectedName = "Greybox " + colorName;
            Material[] subAssets = string.IsNullOrWhiteSpace(artBiblePath)
                ? Array.Empty<Material>()
                : AssetDatabase.LoadAllAssetsAtPath(artBiblePath).OfType<Material>().ToArray();
            return subAssets.FirstOrDefault(material => material && string.Equals(material.name, expectedName, StringComparison.OrdinalIgnoreCase))
                ?? subAssets.FirstOrDefault(material => material && ContainsToken(material.name, colorName));
        }

        private static SampleGameplayPlan BuildGameplayPlan(GameObject levelBoardRoot, GameObject gameViewRoot, SampleArtBibleStyle style)
        {
            SampleGameplayPlan fallback = FallbackGameplayPlan(style);
            if (!levelBoardRoot && !gameViewRoot) return fallback;

            var board = levelBoardRoot ? levelBoardRoot.GetComponentInChildren<GreyboxLevelBoard>() : null;
            var tilemap = levelBoardRoot ? levelBoardRoot.GetComponentInChildren<GreyboxLevelTilemap>() : null;
            var viewport = gameViewRoot ? gameViewRoot.GetComponentInChildren<GreyboxGameViewport>() : null;
            PlatformSpec[] platforms = PlatformsFromLevelBoard(board, style);
            if (platforms.Length == 0) platforms = fallback.Platforms;

            Vector3 playerSpawn = PlayerSpawnFromGameView(viewport, PlayerSpawnFromLevelBoard(board, fallback.Player.Spawn));
            PlayerSpec player = PlayerFromGameView(viewport, playerSpawn, fallback.Player);
            Vector3 checkpointPosition = TileRecordPosition(tilemap, fallback.Checkpoint.Position, IsCheckpointTile, 0f, 2.6f);
            Vector3 checkpointRespawn = TileRecordPosition(tilemap, fallback.Checkpoint.RespawnPoint, IsCheckpointTile, 0f, 2.25f);
            CheckpointSpec checkpoint = CheckpointFromGameView(viewport, checkpointPosition, checkpointRespawn, fallback.Checkpoint);
            Vector3 goalPosition = TileRecordPosition(tilemap, fallback.Goal.Position, item => item.IsExit, 1f, 0.2f);
            GoalSpec goal = GoalFromGameView(viewport, goalPosition, fallback.Goal);
            HazardSpec[] hazards = HazardsFromGameView(viewport);
            if (hazards.Length == 0) hazards = HazardSpecsFromPositions(HazardPositionsFromLevelBoard(tilemap), fallback.Hazards);
            if (hazards.Length == 0) hazards = fallback.Hazards;
            EnemySpec[] enemies = EnemiesFromGameView(viewport, board, tilemap);
            CoinSpec[] gameViewCoins = CoinSpecsFromGameView(viewport, SampleCoinCount);
            CoinSpec[] coins = gameViewCoins.Length > 0 ? gameViewCoins : fallback.Coins;
            Camera importedCamera = CameraFromGameView(gameViewRoot);
            string cameraMode = CameraModeFromGameView(viewport, fallback.CameraMode);
            float cameraOrthographicSize = CameraOrthographicSizeFromGameView(importedCamera, fallback.CameraOrthographicSize);
            int routeLength = RouteLength(board);
            int tileCount = tilemap ? tilemap.TileCount : 0;
            bool usesLevelBoard = board || tilemap;
            bool usesGameView = viewport;

            return new SampleGameplayPlan(
                platforms,
                player,
                checkpoint,
                hazards,
                enemies,
                coins,
                gameViewCoins.Length,
                importedCamera != null,
                cameraMode,
                cameraOrthographicSize,
                goal,
                usesLevelBoard,
                usesGameView,
                tileCount,
                routeLength);
        }

        private static SampleGameplayPlan FallbackGameplayPlan(SampleArtBibleStyle style)
        {
            style = style ?? new SampleArtBibleStyle();
            return new SampleGameplayPlan(
                new[]
                {
                    new PlatformSpec("Teach Move Platform", new Vector3(2f, -1f, 0f), new Vector3(10f, 1f, 1f), style.Platform, "platform"),
                    new PlatformSpec("Coin Arc Platform", new Vector3(9f, 1.5f, 0f), new Vector3(5f, 0.7f, 1f), style.PlatformSecondary, "platform"),
                    new PlatformSpec("Checkpoint Platform", new Vector3(18f, 2.6f, 0f), new Vector3(7f, 0.7f, 1f), style.Checkpoint, "checkpoint"),
                    new PlatformSpec("Exit Platform", new Vector3(27f, 0.4f, 0f), new Vector3(6f, 0.7f, 1f), style.Goal, "goal"),
                },
                new PlayerSpec("player_runner", "Player Runner", "controller", "", "", Array.Empty<string>(), "", new Vector3(-2f, 0.25f, 0f), new Vector3(0.8f, 1.25f, 1f), 7f, 12f, 3, 1, 1.5f, 0f, false),
                new CheckpointSpec("checkpoint-beacon", "Checkpoint Beacon", "", "", Array.Empty<string>(), 1, 0f, true, new Vector3(18f, 3.6f, 0f), new Vector3(18f, 3.25f, 0f), new Vector3(0.8f, 1.8f, 1f), false),
                new[]
                {
                    new HazardSpec("pit-gap-a", "First Readable Pit", "pit", "", 1f, 1f, 0f, Array.Empty<string>(), false, new Vector3(11f, -0.2f, 0f), new Vector3(2.8f, 0.45f, 1f), false),
                    new HazardSpec("spike-row-b", "Spike Row After Checkpoint", "spikes", "", 2f, 1f, 0f, Array.Empty<string>(), false, new Vector3(24f, 1.2f, 0f), new Vector3(3.2f, 0.45f, 1f), false),
                },
                Array.Empty<EnemySpec>(),
                FallbackCoinSpecs(),
                0,
                false,
                "side-scroll",
                7.5f,
                new GoalSpec("exit_gate", "Exit Gate", "exit", Array.Empty<string>(), "", 0f, 1, false, new Vector3(29f, 1.2f, 0f), new Vector3(0.8f, 2.6f, 1f), false),
                false,
                false,
                0,
                0);
        }

        private static PlatformSpec[] PlatformsFromLevelBoard(GreyboxLevelBoard board, SampleArtBibleStyle style)
        {
            if (!board) return Array.Empty<PlatformSpec>();
            return board.Rooms()
                .Where(room => room)
                .OrderBy(room => room.transform.localPosition.x)
                .Select(room =>
                {
                    Vector3 position = room.transform.localPosition;
                    float width = Mathf.Clamp(room.Radius * 4f, 5f, 10f);
                    return new PlatformSpec(
                        string.IsNullOrWhiteSpace(room.DisplayName) ? "Authored Room Platform" : room.DisplayName + " Platform",
                        new Vector3(position.x + 1.5f, position.y - 1f, 0f),
                        new Vector3(width, room.IsStart ? 1f : 0.7f, 1f),
                        RoomColor(room, style),
                        RoomMaterialSlot(room));
                })
                .ToArray();
        }

        private static Vector3 PlayerSpawnFromLevelBoard(GreyboxLevelBoard board, Vector3 fallback)
        {
            if (!board) return fallback;
            GreyboxLevelRoom[] rooms = board.Rooms().Where(room => room).OrderBy(room => room.transform.localPosition.x).ToArray();
            GreyboxLevelRoom start = rooms.FirstOrDefault(room => room.IsStart) ?? rooms.FirstOrDefault();
            if (!start) return fallback;
            Vector3 position = start.transform.localPosition;
            return new Vector3(position.x - 2f, position.y + 0.25f, 0f);
        }

        private static Vector3 PlayerSpawnFromGameView(GreyboxGameViewport viewport, Vector3 fallback)
        {
            if (!viewport) return fallback;
            GreyboxSpawnPoint spawn = viewport.SpawnPoints()
                .Where(item => item && !item.IsCheckpoint)
                .OrderBy(item => item.transform.localPosition.x)
                .FirstOrDefault();
            if (!spawn) return fallback;
            Vector3 position = spawn.transform.localPosition;
            return new Vector3(position.x, position.y - 0.75f, 0f);
        }

        private static PlayerSpec PlayerFromGameView(GreyboxGameViewport viewport, Vector3 spawn, PlayerSpec fallback)
        {
            if (!viewport) return new PlayerSpec(fallback.PlayerId, fallback.DisplayName, fallback.Role, fallback.Faction, fallback.Behavior, fallback.AbilityIds, fallback.LootTableId, spawn, fallback.Scale, fallback.MoveSpeed, fallback.JumpImpulse, fallback.MaxHearts, fallback.AttackDamage, fallback.AttackRange, fallback.AttackCooldownSeconds, false);
            GreyboxActorDefinition actor = viewport.PlayerActors()
                .OrderBy(item => item.transform.localPosition.x)
                .FirstOrDefault();
            if (!actor) return new PlayerSpec(fallback.PlayerId, fallback.DisplayName, fallback.Role, fallback.Faction, fallback.Behavior, fallback.AbilityIds, fallback.LootTableId, spawn, fallback.Scale, fallback.MoveSpeed, fallback.JumpImpulse, fallback.MaxHearts, fallback.AttackDamage, fallback.AttackRange, fallback.AttackCooldownSeconds, false);

            return new PlayerSpec(
                string.IsNullOrWhiteSpace(actor.ActorId) ? fallback.PlayerId : actor.ActorId,
                string.IsNullOrWhiteSpace(actor.DisplayName) ? fallback.DisplayName : actor.DisplayName,
                string.IsNullOrWhiteSpace(actor.Role) ? fallback.Role : actor.Role,
                actor.Faction,
                actor.Behavior,
                actor.AbilityIds,
                actor.LootTableId,
                spawn,
                PlayerScaleFromActorRadius(actor, fallback.Scale),
                Mathf.Clamp(actor.MoveSpeed > 0f ? actor.MoveSpeed : fallback.MoveSpeed, 1f, 14f),
                Mathf.Clamp(actor.JumpImpulse > 0f ? actor.JumpImpulse : fallback.JumpImpulse, 1f, 24f),
                Mathf.Clamp(actor.Health, 1, 10),
                Mathf.Max(1, actor.Damage > 0 ? actor.Damage : fallback.AttackDamage),
                Mathf.Clamp(actor.AttackRange > 0f ? actor.AttackRange : fallback.AttackRange, 0.1f, 12f),
                Mathf.Clamp(actor.AttackCooldownSeconds > 0f ? actor.AttackCooldownSeconds : fallback.AttackCooldownSeconds, 0f, 10f),
                true);
        }

        private static CheckpointSpec CheckpointFromGameView(GreyboxGameViewport viewport, Vector3 fallbackPosition, Vector3 fallbackRespawn, CheckpointSpec fallback)
        {
            if (!viewport) return new CheckpointSpec(fallback.CheckpointId, fallback.DisplayName, fallback.SpawnId, fallback.SpawnGroup, fallback.ActorIds, fallback.MaxActivations, fallback.CooldownSeconds, fallback.SpawnOnStart, fallbackPosition, fallbackRespawn, fallback.Scale, false);
            GreyboxActorDefinition checkpointActor = viewport.Actors()
                .Where(actor => actor && ContainsToken(actor.Role, "checkpoint"))
                .OrderBy(actor => actor.transform.localPosition.x)
                .FirstOrDefault();
            GreyboxSpawnPoint spawn = viewport.CheckpointSpawnPoints()
                .OrderBy(item => item.transform.localPosition.x)
                .FirstOrDefault();
            bool hasCheckpointActor = checkpointActor != null;
            bool hasSpawn = spawn != null;
            if (!hasCheckpointActor && !hasSpawn) return new CheckpointSpec(fallback.CheckpointId, fallback.DisplayName, fallback.SpawnId, fallback.SpawnGroup, fallback.ActorIds, fallback.MaxActivations, fallback.CooldownSeconds, fallback.SpawnOnStart, fallbackPosition, fallbackRespawn, fallback.Scale, false);

            Vector3 positionSource = hasCheckpointActor ? checkpointActor.transform.localPosition : spawn.transform.localPosition;
            Vector3 respawnSource = hasSpawn ? spawn.transform.localPosition : positionSource;
            Transform radiusSource = hasCheckpointActor ? checkpointActor.transform : spawn.transform;
            string spawnId = hasSpawn && !string.IsNullOrWhiteSpace(spawn.SpawnId) ? spawn.SpawnId : fallback.SpawnId;
            string checkpointId = hasCheckpointActor && !string.IsNullOrWhiteSpace(checkpointActor.ActorId)
                ? checkpointActor.ActorId
                : (!string.IsNullOrWhiteSpace(spawnId) ? spawnId : fallback.CheckpointId);
            string displayName = hasCheckpointActor && !string.IsNullOrWhiteSpace(checkpointActor.DisplayName)
                ? checkpointActor.DisplayName
                : (hasSpawn && !string.IsNullOrWhiteSpace(spawn.DisplayName) ? spawn.DisplayName : fallback.DisplayName);
            string spawnGroup = hasSpawn ? spawn.SpawnGroup : fallback.SpawnGroup;
            string[] actorIds = hasSpawn ? spawn.ActorIds : fallback.ActorIds;
            int maxActivations = hasSpawn ? spawn.MaxCount : fallback.MaxActivations;
            float cooldownSeconds = hasSpawn ? spawn.CooldownSeconds : fallback.CooldownSeconds;
            bool spawnOnStart = hasSpawn ? spawn.SpawnOnStart : fallback.SpawnOnStart;
            return new CheckpointSpec(
                checkpointId,
                displayName,
                spawnId,
                spawnGroup,
                actorIds,
                maxActivations,
                cooldownSeconds,
                spawnOnStart,
                new Vector3(positionSource.x, positionSource.y, 0f),
                new Vector3(respawnSource.x, respawnSource.y - 0.75f, 0f),
                CheckpointScaleFromRadius(radiusSource, fallback.Scale),
                true);
        }

        private static GoalSpec GoalFromGameView(GreyboxGameViewport viewport, Vector3 fallbackPosition, GoalSpec fallback)
        {
            if (!viewport || !viewport.TryGetExitObjective(out GreyboxObjective goal))
            {
                return new GoalSpec(fallback.GoalId, fallback.DisplayName, fallback.ObjectiveType, fallback.TargetIds, fallback.Reward, fallback.TimeLimitSeconds, fallback.RequiredCount, fallback.IsPrimary, fallbackPosition, fallback.Scale, false);
            }

            Vector3 position = goal.transform.localPosition;
            return new GoalSpec(
                string.IsNullOrWhiteSpace(goal.ObjectiveId) ? fallback.GoalId : goal.ObjectiveId,
                string.IsNullOrWhiteSpace(goal.DisplayName) ? fallback.DisplayName : goal.DisplayName,
                string.IsNullOrWhiteSpace(goal.ObjectiveType) ? "exit" : goal.ObjectiveType,
                goal.TargetIds,
                goal.Reward,
                Mathf.Max(0f, goal.TimeLimitSeconds),
                Mathf.Max(1, goal.RequiredCount),
                goal.IsPrimary,
                new Vector3(position.x, position.y - 0.8f, 0f),
                GoalScaleFromRadius(goal.transform, fallback.Scale),
                true);
        }

        private static HazardSpec[] HazardsFromGameView(GreyboxGameViewport viewport)
        {
            if (!viewport) return Array.Empty<HazardSpec>();
            return viewport.Hazards()
                .Where(hazard => hazard)
                .OrderBy(hazard => hazard.transform.localPosition.x)
                .Take(4)
                .Select((hazard, index) =>
                {
                    Vector3 position = hazard.transform.localPosition;
                    string displayName = string.IsNullOrWhiteSpace(hazard.DisplayName) ? $"Authored Hazard {index + 1:00}" : hazard.DisplayName;
                    string hazardId = string.IsNullOrWhiteSpace(hazard.HazardId) ? SafeId(displayName) : hazard.HazardId;
                    string hazardType = string.IsNullOrWhiteSpace(hazard.HazardType) ? "hazard" : hazard.HazardType;
                    return new HazardSpec(
                        hazardId,
                        displayName,
                        hazardType,
                        hazard.Effect,
                        Mathf.Max(0f, hazard.Damage),
                        Mathf.Max(0.01f, hazard.TickSeconds),
                        Mathf.Max(0f, hazard.Knockback),
                        hazard.AffectedTags,
                        hazard.IsLethal,
                        new Vector3(position.x, position.y, 0f),
                        HazardScaleFromRadius(hazard, index),
                        true);
                })
                .ToArray();
        }

        private static HazardSpec[] HazardSpecsFromPositions(Vector3[] positions, HazardSpec[] fallback)
        {
            if (positions == null || positions.Length == 0) return Array.Empty<HazardSpec>();
            fallback = fallback ?? Array.Empty<HazardSpec>();
            var hazards = new HazardSpec[positions.Length];
            for (int index = 0; index < positions.Length; index++)
            {
                HazardSpec fallbackSpec = index < fallback.Length
                    ? fallback[index]
                    : new HazardSpec("", "", "", "", 1f, 1f, 0f, Array.Empty<string>(), false, Vector3.zero, Vector3.zero, false);
                string displayName = string.IsNullOrWhiteSpace(fallbackSpec.DisplayName)
                    ? (index == 0 ? "First Readable Pit" : $"Authored Hazard {index + 1:00}")
                    : fallbackSpec.DisplayName;
                hazards[index] = new HazardSpec(
                    string.IsNullOrWhiteSpace(fallbackSpec.HazardId) ? SafeId(displayName) : fallbackSpec.HazardId,
                    displayName,
                    string.IsNullOrWhiteSpace(fallbackSpec.HazardType) ? "hazard" : fallbackSpec.HazardType,
                    fallbackSpec.Effect,
                    Mathf.Max(0f, fallbackSpec.Damage),
                    Mathf.Max(0.01f, fallbackSpec.TickSeconds),
                    Mathf.Max(0f, fallbackSpec.Knockback),
                    fallbackSpec.AffectedTags,
                    fallbackSpec.IsLethal,
                    positions[index],
                    index == 0 ? new Vector3(2.8f, 0.45f, 1f) : new Vector3(3.2f, 0.45f, 1f),
                    false);
            }

            return hazards;
        }

        private static EnemySpec[] EnemiesFromGameView(GreyboxGameViewport viewport, GreyboxLevelBoard board, GreyboxLevelTilemap tilemap)
        {
            if (!viewport) return Array.Empty<EnemySpec>();
            return viewport.Actors()
                .Where(actor => actor && (actor.IsEnemy || ContainsToken(actor.Role, "enemy")))
                .OrderBy(actor => actor.transform.localPosition.x)
                .Take(6)
                .Select((actor, index) =>
                {
                    Vector3 position = actor.transform.localPosition;
                    string id = string.IsNullOrWhiteSpace(actor.ActorId) ? $"sample-enemy-{index + 1:00}" : actor.ActorId;
                    string name = string.IsNullOrWhiteSpace(actor.DisplayName) ? $"Sample Enemy {index + 1:00}" : actor.DisplayName;
                    float attackRange = Mathf.Clamp(actor.AttackRange > 0f ? actor.AttackRange : 1.25f, 0.5f, 3f);
                    float patrolRadius = Mathf.Clamp(actor.PatrolRadius > 0f ? actor.PatrolRadius : attackRange, 0.25f, 4f);
                    float aggroRadius = Mathf.Clamp(actor.AggroRadius > 0f ? actor.AggroRadius : Mathf.Max(attackRange, patrolRadius), 0.25f, 12f);
                    float patrolSpeed = Mathf.Clamp(actor.MoveSpeed > 0f ? actor.MoveSpeed : 1.6f, 0.5f, 4f);
                    string[] patrolPointIds = actor.PatrolPointIds ?? Array.Empty<string>();
                    Vector3 enemyPosition = new Vector3(position.x, position.y - 0.35f, 0f);
                    return new EnemySpec(
                        id,
                        name,
                        string.IsNullOrWhiteSpace(actor.Role) ? "enemy" : actor.Role,
                        actor.Faction,
                        actor.Behavior,
                        actor.AbilityIds,
                        patrolPointIds,
                        PatrolWaypointsFromRoute(board, tilemap, patrolPointIds, enemyPosition, patrolRadius),
                        actor.LootTableId,
                        enemyPosition,
                        EnemyScaleFromActorRadius(actor, new Vector3(0.8f, 0.55f, 1f)),
                        patrolRadius,
                        patrolSpeed,
                        attackRange,
                        aggroRadius,
                        Mathf.Max(1, actor.Health),
                        Mathf.Max(1, actor.Damage),
                        Mathf.Max(0f, actor.AttackCooldownSeconds),
                        true);
                })
                .ToArray();
        }

        private static CoinSpec[] CoinSpecsFromGameView(GreyboxGameViewport viewport, int count)
        {
            if (!viewport || count <= 0) return Array.Empty<CoinSpec>();
            GreyboxObjective coinLine = viewport.Objectives()
                .Where(objective => objective && (ContainsToken(objective.ObjectiveId, "coin") || ContainsToken(objective.DisplayName, "coin") || ContainsToken(objective.ObjectiveType, "coin")))
                .OrderBy(objective => objective.transform.localPosition.x)
                .FirstOrDefault();
            if (!coinLine) return Array.Empty<CoinSpec>();

            Vector3 center = coinLine.transform.localPosition;
            float radius = Mathf.Max(0.5f, Mathf.Max(coinLine.transform.localScale.x, coinLine.transform.localScale.y));
            float width = Mathf.Clamp(radius * 8f, 8f, 28f);
            float arcHeight = Mathf.Clamp(radius * 0.7f, 0.35f, 2.25f);
            string sourceObjectiveId = string.IsNullOrWhiteSpace(coinLine.ObjectiveId) ? "coin-line" : coinLine.ObjectiveId;
            string sourceObjectiveDisplayName = string.IsNullOrWhiteSpace(coinLine.DisplayName) ? "Coin Line" : coinLine.DisplayName;
            string sourceObjectiveType = string.IsNullOrWhiteSpace(coinLine.ObjectiveType) ? "collectible" : coinLine.ObjectiveType;
            string coinIdPrefix = SafeId(sourceObjectiveId);
            int coinCount = CoinTargetCountFromObjective(coinLine, count);
            var coins = new CoinSpec[coinCount];
            for (int index = 0; index < coinCount; index++)
            {
                float t = coinCount <= 1 ? 0.5f : index / (float)(coinCount - 1);
                float x = center.x - width * 0.5f + width * t;
                float y = center.y + Mathf.Sin(t * Mathf.PI) * arcHeight;
                coins[index] = new CoinSpec(
                    $"{coinIdPrefix}-{index + 1:00}",
                    $"{sourceObjectiveDisplayName} {index + 1:00}",
                    sourceObjectiveId,
                    sourceObjectiveDisplayName,
                    sourceObjectiveType,
                    new Vector3(x, y, -0.25f),
                    true);
            }

            return coins;
        }

        private static Vector3 PlayerScaleFromActorRadius(GreyboxActorDefinition actor, Vector3 fallback)
        {
            float radius = AuthoredRadiusFromTransform(actor ? actor.transform : null, fallback.x / 1.6f);
            return new Vector3(Mathf.Clamp(radius * 1.6f, 0.35f, 1.4f), Mathf.Clamp(radius * 2.5f, 0.7f, 2.4f), 1f);
        }

        private static Vector3 EnemyScaleFromActorRadius(GreyboxActorDefinition actor, Vector3 fallback)
        {
            float radius = AuthoredRadiusFromTransform(actor ? actor.transform : null, fallback.x / 1.8f);
            return new Vector3(Mathf.Clamp(radius * 1.8f, 0.35f, 1.4f), Mathf.Clamp(radius * 1.2f, 0.3f, 1.2f), 1f);
        }

        private static Vector3 HazardScaleFromRadius(GreyboxHazard hazard, int index)
        {
            Vector3 fallback = index == 0 ? new Vector3(2.8f, 0.45f, 1f) : new Vector3(3.2f, 0.45f, 1f);
            float radius = AuthoredRadiusFromTransform(hazard ? hazard.transform : null, fallback.x / 2.4f);
            return new Vector3(Mathf.Clamp(radius * 2.4f, 1.2f, 5.5f), Mathf.Clamp(radius * 0.375f, 0.35f, 0.8f), 1f);
        }

        private static Vector3 CheckpointScaleFromRadius(Transform source, Vector3 fallback)
        {
            float radius = AuthoredRadiusFromTransform(source, fallback.x / 1.3333334f);
            return new Vector3(Mathf.Clamp(radius * 1.3333334f, 0.45f, 1.6f), Mathf.Clamp(radius * 3f, 1f, 3.2f), 1f);
        }

        private static Vector3 GoalScaleFromRadius(Transform source, Vector3 fallback)
        {
            float radius = AuthoredRadiusFromTransform(source, fallback.y / 2.6f);
            return new Vector3(Mathf.Clamp(radius * 0.8f, 0.45f, 1.8f), Mathf.Clamp(radius * 2.6f, 1.2f, 4.2f), 1f);
        }

        private static float AuthoredRadiusFromTransform(Transform source, float fallback)
        {
            if (!source) return Mathf.Max(0.05f, fallback);
            Vector3 scale = source.localScale;
            float radius = Mathf.Max(Mathf.Abs(scale.x), Mathf.Abs(scale.y));
            return Mathf.Clamp(radius > 0f ? radius : fallback, 0.05f, 3f);
        }

        private static int CoinTargetCountFromObjective(GreyboxObjective coinLine, int fallbackCount)
        {
            int authoredCount = coinLine ? coinLine.RequiredCount : fallbackCount;
            if (authoredCount <= 0) authoredCount = fallbackCount;
            return Mathf.Clamp(authoredCount, 1, 64);
        }

        private static CoinSpec[] FallbackCoinSpecs()
        {
            var coins = new CoinSpec[SampleCoinCount];
            for (int i = 0; i < coins.Length; i++)
            {
                float x = -1.5f + i * 1.25f;
                float y = 1.05f + Mathf.Sin(i * 0.65f) * 0.55f;
                coins[i] = new CoinSpec(
                    $"platformer-coin-{i + 1:00}",
                    $"Coin {i + 1:00}",
                    "",
                    "",
                    "",
                    new Vector3(x, y, -0.25f),
                    false);
            }

            return coins;
        }

        private static Camera CameraFromGameView(GameObject gameViewRoot)
        {
            if (!gameViewRoot) return null;
            return gameViewRoot.GetComponentsInChildren<Camera>(true)
                .OrderBy(camera => camera.transform.localPosition.x)
                .ThenBy(camera => camera.transform.localPosition.y)
                .FirstOrDefault();
        }

        private static float CameraOrthographicSizeFromGameView(Camera importedCamera, float fallback)
        {
            if (!importedCamera) return Mathf.Clamp(fallback, 3f, 14f);
            return Mathf.Clamp(importedCamera.orthographicSize, 3f, 14f);
        }

        private static string CameraModeFromGameView(GreyboxGameViewport viewport, string fallback)
        {
            if (viewport && !string.IsNullOrWhiteSpace(viewport.CameraMode)) return viewport.CameraMode.Trim();
            return string.IsNullOrWhiteSpace(fallback) ? "side-scroll" : fallback.Trim();
        }

        private static Vector3 TileRecordPosition(GreyboxLevelTilemap tilemap, Vector3 fallback, Func<GreyboxLevelTileRecord, bool> predicate, float xOffset, float yOffset)
        {
            if (!TryFindTileRecord(tilemap, predicate, out GreyboxLevelTileRecord record)) return fallback;
            return new Vector3(record.Position.x + xOffset, record.Position.y + yOffset, 0f);
        }

        private static Vector3[] PatrolWaypointsFromRoute(GreyboxLevelBoard board, GreyboxLevelTilemap tilemap, string[] patrolPointIds, Vector3 origin, float patrolRadius)
        {
            string[] routeIds = (patrolPointIds ?? Array.Empty<string>())
                .Where(id => !string.IsNullOrWhiteSpace(id))
                .ToArray();
            if (routeIds.Length == 0) return Array.Empty<Vector3>();

            var waypoints = new List<Vector3>();
            foreach (string routeId in routeIds)
            {
                if (TryPatrolWaypointPosition(board, tilemap, routeId, out Vector3 waypoint)) waypoints.Add(waypoint);
            }

            if (waypoints.Count > 0) return waypoints.ToArray();

            float radius = Mathf.Max(0.25f, patrolRadius);
            return routeIds
                .Select((_, index) =>
                {
                    float spread = routeIds.Length <= 1 ? 1f : Mathf.Lerp(-1f, 1f, index / (float)(routeIds.Length - 1));
                    return origin + Vector3.right * radius * spread;
                })
                .ToArray();
        }

        private static bool TryPatrolWaypointPosition(GreyboxLevelBoard board, GreyboxLevelTilemap tilemap, string routeId, out Vector3 waypoint)
        {
            waypoint = Vector3.zero;
            if (string.IsNullOrWhiteSpace(routeId)) return false;

            if (board)
            {
                GreyboxLevelRoom room = board.Rooms()
                    .Where(candidate => candidate && (RouteMatches(candidate.RoomId, routeId) || RouteMatches(candidate.DisplayName, routeId)))
                    .OrderBy(candidate => candidate.transform.localPosition.x)
                    .FirstOrDefault();
                if (room)
                {
                    Vector3 position = room.transform.localPosition;
                    waypoint = new Vector3(position.x + 1.5f, position.y + 0.65f, 0f);
                    return true;
                }
            }

            if (tilemap && TryFindTileRecord(tilemap, record => RouteMatches(record.TileId, routeId) || RouteMatches(record.TileType, routeId), out GreyboxLevelTileRecord tile))
            {
                waypoint = new Vector3(tile.Position.x, tile.Position.y + 1f, 0f);
                return true;
            }

            return false;
        }

        private static Vector3[] HazardPositionsFromLevelBoard(GreyboxLevelTilemap tilemap)
        {
            if (!tilemap) return Array.Empty<Vector3>();
            return (tilemap.TileRecords ?? Array.Empty<GreyboxLevelTileRecord>())
                .Where(IsHazardTile)
                .OrderBy(record => record.Position.x)
                .Take(4)
                .Select(record => new Vector3(record.Position.x, record.Position.y + 1.2f, 0f))
                .ToArray();
        }

        private static int RouteLength(GreyboxLevelBoard board)
        {
            if (!board) return 0;
            GreyboxLevelRoom[] rooms = board.Rooms().Where(room => room).OrderBy(room => room.transform.localPosition.x).ToArray();
            if (rooms.Length < 2) return 0;
            return board.ShortestRoomPath(rooms[0].RoomId, rooms[rooms.Length - 1].RoomId).Length;
        }

        private static bool TryFindTileRecord(GreyboxLevelTilemap tilemap, Func<GreyboxLevelTileRecord, bool> predicate, out GreyboxLevelTileRecord record)
        {
            record = null;
            if (!tilemap) return false;
            foreach (GreyboxLevelTileRecord candidate in tilemap.TileRecords ?? Array.Empty<GreyboxLevelTileRecord>())
            {
                if (candidate == null || !predicate(candidate)) continue;
                record = candidate;
                return true;
            }

            return false;
        }

        private static bool IsCheckpointTile(GreyboxLevelTileRecord record)
        {
            return record != null && (record.IsSpawn || ContainsToken(record.TileType, "checkpoint"));
        }

        private static bool IsHazardTile(GreyboxLevelTileRecord record)
        {
            return record != null
                && (record.IsHazard || ContainsToken(record.TileType, "gap") || ContainsToken(record.TileType, "pit"));
        }

        private static bool ContainsToken(string value, string token)
        {
            return (value ?? "").IndexOf(token, StringComparison.OrdinalIgnoreCase) >= 0;
        }

        private static bool RouteMatches(string candidate, string routeId)
        {
            string candidateKey = RouteKey(candidate);
            string routeKey = RouteKey(routeId);
            if (string.IsNullOrWhiteSpace(candidateKey) || string.IsNullOrWhiteSpace(routeKey)) return false;
            if (string.Equals(candidateKey, routeKey, StringComparison.OrdinalIgnoreCase)) return true;
            if (candidateKey.Contains(routeKey) || routeKey.Contains(candidateKey)) return true;

            string[] routeTokens = routeKey.Split(new[] { '-' }, StringSplitOptions.RemoveEmptyEntries);
            int matchedTokens = routeTokens.Count(token => candidateKey.Contains(token));
            return matchedTokens == routeTokens.Length || (routeTokens.Length > 1 && matchedTokens >= routeTokens.Length - 1);
        }

        private static string RouteKey(string value)
        {
            return string.Join(
                "-",
                (value ?? "")
                    .Trim()
                    .ToLowerInvariant()
                    .Replace('_', ' ')
                    .Replace('-', ' ')
                    .Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries));
        }

        private static Color RoomColor(GreyboxLevelRoom room, SampleArtBibleStyle style)
        {
            style = style ?? new SampleArtBibleStyle();
            if (!room) return style.Platform;
            if (room.IsStart) return style.Platform;
            if (room.IsBoss || ContainsToken(room.RoomType, "exit") || ContainsToken(room.DisplayName, "exit")) return style.Goal;
            if (ContainsToken(room.DisplayName, "checkpoint")) return style.Checkpoint;
            return style.PlatformSecondary;
        }

        private static string RoomMaterialSlot(GreyboxLevelRoom room)
        {
            if (!room) return "platform";
            if (room.IsBoss || ContainsToken(room.RoomType, "exit") || ContainsToken(room.DisplayName, "exit")) return "goal";
            if (ContainsToken(room.DisplayName, "checkpoint")) return "checkpoint";
            return "platform";
        }

        private static Camera CreateCamera(Transform parent, SampleArtBibleStyle style, float orthographicSize)
        {
            var cameraObject = new GameObject("Sample Camera");
            cameraObject.transform.SetParent(parent, false);
            cameraObject.transform.position = new Vector3(10f, 4f, -18f);
            var camera = cameraObject.AddComponent<Camera>();
            camera.orthographic = true;
            camera.orthographicSize = Mathf.Clamp(orthographicSize, 3f, 14f);
            camera.backgroundColor = (style ?? new SampleArtBibleStyle()).Sky;
            camera.clearFlags = CameraClearFlags.SolidColor;
            cameraObject.tag = "MainCamera";
            return camera;
        }

        private static bool WireCameraFollow(Camera camera, GreyboxPlatformerSamplePlayer player, bool fromGameView, string cameraMode)
        {
            if (!camera || !player) return false;
            var follow = camera.GetComponent<GreyboxPlatformerSampleCameraFollow>() ?? camera.gameObject.AddComponent<GreyboxPlatformerSampleCameraFollow>();
            follow.Target = player.transform;
            follow.SourceArtifactKind = fromGameView ? "gameview.camera" : "sample.camera";
            follow.SourceArtifactId = "sample-camera";
            follow.SourceArtifactDisplayName = fromGameView ? "Imported Game View Camera" : "Sample Camera";
            follow.Offset = new Vector3(0f, 3f, -18f);
            follow.ApplyCameraMode(cameraMode);
            follow.LockedY = 4f;
            follow.SmoothTime = 0.12f;
            follow.SnapToTarget();
            return true;
        }

        private static GreyboxPlatformerSamplePlayer CreatePlayer(Transform parent, PlayerSpec playerSpec, SampleArtBibleStyle style)
        {
            style = style ?? new SampleArtBibleStyle();
            string displayName = string.IsNullOrWhiteSpace(playerSpec.DisplayName) ? "Player Runner" : playerSpec.DisplayName;
            GameObject player = CreateBox(parent, displayName, playerSpec.Spawn, playerSpec.Scale == Vector3.zero ? new Vector3(0.8f, 1.25f, 1f) : playerSpec.Scale, style.Runner, style.RunnerMaterial);
            var body = player.AddComponent<Rigidbody2D>();
            body.gravityScale = 3f;
            body.freezeRotation = true;
            var controller = player.AddComponent<GreyboxPlatformerSamplePlayer>();
            controller.PlayerId = string.IsNullOrWhiteSpace(playerSpec.PlayerId) ? SafeId(displayName) : playerSpec.PlayerId;
            controller.DisplayName = displayName;
            controller.Role = string.IsNullOrWhiteSpace(playerSpec.Role) ? "controller" : playerSpec.Role;
            controller.Faction = playerSpec.Faction ?? "";
            controller.Behavior = playerSpec.Behavior ?? "";
            controller.AbilityIds = playerSpec.AbilityIds ?? Array.Empty<string>();
            controller.LootTableId = playerSpec.LootTableId ?? "";
            controller.SourceArtifactKind = playerSpec.FromGameView ? "gameview.actor" : "sample.player";
            controller.SourceArtifactId = controller.PlayerId;
            controller.SourceArtifactDisplayName = displayName;
            controller.SpawnPoint = playerSpec.Spawn;
            controller.MoveSpeed = Mathf.Clamp(playerSpec.MoveSpeed, 1f, 14f);
            controller.JumpImpulse = Mathf.Clamp(playerSpec.JumpImpulse, 1f, 24f);
            controller.MaxHearts = Mathf.Clamp(playerSpec.MaxHearts, 1, 10);
            controller.AttackDamage = Mathf.Max(1, playerSpec.AttackDamage);
            controller.AttackRange = Mathf.Clamp(playerSpec.AttackRange, 0.1f, 12f);
            controller.AttackCooldownSeconds = Mathf.Clamp(playerSpec.AttackCooldownSeconds, 0f, 10f);
            controller.ResetHealth();
            return controller;
        }

        private static int CreatePlatforms(Transform parent, PlatformSpec[] platforms, SampleArtBibleStyle style)
        {
            int count = 0;
            foreach (PlatformSpec platform in platforms ?? Array.Empty<PlatformSpec>())
            {
                count += CreatePlatform(parent, platform.Name, platform.Position, platform.Scale, platform.Color, (style ?? new SampleArtBibleStyle()).MaterialForSlot(platform.MaterialSlot));
            }

            return count;
        }

        private static int CreatePlatform(Transform parent, string name, Vector3 position, Vector3 scale, Color color, Material material)
        {
            GameObject platform = CreateBox(parent, name, position, scale, color, material);
            platform.AddComponent<BoxCollider2D>();
            return 1;
        }

        private static int CreateHazards(Transform parent, HazardSpec[] hazards, SampleArtBibleStyle style)
        {
            int count = 0;
            foreach (HazardSpec hazard in hazards ?? Array.Empty<HazardSpec>())
            {
                count += CreateHazard(parent, hazard, style);
            }

            return count;
        }

        private static int CreateHazard(Transform parent, HazardSpec hazardSpec, SampleArtBibleStyle style)
        {
            style = style ?? new SampleArtBibleStyle();
            string displayName = string.IsNullOrWhiteSpace(hazardSpec.DisplayName) ? "Authored Hazard" : hazardSpec.DisplayName;
            GameObject hazard = CreateBox(parent, displayName, hazardSpec.Position, hazardSpec.Scale == Vector3.zero ? new Vector3(3.2f, 0.45f, 1f) : hazardSpec.Scale, style.Hazard, style.HazardMaterial);
            var hitbox = hazard.AddComponent<BoxCollider2D>();
            hitbox.isTrigger = true;
            var sampleHazard = hazard.AddComponent<GreyboxPlatformerSampleHazard>();
            sampleHazard.HazardId = string.IsNullOrWhiteSpace(hazardSpec.HazardId) ? SafeId(displayName) : hazardSpec.HazardId;
            sampleHazard.DisplayName = displayName;
            sampleHazard.HazardType = string.IsNullOrWhiteSpace(hazardSpec.HazardType) ? "hazard" : hazardSpec.HazardType;
            sampleHazard.SourceArtifactKind = hazardSpec.FromGameView ? "gameview.hazard" : "sample.hazard";
            sampleHazard.SourceArtifactId = sampleHazard.HazardId;
            sampleHazard.SourceArtifactDisplayName = displayName;
            sampleHazard.Effect = hazardSpec.Effect ?? "";
            sampleHazard.Damage = Mathf.Max(0f, hazardSpec.Damage);
            sampleHazard.TickSeconds = Mathf.Max(0.01f, hazardSpec.TickSeconds);
            sampleHazard.Knockback = Mathf.Max(0f, hazardSpec.Knockback);
            sampleHazard.AffectedTags = hazardSpec.AffectedTags ?? Array.Empty<string>();
            sampleHazard.IsLethal = hazardSpec.IsLethal;
            return 1;
        }

        private static int CreateEnemies(Transform parent, EnemySpec[] enemies, SampleArtBibleStyle style)
        {
            int count = 0;
            foreach (EnemySpec enemy in enemies ?? Array.Empty<EnemySpec>())
            {
                count += CreateEnemy(parent, enemy, style);
            }

            return count;
        }

        private static int CreateEnemy(Transform parent, EnemySpec enemy, SampleArtBibleStyle style)
        {
            style = style ?? new SampleArtBibleStyle();
            string displayName = string.IsNullOrWhiteSpace(enemy.Name) ? "Sample Enemy" : enemy.Name;
            GameObject enemyObject = CreateBox(parent, displayName, enemy.Position, enemy.Scale, style.Enemy, style.EnemyMaterial);
            var hitbox = enemyObject.AddComponent<BoxCollider2D>();
            hitbox.isTrigger = true;

            var actor = enemyObject.AddComponent<GreyboxActorDefinition>();
            actor.ActorId = string.IsNullOrWhiteSpace(enemy.EnemyId) ? SafeId(displayName) : enemy.EnemyId;
            actor.DisplayName = displayName;
            actor.Role = string.IsNullOrWhiteSpace(enemy.Role) ? "enemy" : enemy.Role;
            actor.Faction = enemy.Faction ?? "";
            actor.Behavior = enemy.Behavior ?? "";
            actor.AbilityIds = enemy.AbilityIds ?? Array.Empty<string>();
            actor.PatrolPointIds = enemy.PatrolPointIds ?? Array.Empty<string>();
            actor.LootTableId = enemy.LootTableId ?? "";
            actor.Health = Mathf.Max(1, enemy.Health);
            actor.Damage = Mathf.Max(1, enemy.Damage);
            actor.MoveSpeed = Mathf.Max(0.1f, enemy.PatrolSpeed);
            actor.AttackRange = Mathf.Max(0.1f, enemy.AttackRange);
            actor.PatrolRadius = Mathf.Max(0f, enemy.PatrolRadius);
            actor.AggroRadius = Mathf.Max(0.05f, enemy.AggroRadius);
            actor.AttackCooldownSeconds = Mathf.Max(0f, enemy.AttackCooldownSeconds);
            actor.IsEnemy = true;

            var patrol = enemyObject.AddComponent<GreyboxPlatformerSampleEnemy>();
            patrol.EnemyId = actor.ActorId;
            patrol.DisplayName = actor.DisplayName;
            patrol.Role = actor.Role;
            patrol.Faction = actor.Faction;
            patrol.Behavior = actor.Behavior;
            patrol.AbilityIds = actor.AbilityIds;
            patrol.PatrolPointIds = actor.PatrolPointIds;
            patrol.PatrolWaypoints = enemy.PatrolWaypoints ?? Array.Empty<Vector3>();
            patrol.LootTableId = actor.LootTableId;
            patrol.SourceArtifactKind = enemy.FromGameView ? "gameview.actor" : "sample.enemy";
            patrol.SourceArtifactId = actor.ActorId;
            patrol.SourceArtifactDisplayName = displayName;
            patrol.Origin = enemy.Position;
            patrol.PatrolRadius = Mathf.Max(0f, enemy.PatrolRadius);
            patrol.PatrolSpeed = Mathf.Max(0f, enemy.PatrolSpeed);
            patrol.AttackRange = Mathf.Max(0.05f, enemy.AttackRange);
            patrol.AggroRadius = actor.AggroRadius;
            patrol.Health = actor.Health;
            patrol.Damage = actor.Damage;
            patrol.AbilityKnockback = Mathf.Max(1f, actor.Damage + actor.AttackRange);
            patrol.AttackCooldownSeconds = actor.AttackCooldownSeconds;
            patrol.LootDropColor = style.Coin;
            patrol.LootDropMaterial = style.CoinMaterial;
            return 1;
        }

        private static GreyboxPlatformerSampleCheckpoint CreateCheckpoint(Transform parent, CheckpointSpec checkpointSpec, SampleArtBibleStyle style)
        {
            style = style ?? new SampleArtBibleStyle();
            string displayName = string.IsNullOrWhiteSpace(checkpointSpec.DisplayName) ? "Checkpoint Beacon" : checkpointSpec.DisplayName;
            GameObject checkpoint = CreateBox(parent, displayName, checkpointSpec.Position, checkpointSpec.Scale == Vector3.zero ? new Vector3(0.8f, 1.8f, 1f) : checkpointSpec.Scale, style.Checkpoint, style.CheckpointMaterial);
            var hitbox = checkpoint.AddComponent<BoxCollider2D>();
            hitbox.isTrigger = true;
            var sampleCheckpoint = checkpoint.AddComponent<GreyboxPlatformerSampleCheckpoint>();
            sampleCheckpoint.CheckpointId = string.IsNullOrWhiteSpace(checkpointSpec.CheckpointId) ? SafeId(displayName) : checkpointSpec.CheckpointId;
            sampleCheckpoint.DisplayName = displayName;
            sampleCheckpoint.SpawnId = checkpointSpec.SpawnId;
            sampleCheckpoint.SourceArtifactKind = checkpointSpec.FromGameView ? "gameview.checkpoint" : "sample.checkpoint";
            sampleCheckpoint.SourceArtifactId = sampleCheckpoint.CheckpointId;
            sampleCheckpoint.SourceArtifactDisplayName = displayName;
            sampleCheckpoint.SpawnGroup = checkpointSpec.SpawnGroup;
            sampleCheckpoint.ActorIds = checkpointSpec.ActorIds ?? Array.Empty<string>();
            sampleCheckpoint.MaxActivations = Mathf.Max(1, checkpointSpec.MaxActivations);
            sampleCheckpoint.CooldownSeconds = Mathf.Max(0f, checkpointSpec.CooldownSeconds);
            sampleCheckpoint.SpawnOnStart = checkpointSpec.SpawnOnStart;
            sampleCheckpoint.RespawnPoint = checkpointSpec.RespawnPoint;
            return sampleCheckpoint;
        }

        private static bool ApplyCheckpointSpawnOnStart(GreyboxPlatformerSamplePlayer player, GreyboxPlatformerSampleCheckpoint checkpoint)
        {
            return checkpoint && checkpoint.ApplySpawnOnStart(player);
        }

        private static GreyboxPlatformerSampleGoal CreateGoal(Transform parent, GoalSpec goalSpec, SampleArtBibleStyle style)
        {
            style = style ?? new SampleArtBibleStyle();
            string displayName = string.IsNullOrWhiteSpace(goalSpec.DisplayName) ? "Exit Gate" : goalSpec.DisplayName;
            GameObject goal = CreateBox(parent, displayName, goalSpec.Position, goalSpec.Scale == Vector3.zero ? new Vector3(0.8f, 2.6f, 1f) : goalSpec.Scale, style.Goal, style.GoalMaterial);
            var hitbox = goal.AddComponent<BoxCollider2D>();
            hitbox.isTrigger = true;
            var sampleGoal = goal.AddComponent<GreyboxPlatformerSampleGoal>();
            sampleGoal.GoalId = string.IsNullOrWhiteSpace(goalSpec.GoalId) ? SafeId(displayName) : goalSpec.GoalId;
            sampleGoal.DisplayName = displayName;
            sampleGoal.ObjectiveType = string.IsNullOrWhiteSpace(goalSpec.ObjectiveType) ? "exit" : goalSpec.ObjectiveType;
            sampleGoal.SourceArtifactKind = goalSpec.FromGameView ? "gameview.objective" : "sample.objective";
            sampleGoal.SourceArtifactId = sampleGoal.GoalId;
            sampleGoal.SourceArtifactDisplayName = displayName;
            sampleGoal.TargetIds = goalSpec.TargetIds ?? Array.Empty<string>();
            sampleGoal.Reward = goalSpec.Reward ?? "";
            sampleGoal.TimeLimitSeconds = Mathf.Max(0f, goalSpec.TimeLimitSeconds);
            sampleGoal.RequiredCount = Mathf.Max(1, goalSpec.RequiredCount);
            sampleGoal.IsPrimary = goalSpec.IsPrimary;
            return sampleGoal;
        }

        private static GreyboxPlatformerSampleHud WireHud(Transform parent, GameObject hudRoot, GreyboxPlatformerSamplePlayer player, GreyboxPlatformerSampleGoal goal, GreyboxPlatformerSampleCheckpoint checkpoint, int maxHearts, CoinSpec[] coins)
        {
            GameObject target = hudRoot ? hudRoot : new GameObject("Sample HUD State");
            if (!hudRoot) target.transform.SetParent(parent, false);
            var hud = target.GetComponent<GreyboxPlatformerSampleHud>() ?? target.AddComponent<GreyboxPlatformerSampleHud>();
            coins = coins ?? Array.Empty<CoinSpec>();
            hud.HudRoot = target;
            hud.Player = player;
            hud.Goal = goal;
            hud.Checkpoint = checkpoint;
            hud.MaxHearts = Mathf.Clamp(maxHearts, 1, 10);
            hud.TotalCoins = Mathf.Max(1, coins.Length);
            hud.ObjectiveLockedText = "COLLECT";
            hud.ObjectiveReadyText = $"REACH {HudLabel(goal ? goal.DisplayName : "", "THE EXIT")}";
            hud.ObjectiveCompletedText = $"{HudLabel(goal ? goal.DisplayName : "", "THE EXIT")} REACHED";
            hud.CheckpointReadyText = $"{HudLabel(checkpoint ? checkpoint.DisplayName : "", "CHECKPOINT")} READY";
            hud.CheckpointActivatedText = $"{HudLabel(checkpoint ? checkpoint.DisplayName : "", "CHECKPOINT")} SET";
            hud.RespawnReadyText = "RESPAWN READY";
            if (goal)
            {
                goal.Hud = hud;
                goal.RequiredCoins = RequiredCoinsForGoal(goal, coins, hud.TotalCoins);
            }
            return hud;
        }

        private static int RequiredCoinsForGoal(GreyboxPlatformerSampleGoal goal, CoinSpec[] coins, int fallbackTotalCoins)
        {
            if (!goal) return 0;
            coins = coins ?? Array.Empty<CoinSpec>();
            string[] targetIds = goal.TargetIds ?? Array.Empty<string>();
            if (targetIds.Length == 0) return Mathf.Max(0, fallbackTotalCoins);

            int required = 0;
            foreach (CoinSpec coin in coins)
            {
                if (TargetIdsContain(targetIds, coin.SourceObjectiveId)) required += 1;
            }

            return required;
        }

        private static GreyboxPlatformerSampleRunReset AttachRunReset(
            GameObject root,
            GreyboxPlatformerSamplePlayer player,
            GreyboxPlatformerSampleHud hud,
            GreyboxPlatformerSampleGoal goal,
            GreyboxPlatformerSampleCheckpoint checkpoint)
        {
            var reset = root.GetComponent<GreyboxPlatformerSampleRunReset>() ?? root.AddComponent<GreyboxPlatformerSampleRunReset>();
            reset.Player = player;
            reset.Hud = hud;
            reset.Goal = goal;
            reset.Checkpoint = checkpoint;
            reset.IncludeInactiveObjects = true;
            reset.CaptureInitialState();
            return reset;
        }

        private static bool TargetIdsContain(string[] targetIds, string candidate)
        {
            string safeCandidate = (candidate ?? "").Trim();
            if (string.IsNullOrWhiteSpace(safeCandidate)) return false;
            foreach (string targetId in targetIds ?? Array.Empty<string>())
            {
                if (string.Equals((targetId ?? "").Trim(), safeCandidate, StringComparison.OrdinalIgnoreCase)) return true;
            }

            return false;
        }

        private static string HudLabel(string value, string fallback)
        {
            string label = (value ?? "").Trim();
            return string.IsNullOrWhiteSpace(label) ? fallback : label.ToUpperInvariant();
        }

        private static int CreateCoins(Transform parent, GreyboxPlatformerSampleHud hud, SampleArtBibleStyle style, CoinSpec[] coins)
        {
            style = style ?? new SampleArtBibleStyle();
            if (coins == null || coins.Length == 0) coins = FallbackCoinSpecs();
            var group = new GameObject("Collectible Coins");
            group.transform.SetParent(parent, false);
            int count = 0;
            for (int i = 0; i < coins.Length; i++)
            {
                CoinSpec spec = coins[i];
                string displayName = string.IsNullOrWhiteSpace(spec.DisplayName) ? $"Coin {i + 1:00}" : spec.DisplayName;
                string coinId = string.IsNullOrWhiteSpace(spec.CoinId) ? $"platformer-coin-{i + 1:00}" : spec.CoinId;
                GameObject coin = CreateBox(group.transform, displayName, spec.Position, new Vector3(0.35f, 0.35f, 0.1f), style.Coin, style.CoinMaterial);
                var hitbox = coin.AddComponent<CircleCollider2D>();
                hitbox.isTrigger = true;
                var collectible = coin.AddComponent<GreyboxPlatformerSampleCollectible>();
                collectible.CoinId = coinId;
                collectible.DisplayName = displayName;
                collectible.SourceArtifactKind = spec.FromGameView ? "gameview.objective" : "sample.collectible";
                collectible.SourceArtifactId = string.IsNullOrWhiteSpace(spec.SourceObjectiveId) ? coinId : spec.SourceObjectiveId;
                collectible.SourceArtifactDisplayName = string.IsNullOrWhiteSpace(spec.SourceObjectiveDisplayName) ? displayName : spec.SourceObjectiveDisplayName;
                collectible.SourceObjectiveId = spec.SourceObjectiveId;
                collectible.SourceObjectiveDisplayName = spec.SourceObjectiveDisplayName;
                collectible.SourceObjectiveType = spec.SourceObjectiveType;
                collectible.Hud = hud;
                count++;
            }

            return count;
        }

        private static GreyboxPlatformerSampleArtifactManifest AttachArtifactManifest(
            GameObject root,
            ImportedSampleArtifacts imported,
            SampleGameplayPlan plan,
            SampleArtBibleStyle style,
            Camera sampleCamera,
            GreyboxPlatformerSamplePlayer player,
            GreyboxPlatformerSampleHud hud,
            GreyboxPlatformerSampleGoal goal,
            GreyboxPlatformerSampleCheckpoint checkpoint,
            GreyboxPlatformerSampleRunReset reset,
            bool cameraFollowEnabled,
            int playableObjectCount,
            double buildDurationSeconds)
        {
            var manifest = root.GetComponent<GreyboxPlatformerSampleArtifactManifest>() ?? root.AddComponent<GreyboxPlatformerSampleArtifactManifest>();
            manifest.SampleName = "2D Platformer";
            manifest.GameViewSourcePath = imported.GameViewPath;
            manifest.LevelBoardSourcePath = imported.LevelBoardPath;
            manifest.HudSourcePath = imported.HudPath;
            manifest.ArtBibleSourcePath = imported.ArtBiblePath;
            manifest.GameViewSourceHash = ImportedArtifactValue(imported.GameViewRoot, artifact => artifact.SourceHash);
            manifest.LevelBoardSourceHash = ImportedArtifactValue(imported.LevelBoardRoot, artifact => artifact.SourceHash);
            manifest.HudSourceHash = ImportedArtifactValue(imported.HudRoot, artifact => artifact.SourceHash);
            manifest.ArtBibleSourceHash = imported.ArtBibleArtifact ? imported.ArtBibleArtifact.SourceHash : "";
            manifest.GeneratorCredit = ImportedGeneratorCredit(imported);
            manifest.HumanDesignerCredit = ImportedHumanDesignerCredit(imported);
            manifest.AiDisclosure = ImportedAiDisclosure(imported);
            manifest.ImportChainProvenanceReady = IsImportChainProvenanceReady(manifest);
            manifest.ImportedArtifactCount = imported.Count;
            manifest.PlayableObjectCount = Mathf.Max(0, playableObjectCount);
            manifest.LevelBoardDrivenObjectCount = plan.LevelBoardDrivenObjectCount;
            manifest.GameViewDrivenObjectCount = plan.GameViewDrivenObjectCount;
            manifest.LevelBoardTileCount = plan.LevelBoardTileCount;
            manifest.LevelBoardRouteLength = plan.LevelBoardRouteLength;
            manifest.ArtBiblePaletteColorCount = (style ?? new SampleArtBibleStyle()).PaletteColorCount;
            manifest.ArtBibleDrivenMaterialCount = (style ?? new SampleArtBibleStyle()).DrivenMaterialCount;
            manifest.SourceTaggedRuntimeObjectCount = CountSourceTaggedRuntimeObjects(root);
            manifest.GameViewEnemyCount = plan.Enemies.Length;
            manifest.GameViewHazardCount = plan.Hazards.Count(hazard => hazard.FromGameView);
            manifest.GameViewCoinCount = plan.GameViewCoinCount;
            manifest.GameViewPlayerConfigured = plan.Player.FromGameView;
            manifest.GameViewCheckpointConfigured = plan.Checkpoint.FromGameView;
            manifest.GameViewGoalConfigured = plan.Goal.FromGameView;
            manifest.GameViewCameraConfigured = plan.GameViewCameraConfigured;
            manifest.CameraMode = plan.CameraMode;
            manifest.CameraOrthographicSize = sampleCamera ? sampleCamera.orthographicSize : 0f;
            manifest.SampleCoinCount = plan.Coins?.Length ?? 0;
            manifest.PlayerControllerConfigured = player && player.MaxHearts > 0 && player.MoveSpeed > 0f && player.JumpImpulse > 0f;
            manifest.HudControllerConfigured = hud && hud.Player == player && hud.Goal == goal && hud.TotalCoins == manifest.SampleCoinCount;
            manifest.GoalControllerConfigured = goal && goal.Hud == hud && goal.RequiredCoins == manifest.SampleCoinCount;
            manifest.CheckpointControllerConfigured = checkpoint && checkpoint.ActorIds != null && checkpoint.ActorIds.Length > 0;
            manifest.CameraFollowConfigured = cameraFollowEnabled;
            manifest.BuildBudgetSeconds = 30f;
            manifest.BuildDurationSeconds = Mathf.Max(0f, (float)buildDurationSeconds);
            manifest.BuildCompletedUnderBudget = manifest.BuildDurationSeconds <= manifest.BuildBudgetSeconds;
            manifest.HudResetActionId = "reset-run";
            manifest.HudResetActionConfigured = reset && reset.CanHandleHudAction(manifest.HudResetActionId) && HasHudAction(root, manifest.HudResetActionId);
            manifest.KeyboardResetConfigured = reset && reset.ResetOnKeyPress;
            manifest.KeyboardResetKey = reset ? reset.LegacyResetKey.ToString() : "";
            manifest.ResetControllerConfigured = reset
                && reset.Player == player
                && reset.Hud == hud
                && reset.Goal == goal
                && reset.Checkpoint == checkpoint
                && manifest.HudResetActionConfigured
                && manifest.KeyboardResetConfigured;
            manifest.AddressablesScenePath = GeneratedScenePath;
            manifest.AddressablesLabels = new[]
            {
                AddressablesTagger.GeneratedLabel,
                AddressablesTagger.SampleSceneLabel,
                AddressablesTagger.PlatformerSampleLabel
            };
            manifest.AddressablesTaggingConfigured = manifest.AddressablesLabels.Length == 3
                && manifest.AddressablesScenePath == GeneratedScenePath;
            manifest.PlayModeSmokeReady = manifest.ImportChainProvenanceReady
                && manifest.BuildCompletedUnderBudget
                && manifest.PlayableObjectCount >= 32
                && manifest.GameViewDrivenObjectCount > 0
                && manifest.LevelBoardDrivenObjectCount > 0
                && manifest.SourceTaggedRuntimeObjectCount >= manifest.SampleCoinCount + manifest.GameViewEnemyCount + manifest.GameViewHazardCount + 4
                && manifest.SampleCoinCount == SampleCoinCount
                && manifest.PlayerControllerConfigured
                && manifest.HudControllerConfigured
                && manifest.GoalControllerConfigured
                && manifest.CheckpointControllerConfigured
                && manifest.CameraFollowConfigured
                && manifest.ResetControllerConfigured
                && manifest.AddressablesTaggingConfigured;
            return manifest;
        }

        private static bool HasHudAction(GameObject root, string actionId)
        {
            string safeAction = (actionId ?? "").Trim();
            if (!root || string.IsNullOrWhiteSpace(safeAction)) return false;
            foreach (GreyboxHudBinding binding in root.GetComponentsInChildren<GreyboxHudBinding>(true))
            {
                if (!binding || !binding.IsButton) continue;
                string action = string.IsNullOrWhiteSpace(binding.Action) ? binding.BindingId : binding.Action;
                if (string.Equals((action ?? "").Trim(), safeAction, StringComparison.OrdinalIgnoreCase)) return true;
            }

            foreach (GreyboxUiToolkitHud hud in root.GetComponentsInChildren<GreyboxUiToolkitHud>(true))
            {
                if (!hud) continue;
                foreach (GreyboxUiToolkitHudElement element in hud.Elements ?? new List<GreyboxUiToolkitHudElement>())
                {
                    if (element == null || !element.IsButton) continue;
                    string action = string.IsNullOrWhiteSpace(element.Action) ? element.BindingId : element.Action;
                    if (string.Equals((action ?? "").Trim(), safeAction, StringComparison.OrdinalIgnoreCase)) return true;
                }
            }

            return false;
        }

        private static bool IsImportChainProvenanceReady(GreyboxPlatformerSampleArtifactManifest manifest)
        {
            return manifest
                && HasSourceArtifact(manifest.GameViewSourcePath)
                && HasSourceArtifact(manifest.LevelBoardSourcePath)
                && HasSourceArtifact(manifest.HudSourcePath)
                && HasSourceArtifact(manifest.ArtBibleSourcePath)
                && HasSourceArtifact(manifest.GameViewSourceHash)
                && HasSourceArtifact(manifest.LevelBoardSourceHash)
                && HasSourceArtifact(manifest.HudSourceHash)
                && HasSourceArtifact(manifest.ArtBibleSourceHash)
                && HasSourceArtifact(manifest.GeneratorCredit)
                && HasSourceArtifact(manifest.HumanDesignerCredit)
                && string.Equals(manifest.AiDisclosure, "AI-assisted", StringComparison.OrdinalIgnoreCase);
        }

        private static string ImportedGeneratorCredit(ImportedSampleArtifacts imported)
        {
            return FirstNonEmpty(
                ImportedArtifactValue(imported.GameViewRoot, artifact => artifact.GeneratorCredit),
                ImportedArtifactValue(imported.LevelBoardRoot, artifact => artifact.GeneratorCredit),
                ImportedArtifactValue(imported.HudRoot, artifact => artifact.GeneratorCredit),
                imported.ArtBiblePalette ? imported.ArtBiblePalette.GeneratorCredit : "",
                "Greybox + Human Designer");
        }

        private static string ImportedHumanDesignerCredit(ImportedSampleArtifacts imported)
        {
            return FirstNonEmpty(
                ImportedArtifactValue(imported.GameViewRoot, artifact => artifact.HumanDesignerCredit),
                ImportedArtifactValue(imported.LevelBoardRoot, artifact => artifact.HumanDesignerCredit),
                ImportedArtifactValue(imported.HudRoot, artifact => artifact.HumanDesignerCredit),
                imported.ArtBiblePalette ? imported.ArtBiblePalette.HumanDesignerCredit : "",
                "Human Designer");
        }

        private static string ImportedAiDisclosure(ImportedSampleArtifacts imported)
        {
            return FirstNonEmpty(
                ImportedArtifactValue(imported.GameViewRoot, artifact => artifact.AiDisclosure),
                ImportedArtifactValue(imported.LevelBoardRoot, artifact => artifact.AiDisclosure),
                ImportedArtifactValue(imported.HudRoot, artifact => artifact.AiDisclosure),
                imported.ArtBiblePalette ? imported.ArtBiblePalette.AiDisclosure : "",
                "AI-assisted");
        }

        private static string ImportedArtifactValue(GameObject root, Func<GreyboxImportedArtifact, string> read)
        {
            if (!root || read == null) return "";
            GreyboxImportedArtifact artifact = root.GetComponentInChildren<GreyboxImportedArtifact>(true);
            return artifact ? read(artifact) ?? "" : "";
        }

        private static string FirstNonEmpty(params string[] values)
        {
            foreach (string value in values ?? Array.Empty<string>())
            {
                if (!string.IsNullOrWhiteSpace(value)) return value.Trim();
            }

            return "";
        }

        private static int CountSourceTaggedRuntimeObjects(GameObject root)
        {
            if (!root) return 0;
            int count = 0;
            count += root.GetComponentsInChildren<GreyboxPlatformerSamplePlayer>(true).Count(item => item && HasSourceArtifact(item.SourceArtifactKind));
            count += root.GetComponentsInChildren<GreyboxPlatformerSampleHazard>(true).Count(item => item && HasSourceArtifact(item.SourceArtifactKind));
            count += root.GetComponentsInChildren<GreyboxPlatformerSampleEnemy>(true).Count(item => item && HasSourceArtifact(item.SourceArtifactKind));
            count += root.GetComponentsInChildren<GreyboxPlatformerSampleCheckpoint>(true).Count(item => item && HasSourceArtifact(item.SourceArtifactKind));
            count += root.GetComponentsInChildren<GreyboxPlatformerSampleGoal>(true).Count(item => item && HasSourceArtifact(item.SourceArtifactKind));
            count += root.GetComponentsInChildren<GreyboxPlatformerSampleCameraFollow>(true).Count(item => item && HasSourceArtifact(item.SourceArtifactKind));
            count += root.GetComponentsInChildren<GreyboxPlatformerSampleCollectible>(true).Count(item => item && HasSourceArtifact(item.SourceArtifactKind));
            return count;
        }

        private static bool HasSourceArtifact(string value)
        {
            return !string.IsNullOrWhiteSpace(value);
        }

        private static GameObject CreateBox(Transform parent, string name, Vector3 position, Vector3 scale, Color color, Material material = null)
        {
            GameObject box = GameObject.CreatePrimitive(PrimitiveType.Cube);
            box.name = name;
            box.transform.SetParent(parent, false);
            box.transform.position = position;
            box.transform.localScale = scale;
            foreach (Collider collider in box.GetComponents<Collider>()) UnityEngine.Object.DestroyImmediate(collider);
            var renderer = box.GetComponent<Renderer>();
            if (renderer) renderer.sharedMaterial = material ? material : MaterialBuilder.Colored(color, "Greybox Sample " + name);
            return box;
        }

        private static void EnsureGeneratedFolders()
        {
            string directory = Path.GetDirectoryName(GeneratedScenePath);
            if (!string.IsNullOrWhiteSpace(directory)) Directory.CreateDirectory(directory);
            AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
        }

        private static void RegisterSceneInBuildSettings(string scenePath)
        {
            EditorBuildSettingsScene[] scenes = EditorBuildSettings.scenes;
            if (scenes.Any(scene => scene.path == scenePath && scene.enabled)) return;
            EditorBuildSettings.scenes = scenes
                .Where(scene => scene.path != scenePath)
                .Concat(new[] { new EditorBuildSettingsScene(scenePath, true) })
                .ToArray();
        }

        private static string SafeId(string name)
        {
            return string.IsNullOrWhiteSpace(name)
                ? "sample"
                : name.Trim().ToLowerInvariant().Replace(' ', '-');
        }
    }
}
