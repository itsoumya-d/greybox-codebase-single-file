// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace Greybox.Runtime
{
    [DisallowMultipleComponent]
    public sealed class GreyboxPlatformerSampleHud : MonoBehaviour
    {
        public GreyboxPlatformerSamplePlayer Player;
        public GreyboxPlatformerSampleGoal Goal;
        public GreyboxPlatformerSampleCheckpoint Checkpoint;
        public GameObject HudRoot;
        public int MaxHearts = 3;
        public int TotalCoins = 24;
        public string ObjectiveLockedText = "";
        public string ObjectiveReadyText = "REACH THE EXIT";
        public string ObjectiveCompletedText = "EXIT REACHED";
        public string CheckpointReadyText = "CHECKPOINT READY";
        public string CheckpointActivatedText = "CHECKPOINT SET";
        public string RespawnReadyText = "RESPAWN READY";

        public int CoinsCollected { get; private set; }

        private readonly HashSet<string> collectedCoinIds = new HashSet<string>();
        private readonly HashSet<string> collectedObjectiveIds = new HashSet<string>();
        private int lastDeaths = -1;
        private int lastHearts = -1;
        private int lastMaxHearts = -1;
        private int lastCoins = -1;
        private int lastLootPickups = -1;
        private int lastRemainingGoalCoins = -1;
        private int lastRemainingGoalTargets = -1;
        private bool lastGoalLocked;
        private bool lastCompleted;
        private bool lastCheckpointActivated;

        private void Awake()
        {
            if (!HudRoot) HudRoot = gameObject;
            Refresh();
        }

        private void Update()
        {
            Refresh();
        }

        public bool CollectCoin(string coinId)
        {
            return CollectCoin(coinId, "");
        }

        public bool CollectCoin(string coinId, string sourceObjectiveId)
        {
            string stableCoinId = (coinId ?? "").Trim();
            if (!string.IsNullOrEmpty(stableCoinId) && !collectedCoinIds.Add(stableCoinId))
            {
                Refresh();
                return false;
            }

            string stableObjectiveId = (sourceObjectiveId ?? "").Trim();
            if (!string.IsNullOrWhiteSpace(stableObjectiveId)) collectedObjectiveIds.Add(stableObjectiveId);
            CoinsCollected = Mathf.Clamp(CoinsCollected + 1, 0, Mathf.Max(1, TotalCoins));
            Refresh(true);
            return true;
        }

        public bool HasCollectedObjective(string objectiveId)
        {
            string wanted = (objectiveId ?? "").Trim();
            if (string.IsNullOrWhiteSpace(wanted)) return false;
            foreach (string collectedObjectiveId in collectedObjectiveIds)
            {
                if (string.Equals(collectedObjectiveId, wanted, System.StringComparison.OrdinalIgnoreCase)) return true;
            }

            return false;
        }

        public void ResetCoins()
        {
            collectedCoinIds.Clear();
            collectedObjectiveIds.Clear();
            CoinsCollected = 0;
            Refresh(true);
        }

        public void Refresh()
        {
            Refresh(false);
        }

        private void Refresh(bool force)
        {
            if (!HudRoot) HudRoot = gameObject;
            int deaths = Player ? Player.DeathCount : 0;
            int maxHearts = Mathf.Clamp(Player ? Player.MaxHearts : MaxHearts, 1, 10);
            int hearts = Player ? Mathf.Clamp(Player.CurrentHearts, 0, maxHearts) : maxHearts;
            int lootPickups = Player ? Player.LootPickupCount : 0;
            bool completed = Goal && Goal.Completed;
            bool goalLocked = Goal && Goal.IsLockedFor(Player, this);
            int remainingGoalCoins = Goal ? Goal.RemainingCoinsFor(this) : 0;
            int remainingGoalTargets = Goal ? Goal.RemainingTargetIdsFor(Player, this) : 0;
            bool checkpointActivated = Checkpoint && Checkpoint.Activated;
            if (!force && deaths == lastDeaths && hearts == lastHearts && maxHearts == lastMaxHearts && CoinsCollected == lastCoins && lootPickups == lastLootPickups && remainingGoalCoins == lastRemainingGoalCoins && remainingGoalTargets == lastRemainingGoalTargets && goalLocked == lastGoalLocked && completed == lastCompleted && checkpointActivated == lastCheckpointActivated) return;

            SetSlotRoleText("hud-hearts", "value", hearts.ToString());
            SetSlotProgress("hud-hearts", "health", hearts, maxHearts);
            SetSlotRoleText("hud-coins", "value", $"{CoinsCollected} / {Mathf.Max(TotalCoins, CoinsCollected)}");
            SetSlotRoleText("hud-loot", "value", lootPickups.ToString());
            SetSlotRoleText("hud-objective", "label", completed ? SafeHudText(ObjectiveCompletedText, "EXIT REACHED") : goalLocked ? LockedObjectiveText(remainingGoalCoins, remainingGoalTargets) : SafeHudText(ObjectiveReadyText, "REACH THE EXIT"));
            SetSlotRoleText("hud-checkpoint", "label", checkpointActivated ? SafeHudText(CheckpointActivatedText, "CHECKPOINT SET") : hearts > 0 ? SafeHudText(CheckpointReadyText, "CHECKPOINT READY") : SafeHudText(RespawnReadyText, "RESPAWN READY"));

            lastDeaths = deaths;
            lastHearts = hearts;
            lastMaxHearts = maxHearts;
            lastCoins = CoinsCollected;
            lastLootPickups = lootPickups;
            lastRemainingGoalCoins = remainingGoalCoins;
            lastRemainingGoalTargets = remainingGoalTargets;
            lastGoalLocked = goalLocked;
            lastCompleted = completed;
            lastCheckpointActivated = checkpointActivated;
        }

        private bool SetSlotRoleText(string slotId, string role, string value)
        {
            bool updated = SetUguiText(slotId, role, value);
            updated = SetUiToolkitText(slotId, role, value) || updated;
            return updated;
        }

        private bool SetSlotProgress(string slotId, string bindingId, float value, float max)
        {
            bool updated = SetUguiProgress(slotId, bindingId, value, max);
            updated = SetUiToolkitProgress(slotId, bindingId, value, max) || updated;
            return updated;
        }

        private bool SetUguiText(string slotId, string role, string value)
        {
            Transform slot = FindSlotTransform(slotId);
            if (!slot) return false;
            foreach (Text text in slot.GetComponentsInChildren<Text>(true))
            {
                var binding = text.GetComponent<GreyboxHudBinding>();
                if (binding && binding.SlotId == slotId && binding.Role == role)
                {
                    text.text = value;
                    binding.Text = value;
                    return true;
                }

                var marker = text.GetComponent<GreyboxMarker>();
                if (marker && marker.Collection == "hud-text" && marker.MarkerId == role)
                {
                    text.text = value;
                    return true;
                }
            }

            Transform fallback = slot.Find(role);
            Text fallbackText = fallback ? fallback.GetComponent<Text>() : null;
            if (!fallbackText) return false;
            fallbackText.text = value;
            return true;
        }

        private bool SetUguiProgress(string slotId, string bindingId, float value, float max)
        {
            Transform slot = FindSlotTransform(slotId);
            if (!slot) return false;
            float safeMax = Mathf.Max(1f, max);
            float safeValue = Mathf.Clamp(value, 0f, safeMax);
            foreach (Slider slider in slot.GetComponentsInChildren<Slider>(true))
            {
                var binding = slider.GetComponent<GreyboxHudBinding>();
                if (binding && binding.SlotId == slotId && MatchesProgressBinding(binding.BindingId, binding.Role, bindingId))
                {
                    slider.minValue = 0f;
                    slider.maxValue = safeMax;
                    slider.value = safeValue;
                    binding.Text = $"{safeValue:0} / {safeMax:0}";
                    binding.IsProgress = true;
                    binding.ProgressMin = 0f;
                    binding.ProgressMax = safeMax;
                    binding.ProgressValue = safeValue;
                    return true;
                }
            }

            Transform fallback = slot.Find(bindingId);
            Slider fallbackSlider = fallback ? fallback.GetComponent<Slider>() : null;
            if (!fallbackSlider) return false;
            fallbackSlider.minValue = 0f;
            fallbackSlider.maxValue = safeMax;
            fallbackSlider.value = safeValue;
            return true;
        }

        private bool SetUiToolkitText(string slotId, string role, string value)
        {
            var hud = HudRoot ? HudRoot.GetComponent<GreyboxUiToolkitHud>() : null;
            if (!hud) return false;
            bool updated = false;
            foreach (GreyboxUiToolkitHudElement element in hud.Elements)
            {
                if (element.SlotId == slotId && element.Role == role)
                {
                    element.Text = value;
                    updated = true;
                }
            }

            if (updated) hud.Build();
            return updated;
        }

        private bool SetUiToolkitProgress(string slotId, string bindingId, float value, float max)
        {
            var hud = HudRoot ? HudRoot.GetComponent<GreyboxUiToolkitHud>() : null;
            if (!hud) return false;
            bool updated = false;
            float safeMax = Mathf.Max(1f, max);
            float safeValue = Mathf.Clamp(value, 0f, safeMax);
            foreach (GreyboxUiToolkitHudElement element in hud.Elements)
            {
                if (element.IsProgress && element.SlotId == slotId && MatchesProgressBinding(element.BindingId, element.Role, bindingId))
                {
                    element.ProgressMin = 0f;
                    element.ProgressMax = safeMax;
                    element.ProgressValue = safeValue;
                    updated = true;
                }
            }

            if (updated) hud.Build();
            return updated;
        }

        private Transform FindSlotTransform(string slotId)
        {
            Transform root = HudRoot ? HudRoot.transform : transform;
            Transform direct = root.Find(slotId);
            if (direct) return direct;
            foreach (GreyboxMarker marker in root.GetComponentsInChildren<GreyboxMarker>(true))
            {
                if (marker.Collection == "hud-slot" && marker.MarkerId == slotId) return marker.transform;
            }

            return null;
        }

        private static bool MatchesProgressBinding(string candidateBindingId, string candidateRole, string bindingId)
        {
            if (!string.IsNullOrWhiteSpace(candidateBindingId)) return candidateBindingId == bindingId;
            return candidateRole == bindingId || candidateRole == "progress";
        }

        private static string SafeHudText(string value, string fallback)
        {
            string trimmed = (value ?? "").Trim();
            return string.IsNullOrWhiteSpace(trimmed) ? fallback : trimmed;
        }

        private string LockedObjectiveText(int remainingCoins, int remainingTargets)
        {
            string label = SafeHudText(ObjectiveLockedText, remainingCoins > 0 ? "COLLECT COINS" : "COMPLETE TARGETS");
            if (remainingCoins <= 0)
            {
                if (remainingTargets <= 0) return label;
                return $"{label} {remainingTargets} {(remainingTargets == 1 ? "TARGET" : "TARGETS")}";
            }
            return $"{label} {remainingCoins} {(remainingCoins == 1 ? "COIN" : "COINS")}";
        }
    }
}
