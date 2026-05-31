// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System;
using System.IO;
using UnityEditor;

namespace Greybox.Editor.Importers
{
    public sealed class DesignMarkdownPostprocessor : AssetPostprocessor
    {
        private const int MaxDesignMarkdownBytes = 1024 * 1024;

        private static void OnPostprocessAllAssets(string[] importedAssets, string[] deletedAssets, string[] movedAssets, string[] movedFromAssetPaths)
        {
            foreach (string assetPath in importedAssets ?? Array.Empty<string>())
            {
                MirrorDesignMarkdown(assetPath);
            }
            foreach (string assetPath in movedAssets ?? Array.Empty<string>())
            {
                MirrorDesignMarkdown(assetPath);
            }
        }

        internal static bool IsDesignMarkdownPath(string assetPath)
        {
            string normalized = NormalizeAssetPath(assetPath);
            return normalized.StartsWith("Assets/", StringComparison.Ordinal)
                && string.Equals(Path.GetFileName(normalized), "DESIGN.md", StringComparison.OrdinalIgnoreCase);
        }

        internal static string ProxyDesignAssetPath(string markdownAssetPath)
        {
            string normalized = NormalizeAssetPath(markdownAssetPath);
            if (!IsDesignMarkdownPath(normalized)) return "";
            string directory = Path.GetDirectoryName(normalized)?.Replace('\\', '/') ?? "Assets";
            string stem = string.Equals(directory, "Assets", StringComparison.OrdinalIgnoreCase)
                ? "art-bible"
                : SafeFileStem(Path.GetFileName(directory));
            return $"{directory}/{stem}.design";
        }

        private static bool MirrorDesignMarkdown(string assetPath)
        {
            if (!IsDesignMarkdownPath(assetPath)) return false;
            string proxyPath = ProxyDesignAssetPath(assetPath);
            if (string.IsNullOrWhiteSpace(proxyPath)) return false;
            if (!GreyboxImportFile.TryReadText(assetPath, MaxDesignMarkdownBytes, "Design Markdown", out string markdown, out _)) return false;
            if (string.IsNullOrWhiteSpace(markdown)) return false;

            if (GreyboxImportFile.TryReadText(proxyPath, MaxDesignMarkdownBytes, "Design Markdown Proxy", out string existing, out _)
                && existing == markdown)
            {
                return false;
            }

            if (!GreyboxImportFile.TryWriteTextAtomically(proxyPath, markdown, MaxDesignMarkdownBytes, "Design Markdown Proxy", out _)) return false;
            AssetDatabase.ImportAsset(proxyPath, ImportAssetOptions.ForceUpdate | ImportAssetOptions.ForceSynchronousImport);
            return true;
        }

        private static string SafeFileStem(string value)
        {
            string result = string.IsNullOrWhiteSpace(value) ? "art-bible" : value.Trim();
            foreach (char c in Path.GetInvalidFileNameChars()) result = result.Replace(c, '-');
            return result.Replace(':', '-').Replace('*', '-').Replace('?', '-').Replace('/', '-').Replace('\\', '-');
        }

        private static string NormalizeAssetPath(string assetPath)
        {
            return (assetPath ?? "").Trim().Replace('\\', '/');
        }
    }
}
