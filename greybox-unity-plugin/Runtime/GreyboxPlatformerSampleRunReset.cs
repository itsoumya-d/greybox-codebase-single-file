// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System;
using UnityEngine;
using UnityEngine.InputSystem;

namespace Greybox.Runtime
{
    [DisallowMultipleComponent]
    public sealed class GreyboxPlatformerSampleRunReset : MonoBehaviour
    {
        public GreyboxPlatformerSamplePlayer Player;
        public GreyboxPlatformerSampleHud Hud;
        public GreyboxPlatformerSampleGoal Goal;
        public GreyboxPlatformerSampleCheckpoint Checkpoint;
        public bool IncludeInactiveObjects = true;
        public bool ResetOnKeyPress = true;
        public KeyCode LegacyResetKey = KeyCode.R;
        public string[] HudResetActionIds = { "reset-run", "restart-run", "reset-sample", "restart-sample" };
        public bool HasInitialPlayerSpawnPoint;
        public Vector3 InitialPlayerSpawnPoint;

        public int LastResetEnemyCount { get; private set; }
        public int LastResetCollectibleCount { get; private set; }
        public int LastHudActionResetCount { get; private set; }

        private void Awake()
        {
            CaptureInitialState();
        }

        private void OnEnable()
        {
            GreyboxHudActionDispatcher.ActionRaised += OnHudActionRaised;
        }

        private void OnDisable()
        {
            GreyboxHudActionDispatcher.ActionRaised -= OnHudActionRaised;
        }

        private void Update()
        {
            if (ResetOnKeyPress && ReadResetPressed()) ResetSampleRun();
        }

        public void CaptureInitialState()
        {
            ResolveReferences();
            if (!Player) return;
            InitialPlayerSpawnPoint = Player.SpawnPoint == Vector3.zero ? Player.transform.position : Player.SpawnPoint;
            HasInitialPlayerSpawnPoint = true;
        }

        public void ResetSampleRun()
        {
            ResolveReferences();
            if (!HasInitialPlayerSpawnPoint && Player) CaptureInitialState();

            if (Player)
            {
                if (HasInitialPlayerSpawnPoint) Player.SpawnPoint = InitialPlayerSpawnPoint;
                Player.ResetRunProgress();
            }

            foreach (GreyboxPlatformerSampleCheckpoint checkpoint in FindSceneObjects<GreyboxPlatformerSampleCheckpoint>())
            {
                if (checkpoint) checkpoint.ResetCheckpoint();
            }

            foreach (GreyboxPlatformerSampleGoal goal in FindSceneObjects<GreyboxPlatformerSampleGoal>())
            {
                if (goal) goal.ResetGoal();
            }

            LastResetEnemyCount = 0;
            foreach (GreyboxPlatformerSampleEnemy enemy in FindSceneObjects<GreyboxPlatformerSampleEnemy>())
            {
                if (!enemy) continue;
                enemy.ResetEnemy();
                LastResetEnemyCount += 1;
            }

            LastResetCollectibleCount = 0;
            foreach (GreyboxPlatformerSampleCollectible collectible in FindSceneObjects<GreyboxPlatformerSampleCollectible>())
            {
                if (!collectible || collectible.IsLoot()) continue;
                collectible.ResetCollectible();
                LastResetCollectibleCount += 1;
            }

            foreach (GreyboxPlatformerSampleHud hud in FindSceneObjects<GreyboxPlatformerSampleHud>())
            {
                if (!hud) continue;
                hud.ResetCoins();
                hud.Refresh();
            }
        }

        public bool TryResetFromHudAction(GreyboxHudActionContext context)
        {
            if (context == null || !CanHandleHudAction(context.ActionId)) return false;
            LastHudActionResetCount += 1;
            ResetSampleRun();
            return true;
        }

        public bool CanHandleHudAction(string actionId)
        {
            return ActionMatchesResetId(actionId, HudResetActionIds);
        }

        private void ResolveReferences()
        {
            if (!Player) Player = FirstSceneObject<GreyboxPlatformerSamplePlayer>();
            if (!Hud) Hud = FirstSceneObject<GreyboxPlatformerSampleHud>();
            if (!Goal) Goal = FirstSceneObject<GreyboxPlatformerSampleGoal>();
            if (!Checkpoint) Checkpoint = FirstSceneObject<GreyboxPlatformerSampleCheckpoint>();
        }

        private T FirstSceneObject<T>() where T : Object
        {
            T[] items = FindSceneObjects<T>();
            return items.Length == 0 ? null : items[0];
        }

        private T[] FindSceneObjects<T>() where T : Object
        {
            return Object.FindObjectsOfType<T>(IncludeInactiveObjects);
        }

        public static bool ComposeResetPressed(bool inputSystemReset, bool legacyReset)
        {
            return inputSystemReset || legacyReset;
        }

        private void OnHudActionRaised(GreyboxHudActionContext context)
        {
            TryResetFromHudAction(context);
        }

        private static bool ActionMatchesResetId(string actionId, string[] resetActionIds)
        {
            string safeAction = (actionId ?? "").Trim();
            if (string.IsNullOrWhiteSpace(safeAction)) return false;
            foreach (string resetActionId in resetActionIds ?? Array.Empty<string>())
            {
                string safeResetAction = (resetActionId ?? "").Trim();
                if (string.IsNullOrWhiteSpace(safeResetAction)) continue;
                if (string.Equals(safeAction, safeResetAction, StringComparison.OrdinalIgnoreCase)) return true;
            }

            return false;
        }

        private bool ReadResetPressed()
        {
            return ComposeResetPressed(
                ReadInputSystemResetPressed(Keyboard.current),
                TryReadLegacyResetKeyDown()
            );
        }

        private static bool ReadInputSystemResetPressed(Keyboard keyboard)
        {
            return keyboard != null && keyboard.rKey.wasPressedThisFrame;
        }

        private bool TryReadLegacyResetKeyDown()
        {
            try
            {
                return Input.GetKeyDown(LegacyResetKey);
            }
            catch (System.InvalidOperationException)
            {
                return false;
            }
        }
    }
}
