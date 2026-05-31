// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using Greybox.Runtime;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace Greybox.Editor.Windows
{
    public static class GreyboxSettings
    {
        private const string ConfigPath = "Assets/Greybox/GreyboxConfig.asset";
        private const string LicenseKeyPref = "Greybox.Studio.LicenseKey";
        private const string LicenseTierPref = "Greybox.Studio.LicenseTier";
        private const string LicenseCapabilitiesPref = "Greybox.Studio.LicenseCapabilities";
        private const string LicenseCapabilitiesIntegrityPref = "Greybox.Studio.LicenseCapabilitiesIntegrity";
        private const string ProjectKeysPref = "Greybox.Studio.ProjectKeys";
        private const string McpBridgeTokenPref = "Greybox.Studio.McpBridgeToken";
        private const int MaxLicenseSnapshotExpiryChars = 128;
        private const int TrackedProjectKeyChars = 16;
        private const int MaxTrackedProjectKeys = 64;
        private const int McpBridgeTokenChars = 43;

        public static GreyboxConfig LoadConfig()
        {
            return AssetDatabase.LoadAssetAtPath<GreyboxConfig>(ConfigPath);
        }

        public static GreyboxConfig FindOrCreateConfig()
        {
            var config = LoadConfig();
            if (config) return config;
            System.IO.Directory.CreateDirectory("Assets/Greybox");
            config = ScriptableObject.CreateInstance<GreyboxConfig>();
            AssetDatabase.CreateAsset(config, ConfigPath);
            AssetDatabase.SaveAssets();
            return config;
        }

        public static string GetLicenseKey()
        {
            return EditorPrefs.GetString(LicenseKeyPref, "");
        }

        public static void SetLicenseKey(string value)
        {
            string clean = string.IsNullOrWhiteSpace(value) ? "" : value.Trim();
            if (string.IsNullOrEmpty(clean))
            {
                EditorPrefs.DeleteKey(LicenseKeyPref);
                ClearLicenseTier();
                ClearLicenseCapabilities();
            }
            else EditorPrefs.SetString(LicenseKeyPref, clean);
        }

        public static string GetLicenseTier()
        {
            return EditorPrefs.GetString(LicenseTierPref, "");
        }

        public static void SetLicenseTier(GreyboxLicenseTier tier)
        {
            EditorPrefs.SetString(LicenseTierPref, tier.ToString());
        }

        public static void ClearLicenseTier()
        {
            EditorPrefs.DeleteKey(LicenseTierPref);
            ClearLicenseCapabilities();
        }

        public static string GetLicenseCapabilitiesJson()
        {
            return EditorPrefs.GetString(LicenseCapabilitiesPref, "");
        }

        public static string GetLicenseCapabilitiesIntegrity()
        {
            return EditorPrefs.GetString(LicenseCapabilitiesIntegrityPref, "");
        }

        public static bool SetLicenseCapabilities(GreyboxLicenseCapabilities capabilities, string expiresAtUtc = "")
        {
            if (!TryCleanLicenseSnapshotExpiry(expiresAtUtc, out string cleanExpiresAtUtc))
            {
                ClearLicenseCapabilities();
                return false;
            }

            var body = new JObject
            {
                ["tier"] = capabilities.Tier.ToString(),
                ["validatedAt"] = DateTimeOffset.UtcNow.ToString("O"),
                ["import"] = capabilities.CanImport,
                ["roundTripSync"] = capabilities.CanRoundTrip,
                ["mcpBridge"] = capabilities.CanUseMcpBridge,
                ["watermark"] = capabilities.HasWatermark,
                ["maxProjects"] = capabilities.MaxProjects,
                ["priorityQueue"] = capabilities.HasPriorityQueue,
                ["sso"] = capabilities.HasSso,
                ["customSkillPacks"] = capabilities.HasCustomSkillPacks,
                ["seatLimit"] = capabilities.SeatLimit,
                ["siteLicense"] = capabilities.IsSiteLicense,
            };
            if (!string.IsNullOrWhiteSpace(cleanExpiresAtUtc))
            {
                body["expiresAt"] = cleanExpiresAtUtc;
            }
            string snapshot = body.ToString(Formatting.None);
            string integrity = GreyboxLicenseState.CapabilitySnapshotIntegrity(snapshot, GetLicenseKey());
            if (!GreyboxLicenseState.TryParseTrustedCapabilities(snapshot, GetLicenseKey(), integrity, out _))
            {
                ClearLicenseCapabilities();
                return false;
            }
            EditorPrefs.SetString(LicenseCapabilitiesPref, snapshot);
            EditorPrefs.SetString(LicenseCapabilitiesIntegrityPref, integrity);
            return true;
        }

        public static void ClearLicenseCapabilities()
        {
            EditorPrefs.DeleteKey(LicenseCapabilitiesPref);
            EditorPrefs.DeleteKey(LicenseCapabilitiesIntegrityPref);
        }

        public static string[] GetTrackedProjectKeys()
        {
            string value = EditorPrefs.GetString(ProjectKeysPref, "");
            string[] keys = SanitizeTrackedProjectKeys(value.Split(new[] { '\n' }, System.StringSplitOptions.RemoveEmptyEntries));
            if (keys.Length == 0 && !string.IsNullOrWhiteSpace(value))
            {
                EditorPrefs.DeleteKey(ProjectKeysPref);
            }
            else
            {
                string normalized = string.Join("\n", keys);
                if (!string.Equals(value, normalized, StringComparison.Ordinal))
                {
                    EditorPrefs.SetString(ProjectKeysPref, normalized);
                }
            }
            return keys;
        }

        public static void SetTrackedProjectKeys(string[] keys)
        {
            string[] safeKeys = SanitizeTrackedProjectKeys(keys);
            if (safeKeys.Length == 0)
            {
                EditorPrefs.DeleteKey(ProjectKeysPref);
                return;
            }
            EditorPrefs.SetString(ProjectKeysPref, string.Join("\n", safeKeys));
        }

        public static void ClearTrackedProjectKeys()
        {
            EditorPrefs.DeleteKey(ProjectKeysPref);
        }

        public static string GetOrCreateMcpBridgeToken()
        {
            string existing = EditorPrefs.GetString(McpBridgeTokenPref, "");
            if (IsSafeMcpBridgeToken(existing)) return existing;
            return RotateMcpBridgeToken();
        }

        public static string RotateMcpBridgeToken()
        {
            string token = GenerateMcpBridgeToken();
            EditorPrefs.SetString(McpBridgeTokenPref, token);
            return token;
        }

        private static string GenerateMcpBridgeToken()
        {
            byte[] bytes = new byte[32];
            RandomNumberGenerator.Fill(bytes);
            return Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        }

        public static bool IsSafeMcpBridgeToken(string token)
        {
            if (string.IsNullOrWhiteSpace(token) || token.Length != McpBridgeTokenChars) return false;
            foreach (char c in token)
            {
                bool alpha = c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z';
                bool digit = c >= '0' && c <= '9';
                bool safe = c == '-' || c == '_';
                if (!alpha && !digit && !safe) return false;
            }
            return true;
        }

        private static bool TryCleanLicenseSnapshotExpiry(string value, out string expiresAtUtc)
        {
            expiresAtUtc = "";
            if (string.IsNullOrWhiteSpace(value)) return true;
            string clean = value.Trim();
            if (clean.Length > MaxLicenseSnapshotExpiryChars) return false;
            foreach (char c in clean)
            {
                if (char.IsControl(c)) return false;
            }
            if (!DateTimeOffset.TryParse(clean, out _)) return false;
            expiresAtUtc = clean;
            return true;
        }

        public static string[] SanitizeTrackedProjectKeys(IEnumerable<string> keys)
        {
            return (keys ?? Array.Empty<string>())
                .Select(value => (value ?? "").Trim().ToLowerInvariant())
                .Where(IsSafeTrackedProjectKey)
                .Distinct(StringComparer.Ordinal)
                .Take(MaxTrackedProjectKeys)
                .ToArray();
        }

        private static bool IsSafeTrackedProjectKey(string key)
        {
            if (key == null || key.Length != TrackedProjectKeyChars) return false;
            foreach (char c in key)
            {
                bool digit = c >= '0' && c <= '9';
                bool hex = c >= 'a' && c <= 'f';
                if (!digit && !hex) return false;
            }
            return true;
        }
    }
}
