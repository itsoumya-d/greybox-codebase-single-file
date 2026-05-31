// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using Greybox.Editor.Sync;
using Newtonsoft.Json.Linq;
using NUnit.Framework;

namespace Greybox.Tests.EditMode
{
    public sealed class DiffApplierTests
    {
        [Test]
        public void UnityOnlyEditWinsWithoutConflict()
        {
            var result = DiffApplier.ThreeWayMerge(
                JObject.Parse(@"{""health"":1}"),
                JObject.Parse(@"{""health"":1}"),
                JObject.Parse(@"{""health"":2}")
            );
            Assert.False(result.HasConflicts);
            Assert.AreEqual(2, result.Merged["health"].Value<int>());
        }

        [Test]
        public void UnityTypedFieldsMergeWithoutConflict()
        {
            var result = DiffApplier.ThreeWayMerge(
                JObject.Parse(@"{""actor"":{""health"":1,""speed"":1.5,""displayName"":""Old Boss"",""tint"":{""r"":1,""g"":0.1,""b"":0.1,""a"":1},""position"":{""x"":1,""y"":2,""z"":3}}}"),
                JObject.Parse(@"{""actor"":{""health"":1,""speed"":1.5,""displayName"":""Old Boss"",""tint"":{""r"":1,""g"":0.1,""b"":0.1,""a"":1},""position"":{""x"":1,""y"":2,""z"":3}}}"),
                JObject.Parse(@"{""actor"":{""health"":2,""speed"":2.25,""displayName"":""Arena Boss"",""tint"":{""r"":0.25,""g"":0.5,""b"":1,""a"":1},""position"":{""x"":4,""y"":5,""z"":6}}}")
            );

            var actor = result.Merged["actor"];
            Assert.False(result.HasConflicts);
            Assert.AreEqual(2, actor["health"].Value<int>());
            Assert.AreEqual(2.25f, actor["speed"].Value<float>());
            Assert.AreEqual("Arena Boss", actor["displayName"].Value<string>());
            Assert.AreEqual(0.25f, actor["tint"]["r"].Value<float>());
            Assert.AreEqual(4f, actor["position"]["x"].Value<float>());
        }

        [Test]
        public void IndependentStableIdArrayEditsMergeWithoutConflict()
        {
            var result = DiffApplier.ThreeWayMerge(
                JObject.Parse(@"{""actors"":[{""id"":""boss"",""health"":1,""displayName"":""Old Boss"",""position"":{""x"":1,""y"":2,""z"":3}},{""id"":""minion"",""health"":1,""displayName"":""Minion"",""position"":{""x"":8,""y"":2,""z"":0}}]}"),
                JObject.Parse(@"{""actors"":[{""id"":""boss"",""health"":1,""displayName"":""Readable Boss"",""position"":{""x"":1,""y"":2,""z"":3}},{""id"":""minion"",""health"":1,""displayName"":""Minion"",""position"":{""x"":8,""y"":2,""z"":0}}]}"),
                JObject.Parse(@"{""actors"":[{""id"":""boss"",""health"":1,""displayName"":""Old Boss"",""position"":{""x"":1,""y"":2,""z"":3}},{""id"":""minion"",""health"":1,""displayName"":""Minion"",""position"":{""x"":9,""y"":3,""z"":0}}]}")
            );

            var actors = (JArray)result.Merged["actors"];
            Assert.False(result.HasConflicts);
            Assert.AreEqual("Readable Boss", actors[0]["displayName"].Value<string>());
            Assert.AreEqual(9f, actors[1]["position"]["x"].Value<float>());
        }

        [Test]
        public void GameDomainStableKeyArrayEditsMergeWithoutConflict()
        {
            var result = DiffApplier.ThreeWayMerge(
                JObject.Parse(@"{""rooms"":[{""roomId"":""start"",""difficulty"":1,""position"":{""x"":0,""y"":0,""z"":0}},{""roomId"":""boss"",""difficulty"":3,""position"":{""x"":10,""y"":0,""z"":0}}]}"),
                JObject.Parse(@"{""rooms"":[{""roomId"":""start"",""difficulty"":1,""position"":{""x"":0,""y"":0,""z"":0}},{""roomId"":""boss"",""difficulty"":4,""position"":{""x"":10,""y"":0,""z"":0}}]}"),
                JObject.Parse(@"{""rooms"":[{""roomId"":""start"",""difficulty"":1,""position"":{""x"":1,""y"":0,""z"":0}},{""roomId"":""boss"",""difficulty"":3,""position"":{""x"":10,""y"":0,""z"":0}}]}")
            );

            var rooms = (JArray)result.Merged["rooms"];
            Assert.False(result.HasConflicts);
            Assert.AreEqual(1f, rooms[0]["position"]["x"].Value<float>());
            Assert.AreEqual(4, rooms[1]["difficulty"].Value<int>());
        }

        [Test]
        public void PlayableDomainStableKeyArrayEditsMergeWithoutConflict()
        {
            var result = DiffApplier.ThreeWayMerge(
                JObject.Parse(@"{""checkpoints"":[{""checkpointId"":""flag-a"",""cooldownSeconds"":2,""position"":{""x"":8,""y"":1,""z"":0}}],""goals"":[{""goalId"":""exit"",""requiredCount"":3}],""coins"":[{""coinId"":""coin-01"",""value"":1}],""tilemap"":{""tiles"":[{""tileId"":""spike-row"",""type"":""hazard"",""position"":{""x"":12,""y"":0,""z"":0}}]}}"),
                JObject.Parse(@"{""checkpoints"":[{""checkpointId"":""flag-a"",""cooldownSeconds"":3,""position"":{""x"":8,""y"":1,""z"":0}}],""goals"":[{""goalId"":""exit"",""requiredCount"":3}],""coins"":[{""coinId"":""coin-01"",""value"":5}],""tilemap"":{""tiles"":[{""tileId"":""spike-row"",""type"":""hazard"",""position"":{""x"":12,""y"":0,""z"":0}}]}}"),
                JObject.Parse(@"{""checkpoints"":[{""checkpointId"":""flag-a"",""cooldownSeconds"":2,""position"":{""x"":9,""y"":1,""z"":0}}],""goals"":[{""goalId"":""exit"",""requiredCount"":4}],""coins"":[{""coinId"":""coin-01"",""value"":1}],""tilemap"":{""tiles"":[{""tileId"":""spike-row"",""type"":""lethal-hazard"",""position"":{""x"":12,""y"":0,""z"":0}}]}}")
            );

            Assert.False(result.HasConflicts);
            Assert.AreEqual(3, result.Merged["checkpoints"][0]["cooldownSeconds"].Value<int>());
            Assert.AreEqual(9f, result.Merged["checkpoints"][0]["position"]["x"].Value<float>());
            Assert.AreEqual(4, result.Merged["goals"][0]["requiredCount"].Value<int>());
            Assert.AreEqual(5, result.Merged["coins"][0]["value"].Value<int>());
            Assert.AreEqual("lethal-hazard", result.Merged["tilemap"]["tiles"][0]["type"].Value<string>());
        }

        [Test]
        public void IndependentTextFieldEditsMergeWithoutConflict()
        {
            var result = DiffApplier.ThreeWayMerge(
                JObject.Parse(@"{""designNotes"":""Boss starts left.\nReward is 10 coins.\n""}"),
                JObject.Parse(@"{""designNotes"":""Boss starts near gate.\nReward is 10 coins.\n""}"),
                JObject.Parse(@"{""designNotes"":""Boss starts left.\nReward is 20 coins.\n""}")
            );

            Assert.False(result.HasConflicts);
            Assert.AreEqual("Boss starts near gate.\nReward is 20 coins.\n", result.Merged["designNotes"].Value<string>());
        }

        [Test]
        public void OverlappingTextFieldEditsRemainConflict()
        {
            var result = DiffApplier.ThreeWayMerge(
                JObject.Parse(@"{""designNotes"":""Reward is 10 coins.\n""}"),
                JObject.Parse(@"{""designNotes"":""Reward is 15 coins.\n""}"),
                JObject.Parse(@"{""designNotes"":""Reward is 20 coins.\n""}")
            );

            Assert.True(result.HasConflicts);
            Assert.AreEqual("$.designNotes", result.Conflicts[0].Path);
            Assert.AreEqual("Reward is 20 coins.\n", result.Merged["designNotes"].Value<string>());
        }

        [Test]
        public void AdjacentSameTokenTextEditsRemainConflict()
        {
            var result = DiffApplier.ThreeWayMerge(
                JObject.Parse(@"{""designNotes"":""Reward is 10coins.\n""}"),
                JObject.Parse(@"{""designNotes"":""Reward is 15coins.\n""}"),
                JObject.Parse(@"{""designNotes"":""Reward is 10gems.\n""}")
            );

            Assert.True(result.HasConflicts);
            Assert.AreEqual("$.designNotes", result.Conflicts[0].Path);
            Assert.AreEqual("Reward is 10gems.\n", result.Merged["designNotes"].Value<string>());
        }

        [Test]
        public void SameStableIdArrayFieldConflictReportsLeafPath()
        {
            var result = DiffApplier.ThreeWayMerge(
                JObject.Parse(@"{""actors"":[{""id"":""boss"",""health"":1}]}"),
                JObject.Parse(@"{""actors"":[{""id"":""boss"",""health"":3}]}"),
                JObject.Parse(@"{""actors"":[{""id"":""boss"",""health"":2}]}")
            );

            Assert.True(result.HasConflicts);
            Assert.AreEqual("$.actors[id=boss].health", result.Conflicts[0].Path);
            Assert.AreEqual(2, result.Merged["actors"][0]["health"].Value<int>());
        }

        [Test]
        public void UnsafeStableArraySelectorValuesFallBackToIndexPaths()
        {
            var result = DiffApplier.ThreeWayMerge(
                JObject.Parse(@"{""actors"":[{""id"":""boss]escape"",""health"":1}]}"),
                JObject.Parse(@"{""actors"":[{""id"":""boss]escape"",""health"":3}]}"),
                JObject.Parse(@"{""actors"":[{""id"":""boss]escape"",""health"":2}]}")
            );

            Assert.True(result.HasConflicts);
            Assert.AreEqual("$.actors[0].health", result.Conflicts[0].Path);
            Assert.AreEqual(2, result.Merged["actors"][0]["health"].Value<int>());
        }

        [Test]
        public void SelectorValuesWithEqualsFallBackToIndexPaths()
        {
            var result = DiffApplier.ThreeWayMerge(
                JObject.Parse(@"{""actors"":[{""id"":""boss=phase"",""health"":1}]}"),
                JObject.Parse(@"{""actors"":[{""id"":""boss=phase"",""health"":3}]}"),
                JObject.Parse(@"{""actors"":[{""id"":""boss=phase"",""health"":2}]}")
            );

            Assert.True(result.HasConflicts);
            Assert.AreEqual("$.actors[0].health", result.Conflicts[0].Path);
            Assert.AreEqual(2, result.Merged["actors"][0]["health"].Value<int>());
        }

        [Test]
        public void SelectorValuesWithWhitespaceFallBackToIndexPaths()
        {
            var result = DiffApplier.ThreeWayMerge(
                JObject.Parse(@"{""actors"":[{""id"":""boss phase"",""health"":1}]}"),
                JObject.Parse(@"{""actors"":[{""id"":""boss phase"",""health"":3}]}"),
                JObject.Parse(@"{""actors"":[{""id"":""boss phase"",""health"":2}]}")
            );

            Assert.True(result.HasConflicts);
            Assert.AreEqual("$.actors[0].health", result.Conflicts[0].Path);
            Assert.AreEqual(2, result.Merged["actors"][0]["health"].Value<int>());
        }

        [Test]
        public void SelectorValuesWithDotsFallBackToIndexPaths()
        {
            var result = DiffApplier.ThreeWayMerge(
                JObject.Parse(@"{""actors"":[{""id"":""boss.phase"",""health"":1}]}"),
                JObject.Parse(@"{""actors"":[{""id"":""boss.phase"",""health"":3}]}"),
                JObject.Parse(@"{""actors"":[{""id"":""boss.phase"",""health"":2}]}")
            );

            Assert.True(result.HasConflicts);
            Assert.AreEqual("$.actors[0].health", result.Conflicts[0].Path);
            Assert.AreEqual(2, result.Merged["actors"][0]["health"].Value<int>());
        }

        [Test]
        public void UnsafePrimaryStableKeyUsesSecondarySelector()
        {
            var result = DiffApplier.ThreeWayMerge(
                JObject.Parse(@"{""actors"":[{""id"":""boss.phase"",""name"":""bossPhase"",""health"":1}]}"),
                JObject.Parse(@"{""actors"":[{""id"":""boss.phase"",""name"":""bossPhase"",""health"":3}]}"),
                JObject.Parse(@"{""actors"":[{""id"":""boss.phase"",""name"":""bossPhase"",""health"":2}]}")
            );

            Assert.True(result.HasConflicts);
            Assert.AreEqual("$.actors[name=bossPhase].health", result.Conflicts[0].Path);
            Assert.AreEqual(2, result.Merged["actors"][0]["health"].Value<int>());
        }

        [Test]
        public void MixedStableAndUnkeyedArrayItemsKeepStableSelectors()
        {
            var result = DiffApplier.ThreeWayMerge(
                JObject.Parse(@"{""actors"":[{""id"":""boss"",""health"":1,""position"":{""x"":0,""y"":0,""z"":0}},{""id"":""minion"",""health"":1,""position"":{""x"":2,""y"":0,""z"":0}}]}"),
                JObject.Parse(@"{""actors"":[{""displayName"":""Arena Banner"",""position"":{""x"":-1,""y"":0,""z"":0}},{""id"":""boss"",""health"":1,""position"":{""x"":0,""y"":0,""z"":0}},{""id"":""minion"",""health"":1,""position"":{""x"":2,""y"":0,""z"":0}}]}"),
                JObject.Parse(@"{""actors"":[{""id"":""boss"",""health"":1,""position"":{""x"":0,""y"":0,""z"":0}},{""id"":""minion"",""health"":1,""position"":{""x"":5,""y"":0,""z"":0}}]}")
            );

            var actors = (JArray)result.Merged["actors"];
            Assert.False(result.HasConflicts);
            Assert.AreEqual("Arena Banner", actors[0]["displayName"].Value<string>());
            Assert.AreEqual("boss", actors[1]["id"].Value<string>());
            Assert.AreEqual("minion", actors[2]["id"].Value<string>());
            Assert.AreEqual(5f, actors[2]["position"]["x"].Value<float>());
        }

        [Test]
        public void GameDomainStableKeyConflictReportsLeafPath()
        {
            var result = DiffApplier.ThreeWayMerge(
                JObject.Parse(@"{""rooms"":[{""roomId"":""boss"",""difficulty"":3}]}"),
                JObject.Parse(@"{""rooms"":[{""roomId"":""boss"",""difficulty"":5}]}"),
                JObject.Parse(@"{""rooms"":[{""roomId"":""boss"",""difficulty"":4}]}")
            );

            Assert.True(result.HasConflicts);
            Assert.AreEqual("$.rooms[roomId=boss].difficulty", result.Conflicts[0].Path);
            Assert.AreEqual(4, result.Merged["rooms"][0]["difficulty"].Value<int>());
        }

        [Test]
        public void PlayableDomainStableKeyConflictReportsLeafPath()
        {
            var result = DiffApplier.ThreeWayMerge(
                JObject.Parse(@"{""checkpoints"":[{""checkpointId"":""flag-a"",""cooldownSeconds"":2}],""tilemap"":{""tiles"":[{""tileId"":""spike-row"",""damage"":1}]}}"),
                JObject.Parse(@"{""checkpoints"":[{""checkpointId"":""flag-a"",""cooldownSeconds"":3}],""tilemap"":{""tiles"":[{""tileId"":""spike-row"",""damage"":1}]}}"),
                JObject.Parse(@"{""checkpoints"":[{""checkpointId"":""flag-a"",""cooldownSeconds"":4}],""tilemap"":{""tiles"":[{""tileId"":""spike-row"",""damage"":2}]}}")
            );

            Assert.True(result.HasConflicts);
            Assert.AreEqual("$.checkpoints[checkpointId=flag-a].cooldownSeconds", result.Conflicts[0].Path);
            Assert.AreEqual(4, result.Merged["checkpoints"][0]["cooldownSeconds"].Value<int>());
            Assert.AreEqual(2, result.Merged["tilemap"]["tiles"][0]["damage"].Value<int>());
        }

        [Test]
        public void WebDeletedObjectFieldIsRemovedWhenUnityIsUnchanged()
        {
            var result = DiffApplier.ThreeWayMerge(
                JObject.Parse(@"{""actor"":{""id"":""boss"",""notes"":""cut this"",""health"":2}}"),
                JObject.Parse(@"{""actor"":{""id"":""boss"",""health"":2}}"),
                JObject.Parse(@"{""actor"":{""id"":""boss"",""notes"":""cut this"",""health"":2}}")
            );

            Assert.False(result.HasConflicts);
            Assert.False(((JObject)result.Merged["actor"]).ContainsKey("notes"));
            Assert.AreEqual(2, result.Merged["actor"]["health"].Value<int>());
        }

        [Test]
        public void UnityDeletedStableIdArrayItemIsRemovedWhenWebIsUnchanged()
        {
            var result = DiffApplier.ThreeWayMerge(
                JObject.Parse(@"{""actors"":[{""id"":""boss"",""health"":2},{""id"":""minion"",""health"":1}]}"),
                JObject.Parse(@"{""actors"":[{""id"":""boss"",""health"":2},{""id"":""minion"",""health"":1}]}"),
                JObject.Parse(@"{""actors"":[{""id"":""boss"",""health"":2}]}")
            );

            var actors = (JArray)result.Merged["actors"];
            Assert.False(result.HasConflicts);
            Assert.AreEqual(1, actors.Count);
            Assert.AreEqual("boss", actors[0]["id"].Value<string>());
        }

        [Test]
        public void DeleteVersusEditReportsConflictAndKeepsUnityEdit()
        {
            var result = DiffApplier.ThreeWayMerge(
                JObject.Parse(@"{""actors"":[{""id"":""boss"",""health"":2}]}"),
                JObject.Parse(@"{""actors"":[]}"),
                JObject.Parse(@"{""actors"":[{""id"":""boss"",""health"":4}]}")
            );

            var actors = (JArray)result.Merged["actors"];
            Assert.True(result.HasConflicts);
            Assert.AreEqual("$.actors[id=boss]", result.Conflicts[0].Path);
            Assert.AreEqual(1, actors.Count);
            Assert.AreEqual(4, actors[0]["health"].Value<int>());
        }

        [Test]
        public void RejectsUnsafeObjectKeysBeforeEarlyReturnMerges()
        {
            Assert.Throws<System.InvalidOperationException>(() => DiffApplier.ThreeWayMerge(
                JObject.Parse(@"{""boss"":{""health"":1}}"),
                JObject.Parse(@"{""boss"":{""phases"":[{""__proto__"":{""polluted"":true},""health"":1}]}}"),
                JObject.Parse(@"{""boss"":{""phases"":[{""__proto__"":{""polluted"":true},""health"":1}]}}")
            ));

            Assert.Throws<System.InvalidOperationException>(() => DiffApplier.ThreeWayMerge(
                JObject.Parse(@"{""constructor"":{""polluted"":true},""boss"":{""health"":1}}"),
                JObject.Parse(@"{""constructor"":{""polluted"":true},""boss"":{""health"":1}}"),
                JObject.Parse(@"{""boss"":{""health"":2}}")
            ));

            Assert.Throws<System.InvalidOperationException>(() => DiffApplier.ThreeWayMerge(
                JObject.Parse(@"{""boss"":{""health"":1}}"),
                JObject.Parse(@"{""boss"":{""phase.name"":1}}"),
                JObject.Parse(@"{""boss"":{""phase.name"":1}}")
            ));

            Assert.Throws<System.InvalidOperationException>(() => DiffApplier.ThreeWayMerge(
                JObject.Parse(@"{""boss"":{""health"":1}}"),
                JObject.Parse(@"{""boss"":{""phase[0]"":1}}"),
                JObject.Parse(@"{""boss"":{""phase[0]"":1}}")
            ));
        }

        [Test]
        public void RejectsUnsafeMergeTokenValuesBeforeEarlyReturnMerges()
        {
            Assert.Throws<System.InvalidOperationException>(() => DiffApplier.ThreeWayMerge(
                JObject.Parse(@"{""boss"":{""health"":1}}"),
                new JObject { ["boss"] = new JObject { ["health"] = new JValue(double.NaN) } },
                new JObject { ["boss"] = new JObject { ["health"] = new JValue(double.NaN) } }
            ));

            Assert.Throws<System.InvalidOperationException>(() => DiffApplier.ThreeWayMerge(
                JObject.Parse(@"{""boss"":{""health"":1}}"),
                new JObject { ["boss"] = new JObject { ["state"] = JValue.CreateUndefined() } },
                new JObject { ["boss"] = new JObject { ["state"] = JValue.CreateUndefined() } }
            ));

            Assert.Throws<System.InvalidOperationException>(() => DiffApplier.ThreeWayMerge(
                JObject.Parse(@"{""boss"":{""health"":1}}"),
                new JObject { ["boss"] = new JObject { ["updatedAt"] = new JValue(new System.DateTime(2026, 5, 24, 0, 0, 0, System.DateTimeKind.Utc)) } },
                new JObject { ["boss"] = new JObject { ["updatedAt"] = new JValue(new System.DateTime(2026, 5, 24, 0, 0, 0, System.DateTimeKind.Utc)) } }
            ));
        }

        [Test]
        public void RejectsOversizedMergeTreesBeforeEarlyReturnMerges()
        {
            Assert.Throws<System.InvalidOperationException>(() => DiffApplier.ThreeWayMerge(
                JObject.Parse(@"{""boss"":{""health"":1}}"),
                new JObject { ["boss"] = DeepObject(34) },
                new JObject { ["boss"] = DeepObject(34) }
            ));

            Assert.Throws<System.InvalidOperationException>(() => DiffApplier.ThreeWayMerge(
                JObject.Parse(@"{""boss"":{""health"":1}}"),
                new JObject { ["boss"] = WideObject(2049) },
                new JObject { ["boss"] = WideObject(2049) }
            ));

            Assert.Throws<System.InvalidOperationException>(() => DiffApplier.ThreeWayMerge(
                JObject.Parse(@"{""boss"":{""health"":1}}"),
                new JObject { ["boss"] = WideArray(8193) },
                new JObject { ["boss"] = WideArray(8193) }
            ));

            Assert.Throws<System.InvalidOperationException>(() => DiffApplier.ThreeWayMerge(
                JObject.Parse(@"{""boss"":{""health"":1}}"),
                new JObject { ["boss"] = new JObject { ["note"] = new string('x', (1024 * 1024) + 1) } },
                new JObject { ["boss"] = new JObject { ["note"] = new string('x', (1024 * 1024) + 1) } }
            ));

            Assert.Throws<System.InvalidOperationException>(() => DiffApplier.ThreeWayMerge(
                JObject.Parse(@"{""boss"":{""health"":1}}"),
                new JObject { [new string('a', 511)] = 1 },
                new JObject { [new string('a', 511)] = 1 }
            ));
        }

        [Test]
        public void RejectsExcessiveMergeConflictsBeforeInboxOverflow()
        {
            Assert.Throws<System.InvalidOperationException>(() => DiffApplier.ThreeWayMerge(
                ConflictingObject(101, 0),
                ConflictingObject(101, 1),
                ConflictingObject(101, 2)
            ));
        }

        private static JObject DeepObject(int depth)
        {
            var root = new JObject();
            JObject cursor = root;
            for (int index = 0; index < depth; index++)
            {
                var next = new JObject();
                cursor["node" + index] = next;
                cursor = next;
            }
            return root;
        }

        private static JObject WideObject(int count)
        {
            var root = new JObject();
            for (int index = 0; index < count; index++)
            {
                root["key" + index] = index;
            }
            return root;
        }

        private static JObject ConflictingObject(int count, int value)
        {
            var root = new JObject();
            for (int index = 0; index < count; index++)
            {
                root["key" + index] = value;
            }
            return root;
        }

        private static JArray WideArray(int count)
        {
            var array = new JArray();
            for (int index = 0; index < count; index++)
            {
                array.Add(index);
            }
            return array;
        }
    }
}
