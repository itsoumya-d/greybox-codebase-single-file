// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;
using Greybox.Runtime;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Networking;

namespace Greybox.Editor.Sync
{
    public sealed class GreyboxProModuleStatus
    {
        public int LicensedCount;
        public int LicenseRequiredCount;
        public int BlockedCount;
        public int EngineTargetCount;
        public string EngineTargetNames = "";

        public bool HasAny => LicensedCount + LicenseRequiredCount + BlockedCount + EngineTargetCount > 0;

        public string SummaryMessage
        {
            get
            {
                if (LicensedCount + EngineTargetCount > 0) return "Licensed Pro module metadata is available for import.";
                if (LicenseRequiredCount + BlockedCount > 0) return "Pro modules found, but none are licensed for import.";
                return "No project-local Pro modules found.";
            }
        }
    }

    public static class GreyboxProModuleStatusClient
    {
        private const int MaxProModuleStatusRequestMs = 2000;
        private const int ProModuleStatusPollMs = 16;
        private const int MaxProModuleStatusJsonChars = 256 * 1024;
        private const int MaxDisplayedEngineTargetNames = 5;
        private const int MaxEngineTargetNameLength = 64;
        private const int MaxProModuleStatusItems = 512;
        private const int MaxProModuleStatusValueChars = 80;

        public static async Task<GreyboxProModuleStatus> FetchAsync(GreyboxConfig config)
        {
            string url = GreyboxDaemonUrlBuilder.BuildGameDeliverableRoute(config, "pro-modules");
            if (string.IsNullOrWhiteSpace(url))
            {
                Debug.LogWarning("Greybox Pro module status requires a safe daemon URL and project id.");
                return new GreyboxProModuleStatus();
            }
            using var request = UnityWebRequest.Get(url);
            if (!await SendWithStatusTimeoutAsync(request, MaxProModuleStatusRequestMs))
            {
                Debug.LogWarning($"Greybox Pro module status timed out after {MaxProModuleStatusRequestMs}ms.");
                return new GreyboxProModuleStatus();
            }
            if (request.result != UnityWebRequest.Result.Success)
            {
                Debug.LogWarning($"Greybox Pro module status unavailable: {request.error}");
                return new GreyboxProModuleStatus();
            }
            string json = request.downloadHandler.text ?? "";
            if (json.Length > MaxProModuleStatusJsonChars)
            {
                Debug.LogWarning($"Greybox Pro module status exceeded the {MaxProModuleStatusJsonChars} character safety cap.");
                return new GreyboxProModuleStatus();
            }
            return Parse(json);
        }

        private static async Task<bool> SendWithStatusTimeoutAsync(UnityWebRequest request, int timeoutMs)
        {
            if (request == null) return false;
            int safeTimeoutMs = System.Math.Max(1000, timeoutMs);
            request.timeout = System.Math.Max(1, (safeTimeoutMs + 999) / 1000);
            long startedAtMs = System.DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var op = request.SendWebRequest();
            while (!op.isDone)
            {
                if (System.DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - startedAtMs > safeTimeoutMs)
                {
                    request.Abort();
                    return false;
                }
                await Task.Delay(ProModuleStatusPollMs);
            }
            return true;
        }

        internal static GreyboxProModuleStatus Parse(string json)
        {
            var result = new GreyboxProModuleStatus();
            if (string.IsNullOrWhiteSpace(json)) return result;
            if (json.Length > MaxProModuleStatusJsonChars) return result;
            try
            {
                var root = JObject.Parse(json);

                var modules = OptionalArray(root, "modules");
                if (modules != null)
                {
                    foreach (JToken token in modules)
                    {
                        var module = RequireObject(token, "modules");
                        string status = SafeStatusValue(OptionalString(module, "status") ?? "");
                        if (status == "licensed") result.LicensedCount++;
                        if (status == "license-required") result.LicenseRequiredCount++;
                        if (status == "blocked") result.BlockedCount++;
                    }
                }
                var rejected = OptionalArray(root, "rejected");
                if (rejected != null)
                {
                    foreach (JToken token in rejected)
                    {
                        RequireObject(token, "rejected");
                        result.BlockedCount++;
                    }
                }

                var registries = OptionalObject(root, "registries");
                var engineTargets = OptionalArray(registries, "engineTargets");
                var names = new List<string>();
                if (engineTargets != null)
                {
                    foreach (JToken token in engineTargets)
                    {
                        var target = RequireObject(token, "engineTargets");
                        result.EngineTargetCount++;
                        string name = SafeDisplayName(OptionalString(target, "title") ?? OptionalString(target, "id") ?? "Pro engine target");
                        if (names.Count < MaxDisplayedEngineTargetNames && !string.IsNullOrWhiteSpace(name))
                        {
                            names.Add(name);
                        }
                    }
                }
                if (result.EngineTargetCount > MaxDisplayedEngineTargetNames)
                {
                    names.Add($"+{result.EngineTargetCount - MaxDisplayedEngineTargetNames} more");
                }
                result.EngineTargetNames = string.Join(", ", names);
                return result;
            }
            catch
            {
                return new GreyboxProModuleStatus();
            }
        }

        private static JArray OptionalArray(JObject container, string key)
        {
            if (container == null || container[key] == null || container[key].Type == JTokenType.Null) return null;
            if (container[key].Type != JTokenType.Array)
            {
                throw new System.FormatException($"Greybox Pro module status claim {key} must be a JSON array.");
            }
            var array = container[key] as JArray;
            if (array.Count > MaxProModuleStatusItems)
            {
                throw new System.FormatException($"Greybox Pro module status claim {key} may contain at most {MaxProModuleStatusItems} entries.");
            }
            return array;
        }

        private static JObject OptionalObject(JObject container, string key)
        {
            if (container == null || container[key] == null || container[key].Type == JTokenType.Null) return null;
            if (container[key].Type != JTokenType.Object)
            {
                throw new System.FormatException($"Greybox Pro module status claim {key} must be a JSON object.");
            }
            return container[key] as JObject;
        }

        private static JObject RequireObject(JToken token, string key)
        {
            if (token == null || token.Type != JTokenType.Object)
            {
                throw new System.FormatException($"Greybox Pro module status claim {key} entries must be JSON objects.");
            }
            return token as JObject;
        }

        private static string OptionalString(JObject container, string key)
        {
            if (container == null || container[key] == null || container[key].Type == JTokenType.Null) return null;
            if (container[key].Type != JTokenType.String)
            {
                throw new System.FormatException($"Greybox Pro module status claim {key} must be a JSON string.");
            }
            return container[key].Value<string>();
        }

        private static string SafeDisplayName(string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return "Pro engine target";
            var builder = new StringBuilder(value.Length);
            bool previousWhitespace = false;
            foreach (char c in value.Trim())
            {
                if (char.IsControl(c)) continue;
                if (char.IsWhiteSpace(c))
                {
                    if (previousWhitespace) continue;
                    builder.Append(' ');
                    previousWhitespace = true;
                    continue;
                }
                builder.Append(c);
                previousWhitespace = false;
                if (builder.Length >= MaxEngineTargetNameLength) break;
            }
            string result = builder.ToString().Trim();
            return string.IsNullOrWhiteSpace(result) ? "Pro engine target" : result;
        }

        private static string SafeStatusValue(string value)
        {
            string status = (value ?? "").Trim();
            if (status.Length > MaxProModuleStatusValueChars)
            {
                throw new System.FormatException("Greybox Pro module status value is too long.");
            }
            foreach (char c in status)
            {
                if (char.IsControl(c))
                {
                    throw new System.FormatException("Greybox Pro module status value contains control characters.");
                }
            }
            return status.ToLowerInvariant();
        }
    }
}
