// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using UnityEngine;

namespace Greybox.Runtime
{
    public sealed class GreyboxSpawnPoint : MonoBehaviour
    {
        public string SpawnId = "";
        public string DisplayName = "";
        public string SpawnGroup = "";
        public string[] ActorIds = new string[0];
        public int MaxCount = 1;
        public float CooldownSeconds;
        public bool SpawnOnStart = true;
        public float SpawnRadius = 0.5f;
        public bool IsCheckpoint;
    }
}
