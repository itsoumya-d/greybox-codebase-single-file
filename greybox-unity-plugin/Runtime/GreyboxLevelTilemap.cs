// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Tilemaps;

namespace Greybox.Runtime
{
    public sealed class GreyboxLevelTilemap : MonoBehaviour
    {
        public string BoardId = "";
        public string SourceJsonPath = "";
        public int TileCount;
        public Vector3Int BoundsOrigin;
        public Vector3Int BoundsSize;
        public bool ColliderEnabled;
        public bool CompositeColliderEnabled;
        public GreyboxLevelTileRecord[] TileRecords = new GreyboxLevelTileRecord[0];
        public TileBase[] TileAssets = new TileBase[0];
        public Texture2D[] TileTextures = new Texture2D[0];
        public Sprite[] TileSprites = new Sprite[0];

        public bool TryGetTileRecord(string tileId, out GreyboxLevelTileRecord record)
        {
            string wanted = (tileId ?? "").Trim();
            if (string.IsNullOrWhiteSpace(wanted))
            {
                record = null;
                return false;
            }

            foreach (GreyboxLevelTileRecord candidate in TileRecords ?? Array.Empty<GreyboxLevelTileRecord>())
            {
                if (candidate == null || candidate.TileId != wanted) continue;
                record = candidate;
                return true;
            }

            record = null;
            return false;
        }

        public bool TryGetTileRecord(Vector3Int position, out GreyboxLevelTileRecord record)
        {
            foreach (GreyboxLevelTileRecord candidate in TileRecords ?? Array.Empty<GreyboxLevelTileRecord>())
            {
                if (candidate == null || candidate.Position != position) continue;
                record = candidate;
                return true;
            }

            record = null;
            return false;
        }

        public bool IsWalkable(Vector3Int position)
        {
            return TryGetTileRecord(position, out GreyboxLevelTileRecord record) && record.Walkable && !record.BlocksMovement;
        }

        public bool BlocksMovementAt(Vector3Int position)
        {
            return TryGetTileRecord(position, out GreyboxLevelTileRecord record) && record.BlocksMovement;
        }

        public Vector3Int[] WalkableCells()
        {
            return CellsWhere(record => record.Walkable && !record.BlocksMovement);
        }

        public Vector3Int[] SpawnCells()
        {
            return CellsWhere(record => record.IsSpawn);
        }

        public Vector3Int[] ExitCells()
        {
            return CellsWhere(record => record.IsExit);
        }

        public Vector3Int[] HazardCells()
        {
            return CellsWhere(record => record.IsHazard);
        }

        public Vector3 CellCenterWorld(Vector3Int position)
        {
            Tilemap tilemap = GetComponent<Tilemap>();
            return tilemap ? tilemap.GetCellCenterWorld(position) : transform.TransformPoint(position);
        }

        private Vector3Int[] CellsWhere(Func<GreyboxLevelTileRecord, bool> predicate)
        {
            var cells = new List<Vector3Int>();
            foreach (GreyboxLevelTileRecord record in TileRecords ?? Array.Empty<GreyboxLevelTileRecord>())
            {
                if (record == null || !predicate(record)) continue;
                cells.Add(record.Position);
            }

            return cells.ToArray();
        }
    }
}
