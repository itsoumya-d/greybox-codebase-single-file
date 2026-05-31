// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System;
using System.IO;
using System.Linq;
using System.Reflection;
using Greybox.Editor.Importers;
using NUnit.Framework;

namespace Greybox.Tests.EditMode
{
    public sealed class GreyboxProjectArtifactImporterTests
    {
        [Test]
        public void RecognizesUnityProjectArtifactPathsOnlyInsideAssets()
        {
            Assert.True(IsProjectArtifactPath("Assets/Samples/platformer.gameview"));
            Assert.True(IsProjectArtifactPath("Assets/Samples/platformer.gameview.json"));
            Assert.True(IsProjectArtifactPath("Assets/Samples/platformer.levelboard"));
            Assert.True(IsProjectArtifactPath("Assets/Samples/platformer.levelboard.json"));
            Assert.True(IsProjectArtifactPath("Assets/Samples/platformer.gbhud"));
            Assert.True(IsProjectArtifactPath("Assets/Samples/platformer.hud.html"));
            Assert.True(IsProjectArtifactPath("Assets/Samples/platformer.design"));
            Assert.True(IsProjectArtifactPath("Assets/Samples/DESIGN.md"));
            Assert.False(IsProjectArtifactPath("Assets/Samples/README.md"));
            Assert.False(IsProjectArtifactPath("Assets/../Samples/platformer.gameview.json"));
            Assert.False(IsProjectArtifactPath("Assets/Samples/./platformer.gameview.json"));
            Assert.False(IsProjectArtifactPath("Assets/Samples//platformer.gameview.json"));
            Assert.False(IsProjectArtifactPath("Assets/Samples/\nplatformer.gameview.json"));
            Assert.False(IsProjectArtifactPath("Packages/com.greybox.studio/Samples~/2D Platformer/platformer.gameview"));
        }

        [Test]
        public void FindsProjectArtifactsUnderSelectedRoots()
        {
            string root = Path.Combine("Assets", "GreyboxImporterTest-" + Guid.NewGuid().ToString("N"));
            try
            {
                Directory.CreateDirectory(root);
                Directory.CreateDirectory(Path.Combine(root, "Nested"));
                File.WriteAllText(Path.Combine(root, "arena.gameview.json"), "{}");
                File.WriteAllText(Path.Combine(root, "Nested", "arena.hud.html"), "<section data-greybox-artifact=\"hud\"></section>");
                File.WriteAllText(Path.Combine(root, "Nested", "floor.levelboard.json"), "{}");
                File.WriteAllText(Path.Combine(root, "Nested", "DESIGN.md"), "# Palette\n- Spark: #FF6B35\n");
                File.WriteAllText(Path.Combine(root, "notes.md"), "ignore me");

                string[] artifacts = FindProjectArtifactAssetPaths(root).OrderBy(path => path, StringComparer.Ordinal).ToArray();

                CollectionAssert.AreEqual(new[]
                {
                    $"{root}/Nested/DESIGN.md",
                    $"{root}/Nested/arena.hud.html",
                    $"{root}/Nested/floor.levelboard.json",
                    $"{root}/arena.gameview.json",
                }, artifacts);
            }
            finally
            {
                if (Directory.Exists(root)) Directory.Delete(root, true);
            }
        }

        [Test]
        public void MapsCanonicalDaemonArtifactsToUnityImporterAssets()
        {
            Assert.AreEqual("Assets/Samples/platformer.gameview", UnityImportAssetPath("Assets/Samples/platformer.gameview.json"));
            Assert.AreEqual("Assets/Samples/floor.levelboard", UnityImportAssetPath("Assets/Samples/floor.levelboard.json"));
            Assert.AreEqual("Assets/Samples/main.gbhud", UnityImportAssetPath("Assets/Samples/main.hud.html"));
            Assert.AreEqual("Assets/Samples/Samples.design", UnityImportAssetPath("Assets/Samples/DESIGN.md"));
            Assert.AreEqual("Assets/Samples/art-bible.design", UnityImportAssetPath("Assets/Samples/art-bible.design"));
            Assert.AreEqual("", UnityImportAssetPath("Assets/../Samples/platformer.gameview.json"));
            Assert.AreEqual("", UnityImportAssetPath("Assets/Samples/./platformer.gameview.json"));
            Assert.AreEqual("", UnityImportAssetPath("Assets/Samples//platformer.gameview.json"));
            Assert.AreEqual("", UnityImportAssetPath("Assets/Samples/\nplatformer.gameview.json"));
        }

        [Test]
        public void PrefersCanonicalDaemonArtifactsOverUnityMirrors()
        {
            string root = Path.Combine("Assets", "GreyboxCanonicalDedupeTest-" + Guid.NewGuid().ToString("N"));
            try
            {
                Directory.CreateDirectory(root);
                File.WriteAllText(Path.Combine(root, "arena.gameview.json"), @"{""title"":""Fresh Arena""}");
                File.WriteAllText(Path.Combine(root, "arena.gameview"), @"{""title"":""Stale Arena""}");
                File.WriteAllText(Path.Combine(root, "floor.levelboard.json"), @"{""title"":""Fresh Floor""}");
                File.WriteAllText(Path.Combine(root, "floor.levelboard"), @"{""title"":""Stale Floor""}");
                File.WriteAllText(Path.Combine(root, "main.hud.html"), "<section data-greybox-artifact=\"hud\">fresh</section>");
                File.WriteAllText(Path.Combine(root, "main.gbhud"), "<section data-greybox-artifact=\"hud\">stale</section>");

                string[] artifacts = FindProjectArtifactAssetPaths(root);

                CollectionAssert.AreEquivalent(new[]
                {
                    $"{root}/arena.gameview.json",
                    $"{root}/floor.levelboard.json",
                    $"{root}/main.hud.html",
                }, artifacts);
            }
            finally
            {
                if (Directory.Exists(root)) Directory.Delete(root, true);
            }
        }

        [Test]
        public void ProjectArtifactDiscoveryCapsCandidateCount()
        {
            string root = Path.Combine("Assets", "GreyboxCandidateCapTest-" + Guid.NewGuid().ToString("N"));
            try
            {
                Directory.CreateDirectory(root);
                int maxCandidates = PrivateIntConstant("MaxProjectArtifactCandidates");
                Assert.LessOrEqual(maxCandidates, PrivateIntConstant("MaxProjectArtifactScanFiles"));

                for (int index = 0; index < maxCandidates + 8; index++)
                {
                    File.WriteAllText(Path.Combine(root, $"arena-{index:0000}.gameview.json"), "{}");
                }

                string[] artifacts = FindProjectArtifactAssetPaths(root);

                Assert.AreEqual(maxCandidates, artifacts.Length);
                Assert.True(artifacts.All(path => path.StartsWith(root.Replace('\\', '/') + "/", StringComparison.Ordinal)));
            }
            finally
            {
                if (Directory.Exists(root)) Directory.Delete(root, true);
            }
        }

        [Test]
        public void CreatesUnityImporterMirrorForCanonicalDaemonArtifacts()
        {
            string root = Path.Combine("Assets", "GreyboxImporterMirrorTest-" + Guid.NewGuid().ToString("N"));
            try
            {
                Directory.CreateDirectory(root);
                string daemonPath = Path.Combine(root, "arena.gameview.json");
                string json = @"{""title"":""Arena""}";
                File.WriteAllText(daemonPath, json);

                string importPath = EnsureUnityImportAsset(daemonPath);

                Assert.AreEqual($"{root}/arena.gameview", importPath.Replace('\\', '/'));
                Assert.True(File.Exists(importPath));
                Assert.AreEqual(json, File.ReadAllText(importPath));
                Assert.AreEqual(0, Directory.GetFiles(root, "*.greybox-tmp-*").Length);
            }
            finally
            {
                if (Directory.Exists(root)) Directory.Delete(root, true);
            }
        }

        [Test]
        public void PostprocessorCreatesExactContentMirrorsForDroppedCanonicalDaemonArtifacts()
        {
            string root = Path.Combine("Assets", "GreyboxPostprocessorMirrorTest-" + Guid.NewGuid().ToString("N"));
            try
            {
                Directory.CreateDirectory(root);
                string gameviewPath = Path.Combine(root, "arena.gameview.json");
                string levelboardPath = Path.Combine(root, "floor.levelboard.json");
                string hudPath = Path.Combine(root, "main.hud.html");
                string gameview = @"{""title"":""Arena"",""actors"":[],""spawnPoints"":[],""objectives"":[],""hazards"":[]}";
                string levelboard = @"{""title"":""Floor"",""rooms"":[],""encounters"":[]}";
                string hud = "<section data-greybox-artifact=\"hud\">ready</section>";
                File.WriteAllText(gameviewPath, gameview);
                File.WriteAllText(levelboardPath, levelboard);
                File.WriteAllText(hudPath, hud);

                Assert.AreEqual(3, MirrorCanonicalDaemonArtifacts(gameviewPath, levelboardPath, hudPath));

                Assert.AreEqual(gameview, File.ReadAllText(Path.Combine(root, "arena.gameview")));
                Assert.AreEqual(levelboard, File.ReadAllText(Path.Combine(root, "floor.levelboard")));
                Assert.AreEqual(hud, File.ReadAllText(Path.Combine(root, "main.gbhud")));
                Assert.AreEqual(0, Directory.GetFiles(root, "*.greybox-tmp-*").Length);
            }
            finally
            {
                if (Directory.Exists(root)) Directory.Delete(root, true);
            }
        }

        [Test]
        public void PostprocessorSkipsUnityMirrorAndDesignInputs()
        {
            string root = Path.Combine("Assets", "GreyboxPostprocessorSkipTest-" + Guid.NewGuid().ToString("N"));
            try
            {
                Directory.CreateDirectory(root);
                string gameviewPath = Path.Combine(root, "arena.gameview");
                string levelboardPath = Path.Combine(root, "floor.levelboard");
                string hudPath = Path.Combine(root, "main.gbhud");
                string designPath = Path.Combine(root, "art-bible.design");
                string markdownPath = Path.Combine(root, "DESIGN.md");
                File.WriteAllText(gameviewPath, @"{""title"":""Mirror Arena""}");
                File.WriteAllText(levelboardPath, @"{""title"":""Mirror Floor""}");
                File.WriteAllText(hudPath, "<section data-greybox-artifact=\"hud\">mirror</section>");
                File.WriteAllText(designPath, "# Existing design\n");
                File.WriteAllText(markdownPath, "# Design markdown\n");

                Assert.AreEqual(0, MirrorCanonicalDaemonArtifacts(gameviewPath, levelboardPath, hudPath, designPath, markdownPath));

                Assert.AreEqual(@"{""title"":""Mirror Arena""}", File.ReadAllText(gameviewPath));
                Assert.AreEqual(@"{""title"":""Mirror Floor""}", File.ReadAllText(levelboardPath));
                Assert.AreEqual("<section data-greybox-artifact=\"hud\">mirror</section>", File.ReadAllText(hudPath));
                Assert.AreEqual("# Existing design\n", File.ReadAllText(designPath));
            }
            finally
            {
                if (Directory.Exists(root)) Directory.Delete(root, true);
            }
        }

        [Test]
        public void PostprocessorRejectsOversizedCanonicalHudSourceBeforeMirrorWrite()
        {
            string root = Path.Combine("Assets", "GreyboxPostprocessorOversizedHudTest-" + Guid.NewGuid().ToString("N"));
            try
            {
                Directory.CreateDirectory(root);
                string hudPath = Path.Combine(root, "main.hud.html");
                File.WriteAllText(hudPath, new string('x', PrivateIntConstant("MaxHudMirrorBytes") + 1));

                Assert.AreEqual(0, MirrorCanonicalDaemonArtifacts(hudPath));

                Assert.False(File.Exists(Path.Combine(root, "main.gbhud")));
                Assert.AreEqual(0, Directory.GetFiles(root, "*.greybox-tmp-*").Length);
            }
            finally
            {
                if (Directory.Exists(root)) Directory.Delete(root, true);
            }
        }

        [Test]
        public void OnPostprocessAllAssetsMirrorsMovedCanonicalDaemonArtifacts()
        {
            string root = Path.Combine("Assets", "GreyboxPostprocessorMovedTest-" + Guid.NewGuid().ToString("N"));
            try
            {
                Directory.CreateDirectory(root);
                string movedPath = Path.Combine(root, "moved.levelboard.json");
                string levelboard = @"{""title"":""Moved Floor"",""rooms"":[],""encounters"":[]}";
                File.WriteAllText(movedPath, levelboard);

                InvokeOnPostprocessAllAssets(Array.Empty<string>(), Array.Empty<string>(), new[] { movedPath }, new[] { "Assets/Old/moved.levelboard.json" });

                Assert.AreEqual(levelboard, File.ReadAllText(Path.Combine(root, "moved.levelboard")));
                Assert.AreEqual(0, Directory.GetFiles(root, "*.greybox-tmp-*").Length);
            }
            finally
            {
                if (Directory.Exists(root)) Directory.Delete(root, true);
            }
        }

        [Test]
        public void CreatesUnityImporterMirrorForDesignMarkdown()
        {
            string root = Path.Combine("Assets", "GreyboxDesignMirrorTest-" + Guid.NewGuid().ToString("N"));
            try
            {
                Directory.CreateDirectory(root);
                string markdownPath = Path.Combine(root, "DESIGN.md");
                string markdown = "# Palette\n- Spark: #FF6B35\n";
                File.WriteAllText(markdownPath, markdown);

                string importPath = EnsureUnityImportAsset(markdownPath);

                Assert.AreEqual($"{root}/{Path.GetFileName(root)}.design", importPath.Replace('\\', '/'));
                Assert.True(File.Exists(importPath));
                Assert.AreEqual(markdown, File.ReadAllText(importPath));
                Assert.AreEqual(0, Directory.GetFiles(root, "*.greybox-tmp-*").Length);
            }
            finally
            {
                if (Directory.Exists(root)) Directory.Delete(root, true);
            }
        }

        [Test]
        public void RejectsOversizedProjectArtifactMirrorsBeforeImport()
        {
            string root = Path.Combine("Assets", "GreyboxOversizedMirrorTest-" + Guid.NewGuid().ToString("N"));
            try
            {
                Directory.CreateDirectory(root);
                string hudPath = Path.Combine(root, "main.hud.html");
                File.WriteAllText(hudPath, new string('x', PrivateIntConstant("MaxHudMirrorBytes") + 1));

                string importPath = EnsureUnityImportAsset(hudPath);

                Assert.AreEqual("", importPath);
                Assert.False(File.Exists(Path.Combine(root, "main.gbhud")));
            }
            finally
            {
                if (Directory.Exists(root)) Directory.Delete(root, true);
            }
        }

        [Test]
        public void PrefersDesignMarkdownWhenProxyDesignAssetAlreadyExists()
        {
            string root = Path.Combine("Assets", "GreyboxDesignDedupeTest-" + Guid.NewGuid().ToString("N"));
            try
            {
                Directory.CreateDirectory(root);
                File.WriteAllText(Path.Combine(root, "DESIGN.md"), "# Palette\n- Spark: #FF6B35\n");
                File.WriteAllText(Path.Combine(root, $"{Path.GetFileName(root)}.design"), "# Stale proxy\n- Old: #000000\n");

                string[] artifacts = FindProjectArtifactAssetPaths(root).ToArray();

                CollectionAssert.AreEqual(new[] { $"{root}/DESIGN.md" }, artifacts);
            }
            finally
            {
                if (Directory.Exists(root)) Directory.Delete(root, true);
            }
        }

        [Test]
        public void PrefersDesignMarkdownAcrossExplicitFileSelections()
        {
            string root = Path.Combine("Assets", "GreyboxDesignFileSelectionTest-" + Guid.NewGuid().ToString("N"));
            try
            {
                Directory.CreateDirectory(root);
                string markdownPath = Path.Combine(root, "DESIGN.md");
                string proxyPath = Path.Combine(root, $"{Path.GetFileName(root)}.design");
                File.WriteAllText(markdownPath, "# Palette\n- Spark: #FF6B35\n");
                File.WriteAllText(proxyPath, "# Stale proxy\n- Old: #000000\n");

                string[] artifacts = FindProjectArtifactAssetPaths(proxyPath, markdownPath);

                CollectionAssert.AreEqual(new[] { markdownPath.Replace('\\', '/') }, artifacts);
            }
            finally
            {
                if (Directory.Exists(root)) Directory.Delete(root, true);
            }
        }

        [Test]
        public void PrefersDesignMarkdownWhenOnlyProxyDesignAssetIsSelected()
        {
            string root = Path.Combine("Assets", "GreyboxDesignProxySelectionTest-" + Guid.NewGuid().ToString("N"));
            try
            {
                Directory.CreateDirectory(root);
                string markdownPath = Path.Combine(root, "DESIGN.md");
                string proxyPath = Path.Combine(root, $"{Path.GetFileName(root)}.design");
                File.WriteAllText(markdownPath, "# Palette\n- Spark: #FF6B35\n");
                File.WriteAllText(proxyPath, "# Stale proxy\n- Old: #000000\n");

                string[] artifacts = FindProjectArtifactAssetPaths(proxyPath);

                CollectionAssert.AreEqual(new[] { markdownPath.Replace('\\', '/') }, artifacts);
            }
            finally
            {
                if (Directory.Exists(root)) Directory.Delete(root, true);
            }
        }

        private static bool IsProjectArtifactPath(string path)
        {
            return (bool)typeof(GreyboxProjectArtifactImporter)
                .GetMethod("IsProjectArtifactPath", BindingFlags.Static | BindingFlags.NonPublic)
                .Invoke(null, new object[] { path });
        }

        private static string[] FindProjectArtifactAssetPaths(string root)
        {
            return FindProjectArtifactAssetPaths(new[] { root });
        }

        private static string[] FindProjectArtifactAssetPaths(params string[] roots)
        {
            return ((System.Collections.Generic.IEnumerable<string>)typeof(GreyboxProjectArtifactImporter)
                    .GetMethod("FindProjectArtifactAssetPaths", BindingFlags.Static | BindingFlags.NonPublic)
                    .Invoke(null, new object[] { roots }))
                .ToArray();
        }

        private static string UnityImportAssetPath(string path)
        {
            return (string)typeof(GreyboxProjectArtifactImporter)
                .GetMethod("UnityImportAssetPath", BindingFlags.Static | BindingFlags.NonPublic)
                .Invoke(null, new object[] { path });
        }

        private static string EnsureUnityImportAsset(string path)
        {
            return (string)typeof(GreyboxProjectArtifactImporter)
                .GetMethod("EnsureUnityImportAsset", BindingFlags.Static | BindingFlags.NonPublic)
                .Invoke(null, new object[] { path });
        }

        private static int MirrorCanonicalDaemonArtifacts(params string[] paths)
        {
            return (int)typeof(GreyboxProjectArtifactPostprocessor)
                .GetMethod("MirrorCanonicalDaemonArtifacts", BindingFlags.Static | BindingFlags.NonPublic)
                .Invoke(null, new object[] { paths });
        }

        private static void InvokeOnPostprocessAllAssets(string[] importedAssets, string[] deletedAssets, string[] movedAssets, string[] movedFromAssetPaths)
        {
            typeof(GreyboxProjectArtifactPostprocessor)
                .GetMethod("OnPostprocessAllAssets", BindingFlags.Static | BindingFlags.NonPublic)
                .Invoke(null, new object[] { importedAssets, deletedAssets, movedAssets, movedFromAssetPaths });
        }

        private static int PrivateIntConstant(string name)
        {
            return (int)typeof(GreyboxProjectArtifactImporter)
                .GetField(name, BindingFlags.Static | BindingFlags.NonPublic)
                .GetRawConstantValue();
        }
    }
}
