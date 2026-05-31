// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System;
using System.Collections.Generic;
using Greybox.Editor.Generation;
using UnityEditor;

namespace Greybox.Editor.Importers
{
    public sealed class GreyboxProjectArtifactPostprocessor : AssetPostprocessor
    {
        private static void OnPostprocessAllAssets(string[] importedAssets, string[] deletedAssets, string[] movedAssets, string[] movedFromAssetPaths)
        {
            int importedMirrors = 0;
            importedMirrors += MirrorCanonicalDaemonArtifacts(importedAssets);
            importedMirrors += MirrorCanonicalDaemonArtifacts(movedAssets);
            if (importedMirrors > 0) AddressablesTagger.FlushPending();
        }

        internal static int MirrorCanonicalDaemonArtifacts(IEnumerable<string> assetPaths)
        {
            int importedMirrors = 0;
            foreach (string assetPath in assetPaths ?? Array.Empty<string>())
            {
                if (!IsCanonicalDaemonArtifactPath(assetPath)) continue;
                string mirrorPath = GreyboxProjectArtifactImporter.EnsureUnityImportAsset(assetPath, out bool wroteMirror);
                if (!wroteMirror || string.IsNullOrWhiteSpace(mirrorPath)) continue;
                AssetDatabase.ImportAsset(mirrorPath, ImportAssetOptions.ForceUpdate | ImportAssetOptions.ForceSynchronousImport);
                importedMirrors++;
            }
            return importedMirrors;
        }

        private static bool IsCanonicalDaemonArtifactPath(string assetPath)
        {
            string normalized = NormalizeAssetPath(assetPath);
            if (!normalized.StartsWith("Assets/", StringComparison.Ordinal)) return false;
            if (IsUnityMirrorOrDesignPath(normalized)) return false;
            return normalized.EndsWith(".gameview.json", StringComparison.OrdinalIgnoreCase)
                || normalized.EndsWith(".levelboard.json", StringComparison.OrdinalIgnoreCase)
                || normalized.EndsWith(".hud.html", StringComparison.OrdinalIgnoreCase);
        }

        private static bool IsUnityMirrorOrDesignPath(string assetPath)
        {
            string normalized = NormalizeAssetPath(assetPath);
            return normalized.EndsWith(".gameview", StringComparison.OrdinalIgnoreCase)
                || normalized.EndsWith(".levelboard", StringComparison.OrdinalIgnoreCase)
                || normalized.EndsWith(".gbhud", StringComparison.OrdinalIgnoreCase)
                || normalized.EndsWith(".design", StringComparison.OrdinalIgnoreCase)
                || string.Equals(System.IO.Path.GetFileName(normalized), "DESIGN.md", StringComparison.OrdinalIgnoreCase);
        }

        private static string NormalizeAssetPath(string assetPath)
        {
            return (assetPath ?? "").Trim().Replace('\\', '/');
        }
    }
}
