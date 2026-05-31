// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using UnityEngine;

namespace Greybox.Runtime
{
    public sealed class GreyboxLevelConnection : MonoBehaviour
    {
        public string ConnectionId = "";
        public string FromRoomId = "";
        public string ToRoomId = "";
        public string ConnectionType = "";
        public bool Locked;
        public float TravelCost = 1f;
    }
}
