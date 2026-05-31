// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using UnityEngine;

namespace Greybox.Runtime
{
    public sealed class GreyboxLevelRoom : MonoBehaviour
    {
        public string RoomId = "";
        public string DisplayName = "";
        public string RoomType = "";
        public int Difficulty;
        public float Radius = 1f;
        public Vector3 Size = Vector3.one;
        public bool IsStart;
        public bool IsBoss;
        public string[] ConnectedRoomIds = new string[0];
    }
}
