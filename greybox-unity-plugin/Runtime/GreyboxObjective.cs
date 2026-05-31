// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using UnityEngine;

namespace Greybox.Runtime
{
    public sealed class GreyboxObjective : MonoBehaviour
    {
        public string ObjectiveId = "";
        public string DisplayName = "";
        public string ObjectiveType = "";
        public string[] TargetIds = new string[0];
        public string Reward = "";
        public float TimeLimitSeconds;
        public int RequiredCount = 1;
        public bool IsPrimary;
    }
}
