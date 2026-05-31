// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System.Linq;
using System.Reflection;
using Greybox.Editor.Sync;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEditor;

namespace Greybox.Tests.EditMode
{
    public sealed class GreyboxConflictInboxTests
    {
        [SetUp]
        public void SetUp()
        {
            GreyboxConflictInbox.Clear();
        }

        [Test]
        public void RecordsRoundTripConflictPayloads()
        {
            var evt = new JObject
            {
                ["type"] = "artifact-changed",
                ["payload"] = new JObject
                {
                    ["type"] = "round_trip_merge",
                    ["action"] = "conflict",
                    ["fileName"] = "arena.gameview.json",
                    ["strategy"] = "json-three-way",
                    ["mergedContent"] = @"{""actors"":[{""id"":""boss"",""health"":2}]}",
                    ["updatedAt"] = 42,
                    ["conflicts"] = new JArray
                    {
                        new JObject
                        {
                            ["path"] = "$.actors[id=boss].health",
                            ["baseValue"] = 1,
                            ["webValue"] = 3,
                            ["unityValue"] = 2,
                        },
                    },
                },
            };
            bool recorded = GreyboxConflictInbox.RecordFromEvent(evt);

            Assert.True(recorded);
            Assert.AreEqual(1, GreyboxConflictInbox.Conflicts.Count);
            Assert.AreEqual("arena.gameview.json", GreyboxConflictInbox.Conflicts[0].FileName);
            Assert.AreEqual("$.actors[id=boss].health", GreyboxConflictInbox.Conflicts[0].Path);
            Assert.AreEqual("3", GreyboxConflictInbox.Conflicts[0].WebValueJson);
            Assert.AreEqual("2", GreyboxConflictInbox.Conflicts[0].UnityValueJson);
            StringAssert.Contains(@"""health"":2", GreyboxConflictInbox.Conflicts[0].MergedContent);
            GreyboxConflictInbox.Remove(GreyboxConflictInbox.Conflicts[0]);
            Assert.AreEqual(0, GreyboxConflictInbox.Conflicts.Count);
        }

        [Test]
        public void IgnoresMergedPayloads()
        {
            bool recorded = GreyboxConflictInbox.RecordFromEvent(JObject.Parse(@"{
              ""payload"": { ""type"": ""round_trip_merge"", ""action"": ""unity-edit-merged"", ""fileName"": ""arena.gameview.json"" }
            }"));

            Assert.False(recorded);
            Assert.AreEqual(0, GreyboxConflictInbox.Conflicts.Count);
        }

        [Test]
        public void RejectsStringlyConflictEnvelopeFieldsAndTimestamps()
        {
            JObject stringTimestamp = ConflictEvent("arena.gameview.json", "$.actors[id=boss].health", 3, 2, 42);
            stringTimestamp["payload"]["updatedAt"] = "42";
            JObject negativeTimestamp = ConflictEvent("arena.gameview.json", "$.actors[id=boss].health", 3, 2, 42);
            negativeTimestamp["payload"]["updatedAt"] = -1;
            JObject numericType = ConflictEvent("arena.gameview.json", "$.actors[id=boss].health", 3, 2, 42);
            numericType["payload"]["type"] = 7;
            JObject numericStrategy = ConflictEvent("arena.gameview.json", "$.actors[id=boss].health", 3, 2, 42);
            numericStrategy["payload"]["strategy"] = 7;
            JObject objectMergedContent = ConflictEvent("arena.gameview.json", "$.actors[id=boss].health", 3, 2, 42);
            objectMergedContent["payload"]["mergedContent"] = new JObject { ["actors"] = new JArray() };
            JObject numericPath = ConflictEvent("arena.gameview.json", "$.actors[id=boss].health", 3, 2, 42);
            numericPath["payload"]["conflicts"][0]["path"] = 7;

            Assert.False(GreyboxConflictInbox.RecordFromEvent(stringTimestamp));
            Assert.False(GreyboxConflictInbox.RecordFromEvent(negativeTimestamp));
            Assert.False(GreyboxConflictInbox.RecordFromEvent(numericType));
            Assert.False(GreyboxConflictInbox.RecordFromEvent(numericStrategy));
            Assert.False(GreyboxConflictInbox.RecordFromEvent(objectMergedContent));
            Assert.False(GreyboxConflictInbox.RecordFromEvent(numericPath));
            Assert.AreEqual(0, GreyboxConflictInbox.Conflicts.Count);
        }

        [Test]
        public void RejectsUnsafeRoundTripConflictPayloads()
        {
            Assert.False(GreyboxConflictInbox.RecordFromEvent(ConflictEvent("../arena.gameview.json", "$.actors[id=boss].health", 3, 2, 42)));
            Assert.False(GreyboxConflictInbox.RecordFromEvent(ConflictEvent("levels/" + new string('a', 520) + ".gameview.json", "$.actors[id=boss].health", 3, 2, 42)));
            Assert.False(GreyboxConflictInbox.RecordFromEvent(ConflictEvent("arena.gameview.json", "actors[id=boss].health", 3, 2, 42)));
            Assert.False(GreyboxConflictInbox.RecordFromEvent(ConflictEvent("arena.gameview.json", "$.actors\n[id=boss].health", 3, 2, 42)));
            Assert.False(GreyboxConflictInbox.RecordFromEvent(ConflictEvent("arena.gameview.json", "$." + new string('x', 520), 3, 2, 42)));
            Assert.False(GreyboxConflictInbox.RecordFromEvent(ConflictEvent("arena.gameview.json", "$..actors[id=boss].health", 3, 2, 42)));
            Assert.False(GreyboxConflictInbox.RecordFromEvent(ConflictEvent("arena.gameview.json", "$.__proto__.polluted", 3, 2, 42)));
            Assert.False(GreyboxConflictInbox.RecordFromEvent(ConflictEvent("arena.gameview.json", "$.actors[constructor=boss].health", 3, 2, 42)));
            Assert.False(GreyboxConflictInbox.RecordFromEvent(ConflictEvent("arena.gameview.json", "$.actors[id=../../boss].health", 3, 2, 42)));
            Assert.False(GreyboxConflictInbox.RecordFromEvent(ConflictEvent("arena.gameview.json", "$.actors[id=boss]/health", 3, 2, 42)));
            Assert.AreEqual(0, GreyboxConflictInbox.Conflicts.Count);
        }

        [Test]
        public void RejectsOversizedRoundTripConflictPayloads()
        {
            string oversized = new string('x', (1024 * 1024) + 1);
            Assert.False(GreyboxConflictInbox.RecordFromEvent(ConflictEvent("arena.gameview.json", "$.actors[id=boss].health", 3, 2, 42, oversized)));
            Assert.False(GreyboxConflictInbox.RecordFromEvent(ConflictEvent("arena.gameview.json", "$.actors[id=boss].health", JValue.CreateString(oversized), new JValue(2), 42)));
            Assert.False(GreyboxConflictInbox.RecordFromEvent(ConflictEvent("arena.gameview.json", "$.actors[id=boss].health", 3, 2, 42, null, new string('s', 81))));
            Assert.False(GreyboxConflictInbox.RecordFromEvent(ConflictEvent("arena.gameview.json", "$.actors[id=boss].health", 3, 2, 42, null, "json\nthree-way")));
            Assert.AreEqual(0, GreyboxConflictInbox.Conflicts.Count);
        }

        [Test]
        public void RejectsOversizedConflictArraysAndUnsafeValueTrees()
        {
            int maxPayloadItems = PrivateIntConstant("MaxConflictPayloadItems");
            int maxDepth = PrivateIntConstant("MaxConflictValueDepth");
            int maxObjectProperties = PrivateIntConstant("MaxConflictValueObjectProperties");
            int maxArrayItems = PrivateIntConstant("MaxConflictValueArrayItems");

            Assert.False(GreyboxConflictInbox.RecordFromEvent(ConflictEventWithConflictItems(maxPayloadItems + 1)));
            Assert.False(GreyboxConflictInbox.RecordFromEvent(ConflictEvent("arena.gameview.json", "$.actors[id=boss].health", DeepValue(maxDepth + 1), new JValue(2), 42)));
            Assert.False(GreyboxConflictInbox.RecordFromEvent(ConflictEvent("arena.gameview.json", "$.actors[id=boss].health", WideObject(maxObjectProperties + 1), new JValue(2), 42)));
            Assert.False(GreyboxConflictInbox.RecordFromEvent(ConflictEvent("arena.gameview.json", "$.actors[id=boss].health", WideArray(maxArrayItems + 1), new JValue(2), 42)));
            Assert.False(GreyboxConflictInbox.RecordFromEvent(ConflictEvent("arena.gameview.json", "$.actors[id=boss].health", new JObject { ["__proto__"] = true }, new JValue(2), 42)));
            Assert.False(GreyboxConflictInbox.RecordFromEvent(ConflictEvent("arena.gameview.json", "$.actors[id=boss].health", new JValue(double.NaN), new JValue(2), 42)));
            Assert.AreEqual(0, GreyboxConflictInbox.Conflicts.Count);
        }

        [Test]
        public void SkipsUnsafeConflictPathsAndKeepsSafeOnes()
        {
            bool recorded = GreyboxConflictInbox.RecordFromEvent(new JObject
            {
                ["payload"] = new JObject
                {
                    ["type"] = "round_trip_merge",
                    ["action"] = "conflict",
                    ["fileName"] = "arena.gameview.json",
                    ["strategy"] = "json-three-way",
                    ["mergedContent"] = @"{""actors"":[{""id"":""boss"",""health"":2}]}",
                    ["conflicts"] = new JArray
                    {
                        new JObject
                        {
                            ["path"] = "actors[id=boss].health",
                            ["baseValue"] = 1,
                            ["webValue"] = 3,
                            ["unityValue"] = 2,
                        },
                        new JObject
                        {
                            ["path"] = "$.actors[id=boss].health",
                            ["baseValue"] = 1,
                            ["webValue"] = 4,
                            ["unityValue"] = 2,
                        },
                    },
                },
            });

            Assert.True(recorded);
            Assert.AreEqual(1, GreyboxConflictInbox.Conflicts.Count);
            Assert.AreEqual("$.actors[id=boss].health", GreyboxConflictInbox.Conflicts[0].Path);
            Assert.AreEqual("4", GreyboxConflictInbox.Conflicts[0].WebValueJson);
        }

        [Test]
        public void RecordsPrefabSidecarReviewItems()
        {
            bool recorded = GreyboxConflictInbox.RecordPrefabSidecar(
                "Assets/Greybox/Generated/proj/GameViewports/arena.prefab",
                "Assets/Greybox/Generated/proj/GameViewports/arena.greybox-incoming.prefab",
                "Assets/GreyboxGenerated/Artifacts/arena.gameview");

            Assert.True(recorded);
            Assert.AreEqual(1, GreyboxConflictInbox.Conflicts.Count);
            GreyboxRoundTripConflict conflict = GreyboxConflictInbox.Conflicts[0];
            Assert.AreEqual("prefab-sidecar", conflict.Strategy);
            Assert.AreEqual("$.unity.prefab", conflict.Path);
            Assert.AreEqual(@"""Assets/Greybox/Generated/proj/GameViewports/arena.greybox-incoming.prefab""", conflict.WebValueJson);
            Assert.AreEqual(@"""Assets/Greybox/Generated/proj/GameViewports/arena.prefab""", conflict.UnityValueJson);
            StringAssert.Contains("incoming sidecar", conflict.MergedContent);
        }

        [Test]
        public void RejectsUnsafePrefabSidecarReviewItems()
        {
            Assert.False(GreyboxConflictInbox.RecordPrefabSidecar(
                "ProjectSettings/ProjectSettings.asset",
                "Assets/Greybox/Generated/proj/GameViewports/arena.greybox-incoming.prefab",
                "Assets/GreyboxGenerated/Artifacts/arena.gameview"));
            Assert.False(GreyboxConflictInbox.RecordPrefabSidecar(
                "Assets/Greybox/Generated/proj/GameViewports/arena.prefab",
                "Assets/Greybox/Generated/proj/GameViewports/arena.prefab",
                "Assets/GreyboxGenerated/Artifacts/arena.gameview"));
            Assert.False(GreyboxConflictInbox.RecordPrefabSidecar(
                "Assets/Greybox/Generated/proj/../arena.prefab",
                "Assets/Greybox/Generated/proj/GameViewports/arena.greybox-incoming.prefab",
                "Assets/GreyboxGenerated/Artifacts/arena.gameview"));
            Assert.False(GreyboxConflictInbox.RecordPrefabSidecar(
                "Assets/Greybox/Generated/proj/GameViewports/arena.prefab",
                "Assets/Greybox/Generated/proj/GameViewports/other.greybox-incoming.prefab",
                "Assets/GreyboxGenerated/Artifacts/arena.gameview"));

            Assert.AreEqual(0, GreyboxConflictInbox.Conflicts.Count);
        }

        [Test]
        public void SanitizesPrefabSidecarSourcePath()
        {
            bool recorded = GreyboxConflictInbox.RecordPrefabSidecar(
                "Assets/Greybox/Generated/proj/GameViewports/arena.prefab",
                "Assets/Greybox/Generated/proj/GameViewports/arena.greybox-incoming.prefab",
                "../ProjectSettings/ProjectSettings.asset");

            Assert.True(recorded);
            Assert.AreEqual("\"\"", GreyboxConflictInbox.Conflicts[0].BaseValueJson);
        }

        [Test]
        public void RecordsExampleRoundTripConflictForEditorSmoke()
        {
            bool recorded = GreyboxConflictInbox.RecordExampleRoundTripConflict();

            Assert.True(recorded);
            Assert.AreEqual(3, GreyboxConflictInbox.Conflicts.Count);

            GreyboxRoundTripConflict health = GreyboxConflictInbox.Conflicts.FirstOrDefault(item => item.Path == "$.actors[id=boss].health");
            GreyboxRoundTripConflict position = GreyboxConflictInbox.Conflicts.FirstOrDefault(item => item.Path == "$.spawnPoints[id=hero].position");
            GreyboxRoundTripConflict title = GreyboxConflictInbox.Conflicts.FirstOrDefault(item => item.Path == "$.hud.title");

            Assert.NotNull(health);
            Assert.NotNull(position);
            Assert.NotNull(title);
            Assert.AreEqual("Samples/2D Platformer/platformer.gameview.json", health.FileName);
            Assert.AreEqual("3", health.WebValueJson);
            Assert.AreEqual("2", health.UnityValueJson);
            StringAssert.Contains(@"""health"":2", health.MergedContent);
            StringAssert.Contains(@"""x"":2", position.WebValueJson);
            Assert.AreEqual(@"""Greybox Smoke Merge""", title.UnityValueJson);
        }

        [Test]
        public void ReplacesExistingConflictForSameFileAndPath()
        {
            GreyboxConflictInbox.RecordFromEvent(ConflictEvent("arena.gameview.json", "$.actors[id=boss].health", 3, 2, 42));
            GreyboxConflictInbox.RecordFromEvent(ConflictEvent("arena.gameview.json", "$.actors[id=boss].health", 5, 4, 84));

            Assert.AreEqual(1, GreyboxConflictInbox.Conflicts.Count);
            Assert.AreEqual("arena.gameview.json", GreyboxConflictInbox.Conflicts[0].FileName);
            Assert.AreEqual("$.actors[id=boss].health", GreyboxConflictInbox.Conflicts[0].Path);
            Assert.AreEqual("5", GreyboxConflictInbox.Conflicts[0].WebValueJson);
            Assert.AreEqual("4", GreyboxConflictInbox.Conflicts[0].UnityValueJson);
            Assert.AreEqual(84, GreyboxConflictInbox.Conflicts[0].UpdatedAt);
        }

        [Test]
        public void PersistsUnresolvedConflictsAcrossInboxReloads()
        {
            GreyboxConflictInbox.RecordFromEvent(ConflictEvent("arena.gameview.json", "$.actors[id=boss].health", 5, 4, 84));
            ReloadInboxForTests();

            Assert.AreEqual(1, GreyboxConflictInbox.Conflicts.Count);
            Assert.AreEqual("arena.gameview.json", GreyboxConflictInbox.Conflicts[0].FileName);
            Assert.AreEqual("$.actors[id=boss].health", GreyboxConflictInbox.Conflicts[0].Path);
            Assert.AreEqual("5", GreyboxConflictInbox.Conflicts[0].WebValueJson);
            Assert.AreEqual("4", GreyboxConflictInbox.Conflicts[0].UnityValueJson);

            GreyboxConflictInbox.Remove(GreyboxConflictInbox.Conflicts[0]);
            ReloadInboxForTests();

            Assert.AreEqual(0, GreyboxConflictInbox.Conflicts.Count);
        }

        [Test]
        public void OversizedConflictSnapshotsAreRejectedBeforeDeserialize()
        {
            string snapshotKey = SnapshotPrefForTests();
            int maxSnapshotChars = PrivateIntConstant("MaxConflictSnapshotChars");
            EditorPrefs.SetString(snapshotKey, new string('x', maxSnapshotChars + 1));

            ReloadInboxForTests();

            Assert.AreEqual(0, GreyboxConflictInbox.Conflicts.Count);
            Assert.AreEqual("", EditorPrefs.GetString(snapshotKey, ""));
        }

        [Test]
        public void SavingConflictSnapshotsTrimsOldestItemsUnderSnapshotCap()
        {
            int maxSnapshotChars = PrivateIntConstant("MaxConflictSnapshotChars");
            int maxValueJsonLength = PrivateIntConstant("MaxConflictValueJsonLength");
            string largeContent = new string('x', maxValueJsonLength - 64);

            Assert.True(GreyboxConflictInbox.RecordFromEvent(ConflictEvent("arena.gameview.json", "$.actors[id=first].health", JValue.CreateString(largeContent), JValue.CreateString(largeContent), 42, largeContent)));
            Assert.True(GreyboxConflictInbox.RecordFromEvent(ConflictEvent("arena.gameview.json", "$.actors[id=second].health", JValue.CreateString(largeContent), JValue.CreateString(largeContent), 84, largeContent)));

            string snapshot = EditorPrefs.GetString(SnapshotPrefForTests(), "");

            Assert.LessOrEqual(snapshot.Length, maxSnapshotChars);
            ReloadInboxForTests();
            Assert.AreEqual(1, GreyboxConflictInbox.Conflicts.Count);
            Assert.AreEqual("$.actors[id=second].health", GreyboxConflictInbox.Conflicts[0].Path);
        }

        [Test]
        public void ConflictSnapshotScopePrefersProjectIdOverUnityPath()
        {
            Assert.AreEqual("project-arena-prod", ProjectScopeKeyForTests("arena prod", "/Users/designer/Arena"));
            string firstPathKey = ProjectScopeKeyForTests("", "/Users/designer/Arena");
            string secondPathKey = ProjectScopeKeyForTests("", "/Users/designer/OtherArena");
            string longProjectId = "Greybox Project " + new string('A', 160) + "\nrelease";
            string longProjectKey = ProjectScopeKeyForTests(longProjectId, "/Users/designer/Arena");
            string repeatLongProjectKey = ProjectScopeKeyForTests(longProjectId, "/Users/designer/OtherArena");

            StringAssert.StartsWith("unity-", firstPathKey);
            Assert.AreEqual(firstPathKey.Length, secondPathKey.Length);
            Assert.AreNotEqual(firstPathKey, secondPathKey);
            StringAssert.StartsWith("project-", longProjectKey);
            Assert.LessOrEqual(longProjectKey.Length, "project-".Length + 80);
            StringAssert.DoesNotContain("\n", longProjectKey);
            Assert.AreEqual(longProjectKey, repeatLongProjectKey);
        }

        private static JObject ConflictEvent(string fileName, string path, int webValue, int unityValue, long updatedAt)
        {
            return ConflictEvent(fileName, path, new JValue(webValue), new JValue(unityValue), updatedAt);
        }

        private static JObject ConflictEvent(string fileName, string path, int webValue, int unityValue, long updatedAt, string mergedContent, string strategy = "json-three-way")
        {
            return ConflictEvent(fileName, path, new JValue(webValue), new JValue(unityValue), updatedAt, mergedContent, strategy);
        }

        private static JObject ConflictEvent(string fileName, string path, JToken webValue, JToken unityValue, long updatedAt, string mergedContent = null, string strategy = "json-three-way")
        {
            return new JObject
            {
                ["payload"] = new JObject
                {
                    ["type"] = "round_trip_merge",
                    ["action"] = "conflict",
                    ["fileName"] = fileName,
                    ["strategy"] = strategy,
                    ["mergedContent"] = mergedContent ?? @"{""actors"":[{""id"":""boss"",""health"":2}]}",
                    ["updatedAt"] = updatedAt,
                    ["conflicts"] = new JArray
                    {
                        new JObject
                        {
                            ["path"] = path,
                            ["baseValue"] = 1,
                            ["webValue"] = webValue,
                            ["unityValue"] = unityValue,
                        },
                    },
                },
            };
        }

        private static JObject ConflictEventWithConflictItems(int count)
        {
            var conflicts = new JArray();
            for (int index = 0; index < count; index++)
            {
                conflicts.Add(new JObject
                {
                    ["path"] = $"$.actors[id=boss-{index}].health",
                    ["baseValue"] = 1,
                    ["webValue"] = 3,
                    ["unityValue"] = 2,
                });
            }

            return new JObject
            {
                ["payload"] = new JObject
                {
                    ["type"] = "round_trip_merge",
                    ["action"] = "conflict",
                    ["fileName"] = "arena.gameview.json",
                    ["strategy"] = "json-three-way",
                    ["mergedContent"] = @"{""actors"":[{""id"":""boss"",""health"":2}]}",
                    ["updatedAt"] = 42,
                    ["conflicts"] = conflicts,
                },
            };
        }

        private static JToken DeepValue(int wrappers)
        {
            var root = new JObject();
            JObject cursor = root;
            for (int index = 0; index < wrappers; index++)
            {
                var child = new JObject();
                cursor["child"] = child;
                cursor = child;
            }
            cursor["value"] = 1;
            return root;
        }

        private static JToken WideObject(int properties)
        {
            var root = new JObject();
            for (int index = 0; index < properties; index++)
            {
                root["k" + index] = index;
            }
            return root;
        }

        private static JToken WideArray(int items)
        {
            var array = new JArray();
            for (int index = 0; index < items; index++)
            {
                array.Add(index);
            }
            return array;
        }

        private static void ReloadInboxForTests()
        {
            typeof(GreyboxConflictInbox)
                .GetMethod("ReloadForTests", BindingFlags.Static | BindingFlags.NonPublic)
                .Invoke(null, null);
        }

        private static string ProjectScopeKeyForTests(string projectId, string dataPath)
        {
            return (string)typeof(GreyboxConflictInbox)
                .GetMethod("ProjectScopeKeyForTests", BindingFlags.Static | BindingFlags.NonPublic)
                .Invoke(null, new object[] { projectId, dataPath });
        }

        private static string SnapshotPrefForTests()
        {
            return (string)typeof(GreyboxConflictInbox)
                .GetMethod("SnapshotPref", BindingFlags.Static | BindingFlags.NonPublic)
                .Invoke(null, null);
        }

        private static int PrivateIntConstant(string name)
        {
            return (int)typeof(GreyboxConflictInbox)
                .GetField(name, BindingFlags.Static | BindingFlags.NonPublic)
                .GetRawConstantValue();
        }
    }
}
