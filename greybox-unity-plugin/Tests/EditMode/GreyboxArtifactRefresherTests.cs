// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using Greybox.Editor.Sync;
using Greybox.Runtime;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEngine;

namespace Greybox.Tests.EditMode
{
    public sealed class GreyboxArtifactRefresherTests
    {
        [Test]
        public void BuildsGeneratedImportPathForNewDaemonGameViewportArtifacts()
        {
            Assert.AreEqual(
                "Assets/GreyboxGenerated/Artifacts/levels/arena.gameview",
                GeneratedImportAssetPath("levels/arena.gameview.json")
            );
        }

        [Test]
        public void BuildsGeneratedImportPathForDesignMarkdown()
        {
            Assert.AreEqual(
                "Assets/GreyboxGenerated/Artifacts/art-bible.design",
                GeneratedImportAssetPath("DESIGN.md")
            );
            Assert.AreEqual(
                "Assets/GreyboxGenerated/Artifacts/world/world.design",
                GeneratedImportAssetPath("world/DESIGN.md")
            );
        }

        [Test]
        public void SanitizesGeneratedImportPathCharacters()
        {
            string path = GeneratedImportAssetPath("boards/boss:arena?.levelboard.json");

            Assert.AreEqual("Assets/GreyboxGenerated/Artifacts/boards/boss-arena-.levelboard", path);
            Assert.False(path.Contains(":"));
            Assert.False(path.Contains("?"));
        }

        [Test]
        public void UnsafeDaemonArtifactNamesAreRejected()
        {
            var config = ScriptableObject.CreateInstance<GreyboxConfig>();
            try
            {
                config.ProjectId = "project-42";
                config.DaemonUrl = "http://127.0.0.1:17456/";

                Assert.AreEqual("", GeneratedImportAssetPath("../boss:arena?.levelboard.json"));
                Assert.AreEqual("", BuildRawArtifactUrl(config, "../levels/../boss.gameview.json"));
                Assert.AreEqual("", BuildRawArtifactUrl(config, "/levels/boss.gameview.json"));
                Assert.AreEqual("", BuildRawArtifactUrl(config, "https://example.test/boss.gameview.json"));
                Assert.AreEqual("", BuildRawArtifactUrl(config, "levels/notes.txt"));
                Assert.AreEqual("", BuildRawArtifactUrl(config, "levels/" + new string('a', 170) + ".gameview.json"));
                Assert.False(IsSafeDaemonArtifactName("../levels/../boss.gameview.json"));
                Assert.False(IsSafeDaemonArtifactName("/levels/boss.gameview.json"));
                Assert.False(IsSafeDaemonArtifactName("https://example.test/boss.gameview.json"));
                Assert.False(IsSafeDaemonArtifactName("levels/\n/boss.gameview.json"));
                Assert.False(IsSafeDaemonArtifactName("levels/" + new string('a', 170) + ".gameview.json"));
                Assert.False(IsSafeDaemonArtifactName("levels/" + new string('a', 520) + ".gameview.json"));
                Assert.True(IsSafeDaemonArtifactName("levels/boss.gameview.json"));
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(config);
            }
        }

        [Test]
        public void RawArtifactUrlEscapesSafeRelativeArtifactNames()
        {
            var config = ScriptableObject.CreateInstance<GreyboxConfig>();
            try
            {
                config.ProjectId = " project 42 ";
                config.DaemonUrl = "http://127.0.0.1:17456/ignored/path";

                string url = BuildRawArtifactUrl(config, "levels/boss arena.gameview.json");

                Assert.AreEqual("http://127.0.0.1:17456/api/projects/project%2042/raw/levels/boss%20arena.gameview.json", url);
                Assert.False(url.Contains(".."));
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(config);
            }
        }

        [Test]
        public void RawArtifactUrlRejectsUnsafeDaemonBaseUrls()
        {
            var config = ScriptableObject.CreateInstance<GreyboxConfig>();
            try
            {
                config.ProjectId = "project-42";

                config.DaemonUrl = "file:///tmp/daemon.sock";
                Assert.AreEqual("", BuildRawArtifactUrl(config, "levels/boss.gameview.json"));

                config.DaemonUrl = "ws://127.0.0.1:17456";
                Assert.AreEqual("", BuildRawArtifactUrl(config, "levels/boss.gameview.json"));

                config.DaemonUrl = "http://user:pass@127.0.0.1:17456";
                Assert.AreEqual("", BuildRawArtifactUrl(config, "levels/boss.gameview.json"));

                config.DaemonUrl = "/relative/daemon";
                Assert.AreEqual("", BuildRawArtifactUrl(config, "levels/boss.gameview.json"));

                config.DaemonUrl = "https://daemon.greybox.local";
                Assert.AreEqual(
                    "https://daemon.greybox.local/api/projects/project-42/raw/levels/boss.gameview.json",
                    BuildRawArtifactUrl(config, "levels/boss.gameview.json"));

                config.ProjectId = "project\n42";
                Assert.AreEqual("", BuildRawArtifactUrl(config, "levels/boss.gameview.json"));

                config.ProjectId = "https://example.test/project-42";
                Assert.AreEqual("", BuildRawArtifactUrl(config, "levels/boss.gameview.json"));

                config.ProjectId = "project/42";
                Assert.AreEqual("", BuildRawArtifactUrl(config, "levels/boss.gameview.json"));
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(config);
            }
        }

        [Test]
        public void ExtractArtifactNamesDropsUnsafeDaemonPaths()
        {
            string[] names = ExtractArtifactNames(JObject.Parse(@"{
              ""writtenFileNames"": [
                ""levels/arena.gameview.json"",
                ""../escape.gameview.json"",
                ""/absolute.levelboard.json"",
                ""https://example.test/hud.hud.html""
              ]
            }")).ToArray();

            CollectionAssert.AreEqual(new[] { "levels/arena.gameview.json" }, names);
        }

        [Test]
        public void ExtractArtifactNamesIgnoresNonStringDaemonFields()
        {
            string[] names = ExtractArtifactNames(JObject.Parse(@"{
              ""fileName"": { ""path"": ""levels/object.gameview.json"" },
              ""path"": 7,
              ""writtenFileNames"": [
                { ""path"": ""levels/nested.gameview.json"" },
                true,
                ""levels/arena.gameview.json""
              ],
              ""file"": {
                ""name"": [""levels/array.gameview.json""],
                ""path"": ""hud/main.hud.html""
              },
              ""artifact"": {
                ""fileName"": 42,
                ""path"": ""world/DESIGN.md""
              }
            }")).ToArray();

            CollectionAssert.AreEqual(
                new[] { "levels/arena.gameview.json", "hud/main.hud.html", "world/DESIGN.md" },
                names);
        }

        [Test]
        public void NonRefreshSyncEventsRequireStringTypeAndActionFields()
        {
            Assert.True(IsNonRefreshSyncEvent(JObject.Parse(@"{""type"":""unity_edit"",""fileName"":""levels/arena.gameview.json""}")));
            Assert.True(IsNonRefreshSyncEvent(JObject.Parse(@"{""type"":""round_trip_merge"",""action"":""conflict"",""fileName"":""levels/arena.gameview.json""}")));
            Assert.True(IsNonRefreshSyncEvent(JObject.Parse(@"{""type"":""round_trip_merge"",""action"":""unity-edit-merged"",""fileName"":""levels/arena.gameview.json""}")));

            Assert.False(IsNonRefreshSyncEvent(JObject.Parse(@"{""type"":{""name"":""unity_edit""},""fileName"":""levels/arena.gameview.json""}")));
            Assert.False(IsNonRefreshSyncEvent(JObject.Parse(@"{""type"":""round_trip_merge"",""action"":[""conflict""],""fileName"":""levels/arena.gameview.json""}")));
        }

        [Test]
        public void RequestsUnityPackageRefreshForGameviewAssetSources()
        {
            Assert.True(ShouldRequestUnityPackageRefresh(
                "levels/arena.gameview.json",
                @"{""actors"":[{""id"":""boss"",""meshSource"":""assets/boss.fbx"",""materialSource"":""assets/boss.mat""}]}"
            ));
        }

        [Test]
        public void RequestsUnityPackageRefreshForImportedAssetManifestRecords()
        {
            Assert.True(ShouldRequestUnityPackageRefresh(
                "levels/arena.gameview",
                @"{""actors"":[{""id"":""boss"",""greyboxImportedAssets"":[{""path"":""Assets/Greybox/Imported/abc123/Boss.fbx""}]}]}"
            ));
        }

        [Test]
        public void UnityPackageReferenceScanIsBounded()
        {
            int maxDepth = PrivateIntConstant("MaxUnityPackageReferenceScanDepth");
            int maxNodes = PrivateIntConstant("MaxUnityPackageReferenceScanNodes");
            int maxStringChars = PrivateIntConstant("MaxUnityPackageReferenceStringChars");

            Assert.True(ShouldRequestUnityPackageRefresh(
                "levels/arena.gameview.json",
                NestedPackageReferenceJson(2)
            ));
            Assert.False(ShouldRequestUnityPackageRefresh(
                "levels/arena.gameview.json",
                NestedPackageReferenceJson(maxDepth + 1)
            ));
            Assert.False(ShouldRequestUnityPackageRefresh(
                "levels/arena.gameview.json",
                WidePackageReferenceJson(maxNodes + 1)
            ));
            Assert.False(ShouldRequestUnityPackageRefresh(
                "levels/arena.gameview.json",
                @"{""actors"":[{""meshSource"":""" + new string('a', maxStringChars + 1) + @"""}]}"
            ));
        }

        [Test]
        public void IgnoresHudAndGameviewChangesWithoutUnityAssetReferences()
        {
            Assert.False(ShouldRequestUnityPackageRefresh("hud/main.hud.html", @"<div data-slot=""top"">Score</div>"));
            Assert.False(ShouldRequestUnityPackageRefresh("levels/arena.gameview.json", @"{""actors"":[{""id"":""boss"",""health"":3}]}"));
        }

        [Test]
        public void ContentSafetyRejectsEmptyOversizedAndMalformedRawArtifacts()
        {
            int maxArtifactBytes = PrivateIntConstant("MaxArtifactBytes");

            Assert.False(IsContentSafeForAsset("levels/arena.gameview.json", ""));
            Assert.False(IsContentSafeForAsset("levels/arena.gameview.json", new string('x', maxArtifactBytes + 1)));
            Assert.False(IsContentSafeForAsset("levels/arena.gameview.json", "{nope"));
            Assert.False(IsContentSafeForAsset("hud/main.hud.html", "<div>HUD</div>"));
            Assert.True(IsContentSafeForAsset("levels/arena.gameview.json", @"{""actors"":[]}"));
            Assert.True(IsContentSafeForAsset("hud/main.hud.html", @"<meta name=""generator"" content=""Greybox + Noor Designer"">"));
            Assert.True(IsContentSafeForAsset("world/DESIGN.md", "# Art Bible\n"));
        }

        [Test]
        public void ArtifactTextWritesReplaceExistingAssetsWithoutTempResidue()
        {
            string root = Path.Combine("Assets", "GreyboxAtomicRefreshTest-" + System.Guid.NewGuid().ToString("N"));
            try
            {
                Directory.CreateDirectory(root);
                string assetPath = Path.Combine(root, "arena.gameview").Replace('\\', '/');
                File.WriteAllText(assetPath, @"{""title"":""stale""}");

                Assert.True(TryWriteArtifactText(assetPath, @"{""title"":""fresh""}"));

                Assert.AreEqual(@"{""title"":""fresh""}", File.ReadAllText(assetPath));
                Assert.AreEqual(0, Directory.GetFiles(root, "*.greybox-tmp-*").Length);
            }
            finally
            {
                if (Directory.Exists(root)) Directory.Delete(root, true);
            }
        }

        [Test]
        public void ArtifactTextWritesFailClosedForUnsafeTargets()
        {
            Assert.False(TryWriteArtifactText("../ProjectSettings/ProjectSettings.asset", "{}"));
            Assert.False(TryWriteArtifactText("Assets/GreyboxGenerated/Artifacts/arena.txt", "{}"));
            Assert.False(TryWriteArtifactText("Assets/GreyboxGenerated/Artifacts/arena.gameview", ""));
        }

        private static string NestedPackageReferenceJson(int wrappers)
        {
            return string.Concat(Enumerable.Repeat(@"{""child"":", wrappers))
                + @"{""meshSource"":""assets/boss.fbx""}"
                + new string('}', wrappers);
        }

        private static string WidePackageReferenceJson(int emptyNodesBeforeReference)
        {
            var nodes = Enumerable.Repeat(@"{}", emptyNodesBeforeReference)
                .Concat(new[] { @"{""meshSource"":""assets/boss.fbx""}" });
            return @"{""actors"":[" + string.Join(",", nodes) + "]}";
        }

        private static string GeneratedImportAssetPath(string artifactName)
        {
            return (string)typeof(GreyboxArtifactRefresher)
                .GetMethod("GeneratedImportAssetPath", BindingFlags.Static | BindingFlags.NonPublic)
                .Invoke(null, new object[] { artifactName });
        }

        private static bool ShouldRequestUnityPackageRefresh(string artifactName, string content)
        {
            return (bool)typeof(GreyboxArtifactRefresher)
                .GetMethod("ShouldRequestUnityPackageRefresh", BindingFlags.Static | BindingFlags.NonPublic)
                .Invoke(null, new object[] { artifactName, content });
        }

        private static string BuildRawArtifactUrl(GreyboxConfig config, string artifactName)
        {
            return (string)typeof(GreyboxArtifactRefresher)
                .GetMethod("BuildRawArtifactUrl", BindingFlags.Static | BindingFlags.NonPublic)
                .Invoke(null, new object[] { config, artifactName });
        }

        private static IEnumerable<string> ExtractArtifactNames(JObject payload)
        {
            return (IEnumerable<string>)typeof(GreyboxArtifactRefresher)
                .GetMethod("ExtractArtifactNames", BindingFlags.Static | BindingFlags.NonPublic)
                .Invoke(null, new object[] { payload });
        }

        private static bool IsNonRefreshSyncEvent(JObject payload)
        {
            return (bool)typeof(GreyboxArtifactRefresher)
                .GetMethod("IsNonRefreshSyncEvent", BindingFlags.Static | BindingFlags.NonPublic)
                .Invoke(null, new object[] { payload });
        }

        private static bool IsSafeDaemonArtifactName(string artifactName)
        {
            return (bool)typeof(GreyboxArtifactRefresher)
                .GetMethod("IsSafeDaemonArtifactName", BindingFlags.Static | BindingFlags.NonPublic)
                .Invoke(null, new object[] { artifactName });
        }

        private static bool IsContentSafeForAsset(string artifactName, string content)
        {
            return (bool)typeof(GreyboxArtifactRefresher)
                .GetMethod("IsContentSafeForAsset", BindingFlags.Static | BindingFlags.NonPublic)
                .Invoke(null, new object[] { artifactName, content });
        }

        private static bool TryWriteArtifactText(string assetPath, string content)
        {
            return (bool)typeof(GreyboxArtifactRefresher)
                .GetMethod("TryWriteArtifactText", BindingFlags.Static | BindingFlags.NonPublic)
                .Invoke(null, new object[] { assetPath, content });
        }

        private static int PrivateIntConstant(string name)
        {
            return (int)typeof(GreyboxArtifactRefresher)
                .GetField(name, BindingFlags.Static | BindingFlags.NonPublic)
                .GetRawConstantValue();
        }
    }
}
