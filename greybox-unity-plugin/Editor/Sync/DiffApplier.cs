// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System.Collections.Generic;
using System.Globalization;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Greybox.Editor.Sync
{
    public sealed class MergeConflict
    {
        public string Path;
        public JToken BaseValue;
        public JToken WebValue;
        public JToken UnityValue;
    }

    public sealed class MergeResult
    {
        public JToken Merged;
        public readonly List<MergeConflict> Conflicts = new List<MergeConflict>();
        public bool HasConflicts => Conflicts.Count > 0;
    }

    public static class DiffApplier
    {
        public static MergeResult ThreeWayMerge(JToken baseToken, JToken webToken, JToken unityToken)
        {
            AssertSafeObjectTreeKeys(baseToken, "$");
            AssertSafeObjectTreeKeys(webToken, "$");
            AssertSafeObjectTreeKeys(unityToken, "$");

            var result = new MergeResult();
            MergedNode merged = MergeNode(baseToken, webToken, unityToken, "$", result.Conflicts);
            result.Merged = merged.Exists ? merged.Value : JValue.CreateNull();
            return result;
        }

        public static JToken FromVector3(Vector3 value)
        {
            return JObject.FromObject(new { x = value.x, y = value.y, z = value.z });
        }

        public static JToken FromColor(Color value)
        {
            return JObject.FromObject(new { r = value.r, g = value.g, b = value.b, a = value.a });
        }

        private static MergedNode MergeNode(JToken baseToken, JToken webToken, JToken unityToken, string path, List<MergeConflict> conflicts)
        {
            if (JToken.DeepEquals(webToken, unityToken)) return CloneOrMissing(webToken);
            if (JToken.DeepEquals(baseToken, webToken)) return CloneOrMissing(unityToken);
            if (JToken.DeepEquals(baseToken, unityToken)) return CloneOrMissing(webToken);

            if (webToken is JObject webObj && unityToken is JObject unityObj)
            {
                var merged = new JObject();
                var keys = new HashSet<string>();
                foreach (JProperty prop in webObj.Properties()) keys.Add(prop.Name);
                foreach (JProperty prop in unityObj.Properties()) keys.Add(prop.Name);
                var baseObj = baseToken as JObject;
                foreach (string key in keys)
                {
                    MergedNode mergedChild = MergeNode(baseObj?[key], webObj[key], unityObj[key], $"{path}.{key}", conflicts);
                    if (mergedChild.Exists) merged[key] = mergedChild.Value;
                }
                return MergedNode.Present(merged);
            }

            if (webToken is JArray webArray && unityToken is JArray unityArray)
            {
                return MergeArray(baseToken as JArray, webArray, unityArray, path, conflicts);
            }

            if (TryMergeIndependentText(baseToken, webToken, unityToken, out MergedNode mergedText))
            {
                return mergedText;
            }

            if (IsScalar(webToken) && IsScalar(unityToken))
            {
                AddConflict(conflicts, path, baseToken, webToken, unityToken);
                return ClonePreferred(unityToken, webToken);
            }

            AddConflict(conflicts, path, baseToken, webToken, unityToken);
            return ClonePreferred(unityToken, webToken);
        }

        private static void AddConflict(List<MergeConflict> conflicts, string path, JToken baseToken, JToken webToken, JToken unityToken)
        {
            if (conflicts.Count >= MaxMergeConflicts)
            {
                throw new System.InvalidOperationException($"too many round-trip merge conflicts at {path}");
            }
            conflicts.Add(new MergeConflict
            {
                Path = path,
                BaseValue = baseToken?.DeepClone(),
                WebValue = webToken?.DeepClone(),
                UnityValue = unityToken?.DeepClone()
            });
        }

        private static void AssertSafeObjectTreeKeys(JToken token, string path)
        {
            if (token == null) return;
            var stack = new Stack<(JToken Token, string Path, int Depth)>();
            stack.Push((token, path, 0));
            while (stack.Count > 0)
            {
                (JToken current, string currentPath, int currentDepth) = stack.Pop();
                if (currentDepth > MaxMergeTreeDepth)
                {
                    throw new System.InvalidOperationException($"unsafe round-trip tree depth at {currentPath}");
                }
                if (currentPath.Length > MaxMergePathLength)
                {
                    throw new System.InvalidOperationException($"unsafe round-trip path length at {currentPath}");
                }
                AssertSafeMergeTokenValue(current, currentPath);
                if (current is JObject obj)
                {
                    int propertyCount = 0;
                    foreach (JProperty property in obj.Properties())
                    {
                        propertyCount++;
                        if (propertyCount > MaxMergeObjectProperties)
                        {
                            throw new System.InvalidOperationException($"unsafe round-trip object width at {currentPath}");
                        }
                        AssertSafeObjectKey(property.Name, currentPath);
                        if (property.Value != null)
                        {
                            stack.Push((property.Value, $"{currentPath}.{property.Name}", currentDepth + 1));
                        }
                    }
                    continue;
                }

                if (current is JArray array)
                {
                    if (array.Count > MaxMergeArrayItems)
                    {
                        throw new System.InvalidOperationException($"unsafe round-trip array width at {currentPath}");
                    }
                    for (int index = 0; index < array.Count; index++)
                    {
                        JToken item = array[index];
                        if (item != null)
                        {
                            stack.Push((item, $"{currentPath}[{index}]", currentDepth + 1));
                        }
                    }
                }
            }
        }

        private static void AssertSafeMergeTokenValue(JToken token, string path)
        {
            if (token == null) return;
            switch (token.Type)
            {
                case JTokenType.Object:
                case JTokenType.Array:
                case JTokenType.Integer:
                case JTokenType.Boolean:
                case JTokenType.Null:
                    return;
                case JTokenType.String:
                    if ((token.Value<string>() ?? "").Length <= MaxMergeStringLength) return;
                    throw new System.InvalidOperationException($"unsafe round-trip string length at {path}");
                case JTokenType.Float:
                    double number = token.Value<double>();
                    if (!double.IsNaN(number) && !double.IsInfinity(number)) return;
                    throw new System.InvalidOperationException($"unsafe round-trip numeric value at {path}");
                case JTokenType.Undefined:
                    throw new System.InvalidOperationException($"unsafe round-trip value type at {path}: {token.Type}");
                default:
                    throw new System.InvalidOperationException($"unsafe round-trip value type at {path}: {token.Type}");
            }
        }

        private static void AssertSafeObjectKey(string key, string path)
        {
            if (string.IsNullOrWhiteSpace(key)
                || key.Length > MaxMergeObjectKeyLength
                || ForbiddenObjectKeys.Contains(key)
                || key.IndexOf('\0') >= 0
                || key.Contains("://")
                || key.Contains("/")
                || key.Contains("\\")
                || key.Contains("..")
                || ContainsConflictPathDelimiter(key)
                || ContainsControlCharacter(key))
            {
                throw new System.InvalidOperationException($"unsafe round-trip object key at {path}.{key}");
            }
        }

        private static bool ContainsConflictPathDelimiter(string value)
        {
            return value.Contains(".") || value.Contains("[") || value.Contains("]") || value.Contains("=") || value.Contains(" ");
        }

        private static bool ContainsControlCharacter(string value)
        {
            foreach (char c in value)
            {
                if (char.IsControl(c)) return true;
            }
            return false;
        }

        private static MergedNode MergeArray(JArray baseArray, JArray webArray, JArray unityArray, string path, List<MergeConflict> conflicts)
        {
            bool stableKeys = CanUseStableKeys(baseArray, webArray, unityArray);
            Dictionary<string, JToken> baseItems = MapArray(baseArray, stableKeys);
            Dictionary<string, JToken> webItems = MapArray(webArray, stableKeys);
            Dictionary<string, JToken> unityItems = MapArray(unityArray, stableKeys);
            var keys = OrderedKeys(webItems, unityItems, baseItems);
            var merged = new JArray();
            foreach (string key in keys)
            {
                MergedNode mergedItem = MergeNode(
                    baseItems.TryGetValue(key, out JToken baseItem) ? baseItem : null,
                    webItems.TryGetValue(key, out JToken webItem) ? webItem : null,
                    unityItems.TryGetValue(key, out JToken unityItem) ? unityItem : null,
                    AppendArrayPath(path, key),
                    conflicts);
                if (mergedItem.Exists) merged.Add(mergedItem.Value);
            }
            return MergedNode.Present(merged);
        }

        private static bool CanUseStableKeys(params JArray[] arrays)
        {
            bool hasStableItems = false;
            foreach (JArray array in arrays)
            {
                if (array == null) continue;
                var seen = new HashSet<string>();
                foreach (JToken item in array)
                {
                    string key = StableArrayItemKey(item);
                    if (string.IsNullOrEmpty(key)) continue;
                    hasStableItems = true;
                    if (seen.Contains(key)) return false;
                    seen.Add(key);
                }
            }
            return hasStableItems;
        }

        private static Dictionary<string, JToken> MapArray(JArray array, bool stableKeys)
        {
            var items = new Dictionary<string, JToken>();
            if (array == null) return items;
            for (int index = 0; index < array.Count; index++)
            {
                string stableKey = stableKeys ? StableArrayItemKey(array[index]) : null;
                string key = !string.IsNullOrEmpty(stableKey) ? stableKey : $"index:{index}";
                items[key] = array[index];
            }
            return items;
        }

        private static List<string> OrderedKeys(params Dictionary<string, JToken>[] maps)
        {
            var ordered = new List<string>();
            var seen = new HashSet<string>();
            foreach (Dictionary<string, JToken> map in maps)
            {
                foreach (string key in map.Keys)
                {
                    if (!seen.Add(key)) continue;
                    ordered.Add(key);
                }
            }
            return ordered;
        }

        private static string StableArrayItemKey(JToken item)
        {
            var obj = item as JObject;
            if (obj == null) return null;
            foreach (string fieldName in StableArrayKeyFields)
            {
                JToken value = obj[fieldName];
                if (value == null || !IsKeyToken(value)) continue;
                string stableKey = StableArrayItemKey(fieldName, value);
                if (!string.IsNullOrEmpty(stableKey)) return stableKey;
            }
            return null;
        }

        private static string StableArrayItemKey(string fieldName, JToken value)
        {
            string scalar = StableArraySelectorValue(value);
            if (!IsSafeStableArraySelectorValue(scalar)) return null;
            return fieldName == "id" || fieldName == "name"
                ? $"{fieldName}:{scalar}"
                : $"field:{fieldName}:{scalar}";
        }

        private static string StableArraySelectorValue(JToken value)
        {
            switch (value.Type)
            {
                case JTokenType.Integer:
                    return value.Value<long>().ToString(CultureInfo.InvariantCulture);
                case JTokenType.Float:
                    double number = value.Value<double>();
                    if (double.IsNaN(number) || double.IsInfinity(number)) return "";
                    return number.ToString("R", CultureInfo.InvariantCulture);
                default:
                    return value.Value<string>() ?? "";
            }
        }

        private static bool IsSafeStableArraySelectorValue(string value)
        {
            if (string.IsNullOrWhiteSpace(value) || value.Length > MaxStableArraySelectorValueLength) return false;
            if (ContainsConflictPathDelimiter(value) || value.Contains("/") || value.Contains("\\") || value.Contains("://")) return false;
            foreach (char c in value)
            {
                if (char.IsControl(c) || char.IsWhiteSpace(c)) return false;
            }
            return true;
        }

        private static bool IsKeyToken(JToken token)
        {
            return token.Type == JTokenType.String || token.Type == JTokenType.Integer || token.Type == JTokenType.Float;
        }

        private static string AppendArrayPath(string path, string key)
        {
            if (key.StartsWith("id:")) return $"{path}[id={key.Substring(3)}]";
            if (key.StartsWith("name:")) return $"{path}[name={key.Substring(5)}]";
            if (key.StartsWith("field:"))
            {
                int separator = key.IndexOf(':', "field:".Length);
                if (separator > 0)
                {
                    string fieldName = key.Substring("field:".Length, separator - "field:".Length);
                    string fieldValue = key.Substring(separator + 1);
                    return $"{path}[{fieldName}={fieldValue}]";
                }
            }
            if (key.StartsWith("index:")) return $"{path}[{key.Substring(6)}]";
            return $"{path}[{key}]";
        }

        private static bool IsScalar(JToken token)
        {
            return token == null || token.Type == JTokenType.Integer || token.Type == JTokenType.Float || token.Type == JTokenType.String || token.Type == JTokenType.Boolean || token.Type == JTokenType.Null;
        }

        private static bool TryMergeIndependentText(JToken baseToken, JToken webToken, JToken unityToken, out MergedNode merged)
        {
            merged = MergedNode.Missing;
            if (!IsStringToken(baseToken) || !IsStringToken(webToken) || !IsStringToken(unityToken))
            {
                return false;
            }

            string baseText = baseToken.Value<string>() ?? "";
            string webText = webToken.Value<string>() ?? "";
            string unityText = unityToken.Value<string>() ?? "";
            TextEdit webEdit = FindTextEdit(baseText, webText);
            TextEdit unityEdit = FindTextEdit(baseText, unityText);
            if (!webEdit.Changed || !unityEdit.Changed)
            {
                return false;
            }

            if (TextEditsMatch(webEdit, unityEdit))
            {
                merged = MergedNode.Present(new JValue(webText));
                return true;
            }

            if (TextEditsOverlap(baseText, webEdit, unityEdit))
            {
                return false;
            }

            merged = MergedNode.Present(new JValue(ApplyTextEdits(baseText, webEdit, unityEdit)));
            return true;
        }

        private static bool IsStringToken(JToken token)
        {
            return token != null && token.Type == JTokenType.String;
        }

        private static TextEdit FindTextEdit(string baseText, string changedText)
        {
            if (baseText == changedText) return new TextEdit { Changed = false };

            int prefix = 0;
            int maxPrefix = System.Math.Min(baseText.Length, changedText.Length);
            while (prefix < maxPrefix && baseText[prefix] == changedText[prefix])
            {
                prefix++;
            }

            int suffix = 0;
            while (
                suffix < baseText.Length - prefix &&
                suffix < changedText.Length - prefix &&
                baseText[baseText.Length - 1 - suffix] == changedText[changedText.Length - 1 - suffix])
            {
                suffix++;
            }

            int end = baseText.Length - suffix;
            int replacementLength = changedText.Length - prefix - suffix;
            return new TextEdit
            {
                Start = prefix,
                End = end,
                Replacement = replacementLength > 0 ? changedText.Substring(prefix, replacementLength) : "",
                Changed = true
            };
        }

        private static bool TextEditsMatch(TextEdit left, TextEdit right)
        {
            return left.Start == right.Start && left.End == right.End && left.Replacement == right.Replacement;
        }

        private static bool TextEditsOverlap(string baseText, TextEdit left, TextEdit right)
        {
            if (left.Start == left.End && right.Start == right.End && left.Start == right.Start)
            {
                return true;
            }
            if (left.Start < right.End && right.Start < left.End)
            {
                return true;
            }
            return TextEditsTouchSameToken(baseText, left, right);
        }

        private static bool TextEditsTouchSameToken(string baseText, TextEdit left, TextEdit right)
        {
            TextEdit first = left.Start <= right.Start ? left : right;
            TextEdit second = left.Start <= right.Start ? right : left;
            if (first.End != second.Start || first.End <= 0 || second.Start >= baseText.Length)
            {
                return false;
            }
            return !char.IsWhiteSpace(baseText[first.End - 1]) && !char.IsWhiteSpace(baseText[second.Start]);
        }

        private static string ApplyTextEdits(string baseText, TextEdit first, TextEdit second)
        {
            TextEdit left = first.Start > second.Start ? first : second;
            TextEdit right = first.Start > second.Start ? second : first;
            string withLeft = baseText.Substring(0, left.Start) + left.Replacement + baseText.Substring(left.End);
            return withLeft.Substring(0, right.Start) + right.Replacement + withLeft.Substring(right.End);
        }

        private static MergedNode CloneOrMissing(JToken token)
        {
            return token == null ? MergedNode.Missing : MergedNode.Present(token.DeepClone());
        }

        private static MergedNode ClonePreferred(JToken preferred, JToken fallback)
        {
            if (preferred != null) return MergedNode.Present(preferred.DeepClone());
            if (fallback != null) return MergedNode.Present(fallback.DeepClone());
            return MergedNode.Missing;
        }

        private sealed class MergedNode
        {
            public static readonly MergedNode Missing = new MergedNode(false, null);

            private MergedNode(bool exists, JToken value)
            {
                Exists = exists;
                Value = value;
            }

            public bool Exists { get; }
            public JToken Value { get; }

            public static MergedNode Present(JToken value)
            {
                return new MergedNode(true, value ?? JValue.CreateNull());
            }
        }

        private struct TextEdit
        {
            public int Start;
            public int End;
            public string Replacement;
            public bool Changed;
        }

        private static readonly string[] StableArrayKeyFields =
        {
            "id",
            "actorId",
            "spawnId",
            "objectiveId",
            "hazardId",
            "checkpointId",
            "goalId",
            "coinId",
            "collectibleId",
            "tileId",
            "abilityId",
            "routeId",
            "waveId",
            "lootTableId",
            "roomId",
            "encounterId",
            "connectionId",
            "nodeId",
            "slug",
            "guid",
            "name"
        };

        private const int MaxMergeObjectKeyLength = 512;
        private const int MaxMergeTreeDepth = 32;
        private const int MaxMergeObjectProperties = 2048;
        private const int MaxMergeArrayItems = 8192;
        private const int MaxMergeStringLength = 1024 * 1024;
        private const int MaxMergePathLength = 512;
        private const int MaxMergeConflicts = 100;
        private const int MaxStableArraySelectorValueLength = 160;
        private static readonly HashSet<string> ForbiddenObjectKeys = new HashSet<string>
        {
            "__proto__",
            "prototype",
            "constructor"
        };
    }
}
