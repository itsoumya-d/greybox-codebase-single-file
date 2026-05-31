// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System;
using System.Collections.Generic;
using System.Linq;
using Greybox.Runtime;
using UnityEditor;
using UnityEngine;
using UnityEngine.UIElements;

namespace Greybox.Editor.Generation
{
    public static class GreyboxImportReceiptExporter
    {
        private const string ReceiptExtension = ".asset";

        public static string ExpectedReceiptPath(string sourcePath, string projectId)
        {
            string path = GreyboxGeneratedAssetPaths.GeneratedAssetPath(
                sourcePath,
                projectId,
                GreyboxGeneratedAssetPaths.ReceiptsFolder,
                "greybox-import",
                ReceiptExtension);
            return IsSafeReceiptPath(path) ? path : "";
        }

        public static string ExpectedReceiptId(GreyboxArtifact artifact, GreyboxArtifactKind kind, string sourcePath)
        {
            string artifactId = artifact ? artifact.ArtifactId ?? "" : "";
            if (!string.IsNullOrWhiteSpace(artifactId)) return artifactId;
            string normalizedSourcePath = GreyboxGeneratedAssetPaths.NormalizePath(sourcePath);
            return Greybox.Editor.Importers.GreyboxHash.Sha256($"{kind}:{normalizedSourcePath}");
        }

        public static void RecordExpectedReceipt(GameObject root, GreyboxArtifact artifact, GreyboxArtifactKind kind, string sourcePath, string projectId)
        {
            ApplyReceiptToImportedArtifact(root, ExpectedReceiptId(artifact, kind, sourcePath), ExpectedReceiptPath(sourcePath, projectId));
        }

        public static string ExportReceipt(
            GreyboxArtifact artifact,
            UnityEngine.Object generatedRoot,
            GreyboxArtifactKind kind,
            string sourcePath,
            string projectId,
            string canonicalGeneratedAssetPath,
            string exportedAssetPath,
            IEnumerable<string> generatedAssetPaths)
        {
            string receiptPath = ExpectedReceiptPath(sourcePath, projectId);
            if (string.IsNullOrWhiteSpace(receiptPath)) return "";

            string receiptId = ExpectedReceiptId(artifact, kind, sourcePath);
            var receipt = ScriptableObject.CreateInstance<GreyboxImportReceipt>();
            try
            {
                receipt.name = ReceiptName(kind, sourcePath);
                receipt.ReceiptId = receiptId;
                receipt.ArtifactId = artifact ? artifact.ArtifactId ?? "" : "";
                receipt.Kind = kind;
                receipt.SourcePath = artifact ? artifact.SourcePath ?? "" : GreyboxGeneratedAssetPaths.NormalizePath(sourcePath);
                receipt.SourceHash = artifact ? artifact.SourceHash ?? "" : "";
                receipt.GeneratorCredit = artifact ? artifact.GeneratorCredit ?? "" : "";
                receipt.HumanDesignerCredit = artifact ? artifact.HumanDesignerCredit ?? "" : "";
                receipt.AiDisclosure = artifact ? artifact.AiDisclosure ?? "" : "";
                receipt.CanonicalGeneratedAssetPath = SafeGeneratedAssetPath(canonicalGeneratedAssetPath);
                receipt.ExportedAssetPath = SafeGeneratedAssetPath(exportedAssetPath);
                receipt.ImportReceiptPath = receiptPath;
                receipt.ExportedToIncomingSidecar = !string.IsNullOrWhiteSpace(receipt.CanonicalGeneratedAssetPath)
                    && !string.Equals(receipt.CanonicalGeneratedAssetPath, receipt.ExportedAssetPath, StringComparison.Ordinal);
                receipt.Watermarked = artifact && artifact.Watermarked;
                receipt.UpdatedAtUnixMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                receipt.GeneratedAssetPaths.AddRange(NormalizeGeneratedAssetPaths(generatedAssetPaths));
                receipt.AddressableLabels.Add(AddressablesTagger.GeneratedLabel);
                receipt.AddressableLabels.Add(AddressablesTagger.LabelForKind(kind));
                receipt.MissingReferences.AddRange(CollectMissingReferences(generatedRoot, receipt));
                string safeExportedAssetPath = receipt.ExportedAssetPath;

                GreyboxGeneratedAssetPaths.EnsureFolder(System.IO.Path.GetDirectoryName(receiptPath)?.Replace('\\', '/') ?? GreyboxGeneratedAssetPaths.Root);
                var existing = AssetDatabase.LoadAssetAtPath<GreyboxImportReceipt>(receiptPath);
                if (existing)
                {
                    EditorUtility.CopySerialized(receipt, existing);
                    existing.name = receipt.name;
                    EditorUtility.SetDirty(existing);
                    AssetDatabase.SaveAssetIfDirty(existing);
                }
                else
                {
                    AssetDatabase.CreateAsset(receipt, receiptPath);
                    receipt = null;
                    AssetDatabase.SaveAssets();
                }

                if (generatedRoot is GameObject root)
                {
                    ApplyReceiptToImportedArtifact(root, receiptId, receiptPath);
                }
                UpdateGeneratedPrefabReceiptMetadata(safeExportedAssetPath, receiptId, receiptPath);
                return receiptPath;
            }
            finally
            {
                if (receipt) UnityEngine.Object.DestroyImmediate(receipt);
            }
        }

        public static void ApplyReceiptToImportedArtifact(GameObject root, string receiptId, string receiptPath)
        {
            if (!root) return;
            var imported = root.GetComponent<GreyboxImportedArtifact>();
            if (!imported) return;
            imported.ImportReceiptId = receiptId ?? "";
            imported.ImportReceiptPath = receiptPath ?? "";
        }

        private static void UpdateGeneratedPrefabReceiptMetadata(string prefabPath, string receiptId, string receiptPath)
        {
            if (string.IsNullOrWhiteSpace(prefabPath) || !prefabPath.EndsWith(".prefab", StringComparison.OrdinalIgnoreCase)) return;
            if (!IsSafeGeneratedAssetPath(prefabPath)) return;
            var prefabRoot = AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath);
            if (!prefabRoot || !prefabRoot.GetComponent<GreyboxImportedArtifact>()) return;

            GameObject contents = PrefabUtility.LoadPrefabContents(prefabPath);
            try
            {
                ApplyReceiptToImportedArtifact(contents, receiptId, receiptPath);
                PrefabUtility.SaveAsPrefabAsset(contents, prefabPath);
            }
            finally
            {
                PrefabUtility.UnloadPrefabContents(contents);
            }
        }

        private static IEnumerable<string> NormalizeGeneratedAssetPaths(IEnumerable<string> paths)
        {
            var unique = new HashSet<string>(StringComparer.Ordinal);
            foreach (string path in paths ?? Array.Empty<string>())
            {
                string safePath = SafeGeneratedAssetPath(path);
                if (!string.IsNullOrWhiteSpace(safePath) && unique.Add(safePath)) yield return safePath;
            }
        }

        private static IEnumerable<GreyboxMissingReferenceRecord> CollectMissingReferences(UnityEngine.Object generatedRoot, GreyboxImportReceipt receipt)
        {
            if (generatedRoot is GameObject root)
            {
                foreach (var record in CollectMissingGameObjectReferences(root)) yield return record;
            }

            if (string.IsNullOrWhiteSpace(receipt.ExportedAssetPath))
            {
                yield return new GreyboxMissingReferenceRecord
                {
                    ObjectPath = receipt.SourcePath,
                    ComponentType = "Greybox.GeneratedPrefab",
                    ReferenceName = "ExportedAssetPath",
                    ExpectedAssetPath = receipt.CanonicalGeneratedAssetPath
                };
            }

            foreach (string assetPath in receipt.GeneratedAssetPaths.Where(path => string.IsNullOrWhiteSpace(AssetDatabase.AssetPathToGUID(path))))
            {
                yield return new GreyboxMissingReferenceRecord
                {
                    ObjectPath = receipt.SourcePath,
                    ComponentType = "Greybox.GeneratedAsset",
                    ReferenceName = "AssetDatabaseGuid",
                    ExpectedAssetPath = assetPath
                };
            }
        }

        private static IEnumerable<GreyboxMissingReferenceRecord> CollectMissingGameObjectReferences(GameObject root)
        {
            foreach (Transform transform in root.GetComponentsInChildren<Transform>(true))
            {
                GameObject go = transform ? transform.gameObject : null;
                if (!go) continue;
                string objectPath = HierarchyPath(root.transform, transform);

                var meshFilter = go.GetComponent<MeshFilter>();
                if (meshFilter && !meshFilter.sharedMesh)
                {
                    yield return Missing(objectPath, "UnityEngine.MeshFilter", "sharedMesh");
                }

                foreach (Renderer renderer in go.GetComponents<Renderer>())
                {
                    Material[] materials = renderer ? renderer.sharedMaterials : Array.Empty<Material>();
                    if (materials.Length == 0)
                    {
                        yield return Missing(objectPath, renderer.GetType().FullName, "sharedMaterials");
                        continue;
                    }
                    for (int index = 0; index < materials.Length; index++)
                    {
                        if (!materials[index]) yield return Missing(objectPath, renderer.GetType().FullName, $"sharedMaterials[{index}]");
                    }
                }

                var spriteRenderer = go.GetComponent<SpriteRenderer>();
                if (spriteRenderer && !spriteRenderer.sprite)
                {
                    yield return Missing(objectPath, "UnityEngine.SpriteRenderer", "sprite");
                }

                var image = go.GetComponent<UnityEngine.UI.Image>();
                if (image && !image.sprite)
                {
                    yield return Missing(objectPath, "UnityEngine.UI.Image", "sprite");
                }

                var uiDocument = go.GetComponent<UIDocument>();
                if (uiDocument && !uiDocument.panelSettings)
                {
                    yield return Missing(objectPath, "UnityEngine.UIElements.UIDocument", "panelSettings");
                }
            }
        }

        private static GreyboxMissingReferenceRecord Missing(string objectPath, string componentType, string referenceName)
        {
            return new GreyboxMissingReferenceRecord
            {
                ObjectPath = objectPath ?? "",
                ComponentType = componentType ?? "",
                ReferenceName = referenceName ?? "",
                ExpectedAssetPath = ""
            };
        }

        private static string HierarchyPath(Transform root, Transform current)
        {
            if (!root || !current) return "";
            var names = new Stack<string>();
            Transform cursor = current;
            while (cursor)
            {
                names.Push(cursor.name);
                if (cursor == root) break;
                cursor = cursor.parent;
            }
            return string.Join("/", names.ToArray());
        }

        private static string ReceiptName(GreyboxArtifactKind kind, string sourcePath)
        {
            string stem = GreyboxGeneratedAssetPaths.SourceAssetStem(sourcePath);
            if (string.IsNullOrWhiteSpace(stem)) stem = "greybox-import";
            return $"{kind} {stem} Import Receipt";
        }

        private static string SafeGeneratedAssetPath(string assetPath)
        {
            string normalized = GreyboxGeneratedAssetPaths.NormalizePath(assetPath);
            return IsSafeGeneratedAssetPath(normalized) ? normalized : "";
        }

        private static bool IsSafeReceiptPath(string assetPath)
        {
            return IsSafeGeneratedAssetPath(assetPath)
                && assetPath.IndexOf($"/{GreyboxGeneratedAssetPaths.ReceiptsFolder}/", StringComparison.Ordinal) >= 0
                && assetPath.EndsWith(ReceiptExtension, StringComparison.OrdinalIgnoreCase);
        }

        private static bool IsSafeGeneratedAssetPath(string assetPath)
        {
            if (string.IsNullOrWhiteSpace(assetPath)) return false;
            if (!assetPath.StartsWith(GreyboxGeneratedAssetPaths.Root + "/", StringComparison.Ordinal)) return false;
            if (assetPath.Contains("//")) return false;
            foreach (char c in assetPath)
            {
                if (char.IsControl(c)) return false;
            }
            foreach (string segment in assetPath.Split('/'))
            {
                if (string.IsNullOrWhiteSpace(segment) || segment == "." || segment == "..") return false;
            }
            return true;
        }
    }
}
