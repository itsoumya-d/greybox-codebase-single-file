// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System;
using System.Collections.Generic;
using System.Text;
using Greybox.Editor.Sync;
using Greybox.Runtime;
using UnityEditor;
using UnityEngine;

namespace Greybox.Editor.Generation
{
    public static class PrefabAssetExporter
    {
        public const string IncomingSidecarSuffix = ".greybox-incoming";
        private const int MaxSourcePathLength = 512;

        private static readonly HashSet<string> GreyboxOwnedNamespaces = new HashSet<string>(StringComparer.Ordinal)
        {
            "Greybox.Runtime",
            "Greybox.Editor",
            "Greybox.Editor.Generation",
            "Greybox.Editor.Sync",
            "Greybox.Editor.Importers",
            "Greybox.Editor.McpBridge",
            "Greybox.Editor.Windows",
        };

        private static readonly HashSet<string> KnownUnityComponentTypes = new HashSet<string>(StringComparer.Ordinal)
        {
            "UnityEngine.Transform",
            "UnityEngine.RectTransform",
            "UnityEngine.MeshFilter",
            "UnityEngine.MeshRenderer",
            "UnityEngine.SkinnedMeshRenderer",
            "UnityEngine.Camera",
            "UnityEngine.LineRenderer",
            "UnityEngine.Light",
            "UnityEngine.AudioListener",
            "UnityEngine.Canvas",
            "UnityEngine.CanvasRenderer",
            "UnityEngine.UI.CanvasScaler",
            "UnityEngine.UI.GraphicRaycaster",
            "UnityEngine.UI.HorizontalLayoutGroup",
            "UnityEngine.UI.Image",
            "UnityEngine.UI.Text",
            "UnityEngine.UI.Button",
            "UnityEngine.UIElements.UIDocument",
        };

        public static string ExportGameViewportPrefab(GameObject root, string sourcePath, string projectId)
        {
            return ExportPrefab(root, GreyboxArtifactKind.GameViewport, sourcePath, projectId);
        }

        public static string ExportLevelBoardPrefab(GameObject root, string sourcePath, string projectId)
        {
            return ExportPrefab(root, GreyboxArtifactKind.LevelBoard, sourcePath, projectId);
        }

        public static string ExportHudLayoutPrefab(GameObject root, string sourcePath, string projectId)
        {
            return ExportPrefab(root, GreyboxArtifactKind.HudLayout, sourcePath, projectId);
        }

        public static string ExportPrefab(GameObject root, GreyboxArtifactKind kind, string sourcePath, string projectId)
        {
            if (!root) return "";
            string canonicalPath = GeneratedPrefabPath(kind, sourcePath, projectId);
            GreyboxGeneratedAssetPaths.EnsureFolder(System.IO.Path.GetDirectoryName(canonicalPath)?.Replace('\\', '/') ?? GreyboxGeneratedAssetPaths.Root);

            string targetPath = canonicalPath;
            var existing = AssetDatabase.LoadAssetAtPath<GameObject>(canonicalPath);
            bool exportedToIncomingSidecar = existing && PrefabHasUserModifications(existing);
            if (exportedToIncomingSidecar)
            {
                targetPath = IncomingSidecarPath(canonicalPath);
            }

            RecordGeneratedPrefabMetadata(root, kind, sourcePath, canonicalPath, targetPath);
            GameObject prefab = PrefabUtility.SaveAsPrefabAsset(root, targetPath, out bool success);
            if (!success || !prefab) return "";
            if (exportedToIncomingSidecar)
            {
                Debug.LogWarning(
                    $"Greybox: {canonicalPath} contains user-added components. Wrote regenerated prefab to {targetPath} to preserve your edits. Diff and merge manually.");
                GreyboxConflictInbox.RecordPrefabSidecar(canonicalPath, targetPath, sourcePath);
            }
            AssetDatabase.SaveAssets();
            return targetPath;
        }

        public static bool PrefabHasUserModifications(GameObject prefabRoot)
        {
            if (!prefabRoot) return false;
            foreach (Transform transform in prefabRoot.GetComponentsInChildren<Transform>(true))
            {
                if (!IsGreyboxOwnedGameObject(transform != null ? transform.gameObject : null)) return true;
            }
            foreach (Component component in prefabRoot.GetComponentsInChildren<Component>(true))
            {
                if (!IsGreyboxOwnedComponent(component)) return true;
            }
            return false;
        }

        private static bool IsGreyboxOwnedGameObject(GameObject go)
        {
            if (!go) return false;
            return HasGreyboxOwnershipMarker(go);
        }

        private static bool HasGreyboxOwnershipMarker(GameObject go)
        {
            return go
                && (go.GetComponent<GreyboxMarker>() != null
                    || go.GetComponent<GreyboxImportedArtifact>() != null
                    || go.GetComponent<GreyboxDesignNode>() != null
                    || go.GetComponent<GreyboxGeneratedComponents>() != null);
        }

        public static string IncomingSidecarPath(string canonicalPath)
        {
            const string PrefabExtension = ".prefab";
            if (canonicalPath != null && canonicalPath.EndsWith(PrefabExtension, StringComparison.OrdinalIgnoreCase))
            {
                string stem = canonicalPath.Substring(0, canonicalPath.Length - PrefabExtension.Length);
                return $"{stem}{IncomingSidecarSuffix}{PrefabExtension}";
            }
            return $"{canonicalPath}{IncomingSidecarSuffix}";
        }

        public static string GeneratedPrefabPath(GreyboxArtifactKind kind, string sourcePath, string projectId)
        {
            string folder = kind switch
            {
                GreyboxArtifactKind.LevelBoard => GreyboxGeneratedAssetPaths.LevelBoardsFolder,
                GreyboxArtifactKind.HudLayout => GreyboxGeneratedAssetPaths.HudLayoutsFolder,
                _ => GreyboxGeneratedAssetPaths.GameViewportsFolder,
            };
            return GreyboxGeneratedAssetPaths.GeneratedAssetPath(sourcePath, projectId, folder, "greybox-artifact", ".prefab");
        }

        private static bool IsGreyboxOwnedComponent(Component component)
        {
            // Missing-script components have unknown ownership, so preserve the canonical prefab.
            if (!component) return false;
            Type type = component.GetType();
            string fullName = type.FullName ?? "";
            if (IsRecordedGeneratedComponent(component, fullName)) return true;
            if (KnownUnityComponentTypes.Contains(fullName)) return true;
            string ns = type.Namespace ?? "";
            if (string.IsNullOrEmpty(ns)) return false;
            if (GreyboxOwnedNamespaces.Contains(ns)) return true;
            return ns.StartsWith("Greybox.", StringComparison.Ordinal);
        }

        private static bool IsRecordedGeneratedComponent(Component component, string fullName)
        {
            var manifest = component.GetComponent<GreyboxGeneratedComponents>();
            return manifest && manifest.Contains(fullName);
        }

        private static void RecordGeneratedPrefabMetadata(GameObject root, GreyboxArtifactKind kind, string sourcePath, string canonicalPath, string targetPath)
        {
            var imported = root.GetComponent<GreyboxImportedArtifact>() ?? root.AddComponent<GreyboxImportedArtifact>();
            imported.Kind = kind;
            string safeExistingSourcePath = SafeSourcePath(imported.SourcePath);
            imported.SourcePath = !string.IsNullOrWhiteSpace(safeExistingSourcePath)
                ? safeExistingSourcePath
                : SafeSourcePath(sourcePath);
            imported.CanonicalGeneratedAssetPath = canonicalPath ?? "";
            imported.ExportedAssetPath = targetPath ?? "";
            imported.ExportedToIncomingSidecar = !string.Equals(canonicalPath, targetPath, StringComparison.Ordinal);
        }

        private static string SafeSourcePath(string sourcePath)
        {
            string input = (sourcePath ?? "").Trim().Replace('\\', '/');
            if (string.IsNullOrWhiteSpace(input) || input.Contains("://")) return "";

            var builder = new StringBuilder(Math.Min(input.Length, MaxSourcePathLength));
            foreach (char c in input)
            {
                if (char.IsControl(c)) continue;
                builder.Append(c);
                if (builder.Length >= MaxSourcePathLength) break;
            }

            string normalized = builder.ToString().Trim();
            return IsSafeSourcePath(normalized) ? normalized : "";
        }

        private static bool IsSafeSourcePath(string sourcePath)
        {
            if (string.IsNullOrWhiteSpace(sourcePath)) return false;
            if (sourcePath.StartsWith("/", StringComparison.Ordinal) || sourcePath.StartsWith("~", StringComparison.Ordinal)) return false;
            if (sourcePath.Length >= 2 && sourcePath[1] == ':') return false;
            string[] segments = sourcePath.Split('/');
            foreach (string segment in segments)
            {
                if (string.IsNullOrWhiteSpace(segment) || segment == "." || segment == "..") return false;
            }

            return true;
        }
    }
}
