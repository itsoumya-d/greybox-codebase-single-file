// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System.Reflection;
using Greybox.Editor.Generation;
using Greybox.Editor.Sync;
using Greybox.Runtime;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.UIElements;
using UnityEngine.Tilemaps;

namespace Greybox.Tests.EditMode
{
    public sealed class PrefabAssetExporterTests
    {
        [Test]
        public void BuildsStableGeneratedPrefabPaths()
        {
            Assert.AreEqual(
                "Assets/Greybox/Generated/project-a/GameViewports/levels-arena.prefab",
                PrefabAssetExporter.GeneratedPrefabPath(GreyboxArtifactKind.GameViewport, "Assets/GreyboxGenerated/Artifacts/levels/arena.gameview", "Project A"));

            Assert.AreEqual(
                "Assets/Greybox/Generated/local/LevelBoards/floor.prefab",
                PrefabAssetExporter.GeneratedPrefabPath(GreyboxArtifactKind.LevelBoard, "Assets/GreyboxGenerated/Artifacts/floor.levelboard", ""));

            Assert.AreEqual(
                "Assets/Greybox/Generated/project-a/HudLayouts/hud-combat.prefab",
                PrefabAssetExporter.GeneratedPrefabPath(GreyboxArtifactKind.HudLayout, "Assets/GreyboxGenerated/Artifacts/hud/combat.gbhud", "Project A"));
        }

        [Test]
        public void GeneratedPrefabPathsIncludeArtifactFoldersToAvoidCollisions()
        {
            Assert.AreNotEqual(
                PrefabAssetExporter.GeneratedPrefabPath(GreyboxArtifactKind.GameViewport, "Assets/GreyboxGenerated/Artifacts/levels/arena.gameview", "Project A"),
                PrefabAssetExporter.GeneratedPrefabPath(GreyboxArtifactKind.GameViewport, "Assets/GreyboxGenerated/Artifacts/boss/arena.gameview", "Project A"));

            Assert.AreEqual(
                "Assets/Greybox/Generated/project-a/GameViewports/boss-arena.prefab",
                PrefabAssetExporter.GeneratedPrefabPath(GreyboxArtifactKind.GameViewport, "Assets/GreyboxGenerated/Artifacts/boss/arena.gameview", "Project A"));
        }

        [Test]
        public void GeneratedAssetPathsRejectTraversalLikeSegments()
        {
            string path = PrefabAssetExporter.GeneratedPrefabPath(
                GreyboxArtifactKind.GameViewport,
                "Assets/GreyboxGenerated/Artifacts/../levels/../../arena.gameview",
                "..");

            Assert.AreEqual("Assets/Greybox/Generated/local/GameViewports/levels-arena.prefab", path);
            StringAssert.DoesNotContain("/../", path);
            StringAssert.DoesNotContain("/./", path);
            Assert.LessOrEqual(GreyboxGeneratedAssetPaths.SafeSegment(new string('A', 120)).Length, 80);
        }

        [Test]
        public void GeneratedProjectSlugsUseSafeProjectScope()
        {
            Assert.AreEqual("project-a", GreyboxGeneratedAssetPaths.ProjectSlug(" Project A "));
            Assert.AreEqual("local", GreyboxGeneratedAssetPaths.ProjectSlug(""));
            Assert.AreEqual("local", GreyboxGeneratedAssetPaths.ProjectSlug("project/42"));
            Assert.AreEqual("local", GreyboxGeneratedAssetPaths.ProjectSlug("https://example.test/project-42"));
            Assert.AreEqual("local", GreyboxGeneratedAssetPaths.ProjectSlug("project\n42"));

            Assert.AreEqual(
                "Assets/Greybox/Generated/local/GameViewports/levels-arena.prefab",
                PrefabAssetExporter.GeneratedPrefabPath(
                    GreyboxArtifactKind.GameViewport,
                    "Assets/GreyboxGenerated/Artifacts/levels/arena.gameview",
                    "project/42"));
        }

        [Test]
        public void GameViewportImportProducesNavigablePrefab()
        {
            string projectId = "prefab-test-" + System.Guid.NewGuid().ToString("N");
            string sourcePath = "Assets/GreyboxGenerated/Artifacts/levels/arena.gameview";
            string prefabPath = PrefabAssetExporter.GeneratedPrefabPath(GreyboxArtifactKind.GameViewport, sourcePath, projectId);
            string projectFolder = ProjectFolder(prefabPath);
            var root = PrefabBuilder.BuildFromGameViewport(
                JObject.Parse(@"{""title"":""Arena"",""spawnPoints"":[{""id"":""spawn-a"",""position"":{""x"":1,""y"":2,""z"":3}}]}"),
                sourcePath);

            try
            {
                string exportedPath = PrefabAssetExporter.ExportGameViewportPrefab(root, sourcePath, projectId);
                var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(exportedPath);

                Assert.AreEqual(prefabPath, exportedPath);
                Assert.NotNull(prefab);
                var marker = prefab.transform.Find("Spawn Points/spawn-a").GetComponent<GreyboxMarker>();
                Assert.NotNull(marker);
                Assert.AreEqual("$.spawnPoints[id=spawn-a]", marker.JsonPath);
                Assert.AreEqual("$.spawnPoints[id=spawn-a].position", marker.PositionJsonPath);
                var imported = prefab.GetComponent<GreyboxImportedArtifact>();
                Assert.NotNull(imported);
                Assert.AreEqual(GreyboxArtifactKind.GameViewport, imported.Kind);
                Assert.AreEqual(sourcePath, imported.SourcePath);
                Assert.AreEqual(prefabPath, imported.CanonicalGeneratedAssetPath);
                Assert.AreEqual(exportedPath, imported.ExportedAssetPath);
                Assert.False(imported.ExportedToIncomingSidecar);
            }
            finally
            {
                Object.DestroyImmediate(root);
                AssetDatabase.DeleteAsset(projectFolder);
            }
        }

        [Test]
        public void ExportedPrefabMetadataRejectsUnsafeSourcePaths()
        {
            string projectId = "prefab-source-path-test-" + System.Guid.NewGuid().ToString("N");
            string sourcePath = "../ProjectSettings/ProjectSettings.asset";
            string prefabPath = PrefabAssetExporter.GeneratedPrefabPath(GreyboxArtifactKind.GameViewport, sourcePath, projectId);
            string projectFolder = ProjectFolder(prefabPath);
            var root = PrefabBuilder.BuildFromGameViewport(
                JObject.Parse(@"{""title"":""Arena"",""spawnPoints"":[{""id"":""spawn-a"",""position"":{""x"":1,""y"":2,""z"":3}}]}"),
                sourcePath);

            try
            {
                string exportedPath = PrefabAssetExporter.ExportGameViewportPrefab(root, sourcePath, projectId);
                var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(exportedPath);

                Assert.AreEqual(prefabPath, exportedPath);
                Assert.NotNull(prefab);
                var imported = prefab.GetComponent<GreyboxImportedArtifact>();
                Assert.NotNull(imported);
                Assert.AreEqual("", imported.SourcePath);
                Assert.AreEqual(prefabPath, imported.CanonicalGeneratedAssetPath);
                Assert.AreEqual(exportedPath, imported.ExportedAssetPath);
                Assert.False(imported.ExportedToIncomingSidecar);
            }
            finally
            {
                Object.DestroyImmediate(root);
                AssetDatabase.DeleteAsset(projectFolder);
            }
        }

        [Test]
        public void HudLayoutImportProducesNavigablePrefab()
        {
            string projectId = "hud-prefab-test-" + System.Guid.NewGuid().ToString("N");
            string sourcePath = "Assets/GreyboxGenerated/Artifacts/hud/combat.gbhud";
            string prefabPath = PrefabAssetExporter.GeneratedPrefabPath(GreyboxArtifactKind.HudLayout, sourcePath, projectId);
            string projectFolder = ProjectFolder(prefabPath);
            var root = HudLayoutBuilder.BuildFromHudHtml(
                @"<section data-greybox-artifact=""hud"" data-layout=""platformer-horizontal""><header data-slot=""top-left"" data-agds-id=""hud-hearts""><span data-role=""value"">3</span></header><footer data-slot=""bottom"" data-agds-id=""hud-action""><button data-action=""start-run"">START</button></footer></section>",
                sourcePath);

            try
            {
                string exportedPath = PrefabAssetExporter.ExportHudLayoutPrefab(root, sourcePath, projectId);
                var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(exportedPath);

                Assert.AreEqual(prefabPath, exportedPath);
                Assert.NotNull(prefab);
                Assert.NotNull(prefab.GetComponent<Canvas>());
                Assert.AreEqual(prefabPath, prefab.GetComponent<GreyboxImportedArtifact>().ExportedAssetPath);
                var binding = prefab.transform.Find("hud-action/start-run").GetComponent<GreyboxHudBinding>();
                Assert.NotNull(binding);
                Assert.AreEqual("start-run", binding.Action);
                Assert.AreEqual("//*[@data-agds-id=\"hud-action\"]/*[@data-role=\"start-run\"]", binding.JsonPath);
            }
            finally
            {
                Object.DestroyImmediate(root);
                AssetDatabase.DeleteAsset(projectFolder);
            }
        }

        [Test]
        public void UiToolkitHudLayoutImportProducesNavigablePrefab()
        {
            string projectId = "hud-uitoolkit-prefab-test-" + System.Guid.NewGuid().ToString("N");
            string sourcePath = "Assets/GreyboxGenerated/Artifacts/hud/combat.gbhud";
            string prefabPath = PrefabAssetExporter.GeneratedPrefabPath(GreyboxArtifactKind.HudLayout, sourcePath, projectId);
            string projectFolder = ProjectFolder(prefabPath);
            HudLayoutBuilder.BuildResult result = HudLayoutBuilder.BuildHudLayout(
                @"<section data-greybox-artifact=""hud"" data-layout=""platformer-horizontal"" data-greybox-renderer=""ui-toolkit""><header data-slot=""top-left"" data-agds-id=""hud-hearts""><span data-role=""value"">3</span></header></section>",
                sourcePath);

            try
            {
                string exportedPath = PrefabAssetExporter.ExportHudLayoutPrefab(result.Root, sourcePath, projectId);
                var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(exportedPath);

                Assert.AreEqual(prefabPath, exportedPath);
                Assert.NotNull(prefab);
                Assert.NotNull(prefab.GetComponent<UIDocument>());
                var hud = prefab.GetComponent<GreyboxUiToolkitHud>();
                Assert.NotNull(hud);
                Assert.True(hud.Elements.Exists(element => element.BindingId == "value"));
                Assert.NotNull(prefab.transform.Find("hud-hearts/value"));
            }
            finally
            {
                Object.DestroyImmediate(result.Root);
                Object.DestroyImmediate(result.PanelSettings);
                AssetDatabase.DeleteAsset(projectFolder);
            }
        }

        [Test]
        public void ReExportingGeneratedPrefabPreservesGuidAndUpdatesHierarchy()
        {
            string projectId = "prefab-guid-test-" + System.Guid.NewGuid().ToString("N");
            string sourcePath = "Assets/GreyboxGenerated/Artifacts/levels/arena.gameview";
            string prefabPath = PrefabAssetExporter.GeneratedPrefabPath(GreyboxArtifactKind.GameViewport, sourcePath, projectId);
            string projectFolder = ProjectFolder(prefabPath);
            var firstRoot = PrefabBuilder.BuildFromGameViewport(
                JObject.Parse(@"{""title"":""Arena"",""spawnPoints"":[{""id"":""spawn-a""}]}"),
                sourcePath);
            var secondRoot = PrefabBuilder.BuildFromGameViewport(
                JObject.Parse(@"{""title"":""Arena"",""spawnPoints"":[{""id"":""spawn-a""}],""objectives"":[{""id"":""relic"",""name"":""Capture Relic""}]}"),
                sourcePath);

            try
            {
                string firstPath = PrefabAssetExporter.ExportGameViewportPrefab(firstRoot, sourcePath, projectId);
                string firstGuid = AssetDatabase.AssetPathToGUID(firstPath);
                Assert.IsFalse(string.IsNullOrWhiteSpace(firstGuid));

                string secondPath = PrefabAssetExporter.ExportGameViewportPrefab(secondRoot, sourcePath, projectId);
                string secondGuid = AssetDatabase.AssetPathToGUID(secondPath);
                var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(secondPath);

                Assert.AreEqual(firstPath, secondPath);
                Assert.AreEqual(firstGuid, secondGuid, "Generated prefab GUID must remain stable across re-exports so scenes and Addressables references survive refreshes.");
                Assert.NotNull(prefab);
                Assert.NotNull(prefab.transform.Find("Objectives/Capture Relic"));
            }
            finally
            {
                Object.DestroyImmediate(firstRoot);
                Object.DestroyImmediate(secondRoot);
                AssetDatabase.DeleteAsset(projectFolder);
            }
        }

        [Test]
        public void IncomingSidecarPathInsertsSuffixBeforePrefabExtension()
        {
            Assert.AreEqual(
                "Assets/Greybox/Generated/proj-a/GameViewports/arena.greybox-incoming.prefab",
                PrefabAssetExporter.IncomingSidecarPath("Assets/Greybox/Generated/proj-a/GameViewports/arena.prefab"));
        }

        [Test]
        public void IncomingSidecarPathAppendsSuffixWhenExtensionMissing()
        {
            Assert.AreEqual(
                "Assets/Greybox/Generated/proj-a/strange-asset.greybox-incoming",
                PrefabAssetExporter.IncomingSidecarPath("Assets/Greybox/Generated/proj-a/strange-asset"));
        }

        [Test]
        public void PrefabWithOnlyGreyboxComponentsIsNotUserModified()
        {
            var root = new GameObject("Root");
            try
            {
                root.AddComponent<GreyboxMarker>();
                var child = new GameObject("Child");
                child.transform.SetParent(root.transform, false);
                child.AddComponent<GreyboxDesignNode>();
                child.AddComponent<GreyboxActorDefinition>();

                Assert.IsFalse(PrefabAssetExporter.PrefabHasUserModifications(root));
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void PrefabWithKnownUnityComponentsIsNotUserModified()
        {
            var root = new GameObject("Root");
            try
            {
                root.AddComponent<GreyboxMarker>();
                root.AddComponent<Camera>();
                var child = new GameObject("Child");
                child.transform.SetParent(root.transform, false);
                var meshFilter = child.AddComponent<MeshFilter>();
                var meshRenderer = child.AddComponent<MeshRenderer>();
                var lineRenderer = child.AddComponent<LineRenderer>();
                var generated = child.AddComponent<GreyboxGeneratedComponents>();
                generated.Record(meshFilter);
                generated.Record(meshRenderer);
                generated.Record(lineRenderer);

                Assert.IsFalse(PrefabAssetExporter.PrefabHasUserModifications(root));
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void PrefabWithUserAddedPhysicsComponentIsUserModified()
        {
            var root = new GameObject("Root");
            try
            {
                root.AddComponent<GreyboxMarker>();
                root.AddComponent<Rigidbody>();

                Assert.IsTrue(PrefabAssetExporter.PrefabHasUserModifications(root));
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void PrefabWithUserAddedEmptyChildIsUserModified()
        {
            var root = new GameObject("Root");
            try
            {
                root.AddComponent<GreyboxMarker>();
                var child = new GameObject("Designer Note Anchor");
                child.transform.SetParent(root.transform, false);

                Assert.IsTrue(PrefabAssetExporter.PrefabHasUserModifications(root));
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void MissingScriptComponentsAreNotGreyboxOwnedForOverwriteSafety()
        {
            Assert.IsFalse(InvokeIsGreyboxOwnedComponent(null), "Missing scripts have unknown ownership and must force a .greybox-incoming sidecar instead of overwriting the canonical prefab.");
        }

        [Test]
        public void PrefabWithUserAddedColliderOnChildIsUserModified()
        {
            var root = new GameObject("Root");
            try
            {
                root.AddComponent<GreyboxMarker>();
                var child = new GameObject("Child");
                child.transform.SetParent(root.transform, false);
                child.AddComponent<GreyboxDesignNode>();
                child.AddComponent<BoxCollider>();

                Assert.IsTrue(PrefabAssetExporter.PrefabHasUserModifications(root));
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void PrefabWithUserAddedRigidbody2DIsUserModified()
        {
            var root = new GameObject("Root");
            try
            {
                root.AddComponent<GreyboxMarker>();
                root.AddComponent<Rigidbody2D>();

                Assert.IsTrue(PrefabAssetExporter.PrefabHasUserModifications(root));
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void PrefabWithRecordedGreyboxGeneratedColliderIsNotUserModified()
        {
            var root = new GameObject("Root");
            try
            {
                root.AddComponent<GreyboxMarker>();
                var child = new GameObject("Child");
                child.transform.SetParent(root.transform, false);
                child.AddComponent<GreyboxDesignNode>();
                var collider = child.AddComponent<BoxCollider>();
                child.AddComponent<GreyboxGeneratedComponents>().Record(collider);

                Assert.IsFalse(PrefabAssetExporter.PrefabHasUserModifications(root));
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void PrefabWithRecordedImportedPrefabComponentsIsNotUserModified()
        {
            var root = new GameObject("Root");
            try
            {
                root.AddComponent<GreyboxMarker>();
                var child = new GameObject("Authored Audio Marker");
                child.transform.SetParent(root.transform, false);
                child.AddComponent<GreyboxDesignNode>();
                var audio = child.AddComponent<AudioSource>();
                child.AddComponent<GreyboxGeneratedComponents>().Record(audio);

                Assert.IsFalse(PrefabAssetExporter.PrefabHasUserModifications(root));
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void PrefabWithGeneratedTilemapInfrastructureIsNotUserModified()
        {
            var root = PrefabBuilder.BuildLevelBoard(
                JObject.Parse(@"{""title"":""Floor"",""tilemap"":{""collision"":true,""compositeCollider"":true,""tiles"":[{""x"":0,""y"":0,""type"":""floor""}]}}"),
                "Assets/Greybox/floor.levelboard");
            try
            {
                var tiles = root.transform.Find("Tilemap Grid/Tiles");
                Assert.NotNull(tiles);
                Assert.NotNull(tiles.GetComponent<Rigidbody2D>());

                Assert.IsFalse(PrefabAssetExporter.PrefabHasUserModifications(root));
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void PrefabWithGeneratedHudInfrastructureIsNotUserModified()
        {
            var root = HudLayoutBuilder.BuildFromHudHtml(
                @"<section data-greybox-artifact=""hud"" data-layout=""platformer-horizontal""><header data-slot=""top-left"" data-agds-id=""hud-hearts""><span data-role=""value"">3</span></header><footer data-slot=""bottom"" data-agds-id=""hud-action""><button data-action=""start-run"">START</button></footer></section>",
                "Assets/GreyboxGenerated/Artifacts/hud/combat.gbhud");
            try
            {
                Assert.NotNull(root.GetComponent<CanvasScaler>());
                Assert.NotNull(root.GetComponent<GraphicRaycaster>());
                Assert.NotNull(root.GetComponentInChildren<HorizontalLayoutGroup>());
                Assert.NotNull(root.GetComponentInChildren<Button>());
                Assert.NotNull(root.GetComponentInChildren<Text>());

                Assert.IsFalse(PrefabAssetExporter.PrefabHasUserModifications(root));
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void PrefabWithGeneratedWatermarkChildIsNotUserModified()
        {
            var root = new GameObject("Root");
            try
            {
                root.AddComponent<GreyboxMarker>();
                GreyboxWatermarkBuilder.Apply(root, true);

                var watermark = root.transform.Find("Greybox Watermark");
                Assert.NotNull(watermark);
                Assert.NotNull(watermark.GetComponent<GreyboxGeneratedComponents>());
                Assert.IsFalse(PrefabAssetExporter.PrefabHasUserModifications(root));
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void ReExportingUserModifiedPrefabWritesToSidecarPathAndPreservesUserEdits()
        {
            GreyboxConflictInbox.Clear();
            string projectId = "round-trip-safety-" + System.Guid.NewGuid().ToString("N");
            string sourcePath = "Assets/GreyboxGenerated/Artifacts/arena.gameview";
            string canonicalPath = PrefabAssetExporter.GeneratedPrefabPath(GreyboxArtifactKind.GameViewport, sourcePath, projectId);
            string sidecarPath = PrefabAssetExporter.IncomingSidecarPath(canonicalPath);
            string projectFolder = ProjectFolder(canonicalPath);

            try
            {
                var firstRoot = PrefabBuilder.BuildFromGameViewport(
                    JObject.Parse(@"{""title"":""Arena"",""spawnPoints"":[{""id"":""spawn-a""}]}"),
                    sourcePath);
                string firstPath = PrefabAssetExporter.ExportGameViewportPrefab(firstRoot, sourcePath, projectId);
                Object.DestroyImmediate(firstRoot);
                Assert.AreEqual(canonicalPath, firstPath);

                var prefabContents = PrefabUtility.LoadPrefabContents(canonicalPath);
                prefabContents.AddComponent<Rigidbody>();
                PrefabUtility.SaveAsPrefabAsset(prefabContents, canonicalPath);
                PrefabUtility.UnloadPrefabContents(prefabContents);

                var secondRoot = PrefabBuilder.BuildFromGameViewport(
                    JObject.Parse(@"{""title"":""Arena"",""spawnPoints"":[{""id"":""spawn-a""}],""objectives"":[{""id"":""relic""}]}"),
                    sourcePath);
                string secondPath = PrefabAssetExporter.ExportGameViewportPrefab(secondRoot, sourcePath, projectId);
                Object.DestroyImmediate(secondRoot);

                Assert.AreEqual(sidecarPath, secondPath, "Regen with user-modified canonical prefab must route output to the .greybox-incoming sidecar.");
                var sidecar = AssetDatabase.LoadAssetAtPath<GameObject>(sidecarPath);
                Assert.NotNull(sidecar, "Sidecar prefab must be written so user can diff and merge regenerated content.");
                Assert.NotNull(sidecar.transform.Find("Objectives"), "Sidecar must contain the regenerated hierarchy.");
                var sidecarImported = sidecar.GetComponent<GreyboxImportedArtifact>();
                Assert.NotNull(sidecarImported);
                Assert.AreEqual(canonicalPath, sidecarImported.CanonicalGeneratedAssetPath);
                Assert.AreEqual(sidecarPath, sidecarImported.ExportedAssetPath);
                Assert.True(sidecarImported.ExportedToIncomingSidecar);

                var preserved = AssetDatabase.LoadAssetAtPath<GameObject>(canonicalPath);
                Assert.NotNull(preserved);
                Assert.NotNull(preserved.GetComponent<Rigidbody>(), "Canonical prefab must retain the user-added Rigidbody.");
                Assert.AreEqual(1, GreyboxConflictInbox.Conflicts.Count);
                Assert.AreEqual("prefab-sidecar", GreyboxConflictInbox.Conflicts[0].Strategy);
                Assert.AreEqual(canonicalPath, GreyboxConflictInbox.Conflicts[0].FileName);
                Assert.AreEqual(@"""" + sidecarPath + @"""", GreyboxConflictInbox.Conflicts[0].WebValueJson);
            }
            finally
            {
                GreyboxConflictInbox.Clear();
                AssetDatabase.DeleteAsset(projectFolder);
            }
        }

        private static string ProjectFolder(string prefabPath)
        {
            int gameViewports = prefabPath.IndexOf("/GameViewports/", System.StringComparison.Ordinal);
            if (gameViewports >= 0) return prefabPath.Substring(0, gameViewports);
            int levelBoards = prefabPath.IndexOf("/LevelBoards/", System.StringComparison.Ordinal);
            if (levelBoards >= 0) return prefabPath.Substring(0, levelBoards);
            int hudLayouts = prefabPath.IndexOf("/HudLayouts/", System.StringComparison.Ordinal);
            return hudLayouts >= 0 ? prefabPath.Substring(0, hudLayouts) : prefabPath;
        }

        private static bool InvokeIsGreyboxOwnedComponent(Component component)
        {
            var method = typeof(PrefabAssetExporter).GetMethod("IsGreyboxOwnedComponent", BindingFlags.Static | BindingFlags.NonPublic);
            Assert.NotNull(method);
            return (bool)method.Invoke(null, new object[] { component });
        }
    }
}
