// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using UnityEngine;

namespace Greybox.Runtime
{
    public sealed class GreyboxEncounter : MonoBehaviour
    {
        public string EncounterId = "";
        public string DisplayName = "";
        public string EncounterType = "";
        public string TargetRoomId = "";
        public int Difficulty;
        public int EnemyCount;
        public string Reward = "";
        public float Radius = 1f;
    }
}
