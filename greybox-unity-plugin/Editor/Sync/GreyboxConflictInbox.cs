// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using Greybox.Editor.Windows;
using Greybox.Runtime;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace Greybox.Editor.Sync
{
    public sealed class GreyboxRoundTripConflict
    {
        public string FileName;
        public string Path;
        public string Strategy;
        public string BaseValueJson;
        public string WebValueJson;
        public string UnityValueJson;
        public string MergedContent;
        public long UpdatedAt;
    }

    [InitializeOnLoad]
    public static class GreyboxConflictInbox
    {
        private const int MaxConflicts = 100;
        private const int MaxConflictPathLength = 512;
        private const int MaxConflictValueJsonLength = 1024 * 1024;
        private const int MaxMergedContentLength = 1024 * 1024;
        private const int MaxStrategyLength = 80;
        private const int MaxScopePartLength = 80;
        private const int MaxConflictPayloadItems = MaxConflicts;
        private const int MaxConflictValueDepth = 32;
        private const int MaxConflictValueNodes = 8192;
        private const int MaxConflictValueObjectProperties = 2048;
        private const int MaxConflictValueArrayItems = 8192;
        private const int MaxConflictValuePropertyNameLength = 128;
        private const int MaxConflictSnapshotChars = (4 * 1024 * 1024) + (128 * 1024);
        private const string ConflictSnapshotPref = "Greybox.Studio.RoundTripConflicts";
        private static readonly HashSet<string> ForbiddenConflictValueKeys = new HashSet<string>(StringComparer.Ordinal)
        {
            "__proto__",
            "constructor",
            "prototype",
        };
        private static readonly List<GreyboxRoundTripConflict> Items = new List<GreyboxRoundTripConflict>();

        static GreyboxConflictInbox()
        {
            LoadSnapshot();
        }

        public static event Action Changed;
        public static IReadOnlyList<GreyboxRoundTripConflict> Conflicts => Items;

        public static bool RecordPrefabSidecar(string canonicalPath, string sidecarPath, string sourcePath)
        {
            if (!GreyboxPrefabSidecarResolver.IsMatchingIncomingPrefabSidecarPath(canonicalPath, sidecarPath))
            {
                return false;
            }

            const string conflictPath = "$.unity.prefab";
            string safeSourcePath = SafePrefabSidecarSourcePath(sourcePath);
            RemoveExisting(canonicalPath, conflictPath);
            Items.Insert(0, new GreyboxRoundTripConflict
            {
                FileName = canonicalPath,
                Strategy = "prefab-sidecar",
                Path = conflictPath,
                BaseValueJson = CompactJsonValue(safeSourcePath),
                WebValueJson = CompactJsonValue(sidecarPath),
                UnityValueJson = CompactJsonValue(canonicalPath),
                MergedContent = "Greybox wrote regenerated prefab content to the incoming sidecar because the canonical prefab contains user-added Unity components.",
                UpdatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            });

            while (Items.Count > MaxConflicts) Items.RemoveAt(Items.Count - 1);
            SaveSnapshot();
            Debug.LogWarning($"Greybox generated prefab sidecar needs review: {sidecarPath}");
            Changed?.Invoke();
            return true;
        }

        public static bool RecordExampleRoundTripConflict()
        {
            return RecordFromEvent(new JObject
            {
                ["payload"] = new JObject
                {
                    ["type"] = "round_trip_merge",
                    ["action"] = "conflict",
                    ["fileName"] = "Samples/2D Platformer/platformer.gameview.json",
                    ["strategy"] = "json-three-way",
                    ["mergedContent"] = @"{""actors"":[{""id"":""boss"",""health"":2}],""spawnPoints"":[{""id"":""hero"",""position"":{""x"":4,""y"":1,""z"":0}}],""hud"":{""title"":""Greybox Smoke Merge""}}",
                    ["updatedAt"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                    ["conflicts"] = new JArray
                    {
                        new JObject
                        {
                            ["path"] = "$.actors[id=boss].health",
                            ["baseValue"] = 1,
                            ["webValue"] = 3,
                            ["unityValue"] = 2,
                        },
                        new JObject
                        {
                            ["path"] = "$.spawnPoints[id=hero].position",
                            ["baseValue"] = new JObject { ["x"] = 0, ["y"] = 1, ["z"] = 0 },
                            ["webValue"] = new JObject { ["x"] = 2, ["y"] = 1, ["z"] = 0 },
                            ["unityValue"] = new JObject { ["x"] = 4, ["y"] = 1, ["z"] = 0 },
                        },
                        new JObject
                        {
                            ["path"] = "$.hud.title",
                            ["baseValue"] = "Greybox Platformer",
                            ["webValue"] = "Greybox Web Revision",
                            ["unityValue"] = "Greybox Smoke Merge",
                        },
                    },
                },
            });
        }

        public static bool RecordFromEvent(JObject evt)
        {
            var payload = evt?["payload"] as JObject ?? evt;
            if (!IsConflictPayload(payload)) return false;

            if (!TryOptionalString(payload, "fileName", out string rawFileName)) return false;
            string fileName = GreyboxConflictResolver.SafeRoundTripFileName(rawFileName);
            if (string.IsNullOrWhiteSpace(fileName)) return false;
            if (!TryOptionalString(payload, "strategy", out string rawStrategy)) return false;
            string strategy = SafeConflictStrategy(rawStrategy);
            if (string.IsNullOrWhiteSpace(strategy)) return false;
            if (!TryOptionalString(payload, "mergedContent", out string mergedContent)) return false;
            if (!IsSafeStoredConflictString(mergedContent, MaxMergedContentLength)) return false;
            if (!TryOptionalUpdatedAt(payload, out long updatedAt)) return false;
            var conflicts = payload["conflicts"] as JArray;
            if (conflicts == null || conflicts.Count == 0 || conflicts.Count > MaxConflictPayloadItems) return false;

            int recorded = 0;
            foreach (JToken token in conflicts)
            {
                var conflict = token as JObject;
                if (conflict == null) continue;
                if (!TryOptionalString(conflict, "path", out string rawPath)) continue;
                string conflictPath = SafeConflictPath(rawPath);
                if (string.IsNullOrWhiteSpace(conflictPath)) continue;
                if (!TryCompactConflictValue(conflict["baseValue"], out string baseValueJson)
                    || !TryCompactConflictValue(conflict["webValue"], out string webValueJson)
                    || !TryCompactConflictValue(conflict["unityValue"], out string unityValueJson))
                {
                    continue;
                }
                RemoveExisting(fileName, conflictPath);
                Items.Insert(0, new GreyboxRoundTripConflict
                {
                    FileName = fileName,
                    Strategy = strategy,
                    Path = conflictPath,
                    BaseValueJson = baseValueJson,
                    WebValueJson = webValueJson,
                    UnityValueJson = unityValueJson,
                    MergedContent = mergedContent,
                    UpdatedAt = updatedAt,
                });
                recorded++;
            }

            if (recorded == 0) return false;
            while (Items.Count > MaxConflicts) Items.RemoveAt(Items.Count - 1);
            SaveSnapshot();
            Debug.LogWarning($"Greybox round-trip merge conflict in {fileName}: {recorded} field(s) need review.");
            Changed?.Invoke();
            return true;
        }

        public static void Clear()
        {
            Items.Clear();
            DeleteSnapshot();
            Changed?.Invoke();
        }

        public static void Remove(GreyboxRoundTripConflict conflict)
        {
            if (conflict == null) return;
            Items.Remove(conflict);
            SaveSnapshot();
            Changed?.Invoke();
        }

        private static void RemoveExisting(string fileName, string path)
        {
            for (int index = Items.Count - 1; index >= 0; index--)
            {
                GreyboxRoundTripConflict existing = Items[index];
                if (string.Equals(existing.FileName, fileName, StringComparison.OrdinalIgnoreCase)
                    && string.Equals(existing.Path, path, StringComparison.Ordinal))
                {
                    Items.RemoveAt(index);
                }
            }
        }

        internal static void ClearForTests()
        {
            Items.Clear();
            DeleteSnapshot();
        }

        internal static void ReloadForTests()
        {
            Items.Clear();
            LoadSnapshot();
        }

        private static void SaveSnapshot()
        {
            if (Items.Count == 0)
            {
                DeleteSnapshot();
                return;
            }

            string snapshotKey = SnapshotPref();
            var snapshotItems = new List<GreyboxRoundTripConflict>(Items);
            while (snapshotItems.Count > 0)
            {
                string snapshot = JsonConvert.SerializeObject(snapshotItems, Formatting.None);
                if (snapshot.Length <= MaxConflictSnapshotChars)
                {
                    EditorPrefs.SetString(snapshotKey, snapshot);
                    return;
                }
                snapshotItems.RemoveAt(snapshotItems.Count - 1);
            }

            EditorPrefs.DeleteKey(snapshotKey);
        }

        private static void LoadSnapshot()
        {
            EditorPrefs.DeleteKey(ConflictSnapshotPref);
            string snapshot = EditorPrefs.GetString(SnapshotPref(), "");
            if (string.IsNullOrWhiteSpace(snapshot)) return;
            if (snapshot.Length > MaxConflictSnapshotChars)
            {
                Items.Clear();
                DeleteSnapshot();
                return;
            }
            try
            {
                var conflicts = JsonConvert.DeserializeObject<List<GreyboxRoundTripConflict>>(snapshot);
                if (conflicts == null) return;
                foreach (GreyboxRoundTripConflict conflict in conflicts)
                {
                    if (Items.Count >= MaxConflicts) break;
                    if (!IsUsableConflict(conflict)) continue;
                    Items.Add(conflict);
                }
            }
            catch (JsonException)
            {
                Items.Clear();
                DeleteSnapshot();
            }
        }

        private static void DeleteSnapshot()
        {
            EditorPrefs.DeleteKey(ConflictSnapshotPref);
            EditorPrefs.DeleteKey(SnapshotPref());
        }

        private static string SnapshotPref()
        {
            GreyboxConfig config = GreyboxSettings.LoadConfig();
            string projectId = config ? config.ProjectId : "";
            return $"{ConflictSnapshotPref}.{ProjectScopeKey(projectId, Application.dataPath)}";
        }

        internal static string ProjectScopeKeyForTests(string projectId, string dataPath)
        {
            return ProjectScopeKey(projectId, dataPath);
        }

        private static string ProjectScopeKey(string projectId, string dataPath)
        {
            if (!string.IsNullOrWhiteSpace(projectId))
            {
                return "project-" + SafeScopePart(projectId);
            }

            return "unity-" + Sha256(dataPath ?? "");
        }

        private static string SafeScopePart(string value)
        {
            var builder = new StringBuilder();
            string trimmed = (value ?? "").Trim();
            foreach (char c in trimmed)
            {
                builder.Append(char.IsLetterOrDigit(c) || c == '-' || c == '_' ? c : '-');
            }
            string scope = builder.ToString().Trim('-');
            if (scope.Length == 0) return "default";
            if (scope.Length <= MaxScopePartLength) return scope;
            string prefix = scope.Substring(0, MaxScopePartLength - 17).Trim('-');
            if (string.IsNullOrWhiteSpace(prefix)) prefix = "scope";
            return $"{prefix}-{Sha256(trimmed).Substring(0, 16)}";
        }

        private static string Sha256(string value)
        {
            using var sha = SHA256.Create();
            byte[] hash = sha.ComputeHash(Encoding.UTF8.GetBytes(value));
            var builder = new StringBuilder(hash.Length * 2);
            foreach (byte b in hash) builder.Append(b.ToString("x2"));
            return builder.ToString();
        }

        private static bool IsUsableConflict(GreyboxRoundTripConflict conflict)
        {
            if (conflict == null) return false;
            if (string.Equals(conflict.Strategy, "prefab-sidecar", StringComparison.Ordinal))
            {
                return GreyboxPrefabSidecarResolver.CanAcceptIncoming(conflict);
            }
            return !string.IsNullOrWhiteSpace(GreyboxConflictResolver.SafeRoundTripFileName(conflict.FileName))
                && !string.IsNullOrWhiteSpace(SafeConflictPath(conflict.Path))
                && !string.IsNullOrWhiteSpace(SafeConflictStrategy(conflict.Strategy))
                && IsSafeStoredConflictString(conflict.BaseValueJson, MaxConflictValueJsonLength)
                && IsSafeStoredConflictString(conflict.WebValueJson, MaxConflictValueJsonLength)
                && IsSafeStoredConflictString(conflict.UnityValueJson, MaxConflictValueJsonLength)
                && IsSafeStoredConflictString(conflict.MergedContent, MaxMergedContentLength);
        }

        private static bool IsConflictPayload(JObject payload)
        {
            if (!TryOptionalString(payload, "type", out string type)) return false;
            if (!TryOptionalString(payload, "action", out string action)) return false;
            return payload != null
                && string.Equals(type, "round_trip_merge", StringComparison.OrdinalIgnoreCase)
                && string.Equals(action, "conflict", StringComparison.OrdinalIgnoreCase);
        }

        private static bool TryOptionalString(JObject body, string key, out string value)
        {
            value = "";
            if (body == null) return false;
            JToken token = body[key];
            if (token == null || token.Type == JTokenType.Null) return true;
            if (token.Type != JTokenType.String) return false;
            value = token.Value<string>() ?? "";
            return true;
        }

        private static bool TryOptionalUpdatedAt(JObject body, out long updatedAt)
        {
            updatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            if (body == null) return false;
            JToken token = body["updatedAt"];
            if (token == null || token.Type == JTokenType.Null) return true;
            if (token.Type != JTokenType.Integer) return false;
            updatedAt = token.Value<long>();
            return updatedAt >= 0;
        }

        private static bool TryCompactConflictValue(JToken value, out string json)
        {
            json = "";
            if (!IsSafeConflictValueTree(value)) return false;
            json = CompactJson(value);
            return IsSafeStoredConflictString(json, MaxConflictValueJsonLength);
        }

        private static bool IsSafeConflictValueTree(JToken token)
        {
            if (token == null || token.Type == JTokenType.Null || token.Type == JTokenType.Undefined) return true;
            var stack = new Stack<(JToken Token, int Depth)>();
            stack.Push((token, 0));
            int scannedNodes = 0;
            while (stack.Count > 0)
            {
                var current = stack.Pop();
                if (current.Token == null || current.Token.Type == JTokenType.Null || current.Token.Type == JTokenType.Undefined) continue;
                scannedNodes++;
                if (scannedNodes > MaxConflictValueNodes) return false;
                if (current.Depth > MaxConflictValueDepth) return false;

                switch (current.Token.Type)
                {
                    case JTokenType.Boolean:
                    case JTokenType.Integer:
                        continue;
                    case JTokenType.Float:
                        double number = current.Token.Value<double>();
                        if (double.IsNaN(number) || double.IsInfinity(number)) return false;
                        continue;
                    case JTokenType.String:
                        if ((current.Token.Value<string>() ?? "").Length > MaxConflictValueJsonLength) return false;
                        continue;
                    case JTokenType.Object:
                        var obj = (JObject)current.Token;
                        if (obj.Count > MaxConflictValueObjectProperties) return false;
                        foreach (JProperty property in obj.Properties())
                        {
                            if (!IsSafeConflictValueKey(property.Name)) return false;
                            stack.Push((property.Value, current.Depth + 1));
                        }
                        continue;
                    case JTokenType.Array:
                        var array = (JArray)current.Token;
                        if (array.Count > MaxConflictValueArrayItems) return false;
                        for (int index = array.Count - 1; index >= 0; index--)
                        {
                            stack.Push((array[index], current.Depth + 1));
                        }
                        continue;
                    default:
                        return false;
                }
            }
            return true;
        }

        private static bool IsSafeConflictValueKey(string key)
        {
            if (string.IsNullOrWhiteSpace(key) || key.Length > MaxConflictValuePropertyNameLength) return false;
            if (ForbiddenConflictValueKeys.Contains(key)) return false;
            foreach (char c in key)
            {
                if (char.IsControl(c)) return false;
            }
            return true;
        }

        private static string CompactJson(JToken value)
        {
            if (value == null || value.Type == JTokenType.Undefined) return "undefined";
            return value.ToString(Formatting.None);
        }

        private static string CompactJsonValue(string value)
        {
            return JValue.CreateString(value ?? "").ToString(Formatting.None);
        }

        private static string SafePrefabSidecarSourcePath(string sourcePath)
        {
            string normalized = (sourcePath ?? "").Trim().Replace('\\', '/');
            if (string.IsNullOrWhiteSpace(normalized) || normalized.Contains("://")) return "";
            if (normalized.StartsWith("/", StringComparison.Ordinal) || normalized.StartsWith("~", StringComparison.Ordinal)) return "";
            if (normalized.Length >= 2 && normalized[1] == ':') return "";

            var builder = new StringBuilder(Math.Min(normalized.Length, MaxConflictPathLength));
            foreach (char c in normalized)
            {
                if (char.IsControl(c)) continue;
                builder.Append(c);
                if (builder.Length >= MaxConflictPathLength) break;
            }

            normalized = builder.ToString().Trim();
            foreach (string segment in normalized.Split('/'))
            {
                if (string.IsNullOrWhiteSpace(segment) || segment == "." || segment == "..") return "";
            }
            return normalized;
        }

        private static string SafeConflictPath(string path)
        {
            string normalized = GreyboxConflictResolver.SafeConflictJsonPath(path);
            if (string.IsNullOrWhiteSpace(normalized) || normalized.Length > MaxConflictPathLength) return "";
            return normalized;
        }

        private static string SafeConflictStrategy(string strategy)
        {
            string normalized = (strategy ?? "").Trim();
            if (string.IsNullOrWhiteSpace(normalized)) return "";
            if (normalized.Length > MaxStrategyLength) return "";
            foreach (char c in normalized)
            {
                if (char.IsControl(c)) return "";
            }
            return normalized;
        }

        private static bool IsSafeStoredConflictString(string value, int maxLength)
        {
            return value != null && value.Length <= maxLength;
        }
    }
}
