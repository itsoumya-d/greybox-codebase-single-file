// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using Greybox.Editor.Generation;
using Greybox.Editor.McpBridge;
using Greybox.Editor.Sync;
using Greybox.Editor.Windows;
using Greybox.Runtime;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using UnityEngine.Tilemaps;

namespace Greybox.Tests.EditMode
{
    public sealed class McpBridgeTests
    {
        [Test]
        public void SceneHierarchyDescriptionIncludesGreyboxMetadataAndEditableFields()
        {
            var root = new GameObject("Arena");
            var boss = new GameObject("Boss");
            boss.transform.SetParent(root.transform, false);
            boss.transform.localPosition = new Vector3(1f, 2f, 3f);
            var marker = boss.AddComponent<GreyboxMarker>();
            marker.ArtifactKind = GreyboxArtifactKind.GameViewport;
            marker.SourceFileName = "levels/arena.gameview.json";
            marker.Collection = "actors";
            marker.MarkerId = "boss";
            marker.MarkerName = "Boss";
            marker.JsonPath = "$.actors[id=boss]";
            marker.PositionJsonPath = "$.actors[id=boss].position";
            var actor = boss.AddComponent<GreyboxActorDefinition>();
            actor.DisplayName = "Gate Boss";
            actor.Health = 2;
            actor.MoveSpeed = 3.5f;
            actor.IsEnemy = true;
            actor.AbilityIds = new[] { "slam", "dash" };
            var designNode = boss.AddComponent<GreyboxDesignNode>();
            designNode.ArtifactKind = GreyboxArtifactKind.GameViewport;
            designNode.Collection = "actors";
            designNode.NodeId = "boss";
            designNode.DisplayName = "Gate Boss";
            designNode.JsonPath = "$.actors[id=boss]";
            designNode.AuthoredPosition = new Vector3(1f, 2f, 3f);
            designNode.AuthoredScale = new Vector3(2f, 2f, 2f);
            designNode.Tags.Add("boss");
            designNode.Properties.Add(new GreyboxDesignProperty
            {
                Key = "phaseCount",
                Kind = GreyboxDesignPropertyKind.Number,
                Value = "2"
            });
            var imported = boss.AddComponent<GreyboxImportedArtifact>();
            imported.ArtifactId = "artifact-arena";
            imported.Kind = GreyboxArtifactKind.GameViewport;
            imported.SourcePath = "Assets/GreyboxGenerated/Artifacts/levels/arena.gameview";
            imported.SourceHash = "source-sha";
            imported.GeneratorCredit = "Greybox + Kai Designer";
            imported.HumanDesignerCredit = "Kai Designer";
            imported.AiDisclosure = "AI-assisted";
            imported.CanonicalGeneratedAssetPath = "Assets/Greybox/Generated/project-a/GameViewports/levels-arena.prefab";
            imported.ExportedAssetPath = "Assets/Greybox/Generated/project-a/GameViewports/levels-arena.greybox-incoming.prefab";
            imported.ImportReceiptId = "artifact-arena";
            imported.ImportReceiptPath = "Assets/Greybox/Generated/project-a/Receipts/levels-arena.asset";
            imported.ExportedToIncomingSidecar = true;
            imported.Watermarked = true;

            try
            {
                var description = GreyboxMcpServer.DescribeForMcp(root);
                var child = description["children"][0];
                Assert.AreEqual("Arena/Boss", child["path"].Value<string>());
                Assert.AreEqual(1f, child["transform"]["localPosition"]["x"].Value<float>());
                Assert.AreEqual("$.actors[id=boss].position", child["roundTripTransform"]["localPosition"]["path"].Value<string>());
                Assert.AreEqual("levels/arena.gameview.json", child["roundTripTransform"]["localPosition"]["sourceFileName"].Value<string>());
                Assert.AreEqual(1f, child["roundTripTransform"]["localPosition"]["value"]["x"].Value<float>());
                Assert.AreEqual("$.actors[id=boss].scale", child["roundTripTransform"]["localScale"]["path"].Value<string>());
                Assert.AreEqual("actors", child["greybox"]["collection"].Value<string>());
                Assert.AreEqual("boss", child["greybox"]["markerId"].Value<string>());
                Assert.AreEqual("$.actors[id=boss].position", child["greybox"]["positionJsonPath"].Value<string>());
                Assert.AreEqual("Gate Boss", child["greyboxDesign"]["displayName"].Value<string>());
                Assert.AreEqual("boss", child["greyboxDesign"]["tags"][0].Value<string>());
                Assert.AreEqual("phaseCount", child["greyboxDesign"]["properties"][0]["key"].Value<string>());
                Assert.AreEqual("Number", child["greyboxDesign"]["properties"][0]["kind"].Value<string>());
                Assert.AreEqual("2", child["greyboxDesign"]["properties"][0]["value"].Value<string>());
                Assert.AreEqual("artifact-arena", child["greyboxImport"]["artifactId"].Value<string>());
                Assert.AreEqual("GameViewport", child["greyboxImport"]["kind"].Value<string>());
                Assert.AreEqual("Assets/GreyboxGenerated/Artifacts/levels/arena.gameview", child["greyboxImport"]["sourcePath"].Value<string>());
                Assert.AreEqual("Assets/Greybox/Generated/project-a/GameViewports/levels-arena.prefab", child["greyboxImport"]["canonicalGeneratedAssetPath"].Value<string>());
                Assert.AreEqual("Assets/Greybox/Generated/project-a/GameViewports/levels-arena.greybox-incoming.prefab", child["greyboxImport"]["exportedAssetPath"].Value<string>());
                Assert.AreEqual("artifact-arena", child["greyboxImport"]["importReceiptId"].Value<string>());
                Assert.AreEqual("Assets/Greybox/Generated/project-a/Receipts/levels-arena.asset", child["greyboxImport"]["importReceiptPath"].Value<string>());
                Assert.False(child["greyboxImport"]["importReceiptExists"].Value<bool>());
                Assert.AreEqual("", child["greyboxImport"]["importReceiptGuid"].Value<string>());
                Assert.AreEqual(16, child["greyboxImport"]["importReceipt"]["maxEntries"].Value<int>());
                Assert.True(child["greyboxImport"]["exportedToIncomingSidecar"].Value<bool>());
                Assert.True(child["greyboxImport"]["watermarked"].Value<bool>());

                var addableComponents = (JArray)child["addableComponents"];
                var lightHint = FindAddableComponent(addableComponents, typeof(Light).FullName);
                Assert.AreEqual(nameof(Light), lightHint["componentName"].Value<string>());
                Assert.AreEqual("unity.addComponent", lightHint["addTool"].Value<string>());
                Assert.AreEqual("Scene", lightHint["category"].Value<string>());
                Assert.False(lightHint["alreadyAttached"].Value<bool>());
                Assert.True(lightHint["canAdd"].Value<bool>());
                Assert.AreEqual(nameof(Light), lightHint["acceptedAliases"][0].Value<string>());
                var actorHint = FindAddableComponent(addableComponents, typeof(GreyboxActorDefinition).FullName);
                Assert.AreEqual("Greybox Runtime", actorHint["category"].Value<string>());
                Assert.True(actorHint["alreadyAttached"].Value<bool>());
                Assert.False(actorHint["allowMultiple"].Value<bool>());
                Assert.False(actorHint["canAdd"].Value<bool>());

                var details = child["componentDetails"];
                Assert.IsNotNull(details);
                Assert.IsTrue(details.ToString().Contains(typeof(GreyboxActorDefinition).FullName));
                Assert.IsTrue(details.ToString().Contains(@"""Health"": 2"));
                Assert.IsTrue(details.ToString().Contains(@"""MoveSpeed"": 3.5"));
                Assert.IsTrue(details.ToString().Contains(@"""DisplayName"": ""Gate Boss"""));
                Assert.IsTrue(details.ToString().Contains(@"""roundTripFields"""));
                Assert.IsTrue(details.ToString().Contains(@"""Health"": {"));
                Assert.IsTrue(details.ToString().Contains(@"""path"": ""$.actors[id=boss].health"""));
                Assert.IsTrue(details.ToString().Contains(@"""sourceFileName"": ""levels/arena.gameview.json"""));
                Assert.IsTrue(details.ToString().Contains(@"""markerId"": ""boss"""));
                Assert.IsTrue(details.ToString().Contains(@"""value"": 2"));
                var actorDetail = FindComponentDetail((JArray)details, typeof(GreyboxActorDefinition).FullName);
                var healthField = FindMemberDetail((JArray)actorDetail["writableFields"], nameof(GreyboxActorDefinition.Health));
                Assert.AreEqual("field", healthField["memberKind"].Value<string>());
                Assert.AreEqual(typeof(int).FullName, healthField["valueType"].Value<string>());
                Assert.AreEqual("integer", healthField["valueSchema"]["kind"].Value<string>());
                Assert.AreEqual(int.MinValue, healthField["valueSchema"]["minimum"].Value<int>());
                Assert.AreEqual(int.MaxValue, healthField["valueSchema"]["maximum"].Value<int>());
                Assert.AreEqual("unity.setField", healthField["setTool"].Value<string>());
                Assert.True(healthField["readable"].Value<bool>());
                Assert.AreEqual(2, healthField["value"].Value<int>());
                Assert.AreEqual("$.actors[id=boss].health", healthField["roundTrip"]["path"].Value<string>());
                var abilityField = FindMemberDetail((JArray)actorDetail["writableFields"], nameof(GreyboxActorDefinition.AbilityIds));
                Assert.AreEqual("stringArray", abilityField["valueSchema"]["kind"].Value<string>());
                Assert.AreEqual(64, abilityField["valueSchema"]["maxItems"].Value<int>());
                CollectionAssert.AreEqual(new[] { "slam", "dash" }, abilityField["value"].Values<string>().ToArray());
                Assert.AreEqual("$.actors[id=boss].abilities", abilityField["roundTrip"]["path"].Value<string>());
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void SceneHierarchyDescriptionIncludesStrictBoundedImportReceiptHealth()
        {
            const string receiptFolder = "Assets/Greybox/Generated/mcp-receipt-tests/Receipts";
            const string receiptPath = receiptFolder + "/boss.asset";
            var root = new GameObject("Receipt Root");
            var receipt = ScriptableObject.CreateInstance<GreyboxImportReceipt>();

            try
            {
                GreyboxGeneratedAssetPaths.EnsureFolder(receiptFolder);
                receipt.ReceiptId = "receipt-boss";
                receipt.ArtifactId = "artifact-boss";
                receipt.Kind = GreyboxArtifactKind.GameViewport;
                receipt.ImportReceiptPath = receiptPath;
                receipt.CanonicalGeneratedAssetPath = "Assets/Greybox/Generated/mcp-receipt-tests/GameViewports/boss.prefab";
                receipt.ExportedAssetPath = "Assets/Greybox/Generated/mcp-receipt-tests/GameViewports/boss.greybox-incoming.prefab";
                receipt.ExportedToIncomingSidecar = true;
                receipt.Watermarked = true;
                receipt.UpdatedAtUnixMs = 123456789L;
                for (int index = 0; index < 18; index++)
                {
                    receipt.GeneratedAssetPaths.Add($"Assets/Greybox/Generated/mcp-receipt-tests/GameViewports/generated-{index:D2}.prefab");
                    receipt.AddressableLabels.Add($"label-{index:D2}");
                    receipt.MissingReferences.Add(new GreyboxMissingReferenceRecord
                    {
                        ObjectPath = $"Root/Child {index:D2}",
                        ComponentType = "UnityEngine.MeshFilter",
                        ReferenceName = "sharedMesh",
                        ExpectedAssetPath = $"Assets/Greybox/Generated/mcp-receipt-tests/Meshes/missing-{index:D2}.asset"
                    });
                }
                AssetDatabase.CreateAsset(receipt, receiptPath);
                receipt = null;
                AssetDatabase.SaveAssets();

                var imported = root.AddComponent<GreyboxImportedArtifact>();
                imported.ArtifactId = "artifact-boss";
                imported.Kind = GreyboxArtifactKind.GameViewport;
                imported.ImportReceiptId = "receipt-boss";
                imported.ImportReceiptPath = receiptPath;

                var description = GreyboxMcpServer.DescribeForMcp(root);
                var import = description["greyboxImport"];
                Assert.AreEqual("receipt-boss", import.Value<string>("importReceiptId"));
                Assert.AreEqual(receiptPath, import.Value<string>("importReceiptPath"));
                Assert.True(import.Value<bool>("importReceiptExists"));
                Assert.AreEqual(AssetDatabase.AssetPathToGUID(receiptPath), import.Value<string>("importReceiptGuid"));

                var summary = import["importReceipt"];
                Assert.AreEqual("receipt-boss", summary.Value<string>("receiptId"));
                Assert.AreEqual("artifact-boss", summary.Value<string>("artifactId"));
                Assert.AreEqual("GameViewport", summary.Value<string>("kind"));
                Assert.True(summary.Value<bool>("exportedToIncomingSidecar"));
                Assert.True(summary.Value<bool>("watermarked"));
                Assert.True(summary.Value<bool>("hasMissingReferences"));
                Assert.AreEqual(18, summary.Value<int>("generatedAssetPathCount"));
                Assert.AreEqual(18, summary.Value<int>("addressableLabelCount"));
                Assert.AreEqual(18, summary.Value<int>("missingReferenceCount"));
                Assert.True(summary.Value<bool>("generatedAssetPathsTruncated"));
                Assert.True(summary.Value<bool>("addressableLabelsTruncated"));
                Assert.True(summary.Value<bool>("missingReferencesTruncated"));
                Assert.AreEqual(16, ((JArray)summary["generatedAssetPaths"]).Count);
                Assert.AreEqual(16, ((JArray)summary["addressableLabels"]).Count);
                Assert.AreEqual(16, ((JArray)summary["missingReferences"]).Count);
                Assert.AreEqual("generated-00.prefab", summary["generatedAssetPaths"][0].Value<string>().Split('/').Last());
                Assert.AreEqual("label-15", summary["addressableLabels"][15].Value<string>());
                Assert.AreEqual("Root/Child 00", summary["missingReferences"][0].Value<string>("objectPath"));
                Assert.AreEqual("sharedMesh", summary["missingReferences"][0].Value<string>("referenceName"));

                imported.ImportReceiptPath = "Assets/Greybox/Generated/mcp-receipt-tests/Receipts/../boss.asset";
                var unsafeDescription = GreyboxMcpServer.DescribeForMcp(root);
                Assert.False(unsafeDescription["greyboxImport"].Value<bool>("importReceiptExists"));
                Assert.AreEqual(0, ((JArray)unsafeDescription["greyboxImport"]["importReceipt"]["generatedAssetPaths"]).Count);
            }
            finally
            {
                if (receipt) Object.DestroyImmediate(receipt);
                Object.DestroyImmediate(root);
                AssetDatabase.DeleteAsset("Assets/Greybox/Generated/mcp-receipt-tests");
            }
        }

        [Test]
        public void SceneHierarchyDescriptionIncludesBoundedTilemapReadback()
        {
            var root = new GameObject("Board");
            var tiles = new GameObject("Tiles");
            tiles.transform.SetParent(root.transform, false);
            tiles.AddComponent<Tilemap>();
            tiles.AddComponent<TilemapRenderer>();
            var metadata = tiles.AddComponent<GreyboxLevelTilemap>();
            var markerChild = new GameObject("Spike Marker");
            markerChild.transform.SetParent(tiles.transform, false);
            markerChild.transform.localPosition = new Vector3(2f, 2f, 0f);
            var marker = markerChild.AddComponent<GreyboxMarker>();
            marker.Collection = "tiles";
            marker.MarkerId = "spike-a";
            marker.MarkerName = "Spike A";
            marker.JsonPath = "$.tilemap.tiles[tileId=spike-a]";
            marker.PositionJsonPath = "$.tilemap.tiles[tileId=spike-a].position";
            metadata.SourceJsonPath = "$.tilemap.tiles";
            metadata.TileCount = 2;
            metadata.BoundsOrigin = new Vector3Int(0, 0, 0);
            metadata.BoundsSize = new Vector3Int(4, 3, 1);
            metadata.ColliderEnabled = true;
            metadata.TileRecords = new[]
            {
                new GreyboxLevelTileRecord
                {
                    TileId = "floor-a",
                    TileType = "floor",
                    SourceJsonPath = "$.tilemap.tiles[tileId=floor-a]",
                    Position = new Vector3Int(1, 2, 0),
                    ColorHex = "#5C6166FF",
                    Walkable = true
                },
                new GreyboxLevelTileRecord
                {
                    TileId = "spike-a",
                    TileType = "hazard",
                    SourceJsonPath = "$.tilemap.tiles[tileId=spike-a]",
                    Position = new Vector3Int(2, 2, 0),
                    ColorHex = "#E94B3CFF",
                    Walkable = true,
                    IsHazard = true
                }
            };
            var tile = ScriptableObject.CreateInstance<Tile>();
            var texture = new Texture2D(1, 1);
            var sprite = Sprite.Create(texture, new Rect(0f, 0f, 1f, 1f), Vector2.one * 0.5f, 1f);
            metadata.TileAssets = new TileBase[] { tile };
            metadata.TileTextures = new[] { texture };
            metadata.TileSprites = new[] { sprite };

            try
            {
                var description = GreyboxMcpServer.DescribeForMcp(root);
                var child = description["children"][0];
                var tilemapDetail = FindComponentDetail((JArray)child["componentDetails"], typeof(GreyboxLevelTilemap).FullName);
                var tilemapInfo = tilemapDetail["greyboxTilemap"];
                Assert.AreEqual("$.tilemap.tiles", tilemapInfo["sourceJsonPath"].Value<string>());
                Assert.AreEqual(2, tilemapInfo["tileCount"].Value<int>());
                Assert.AreEqual(2, tilemapInfo["recordCount"].Value<int>());
                Assert.AreEqual(128, tilemapInfo["maxRecords"].Value<int>());
                Assert.False(tilemapInfo["recordsTruncated"].Value<bool>());
                Assert.AreEqual(1, tilemapInfo["tileAssetCount"].Value<int>());
                Assert.AreEqual(1, tilemapInfo["tileTextureCount"].Value<int>());
                Assert.AreEqual(1, tilemapInfo["tileSpriteCount"].Value<int>());
                Assert.True(tilemapInfo["colliderEnabled"].Value<bool>());
                Assert.AreEqual(4, tilemapInfo["boundsSize"]["x"].Value<int>());
                Assert.AreEqual("floor-a", tilemapInfo["records"][0]["tileId"].Value<string>());
                Assert.AreEqual(1, tilemapInfo["records"][0]["position"]["x"].Value<int>());
                Assert.AreEqual("spike-a", tilemapInfo["records"][1]["tileId"].Value<string>());
                Assert.True(tilemapInfo["records"][1]["isHazard"].Value<bool>());
                Assert.AreEqual("#E94B3CFF", tilemapInfo["records"][1]["colorHex"].Value<string>());
                Assert.AreEqual(2f, tilemapInfo["records"][1]["worldPosition"]["x"].Value<float>());
                Assert.AreEqual(GlobalObjectId.GetGlobalObjectIdSlow(markerChild).ToString(), tilemapInfo["records"][1]["markerGameObjectId"].Value<string>());
                Assert.AreEqual("Spike A", tilemapInfo["records"][1]["markerName"].Value<string>());
                Assert.AreEqual("Board/Tiles/Spike Marker", tilemapInfo["records"][1]["markerHierarchyPath"].Value<string>());
                var editableType = tilemapInfo["records"][1]["editableFields"]["type"];
                Assert.AreEqual("unity.setField", editableType["setTool"].Value<string>());
                Assert.AreEqual(typeof(GreyboxLevelTilemap).FullName, editableType["componentType"].Value<string>());
                Assert.AreEqual("tiles[tileId=spike-a].type", editableType["fieldName"].Value<string>());
                Assert.AreEqual("$.tilemap.tiles[tileId=spike-a].type", editableType["roundTrip"]["path"].Value<string>());
                Assert.AreEqual("hazard", editableType["roundTrip"]["value"].Value<string>());
                Assert.AreEqual("boolean", tilemapInfo["records"][1]["editableFields"]["walkable"]["valueSchema"]["kind"].Value<string>());
                Assert.AreEqual("vector3", tilemapInfo["records"][1]["editableFields"]["position"]["valueSchema"]["kind"].Value<string>());
                Assert.AreEqual("tiles[tileId=spike-a].position", tilemapInfo["records"][1]["editableFields"]["position"]["fieldName"].Value<string>());
                Assert.AreEqual("$.tilemap.tiles[tileId=spike-a].position", tilemapInfo["records"][1]["editableFields"]["position"]["roundTrip"]["path"].Value<string>());
            }
            finally
            {
                Object.DestroyImmediate(root);
                Object.DestroyImmediate(tile);
                Object.DestroyImmediate(sprite);
                Object.DestroyImmediate(texture);
            }
        }

        [Test]
        public void SceneHierarchyDescriptionBoundsStringArrayReadbacks()
        {
            var go = new GameObject("Boss");
            var marker = go.AddComponent<GreyboxMarker>();
            marker.ArtifactKind = GreyboxArtifactKind.GameViewport;
            marker.SourceFileName = "levels/arena.gameview.json";
            marker.Collection = "actors";
            marker.MarkerId = "boss";
            marker.JsonPath = "$.actors[id=boss]";
            var actor = go.AddComponent<GreyboxActorDefinition>();
            string[] abilityValues = Enumerable.Range(0, 70).Select(index => $"ability-{index:D2}").ToArray();
            abilityValues[1] = " ";
            abilityValues[2] = "control\nskip";
            abilityValues[3] = new string('x', 300);
            actor.AbilityIds = abilityValues;

            try
            {
                var description = GreyboxMcpServer.DescribeForMcp(go);
                var actorDetail = FindComponentDetail((JArray)description["componentDetails"], typeof(GreyboxActorDefinition).FullName);
                var fieldValues = actorDetail["fields"][nameof(GreyboxActorDefinition.AbilityIds)].Values<string>().ToArray();
                Assert.AreEqual(64, fieldValues.Length);
                Assert.AreEqual("ability-00", fieldValues[0]);
                Assert.AreEqual(new string('x', 256), fieldValues[1]);
                Assert.AreEqual("ability-65", fieldValues[63]);
                Assert.False(fieldValues.Any(string.IsNullOrWhiteSpace));
                Assert.False(fieldValues.Any(value => value.Contains("\n")));

                var abilityField = FindMemberDetail((JArray)actorDetail["writableFields"], nameof(GreyboxActorDefinition.AbilityIds));
                CollectionAssert.AreEqual(fieldValues, abilityField["value"].Values<string>().ToArray());
                CollectionAssert.AreEqual(fieldValues, abilityField["roundTrip"]["value"].Values<string>().ToArray());
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void SceneHierarchyDescriptionMarksDepthTruncation()
        {
            var root = new GameObject("Depth 0");
            var current = root;
            for (int i = 1; i <= 35; i++)
            {
                var child = new GameObject($"Depth {i}");
                child.transform.SetParent(current.transform, false);
                current = child;
            }

            try
            {
                JObject cursor = GreyboxMcpServer.DescribeForMcp(root);
                for (int depth = 0; depth < 32; depth++)
                {
                    Assert.AreEqual(depth, cursor["mcpHierarchy"]["depth"].Value<int>());
                    Assert.False(cursor["mcpHierarchy"]["childrenTruncated"].Value<bool>());
                    cursor = (JObject)cursor["children"][0];
                }

                Assert.AreEqual(32, cursor["mcpHierarchy"]["depth"].Value<int>());
                Assert.AreEqual(32, cursor["mcpHierarchy"]["maxDepth"].Value<int>());
                Assert.True(cursor["mcpHierarchy"]["childrenTruncated"].Value<bool>());
                Assert.True(cursor["mcpHierarchy"]["depthExceeded"].Value<bool>());
                Assert.AreEqual(0, ((JArray)cursor["children"]).Count);
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void SceneHierarchyDescriptionIncludesPrefabMetadataForPrefabInstances()
        {
            string folder = CreateTempAssetFolder();
            string prefabPath = $"{folder}/BossPrefab.prefab";
            var prefabRoot = new GameObject("Boss Prefab");
            GameObject instance = null;

            try
            {
                var prefabAsset = PrefabUtility.SaveAsPrefabAsset(prefabRoot, prefabPath);
                Object.DestroyImmediate(prefabRoot);
                prefabRoot = null;
                instance = (GameObject)PrefabUtility.InstantiatePrefab(prefabAsset);

                var description = GreyboxMcpServer.DescribeForMcp(instance);
                var prefab = description["unityPrefab"];
                Assert.False(prefab["isPartOfPrefabAsset"].Value<bool>());
                Assert.True(prefab["isPartOfPrefabInstance"].Value<bool>());
                Assert.True(prefab["isAnyPrefabInstanceRoot"].Value<bool>());
                Assert.AreEqual("Connected", prefab["prefabInstanceStatus"].Value<string>());
                Assert.AreEqual("", prefab["assetPath"].Value<string>());
                Assert.AreEqual(prefabPath, prefab["nearestPrefabAssetPath"].Value<string>());
                Assert.AreEqual(AssetDatabase.AssetPathToGUID(prefabPath), prefab["nearestPrefabAssetGuid"].Value<string>());
                Assert.AreEqual(prefabPath, prefab["sourcePrefabAssetPath"].Value<string>());
                Assert.AreEqual(AssetDatabase.AssetPathToGUID(prefabPath), prefab["sourcePrefabAssetGuid"].Value<string>());
            }
            finally
            {
                if (prefabRoot) Object.DestroyImmediate(prefabRoot);
                if (instance) Object.DestroyImmediate(instance);
                AssetDatabase.DeleteAsset(folder);
            }
        }

        [Test]
        public void SceneHierarchyDescriptionListsAssignableAssetReferenceFields()
        {
            string folder = CreateTempAssetFolder();
            string meshPath = $"{folder}/BossMesh.asset";
            string materialPath = $"{folder}/BossMaterial.mat";
            var mesh = new Mesh
            {
                vertices = new[] { Vector3.zero, Vector3.right, Vector3.up },
                triangles = new[] { 0, 1, 2 },
            };
            var material = MaterialBuilder.Colored(new Color(1f, 0.42f, 0.21f), "Boss Material");
            var go = new GameObject("Boss Visual");
            var meshFilter = go.AddComponent<MeshFilter>();
            var renderer = go.AddComponent<MeshRenderer>();
            var unsafeSurface = go.AddComponent<UnsafeMutableSurfaceComponent>();

            try
            {
                AssetDatabase.CreateAsset(mesh, meshPath);
                AssetDatabase.CreateAsset(material, materialPath);
                meshFilter.sharedMesh = mesh;
                renderer.sharedMaterial = material;
                unsafeSurface.MeshReference = mesh;

                var description = GreyboxMcpServer.DescribeForMcp(go);
                var details = (JArray)description["componentDetails"];
                var meshFilterDetail = FindComponentDetail(details, typeof(MeshFilter).FullName);
                var sharedMesh = FindMemberDetail((JArray)meshFilterDetail["assetReferenceFields"], nameof(MeshFilter.sharedMesh));
                Assert.AreEqual("property", sharedMesh["memberKind"].Value<string>());
                Assert.AreEqual(typeof(Mesh).FullName, sharedMesh["valueType"].Value<string>());
                Assert.AreEqual("unity.assignAsset", sharedMesh["assignTool"].Value<string>());
                Assert.True(sharedMesh["readable"].Value<bool>());
                Assert.True(sharedMesh["isAssigned"].Value<bool>());
                Assert.AreEqual(meshPath, sharedMesh["assetPath"].Value<string>());
                Assert.AreEqual(AssetDatabase.AssetPathToGUID(meshPath), sharedMesh["assetGuid"].Value<string>());

                var rendererDetail = FindComponentDetail(details, typeof(MeshRenderer).FullName);
                var sharedMaterial = FindMemberDetail((JArray)rendererDetail["assetReferenceFields"], nameof(Renderer.sharedMaterial));
                Assert.AreEqual("property", sharedMaterial["memberKind"].Value<string>());
                Assert.AreEqual(typeof(Material).FullName, sharedMaterial["valueType"].Value<string>());
                Assert.AreEqual("unity.assignAsset", sharedMaterial["assignTool"].Value<string>());
                Assert.True(sharedMaterial["readable"].Value<bool>());
                Assert.True(sharedMaterial["isAssigned"].Value<bool>());
                Assert.AreEqual(materialPath, sharedMaterial["assetPath"].Value<string>());
                Assert.AreEqual(AssetDatabase.AssetPathToGUID(materialPath), sharedMaterial["assetGuid"].Value<string>());
                Assert.IsFalse(((JArray)rendererDetail["assetReferenceFields"])
                    .Any(item => item.Value<string>("name") == nameof(Renderer.material)));

                var unsafeDetail = FindComponentDetail(details, typeof(UnsafeMutableSurfaceComponent).FullName);
                var meshReference = FindMemberDetail((JArray)unsafeDetail["assetReferenceFields"], nameof(UnsafeMutableSurfaceComponent.MeshReference));
                Assert.AreEqual("field", meshReference["memberKind"].Value<string>());
                Assert.AreEqual(typeof(Mesh).FullName, meshReference["valueType"].Value<string>());
                Assert.AreEqual(meshPath, meshReference["assetPath"].Value<string>());
                var fields = (JObject)unsafeDetail["fields"];
                Assert.IsFalse(fields.ContainsKey(nameof(UnsafeMutableSurfaceComponent.TransientScore)));
                Assert.IsFalse(fields.ContainsKey(nameof(UnsafeMutableSurfaceComponent.HiddenScore)));
                Assert.IsFalse(fields.ContainsKey(nameof(UnsafeMutableSurfaceComponent.LegacyScore)));
                Assert.IsFalse(fields.ContainsKey(nameof(UnsafeMutableSurfaceComponent.ReadOnlyScore)));
                Assert.IsFalse(((JArray)unsafeDetail["writableFields"])
                    .Any(item => item.Value<string>("name") == nameof(UnsafeMutableSurfaceComponent.TransientScore)));
                Assert.IsFalse(((JArray)unsafeDetail["writableFields"])
                    .Any(item => item.Value<string>("name") == nameof(UnsafeMutableSurfaceComponent.HiddenScore)));
                Assert.IsFalse(((JArray)unsafeDetail["assetReferenceFields"])
                    .Any(item => item.Value<string>("name") == nameof(UnsafeMutableSurfaceComponent.LegacyMeshReference)));
                Assert.IsFalse(((JArray)unsafeDetail["assetReferenceFields"])
                    .Any(item => item.Value<string>("name") == nameof(UnsafeMutableSurfaceComponent.RuntimeMeshReference)));
                Assert.IsFalse(((JArray)unsafeDetail["assetReferenceFields"])
                    .Any(item => item.Value<string>("name") == nameof(UnsafeMutableSurfaceComponent.HiddenMeshReference)));
            }
            finally
            {
                Object.DestroyImmediate(go);
                AssetDatabase.DeleteAsset(folder);
            }
        }

        [Test]
        public void SceneHierarchyDescriptionListsWritablePropertiesForUnityComponents()
        {
            var go = new GameObject("Key Light");
            var light = go.AddComponent<Light>();
            light.intensity = 2.5f;
            light.color = new Color(1f, 0.42f, 0.21f);
            light.type = LightType.Spot;

            try
            {
                var description = GreyboxMcpServer.DescribeForMcp(go);
                var details = (JArray)description["componentDetails"];
                var lightDetail = FindComponentDetail(details, typeof(Light).FullName);

                var intensity = FindMemberDetail((JArray)lightDetail["writableProperties"], nameof(Light.intensity));
                Assert.AreEqual("property", intensity["memberKind"].Value<string>());
                Assert.AreEqual(typeof(float).FullName, intensity["valueType"].Value<string>());
                Assert.AreEqual("number", intensity["valueSchema"]["kind"].Value<string>());
                Assert.True(intensity["valueSchema"]["finite"].Value<bool>());
                Assert.AreEqual("unity.setField", intensity["setTool"].Value<string>());
                Assert.True(intensity["readable"].Value<bool>());
                Assert.AreEqual(2.5f, intensity["value"].Value<float>());

                var color = FindMemberDetail((JArray)lightDetail["writableProperties"], nameof(Light.color));
                Assert.AreEqual("property", color["memberKind"].Value<string>());
                Assert.AreEqual(typeof(Color).FullName, color["valueType"].Value<string>());
                Assert.AreEqual("color", color["valueSchema"]["kind"].Value<string>());
                Assert.Contains("#RRGGBB", color["valueSchema"]["formats"].ToObject<string[]>());
                Assert.AreEqual(1f, color["value"]["r"].Value<float>());
                Assert.AreEqual(0.42f, color["value"]["g"].Value<float>(), 0.01f);
                Assert.AreEqual(0.21f, color["value"]["b"].Value<float>(), 0.01f);

                var type = FindMemberDetail((JArray)lightDetail["writableProperties"], nameof(Light.type));
                Assert.AreEqual("property", type["memberKind"].Value<string>());
                Assert.AreEqual(typeof(LightType).FullName, type["valueType"].Value<string>());
                Assert.AreEqual("enum", type["valueSchema"]["kind"].Value<string>());
                Assert.AreEqual("Spot", type["value"].Value<string>());
                Assert.Contains("Directional", type["allowedEnumValues"].ToObject<string[]>());
                Assert.Contains("Directional", type["valueSchema"]["allowedEnumValues"].ToObject<string[]>());
                Assert.Contains("Spot", type["allowedEnumValues"].ToObject<string[]>());
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void SceneHierarchyDescriptionListsWritableGameObjectMetadata()
        {
            int ignoreRaycastLayer = LayerMask.NameToLayer("Ignore Raycast");
            var go = new GameObject("Boss");
            var marker = go.AddComponent<GreyboxMarker>();
            marker.ArtifactKind = GreyboxArtifactKind.GameViewport;
            marker.SourceFileName = "levels/arena.gameview.json";
            marker.Collection = "actors";
            marker.MarkerId = "boss";
            marker.JsonPath = "$.actors[id=boss]";
            go.tag = "Player";
            go.layer = ignoreRaycastLayer;
            go.isStatic = true;
            go.SetActive(false);

            try
            {
                var description = GreyboxMcpServer.DescribeForMcp(go);
                var fields = description["writableGameObjectFields"];
                Assert.False(description["activeSelf"].Value<bool>());

                var tag = fields[nameof(GameObject.tag)];
                Assert.AreEqual(nameof(GameObject.tag), tag["fieldName"].Value<string>());
                Assert.AreEqual(typeof(GameObject).FullName, tag["componentType"].Value<string>());
                Assert.AreEqual(typeof(string).FullName, tag["valueType"].Value<string>());
                Assert.AreEqual("string", tag["valueSchema"]["kind"].Value<string>());
                Assert.AreEqual(4096, tag["valueSchema"]["maxLength"].Value<int>());
                Assert.AreEqual("Player", tag["value"].Value<string>());
                Assert.AreEqual("unity.setField", tag["setTool"].Value<string>());
                Assert.AreEqual("unityTag", tag["acceptedAliases"][1].Value<string>());
                Assert.Contains("Player", tag["allowedTags"].ToObject<string[]>());
                Assert.AreEqual("$.actors[id=boss].unityTag", tag["roundTrip"]["path"].Value<string>());

                var layer = fields[nameof(GameObject.layer)];
                Assert.AreEqual(ignoreRaycastLayer, layer["value"].Value<int>());
                Assert.AreEqual("integer", layer["valueSchema"]["kind"].Value<string>());
                Assert.AreEqual("Ignore Raycast", layer["layerName"].Value<string>());
                Assert.True(layer["propagatesToChildren"].Value<bool>());
                Assert.True(layer["allowedLayers"].ToObject<JObject[]>()
                    .Any(item => item.Value<int>("index") == ignoreRaycastLayer && item.Value<string>("name") == "Ignore Raycast"));
                Assert.AreEqual("unityLayer", layer["acceptedAliases"][1].Value<string>());
                Assert.AreEqual("$.actors[id=boss].unityLayer", layer["roundTrip"]["path"].Value<string>());

                var isStatic = fields[nameof(GameObject.isStatic)];
                Assert.True(isStatic["value"].Value<bool>());
                Assert.AreEqual("boolean", isStatic["valueSchema"]["kind"].Value<string>());
                Assert.AreEqual("unityStatic", isStatic["acceptedAliases"][2].Value<string>());
                Assert.AreEqual("$.actors[id=boss].unityStatic", isStatic["roundTrip"]["path"].Value<string>());

                var activeSelf = fields[nameof(GameObject.activeSelf)];
                Assert.False(activeSelf["value"].Value<bool>());
                Assert.AreEqual("unityActive", activeSelf["acceptedAliases"][2].Value<string>());
                Assert.AreEqual("$.actors[id=boss].unityActive", activeSelf["roundTrip"]["path"].Value<string>());
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void SetFieldQueuesRoundTripEditForMcpDrivenChanges()
        {
            var go = new GameObject("Boss");
            var marker = go.AddComponent<GreyboxMarker>();
            marker.ArtifactKind = GreyboxArtifactKind.GameViewport;
            marker.SourceFileName = "levels/arena.gameview.json";
            marker.Collection = "actors";
            marker.MarkerId = "boss";
            marker.JsonPath = "$.actors[id=boss]";
            var actor = go.AddComponent<GreyboxActorDefinition>();
            actor.Health = 2;

            try
            {
                ClearPendingRoundTripEdits();
                var result = InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(GreyboxActorDefinition).FullName,
                    ["fieldName"] = nameof(GreyboxActorDefinition.Health),
                    ["value"] = 4
                });

                Assert.AreEqual(4, actor.Health);
                Assert.AreEqual(2, result["previousValue"].Value<int>());
                Assert.AreEqual(4, result["value"].Value<int>());
                Assert.AreEqual("$.actors[id=boss].health", result["roundTripPath"].Value<string>());
                Assert.AreEqual(4, result["roundTripValue"].Value<int>());
                Assert.True(result["sceneDirty"].Value<bool>());
                Assert.AreEqual(1, PendingRoundTripFieldEditCount());
            }
            finally
            {
                ClearPendingRoundTripEdits();
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void SetFieldKeepsGreyboxDisplayNameMetadataCurrent()
        {
            var go = new GameObject("Boss");
            var marker = go.AddComponent<GreyboxMarker>();
            marker.ArtifactKind = GreyboxArtifactKind.GameViewport;
            marker.SourceFileName = "levels/arena.gameview.json";
            marker.Collection = "actors";
            marker.MarkerId = "boss";
            marker.MarkerName = "Boss";
            marker.JsonPath = "$.actors[id=boss]";
            var designNode = go.AddComponent<GreyboxDesignNode>();
            designNode.DisplayName = "Boss";
            var actor = go.AddComponent<GreyboxActorDefinition>();
            actor.DisplayName = "Boss";

            try
            {
                ClearPendingRoundTripEdits();
                var result = InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(GreyboxActorDefinition).FullName,
                    ["fieldName"] = nameof(GreyboxActorDefinition.DisplayName),
                    ["value"] = "Gate Boss"
                });

                Assert.AreEqual("Gate Boss", actor.DisplayName);
                Assert.AreEqual("Gate Boss", marker.MarkerName);
                Assert.AreEqual("Gate Boss", designNode.DisplayName);
                Assert.AreEqual("Gate Boss", go.name);
                Assert.AreEqual("$.actors[id=boss].name", result["roundTripPath"].Value<string>());
                Assert.AreEqual("Gate Boss", result["roundTripValue"].Value<string>());
                Assert.AreEqual(1, PendingRoundTripFieldEditCount());
            }
            finally
            {
                ClearPendingRoundTripEdits();
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void SetFieldRefreshesNameSelectorMetadataAfterQueuingOldPathEdit()
        {
            var group = new GameObject("Actors");
            var go = new GameObject("Scout");
            go.transform.SetParent(group.transform, false);
            var marker = go.AddComponent<GreyboxMarker>();
            marker.ArtifactKind = GreyboxArtifactKind.GameViewport;
            marker.SourceFileName = "levels/arena.gameview.json";
            marker.Collection = "actors";
            marker.MarkerId = "Scout";
            marker.MarkerName = "Scout";
            marker.JsonPath = "$.actors[name=Scout]";
            marker.PositionJsonPath = "$.actors[name=Scout].position";
            var designNode = go.AddComponent<GreyboxDesignNode>();
            designNode.Collection = "actors";
            designNode.NodeId = "Scout";
            designNode.DisplayName = "Scout";
            designNode.JsonPath = "$.actors[name=Scout]";
            var actor = go.AddComponent<GreyboxActorDefinition>();
            actor.DisplayName = "Scout";

            try
            {
                ClearPendingRoundTripEdits();
                var result = InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(GreyboxActorDefinition).FullName,
                    ["fieldName"] = nameof(GreyboxActorDefinition.DisplayName),
                    ["value"] = "Runner"
                });

                Assert.AreEqual("Runner", actor.DisplayName);
                Assert.AreEqual("$.actors[name=Scout].name", result["roundTripPath"].Value<string>());
                Assert.AreEqual("Runner", result["roundTripValue"].Value<string>());
                Assert.AreEqual("Runner", marker.MarkerId);
                Assert.AreEqual("Runner", marker.MarkerName);
                Assert.AreEqual("$.actors[name=Runner]", marker.JsonPath);
                Assert.AreEqual("$.actors[name=Runner].position", marker.PositionJsonPath);
                Assert.AreEqual("Runner", designNode.NodeId);
                Assert.AreEqual("Runner", designNode.DisplayName);
                Assert.AreEqual("$.actors[name=Runner]", designNode.JsonPath);
                Assert.AreEqual("Runner", go.name);
                Assert.AreEqual(1, PendingRoundTripFieldEditCount());
            }
            finally
            {
                ClearPendingRoundTripEdits();
                Object.DestroyImmediate(group);
            }
        }

        [Test]
        public void SetFieldFallsNameSelectorMetadataBackToIndexWhenRenamedUnsafely()
        {
            var group = new GameObject("Actors");
            var go = new GameObject("Scout");
            go.transform.SetParent(group.transform, false);
            var marker = go.AddComponent<GreyboxMarker>();
            marker.ArtifactKind = GreyboxArtifactKind.GameViewport;
            marker.SourceFileName = "levels/arena.gameview.json";
            marker.Collection = "actors";
            marker.MarkerId = "Scout";
            marker.MarkerName = "Scout";
            marker.JsonPath = "$.actors[name=Scout]";
            marker.PositionJsonPath = "$.actors[name=Scout].position";
            var designNode = go.AddComponent<GreyboxDesignNode>();
            designNode.Collection = "actors";
            designNode.NodeId = "Scout";
            designNode.DisplayName = "Scout";
            designNode.JsonPath = "$.actors[name=Scout]";
            var actor = go.AddComponent<GreyboxActorDefinition>();
            actor.DisplayName = "Scout";

            try
            {
                ClearPendingRoundTripEdits();
                var result = InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(GreyboxActorDefinition).FullName,
                    ["fieldName"] = nameof(GreyboxActorDefinition.DisplayName),
                    ["value"] = "Gate Boss"
                });

                Assert.AreEqual("Gate Boss", actor.DisplayName);
                Assert.AreEqual("$.actors[name=Scout].name", result["roundTripPath"].Value<string>());
                Assert.AreEqual("Gate Boss", result["roundTripValue"].Value<string>());
                Assert.AreEqual("Gate-Boss", marker.MarkerId);
                Assert.AreEqual("Gate Boss", marker.MarkerName);
                Assert.AreEqual("$.actors[0]", marker.JsonPath);
                Assert.AreEqual("$.actors[0].position", marker.PositionJsonPath);
                Assert.AreEqual("Gate-Boss", designNode.NodeId);
                Assert.AreEqual("Gate Boss", designNode.DisplayName);
                Assert.AreEqual("$.actors[0]", designNode.JsonPath);
                Assert.AreEqual("Gate Boss", go.name);
                Assert.AreEqual(1, PendingRoundTripFieldEditCount());
            }
            finally
            {
                ClearPendingRoundTripEdits();
                Object.DestroyImmediate(group);
            }
        }

        [Test]
        public void SetFieldKeepsDisplayNameHierarchyLabelsUnique()
        {
            var group = new GameObject("Actors");
            var existing = new GameObject("Gate Boss");
            existing.transform.SetParent(group.transform, false);
            var go = new GameObject("Boss");
            go.transform.SetParent(group.transform, false);
            var marker = go.AddComponent<GreyboxMarker>();
            marker.ArtifactKind = GreyboxArtifactKind.GameViewport;
            marker.SourceFileName = "levels/arena.gameview.json";
            marker.Collection = "actors";
            marker.MarkerId = "boss";
            marker.MarkerName = "Boss";
            marker.JsonPath = "$.actors[id=boss]";
            var designNode = go.AddComponent<GreyboxDesignNode>();
            designNode.DisplayName = "Boss";
            var actor = go.AddComponent<GreyboxActorDefinition>();
            actor.DisplayName = "Boss";

            try
            {
                ClearPendingRoundTripEdits();
                var result = InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(GreyboxActorDefinition).FullName,
                    ["fieldName"] = nameof(GreyboxActorDefinition.DisplayName),
                    ["value"] = "Gate Boss"
                });

                Assert.AreEqual("Gate Boss", actor.DisplayName);
                Assert.AreEqual("Gate Boss", marker.MarkerName);
                Assert.AreEqual("Gate Boss", designNode.DisplayName);
                Assert.AreEqual("Gate Boss", existing.name);
                Assert.AreEqual("Gate Boss 2", go.name);
                Assert.AreEqual("$.actors[id=boss].name", result["roundTripPath"].Value<string>());
                Assert.AreEqual("Gate Boss", result["roundTripValue"].Value<string>());
                Assert.AreEqual(1, PendingRoundTripFieldEditCount());
            }
            finally
            {
                ClearPendingRoundTripEdits();
                Object.DestroyImmediate(group);
            }
        }

        [Test]
        public void SetFieldQueuesRoundTripEditForBoolFields()
        {
            var go = new GameObject("Boss");
            var marker = go.AddComponent<GreyboxMarker>();
            marker.ArtifactKind = GreyboxArtifactKind.GameViewport;
            marker.SourceFileName = "levels/arena.gameview.json";
            marker.Collection = "actors";
            marker.MarkerId = "boss";
            marker.JsonPath = "$.actors[id=boss]";
            var actor = go.AddComponent<GreyboxActorDefinition>();
            actor.IsEnemy = false;

            try
            {
                ClearPendingRoundTripEdits();
                var result = InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(GreyboxActorDefinition).FullName,
                    ["fieldName"] = nameof(GreyboxActorDefinition.IsEnemy),
                    ["value"] = true
                });

                Assert.True(actor.IsEnemy);
                Assert.False(result["previousValue"].Value<bool>());
                Assert.True(result["value"].Value<bool>());
                Assert.AreEqual("$.actors[id=boss].isEnemy", result["roundTripPath"].Value<string>());
                Assert.True(result["roundTripValue"].Value<bool>());
                Assert.AreEqual(1, PendingRoundTripFieldEditCount());
            }
            finally
            {
                ClearPendingRoundTripEdits();
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void SetFieldQueuesRoundTripEditForStringArrayFields()
        {
            var go = new GameObject("Level Room");
            var marker = go.AddComponent<GreyboxMarker>();
            marker.ArtifactKind = GreyboxArtifactKind.LevelBoard;
            marker.SourceFileName = "levels/arena.levelboard.json";
            marker.Collection = "rooms";
            marker.MarkerId = "entry";
            marker.JsonPath = "$.rooms[id=entry]";
            var room = go.AddComponent<GreyboxLevelRoom>();
            room.ConnectedRoomIds = new[] { "old-room" };

            try
            {
                ClearPendingRoundTripEdits();
                var result = InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(GreyboxLevelRoom).FullName,
                    ["fieldName"] = nameof(GreyboxLevelRoom.ConnectedRoomIds),
                    ["value"] = new JArray("hall", "", "boss")
                });

                CollectionAssert.AreEqual(new[] { "hall", "boss" }, room.ConnectedRoomIds);
                CollectionAssert.AreEqual(new[] { "old-room" }, result["previousValue"].Values<string>().ToArray());
                CollectionAssert.AreEqual(new[] { "hall", "boss" }, result["value"].Values<string>().ToArray());
                Assert.AreEqual("$.rooms[id=entry].connectedRoomIds", result["roundTripPath"].Value<string>());
                CollectionAssert.AreEqual(new[] { "hall", "boss" }, result["roundTripValue"].Values<string>().ToArray());
                Assert.AreEqual(1, PendingRoundTripFieldEditCount());
            }
            finally
            {
                ClearPendingRoundTripEdits();
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void SetFieldQueuesRoundTripEditForGameObjectMetadata()
        {
            int ignoreRaycastLayer = LayerMask.NameToLayer("Ignore Raycast");
            var go = new GameObject("Boss");
            var visual = new GameObject("Boss Visual");
            visual.transform.SetParent(go.transform, false);
            var marker = go.AddComponent<GreyboxMarker>();
            marker.ArtifactKind = GreyboxArtifactKind.GameViewport;
            marker.SourceFileName = "levels/arena.gameview.json";
            marker.Collection = "actors";
            marker.MarkerId = "boss";
            marker.JsonPath = "$.actors[id=boss]";

            try
            {
                ClearPendingRoundTripEdits();
                var tagResult = InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(GameObject).FullName,
                    ["fieldName"] = "unityTag",
                    ["value"] = "Player"
                });
                Assert.AreEqual("Player", go.tag);
                Assert.AreEqual(nameof(GameObject.tag), tagResult["fieldName"].Value<string>());
                Assert.AreEqual("$.actors[id=boss].unityTag", tagResult["roundTripPath"].Value<string>());
                Assert.AreEqual("Player", tagResult["roundTripValue"].Value<string>());

                var layerResult = InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(GameObject).FullName,
                    ["fieldName"] = "unityLayer",
                    ["value"] = "Ignore Raycast"
                });
                Assert.AreEqual(ignoreRaycastLayer, go.layer);
                Assert.AreEqual(ignoreRaycastLayer, visual.layer);
                Assert.AreEqual(nameof(GameObject.layer), layerResult["fieldName"].Value<string>());
                Assert.AreEqual("Default", layerResult["previousLayerName"].Value<string>());
                Assert.AreEqual("Ignore Raycast", layerResult["layerName"].Value<string>());
                Assert.True(layerResult["propagatesToChildren"].Value<bool>());
                Assert.AreEqual("$.actors[id=boss].unityLayer", layerResult["roundTripPath"].Value<string>());
                Assert.AreEqual(ignoreRaycastLayer, layerResult["roundTripValue"].Value<int>());

                var staticResult = InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(GameObject).FullName,
                    ["fieldName"] = "unityStatic",
                    ["value"] = true
                });
                Assert.True(go.isStatic);
                Assert.AreEqual("$.actors[id=boss].unityStatic", staticResult["roundTripPath"].Value<string>());

                var activeResult = InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(GameObject).FullName,
                    ["fieldName"] = "active",
                    ["value"] = false
                });
                Assert.False(go.activeSelf);
                Assert.AreEqual(nameof(GameObject.activeSelf), activeResult["fieldName"].Value<string>());
                Assert.AreEqual("$.actors[id=boss].unityActive", activeResult["roundTripPath"].Value<string>());
                Assert.False(activeResult["roundTripValue"].Value<bool>());
                Assert.AreEqual(4, PendingRoundTripFieldEditCount());
            }
            finally
            {
                ClearPendingRoundTripEdits();
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void SetFieldRejectsInvalidGameObjectMetadataValues()
        {
            var go = new GameObject("Boss");
            try
            {
                var missingTag = Assert.Throws<System.InvalidOperationException>(() => InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(GameObject).FullName,
                    ["fieldName"] = "unityTag",
                    ["value"] = "Missing Greybox Tag"
                }));
                StringAssert.Contains("Unity tag is not defined", missingTag.Message);
                Assert.AreEqual("Untagged", go.tag);

                var missingLayer = Assert.Throws<System.InvalidOperationException>(() => InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(GameObject).FullName,
                    ["fieldName"] = "unityLayer",
                    ["value"] = "Missing Greybox Layer"
                }));
                StringAssert.Contains("Unity layer is not defined", missingLayer.Message);
                Assert.AreEqual(0, go.layer);

                var outOfRangeLayer = Assert.Throws<System.InvalidOperationException>(() => InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(GameObject).FullName,
                    ["fieldName"] = "unityLayer",
                    ["value"] = 32
                }));
                StringAssert.Contains("between 0 and 31", outOfRangeLayer.Message);
                Assert.AreEqual(0, go.layer);
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void SetFieldQueuesRoundTripEditForColorFields()
        {
            var go = new GameObject("Greybox Camera");
            var marker = go.AddComponent<GreyboxMarker>();
            marker.ArtifactKind = GreyboxArtifactKind.GameViewport;
            marker.SourceFileName = "levels/arena.gameview.json";
            marker.Collection = "camera";
            marker.MarkerId = "camera";
            marker.JsonPath = "$.camera";
            var camera = go.AddComponent<GreyboxCameraRig>();
            camera.JsonPath = "$.camera";
            camera.BackgroundColor = Color.black;

            try
            {
                ClearPendingRoundTripEdits();
                var result = InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(GreyboxCameraRig).FullName,
                    ["fieldName"] = nameof(GreyboxCameraRig.BackgroundColor),
                    ["value"] = "#FF6B35"
                });

                Assert.AreEqual("#FF6B35", ColorUtility.ToHtmlStringRGB(camera.BackgroundColor).Insert(0, "#"));
                Assert.AreEqual("$.camera.backgroundColor", result["roundTripPath"].Value<string>());
                Assert.AreEqual(1f, result["roundTripValue"]["r"].Value<float>());
                Assert.AreEqual(0.42f, result["roundTripValue"]["g"].Value<float>(), 0.01f);
                Assert.AreEqual(0.21f, result["roundTripValue"]["b"].Value<float>(), 0.01f);
                Assert.AreEqual(1f, result["roundTripValue"]["a"].Value<float>());
                Assert.AreEqual(1, PendingRoundTripFieldEditCount());
            }
            finally
            {
                ClearPendingRoundTripEdits();
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void McpColorInputsMatchAdvertisedSchema()
        {
            var go = new GameObject("Color Strict Target");
            var camera = go.AddComponent<GreyboxCameraRig>();
            camera.BackgroundColor = Color.black;

            try
            {
                var shortHex = Assert.Throws<System.InvalidOperationException>(() => InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(GreyboxCameraRig).FullName,
                    ["fieldName"] = nameof(GreyboxCameraRig.BackgroundColor),
                    ["value"] = "#FFF",
                }));
                StringAssert.Contains("6- or 8-digit", shortHex.Message);
                Assert.AreEqual(Color.black, camera.BackgroundColor);

                var extraArray = Assert.Throws<System.InvalidOperationException>(() => InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(GreyboxCameraRig).FullName,
                    ["fieldName"] = nameof(GreyboxCameraRig.BackgroundColor),
                    ["value"] = new JArray(1f, 0.5f, 0.25f, 1f, 0f),
                }));
                StringAssert.Contains("exactly 3 or 4 numbers", extraArray.Message);
                Assert.AreEqual(Color.black, camera.BackgroundColor);

                var missingChannel = Assert.Throws<System.InvalidOperationException>(() => InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(GreyboxCameraRig).FullName,
                    ["fieldName"] = nameof(GreyboxCameraRig.BackgroundColor),
                    ["value"] = new JObject { ["r"] = 1f, ["g"] = 0.5f },
                }));
                StringAssert.Contains("numeric r/g/b", missingChannel.Message);
                Assert.AreEqual(Color.black, camera.BackgroundColor);

                var extraChannel = Assert.Throws<System.InvalidOperationException>(() => InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(GreyboxCameraRig).FullName,
                    ["fieldName"] = nameof(GreyboxCameraRig.BackgroundColor),
                    ["value"] = new JObject { ["r"] = 1f, ["g"] = 0.5f, ["b"] = 0.25f, ["h"] = 0f },
                }));
                StringAssert.Contains("only numeric r/g/b/a", extraChannel.Message);
                Assert.AreEqual(Color.black, camera.BackgroundColor);
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void SetFieldQueuesRoundTripEditForTransformPosition()
        {
            var go = new GameObject("Boss");
            var marker = go.AddComponent<GreyboxMarker>();
            marker.ArtifactKind = GreyboxArtifactKind.GameViewport;
            marker.SourceFileName = "levels/arena.gameview.json";
            marker.Collection = "actors";
            marker.MarkerId = "boss";
            marker.JsonPath = "$.actors[id=boss]";
            marker.PositionJsonPath = "$.actors[id=boss].position";

            try
            {
                ClearPendingRoundTripEdits();
                var result = InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(Transform).FullName,
                    ["fieldName"] = nameof(Transform.localPosition),
                    ["value"] = new JObject
                    {
                        ["x"] = 5f,
                        ["y"] = 0.5f,
                        ["z"] = -2f
                    }
                });

                Assert.AreEqual(new Vector3(5f, 0.5f, -2f), go.transform.localPosition);
                Assert.AreEqual("$.actors[id=boss].position", result["roundTripPath"].Value<string>());
                Assert.AreEqual(5f, result["roundTripValue"]["x"].Value<float>());
                Assert.AreEqual(0.5f, result["roundTripValue"]["y"].Value<float>());
                Assert.AreEqual(-2f, result["roundTripValue"]["z"].Value<float>());
                Assert.AreEqual(1, PendingRoundTripFieldEditCount());
            }
            finally
            {
                ClearPendingRoundTripEdits();
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void SetFieldMovesMarkedTilemapCellWithTransformPosition()
        {
            var tiles = new GameObject("Tiles");
            var tilemap = tiles.AddComponent<Tilemap>();
            tiles.AddComponent<TilemapRenderer>();
            var metadata = tiles.AddComponent<GreyboxLevelTilemap>();
            var existingTile = ScriptableObject.CreateInstance<Tile>();
            existingTile.name = "Greybox Hazard Tile";
            var child = new GameObject("Hazard Tile");
            child.transform.SetParent(tiles.transform, false);
            child.transform.localPosition = new Vector3(1f, 2f, 0f);
            var marker = child.AddComponent<GreyboxMarker>();
            marker.ArtifactKind = GreyboxArtifactKind.LevelBoard;
            marker.SourceFileName = "boards/floor.levelboard.json";
            marker.Collection = "tiles";
            marker.MarkerId = "hazard-tile";
            marker.MarkerName = "Hazard Tile";
            marker.JsonPath = "$.tilemap.tiles[tileId=hazard-tile]";
            marker.PositionJsonPath = "$.tilemap.tiles[tileId=hazard-tile].position";
            metadata.TileRecords = new[]
            {
                new GreyboxLevelTileRecord
                {
                    TileId = "hazard-tile",
                    TileType = "hazard",
                    SourceJsonPath = "$.tilemap.tiles[tileId=hazard-tile]",
                    Position = new Vector3Int(1, 2, 0),
                    Walkable = true,
                    IsHazard = true,
                    ColorHex = "#E94B3CFF"
                }
            };
            metadata.TileAssets = new TileBase[] { existingTile };
            tilemap.SetTile(new Vector3Int(1, 2, 0), existingTile);

            try
            {
                ClearPendingRoundTripEdits();
                var result = InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(child).ToString(),
                    ["componentType"] = typeof(Transform).FullName,
                    ["fieldName"] = nameof(Transform.localPosition),
                    ["value"] = new JObject
                    {
                        ["x"] = 4f,
                        ["y"] = 5f,
                        ["z"] = 0f
                    }
                });

                Assert.IsNull(tilemap.GetTile(new Vector3Int(1, 2, 0)), "Moving an MCP tile child should clear the previous Tilemap cell.");
                Assert.AreSame(existingTile, tilemap.GetTile(new Vector3Int(4, 5, 0)));
                Assert.True(metadata.TryGetTileRecord("hazard-tile", out GreyboxLevelTileRecord movedTile));
                Assert.AreEqual(new Vector3Int(4, 5, 0), movedTile.Position);
                Assert.AreEqual("$.tilemap.tiles[tileId=hazard-tile].position", result["roundTripPath"].Value<string>());
                Assert.AreEqual(4f, result["roundTripValue"]["x"].Value<float>());
                Assert.AreEqual("hazard-tile", result["tilemapCell"]["tileId"].Value<string>());
                Assert.AreEqual("hazard", result["tilemapCell"]["tileType"].Value<string>());
                Assert.AreEqual(1, result["tilemapCell"]["previousCell"]["x"].Value<int>());
                Assert.AreEqual(4, result["tilemapCell"]["cell"]["x"].Value<int>());
                Assert.True(result["tilemapCell"]["tilemapSynced"].Value<bool>());
                Assert.True(result["tilemapCell"]["metadataSynced"].Value<bool>());
                Assert.AreEqual(1, PendingRoundTripFieldEditCount());
            }
            finally
            {
                ClearPendingRoundTripEdits();
                Object.DestroyImmediate(tiles);
                Object.DestroyImmediate(existingTile);
            }
        }

        [Test]
        public void SetFieldUpdatesTileRecordTypeAndVisibleTile()
        {
            var tiles = new GameObject("Tiles");
            var tilemap = tiles.AddComponent<Tilemap>();
            tiles.AddComponent<TilemapRenderer>();
            var metadata = tiles.AddComponent<GreyboxLevelTilemap>();
            var rootMarker = tiles.AddComponent<GreyboxMarker>();
            rootMarker.ArtifactKind = GreyboxArtifactKind.LevelBoard;
            rootMarker.SourceFileName = "boards/floor.levelboard.json";
            rootMarker.Collection = "tiles";
            rootMarker.MarkerName = "Tiles";
            rootMarker.JsonPath = "$.tilemap.tiles";
            var child = new GameObject("Hazard Tile");
            child.transform.SetParent(tiles.transform, false);
            var marker = child.AddComponent<GreyboxMarker>();
            marker.ArtifactKind = GreyboxArtifactKind.LevelBoard;
            marker.SourceFileName = "boards/floor.levelboard.json";
            marker.Collection = "tiles";
            marker.MarkerId = "hazard-tile";
            marker.MarkerName = "Hazard Tile";
            marker.JsonPath = "$.tilemap.tiles[tileId=hazard-tile]";
            marker.PositionJsonPath = "$.tilemap.tiles[tileId=hazard-tile].position";
            var existingTile = ScriptableObject.CreateInstance<Tile>();
            existingTile.name = "Greybox Hazard Tile";
            metadata.TileRecords = new[]
            {
                new GreyboxLevelTileRecord
                {
                    TileId = "hazard-tile",
                    TileType = "hazard",
                    SourceJsonPath = "$.tilemap.tiles[tileId=hazard-tile]",
                    Position = new Vector3Int(2, 3, 0),
                    Walkable = true,
                    IsHazard = true,
                    ColorHex = "#E94B3CFF"
                }
            };
            metadata.TileAssets = new TileBase[] { existingTile };
            tilemap.SetTile(new Vector3Int(2, 3, 0), existingTile);

            try
            {
                ClearPendingRoundTripEdits();
                var result = InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(tiles).ToString(),
                    ["componentType"] = typeof(GreyboxLevelTilemap).FullName,
                    ["fieldName"] = "tiles[tileId=hazard-tile].type",
                    ["value"] = "wall"
                });

                Assert.True(metadata.TryGetTileRecord("hazard-tile", out GreyboxLevelTileRecord editedTile));
                Assert.AreEqual("wall", editedTile.TileType);
                Assert.AreEqual("#1A1A1FFF", editedTile.ColorHex);
                Assert.False(editedTile.Walkable);
                Assert.True(editedTile.BlocksMovement);
                Assert.False(editedTile.IsHazard);
                TileBase visibleTile = tilemap.GetTile(new Vector3Int(2, 3, 0));
                Assert.NotNull(visibleTile);
                Assert.AreNotSame(existingTile, visibleTile);
                Assert.GreaterOrEqual(metadata.TileAssets.Length, 2);
                Assert.AreEqual(Tile.ColliderType.Sprite, ((Tile)visibleTile).colliderType);
                Assert.AreEqual("$.tilemap.tiles[tileId=hazard-tile].type", result["roundTripPath"].Value<string>());
                Assert.AreEqual("wall", result["roundTripValue"].Value<string>());
                Assert.AreEqual("hazard", result["previousValue"].Value<string>());
                Assert.AreEqual("hazard-tile", result["tilemapCell"]["tileId"].Value<string>());
                Assert.AreEqual("wall", result["tilemapCell"]["tileType"].Value<string>());
                Assert.AreEqual("type", result["tilemapCell"]["field"].Value<string>());
                Assert.True(result["tilemapCell"]["tilemapSynced"].Value<bool>());
                Assert.True(result["tilemapCell"]["metadataSynced"].Value<bool>());
                Assert.AreEqual(1, PendingRoundTripFieldEditCount());
            }
            finally
            {
                ClearPendingRoundTripEdits();
                foreach (TileBase tile in metadata.TileAssets ?? new TileBase[0])
                {
                    if (tile && tile != existingTile) Object.DestroyImmediate(tile);
                }
                foreach (Sprite sprite in metadata.TileSprites ?? new Sprite[0])
                {
                    if (sprite) Object.DestroyImmediate(sprite);
                }
                foreach (Texture2D texture in metadata.TileTextures ?? new Texture2D[0])
                {
                    if (texture) Object.DestroyImmediate(texture);
                }
                Object.DestroyImmediate(tiles);
                Object.DestroyImmediate(existingTile);
            }
        }

        [Test]
        public void SetFieldUpdatesTileRecordPositionAndMarker()
        {
            var tiles = new GameObject("Tiles");
            var tilemap = tiles.AddComponent<Tilemap>();
            tiles.AddComponent<TilemapRenderer>();
            var metadata = tiles.AddComponent<GreyboxLevelTilemap>();
            var rootMarker = tiles.AddComponent<GreyboxMarker>();
            rootMarker.ArtifactKind = GreyboxArtifactKind.LevelBoard;
            rootMarker.SourceFileName = "boards/floor.levelboard.json";
            rootMarker.Collection = "tiles";
            rootMarker.MarkerName = "Tiles";
            rootMarker.JsonPath = "$.tilemap.tiles";
            var child = new GameObject("Hazard Tile");
            child.transform.SetParent(tiles.transform, false);
            child.transform.localPosition = new Vector3(1f, 2f, 0f);
            var marker = child.AddComponent<GreyboxMarker>();
            marker.ArtifactKind = GreyboxArtifactKind.LevelBoard;
            marker.SourceFileName = "boards/floor.levelboard.json";
            marker.Collection = "tiles";
            marker.MarkerId = "hazard-tile";
            marker.MarkerName = "Hazard Tile";
            marker.JsonPath = "$.tilemap.tiles[tileId=hazard-tile]";
            marker.PositionJsonPath = "$.tilemap.tiles[tileId=hazard-tile].position";
            var existingTile = ScriptableObject.CreateInstance<Tile>();
            existingTile.name = "Greybox Hazard Tile";
            metadata.TileRecords = new[]
            {
                new GreyboxLevelTileRecord
                {
                    TileId = "hazard-tile",
                    TileType = "hazard",
                    SourceJsonPath = "$.tilemap.tiles[tileId=hazard-tile]",
                    Position = new Vector3Int(1, 2, 0),
                    Walkable = true,
                    IsHazard = true,
                    ColorHex = "#E94B3CFF"
                }
            };
            metadata.TileAssets = new TileBase[] { existingTile };
            tilemap.SetTile(new Vector3Int(1, 2, 0), existingTile);

            try
            {
                ClearPendingRoundTripEdits();
                var result = InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(tiles).ToString(),
                    ["componentType"] = typeof(GreyboxLevelTilemap).FullName,
                    ["fieldName"] = "tiles[tileId=hazard-tile].position",
                    ["value"] = new JObject
                    {
                        ["x"] = 4f,
                        ["y"] = 5f,
                        ["z"] = 0f
                    }
                });

                Assert.True(metadata.TryGetTileRecord("hazard-tile", out GreyboxLevelTileRecord movedTile));
                Assert.AreEqual(new Vector3Int(4, 5, 0), movedTile.Position);
                Assert.IsNull(tilemap.GetTile(new Vector3Int(1, 2, 0)));
                Assert.AreSame(existingTile, tilemap.GetTile(new Vector3Int(4, 5, 0)));
                Assert.AreEqual(tilemap.CellToWorld(new Vector3Int(4, 5, 0)), child.transform.position);
                Assert.AreEqual("$.tilemap.tiles[tileId=hazard-tile].position", result["roundTripPath"].Value<string>());
                Assert.AreEqual(1, result["previousValue"]["x"].Value<int>());
                Assert.AreEqual(4, result["roundTripValue"]["x"].Value<int>());
                Assert.AreEqual("position", result["tilemapCell"]["field"].Value<string>());
                Assert.AreEqual(1, result["tilemapCell"]["previousCell"]["x"].Value<int>());
                Assert.AreEqual(4, result["tilemapCell"]["cell"]["x"].Value<int>());
                Assert.True(result["tilemapCell"]["tilemapSynced"].Value<bool>());
                Assert.True(result["tilemapCell"]["markerSynced"].Value<bool>());
                Assert.True(result["tilemapCell"]["metadataSynced"].Value<bool>());
                Assert.AreEqual(1, PendingRoundTripFieldEditCount());
            }
            finally
            {
                ClearPendingRoundTripEdits();
                Object.DestroyImmediate(tiles);
                Object.DestroyImmediate(existingTile);
            }
        }

        [Test]
        public void SetFieldQueuesRoundTripEditForTransformScale()
        {
            var go = new GameObject("Boss");
            var marker = go.AddComponent<GreyboxMarker>();
            marker.ArtifactKind = GreyboxArtifactKind.GameViewport;
            marker.SourceFileName = "levels/arena.gameview.json";
            marker.Collection = "actors";
            marker.MarkerId = "boss";
            marker.JsonPath = "$.actors[id=boss]";
            var designNode = go.AddComponent<GreyboxDesignNode>();

            try
            {
                ClearPendingRoundTripEdits();
                var result = InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(Transform).FullName,
                    ["fieldName"] = nameof(Transform.localScale),
                    ["value"] = new JObject
                    {
                        ["x"] = 2f,
                        ["y"] = 3f,
                        ["z"] = 4f
                    }
                });

                Assert.AreEqual(new Vector3(2f, 3f, 4f), go.transform.localScale);
                Assert.AreEqual(new Vector3(2f, 3f, 4f), designNode.AuthoredScale);
                Assert.AreEqual("$.actors[id=boss].scale", result["roundTripPath"].Value<string>());
                Assert.AreEqual(2f, result["roundTripValue"]["x"].Value<float>());
                Assert.AreEqual(3f, result["roundTripValue"]["y"].Value<float>());
                Assert.AreEqual(4f, result["roundTripValue"]["z"].Value<float>());
                Assert.AreEqual(1, PendingRoundTripFieldEditCount());
            }
            finally
            {
                ClearPendingRoundTripEdits();
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void SetFieldQueuesRoundTripEditForTransformRotation()
        {
            var go = new GameObject("Boss");
            var marker = go.AddComponent<GreyboxMarker>();
            marker.ArtifactKind = GreyboxArtifactKind.GameViewport;
            marker.SourceFileName = "levels/arena.gameview.json";
            marker.Collection = "actors";
            marker.MarkerId = "boss";
            marker.JsonPath = "$.actors[id=boss]";
            var designNode = go.AddComponent<GreyboxDesignNode>();

            try
            {
                ClearPendingRoundTripEdits();
                var result = InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(Transform).FullName,
                    ["fieldName"] = nameof(Transform.localEulerAngles),
                    ["value"] = new JObject
                    {
                        ["x"] = 0f,
                        ["y"] = 90f,
                        ["z"] = 15f
                    }
                });

                Assert.AreEqual(new Vector3(0f, 90f, 15f), go.transform.localEulerAngles);
                Assert.AreEqual(new Vector3(0f, 90f, 15f), designNode.AuthoredRotationEuler);
                Assert.AreEqual("$.actors[id=boss].rotation", result["roundTripPath"].Value<string>());
                Assert.AreEqual(0f, result["roundTripValue"]["x"].Value<float>());
                Assert.AreEqual(90f, result["roundTripValue"]["y"].Value<float>());
                Assert.AreEqual(15f, result["roundTripValue"]["z"].Value<float>());
                Assert.AreEqual(1, PendingRoundTripFieldEditCount());
            }
            finally
            {
                ClearPendingRoundTripEdits();
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void SetFieldQueuesDistinctTransformEditsForSameObject()
        {
            var go = new GameObject("Boss");
            var marker = go.AddComponent<GreyboxMarker>();
            marker.ArtifactKind = GreyboxArtifactKind.GameViewport;
            marker.SourceFileName = "levels/arena.gameview.json";
            marker.Collection = "actors";
            marker.MarkerId = "boss";
            marker.JsonPath = "$.actors[id=boss]";

            try
            {
                ClearPendingRoundTripEdits();
                InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(Transform).FullName,
                    ["fieldName"] = nameof(Transform.localScale),
                    ["value"] = new JObject
                    {
                        ["x"] = 2f,
                        ["y"] = 3f,
                        ["z"] = 4f
                    }
                });
                InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(Transform).FullName,
                    ["fieldName"] = nameof(Transform.localEulerAngles),
                    ["value"] = new JObject
                    {
                        ["x"] = 0f,
                        ["y"] = 90f,
                        ["z"] = 15f
                    }
                });

                Assert.AreEqual(2, PendingRoundTripFieldEditCount());
            }
            finally
            {
                ClearPendingRoundTripEdits();
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void CreateGameObjectQueuesRoundTripInsertUnderGreyboxCollections()
        {
            var group = new GameObject("Actors");
            var groupMarker = group.AddComponent<GreyboxMarker>();
            groupMarker.ArtifactKind = GreyboxArtifactKind.GameViewport;
            groupMarker.SourcePath = "../ProjectSettings/ProjectSettings.asset";
            groupMarker.SourceFileName = "levels/arena.gameview.json";
            groupMarker.Collection = "actors";
            groupMarker.MarkerName = "Actors";
            groupMarker.JsonPath = "$.actors";

            try
            {
                ClearPendingRoundTripEdits();
                var result = InvokeCreateGameObject(new JObject
                {
                    ["name"] = "Boss Add",
                    ["parent"] = GlobalObjectId.GetGlobalObjectIdSlow(group).ToString()
                });

                var child = group.transform.Find("Boss Add");
                Assert.NotNull(child);
                var marker = child.GetComponent<GreyboxMarker>();
                Assert.NotNull(marker);
                Assert.AreEqual("boss-add", marker.MarkerId);
                Assert.AreEqual("$.actors[actorId=boss-add]", marker.JsonPath);
                Assert.AreEqual("$.actors[actorId=boss-add].position", marker.PositionJsonPath);
                Assert.AreEqual("", marker.SourcePath);
                Assert.AreEqual("levels/arena.gameview.json", marker.SourceFileName);
                Assert.NotNull(child.GetComponent<GreyboxDesignNode>());
                var actor = child.GetComponent<GreyboxActorDefinition>();
                Assert.NotNull(actor);
                Assert.AreEqual("boss-add", actor.ActorId);
                Assert.AreEqual("Boss Add", actor.DisplayName);

                Assert.AreEqual("$.actors[actorId=boss-add]", result["roundTripPath"].Value<string>());
                Assert.AreEqual("boss-add", result["roundTripValue"]["actorId"].Value<string>());
                Assert.AreEqual("Boss Add", result["roundTripValue"]["name"].Value<string>());
                Assert.True(result["sceneDirty"].Value<bool>());
                Assert.AreEqual(1, PendingRoundTripFieldEditCount());
            }
            finally
            {
                ClearPendingRoundTripEdits();
                Object.DestroyImmediate(group);
            }
        }

        [Test]
        public void CreateGameObjectSkipsRoundTripForUnsafeCollectionRoots()
        {
            var nested = new GameObject("Nested Actors");
            var nestedMarker = nested.AddComponent<GreyboxMarker>();
            nestedMarker.ArtifactKind = GreyboxArtifactKind.GameViewport;
            nestedMarker.SourceFileName = "levels/arena.gameview.json";
            nestedMarker.Collection = "actors";
            nestedMarker.MarkerName = "Nested Actors";
            nestedMarker.JsonPath = "$.rooms[id=entry].actors";

            var unsafeCollection = new GameObject("Unsafe Collection");
            var unsafeMarker = unsafeCollection.AddComponent<GreyboxMarker>();
            unsafeMarker.ArtifactKind = GreyboxArtifactKind.GameViewport;
            unsafeMarker.SourceFileName = "levels/arena.gameview.json";
            unsafeMarker.Collection = "__proto__";
            unsafeMarker.MarkerName = "Unsafe Collection";
            unsafeMarker.JsonPath = "$.__proto__";

            var unsafeSource = new GameObject("Unsafe Source");
            var unsafeSourceMarker = unsafeSource.AddComponent<GreyboxMarker>();
            unsafeSourceMarker.ArtifactKind = GreyboxArtifactKind.GameViewport;
            unsafeSourceMarker.SourceFileName = "../levels/arena.gameview.json";
            unsafeSourceMarker.Collection = "actors";
            unsafeSourceMarker.MarkerName = "Actors";
            unsafeSourceMarker.JsonPath = "$.actors";

            try
            {
                ClearPendingRoundTripEdits();
                var nestedResult = InvokeCreateGameObject(new JObject
                {
                    ["name"] = "Nested Boss",
                    ["parent"] = GlobalObjectId.GetGlobalObjectIdSlow(nested).ToString()
                });
                var unsafeResult = InvokeCreateGameObject(new JObject
                {
                    ["name"] = "Prototype Boss",
                    ["parent"] = GlobalObjectId.GetGlobalObjectIdSlow(unsafeCollection).ToString()
                });
                var unsafeSourceResult = InvokeCreateGameObject(new JObject
                {
                    ["name"] = "Unsafe Source Boss",
                    ["parent"] = GlobalObjectId.GetGlobalObjectIdSlow(unsafeSource).ToString()
                });

                var nestedChild = nested.transform.Find("Nested Boss");
                var unsafeChild = unsafeCollection.transform.Find("Prototype Boss");
                var unsafeSourceChild = unsafeSource.transform.Find("Unsafe Source Boss");
                Assert.NotNull(nestedChild);
                Assert.NotNull(unsafeChild);
                Assert.NotNull(unsafeSourceChild);
                Assert.IsNull(nestedChild.GetComponent<GreyboxMarker>());
                Assert.IsNull(unsafeChild.GetComponent<GreyboxMarker>());
                Assert.IsNull(unsafeSourceChild.GetComponent<GreyboxMarker>());
                Assert.AreEqual("", nestedResult["roundTripPath"].Value<string>());
                Assert.AreEqual(JTokenType.Null, nestedResult["roundTripValue"].Type);
                Assert.AreEqual("", unsafeResult["roundTripPath"].Value<string>());
                Assert.AreEqual(JTokenType.Null, unsafeResult["roundTripValue"].Type);
                Assert.AreEqual("", unsafeSourceResult["roundTripPath"].Value<string>());
                Assert.AreEqual(JTokenType.Null, unsafeSourceResult["roundTripValue"].Type);
                Assert.AreEqual(0, PendingRoundTripFieldEditCount());
            }
            finally
            {
                ClearPendingRoundTripEdits();
                Object.DestroyImmediate(nested);
                Object.DestroyImmediate(unsafeCollection);
                Object.DestroyImmediate(unsafeSource);
            }
        }

        [Test]
        public void CreateGameObjectUsesUniqueMarkerIdsWithinGreyboxCollections()
        {
            var group = new GameObject("Actors");
            var groupMarker = group.AddComponent<GreyboxMarker>();
            groupMarker.ArtifactKind = GreyboxArtifactKind.GameViewport;
            groupMarker.SourceFileName = "levels/arena.gameview.json";
            groupMarker.Collection = "actors";
            groupMarker.MarkerName = "Actors";
            groupMarker.JsonPath = "$.actors";

            var existing = new GameObject("Boss Add");
            existing.transform.SetParent(group.transform, false);
            var existingMarker = existing.AddComponent<GreyboxMarker>();
            existingMarker.ArtifactKind = GreyboxArtifactKind.GameViewport;
            existingMarker.Collection = "actors";
            existingMarker.MarkerId = "boss-add";
            existingMarker.JsonPath = "$.actors[actorId=boss-add]";

            try
            {
                ClearPendingRoundTripEdits();
                var result = InvokeCreateGameObject(new JObject
                {
                    ["name"] = "Boss Add",
                    ["parent"] = GlobalObjectId.GetGlobalObjectIdSlow(group).ToString()
                });

                GreyboxMarker marker = null;
                foreach (GreyboxMarker candidate in group.GetComponentsInChildren<GreyboxMarker>())
                {
                    if (candidate.MarkerId == "boss-add-2") marker = candidate;
                }
                Assert.NotNull(marker);
                Assert.AreEqual("boss-add-2", marker.MarkerId);
                Assert.AreEqual("Boss Add 2", marker.gameObject.name);
                Assert.AreEqual("Boss Add 2", marker.MarkerName);
                Assert.AreEqual("$.actors[actorId=boss-add-2]", marker.JsonPath);
                Assert.AreEqual("Boss Add 2", marker.GetComponent<GreyboxDesignNode>().DisplayName);
                Assert.AreEqual("Boss Add 2", marker.GetComponent<GreyboxActorDefinition>().DisplayName);
                Assert.AreEqual("Boss Add 2", result["name"].Value<string>());
                Assert.AreEqual("$.actors[actorId=boss-add-2]", result["roundTripPath"].Value<string>());
                Assert.AreEqual("boss-add-2", result["roundTripValue"]["actorId"].Value<string>());
                Assert.AreEqual("Boss Add 2", result["roundTripValue"]["name"].Value<string>());
                Assert.AreEqual(1, PendingRoundTripFieldEditCount());
            }
            finally
            {
                ClearPendingRoundTripEdits();
                Object.DestroyImmediate(group);
            }
        }

        [Test]
        public void CreateGameObjectAcceptsParentIdAliasForGreyboxCollections()
        {
            var group = new GameObject("Spawn Points");
            var groupMarker = group.AddComponent<GreyboxMarker>();
            groupMarker.ArtifactKind = GreyboxArtifactKind.GameViewport;
            groupMarker.SourceFileName = "levels/arena.gameview.json";
            groupMarker.Collection = "spawnPoints";
            groupMarker.MarkerName = "Spawn Points";
            groupMarker.JsonPath = "$.spawnPoints";

            try
            {
                ClearPendingRoundTripEdits();
                string parentId = GlobalObjectId.GetGlobalObjectIdSlow(group).ToString();
                var result = InvokeCreateGameObject(new JObject
                {
                    ["name"] = "Checkpoint A",
                    ["parentId"] = parentId
                });

                var child = group.transform.Find("Checkpoint A");
                Assert.NotNull(child);
                var marker = child.GetComponent<GreyboxMarker>();
                Assert.NotNull(marker);
                Assert.AreEqual("checkpoint-a", marker.MarkerId);
                Assert.AreEqual("$.spawnPoints[spawnId=checkpoint-a]", marker.JsonPath);
                Assert.AreEqual(parentId, result["parentId"].Value<string>());
                Assert.AreEqual("$.spawnPoints[spawnId=checkpoint-a]", result["roundTripPath"].Value<string>());
                Assert.AreEqual("checkpoint-a", result["roundTripValue"]["spawnId"].Value<string>());
                Assert.AreEqual("Checkpoint A", result["roundTripValue"]["name"].Value<string>());
                Assert.AreEqual(1, PendingRoundTripFieldEditCount());
            }
            finally
            {
                ClearPendingRoundTripEdits();
                Object.DestroyImmediate(group);
            }
        }

        [Test]
        public void CreateGameObjectUsesCollectionSpecificIdFields()
        {
            var specs = new[]
            {
                new { Collection = "actors", GroupName = "Actors", Name = "Boss Add", Id = "boss-add", IdField = "actorId" },
                new { Collection = "spawnPoints", GroupName = "Spawn Points", Name = "Checkpoint A", Id = "checkpoint-a", IdField = "spawnId" },
                new { Collection = "objectives", GroupName = "Objectives", Name = "Exit Gate", Id = "exit-gate", IdField = "objectiveId" },
                new { Collection = "hazards", GroupName = "Hazards", Name = "Spike Row", Id = "spike-row", IdField = "hazardId" },
                new { Collection = "rooms", GroupName = "Rooms", Name = "Entry Room", Id = "entry-room", IdField = "roomId" },
                new { Collection = "encounters", GroupName = "Encounters", Name = "Ambush Pack", Id = "ambush-pack", IdField = "encounterId" },
                new { Collection = "connections", GroupName = "Connections", Name = "Entry Gate", Id = "entry-gate", IdField = "connectionId" },
                new { Collection = "checkpoints", GroupName = "Checkpoints", Name = "Midpoint Beacon", Id = "midpoint-beacon", IdField = "checkpointId" },
                new { Collection = "goals", GroupName = "Goals", Name = "Exit Gate", Id = "exit-gate", IdField = "goalId" },
                new { Collection = "coins", GroupName = "Coins", Name = "Coin 01", Id = "coin-01", IdField = "coinId" }
            };
            var groups = new GameObject[specs.Length];

            try
            {
                ClearPendingRoundTripEdits();
                for (int index = 0; index < specs.Length; index++)
                {
                    var spec = specs[index];
                    var group = new GameObject(spec.GroupName);
                    groups[index] = group;
                    var groupMarker = group.AddComponent<GreyboxMarker>();
                    groupMarker.ArtifactKind = spec.Collection == "rooms" || spec.Collection == "encounters" || spec.Collection == "connections"
                        ? GreyboxArtifactKind.LevelBoard
                        : GreyboxArtifactKind.GameViewport;
                    groupMarker.SourceFileName = "levels/arena.gameview.json";
                    groupMarker.Collection = spec.Collection;
                    groupMarker.MarkerName = spec.GroupName;
                    groupMarker.JsonPath = "$." + spec.Collection;

                    var result = InvokeCreateGameObject(new JObject
                    {
                        ["name"] = spec.Name,
                        ["parent"] = GlobalObjectId.GetGlobalObjectIdSlow(group).ToString()
                    });

                    Transform child = group.transform.Find(spec.Name);
                    Assert.NotNull(child);
                    var marker = child.GetComponent<GreyboxMarker>();
                    Assert.NotNull(marker);
                    string expectedPath = $"$.{spec.Collection}[{spec.IdField}={spec.Id}]";
                    Assert.AreEqual(spec.Id, marker.MarkerId);
                    Assert.AreEqual(expectedPath, marker.JsonPath);
                    Assert.AreEqual(expectedPath + ".position", marker.PositionJsonPath);
                    Assert.AreEqual(expectedPath, result["roundTripPath"].Value<string>());
                    Assert.AreEqual(spec.Id, result["roundTripValue"][spec.IdField].Value<string>());
                    Assert.AreEqual(spec.Name, result["roundTripValue"]["name"].Value<string>());
                    if (spec.Collection == "actors")
                    {
                        var actor = child.GetComponent<GreyboxActorDefinition>();
                        Assert.NotNull(actor);
                        Assert.AreEqual(spec.Id, actor.ActorId);
                        Assert.AreEqual(spec.Name, actor.DisplayName);
                        Assert.AreEqual(1, result["roundTripValue"]["health"].Value<int>());
                        Assert.AreEqual(1f, result["roundTripValue"]["moveSpeed"].Value<float>());
                        Assert.AreEqual(1, result["roundTripValue"]["damage"].Value<int>());
                        Assert.AreEqual(1f, result["roundTripValue"]["attackRange"].Value<float>());
                        Assert.AreEqual(1f, result["roundTripValue"]["attackCooldownSeconds"].Value<float>());
                        Assert.AreEqual(5f, result["roundTripValue"]["aggroRadius"].Value<float>());
                    }
                    if (spec.Collection == "spawnPoints")
                    {
                        var spawn = child.GetComponent<GreyboxSpawnPoint>();
                        Assert.NotNull(spawn);
                        Assert.AreEqual(spec.Id, spawn.SpawnId);
                        Assert.AreEqual(spec.Name, spawn.DisplayName);
                        Assert.AreEqual(0.5f, result["roundTripValue"]["spawnRadius"].Value<float>());
                    }
                    if (spec.Collection == "objectives")
                    {
                        var objective = child.GetComponent<GreyboxObjective>();
                        Assert.NotNull(objective);
                        Assert.AreEqual(spec.Id, objective.ObjectiveId);
                        Assert.AreEqual(spec.Name, objective.DisplayName);
                        Assert.AreEqual("objective", result["roundTripValue"]["objectiveType"].Value<string>());
                        Assert.AreEqual(1, result["roundTripValue"]["requiredCount"].Value<int>());
                    }
                    if (spec.Collection == "hazards")
                    {
                        var hazard = child.GetComponent<GreyboxHazard>();
                        Assert.NotNull(hazard);
                        Assert.AreEqual(spec.Id, hazard.HazardId);
                        Assert.AreEqual(spec.Name, hazard.DisplayName);
                        Assert.AreEqual(1f, result["roundTripValue"]["damage"].Value<float>());
                        Assert.AreEqual(1f, result["roundTripValue"]["tickSeconds"].Value<float>());
                        Assert.AreEqual(1f, result["roundTripValue"]["radius"].Value<float>());
                    }
                    if (spec.Collection == "rooms")
                    {
                        Assert.NotNull(child.GetComponent<GreyboxLevelRoom>());
                        Assert.AreEqual("room", result["roundTripValue"]["roomType"].Value<string>());
                        Assert.AreEqual(1f, result["roundTripValue"]["size"]["x"].Value<float>());
                    }
                    if (spec.Collection == "encounters")
                    {
                        Assert.NotNull(child.GetComponent<GreyboxEncounter>());
                        Assert.AreEqual("encounter", result["roundTripValue"]["encounterType"].Value<string>());
                        Assert.AreEqual(1f, result["roundTripValue"]["radius"].Value<float>());
                    }
                    if (spec.Collection == "checkpoints")
                    {
                        var checkpoint = child.GetComponent<GreyboxPlatformerSampleCheckpoint>();
                        Assert.NotNull(checkpoint);
                        Assert.AreEqual(spec.Id, checkpoint.CheckpointId);
                        Assert.AreEqual(spec.Name, checkpoint.DisplayName);
                        Assert.AreEqual(spec.Id, checkpoint.SourceArtifactId);
                        Assert.AreEqual(1, result["roundTripValue"]["maxActivations"].Value<int>());
                        Assert.True(result["roundTripValue"]["spawnOnStart"].Value<bool>());
                        Assert.AreEqual(0f, result["roundTripValue"]["respawnPoint"]["x"].Value<float>());
                        Assert.NotNull(child.GetComponent<BoxCollider2D>());
                        Assert.True(child.GetComponent<BoxCollider2D>().isTrigger);
                    }
                    if (spec.Collection == "goals")
                    {
                        var goal = child.GetComponent<GreyboxPlatformerSampleGoal>();
                        Assert.NotNull(goal);
                        Assert.AreEqual(spec.Id, goal.GoalId);
                        Assert.AreEqual(spec.Name, goal.DisplayName);
                        Assert.AreEqual("exit", goal.ObjectiveType);
                        Assert.AreEqual(1, goal.RequiredCount);
                        Assert.AreEqual("exit", result["roundTripValue"]["objectiveType"].Value<string>());
                        Assert.AreEqual(1, result["roundTripValue"]["requiredCount"].Value<int>());
                        Assert.NotNull(child.GetComponent<BoxCollider2D>());
                        Assert.True(child.GetComponent<BoxCollider2D>().isTrigger);
                    }
                    if (spec.Collection == "coins")
                    {
                        var coin = child.GetComponent<GreyboxPlatformerSampleCollectible>();
                        Assert.NotNull(coin);
                        Assert.AreEqual(spec.Id, coin.CoinId);
                        Assert.AreEqual(spec.Name, coin.DisplayName);
                        Assert.AreEqual("collectible", coin.SourceObjectiveType);
                        Assert.AreEqual(spec.Id, result["roundTripValue"]["sourceObjectiveId"].Value<string>());
                        Assert.AreEqual(spec.Name, result["roundTripValue"]["sourceObjectiveDisplayName"].Value<string>());
                        Assert.AreEqual("collectible", result["roundTripValue"]["sourceObjectiveType"].Value<string>());
                        Assert.NotNull(child.GetComponent<CircleCollider2D>());
                        Assert.True(child.GetComponent<CircleCollider2D>().isTrigger);
                    }
                    if (spec.Collection == "connections")
                    {
                        var connection = child.GetComponent<GreyboxLevelConnection>();
                        Assert.NotNull(connection);
                        Assert.AreEqual(spec.Id, connection.ConnectionId);
                        Assert.AreEqual("connection", connection.ConnectionType);
                        Assert.AreEqual("connection", result["roundTripValue"]["type"].Value<string>());
                        Assert.AreEqual(1f, result["roundTripValue"]["travelCost"].Value<float>());
                    }
                }

                Assert.AreEqual(specs.Length, PendingRoundTripFieldEditCount());
            }
            finally
            {
                ClearPendingRoundTripEdits();
                foreach (GameObject group in groups)
                {
                    if (group) Object.DestroyImmediate(group);
                }
            }
        }

        [Test]
        public void CreateGameObjectQueuesTilemapTileUnderNestedCollectionRoot()
        {
            var tiles = new GameObject("Tiles");
            var tilemap = tiles.AddComponent<Tilemap>();
            tiles.AddComponent<TilemapRenderer>();
            var metadata = tiles.AddComponent<GreyboxLevelTilemap>();
            var existingTile = ScriptableObject.CreateInstance<Tile>();
            existingTile.name = "Greybox Hazard Tile";
            metadata.TileRecords = new[]
            {
                new GreyboxLevelTileRecord
                {
                    TileId = "existing-hazard",
                    TileType = "hazard",
                    SourceJsonPath = "$.tilemap.tiles[tileId=existing-hazard]",
                    Position = Vector3Int.zero,
                    Walkable = true,
                    IsHazard = true,
                    ColorHex = "#E94B3CFF"
                }
            };
            metadata.TileAssets = new TileBase[] { existingTile };
            var tilesMarker = tiles.AddComponent<GreyboxMarker>();
            tilesMarker.ArtifactKind = GreyboxArtifactKind.LevelBoard;
            tilesMarker.SourceFileName = "boards/floor.levelboard.json";
            tilesMarker.Collection = "tiles";
            tilesMarker.MarkerId = "tiles";
            tilesMarker.MarkerName = "Tiles";
            tilesMarker.JsonPath = "$.tilemap.tiles";

            try
            {
                ClearPendingRoundTripEdits();
                var result = InvokeCreateGameObject(new JObject
                {
                    ["name"] = "Hazard Tile",
                    ["parent"] = GlobalObjectId.GetGlobalObjectIdSlow(tiles).ToString(),
                    ["position"] = new JObject
                    {
                        ["x"] = 3,
                        ["y"] = 4,
                        ["z"] = 0
                    }
                });

                var child = tiles.transform.Find("Hazard Tile");
                Assert.NotNull(child);
                var marker = child.GetComponent<GreyboxMarker>();
                Assert.NotNull(marker);
                Assert.AreEqual("hazard-tile", marker.MarkerId);
                Assert.AreEqual("$.tilemap.tiles[tileId=hazard-tile]", marker.JsonPath);
                Assert.AreEqual("$.tilemap.tiles[tileId=hazard-tile].position", marker.PositionJsonPath);
                Assert.AreEqual("boards/floor.levelboard.json", marker.SourceFileName);

                var designNode = child.GetComponent<GreyboxDesignNode>();
                Assert.NotNull(designNode);
                Assert.AreEqual("tiles", designNode.Collection);
                Assert.AreEqual("hazard-tile", designNode.NodeId);
                Assert.AreEqual(new Vector3(3f, 4f, 0f), designNode.AuthoredPosition);

                Assert.AreEqual("$.tilemap.tiles[tileId=hazard-tile]", result["roundTripPath"].Value<string>());
                Assert.AreEqual("hazard-tile", result["roundTripValue"]["tileId"].Value<string>());
                Assert.AreEqual("Hazard Tile", result["roundTripValue"]["name"].Value<string>());
                Assert.AreEqual("hazard", result["roundTripValue"]["type"].Value<string>());
                Assert.AreEqual(3f, result["roundTripValue"]["position"]["x"].Value<float>());
                Assert.AreEqual(3, result["roundTripValue"]["x"].Value<int>());
                Assert.AreEqual(4, result["roundTripValue"]["y"].Value<int>());
                Assert.True(result["roundTripValue"]["isHazard"].Value<bool>());
                Assert.AreSame(existingTile, tilemap.GetTile(new Vector3Int(3, 4, 0)));
                Assert.True(metadata.TryGetTileRecord("hazard-tile", out GreyboxLevelTileRecord createdTile));
                Assert.AreEqual("hazard", createdTile.TileType);
                Assert.AreEqual("$.tilemap.tiles[tileId=hazard-tile]", createdTile.SourceJsonPath);
                Assert.AreEqual(new Vector3Int(3, 4, 0), createdTile.Position);
                Assert.True(createdTile.IsHazard);
                Assert.AreEqual(1, PendingRoundTripFieldEditCount());
            }
            finally
            {
                ClearPendingRoundTripEdits();
                Object.DestroyImmediate(existingTile);
                Object.DestroyImmediate(tiles);
            }
        }

        [Test]
        public void CreateGameObjectCreatesVisibleTileWhenTilemapHasNoGeneratedAssets()
        {
            var tiles = new GameObject("Tiles");
            var tilemap = tiles.AddComponent<Tilemap>();
            tiles.AddComponent<TilemapRenderer>();
            var metadata = tiles.AddComponent<GreyboxLevelTilemap>();
            var tilesMarker = tiles.AddComponent<GreyboxMarker>();
            tilesMarker.ArtifactKind = GreyboxArtifactKind.LevelBoard;
            tilesMarker.SourceFileName = "boards/floor.levelboard.json";
            tilesMarker.Collection = "tiles";
            tilesMarker.MarkerId = "tiles";
            tilesMarker.MarkerName = "Tiles";
            tilesMarker.JsonPath = "$.tilemap.tiles";
            Tile generatedTile = null;
            Sprite generatedSprite = null;
            Texture2D generatedTexture = null;

            try
            {
                ClearPendingRoundTripEdits();
                var result = InvokeCreateGameObject(new JObject
                {
                    ["name"] = "Wall Tile",
                    ["parentId"] = GlobalObjectId.GetGlobalObjectIdSlow(tiles).ToString(),
                    ["position"] = new JObject
                    {
                        ["x"] = 1,
                        ["y"] = 2,
                        ["z"] = 0
                    }
                });

                generatedTile = tilemap.GetTile(new Vector3Int(1, 2, 0)) as Tile;
                Assert.NotNull(generatedTile, "MCP tile creation should fabricate a visible Tile when no generated tile assets exist.");
                Assert.AreEqual(Tile.ColliderType.Sprite, generatedTile.colliderType);
                generatedSprite = generatedTile.sprite;
                Assert.NotNull(generatedSprite);
                generatedTexture = generatedSprite.texture;
                Assert.NotNull(generatedTexture);
                Assert.AreEqual(1, metadata.TileAssets.Length);
                Assert.AreSame(generatedTile, metadata.TileAssets[0]);
                Assert.AreEqual(1, metadata.TileTextures.Length);
                Assert.AreSame(generatedTexture, metadata.TileTextures[0]);
                Assert.AreEqual(1, metadata.TileSprites.Length);
                Assert.AreSame(generatedSprite, metadata.TileSprites[0]);
                Assert.True(metadata.TryGetTileRecord("wall-tile", out GreyboxLevelTileRecord createdTile));
                Assert.AreEqual("wall", createdTile.TileType);
                Assert.True(createdTile.BlocksMovement);
                Assert.False(createdTile.Walkable);
                Assert.AreEqual("wall", result["roundTripValue"]["type"].Value<string>());
                Assert.True(result["roundTripValue"]["blocksMovement"].Value<bool>());
                Assert.AreEqual(1, PendingRoundTripFieldEditCount());
            }
            finally
            {
                ClearPendingRoundTripEdits();
                Object.DestroyImmediate(tiles);
                if (generatedTile) Object.DestroyImmediate(generatedTile);
                if (generatedSprite) Object.DestroyImmediate(generatedSprite);
                if (generatedTexture) Object.DestroyImmediate(generatedTexture);
            }
        }

        [Test]
        public void CreateGameObjectRejectsConflictingParentAliases()
        {
            var actors = new GameObject("Actors");
            var spawnPoints = new GameObject("Spawn Points");

            try
            {
                ClearPendingRoundTripEdits();
                string actorsId = GlobalObjectId.GetGlobalObjectIdSlow(actors).ToString();
                string spawnPointsId = GlobalObjectId.GetGlobalObjectIdSlow(spawnPoints).ToString();

                var conflict = Assert.Throws<System.InvalidOperationException>(() => InvokeCreateGameObject(new JObject
                {
                    ["name"] = "Ambiguous Child",
                    ["parent"] = actorsId,
                    ["parentId"] = spawnPointsId
                }));
                StringAssert.Contains("parent and parentId", conflict.Message);
                Assert.IsNull(actors.transform.Find("Ambiguous Child"));
                Assert.IsNull(spawnPoints.transform.Find("Ambiguous Child"));
                Assert.AreEqual(0, PendingRoundTripFieldEditCount());

                var result = InvokeCreateGameObject(new JObject
                {
                    ["name"] = "Explicit Child",
                    ["parent"] = actorsId,
                    ["parentId"] = actorsId
                });
                Assert.NotNull(actors.transform.Find("Explicit Child"));
                Assert.AreEqual(actorsId, result["parentId"].Value<string>());
            }
            finally
            {
                ClearPendingRoundTripEdits();
                Object.DestroyImmediate(actors);
                Object.DestroyImmediate(spawnPoints);
            }
        }

        [Test]
        public void CreateGameObjectQueuesInitialTransformInRoundTripInsert()
        {
            var group = new GameObject("Actors");
            var groupMarker = group.AddComponent<GreyboxMarker>();
            groupMarker.ArtifactKind = GreyboxArtifactKind.GameViewport;
            groupMarker.SourceFileName = "levels/arena.gameview.json";
            groupMarker.Collection = "actors";
            groupMarker.MarkerName = "Actors";
            groupMarker.JsonPath = "$.actors";

            try
            {
                ClearPendingRoundTripEdits();
                var result = InvokeCreateGameObject(new JObject
                {
                    ["name"] = "Patrol Scout",
                    ["parent"] = GlobalObjectId.GetGlobalObjectIdSlow(group).ToString(),
                    ["position"] = new JObject { ["x"] = 4f, ["y"] = 1.5f, ["z"] = -2f },
                    ["rotation"] = new JArray(0f, 90f, 15f),
                    ["scale"] = new JObject { ["x"] = 1.25f, ["y"] = 2f, ["z"] = 1.25f }
                });

                var child = group.transform.Find("Patrol Scout");
                Assert.NotNull(child);
                Assert.AreEqual(new Vector3(4f, 1.5f, -2f), child.localPosition);
                Assert.AreEqual(new Vector3(0f, 90f, 15f), child.localEulerAngles);
                Assert.AreEqual(new Vector3(1.25f, 2f, 1.25f), child.localScale);
                Assert.AreEqual("$.actors[actorId=patrol-scout]", result["roundTripPath"].Value<string>());
                Assert.AreEqual("patrol-scout", result["roundTripValue"]["actorId"].Value<string>());
                Assert.AreEqual(4f, result["roundTripValue"]["position"]["x"].Value<float>());
                Assert.AreEqual(1.5f, result["roundTripValue"]["position"]["y"].Value<float>());
                Assert.AreEqual(-2f, result["roundTripValue"]["position"]["z"].Value<float>());
                Assert.AreEqual(90f, result["roundTripValue"]["rotation"]["y"].Value<float>());
                Assert.AreEqual(2f, result["roundTripValue"]["scale"]["y"].Value<float>());
                Assert.AreEqual(1, PendingRoundTripFieldEditCount());
            }
            finally
            {
                ClearPendingRoundTripEdits();
                Object.DestroyImmediate(group);
            }
        }

        [Test]
        public void McpVector3InputsMatchAdvertisedSchema()
        {
            var setFieldTarget = new GameObject("Vector Strict SetField");
            try
            {
                var extraArray = Assert.Throws<System.InvalidOperationException>(() => InvokeUnityTool("unity.createGameObject", new JObject
                {
                    ["name"] = "Loose Vector Array",
                    ["position"] = new JArray(1f, 2f, 3f, 4f),
                }));
                StringAssert.Contains("invalid Vector3 position", extraArray.Message);
                StringAssert.Contains("exactly 3 numbers", extraArray.Message);
                Assert.IsNull(GameObject.Find("Loose Vector Array"));

                var missingAxis = Assert.Throws<System.InvalidOperationException>(() => InvokeUnityTool("unity.createGameObject", new JObject
                {
                    ["name"] = "Loose Vector Object",
                    ["position"] = new JObject { ["x"] = 1f, ["y"] = 2f },
                }));
                StringAssert.Contains("numeric x/y/z", missingAxis.Message);
                Assert.IsNull(GameObject.Find("Loose Vector Object"));

                var extraField = Assert.Throws<System.InvalidOperationException>(() => InvokeUnityTool("unity.createGameObject", new JObject
                {
                    ["name"] = "Loose Vector Extra",
                    ["scale"] = new JObject { ["x"] = 1f, ["y"] = 1f, ["z"] = 1f, ["w"] = 1f },
                }));
                StringAssert.Contains("only numeric x/y/z fields", extraField.Message);
                Assert.IsNull(GameObject.Find("Loose Vector Extra"));

                setFieldTarget.transform.localPosition = Vector3.one;
                var looseSetField = Assert.Throws<System.InvalidOperationException>(() => InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(setFieldTarget).ToString(),
                    ["componentType"] = typeof(Transform).FullName,
                    ["fieldName"] = nameof(Transform.localPosition),
                    ["value"] = new JArray(4f, 5f, 6f, 7f),
                }));
                StringAssert.Contains("exactly 3 numbers", looseSetField.Message);
                Assert.AreEqual(Vector3.one, setFieldTarget.transform.localPosition);
            }
            finally
            {
                Object.DestroyImmediate(setFieldTarget);
            }
        }

        [Test]
        public void AssignAssetQueuesRoundTripEditForMeshReferences()
        {
            string folder = CreateTempAssetFolder();
            string meshPath = $"{folder}/BossMesh.asset";
            string previousMeshPath = $"{folder}/OldBossMesh.asset";
            var mesh = new Mesh
            {
                name = "BossMesh",
                vertices = new[] { Vector3.zero, Vector3.right, Vector3.up },
                triangles = new[] { 0, 1, 2 },
            };
            var previousMesh = new Mesh
            {
                name = "OldBossMesh",
                vertices = new[] { Vector3.zero, Vector3.left, Vector3.down },
                triangles = new[] { 0, 1, 2 },
            };
            var go = new GameObject("Boss");
            var marker = go.AddComponent<GreyboxMarker>();
            marker.ArtifactKind = GreyboxArtifactKind.GameViewport;
            marker.SourceFileName = "levels/arena.gameview.json";
            marker.Collection = "actors";
            marker.MarkerId = "boss";
            marker.JsonPath = "$.actors[id=boss]";
            var meshFilter = go.AddComponent<MeshFilter>();

            try
            {
                AssetDatabase.CreateAsset(previousMesh, previousMeshPath);
                AssetDatabase.CreateAsset(mesh, meshPath);
                meshFilter.sharedMesh = previousMesh;
                ClearPendingRoundTripEdits();
                var result = InvokeAssignAsset(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(MeshFilter).FullName,
                    ["fieldName"] = nameof(MeshFilter.sharedMesh),
                    ["assetPath"] = meshPath
                });

                Assert.AreSame(mesh, meshFilter.sharedMesh);
                Assert.AreEqual(previousMeshPath, result["previousAssetPath"].Value<string>());
                Assert.AreEqual(AssetDatabase.AssetPathToGUID(previousMeshPath), result["previousAssetGuid"].Value<string>());
                Assert.AreEqual("OldBossMesh", result["previousObjectName"].Value<string>());
                Assert.AreEqual("BossMesh", result["objectName"].Value<string>());
                Assert.AreEqual(meshPath, marker.UnityAssetPath);
                Assert.AreEqual(AssetDatabase.AssetPathToGUID(meshPath), marker.UnityAssetGuid);
                Assert.AreEqual("Mesh", marker.Primitive);
                Assert.AreEqual("$.actors[id=boss].meshAssetPath", result["roundTripPath"].Value<string>());
                Assert.AreEqual(meshPath, result["roundTripValue"].Value<string>());
                Assert.True(result["sceneDirty"].Value<bool>());
                Assert.AreEqual(1, PendingRoundTripFieldEditCount());
            }
            finally
            {
                ClearPendingRoundTripEdits();
                Object.DestroyImmediate(go);
                AssetDatabase.DeleteAsset(folder);
            }
        }

        [Test]
        public void AssignAssetQueuesRoundTripEditForMaterialReferences()
        {
            string folder = CreateTempAssetFolder();
            string materialPath = $"{folder}/BossMaterial.mat";
            var material = MaterialBuilder.Colored(new Color(1f, 0.42f, 0.21f), "Boss Material");
            var root = new GameObject("Boss");
            var marker = root.AddComponent<GreyboxMarker>();
            marker.ArtifactKind = GreyboxArtifactKind.GameViewport;
            marker.SourceFileName = "levels/arena.gameview.json";
            marker.Collection = "actors";
            marker.MarkerId = "boss";
            marker.JsonPath = "$.actors[id=boss]";
            var child = new GameObject("Boss Visual");
            child.transform.SetParent(root.transform, false);
            var renderer = child.AddComponent<MeshRenderer>();

            try
            {
                AssetDatabase.CreateAsset(material, materialPath);
                ClearPendingRoundTripEdits();
                var result = InvokeAssignAsset(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(child).ToString(),
                    ["componentType"] = typeof(MeshRenderer).FullName,
                    ["fieldName"] = nameof(Renderer.sharedMaterial),
                    ["assetPath"] = materialPath
                });

                Assert.AreSame(material, renderer.sharedMaterial);
                Assert.AreEqual("", result["previousAssetPath"].Value<string>());
                Assert.AreEqual("", result["previousAssetGuid"].Value<string>());
                Assert.AreEqual("", result["previousObjectName"].Value<string>());
                Assert.AreEqual("Boss Material", result["objectName"].Value<string>());
                Assert.AreEqual("$.actors[id=boss].materialAssetPath", result["roundTripPath"].Value<string>());
                Assert.AreEqual(materialPath, result["roundTripValue"].Value<string>());
                Assert.AreEqual(1, PendingRoundTripFieldEditCount());
            }
            finally
            {
                ClearPendingRoundTripEdits();
                Object.DestroyImmediate(root);
                AssetDatabase.DeleteAsset(folder);
            }
        }

        [Test]
        public void AssignAssetRejectsUnsafeAssetPathsBeforeLookup()
        {
            var go = new GameObject("Boss");
            go.AddComponent<MeshFilter>();
            try
            {
                foreach (string assetPath in new[]
                {
                    "/absolute/BossMesh.asset",
                    "../BossMesh.asset",
                    "Packages/com.greybox/BossMesh.asset",
                    "https://example.test/BossMesh.asset",
                    " Assets/BossMesh.asset",
                    "Assets/BossMesh.asset ",
                    "Assets/",
                    "Assets\\BossMesh.asset",
                    "Assets/Boss\\Mesh.asset",
                    "Assets//BossMesh.asset",
                    "Assets/\n/BossMesh.asset",
                    "Assets/\u000B/BossMesh.asset",
                })
                {
                    var error = Assert.Throws<System.InvalidOperationException>(() => InvokeAssignAsset(new JObject
                    {
                        ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                        ["componentType"] = typeof(MeshFilter).FullName,
                        ["fieldName"] = nameof(MeshFilter.sharedMesh),
                        ["assetPath"] = assetPath,
                    }));
                    StringAssert.Contains("project-relative Assets/", error.Message);
                }
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void AssignAssetRejectsUnadvertisedMemberSurfaces()
        {
            string folder = CreateTempAssetFolder();
            string meshPath = $"{folder}/BossMesh.asset";
            string materialPath = $"{folder}/BossMaterial.mat";
            var mesh = new Mesh
            {
                vertices = new[] { Vector3.zero, Vector3.right, Vector3.up },
                triangles = new[] { 0, 1, 2 },
            };
            var material = MaterialBuilder.Colored(new Color(1f, 0.42f, 0.21f), "Boss Material");
            var go = new GameObject("MCP Asset Target");
            var renderer = go.AddComponent<MeshRenderer>();
            var unsafeSurface = go.AddComponent<UnsafeMutableSurfaceComponent>();

            try
            {
                AssetDatabase.CreateAsset(mesh, meshPath);
                AssetDatabase.CreateAsset(material, materialPath);

                var rendererMaterial = Assert.Throws<System.InvalidOperationException>(() => InvokeAssignAsset(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(MeshRenderer).FullName,
                    ["fieldName"] = nameof(Renderer.material),
                    ["assetPath"] = materialPath,
                }));
                StringAssert.Contains("Assignable asset reference field or property not found", rendererMaterial.Message);
                Assert.AreNotSame(material, renderer.sharedMaterial);

                var obsoleteField = Assert.Throws<System.InvalidOperationException>(() => InvokeAssignAsset(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(UnsafeMutableSurfaceComponent).FullName,
                    ["fieldName"] = nameof(UnsafeMutableSurfaceComponent.LegacyMeshReference),
                    ["assetPath"] = meshPath,
                }));
                StringAssert.Contains("Assignable asset reference field or property not found", obsoleteField.Message);
                Assert.IsNull(unsafeSurface.LegacyMeshReference);

                var runtimeOnlyField = Assert.Throws<System.InvalidOperationException>(() => InvokeAssignAsset(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(UnsafeMutableSurfaceComponent).FullName,
                    ["fieldName"] = nameof(UnsafeMutableSurfaceComponent.RuntimeMeshReference),
                    ["assetPath"] = meshPath,
                }));
                StringAssert.Contains("Assignable asset reference field or property not found", runtimeOnlyField.Message);
                Assert.IsNull(unsafeSurface.RuntimeMeshReference);

                var hiddenField = Assert.Throws<System.InvalidOperationException>(() => InvokeAssignAsset(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(UnsafeMutableSurfaceComponent).FullName,
                    ["fieldName"] = nameof(UnsafeMutableSurfaceComponent.HiddenMeshReference),
                    ["assetPath"] = meshPath,
                }));
                StringAssert.Contains("Assignable asset reference field or property not found", hiddenField.Message);
                Assert.IsNull(unsafeSurface.HiddenMeshReference);
            }
            finally
            {
                Object.DestroyImmediate(go);
                AssetDatabase.DeleteAsset(folder);
            }
        }

        [Test]
        public void AddComponentAllowsConcreteUnityComponentsOnly()
        {
            var go = new GameObject("MCP Target");
            try
            {
                var result = InvokeAddComponent(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(MeshFilter).FullName,
                });

                Assert.NotNull(go.GetComponent<MeshFilter>());
                Assert.AreEqual(typeof(MeshFilter).FullName, result["component"].Value<string>());
                Assert.AreEqual(nameof(MeshFilter), result["componentName"].Value<string>());
                Assert.AreEqual(typeof(MeshFilter).FullName, result["componentDetail"]["type"].Value<string>());
                Assert.True(result["sceneDirty"].Value<bool>());
                var sharedMesh = FindMemberDetail((JArray)result["componentDetail"]["assetReferenceFields"], nameof(MeshFilter.sharedMesh));
                Assert.AreEqual("unity.assignAsset", sharedMesh["assignTool"].Value<string>());
                Assert.AreEqual(typeof(Mesh).FullName, sharedMesh["valueType"].Value<string>());

                var lightResult = InvokeAddComponent(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = nameof(Light),
                });
                Assert.NotNull(go.GetComponent<Light>());
                Assert.AreEqual(typeof(Light).FullName, lightResult["component"].Value<string>());
                Assert.AreEqual(nameof(Light), lightResult["componentName"].Value<string>());

                var nonComponent = Assert.Throws<System.InvalidOperationException>(() => InvokeAddComponent(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(string).FullName,
                }));
                StringAssert.Contains("UnityEngine.Component", nonComponent.Message);

                var abstractComponent = Assert.Throws<System.InvalidOperationException>(() => InvokeAddComponent(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(AbstractTestComponent).FullName,
                }));
                StringAssert.Contains("not addable", abstractComponent.Message);
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void AddComponentRejectsDuplicateMcpSingletonComponents()
        {
            var go = new GameObject("MCP Singleton Target");
            try
            {
                InvokeAddComponent(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(GreyboxActorDefinition).FullName,
                });

                var duplicate = Assert.Throws<System.InvalidOperationException>(() => InvokeAddComponent(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(GreyboxActorDefinition).FullName,
                }));
                StringAssert.Contains("single-instance", duplicate.Message);
                Assert.AreEqual(1, go.GetComponents<GreyboxActorDefinition>().Length);
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void ComponentTypeResolutionRejectsAmbiguousSimpleNames()
        {
            var go = new GameObject("MCP Target");
            try
            {
                var ambiguous = Assert.Throws<System.InvalidOperationException>(() => InvokeAddComponent(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = "DuplicateMcpComponent",
                }));
                StringAssert.Contains("ambiguous", ambiguous.Message);
                StringAssert.Contains("fully qualified", ambiguous.Message);

                var unadvertised = Assert.Throws<System.InvalidOperationException>(() => InvokeAddComponent(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(A.DuplicateMcpComponent).FullName,
                }));
                StringAssert.Contains("not advertised", unadvertised.Message);
                Assert.IsNull(go.GetComponent<A.DuplicateMcpComponent>());
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void FieldMutationToolsRejectNonComponentTypes()
        {
            var go = new GameObject("MCP Target");
            try
            {
                var setField = Assert.Throws<System.InvalidOperationException>(() => InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(string).FullName,
                    ["fieldName"] = "Length",
                    ["value"] = 1,
                }));
                StringAssert.Contains("UnityEngine.Component", setField.Message);

                var assignAsset = Assert.Throws<System.InvalidOperationException>(() => InvokeAssignAsset(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(string).FullName,
                    ["fieldName"] = "Length",
                    ["assetPath"] = "Assets/Missing.asset",
                }));
                StringAssert.Contains("UnityEngine.Component", assignAsset.Message);
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void SetFieldRejectsUnsafeMemberSurfaces()
        {
            var go = new GameObject("MCP Target");
            var unsafeSurface = go.AddComponent<UnsafeMutableSurfaceComponent>();
            try
            {
                var objectReference = Assert.Throws<System.InvalidOperationException>(() => InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(UnsafeMutableSurfaceComponent).FullName,
                    ["fieldName"] = nameof(UnsafeMutableSurfaceComponent.MeshReference),
                    ["value"] = "Assets/Meshes/Boss.asset",
                }));
                StringAssert.Contains("unity.assignAsset", objectReference.Message);

                var readOnlyField = Assert.Throws<System.InvalidOperationException>(() => InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(UnsafeMutableSurfaceComponent).FullName,
                    ["fieldName"] = nameof(UnsafeMutableSurfaceComponent.ReadOnlyScore),
                    ["value"] = 12,
                }));
                StringAssert.Contains("Writable field or property not found", readOnlyField.Message);
                Assert.AreEqual(7, unsafeSurface.ReadOnlyScore);

                var privateSetter = Assert.Throws<System.InvalidOperationException>(() => InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(UnsafeMutableSurfaceComponent).FullName,
                    ["fieldName"] = nameof(UnsafeMutableSurfaceComponent.PrivateSetterScore),
                    ["value"] = 12,
                }));
                StringAssert.Contains("Writable field or property not found", privateSetter.Message);
                Assert.AreEqual(3, unsafeSurface.PrivateSetterScore);

                var indexer = Assert.Throws<System.InvalidOperationException>(() => InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(UnsafeMutableSurfaceComponent).FullName,
                    ["fieldName"] = "Item",
                    ["value"] = 12,
                }));
                StringAssert.Contains("Writable field or property not found", indexer.Message);

                var obsoleteField = Assert.Throws<System.InvalidOperationException>(() => InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(UnsafeMutableSurfaceComponent).FullName,
                    ["fieldName"] = nameof(UnsafeMutableSurfaceComponent.LegacyScore),
                    ["value"] = 12,
                }));
                StringAssert.Contains("Writable field or property not found", obsoleteField.Message);
                Assert.AreEqual(5, unsafeSurface.LegacyScore);

                var transientField = Assert.Throws<System.InvalidOperationException>(() => InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(UnsafeMutableSurfaceComponent).FullName,
                    ["fieldName"] = nameof(UnsafeMutableSurfaceComponent.TransientScore),
                    ["value"] = 12,
                }));
                StringAssert.Contains("Writable field or property not found", transientField.Message);
                Assert.AreEqual(11, unsafeSurface.TransientScore);

                var hiddenField = Assert.Throws<System.InvalidOperationException>(() => InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(UnsafeMutableSurfaceComponent).FullName,
                    ["fieldName"] = nameof(UnsafeMutableSurfaceComponent.HiddenScore),
                    ["value"] = 12,
                }));
                StringAssert.Contains("Writable field or property not found", hiddenField.Message);
                Assert.AreEqual(13, unsafeSurface.HiddenScore);

                var inheritedName = Assert.Throws<System.InvalidOperationException>(() => InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(UnsafeMutableSurfaceComponent).FullName,
                    ["fieldName"] = nameof(Object.name),
                    ["value"] = "Unsafe Component",
                }));
                StringAssert.Contains("Writable field or property not found", inheritedName.Message);
                Assert.AreEqual("MCP Target", go.name);
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void McpSetFieldRejectsSchemaInvalidValueShapes()
        {
            var go = new GameObject("MCP Value Shape");
            var actor = go.AddComponent<GreyboxActorDefinition>();
            actor.DisplayName = "Boss";

            try
            {
                var objectValue = Assert.Throws<System.InvalidOperationException>(() => InvokeUnityTool("unity.setField", new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(GreyboxActorDefinition).FullName,
                    ["fieldName"] = nameof(GreyboxActorDefinition.DisplayName),
                    ["value"] = new JObject { ["foo"] = "bar" },
                }));
                StringAssert.Contains("string, string array, number, boolean, Vector3, or Color", objectValue.Message);
                Assert.AreEqual("Boss", actor.DisplayName);

                var oversizedString = Assert.Throws<System.InvalidOperationException>(() => InvokeUnityTool("unity.setField", new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(GreyboxActorDefinition).FullName,
                    ["fieldName"] = nameof(GreyboxActorDefinition.DisplayName),
                    ["value"] = new string('A', 4097),
                }));
                StringAssert.Contains("4096 characters or fewer", oversizedString.Message);
                Assert.AreEqual("Boss", actor.DisplayName);

                var arrayValue = Assert.Throws<System.InvalidOperationException>(() => InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(GreyboxActorDefinition).FullName,
                    ["fieldName"] = nameof(GreyboxActorDefinition.DisplayName),
                    ["value"] = new JArray("bad", "shape", "payload"),
                }));
                StringAssert.Contains("must be a JSON string", arrayValue.Message);
                Assert.AreEqual("Boss", actor.DisplayName);

                var oversizedArrayItem = Assert.Throws<System.InvalidOperationException>(() => InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(GreyboxActorDefinition).FullName,
                    ["fieldName"] = nameof(GreyboxActorDefinition.AbilityIds),
                    ["value"] = new JArray(new string('a', 257)),
                }));
                StringAssert.Contains("256 characters or fewer", oversizedArrayItem.Message);

                var controlArrayItem = Assert.Throws<System.InvalidOperationException>(() => InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(GreyboxActorDefinition).FullName,
                    ["fieldName"] = nameof(GreyboxActorDefinition.AbilityIds),
                    ["value"] = new JArray("dash\nbreak"),
                }));
                StringAssert.Contains("control characters", controlArrayItem.Message);

                var nullValue = Assert.Throws<System.InvalidOperationException>(() => InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(GreyboxActorDefinition).FullName,
                    ["fieldName"] = nameof(GreyboxActorDefinition.DisplayName),
                    ["value"] = JValue.CreateNull(),
                }));
                StringAssert.Contains("Missing required argument", nullValue.Message);
                Assert.AreEqual("Boss", actor.DisplayName);
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void McpSetFieldRejectsScalarTypeCoercion()
        {
            var go = new GameObject("MCP Scalar Target");
            var actor = go.AddComponent<GreyboxActorDefinition>();
            actor.DisplayName = "Boss";
            actor.Health = 2;
            actor.MoveSpeed = 3.5f;
            actor.IsEnemy = false;

            try
            {
                var stringField = Assert.Throws<System.InvalidOperationException>(() => InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(GreyboxActorDefinition).FullName,
                    ["fieldName"] = nameof(GreyboxActorDefinition.DisplayName),
                    ["value"] = 42,
                }));
                StringAssert.Contains("must be a JSON string", stringField.Message);
                Assert.AreEqual("Boss", actor.DisplayName);

                var intField = Assert.Throws<System.InvalidOperationException>(() => InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(GreyboxActorDefinition).FullName,
                    ["fieldName"] = nameof(GreyboxActorDefinition.Health),
                    ["value"] = "4",
                }));
                StringAssert.Contains("must be a JSON integer", intField.Message);
                Assert.AreEqual(2, actor.Health);

                var floatField = Assert.Throws<System.InvalidOperationException>(() => InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(GreyboxActorDefinition).FullName,
                    ["fieldName"] = nameof(GreyboxActorDefinition.MoveSpeed),
                    ["value"] = "4.5",
                }));
                StringAssert.Contains("must be a JSON number", floatField.Message);
                Assert.AreEqual(3.5f, actor.MoveSpeed);

                var boolField = Assert.Throws<System.InvalidOperationException>(() => InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(GreyboxActorDefinition).FullName,
                    ["fieldName"] = nameof(GreyboxActorDefinition.IsEnemy),
                    ["value"] = "true",
                }));
                StringAssert.Contains("must be a JSON boolean", boolField.Message);
                Assert.False(actor.IsEnemy);
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void McpRejectsNonFiniteNumericValues()
        {
            var scalarTarget = new GameObject("MCP Finite Scalar");
            var vectorTarget = new GameObject("MCP Finite Vector");
            var colorTarget = new GameObject("MCP Finite Color");
            var actor = scalarTarget.AddComponent<GreyboxActorDefinition>();
            actor.MoveSpeed = 3.5f;
            vectorTarget.transform.localPosition = Vector3.one;
            var camera = colorTarget.AddComponent<GreyboxCameraRig>();
            camera.BackgroundColor = Color.black;

            try
            {
                var scalar = Assert.Throws<System.InvalidOperationException>(() => InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(scalarTarget).ToString(),
                    ["componentType"] = typeof(GreyboxActorDefinition).FullName,
                    ["fieldName"] = nameof(GreyboxActorDefinition.MoveSpeed),
                    ["value"] = new JValue(double.PositiveInfinity),
                }));
                StringAssert.Contains("finite", scalar.Message);
                Assert.AreEqual(3.5f, actor.MoveSpeed);

                var vector = Assert.Throws<System.InvalidOperationException>(() => InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(vectorTarget).ToString(),
                    ["componentType"] = typeof(Transform).FullName,
                    ["fieldName"] = nameof(Transform.localPosition),
                    ["value"] = new JObject { ["x"] = 1f, ["y"] = new JValue(double.NaN), ["z"] = 3f },
                }));
                StringAssert.Contains("finite", vector.Message);
                Assert.AreEqual(Vector3.one, vectorTarget.transform.localPosition);

                var color = Assert.Throws<System.InvalidOperationException>(() => InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(colorTarget).ToString(),
                    ["componentType"] = typeof(GreyboxCameraRig).FullName,
                    ["fieldName"] = nameof(GreyboxCameraRig.BackgroundColor),
                    ["value"] = new JArray(1f, new JValue(double.NegativeInfinity), 0f),
                }));
                StringAssert.Contains("finite", color.Message);
                Assert.AreEqual(Color.black, camera.BackgroundColor);

                var create = Assert.Throws<System.InvalidOperationException>(() => InvokeUnityTool("unity.createGameObject", new JObject
                {
                    ["name"] = "Nonfinite Spawn",
                    ["position"] = new JArray(1f, new JValue(double.PositiveInfinity), 3f),
                }));
                StringAssert.Contains("finite", create.Message);
                Assert.IsNull(GameObject.Find("Nonfinite Spawn"));
            }
            finally
            {
                Object.DestroyImmediate(scalarTarget);
                Object.DestroyImmediate(vectorTarget);
                Object.DestroyImmediate(colorTarget);
                var created = GameObject.Find("Nonfinite Spawn");
                if (created) Object.DestroyImmediate(created);
            }
        }

        [Test]
        public void McpRejectsOutOfRangeIntegerValues()
        {
            var go = new GameObject("MCP Int32 Target");
            var actor = go.AddComponent<GreyboxActorDefinition>();
            actor.Health = 2;

            try
            {
                var field = Assert.Throws<System.InvalidOperationException>(() => InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(GreyboxActorDefinition).FullName,
                    ["fieldName"] = nameof(GreyboxActorDefinition.Health),
                    ["value"] = new JValue((long)int.MaxValue + 1L),
                }));
                StringAssert.Contains("32-bit integer", field.Message);
                Assert.AreEqual(2, actor.Health);

                var screenshot = Assert.Throws<System.InvalidOperationException>(() => InvokeUnityTool("unity.captureGameViewScreenshot", new JObject
                {
                    ["width"] = new JValue((long)int.MaxValue + 1L),
                    ["height"] = 720,
                }));
                StringAssert.Contains("32-bit integer", screenshot.Message);
                StringAssert.Contains("width", screenshot.Message);
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void McpSetFieldRejectsUnnamedEnumValues()
        {
            var go = new GameObject("MCP Enum Target");
            var marker = go.AddComponent<GreyboxMarker>();
            marker.ArtifactKind = GreyboxArtifactKind.GameViewport;

            try
            {
                var valid = InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(GreyboxMarker).FullName,
                    ["fieldName"] = nameof(GreyboxMarker.ArtifactKind),
                    ["value"] = "HudLayout",
                });
                Assert.AreEqual(GreyboxArtifactKind.HudLayout, marker.ArtifactKind);
                Assert.AreEqual("HudLayout", valid["value"].Value<string>());

                var numericEnum = Assert.Throws<System.InvalidOperationException>(() => InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(GreyboxMarker).FullName,
                    ["fieldName"] = nameof(GreyboxMarker.ArtifactKind),
                    ["value"] = 2,
                }));
                StringAssert.Contains("Enum value must be a string", numericEnum.Message);
                Assert.AreEqual(GreyboxArtifactKind.HudLayout, marker.ArtifactKind);

                var undefinedEnum = Assert.Throws<System.InvalidOperationException>(() => InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(GreyboxMarker).FullName,
                    ["fieldName"] = nameof(GreyboxMarker.ArtifactKind),
                    ["value"] = "999",
                }));
                StringAssert.Contains("named enum value", undefinedEnum.Message);
                Assert.AreEqual(GreyboxArtifactKind.HudLayout, marker.ArtifactKind);

                var oversizedEnum = Assert.Throws<System.InvalidOperationException>(() => InvokeSetField(new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(GreyboxMarker).FullName,
                    ["fieldName"] = nameof(GreyboxMarker.ArtifactKind),
                    ["value"] = new string('A', 129),
                }));
                StringAssert.Contains("128 characters or fewer", oversizedEnum.Message);
                Assert.AreEqual(GreyboxArtifactKind.HudLayout, marker.ArtifactKind);
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void McpRunAndScreenshotInputsAreBounded()
        {
            const string qualifiedTest = "Greybox.Tests.EditMode.McpBridgeTests.SceneHierarchyDescriptionIncludesGreyboxMetadataAndEditableFields";
            Assert.AreEqual(qualifiedTest, InvokeNormalizeMcpTestName("  " + qualifiedTest + "  "));

            var emptyTest = Assert.Throws<System.InvalidOperationException>(() => InvokeNormalizeMcpTestName("  "));
            StringAssert.Contains("testName is required", emptyTest.Message);

            var controlTest = Assert.Throws<System.InvalidOperationException>(() => InvokeNormalizeMcpTestName("Greybox.Tests.Bad\nName"));
            StringAssert.Contains("control characters", controlTest.Message);

            var longTest = Assert.Throws<System.InvalidOperationException>(() => InvokeNormalizeMcpTestName(new string('A', 257)));
            StringAssert.Contains("256", longTest.Message);

            Assert.AreEqual(1280, InvokeNormalizeMcpScreenshotDimension(1280, "width"));
            Assert.AreEqual(720, InvokeNormalizeMcpScreenshotDimension(720, "height"));

            var tinyWidth = Assert.Throws<System.InvalidOperationException>(() => InvokeNormalizeMcpScreenshotDimension(63, "width"));
            StringAssert.Contains("between 64 and 4096", tinyWidth.Message);

            var hugeHeight = Assert.Throws<System.InvalidOperationException>(() => InvokeNormalizeMcpScreenshotDimension(4097, "height"));
            StringAssert.Contains("between 64 and 4096", hugeHeight.Message);

            string screenshotPath = InvokeCreateMcpScreenshotPath(1280, 720);
            StringAssert.StartsWith("Temp/Greybox/McpScreenshots/greybox-game-view-1280x720-", screenshotPath);
            StringAssert.EndsWith(".png", screenshotPath);
            Assert.False(screenshotPath.Contains("\\"));
            Assert.True(InvokeIsSafeMcpScreenshotFileName(Path.GetFileName(screenshotPath)));
            var screenshot = InvokeDescribeMcpScreenshotCapture(
                screenshotPath,
                Path.GetFullPath(screenshotPath),
                1280,
                720,
                true,
                "Game View set to 1280x720.");
            StringAssert.StartsWith("Temp/Greybox/McpScreenshots/greybox-game-view-1280x720-", screenshot["path"].Value<string>());
            Assert.AreEqual(Path.GetFullPath(screenshot["path"].Value<string>()), screenshot["absolutePath"].Value<string>());
            Assert.AreEqual(Path.GetFileName(screenshot["path"].Value<string>()), screenshot["fileName"].Value<string>());
            Assert.True(InvokeIsSafeMcpScreenshotFileName(screenshot["fileName"].Value<string>()));
            Assert.True(screenshot["asyncCapture"].Value<bool>());
            Assert.AreEqual(250, screenshot["pollAfterMs"].Value<int>());
            Assert.False(InvokeIsSafeMcpScreenshotFileName("../greybox-game-view-1280x720.png"));
            Assert.False(InvokeIsSafeMcpScreenshotFileName("greybox-game-view-1280x720.png\nInjected"));
            Assert.False(InvokeIsSafeMcpScreenshotFileName("not-greybox-game-view-1280x720.png"));
        }

        [Test]
        public void McpRunEditModeTestSubmissionContractInvokesRunnerAndTargetsEditMode()
        {
            const string qualifiedTest = "Greybox.Tests.EditMode.McpBridgeTests.SceneHierarchyDescriptionIncludesGreyboxMetadataAndEditableFields";
            var submittedAtUtc = new DateTimeOffset(2026, 5, 26, 12, 34, 56, 789, TimeSpan.Zero);
            bool invoked = false;
            object capturedSettings = null;

            JObject result = InvokeSubmitMcpEditModeTestRun(qualifiedTest, submittedAtUtc, settings =>
            {
                invoked = true;
                capturedSettings = settings;
                return "unity-test-run-guid-123";
            });
            JObject repeat = InvokeSubmitMcpEditModeTestRun(qualifiedTest, submittedAtUtc, _ => "different-unity-guid-456");

            Assert.True(invoked);
            Assert.NotNull(capturedSettings);
            Assert.AreEqual("ExecutionSettings", capturedSettings.GetType().Name);
            Assert.True(result["submitted"].Value<bool>());
            Assert.AreEqual("submitted", result["status"].Value<string>());
            StringAssert.StartsWith("greybox-editmode-test-", result["runId"].Value<string>());
            Assert.AreEqual(result["runId"].Value<string>(), repeat["runId"].Value<string>());
            Assert.AreEqual("unity-test-run-guid-123", result["unityRunGuid"].Value<string>());
            Assert.AreEqual(qualifiedTest, result["testName"].Value<string>());
            Assert.AreEqual(qualifiedTest, result["sanitizedTestName"].Value<string>());
            Assert.AreEqual(qualifiedTest.Length, result["testNameLength"].Value<int>());
            Assert.AreEqual(256, result["testNameMaxLength"].Value<int>());
            Assert.AreEqual("2026-05-26T12:34:56.7890000Z", result["submittedAtUtc"].Value<string>());

            var filter = result["editModeFilter"];
            Assert.AreEqual("EditMode", filter["testMode"].Value<string>());
            Assert.AreEqual("testNames", filter["selector"].Value<string>());
            Assert.AreEqual(qualifiedTest, filter["testNames"][0].Value<string>());
            Assert.AreEqual(1, filter["testNameCount"].Value<int>());
            Assert.AreEqual(256, filter["testNameMaxLength"].Value<int>());
            Assert.False(filter["usesRegex"].Value<bool>());

            var contract = result["resultContract"];
            Assert.AreEqual("unity.editModeTest.submission", contract["kind"].Value<string>());
            Assert.AreEqual("submitted", contract["status"].Value<string>());
            Assert.False(contract["finalResultInResponse"].Value<bool>());
            Assert.AreEqual("unityRunGuid", contract["followUpIdentifier"].Value<string>());
            Assert.AreEqual("unity-test-run-guid-123", contract["followUpValue"].Value<string>());
            CollectionAssert.Contains(contract["nonTerminalStatuses"].Values<string>().ToArray(), "running");
            CollectionAssert.Contains(contract["terminalStatuses"].Values<string>().ToArray(), "failed");
            StringAssert.Contains("Unity Test Runner", contract["statusHint"].Value<string>());

            string serialized = result.ToString();
            Assert.False(serialized.Contains("/Users/"));
            Assert.False(serialized.Contains("sk_live"));
            Assert.False(serialized.Contains("Bearer "));
        }

        [Test]
        public void McpRunEditModeTestCompletionContractReturnsFinalEvidence()
        {
            const string qualifiedTest = "Greybox.Tests.EditMode.McpBridgeTests.SceneHierarchyDescriptionIncludesGreyboxMetadataAndEditableFields";
            var submittedAtUtc = new DateTimeOffset(2026, 5, 26, 12, 34, 56, 789, TimeSpan.Zero);
            JObject submission = InvokeSubmitMcpEditModeTestRun(qualifiedTest, submittedAtUtc, _ => "unity-test-run-guid-123");
            var rootResult = new FakeMcpTestResult
            {
                Name = "McpBridgeTests",
                FullName = qualifiedTest,
                TestStatus = "Passed",
                ResultState = "Success",
                Duration = 0.125d,
                AssertCount = 3,
                PassCount = 1,
                FailCount = 0,
                SkipCount = 0,
                InconclusiveCount = 0,
                HasChildren = false
            };
            var leafResult = new FakeMcpTestResult
            {
                Name = "SceneHierarchyDescriptionIncludesGreyboxMetadataAndEditableFields",
                FullName = qualifiedTest,
                TestStatus = "Passed",
                ResultState = "Success",
                Duration = 0.125d,
                AssertCount = 3,
                PassCount = 1
            };

            JObject completed = InvokePrivateJObject(
                "DescribeMcpEditModeTestCompletion",
                submission,
                rootResult,
                new List<object> { leafResult },
                "2026-05-26T12:34:57.0000000Z");

            Assert.True(completed["completed"].Value<bool>());
            Assert.AreEqual("passed", completed["status"].Value<string>());
            Assert.AreEqual("passed", completed["result"]["status"].Value<string>());
            Assert.AreEqual(1, completed["result"]["passCount"].Value<int>());
            Assert.AreEqual(0, completed["result"]["failCount"].Value<int>());
            Assert.AreEqual(1, ((JArray)completed["testResults"]).Count);
            Assert.False(completed["testResultsTruncated"].Value<bool>());
            Assert.AreEqual("unity.editModeTest.result", completed["resultContract"]["kind"].Value<string>());
            Assert.True(completed["resultContract"]["finalResultInResponse"].Value<bool>());
            Assert.AreEqual("passed", completed["resultContract"]["status"].Value<string>());

            string serialized = completed.ToString();
            Assert.False(serialized.Contains("/Users/"));
            Assert.False(serialized.Contains("sk_live"));
            Assert.False(serialized.Contains("Bearer "));
        }

        [Test]
        public void McpRunEditModeTestRejectsUnsafeNamesWithoutLeakingSensitiveText()
        {
            foreach (string unsafeName in new[]
            {
                "/Users/kai/SecretProject/Assets/Tests/BossTests.cs",
                @"C:\Users\kai\SecretProject\Tests\BossTests.cs",
                "Greybox.Tests.Leaks.sk_live_unity_secret",
                "Greybox.Tests.Leaks.Bearer mcpsecret0123456789abcdef",
                "Greybox.Tests.Leaks.buyer@example.com"
            })
            {
                var error = Assert.Throws<InvalidOperationException>(() => InvokeNormalizeMcpTestName(unsafeName));
                StringAssert.Contains("testName", error.Message);
                Assert.False(error.Message.Contains("/Users/"));
                Assert.False(error.Message.Contains("sk_live"));
                Assert.False(error.Message.Contains("Bearer "));
                Assert.False(error.Message.Contains("buyer@example.com"));
            }
        }

        [Test]
        public void McpAuthTokenMatchingIsStrictAndFixedTimeBacked()
        {
            string token = GreyboxSettings.RotateMcpBridgeToken();
            Assert.AreEqual(43, token.Length);
            Assert.True(GreyboxSettings.IsSafeMcpBridgeToken(token));
            Assert.True(InvokeMcpTokenMatches(token, token));
            Assert.True(InvokeMcpAuthorizationHeaderMatches("Bearer " + token, token));

            Assert.False(InvokeMcpTokenMatches(token + " ", token));
            Assert.False(InvokeMcpTokenMatches("short-token", "short-token"));
            Assert.False(InvokeMcpTokenMatches("/" + token.Substring(1), token));
            Assert.False(InvokeMcpTokenMatches(token, GreyboxSettings.RotateMcpBridgeToken()));
            Assert.False(InvokeMcpTokenMatches("", token));
            Assert.False(InvokeMcpTokenMatches(token, ""));
            Assert.False(InvokeMcpAuthorizationHeaderMatches("bearer " + token, token));
            Assert.False(InvokeMcpAuthorizationHeaderMatches("Bearer  " + token, token));
            Assert.False(InvokeMcpAuthorizationHeaderMatches("Bearer " + token + "\nInjected: true", token));
            Assert.False(InvokeMcpAuthorizationHeaderMatches("Bearer " + token + new string('x', 129), token));
            Assert.False(InvokeFixedTimeEquals(token, GreyboxSettings.RotateMcpBridgeToken()));

            EditorPrefs.SetString("Greybox.Studio.McpBridgeToken", "short-token");
            string repaired = GreyboxSettings.GetOrCreateMcpBridgeToken();
            Assert.True(GreyboxSettings.IsSafeMcpBridgeToken(repaired));
            Assert.AreNotEqual("short-token", repaired);
            GreyboxSettings.RotateMcpBridgeToken();
        }

        [Test]
        public void McpPostContentTypeRequiresJson()
        {
            Assert.True(InvokeIsAllowedMcpContentType("GET", ""));
            Assert.True(InvokeIsAllowedMcpContentType("GET", "text/plain"));
            Assert.True(InvokeIsAllowedMcpContentType("POST", "application/json"));
            Assert.True(InvokeIsAllowedMcpContentType("POST", "Application/Json; charset=utf-8"));
            Assert.True(InvokeIsAllowedMcpContentType("POST", " application/json ; charset=utf-8"));

            Assert.False(InvokeIsAllowedMcpContentType("POST", ""));
            Assert.False(InvokeIsAllowedMcpContentType("post", "text/plain"));
            Assert.False(InvokeIsAllowedMcpContentType("POST", "text/plain"));
            Assert.False(InvokeIsAllowedMcpContentType("POST", "application/x-www-form-urlencoded"));
            Assert.False(InvokeIsAllowedMcpContentType("POST", "multipart/form-data; boundary=greybox"));
        }

        [Test]
        public void McpBrowserOriginHeadersMustBeLoopback()
        {
            Assert.True(InvokeIsSafeMcpBrowserUrlHeader("Origin", ""));
            Assert.True(InvokeIsSafeMcpBrowserUrlHeader("Origin", "http://127.0.0.1:38467"));
            Assert.True(InvokeIsSafeMcpBrowserUrlHeader("Origin", "https://localhost:38467"));
            Assert.True(InvokeIsSafeMcpBrowserUrlHeader("Referer", "http://[::1]:38467/mcp"));
            Assert.True(InvokeIsSafeMcpFetchSiteHeader(""));
            Assert.True(InvokeIsSafeMcpFetchSiteHeader("same-origin"));
            Assert.True(InvokeIsSafeMcpFetchSiteHeader("same-site"));
            Assert.True(InvokeIsSafeMcpFetchSiteHeader("none"));

            Assert.False(InvokeIsSafeMcpBrowserUrlHeader("Origin", "https://evil.example"));
            Assert.False(InvokeIsSafeMcpBrowserUrlHeader("Origin", "http://127.0.0.1.evil.example"));
            Assert.False(InvokeIsSafeMcpBrowserUrlHeader("Origin", "http://user:pass@127.0.0.1:38467"));
            Assert.False(InvokeIsSafeMcpBrowserUrlHeader("Referer", "http://token:secret@[::1]:38467/mcp"));
            Assert.False(InvokeIsSafeMcpBrowserUrlHeader("Origin", "file:///Users/designer/index.html"));
            Assert.False(InvokeIsSafeMcpBrowserUrlHeader("Origin", "null"));
            Assert.False(InvokeIsSafeMcpBrowserUrlHeader("Origin", "http://127.0.0.1:38467\nInjected: true"));
            Assert.False(InvokeIsSafeMcpBrowserUrlHeader("Origin", "http://127.0.0.1/" + new string('x', 513)));
            Assert.False(InvokeIsSafeMcpBrowserUrlHeader("", "http://127.0.0.1:38467"));
            Assert.False(InvokeIsSafeMcpFetchSiteHeader("cross-site"));
            Assert.False(InvokeIsSafeMcpFetchSiteHeader("same-origin\ncross-site"));
        }

        [Test]
        public void McpHostHeaderMustBeLoopback()
        {
            Assert.True(InvokeIsSafeMcpHostHeader("127.0.0.1:38467"));
            Assert.True(InvokeIsSafeMcpHostHeader("localhost:38467"));
            Assert.True(InvokeIsSafeMcpHostHeader("[::1]:38467"));
            Assert.True(InvokeIsSafeMcpHostHeader("127.0.0.1"));

            Assert.False(InvokeIsSafeMcpHostHeader(""));
            Assert.False(InvokeIsSafeMcpHostHeader("evil.example"));
            Assert.False(InvokeIsSafeMcpHostHeader("127.0.0.1.evil.example"));
            Assert.False(InvokeIsSafeMcpHostHeader("http://127.0.0.1:38467"));
            Assert.False(InvokeIsSafeMcpHostHeader("user@localhost:38467"));
            Assert.False(InvokeIsSafeMcpHostHeader("localhost:0"));
            Assert.False(InvokeIsSafeMcpHostHeader("localhost:65536"));
            Assert.False(InvokeIsSafeMcpHostHeader("localhost:not-a-port"));
            Assert.False(InvokeIsSafeMcpHostHeader("::1"));
            Assert.False(InvokeIsSafeMcpHostHeader("127.0.0.1:38467\nInjected: true"));
        }

        [Test]
        public void McpListenerPrefixIsLoopbackAndStartupFailureResetsState()
        {
            string prefix = InvokePrivateStringConstant("McpListenerPrefix");
            Assert.AreEqual("http://127.0.0.1:38467/", prefix);
            Assert.False(prefix.Contains("0.0.0.0"));
            Assert.False(prefix.Contains("localhost"));

            Assert.NotNull(typeof(GreyboxMcpServer).GetMethod("TryStartMcpListener", BindingFlags.Static | BindingFlags.NonPublic));
            Assert.NotNull(typeof(GreyboxMcpServer).GetMethod("ResetMcpListenerStateAfterStartFailure", BindingFlags.Static | BindingFlags.NonPublic));
        }

        [Test]
        public void McpJsonRpcBatchSizeIsBounded()
        {
            var batch = new JArray();
            for (int i = 0; i < 32; i++)
            {
                batch.Add(new JObject
                {
                    ["jsonrpc"] = "2.0",
                    ["id"] = i,
                    ["method"] = "initialize"
                });
            }

            var allowed = JArray.Parse(InvokeMcpJsonRpc(batch.ToString()));
            Assert.AreEqual(32, allowed.Count);

            batch.Add(new JObject
            {
                ["jsonrpc"] = "2.0",
                ["id"] = 33,
                ["method"] = "initialize"
            });

            var rejected = JObject.Parse(InvokeMcpJsonRpc(batch.ToString()));
            Assert.AreEqual(-32600, rejected["error"]["code"].Value<int>());
            StringAssert.Contains("32", rejected["error"]["message"].Value<string>());
        }

        [Test]
        public void McpJsonRpcEnvelopeStringsAreStrict()
        {
            var numericJsonRpc = JObject.Parse(InvokeMcpJsonRpc(new JObject
            {
                ["jsonrpc"] = 2.0,
                ["id"] = 1,
                ["method"] = "initialize"
            }.ToString()));
            Assert.AreEqual(-32600, numericJsonRpc["error"]["code"].Value<int>());
            StringAssert.Contains("jsonrpc must be a string", numericJsonRpc["error"]["message"].Value<string>());

            var numericMethod = JObject.Parse(InvokeMcpJsonRpc(new JObject
            {
                ["jsonrpc"] = "2.0",
                ["id"] = 2,
                ["method"] = 42
            }.ToString()));
            Assert.AreEqual(-32600, numericMethod["error"]["code"].Value<int>());
            StringAssert.Contains("method must be a string", numericMethod["error"]["message"].Value<string>());
        }

        [Test]
        public void McpJsonRpcToolsCallParamsAreObjectShaped()
        {
            var arrayParams = JObject.Parse(InvokeMcpJsonRpc(new JObject
            {
                ["jsonrpc"] = "2.0",
                ["id"] = 1,
                ["method"] = "tools/call",
                ["params"] = new JArray("unity.getSceneHierarchy")
            }.ToString()));
            Assert.AreEqual(-32602, arrayParams["error"]["code"].Value<int>());
            StringAssert.Contains("params must be an object", arrayParams["error"]["message"].Value<string>());

            var missingName = JObject.Parse(InvokeMcpJsonRpc(new JObject
            {
                ["jsonrpc"] = "2.0",
                ["id"] = 2,
                ["method"] = "tools/call",
                ["params"] = new JObject { ["arguments"] = new JObject() }
            }.ToString()));
            Assert.AreEqual(-32602, missingName["error"]["code"].Value<int>());
            StringAssert.Contains("params.name is required", missingName["error"]["message"].Value<string>());

            var numericName = JObject.Parse(InvokeMcpJsonRpc(new JObject
            {
                ["jsonrpc"] = "2.0",
                ["id"] = 3,
                ["method"] = "tools/call",
                ["params"] = new JObject { ["name"] = 42, ["arguments"] = new JObject() }
            }.ToString()));
            Assert.AreEqual(-32602, numericName["error"]["code"].Value<int>());
            StringAssert.Contains("params.name must be a string", numericName["error"]["message"].Value<string>());

            var arrayArguments = JObject.Parse(InvokeMcpJsonRpc(new JObject
            {
                ["jsonrpc"] = "2.0",
                ["id"] = 4,
                ["method"] = "tools/call",
                ["params"] = new JObject
                {
                    ["name"] = "unity.getSceneHierarchy",
                    ["arguments"] = new JArray()
                }
            }.ToString()));
            Assert.AreEqual(-32602, arrayArguments["error"]["code"].Value<int>());
            StringAssert.Contains("params.arguments must be an object", arrayArguments["error"]["message"].Value<string>());
        }

        [Test]
        public void McpToolResultEnvelopesExposeMcpErrorState()
        {
            var success = InvokeMcpToolSuccess(new JObject { ["ok"] = true });
            Assert.False(success["isError"].Value<bool>());
            Assert.AreEqual("text", success["content"][0]["type"].Value<string>());
            Assert.AreEqual(@"{""ok"":true}", success["content"][0]["text"].Value<string>());
            Assert.True(success["structuredContent"]["ok"].Value<bool>());

            var nullSuccess = InvokeMcpToolSuccess(null);
            Assert.False(nullSuccess["isError"].Value<bool>());
            Assert.AreEqual("null", nullSuccess["content"][0]["text"].Value<string>());
            Assert.AreEqual(JTokenType.Null, nullSuccess["structuredContent"].Type);

            var directSuccess = InvokeDirectToolSuccess(new JObject { ["ok"] = true });
            Assert.False(directSuccess["isError"].Value<bool>());
            Assert.AreEqual("json", directSuccess["content"][0]["type"].Value<string>());
            Assert.True(directSuccess["content"][0]["json"]["ok"].Value<bool>());
            Assert.True(directSuccess["structuredContent"]["ok"].Value<bool>());

            var error = InvokeMcpToolError("Missing required argument for unity.addComponent.gameObjectId");
            Assert.True(error["isError"].Value<bool>());
            Assert.AreEqual("text", error["content"][0]["type"].Value<string>());
            StringAssert.Contains("Missing required argument", error["content"][0]["text"].Value<string>());
            Assert.IsNull(error["structuredContent"]);

            var redacted = InvokeMcpToolError("Failed /Users/kai/Secret/Game/Assets/Boss.prefab for buyer@example.com at 10.0.0.42 with sk_live_unity_secret, Bearer mcpsecret0123456789abcdef, pi_test_payment_123, and card 4242 4242 4242 4242");
            string redactedText = redacted["content"][0]["text"].Value<string>();
            StringAssert.Contains("[redacted-path]", redactedText);
            StringAssert.Contains("[redacted-email]", redactedText);
            StringAssert.Contains("[redacted-ip]", redactedText);
            StringAssert.Contains("[redacted-secret]", redactedText);
            StringAssert.Contains("[redacted-stripe-id]", redactedText);
            StringAssert.Contains("[redacted-card]", redactedText);
            Assert.False(redactedText.Contains("/Users/kai/Secret"));
            Assert.False(redactedText.Contains("buyer@example.com"));
            Assert.False(redactedText.Contains("10.0.0.42"));
            Assert.False(redactedText.Contains("sk_live_unity_secret"));
            Assert.False(redactedText.Contains("mcpsecret0123456789abcdef"));
            Assert.False(redactedText.Contains("pi_test_payment_123"));
            Assert.False(redactedText.Contains("4242 4242"));
        }

        [Test]
        public void McpToolCallsRouteExecutionFailuresAsMcpResults()
        {
            var config = CreateLicensedMcpConfig();
            try
            {
                var success = JObject.Parse(InvokeMcpJsonRpc(new JObject
                {
                    ["jsonrpc"] = "2.0",
                    ["id"] = 11,
                    ["method"] = "tools/call",
                    ["params"] = new JObject
                    {
                        ["name"] = "unity.getSceneHierarchy",
                        ["arguments"] = new JObject()
                    }
                }.ToString()));
                Assert.IsNull(success["error"]);
                Assert.False(success["result"]["isError"].Value<bool>());
                Assert.AreEqual("text", success["result"]["content"][0]["type"].Value<string>());
                Assert.AreEqual(JTokenType.Array, success["result"]["structuredContent"].Type);

                var failure = JObject.Parse(InvokeMcpJsonRpc(new JObject
                {
                    ["jsonrpc"] = "2.0",
                    ["id"] = 12,
                    ["method"] = "tools/call",
                    ["params"] = new JObject
                    {
                        ["name"] = "unity.addComponent",
                        ["arguments"] = new JObject()
                    }
                }.ToString()));
                Assert.IsNull(failure["error"]);
                Assert.True(failure["result"]["isError"].Value<bool>());
                Assert.AreEqual("text", failure["result"]["content"][0]["type"].Value<string>());
                StringAssert.Contains("Missing required argument", failure["result"]["content"][0]["text"].Value<string>());
                Assert.IsNull(failure["result"]["structuredContent"]);

                var directSuccess = JObject.Parse(InvokeHandleToolCall(new JObject
                {
                    ["name"] = "unity.getSceneHierarchy",
                    ["arguments"] = new JObject()
                }.ToString()));
                Assert.False(directSuccess["isError"].Value<bool>());
                Assert.AreEqual("json", directSuccess["content"][0]["type"].Value<string>());
                Assert.AreEqual(JTokenType.Array, directSuccess["structuredContent"].Type);

                var directFailure = JObject.Parse(InvokeHandleToolCall(new JObject
                {
                    ["name"] = "unity.addComponent",
                    ["arguments"] = new JObject()
                }.ToString()));
                Assert.True(directFailure["isError"].Value<bool>());
                StringAssert.Contains("Missing required argument", directFailure["content"][0]["text"].Value<string>());
                Assert.IsNull(directFailure["structuredContent"]);
            }
            finally
            {
                ClearLicensedMcpConfig(config);
            }
        }

        [Test]
        public void McpDirectToolCallRequestShapeIsValidatedBeforeLicense()
        {
            var arrayBody = JObject.Parse(InvokeHandleToolCall(new JArray("unity.getSceneHierarchy").ToString()));
            Assert.AreEqual("mcp_invalid_tool_call", arrayBody["error"].Value<string>());
            StringAssert.Contains("body must be an object", arrayBody["message"].Value<string>());

            var missingName = JObject.Parse(InvokeHandleToolCall(new JObject
            {
                ["arguments"] = new JObject()
            }.ToString()));
            Assert.AreEqual("mcp_invalid_tool_call", missingName["error"].Value<string>());
            StringAssert.Contains("name is required", missingName["message"].Value<string>());

            var numericName = JObject.Parse(InvokeHandleToolCall(new JObject
            {
                ["name"] = 42,
                ["arguments"] = new JObject()
            }.ToString()));
            Assert.AreEqual("mcp_invalid_tool_call", numericName["error"].Value<string>());
            StringAssert.Contains("name must be a string", numericName["message"].Value<string>());

            var arrayArguments = JObject.Parse(InvokeHandleToolCall(new JObject
            {
                ["name"] = "unity.getSceneHierarchy",
                ["arguments"] = new JArray()
            }.ToString()));
            Assert.AreEqual("mcp_invalid_tool_call", arrayArguments["error"].Value<string>());
            StringAssert.Contains("arguments must be an object", arrayArguments["message"].Value<string>());

            var validWithoutLicense = JObject.Parse(InvokeHandleToolCall(new JObject
            {
                ["name"] = "unity.getSceneHierarchy",
                ["arguments"] = new JObject()
            }.ToString()));
            StringAssert.Contains("Create a Greybox config", validWithoutLicense["error"].Value<string>());
        }

        [Test]
        public void McpRuntimeRejectsUnknownToolArguments()
        {
            var go = new GameObject("MCP Strict Args");
            try
            {
                var error = Assert.Throws<System.InvalidOperationException>(() => InvokeUnityTool("unity.addComponent", new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(MeshFilter).FullName,
                    ["surprise"] = true,
                }));
                StringAssert.Contains("Unexpected argument", error.Message);
                StringAssert.Contains("unity.addComponent", error.Message);
                Assert.IsNull(go.GetComponent<MeshFilter>());

                var createAlias = Assert.Throws<System.InvalidOperationException>(() => InvokeUnityTool("unity.createGameObject", new JObject
                {
                    ["name"] = "Alias Probe",
                    ["localPosition"] = new JObject { ["x"] = 1f, ["y"] = 2f, ["z"] = 3f },
                }));
                StringAssert.Contains("localPosition", createAlias.Message);
                Assert.IsNull(GameObject.Find("Alias Probe"));

                var missingRequired = Assert.Throws<System.InvalidOperationException>(() => InvokeUnityTool("unity.addComponent", new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                }));
                StringAssert.Contains("Missing required argument", missingRequired.Message);
                StringAssert.Contains("componentType", missingRequired.Message);

                var nonStringComponent = Assert.Throws<System.InvalidOperationException>(() => InvokeUnityTool("unity.addComponent", new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = 42,
                }));
                StringAssert.Contains("must be a string", nonStringComponent.Message);
                StringAssert.Contains("componentType", nonStringComponent.Message);
                Assert.IsNull(go.GetComponent<MeshFilter>());

                var blankRequired = Assert.Throws<System.InvalidOperationException>(() => InvokeUnityTool("unity.createGameObject", new JObject
                {
                    ["name"] = " ",
                }));
                StringAssert.Contains("may not be blank", blankRequired.Message);

                var oversizedName = Assert.Throws<System.InvalidOperationException>(() => InvokeUnityTool("unity.createGameObject", new JObject
                {
                    ["name"] = new string('A', 129),
                }));
                StringAssert.Contains("128 characters or fewer", oversizedName.Message);

                var controlName = Assert.Throws<System.InvalidOperationException>(() => InvokeUnityTool("unity.createGameObject", new JObject
                {
                    ["name"] = "Control\nProbe",
                }));
                StringAssert.Contains("control characters", controlName.Message);
                StringAssert.Contains("name", controlName.Message);
                Assert.IsNull(GameObject.Find("Control\nProbe"));

                var oversizedParent = Assert.Throws<System.InvalidOperationException>(() => InvokeUnityTool("unity.createGameObject", new JObject
                {
                    ["name"] = "Oversized Parent Probe",
                    ["parent"] = new string('P', 513),
                }));
                StringAssert.Contains("512 characters or fewer", oversizedParent.Message);
                StringAssert.Contains("parent", oversizedParent.Message);
                Assert.IsNull(GameObject.Find("Oversized Parent Probe"));

                var oversizedAssetPath = Assert.Throws<System.InvalidOperationException>(() => InvokeUnityTool("unity.assignAsset", new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                    ["componentType"] = typeof(MeshFilter).FullName,
                    ["fieldName"] = "sharedMesh",
                    ["assetPath"] = new string('A', 513),
                }));
                StringAssert.Contains("512 characters or fewer", oversizedAssetPath.Message);
                StringAssert.Contains("assetPath", oversizedAssetPath.Message);

                var fractionalScreenshot = Assert.Throws<System.InvalidOperationException>(() => InvokeUnityTool("unity.captureGameViewScreenshot", new JObject
                {
                    ["width"] = 1280.5f,
                    ["height"] = 720,
                }));
                StringAssert.Contains("must be an integer", fractionalScreenshot.Message);
            }
            finally
            {
                Object.DestroyImmediate(go);
                var probe = GameObject.Find("Alias Probe");
                if (probe) Object.DestroyImmediate(probe);
                var parentProbe = GameObject.Find("Oversized Parent Probe");
                if (parentProbe) Object.DestroyImmediate(parentProbe);
            }
        }

        [Test]
        public void McpMutatingToolsRequireStableEditorState()
        {
            Assert.True(InvokeIsMcpMutationTool("unity.createGameObject"));
            Assert.True(InvokeIsMcpMutationTool("unity.setField"));
            Assert.True(InvokeIsMcpMutationTool("unity.assignAsset"));
            Assert.True(InvokeIsMcpMutationTool("unity.runEditModeTest"));
            Assert.True(InvokeIsMcpMutationTool("unity.buildAddressables"));
            Assert.False(InvokeIsMcpMutationTool("unity.getSceneHierarchy"));
            Assert.False(InvokeIsMcpMutationTool("unity.captureGameViewScreenshot"));

            Assert.False(InvokeIsUnityEditorReadyForMcpMutation("unity.setField", true, false, false, out string compilingMessage));
            StringAssert.Contains("compiling", compilingMessage);
            StringAssert.Contains("unity.setField", compilingMessage);

            Assert.False(InvokeIsUnityEditorReadyForMcpMutation("unity.assignAsset", false, true, false, out string updatingMessage));
            StringAssert.Contains("importing or refreshing assets", updatingMessage);
            StringAssert.Contains("unity.assignAsset", updatingMessage);

            Assert.False(InvokeIsUnityEditorReadyForMcpMutation("unity.runEditModeTest", false, false, true, out string playModeMessage));
            StringAssert.Contains("Play Mode", playModeMessage);
            StringAssert.Contains("unity.runEditModeTest", playModeMessage);

            Assert.True(InvokeIsUnityEditorReadyForMcpMutation("unity.buildAddressables", false, false, false, out string readyMessage));
            Assert.AreEqual("", readyMessage);

            Assert.True(InvokeIsUnityEditorReadyForMcpMutation("unity.getSceneHierarchy", true, true, true, out string readOnlyMessage));
            Assert.AreEqual("", readOnlyMessage);
        }

        [Test]
        public void McpBuildAddressablesSummaryIncludesGeneratedLabels()
        {
            JObject summary = InvokeDescribeAddressablesBuild(null);
            Assert.True(summary.Value<bool>("ok"));
            Assert.AreEqual(AddressablesTagger.GeneratedGroupName, summary.Value<string>("groupName"));
            Assert.AreEqual(AddressablesTagger.GeneratedLabel, summary.Value<string>("label"));
            Assert.AreEqual(0, summary.Value<int>("generatedEntryCount"));
            Assert.AreEqual(0, ((JArray)summary["generatedEntries"]).Count);
            Assert.False(summary.Value<bool>("generatedEntriesTruncated"));
            Assert.AreEqual(50, summary.Value<int>("maxGeneratedEntries"));
            Assert.AreEqual(0, summary["labelCounts"].Value<int>(AddressablesTagger.GeneratedLabel));
            Assert.AreEqual(0, summary["labelCounts"].Value<int>(AddressablesTagger.SampleSceneLabel));
            Assert.AreEqual(0, summary["labelCounts"].Value<int>(AddressablesTagger.PlatformerSampleLabel));
            Assert.NotNull(typeof(GreyboxMcpServer).GetMethod("CountAddressableLabels", BindingFlags.Static | BindingFlags.NonPublic));
            Assert.NotNull(typeof(GreyboxMcpServer).GetMethod("DescribeMissingAddressableLabels", BindingFlags.Static | BindingFlags.NonPublic));
            Assert.NotNull(typeof(GreyboxMcpServer).GetMethod("CompareAddressableEntriesForMcp", BindingFlags.Static | BindingFlags.NonPublic));
            Assert.NotNull(typeof(GreyboxMcpServer).GetMethod("DescribeAddressableEntryLabels", BindingFlags.Static | BindingFlags.NonPublic));
            string[] labels = summary["labels"].Values<string>().ToArray();
            string[] missingLabels = summary["missingLabels"].Values<string>().ToArray();
            CollectionAssert.Contains(labels, AddressablesTagger.GeneratedLabel);
            CollectionAssert.Contains(labels, AddressablesTagger.GameViewportLabel);
            CollectionAssert.Contains(labels, AddressablesTagger.ArtBibleLabel);
            CollectionAssert.Contains(labels, AddressablesTagger.HudLayoutLabel);
            CollectionAssert.Contains(labels, AddressablesTagger.LevelBoardLabel);
            CollectionAssert.Contains(labels, AddressablesTagger.SampleSceneLabel);
            CollectionAssert.Contains(labels, AddressablesTagger.PlatformerSampleLabel);
            CollectionAssert.Contains(missingLabels, AddressablesTagger.GeneratedLabel);
            CollectionAssert.Contains(missingLabels, AddressablesTagger.SampleSceneLabel);
            CollectionAssert.Contains(missingLabels, AddressablesTagger.PlatformerSampleLabel);
        }

        [Test]
        public void McpAddressablesEntryReportsAssetResolution()
        {
            JObject entry = InvokePrivateJObject("DescribeAddressableEntry", (object)null);
            Assert.AreEqual("", entry.Value<string>("guid"));
            Assert.AreEqual("", entry.Value<string>("address"));
            Assert.AreEqual("", entry.Value<string>("assetPath"));
            Assert.False(entry.Value<bool>("assetExists"));
            Assert.AreEqual("", entry.Value<string>("assetType"));
            Assert.AreEqual(0, ((JArray)entry["labels"]).Count);
        }

        [Test]
        public void McpAddressablesBuildTimingMetadataIsBounded()
        {
            var summary = new JObject { ["ok"] = true };
            var completedAt = new System.DateTime(2026, 5, 22, 1, 2, 3, System.DateTimeKind.Utc);
            JObject result = InvokePrivateJObject("AnnotateAddressablesBuildTiming", summary, -42L, completedAt);
            Assert.True(result.Value<bool>("ok"));
            Assert.AreEqual(0L, result.Value<long>("buildDurationMs"));
            Assert.AreEqual("2026-05-22T01:02:03.0000000Z", result.Value<string>("buildCompletedAtUtc"));
        }

        private static JObject InvokeSetField(JObject args)
        {
            try
            {
                return (JObject)typeof(GreyboxMcpServer)
                    .GetMethod("SetField", BindingFlags.Static | BindingFlags.NonPublic)
                    .Invoke(null, new object[] { args });
            }
            catch (TargetInvocationException error) when (error.InnerException != null)
            {
                throw error.InnerException;
            }
        }

        private static JObject InvokeCreateGameObject(JObject args)
        {
            try
            {
                return (JObject)typeof(GreyboxMcpServer)
                    .GetMethod("CreateGameObject", BindingFlags.Static | BindingFlags.NonPublic)
                    .Invoke(null, new object[] { args });
            }
            catch (TargetInvocationException error) when (error.InnerException != null)
            {
                throw error.InnerException;
            }
        }

        private static JObject InvokeAddComponent(JObject args)
        {
            try
            {
                return (JObject)typeof(GreyboxMcpServer)
                    .GetMethod("AddComponent", BindingFlags.Static | BindingFlags.NonPublic)
                    .Invoke(null, new object[] { args });
            }
            catch (TargetInvocationException error) when (error.InnerException != null)
            {
                throw error.InnerException;
            }
        }

        private static JObject InvokeAssignAsset(JObject args)
        {
            try
            {
                return (JObject)typeof(GreyboxMcpServer)
                    .GetMethod("AssignAsset", BindingFlags.Static | BindingFlags.NonPublic)
                    .Invoke(null, new object[] { args });
            }
            catch (TargetInvocationException error) when (error.InnerException != null)
            {
                throw error.InnerException;
            }
        }

        private static string InvokeNormalizeMcpTestName(string testName)
        {
            try
            {
                return (string)typeof(GreyboxMcpServer)
                    .GetMethod("NormalizeMcpTestName", BindingFlags.Static | BindingFlags.NonPublic)
                    .Invoke(null, new object[] { testName });
            }
            catch (TargetInvocationException error) when (error.InnerException != null)
            {
                throw error.InnerException;
            }
        }

        private static JObject InvokeSubmitMcpEditModeTestRun(string testName, DateTimeOffset submittedAtUtc, Func<object, string> executeTestRun)
        {
            try
            {
                return (JObject)typeof(GreyboxMcpServer)
                    .GetMethod("SubmitMcpEditModeTestRun", BindingFlags.Static | BindingFlags.NonPublic)
                    .Invoke(null, new object[] { testName, submittedAtUtc, executeTestRun });
            }
            catch (TargetInvocationException error) when (error.InnerException != null)
            {
                throw error.InnerException;
            }
        }

        private static int InvokeNormalizeMcpScreenshotDimension(int value, string label)
        {
            try
            {
                return (int)typeof(GreyboxMcpServer)
                    .GetMethod("NormalizeMcpScreenshotDimension", BindingFlags.Static | BindingFlags.NonPublic)
                    .Invoke(null, new object[] { value, label });
            }
            catch (TargetInvocationException error) when (error.InnerException != null)
            {
                throw error.InnerException;
            }
        }

        private static string InvokeCreateMcpScreenshotPath(int width, int height)
        {
            try
            {
                return (string)typeof(GreyboxMcpServer)
                    .GetMethod("CreateMcpScreenshotPath", BindingFlags.Static | BindingFlags.NonPublic)
                    .Invoke(null, new object[] { width, height });
            }
            catch (TargetInvocationException error) when (error.InnerException != null)
            {
                throw error.InnerException;
            }
        }

        private static JObject InvokeDescribeMcpScreenshotCapture(
            string path,
            string absolutePath,
            int width,
            int height,
            bool gameViewSized,
            string sizingMessage)
        {
            try
            {
                return (JObject)typeof(GreyboxMcpServer)
                    .GetMethod("DescribeMcpScreenshotCapture", BindingFlags.Static | BindingFlags.NonPublic)
                    .Invoke(null, new object[] { path, absolutePath, width, height, gameViewSized, sizingMessage });
            }
            catch (TargetInvocationException error) when (error.InnerException != null)
            {
                throw error.InnerException;
            }
        }

        private static string InvokeMcpJsonRpc(string body)
        {
            try
            {
                return (string)typeof(GreyboxMcpServer)
                    .GetMethod("HandleMcpJsonRpc", BindingFlags.Static | BindingFlags.NonPublic)
                    .Invoke(null, new object[] { body });
            }
            catch (TargetInvocationException error) when (error.InnerException != null)
            {
                throw error.InnerException;
            }
        }

        private static string InvokeHandleToolCall(string body)
        {
            try
            {
                return (string)typeof(GreyboxMcpServer)
                    .GetMethod("HandleToolCall", BindingFlags.Static | BindingFlags.NonPublic)
                    .Invoke(null, new object[] { body });
            }
            catch (TargetInvocationException error) when (error.InnerException != null)
            {
                throw error.InnerException;
            }
        }

        private static JObject InvokeDescribeAddressablesBuild(object generatedGroup)
        {
            try
            {
                return (JObject)typeof(GreyboxMcpServer)
                    .GetMethod("DescribeAddressablesBuild", BindingFlags.Static | BindingFlags.NonPublic)
                    .Invoke(null, new[] { generatedGroup });
            }
            catch (TargetInvocationException error) when (error.InnerException != null)
            {
                throw error.InnerException;
            }
        }

        private static JToken InvokeUnityTool(string name, JObject args)
        {
            try
            {
                return (JToken)typeof(GreyboxMcpServer)
                    .GetMethod("InvokeUnityTool", BindingFlags.Static | BindingFlags.NonPublic)
                    .Invoke(null, new object[] { name, args });
            }
            catch (TargetInvocationException error) when (error.InnerException != null)
            {
                throw error.InnerException;
            }
        }

        private static JObject InvokeMcpToolSuccess(JToken structured)
        {
            return InvokePrivateJObject("McpToolSuccess", structured);
        }

        private static JObject InvokeDirectToolSuccess(JToken structured)
        {
            return InvokePrivateJObject("DirectToolSuccess", structured);
        }

        private static JObject InvokeMcpToolError(string message)
        {
            return InvokePrivateJObject("McpToolError", message);
        }

        private static GreyboxConfig CreateLicensedMcpConfig()
        {
            GreyboxSettings.SetLicenseKey("gbx_pro_mcp_route_123");
            Assert.True(GreyboxSettings.SetLicenseCapabilities(
                GreyboxLicenseCapabilities.ForTier(GreyboxLicenseTier.Pro),
                "2027-05-17T00:00:00.000Z"));
            var config = ScriptableObject.CreateInstance<GreyboxConfig>();
            config.ProjectId = "mcp-route-project";
            config.McpBridgeEnabled = true;
            SetMcpActiveConfig(config);
            return config;
        }

        private static void ClearLicensedMcpConfig(GreyboxConfig config)
        {
            SetMcpActiveConfig(null);
            GreyboxSettings.SetLicenseKey("");
            GreyboxSettings.ClearTrackedProjectKeys();
            if (config) Object.DestroyImmediate(config);
        }

        private static void SetMcpActiveConfig(GreyboxConfig config)
        {
            typeof(GreyboxMcpServer)
                .GetField("activeConfig", BindingFlags.Static | BindingFlags.NonPublic)
                .SetValue(null, config);
        }

        private static bool InvokeMcpAuthorizationHeaderMatches(string authorization, string expected)
        {
            return InvokePrivateBool("McpAuthorizationHeaderMatches", authorization, expected);
        }

        private static bool InvokeMcpTokenMatches(string candidate, string expected)
        {
            return InvokePrivateBool("McpTokenMatches", candidate, expected);
        }

        private static bool InvokeFixedTimeEquals(string left, string right)
        {
            return InvokePrivateBool("FixedTimeEquals", left, right);
        }

        private static bool InvokeIsAllowedMcpContentType(string method, string contentType)
        {
            return InvokePrivateBool("IsAllowedMcpContentType", method, contentType);
        }

        private static bool InvokeIsSafeMcpScreenshotFileName(string fileName)
        {
            try
            {
                return (bool)typeof(GreyboxMcpServer)
                    .GetMethod("IsSafeMcpScreenshotFileName", BindingFlags.Static | BindingFlags.NonPublic)
                    .Invoke(null, new object[] { fileName });
            }
            catch (TargetInvocationException error) when (error.InnerException != null)
            {
                throw error.InnerException;
            }
        }

        private static bool InvokeIsSafeMcpBrowserUrlHeader(string headerName, string value)
        {
            return InvokePrivateBool("IsSafeMcpBrowserUrlHeader", value, headerName);
        }

        private static bool InvokeIsSafeMcpFetchSiteHeader(string value)
        {
            try
            {
                return (bool)typeof(GreyboxMcpServer)
                    .GetMethod("IsSafeMcpFetchSiteHeader", BindingFlags.Static | BindingFlags.NonPublic)
                    .Invoke(null, new object[] { value });
            }
            catch (TargetInvocationException error) when (error.InnerException != null)
            {
                throw error.InnerException;
            }
        }

        private static bool InvokeIsSafeMcpHostHeader(string value)
        {
            try
            {
                return (bool)typeof(GreyboxMcpServer)
                    .GetMethod("IsSafeMcpHostHeader", BindingFlags.Static | BindingFlags.NonPublic)
                    .Invoke(null, new object[] { value });
            }
            catch (TargetInvocationException error) when (error.InnerException != null)
            {
                throw error.InnerException;
            }
        }

        private static bool InvokeIsMcpMutationTool(string toolName)
        {
            try
            {
                return (bool)typeof(GreyboxMcpServer)
                    .GetMethod("IsMcpMutationTool", BindingFlags.Static | BindingFlags.NonPublic)
                    .Invoke(null, new object[] { toolName });
            }
            catch (TargetInvocationException error) when (error.InnerException != null)
            {
                throw error.InnerException;
            }
        }

        private static bool InvokeIsUnityEditorReadyForMcpMutation(
            string toolName,
            bool isCompiling,
            bool isUpdating,
            bool isPlayingOrWillChangePlaymode,
            out string message)
        {
            try
            {
                var args = new object[] { toolName, isCompiling, isUpdating, isPlayingOrWillChangePlaymode, null };
                var method = typeof(GreyboxMcpServer).GetMethod(
                    "IsUnityEditorReadyForMcpMutation",
                    BindingFlags.Static | BindingFlags.NonPublic,
                    null,
                    new[]
                    {
                        typeof(string),
                        typeof(bool),
                        typeof(bool),
                        typeof(bool),
                        typeof(string).MakeByRefType()
                    },
                    null);
                Assert.NotNull(method);
                bool result = (bool)method.Invoke(null, args);
                message = args[4] as string ?? "";
                return result;
            }
            catch (TargetInvocationException error) when (error.InnerException != null)
            {
                throw error.InnerException;
            }
        }

        private static bool InvokePrivateBool(string methodName, string left, string right)
        {
            try
            {
                return (bool)typeof(GreyboxMcpServer)
                    .GetMethod(methodName, BindingFlags.Static | BindingFlags.NonPublic)
                    .Invoke(null, new object[] { left, right });
            }
            catch (TargetInvocationException error) when (error.InnerException != null)
            {
                throw error.InnerException;
            }
        }

        private static JObject InvokePrivateJObject(string methodName, params object[] args)
        {
            try
            {
                return (JObject)typeof(GreyboxMcpServer)
                    .GetMethod(methodName, BindingFlags.Static | BindingFlags.NonPublic)
                    .Invoke(null, args);
            }
            catch (TargetInvocationException error) when (error.InnerException != null)
            {
                throw error.InnerException;
            }
        }

        private static string InvokePrivateStringConstant(string fieldName)
        {
            var field = typeof(GreyboxMcpServer).GetField(fieldName, BindingFlags.Static | BindingFlags.NonPublic);
            Assert.NotNull(field);
            return (string)field.GetRawConstantValue();
        }

        private static void ClearPendingRoundTripEdits()
        {
            typeof(GreyboxSceneChangeWatcher)
                .GetMethod("ClearPendingForTests", BindingFlags.Static | BindingFlags.NonPublic)
                .Invoke(null, null);
        }

        private static int PendingRoundTripFieldEditCount()
        {
            return (int)typeof(GreyboxSceneChangeWatcher)
                .GetProperty("PendingFieldEditCountForTests", BindingFlags.Static | BindingFlags.NonPublic)
                .GetValue(null);
        }

        private static string CreateTempAssetFolder()
        {
            string folder = "GreyboxMcpBridgeTests-" + System.Guid.NewGuid().ToString("N");
            AssetDatabase.CreateFolder("Assets", folder);
            return $"Assets/{folder}";
        }

        private static JObject FindComponentDetail(JArray details, string typeName)
        {
            foreach (JObject detail in details)
            {
                if (detail.Value<string>("type") == typeName) return detail;
            }
            Assert.Fail($"Missing MCP component detail for {typeName}");
            return null;
        }

        private static JObject FindMemberDetail(JArray details, string memberName)
        {
            foreach (JObject detail in details)
            {
                if (detail.Value<string>("name") == memberName) return detail;
            }
            Assert.Fail($"Missing MCP asset reference field for {memberName}");
            return null;
        }

        private static JObject FindAddableComponent(JArray components, string typeName)
        {
            foreach (JObject component in components)
            {
                if (component.Value<string>("componentType") == typeName) return component;
            }
            Assert.Fail($"Missing MCP addable component for {typeName}");
            return null;
        }

        private abstract class AbstractTestComponent : MonoBehaviour
        {
        }

        private sealed class UnsafeMutableSurfaceComponent : MonoBehaviour
        {
            public readonly int ReadOnlyScore = 7;
            public Mesh MeshReference;
            [System.NonSerialized] public Mesh RuntimeMeshReference;
            [HideInInspector] public Mesh HiddenMeshReference;
            public int PrivateSetterScore { get; private set; } = 3;
            [System.Obsolete] public int LegacyScore = 5;
            [System.Obsolete] public Mesh LegacyMeshReference;
            [System.NonSerialized] public int TransientScore = 11;
            [HideInInspector] public int HiddenScore = 13;

            public int this[int index]
            {
                get => index;
                set { }
            }
        }

        private sealed class FakeMcpTestResult
        {
            public string Name { get; set; }
            public string FullName { get; set; }
            public string TestStatus { get; set; }
            public string ResultState { get; set; }
            public double Duration { get; set; }
            public int AssertCount { get; set; }
            public int PassCount { get; set; }
            public int FailCount { get; set; }
            public int SkipCount { get; set; }
            public int InconclusiveCount { get; set; }
            public bool HasChildren { get; set; }
            public string Message { get; set; }
            public string StackTrace { get; set; }
        }
    }
}

namespace Greybox.Tests.EditMode.A
{
    public sealed class DuplicateMcpComponent : MonoBehaviour
    {
    }
}

namespace Greybox.Tests.EditMode.B
{
    public sealed class DuplicateMcpComponent : MonoBehaviour
    {
    }
}
