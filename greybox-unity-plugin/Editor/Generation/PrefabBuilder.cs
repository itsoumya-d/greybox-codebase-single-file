// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using Newtonsoft.Json.Linq;
using Greybox.Editor.Sync;
using Greybox.Runtime;
using Newtonsoft.Json;
using UnityEditor;
using UnityEngine;
using UnityEngine.Tilemaps;

namespace Greybox.Editor.Generation
{
    public static class PrefabBuilder
    {
        private const int MaxJsonPathSelectorValueLength = 160;
        private const int MaxMarkerIdLength = 80;
        private const int MaxUnityObjectNameLength = 120;
        private const int MaxDisplayNameLength = 160;
        private const int MaxSourcePathLength = 512;
        private const int MaxDesignNodeTags = 16;
        private const int MaxDesignNodeProperties = 64;
        private const int MaxDesignNodeTagLength = 80;
        private const int MaxDesignPropertyKeyLength = 80;
        private const int MaxDesignPropertyValueLength = 2048;
        private const int MaxDesignNodeSourceJsonLength = 8192;
        private const int MaxRuntimeStringLength = 160;
        private const int MaxRuntimeStringArrayItems = 64;

        private sealed class MaterialContext
        {
            public static readonly MaterialContext Empty = new MaterialContext(null, "");

            public MaterialContext(GreyboxArtBiblePalette palette, string paletteAssetPath)
            {
                Palette = palette;
                PaletteAssetPath = paletteAssetPath ?? "";
            }

            public GreyboxArtBiblePalette Palette { get; }
            public string PaletteAssetPath { get; }
        }

        public static GameObject BuildFromGameViewport(JObject document, string sourcePath)
        {
            string sourceFileName = SourceFileName(document, sourcePath);
            MaterialContext materialContext = CreateMaterialContext(document);
            var root = new GameObject(SafeName(document.Value<string>("title") ?? System.IO.Path.GetFileName(sourcePath)));
            Stamp(root, GreyboxArtifactKind.GameViewport, sourcePath, sourceFileName, "root", "", root.name, "$", "");
            AttachGameViewport(root, document);
            BuildCamera(root.transform, sourcePath, sourceFileName, document["camera"] as JObject);
            BuildCollection(root.transform, sourcePath, sourceFileName, GreyboxArtifactKind.GameViewport, "actors", "Actors", document["actors"] as JArray, Color.cyan, PrimitiveType.Capsule, materialContext);
            BuildCollection(root.transform, sourcePath, sourceFileName, GreyboxArtifactKind.GameViewport, "spawnPoints", "Spawn Points", document["spawnPoints"] as JArray, Color.green, PrimitiveType.Sphere, materialContext);
            BuildCollection(root.transform, sourcePath, sourceFileName, GreyboxArtifactKind.GameViewport, "objectives", "Objectives", document["objectives"] as JArray, Color.yellow, PrimitiveType.Cylinder, materialContext);
            BuildCollection(root.transform, sourcePath, sourceFileName, GreyboxArtifactKind.GameViewport, "hazards", "Hazards", document["hazards"] as JArray, Color.red, PrimitiveType.Cube, materialContext);
            return root;
        }

        public static GameObject BuildLevelBoard(JObject document, string sourcePath)
        {
            string sourceFileName = SourceFileName(document, sourcePath);
            MaterialContext materialContext = CreateMaterialContext(document);
            var root = new GameObject(SafeName(document.Value<string>("title") ?? System.IO.Path.GetFileName(sourcePath)));
            Stamp(root, GreyboxArtifactKind.LevelBoard, sourcePath, sourceFileName, "root", "", root.name, "$", "");
            AttachLevelBoard(root, document);
            Dictionary<string, Transform> rooms = BuildCollection(root.transform, sourcePath, sourceFileName, GreyboxArtifactKind.LevelBoard, "rooms", "Rooms", document["rooms"] as JArray, new Color(0.28f, 0.55f, 0.75f), PrimitiveType.Cube, materialContext);
            BuildCollection(root.transform, sourcePath, sourceFileName, GreyboxArtifactKind.LevelBoard, "encounters", "Encounters", document["encounters"] as JArray, new Color(1f, 0.42f, 0.21f), PrimitiveType.Capsule, materialContext);
            BuildLevelConnections(root.transform, sourcePath, sourceFileName, document, rooms, materialContext);
            BuildLevelTilemap(root.transform, sourcePath, sourceFileName, document);
            return root;
        }

        public static TileBase[] CollectGeneratedTileAssets(GameObject root)
        {
            if (!root) return Array.Empty<TileBase>();
            var result = new List<TileBase>();
            foreach (GreyboxLevelTilemap tilemap in root.GetComponentsInChildren<GreyboxLevelTilemap>(true))
            {
                foreach (TileBase tile in tilemap.TileAssets ?? Array.Empty<TileBase>())
                {
                    if (tile && !result.Contains(tile)) result.Add(tile);
                }
            }
            return result.ToArray();
        }

        public static Sprite[] CollectGeneratedTileSprites(GameObject root)
        {
            if (!root) return Array.Empty<Sprite>();
            var result = new List<Sprite>();
            foreach (GreyboxLevelTilemap tilemap in root.GetComponentsInChildren<GreyboxLevelTilemap>(true))
            {
                foreach (Sprite sprite in tilemap.TileSprites ?? Array.Empty<Sprite>())
                {
                    if (sprite && !result.Contains(sprite)) result.Add(sprite);
                }
            }
            return result.ToArray();
        }

        public static Texture2D[] CollectGeneratedTileTextures(GameObject root)
        {
            if (!root) return Array.Empty<Texture2D>();
            var result = new List<Texture2D>();
            foreach (GreyboxLevelTilemap tilemap in root.GetComponentsInChildren<GreyboxLevelTilemap>(true))
            {
                foreach (Texture2D texture in tilemap.TileTextures ?? Array.Empty<Texture2D>())
                {
                    if (texture && !result.Contains(texture)) result.Add(texture);
                }
            }
            return result.ToArray();
        }

        public static Material[] CollectGeneratedMaterials(GameObject root)
        {
            if (!root) return Array.Empty<Material>();
            var result = new List<Material>();
            foreach (Renderer renderer in root.GetComponentsInChildren<Renderer>(true))
            {
                foreach (Material material in renderer.sharedMaterials ?? Array.Empty<Material>())
                {
                    if (!material || EditorUtility.IsPersistent(material) || result.Contains(material)) continue;
                    result.Add(material);
                }
            }
            return result.ToArray();
        }

        private static void BuildCamera(Transform parent, string sourcePath, string sourceFileName, JObject cameraDocument)
        {
            if (cameraDocument == null) return;

            var go = new GameObject("Greybox Camera");
            go.transform.SetParent(parent, false);
            string mode = ReadString(cameraDocument, "mode", "cameraMode", "type");
            go.transform.localPosition = ReadCameraPosition(cameraDocument, mode);
            var camera = go.AddComponent<Camera>();
            camera.orthographic = ReadBool(cameraDocument, true, "orthographic", "isOrthographic");
            camera.orthographicSize = Mathf.Max(0.1f, ReadFloat(cameraDocument, 7.5f, "orthographicSize", "size", "zoom"));
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = ReadColor(cameraDocument, new Color(0.06f, 0.07f, 0.08f, 1f));
            camera.nearClipPlane = Mathf.Max(0.01f, ReadFloat(cameraDocument, 0.1f, "nearClipPlane", "near"));
            camera.farClipPlane = Mathf.Max(camera.nearClipPlane + 1f, ReadFloat(cameraDocument, 1000f, "farClipPlane", "far"));

            var rig = go.AddComponent<GreyboxCameraRig>();
            rig.Mode = mode;
            rig.Orthographic = camera.orthographic;
            rig.OrthographicSize = camera.orthographicSize;
            rig.AuthoredPosition = go.transform.localPosition;
            rig.BackgroundColor = camera.backgroundColor;
            rig.JsonPath = "$.camera";

            Stamp(go, GreyboxArtifactKind.GameViewport, sourcePath, sourceFileName, "camera", "camera", "Greybox Camera", "$.camera", "$.camera.position", "", "", "Camera");
            AttachDesignNode(go, GreyboxArtifactKind.GameViewport, "camera", "camera", "Greybox Camera", "$.camera", cameraDocument);
        }

        private static Dictionary<string, Transform> BuildCollection(Transform parent, string sourcePath, string sourceFileName, GreyboxArtifactKind kind, string collection, string name, JArray items, Color color, PrimitiveType defaultPrimitive, MaterialContext materialContext)
        {
            var transformsById = new Dictionary<string, Transform>(StringComparer.OrdinalIgnoreCase);
            var group = new GameObject(name);
            group.transform.SetParent(parent, false);
            Stamp(group, kind, sourcePath, sourceFileName, collection, "", name, $"$.{collection}", "");
            if (items == null) return transformsById;
            Dictionary<string, int> pathKeyCounts = CountPathKeys(items);
            var usedMarkerIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var usedObjectNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            for (int index = 0; index < items.Count; index++)
            {
                var item = items[index] as JObject;
                if (item == null) continue;
                string markerId = UniqueMarkerId(MarkerId(item), usedMarkerIds);
                string markerName = MarkerDisplayName(item, markerId);
                string itemPath = ItemJsonPath(collection, item, index, pathKeyCounts);
                NodeVisual visual = CreateNodeVisual(item, defaultPrimitive);
                var go = visual.GameObject;
                go.name = UniqueObjectName(markerName ?? "Greybox Node", usedObjectNames);
                go.transform.SetParent(group.transform, false);
                go.transform.localPosition = ReadVector3(item);
                go.transform.localEulerAngles = ReadRotationEuler(item);
                go.transform.localScale = ReadScale(item);
                Stamp(go, kind, sourcePath, sourceFileName, collection, markerId, markerName, itemPath, PositionJsonPath(itemPath, item), visual.UnityAssetPath, visual.UnityAssetGuid, visual.Primitive);
                AttachDesignNode(go, kind, collection, markerId, markerName, itemPath, item);
                AttachRuntimeComponent(go, collection, markerId, markerName, item);
                ApplyNodeMaterials(go, item, color, markerName ?? name, visual.ApplyFallbackMaterial, materialContext);
                Collider[] colliders = ApplyAuthoredCollider(go, item, visual.Primitive);
                ApplyAuthoredPhysics(go, item, colliders);
                ApplyUnityObjectMetadata(go, item);
                if (!string.IsNullOrWhiteSpace(markerId)) transformsById[markerId] = go.transform;
            }

            return transformsById;
        }

        private static void BuildLevelConnections(Transform parent, string sourcePath, string sourceFileName, JObject document, Dictionary<string, Transform> rooms, MaterialContext materialContext)
        {
            if (rooms.Count == 0) return;
            var group = new GameObject("Connections");
            group.transform.SetParent(parent, false);
            Stamp(group, GreyboxArtifactKind.LevelBoard, sourcePath, sourceFileName, "connections", "", "Connections", "$.connections", "");

            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var usedConnectionMarkerIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var usedConnectionObjectNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            JArray roomDocuments = document["rooms"] as JArray;
            JArray connectionDocuments = document["connections"] as JArray ?? document["links"] as JArray;
            Dictionary<string, int> roomPathKeyCounts = CountPathKeys(roomDocuments);
            Dictionary<string, int> connectionPathKeyCounts = CountPathKeys(connectionDocuments);
            BuildRoomLinkConnections(group.transform, sourcePath, sourceFileName, roomDocuments, rooms, seen, roomPathKeyCounts, usedConnectionMarkerIds, usedConnectionObjectNames, materialContext);
            BuildExplicitConnections(group.transform, sourcePath, sourceFileName, connectionDocuments, rooms, seen, connectionPathKeyCounts, usedConnectionMarkerIds, usedConnectionObjectNames, materialContext);

            if (group.transform.childCount == 0) UnityEngine.Object.DestroyImmediate(group);
            else
            {
                var board = parent.GetComponent<GreyboxLevelBoard>();
                if (board) board.ConnectionCount = group.transform.childCount;
            }
        }

        private static void BuildLevelTilemap(Transform parent, string sourcePath, string sourceFileName, JObject document)
        {
            JArray tiles = TileDocuments(document, out string tilePath);
            if (tiles == null || tiles.Count == 0) return;

            var gridObject = new GameObject("Tilemap Grid", typeof(Grid));
            gridObject.transform.SetParent(parent, false);
            var grid = gridObject.GetComponent<Grid>();
            grid.cellSize = ReadTilemapCellSize(document);
            MarkGeneratedComponent(grid);
            Stamp(gridObject, GreyboxArtifactKind.LevelBoard, sourcePath, sourceFileName, "tilemap", "tilemap", "Tilemap Grid", tilePath, "");

            var tilemapObject = new GameObject("Tiles", typeof(Tilemap), typeof(TilemapRenderer), typeof(GreyboxLevelTilemap));
            tilemapObject.transform.SetParent(gridObject.transform, false);
            var tilemap = tilemapObject.GetComponent<Tilemap>();
            var tilemapRenderer = tilemapObject.GetComponent<TilemapRenderer>();
            var metadata = tilemapObject.GetComponent<GreyboxLevelTilemap>();
            metadata.BoardId = ReadString(document, "id", "boardId", "slug");
            metadata.SourceJsonPath = tilePath;
            MarkGeneratedComponent(tilemap);
            MarkGeneratedComponent(tilemapRenderer);
            Stamp(tilemapObject, GreyboxArtifactKind.LevelBoard, sourcePath, sourceFileName, "tiles", "tiles", "Tiles", tilePath, "");
            ApplyTilemapCollision(tilemapObject, metadata, document);

            var tileAssetsByKey = new Dictionary<string, Tile>(StringComparer.Ordinal);
            var tileAssets = new List<TileBase>();
            var tileTextures = new List<Texture2D>();
            var tileSprites = new List<Sprite>();
            var tileRecords = new List<GreyboxLevelTileRecord>();
            Dictionary<string, int> tilePathKeyCounts = CountPathKeys(tiles);
            string tileCollectionPath = CollectionPathFromJsonPath(tilePath, "tiles");
            Vector3Int? min = null;
            Vector3Int? max = null;
            for (int index = 0; index < tiles.Count; index++)
            {
                var tileDocument = tiles[index] as JObject;
                if (tileDocument == null) continue;
                Vector3Int position = ReadTilePosition(tileDocument);
                string tileType = ReadString(tileDocument, "tileType", "type", "kind", "terrain", "id");
                if (string.IsNullOrWhiteSpace(tileType)) tileType = "tile";
                Color color = ReadColor(tileDocument, TileColorFor(tileType));
                string colorHex = $"#{ColorUtility.ToHtmlStringRGBA(color)}";
                TileSemantics semantics = ReadTileSemantics(tileDocument, tileType);
                string key = $"{tileType}|{colorHex}|{semantics.BlocksMovement}";
                if (!tileAssetsByKey.TryGetValue(key, out Tile tile))
                {
                    tile = ScriptableObject.CreateInstance<Tile>();
                    tile.name = $"Greybox {SafeName(tileType)} Tile";
                    tile.color = color;
                    tile.colliderType = semantics.BlocksMovement ? Tile.ColliderType.Sprite : Tile.ColliderType.None;
                    Texture2D texture = CreateTileTexture(tileType);
                    Sprite sprite = CreateTileSprite(tileType, texture);
                    tile.sprite = sprite;
                    tileAssetsByKey[key] = tile;
                    tileAssets.Add(tile);
                    tileTextures.Add(texture);
                    tileSprites.Add(sprite);
                }
                tilemap.SetTile(position, tile);
                tileRecords.Add(new GreyboxLevelTileRecord
                {
                    TileId = MarkerId(tileDocument),
                    TileType = tileType,
                    SourceJsonPath = ItemJsonPath(tileCollectionPath, tileDocument, index, tilePathKeyCounts),
                    Position = position,
                    ColorHex = colorHex,
                    Walkable = semantics.Walkable,
                    BlocksMovement = semantics.BlocksMovement,
                    IsSpawn = semantics.IsSpawn,
                    IsExit = semantics.IsExit,
                    IsHazard = semantics.IsHazard
                });
                min = Min(min, position);
                max = Max(max, position);
            }

            metadata.TileRecords = tileRecords.ToArray();
            metadata.TileCount = tileRecords.Count;
            metadata.TileAssets = tileAssets.ToArray();
            metadata.TileTextures = tileTextures.ToArray();
            metadata.TileSprites = tileSprites.ToArray();
            if (min.HasValue && max.HasValue)
            {
                metadata.BoundsOrigin = min.Value;
                metadata.BoundsSize = max.Value - min.Value + Vector3Int.one;
            }
            tilemap.CompressBounds();
        }

        private static Texture2D CreateTileTexture(string tileType)
        {
            var texture = new Texture2D(1, 1, TextureFormat.RGBA32, false);
            texture.name = $"Greybox {SafeName(tileType)} Tile Texture";
            texture.SetPixel(0, 0, Color.white);
            texture.Apply(false, true);
            return texture;
        }

        private static Sprite CreateTileSprite(string tileType, Texture2D texture)
        {
            var sprite = Sprite.Create(texture, new Rect(0f, 0f, texture.width, texture.height), new Vector2(0.5f, 0.5f), 1f);
            sprite.name = $"Greybox {SafeName(tileType)} Tile Sprite";
            return sprite;
        }

        private static void ApplyTilemapCollision(GameObject tilemapObject, GreyboxLevelTilemap metadata, JObject document)
        {
            if (!ReadTilemapCollisionFlag(document, "collider", "collision", "hasCollider", "physicsCollider")) return;
            var tilemapCollider = tilemapObject.AddComponent<TilemapCollider2D>();
            MarkGeneratedComponent(tilemapCollider);
            metadata.ColliderEnabled = true;

            if (!ReadTilemapCollisionFlag(document, "compositeCollider", "composite", "useCompositeCollider")) return;
            var body = tilemapObject.AddComponent<Rigidbody2D>();
            body.bodyType = RigidbodyType2D.Static;
            var composite = tilemapObject.AddComponent<CompositeCollider2D>();
            MarkGeneratedComponent(body);
            MarkGeneratedComponent(composite);
            tilemapCollider.usedByComposite = true;
            metadata.CompositeColliderEnabled = true;
        }

        private static void BuildRoomLinkConnections(Transform parent, string sourcePath, string sourceFileName, JArray roomDocuments, Dictionary<string, Transform> rooms, HashSet<string> seen, Dictionary<string, int> roomPathKeyCounts, HashSet<string> usedConnectionMarkerIds, HashSet<string> usedConnectionObjectNames, MaterialContext materialContext)
        {
            if (roomDocuments == null) return;
            for (int roomIndex = 0; roomIndex < roomDocuments.Count; roomIndex++)
            {
                var room = roomDocuments[roomIndex] as JObject;
                if (room == null) continue;
                string fromRoomId = MarkerId(room);
                if (string.IsNullOrWhiteSpace(fromRoomId) || !rooms.ContainsKey(fromRoomId)) continue;
                JArray links = FirstArray(room, "connectedRoomIds", "connections", "connectedRooms", "links", "exits");
                if (links == null) continue;
                for (int linkIndex = 0; linkIndex < links.Count; linkIndex++)
                {
                    JToken link = links[linkIndex];
                    string toRoomId = SafeMarkerId(ReadConnectionTarget(link));
                    if (string.IsNullOrWhiteSpace(toRoomId) || !rooms.ContainsKey(toRoomId)) continue;
                    string jsonPath = $"{ItemJsonPath("rooms", room, roomIndex, roomPathKeyCounts)}.connections[{linkIndex}]";
                    CreateLevelConnection(parent, sourcePath, sourceFileName, rooms, seen, fromRoomId, toRoomId, link as JObject, jsonPath, usedConnectionMarkerIds, usedConnectionObjectNames, materialContext);
                }
            }
        }

        private static void BuildExplicitConnections(Transform parent, string sourcePath, string sourceFileName, JArray connections, Dictionary<string, Transform> rooms, HashSet<string> seen, Dictionary<string, int> connectionPathKeyCounts, HashSet<string> usedConnectionMarkerIds, HashSet<string> usedConnectionObjectNames, MaterialContext materialContext)
        {
            if (connections == null) return;
            for (int index = 0; index < connections.Count; index++)
            {
                var connection = connections[index] as JObject;
                if (connection == null) continue;
                string fromRoomId = SafeMarkerId(ReadString(connection, "fromRoomId", "from", "sourceRoomId", "source"));
                string toRoomId = SafeMarkerId(ReadString(connection, "toRoomId", "to", "targetRoomId", "target"));
                if (string.IsNullOrWhiteSpace(fromRoomId) || string.IsNullOrWhiteSpace(toRoomId)) continue;
                if (!rooms.ContainsKey(fromRoomId) || !rooms.ContainsKey(toRoomId)) continue;
                CreateLevelConnection(parent, sourcePath, sourceFileName, rooms, seen, fromRoomId, toRoomId, connection, ItemJsonPath("connections", connection, index, connectionPathKeyCounts), usedConnectionMarkerIds, usedConnectionObjectNames, materialContext);
            }
        }

        private static void CreateLevelConnection(Transform parent, string sourcePath, string sourceFileName, Dictionary<string, Transform> rooms, HashSet<string> seen, string fromRoomId, string toRoomId, JObject item, string jsonPath, HashSet<string> usedConnectionMarkerIds, HashSet<string> usedConnectionObjectNames, MaterialContext materialContext)
        {
            string key = ConnectionKey(fromRoomId, toRoomId);
            if (!seen.Add(key)) return;
            string markerId = ReadString(item ?? new JObject(), "id", "connectionId");
            if (string.IsNullOrWhiteSpace(markerId)) markerId = $"{fromRoomId}->{toRoomId}";
            markerId = UniqueMarkerId(markerId, usedConnectionMarkerIds);
            string markerName = SafeDisplayName(ReadString(item ?? new JObject(), "name", "label"));
            if (string.IsNullOrWhiteSpace(markerName)) markerName = $"{fromRoomId} to {toRoomId}";

            var go = new GameObject(UniqueObjectName(markerName, usedConnectionObjectNames), typeof(LineRenderer));
            go.transform.SetParent(parent, false);
            var line = go.GetComponent<LineRenderer>();
            line.useWorldSpace = false;
            line.positionCount = 2;
            JObject connectionItem = item ?? new JObject();
            line.startWidth = Mathf.Max(0.01f, ReadFloat(connectionItem, 0.08f, "width", "lineWidth"));
            line.endWidth = line.startWidth;
            Material connectionMaterial = ResolveMaterialAsset(connectionItem);
            if (!connectionMaterial && !HasAuthoredColorOverride(connectionItem)) connectionMaterial = ResolvePaletteMaterial(connectionItem, materialContext);
            line.sharedMaterial = connectionMaterial
                ? connectionMaterial
                : MaterialBuilder.Colored(ReadColor(connectionItem, new Color(0.78f, 0.82f, 0.86f, 0.9f)), $"Greybox {SafeName(markerName)} Connection");
            line.SetPosition(0, rooms[fromRoomId].localPosition);
            line.SetPosition(1, rooms[toRoomId].localPosition);

            Stamp(go, GreyboxArtifactKind.LevelBoard, sourcePath, sourceFileName, "connections", markerId, markerName, jsonPath, "");
            AttachLevelConnection(go, markerId, markerName, item, fromRoomId, toRoomId);
        }

        private static void Stamp(GameObject go, GreyboxArtifactKind kind, string sourcePath, string sourceFileName, string collection, string markerId, string markerName, string jsonPath, string positionJsonPath, string unityAssetPath = "", string unityAssetGuid = "", string primitive = "")
        {
            var marker = go.AddComponent<GreyboxMarker>();
            marker.ArtifactKind = kind;
            marker.SourcePath = SafeSourcePath(sourcePath);
            marker.SourceFileName = sourceFileName ?? System.IO.Path.GetFileName(sourcePath ?? "");
            marker.Collection = collection ?? "";
            marker.MarkerId = markerId ?? "";
            marker.MarkerName = markerName ?? "";
            marker.JsonPath = jsonPath ?? "";
            marker.PositionJsonPath = positionJsonPath ?? "";
            marker.UnityAssetPath = unityAssetPath ?? "";
            marker.UnityAssetGuid = unityAssetGuid ?? "";
            marker.Primitive = primitive ?? "";
        }

        private static void AttachDesignNode(GameObject go, GreyboxArtifactKind kind, string collection, string markerId, string markerName, string jsonPath, JObject item)
        {
            var node = go.GetComponent<GreyboxDesignNode>() ?? go.AddComponent<GreyboxDesignNode>();
            node.ArtifactKind = kind;
            node.Collection = collection ?? "";
            node.NodeId = markerId ?? "";
            node.DisplayName = markerName ?? "";
            node.JsonPath = jsonPath ?? "";
            node.AuthoredPosition = ReadVector3(item);
            node.AuthoredRotationEuler = ReadRotationEuler(item);
            node.AuthoredScale = ReadScale(item);
            node.SourceJson = BoundedSourceJson(item);
            node.Tags = ReadTags(item);
            node.Properties = ReadProperties(item);
        }

        private static void AttachRuntimeComponent(GameObject go, string collection, string markerId, string markerName, JObject item)
        {
            switch (collection)
            {
                case "actors":
                    AttachActorDefinition(go, markerId, markerName, item);
                    break;
                case "spawnPoints":
                    AttachSpawnPoint(go, markerId, markerName, item);
                    break;
                case "objectives":
                    AttachObjective(go, markerId, markerName, item);
                    break;
                case "hazards":
                    AttachHazard(go, markerId, markerName, item);
                    break;
                case "rooms":
                    AttachLevelRoom(go, markerId, markerName, item);
                    break;
                case "encounters":
                    AttachEncounter(go, markerId, markerName, item);
                    break;
            }
        }

        private static void AttachGameViewport(GameObject go, JObject document)
        {
            var viewport = go.GetComponent<GreyboxGameViewport>() ?? go.AddComponent<GreyboxGameViewport>();
            viewport.ViewportId = SafeMarkerId(ReadString(document, "id", "viewportId", "slug"));
            viewport.DisplayName = SafeRuntimeString(document.Value<string>("title") ?? ReadString(document, "name"));
            viewport.Theme = ReadRuntimeString(document, "theme", "biome", "style", "artBible");
            viewport.TargetEngine = ReadRuntimeString(document, "targetEngine", "engine", "runtime");
            viewport.CameraMode = document["camera"] is JObject camera ? ReadRuntimeString(camera, "mode", "cameraMode", "type") : "";
            viewport.ActorCount = CountObjectItems(document["actors"] as JArray);
            viewport.SpawnPointCount = CountObjectItems(document["spawnPoints"] as JArray);
            viewport.ObjectiveCount = CountObjectItems(document["objectives"] as JArray);
            viewport.HazardCount = CountObjectItems(document["hazards"] as JArray);
        }

        private static void AttachLevelBoard(GameObject go, JObject document)
        {
            var board = go.GetComponent<GreyboxLevelBoard>() ?? go.AddComponent<GreyboxLevelBoard>();
            board.BoardId = SafeMarkerId(ReadString(document, "id", "boardId", "slug"));
            board.DisplayName = SafeRuntimeString(document.Value<string>("title") ?? ReadString(document, "name"));
            board.Theme = ReadRuntimeString(document, "theme", "biome", "tileset");
            board.RoomCount = CountObjectItems(document["rooms"] as JArray);
            board.EncounterCount = CountObjectItems(document["encounters"] as JArray);
            board.TileCount = CountObjectItems(TileDocuments(document, out _));
        }

        private static void AttachActorDefinition(GameObject go, string markerId, string markerName, JObject item)
        {
            var actor = go.GetComponent<GreyboxActorDefinition>() ?? go.AddComponent<GreyboxActorDefinition>();
            string role = ReadRuntimeString(item, "role", "actorType", "type");
            actor.ActorId = markerId ?? "";
            actor.DisplayName = markerName ?? "";
            actor.Role = role;
            actor.Faction = ReadRuntimeString(item, "faction", "team", "allegiance");
            actor.Behavior = ReadRuntimeString(item, "behavior", "aiBehavior", "controller", "stateMachine");
            actor.AbilityIds = ReadRuntimeStringArray(item, "abilityIds", "abilities", "skills", "actions");
            actor.PatrolPointIds = ReadMarkerIdArray(item, "patrolPointIds", "patrolPoints", "patrolRoute", "waypoints");
            actor.LootTableId = SafeMarkerId(ReadString(item, "lootTableId", "lootTable", "dropTableId", "dropTable"));
            actor.Health = Mathf.Max(1, ReadInt(item, 1, "health", "hp", "hitPoints"));
            actor.MoveSpeed = Mathf.Max(0f, ReadFloat(item, 1f, "moveSpeed", "speed", "walkSpeed"));
            actor.JumpImpulse = Mathf.Max(0f, ReadFloat(item, 0f, "jumpImpulse", "jumpForce", "jumpHeight"));
            actor.Damage = Mathf.Max(0, ReadInt(item, 1, "damage", "attackDamage", "contactDamage"));
            actor.AttackRange = Mathf.Max(0f, ReadFloat(item, 1f, "attackRange", "range"));
            actor.PatrolRadius = Mathf.Max(0f, ReadFloat(item, 0f, "patrolRadius", "patrolDistance", "wanderRadius"));
            actor.AttackCooldownSeconds = Mathf.Max(0.01f, ReadFloat(item, 1f, "attackCooldownSeconds", "attackCooldown", "cooldownSeconds"));
            actor.AggroRadius = Mathf.Max(0f, ReadFloat(item, 5f, "aggroRadius", "detectionRadius", "sightRadius"));
            actor.IsPlayerControlled = ReadBool(item, IsPlayerRole(role), "isPlayerControlled", "playerControlled", "playable");
            actor.IsEnemy = ReadBool(item, IsEnemyRole(role) || ReadBool(item, false, "hostile"), "isEnemy", "enemy");
        }

        private static void AttachSpawnPoint(GameObject go, string markerId, string markerName, JObject item)
        {
            var spawn = go.GetComponent<GreyboxSpawnPoint>() ?? go.AddComponent<GreyboxSpawnPoint>();
            spawn.SpawnId = markerId ?? "";
            spawn.DisplayName = markerName ?? "";
            spawn.SpawnGroup = ReadRuntimeString(item, "spawnGroup", "group", "team");
            spawn.ActorIds = ReadMarkerIdArray(item, "actorIds", "actors", "prefabIds", "spawnActorIds", "spawnables");
            spawn.MaxCount = Mathf.Max(1, ReadInt(item, 1, "maxCount", "count", "limit", "spawnCount"));
            spawn.CooldownSeconds = Mathf.Max(0f, ReadFloat(item, 0f, "cooldownSeconds", "spawnCooldown", "cooldown"));
            spawn.SpawnOnStart = ReadBool(item, true, "spawnOnStart", "autoSpawn", "initialSpawn");
            spawn.SpawnRadius = Mathf.Max(0.05f, ReadFloat(item, 0.5f, "spawnRadius", "radius"));
            spawn.IsCheckpoint = ReadBool(item, LooksLikeCheckpoint(markerId) || LooksLikeCheckpoint(markerName), "checkpoint", "isCheckpoint");
        }

        private static void AttachObjective(GameObject go, string markerId, string markerName, JObject item)
        {
            var objective = go.GetComponent<GreyboxObjective>() ?? go.AddComponent<GreyboxObjective>();
            objective.ObjectiveId = markerId ?? "";
            objective.DisplayName = markerName ?? "";
            objective.ObjectiveType = ReadRuntimeString(item, "objectiveType", "type", "role");
            if (string.IsNullOrWhiteSpace(objective.ObjectiveType)) objective.ObjectiveType = "objective";
            objective.TargetIds = ReadMarkerIdArray(item, "targetIds", "targets", "targetActors", "targetRooms", "targetObjects");
            objective.Reward = ReadRuntimeString(item, "reward", "rewardId", "unlock", "completionReward");
            objective.TimeLimitSeconds = Mathf.Max(0f, ReadFloat(item, 0f, "timeLimitSeconds", "timeLimit", "timerSeconds"));
            objective.RequiredCount = Mathf.Max(1, ReadInt(item, 1, "requiredCount", "count", "targetCount"));
            objective.IsPrimary = ReadBool(item, LooksLikePrimaryObjective(markerId) || LooksLikePrimaryObjective(markerName), "primary", "isPrimary");
        }

        private static void AttachHazard(GameObject go, string markerId, string markerName, JObject item)
        {
            var hazard = go.GetComponent<GreyboxHazard>() ?? go.AddComponent<GreyboxHazard>();
            hazard.HazardId = markerId ?? "";
            hazard.DisplayName = markerName ?? "";
            hazard.HazardType = ReadRuntimeString(item, "hazardType", "type", "role");
            if (string.IsNullOrWhiteSpace(hazard.HazardType)) hazard.HazardType = "hazard";
            hazard.Effect = ReadRuntimeString(item, "effect", "statusEffect", "debuff", "applies");
            hazard.Damage = Mathf.Max(0f, ReadFloat(item, 1f, "damage", "dps", "tickDamage"));
            hazard.TickSeconds = Mathf.Max(0.01f, ReadFloat(item, 1f, "tickSeconds", "tickRate", "intervalSeconds"));
            hazard.Radius = Mathf.Max(0.05f, ReadFloat(item, 1f, "hazardRadius", "radius"));
            hazard.Knockback = Mathf.Max(0f, ReadFloat(item, 0f, "knockback", "pushForce", "impulse"));
            hazard.AffectedTags = ReadRuntimeStringArray(item, "affectedTags", "targets", "targetTags");
            hazard.IsLethal = ReadBool(item, false, "lethal", "isLethal");
        }

        private static void AttachLevelRoom(GameObject go, string markerId, string markerName, JObject item)
        {
            var room = go.GetComponent<GreyboxLevelRoom>() ?? go.AddComponent<GreyboxLevelRoom>();
            string roomType = ReadRuntimeString(item, "roomType", "type", "role");
            room.RoomId = markerId ?? "";
            room.DisplayName = markerName ?? "";
            room.RoomType = string.IsNullOrWhiteSpace(roomType) ? "room" : roomType;
            room.Difficulty = Mathf.Max(0, ReadInt(item, 0, "difficulty", "challenge", "tier"));
            room.Radius = Mathf.Max(0.05f, ReadFloat(item, 1f, "roomRadius", "radius"));
            room.Size = ReadScale(item);
            room.IsStart = ReadBool(item, LooksLikeStartRoom(markerId) || LooksLikeStartRoom(markerName) || LooksLikeStartRoom(roomType), "start", "isStart", "entry");
            room.IsBoss = ReadBool(item, LooksLikeBossRoom(markerId) || LooksLikeBossRoom(markerName) || LooksLikeBossRoom(roomType), "boss", "isBoss");
            room.ConnectedRoomIds = ReadMarkerIdArray(item, "connectedRoomIds", "connections", "connectedRooms", "links", "exits");
        }

        private static void AttachEncounter(GameObject go, string markerId, string markerName, JObject item)
        {
            var encounter = go.GetComponent<GreyboxEncounter>() ?? go.AddComponent<GreyboxEncounter>();
            string encounterType = ReadRuntimeString(item, "encounterType", "type", "role");
            encounter.EncounterId = markerId ?? "";
            encounter.DisplayName = markerName ?? "";
            encounter.EncounterType = string.IsNullOrWhiteSpace(encounterType) ? "encounter" : encounterType;
            encounter.TargetRoomId = SafeMarkerId(ReadString(item, "roomId", "targetRoomId", "room", "target"));
            encounter.Difficulty = Mathf.Max(0, ReadInt(item, 0, "difficulty", "challenge", "tier"));
            encounter.EnemyCount = Mathf.Max(0, ReadInt(item, 0, "enemyCount", "enemies", "count"));
            encounter.Reward = ReadRuntimeString(item, "reward", "loot", "prize");
            encounter.Radius = Mathf.Max(0.05f, ReadFloat(item, 1f, "encounterRadius", "radius"));
        }

        private static void AttachLevelConnection(GameObject go, string markerId, string markerName, JObject item, string fromRoomId, string toRoomId)
        {
            var connection = go.GetComponent<GreyboxLevelConnection>() ?? go.AddComponent<GreyboxLevelConnection>();
            connection.ConnectionId = markerId ?? "";
            connection.FromRoomId = fromRoomId ?? "";
            connection.ToRoomId = toRoomId ?? "";
            connection.ConnectionType = ReadRuntimeString(item ?? new JObject(), "connectionType", "type", "role");
            connection.Locked = ReadBool(item ?? new JObject(), false, "locked", "isLocked", "requiresKey");
            connection.TravelCost = Mathf.Max(0f, ReadFloat(item ?? new JObject(), 1f, "travelCost", "cost", "weight"));
        }

        private static string SourceFileName(JObject document, string sourcePath)
        {
            string sourceFileName = document.Value<string>("__greyboxSourceFileName") ?? document.Value<string>("greyboxSourceFileName");
            return SafeSourceFileName(sourceFileName, sourcePath);
        }

        private static string SafeSourceFileName(string sourceFileName, string sourcePath)
        {
            string safeAuthored = GreyboxConflictResolver.SafeRoundTripFileName(sourceFileName);
            if (!string.IsNullOrWhiteSpace(safeAuthored)) return safeAuthored;
            return GreyboxConflictResolver.SafeRoundTripFileName(System.IO.Path.GetFileName(sourcePath ?? ""));
        }

        private static string SafeSourcePath(string sourcePath)
        {
            string input = (sourcePath ?? "").Trim().Replace('\\', '/');
            if (string.IsNullOrWhiteSpace(input) || input.Contains("://")) return "";

            var builder = new StringBuilder(Math.Min(input.Length, MaxSourcePathLength));
            foreach (char c in input)
            {
                if (char.IsControl(c)) continue;
                builder.Append(c);
                if (builder.Length >= MaxSourcePathLength) break;
            }

            string normalized = builder.ToString().Trim();
            return IsSafeSourcePath(normalized) ? normalized : "";
        }

        private static bool IsSafeSourcePath(string sourcePath)
        {
            if (string.IsNullOrWhiteSpace(sourcePath)) return false;
            if (sourcePath.StartsWith("/", StringComparison.Ordinal) || sourcePath.StartsWith("~", StringComparison.Ordinal)) return false;
            if (sourcePath.Length >= 2 && sourcePath[1] == ':') return false;
            string[] segments = sourcePath.Split('/');
            foreach (string segment in segments)
            {
                if (string.IsNullOrWhiteSpace(segment) || segment == "." || segment == "..") return false;
            }

            return true;
        }

        private static Vector3 ReadVector3(JObject item)
        {
            if (TryReadVector3Token(item["position"], out Vector3 position)) return position;
            if (TryReadVector3Token(item["location"], out Vector3 location)) return location;
            if (TryReadVector3Token(item["translation"], out Vector3 translation)) return translation;
            if (TryReadVector3Token(item["pos"], out Vector3 pos)) return pos;
            if (item["transform"] is JObject transform)
            {
                if (TryReadVector3Token(transform["position"], out Vector3 transformPosition)) return transformPosition;
                if (TryReadVector3Token(transform["location"], out Vector3 transformLocation)) return transformLocation;
                if (TryReadVector3Token(transform["translation"], out Vector3 transformTranslation)) return transformTranslation;
            }

            float x = ReadFiniteFloat(item, 0f, "x");
            float y = ReadFiniteFloat(item, 0f, "y");
            float z = ReadFiniteFloat(item, 0f, "z");
            return new Vector3(x, y, z);
        }

        private static string PositionJsonPath(string itemPath, JObject item)
        {
            if (item["position"] != null) return $"{itemPath}.position";
            if (item["location"] != null) return $"{itemPath}.location";
            if (item["translation"] != null) return $"{itemPath}.translation";
            if (item["pos"] != null) return $"{itemPath}.pos";
            if (item["transform"] is JObject transform)
            {
                if (transform["position"] != null) return $"{itemPath}.transform.position";
                if (transform["location"] != null) return $"{itemPath}.transform.location";
                if (transform["translation"] != null) return $"{itemPath}.transform.translation";
            }

            return $"{itemPath}.position";
        }

        private static Vector3 ReadCameraPosition(JObject item, string mode)
        {
            if (item["position"] != null
                || item["location"] != null
                || item["translation"] != null
                || item["pos"] != null
                || item["transform"] is JObject
                || item["x"] != null
                || item["y"] != null
                || item["z"] != null)
            {
                return ReadVector3(item);
            }
            mode = (mode ?? "").Trim().ToLowerInvariant();
            if (mode == "top-down") return new Vector3(0f, 0f, -10f);
            if (mode == "portrait") return new Vector3(0f, 0f, -10f);
            return new Vector3(0f, 0f, -10f);
        }

        private static JArray TileDocuments(JObject document, out string jsonPath)
        {
            jsonPath = "$.tiles";
            if (document["tiles"] is JArray tiles) return tiles;
            if (document["cells"] is JArray cells)
            {
                jsonPath = "$.cells";
                return cells;
            }
            if (document["tilemap"] is JObject tilemap)
            {
                if (tilemap["tiles"] is JArray tilemapTiles)
                {
                    jsonPath = "$.tilemap.tiles";
                    return tilemapTiles;
                }
                if (tilemap["cells"] is JArray tilemapCells)
                {
                    jsonPath = "$.tilemap.cells";
                    return tilemapCells;
                }
            }
            if (document["grid"] is JObject grid)
            {
                if (grid["tiles"] is JArray gridTiles)
                {
                    jsonPath = "$.grid.tiles";
                    return gridTiles;
                }
                if (grid["cells"] is JArray gridCells)
                {
                    jsonPath = "$.grid.cells";
                    return gridCells;
                }
            }

            jsonPath = "";
            return null;
        }

        private static Vector3 ReadTilemapCellSize(JObject document)
        {
            if (document["tilemap"] is JObject tilemap)
            {
                if (TryReadScaleToken(tilemap["cellSize"], out Vector3 cellSize)) return cellSize;
                if (TryReadScaleToken(tilemap["cell"], out Vector3 cell)) return cell;
            }
            if (document["grid"] is JObject grid)
            {
                if (TryReadScaleToken(grid["cellSize"], out Vector3 cellSize)) return cellSize;
                if (TryReadScaleToken(grid["cell"], out Vector3 cell)) return cell;
            }
            if (TryReadScaleToken(document["cellSize"], out Vector3 rootCellSize)) return rootCellSize;
            return Vector3.one;
        }

        private static bool ReadTilemapCollisionFlag(JObject document, params string[] keys)
        {
            if (document == null) return false;
            if (ReadColliderFlag(document, keys)) return true;
            if (document["tilemap"] is JObject tilemap)
            {
                if (ReadColliderFlag(tilemap, keys)) return true;
                if (tilemap["physics"] is JObject physics && ReadColliderFlag(physics, keys)) return true;
            }
            if (document["grid"] is JObject grid)
            {
                if (ReadColliderFlag(grid, keys)) return true;
                if (grid["physics"] is JObject physics && ReadColliderFlag(physics, keys)) return true;
            }
            if (document["physics"] is JObject rootPhysics && ReadColliderFlag(rootPhysics, keys)) return true;
            return false;
        }

        private static Vector3Int ReadTilePosition(JObject item)
        {
            if (TryReadVector3IntToken(item["position"], out Vector3Int position)) return position;
            if (TryReadVector3IntToken(item["location"], out Vector3Int location)) return location;
            if (TryReadVector3IntToken(item["pos"], out Vector3Int pos)) return pos;
            if (item["transform"] is JObject transform && TryReadVector3IntToken(transform["position"], out Vector3Int transformPosition)) return transformPosition;

            return new Vector3Int(
                ReadTileCoordinate(item, 0, "x", "col", "column", "q"),
                ReadTileCoordinate(item, 0, "y", "row", "r"),
                ReadTileCoordinate(item, 0, "z", "layer")
            );
        }

        private static bool TryReadVector3IntToken(JToken token, out Vector3Int value)
        {
            value = Vector3Int.zero;
            if (token is JObject obj)
            {
                value = new Vector3Int(
                    ReadTileCoordinate(obj, 0, "x", "col", "column", "q"),
                    ReadTileCoordinate(obj, 0, "y", "row", "r"),
                    ReadTileCoordinate(obj, 0, "z", "layer")
                );
                return HasNumber(obj, "x") || HasNumber(obj, "col") || HasNumber(obj, "column") || HasNumber(obj, "q") || HasNumber(obj, "y") || HasNumber(obj, "row") || HasNumber(obj, "r") || HasNumber(obj, "z") || HasNumber(obj, "layer");
            }

            if (token is JArray array
                && array.Count >= 2
                && TryReadFiniteFloat(array[0], out float x)
                && TryReadFiniteFloat(array[1], out float y))
            {
                TryReadFiniteFloat(array.Count >= 3 ? array[2] : null, out float z);
                value = new Vector3Int(
                    Mathf.RoundToInt(x),
                    Mathf.RoundToInt(y),
                    Mathf.RoundToInt(z)
                );
                return true;
            }

            return false;
        }

        private static int ReadTileCoordinate(JObject item, int fallback, params string[] keys)
        {
            foreach (string key in keys)
            {
                JToken token = item[key];
                if (token == null) continue;
                if (TryReadFiniteFloat(token, out float value)) return Mathf.RoundToInt(value);
            }
            return fallback;
        }

        private static Color TileColorFor(string tileType)
        {
            string normalized = (tileType ?? "").Trim().ToLowerInvariant();
            if (normalized.Contains("wall") || normalized.Contains("block")) return new Color(0.18f, 0.18f, 0.21f, 1f);
            if (normalized.Contains("water")) return new Color(0.18f, 0.55f, 0.75f, 1f);
            if (normalized.Contains("hazard") || normalized.Contains("lava")) return new Color(0.91f, 0.29f, 0.24f, 1f);
            if (normalized.Contains("spawn") || normalized.Contains("start")) return new Color(0.18f, 0.8f, 0.44f, 1f);
            if (normalized.Contains("exit") || normalized.Contains("goal")) return new Color(1f, 0.42f, 0.21f, 1f);
            return new Color(0.48f, 0.51f, 0.54f, 1f);
        }

        private static TileSemantics ReadTileSemantics(JObject item, string tileType)
        {
            bool authoredBlocksMovement = TryReadBool(item, out bool blocksMovementValue, "blocksMovement", "blocked", "solid", "impassable");
            bool authoredWalkable = TryReadBool(item, out bool walkableValue, "walkable", "isWalkable", "passable", "traversable");
            bool defaultBlocksMovement = BlocksMovementForTileType(tileType);
            bool blocksMovement = authoredBlocksMovement ? blocksMovementValue : defaultBlocksMovement;
            bool walkable = authoredWalkable ? walkableValue : !blocksMovement;
            if (authoredWalkable && !authoredBlocksMovement) blocksMovement = !walkable;
            if (authoredBlocksMovement && !authoredWalkable) walkable = !blocksMovement;

            return new TileSemantics(
                walkable,
                blocksMovement,
                ReadBool(item, LooksLikeTileType(tileType, "spawn", "start", "checkpoint"), "spawn", "isSpawn", "start", "isStart", "checkpoint", "isCheckpoint"),
                ReadBool(item, LooksLikeTileType(tileType, "exit", "goal", "finish"), "exit", "isExit", "goal", "isGoal", "finish", "isFinish"),
                ReadBool(item, LooksLikeTileType(tileType, "hazard", "lava", "spike", "damage"), "hazard", "isHazard", "damaging", "damage", "isDamage")
            );
        }

        private static bool BlocksMovementForTileType(string tileType)
        {
            return LooksLikeTileType(tileType, "wall", "block", "solid", "rock", "door", "gate");
        }

        private static bool LooksLikeTileType(string tileType, params string[] fragments)
        {
            string normalized = (tileType ?? "").Trim().ToLowerInvariant();
            foreach (string fragment in fragments)
            {
                if (normalized.Contains(fragment)) return true;
            }
            return false;
        }

        private static Vector3Int Min(Vector3Int? current, Vector3Int value)
        {
            if (!current.HasValue) return value;
            return new Vector3Int(
                Mathf.Min(current.Value.x, value.x),
                Mathf.Min(current.Value.y, value.y),
                Mathf.Min(current.Value.z, value.z)
            );
        }

        private static Vector3Int Max(Vector3Int? current, Vector3Int value)
        {
            if (!current.HasValue) return value;
            return new Vector3Int(
                Mathf.Max(current.Value.x, value.x),
                Mathf.Max(current.Value.y, value.y),
                Mathf.Max(current.Value.z, value.z)
            );
        }

        private static Vector3 ReadScale(JObject item)
        {
            if (TryReadScaleToken(item["scale"], out Vector3 authoredScale)) return authoredScale;
            if (TryReadScaleToken(item["size"], out Vector3 authoredSize)) return authoredSize;
            if (item["transform"] is JObject transform && TryReadScaleToken(transform["scale"], out Vector3 transformScale)) return transformScale;

            JObject scale = item["scale"] as JObject ?? item["size"] as JObject;
            if (scale != null)
            {
                float x = Mathf.Max(0.05f, ReadFiniteFloat(scale, 1f, "x", "width"));
                float y = Mathf.Max(0.05f, ReadFiniteFloat(scale, 1f, "y", "height"));
                float z = Mathf.Max(0.05f, ReadFiniteFloat(scale, 1f, "z", "depth"));
                return new Vector3(x, y, z);
            }

            float radius = Mathf.Max(0.25f, ReadFiniteFloat(item, 1f, "radius"));
            return Vector3.one * radius;
        }

        private static Vector3 ReadRotationEuler(JObject item)
        {
            if (TryReadEulerToken(item["rotation"], out Vector3 rotation)) return rotation;
            if (TryReadEulerToken(item["rotationEuler"], out Vector3 rotationEuler)) return rotationEuler;
            if (TryReadEulerToken(item["euler"], out Vector3 euler)) return euler;
            if (item["transform"] is JObject transform)
            {
                if (TryReadEulerToken(transform["rotation"], out Vector3 transformRotation)) return transformRotation;
                if (TryReadEulerToken(transform["rotationEuler"], out Vector3 transformRotationEuler)) return transformRotationEuler;
                if (TryReadEulerToken(transform["euler"], out Vector3 transformEuler)) return transformEuler;
            }

            return new Vector3(
                ReadFiniteFloat(item, 0f, "rotationX", "pitch"),
                ReadFiniteFloat(item, 0f, "rotationY", "yaw"),
                ReadFiniteFloat(item, 0f, "rotationZ", "roll")
            );
        }

        private static bool TryReadVector3Token(JToken token, out Vector3 value)
        {
            value = Vector3.zero;
            if (token is JObject obj)
            {
                value = new Vector3(
                    ReadFiniteFloat(obj, 0f, "x"),
                    ReadFiniteFloat(obj, 0f, "y"),
                    ReadFiniteFloat(obj, 0f, "z")
                );
                return HasNumber(obj, "x") || HasNumber(obj, "y") || HasNumber(obj, "z");
            }

            if (token is JArray array
                && array.Count >= 2
                && TryReadFiniteFloat(array[0], out float x)
                && TryReadFiniteFloat(array[1], out float y))
            {
                TryReadFiniteFloat(array.Count >= 3 ? array[2] : null, out float z);
                value = new Vector3(
                    x,
                    y,
                    z
                );
                return true;
            }

            return false;
        }

        private static bool TryReadScaleToken(JToken token, out Vector3 value)
        {
            value = Vector3.one;
            if (token == null) return false;
            if (TryReadFiniteFloat(token, out float scalar))
            {
                value = Vector3.one * Mathf.Max(0.05f, scalar);
                return true;
            }

            if (token is JObject obj)
            {
                value = new Vector3(
                    Mathf.Max(0.05f, ReadFiniteFloat(obj, 1f, "x", "width")),
                    Mathf.Max(0.05f, ReadFiniteFloat(obj, 1f, "y", "height")),
                    Mathf.Max(0.05f, ReadFiniteFloat(obj, 1f, "z", "depth"))
                );
                return HasNumber(obj, "x") || HasNumber(obj, "width") || HasNumber(obj, "y") || HasNumber(obj, "height") || HasNumber(obj, "z") || HasNumber(obj, "depth");
            }

            if (token is JArray array
                && array.Count >= 2
                && TryReadFiniteFloat(array[0], out float x)
                && TryReadFiniteFloat(array[1], out float y))
            {
                float z = TryReadFiniteFloat(array.Count >= 3 ? array[2] : null, out float zValue) ? zValue : 1f;
                value = new Vector3(
                    Mathf.Max(0.05f, x),
                    Mathf.Max(0.05f, y),
                    Mathf.Max(0.05f, z)
                );
                return true;
            }

            return false;
        }

        private static bool TryReadEulerToken(JToken token, out Vector3 value)
        {
            value = Vector3.zero;
            if (token is JObject obj)
            {
                value = new Vector3(
                    ReadFiniteFloat(obj, 0f, "x", "pitch"),
                    ReadFiniteFloat(obj, 0f, "y", "yaw"),
                    ReadFiniteFloat(obj, 0f, "z", "roll")
                );
                return HasNumber(obj, "x") || HasNumber(obj, "pitch") || HasNumber(obj, "y") || HasNumber(obj, "yaw") || HasNumber(obj, "z") || HasNumber(obj, "roll");
            }

            if (token is JArray array
                && array.Count >= 2
                && TryReadFiniteFloat(array[0], out float x)
                && TryReadFiniteFloat(array[1], out float y))
            {
                TryReadFiniteFloat(array.Count >= 3 ? array[2] : null, out float z);
                value = new Vector3(
                    x,
                    y,
                    z
                );
                return true;
            }

            return false;
        }

        private static PrimitiveType ReadPrimitiveType(JObject item, PrimitiveType defaultPrimitive)
        {
            string value = item.Value<string>("unityPrimitive") ?? item.Value<string>("primitive") ?? item.Value<string>("shape");
            if (string.IsNullOrWhiteSpace(value)) return defaultPrimitive;
            switch (value.Trim().ToLowerInvariant())
            {
                case "capsule":
                case "character":
                case "actor":
                    return PrimitiveType.Capsule;
                case "sphere":
                case "spawn":
                case "point":
                    return PrimitiveType.Sphere;
                case "cylinder":
                case "objective":
                case "marker":
                    return PrimitiveType.Cylinder;
                case "plane":
                    return PrimitiveType.Plane;
                case "quad":
                    return PrimitiveType.Quad;
                default:
                    return PrimitiveType.Cube;
            }
        }

        private static Color ReadColor(JObject item, Color fallback)
        {
            if (TryReadColorObject(item["tint"] as JObject, out Color tint)) return tint;
            if (TryReadColorObject(item["color"] as JObject, out Color color)) return color;
            if (TryReadColorObject(item["materialColor"] as JObject, out Color materialColor)) return materialColor;
            if (TryReadColorObject(item["backgroundColor"] as JObject, out Color backgroundColor)) return backgroundColor;

            string hex = item.Value<string>("color")
                ?? item.Value<string>("colorHex")
                ?? item.Value<string>("materialColor")
                ?? item.Value<string>("materialHex")
                ?? item.Value<string>("backgroundColor")
                ?? item.Value<string>("backgroundHex")
                ?? item.Value<string>("tint");
            return !string.IsNullOrWhiteSpace(hex) && ColorUtility.TryParseHtmlString(hex.Trim(), out Color parsed)
                ? parsed
                : fallback;
        }

        private static bool TryReadColorObject(JObject value, out Color color)
        {
            color = default;
            if (value == null) return false;
            if (!HasNumber(value, "r") || !HasNumber(value, "g") || !HasNumber(value, "b")) return false;
            color = new Color(
                NormalizeColorChannel(ReadFiniteFloat(value, 0f, "r")),
                NormalizeColorChannel(ReadFiniteFloat(value, 0f, "g")),
                NormalizeColorChannel(ReadFiniteFloat(value, 0f, "b")),
                NormalizeColorChannel(ReadFiniteFloat(value, 1f, "a"))
            );
            return true;
        }

        private static float NormalizeColorChannel(float value)
        {
            return value > 1f ? Mathf.Clamp01(value / 255f) : Mathf.Clamp01(value);
        }

        private static List<string> ReadTags(JObject item)
        {
            var result = new List<string>();
            var used = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (item["tags"] is JArray tags)
            {
                foreach (JToken tag in tags)
                {
                    AddDesignTag(result, used, tag.Value<string>());
                    if (result.Count >= MaxDesignNodeTags) break;
                }
            }

            if (result.Count < MaxDesignNodeTags) AddDesignTag(result, used, item.Value<string>("tag"));
            return result;
        }

        private static void AddDesignTag(List<string> result, HashSet<string> used, string value)
        {
            string tag = SafeInspectorString(value, MaxDesignNodeTagLength);
            if (string.IsNullOrWhiteSpace(tag)) return;
            if (!used.Add(tag)) return;
            result.Add(tag);
        }

        private static List<GreyboxDesignProperty> ReadProperties(JObject item)
        {
            var properties = new List<GreyboxDesignProperty>();
            var usedKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (JProperty property in item.Properties())
            {
                if (SkippedDesignPropertyKeys.Contains(property.Name)) continue;
                if (property.Name == "tags" || property.Name == "tag") continue;
                string key = SafeDesignPropertyKey(property.Name);
                if (string.IsNullOrWhiteSpace(key)) continue;
                if (ForbiddenDesignPropertyKeys.Contains(key)) continue;
                if (!usedKeys.Add(key)) continue;
                properties.Add(new GreyboxDesignProperty
                {
                    Key = key,
                    Kind = PropertyKind(property.Value),
                    Value = SafeInspectorString(PropertyValue(property.Value), MaxDesignPropertyValueLength)
                });
                if (properties.Count >= MaxDesignNodeProperties) break;
            }

            return properties;
        }

        private static string BoundedSourceJson(JObject item)
        {
            return SafeInspectorString(item.ToString(Formatting.None), MaxDesignNodeSourceJsonLength);
        }

        private static GreyboxDesignPropertyKind PropertyKind(JToken token)
        {
            if (token is JObject obj)
            {
                if (LooksLikeVector3(obj)) return GreyboxDesignPropertyKind.Vector3;
                if (LooksLikeColor(obj)) return GreyboxDesignPropertyKind.Color;
                return GreyboxDesignPropertyKind.Json;
            }

            if (token.Type == JTokenType.Integer || token.Type == JTokenType.Float) return GreyboxDesignPropertyKind.Number;
            if (token.Type == JTokenType.Boolean) return GreyboxDesignPropertyKind.Boolean;
            if (token.Type == JTokenType.Array) return GreyboxDesignPropertyKind.Json;
            return GreyboxDesignPropertyKind.String;
        }

        private static string PropertyValue(JToken token)
        {
            if (token.Type == JTokenType.String) return token.Value<string>() ?? "";
            if (token.Type == JTokenType.Integer || token.Type == JTokenType.Float || token.Type == JTokenType.Boolean) return token.ToString(Formatting.None);
            return token.ToString(Formatting.None);
        }

        private static bool LooksLikeVector3(JObject obj)
        {
            return HasNumber(obj, "x") && HasNumber(obj, "y") && HasNumber(obj, "z");
        }

        private static bool LooksLikeColor(JObject obj)
        {
            return HasNumber(obj, "r") && HasNumber(obj, "g") && HasNumber(obj, "b");
        }

        private static bool HasNumber(JObject obj, string key)
        {
            return TryReadFiniteFloat(obj[key], out _);
        }

        private static string ReadString(JObject item, params string[] keys)
        {
            foreach (string key in keys)
            {
                string value = item.Value<string>(key);
                if (!string.IsNullOrWhiteSpace(value)) return value.Trim();
            }

            return "";
        }

        private static int ReadInt(JObject item, int fallback, params string[] keys)
        {
            foreach (string key in keys)
            {
                int? value = item.Value<int?>(key);
                if (value.HasValue) return value.Value;
            }

            return fallback;
        }

        private static float ReadFloat(JObject item, float fallback, params string[] keys)
        {
            foreach (string key in keys)
            {
                if (TryReadFiniteFloat(item[key], out float value)) return value;
            }

            return fallback;
        }

        private static float ReadFiniteFloat(JObject item, float fallback, params string[] keys)
        {
            foreach (string key in keys)
            {
                if (TryReadFiniteFloat(item[key], out float value)) return value;
            }

            return fallback;
        }

        private static bool TryReadFiniteFloat(JToken token, out float value)
        {
            value = 0f;
            if (token == null || (token.Type != JTokenType.Integer && token.Type != JTokenType.Float)) return false;
            try
            {
                value = token.Value<float>();
                return !float.IsNaN(value) && !float.IsInfinity(value);
            }
            catch
            {
                value = 0f;
                return false;
            }
        }

        private static bool ReadBool(JObject item, bool fallback, params string[] keys)
        {
            foreach (string key in keys)
            {
                bool? value = item.Value<bool?>(key);
                if (value.HasValue) return value.Value;
            }

            return fallback;
        }

        private static string[] ReadStringArray(JObject item, params string[] keys)
        {
            var values = new List<string>();
            foreach (string key in keys)
            {
                JToken token = item[key];
                if (token == null) continue;
                if (token is JArray array)
                {
                    foreach (JToken child in array)
                    {
                        string value = ReadStringToken(child);
                        if (!string.IsNullOrWhiteSpace(value)) values.Add(value.Trim());
                    }
                }
                else
                {
                    string value = token.Value<string>();
                    if (string.IsNullOrWhiteSpace(value)) continue;
                    foreach (string part in value.Split(','))
                    {
                        if (!string.IsNullOrWhiteSpace(part)) values.Add(part.Trim());
                    }
                }
            }

            return values.ToArray();
        }

        private static string[] ReadMarkerIdArray(JObject item, params string[] keys)
        {
            var values = new List<string>();
            var used = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (string value in ReadStringArray(item, keys))
            {
                string markerId = SafeMarkerId(value);
                if (string.IsNullOrWhiteSpace(markerId)) continue;
                if (!used.Add(markerId)) continue;
                values.Add(markerId);
                if (values.Count >= MaxRuntimeStringArrayItems) break;
            }
            return values.ToArray();
        }

        private static string ReadRuntimeString(JObject item, params string[] keys)
        {
            return SafeRuntimeString(ReadString(item, keys));
        }

        private static string[] ReadRuntimeStringArray(JObject item, params string[] keys)
        {
            var values = new List<string>();
            var used = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (string value in ReadStringArray(item, keys))
            {
                string safe = SafeRuntimeString(value);
                if (string.IsNullOrWhiteSpace(safe)) continue;
                if (!used.Add(safe)) continue;
                values.Add(safe);
                if (values.Count >= MaxRuntimeStringArrayItems) break;
            }
            return values.ToArray();
        }

        private static JArray FirstArray(JObject item, params string[] keys)
        {
            foreach (string key in keys)
            {
                if (item[key] is JArray array) return array;
            }

            return null;
        }

        private static string ReadStringToken(JToken token)
        {
            if (token is JObject obj) return ReadString(obj, "id", "roomId", "targetRoomId", "name");
            return token.Value<string>() ?? "";
        }

        private static string ReadConnectionTarget(JToken token)
        {
            if (token is JObject obj) return ReadString(obj, "toRoomId", "to", "targetRoomId", "target", "id", "roomId", "name");
            return token.Value<string>() ?? "";
        }

        private static string ConnectionKey(string fromRoomId, string toRoomId)
        {
            int comparison = string.Compare(fromRoomId ?? "", toRoomId ?? "", StringComparison.OrdinalIgnoreCase);
            return comparison <= 0 ? $"{fromRoomId}->{toRoomId}" : $"{toRoomId}->{fromRoomId}";
        }

        private static bool IsPlayerRole(string role)
        {
            role = (role ?? "").Trim().ToLowerInvariant();
            return role == "controller" || role == "player" || role == "avatar" || role == "playable";
        }

        private static bool IsEnemyRole(string role)
        {
            role = (role ?? "").Trim().ToLowerInvariant();
            return role == "enemy" || role == "boss" || role == "hostile" || role == "minion";
        }

        private static bool LooksLikeCheckpoint(string value)
        {
            return (value ?? "").IndexOf("checkpoint", StringComparison.OrdinalIgnoreCase) >= 0;
        }

        private static bool LooksLikePrimaryObjective(string value)
        {
            string normalized = value ?? "";
            return normalized.IndexOf("exit", StringComparison.OrdinalIgnoreCase) >= 0
                || normalized.IndexOf("win", StringComparison.OrdinalIgnoreCase) >= 0
                || normalized.IndexOf("primary", StringComparison.OrdinalIgnoreCase) >= 0;
        }

        private static bool LooksLikeStartRoom(string value)
        {
            string normalized = value ?? "";
            return normalized.IndexOf("start", StringComparison.OrdinalIgnoreCase) >= 0
                || normalized.IndexOf("entry", StringComparison.OrdinalIgnoreCase) >= 0
                || normalized.IndexOf("spawn", StringComparison.OrdinalIgnoreCase) >= 0;
        }

        private static bool LooksLikeBossRoom(string value)
        {
            return (value ?? "").IndexOf("boss", StringComparison.OrdinalIgnoreCase) >= 0;
        }

        private static NodeVisual CreateNodeVisual(JObject item, PrimitiveType defaultPrimitive)
        {
            PrimitiveType primitive = ReadPrimitiveType(item, defaultPrimitive);
            string requestedAssetPath = ResolveVisualAssetPath(item);
            if (!string.IsNullOrWhiteSpace(requestedAssetPath))
            {
                var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(requestedAssetPath);
                if (prefab)
                {
                    var instance = PrefabUtility.InstantiatePrefab(prefab) as GameObject;
                    if (!instance) instance = Object.Instantiate(prefab);
                    MarkGeneratedComponents(instance.GetComponentsInChildren<Component>(true));
                    return new NodeVisual(instance, requestedAssetPath, AssetDatabase.AssetPathToGUID(requestedAssetPath), "Prefab", false);
                }

                var mesh = AssetDatabase.LoadAssetAtPath<Mesh>(requestedAssetPath);
                if (mesh)
                {
                    var meshObject = new GameObject("Greybox Mesh");
                    var meshFilter = meshObject.AddComponent<MeshFilter>();
                    meshFilter.sharedMesh = mesh;
                    var renderer = meshObject.AddComponent<MeshRenderer>();
                    MarkGeneratedComponent(meshFilter);
                    MarkGeneratedComponent(renderer);
                    return new NodeVisual(meshObject, requestedAssetPath, AssetDatabase.AssetPathToGUID(requestedAssetPath), "Mesh", true);
                }
            }

            var primitiveObject = GameObject.CreatePrimitive(primitive);
            foreach (Collider collider in primitiveObject.GetComponents<Collider>()) Object.DestroyImmediate(collider);
            return new NodeVisual(primitiveObject, requestedAssetPath, "", primitive.ToString(), true);
        }

        private static void ApplyNodeMaterials(GameObject go, JObject item, Color fallbackColor, string fallbackName, bool applyFallbackMaterial, MaterialContext materialContext)
        {
            Renderer[] renderers = go.GetComponentsInChildren<Renderer>(true);
            if (renderers.Length == 0) return;
            Material material = ResolveMaterialAsset(item);
            if (!material && !HasAuthoredColorOverride(item)) material = ResolvePaletteMaterial(item, materialContext);
            if (!material && (applyFallbackMaterial || HasAuthoredColorOverride(item)))
            {
                material = MaterialBuilder.Colored(ReadColor(item, fallbackColor), $"Greybox {SafeName(fallbackName)} Marker");
            }
            if (!material) return;
            foreach (Renderer renderer in renderers)
            {
                renderer.sharedMaterial = material;
            }
        }

        private static Collider[] ApplyAuthoredCollider(GameObject go, JObject item, string visualPrimitive)
        {
            Collider[] existingColliders = go.GetComponentsInChildren<Collider>(true);
            if (!WantsCollider(item)) return existingColliders;
            if (existingColliders.Length > 0)
            {
                ApplyColliderTrigger(existingColliders, item);
                MarkGeneratedComponents(existingColliders);
                return existingColliders;
            }

            string colliderType = ReadColliderType(item, visualPrimitive);
            Collider collider;
            switch ((colliderType ?? "").Trim().ToLowerInvariant())
            {
                case "sphere":
                case "point":
                    collider = go.AddComponent<SphereCollider>();
                    break;
                case "capsule":
                case "character":
                case "actor":
                    collider = go.AddComponent<CapsuleCollider>();
                    break;
                case "mesh":
                case "model":
                    var meshFilter = go.GetComponentInChildren<MeshFilter>(true);
                    if (meshFilter && meshFilter.sharedMesh)
                    {
                        var meshCollider = go.AddComponent<MeshCollider>();
                        meshCollider.sharedMesh = meshFilter.sharedMesh;
                        collider = meshCollider;
                    }
                    else
                    {
                        collider = go.AddComponent<BoxCollider>();
                    }
                    break;
                default:
                    collider = go.AddComponent<BoxCollider>();
                    break;
            }

            var colliders = collider ? new[] { collider } : Array.Empty<Collider>();
            ApplyColliderTrigger(colliders, item);
            MarkGeneratedComponents(colliders);
            return colliders;
        }

        private static bool WantsCollider(JObject item)
        {
            if (ReadColliderFlag(item, "collider", "hasCollider", "physicsCollider", "collision")) return true;
            if (ReadColliderFlag(item, "trigger", "isTrigger")) return true;
            if (!string.IsNullOrWhiteSpace(ReadColliderType(item, ""))) return true;
            if (item["physics"] is JObject physics)
            {
                return ReadColliderFlag(physics, "collider", "hasCollider", "physicsCollider", "collision")
                    || ReadColliderFlag(physics, "trigger", "isTrigger")
                    || !string.IsNullOrWhiteSpace(ReadString(physics, "colliderType", "collider", "shape", "collisionShape"));
            }
            return false;
        }

        private static bool ReadColliderFlag(JObject item, params string[] keys)
        {
            foreach (string key in keys)
            {
                JToken token = item[key];
                if (token == null) continue;
                if (token.Type == JTokenType.Boolean && token.Value<bool>()) return true;
                if (token.Type == JTokenType.String && bool.TryParse(token.Value<string>(), out bool parsed) && parsed) return true;
            }
            return false;
        }

        private static string ReadColliderType(JObject item, string fallback)
        {
            string value = ReadString(item, "colliderType", "collisionShape");
            if (!string.IsNullOrWhiteSpace(value)) return value;
            if (item["collider"] != null && item["collider"].Type == JTokenType.String)
            {
                value = item.Value<string>("collider");
                if (!string.IsNullOrWhiteSpace(value)) return value;
            }
            if (item["physics"] is JObject physics)
            {
                value = ReadString(physics, "colliderType", "collider", "shape", "collisionShape");
                if (!string.IsNullOrWhiteSpace(value)) return value;
            }
            return fallback ?? "";
        }

        private static void ApplyColliderTrigger(Collider[] colliders, JObject item)
        {
            if (!ReadPhysicsBool(item, false, "trigger", "isTrigger")) return;
            foreach (Collider collider in colliders)
            {
                if (!collider) continue;
                if (collider is MeshCollider meshCollider) meshCollider.convex = true;
                collider.isTrigger = true;
            }
        }

        private static void ApplyAuthoredPhysics(GameObject go, JObject item, Collider[] colliders)
        {
            if (!WantsRigidbody(item)) return;
            var body = go.GetComponent<Rigidbody>() ?? go.AddComponent<Rigidbody>();
            MarkGeneratedComponent(body);
            ApplyRigidbodyMode(body, item);
            body.mass = Mathf.Max(0.0001f, ReadPhysicsFloat(item, body.mass, "mass", "rigidbodyMass"));
            body.useGravity = ReadPhysicsBool(item, body.useGravity, "useGravity", "gravity");
            body.isKinematic = ReadPhysicsBool(item, body.isKinematic, "isKinematic", "kinematic");
            if (!body.isKinematic) MakeMeshCollidersConvex(colliders);
        }

        private static void MarkGeneratedComponents(IEnumerable<Component> components)
        {
            foreach (Component component in components ?? Array.Empty<Component>())
            {
                MarkGeneratedComponent(component);
            }
        }

        private static void MarkGeneratedComponent(Component component)
        {
            if (!component) return;
            var manifest = component.GetComponent<GreyboxGeneratedComponents>() ?? component.gameObject.AddComponent<GreyboxGeneratedComponents>();
            manifest.Record(component);
        }

        private static bool WantsRigidbody(JObject item)
        {
            if (ReadRigidbodyFlag(item, "rigidbody", "hasRigidbody", "physicsBody", "dynamic")) return true;
            if (HasPhysicsKey(item, "bodyType", "rigidbodyType", "mass", "rigidbodyMass", "useGravity", "gravity", "isKinematic", "kinematic")) return true;
            if (item["physics"] is JObject physics)
            {
                return ReadRigidbodyFlag(physics, "rigidbody", "hasRigidbody", "physicsBody", "dynamic")
                    || HasAnyKey(physics, "bodyType", "rigidbodyType", "mass", "rigidbodyMass", "useGravity", "gravity", "isKinematic", "kinematic");
            }
            return false;
        }

        private static bool ReadRigidbodyFlag(JObject item, params string[] keys)
        {
            foreach (string key in keys)
            {
                JToken token = item[key];
                if (token == null) continue;
                if (token.Type == JTokenType.Boolean && token.Value<bool>()) return true;
                if (token.Type != JTokenType.String) continue;
                string text = (token.Value<string>() ?? "").Trim();
                if (bool.TryParse(text, out bool parsed))
                {
                    if (parsed) return true;
                    continue;
                }
                string normalized = text.ToLowerInvariant();
                if (!string.IsNullOrWhiteSpace(text) && normalized != "none" && normalized != "off") return true;
            }
            return false;
        }

        private static bool HasPhysicsKey(JObject item, params string[] keys)
        {
            if (HasAnyKey(item, keys)) return true;
            return item["physics"] is JObject physics && HasAnyKey(physics, keys);
        }

        private static bool HasAnyKey(JObject item, params string[] keys)
        {
            foreach (string key in keys)
            {
                if (item[key] != null) return true;
            }
            return false;
        }

        private static void ApplyRigidbodyMode(Rigidbody body, JObject item)
        {
            string mode = ReadPhysicsString(item, "bodyType", "rigidbodyType", "rigidbody").Trim().ToLowerInvariant();
            switch (mode)
            {
                case "dynamic":
                    body.isKinematic = false;
                    break;
                case "kinematic":
                    body.isKinematic = true;
                    break;
                case "static":
                    body.isKinematic = true;
                    body.useGravity = false;
                    break;
            }
        }

        private static string ReadPhysicsString(JObject item, params string[] keys)
        {
            string value = ReadString(item, keys);
            if (!string.IsNullOrWhiteSpace(value)) return value;
            return item["physics"] is JObject physics ? ReadString(physics, keys) : "";
        }

        private static float ReadPhysicsFloat(JObject item, float fallback, params string[] keys)
        {
            foreach (string key in keys)
            {
                if (TryReadFiniteFloat(item[key], out float value)) return value;
            }
            if (item["physics"] is JObject physics) return ReadFloat(physics, fallback, keys);
            return fallback;
        }

        private static bool ReadPhysicsBool(JObject item, bool fallback, params string[] keys)
        {
            if (TryReadBool(item, out bool value, keys)) return value;
            if (item["physics"] is JObject physics && TryReadBool(physics, out value, keys)) return value;
            return fallback;
        }

        private static bool TryReadBool(JObject item, out bool value, params string[] keys)
        {
            foreach (string key in keys)
            {
                JToken token = item[key];
                if (token == null) continue;
                if (token.Type == JTokenType.Boolean)
                {
                    value = token.Value<bool>();
                    return true;
                }
                if (token.Type == JTokenType.String && bool.TryParse(token.Value<string>(), out value))
                {
                    return true;
                }
            }
            value = false;
            return false;
        }

        private static void MakeMeshCollidersConvex(Collider[] colliders)
        {
            foreach (Collider collider in colliders)
            {
                if (collider is MeshCollider meshCollider) meshCollider.convex = true;
            }
        }

        private static void ApplyUnityObjectMetadata(GameObject go, JObject item)
        {
            string unityTag = ReadString(item, "unityTag", "gameObjectTag");
            if (!string.IsNullOrWhiteSpace(unityTag) && IsDefinedUnityTag(unityTag)) go.tag = unityTag;
            int layer = ReadUnityLayer(item, go.layer);
            if (layer != go.layer) SetLayerRecursively(go, layer);
            if (TryReadBool(item, out bool isStatic, "unityStatic", "isStatic")) go.isStatic = isStatic;
            if (TryReadBool(item, out bool active, "unityActive", "activeSelf", "active")) go.SetActive(active);
        }

        private static bool IsDefinedUnityTag(string tagName)
        {
            foreach (string tag in UnityEditorInternal.InternalEditorUtility.tags)
            {
                if (string.Equals(tag, tagName, StringComparison.Ordinal)) return true;
            }
            return false;
        }

        private static int ReadUnityLayer(JObject item, int fallback)
        {
            JToken token = item["unityLayer"];
            if (token != null)
            {
                if (token.Type == JTokenType.Integer)
                {
                    int value = token.Value<int>();
                    return value >= 0 && value <= 31 ? value : fallback;
                }
                if (token.Type == JTokenType.String)
                {
                    int named = LayerMask.NameToLayer(token.Value<string>() ?? "");
                    return named >= 0 ? named : fallback;
                }
            }

            string layerName = ReadString(item, "unityLayerName", "layerName");
            if (string.IsNullOrWhiteSpace(layerName)) return fallback;
            int layer = LayerMask.NameToLayer(layerName);
            return layer >= 0 ? layer : fallback;
        }

        private static void SetLayerRecursively(GameObject go, int layer)
        {
            go.layer = layer;
            foreach (Transform child in go.transform)
            {
                SetLayerRecursively(child.gameObject, layer);
            }
        }

        private static bool HasAuthoredColorOverride(JObject item)
        {
            return item["tint"] != null
                || item["color"] != null
                || item["colorHex"] != null
                || item["materialColor"] != null
                || item["materialHex"] != null
                || item["backgroundColor"] != null
                || item["backgroundHex"] != null;
        }

        private static Material ResolveMaterialAsset(JObject item)
        {
            string materialPath = ResolveUnityAssetPath(
                item,
                new[] { "materialAssetGuid", "unityMaterialGuid", "materialGuid", "unityMaterialAssetGuid" },
                new[] { "materialAssetPath", "unityMaterialPath", "materialPath", "material" }
            );
            if (string.IsNullOrWhiteSpace(materialPath)) return null;
            return AssetDatabase.LoadAssetAtPath<Material>(materialPath);
        }

        private static Material ResolvePaletteMaterial(JObject item, MaterialContext materialContext)
        {
            string label = ReadPaletteMaterialLabel(item);
            if (string.IsNullOrWhiteSpace(label)) return null;
            GreyboxArtBiblePalette palette = ResolvePaletteForNode(item, materialContext);
            if (!palette) return null;

            if (palette.TryGetMaterialAssetPath(label, out string materialPath))
            {
                var material = AssetDatabase.LoadAssetAtPath<Material>(materialPath);
                if (material) return material;
            }

            int index = palette.FindColorIndex(label);
            if (index < 0 || palette.Colors == null || index >= palette.Colors.Count) return null;
            return MaterialBuilder.Styled(
                palette.Colors[index],
                $"Greybox {SafeName(label)} Marker",
                ReadPaletteFloat(palette.MetallicValues, index, 0f),
                ReadPaletteFloat(palette.SmoothnessValues, index, 0.55f),
                ReadPaletteBool(palette.EmissionEnabled, index, false),
                ReadPaletteColor(palette.EmissionColors, index, Color.black),
                ReadPalettePipeline(palette.RenderPipelineHints, index, MaterialBuilder.DetectActiveRenderPipelineKind())
            );
        }

        private static GreyboxArtBiblePalette ResolvePaletteForNode(JObject item, MaterialContext fallback)
        {
            string itemPalettePath = ResolvePaletteAssetPath(item);
            if (!string.IsNullOrWhiteSpace(itemPalettePath)
                && (fallback == null || !string.Equals(itemPalettePath, fallback.PaletteAssetPath, StringComparison.Ordinal)))
            {
                var itemPalette = AssetDatabase.LoadAssetAtPath<GreyboxArtBiblePalette>(itemPalettePath);
                if (itemPalette) return itemPalette;
            }
            return fallback?.Palette;
        }

        private static MaterialContext CreateMaterialContext(JObject document)
        {
            string palettePath = ResolvePaletteAssetPath(document);
            if (string.IsNullOrWhiteSpace(palettePath)) return MaterialContext.Empty;
            var palette = AssetDatabase.LoadAssetAtPath<GreyboxArtBiblePalette>(palettePath);
            return palette ? new MaterialContext(palette, palettePath) : MaterialContext.Empty;
        }

        private static string ResolvePaletteAssetPath(JObject item)
        {
            return ResolveUnityAssetPath(
                item,
                new[] { "artBiblePaletteAssetGuid", "artBiblePaletteGuid", "paletteAssetGuid", "paletteGuid", "greyboxPaletteGuid", "artBibleGuid" },
                new[] { "artBiblePaletteAssetPath", "artBiblePalettePath", "paletteAssetPath", "palettePath", "greyboxPalettePath", "artBiblePath", "artBible", "palette" }
            );
        }

        private static string ReadPaletteMaterialLabel(JObject item)
        {
            return ReadString(
                item,
                "materialSlot",
                "materialName",
                "artBibleMaterial",
                "paletteMaterial",
                "paletteColor",
                "artBibleColor",
                "colorToken",
                "materialToken",
                "material"
            );
        }

        private static float ReadPaletteFloat(IReadOnlyList<float> values, int index, float fallback)
        {
            return values != null && index >= 0 && index < values.Count ? values[index] : fallback;
        }

        private static bool ReadPaletteBool(IReadOnlyList<bool> values, int index, bool fallback)
        {
            return values != null && index >= 0 && index < values.Count ? values[index] : fallback;
        }

        private static Color ReadPaletteColor(IReadOnlyList<Color> values, int index, Color fallback)
        {
            return values != null && index >= 0 && index < values.Count ? values[index] : fallback;
        }

        private static MaterialBuilder.RenderPipelineKind ReadPalettePipeline(IReadOnlyList<string> values, int index, MaterialBuilder.RenderPipelineKind fallback)
        {
            return values != null && index >= 0 && index < values.Count
                ? MaterialBuilder.PipelineHintToKind(values[index], fallback)
                : fallback;
        }

        private static string ResolveVisualAssetPath(JObject item)
        {
            return ResolveUnityAssetPath(
                item,
                new[] { "unityAssetGuid", "assetGuid", "meshAssetGuid", "prefabAssetGuid", "modelAssetGuid", "unityMeshGuid", "unityPrefabGuid" },
                new[] { "prefabAssetPath", "meshAssetPath", "unityAssetPath", "assetPath", "prefab", "modelAssetPath", "modelPath" }
            );
        }

        private static string ResolveUnityAssetPath(JObject item, string[] guidKeys, string[] pathKeys)
        {
            string assetGuid = ReadString(item, guidKeys);
            if (!string.IsNullOrWhiteSpace(assetGuid))
            {
                string path = AssetDatabase.GUIDToAssetPath(assetGuid.Trim());
                path = SafeUnityAssetPath(path);
                if (!string.IsNullOrWhiteSpace(path)) return path;
            }

            return SafeUnityAssetPath(ReadString(item, pathKeys));
        }

        private static string SafeUnityAssetPath(string assetPath)
        {
            string normalized = (assetPath ?? "").Trim().Replace('\\', '/');
            if (string.IsNullOrWhiteSpace(normalized)) return "";
            if (normalized.Length > 512) return "";
            if (!normalized.StartsWith("Assets/", StringComparison.Ordinal)) return "";
            foreach (char c in normalized)
            {
                if (char.IsControl(c)) return "";
            }

            string[] segments = normalized.Split('/');
            if (segments.Length < 2) return "";
            foreach (string segment in segments)
            {
                if (string.IsNullOrWhiteSpace(segment)) return "";
                if (segment == "." || segment == "..") return "";
            }

            return normalized;
        }

        private static string MarkerId(JObject item)
        {
            foreach (string key in StableJsonPathKeyFields)
            {
                string value = JsonPathSelectorValue(item, key);
                if (!string.IsNullOrWhiteSpace(value)) return SafeMarkerId(value);
            }
            return "";
        }

        private static string MarkerDisplayName(JObject item, string markerId)
        {
            string name = SafeDisplayName(item.Value<string>("name"));
            return string.IsNullOrWhiteSpace(name) ? markerId ?? "" : name;
        }

        private static string UniqueMarkerId(string markerId, HashSet<string> usedMarkerIds)
        {
            string seed = SafeMarkerId(markerId);
            if (string.IsNullOrWhiteSpace(seed)) return "";
            string candidate = seed;
            int suffix = 2;
            while (!usedMarkerIds.Add(candidate))
            {
                candidate = $"{seed}-{suffix}";
                suffix++;
            }
            return candidate;
        }

        private static string UniqueObjectName(string objectName, HashSet<string> usedObjectNames)
        {
            string seed = SafeName(objectName);
            if (usedObjectNames == null || usedObjectNames.Add(seed)) return seed;
            string candidate = seed;
            int suffix = 2;
            do
            {
                candidate = $"{seed} {suffix}";
                suffix++;
            }
            while (!usedObjectNames.Add(candidate));
            return candidate;
        }

        private static Dictionary<string, int> CountPathKeys(JArray items)
        {
            var counts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            if (items == null) return counts;
            foreach (JToken token in items)
            {
                var item = token as JObject;
                if (item == null) continue;
                string key = PathKey(item);
                if (string.IsNullOrWhiteSpace(key)) continue;
                counts.TryGetValue(key, out int count);
                counts[key] = count + 1;
            }
            return counts;
        }

        private static int CountObjectItems(JArray items)
        {
            int count = 0;
            if (items == null) return count;
            foreach (JToken token in items)
            {
                if (token is JObject) count++;
            }
            return count;
        }

        private static string PathKey(JObject item)
        {
            foreach (string fieldName in StableJsonPathKeyFields)
            {
                string value = JsonPathSelectorValue(item, fieldName);
                if (!string.IsNullOrWhiteSpace(value)) return $"{fieldName}:{value}";
            }
            return "";
        }

        private static string ItemJsonPath(string collection, JObject item, int index, Dictionary<string, int> pathKeyCounts = null)
        {
            foreach (string fieldName in StableJsonPathKeyFields)
            {
                string value = JsonPathSelectorValue(item, fieldName);
                if (!string.IsNullOrWhiteSpace(value) && IsUniquePathKey(pathKeyCounts, $"{fieldName}:{value}"))
                {
                    return $"$.{collection}[{fieldName}={value}]";
                }
            }
            return $"$.{collection}[{index}]";
        }

        private static string JsonPathSelectorValue(JObject item, params string[] keys)
        {
            foreach (string key in keys)
            {
                string value = JsonPathSelectorValue(item[key]);
                if (IsSafeJsonPathSelectorValue(value)) return value;
            }
            return "";
        }

        private static string JsonPathSelectorValue(JToken token)
        {
            if (token == null) return "";
            try
            {
                switch (token.Type)
                {
                    case JTokenType.String:
                        return (token.Value<string>() ?? "").Trim();
                    case JTokenType.Integer:
                        return token.Value<long>().ToString(CultureInfo.InvariantCulture);
                    case JTokenType.Float:
                        double number = token.Value<double>();
                        return double.IsNaN(number) || double.IsInfinity(number)
                            ? ""
                            : number.ToString("R", CultureInfo.InvariantCulture);
                    default:
                        return "";
                }
            }
            catch
            {
                return "";
            }
        }

        private static bool IsSafeJsonPathSelectorValue(string value)
        {
            if (string.IsNullOrWhiteSpace(value) || value.Length > MaxJsonPathSelectorValueLength) return false;
            if (value.Contains("..") || value.Contains("[") || value.Contains("]") || value.Contains("=")) return false;
            if (value.Contains("/") || value.Contains("\\") || value.Contains("://")) return false;
            foreach (char c in value)
            {
                if (char.IsControl(c)) return false;
            }
            return true;
        }

        private static string CollectionPathFromJsonPath(string jsonPath, string fallback)
        {
            string normalized = (jsonPath ?? "").Trim();
            if (normalized.StartsWith("$.", StringComparison.Ordinal)) return normalized.Substring(2);
            return string.IsNullOrWhiteSpace(normalized) ? fallback : normalized;
        }

        private static bool IsUniquePathKey(Dictionary<string, int> pathKeyCounts, string key)
        {
            return pathKeyCounts == null || (pathKeyCounts.TryGetValue(key, out int count) && count == 1);
        }

        private static string SafeName(string value)
        {
            string input = string.IsNullOrWhiteSpace(value) ? "Greybox Artifact" : value.Trim();
            var builder = new StringBuilder(input.Length);
            foreach (char c in input)
            {
                builder.Append(IsUnsafeUnityNameChar(c) ? '_' : c);
                if (builder.Length >= MaxUnityObjectNameLength) break;
            }
            string result = builder.ToString().Trim();
            return string.IsNullOrWhiteSpace(result) ? "Greybox Artifact" : result;
        }

        private static string SafeMarkerId(string value)
        {
            string input = (value ?? "").Trim();
            if (string.IsNullOrWhiteSpace(input)) return "";
            var builder = new StringBuilder(input.Length);
            bool previousDash = false;
            foreach (char c in input)
            {
                bool safe = char.IsLetterOrDigit(c) || c == '_' || c == '-';
                if (safe)
                {
                    builder.Append(c);
                    previousDash = c == '-';
                }
                else if (!previousDash)
                {
                    builder.Append('-');
                    previousDash = true;
                }
                if (builder.Length >= MaxMarkerIdLength) break;
            }
            return builder.ToString().Trim('-');
        }

        private static string SafeDisplayName(string value)
        {
            string input = (value ?? "").Trim();
            if (string.IsNullOrWhiteSpace(input)) return "";
            var builder = new StringBuilder(input.Length);
            bool previousSpace = false;
            foreach (char c in input)
            {
                if (char.IsControl(c) || char.IsWhiteSpace(c))
                {
                    if (previousSpace) continue;
                    builder.Append(' ');
                    previousSpace = true;
                }
                else
                {
                    builder.Append(c);
                    previousSpace = false;
                }
                if (builder.Length >= MaxDisplayNameLength) break;
            }
            return builder.ToString().Trim();
        }

        private static string SafeDesignPropertyKey(string value)
        {
            string input = (value ?? "").Trim();
            if (string.IsNullOrWhiteSpace(input)) return "";
            var builder = new StringBuilder(input.Length);
            bool previousDash = false;
            foreach (char c in input)
            {
                bool safe = char.IsLetterOrDigit(c) || c == '_' || c == '-' || c == '.';
                if (safe)
                {
                    builder.Append(c);
                    previousDash = c == '-';
                }
                else if (!previousDash)
                {
                    builder.Append('-');
                    previousDash = true;
                }
                if (builder.Length >= MaxDesignPropertyKeyLength) break;
            }
            return builder.ToString().Trim('-', '.');
        }

        private static string SafeRuntimeString(string value)
        {
            return SafeInspectorString(value, MaxRuntimeStringLength);
        }

        private static string SafeInspectorString(string value, int maxLength)
        {
            string input = (value ?? "").Trim();
            if (string.IsNullOrWhiteSpace(input)) return "";
            var builder = new StringBuilder(input.Length);
            bool previousSpace = false;
            foreach (char c in input)
            {
                if (char.IsControl(c) || char.IsWhiteSpace(c))
                {
                    if (previousSpace) continue;
                    builder.Append(' ');
                    previousSpace = true;
                }
                else
                {
                    builder.Append(c);
                    previousSpace = false;
                }
                if (builder.Length >= maxLength) break;
            }
            return builder.ToString().Trim();
        }

        private static bool IsUnsafeUnityNameChar(char c)
        {
            if (char.IsControl(c) || c == '/' || c == '\\') return true;
            foreach (char invalid in System.IO.Path.GetInvalidFileNameChars())
            {
                if (c == invalid) return true;
            }
            return false;
        }

        private static readonly HashSet<string> SkippedDesignPropertyKeys = new HashSet<string>(StringComparer.Ordinal)
        {
            "id",
            "name",
            "position",
            "location",
            "translation",
            "pos",
            "x",
            "y",
            "z",
            "transform",
            "radius",
            "rotation",
            "rotationEuler",
            "euler",
            "rotationX",
            "rotationY",
            "rotationZ",
            "pitch",
            "yaw",
            "roll",
            "scale",
            "size",
            "unityPrimitive",
            "primitive",
            "shape",
            "prefabAssetPath",
            "meshAssetPath",
            "modelAssetPath",
            "unityAssetPath",
            "assetPath",
            "prefab",
            "modelPath",
            "materialAssetPath",
            "unityMaterialPath",
            "materialPath",
            "material",
            "materialSlot",
            "materialName",
            "artBibleMaterial",
            "paletteMaterial",
            "paletteColor",
            "artBibleColor",
            "colorToken",
            "materialToken",
            "unityAssetGuid",
            "assetGuid",
            "meshAssetGuid",
            "prefabAssetGuid",
            "modelAssetGuid",
            "unityMeshGuid",
            "unityPrefabGuid",
            "materialAssetGuid",
            "unityMaterialGuid",
            "materialGuid",
            "unityMaterialAssetGuid",
            "artBiblePaletteAssetGuid",
            "artBiblePaletteGuid",
            "paletteAssetGuid",
            "paletteGuid",
            "greyboxPaletteGuid",
            "artBibleGuid",
            "artBiblePaletteAssetPath",
            "artBiblePalettePath",
            "paletteAssetPath",
            "palettePath",
            "greyboxPalettePath",
            "artBiblePath",
            "artBible",
            "palette",
            "unityTag",
            "gameObjectTag",
            "unityLayer",
            "unityLayerName",
            "layerName",
            "unityStatic",
            "isStatic",
            "unityActive",
            "activeSelf",
            "active"
        };

        private static readonly string[] StableJsonPathKeyFields =
        {
            "id",
            "actorId",
            "spawnId",
            "objectiveId",
            "hazardId",
            "checkpointId",
            "goalId",
            "coinId",
            "collectibleId",
            "tileId",
            "abilityId",
            "routeId",
            "waveId",
            "lootTableId",
            "roomId",
            "encounterId",
            "connectionId",
            "nodeId",
            "slug",
            "guid",
            "name"
        };

        private static readonly HashSet<string> ForbiddenDesignPropertyKeys = new HashSet<string>(StringComparer.Ordinal)
        {
            "__proto__",
            "constructor",
            "prototype",
        };

        private readonly struct TileSemantics
        {
            public TileSemantics(bool walkable, bool blocksMovement, bool isSpawn, bool isExit, bool isHazard)
            {
                Walkable = walkable;
                BlocksMovement = blocksMovement;
                IsSpawn = isSpawn;
                IsExit = isExit;
                IsHazard = isHazard;
            }

            public bool Walkable { get; }
            public bool BlocksMovement { get; }
            public bool IsSpawn { get; }
            public bool IsExit { get; }
            public bool IsHazard { get; }
        }

        private readonly struct NodeVisual
        {
            public NodeVisual(GameObject gameObject, string unityAssetPath, string unityAssetGuid, string primitive, bool applyFallbackMaterial)
            {
                GameObject = gameObject;
                UnityAssetPath = unityAssetPath ?? "";
                UnityAssetGuid = unityAssetGuid ?? "";
                Primitive = primitive ?? "";
                ApplyFallbackMaterial = applyFallbackMaterial;
            }

            public GameObject GameObject { get; }
            public string UnityAssetPath { get; }
            public string UnityAssetGuid { get; }
            public string Primitive { get; }
            public bool ApplyFallbackMaterial { get; }
        }
    }
}
