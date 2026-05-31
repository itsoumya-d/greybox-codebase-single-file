// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using UnityEngine;

namespace Greybox.Runtime
{
    public sealed class GreyboxHazard : MonoBehaviour
    {
        public string HazardId = "";
        public string DisplayName = "";
        public string HazardType = "";
        public string Effect = "";
        public float Damage = 1f;
        public float TickSeconds = 1f;
        public float Radius = 1f;
        public float Knockback;
        public string[] AffectedTags = new string[0];
        public bool IsLethal;
    }
}
