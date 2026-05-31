// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System.Linq;
using System.Reflection;
using Greybox.Editor.Sync;
using Greybox.Runtime;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.Tilemaps;

namespace Greybox.Tests.EditMode
{
    public sealed class RoundTripLatencyTests
    {
        [Test]
        public void SceneEditDebounceStaysInsideTwoSecondBudget()
        {
            Assert.Less(GreyboxSceneChangeWatcher.FlushDelaySeconds, GreyboxSceneChangeWatcher.RoundTripLatencyBudgetSeconds);
            Assert.LessOrEqual(GreyboxSceneChangeWatcher.RoundTripLatencyBudgetSeconds, 2.0d);
        }

        [Test]
        public void WebSocketTimeoutsStayInsideTwoSecondBudget()
        {
            Assert.LessOrEqual(GreyboxDaemonClient.RoundTripLatencyBudgetMs, 2000);
            Assert.Less(GreyboxDaemonClient.ConnectTimeoutMs, GreyboxDaemonClient.RoundTripLatencyBudgetMs);
            Assert.Less(GreyboxDaemonClient.SendTimeoutMs, GreyboxDaemonClient.RoundTripLatencyBudgetMs);
        }

        [Test]
        public void ColdRoundTripSyncStaysInsideTwoSecondBudget()
        {
            double flushMs = GreyboxSceneChangeWatcher.FlushDelaySeconds * 1000d;
            double coldPathMs = flushMs + GreyboxDaemonClient.ConnectTimeoutMs + GreyboxDaemonClient.SendTimeoutMs;
            Assert.LessOrEqual(coldPathMs, GreyboxDaemonClient.RoundTripLatencyBudgetMs);
        }

        [Test]
        public void DirectUnityEditReconnectStaysInsideTwoSecondBudget()
        {
            double reconnectAndSendMs = GreyboxDaemonClient.ConnectTimeoutMs + GreyboxDaemonClient.SendTimeoutMs;
            Assert.LessOrEqual(reconnectAndSendMs, GreyboxDaemonClient.RoundTripLatencyBudgetMs);
        }

        [Test]
        public void RawArtifactPullTimeoutStaysInsideTwoSecondBudget()
        {
            int timeoutMs = RawArtifactPullTimeoutMs();
            Assert.Greater(timeoutMs, 0);
            Assert.LessOrEqual(timeoutMs, GreyboxDaemonClient.RoundTripLatencyBudgetMs);
        }

        [Test]
        public void RoundTripSessionReconnectsWhenProjectOrDaemonChanges()
        {
            var config = ScriptableObject.CreateInstance<GreyboxConfig>();
            try
            {
                config.ProjectId = "project-a";
                config.DaemonUrl = "http://127.0.0.1:17456/ignored/path";
                SetStaticField("config", config);
                Assert.True((bool)InvokeStatic("EnsureSession"));
                object firstClient = GetStaticField("daemonClient");
                Assert.NotNull(firstClient);
                Assert.AreEqual("project-a\nhttp://127.0.0.1:17456", GetStaticField("sessionKey"));

                config.DaemonUrl = "http://127.0.0.1:17456/another/path?cacheBust=1";
                Assert.True((bool)InvokeStatic("EnsureSession"));
                object sameAuthorityClient = GetStaticField("daemonClient");
                Assert.AreSame(firstClient, sameAuthorityClient);
                Assert.AreEqual("project-a\nhttp://127.0.0.1:17456", GetStaticField("sessionKey"));

                config.ProjectId = "project-b";
                config.DaemonUrl = "http://127.0.0.1:27456";
                Assert.True((bool)InvokeStatic("EnsureSession"));
                object secondClient = GetStaticField("daemonClient");
                Assert.NotNull(secondClient);
                Assert.AreNotSame(firstClient, secondClient);
                Assert.AreEqual("project-b\nhttp://127.0.0.1:27456", GetStaticField("sessionKey"));
            }
            finally
            {
                InvokeStatic("ResetRoundTripSession");
                Object.DestroyImmediate(config);
            }
        }

        [Test]
        public void SessionKeyNormalizesDaemonAuthorityAndRejectsUnsafeDaemonUrls()
        {
            var config = ScriptableObject.CreateInstance<GreyboxConfig>();
            try
            {
                config.ProjectId = " studio ";
                config.DaemonUrl = "https://daemon.greybox.local/ignored/path?query=ignored";
                SetStaticField("config", config);
                Assert.True((bool)InvokeStatic("EnsureSession"));
                Assert.AreEqual("studio\nhttps://daemon.greybox.local", GetStaticField("sessionKey"));
                Assert.NotNull(GetStaticField("daemonClient"));

                config.DaemonUrl = "file:///tmp/daemon.sock";
                Assert.False((bool)InvokeStatic("EnsureSession"));
                Assert.AreEqual("", GetStaticField("sessionKey"));
                Assert.IsNull(GetStaticField("daemonClient"));

                config.DaemonUrl = "http://user:pass@127.0.0.1:17456";
                Assert.False((bool)InvokeStatic("EnsureSession"));
                Assert.AreEqual("", GetStaticField("sessionKey"));
                Assert.IsNull(GetStaticField("daemonClient"));

                config.DaemonUrl = "http://127.0.0.1:17456";
                config.ProjectId = "";
                Assert.False((bool)InvokeStatic("EnsureSession"));
                Assert.AreEqual("", GetStaticField("sessionKey"));
                Assert.IsNull(GetStaticField("daemonClient"));
            }
            finally
            {
                InvokeStatic("ResetRoundTripSession");
                Object.DestroyImmediate(config);
            }
        }

        [Test]
        public void ArtifactChangedFramesRequireActiveProjectScope()
        {
            Assert.True(IsArtifactChangedForProject(JObject.Parse(@"{""type"":""artifact-changed"",""projectId"":""project-a"",""payload"":{""fileName"":""arena.gameview.json""}}"), "project-a"));
            Assert.True(IsArtifactChangedForProject(JObject.Parse(@"{""type"":""artifact-changed"",""projectId"":"" project-a "",""payload"":{""fileName"":""arena.gameview.json""}}"), "project-a"));
            Assert.True(IsArtifactChangedForProject(JObject.Parse(@"{""type"":""artifact-changed"",""payload"":{""projectId"":""project-a"",""fileName"":""arena.gameview.json""}}"), "project-a"));
            Assert.False(IsArtifactChangedForProject(JObject.Parse(@"{""type"":""artifact-changed"",""projectId"":""project-b"",""payload"":{""fileName"":""arena.gameview.json""}}"), "project-a"));
            Assert.False(IsArtifactChangedForProject(JObject.Parse(@"{""type"":""artifact-changed"",""payload"":{""fileName"":""arena.gameview.json""}}"), "project-a"));
            Assert.False(IsArtifactChangedForProject(JObject.Parse(@"{""type"":""artifact-changed"",""projectId"":""project-a"",""payload"":{""projectId"":""project-b"",""fileName"":""arena.gameview.json""}}"), "project-a"));
            Assert.False(IsArtifactChangedForProject(JObject.Parse(@"{""type"":""artifact-changed"",""projectId"":""project\n-a"",""payload"":{""fileName"":""arena.gameview.json""}}"), "project-a"));
            Assert.False(IsArtifactChangedForProject(JObject.Parse(@"{""type"":{""name"":""artifact-changed""},""projectId"":""project-a"",""payload"":{""fileName"":""arena.gameview.json""}}"), "project-a"));
            Assert.False(IsArtifactChangedForProject(JObject.Parse(@"{""type"":""artifact-changed"",""projectId"":{""id"":""project-a""},""payload"":{""fileName"":""arena.gameview.json""}}"), "project-a"));
            Assert.False(IsArtifactChangedForProject(JObject.Parse(@"{""type"":""artifact-changed"",""payload"":{""projectId"":[""project-a""],""fileName"":""arena.gameview.json""}}"), "project-a"));
        }

        [Test]
        public void SyncUriRequiresAbsoluteHttpDaemonUrlAndEscapesProjectId()
        {
            var httpConfig = ScriptableObject.CreateInstance<GreyboxConfig>();
            var httpsConfig = ScriptableObject.CreateInstance<GreyboxConfig>();
            var badConfig = ScriptableObject.CreateInstance<GreyboxConfig>();
            var credentialConfig = ScriptableObject.CreateInstance<GreyboxConfig>();
            var missingProjectConfig = ScriptableObject.CreateInstance<GreyboxConfig>();
            try
            {
                httpConfig.DaemonUrl = "http://127.0.0.1:17456/ignored/path";
                httpConfig.ProjectId = " project 42 ";
                Assert.AreEqual(
                    "ws://127.0.0.1:17456/api/sync/unity?projectId=project%2042",
                    BuildSyncUri(httpConfig).AbsoluteUri);

                httpsConfig.DaemonUrl = "https://daemon.greybox.local";
                httpsConfig.ProjectId = "studio";
                Assert.AreEqual(
                    "wss://daemon.greybox.local/api/sync/unity?projectId=studio",
                    BuildSyncUri(httpsConfig).AbsoluteUri);

                badConfig.DaemonUrl = "file:///tmp/daemon.sock";
                badConfig.ProjectId = "studio";
                var error = Assert.Throws<System.InvalidOperationException>(() => BuildSyncUri(badConfig));
                StringAssert.Contains("absolute HTTP or HTTPS", error.Message);

                credentialConfig.DaemonUrl = "http://user:pass@127.0.0.1:17456";
                credentialConfig.ProjectId = "studio";
                Assert.Throws<System.InvalidOperationException>(() => BuildSyncUri(credentialConfig));

                missingProjectConfig.DaemonUrl = "http://127.0.0.1:17456";
                missingProjectConfig.ProjectId = "";
                var missingProjectError = Assert.Throws<System.InvalidOperationException>(() => BuildSyncUri(missingProjectConfig));
                StringAssert.Contains("project id must be set", missingProjectError.Message);

                missingProjectConfig.ProjectId = "project\n42";
                Assert.Throws<System.InvalidOperationException>(() => BuildSyncUri(missingProjectConfig));

                missingProjectConfig.ProjectId = "project/42";
                Assert.Throws<System.InvalidOperationException>(() => BuildSyncUri(missingProjectConfig));
            }
            finally
            {
                Object.DestroyImmediate(httpConfig);
                Object.DestroyImmediate(httpsConfig);
                Object.DestroyImmediate(badConfig);
                Object.DestroyImmediate(credentialConfig);
                Object.DestroyImmediate(missingProjectConfig);
            }
        }

        [Test]
        public void SafeRoundTripEditPathRejectsUnsafePayloadPaths()
        {
            Assert.AreEqual("$.actors[id=boss].health", SafeRoundTripEditPath(" $.actors[id=boss].health "));
            Assert.AreEqual("$.rooms[roomId=boss].difficulty", SafeRoundTripEditPath("$.rooms[roomId=boss].difficulty"));
            Assert.AreEqual("$.actors[name=Gate Boss].health", SafeRoundTripEditPath("$.actors[name=Gate Boss].health"));
            Assert.AreEqual("$", SafeRoundTripEditPath("$"));

            Assert.AreEqual("", SafeRoundTripEditPath(""));
            Assert.AreEqual("", SafeRoundTripEditPath("actors[id=boss].health"));
            Assert.AreEqual("", SafeRoundTripEditPath("$..actors[id=boss].health"));
            Assert.AreEqual("", SafeRoundTripEditPath("$.actors[id=\nboss].health"));
            Assert.AreEqual("", SafeRoundTripEditPath("https://example.test/arena.gameview.json"));
            Assert.AreEqual("", SafeRoundTripEditPath("$.actors[id=boss]/health"));
            Assert.AreEqual("", SafeRoundTripEditPath("$.actors[id=../../boss].health"));
            Assert.AreEqual("", SafeRoundTripEditPath("$.actors[]"));
            Assert.AreEqual("", SafeRoundTripEditPath("$.actors[id=boss]."));
            Assert.AreEqual("", SafeRoundTripEditPath("$.actors .health"));
            Assert.AreEqual("", SafeRoundTripEditPath("$.actors[id=boss]. displayName"));
            Assert.AreEqual("", SafeRoundTripEditPath("$.__proto__.polluted"));
            Assert.AreEqual("", SafeRoundTripEditPath("$.constructor.polluted"));
            Assert.AreEqual("", SafeRoundTripEditPath("$.prototype.polluted"));
            Assert.AreEqual("", SafeRoundTripEditPath("$.actors[__proto__=boss].health"));
            Assert.AreEqual("", SafeRoundTripEditPath("$.actors[id=prototype].constructor"));
            Assert.AreEqual("", SafeRoundTripEditPath("$." + new string('a', 513)));
        }

        [Test]
        public void UnityEditFramesNormalizeInputsAndPreserveSafeValues()
        {
            var config = ScriptableObject.CreateInstance<GreyboxConfig>();
            try
            {
                config.ProjectId = " project-frame ";
                var value = JObject.Parse(@"{""x"":1,""y"":2,""z"":3}");

                Assert.True(TryBuildUnityEditFrame(
                    config,
                    @"levels\arena.gameview.json",
                    " $.actors[id=boss].position ",
                    value,
                    out byte[] bytes,
                    out string rejectionMessage));
                Assert.AreEqual("", rejectionMessage);

                JObject payload = JObject.Parse(System.Text.Encoding.UTF8.GetString(bytes));
                Assert.AreEqual("unity-edit", payload.Value<string>("type"));
                Assert.AreEqual("project-frame", payload.Value<string>("projectId"));
                Assert.AreEqual("levels/arena.gameview.json", payload.Value<string>("fileName"));
                Assert.AreEqual("$.actors[id=boss].position", payload.Value<string>("path"));
                Assert.AreEqual(1, payload["value"]["x"].Value<int>());
                Assert.AreEqual(GreyboxDaemonClient.RoundTripLatencyBudgetMs, payload.Value<int>("latencyBudgetMs"));
            }
            finally
            {
                Object.DestroyImmediate(config);
            }
        }

        [Test]
        public void UnityEditFramesRejectUnsafeValuesAndOversizedPayloads()
        {
            var config = ScriptableObject.CreateInstance<GreyboxConfig>();
            try
            {
                config.ProjectId = "";
                Assert.False(TryBuildUnityEditFrame(config, "levels/arena.gameview.json", "$.actors[id=boss].health", new JValue(3), out _, out string projectMessage));
                StringAssert.Contains("safe project id", projectMessage);

                config.ProjectId = "project-frame";
                Assert.False(TryBuildUnityEditFrame(config, "levels/arena.gameview.json", "$.actors[id=boss].health", JValue.CreateNull(), out _, out string nullMessage));
                StringAssert.Contains("unsafe value", nullMessage);

                Assert.False(TryBuildUnityEditFrame(config, "levels/arena.gameview.json", "$.actors[id=boss].name", new JValue(new string('x', 4097)), out _, out string stringMessage));
                StringAssert.Contains("unsafe value", stringMessage);

                Assert.False(TryBuildUnityEditFrame(config, "levels/arena.gameview.json", "$.actors[id=boss].speed", new JValue(double.NaN), out _, out string nanMessage));
                StringAssert.Contains("unsafe value", nanMessage);

                Assert.False(TryBuildUnityEditFrame(config, "levels/arena.gameview.json", "$.actors[id=boss]", JObject.Parse(@"{""../escape"":1}"), out _, out string propertyMessage));
                StringAssert.Contains("unsafe value", propertyMessage);

                Assert.False(TryBuildUnityEditFrame(config, "levels/arena.gameview.json", "$.actors[id=boss]", JObject.Parse(@"{""phase.name"":1}"), out _, out string dottedPropertyMessage));
                StringAssert.Contains("unsafe value", dottedPropertyMessage);

                Assert.False(TryBuildUnityEditFrame(config, "levels/arena.gameview.json", "$.actors[id=boss]", JObject.Parse(@"{""phase[0]"":1}"), out _, out string bracketPropertyMessage));
                StringAssert.Contains("unsafe value", bracketPropertyMessage);

                Assert.False(TryBuildUnityEditFrame(config, "levels/arena.gameview.json", "$.actors[id=boss]", JObject.Parse(@"{""phase=one"":1}"), out _, out string equalsPropertyMessage));
                StringAssert.Contains("unsafe value", equalsPropertyMessage);

                Assert.False(TryBuildUnityEditFrame(config, "levels/arena.gameview.json", "$.actors[id=boss]", JObject.Parse(@"{""__proto__"":{""polluted"":true}}"), out _, out string protoMessage));
                StringAssert.Contains("unsafe value", protoMessage);

                Assert.False(TryBuildUnityEditFrame(config, "levels/arena.gameview.json", "$.actors[id=boss]", JObject.Parse(@"{""constructor"":{""polluted"":true}}"), out _, out string constructorMessage));
                StringAssert.Contains("unsafe value", constructorMessage);

                Assert.False(TryBuildUnityEditFrame(config, "levels/arena.gameview.json", "$.actors[id=boss]", JObject.Parse(@"{""prototype"":{""polluted"":true}}"), out _, out string prototypeMessage));
                StringAssert.Contains("unsafe value", prototypeMessage);

                var deep = new JObject();
                JToken cursor = deep;
                for (int index = 0; index < 18; index++)
                {
                    var child = new JObject();
                    ((JObject)cursor)["child"] = child;
                    cursor = child;
                }
                Assert.False(TryBuildUnityEditFrame(config, "levels/arena.gameview.json", "$.actors[id=boss]", deep, out _, out string depthMessage));
                StringAssert.Contains("unsafe value", depthMessage);

                var tooManyProperties = new JObject();
                for (int index = 0; index < 129; index++) tooManyProperties[$"field{index}"] = index;
                Assert.False(TryBuildUnityEditFrame(config, "levels/arena.gameview.json", "$.actors[id=boss]", tooManyProperties, out _, out string objectCountMessage));
                StringAssert.Contains("unsafe value", objectCountMessage);

                var tooManyItems = new JArray();
                for (int index = 0; index < 513; index++) tooManyItems.Add(index);
                Assert.False(TryBuildUnityEditFrame(config, "levels/arena.gameview.json", "$.actors[id=boss].samples", tooManyItems, out _, out string arrayCountMessage));
                StringAssert.Contains("unsafe value", arrayCountMessage);

                var oversized = new JArray();
                for (int index = 0; index < 200000; index++) oversized.Add(123456);
                Assert.False(TryBuildUnityEditFrame(config, "levels/arena.gameview.json", "$.actors[id=boss].samples", oversized, out _, out string oversizedMessage));
                StringAssert.Contains("oversized Unity edit frame", oversizedMessage);
            }
            finally
            {
                Object.DestroyImmediate(config);
            }
        }

        [Test]
        public void PendingFieldEditQueueCapsAtDaemonDiffLimit()
        {
            var go = new GameObject("Boss");
            var marker = go.AddComponent<GreyboxMarker>();
            marker.JsonPath = "$.actors[id=boss]";
            try
            {
                int maxEdits = GetStaticIntProperty("MaxPendingFieldEditsForTests");
                for (int index = 0; index < maxEdits + 1; index++)
                {
                    InvokeStatic(
                        "QueueFieldEdit",
                        go,
                        new GreyboxRoundTripFieldEdit(marker, $"$.actors[id=boss].field{index}", new JValue(index)));
                }

                Assert.AreEqual(maxEdits, GetStaticIntProperty("PendingFieldEditCountForTests"));

                InvokeStatic(
                    "QueueFieldEdit",
                    go,
                    new GreyboxRoundTripFieldEdit(marker, "$.actors[id=boss].field0", new JValue(999)));
                Assert.AreEqual(maxEdits, GetStaticIntProperty("PendingFieldEditCountForTests"));
            }
            finally
            {
                InvokeStatic("ClearPendingForTests");
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void RoundTripFieldEditSnapshotsMutablePayloads()
        {
            var go = new GameObject("Boss");
            var marker = go.AddComponent<GreyboxMarker>();
            var payload = new JObject
            {
                ["abilities"] = new JArray("slam", "dash")
            };

            try
            {
                var edit = new GreyboxRoundTripFieldEdit(marker, "$.actors[id=boss].abilities", payload);
                ((JArray)payload["abilities"]).Add("mutated-after-queue");

                CollectionAssert.AreEqual(new[] { "slam", "dash" }, edit.Value["abilities"].Values<string>().ToArray());
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void PendingMarkerQueueCapsAtDaemonDiffLimit()
        {
            int maxMarkers = GetStaticIntProperty("MaxPendingMarkersForTests");
            var objects = new GameObject[maxMarkers + 1];
            try
            {
                for (int index = 0; index < objects.Length; index++)
                {
                    var go = new GameObject($"Marker {index}");
                    objects[index] = go;
                    var marker = go.AddComponent<GreyboxMarker>();
                    marker.PositionJsonPath = $"$.spawnPoints[id=spawn{index}].position";
                    InvokeStatic("QueueMarkerTransform", marker);
                }

                Assert.AreEqual(maxMarkers, GetStaticIntProperty("PendingMarkerCountForTests"));

                InvokeStatic("QueueMarkerTransform", objects[0].GetComponent<GreyboxMarker>());
                Assert.AreEqual(maxMarkers, GetStaticIntProperty("PendingMarkerCountForTests"));
            }
            finally
            {
                InvokeStatic("ClearPendingForTests");
                foreach (GameObject go in objects)
                {
                    if (go) Object.DestroyImmediate(go);
                }
            }
        }

        [Test]
        public void SceneTransformEditsKeepDesignNodeMetadataCurrent()
        {
            var go = new GameObject("Boss");
            var node = go.AddComponent<GreyboxDesignNode>();
            try
            {
                go.transform.localPosition = new Vector3(1f, 2f, 3f);
                UpdateDesignNodeTransformMetadata(go.transform, "m_LocalPosition.x");
                Assert.AreEqual(new Vector3(1f, 2f, 3f), node.AuthoredPosition);

                go.transform.localScale = new Vector3(2f, 3f, 4f);
                UpdateDesignNodeTransformMetadata(go.transform, "m_LocalScale.y");
                Assert.AreEqual(new Vector3(2f, 3f, 4f), node.AuthoredScale);

                go.transform.localEulerAngles = new Vector3(0f, 90f, 15f);
                UpdateDesignNodeTransformMetadata(go.transform, "m_LocalRotation.y");
                Assert.AreEqual(new Vector3(0f, 90f, 15f), node.AuthoredRotationEuler);
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void SceneTileTransformEditsKeepTilemapMetadataCurrent()
        {
            var tiles = new GameObject("Tiles");
            var tilemap = tiles.AddComponent<Tilemap>();
            tiles.AddComponent<TilemapRenderer>();
            var metadata = tiles.AddComponent<GreyboxLevelTilemap>();
            var tile = ScriptableObject.CreateInstance<Tile>();
            tile.name = "Greybox Hazard Tile";
            var child = new GameObject("Hazard Tile");
            child.transform.SetParent(tiles.transform, false);
            child.transform.localPosition = new Vector3(1f, 2f, 0f);
            var marker = child.AddComponent<GreyboxMarker>();
            marker.Collection = "tiles";
            marker.MarkerId = "hazard-tile";
            marker.PositionJsonPath = "$.tilemap.tiles[tileId=hazard-tile].position";
            metadata.TileRecords = new[]
            {
                new GreyboxLevelTileRecord
                {
                    TileId = "hazard-tile",
                    TileType = "hazard",
                    Position = new Vector3Int(1, 2, 0),
                    SourceJsonPath = "$.tilemap.tiles[tileId=hazard-tile]",
                    IsHazard = true
                }
            };
            metadata.TileAssets = new TileBase[] { tile };
            tilemap.SetTile(new Vector3Int(1, 2, 0), tile);

            try
            {
                child.transform.localPosition = new Vector3(4f, 5f, 0f);
                Assert.True((bool)InvokeStatic("SyncMovedTilemapCell", child.transform, marker));
                Assert.IsNull(tilemap.GetTile(new Vector3Int(1, 2, 0)));
                Assert.AreSame(tile, tilemap.GetTile(new Vector3Int(4, 5, 0)));
                Assert.True(metadata.TryGetTileRecord("hazard-tile", out GreyboxLevelTileRecord moved));
                Assert.AreEqual(new Vector3Int(4, 5, 0), moved.Position);
                Assert.AreEqual(tilemap.cellBounds.position, metadata.BoundsOrigin);
                Assert.AreEqual(tilemap.cellBounds.size, metadata.BoundsSize);
            }
            finally
            {
                Object.DestroyImmediate(tiles);
                Object.DestroyImmediate(tile);
            }
        }

        [Test]
        public void SceneTileRecordInspectorEditsRefreshVisibleTile()
        {
            var tiles = new GameObject("Tiles");
            var tilemap = tiles.AddComponent<Tilemap>();
            tiles.AddComponent<TilemapRenderer>();
            var metadata = tiles.AddComponent<GreyboxLevelTilemap>();
            var existingTile = ScriptableObject.CreateInstance<Tile>();
            existingTile.name = "Greybox Hazard Tile";
            existingTile.colliderType = Tile.ColliderType.Sprite;
            metadata.TileRecords = new[]
            {
                new GreyboxLevelTileRecord
                {
                    TileId = "hazard-tile",
                    TileType = "hazard",
                    Position = new Vector3Int(2, 3, 0),
                    SourceJsonPath = "$.tilemap.tiles[tileId=hazard-tile]",
                    ColorHex = "#E94B3CFF",
                    BlocksMovement = true,
                    IsHazard = true
                }
            };
            metadata.TileAssets = new TileBase[] { existingTile };
            tilemap.SetTile(new Vector3Int(2, 3, 0), existingTile);

            try
            {
                metadata.TileRecords[0].TileType = "floor";
                metadata.TileRecords[0].ColorHex = "#5C6166FF";
                metadata.TileRecords[0].BlocksMovement = false;

                Assert.True((bool)InvokeStatic("SyncTileRecordPropertyChange", metadata, "TileRecords.Array.data[0].TileType"));
                TileBase visibleTile = tilemap.GetTile(new Vector3Int(2, 3, 0));
                Assert.NotNull(visibleTile);
                Assert.AreNotSame(existingTile, visibleTile);
                Assert.AreEqual(Tile.ColliderType.None, ((Tile)visibleTile).colliderType);
                Assert.GreaterOrEqual(metadata.TileAssets.Length, 2);
                Assert.AreEqual(tilemap.cellBounds.position, metadata.BoundsOrigin);
                Assert.AreEqual(tilemap.cellBounds.size, metadata.BoundsSize);
            }
            finally
            {
                foreach (TileBase tileAsset in metadata.TileAssets ?? new TileBase[0])
                {
                    if (tileAsset && tileAsset != existingTile) Object.DestroyImmediate(tileAsset);
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
        public void SceneTileRecordInspectorPositionEditsMoveVisibleTile()
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
            marker.Collection = "tiles";
            marker.MarkerId = "hazard-tile";
            marker.PositionJsonPath = "$.tilemap.tiles[tileId=hazard-tile].position";
            metadata.TileRecords = new[]
            {
                new GreyboxLevelTileRecord
                {
                    TileId = "hazard-tile",
                    TileType = "hazard",
                    Position = new Vector3Int(1, 2, 0),
                    SourceJsonPath = "$.tilemap.tiles[tileId=hazard-tile]",
                    ColorHex = "#E94B3CFF",
                    IsHazard = true
                }
            };
            metadata.TileAssets = new TileBase[] { existingTile };
            tilemap.SetTile(new Vector3Int(1, 2, 0), existingTile);

            try
            {
                metadata.TileRecords[0].Position = new Vector3Int(4, 5, 0);

                Assert.True((bool)InvokeStatic("SyncTileRecordPropertyChange", metadata, "TileRecords.Array.data[0].Position.x"));
                Assert.IsNull(tilemap.GetTile(new Vector3Int(1, 2, 0)));
                Assert.AreSame(existingTile, tilemap.GetTile(new Vector3Int(4, 5, 0)));
                Assert.AreEqual(tilemap.CellToWorld(new Vector3Int(4, 5, 0)), child.transform.position);
                Assert.AreEqual(tilemap.cellBounds.position, metadata.BoundsOrigin);
                Assert.AreEqual(tilemap.cellBounds.size, metadata.BoundsSize);
            }
            finally
            {
                Object.DestroyImmediate(tiles);
                Object.DestroyImmediate(existingTile);
            }
        }

        [Test]
        public void SceneComponentNameEditsKeepGreyboxMetadataCurrent()
        {
            var go = new GameObject("Boss");
            var marker = go.AddComponent<GreyboxMarker>();
            marker.MarkerName = "Boss";
            var node = go.AddComponent<GreyboxDesignNode>();
            node.DisplayName = "Boss";
            var actor = go.AddComponent<GreyboxActorDefinition>();
            actor.DisplayName = "Gate Boss";

            try
            {
                Assert.True(GreyboxRoundTripMetadataSync.UpdateDisplayNameMetadata(actor, nameof(GreyboxActorDefinition.DisplayName)));
                Assert.AreEqual("Gate Boss", marker.MarkerName);
                Assert.AreEqual("Gate Boss", node.DisplayName);
                Assert.AreEqual("Gate Boss", go.name);
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        private static void UpdateDesignNodeTransformMetadata(Transform transform, string propertyPath)
        {
            typeof(GreyboxSceneChangeWatcher)
                .GetMethod("UpdateDesignNodeTransformMetadata", BindingFlags.Static | BindingFlags.NonPublic)
                .Invoke(null, new object[] { transform, propertyPath });
        }

        private static object InvokeStatic(string methodName, params object[] args)
        {
            return typeof(GreyboxSceneChangeWatcher)
                .GetMethod(methodName, BindingFlags.Static | BindingFlags.NonPublic)
                .Invoke(null, args);
        }

        private static object GetStaticField(string fieldName)
        {
            return typeof(GreyboxSceneChangeWatcher)
                .GetField(fieldName, BindingFlags.Static | BindingFlags.NonPublic)
                .GetValue(null);
        }

        private static void SetStaticField(string fieldName, object value)
        {
            typeof(GreyboxSceneChangeWatcher)
                .GetField(fieldName, BindingFlags.Static | BindingFlags.NonPublic)
                .SetValue(null, value);
        }

        private static int GetStaticIntProperty(string propertyName)
        {
            return (int)typeof(GreyboxSceneChangeWatcher)
                .GetProperty(propertyName, BindingFlags.Static | BindingFlags.NonPublic)
                .GetValue(null);
        }

        private static bool IsArtifactChangedForProject(JObject evt, string projectId)
        {
            return (bool)typeof(GreyboxDaemonClient)
                .GetMethod("IsArtifactChangedForProject", BindingFlags.Static | BindingFlags.NonPublic)
                .Invoke(null, new object[] { evt, projectId });
        }

        private static System.Uri BuildSyncUri(GreyboxConfig config)
        {
            var client = new GreyboxDaemonClient(config);
            try
            {
                return (System.Uri)typeof(GreyboxDaemonClient)
                    .GetMethod("BuildSyncUri", BindingFlags.Instance | BindingFlags.NonPublic)
                    .Invoke(client, null);
            }
            catch (TargetInvocationException error) when (error.InnerException != null)
            {
                throw error.InnerException;
            }
            finally
            {
                client.Dispose();
            }
        }

        private static string SafeRoundTripEditPath(string path)
        {
            return (string)typeof(GreyboxDaemonClient)
                .GetMethod("SafeRoundTripEditPath", BindingFlags.Static | BindingFlags.NonPublic)
                .Invoke(null, new object[] { path });
        }

        private static int RawArtifactPullTimeoutMs()
        {
            return (int)typeof(GreyboxArtifactRefresher)
                .GetField("MaxRawArtifactPullMs", BindingFlags.Static | BindingFlags.NonPublic)
                .GetValue(null);
        }

        private static bool TryBuildUnityEditFrame(
            GreyboxConfig config,
            string fileName,
            string path,
            JToken value,
            out byte[] bytes,
            out string rejectionMessage)
        {
            var client = new GreyboxDaemonClient(config);
            try
            {
                object[] args = { fileName, path, value, null, null };
                bool result = (bool)typeof(GreyboxDaemonClient)
                    .GetMethod("TryBuildUnityEditFrame", BindingFlags.Instance | BindingFlags.NonPublic)
                    .Invoke(client, args);
                bytes = (byte[])args[3];
                rejectionMessage = (string)args[4];
                return result;
            }
            finally
            {
                client.Dispose();
            }
        }
    }
}
