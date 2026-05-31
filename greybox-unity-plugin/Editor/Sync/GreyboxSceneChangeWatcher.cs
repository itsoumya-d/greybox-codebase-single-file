// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using Greybox.Editor.Windows;
using Greybox.Runtime;
using UnityEditor;
using UnityEngine;
using UnityEngine.Tilemaps;

namespace Greybox.Editor.Sync
{
    [InitializeOnLoad]
    public static class GreyboxSceneChangeWatcher
    {
        public const double RoundTripLatencyBudgetSeconds = 2.0d;
        public const double FlushDelaySeconds = 0.25d;
        private const int MaxPendingMarkers = 256;
        private const int MaxPendingFieldEdits = 256;
        private static readonly Regex TileRecordPropertyPathPattern = new Regex(@"^TileRecords\.Array\.data\[(\d+)\]\.(TileType|ColorHex|Walkable|BlocksMovement|IsSpawn|IsExit|IsHazard|Position(?:\.[xyz])?)$", RegexOptions.Compiled);
        private static readonly Dictionary<int, GreyboxMarker> PendingMarkers = new Dictionary<int, GreyboxMarker>();
        private static readonly Dictionary<string, GreyboxRoundTripFieldEdit> PendingFieldEdits = new Dictionary<string, GreyboxRoundTripFieldEdit>(StringComparer.Ordinal);
        private static GreyboxConfig config;
        private static GreyboxDaemonClient daemonClient;
        private static ProjectWatcher projectWatcher;
        private static string sessionKey = "";
        private static double nextFlushAt;

        static GreyboxSceneChangeWatcher()
        {
            if (FlushDelaySeconds >= RoundTripLatencyBudgetSeconds)
            {
                Debug.LogWarning("Greybox round-trip Scene edit debounce exceeds the 2 second sync budget.");
            }
            Undo.postprocessModifications += OnPostprocessModifications;
            EditorApplication.update += FlushPendingMarkers;
        }

        internal static UndoPropertyModification[] OnPostprocessModifications(UndoPropertyModification[] modifications)
        {
            foreach (UndoPropertyModification modification in modifications)
            {
                string propertyPath = modification.currentValue.propertyPath;
                var transform = modification.currentValue.target as Transform;
                if (transform) UpdateDesignNodeTransformMetadata(transform, propertyPath);
                var component = modification.currentValue.target as Component;

                if (IsLocalPositionChange(propertyPath))
                {
                    if (!transform) continue;
                    var marker = transform.GetComponent<GreyboxMarker>();
                    if (!marker || string.IsNullOrWhiteSpace(marker.PositionJsonPath)) continue;
                    SyncMovedTilemapCell(transform, marker);
                    QueueMarkerTransform(marker);
                    continue;
                }

                if (component is GreyboxLevelTilemap tilemapMetadata)
                {
                    SyncTileRecordPropertyChange(tilemapMetadata, propertyPath);
                }

                if (GreyboxRoundTripFieldMapper.TryMap(modification.currentValue.target, modification.currentValue.propertyPath, out GreyboxRoundTripFieldEdit edit))
                {
                    QueueFieldEdit(modification.currentValue.target, edit);
                }
                if (component) GreyboxRoundTripMetadataSync.UpdateDisplayNameMetadata(component, propertyPath);
            }
            return modifications;
        }

        internal static void QueueFieldEdit(UnityEngine.Object source, GreyboxRoundTripFieldEdit edit)
        {
            if (!source || !edit.Marker || string.IsNullOrWhiteSpace(edit.Path) || edit.Value == null) return;
            string key = FieldEditKey(source, edit);
            if (!PendingFieldEdits.ContainsKey(key) && PendingFieldEdits.Count >= MaxPendingFieldEdits)
            {
                Debug.LogWarning($"Greybox dropped a round-trip field edit because the pending edit queue is capped at {MaxPendingFieldEdits} entries.");
                return;
            }
            PendingFieldEdits[key] = edit;
            nextFlushAt = EditorApplication.timeSinceStartup + FlushDelaySeconds;
        }

        internal static void QueueMarkerTransform(GreyboxMarker marker)
        {
            if (!marker || string.IsNullOrWhiteSpace(marker.PositionJsonPath)) return;
            int key = marker.GetInstanceID();
            if (!PendingMarkers.ContainsKey(key) && PendingMarkers.Count >= MaxPendingMarkers)
            {
                Debug.LogWarning($"Greybox dropped a round-trip transform edit because the pending marker queue is capped at {MaxPendingMarkers} entries.");
                return;
            }
            PendingMarkers[key] = marker;
            nextFlushAt = EditorApplication.timeSinceStartup + FlushDelaySeconds;
        }

        internal static int PendingMarkerCountForTests => PendingMarkers.Count;
        internal static int MaxPendingMarkersForTests => MaxPendingMarkers;
        internal static int PendingFieldEditCountForTests => PendingFieldEdits.Count;
        internal static int MaxPendingFieldEditsForTests => MaxPendingFieldEdits;

        internal static void ClearPendingForTests()
        {
            PendingMarkers.Clear();
            PendingFieldEdits.Clear();
            nextFlushAt = 0;
            ResetRoundTripSession();
        }

        internal static void FlushPendingMarkers()
        {
            if (PendingMarkers.Count == 0 && PendingFieldEdits.Count == 0) return;
            if (EditorApplication.timeSinceStartup < nextFlushAt) return;
            var markers = PendingMarkers.Values.Where(marker => marker).ToArray();
            var fieldEdits = PendingFieldEdits.Values.Where(edit => edit.Marker).ToArray();
            PendingMarkers.Clear();
            PendingFieldEdits.Clear();
            foreach (GreyboxMarker marker in markers) NotifyWhenConnected(marker);
            foreach (GreyboxRoundTripFieldEdit edit in fieldEdits) NotifyFieldWhenConnected(edit);
        }

        private static async void NotifyWhenConnected(GreyboxMarker marker)
        {
            try
            {
                if (!marker || !IsRoundTripEnabled()) return;
                if (!EnsureSession()) return;
                await daemonClient.EnsureConnectedAsync();
                projectWatcher.NotifyMarkerTransformChanged(marker);
            }
            catch (Exception error)
            {
                Debug.LogWarning($"Greybox round-trip Scene edit sync failed: {error.Message}");
            }
        }

        private static async void NotifyFieldWhenConnected(GreyboxRoundTripFieldEdit edit)
        {
            try
            {
                if (!edit.Marker || !IsRoundTripEnabled()) return;
                if (!EnsureSession()) return;
                await daemonClient.EnsureConnectedAsync();
                projectWatcher.NotifyMarkerFieldChanged(edit.Marker, edit.Path, edit.Value);
            }
            catch (Exception error)
            {
                Debug.LogWarning($"Greybox round-trip field edit sync failed: {error.Message}");
            }
        }

        private static bool IsRoundTripEnabled()
        {
            config = GreyboxSettings.LoadConfig();
            return config
                && config.RoundTripSyncEnabled
                && GreyboxLicenseState.CurrentCapabilities().CanRoundTrip
                && GreyboxDaemonUrlBuilder.TrySafeProjectId(config.ProjectId, out _);
        }

        private static bool EnsureSession()
        {
            string desiredSessionKey = SessionKey(config);
            if (string.IsNullOrWhiteSpace(desiredSessionKey))
            {
                ResetRoundTripSession();
                Debug.LogWarning("Greybox failed to start a safe round-trip sync session because the daemon URL or project id is unsafe.");
                return false;
            }
            if (daemonClient != null && projectWatcher != null && string.Equals(sessionKey, desiredSessionKey, StringComparison.Ordinal)) return true;
            ResetRoundTripSession();
            daemonClient = new GreyboxDaemonClient(config);
            projectWatcher = new ProjectWatcher(daemonClient);
            sessionKey = desiredSessionKey;
            return true;
        }

        private static string SessionKey(GreyboxConfig activeConfig)
        {
            if (!activeConfig) return "";
            if (!GreyboxDaemonUrlBuilder.TrySafeProjectId(activeConfig.ProjectId, out string projectId)) return "";
            if (!GreyboxDaemonUrlBuilder.TrySafeDaemonBaseUrl(activeConfig.DaemonUrl, out string safeDaemonBaseUrl)) return "";
            return $"{projectId}\n{safeDaemonBaseUrl}";
        }

        private static void ResetRoundTripSession()
        {
            daemonClient?.Dispose();
            daemonClient = null;
            projectWatcher = null;
            sessionKey = "";
        }

        private static bool IsLocalPositionChange(string propertyPath)
        {
            return !string.IsNullOrEmpty(propertyPath)
                && (propertyPath == "m_LocalPosition" || propertyPath.StartsWith("m_LocalPosition.", StringComparison.Ordinal));
        }

        private static string FieldEditKey(UnityEngine.Object source, GreyboxRoundTripFieldEdit edit)
        {
            return $"{source.GetInstanceID()}|{edit.Path}";
        }

        private static bool SyncMovedTilemapCell(Transform transform, GreyboxMarker marker)
        {
            if (!transform || !marker || !string.Equals(marker.Collection, "tiles", StringComparison.Ordinal)) return false;
            Transform parent = transform.parent;
            if (!parent) return false;
            var metadata = parent.GetComponent<GreyboxLevelTilemap>();
            if (!metadata) return false;
            GreyboxLevelTileRecord record = FindTileRecord(metadata, marker.MarkerId);
            if (record == null) return false;
            var tilemap = parent.GetComponent<Tilemap>();
            Vector3Int previousCell = record.Position;
            Vector3Int currentCell = tilemap ? tilemap.WorldToCell(transform.position) : Vector3Int.RoundToInt(transform.localPosition);
            if (previousCell == currentCell) return false;

            if (tilemap)
            {
                Undo.RecordObject(tilemap, "Greybox move tilemap cell");
                TileBase tile = tilemap.GetTile(previousCell) ?? tilemap.GetTile(currentCell) ?? FirstTileForRecord(metadata, record);
                if (tile)
                {
                    tilemap.SetTile(previousCell, null);
                    tilemap.SetTile(currentCell, tile);
                    tilemap.RefreshTile(previousCell);
                    tilemap.RefreshTile(currentCell);
                    tilemap.CompressBounds();
                }
                EditorUtility.SetDirty(tilemap);
            }

            Undo.RecordObject(metadata, "Greybox move tilemap record");
            record.Position = currentCell;
            metadata.TileCount = (metadata.TileRecords ?? Array.Empty<GreyboxLevelTileRecord>()).Count(item => item != null);
            if (tilemap)
            {
                BoundsInt bounds = tilemap.cellBounds;
                metadata.BoundsOrigin = bounds.position;
                metadata.BoundsSize = bounds.size;
            }
            EditorUtility.SetDirty(metadata);
            PrefabUtility.RecordPrefabInstancePropertyModifications(metadata);
            return true;
        }

        private static bool SyncTileRecordPropertyChange(GreyboxLevelTilemap metadata, string propertyPath)
        {
            if (!metadata || !TryFindTileRecordByPropertyPath(metadata, propertyPath, out GreyboxLevelTileRecord record, out string fieldName)) return false;
            var tilemap = metadata.GetComponent<Tilemap>();
            if (fieldName.StartsWith(nameof(GreyboxLevelTileRecord.Position), StringComparison.Ordinal))
            {
                return SyncTileRecordPositionChange(metadata, tilemap, record);
            }
            if (!IsTileRecordVisualProperty(fieldName)) return false;
            return RefreshTileRecordCell(metadata, tilemap, record);
        }

        private static bool TryFindTileRecordByPropertyPath(GreyboxLevelTilemap metadata, string propertyPath, out GreyboxLevelTileRecord record, out string fieldName)
        {
            record = null;
            fieldName = "";
            if (!metadata) return false;
            Match match = TileRecordPropertyPathPattern.Match(propertyPath ?? "");
            if (!match.Success) return false;
            if (!int.TryParse(match.Groups[1].Value, out int index)) return false;
            GreyboxLevelTileRecord[] records = metadata.TileRecords ?? Array.Empty<GreyboxLevelTileRecord>();
            if (index < 0 || index >= records.Length) return false;
            record = records[index];
            fieldName = match.Groups[2].Value;
            return record != null;
        }

        private static bool IsTileRecordVisualProperty(string fieldName)
        {
            return fieldName == nameof(GreyboxLevelTileRecord.TileType)
                || fieldName == nameof(GreyboxLevelTileRecord.ColorHex)
                || fieldName == nameof(GreyboxLevelTileRecord.BlocksMovement);
        }

        private static bool SyncTileRecordPositionChange(GreyboxLevelTilemap metadata, Tilemap tilemap, GreyboxLevelTileRecord record)
        {
            if (!metadata || !tilemap || record == null) return false;
            Vector3Int currentCell = record.Position;
            Vector3Int? previousCell = FindPreviousCellForRecord(metadata, tilemap, record);
            Undo.RecordObject(metadata, "Greybox sync tile record position metadata");
            TileBase tile = tilemap.GetTile(currentCell)
                ?? (previousCell.HasValue ? tilemap.GetTile(previousCell.Value) : null)
                ?? FirstTileForRecord(metadata, record)
                ?? CreateTileForRecord(metadata, record);
            if (!tile) return false;

            Undo.RecordObject(tilemap, "Greybox sync tile record position");
            if (previousCell.HasValue && previousCell.Value != currentCell)
            {
                tilemap.SetTile(previousCell.Value, null);
                tilemap.RefreshTile(previousCell.Value);
            }
            tilemap.SetTile(currentCell, tile);
            tilemap.RefreshTile(currentCell);
            tilemap.CompressBounds();
            EditorUtility.SetDirty(tilemap);

            SyncTileRecordMarkerTransform(metadata, tilemap, record);
            UpdateTilemapMetadata(metadata, tilemap);
            EditorUtility.SetDirty(metadata);
            PrefabUtility.RecordPrefabInstancePropertyModifications(metadata);
            return true;
        }

        private static bool RefreshTileRecordCell(GreyboxLevelTilemap metadata, Tilemap tilemap, GreyboxLevelTileRecord record)
        {
            if (!metadata || !tilemap || record == null) return false;
            Undo.RecordObject(metadata, "Greybox sync tile record metadata");
            TileBase tile = CreateTileForRecord(metadata, record);
            if (!tile) return false;

            Undo.RecordObject(tilemap, "Greybox sync tile record field");
            tilemap.SetTile(record.Position, tile);
            tilemap.RefreshTile(record.Position);
            tilemap.CompressBounds();
            EditorUtility.SetDirty(tilemap);

            UpdateTilemapMetadata(metadata, tilemap);
            EditorUtility.SetDirty(metadata);
            PrefabUtility.RecordPrefabInstancePropertyModifications(metadata);
            return true;
        }

        private static Vector3Int? FindPreviousCellForRecord(GreyboxLevelTilemap metadata, Tilemap tilemap, GreyboxLevelTileRecord record)
        {
            if (!metadata || !tilemap || record == null) return null;
            TileBase expected = FirstTileForRecord(metadata, record);
            BoundsInt bounds = tilemap.cellBounds;
            Vector3Int? fallback = null;
            foreach (Vector3Int cell in bounds.allPositionsWithin)
            {
                if (cell == record.Position) continue;
                TileBase tile = tilemap.GetTile(cell);
                if (!tile || IsCellOwnedByAnotherRecord(metadata, record, cell)) continue;
                if (expected && tile == expected) return cell;
                if (!fallback.HasValue) fallback = cell;
            }
            return expected ? null : fallback;
        }

        private static bool IsCellOwnedByAnotherRecord(GreyboxLevelTilemap metadata, GreyboxLevelTileRecord target, Vector3Int cell)
        {
            foreach (GreyboxLevelTileRecord record in metadata.TileRecords ?? Array.Empty<GreyboxLevelTileRecord>())
            {
                if (record == null || ReferenceEquals(record, target)) continue;
                if (record.Position == cell) return true;
            }
            return false;
        }

        private static bool SyncTileRecordMarkerTransform(GreyboxLevelTilemap metadata, Tilemap tilemap, GreyboxLevelTileRecord record)
        {
            if (!metadata || record == null || string.IsNullOrWhiteSpace(record.TileId)) return false;
            GreyboxMarker marker = FindTileMarker(metadata, record.TileId);
            if (!marker) return false;
            Vector3 target = tilemap ? tilemap.CellToWorld(record.Position) : metadata.transform.TransformPoint(record.Position);
            if (marker.transform.position == target) return false;

            Undo.RecordObject(marker.transform, "Greybox sync tile marker position");
            marker.transform.position = target;
            EditorUtility.SetDirty(marker.transform);
            PrefabUtility.RecordPrefabInstancePropertyModifications(marker.transform);
            return true;
        }

        private static GreyboxMarker FindTileMarker(GreyboxLevelTilemap metadata, string tileId)
        {
            if (!metadata || string.IsNullOrWhiteSpace(tileId)) return null;
            foreach (GreyboxMarker marker in metadata.GetComponentsInChildren<GreyboxMarker>(true))
            {
                if (!marker) continue;
                if (!string.Equals(marker.Collection, "tiles", StringComparison.Ordinal)) continue;
                if (string.Equals(marker.MarkerId, tileId, StringComparison.Ordinal)) return marker;
            }
            return null;
        }

        private static TileBase CreateTileForRecord(GreyboxLevelTilemap metadata, GreyboxLevelTileRecord record)
        {
            if (!metadata || record == null) return null;
            string tileType = string.IsNullOrWhiteSpace(record.TileType) ? "tile" : record.TileType;
            string colorHex = string.IsNullOrWhiteSpace(record.ColorHex) ? ColorHexForTileType(tileType) : record.ColorHex;
            Color color = ColorUtility.TryParseHtmlString(colorHex, out Color parsed) ? parsed : ColorForTileType(tileType);
            Texture2D texture = new Texture2D(1, 1, TextureFormat.RGBA32, false);
            texture.name = $"Greybox {SafeTileName(tileType)} Tile Texture";
            texture.SetPixel(0, 0, color);
            texture.Apply(false, true);

            Sprite sprite = Sprite.Create(texture, new Rect(0f, 0f, texture.width, texture.height), new Vector2(0.5f, 0.5f), 1f);
            sprite.name = $"Greybox {SafeTileName(tileType)} Tile Sprite";

            var tile = ScriptableObject.CreateInstance<Tile>();
            tile.name = $"Greybox {SafeTileName(tileType)} Tile";
            tile.sprite = sprite;
            tile.color = Color.white;
            tile.colliderType = record.BlocksMovement ? Tile.ColliderType.Sprite : Tile.ColliderType.None;

            metadata.TileAssets = AppendGeneratedTileAsset(metadata.TileAssets, tile);
            metadata.TileTextures = AppendGeneratedTileAsset(metadata.TileTextures, texture);
            metadata.TileSprites = AppendGeneratedTileAsset(metadata.TileSprites, sprite);
            return tile;
        }

        private static T[] AppendGeneratedTileAsset<T>(T[] existing, T item) where T : UnityEngine.Object
        {
            if (!item) return existing ?? Array.Empty<T>();
            var values = new List<T>();
            foreach (T value in existing ?? Array.Empty<T>())
            {
                if (value) values.Add(value);
            }
            values.Add(item);
            return values.ToArray();
        }

        private static void UpdateTilemapMetadata(GreyboxLevelTilemap metadata, Tilemap tilemap)
        {
            if (!metadata) return;
            metadata.TileCount = (metadata.TileRecords ?? Array.Empty<GreyboxLevelTileRecord>()).Count(item => item != null);
            if (!tilemap) return;
            BoundsInt bounds = tilemap.cellBounds;
            metadata.BoundsOrigin = bounds.position;
            metadata.BoundsSize = bounds.size;
        }

        private static Color ColorForTileType(string tileType)
        {
            return ColorUtility.TryParseHtmlString(ColorHexForTileType(tileType), out Color color) ? color : Color.gray;
        }

        private static string ColorHexForTileType(string tileType)
        {
            if (LooksLikeTileType(tileType, "hazard", "lava", "spike", "damage")) return "#E94B3CFF";
            if (LooksLikeTileType(tileType, "wall", "block", "solid", "rock", "door", "gate")) return "#1A1A1FFF";
            if (LooksLikeTileType(tileType, "exit", "goal", "finish")) return "#2ECC71FF";
            if (LooksLikeTileType(tileType, "spawn", "start", "checkpoint")) return "#3CC2E0FF";
            return "#5C6166FF";
        }

        private static bool LooksLikeTileType(string value, params string[] fragments)
        {
            if (string.IsNullOrWhiteSpace(value)) return false;
            foreach (string fragment in fragments)
            {
                if (value.IndexOf(fragment, StringComparison.OrdinalIgnoreCase) >= 0) return true;
            }
            return false;
        }

        private static string SafeTileName(string value)
        {
            string clean = new string((value ?? "tile")
                .Where(c => char.IsLetterOrDigit(c) || c == '-' || c == '_' || c == ' ')
                .Take(64)
                .ToArray()).Trim();
            return string.IsNullOrWhiteSpace(clean) ? "Tile" : clean;
        }

        private static GreyboxLevelTileRecord FindTileRecord(GreyboxLevelTilemap metadata, string tileId)
        {
            if (!metadata || string.IsNullOrWhiteSpace(tileId)) return null;
            foreach (GreyboxLevelTileRecord record in metadata.TileRecords ?? Array.Empty<GreyboxLevelTileRecord>())
            {
                if (record == null) continue;
                if (string.Equals(record.TileId, tileId, StringComparison.Ordinal)) return record;
            }
            return null;
        }

        private static TileBase FirstTileForRecord(GreyboxLevelTilemap metadata, GreyboxLevelTileRecord record)
        {
            if (!metadata) return null;
            GreyboxLevelTileRecord[] records = metadata.TileRecords ?? Array.Empty<GreyboxLevelTileRecord>();
            TileBase[] tiles = metadata.TileAssets ?? Array.Empty<TileBase>();
            int count = Math.Min(records.Length, tiles.Length);
            for (int index = 0; index < count; index++)
            {
                if (!tiles[index] || records[index] == null) continue;
                if (string.Equals(records[index].TileId, record.TileId, StringComparison.Ordinal)) return tiles[index];
            }
            foreach (TileBase tile in tiles)
            {
                if (tile) return tile;
            }
            return null;
        }

        private static bool IsLocalScaleChange(string propertyPath)
        {
            return !string.IsNullOrEmpty(propertyPath)
                && (propertyPath == "m_LocalScale" || propertyPath.StartsWith("m_LocalScale.", StringComparison.Ordinal));
        }

        private static bool IsLocalRotationChange(string propertyPath)
        {
            return !string.IsNullOrEmpty(propertyPath)
                && (propertyPath == "m_LocalRotation" || propertyPath.StartsWith("m_LocalRotation.", StringComparison.Ordinal));
        }

        private static void UpdateDesignNodeTransformMetadata(Transform transform, string propertyPath)
        {
            if (!transform) return;
            var designNode = transform.GetComponentInParent<GreyboxDesignNode>();
            if (!designNode) return;
            bool changed = false;
            if (IsLocalPositionChange(propertyPath))
            {
                designNode.AuthoredPosition = transform.localPosition;
                changed = true;
            }
            if (IsLocalScaleChange(propertyPath))
            {
                designNode.AuthoredScale = transform.localScale;
                changed = true;
            }
            if (IsLocalRotationChange(propertyPath))
            {
                designNode.AuthoredRotationEuler = transform.localEulerAngles;
                changed = true;
            }
            if (!changed) return;
            EditorUtility.SetDirty(designNode);
            PrefabUtility.RecordPrefabInstancePropertyModifications(designNode);
        }
    }
}
