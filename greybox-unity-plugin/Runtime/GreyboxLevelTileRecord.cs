// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System;
using UnityEngine;

namespace Greybox.Runtime
{
    [Serializable]
    public sealed class GreyboxLevelTileRecord
    {
        public string TileId = "";
        public string TileType = "";
        public string SourceJsonPath = "";
        public Vector3Int Position;
        public string ColorHex = "";
        public bool Walkable = true;
        public bool BlocksMovement;
        public bool IsSpawn;
        public bool IsExit;
        public bool IsHazard;
    }
}
