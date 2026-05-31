// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using Greybox.Editor.Generation;
using Greybox.Editor.Sync;
using Greybox.Runtime;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;

namespace Greybox.Tests.EditMode
{
    public sealed class GreyboxPrefabSidecarResolverTests
    {
        [SetUp]
        public void SetUp()
        {
            GreyboxConflictInbox.Clear();
        }

        [TearDown]
        public void TearDown()
        {
            GreyboxConflictInbox.Clear();
        }

        [Test]
        public void RecognizesPrefabSidecarReviewItems()
        {
            GreyboxConflictInbox.RecordPrefabSidecar(
                "Assets/Greybox/Generated/proj/GameViewports/arena.prefab",
                "Assets/Greybox/Generated/proj/GameViewports/arena.greybox-incoming.prefab",
                "Assets/GreyboxGenerated/Artifacts/arena.gameview");

            GreyboxRoundTripConflict conflict = GreyboxConflictInbox.Conflicts[0];

            Assert.IsTrue(GreyboxPrefabSidecarResolver.IsPrefabSidecar(conflict));
            Assert.AreEqual("Assets/Greybox/Generated/proj/GameViewports/arena.prefab", GreyboxPrefabSidecarResolver.CanonicalPath(conflict));
            Assert.AreEqual("Assets/Greybox/Generated/proj/GameViewports/arena.greybox-incoming.prefab", GreyboxPrefabSidecarResolver.IncomingPath(conflict));
        }

        [Test]
        public void AcceptIncomingReplacesCanonicalWithSidecarAndPreservesGuid()
        {
            string projectId = "sidecar-accept-" + System.Guid.NewGuid().ToString("N");
            string sourcePath = "Assets/GreyboxGenerated/Artifacts/arena.gameview";
            string canonicalPath = PrefabAssetExporter.GeneratedPrefabPath(GreyboxArtifactKind.GameViewport, sourcePath, projectId);
            string sidecarPath = PrefabAssetExporter.IncomingSidecarPath(canonicalPath);
            string projectFolder = ProjectFolder(canonicalPath);

            try
            {
                string firstPath = ExportGameViewport(sourcePath, projectId, @"{""title"":""Arena"",""spawnPoints"":[{""id"":""spawn-a""}]}");
                string canonicalGuid = AssetDatabase.AssetPathToGUID(firstPath);
                Assert.IsFalse(string.IsNullOrWhiteSpace(canonicalGuid));
                AddUserRigidbody(canonicalPath);

                string secondPath = ExportGameViewport(sourcePath, projectId, @"{""title"":""Arena"",""spawnPoints"":[{""id"":""spawn-a""}],""objectives"":[{""id"":""relic""}]}");
                Assert.AreEqual(sidecarPath, secondPath);
                GreyboxRoundTripConflict conflict = GreyboxConflictInbox.Conflicts[0];

                Assert.IsTrue(GreyboxPrefabSidecarResolver.AcceptIncoming(conflict));

                var canonical = AssetDatabase.LoadAssetAtPath<GameObject>(canonicalPath);
                Assert.NotNull(canonical);
                Assert.AreEqual(canonicalGuid, AssetDatabase.AssetPathToGUID(canonicalPath), "Adopting incoming sidecars must preserve the canonical prefab GUID so scene references survive.");
                Assert.NotNull(canonical.transform.Find("Objectives/relic"));
                Assert.IsNull(canonical.GetComponent<Rigidbody>(), "Adopting incoming intentionally replaces user-added canonical components with regenerated content.");
                Assert.IsNull(AssetDatabase.LoadAssetAtPath<GameObject>(sidecarPath));
                Assert.AreEqual(0, GreyboxConflictInbox.Conflicts.Count);
            }
            finally
            {
                AssetDatabase.DeleteAsset(projectFolder);
            }
        }

        [Test]
        public void KeepCanonicalDeletesSidecarAndPreservesUserModifiedPrefab()
        {
            string projectId = "sidecar-keep-" + System.Guid.NewGuid().ToString("N");
            string sourcePath = "Assets/GreyboxGenerated/Artifacts/arena.gameview";
            string canonicalPath = PrefabAssetExporter.GeneratedPrefabPath(GreyboxArtifactKind.GameViewport, sourcePath, projectId);
            string sidecarPath = PrefabAssetExporter.IncomingSidecarPath(canonicalPath);
            string projectFolder = ProjectFolder(canonicalPath);

            try
            {
                ExportGameViewport(sourcePath, projectId, @"{""title"":""Arena"",""spawnPoints"":[{""id"":""spawn-a""}]}");
                AddUserRigidbody(canonicalPath);

                string secondPath = ExportGameViewport(sourcePath, projectId, @"{""title"":""Arena"",""spawnPoints"":[{""id"":""spawn-a""}],""objectives"":[{""id"":""relic""}]}");
                Assert.AreEqual(sidecarPath, secondPath);
                GreyboxRoundTripConflict conflict = GreyboxConflictInbox.Conflicts[0];

                Assert.IsTrue(GreyboxPrefabSidecarResolver.KeepCanonical(conflict));

                var canonical = AssetDatabase.LoadAssetAtPath<GameObject>(canonicalPath);
                Assert.NotNull(canonical);
                Assert.NotNull(canonical.GetComponent<Rigidbody>());
                Assert.IsNull(canonical.transform.Find("Objectives"));
                Assert.IsNull(AssetDatabase.LoadAssetAtPath<GameObject>(sidecarPath));
                Assert.AreEqual(0, GreyboxConflictInbox.Conflicts.Count);
            }
            finally
            {
                AssetDatabase.DeleteAsset(projectFolder);
            }
        }

        [Test]
        public void UnsafePrefabSidecarPathsAreRejected()
        {
            var traversalConflict = new GreyboxRoundTripConflict
            {
                Strategy = "prefab-sidecar",
                Path = "$.unity.prefab",
                UnityValueJson = @"""Assets/Greybox/Generated/proj/GameViewports/arena.prefab""",
                WebValueJson = @"""Assets/Greybox/Generated/proj/../arena.greybox-incoming.prefab""",
            };
            var projectSettingsConflict = new GreyboxRoundTripConflict
            {
                Strategy = "prefab-sidecar",
                Path = "$.unity.prefab",
                UnityValueJson = @"""ProjectSettings/ProjectSettings.asset""",
                WebValueJson = @"""Assets/Greybox/Generated/proj/GameViewports/arena.greybox-incoming.prefab""",
            };
            var arbitraryIncomingPrefabConflict = new GreyboxRoundTripConflict
            {
                Strategy = "prefab-sidecar",
                Path = "$.unity.prefab",
                UnityValueJson = @"""Assets/Greybox/Generated/proj/GameViewports/arena.prefab""",
                WebValueJson = @"""Assets/Greybox/Generated/proj/GameViewports/other.prefab""",
            };
            var unsafeCanonicalWithoutIncomingConflict = new GreyboxRoundTripConflict
            {
                Strategy = "prefab-sidecar",
                Path = "$.unity.prefab",
                UnityValueJson = @"""ProjectSettings/ProjectSettings.asset""",
                WebValueJson = @"""""",
            };
            var mismatchedIncomingSidecarConflict = new GreyboxRoundTripConflict
            {
                Strategy = "prefab-sidecar",
                Path = "$.unity.prefab",
                UnityValueJson = @"""Assets/Greybox/Generated/proj/GameViewports/arena.prefab""",
                WebValueJson = @"""Assets/Greybox/Generated/proj/GameViewports/other.greybox-incoming.prefab""",
            };

            Assert.IsTrue(GreyboxPrefabSidecarResolver.IsSafePrefabAssetPath("Assets/Greybox/Generated/proj/GameViewports/arena.prefab"));
            Assert.IsTrue(GreyboxPrefabSidecarResolver.IsSafePrefabAssetPath(@"Assets\Greybox\Generated\proj\GameViewports\arena.greybox-incoming.prefab"));
            Assert.IsTrue(GreyboxPrefabSidecarResolver.IsIncomingPrefabSidecarPath("Assets/Greybox/Generated/proj/GameViewports/arena.greybox-incoming.prefab"));
            Assert.IsTrue(GreyboxPrefabSidecarResolver.IsMatchingIncomingPrefabSidecarPath(
                "Assets/Greybox/Generated/proj/GameViewports/arena.prefab",
                @"Assets\Greybox\Generated\proj\GameViewports\arena.greybox-incoming.prefab"));
            Assert.IsFalse(GreyboxPrefabSidecarResolver.IsSafePrefabAssetPath("ProjectSettings/ProjectSettings.asset"));
            Assert.IsFalse(GreyboxPrefabSidecarResolver.IsSafePrefabAssetPath("Assets/Greybox/Generated/proj/../arena.prefab"));
            Assert.IsFalse(GreyboxPrefabSidecarResolver.IsSafePrefabAssetPath("Assets/Greybox/Generated/proj/GameViewports/arena.prefab\n.meta"));
            Assert.IsFalse(GreyboxPrefabSidecarResolver.IsSafePrefabAssetPath("Assets/Greybox/Generated/" + new string('a', 520) + ".prefab"));
            Assert.IsFalse(GreyboxPrefabSidecarResolver.IsIncomingPrefabSidecarPath("Assets/Greybox/Generated/proj/GameViewports/other.prefab"));
            Assert.IsFalse(GreyboxPrefabSidecarResolver.IsMatchingIncomingPrefabSidecarPath(
                "Assets/Greybox/Generated/proj/GameViewports/arena.prefab",
                "Assets/Greybox/Generated/proj/GameViewports/other.greybox-incoming.prefab"));
            Assert.IsFalse(GreyboxPrefabSidecarResolver.CanAcceptIncoming(traversalConflict));
            Assert.IsFalse(GreyboxPrefabSidecarResolver.CanKeepCanonical(traversalConflict));
            Assert.IsFalse(GreyboxPrefabSidecarResolver.CanAcceptIncoming(projectSettingsConflict));
            Assert.IsFalse(GreyboxPrefabSidecarResolver.CanAcceptIncoming(arbitraryIncomingPrefabConflict));
            Assert.IsFalse(GreyboxPrefabSidecarResolver.CanKeepCanonical(arbitraryIncomingPrefabConflict));
            Assert.IsFalse(GreyboxPrefabSidecarResolver.CanKeepCanonical(unsafeCanonicalWithoutIncomingConflict));
            Assert.IsFalse(GreyboxPrefabSidecarResolver.CanAcceptIncoming(mismatchedIncomingSidecarConflict));
            Assert.IsFalse(GreyboxPrefabSidecarResolver.CanKeepCanonical(mismatchedIncomingSidecarConflict));
            Assert.IsFalse(GreyboxPrefabSidecarResolver.AcceptIncoming(traversalConflict));
            Assert.IsFalse(GreyboxPrefabSidecarResolver.KeepCanonical(traversalConflict));
            Assert.IsFalse(GreyboxPrefabSidecarResolver.AcceptIncoming(projectSettingsConflict));
            Assert.IsFalse(GreyboxPrefabSidecarResolver.KeepCanonical(arbitraryIncomingPrefabConflict));
            Assert.IsFalse(GreyboxPrefabSidecarResolver.KeepCanonical(unsafeCanonicalWithoutIncomingConflict));
            Assert.IsFalse(GreyboxPrefabSidecarResolver.AcceptIncoming(mismatchedIncomingSidecarConflict));
            Assert.IsFalse(GreyboxPrefabSidecarResolver.KeepCanonical(mismatchedIncomingSidecarConflict));
        }

        [Test]
        public void KeepCanonicalClearsAlreadyMissingPairedSidecarReview()
        {
            GreyboxConflictInbox.RecordPrefabSidecar(
                "Assets/Greybox/Generated/proj/GameViewports/missing.prefab",
                "Assets/Greybox/Generated/proj/GameViewports/missing.greybox-incoming.prefab",
                "Assets/GreyboxGenerated/Artifacts/missing.gameview");
            GreyboxRoundTripConflict conflict = GreyboxConflictInbox.Conflicts[0];

            Assert.IsTrue(GreyboxPrefabSidecarResolver.CanKeepCanonical(conflict));
            Assert.IsTrue(GreyboxPrefabSidecarResolver.KeepCanonical(conflict));
            Assert.AreEqual(0, GreyboxConflictInbox.Conflicts.Count);
        }

        private static string ExportGameViewport(string sourcePath, string projectId, string json)
        {
            var root = PrefabBuilder.BuildFromGameViewport(JObject.Parse(json), sourcePath);
            try
            {
                return PrefabAssetExporter.ExportGameViewportPrefab(root, sourcePath, projectId);
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        private static void AddUserRigidbody(string canonicalPath)
        {
            var prefabContents = PrefabUtility.LoadPrefabContents(canonicalPath);
            try
            {
                prefabContents.AddComponent<Rigidbody>();
                PrefabUtility.SaveAsPrefabAsset(prefabContents, canonicalPath);
            }
            finally
            {
                PrefabUtility.UnloadPrefabContents(prefabContents);
            }
        }

        private static string ProjectFolder(string prefabPath)
        {
            int gameViewports = prefabPath.IndexOf("/GameViewports/", System.StringComparison.Ordinal);
            if (gameViewports >= 0) return prefabPath.Substring(0, gameViewports);
            int levelBoards = prefabPath.IndexOf("/LevelBoards/", System.StringComparison.Ordinal);
            return levelBoards >= 0 ? prefabPath.Substring(0, levelBoards) : prefabPath;
        }
    }
}
