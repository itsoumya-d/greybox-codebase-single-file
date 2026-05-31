// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using Greybox.Editor.Sync;
using UnityEditor;

namespace Greybox.Editor.Generation
{
    public static class GreyboxGeneratedAssetPaths
    {
        public const string Root = "Assets/Greybox/Generated";
        public const string ArtBibleMaterialsFolder = "Materials";
        public const string GameViewportsFolder = "GameViewports";
        public const string HudLayoutsFolder = "HudLayouts";
        public const string LevelBoardsFolder = "LevelBoards";
        public const string ReceiptsFolder = "Receipts";
        private const int MaxSegmentLength = 80;

        public static string GeneratedAssetPath(string sourcePath, string projectId, string subfolder, string fileNameFallback, string extension)
        {
            string projectSlug = ProjectSlug(projectId);
            string fileName = SourceAssetStem(sourcePath);
            if (string.IsNullOrWhiteSpace(fileName)) fileName = fileNameFallback;
            string dotExtension = extension.StartsWith(".") ? extension : "." + extension;
            return $"{Root}/{projectSlug}/{subfolder}/{fileName}{dotExtension}";
        }

        public static string ProjectSlug(string projectId)
        {
            if (!GreyboxDaemonUrlBuilder.TrySafeProjectId(projectId, out string safeProjectId)) return "local";
            string projectSlug = SafeSegment(safeProjectId);
            return string.IsNullOrWhiteSpace(projectSlug) ? "local" : projectSlug;
        }

        public static void EnsureFolder(string folderPath)
        {
            string normalized = NormalizePath(folderPath);
            string[] parts = normalized.Split('/');
            if (parts.Length == 0 || parts[0] != "Assets") return;

            string current = "Assets";
            for (int index = 1; index < parts.Length; index++)
            {
                if (string.IsNullOrWhiteSpace(parts[index])) continue;
                string next = $"{current}/{parts[index]}";
                if (!AssetDatabase.IsValidFolder(next)) AssetDatabase.CreateFolder(current, parts[index]);
                current = next;
            }
        }

        public static string SafeSegment(string value)
        {
            string input = (value ?? "").Trim().ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(input)) return "";

            var builder = new System.Text.StringBuilder(input.Length);
            bool previousDash = false;
            foreach (char c in input)
            {
                bool safe = (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_';
                if (safe)
                {
                    builder.Append(c);
                    previousDash = false;
                    continue;
                }
                if (previousDash) continue;
                builder.Append('-');
                previousDash = true;
            }

            string result = builder.ToString().Trim('-');
            if (result.Length > MaxSegmentLength) result = result.Substring(0, MaxSegmentLength).Trim('-');
            return result == "." || result == ".." ? "" : result;
        }

        public static string SourceAssetStem(string sourcePath)
        {
            string normalized = NormalizePath(sourcePath);
            if (string.IsNullOrWhiteSpace(normalized)) return "";
            string withoutExtension = System.IO.Path.ChangeExtension(normalized, null);
            string relative = ArtifactRelativePath(withoutExtension);
            string stem = SafeSegment(relative);
            if (!string.IsNullOrWhiteSpace(stem)) return stem;
            return SafeSegment(System.IO.Path.GetFileNameWithoutExtension(normalized));
        }

        private static string ArtifactRelativePath(string normalizedPath)
        {
            const string generatedImportRoot = "Assets/GreyboxGenerated/Artifacts/";
            if (normalizedPath.StartsWith(generatedImportRoot, System.StringComparison.OrdinalIgnoreCase))
            {
                return normalizedPath.Substring(generatedImportRoot.Length);
            }

            const string assetsRoot = "Assets/";
            if (normalizedPath.StartsWith(assetsRoot, System.StringComparison.OrdinalIgnoreCase))
            {
                return normalizedPath.Substring(assetsRoot.Length);
            }

            return normalizedPath;
        }

        public static string NormalizePath(string value)
        {
            return (value ?? "").Trim().Replace('\\', '/');
        }
    }
}
