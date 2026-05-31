// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System;
using Greybox.Editor.Generation;
using Newtonsoft.Json;
using UnityEditor;
using UnityEngine;

namespace Greybox.Editor.Sync
{
    public static class GreyboxPrefabSidecarResolver
    {
        private const string PrefabSidecarStrategy = "prefab-sidecar";

        public static bool IsPrefabSidecar(GreyboxRoundTripConflict conflict)
        {
            return conflict != null
                && string.Equals(conflict.Strategy, PrefabSidecarStrategy, StringComparison.Ordinal)
                && string.Equals(conflict.Path, "$.unity.prefab", StringComparison.Ordinal);
        }

        public static string CanonicalPath(GreyboxRoundTripConflict conflict)
        {
            return UnquoteJsonString(conflict?.UnityValueJson);
        }

        public static string IncomingPath(GreyboxRoundTripConflict conflict)
        {
            return UnquoteJsonString(conflict?.WebValueJson);
        }

        public static bool CanAcceptIncoming(GreyboxRoundTripConflict conflict)
        {
            string canonicalPath = CanonicalPath(conflict);
            string incomingPath = IncomingPath(conflict);
            return IsPrefabSidecar(conflict)
                && IsSafePrefabAssetPath(canonicalPath)
                && IsMatchingIncomingPrefabSidecarPath(canonicalPath, incomingPath);
        }

        public static bool CanKeepCanonical(GreyboxRoundTripConflict conflict)
        {
            if (!IsPrefabSidecar(conflict)) return false;
            string canonicalPath = CanonicalPath(conflict);
            string incomingPath = IncomingPath(conflict);
            return IsSafePrefabAssetPath(canonicalPath)
                && (string.IsNullOrWhiteSpace(incomingPath) || IsMatchingIncomingPrefabSidecarPath(canonicalPath, incomingPath));
        }

        public static bool AcceptIncoming(GreyboxRoundTripConflict conflict)
        {
            if (!IsPrefabSidecar(conflict)) return false;
            string canonicalPath = CanonicalPath(conflict);
            string incomingPath = IncomingPath(conflict);
            if (string.IsNullOrWhiteSpace(canonicalPath) || string.IsNullOrWhiteSpace(incomingPath)) return false;
            if (!CanAcceptIncoming(conflict))
            {
                Debug.LogWarning("Greybox refused unsafe prefab sidecar paths during incoming adoption.");
                return false;
            }
            if (!AssetDatabase.LoadAssetAtPath<GameObject>(incomingPath))
            {
                Debug.LogWarning($"Greybox cannot adopt incoming prefab because the sidecar asset is missing: {incomingPath}");
                return false;
            }

            GameObject incomingContents = PrefabUtility.LoadPrefabContents(incomingPath);
            try
            {
                PrefabUtility.SaveAsPrefabAsset(incomingContents, canonicalPath, out bool success);
                if (!success)
                {
                    Debug.LogWarning($"Greybox could not save incoming prefab sidecar over canonical prefab: {canonicalPath}");
                    return false;
                }
            }
            finally
            {
                PrefabUtility.UnloadPrefabContents(incomingContents);
            }

            if (!DeleteIncomingSidecar(incomingPath, "after adopting the incoming prefab sidecar")) return false;
            GreyboxConflictInbox.Remove(conflict);
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            return true;
        }

        public static bool KeepCanonical(GreyboxRoundTripConflict conflict)
        {
            if (!IsPrefabSidecar(conflict)) return false;
            string incomingPath = IncomingPath(conflict);
            if (!string.IsNullOrWhiteSpace(incomingPath))
            {
                if (!CanKeepCanonical(conflict))
                {
                    Debug.LogWarning("Greybox refused unsafe prefab sidecar path during canonical keep.");
                    return false;
                }
                if (!DeleteIncomingSidecar(incomingPath, "while keeping the canonical prefab")) return false;
            }

            GreyboxConflictInbox.Remove(conflict);
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            return true;
        }

        private static string UnquoteJsonString(string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return "";
            try
            {
                return JsonConvert.DeserializeObject<string>(value) ?? "";
            }
            catch (JsonException)
            {
                return value;
            }
        }

        public static bool IsSafePrefabAssetPath(string path)
        {
            if (string.IsNullOrWhiteSpace(path)) return false;
            string normalized = NormalizePrefabAssetPath(path);
            if (string.IsNullOrWhiteSpace(normalized)) return false;
            if (normalized.Length > 512) return false;
            if (!normalized.StartsWith("Assets/", StringComparison.Ordinal)) return false;
            if (!normalized.EndsWith(".prefab", StringComparison.OrdinalIgnoreCase)) return false;
            foreach (char c in normalized)
            {
                if (char.IsControl(c)) return false;
            }
            foreach (string segment in normalized.Split('/'))
            {
                if (segment == "." || segment == ".." || string.IsNullOrWhiteSpace(segment)) return false;
            }
            return true;
        }

        public static bool IsIncomingPrefabSidecarPath(string path)
        {
            if (!IsSafePrefabAssetPath(path)) return false;
            return NormalizePrefabAssetPath(path).EndsWith(
                $"{PrefabAssetExporter.IncomingSidecarSuffix}.prefab",
                StringComparison.OrdinalIgnoreCase);
        }

        public static bool IsMatchingIncomingPrefabSidecarPath(string canonicalPath, string incomingPath)
        {
            if (!IsSafePrefabAssetPath(canonicalPath) || !IsIncomingPrefabSidecarPath(incomingPath)) return false;
            string expectedIncoming = NormalizePrefabAssetPath(PrefabAssetExporter.IncomingSidecarPath(canonicalPath));
            string normalizedIncoming = NormalizePrefabAssetPath(incomingPath);
            return string.Equals(expectedIncoming, normalizedIncoming, StringComparison.OrdinalIgnoreCase);
        }

        private static bool DeleteIncomingSidecar(string incomingPath, string context)
        {
            if (!AssetDatabase.LoadAssetAtPath<GameObject>(incomingPath)) return true;
            if (AssetDatabase.DeleteAsset(incomingPath)) return true;
            Debug.LogWarning($"Greybox could not delete incoming prefab sidecar {context}: {incomingPath}");
            return false;
        }

        private static string NormalizePrefabAssetPath(string path)
        {
            return (path ?? "").Replace('\\', '/').Trim();
        }
    }
}
