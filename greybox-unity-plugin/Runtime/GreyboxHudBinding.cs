// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using UnityEngine;

namespace Greybox.Runtime
{
    [DisallowMultipleComponent]
    public sealed class GreyboxHudBinding : MonoBehaviour
    {
        public string Slot = "";
        public string SlotId = "";
        public string BindingId = "";
        public string Role = "";
        public string Action = "";
        public string Text = "";
        public string AssetPath = "";
        public string JsonPath = "";
        public string RoundTripJsonPath = "";
        public bool IsButton;
        public bool IsImage;
        public bool IsProgress;
        public float ProgressMin;
        public float ProgressMax = 1f;
        public float ProgressValue;
    }
}
