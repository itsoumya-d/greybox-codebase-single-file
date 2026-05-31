// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Greybox.Editor.Generation;
using UnityEditor;
using UnityEngine;

namespace Greybox.Editor.Importers
{
    public static class GreyboxProjectArtifactImporter
    {
        private const string DesignMarkdownFileName = "DESIGN.md";
        private const int MaxJsonArtifactMirrorBytes = GreyboxImportJson.MaxImportJsonLength;
        private const int MaxArtBibleMirrorBytes = ArtBibleImporter.MaxArtBibleMarkdownImportLength;
        private const int MaxHudMirrorBytes = HudLayoutImporter.MaxHudHtmlImportLength;
        private const int MaxProjectArtifactScanFiles = 4096;
        private const int MaxProjectArtifactCandidates = 512;

        private static readonly string[] UnityArtifactExtensions =
        {
            ".gameview",
            ".gameview.json",
            ".levelboard",
            ".levelboard.json",
            ".gbhud",
            ".hud.html",
            ".design",
        };

        [MenuItem("Greybox Studio/Import Project Artifacts")]
        public static void ImportProjectArtifactsMenu()
        {
            string[] roots = SelectedImportRoots().ToArray();
            int imported = ImportProjectArtifacts(roots);
            EditorUtility.DisplayDialog(
                "Greybox Project Artifacts",
                imported == 1
                    ? "Imported 1 Greybox project artifact."
                    : $"Imported {imported} Greybox project artifacts.",
                "OK"
            );
        }

        internal static int ImportProjectArtifacts(IEnumerable<string> roots)
        {
            int imported = 0;
            foreach (string assetPath in FindProjectArtifactAssetPaths(roots))
            {
                string importPath = EnsureUnityImportAsset(assetPath);
                if (string.IsNullOrWhiteSpace(importPath)) continue;
                AssetDatabase.ImportAsset(importPath, ImportAssetOptions.ForceUpdate | ImportAssetOptions.ForceSynchronousImport);
                imported++;
            }
            AddressablesTagger.FlushPending();
            AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
            return imported;
        }

        internal static IEnumerable<string> FindProjectArtifactAssetPaths(IEnumerable<string> roots)
        {
            var candidates = new List<string>();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (string root in NormalizeRoots(roots))
            {
                if (File.Exists(root))
                {
                    string normalizedRoot = NormalizeAssetPath(root);
                    if (IsProjectArtifactPath(normalizedRoot) && !AddProjectArtifactCandidate(candidates, normalizedRoot)) break;
                    continue;
                }

                if (!Directory.Exists(root)) continue;
                foreach (string assetPath in ProjectFilesUnder(root)
                    .Select(NormalizeAssetPath)
                    .Where(IsProjectArtifactPath))
                {
                    if (!AddProjectArtifactCandidate(candidates, assetPath)) break;
                }
                if (candidates.Count >= MaxProjectArtifactCandidates) break;
            }

            foreach (string assetPath in candidates
                .OrderBy(ImportPriority)
                .ThenBy(path => path, StringComparer.OrdinalIgnoreCase))
            {
                if (seen.Add(ImportIdentity(assetPath))) yield return assetPath;
            }
        }

        private static bool AddProjectArtifactCandidate(ICollection<string> candidates, string assetPath)
        {
            if (candidates.Count >= MaxProjectArtifactCandidates) return false;
            string sourceMarkdownPath = SourceDesignMarkdownPathForProxy(assetPath);
            candidates.Add(string.IsNullOrWhiteSpace(sourceMarkdownPath) ? assetPath : sourceMarkdownPath);
            return candidates.Count < MaxProjectArtifactCandidates;
        }

        private static IEnumerable<string> ProjectFilesUnder(string root)
        {
            int scanned = 0;
            foreach (string file in Directory.EnumerateFiles(root, "*", SearchOption.AllDirectories))
            {
                if (scanned >= MaxProjectArtifactScanFiles) yield break;
                scanned++;
                yield return file;
            }
        }

        private static string SourceDesignMarkdownPathForProxy(string assetPath)
        {
            string normalized = NormalizeAssetPath(assetPath);
            if (!normalized.EndsWith(".design", StringComparison.OrdinalIgnoreCase)) return "";
            string directory = Path.GetDirectoryName(normalized)?.Replace('\\', '/') ?? "Assets";
            string markdownPath = $"{directory}/{DesignMarkdownFileName}";
            if (!File.Exists(markdownPath)) return "";
            return string.Equals(DesignMarkdownPostprocessor.ProxyDesignAssetPath(markdownPath), normalized, StringComparison.OrdinalIgnoreCase)
                ? markdownPath
                : "";
        }

        private static string ImportIdentity(string assetPath)
        {
            string importPath = UnityImportAssetPath(assetPath);
            return string.IsNullOrWhiteSpace(importPath) ? assetPath : importPath;
        }

        internal static bool IsProjectArtifactPath(string assetPath)
        {
            string normalized = NormalizeAssetPath(assetPath);
            if (!IsSafeUnityAssetPath(normalized, false)) return false;
            if (string.Equals(Path.GetFileName(normalized), DesignMarkdownFileName, StringComparison.OrdinalIgnoreCase)
                && DesignMarkdownPostprocessor.IsDesignMarkdownPath(normalized))
            {
                return true;
            }
            return UnityArtifactExtensions.Any(extension => normalized.EndsWith(extension, StringComparison.OrdinalIgnoreCase));
        }

        internal static string EnsureUnityImportAsset(string artifactPath)
        {
            return EnsureUnityImportAsset(artifactPath, out _);
        }

        internal static string EnsureUnityImportAsset(string artifactPath, out bool wroteMirror)
        {
            string normalized = NormalizeAssetPath(artifactPath);
            wroteMirror = false;
            string importPath = UnityImportAssetPath(normalized);
            if (string.IsNullOrWhiteSpace(importPath)) return "";
            if (string.Equals(importPath, normalized, StringComparison.OrdinalIgnoreCase)) return normalized;
            if (!File.Exists(normalized)) return "";

            int maxMirrorBytes = MaxProjectArtifactMirrorBytes(normalized);
            if (!GreyboxImportFile.TryReadText(normalized, maxMirrorBytes, "Project Artifact", out string content, out _)) return "";
            string directory = Path.GetDirectoryName(importPath);
            if (!string.IsNullOrWhiteSpace(directory)) Directory.CreateDirectory(directory);
            bool mirrorMatches = GreyboxImportFile.TryReadText(importPath, maxMirrorBytes, "Project Artifact Mirror", out string existingContent, out _)
                && existingContent == content;
            if (!mirrorMatches)
            {
                if (!GreyboxImportFile.TryWriteTextAtomically(importPath, content, maxMirrorBytes, "Project Artifact Mirror", out _)) return "";
                wroteMirror = true;
            }
            return importPath;
        }

        private static int MaxProjectArtifactMirrorBytes(string artifactPath)
        {
            string normalized = NormalizeAssetPath(artifactPath);
            if (DesignMarkdownPostprocessor.IsDesignMarkdownPath(normalized)
                || normalized.EndsWith(".design", StringComparison.OrdinalIgnoreCase))
            {
                return MaxArtBibleMirrorBytes;
            }
            if (normalized.EndsWith(".gbhud", StringComparison.OrdinalIgnoreCase)
                || normalized.EndsWith(".hud.html", StringComparison.OrdinalIgnoreCase))
            {
                return MaxHudMirrorBytes;
            }
            return MaxJsonArtifactMirrorBytes;
        }

        internal static string UnityImportAssetPath(string artifactPath)
        {
            string normalized = NormalizeAssetPath(artifactPath);
            if (!IsSafeUnityAssetPath(normalized, false)) return "";
            if (normalized.EndsWith(".gameview.json", StringComparison.OrdinalIgnoreCase))
            {
                return normalized.Substring(0, normalized.Length - ".json".Length);
            }
            if (normalized.EndsWith(".levelboard.json", StringComparison.OrdinalIgnoreCase))
            {
                return normalized.Substring(0, normalized.Length - ".json".Length);
            }
            if (normalized.EndsWith(".hud.html", StringComparison.OrdinalIgnoreCase))
            {
                return normalized.Substring(0, normalized.Length - ".hud.html".Length) + ".gbhud";
            }
            if (DesignMarkdownPostprocessor.IsDesignMarkdownPath(normalized))
            {
                return DesignMarkdownPostprocessor.ProxyDesignAssetPath(normalized);
            }
            return normalized;
        }

        private static int ImportPriority(string assetPath)
        {
            if (DesignMarkdownPostprocessor.IsDesignMarkdownPath(assetPath)) return 0;
            if (IsCanonicalDaemonArtifactPath(assetPath)) return 1;
            return 2;
        }

        private static bool IsCanonicalDaemonArtifactPath(string assetPath)
        {
            string normalized = NormalizeAssetPath(assetPath);
            return normalized.EndsWith(".gameview.json", StringComparison.OrdinalIgnoreCase)
                || normalized.EndsWith(".levelboard.json", StringComparison.OrdinalIgnoreCase)
                || normalized.EndsWith(".hud.html", StringComparison.OrdinalIgnoreCase);
        }

        private static IEnumerable<string> SelectedImportRoots()
        {
            foreach (UnityEngine.Object selection in Selection.objects ?? Array.Empty<UnityEngine.Object>())
            {
                string path = AssetDatabase.GetAssetPath(selection);
                if (!string.IsNullOrWhiteSpace(path)) yield return path;
            }
            if ((Selection.objects == null || Selection.objects.Length == 0))
            {
                yield return "Assets";
            }
        }

        private static IEnumerable<string> NormalizeRoots(IEnumerable<string> roots)
        {
            bool yielded = false;
            foreach (string root in roots ?? Array.Empty<string>())
            {
                string normalized = NormalizeAssetPath(root);
                if (!IsSafeUnityAssetPath(normalized, true)) continue;
                yielded = true;
                yield return normalized;
            }
            if (!yielded) yield return "Assets";
        }

        private static bool IsSafeUnityAssetPath(string path, bool allowAssetsRoot)
        {
            string normalized = NormalizeAssetPath(path);
            if (allowAssetsRoot && string.Equals(normalized, "Assets", StringComparison.Ordinal)) return true;
            if (!normalized.StartsWith("Assets/", StringComparison.Ordinal)) return false;
            if (normalized.Contains("://") || normalized.Contains("//")) return false;
            foreach (string part in normalized.Split(new[] { '/' }, StringSplitOptions.None))
            {
                if (string.IsNullOrWhiteSpace(part) || part == "." || part == "..") return false;
                foreach (char c in part)
                {
                    if (char.IsControl(c)) return false;
                }
            }
            return true;
        }

        private static string NormalizeAssetPath(string path)
        {
            return (path ?? "").Trim().Replace('\\', '/');
        }
    }
}
