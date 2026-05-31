// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Greybox.Editor.Windows;
using Greybox.Runtime;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;
using UnityEngine.Networking;

namespace Greybox.Editor.Sync
{
    public static class GreyboxArtifactRefresher
    {
        private const int MaxArtifactBytes = 1024 * 1024;
        private const int MaxArtifactNameChars = 512;
        private const int MaxArtifactNamePartChars = 160;
        private const int MaxRawArtifactPullMs = 1500;
        private const int RawArtifactPollMs = 16;
        private const int MaxUnityPackageReferenceScanDepth = 64;
        private const int MaxUnityPackageReferenceScanNodes = 8192;
        private const int MaxUnityPackageReferenceStringChars = 2048;
        private const string GeneratedArtifactImportRoot = "Assets/GreyboxGenerated/Artifacts";
        private const string RootArtBibleAssetName = "art-bible.design";

        public static event Action<string> UnityPackageRefreshRequested;

        private static readonly string[] SupportedImportedExtensions =
        {
            ".gameview",
            ".levelboard",
            ".gbhud",
            ".design",
        };

        private static readonly string[] SupportedDaemonExtensions =
        {
            ".gameview",
            ".gameview.json",
            ".levelboard",
            ".levelboard.json",
            ".gbhud",
            ".hud.html",
            ".design",
            "DESIGN.md",
        };

        private static readonly HashSet<string> UnityPackageReferenceFields = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "assetSource",
            "assetFile",
            "assetUrl",
            "fbxSource",
            "fbxFile",
            "fbxUrl",
            "meshSource",
            "meshFile",
            "meshUrl",
            "prefabSource",
            "prefabFile",
            "prefabUrl",
            "materialSource",
            "materialFile",
            "materialUrl",
            "unityAssetSource",
            "unityAssetUrl",
            "unityAssetFile",
            "unityMaterialSource",
            "unityMaterialUrl",
            "unityMaterialFile",
            "prefabAssetPath",
            "meshAssetPath",
            "materialAssetPath",
            "unityAssetGuid",
            "materialAssetGuid",
        };

        public static async void PullAndRefreshFromEvent(JObject evt, GreyboxConfig config)
        {
            if (!GreyboxLicenseState.CurrentCapabilities().CanRoundTrip)
            {
                Debug.LogWarning("Greybox web-to-Unity artifact refresh requires a Pro or Studio license.");
                return;
            }
            if (!config || !GreyboxDaemonUrlBuilder.TrySafeProjectId(config.ProjectId, out _))
            {
                RefreshFromEvent(evt);
                return;
            }

            var payload = evt?["payload"] as JObject ?? evt;
            if (payload == null || IsNonRefreshSyncEvent(payload)) return;

            bool refreshed = false;
            foreach (string artifactName in ExtractArtifactNames(payload).Distinct(StringComparer.OrdinalIgnoreCase))
            {
                refreshed = await PullAndRefreshArtifactAsync(config, artifactName) || refreshed;
            }

            if (refreshed)
            {
                AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
                Debug.Log("Greybox pulled latest daemon artifacts into Unity and refreshed imports.");
                return;
            }

            RefreshFromEvent(evt);
        }

        public static async Task<bool> PullAndRefreshArtifactAsync(GreyboxConfig config, string artifactName)
        {
            if (!GreyboxLicenseState.CurrentCapabilities().CanRoundTrip) return false;
            if (!config || !GreyboxDaemonUrlBuilder.TrySafeProjectId(config.ProjectId, out _) || string.IsNullOrWhiteSpace(artifactName)) return false;
            artifactName = NormalizePath(artifactName);
            if (!IsSafeDaemonArtifactName(artifactName) || !IsSupportedDaemonName(artifactName)) return false;
            string[] assetPaths = FindMatchingAssetPaths(artifactName).ToArray();

            if (IsAmbiguousDesignMarkdownTarget(artifactName, assetPaths))
            {
                foreach (string assetPath in assetPaths) ImportExistingAsset(assetPath);
                AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
                return true;
            }

            string content = await DownloadRawArtifactAsync(config, artifactName);
            if (content == null || !IsContentSafeForAsset(artifactName, content))
            {
                if (assetPaths.Length == 0) return false;
                foreach (string assetPath in assetPaths) ImportExistingAsset(assetPath);
                AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
                return true;
            }

            if (assetPaths.Length == 0)
            {
                string generatedPath = GeneratedImportAssetPath(artifactName);
                if (string.IsNullOrWhiteSpace(generatedPath)) return false;
                assetPaths = new[] { generatedPath };
            }

            bool refreshed = false;
            foreach (string assetPath in assetPaths)
            {
                if (!IsSupportedLocalWritePath(assetPath)) continue;
                if (!TryWriteArtifactText(assetPath, content)) continue;
                ImportExistingAsset(assetPath);
                refreshed = true;
            }

            if (refreshed)
            {
                if (ShouldRequestUnityPackageRefresh(artifactName, content))
                {
                    UnityPackageRefreshRequested?.Invoke(NormalizePath(artifactName));
                }
                AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
            }
            return refreshed;
        }

        public static bool RefreshFromEvent(JObject evt)
        {
            var payload = evt?["payload"] as JObject ?? evt;
            if (payload == null || IsNonRefreshSyncEvent(payload)) return false;

            string[] candidateNames = ExtractArtifactNames(payload).ToArray();
            if (candidateNames.Length == 0) return false;

            string[] assetPaths = candidateNames
                .SelectMany(FindMatchingAssetPaths)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(path => path, StringComparer.OrdinalIgnoreCase)
                .ToArray();

            if (assetPaths.Length == 0)
            {
                Debug.Log($"Greybox received artifact change but found no matching Unity asset for: {string.Join(", ", candidateNames)}");
                return false;
            }

            foreach (string assetPath in assetPaths)
            {
                ImportExistingAsset(assetPath);
            }
            AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
            Debug.Log($"Greybox refreshed {assetPaths.Length} artifact asset(s) from daemon change.");
            return true;
        }

        internal static IEnumerable<string> ExtractArtifactNames(JObject payload)
        {
            foreach (string name in ExtractRawNames(payload))
            {
                string normalized = NormalizePath(name);
                if (IsSafeDaemonArtifactName(normalized) && IsSupportedDaemonName(normalized)) yield return normalized;
            }
        }

        internal static IEnumerable<string> FindMatchingAssetPaths(string artifactName)
        {
            string normalized = NormalizePath(artifactName);
            if (string.IsNullOrEmpty(normalized)) yield break;

            string[] allAssetPaths = AssetDatabase.GetAllAssetPaths()
                .Where(IsSupportedImportedAssetPath)
                .ToArray();

            string expectedRelativeName = ExpectedUnityAssetPathSuffix(normalized);
            string[] exactMatches = allAssetPaths
                .Where(path => NormalizePath(path).EndsWith("/" + expectedRelativeName, StringComparison.OrdinalIgnoreCase))
                .ToArray();
            if (exactMatches.Length > 0)
            {
                foreach (string assetPath in exactMatches) yield return assetPath;
                yield break;
            }

            if (string.Equals(Path.GetFileName(normalized), "DESIGN.md", StringComparison.OrdinalIgnoreCase))
            {
                foreach (string assetPath in allAssetPaths.Where(path => path.EndsWith(".design", StringComparison.OrdinalIgnoreCase)))
                {
                    yield return assetPath;
                }
                yield break;
            }

            string expectedFileName = Path.GetFileName(expectedRelativeName);
            foreach (string assetPath in allAssetPaths)
            {
                string normalizedAssetPath = NormalizePath(assetPath);
                string assetFileName = Path.GetFileName(normalizedAssetPath);
                if (string.Equals(assetFileName, expectedFileName, StringComparison.OrdinalIgnoreCase))
                {
                    yield return assetPath;
                }
            }
        }

        internal static string GeneratedImportAssetPath(string artifactName)
        {
            if (!IsSafeDaemonArtifactName(artifactName)) return "";
            string suffix = SafeUnityRelativePath(ExpectedUnityAssetPathSuffix(artifactName));
            if (string.IsNullOrWhiteSpace(suffix)) return "";
            string path = $"{GeneratedArtifactImportRoot}/{suffix}";
            return IsSupportedImportedAssetPath(path) ? path : "";
        }

        internal static bool ShouldRequestUnityPackageRefresh(string artifactName, string content)
        {
            if (!IsUnityModelArtifactName(artifactName) || string.IsNullOrWhiteSpace(content)) return false;
            try
            {
                return HasUnityPackageReference(JToken.Parse(content));
            }
            catch
            {
                return false;
            }
        }

        private static bool IsUnityModelArtifactName(string artifactName)
        {
            string normalized = NormalizePath(artifactName);
            return normalized.EndsWith(".gameview", StringComparison.OrdinalIgnoreCase)
                || normalized.EndsWith(".gameview.json", StringComparison.OrdinalIgnoreCase)
                || normalized.EndsWith(".levelboard", StringComparison.OrdinalIgnoreCase)
                || normalized.EndsWith(".levelboard.json", StringComparison.OrdinalIgnoreCase);
        }

        private static bool HasUnityPackageReference(JToken token)
        {
            if (token == null) return false;
            var stack = new Stack<(JToken Token, int Depth)>();
            stack.Push((token, 0));
            int scannedNodes = 0;
            while (stack.Count > 0)
            {
                var current = stack.Pop();
                if (current.Token == null) continue;
                scannedNodes++;
                if (scannedNodes > MaxUnityPackageReferenceScanNodes) return false;
                if (current.Depth > MaxUnityPackageReferenceScanDepth) return false;

                if (current.Token is JObject obj)
                {
                    foreach (JProperty property in obj.Properties())
                    {
                        if (string.Equals(property.Name, "greyboxImportedAssets", StringComparison.OrdinalIgnoreCase)
                            && property.Value is JArray importedAssets
                            && importedAssets.Count > 0)
                        {
                            return importedAssets.Count <= MaxUnityPackageReferenceScanNodes;
                        }
                        if (UnityPackageReferenceFields.Contains(property.Name)
                            && property.Value.Type == JTokenType.String)
                        {
                            string value = property.Value.Value<string>();
                            if (!string.IsNullOrWhiteSpace(value))
                            {
                                return value.Length <= MaxUnityPackageReferenceStringChars;
                            }
                        }
                        stack.Push((property.Value, current.Depth + 1));
                    }
                    continue;
                }

                if (current.Token is JArray array)
                {
                    if (array.Count > MaxUnityPackageReferenceScanNodes) return false;
                    for (int index = array.Count - 1; index >= 0; index--)
                    {
                        stack.Push((array[index], current.Depth + 1));
                    }
                }
            }
            return false;
        }

        private static bool IsNonRefreshSyncEvent(JObject payload)
        {
            TryReadStringField(payload, "type", out string type);
            TryReadStringField(payload, "action", out string action);
            if (string.Equals(type, "round_trip_merge", StringComparison.OrdinalIgnoreCase)
                && string.Equals(action, "conflict", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
            return string.Equals(type, "unity_edit", StringComparison.OrdinalIgnoreCase)
                || (string.Equals(type, "round_trip_merge", StringComparison.OrdinalIgnoreCase)
                    && string.Equals(action, "unity-edit-merged", StringComparison.OrdinalIgnoreCase));
        }

        private static IEnumerable<string> ExtractRawNames(JObject payload)
        {
            foreach (string key in new[] { "fileName", "path", "writtenFileName", "systemFileName" })
            {
                if (TryReadStringField(payload, key, out string value)) yield return value;
            }

            if (payload["writtenFileNames"] is JArray writtenFileNames)
            {
                foreach (JToken token in writtenFileNames)
                {
                    if (token.Type != JTokenType.String) continue;
                    string value = token.Value<string>();
                    if (!string.IsNullOrWhiteSpace(value)) yield return value;
                }
            }

            if (payload["file"] is JObject file)
            {
                foreach (string key in new[] { "name", "path" })
                {
                    if (TryReadStringField(file, key, out string value)) yield return value;
                }
            }

            if (payload["artifact"] is JObject artifact)
            {
                foreach (string key in new[] { "fileName", "path" })
                {
                    if (TryReadStringField(artifact, key, out string value)) yield return value;
                }
            }
        }

        private static bool TryReadStringField(JObject source, string key, out string value)
        {
            value = "";
            JToken token = source?[key];
            if (token == null || token.Type != JTokenType.String) return false;
            value = token.Value<string>() ?? "";
            return !string.IsNullOrWhiteSpace(value);
        }

        private static string ExpectedUnityAssetPathSuffix(string artifactName)
        {
            string normalized = NormalizePath(artifactName).TrimStart('/');
            if (string.Equals(Path.GetFileName(normalized), "DESIGN.md", StringComparison.OrdinalIgnoreCase))
            {
                string directory = Path.GetDirectoryName(normalized)?.Replace('\\', '/') ?? "";
                string stem = string.IsNullOrWhiteSpace(directory) ? "art-bible" : SafeUnityFileStem(Path.GetFileName(directory));
                return string.IsNullOrWhiteSpace(directory) ? RootArtBibleAssetName : $"{directory}/{stem}.design";
            }
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
            return normalized;
        }

        private static string SafeUnityFileStem(string value)
        {
            string result = string.IsNullOrWhiteSpace(value) ? "art-bible" : value.Trim();
            foreach (char c in Path.GetInvalidFileNameChars()) result = result.Replace(c, '-');
            return result.Replace('/', '-').Replace('\\', '-');
        }

        private static string SafeUnityRelativePath(string value)
        {
            string normalized = NormalizePath(value).TrimStart('/');
            if (normalized.StartsWith("Assets/", StringComparison.OrdinalIgnoreCase))
            {
                normalized = normalized.Substring("Assets/".Length);
            }

            var parts = new List<string>();
            foreach (string rawPart in normalized.Split(new[] { '/' }, StringSplitOptions.RemoveEmptyEntries))
            {
                if (rawPart == "." || rawPart == "..") continue;
                string part = rawPart;
                foreach (char c in Path.GetInvalidFileNameChars()) part = part.Replace(c, '-');
                part = part.Replace(':', '-').Replace('*', '-').Replace('?', '-');
                if (!string.IsNullOrWhiteSpace(part)) parts.Add(part);
            }
            return string.Join("/", parts);
        }

        private static bool IsSupportedDaemonName(string value)
        {
            if (string.IsNullOrEmpty(value)) return false;
            string fileName = Path.GetFileName(value);
            if (string.Equals(fileName, "DESIGN.md", StringComparison.OrdinalIgnoreCase)) return true;
            return SupportedDaemonExtensions.Any(extension =>
                extension.StartsWith(".", StringComparison.Ordinal)
                && fileName.EndsWith(extension, StringComparison.OrdinalIgnoreCase));
        }

        private static bool IsSupportedImportedAssetPath(string assetPath)
        {
            if (string.IsNullOrEmpty(assetPath)) return false;
            return SupportedImportedExtensions.Any(extension => assetPath.EndsWith(extension, StringComparison.OrdinalIgnoreCase));
        }

        private static bool IsSupportedLocalWritePath(string assetPath)
        {
            string normalized = NormalizePath(assetPath);
            return normalized.StartsWith("Assets/", StringComparison.Ordinal)
                && IsSupportedImportedAssetPath(normalized);
        }

        private static bool IsAmbiguousDesignMarkdownTarget(string artifactName, string[] assetPaths)
        {
            return string.Equals(Path.GetFileName(NormalizePath(artifactName)), "DESIGN.md", StringComparison.OrdinalIgnoreCase)
                && assetPaths.Count(IsSupportedLocalWritePath) != 1;
        }

        private static bool TryWriteArtifactText(string assetPath, string content)
        {
            string normalized = NormalizePath(assetPath);
            if (!IsSupportedLocalWritePath(normalized)) return false;
            if (string.IsNullOrEmpty(content) || content.Length > MaxArtifactBytes) return false;

            string directory = Path.GetDirectoryName(normalized);
            if (string.IsNullOrWhiteSpace(directory)) return false;
            Directory.CreateDirectory(directory);

            string tempPath = $"{normalized}.greybox-tmp-{Guid.NewGuid():N}";
            try
            {
                File.WriteAllText(tempPath, content, Encoding.UTF8);
                if (File.Exists(normalized))
                {
                    File.Replace(tempPath, normalized, null);
                }
                else
                {
                    File.Move(tempPath, normalized);
                }
                return true;
            }
            catch
            {
                try
                {
                    if (File.Exists(tempPath)) File.Delete(tempPath);
                }
                catch
                {
                    // Best-effort cleanup; the caller fails closed and leaves existing assets untouched.
                }
                return false;
            }
        }

        private static async Task<string> DownloadRawArtifactAsync(GreyboxConfig config, string artifactName)
        {
            string url = BuildRawArtifactUrl(config, artifactName);
            if (string.IsNullOrWhiteSpace(url)) return null;
            using var request = UnityWebRequest.Get(url);
            request.timeout = Math.Max(1, (MaxRawArtifactPullMs + 999) / 1000);
            long startedAtMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var op = request.SendWebRequest();
            while (!op.isDone)
            {
                if (DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - startedAtMs > MaxRawArtifactPullMs)
                {
                    request.Abort();
                    Debug.LogWarning($"Greybox aborted daemon artifact pull after {MaxRawArtifactPullMs}ms to preserve the round-trip sync budget.");
                    return null;
                }
                await Task.Delay(RawArtifactPollMs);
            }
            if (request.result != UnityWebRequest.Result.Success)
            {
                Debug.LogWarning($"Greybox could not pull latest artifact from daemon: {request.error}");
                return null;
            }
            byte[] data = request.downloadHandler.data;
            if (data == null || data.Length == 0 || data.Length > MaxArtifactBytes)
            {
                Debug.LogWarning("Greybox skipped daemon artifact pull because the file was empty or too large.");
                return null;
            }
            return request.downloadHandler.text;
        }

        private static string BuildRawArtifactUrl(GreyboxConfig config, string artifactName)
        {
            if (!IsSafeDaemonArtifactName(artifactName) || !IsSupportedDaemonName(artifactName)) return "";
            if (!IsSafeDaemonBaseUrl(config?.DaemonUrl, out string baseUrl)) return "";
            if (!GreyboxDaemonUrlBuilder.TrySafeProjectId(config?.ProjectId, out string projectId)) return "";
            projectId = UnityWebRequest.EscapeURL(projectId);
            string[] parts = SafeRawArtifactUrlParts(artifactName);
            return $"{baseUrl}/api/projects/{projectId}/raw/{string.Join("/", parts)}";
        }

        private static bool IsSafeDaemonBaseUrl(string daemonUrl, out string baseUrl)
        {
            return GreyboxDaemonUrlBuilder.TrySafeDaemonBaseUrl(daemonUrl, out baseUrl);
        }

        private static string[] SafeRawArtifactUrlParts(string artifactName)
        {
            return NormalizePath(artifactName)
                .Split(new[] { '/' }, StringSplitOptions.RemoveEmptyEntries)
                .Where(part => part != "." && part != "..")
                .Select(UnityWebRequest.EscapeURL)
                .ToArray();
        }

        private static bool IsSafeDaemonArtifactName(string artifactName)
        {
            string normalized = NormalizePath(artifactName);
            if (string.IsNullOrWhiteSpace(normalized)) return false;
            if (normalized.Length > MaxArtifactNameChars) return false;
            if (normalized.StartsWith("/", StringComparison.Ordinal)) return false;
            if (normalized.Contains("://")) return false;
            if (normalized.Contains("//")) return false;
            foreach (string part in normalized.Split(new[] { '/' }, StringSplitOptions.RemoveEmptyEntries))
            {
                if (string.IsNullOrWhiteSpace(part) || part == "." || part == "..") return false;
                if (part.Length > MaxArtifactNamePartChars) return false;
                foreach (char c in part)
                {
                    if (char.IsControl(c)) return false;
                }
            }
            return true;
        }

        private static bool IsContentSafeForAsset(string artifactName, string content)
        {
            if (string.IsNullOrEmpty(content) || content.Length > MaxArtifactBytes) return false;
            string normalized = NormalizePath(artifactName);
            if (normalized.EndsWith(".gameview.json", StringComparison.OrdinalIgnoreCase)
                || normalized.EndsWith(".levelboard.json", StringComparison.OrdinalIgnoreCase)
                || normalized.EndsWith(".gameview", StringComparison.OrdinalIgnoreCase)
                || normalized.EndsWith(".levelboard", StringComparison.OrdinalIgnoreCase))
            {
                try
                {
                    JObject.Parse(content);
                    return true;
                }
                catch
                {
                    return false;
                }
            }
            if (normalized.EndsWith(".hud.html", StringComparison.OrdinalIgnoreCase)
                || normalized.EndsWith(".gbhud", StringComparison.OrdinalIgnoreCase))
            {
                return content.IndexOf("data-greybox-artifact=\"hud\"", StringComparison.OrdinalIgnoreCase) >= 0
                    || content.IndexOf("<meta name=\"generator\" content=\"Greybox +", StringComparison.OrdinalIgnoreCase) >= 0;
            }
            return normalized.EndsWith(".design", StringComparison.OrdinalIgnoreCase)
                || string.Equals(Path.GetFileName(normalized), "DESIGN.md", StringComparison.OrdinalIgnoreCase);
        }

        private static void ImportExistingAsset(string assetPath)
        {
            AssetDatabase.ImportAsset(assetPath, ImportAssetOptions.ForceUpdate | ImportAssetOptions.ForceSynchronousImport);
        }

        private static string NormalizePath(string path)
        {
            return (path ?? "").Trim().Replace('\\', '/');
        }
    }
}
