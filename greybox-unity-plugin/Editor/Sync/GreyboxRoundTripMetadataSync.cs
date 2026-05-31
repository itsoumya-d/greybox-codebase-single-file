// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System;
using System.Collections.Generic;
using System.Reflection;
using Greybox.Runtime;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace Greybox.Editor.Sync
{
    public static class GreyboxRoundTripMetadataSync
    {
        public static bool UpdateDisplayNameMetadata(Component component, string propertyPath, bool recordUndo = false)
        {
            if (!component || FieldName(propertyPath) != "DisplayName") return false;
            FieldInfo displayNameField = component.GetType().GetField("DisplayName", BindingFlags.Instance | BindingFlags.Public);
            if (displayNameField == null || displayNameField.FieldType != typeof(string)) return false;
            string displayName = (string)displayNameField.GetValue(component) ?? "";
            bool changed = false;

            var marker = component.GetComponentInParent<GreyboxMarker>();
            string oldJsonPath = marker ? marker.JsonPath ?? "" : "";
            string newJsonPath = "";
            string newMarkerId = "";
            bool nameSelectorPath = marker && TryUpdateNameSelectorPath(marker, displayName, out newJsonPath, out newMarkerId);
            if (marker && marker.MarkerName != displayName)
            {
                if (recordUndo) Undo.RecordObject(marker, "Greybox update marker display name");
                marker.MarkerName = displayName;
                MarkChanged(marker);
                changed = true;
            }
            if (marker && nameSelectorPath)
            {
                if (recordUndo) Undo.RecordObject(marker, "Greybox update marker name selector");
                if (!string.IsNullOrWhiteSpace(newMarkerId) && marker.MarkerId != newMarkerId) marker.MarkerId = newMarkerId;
                if (marker.JsonPath != newJsonPath) marker.JsonPath = newJsonPath;
                string positionJsonPath = ReplacePathPrefix(marker.PositionJsonPath, oldJsonPath, newJsonPath);
                if (marker.PositionJsonPath != positionJsonPath) marker.PositionJsonPath = positionJsonPath;
                MarkChanged(marker);
                changed = true;
            }

            var designNode = component.GetComponentInParent<GreyboxDesignNode>();
            if (designNode && designNode.DisplayName != displayName)
            {
                if (recordUndo) Undo.RecordObject(designNode, "Greybox update design display name");
                designNode.DisplayName = displayName;
                MarkChanged(designNode);
                changed = true;
            }
            if (designNode && nameSelectorPath)
            {
                if (recordUndo) Undo.RecordObject(designNode, "Greybox update design name selector");
                if (!string.IsNullOrWhiteSpace(newMarkerId) && designNode.NodeId != newMarkerId) designNode.NodeId = newMarkerId;
                string designJsonPath = ReplacePathPrefix(designNode.JsonPath, oldJsonPath, newJsonPath);
                if (designNode.JsonPath != designJsonPath) designNode.JsonPath = designJsonPath;
                MarkChanged(designNode);
                changed = true;
            }

            GameObject nodeObject = designNode ? designNode.gameObject : marker ? marker.gameObject : component.gameObject;
            string objectName = UniqueGameObjectName(nodeObject, displayName);
            if (nodeObject && nodeObject.name != objectName)
            {
                if (recordUndo) Undo.RecordObject(nodeObject, "Greybox rename node");
                nodeObject.name = objectName;
                MarkChanged(nodeObject);
                changed = true;
            }

            return changed;
        }

        private static void MarkChanged(UnityEngine.Object target)
        {
            EditorUtility.SetDirty(target);
            PrefabUtility.RecordPrefabInstancePropertyModifications(target);
        }

        private static string FieldName(string propertyPath)
        {
            if (string.IsNullOrWhiteSpace(propertyPath)) return "";
            int dot = propertyPath.IndexOf('.');
            return dot < 0 ? propertyPath : propertyPath.Substring(0, dot);
        }

        private static string UniqueGameObjectName(GameObject nodeObject, string requestedName)
        {
            string seed = SafeGameObjectName(requestedName);
            if (!nodeObject) return seed;

            var taken = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            Transform parent = nodeObject.transform.parent;
            if (parent)
            {
                for (int index = 0; index < parent.childCount; index++)
                {
                    GameObject child = parent.GetChild(index).gameObject;
                    if (child != nodeObject) taken.Add(child.name);
                }
            }
            else
            {
                foreach (GameObject root in EditorSceneManager.GetActiveScene().GetRootGameObjects())
                {
                    if (root != nodeObject) taken.Add(root.name);
                }
            }

            string candidate = seed;
            int suffix = 2;
            while (taken.Contains(candidate))
            {
                candidate = $"{seed} {suffix}";
                suffix++;
            }
            return candidate;
        }

        private static string SafeGameObjectName(string value)
        {
            string result = string.IsNullOrWhiteSpace(value) ? "Greybox Node" : value.Trim();
            foreach (char c in System.IO.Path.GetInvalidFileNameChars()) result = result.Replace(c, '_');
            return result.Replace('/', '_').Replace('\\', '_');
        }

        private static bool TryUpdateNameSelectorPath(GreyboxMarker marker, string displayName, out string jsonPath, out string markerId)
        {
            jsonPath = "";
            markerId = SafeMarkerId(displayName);
            if (!marker || string.IsNullOrWhiteSpace(marker.JsonPath)) return false;
            if (!TryFindLastNameSelector(marker.JsonPath, out int selectorStart, out int selectorEnd)) return false;

            string selector = IsSafeNameSelectorValue(displayName)
                ? $"[name={displayName}]"
                : IndexFallbackSelector(marker, selectorStart);
            if (string.IsNullOrWhiteSpace(selector)) return false;
            jsonPath = marker.JsonPath.Substring(0, selectorStart) + selector + marker.JsonPath.Substring(selectorEnd + 1);
            return true;
        }

        private static bool TryFindLastNameSelector(string path, out int selectorStart, out int selectorEnd)
        {
            selectorStart = -1;
            selectorEnd = -1;
            if (string.IsNullOrWhiteSpace(path)) return false;
            selectorStart = path.LastIndexOf("[name=", StringComparison.Ordinal);
            if (selectorStart < 0) return false;
            selectorEnd = path.IndexOf(']', selectorStart);
            return selectorEnd > selectorStart + "[name=".Length;
        }

        private static string IndexFallbackSelector(GreyboxMarker marker, int selectorStart)
        {
            if (!marker || !marker.transform.parent || selectorStart <= 0) return "";
            int index = 0;
            Transform parent = marker.transform.parent;
            for (int childIndex = 0; childIndex < parent.childCount; childIndex++)
            {
                Transform child = parent.GetChild(childIndex);
                var childMarker = child.GetComponent<GreyboxMarker>();
                if (!childMarker || childMarker.Collection != marker.Collection) continue;
                if (child == marker.transform) return $"[{index}]";
                index++;
            }
            return "";
        }

        private static string ReplacePathPrefix(string path, string oldPrefix, string newPrefix)
        {
            if (string.IsNullOrWhiteSpace(path) || string.IsNullOrWhiteSpace(oldPrefix) || string.IsNullOrWhiteSpace(newPrefix)) return path ?? "";
            if (path == oldPrefix) return newPrefix;
            return path.StartsWith(oldPrefix + ".", StringComparison.Ordinal)
                ? newPrefix + path.Substring(oldPrefix.Length)
                : path;
        }

        private static bool IsSafeNameSelectorValue(string value)
        {
            if (string.IsNullOrWhiteSpace(value) || value.Trim() != value || value.Length > 160) return false;
            if (value.Contains("[") || value.Contains("]") || value.Contains("=") || value.Contains(".") || value.Contains("/") || value.Contains("\\") || value.Contains("://")) return false;
            foreach (char c in value)
            {
                if (char.IsControl(c) || char.IsWhiteSpace(c)) return false;
            }
            return true;
        }

        private static string SafeMarkerId(string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return "";
            string trimmed = value.Trim();
            var chars = new char[Math.Min(trimmed.Length, 160)];
            int length = 0;
            foreach (char c in trimmed)
            {
                if (length >= chars.Length) break;
                chars[length++] = char.IsControl(c) || char.IsWhiteSpace(c) || c == '/' || c == '\\' || c == '[' || c == ']' || c == '=' || c == '.'
                    ? '-'
                    : c;
            }
            return new string(chars, 0, length).Trim('-');
        }
    }
}
