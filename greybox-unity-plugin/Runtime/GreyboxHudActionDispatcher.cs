// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System;
using UnityEngine;
using UnityEngine.Events;
using UnityEngine.UI;

namespace Greybox.Runtime
{
    [Serializable]
    public sealed class GreyboxHudStringEvent : UnityEvent<string>
    {
    }

    public sealed class GreyboxHudActionContext
    {
        public GreyboxHudActionContext(string actionId, string slotId, string bindingId, string jsonPath, string text, UnityEngine.Object source)
        {
            ActionId = actionId ?? "";
            SlotId = slotId ?? "";
            BindingId = bindingId ?? "";
            JsonPath = jsonPath ?? "";
            Text = text ?? "";
            Source = source;
        }

        public string ActionId { get; }
        public string SlotId { get; }
        public string BindingId { get; }
        public string JsonPath { get; }
        public string Text { get; }
        public UnityEngine.Object Source { get; }
    }

    public static class GreyboxHudActionDispatcher
    {
        public static event Action<GreyboxHudActionContext> ActionRaised;

        public static void Raise(string actionId, string slotId, string bindingId, string jsonPath, string text, UnityEngine.Object source)
        {
            string safeAction = (actionId ?? "").Trim();
            if (string.IsNullOrWhiteSpace(safeAction)) return;
            ActionRaised?.Invoke(new GreyboxHudActionContext(
                safeAction,
                (slotId ?? "").Trim(),
                (bindingId ?? "").Trim(),
                (jsonPath ?? "").Trim(),
                (text ?? "").Trim(),
                source));
        }
    }

    [DisallowMultipleComponent]
    [RequireComponent(typeof(Button))]
    public sealed class GreyboxHudButtonAction : MonoBehaviour
    {
        public string ActionId = "";
        public string SlotId = "";
        public string BindingId = "";
        public string JsonPath = "";
        public string Text = "";
        public GreyboxHudStringEvent OnAction = new GreyboxHudStringEvent();

        private Button button;

        private void OnEnable()
        {
            button = GetComponent<Button>();
            if (button) button.onClick.AddListener(InvokeAction);
            RefreshFromBinding();
        }

        private void OnDisable()
        {
            if (button) button.onClick.RemoveListener(InvokeAction);
        }

        private void OnValidate()
        {
            RefreshFromBinding();
        }

        public void Configure(GreyboxHudBinding binding)
        {
            ApplyBinding(binding);
        }

        public void InvokeAction()
        {
            RefreshFromBinding();
            string action = string.IsNullOrWhiteSpace(ActionId) ? BindingId : ActionId;
            if (string.IsNullOrWhiteSpace(action)) return;
            OnAction.Invoke(action);
            GreyboxHudActionDispatcher.Raise(action, SlotId, BindingId, JsonPath, Text, this);
        }

        private void RefreshFromBinding()
        {
            ApplyBinding(GetComponent<GreyboxHudBinding>());
        }

        private void ApplyBinding(GreyboxHudBinding binding)
        {
            if (!binding) return;
            ActionId = string.IsNullOrWhiteSpace(binding.Action) ? binding.BindingId : binding.Action;
            SlotId = binding.SlotId ?? "";
            BindingId = binding.BindingId ?? "";
            JsonPath = binding.JsonPath ?? "";
            Text = binding.Text ?? "";
        }
    }
}
