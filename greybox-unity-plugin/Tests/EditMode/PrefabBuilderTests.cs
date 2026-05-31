// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using Greybox.Editor.Generation;
using Greybox.Runtime;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using UnityEngine.Tilemaps;

namespace Greybox.Tests.EditMode
{
    public sealed class PrefabBuilderTests
    {
        [Test]
        public void BuildsRootFromGameViewport()
        {
            var root = PrefabBuilder.BuildFromGameViewport(JObject.Parse(@"{""id"":""arena-01"",""title"":""Arena"",""theme"":""neon-crypt"",""targetEngine"":""unity"",""camera"":{""mode"":""side-scroll""},""actors"":[{""id"":""boss""}],""spawnPoints"":[{""id"":""spawn-a"",""x"":1,""y"":2,""z"":3}],""objectives"":[{""id"":""exit""}],""hazards"":[{""id"":""spikes""}]}"), "arena.gameview.json");
            try
            {
                Assert.AreEqual("Arena", root.name);
                Assert.IsNotNull(root.transform.Find("Spawn Points"));
                var viewport = root.GetComponent<GreyboxGameViewport>();
                Assert.NotNull(viewport);
                Assert.AreEqual("arena-01", viewport.ViewportId);
                Assert.AreEqual("Arena", viewport.DisplayName);
                Assert.AreEqual("neon-crypt", viewport.Theme);
                Assert.AreEqual("unity", viewport.TargetEngine);
                Assert.AreEqual("side-scroll", viewport.CameraMode);
                Assert.AreEqual(1, viewport.ActorCount);
                Assert.AreEqual(1, viewport.SpawnPointCount);
                Assert.AreEqual(1, viewport.ObjectiveCount);
                Assert.AreEqual(1, viewport.HazardCount);
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void RuntimeCountsOnlyGeneratedGameViewportNodes()
        {
            var root = PrefabBuilder.BuildFromGameViewport(JObject.Parse(@"{""title"":""Arena"",""actors"":[{""id"":""boss""},null,""bad""],""spawnPoints"":[""bad"",{""id"":""spawn-a""}],""objectives"":[42,{""id"":""exit""}],""hazards"":[false,{""id"":""spikes""},null]}"), "Assets/Greybox/arena.gameview");
            try
            {
                var viewport = root.GetComponent<GreyboxGameViewport>();
                Assert.NotNull(viewport);
                Assert.AreEqual(1, viewport.ActorCount);
                Assert.AreEqual(1, viewport.SpawnPointCount);
                Assert.AreEqual(1, viewport.ObjectiveCount);
                Assert.AreEqual(1, viewport.HazardCount);
                Assert.AreEqual(1, root.transform.Find("Actors").childCount);
                Assert.AreEqual(1, root.transform.Find("Spawn Points").childCount);
                Assert.AreEqual(1, root.transform.Find("Objectives").childCount);
                Assert.AreEqual(1, root.transform.Find("Hazards").childCount);
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void BuildsUnityCameraFromAuthoredGameViewportCamera()
        {
            var root = PrefabBuilder.BuildFromGameViewport(JObject.Parse(@"{""title"":""Arena"",""camera"":{""mode"":""side-scroll"",""orthographicSize"":7.5,""backgroundColor"":""#1A1A1F""}}"), "arena.gameview.json");
            try
            {
                var cameraTransform = root.transform.Find("Greybox Camera");
                Assert.NotNull(cameraTransform);
                var camera = cameraTransform.GetComponent<Camera>();
                var rig = cameraTransform.GetComponent<GreyboxCameraRig>();
                var marker = cameraTransform.GetComponent<GreyboxMarker>();
                var node = cameraTransform.GetComponent<GreyboxDesignNode>();

                Assert.NotNull(camera);
                Assert.True(camera.orthographic);
                Assert.AreEqual(7.5f, camera.orthographicSize);
                Assert.AreEqual(new Vector3(0f, 0f, -10f), cameraTransform.localPosition);
                Assert.AreEqual("#1A1A1F", ColorUtility.ToHtmlStringRGB(camera.backgroundColor).Insert(0, "#"));
                Assert.NotNull(rig);
                Assert.AreEqual("side-scroll", rig.Mode);
                Assert.AreEqual("$.camera", rig.JsonPath);
                Assert.NotNull(marker);
                Assert.AreEqual("camera", marker.Collection);
                Assert.AreEqual("$.camera", marker.JsonPath);
                Assert.NotNull(node);
                Assert.AreEqual("camera", node.Collection);
                AssertProperty(node, "orthographicSize", GreyboxDesignPropertyKind.Number, "7.5");
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void StampsStableRoundTripMetadata()
        {
            var root = PrefabBuilder.BuildFromGameViewport(JObject.Parse(@"{""title"":""Arena"",""spawnPoints"":[{""id"":""spawn-a"",""name"":""Start Spawn"",""position"":{""x"":1,""y"":2,""z"":3}}]}"), "Assets/Greybox/arena.gameview");
            try
            {
                var marker = root.transform.Find("Spawn Points/Start Spawn").GetComponent<GreyboxMarker>();
                Assert.NotNull(marker);
                Assert.AreEqual(GreyboxArtifactKind.GameViewport, marker.ArtifactKind);
                Assert.AreEqual("arena.gameview", marker.SourceFileName);
                Assert.AreEqual("spawnPoints", marker.Collection);
                Assert.AreEqual("spawn-a", marker.MarkerId);
                Assert.AreEqual("$.spawnPoints[id=spawn-a]", marker.JsonPath);
                Assert.AreEqual("$.spawnPoints[id=spawn-a].position", marker.PositionJsonPath);
                Assert.AreEqual("Sphere", marker.Primitive);
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void DomainSpecificIdsUseStableRoundTripPaths()
        {
            var root = PrefabBuilder.BuildFromGameViewport(JObject.Parse(@"{""title"":""Arena"",""actors"":[{""actorId"":""boss"",""name"":""Gate Boss"",""position"":{""x"":1,""y"":0,""z"":0}}],""spawnPoints"":[{""spawnId"":""spawn-a"",""position"":{""x"":2,""y"":0,""z"":0}}],""objectives"":[{""objectiveId"":""exit"",""position"":{""x"":3,""y"":0,""z"":0}}],""hazards"":[{""hazardId"":""spikes"",""position"":{""x"":4,""y"":0,""z"":0}}]}"), "Assets/Greybox/arena.gameview");
            try
            {
                var actor = root.transform.Find("Actors/Gate Boss").GetComponent<GreyboxMarker>();
                var spawn = root.transform.Find("Spawn Points/spawn-a").GetComponent<GreyboxMarker>();
                var objective = root.transform.Find("Objectives/exit").GetComponent<GreyboxMarker>();
                var hazard = root.transform.Find("Hazards/spikes").GetComponent<GreyboxMarker>();

                Assert.AreEqual("boss", actor.MarkerId);
                Assert.AreEqual("$.actors[actorId=boss]", actor.JsonPath);
                Assert.AreEqual("$.actors[actorId=boss].position", actor.PositionJsonPath);
                Assert.AreEqual("boss", actor.GetComponent<GreyboxActorDefinition>().ActorId);
                Assert.AreEqual("spawn-a", spawn.MarkerId);
                Assert.AreEqual("$.spawnPoints[spawnId=spawn-a]", spawn.JsonPath);
                Assert.AreEqual("spawn-a", spawn.GetComponent<GreyboxSpawnPoint>().SpawnId);
                Assert.AreEqual("exit", objective.MarkerId);
                Assert.AreEqual("$.objectives[objectiveId=exit]", objective.JsonPath);
                Assert.AreEqual("exit", objective.GetComponent<GreyboxObjective>().ObjectiveId);
                Assert.AreEqual("spikes", hazard.MarkerId);
                Assert.AreEqual("$.hazards[hazardId=spikes]", hazard.JsonPath);
                Assert.AreEqual("spikes", hazard.GetComponent<GreyboxHazard>().HazardId);
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void DuplicateAuthoredIdsUseIndexPathsAndUniqueMarkerIds()
        {
            var root = PrefabBuilder.BuildFromGameViewport(JObject.Parse(@"{""title"":""Arena"",""actors"":[{""id"":""boss"",""name"":""Gate Boss"",""health"":2},{""id"":""boss"",""name"":""Gate Boss Variant"",""health"":3}]}"), "Assets/Greybox/arena.gameview");
            try
            {
                var first = root.transform.Find("Actors/Gate Boss").GetComponent<GreyboxMarker>();
                var second = root.transform.Find("Actors/Gate Boss Variant").GetComponent<GreyboxMarker>();
                var secondActor = second.GetComponent<GreyboxActorDefinition>();

                Assert.NotNull(first);
                Assert.NotNull(second);
                Assert.AreEqual("boss", first.MarkerId);
                Assert.AreEqual("boss-2", second.MarkerId);
                Assert.AreEqual("$.actors[0]", first.JsonPath);
                Assert.AreEqual("$.actors[1]", second.JsonPath);
                Assert.AreEqual("$.actors[1].position", second.PositionJsonPath);
                Assert.AreEqual("boss-2", secondActor.ActorId);
                Assert.AreEqual("Gate Boss Variant", secondActor.DisplayName);
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void DuplicateAuthoredNamesUseUniqueHierarchyLabels()
        {
            var root = PrefabBuilder.BuildFromGameViewport(JObject.Parse(@"{""title"":""Arena"",""actors"":[{""name"":""Scout"",""health"":1},{""name"":""Scout"",""health"":2}]}"), "Assets/Greybox/arena.gameview");
            try
            {
                var first = root.transform.Find("Actors/Scout").GetComponent<GreyboxMarker>();
                var second = root.transform.Find("Actors/Scout 2").GetComponent<GreyboxMarker>();
                var secondActor = second.GetComponent<GreyboxActorDefinition>();
                var secondNode = second.GetComponent<GreyboxDesignNode>();

                Assert.NotNull(first);
                Assert.NotNull(second);
                Assert.AreEqual("Scout", first.MarkerId);
                Assert.AreEqual("Scout-2", second.MarkerId);
                Assert.AreEqual("Scout", second.MarkerName);
                Assert.AreEqual("Scout", secondNode.DisplayName);
                Assert.AreEqual("Scout", secondActor.DisplayName);
                Assert.AreEqual("$.actors[0]", first.JsonPath);
                Assert.AreEqual("$.actors[1]", second.JsonPath);
                Assert.AreEqual("$.actors[1].position", second.PositionJsonPath);
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void UnsafeJsonPathSelectorValuesUseIndexPaths()
        {
            var root = PrefabBuilder.BuildFromGameViewport(JObject.Parse(@"{""title"":""Arena"",""actors"":[{""id"":""boss]oops"",""position"":{""x"":1,""y"":2,""z"":3}},{""name"":""Gate=Boss""},{""id"":7,""name"":""Numbered""}],""spawnPoints"":[{""name"":""spawn/escape""}]}"), "Assets/Greybox/arena.gameview");
            try
            {
                var unsafeId = root.transform.Find("Actors/boss-oops").GetComponent<GreyboxMarker>();
                var unsafeName = root.transform.Find("Actors/Gate=Boss").GetComponent<GreyboxMarker>();
                var numericId = root.transform.Find("Actors/Numbered").GetComponent<GreyboxMarker>();
                var unsafeSpawnName = root.transform.Find("Spawn Points/spawn/escape");

                Assert.NotNull(unsafeId);
                Assert.NotNull(unsafeName);
                Assert.NotNull(numericId);
                Assert.IsNull(unsafeSpawnName);
                Assert.AreEqual("boss-oops", unsafeId.MarkerId);
                Assert.AreEqual("Gate-Boss", unsafeName.MarkerId);
                Assert.AreEqual("spawn-escape", root.transform.Find("Spawn Points/spawn_escape").GetComponent<GreyboxMarker>().MarkerId);
                Assert.AreEqual("$.actors[0]", unsafeId.JsonPath);
                Assert.AreEqual("$.actors[0].position", unsafeId.PositionJsonPath);
                Assert.AreEqual("$.actors[1]", unsafeName.JsonPath);
                Assert.AreEqual("$.actors[id=7]", numericId.JsonPath);

                GreyboxMarker spawn = root.transform.Find("Spawn Points/spawn_escape").GetComponent<GreyboxMarker>();
                Assert.NotNull(spawn);
                Assert.AreEqual("$.spawnPoints[0]", spawn.JsonPath);
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void SanitizesAuthoredMarkerIdsAndLevelBoardReferences()
        {
            var root = PrefabBuilder.BuildLevelBoard(JObject.Parse(@"{""title"":""Unsafe Board"",""rooms"":[{""id"":""../entry/room[0]"",""name"":""Entry\tRoom"",""connectedRoomIds"":[""../boss room[0]""]},{""id"":""../boss room[0]"",""name"":""Boss\nRoom""},{""id"":""../treasure/room[0]"",""name"":""Treasure Room""}],""encounters"":[{""id"":""boss]encounter"",""name"":""Arena/Encounter"",""roomId"":""../boss room[0]""}],""connections"":[{""id"":""../explicit[key]"",""from"":""../boss room[0]"",""to"":""../treasure/room[0]"",""label"":""Boss/Treasure""}]}"), "Assets/Greybox/unsafe.levelboard");
            try
            {
                var entry = root.transform.Find("Rooms/Entry Room").GetComponent<GreyboxLevelRoom>();
                var boss = root.transform.Find("Rooms/Boss Room").GetComponent<GreyboxLevelRoom>();
                var encounter = root.transform.Find("Encounters/Arena_Encounter").GetComponent<GreyboxEncounter>();
                var connection = root.transform.Find("Connections/Boss_Treasure").GetComponent<GreyboxLevelConnection>();

                Assert.NotNull(entry);
                Assert.NotNull(boss);
                Assert.NotNull(encounter);
                Assert.NotNull(connection);

                Assert.AreEqual("entry-room-0", entry.RoomId);
                Assert.AreEqual("boss-room-0", boss.RoomId);
                CollectionAssert.AreEqual(new[] { "boss-room-0" }, entry.ConnectedRoomIds);
                Assert.AreEqual("boss-encounter", encounter.EncounterId);
                Assert.AreEqual("boss-room-0", encounter.TargetRoomId);
                Assert.AreEqual("explicit-key", connection.ConnectionId);
                Assert.AreEqual("boss-room-0", connection.FromRoomId);
                Assert.AreEqual("treasure-room-0", connection.ToRoomId);

                var entryMarker = entry.GetComponent<GreyboxMarker>();
                Assert.AreEqual("entry-room-0", entryMarker.MarkerId);
                Assert.AreEqual("$.rooms[0]", entryMarker.JsonPath);
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void BuildsRoleAwarePrimitiveShapesAndExplicitScale()
        {
            var root = PrefabBuilder.BuildFromGameViewport(JObject.Parse(@"{""title"":""Arena"",""actors"":[{""id"":""boss"",""rotation"":{""x"":0,""y"":90,""z"":0},""size"":{""x"":2,""height"":3,""depth"":1.5}}],""spawnPoints"":[{""id"":""spawn-a""}],""objectives"":[{""id"":""relic""}],""hazards"":[{""id"":""storm"",""shape"":""sphere"",""radius"":0.1}]}"), "Assets/Greybox/arena.gameview");
            try
            {
                var actor = root.transform.Find("Actors/boss");
                var spawn = root.transform.Find("Spawn Points/spawn-a");
                var objective = root.transform.Find("Objectives/relic");
                var hazard = root.transform.Find("Hazards/storm");

                StringAssert.Contains("Capsule", actor.GetComponent<MeshFilter>().sharedMesh.name);
                StringAssert.Contains("Sphere", spawn.GetComponent<MeshFilter>().sharedMesh.name);
                StringAssert.Contains("Cylinder", objective.GetComponent<MeshFilter>().sharedMesh.name);
                StringAssert.Contains("Sphere", hazard.GetComponent<MeshFilter>().sharedMesh.name);
                Assert.AreEqual(new Vector3(0f, 90f, 0f), actor.localEulerAngles);
                Assert.AreEqual(new Vector3(2f, 3f, 1.5f), actor.localScale);
                Assert.AreEqual(Vector3.one * 0.25f, hazard.localScale);
                Assert.AreEqual("Capsule", actor.GetComponent<GreyboxMarker>().Primitive);
                Assert.AreEqual("Sphere", hazard.GetComponent<GreyboxMarker>().Primitive);
                Assert.IsNull(actor.GetComponent<Collider>());
                Assert.IsNull(spawn.GetComponent<Collider>());
                Assert.IsNull(objective.GetComponent<Collider>());
                Assert.IsNull(hazard.GetComponent<Collider>());
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void AddsAuthoredCollidersForPlayableImports()
        {
            string folder = CreateTempAssetFolder();
            string meshPath = $"{folder}/BossMesh.asset";
            var mesh = new Mesh
            {
                vertices = new[]
                {
                    Vector3.zero,
                    Vector3.right,
                    Vector3.up,
                },
                triangles = new[] { 0, 1, 2 },
            };

            try
            {
                AssetDatabase.CreateAsset(mesh, meshPath);
                var root = PrefabBuilder.BuildFromGameViewport(JObject.Parse(@"{""title"":""Arena"",""actors"":[{""id"":""boss"",""meshAssetPath"":""" + meshPath + @""",""colliderType"":""mesh"",""rigidbody"":""dynamic"",""mass"":12,""useGravity"":false}],""spawnPoints"":[{""id"":""spawn-a"",""collider"":""sphere"",""trigger"":true}],""objectives"":[{""id"":""relic"",""collider"":true}],""hazards"":[{""id"":""storm"",""physics"":{""collider"":true,""shape"":""capsule"",""bodyType"":""kinematic"",""useGravity"":false}}]}"), "Assets/Greybox/arena.gameview");
                try
                {
                    var actor = root.transform.Find("Actors/boss");
                    var meshCollider = actor.GetComponent<MeshCollider>();
                    var actorBody = actor.GetComponent<Rigidbody>();
                    Assert.NotNull(meshCollider);
                    Assert.AreSame(mesh, meshCollider.sharedMesh);
                    Assert.True(meshCollider.convex);
                    Assert.NotNull(actorBody);
                    Assert.AreEqual(12f, actorBody.mass);
                    Assert.False(actorBody.useGravity);
                    Assert.False(actorBody.isKinematic);

                    var spawn = root.transform.Find("Spawn Points/spawn-a");
                    var spawnCollider = spawn.GetComponent<SphereCollider>();
                    Assert.NotNull(spawnCollider);
                    Assert.True(spawnCollider.isTrigger);

                    var objective = root.transform.Find("Objectives/relic");
                    Assert.NotNull(objective.GetComponent<BoxCollider>());
                    Assert.IsNull(objective.GetComponent<Rigidbody>());

                    var hazard = root.transform.Find("Hazards/storm");
                    Assert.NotNull(hazard.GetComponent<CapsuleCollider>());
                    var hazardBody = hazard.GetComponent<Rigidbody>();
                    Assert.NotNull(hazardBody);
                    Assert.True(hazardBody.isKinematic);
                    Assert.False(hazardBody.useGravity);
                }
                finally
                {
                    Object.DestroyImmediate(root);
                }
            }
            finally
            {
                AssetDatabase.DeleteAsset(folder);
            }
        }

        [Test]
        public void AppliesExplicitUnityObjectMetadata()
        {
            int ignoreRaycastLayer = LayerMask.NameToLayer("Ignore Raycast");
            var root = PrefabBuilder.BuildFromGameViewport(JObject.Parse(@"{""title"":""Arena"",""actors"":[{""id"":""boss"",""unityTag"":""Player"",""unityLayerName"":""Ignore Raycast"",""unityStatic"":true,""activeSelf"":false}],""spawnPoints"":[{""id"":""spawn-a"",""unityTag"":""Missing Greybox Tag"",""unityLayer"":31}],""objectives"":[{""id"":""relic"",""layerName"":""Missing Greybox Layer""}]}"), "Assets/Greybox/arena.gameview");
            try
            {
                var actor = root.transform.Find("Actors/boss");
                var actorNode = actor.GetComponent<GreyboxDesignNode>();
                Assert.NotNull(actor);
                Assert.AreEqual("Player", actor.gameObject.tag);
                Assert.AreEqual(ignoreRaycastLayer, actor.gameObject.layer);
                Assert.True(actor.gameObject.isStatic);
                Assert.False(actor.gameObject.activeSelf);
                Assert.IsNull(actorNode.Properties.Find(item => item.Key == "unityTag"));
                Assert.IsNull(actorNode.Properties.Find(item => item.Key == "unityLayerName"));
                Assert.IsNull(actorNode.Properties.Find(item => item.Key == "unityStatic"));
                Assert.IsNull(actorNode.Properties.Find(item => item.Key == "activeSelf"));

                var spawn = root.transform.Find("Spawn Points/spawn-a");
                Assert.AreEqual("Untagged", spawn.gameObject.tag);
                Assert.AreEqual(31, spawn.gameObject.layer);

                var objective = root.transform.Find("Objectives/relic");
                Assert.AreEqual(0, objective.gameObject.layer);
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void AttachesInspectableRuntimeDesignNodeProperties()
        {
            var root = PrefabBuilder.BuildFromGameViewport(JObject.Parse(@"{""title"":""Arena"",""actors"":[{""id"":""boss"",""name"":""Gate Boss"",""position"":{""x"":1,""y"":2,""z"":3},""health"":2,""speed"":1.5,""hostile"":true,""faction"":""Keepers"",""tags"":[""boss"",""tutorial""],""tint"":{""r"":1,""g"":0.25,""b"":0.1,""a"":1}}]}"), "Assets/Greybox/arena.gameview");
            try
            {
                var node = root.transform.Find("Actors/Gate Boss").GetComponent<GreyboxDesignNode>();
                Assert.NotNull(node);
                Assert.AreEqual(GreyboxArtifactKind.GameViewport, node.ArtifactKind);
                Assert.AreEqual("actors", node.Collection);
                Assert.AreEqual("boss", node.NodeId);
                Assert.AreEqual("Gate Boss", node.DisplayName);
                Assert.AreEqual("$.actors[id=boss]", node.JsonPath);
                Assert.AreEqual(new Vector3(1f, 2f, 3f), node.AuthoredPosition);
                Assert.AreEqual(Vector3.zero, node.AuthoredRotationEuler);
                CollectionAssert.AreEqual(new[] { "boss", "tutorial" }, node.Tags);
                AssertProperty(node, "health", GreyboxDesignPropertyKind.Number, "2");
                AssertProperty(node, "speed", GreyboxDesignPropertyKind.Number, "1.5");
                AssertProperty(node, "hostile", GreyboxDesignPropertyKind.Boolean, "true");
                AssertProperty(node, "faction", GreyboxDesignPropertyKind.String, "Keepers");
                AssertProperty(node, "tint", GreyboxDesignPropertyKind.Color, @"{""r"":1,""g"":0.25,""b"":0.1,""a"":1}");
                StringAssert.Contains(@"""health"":2", node.SourceJson);
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void BoundsInspectableRuntimeDesignNodeMetadata()
        {
            var tags = new JArray(" boss\n tag ", new string('T', 120), "boss tag");
            for (int index = 0; index < 32; index++) tags.Add($"tag-{index}");
            var actor = new JObject
            {
                ["id"] = "boss",
                ["name"] = "Gate Boss",
                ["tags"] = tags,
                ["bad/key"] = new string('x', 3000),
                ["__proto__"] = "polluted",
                ["oversized"] = new string('z', 10000),
            };
            for (int index = 0; index < 80; index++) actor[$"custom/{index}"] = index;

            var root = PrefabBuilder.BuildFromGameViewport(new JObject
            {
                ["title"] = "Arena",
                ["actors"] = new JArray(actor),
            }, "Assets/Greybox/arena.gameview");
            try
            {
                var node = root.transform.Find("Actors/Gate Boss").GetComponent<GreyboxDesignNode>();
                Assert.NotNull(node);
                Assert.AreEqual(16, node.Tags.Count);
                Assert.AreEqual("boss tag", node.Tags[0]);
                Assert.LessOrEqual(node.Tags[1].Length, 80);
                Assert.AreEqual(64, node.Properties.Count);
                Assert.NotNull(node.Properties.Find(item => item.Key == "bad-key"));
                Assert.IsNull(node.Properties.Find(item => item.Key == "__proto__"));
                Assert.True(node.Properties.TrueForAll(item => item.Key.Length <= 80 && item.Value.Length <= 2048));
                Assert.False(node.Properties.Exists(item => item.Key.Contains("/")));
                Assert.LessOrEqual(node.SourceJson.Length, 8192);
                Assert.False(node.SourceJson.Contains("\n"));
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void ImportsAuthoredEulerAliasesIntoTransformsAndDesignNodes()
        {
            var root = PrefabBuilder.BuildFromGameViewport(JObject.Parse(@"{""title"":""Arena"",""actors"":[{""id"":""boss"",""rotationEuler"":{""pitch"":10,""yaw"":45,""roll"":5}}],""spawnPoints"":[{""id"":""spawn-a"",""yaw"":180}]}"), "Assets/Greybox/arena.gameview");
            try
            {
                var actor = root.transform.Find("Actors/boss");
                var spawn = root.transform.Find("Spawn Points/spawn-a");
                var actorNode = actor.GetComponent<GreyboxDesignNode>();
                var spawnNode = spawn.GetComponent<GreyboxDesignNode>();

                Assert.AreEqual(new Vector3(10f, 45f, 5f), actor.localEulerAngles);
                Assert.AreEqual(new Vector3(10f, 45f, 5f), actorNode.AuthoredRotationEuler);
                Assert.AreEqual(new Vector3(0f, 180f, 0f), spawn.localEulerAngles);
                Assert.AreEqual(new Vector3(0f, 180f, 0f), spawnNode.AuthoredRotationEuler);
                Assert.IsNull(actorNode.Properties.Find(item => item.Key == "rotationEuler"));
                Assert.IsNull(spawnNode.Properties.Find(item => item.Key == "yaw"));
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void PreservesAuthoredTransformAliasesForRoundTripPositionPaths()
        {
            var root = PrefabBuilder.BuildFromGameViewport(JObject.Parse(@"{""title"":""Arena"",""actors"":[{""id"":""boss"",""transform"":{""position"":[1,2,3],""rotation"":[0,45,0],""scale"":[2,3,4]}}],""spawnPoints"":[{""id"":""spawn-a"",""location"":{""x"":4,""y"":5,""z"":6}}],""objectives"":[{""id"":""exit"",""translation"":[7,8,9]}]}"), "Assets/Greybox/arena.gameview");
            try
            {
                var actor = root.transform.Find("Actors/boss");
                var actorMarker = actor.GetComponent<GreyboxMarker>();
                var actorNode = actor.GetComponent<GreyboxDesignNode>();
                var spawn = root.transform.Find("Spawn Points/spawn-a");
                var objective = root.transform.Find("Objectives/exit");

                Assert.AreEqual(new Vector3(1f, 2f, 3f), actor.localPosition);
                Assert.AreEqual(new Vector3(0f, 45f, 0f), actor.localEulerAngles);
                Assert.AreEqual(new Vector3(2f, 3f, 4f), actor.localScale);
                Assert.AreEqual("$.actors[id=boss].transform.position", actorMarker.PositionJsonPath);
                Assert.AreEqual(new Vector3(1f, 2f, 3f), actorNode.AuthoredPosition);
                Assert.AreEqual(new Vector3(0f, 45f, 0f), actorNode.AuthoredRotationEuler);
                Assert.AreEqual(new Vector3(2f, 3f, 4f), actorNode.AuthoredScale);
                Assert.IsNull(actorNode.Properties.Find(item => item.Key == "transform"));

                Assert.AreEqual(new Vector3(4f, 5f, 6f), spawn.localPosition);
                Assert.AreEqual("$.spawnPoints[id=spawn-a].location", spawn.GetComponent<GreyboxMarker>().PositionJsonPath);
                Assert.IsNull(spawn.GetComponent<GreyboxDesignNode>().Properties.Find(item => item.Key == "location"));

                Assert.AreEqual(new Vector3(7f, 8f, 9f), objective.localPosition);
                Assert.AreEqual("$.objectives[id=exit].translation", objective.GetComponent<GreyboxMarker>().PositionJsonPath);
                Assert.IsNull(objective.GetComponent<GreyboxDesignNode>().Properties.Find(item => item.Key == "translation"));
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void MalformedNumericVectorInputsFallBackWithoutThrowing()
        {
            var root = PrefabBuilder.BuildFromGameViewport(JObject.Parse(@"{""title"":""Arena"",""actors"":[{""id"":""boss"",""position"":[""left"",2,3],""rotation"":[0,""yaw"",15],""scale"":[""wide"",3,4],""radius"":""large""}],""spawnPoints"":[{""id"":""spawn-a"",""x"":""left"",""y"":2,""z"":false}],""hazards"":[{""id"":""storm"",""position"":[1,2,""far""],""size"":[2,true,4]}]}"), "Assets/Greybox/arena.gameview");
            try
            {
                var actor = root.transform.Find("Actors/boss");
                var spawn = root.transform.Find("Spawn Points/spawn-a");
                var hazard = root.transform.Find("Hazards/storm");

                Assert.AreEqual(Vector3.zero, actor.localPosition);
                Assert.AreEqual(Vector3.zero, actor.localEulerAngles);
                Assert.AreEqual(Vector3.one, actor.localScale);
                Assert.AreEqual(new Vector3(0f, 2f, 0f), spawn.localPosition);
                Assert.AreEqual(new Vector3(1f, 2f, 0f), hazard.localPosition);
                Assert.AreEqual(Vector3.one, hazard.localScale);
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void AppliesAuthoredMaterialColorsToGeneratedNodes()
        {
            var root = PrefabBuilder.BuildFromGameViewport(JObject.Parse(@"{""title"":""Arena"",""actors"":[{""id"":""boss"",""colorHex"":""#FF6B35""}],""hazards"":[{""id"":""storm"",""tint"":{""r"":64,""g"":128,""b"":255,""a"":255}}]}"), "Assets/Greybox/arena.gameview");
            try
            {
                var actorMaterial = root.transform.Find("Actors/boss").GetComponent<Renderer>().sharedMaterial;
                var hazardMaterial = root.transform.Find("Hazards/storm").GetComponent<Renderer>().sharedMaterial;

                Assert.AreEqual("#FF6B35", ColorUtility.ToHtmlStringRGB(actorMaterial.color).Insert(0, "#"));
                Assert.AreEqual(new Color(64f / 255f, 128f / 255f, 1f, 1f), hazardMaterial.color);
                Assert.AreEqual("Greybox boss Marker", actorMaterial.name);
                Material[] generatedMaterials = PrefabBuilder.CollectGeneratedMaterials(root);
                Assert.AreEqual(2, generatedMaterials.Length);
                CollectionAssert.Contains(generatedMaterials, actorMaterial);
                CollectionAssert.Contains(generatedMaterials, hazardMaterial);
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void ResolvesGameViewportMaterialsFromArtBiblePalette()
        {
            string folder = CreateTempAssetFolder();
            string palettePath = $"{folder}/GreyboxPalette.asset";
            string materialPath = $"{folder}/RunnerInk.mat";
            var runnerColor = new Color(10f / 255f, 10f / 255f, 13f / 255f, 1f);
            var authoredMaterial = MaterialBuilder.Colored(runnerColor, "Runner Ink Material");
            try
            {
                AssetDatabase.CreateAsset(authoredMaterial, materialPath);
                CreatePaletteAsset(palettePath, "Runner Ink", "#0A0A0D", runnerColor, materialPath);

                var root = PrefabBuilder.BuildFromGameViewport(JObject.Parse(@"{""title"":""Arena"",""artBiblePaletteAssetPath"":""" + palettePath + @""",""actors"":[{""id"":""runner"",""materialSlot"":""Runner Ink""}],""hazards"":[{""id"":""storm"",""materialSlot"":""Runner Ink"",""colorHex"":""#FF6B35""}]}"), "Assets/Greybox/arena.gameview");
                try
                {
                    var actor = root.transform.Find("Actors/runner");
                    var hazard = root.transform.Find("Hazards/storm");
                    var actorMaterial = actor.GetComponent<Renderer>().sharedMaterial;
                    var hazardMaterial = hazard.GetComponent<Renderer>().sharedMaterial;

                    Assert.AreSame(authoredMaterial, actorMaterial);
                    Assert.AreNotSame(authoredMaterial, hazardMaterial);
                    Assert.AreEqual("#FF6B35", ColorUtility.ToHtmlStringRGB(hazardMaterial.color).Insert(0, "#"));
                    Material[] generatedMaterials = PrefabBuilder.CollectGeneratedMaterials(root);
                    Assert.AreEqual(1, generatedMaterials.Length);
                    CollectionAssert.Contains(generatedMaterials, hazardMaterial);

                    var node = actor.GetComponent<GreyboxDesignNode>();
                    Assert.IsNull(node.Properties.Find(item => item.Key == "materialSlot"));
                    Assert.IsNull(node.Properties.Find(item => item.Key == "artBiblePaletteAssetPath"));
                }
                finally
                {
                    Object.DestroyImmediate(root);
                }
            }
            finally
            {
                AssetDatabase.DeleteAsset(folder);
            }
        }

        [Test]
        public void GeneratesGameViewportMaterialFromArtBiblePaletteColor()
        {
            string folder = CreateTempAssetFolder();
            string palettePath = $"{folder}/GreyboxPalette.asset";
            var loopGreen = new Color(46f / 255f, 204f / 255f, 113f / 255f, 1f);
            try
            {
                CreatePaletteAsset(palettePath, "Loop Green", "#2ECC71", loopGreen, "");

                var root = PrefabBuilder.BuildFromGameViewport(JObject.Parse(@"{""title"":""Arena"",""actors"":[{""id"":""runner"",""paletteColor"":""Loop Green"",""artBiblePaletteAssetPath"":""" + palettePath + @"""}]}"), "Assets/Greybox/arena.gameview");
                try
                {
                    var actor = root.transform.Find("Actors/runner");
                    var material = actor.GetComponent<Renderer>().sharedMaterial;

                    Assert.AreEqual("#2ECC71", ColorUtility.ToHtmlStringRGB(material.color).Insert(0, "#"));
                    Assert.AreEqual("Greybox Loop Green Marker", material.name);
                    Material[] generatedMaterials = PrefabBuilder.CollectGeneratedMaterials(root);
                    Assert.AreEqual(1, generatedMaterials.Length);
                    CollectionAssert.Contains(generatedMaterials, material);

                    var node = actor.GetComponent<GreyboxDesignNode>();
                    Assert.IsNull(node.Properties.Find(item => item.Key == "paletteColor"));
                    Assert.IsNull(node.Properties.Find(item => item.Key == "artBiblePaletteAssetPath"));
                }
                finally
                {
                    Object.DestroyImmediate(root);
                }
            }
            finally
            {
                AssetDatabase.DeleteAsset(folder);
            }
        }

        [Test]
        public void AttachesTypedRuntimeComponentsForGameplayCollections()
        {
            var root = PrefabBuilder.BuildFromGameViewport(JObject.Parse(@"{""title"":""Arena"",""actors"":[{""id"":""boss"",""name"":""Boss"",""role"":""enemy"",""faction"":""Keepers"",""behavior"":""patrol-aggro"",""abilities"":[""slam"",""dash""],""patrolRoute"":[""patrol-a"",""patrol-b""],""lootTable"":""boss-loot"",""health"":2,""speed"":3.5,""jumpImpulse"":12.5,""attackDamage"":4,""attackRange"":2.25,""patrolRadius"":3.75,""attackCooldown"":0.75,""detectionRadius"":12}],""spawnPoints"":[{""id"":""checkpoint_a"",""name"":""Checkpoint A"",""spawnGroup"":""players"",""actorIds"":[""hero""],""maxCount"":2,""cooldownSeconds"":6,""spawnOnStart"":false,""radius"":0.75}],""objectives"":[{""id"":""exit_gate"",""name"":""Exit Gate"",""objectiveType"":""exit"",""targets"":[""boss"",""relic""],""reward"":""unlock-door"",""timeLimitSeconds"":90,""requiredCount"":3}],""hazards"":[{""id"":""spike_row"",""name"":""Spike Row"",""hazardType"":""spikes"",""effect"":""bleed"",""damage"":4,""tickSeconds"":0.25,""radius"":2,""knockback"":3.5,""affectedTags"":[""Player"",""Companion""],""lethal"":true}]}"), "Assets/Greybox/arena.gameview");
            try
            {
                var actor = root.transform.Find("Actors/Boss").GetComponent<GreyboxActorDefinition>();
                Assert.NotNull(actor);
                Assert.AreEqual("boss", actor.ActorId);
                Assert.AreEqual("enemy", actor.Role);
                Assert.AreEqual("Keepers", actor.Faction);
                Assert.AreEqual("patrol-aggro", actor.Behavior);
                CollectionAssert.AreEqual(new[] { "slam", "dash" }, actor.AbilityIds);
                CollectionAssert.AreEqual(new[] { "patrol-a", "patrol-b" }, actor.PatrolPointIds);
                Assert.AreEqual("boss-loot", actor.LootTableId);
                Assert.AreEqual(2, actor.Health);
                Assert.AreEqual(3.5f, actor.MoveSpeed);
                Assert.AreEqual(12.5f, actor.JumpImpulse);
                Assert.AreEqual(4, actor.Damage);
                Assert.AreEqual(2.25f, actor.AttackRange);
                Assert.AreEqual(3.75f, actor.PatrolRadius);
                Assert.AreEqual(0.75f, actor.AttackCooldownSeconds);
                Assert.AreEqual(12f, actor.AggroRadius);
                Assert.True(actor.IsEnemy);
                Assert.False(actor.IsPlayerControlled);

                var spawn = root.transform.Find("Spawn Points/Checkpoint A").GetComponent<GreyboxSpawnPoint>();
                Assert.NotNull(spawn);
                Assert.AreEqual("checkpoint_a", spawn.SpawnId);
                Assert.AreEqual("players", spawn.SpawnGroup);
                CollectionAssert.AreEqual(new[] { "hero" }, spawn.ActorIds);
                Assert.AreEqual(2, spawn.MaxCount);
                Assert.AreEqual(6f, spawn.CooldownSeconds);
                Assert.False(spawn.SpawnOnStart);
                Assert.AreEqual(0.75f, spawn.SpawnRadius);
                Assert.True(spawn.IsCheckpoint);

                var objective = root.transform.Find("Objectives/Exit Gate").GetComponent<GreyboxObjective>();
                Assert.NotNull(objective);
                Assert.AreEqual("exit_gate", objective.ObjectiveId);
                Assert.AreEqual("exit", objective.ObjectiveType);
                CollectionAssert.AreEqual(new[] { "boss", "relic" }, objective.TargetIds);
                Assert.AreEqual("unlock-door", objective.Reward);
                Assert.AreEqual(90f, objective.TimeLimitSeconds);
                Assert.AreEqual(3, objective.RequiredCount);
                Assert.True(objective.IsPrimary);

                var hazard = root.transform.Find("Hazards/Spike Row").GetComponent<GreyboxHazard>();
                Assert.NotNull(hazard);
                Assert.AreEqual("spike_row", hazard.HazardId);
                Assert.AreEqual("spikes", hazard.HazardType);
                Assert.AreEqual("bleed", hazard.Effect);
                Assert.AreEqual(4f, hazard.Damage);
                Assert.AreEqual(0.25f, hazard.TickSeconds);
                Assert.AreEqual(2f, hazard.Radius);
                Assert.AreEqual(3.5f, hazard.Knockback);
                CollectionAssert.AreEqual(new[] { "Player", "Companion" }, hazard.AffectedTags);
                Assert.True(hazard.IsLethal);

                var viewport = root.GetComponent<GreyboxGameViewport>();
                Assert.NotNull(viewport);
                Assert.AreEqual(1, viewport.Actors().Length);
                Assert.AreEqual(1, viewport.SpawnPoints().Length);
                Assert.AreEqual(1, viewport.Objectives().Length);
                Assert.AreEqual(1, viewport.Hazards().Length);
                Assert.True(viewport.TryGetActor("BOSS", out GreyboxActorDefinition foundActor));
                Assert.AreSame(actor, foundActor);
                Assert.True(viewport.TryGetSpawnPoint("checkpoint_a", out GreyboxSpawnPoint foundSpawn));
                Assert.AreSame(spawn, foundSpawn);
                Assert.True(viewport.TryGetObjective("exit_gate", out GreyboxObjective foundObjective));
                Assert.AreSame(objective, foundObjective);
                Assert.True(viewport.TryGetHazard("spike_row", out GreyboxHazard foundHazard));
                Assert.AreSame(hazard, foundHazard);
                Assert.AreEqual(1, viewport.EnemyActors().Length);
                Assert.AreEqual(1, viewport.CheckpointSpawnPoints().Length);
                Assert.True(viewport.TryGetExitObjective(out GreyboxObjective exitObjective));
                Assert.AreSame(objective, exitObjective);
                Assert.True(viewport.TryGetWorldPosition(hazard, out Vector3 hazardWorldPosition));
                Assert.AreEqual(hazard.transform.position, hazardWorldPosition);
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void BoundsAuthoredRuntimeComponentStringsAndArrays()
        {
            var abilities = new JArray("dash", "dash", "slash\nheavy", new string('A', 240));
            var patrol = new JArray("../patrol/a[0]", "../patrol/a[0]", "patrol-b");
            var affectedTags = new JArray("Player", "Player", "Companion\nTag", new string('T', 240));
            for (int index = 0; index < 80; index++)
            {
                abilities.Add($"skill-{index}");
                affectedTags.Add($"tag-{index}");
            }

            var root = PrefabBuilder.BuildFromGameViewport(new JObject
            {
                ["id"] = "../viewport/id[0]",
                ["title"] = new string('A', 240),
                ["theme"] = "neon\ncrypt",
                ["targetEngine"] = new string('E', 240),
                ["camera"] = new JObject { ["mode"] = "side\nscroll" },
                ["actors"] = new JArray(new JObject
                {
                    ["id"] = "boss",
                    ["name"] = "Boss",
                    ["role"] = new string('R', 240),
                    ["faction"] = "Keepers\nGuild",
                    ["behavior"] = new string('B', 240),
                    ["abilities"] = abilities,
                    ["patrolRoute"] = patrol,
                    ["lootTable"] = "../loot/table[0]",
                }),
                ["spawnPoints"] = new JArray(new JObject
                {
                    ["id"] = "spawn",
                    ["actorIds"] = new JArray("../hero/main[0]", "../hero/main[0]", "boss"),
                }),
                ["objectives"] = new JArray(new JObject
                {
                    ["id"] = "exit",
                    ["objectiveType"] = new string('O', 240),
                    ["targets"] = new JArray("../boss/main[0]", "relic"),
                    ["reward"] = new string('W', 240),
                }),
                ["hazards"] = new JArray(new JObject
                {
                    ["id"] = "storm",
                    ["hazardType"] = new string('H', 240),
                    ["effect"] = "slow\nburn",
                    ["affectedTags"] = affectedTags,
                }),
            }, "Assets/Greybox/arena.gameview");
            try
            {
                var viewport = root.GetComponent<GreyboxGameViewport>();
                Assert.AreEqual("viewport-id-0", viewport.ViewportId);
                Assert.LessOrEqual(viewport.DisplayName.Length, 160);
                Assert.AreEqual("neon crypt", viewport.Theme);
                Assert.LessOrEqual(viewport.TargetEngine.Length, 160);
                Assert.AreEqual("side scroll", viewport.CameraMode);

                var actor = root.transform.Find("Actors/Boss").GetComponent<GreyboxActorDefinition>();
                Assert.LessOrEqual(actor.Role.Length, 160);
                Assert.AreEqual("Keepers Guild", actor.Faction);
                Assert.LessOrEqual(actor.Behavior.Length, 160);
                Assert.AreEqual(64, actor.AbilityIds.Length);
                CollectionAssert.AreEqual(new[] { "dash", "slash heavy" }, new[] { actor.AbilityIds[0], actor.AbilityIds[1] });
                Assert.LessOrEqual(actor.AbilityIds[2].Length, 160);
                CollectionAssert.AreEqual(new[] { "patrol-a-0", "patrol-b" }, actor.PatrolPointIds);
                Assert.AreEqual("loot-table-0", actor.LootTableId);

                var spawn = root.transform.Find("Spawn Points/spawn").GetComponent<GreyboxSpawnPoint>();
                CollectionAssert.AreEqual(new[] { "hero-main-0", "boss" }, spawn.ActorIds);

                var objective = root.transform.Find("Objectives/exit").GetComponent<GreyboxObjective>();
                Assert.LessOrEqual(objective.ObjectiveType.Length, 160);
                CollectionAssert.AreEqual(new[] { "boss-main-0", "relic" }, objective.TargetIds);
                Assert.LessOrEqual(objective.Reward.Length, 160);

                var hazard = root.transform.Find("Hazards/storm").GetComponent<GreyboxHazard>();
                Assert.LessOrEqual(hazard.HazardType.Length, 160);
                Assert.AreEqual("slow burn", hazard.Effect);
                Assert.AreEqual(64, hazard.AffectedTags.Length);
                CollectionAssert.AreEqual(new[] { "Player", "Companion Tag" }, new[] { hazard.AffectedTags[0], hazard.AffectedTags[1] });
                Assert.LessOrEqual(hazard.AffectedTags[2].Length, 160);
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void RecordsRequestedPrefabPathWhenAssetFallsBackToPrimitive()
        {
            var root = PrefabBuilder.BuildFromGameViewport(JObject.Parse(@"{""title"":""Arena"",""actors"":[{""id"":""boss"",""prefabAssetPath"":""Assets/Greybox/Missing/Boss.prefab""}]}"), "Assets/Greybox/arena.gameview");
            try
            {
                var marker = root.transform.Find("Actors/boss").GetComponent<GreyboxMarker>();
                Assert.NotNull(marker);
                Assert.AreEqual("Assets/Greybox/Missing/Boss.prefab", marker.UnityAssetPath);
                Assert.AreEqual("", marker.UnityAssetGuid);
                Assert.AreEqual("Capsule", marker.Primitive);
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void RejectsUnsafeUnityAssetPathsFromArtifactJson()
        {
            var root = PrefabBuilder.BuildFromGameViewport(
                JObject.Parse(@"{""title"":""Arena"",""actors"":[{""id"":""path-traversal"",""prefabAssetPath"":""Assets/Greybox/../Secrets/Boss.prefab""},{""id"":""outside"",""prefabAssetPath"":""../ProjectSettings/ProjectSettings.asset""},{""id"":""url"",""meshAssetPath"":""https://example.test/Boss.fbx""},{""id"":""control"",""meshAssetPath"":""Assets/Greybox/Boss.asset\n.meta""},{""id"":""backslash"",""meshAssetPath"":""Assets\\Greybox\\Missing\\Boss.asset""}]}"),
                "Assets/Greybox/arena.gameview");
            try
            {
                foreach (string actorId in new[] { "path-traversal", "outside", "url", "control" })
                {
                    var marker = root.transform.Find($"Actors/{actorId}").GetComponent<GreyboxMarker>();
                    Assert.NotNull(marker);
                    Assert.AreEqual("", marker.UnityAssetPath);
                    Assert.AreEqual("", marker.UnityAssetGuid);
                    Assert.AreEqual("Capsule", marker.Primitive);
                }

                var normalized = root.transform.Find("Actors/backslash").GetComponent<GreyboxMarker>();
                Assert.NotNull(normalized);
                Assert.AreEqual("Assets/Greybox/Missing/Boss.asset", normalized.UnityAssetPath);
                Assert.AreEqual("", normalized.UnityAssetGuid);
                Assert.AreEqual("Capsule", normalized.Primitive);
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void InstantiatesReferencedPrefabAssetsForAuthoredNodes()
        {
            string folder = CreateTempAssetFolder();
            string prefabPath = $"{folder}/Boss.prefab";
            var source = GameObject.CreatePrimitive(PrimitiveType.Cube);
            source.name = "Boss Source";
            source.AddComponent<AudioSource>();
            source.AddComponent<GreyboxActorDefinition>().Health = 9;
            try
            {
                PrefabUtility.SaveAsPrefabAsset(source, prefabPath);
                var root = PrefabBuilder.BuildFromGameViewport(JObject.Parse(@"{""title"":""Arena"",""actors"":[{""id"":""boss"",""name"":""Boss"",""prefabAssetPath"":""" + prefabPath + @""",""health"":3}]}"), "Assets/Greybox/arena.gameview");
                try
                {
                    var actor = root.transform.Find("Actors/Boss");
                    var marker = actor.GetComponent<GreyboxMarker>();
                    var manifest = actor.GetComponent<GreyboxGeneratedComponents>();
                    Assert.NotNull(actor.GetComponent<MeshFilter>());
                    Assert.NotNull(actor.GetComponent<AudioSource>());
                    Assert.NotNull(actor.GetComponent<GreyboxActorDefinition>());
                    Assert.NotNull(manifest);
                    Assert.True(manifest.Contains(typeof(AudioSource).FullName));
                    Assert.AreEqual(prefabPath, marker.UnityAssetPath);
                    Assert.AreEqual(AssetDatabase.AssetPathToGUID(prefabPath), marker.UnityAssetGuid);
                    Assert.AreEqual("Prefab", marker.Primitive);
                }
                finally
                {
                    Object.DestroyImmediate(root);
                }
            }
            finally
            {
                Object.DestroyImmediate(source);
                AssetDatabase.DeleteAsset(folder);
            }
        }

        [Test]
        public void PreservesReferencedPrefabMaterialsUnlessArtifactOverridesThem()
        {
            string folder = CreateTempAssetFolder();
            string prefabPath = $"{folder}/Boss.prefab";
            string materialPath = $"{folder}/AuthoredBoss.mat";
            var authoredMaterial = MaterialBuilder.Colored(new Color(0.2f, 0.7f, 0.9f), "Authored Boss Material");
            var source = GameObject.CreatePrimitive(PrimitiveType.Cube);
            source.name = "Boss Source";
            source.GetComponent<Renderer>().sharedMaterial = authoredMaterial;
            try
            {
                AssetDatabase.CreateAsset(authoredMaterial, materialPath);
                PrefabUtility.SaveAsPrefabAsset(source, prefabPath);

                var preservedRoot = PrefabBuilder.BuildFromGameViewport(JObject.Parse(@"{""title"":""Arena"",""actors"":[{""id"":""boss"",""name"":""Boss"",""prefabAssetPath"":""" + prefabPath + @"""}]}"), "Assets/Greybox/arena.gameview");
                try
                {
                    var actor = preservedRoot.transform.Find("Actors/Boss");
                    Assert.AreSame(authoredMaterial, actor.GetComponent<Renderer>().sharedMaterial);
                    Assert.AreEqual("Prefab", actor.GetComponent<GreyboxMarker>().Primitive);
                    Assert.AreEqual(0, PrefabBuilder.CollectGeneratedMaterials(preservedRoot).Length);
                }
                finally
                {
                    Object.DestroyImmediate(preservedRoot);
                }

                var overrideRoot = PrefabBuilder.BuildFromGameViewport(JObject.Parse(@"{""title"":""Arena"",""actors"":[{""id"":""boss"",""name"":""Boss"",""prefabAssetPath"":""" + prefabPath + @""",""colorHex"":""#FF6B35""}]}"), "Assets/Greybox/arena.gameview");
                try
                {
                    var material = overrideRoot.transform.Find("Actors/Boss").GetComponent<Renderer>().sharedMaterial;
                    Assert.AreNotSame(authoredMaterial, material);
                    Assert.AreEqual("#FF6B35", ColorUtility.ToHtmlStringRGB(material.color).Insert(0, "#"));
                    Material[] generatedMaterials = PrefabBuilder.CollectGeneratedMaterials(overrideRoot);
                    Assert.AreEqual(1, generatedMaterials.Length);
                    CollectionAssert.Contains(generatedMaterials, material);
                }
                finally
                {
                    Object.DestroyImmediate(overrideRoot);
                }
            }
            finally
            {
                Object.DestroyImmediate(source);
                AssetDatabase.DeleteAsset(folder);
            }
        }

        [Test]
        public void BuildsMeshNodesWithReferencedMaterialAssets()
        {
            string folder = CreateTempAssetFolder();
            string meshPath = $"{folder}/BossMesh.asset";
            string materialPath = $"{folder}/BossMaterial.mat";
            var mesh = new Mesh
            {
                vertices = new[]
                {
                    Vector3.zero,
                    Vector3.right,
                    Vector3.up,
                },
                triangles = new[] { 0, 1, 2 },
            };
            var material = MaterialBuilder.Colored(new Color(1f, 0.42f, 0.21f), "Boss Material");
            try
            {
                AssetDatabase.CreateAsset(mesh, meshPath);
                AssetDatabase.CreateAsset(material, materialPath);
                var root = PrefabBuilder.BuildFromGameViewport(JObject.Parse(@"{""title"":""Arena"",""actors"":[{""id"":""boss"",""meshAssetPath"":""" + meshPath + @""",""materialAssetPath"":""" + materialPath + @"""}]}"), "Assets/Greybox/arena.gameview");
                try
                {
                    var actor = root.transform.Find("Actors/boss");
                    var meshFilter = actor.GetComponent<MeshFilter>();
                    var renderer = actor.GetComponent<MeshRenderer>();
                    var marker = actor.GetComponent<GreyboxMarker>();

                    Assert.NotNull(meshFilter);
                    Assert.NotNull(renderer);
                    Assert.AreSame(mesh, meshFilter.sharedMesh);
                    Assert.AreSame(material, renderer.sharedMaterial);
                    Assert.AreEqual(0, PrefabBuilder.CollectGeneratedMaterials(root).Length);
                    Assert.AreEqual(meshPath, marker.UnityAssetPath);
                    Assert.AreEqual(AssetDatabase.AssetPathToGUID(meshPath), marker.UnityAssetGuid);
                    Assert.AreEqual("Mesh", marker.Primitive);
                }
                finally
                {
                    Object.DestroyImmediate(root);
                }
            }
            finally
            {
                AssetDatabase.DeleteAsset(folder);
            }
        }

        [Test]
        public void ResolvesMeshAndMaterialReferencesFromGuidAliases()
        {
            string folder = CreateTempAssetFolder();
            string meshPath = $"{folder}/BossMesh.asset";
            string materialPath = $"{folder}/BossMaterial.mat";
            var mesh = new Mesh
            {
                vertices = new[]
                {
                    Vector3.zero,
                    Vector3.right,
                    Vector3.up,
                },
                triangles = new[] { 0, 1, 2 },
            };
            var material = MaterialBuilder.Colored(new Color(0.22f, 0.76f, 0.88f), "Boss Material");
            try
            {
                AssetDatabase.CreateAsset(mesh, meshPath);
                AssetDatabase.CreateAsset(material, materialPath);
                string meshGuid = AssetDatabase.AssetPathToGUID(meshPath);
                string materialGuid = AssetDatabase.AssetPathToGUID(materialPath);
                var root = PrefabBuilder.BuildFromGameViewport(JObject.Parse(@"{""title"":""Arena"",""actors"":[{""id"":""boss"",""meshAssetGuid"":""" + meshGuid + @""",""materialGuid"":""" + materialGuid + @"""}]}"), "Assets/Greybox/arena.gameview");
                try
                {
                    var actor = root.transform.Find("Actors/boss");
                    var meshFilter = actor.GetComponent<MeshFilter>();
                    var renderer = actor.GetComponent<MeshRenderer>();
                    var marker = actor.GetComponent<GreyboxMarker>();
                    var node = actor.GetComponent<GreyboxDesignNode>();

                    Assert.AreSame(mesh, meshFilter.sharedMesh);
                    Assert.AreSame(material, renderer.sharedMaterial);
                    Assert.AreEqual(meshPath, marker.UnityAssetPath);
                    Assert.AreEqual(meshGuid, marker.UnityAssetGuid);
                    Assert.AreEqual("Mesh", marker.Primitive);
                    Assert.IsNull(node.Properties.Find(item => item.Key == "meshAssetGuid"));
                    Assert.IsNull(node.Properties.Find(item => item.Key == "materialGuid"));
                }
                finally
                {
                    Object.DestroyImmediate(root);
                }
            }
            finally
            {
                AssetDatabase.DeleteAsset(folder);
            }
        }

        [Test]
        public void StampsOriginalDaemonSourceFileFromUnityPackageMetadata()
        {
            var root = PrefabBuilder.BuildFromGameViewport(JObject.Parse(@"{""title"":""Arena"",""__greyboxSourceFileName"":""levels/arena.gameview.json"",""spawnPoints"":[{""id"":""spawn-a"",""position"":{""x"":1,""y"":2,""z"":3}}]}"), "Assets/Greybox/Generated/Project-A/levels/arena.gameview");
            try
            {
                var marker = root.transform.Find("Spawn Points/spawn-a").GetComponent<GreyboxMarker>();
                Assert.NotNull(marker);
                Assert.AreEqual("levels/arena.gameview.json", marker.SourceFileName);
                Assert.AreEqual("$.spawnPoints[id=spawn-a].position", marker.PositionJsonPath);
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void UnsafeDaemonSourceFileMetadataFallsBackToLocalSourceFile()
        {
            var root = PrefabBuilder.BuildFromGameViewport(JObject.Parse(@"{""title"":""Arena"",""__greyboxSourceFileName"":""../levels/arena.gameview.json"",""spawnPoints"":[{""id"":""spawn-a"",""position"":{""x"":1,""y"":2,""z"":3}}]}"), "Assets/Greybox/Generated/Project-A/levels/arena.gameview");
            try
            {
                var marker = root.transform.Find("Spawn Points/spawn-a").GetComponent<GreyboxMarker>();
                Assert.NotNull(marker);
                Assert.AreEqual("arena.gameview", marker.SourceFileName);
                Assert.AreEqual("$.spawnPoints[id=spawn-a].position", marker.PositionJsonPath);
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void RejectsUnsafeMarkerSourcePaths()
        {
            var root = PrefabBuilder.BuildFromGameViewport(JObject.Parse(@"{""title"":""Arena"",""spawnPoints"":[{""id"":""spawn-a"",""position"":{""x"":1,""y"":2,""z"":3}}]}"), "../ProjectSettings/ProjectSettings.asset");
            try
            {
                var marker = root.transform.Find("Spawn Points/spawn-a").GetComponent<GreyboxMarker>();
                Assert.NotNull(marker);
                Assert.AreEqual("", marker.SourcePath);
                Assert.AreEqual("$.spawnPoints[id=spawn-a].position", marker.PositionJsonPath);
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void StampsLevelBoardRoomMetadata()
        {
            var root = PrefabBuilder.BuildLevelBoard(JObject.Parse(@"{""title"":""Floor"",""rooms"":[{""id"":""room-a"",""name"":""Entry Room"",""position"":{""x"":4,""y"":0,""z"":2}}]}"), "Assets/Greybox/floor.levelboard");
            try
            {
                var marker = root.transform.Find("Rooms/Entry Room").GetComponent<GreyboxMarker>();
                Assert.NotNull(marker);
                Assert.AreEqual(GreyboxArtifactKind.LevelBoard, marker.ArtifactKind);
                Assert.AreEqual("rooms", marker.Collection);
                Assert.AreEqual("$.rooms[id=room-a].position", marker.PositionJsonPath);
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void ResolvesLevelBoardConnectionMaterialsFromArtBiblePalette()
        {
            string folder = CreateTempAssetFolder();
            string palettePath = $"{folder}/GreyboxPalette.asset";
            string materialPath = $"{folder}/GateLine.mat";
            var connectionColor = new Color(60f / 255f, 194f / 255f, 224f / 255f, 1f);
            var authoredMaterial = MaterialBuilder.Colored(connectionColor, "Gate Line Material");
            try
            {
                AssetDatabase.CreateAsset(authoredMaterial, materialPath);
                CreatePaletteAsset(palettePath, "Focus Cyan", "#3CC2E0", connectionColor, materialPath);

                var root = PrefabBuilder.BuildLevelBoard(JObject.Parse(@"{""title"":""Floor"",""artBiblePaletteAssetPath"":""" + palettePath + @""",""rooms"":[{""id"":""entry"",""name"":""Entry""},{""id"":""boss"",""name"":""Boss"",""position"":{""x"":5,""y"":0,""z"":0}}],""connections"":[{""id"":""gate"",""name"":""Gate"",""from"":""entry"",""to"":""boss"",""paletteMaterial"":""Focus Cyan""}]}"), "Assets/Greybox/floor.levelboard");
                try
                {
                    var connection = root.transform.Find("Connections/Gate");
                    var line = connection.GetComponent<LineRenderer>();
                    var node = connection.GetComponent<GreyboxDesignNode>();

                    Assert.AreSame(authoredMaterial, line.sharedMaterial);
                    Assert.AreEqual(0, PrefabBuilder.CollectGeneratedMaterials(root).Length);
                    Assert.IsNull(node.Properties.Find(item => item.Key == "paletteMaterial"));
                    Assert.IsNull(node.Properties.Find(item => item.Key == "artBiblePaletteAssetPath"));
                }
                finally
                {
                    Object.DestroyImmediate(root);
                }
            }
            finally
            {
                AssetDatabase.DeleteAsset(folder);
            }
        }

        [Test]
        public void AttachesTypedRuntimeComponentsForLevelBoards()
        {
            var root = PrefabBuilder.BuildLevelBoard(JObject.Parse(@"{""id"":""floor-01"",""title"":""Crypt Floor"",""biome"":""crypt"",""rooms"":[{""id"":""entry"",""name"":""Entry Room"",""roomType"":""start"",""difficulty"":1,""radius"":3,""connections"":[""hall"",""boss""],""size"":{""x"":4,""y"":1,""z"":5}},{""id"":""hall"",""name"":""Hall"",""position"":{""x"":2,""y"":0,""z"":0}},{""id"":""boss"",""name"":""Boss Room"",""difficulty"":5,""position"":{""x"":5,""y"":0,""z"":1}}],""connections"":[{""id"":""locked-gate"",""name"":""Locked Gate"",""from"":""hall"",""to"":""boss"",""type"":""locked-door"",""locked"":true,""travelCost"":2}],""encounters"":[{""id"":""ambush"",""name"":""Entry Ambush"",""encounterType"":""combat"",""roomId"":""entry"",""enemyCount"":4,""reward"":""rusted-key"",""radius"":2.5}]}"), "Assets/Greybox/floor.levelboard");
            try
            {
                var board = root.GetComponent<GreyboxLevelBoard>();
                Assert.NotNull(board);
                Assert.AreEqual("floor-01", board.BoardId);
                Assert.AreEqual("Crypt Floor", board.DisplayName);
                Assert.AreEqual("crypt", board.Theme);
                Assert.AreEqual(3, board.RoomCount);
                Assert.AreEqual(1, board.EncounterCount);
                Assert.AreEqual(3, board.ConnectionCount);

                var entry = root.transform.Find("Rooms/Entry Room").GetComponent<GreyboxLevelRoom>();
                Assert.NotNull(entry);
                Assert.AreEqual("entry", entry.RoomId);
                Assert.AreEqual("start", entry.RoomType);
                Assert.AreEqual(1, entry.Difficulty);
                Assert.AreEqual(3f, entry.Radius);
                Assert.AreEqual(new Vector3(4f, 1f, 5f), entry.Size);
                Assert.True(entry.IsStart);
                Assert.False(entry.IsBoss);
                CollectionAssert.AreEqual(new[] { "hall", "boss" }, entry.ConnectedRoomIds);

                var boss = root.transform.Find("Rooms/Boss Room").GetComponent<GreyboxLevelRoom>();
                Assert.NotNull(boss);
                Assert.True(boss.IsBoss);
                Assert.AreEqual(5, boss.Difficulty);

                var encounter = root.transform.Find("Encounters/Entry Ambush").GetComponent<GreyboxEncounter>();
                Assert.NotNull(encounter);
                Assert.AreEqual("ambush", encounter.EncounterId);
                Assert.AreEqual("combat", encounter.EncounterType);
                Assert.AreEqual("entry", encounter.TargetRoomId);
                Assert.AreEqual(4, encounter.EnemyCount);
                Assert.AreEqual("rusted-key", encounter.Reward);
                Assert.AreEqual(2.5f, encounter.Radius);

                var connections = root.transform.Find("Connections");
                Assert.NotNull(connections);
                Assert.AreEqual(3, connections.childCount);

                var roomLink = connections.Find("entry to boss");
                Assert.NotNull(roomLink);
                var roomLinkLine = roomLink.GetComponent<LineRenderer>();
                var roomLinkData = roomLink.GetComponent<GreyboxLevelConnection>();
                Assert.NotNull(roomLinkLine);
                Assert.AreEqual(2, roomLinkLine.positionCount);
                Assert.AreEqual("entry", roomLinkData.FromRoomId);
                Assert.AreEqual("boss", roomLinkData.ToRoomId);

                var lockedGate = connections.Find("Locked Gate");
                Assert.NotNull(lockedGate);
                var lockedGateData = lockedGate.GetComponent<GreyboxLevelConnection>();
                var lockedGateMarker = lockedGate.GetComponent<GreyboxMarker>();
                Assert.AreEqual("locked-gate", lockedGateData.ConnectionId);
                Assert.AreEqual("hall", lockedGateData.FromRoomId);
                Assert.AreEqual("boss", lockedGateData.ToRoomId);
                Assert.AreEqual("locked-door", lockedGateData.ConnectionType);
                Assert.AreEqual(2f, lockedGateData.TravelCost);
                Assert.True(lockedGateData.Locked);
                Assert.AreEqual("connections", lockedGateMarker.Collection);

                Assert.AreEqual(3, board.Rooms().Length);
                Assert.AreEqual(1, board.Encounters().Length);
                Assert.AreEqual(3, board.Connections().Length);
                Assert.True(board.TryGetRoom("BOSS", out GreyboxLevelRoom foundBoss));
                Assert.AreSame(boss, foundBoss);
                Assert.True(board.TryGetEncounter("ambush", out GreyboxEncounter foundEncounter));
                Assert.AreSame(encounter, foundEncounter);
                Assert.True(board.TryGetConnection("locked-gate", out GreyboxLevelConnection foundConnection));
                Assert.AreSame(lockedGateData, foundConnection);
                CollectionAssert.AreEquivalent(new[] { "hall", "boss" }, board.ConnectedRoomIds("entry"));
                Assert.True(board.AreRoomsConnected("hall", "boss"));
                Assert.False(board.AreRoomsConnected("hall", "boss", false));
                CollectionAssert.AreEqual(new[] { "hall", "boss" }, board.ShortestRoomPath("hall", "boss"));
                CollectionAssert.AreEqual(new[] { "hall", "entry", "boss" }, board.ShortestRoomPath("hall", "boss", false));
                Assert.True(board.TryGetRoomWorldPosition("hall", out Vector3 hallPosition));
                Assert.AreEqual(root.transform.Find("Rooms/Hall").position, hallPosition);
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void BuildsTilemapFromLevelBoardTiles()
        {
            var root = PrefabBuilder.BuildLevelBoard(JObject.Parse(@"{""id"":""floor-01"",""title"":""Crypt Floor"",""tilemap"":{""cellSize"":{""x"":2,""y"":2,""z"":1},""collision"":true,""compositeCollider"":true,""tiles"":[{""id"":""floor-a"",""x"":0,""y"":0,""type"":""floor"",""color"":""#5C6166""},{""id"":""wall-a"",""position"":{""x"":1,""y"":2,""z"":0},""kind"":""wall"",""colorHex"":""#1A1A1F""},{""id"":""exit-a"",""position"":[2,2,0],""tileType"":""exit""}]}}"), "Assets/Greybox/floor.levelboard");
            try
            {
                var board = root.GetComponent<GreyboxLevelBoard>();
                Assert.NotNull(board);
                Assert.AreEqual(3, board.TileCount);

                var gridTransform = root.transform.Find("Tilemap Grid");
                Assert.NotNull(gridTransform);
                Assert.NotNull(gridTransform.GetComponent<Grid>());
                Assert.AreEqual(new Vector3(2f, 2f, 1f), gridTransform.GetComponent<Grid>().cellSize);

                var tilesTransform = gridTransform.Find("Tiles");
                Assert.NotNull(tilesTransform);
                var tilemap = tilesTransform.GetComponent<Tilemap>();
                var renderer = tilesTransform.GetComponent<TilemapRenderer>();
                var metadata = tilesTransform.GetComponent<GreyboxLevelTilemap>();
                var marker = tilesTransform.GetComponent<GreyboxMarker>();

                Assert.NotNull(tilemap);
                Assert.NotNull(renderer);
                Assert.NotNull(metadata);
                Assert.NotNull(marker);
                Assert.NotNull(tilesTransform.GetComponent<TilemapCollider2D>());
                Assert.NotNull(tilesTransform.GetComponent<CompositeCollider2D>());
                Assert.NotNull(tilesTransform.GetComponent<Rigidbody2D>());
                Assert.AreEqual("floor-01", metadata.BoardId);
                Assert.AreEqual("$.tilemap.tiles", metadata.SourceJsonPath);
                Assert.AreEqual(3, metadata.TileCount);
                Assert.True(metadata.ColliderEnabled);
                Assert.True(metadata.CompositeColliderEnabled);
                Assert.AreEqual(3, metadata.TileRecords.Length);
                Assert.AreEqual("floor-a", metadata.TileRecords[0].TileId);
                Assert.AreEqual("floor", metadata.TileRecords[0].TileType);
                Assert.AreEqual("$.tilemap.tiles[id=floor-a]", metadata.TileRecords[0].SourceJsonPath);
                Assert.AreEqual(new Vector3Int(0, 0, 0), metadata.TileRecords[0].Position);
                Assert.AreEqual("#5C6166FF", metadata.TileRecords[0].ColorHex);
                Assert.True(metadata.TileRecords[0].Walkable);
                Assert.False(metadata.TileRecords[0].BlocksMovement);
                Assert.False(metadata.TileRecords[0].IsSpawn);
                Assert.False(metadata.TileRecords[0].IsExit);
                Assert.False(metadata.TileRecords[0].IsHazard);
                Assert.AreEqual("wall-a", metadata.TileRecords[1].TileId);
                Assert.AreEqual("wall", metadata.TileRecords[1].TileType);
                Assert.False(metadata.TileRecords[1].Walkable);
                Assert.True(metadata.TileRecords[1].BlocksMovement);
                Assert.AreEqual("exit-a", metadata.TileRecords[2].TileId);
                Assert.AreEqual("exit", metadata.TileRecords[2].TileType);
                Assert.True(metadata.TileRecords[2].IsExit);
                Assert.True(metadata.TileRecords[2].Walkable);
                Assert.False(metadata.TileRecords[2].BlocksMovement);
                Assert.True(metadata.TryGetTileRecord("exit-a", out GreyboxLevelTileRecord exitRecord));
                Assert.AreEqual(new Vector3Int(2, 2, 0), exitRecord.Position);
                Assert.True(metadata.TryGetTileRecord(new Vector3Int(1, 2, 0), out GreyboxLevelTileRecord wallRecord));
                Assert.AreEqual("wall-a", wallRecord.TileId);
                Assert.True(metadata.IsWalkable(new Vector3Int(2, 2, 0)));
                Assert.False(metadata.IsWalkable(new Vector3Int(1, 2, 0)));
                Assert.True(metadata.BlocksMovementAt(new Vector3Int(1, 2, 0)));
                CollectionAssert.Contains(metadata.WalkableCells(), new Vector3Int(0, 0, 0));
                CollectionAssert.Contains(metadata.ExitCells(), new Vector3Int(2, 2, 0));
                Assert.AreEqual(0, metadata.HazardCells().Length);
                Assert.AreEqual(3, metadata.TileTextures.Length);
                Assert.AreEqual(3, metadata.TileSprites.Length);
                Assert.AreEqual(new Vector3Int(0, 0, 0), metadata.BoundsOrigin);
                Assert.AreEqual(new Vector3Int(3, 3, 1), metadata.BoundsSize);
                Assert.AreEqual("tiles", marker.Collection);
                Assert.AreEqual("$.tilemap.tiles", marker.JsonPath);

                Assert.NotNull(tilemap.GetTile(new Vector3Int(0, 0, 0)));
                Assert.NotNull((tilemap.GetTile(new Vector3Int(0, 0, 0)) as Tile)?.sprite);
                var wallTile = tilemap.GetTile(new Vector3Int(1, 2, 0)) as Tile;
                Assert.NotNull(wallTile);
                Assert.AreEqual(Tile.ColliderType.Sprite, wallTile.colliderType);
                var exitTile = tilemap.GetTile(new Vector3Int(2, 2, 0)) as Tile;
                Assert.NotNull(exitTile);
                Assert.AreEqual(Tile.ColliderType.None, exitTile.colliderType);
                Assert.AreEqual(tilemap.GetCellCenterWorld(new Vector3Int(2, 2, 0)), metadata.CellCenterWorld(new Vector3Int(2, 2, 0)));
                Assert.AreEqual(3, PrefabBuilder.CollectGeneratedTileAssets(root).Length);
                Assert.AreEqual(3, PrefabBuilder.CollectGeneratedTileTextures(root).Length);
                Assert.AreEqual(3, PrefabBuilder.CollectGeneratedTileSprites(root).Length);
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void LevelBoardDomainSpecificIdsUseStableRoundTripPaths()
        {
            var root = PrefabBuilder.BuildLevelBoard(JObject.Parse(@"{""title"":""Domain Board"",""rooms"":[{""roomId"":""entry"",""name"":""Entry""},{""roomId"":""boss"",""name"":""Boss""}],""encounters"":[{""encounterId"":""ambush"",""name"":""Ambush"",""roomId"":""entry""}],""connections"":[{""connectionId"":""gate"",""fromRoomId"":""entry"",""toRoomId"":""boss"",""name"":""Gate""}],""tilemap"":{""tiles"":[{""tileId"":""spike-row"",""type"":""hazard"",""x"":1,""y"":2}]}}"), "Assets/Greybox/floor.levelboard");
            try
            {
                var entry = root.transform.Find("Rooms/Entry").GetComponent<GreyboxMarker>();
                var encounter = root.transform.Find("Encounters/Ambush").GetComponent<GreyboxMarker>();
                var connection = root.transform.Find("Connections/Gate").GetComponent<GreyboxMarker>();
                var tilemap = root.transform.Find("Tilemap Grid/Tiles").GetComponent<GreyboxLevelTilemap>();

                Assert.AreEqual("entry", entry.MarkerId);
                Assert.AreEqual("$.rooms[roomId=entry]", entry.JsonPath);
                Assert.AreEqual("entry", entry.GetComponent<GreyboxLevelRoom>().RoomId);
                Assert.AreEqual("ambush", encounter.MarkerId);
                Assert.AreEqual("$.encounters[encounterId=ambush]", encounter.JsonPath);
                Assert.AreEqual("ambush", encounter.GetComponent<GreyboxEncounter>().EncounterId);
                Assert.AreEqual("gate", connection.MarkerId);
                Assert.AreEqual("$.connections[connectionId=gate]", connection.JsonPath);
                Assert.AreEqual("gate", connection.GetComponent<GreyboxLevelConnection>().ConnectionId);
                Assert.AreEqual("spike-row", tilemap.TileRecords[0].TileId);
                Assert.AreEqual("$.tilemap.tiles[tileId=spike-row]", tilemap.TileRecords[0].SourceJsonPath);
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void RuntimeCountsOnlyGeneratedLevelBoardNodesAndTiles()
        {
            var root = PrefabBuilder.BuildLevelBoard(JObject.Parse(@"{""id"":""floor-01"",""title"":""Crypt Floor"",""rooms"":[{""id"":""entry""},null,""bad""],""encounters"":[7,{""id"":""ambush""}],""tilemap"":{""tiles"":[{""id"":""floor-a"",""x"":0,""y"":0,""type"":""floor""},""bad"",null]}}"), "Assets/Greybox/floor.levelboard");
            try
            {
                var board = root.GetComponent<GreyboxLevelBoard>();
                Assert.NotNull(board);
                Assert.AreEqual(1, board.RoomCount);
                Assert.AreEqual(1, board.EncounterCount);
                Assert.AreEqual(1, board.TileCount);
                Assert.AreEqual(1, root.transform.Find("Rooms").childCount);
                Assert.AreEqual(1, root.transform.Find("Encounters").childCount);

                var metadata = root.transform.Find("Tilemap Grid/Tiles").GetComponent<GreyboxLevelTilemap>();
                Assert.NotNull(metadata);
                Assert.AreEqual(1, metadata.TileCount);
                Assert.AreEqual(1, metadata.TileRecords.Length);
                Assert.AreEqual("floor-a", metadata.TileRecords[0].TileId);
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void DuplicateLevelBoardConnectionIdsUseUniqueMarkersAndIndexPaths()
        {
            var root = PrefabBuilder.BuildLevelBoard(JObject.Parse(@"{""title"":""Floor"",""rooms"":[{""id"":""entry"",""name"":""Entry Room""},{""id"":""hall"",""name"":""Hall""},{""id"":""boss"",""name"":""Boss Room""}],""connections"":[{""id"":""gate"",""name"":""Gate"",""from"":""entry"",""to"":""hall""},{""id"":""gate"",""name"":""Gate"",""from"":""hall"",""to"":""boss""}]}"), "Assets/Greybox/floor.levelboard");
            try
            {
                var first = root.transform.Find("Connections/Gate").GetComponent<GreyboxMarker>();
                var second = root.transform.Find("Connections/Gate 2").GetComponent<GreyboxMarker>();
                var secondConnection = second.GetComponent<GreyboxLevelConnection>();

                Assert.NotNull(first);
                Assert.NotNull(second);
                Assert.AreEqual("gate", first.MarkerId);
                Assert.AreEqual("gate-2", second.MarkerId);
                Assert.AreEqual("Gate", second.MarkerName);
                Assert.AreEqual("$.connections[0]", first.JsonPath);
                Assert.AreEqual("$.connections[1]", second.JsonPath);
                Assert.AreEqual("gate-2", secondConnection.ConnectionId);
                Assert.AreEqual("hall", secondConnection.FromRoomId);
                Assert.AreEqual("boss", secondConnection.ToRoomId);
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        private static void AssertProperty(GreyboxDesignNode node, string key, GreyboxDesignPropertyKind kind, string value)
        {
            GreyboxDesignProperty property = node.Properties.Find(item => item.Key == key);
            Assert.NotNull(property, $"Missing design property {key}");
            Assert.AreEqual(kind, property.Kind);
            Assert.AreEqual(value, property.Value);
        }

        private static string CreateTempAssetFolder()
        {
            string folder = "GreyboxPrefabBuilderTests-" + System.Guid.NewGuid().ToString("N");
            AssetDatabase.CreateFolder("Assets", folder);
            return $"Assets/{folder}";
        }

        private static GreyboxArtBiblePalette CreatePaletteAsset(string palettePath, string label, string hex, Color color, string materialPath)
        {
            var palette = ScriptableObject.CreateInstance<GreyboxArtBiblePalette>();
            palette.ColorNames.Add(label);
            palette.HexColors.Add(hex);
            palette.Colors.Add(color);
            palette.MetallicValues.Add(0.05f);
            palette.SmoothnessValues.Add(0.55f);
            palette.EmissionEnabled.Add(false);
            palette.EmissionColors.Add(Color.black);
            palette.RenderPipelineHints.Add("builtin");
            palette.MaterialAssetPaths.Add(materialPath ?? "");
            AssetDatabase.CreateAsset(palette, palettePath);
            return palette;
        }
    }
}
