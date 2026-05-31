// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System.Linq;
using Greybox.Editor.Sync;
using Greybox.Runtime;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.UI;

namespace Greybox.Tests.EditMode
{
    public sealed class RoundTripFieldMapperTests
    {
        [Test]
        public void MapsActorInspectorFieldsToStableJsonPaths()
        {
            var go = CreateMarkedNode("$.actors[id=boss]");
            var actor = go.AddComponent<GreyboxActorDefinition>();
            actor.DisplayName = "Gate Boss";
            actor.Behavior = "patrol-aggro";
            actor.AbilityIds = new[] { "slam", "", "dash" };
            actor.PatrolPointIds = new[] { "patrol-a", "patrol-b" };
            actor.LootTableId = "boss-loot";
            actor.Health = 2;
            actor.MoveSpeed = 3.5f;
            actor.JumpImpulse = 12.5f;
            actor.Damage = 4;
            actor.AttackRange = 2.25f;
            actor.PatrolRadius = 3.75f;
            actor.AttackCooldownSeconds = 0.75f;
            actor.AggroRadius = 12f;
            try
            {
                Assert.True(GreyboxRoundTripFieldMapper.TryMap(actor, nameof(GreyboxActorDefinition.DisplayName), out GreyboxRoundTripFieldEdit nameEdit));
                Assert.AreEqual("$.actors[id=boss].name", nameEdit.Path);
                Assert.AreEqual("Gate Boss", nameEdit.Value.Value<string>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(actor, nameof(GreyboxActorDefinition.Health), out GreyboxRoundTripFieldEdit healthEdit));
                Assert.AreEqual("$.actors[id=boss].health", healthEdit.Path);
                Assert.AreEqual(2, healthEdit.Value.Value<int>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(actor, nameof(GreyboxActorDefinition.Behavior), out GreyboxRoundTripFieldEdit behaviorEdit));
                Assert.AreEqual("$.actors[id=boss].behavior", behaviorEdit.Path);
                Assert.AreEqual("patrol-aggro", behaviorEdit.Value.Value<string>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(actor, nameof(GreyboxActorDefinition.LootTableId), out GreyboxRoundTripFieldEdit lootEdit));
                Assert.AreEqual("$.actors[id=boss].lootTable", lootEdit.Path);
                Assert.AreEqual("boss-loot", lootEdit.Value.Value<string>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(actor, nameof(GreyboxActorDefinition.AbilityIds), out GreyboxRoundTripFieldEdit abilityEdit));
                Assert.AreEqual("$.actors[id=boss].abilities", abilityEdit.Path);
                CollectionAssert.AreEqual(new[] { "slam", "dash" }, abilityEdit.Value.Values<string>().ToArray());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(actor, nameof(GreyboxActorDefinition.PatrolPointIds), out GreyboxRoundTripFieldEdit patrolRouteEdit));
                Assert.AreEqual("$.actors[id=boss].patrolRoute", patrolRouteEdit.Path);
                CollectionAssert.AreEqual(new[] { "patrol-a", "patrol-b" }, patrolRouteEdit.Value.Values<string>().ToArray());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(actor, nameof(GreyboxActorDefinition.MoveSpeed), out GreyboxRoundTripFieldEdit speedEdit));
                Assert.AreEqual("$.actors[id=boss].moveSpeed", speedEdit.Path);
                Assert.AreEqual(3.5f, speedEdit.Value.Value<float>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(actor, nameof(GreyboxActorDefinition.JumpImpulse), out GreyboxRoundTripFieldEdit jumpEdit));
                Assert.AreEqual("$.actors[id=boss].jumpImpulse", jumpEdit.Path);
                Assert.AreEqual(12.5f, jumpEdit.Value.Value<float>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(actor, nameof(GreyboxActorDefinition.Damage), out GreyboxRoundTripFieldEdit damageEdit));
                Assert.AreEqual("$.actors[id=boss].damage", damageEdit.Path);
                Assert.AreEqual(4, damageEdit.Value.Value<int>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(actor, nameof(GreyboxActorDefinition.AttackRange), out GreyboxRoundTripFieldEdit rangeEdit));
                Assert.AreEqual("$.actors[id=boss].attackRange", rangeEdit.Path);
                Assert.AreEqual(2.25f, rangeEdit.Value.Value<float>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(actor, nameof(GreyboxActorDefinition.PatrolRadius), out GreyboxRoundTripFieldEdit patrolEdit));
                Assert.AreEqual("$.actors[id=boss].patrolRadius", patrolEdit.Path);
                Assert.AreEqual(3.75f, patrolEdit.Value.Value<float>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(actor, nameof(GreyboxActorDefinition.AttackCooldownSeconds), out GreyboxRoundTripFieldEdit cooldownEdit));
                Assert.AreEqual("$.actors[id=boss].attackCooldownSeconds", cooldownEdit.Path);
                Assert.AreEqual(0.75f, cooldownEdit.Value.Value<float>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(actor, nameof(GreyboxActorDefinition.AggroRadius), out GreyboxRoundTripFieldEdit aggroEdit));
                Assert.AreEqual("$.actors[id=boss].aggroRadius", aggroEdit.Path);
                Assert.AreEqual(12f, aggroEdit.Value.Value<float>());
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void BoundsInspectorStringArrayRoundTripValues()
        {
            var go = CreateMarkedNode("$.actors[id=boss]");
            var actor = go.AddComponent<GreyboxActorDefinition>();
            actor.AbilityIds = Enumerable.Range(0, 70).Select(index => $"ability-{index}").ToArray();
            actor.AbilityIds[1] = "bad\nid";
            actor.AbilityIds[2] = new string('a', 300);
            try
            {
                Assert.True(GreyboxRoundTripFieldMapper.TryMap(actor, nameof(GreyboxActorDefinition.AbilityIds), out GreyboxRoundTripFieldEdit edit));
                Assert.AreEqual("$.actors[id=boss].abilities", edit.Path);
                Assert.AreEqual(64, edit.Value.Count());
                CollectionAssert.DoesNotContain(edit.Value.Values<string>().ToArray(), "bad\nid");
                Assert.AreEqual(256, edit.Value[1].Value<string>().Length);
                Assert.AreEqual("ability-64", edit.Value.Last.Value<string>());
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void MapsCameraColorFieldsToRoundTripColorObjects()
        {
            var go = CreateMarkedNode("$.camera");
            var camera = go.AddComponent<GreyboxCameraRig>();
            camera.JsonPath = "$.camera";
            camera.BackgroundColor = new Color(1f, 0.42f, 0.21f, 0.9f);
            try
            {
                Assert.True(GreyboxRoundTripFieldMapper.TryMap(camera, $"{nameof(GreyboxCameraRig.BackgroundColor)}.r", out GreyboxRoundTripFieldEdit edit));
                Assert.AreEqual("$.camera.backgroundColor", edit.Path);
                Assert.AreEqual(1f, edit.Value["r"].Value<float>());
                Assert.AreEqual(0.42f, edit.Value["g"].Value<float>());
                Assert.AreEqual(0.21f, edit.Value["b"].Value<float>());
                Assert.AreEqual(0.9f, edit.Value["a"].Value<float>());
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void MapsHazardInspectorFieldsToStableJsonPaths()
        {
            var go = CreateMarkedNode("$.hazards[id=spike_row]");
            var hazard = go.AddComponent<GreyboxHazard>();
            hazard.HazardType = "spikes";
            hazard.Effect = "stagger";
            hazard.AffectedTags = new[] { "Player", "", "Companion" };
            hazard.Damage = 2f;
            hazard.TickSeconds = 0.4f;
            hazard.Knockback = 4.5f;
            hazard.IsLethal = true;
            try
            {
                Assert.True(GreyboxRoundTripFieldMapper.TryMap(hazard, nameof(GreyboxHazard.Damage), out GreyboxRoundTripFieldEdit damageEdit));
                Assert.AreEqual("$.hazards[id=spike_row].damage", damageEdit.Path);
                Assert.AreEqual(2f, damageEdit.Value.Value<float>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(hazard, nameof(GreyboxHazard.HazardType), out GreyboxRoundTripFieldEdit typeEdit));
                Assert.AreEqual("$.hazards[id=spike_row].hazardType", typeEdit.Path);
                Assert.AreEqual("spikes", typeEdit.Value.Value<string>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(hazard, nameof(GreyboxHazard.Effect), out GreyboxRoundTripFieldEdit effectEdit));
                Assert.AreEqual("$.hazards[id=spike_row].effect", effectEdit.Path);
                Assert.AreEqual("stagger", effectEdit.Value.Value<string>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(hazard, nameof(GreyboxHazard.AffectedTags), out GreyboxRoundTripFieldEdit affectedTagsEdit));
                Assert.AreEqual("$.hazards[id=spike_row].affectedTags", affectedTagsEdit.Path);
                CollectionAssert.AreEqual(new[] { "Player", "Companion" }, affectedTagsEdit.Value.Values<string>().ToArray());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(hazard, nameof(GreyboxHazard.TickSeconds), out GreyboxRoundTripFieldEdit tickEdit));
                Assert.AreEqual("$.hazards[id=spike_row].tickSeconds", tickEdit.Path);
                Assert.AreEqual(0.4f, tickEdit.Value.Value<float>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(hazard, nameof(GreyboxHazard.Knockback), out GreyboxRoundTripFieldEdit knockbackEdit));
                Assert.AreEqual("$.hazards[id=spike_row].knockback", knockbackEdit.Path);
                Assert.AreEqual(4.5f, knockbackEdit.Value.Value<float>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(hazard, nameof(GreyboxHazard.IsLethal), out GreyboxRoundTripFieldEdit lethalEdit));
                Assert.AreEqual("$.hazards[id=spike_row].lethal", lethalEdit.Path);
                Assert.AreEqual(true, lethalEdit.Value.Value<bool>());
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void MapsObjectiveInspectorFieldsToStableJsonPaths()
        {
            var go = CreateMarkedNode("$.objectives[id=exit_gate]");
            var objective = go.AddComponent<GreyboxObjective>();
            objective.DisplayName = "Exit Gate";
            objective.ObjectiveType = "exit";
            objective.Reward = "unlock-exit";
            objective.TargetIds = new[] { "coin_line", "", "boss" };
            objective.TimeLimitSeconds = 90f;
            objective.RequiredCount = 2;
            objective.IsPrimary = true;
            try
            {
                Assert.True(GreyboxRoundTripFieldMapper.TryMap(objective, nameof(GreyboxObjective.DisplayName), out GreyboxRoundTripFieldEdit nameEdit));
                Assert.AreEqual("$.objectives[id=exit_gate].name", nameEdit.Path);
                Assert.AreEqual("Exit Gate", nameEdit.Value.Value<string>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(objective, nameof(GreyboxObjective.ObjectiveType), out GreyboxRoundTripFieldEdit typeEdit));
                Assert.AreEqual("$.objectives[id=exit_gate].objectiveType", typeEdit.Path);
                Assert.AreEqual("exit", typeEdit.Value.Value<string>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(objective, nameof(GreyboxObjective.Reward), out GreyboxRoundTripFieldEdit rewardEdit));
                Assert.AreEqual("$.objectives[id=exit_gate].reward", rewardEdit.Path);
                Assert.AreEqual("unlock-exit", rewardEdit.Value.Value<string>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(objective, nameof(GreyboxObjective.TargetIds), out GreyboxRoundTripFieldEdit targetEdit));
                Assert.AreEqual("$.objectives[id=exit_gate].targetIds", targetEdit.Path);
                CollectionAssert.AreEqual(new[] { "coin_line", "boss" }, targetEdit.Value.Values<string>().ToArray());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(objective, nameof(GreyboxObjective.TimeLimitSeconds), out GreyboxRoundTripFieldEdit timeEdit));
                Assert.AreEqual("$.objectives[id=exit_gate].timeLimitSeconds", timeEdit.Path);
                Assert.AreEqual(90f, timeEdit.Value.Value<float>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(objective, nameof(GreyboxObjective.RequiredCount), out GreyboxRoundTripFieldEdit countEdit));
                Assert.AreEqual("$.objectives[id=exit_gate].requiredCount", countEdit.Path);
                Assert.AreEqual(2, countEdit.Value.Value<int>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(objective, nameof(GreyboxObjective.IsPrimary), out GreyboxRoundTripFieldEdit primaryEdit));
                Assert.AreEqual("$.objectives[id=exit_gate].isPrimary", primaryEdit.Path);
                Assert.AreEqual(true, primaryEdit.Value.Value<bool>());
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void MapsSpawnInspectorFieldsToStableJsonPaths()
        {
            var go = CreateMarkedNode("$.spawnPoints[id=spawn_checkpoint]");
            var spawn = go.AddComponent<GreyboxSpawnPoint>();
            spawn.DisplayName = "Checkpoint Spawn";
            spawn.SpawnGroup = "mid-run";
            spawn.ActorIds = new[] { "player_runner", "", "assistant" };
            spawn.MaxCount = 2;
            spawn.CooldownSeconds = 0.75f;
            spawn.SpawnOnStart = false;
            spawn.SpawnRadius = 0.5f;
            spawn.IsCheckpoint = true;
            try
            {
                Assert.True(GreyboxRoundTripFieldMapper.TryMap(spawn, nameof(GreyboxSpawnPoint.DisplayName), out GreyboxRoundTripFieldEdit nameEdit));
                Assert.AreEqual("$.spawnPoints[id=spawn_checkpoint].name", nameEdit.Path);
                Assert.AreEqual("Checkpoint Spawn", nameEdit.Value.Value<string>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(spawn, nameof(GreyboxSpawnPoint.SpawnGroup), out GreyboxRoundTripFieldEdit groupEdit));
                Assert.AreEqual("$.spawnPoints[id=spawn_checkpoint].spawnGroup", groupEdit.Path);
                Assert.AreEqual("mid-run", groupEdit.Value.Value<string>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(spawn, nameof(GreyboxSpawnPoint.ActorIds), out GreyboxRoundTripFieldEdit actorIdsEdit));
                Assert.AreEqual("$.spawnPoints[id=spawn_checkpoint].actorIds", actorIdsEdit.Path);
                CollectionAssert.AreEqual(new[] { "player_runner", "assistant" }, actorIdsEdit.Value.Values<string>().ToArray());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(spawn, nameof(GreyboxSpawnPoint.MaxCount), out GreyboxRoundTripFieldEdit maxEdit));
                Assert.AreEqual("$.spawnPoints[id=spawn_checkpoint].maxCount", maxEdit.Path);
                Assert.AreEqual(2, maxEdit.Value.Value<int>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(spawn, nameof(GreyboxSpawnPoint.CooldownSeconds), out GreyboxRoundTripFieldEdit cooldownEdit));
                Assert.AreEqual("$.spawnPoints[id=spawn_checkpoint].cooldownSeconds", cooldownEdit.Path);
                Assert.AreEqual(0.75f, cooldownEdit.Value.Value<float>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(spawn, nameof(GreyboxSpawnPoint.SpawnOnStart), out GreyboxRoundTripFieldEdit startEdit));
                Assert.AreEqual("$.spawnPoints[id=spawn_checkpoint].spawnOnStart", startEdit.Path);
                Assert.AreEqual(false, startEdit.Value.Value<bool>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(spawn, nameof(GreyboxSpawnPoint.SpawnRadius), out GreyboxRoundTripFieldEdit radiusEdit));
                Assert.AreEqual("$.spawnPoints[id=spawn_checkpoint].spawnRadius", radiusEdit.Path);
                Assert.AreEqual(0.5f, radiusEdit.Value.Value<float>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(spawn, nameof(GreyboxSpawnPoint.IsCheckpoint), out GreyboxRoundTripFieldEdit checkpointEdit));
                Assert.AreEqual("$.spawnPoints[id=spawn_checkpoint].isCheckpoint", checkpointEdit.Path);
                Assert.AreEqual(true, checkpointEdit.Value.Value<bool>());
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void MapsLevelRoomSizeFieldsToRoundTripVectorObjects()
        {
            var go = CreateMarkedNode("$.rooms[id=entry]");
            var room = go.AddComponent<GreyboxLevelRoom>();
            room.Size = new Vector3(4f, 1f, 5f);
            room.ConnectedRoomIds = new[] { "hall", "", "boss" };
            try
            {
                Assert.True(GreyboxRoundTripFieldMapper.TryMap(room, nameof(GreyboxLevelRoom.Size), out GreyboxRoundTripFieldEdit edit));
                Assert.AreEqual("$.rooms[id=entry].size", edit.Path);
                Assert.AreEqual(4f, edit.Value["x"].Value<float>());
                Assert.AreEqual(1f, edit.Value["y"].Value<float>());
                Assert.AreEqual(5f, edit.Value["z"].Value<float>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(room, nameof(GreyboxLevelRoom.ConnectedRoomIds), out GreyboxRoundTripFieldEdit connectedEdit));
                Assert.AreEqual("$.rooms[id=entry].connectedRoomIds", connectedEdit.Path);
                CollectionAssert.AreEqual(new[] { "hall", "boss" }, connectedEdit.Value.Values<string>().ToArray());
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void MapsLevelConnectionFieldsToConnectionJsonPaths()
        {
            var go = CreateMarkedNode("$.connections[id=gate]");
            var connection = go.AddComponent<GreyboxLevelConnection>();
            connection.FromRoomId = "entry";
            connection.ToRoomId = "boss";
            connection.ConnectionType = "locked-door";
            connection.Locked = true;
            connection.TravelCost = 2f;
            try
            {
                Assert.True(GreyboxRoundTripFieldMapper.TryMap(connection, nameof(GreyboxLevelConnection.FromRoomId), out GreyboxRoundTripFieldEdit fromEdit));
                Assert.AreEqual("$.connections[id=gate].fromRoomId", fromEdit.Path);
                Assert.AreEqual("entry", fromEdit.Value.Value<string>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(connection, nameof(GreyboxLevelConnection.ToRoomId), out GreyboxRoundTripFieldEdit toEdit));
                Assert.AreEqual("$.connections[id=gate].toRoomId", toEdit.Path);
                Assert.AreEqual("boss", toEdit.Value.Value<string>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(connection, nameof(GreyboxLevelConnection.ConnectionType), out GreyboxRoundTripFieldEdit typeEdit));
                Assert.AreEqual("$.connections[id=gate].type", typeEdit.Path);
                Assert.AreEqual("locked-door", typeEdit.Value.Value<string>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(connection, nameof(GreyboxLevelConnection.Locked), out GreyboxRoundTripFieldEdit lockedEdit));
                Assert.AreEqual("$.connections[id=gate].locked", lockedEdit.Path);
                Assert.True(lockedEdit.Value.Value<bool>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(connection, nameof(GreyboxLevelConnection.TravelCost), out GreyboxRoundTripFieldEdit costEdit));
                Assert.AreEqual("$.connections[id=gate].travelCost", costEdit.Path);
                Assert.AreEqual(2f, costEdit.Value.Value<float>());
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void MapsTileRecordInspectorFieldsToStableJsonPaths()
        {
            var go = CreateMarkedNode("$.tilemap.tiles");
            var marker = go.GetComponent<GreyboxMarker>();
            marker.Collection = "tiles";
            var metadata = go.AddComponent<GreyboxLevelTilemap>();
            metadata.TileRecords = new[]
            {
                new GreyboxLevelTileRecord
                {
                    TileId = "hazard-tile",
                    TileType = "hazard",
                    SourceJsonPath = "$.tilemap.tiles[tileId=hazard-tile]",
                    Position = new Vector3Int(3, 4, 0),
                    ColorHex = "#E94B3CFF",
                    Walkable = true,
                    BlocksMovement = false,
                    IsHazard = true
                },
                new GreyboxLevelTileRecord
                {
                    TileId = "unsafe tile",
                    TileType = "floor",
                    Position = new Vector3Int(5, 6, 0),
                    ColorHex = "#5C6166FF",
                    Walkable = true
                }
            };

            try
            {
                Assert.True(GreyboxRoundTripFieldMapper.TryMap(metadata, "TileRecords.Array.data[0].TileType", out GreyboxRoundTripFieldEdit typeEdit));
                Assert.AreEqual("$.tilemap.tiles[tileId=hazard-tile].type", typeEdit.Path);
                Assert.AreEqual("hazard", typeEdit.Value.Value<string>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(metadata, "TileRecords.Array.data[0].ColorHex", out GreyboxRoundTripFieldEdit colorEdit));
                Assert.AreEqual("$.tilemap.tiles[tileId=hazard-tile].colorHex", colorEdit.Path);
                Assert.AreEqual("#E94B3CFF", colorEdit.Value.Value<string>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(metadata, "TileRecords.Array.data[0].Walkable", out GreyboxRoundTripFieldEdit walkableEdit));
                Assert.AreEqual("$.tilemap.tiles[tileId=hazard-tile].walkable", walkableEdit.Path);
                Assert.True(walkableEdit.Value.Value<bool>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(metadata, "TileRecords.Array.data[0].IsHazard", out GreyboxRoundTripFieldEdit hazardEdit));
                Assert.AreEqual("$.tilemap.tiles[tileId=hazard-tile].isHazard", hazardEdit.Path);
                Assert.True(hazardEdit.Value.Value<bool>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(metadata, "TileRecords.Array.data[0].Position.x", out GreyboxRoundTripFieldEdit positionEdit));
                Assert.AreEqual("$.tilemap.tiles[tileId=hazard-tile].position", positionEdit.Path);
                Assert.AreEqual(3, positionEdit.Value["x"].Value<int>());
                Assert.AreEqual(4, positionEdit.Value["y"].Value<int>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(metadata, "TileRecords.Array.data[1].TileType", out GreyboxRoundTripFieldEdit unsafeEdit));
                Assert.AreEqual("$.tilemap.tiles[1].type", unsafeEdit.Path);
                Assert.AreEqual("floor", unsafeEdit.Value.Value<string>());
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void MapsPlatformerCheckpointFieldsToPlayableJsonPaths()
        {
            var go = CreateMarkedNode("$.checkpoints[checkpointId=midpoint]");
            var checkpoint = go.AddComponent<GreyboxPlatformerSampleCheckpoint>();
            checkpoint.DisplayName = "Midpoint Beacon";
            checkpoint.SpawnId = "spawn-midpoint";
            checkpoint.SpawnGroup = "runner";
            checkpoint.ActorIds = new[] { "player_runner", "", "companion" };
            checkpoint.MaxActivations = 2;
            checkpoint.CooldownSeconds = 0.75f;
            checkpoint.SpawnOnStart = false;
            checkpoint.RespawnPoint = new Vector3(8f, 2f, 0f);
            try
            {
                Assert.True(GreyboxRoundTripFieldMapper.TryMap(checkpoint, nameof(GreyboxPlatformerSampleCheckpoint.DisplayName), out GreyboxRoundTripFieldEdit nameEdit));
                Assert.AreEqual("$.checkpoints[checkpointId=midpoint].name", nameEdit.Path);
                Assert.AreEqual("Midpoint Beacon", nameEdit.Value.Value<string>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(checkpoint, nameof(GreyboxPlatformerSampleCheckpoint.SpawnId), out GreyboxRoundTripFieldEdit spawnEdit));
                Assert.AreEqual("$.checkpoints[checkpointId=midpoint].spawnId", spawnEdit.Path);
                Assert.AreEqual("spawn-midpoint", spawnEdit.Value.Value<string>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(checkpoint, nameof(GreyboxPlatformerSampleCheckpoint.ActorIds), out GreyboxRoundTripFieldEdit actorsEdit));
                Assert.AreEqual("$.checkpoints[checkpointId=midpoint].actorIds", actorsEdit.Path);
                CollectionAssert.AreEqual(new[] { "player_runner", "companion" }, actorsEdit.Value.Values<string>().ToArray());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(checkpoint, nameof(GreyboxPlatformerSampleCheckpoint.MaxActivations), out GreyboxRoundTripFieldEdit maxEdit));
                Assert.AreEqual("$.checkpoints[checkpointId=midpoint].maxActivations", maxEdit.Path);
                Assert.AreEqual(2, maxEdit.Value.Value<int>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(checkpoint, nameof(GreyboxPlatformerSampleCheckpoint.CooldownSeconds), out GreyboxRoundTripFieldEdit cooldownEdit));
                Assert.AreEqual("$.checkpoints[checkpointId=midpoint].cooldownSeconds", cooldownEdit.Path);
                Assert.AreEqual(0.75f, cooldownEdit.Value.Value<float>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(checkpoint, nameof(GreyboxPlatformerSampleCheckpoint.SpawnOnStart), out GreyboxRoundTripFieldEdit startEdit));
                Assert.AreEqual("$.checkpoints[checkpointId=midpoint].spawnOnStart", startEdit.Path);
                Assert.False(startEdit.Value.Value<bool>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(checkpoint, nameof(GreyboxPlatformerSampleCheckpoint.RespawnPoint), out GreyboxRoundTripFieldEdit respawnEdit));
                Assert.AreEqual("$.checkpoints[checkpointId=midpoint].respawnPoint", respawnEdit.Path);
                Assert.AreEqual(8f, respawnEdit.Value["x"].Value<float>());
                Assert.AreEqual(2f, respawnEdit.Value["y"].Value<float>());
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void MapsPlatformerGoalFieldsToPlayableJsonPaths()
        {
            var go = CreateMarkedNode("$.goals[goalId=exit]");
            var goal = go.AddComponent<GreyboxPlatformerSampleGoal>();
            goal.DisplayName = "Exit Gate";
            goal.ObjectiveType = "exit";
            goal.TargetIds = new[] { "boss", "", "coin_line" };
            goal.Reward = "open-exit";
            goal.TimeLimitSeconds = 30f;
            goal.RequiredCount = 2;
            goal.RequiredCoins = 3;
            goal.IsPrimary = true;
            try
            {
                Assert.True(GreyboxRoundTripFieldMapper.TryMap(goal, nameof(GreyboxPlatformerSampleGoal.DisplayName), out GreyboxRoundTripFieldEdit nameEdit));
                Assert.AreEqual("$.goals[goalId=exit].name", nameEdit.Path);
                Assert.AreEqual("Exit Gate", nameEdit.Value.Value<string>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(goal, nameof(GreyboxPlatformerSampleGoal.TargetIds), out GreyboxRoundTripFieldEdit targetsEdit));
                Assert.AreEqual("$.goals[goalId=exit].targetIds", targetsEdit.Path);
                CollectionAssert.AreEqual(new[] { "boss", "coin_line" }, targetsEdit.Value.Values<string>().ToArray());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(goal, nameof(GreyboxPlatformerSampleGoal.Reward), out GreyboxRoundTripFieldEdit rewardEdit));
                Assert.AreEqual("$.goals[goalId=exit].reward", rewardEdit.Path);
                Assert.AreEqual("open-exit", rewardEdit.Value.Value<string>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(goal, nameof(GreyboxPlatformerSampleGoal.TimeLimitSeconds), out GreyboxRoundTripFieldEdit timeEdit));
                Assert.AreEqual("$.goals[goalId=exit].timeLimitSeconds", timeEdit.Path);
                Assert.AreEqual(30f, timeEdit.Value.Value<float>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(goal, nameof(GreyboxPlatformerSampleGoal.RequiredCount), out GreyboxRoundTripFieldEdit countEdit));
                Assert.AreEqual("$.goals[goalId=exit].requiredCount", countEdit.Path);
                Assert.AreEqual(2, countEdit.Value.Value<int>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(goal, nameof(GreyboxPlatformerSampleGoal.RequiredCoins), out GreyboxRoundTripFieldEdit coinsEdit));
                Assert.AreEqual("$.goals[goalId=exit].requiredCoins", coinsEdit.Path);
                Assert.AreEqual(3, coinsEdit.Value.Value<int>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(goal, nameof(GreyboxPlatformerSampleGoal.IsPrimary), out GreyboxRoundTripFieldEdit primaryEdit));
                Assert.AreEqual("$.goals[goalId=exit].isPrimary", primaryEdit.Path);
                Assert.True(primaryEdit.Value.Value<bool>());
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void MapsPlatformerCollectibleFieldsToPlayableJsonPaths()
        {
            var go = CreateMarkedNode("$.coins[coinId=coin-01]");
            var coin = go.AddComponent<GreyboxPlatformerSampleCollectible>();
            coin.DisplayName = "Coin 01";
            coin.SourceObjectiveId = "coin_line";
            coin.SourceObjectiveDisplayName = "Readable Coin Line";
            coin.SourceObjectiveType = "collectible";
            try
            {
                Assert.True(GreyboxRoundTripFieldMapper.TryMap(coin, nameof(GreyboxPlatformerSampleCollectible.DisplayName), out GreyboxRoundTripFieldEdit nameEdit));
                Assert.AreEqual("$.coins[coinId=coin-01].name", nameEdit.Path);
                Assert.AreEqual("Coin 01", nameEdit.Value.Value<string>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(coin, nameof(GreyboxPlatformerSampleCollectible.SourceObjectiveId), out GreyboxRoundTripFieldEdit objectiveEdit));
                Assert.AreEqual("$.coins[coinId=coin-01].sourceObjectiveId", objectiveEdit.Path);
                Assert.AreEqual("coin_line", objectiveEdit.Value.Value<string>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(coin, nameof(GreyboxPlatformerSampleCollectible.SourceObjectiveDisplayName), out GreyboxRoundTripFieldEdit displayEdit));
                Assert.AreEqual("$.coins[coinId=coin-01].sourceObjectiveDisplayName", displayEdit.Path);
                Assert.AreEqual("Readable Coin Line", displayEdit.Value.Value<string>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(coin, nameof(GreyboxPlatformerSampleCollectible.SourceObjectiveType), out GreyboxRoundTripFieldEdit typeEdit));
                Assert.AreEqual("$.coins[coinId=coin-01].sourceObjectiveType", typeEdit.Path);
                Assert.AreEqual("collectible", typeEdit.Value.Value<string>());
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void MapsTransformLocalPositionToMarkerPositionPath()
        {
            var go = CreateMarkedNode("$.actors[id=boss]");
            var marker = go.GetComponent<GreyboxMarker>();
            marker.PositionJsonPath = "$.actors[id=boss].position";
            go.transform.localPosition = new Vector3(4f, 1f, 6f);
            try
            {
                Assert.True(GreyboxRoundTripFieldMapper.TryMap(go.transform, nameof(Transform.localPosition), out GreyboxRoundTripFieldEdit edit));
                Assert.AreEqual("$.actors[id=boss].position", edit.Path);
                Assert.AreEqual(4f, edit.Value["x"].Value<float>());
                Assert.AreEqual(1f, edit.Value["y"].Value<float>());
                Assert.AreEqual(6f, edit.Value["z"].Value<float>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(go.transform, "m_LocalPosition.x", out GreyboxRoundTripFieldEdit serializedEdit));
                Assert.AreEqual("$.actors[id=boss].position", serializedEdit.Path);
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void MapsTransformLocalScaleToNodeScalePath()
        {
            var go = CreateMarkedNode("$.actors[id=boss]");
            var marker = go.GetComponent<GreyboxMarker>();
            marker.Collection = "actors";
            go.transform.localScale = new Vector3(2f, 3f, 4f);
            try
            {
                Assert.True(GreyboxRoundTripFieldMapper.TryMap(go.transform, nameof(Transform.localScale), out GreyboxRoundTripFieldEdit edit));
                Assert.AreEqual("$.actors[id=boss].scale", edit.Path);
                Assert.AreEqual(2f, edit.Value["x"].Value<float>());
                Assert.AreEqual(3f, edit.Value["y"].Value<float>());
                Assert.AreEqual(4f, edit.Value["z"].Value<float>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(go.transform, "m_LocalScale.y", out GreyboxRoundTripFieldEdit serializedEdit));
                Assert.AreEqual("$.actors[id=boss].scale", serializedEdit.Path);
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void MapsRoomTransformLocalScaleToRoomSizePath()
        {
            var go = CreateMarkedNode("$.rooms[id=entry]");
            var marker = go.GetComponent<GreyboxMarker>();
            marker.Collection = "rooms";
            go.transform.localScale = new Vector3(5f, 1f, 6f);
            try
            {
                Assert.True(GreyboxRoundTripFieldMapper.TryMap(go.transform, nameof(Transform.localScale), out GreyboxRoundTripFieldEdit edit));
                Assert.AreEqual("$.rooms[id=entry].size", edit.Path);
                Assert.AreEqual(5f, edit.Value["x"].Value<float>());
                Assert.AreEqual(1f, edit.Value["y"].Value<float>());
                Assert.AreEqual(6f, edit.Value["z"].Value<float>());
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void MapsTransformLocalEulerAnglesToNodeRotationPath()
        {
            var go = CreateMarkedNode("$.actors[id=boss]");
            go.transform.localEulerAngles = new Vector3(10f, 90f, 5f);
            try
            {
                Assert.True(GreyboxRoundTripFieldMapper.TryMap(go.transform, nameof(Transform.localEulerAngles), out GreyboxRoundTripFieldEdit edit));
                Assert.AreEqual("$.actors[id=boss].rotation", edit.Path);
                Assert.AreEqual(10f, edit.Value["x"].Value<float>());
                Assert.AreEqual(90f, edit.Value["y"].Value<float>());
                Assert.AreEqual(5f, edit.Value["z"].Value<float>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(go.transform, "m_LocalRotation.y", out GreyboxRoundTripFieldEdit serializedEdit));
                Assert.AreEqual("$.actors[id=boss].rotation", serializedEdit.Path);
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void MapsGameObjectMetadataToUnityJsonFields()
        {
            int layer = LayerMask.NameToLayer("Ignore Raycast");
            var go = CreateMarkedNode("$.actors[id=boss]");
            go.tag = "Player";
            go.layer = layer;
            go.isStatic = true;
            try
            {
                Assert.True(GreyboxRoundTripFieldMapper.TryMap(go, "m_TagString", out GreyboxRoundTripFieldEdit tagEdit));
                Assert.AreEqual("$.actors[id=boss].unityTag", tagEdit.Path);
                Assert.AreEqual("Player", tagEdit.Value.Value<string>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(go, "m_Layer", out GreyboxRoundTripFieldEdit layerEdit));
                Assert.AreEqual("$.actors[id=boss].unityLayer", layerEdit.Path);
                Assert.AreEqual(layer, layerEdit.Value.Value<int>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(go, "m_StaticEditorFlags", out GreyboxRoundTripFieldEdit staticEdit));
                Assert.AreEqual("$.actors[id=boss].unityStatic", staticEdit.Path);
                Assert.True(staticEdit.Value.Value<bool>());

                go.SetActive(false);
                Assert.True(GreyboxRoundTripFieldMapper.TryMap(go, "m_IsActive", out GreyboxRoundTripFieldEdit activeEdit));
                Assert.AreEqual("$.actors[id=boss].unityActive", activeEdit.Path);
                Assert.False(activeEdit.Value.Value<bool>());
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void MapsHudBindingInspectorFieldsToStableHudJsonPaths()
        {
            var go = CreateMarkedNode("xpath://hud-value");
            var binding = go.AddComponent<GreyboxHudBinding>();
            binding.SlotId = "hud-hearts";
            binding.BindingId = "value";
            binding.Role = "value";
            binding.Text = "3";
            binding.RoundTripJsonPath = "$.hud.slots[id=hud-hearts].bindings[id=value]";
            try
            {
                Assert.True(GreyboxRoundTripFieldMapper.TryMap(binding, nameof(GreyboxHudBinding.Text), out GreyboxRoundTripFieldEdit textEdit));
                Assert.AreEqual("$.hud.slots[id=hud-hearts].bindings[id=value].text", textEdit.Path);
                Assert.AreEqual("3", textEdit.Value.Value<string>());

                binding.IsProgress = true;
                binding.ProgressValue = 0.75f;
                Assert.True(GreyboxRoundTripFieldMapper.TryMap(binding, nameof(GreyboxHudBinding.ProgressValue), out GreyboxRoundTripFieldEdit progressEdit));
                Assert.AreEqual("$.hud.slots[id=hud-hearts].bindings[id=value].value", progressEdit.Path);
                Assert.AreEqual(0.75f, progressEdit.Value.Value<float>());
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void MapsLegacyHudBindingInspectorFieldsFromSlotAndBindingIds()
        {
            var go = CreateMarkedNode("xpath://hud-value");
            var binding = go.AddComponent<GreyboxHudBinding>();
            binding.SlotId = "hud-loot";
            binding.BindingId = "value";
            binding.Role = "value";
            binding.Text = "1";
            try
            {
                Assert.True(GreyboxRoundTripFieldMapper.TryMap(binding, nameof(GreyboxHudBinding.Text), out GreyboxRoundTripFieldEdit edit));
                Assert.AreEqual("$.hud.slots[id=hud-loot].bindings[id=value].text", edit.Path);
                Assert.AreEqual("1", edit.Value.Value<string>());
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void MapsUguiHudControlsToBindingRoundTripPaths()
        {
            var textObject = CreateMarkedNode("xpath://hud-value");
            var textBinding = textObject.AddComponent<GreyboxHudBinding>();
            textBinding.SlotId = "hud-coins";
            textBinding.BindingId = "value";
            textBinding.Role = "value";
            textBinding.RoundTripJsonPath = "$.hud.slots[id=hud-coins].bindings[id=value]";
            var text = textObject.AddComponent<Text>();
            text.text = "12 / 24";

            var sliderObject = CreateMarkedNode("xpath://hud-health");
            var sliderBinding = sliderObject.AddComponent<GreyboxHudBinding>();
            sliderBinding.SlotId = "hud-hearts";
            sliderBinding.BindingId = "health";
            sliderBinding.Role = "progress";
            sliderBinding.IsProgress = true;
            sliderBinding.RoundTripJsonPath = "$.hud.slots[id=hud-hearts].bindings[id=health]";
            var slider = sliderObject.AddComponent<Slider>();
            slider.minValue = 0f;
            slider.maxValue = 3f;
            slider.value = 2f;
            try
            {
                Assert.True(GreyboxRoundTripFieldMapper.TryMap(text, "m_Text", out GreyboxRoundTripFieldEdit textEdit));
                Assert.AreEqual("$.hud.slots[id=hud-coins].bindings[id=value].text", textEdit.Path);
                Assert.AreEqual("12 / 24", textEdit.Value.Value<string>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(slider, "m_Value", out GreyboxRoundTripFieldEdit valueEdit));
                Assert.AreEqual("$.hud.slots[id=hud-hearts].bindings[id=health].value", valueEdit.Path);
                Assert.AreEqual(2f, valueEdit.Value.Value<float>());

                Assert.True(GreyboxRoundTripFieldMapper.TryMap(slider, "m_MaxValue", out GreyboxRoundTripFieldEdit maxEdit));
                Assert.AreEqual("$.hud.slots[id=hud-hearts].bindings[id=health].max", maxEdit.Path);
                Assert.AreEqual(3f, maxEdit.Value.Value<float>());
            }
            finally
            {
                Object.DestroyImmediate(textObject);
                Object.DestroyImmediate(sliderObject);
            }
        }

        [Test]
        public void IgnoresUnsupportedFields()
        {
            var go = CreateMarkedNode("$.actors[id=boss]");
            var actor = go.AddComponent<GreyboxActorDefinition>();
            try
            {
                Assert.False(GreyboxRoundTripFieldMapper.TryMap(actor, nameof(GreyboxActorDefinition.ActorId), out _));
                Assert.False(GreyboxRoundTripFieldMapper.TryMap(go.transform, nameof(Transform.forward), out _));
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void IgnoresUserAddedChildTransformUnderMarkedNode()
        {
            var parent = CreateMarkedNode("$.actors[id=boss]");
            var child = new GameObject("Designer Offset Note");
            child.transform.SetParent(parent.transform, false);
            child.transform.localScale = new Vector3(2f, 2f, 2f);
            try
            {
                Assert.False(GreyboxRoundTripFieldMapper.TryMap(child.transform, "m_LocalScale.x", out _));
                Assert.False(GreyboxRoundTripFieldMapper.TryMap(child.transform, "m_LocalRotation.y", out _));
            }
            finally
            {
                Object.DestroyImmediate(parent);
            }
        }

        [Test]
        public void IgnoresUserAddedChildRuntimeComponentUnderMarkedNode()
        {
            var parent = CreateMarkedNode("$.actors[id=boss]");
            var child = new GameObject("Designer Damage Note");
            child.transform.SetParent(parent.transform, false);
            var actor = child.AddComponent<GreyboxActorDefinition>();
            actor.Health = 99;
            try
            {
                Assert.False(GreyboxRoundTripFieldMapper.TryMap(actor, nameof(GreyboxActorDefinition.Health), out _));
            }
            finally
            {
                Object.DestroyImmediate(parent);
            }
        }

        [Test]
        public void MapsGeneratedChildAssetReferencesThroughParentMarker()
        {
            var parent = CreateMarkedNode("$.actors[id=boss]");
            var child = new GameObject("Greybox Mesh");
            child.transform.SetParent(parent.transform, false);
            var renderer = child.AddComponent<MeshRenderer>();
            child.AddComponent<GreyboxGeneratedComponents>().Record(renderer);
            try
            {
                Assert.True(GreyboxRoundTripFieldMapper.TryMapAsset(renderer, nameof(Renderer.sharedMaterial), "Assets/Greybox/Materials/Boss.mat", out GreyboxRoundTripFieldEdit edit));
                Assert.AreEqual("$.actors[id=boss].materialAssetPath", edit.Path);
                Assert.AreEqual("Assets/Greybox/Materials/Boss.mat", edit.Value.Value<string>());
            }
            finally
            {
                Object.DestroyImmediate(parent);
            }
        }

        [Test]
        public void RejectsUserAddedChildAssetReferencesUnderMarkedNode()
        {
            var parent = CreateMarkedNode("$.actors[id=boss]");
            var child = new GameObject("Designer Mesh Override");
            child.transform.SetParent(parent.transform, false);
            var renderer = child.AddComponent<MeshRenderer>();
            try
            {
                Assert.False(GreyboxRoundTripFieldMapper.TryMapAsset(renderer, nameof(Renderer.sharedMaterial), "Assets/Greybox/Materials/Boss.mat", out _));
            }
            finally
            {
                Object.DestroyImmediate(parent);
            }
        }

        private static GameObject CreateMarkedNode(string jsonPath)
        {
            var go = new GameObject("Greybox Node");
            var marker = go.AddComponent<GreyboxMarker>();
            marker.SourceFileName = "levels/arena.gameview.json";
            marker.JsonPath = jsonPath;
            return go;
        }
    }
}
