// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using Greybox.Editor.Generation;
using Greybox.Runtime;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;

namespace Greybox.Tests.EditMode
{
    public sealed class GreyboxImportReceiptExporterTests
    {
        [Test]
        public void ExpectedReceiptPathStaysUnderGeneratedRoot()
        {
            string receiptPath = GreyboxImportReceiptExporter.ExpectedReceiptPath(
                "Assets/GreyboxGenerated/Artifacts/world/arena.gameview",
                "Receipt Tests");

            Assert.AreEqual("Assets/Greybox/Generated/receipt-tests/Receipts/world-arena.asset", receiptPath);
        }

        [Test]
        public void ExportReceiptUpdatesExistingAssetAndRecordsMissingReferences()
        {
            const string sourcePath = "Assets/GreyboxGenerated/Artifacts/receipt-smoke.gameview";
            const string projectId = "Receipt Tests";
            string projectFolder = "Assets/Greybox/Generated/receipt-tests";
            string prefabPath = GreyboxGeneratedAssetPaths.GeneratedAssetPath(sourcePath, projectId, GreyboxGeneratedAssetPaths.GameViewportsFolder, "receipt-smoke", ".prefab");
            var artifact = ScriptableObject.CreateInstance<GreyboxArtifact>();
            var root = new GameObject("Receipt Smoke");
            try
            {
                artifact.ArtifactId = "receipt-smoke-id";
                artifact.Kind = GreyboxArtifactKind.GameViewport;
                artifact.SourcePath = sourcePath;
                artifact.SourceHash = "source-hash-a";
                artifact.GeneratorCredit = "Greybox + Kai Designer";
                artifact.HumanDesignerCredit = "Kai Designer";
                artifact.AiDisclosure = "AI-assisted";
                root.AddComponent<GreyboxImportedArtifact>();
                root.AddComponent<MeshFilter>();

                string receiptPath = GreyboxImportReceiptExporter.ExportReceipt(
                    artifact,
                    root,
                    GreyboxArtifactKind.GameViewport,
                    sourcePath,
                    projectId,
                    prefabPath,
                    prefabPath,
                    new[] { prefabPath });

                var imported = root.GetComponent<GreyboxImportedArtifact>();
                Assert.AreEqual("receipt-smoke-id", imported.ImportReceiptId);
                Assert.AreEqual(receiptPath, imported.ImportReceiptPath);

                string firstGuid = AssetDatabase.AssetPathToGUID(receiptPath);
                Assert.IsNotEmpty(firstGuid);
                var receipt = AssetDatabase.LoadAssetAtPath<GreyboxImportReceipt>(receiptPath);
                Assert.NotNull(receipt);
                Assert.AreEqual("receipt-smoke-id", receipt.ReceiptId);
                Assert.AreEqual(GreyboxArtifactKind.GameViewport, receipt.Kind);
                CollectionAssert.Contains(receipt.GeneratedAssetPaths, prefabPath);
                CollectionAssert.Contains(receipt.AddressableLabels, AddressablesTagger.GeneratedLabel);
                CollectionAssert.Contains(receipt.AddressableLabels, AddressablesTagger.GameViewportLabel);
                Assert.NotNull(receipt.MissingReferences.Find(item => item.ComponentType == "UnityEngine.MeshFilter" && item.ReferenceName == "sharedMesh"));

                artifact.SourceHash = "source-hash-b";
                GreyboxImportReceiptExporter.ExportReceipt(
                    artifact,
                    root,
                    GreyboxArtifactKind.GameViewport,
                    sourcePath,
                    projectId,
                    prefabPath,
                    prefabPath,
                    new[] { prefabPath });

                Assert.AreEqual(firstGuid, AssetDatabase.AssetPathToGUID(receiptPath), "Receipt updates should preserve the existing asset GUID.");
                receipt = AssetDatabase.LoadAssetAtPath<GreyboxImportReceipt>(receiptPath);
                Assert.AreEqual("source-hash-b", receipt.SourceHash);
            }
            finally
            {
                Object.DestroyImmediate(root);
                Object.DestroyImmediate(artifact);
                AssetDatabase.DeleteAsset(projectFolder);
            }
        }
    }
}
