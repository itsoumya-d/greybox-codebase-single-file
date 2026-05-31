// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System.Text;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System;
using Greybox.Editor.Windows;
using Greybox.Runtime;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Networking;

namespace Greybox.Editor.Sync
{
    public enum GreyboxConflictResolution
    {
        Unity,
        Web,
        Manual
    }

    public static class GreyboxConflictResolver
    {
        private const int MaxRoundTripFileNameLength = 512;
        private const int MaxRoundTripConflictPathLength = 512;
        private const int MaxRoundTripConflictPathSegmentLength = 128;
        private const int MaxRoundTripConflictSelectorValueLength = 160;
        private const int MaxRoundTripConflictValueJsonChars = 1024 * 1024;
        private const int MaxResolvedMergeContentChars = 1024 * 1024;
        private const int MaxRoundTripMergePayloadBytes = (1024 * 1024) + 8192;
        private const int MaxRoundTripMergeRequestMs = 2000;
        private const int RoundTripMergePollMs = 16;
        private static readonly HashSet<string> ForbiddenConflictPathKeys = new HashSet<string>(StringComparer.Ordinal)
        {
            "__proto__",
            "constructor",
            "prototype",
        };

        public static async void AcceptUnityMerge(GreyboxConfig config, GreyboxRoundTripConflict conflict)
        {
            await AcceptUnityMergeAsync(config, conflict);
        }

        public static async void AcceptWebMerge(GreyboxConfig config, GreyboxRoundTripConflict conflict)
        {
            await AcceptWebMergeAsync(config, conflict);
        }

        public static async void AcceptManualMerge(GreyboxConfig config, GreyboxRoundTripConflict conflict, string manualContent)
        {
            await AcceptManualMergeAsync(config, conflict, manualContent);
        }

        public static async void AcceptBatchMerge(GreyboxConfig config, IEnumerable<GreyboxRoundTripConflict> conflicts, GreyboxConflictResolution resolution)
        {
            await AcceptBatchMergeAsync(config, conflicts, resolution);
        }

        internal static async Task<bool> AcceptUnityMergeAsync(
            GreyboxConfig config,
            GreyboxRoundTripConflict conflict,
            Func<GreyboxConfig, string, string, Task<bool>> postResolvedMerge = null,
            Func<GreyboxConfig, string, Task<bool>> refreshArtifact = null)
        {
            return await AcceptResolvedMergeAsync(
                config,
                conflict,
                ResolveContent(conflict, GreyboxConflictResolution.Unity),
                postResolvedMerge,
                refreshArtifact);
        }

        internal static async Task<bool> AcceptWebMergeAsync(
            GreyboxConfig config,
            GreyboxRoundTripConflict conflict,
            Func<GreyboxConfig, string, string, Task<bool>> postResolvedMerge = null,
            Func<GreyboxConfig, string, Task<bool>> refreshArtifact = null)
        {
            if (!IsSafeConflictValueJson(conflict?.WebValueJson))
            {
                Debug.LogWarning($"Greybox refused to accept an oversized web conflict value above {MaxRoundTripConflictValueJsonChars} characters.");
                return false;
            }
            return await AcceptResolvedMergeAsync(
                config,
                conflict,
                ResolveContent(conflict, GreyboxConflictResolution.Web),
                postResolvedMerge,
                refreshArtifact);
        }

        internal static async Task<bool> AcceptManualMergeAsync(
            GreyboxConfig config,
            GreyboxRoundTripConflict conflict,
            string manualContent,
            Func<GreyboxConfig, string, string, Task<bool>> postResolvedMerge = null,
            Func<GreyboxConfig, string, Task<bool>> refreshArtifact = null)
        {
            return await AcceptResolvedMergeAsync(
                config,
                conflict,
                ResolveContent(conflict, GreyboxConflictResolution.Manual, manualContent),
                postResolvedMerge,
                refreshArtifact);
        }

        internal static async Task<int> AcceptBatchMergeAsync(
            GreyboxConfig config,
            IEnumerable<GreyboxRoundTripConflict> conflicts,
            GreyboxConflictResolution resolution,
            Func<GreyboxConfig, string, string, Task<bool>> postResolvedMerge = null,
            Func<GreyboxConfig, string, Task<bool>> refreshArtifact = null)
        {
            if (!GreyboxLicenseState.CurrentCapabilities().CanRoundTrip)
            {
                Debug.LogWarning("Greybox conflict resolution requires a Pro or Studio license.");
                return 0;
            }
            postResolvedMerge = postResolvedMerge ?? PostResolvedMerge;
            refreshArtifact = refreshArtifact ?? GreyboxArtifactRefresher.PullAndRefreshArtifactAsync;

            var groupedConflicts = (conflicts ?? System.Array.Empty<GreyboxRoundTripConflict>())
                .Where(conflict => conflict != null)
                .Select(conflict => new
                {
                    Conflict = conflict,
                    SafeFileName = SafeRoundTripFileName(conflict.FileName),
                    SafePath = SafeConflictJsonPath(conflict.Path),
                })
                .Where(item => !string.IsNullOrWhiteSpace(item.SafeFileName) && !string.IsNullOrWhiteSpace(item.SafePath))
                .GroupBy(item => item.SafeFileName, System.StringComparer.OrdinalIgnoreCase)
                .ToArray();
            int accepted = 0;
            foreach (var group in groupedConflicts)
            {
                var batch = group.Select(item => item.Conflict).ToArray();
                if (!HasSingleBatchDraft(batch))
                {
                    Debug.LogWarning($"Greybox skipped batch conflict resolution for {group.Key} because pending conflicts reference mixed daemon drafts.");
                    continue;
                }

                string resolvedContent;
                try
                {
                    resolvedContent = ResolveContent(batch, resolution);
                }
                catch (System.Exception ex)
                {
                    Debug.LogWarning($"Greybox could not build a batch conflict resolution for {group.Key}: {ex.Message}");
                    continue;
                }
                if (!IsSafeResolvedMergeContent(resolvedContent))
                {
                    Debug.LogWarning($"Greybox refused to post a resolved merge draft above {MaxResolvedMergeContentChars} characters.");
                    continue;
                }
                if (await postResolvedMerge(config, group.Key, resolvedContent))
                {
                    foreach (GreyboxRoundTripConflict conflict in batch) GreyboxConflictInbox.Remove(conflict);
                    await refreshArtifact(config, group.Key);
                    accepted += batch.Length;
                    Debug.Log($"Greybox accepted {batch.Length} merge resolution(s) for {group.Key}.");
                }
            }
            return accepted;
        }

        private static bool HasSingleBatchDraft(IEnumerable<GreyboxRoundTripConflict> conflicts)
        {
            var drafts = new HashSet<string>(StringComparer.Ordinal);
            foreach (GreyboxRoundTripConflict conflict in conflicts ?? System.Array.Empty<GreyboxRoundTripConflict>())
            {
                drafts.Add(conflict?.MergedContent ?? "");
                if (drafts.Count > 1) return false;
            }
            return true;
        }

        public static string ResolveContent(GreyboxRoundTripConflict conflict, GreyboxConflictResolution resolution, string manualContent = null)
        {
            if (conflict == null) return "";
            switch (resolution)
            {
                case GreyboxConflictResolution.Web:
                    return ResolveWebContent(conflict);
                case GreyboxConflictResolution.Manual:
                    return manualContent ?? conflict.MergedContent ?? "";
                default:
                    return conflict.MergedContent ?? "";
            }
        }

        public static string ResolveContent(IEnumerable<GreyboxRoundTripConflict> conflicts, GreyboxConflictResolution resolution)
        {
            var batch = (conflicts ?? System.Array.Empty<GreyboxRoundTripConflict>()).Where(conflict => conflict != null).ToArray();
            if (batch.Length == 0) return "";
            if (resolution != GreyboxConflictResolution.Web) return ResolveContent(batch[0], resolution);
            return ResolveWebContent(batch);
        }

        private static async Task<bool> AcceptResolvedMergeAsync(
            GreyboxConfig config,
            GreyboxRoundTripConflict conflict,
            string resolvedContent,
            Func<GreyboxConfig, string, string, Task<bool>> postResolvedMerge,
            Func<GreyboxConfig, string, Task<bool>> refreshArtifact)
        {
            if (conflict == null) return false;
            if (!GreyboxLicenseState.CurrentCapabilities().CanRoundTrip)
            {
                Debug.LogWarning("Greybox conflict resolution requires a Pro or Studio license.");
                return false;
            }
            string safeFileName = SafeRoundTripFileName(conflict.FileName);
            if (string.IsNullOrWhiteSpace(safeFileName))
            {
                Debug.LogWarning("Greybox cannot resolve this conflict because the daemon file name is unsafe.");
                return false;
            }
            if (string.IsNullOrWhiteSpace(SafeConflictJsonPath(conflict.Path)))
            {
                Debug.LogWarning("Greybox cannot resolve this conflict because the daemon JSON path is unsafe.");
                return false;
            }
            if (!IsSafeResolvedMergeContent(resolvedContent))
            {
                Debug.LogWarning($"Greybox refused to post a resolved merge draft above {MaxResolvedMergeContentChars} characters.");
                return false;
            }
            postResolvedMerge = postResolvedMerge ?? PostResolvedMerge;
            refreshArtifact = refreshArtifact ?? GreyboxArtifactRefresher.PullAndRefreshArtifactAsync;
            if (await postResolvedMerge(config, safeFileName, resolvedContent))
            {
                GreyboxConflictInbox.Remove(conflict);
                await refreshArtifact(config, safeFileName);
                Debug.Log($"Greybox accepted merge for {safeFileName}.");
                return true;
            }
            return false;
        }

        private static async Task<bool> PostResolvedMerge(GreyboxConfig config, string fileName, string resolvedContent)
        {
            if (!GreyboxLicenseState.CurrentCapabilities().CanRoundTrip)
            {
                Debug.LogWarning("Greybox conflict resolution requires a Pro or Studio license.");
                return false;
            }
            if (!config || string.IsNullOrWhiteSpace(fileName) || resolvedContent == null)
            {
                Debug.LogWarning("Greybox cannot resolve this conflict because the daemon did not provide a merged draft.");
                return false;
            }
            string safeFileName = SafeRoundTripFileName(fileName);
            if (string.IsNullOrWhiteSpace(safeFileName))
            {
                Debug.LogWarning("Greybox cannot resolve this conflict because the daemon file name is unsafe.");
                return false;
            }
            string url = BuildRoundTripMergeUrl(config);
            if (string.IsNullOrWhiteSpace(url))
            {
                Debug.LogWarning("Greybox cannot resolve this conflict because the daemon URL or project id is unsafe.");
                return false;
            }
            if (!IsSafeResolvedMergeContent(resolvedContent))
            {
                Debug.LogWarning($"Greybox refused to post a resolved merge draft above {MaxResolvedMergeContentChars} characters.");
                return false;
            }

            var body = new JObject
            {
                ["fileName"] = safeFileName,
                ["unityContent"] = resolvedContent,
                ["force"] = true,
            };
            byte[] bodyBytes = Encoding.UTF8.GetBytes(body.ToString(Newtonsoft.Json.Formatting.None));
            if (bodyBytes.Length > MaxRoundTripMergePayloadBytes)
            {
                Debug.LogWarning($"Greybox refused to post a resolved merge payload above {MaxRoundTripMergePayloadBytes} bytes.");
                return false;
            }

            using var request = new UnityWebRequest(url, "POST")
            {
                uploadHandler = new UploadHandlerRaw(bodyBytes),
                downloadHandler = new DownloadHandlerBuffer(),
            };
            request.timeout = Math.Max(1, (MaxRoundTripMergeRequestMs + 999) / 1000);
            request.SetRequestHeader("Content-Type", "application/json");
            long startedAtMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var op = request.SendWebRequest();
            while (!op.isDone)
            {
                if (DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - startedAtMs > MaxRoundTripMergeRequestMs)
                {
                    request.Abort();
                    Debug.LogWarning($"Greybox conflict resolution timed out after {MaxRoundTripMergeRequestMs}ms.");
                    return false;
                }
                await Task.Delay(RoundTripMergePollMs);
            }

            if (request.result != UnityWebRequest.Result.Success)
            {
                Debug.LogError($"Greybox conflict resolution failed: {request.error}");
                return false;
            }

            return true;
        }

        internal static bool IsSafeResolvedMergeContent(string resolvedContent)
        {
            return resolvedContent != null && resolvedContent.Length <= MaxResolvedMergeContentChars;
        }

        internal static string SafeRoundTripFileName(string fileName)
        {
            string normalized = (fileName ?? "").Trim().Replace('\\', '/');
            return IsSafeRoundTripFileName(normalized) ? normalized : "";
        }

        internal static bool IsSafeRoundTripFileName(string fileName)
        {
            string normalized = (fileName ?? "").Trim().Replace('\\', '/');
            if (string.IsNullOrWhiteSpace(normalized)) return false;
            if (normalized.Length > MaxRoundTripFileNameLength) return false;
            if (normalized.StartsWith("/", System.StringComparison.Ordinal)) return false;
            if (normalized.StartsWith("~", System.StringComparison.Ordinal)) return false;
            if (normalized.Contains("://")) return false;
            if (normalized.Contains("//")) return false;

            string[] parts = normalized.Split(new[] { '/' }, System.StringSplitOptions.None);
            if (parts.Length == 0 || parts[0].EndsWith(":", System.StringComparison.Ordinal)) return false;
            foreach (string part in parts)
            {
                if (string.IsNullOrWhiteSpace(part) || part == "." || part == "..") return false;
                foreach (char c in part)
                {
                    if (char.IsControl(c)) return false;
                }
            }

            return IsSupportedRoundTripFileName(parts[parts.Length - 1]);
        }

        private static string BuildRoundTripMergeUrl(GreyboxConfig config)
        {
            return GreyboxDaemonUrlBuilder.BuildProjectRoute(config, "round-trip-merge");
        }

        private static bool IsSupportedRoundTripFileName(string fileName)
        {
            if (string.Equals(fileName, "DESIGN.md", System.StringComparison.OrdinalIgnoreCase)) return true;
            return fileName.EndsWith(".gameview", System.StringComparison.OrdinalIgnoreCase)
                || fileName.EndsWith(".gameview.json", System.StringComparison.OrdinalIgnoreCase)
                || fileName.EndsWith(".levelboard", System.StringComparison.OrdinalIgnoreCase)
                || fileName.EndsWith(".levelboard.json", System.StringComparison.OrdinalIgnoreCase)
                || fileName.EndsWith(".gbhud", System.StringComparison.OrdinalIgnoreCase)
                || fileName.EndsWith(".hud.html", System.StringComparison.OrdinalIgnoreCase)
                || fileName.EndsWith(".design", System.StringComparison.OrdinalIgnoreCase);
        }

        private static string ResolveWebContent(GreyboxRoundTripConflict conflict)
        {
            string safePath = SafeConflictJsonPath(conflict.Path);
            if (string.IsNullOrWhiteSpace(safePath)) return conflict.MergedContent ?? "";
            if (!TryParseConflictValue(conflict.WebValueJson, out JToken webValue)) return conflict.MergedContent ?? "";
            if (string.Equals(safePath, "$", System.StringComparison.Ordinal))
            {
                return webValue.Type == JTokenType.String
                    ? webValue.Value<string>() ?? ""
                    : webValue.ToString(Formatting.None);
            }

            if (string.IsNullOrWhiteSpace(conflict.MergedContent)) return "";
            if (!IsSafeResolvedMergeContent(conflict.MergedContent)) return "";
            try
            {
                JToken document = JToken.Parse(conflict.MergedContent);
                SetJsonPath(document, safePath, webValue);
                return document.ToString(Formatting.Indented);
            }
            catch (System.Exception ex)
            {
                Debug.LogWarning($"Greybox could not patch the web value into the merged draft at {safePath}: {ex.Message}");
                return conflict.MergedContent ?? "";
            }
        }

        private static string ResolveWebContent(IEnumerable<GreyboxRoundTripConflict> conflicts)
        {
            var batch = (conflicts ?? System.Array.Empty<GreyboxRoundTripConflict>()).Where(conflict => conflict != null).ToArray();
            if (batch.Length == 0) return "";
            JToken document = null;
            foreach (GreyboxRoundTripConflict conflict in batch)
            {
                string safePath = SafeConflictJsonPath(conflict.Path);
                if (string.IsNullOrWhiteSpace(safePath)) throw new JsonException("Greybox conflict path is unsafe.");
                if (!TryParseConflictValue(conflict.WebValueJson, out JToken webValue))
                {
                    throw new JsonException("Greybox conflict web value is too large.");
                }
                if (string.Equals(safePath, "$", System.StringComparison.Ordinal))
                {
                    document = webValue;
                    continue;
                }

                if (document == null)
                {
                    if (string.IsNullOrWhiteSpace(conflict.MergedContent)) return "";
                    if (!IsSafeResolvedMergeContent(conflict.MergedContent)) return "";
                    document = JToken.Parse(conflict.MergedContent);
                }
                SetJsonPath(document, safePath, webValue);
            }

            if (document == null) return batch[0].MergedContent ?? "";
            return document.Type == JTokenType.String
                ? document.Value<string>() ?? ""
                : document.ToString(Formatting.Indented);
        }

        private static bool TryParseConflictValue(string valueJson, out JToken value)
        {
            value = JValue.CreateNull();
            if (string.IsNullOrWhiteSpace(valueJson)) return true;
            if (!IsSafeConflictValueJson(valueJson)) return false;
            try
            {
                value = JToken.Parse(valueJson);
                return true;
            }
            catch (JsonException)
            {
                value = JValue.CreateString(valueJson);
                return true;
            }
        }

        private static bool IsSafeConflictValueJson(string valueJson)
        {
            return valueJson == null || valueJson.Length <= MaxRoundTripConflictValueJsonChars;
        }

        internal static string SafeConflictJsonPath(string path)
        {
            string normalized = (path ?? "").Trim();
            if (string.IsNullOrWhiteSpace(normalized)) return "";
            if (normalized.Length > MaxRoundTripConflictPathLength) return "";
            if (!normalized.StartsWith("$", StringComparison.Ordinal)) return "";
            if (normalized.Contains("$..")) return "";
            foreach (char c in normalized)
            {
                if (char.IsControl(c) || c == '/' || c == '\\') return "";
            }
            if (string.Equals(normalized, "$", StringComparison.Ordinal)) return normalized;
            string[] segments = SplitJsonPath(normalized);
            if (segments.Length == 0) return "";
            foreach (string segment in segments)
            {
                if (!IsSafeConflictPathSegment(segment)) return "";
            }
            return normalized;
        }

        private static bool IsSafeConflictPathSegment(string segment)
        {
            if (string.IsNullOrWhiteSpace(segment) || segment.Length > MaxRoundTripConflictPathSegmentLength) return false;
            if (segment.Contains("..")) return false;
            if (TryParseIndexedSegment(segment, out string collectionKey, out int itemIndex))
            {
                return itemIndex >= 0 && IsSafeConflictPathKey(collectionKey);
            }
            if (TryParseSelectorSegment(segment, out collectionKey, out string selectorKey, out string selectorValue))
            {
                return IsSafeConflictPathKey(collectionKey)
                    && IsSafeConflictPathKey(selectorKey)
                    && IsSafeConflictSelectorValue(selectorValue);
            }
            if (segment.Contains("[") || segment.Contains("]") || segment.Contains("=")) return false;
            return IsSafeConflictPathKey(segment);
        }

        private static bool IsSafeConflictPathKey(string key)
        {
            if (string.IsNullOrWhiteSpace(key) || key.Length > MaxRoundTripConflictPathSegmentLength) return false;
            if (ForbiddenConflictPathKeys.Contains(key)) return false;
            foreach (char c in key)
            {
                if (!(char.IsLetterOrDigit(c) || c == '_' || c == '-')) return false;
            }
            return true;
        }

        private static bool IsSafeConflictSelectorValue(string value)
        {
            if (string.IsNullOrWhiteSpace(value) || value.Length > MaxRoundTripConflictSelectorValueLength) return false;
            if (value.Contains("..") || value.Contains("[") || value.Contains("]") || value.Contains("=")) return false;
            foreach (char c in value)
            {
                if (char.IsControl(c) || c == '/' || c == '\\') return false;
            }
            return true;
        }

        private static void SetJsonPath(JToken root, string path, JToken value)
        {
            string[] segments = SplitJsonPath(path);
            if (segments.Length == 0) return;
            JToken cursor = root;
            for (int index = 0; index < segments.Length; index++)
            {
                string segment = segments[index];
                bool isLast = index == segments.Length - 1;
                if (TryParseIndexedSegment(segment, out string collectionKey, out int itemIndex))
                {
                    var array = cursor[collectionKey] as JArray;
                    if (array == null || itemIndex < 0 || itemIndex >= array.Count) throw new JsonException($"Greybox conflict path could not find {segment}.");
                    if (isLast) array[itemIndex] = value.DeepClone();
                    else cursor = array[itemIndex];
                    continue;
                }

                if (TryParseSelectorSegment(segment, out collectionKey, out string selectorKey, out string selectorValue))
                {
                    var array = cursor[collectionKey] as JArray;
                    int match = FindSelectorIndex(array, selectorKey, selectorValue);
                    if (match < 0) throw new JsonException($"Greybox conflict path could not find {segment}.");
                    if (isLast) array[match] = value.DeepClone();
                    else cursor = array[match];
                    continue;
                }

                var obj = cursor as JObject;
                if (obj == null) throw new JsonException($"Greybox conflict path parent is not an object at {segment}.");
                if (isLast) obj[segment] = value.DeepClone();
                else cursor = obj[segment] ?? throw new JsonException($"Greybox conflict path could not find {segment}.");
            }
        }

        private static string[] SplitJsonPath(string path)
        {
            string clean = (path ?? "").Trim();
            if (clean.StartsWith("$.")) clean = clean.Substring(2);
            else if (clean.StartsWith("$")) clean = clean.Substring(1).TrimStart('.');
            if (string.IsNullOrWhiteSpace(clean)) return System.Array.Empty<string>();

            var parts = new System.Collections.Generic.List<string>();
            var segment = new StringBuilder();
            int bracketDepth = 0;
            foreach (char c in clean)
            {
                if (c == '[') bracketDepth++;
                if (c == ']') bracketDepth = Mathf.Max(0, bracketDepth - 1);
                if (c == '.' && bracketDepth == 0)
                {
                    if (segment.Length > 0) parts.Add(segment.ToString());
                    segment.Clear();
                    continue;
                }
                segment.Append(c);
            }
            if (segment.Length > 0) parts.Add(segment.ToString());
            return parts.ToArray();
        }

        private static bool TryParseIndexedSegment(string segment, out string collectionKey, out int itemIndex)
        {
            collectionKey = "";
            itemIndex = -1;
            int open = segment.IndexOf('[');
            int close = segment.EndsWith("]") ? segment.Length - 1 : -1;
            if (open <= 0 || close <= open + 1) return false;
            string selector = segment.Substring(open + 1, close - open - 1);
            if (!int.TryParse(selector, out itemIndex)) return false;
            collectionKey = segment.Substring(0, open);
            return !string.IsNullOrWhiteSpace(collectionKey);
        }

        private static bool TryParseSelectorSegment(string segment, out string collectionKey, out string selectorKey, out string selectorValue)
        {
            collectionKey = "";
            selectorKey = "";
            selectorValue = "";
            int open = segment.IndexOf('[');
            int close = segment.EndsWith("]") ? segment.Length - 1 : -1;
            int equals = segment.IndexOf('=', open + 1);
            if (open <= 0 || close <= open + 1 || equals <= open + 1 || equals >= close) return false;
            collectionKey = segment.Substring(0, open);
            selectorKey = segment.Substring(open + 1, equals - open - 1);
            selectorValue = segment.Substring(equals + 1, close - equals - 1);
            return !string.IsNullOrWhiteSpace(collectionKey) && !string.IsNullOrWhiteSpace(selectorKey);
        }

        private static int FindSelectorIndex(JArray array, string selectorKey, string selectorValue)
        {
            if (array == null) return -1;
            for (int index = 0; index < array.Count; index++)
            {
                if (array[index] is JObject obj && string.Equals(obj.Value<string>(selectorKey), selectorValue, System.StringComparison.Ordinal))
                {
                    return index;
                }
            }
            return -1;
        }
    }
}
