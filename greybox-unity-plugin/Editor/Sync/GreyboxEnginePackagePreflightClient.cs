// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System;
using System.Threading.Tasks;
using Greybox.Runtime;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Networking;

namespace Greybox.Editor.Sync
{
    public sealed class GreyboxEnginePackagePreflight
    {
        public bool Available;
        public string Engine = "unity";
        public string SourceFileName = "";
        public string PackageFileName = "";
        public int FileCount;
        public long SizeBytes;
        public string ContentRevisionSha256 = "";
        public int TerrainColliderCount;
        public int DynamicEventCount;
        public int FactionCount;
        public string ErrorMessage = "";

        public string SizeLabel => FormatBytes(SizeBytes);

        private static string FormatBytes(long bytes)
        {
            if (bytes <= 0) return "0 B";
            if (bytes < 1024) return $"{bytes} B";
            double kib = bytes / 1024d;
            if (kib < 1024d) return $"{kib:0.#} KB";
            return $"{kib / 1024d:0.#} MB";
        }
    }

    public static class GreyboxEnginePackagePreflightClient
    {
        private const int MaxPreflightRequestMs = 3000;
        private const int PreflightPollMs = 16;
        private const int MaxPackageFileNameChars = 160;
        private const int MaxPackageFileCount = 2048;
        private const long MaxPackageSizeBytes = 512L * 1024L * 1024L;
        private const int MaxManifestMetricCount = 100000;
        private const int MaxPreflightResponseChars = 64 * 1024;
        private const int MaxPreflightMessageChars = 512;

        public static async Task<GreyboxEnginePackagePreflight> FetchUnityAsync(GreyboxConfig config)
        {
            return await FetchAsync(config, "unity");
        }

        public static async Task<GreyboxEnginePackagePreflight> FetchAsync(GreyboxConfig config, string engine)
        {
            string safeEngine = NormalizeEngineId(engine);
            if (string.IsNullOrWhiteSpace(safeEngine))
            {
                return Unavailable("unity", "Unsupported engine package target.");
            }
            string url = GreyboxDaemonUrlBuilder.BuildGameDeliverableRoute(config, "engine-package", safeEngine, "preflight");
            if (string.IsNullOrWhiteSpace(url))
            {
                return Unavailable(safeEngine, "Engine package preflight requires a safe daemon URL and project id.");
            }
            using var request = UnityWebRequest.Get(url);
            if (!await SendWithPreflightTimeoutAsync(request, MaxPreflightRequestMs, safeEngine))
            {
                return Unavailable(safeEngine, "Engine package preflight timed out.");
            }
            if (request.result != UnityWebRequest.Result.Success)
            {
                Debug.LogWarning($"Greybox engine package preflight unavailable: {request.error}");
                return new GreyboxEnginePackagePreflight
                {
                    Available = false,
                    Engine = safeEngine,
                    ErrorMessage = request.error ?? "Engine package preflight failed."
                };
            }
            string responseText = request.downloadHandler.text ?? "";
            if (responseText.Length > MaxPreflightResponseChars)
            {
                return Unavailable(safeEngine, $"Engine package preflight response exceeded the {MaxPreflightResponseChars} character safety cap.");
            }
            return Parse(responseText);
        }

        private static async Task<bool> SendWithPreflightTimeoutAsync(UnityWebRequest request, int timeoutMs, string engine)
        {
            if (request == null) return false;
            int safeTimeoutMs = Math.Max(1000, timeoutMs);
            request.timeout = Math.Max(1, (safeTimeoutMs + 999) / 1000);
            long startedAtMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var op = request.SendWebRequest();
            while (!op.isDone)
            {
                if (DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - startedAtMs > safeTimeoutMs)
                {
                    request.Abort();
                    Debug.LogWarning($"Greybox {engine} engine package preflight timed out after {safeTimeoutMs}ms.");
                    return false;
                }
                await Task.Delay(PreflightPollMs);
            }
            return true;
        }

        internal static GreyboxEnginePackagePreflight Parse(string json)
        {
            if (string.IsNullOrWhiteSpace(json))
            {
                return Unavailable("unity", "Engine package preflight returned an empty response.");
            }
            if (json.Length > MaxPreflightResponseChars)
            {
                return Unavailable("unity", $"Engine package preflight response exceeded the {MaxPreflightResponseChars} character safety cap.");
            }
            try
            {
                var root = JObject.Parse(json);
                var manifest = OptionalObject(root, "manifest");
                string engine = NormalizeEngineId(OptionalString(root, "engine") ?? "unity");
                if (string.IsNullOrWhiteSpace(engine))
                {
                    return Unavailable("unity", "Engine package preflight has an unsupported engine id.");
                }
                bool? available = OptionalBool(root, "available");
                if (available == false)
                {
                    return Unavailable(engine, ErrorMessage(root, "Engine package is not available."));
                }
                if (available != true)
                {
                    return Unavailable(engine, "Engine package preflight must explicitly mark available=true.");
                }

                string packageFileName = OptionalString(root, "packageFileName") ?? "";
                int fileCount = OptionalInt(root, "fileCount") ?? 0;
                long sizeBytes = OptionalLong(root, "sizeBytes") ?? 0L;
                string contentRevisionSha256 = OptionalString(root, "contentRevisionSha256")
                    ?? OptionalString(manifest, "contentRevisionSha256")
                    ?? "";
                string validationError = ValidatePackageMetadata(packageFileName, fileCount, sizeBytes, contentRevisionSha256);
                if (!string.IsNullOrWhiteSpace(validationError))
                {
                    return Unavailable(engine, validationError);
                }
                string sourceFileName = OptionalString(root, "sourceFileName") ?? "";
                string safeSourceFileName = SafePreflightSourceFileName(sourceFileName);
                if (!string.IsNullOrWhiteSpace(sourceFileName) && string.IsNullOrWhiteSpace(safeSourceFileName))
                {
                    return Unavailable(engine, "Engine package preflight sourceFileName must be a safe Greybox artifact file name.");
                }
                int terrainColliderCount = OptionalManifestMetric(manifest, "terrainColliderCount");
                int dynamicEventCount = OptionalManifestMetric(manifest, "dynamicEventCount");
                int factionCount = OptionalManifestMetric(manifest, "factionCount");

                return new GreyboxEnginePackagePreflight
                {
                    Available = true,
                    Engine = engine,
                    SourceFileName = safeSourceFileName,
                    PackageFileName = packageFileName.Trim(),
                    FileCount = fileCount,
                    SizeBytes = sizeBytes,
                    ContentRevisionSha256 = contentRevisionSha256.Trim().ToLowerInvariant(),
                    TerrainColliderCount = terrainColliderCount,
                    DynamicEventCount = dynamicEventCount,
                    FactionCount = factionCount
                };
            }
            catch (Exception error)
            {
                return new GreyboxEnginePackagePreflight
                {
                    Available = false,
                    ErrorMessage = $"Engine package preflight parse failed: {error.Message}"
                };
            }
        }

        private static GreyboxEnginePackagePreflight Unavailable(string engine, string message)
        {
            string safeEngine = NormalizeEngineId(engine);
            return new GreyboxEnginePackagePreflight
            {
                Available = false,
                Engine = string.IsNullOrWhiteSpace(safeEngine) ? "unity" : safeEngine,
                ErrorMessage = SafePreflightMessage(message)
            };
        }

        private static string NormalizeEngineId(string engine)
        {
            string value = string.IsNullOrWhiteSpace(engine) ? "unity" : engine.Trim().ToLowerInvariant();
            if (value == "unity" || value == "unreal" || value == "godot") return value;
            return "";
        }

        private static string ErrorMessage(JObject root, string fallback)
        {
            string message = OptionalString(root, "errorMessage")
                ?? OptionalString(root, "message")
                ?? OptionalString(root, "error")
                ?? "";
            return SafePreflightMessage(string.IsNullOrWhiteSpace(message) ? fallback : message);
        }

        private static string SafePreflightMessage(string message)
        {
            string normalized = string.IsNullOrWhiteSpace(message) ? "Engine package is not available." : message.Trim();
            if (normalized.Length > MaxPreflightMessageChars)
            {
                normalized = normalized.Substring(0, MaxPreflightMessageChars);
            }
            var builder = new System.Text.StringBuilder(normalized.Length);
            foreach (char c in normalized)
            {
                builder.Append(char.IsControl(c) ? ' ' : c);
            }
            return builder.ToString().Trim();
        }

        private static string SafePreflightSourceFileName(string sourceFileName)
        {
            return GreyboxConflictResolver.SafeRoundTripFileName(sourceFileName);
        }

        private static JObject OptionalObject(JObject body, string key)
        {
            if (body == null || body[key] == null || body[key].Type == JTokenType.Null) return null;
            if (body[key].Type != JTokenType.Object)
            {
                throw new FormatException($"Greybox engine package preflight claim {key} must be a JSON object.");
            }
            return body[key] as JObject;
        }

        private static string OptionalString(JObject body, string key)
        {
            if (body == null || body[key] == null || body[key].Type == JTokenType.Null) return null;
            if (body[key].Type != JTokenType.String)
            {
                throw new FormatException($"Greybox engine package preflight claim {key} must be a JSON string.");
            }
            return body[key].Value<string>();
        }

        private static bool? OptionalBool(JObject body, string key)
        {
            if (body == null || body[key] == null || body[key].Type == JTokenType.Null) return null;
            if (body[key].Type != JTokenType.Boolean)
            {
                throw new FormatException($"Greybox engine package preflight claim {key} must be a JSON boolean.");
            }
            return body[key].Value<bool>();
        }

        private static int? OptionalInt(JObject body, string key)
        {
            if (body == null || body[key] == null || body[key].Type == JTokenType.Null) return null;
            if (body[key].Type != JTokenType.Integer)
            {
                throw new FormatException($"Greybox engine package preflight claim {key} must be a JSON integer.");
            }
            return body[key].Value<int>();
        }

        private static long? OptionalLong(JObject body, string key)
        {
            if (body == null || body[key] == null || body[key].Type == JTokenType.Null) return null;
            if (body[key].Type != JTokenType.Integer)
            {
                throw new FormatException($"Greybox engine package preflight claim {key} must be a JSON integer.");
            }
            return body[key].Value<long>();
        }

        private static string ValidatePackageMetadata(string packageFileName, int fileCount, long sizeBytes, string contentRevisionSha256)
        {
            if (string.IsNullOrWhiteSpace(packageFileName))
            {
                return "Engine package preflight is missing packageFileName.";
            }
            string trimmedPackageFileName = packageFileName.Trim();
            if (IsUnsafePackageFileName(trimmedPackageFileName))
            {
                return "Engine package preflight packageFileName must be a file name, not a path.";
            }
            if (!trimmedPackageFileName.EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
            {
                return "Engine package preflight packageFileName must be a .zip file.";
            }
            if (fileCount <= 0)
            {
                return "Engine package preflight must report at least one file.";
            }
            if (fileCount > MaxPackageFileCount)
            {
                return $"Engine package preflight fileCount must be at most {MaxPackageFileCount}.";
            }
            if (sizeBytes <= 0L)
            {
                return "Engine package preflight must report a positive sizeBytes value.";
            }
            if (sizeBytes > MaxPackageSizeBytes)
            {
                return $"Engine package preflight sizeBytes must be at most {MaxPackageSizeBytes}.";
            }
            if (!IsSha256Hex(contentRevisionSha256))
            {
                return "Engine package preflight must report a valid contentRevisionSha256 value.";
            }
            return "";
        }

        private static int OptionalManifestMetric(JObject manifest, string key)
        {
            int value = OptionalInt(manifest, key) ?? 0;
            if (value < 0 || value > MaxManifestMetricCount)
            {
                throw new FormatException($"Greybox engine package preflight claim {key} must be between 0 and {MaxManifestMetricCount}.");
            }
            return value;
        }

        private static bool IsUnsafePackageFileName(string packageFileName)
        {
            if (packageFileName == "." || packageFileName == "..") return true;
            if (packageFileName.Length > MaxPackageFileNameChars) return true;
            if (packageFileName.IndexOf("/", StringComparison.Ordinal) >= 0 || packageFileName.IndexOf("\\", StringComparison.Ordinal) >= 0) return true;
            if (packageFileName.IndexOf(":", StringComparison.Ordinal) >= 0 || packageFileName.IndexOf("://", StringComparison.Ordinal) >= 0) return true;
            foreach (char c in packageFileName)
            {
                if (char.IsControl(c)) return true;
            }
            return false;
        }

        private static bool IsSha256Hex(string value)
        {
            if (string.IsNullOrWhiteSpace(value) || value.Trim().Length != 64) return false;
            foreach (char c in value.Trim())
            {
                bool digit = c >= '0' && c <= '9';
                bool lowerHex = c >= 'a' && c <= 'f';
                bool upperHex = c >= 'A' && c <= 'F';
                if (!digit && !lowerHex && !upperHex) return false;
            }
            return true;
        }
    }
}
