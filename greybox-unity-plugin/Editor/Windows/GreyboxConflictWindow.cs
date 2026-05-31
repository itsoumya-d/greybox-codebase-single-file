// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System.Collections.Generic;
using System.Linq;
using Greybox.Editor.Sync;
using UnityEditor;
using UnityEngine;

namespace Greybox.Editor.Windows
{
    public sealed class GreyboxConflictWindow : EditorWindow
    {
        private readonly Dictionary<string, string> manualDrafts = new Dictionary<string, string>();
        private Vector2 scroll;

        [MenuItem("Window/Greybox/Round-Trip Conflicts")]
        public static void Open()
        {
            GetWindow<GreyboxConflictWindow>("Greybox Conflicts");
        }

        private void OnEnable()
        {
            GreyboxConflictInbox.Changed += Repaint;
        }

        private void OnDisable()
        {
            GreyboxConflictInbox.Changed -= Repaint;
        }

        private void OnGUI()
        {
            EditorGUILayout.LabelField("Round-Trip Conflicts", EditorStyles.boldLabel);
            EditorGUILayout.HelpBox(
                "Review merge conflicts and protected prefab sidecars produced during Greybox round-trip sync.",
                MessageType.Warning);
            var capabilities = GreyboxLicenseState.CurrentCapabilities();
            if (!capabilities.CanRoundTrip)
            {
                EditorGUILayout.HelpBox("Accepting merge resolutions requires a Pro or Studio license.", MessageType.Info);
            }

            using (new EditorGUILayout.HorizontalScope())
            {
                EditorGUILayout.LabelField($"{GreyboxConflictInbox.Conflicts.Count} pending review item(s)");
                if (GUILayout.Button("Copy All JSON", GUILayout.Width(120)))
                {
                    EditorGUIUtility.systemCopyBuffer = ConflictJson();
                }
                if (GUILayout.Button("Add Example Conflict", GUILayout.Width(148)))
                {
                    GreyboxConflictInbox.RecordExampleRoundTripConflict();
                }
                if (GUILayout.Button("Clear", GUILayout.Width(72)))
                {
                    GreyboxConflictInbox.Clear();
                }
            }
            using (new EditorGUILayout.HorizontalScope())
            {
                using (new EditorGUI.DisabledScope(!capabilities.CanRoundTrip || GreyboxConflictInbox.Conflicts.Count == 0))
                {
                    if (GUILayout.Button("Accept All Web")) ResolveAll(GreyboxConflictResolution.Web);
                    if (GUILayout.Button("Accept All Unity")) ResolveAll(GreyboxConflictResolution.Unity);
                }
            }

            scroll = EditorGUILayout.BeginScrollView(scroll);
            foreach (GreyboxRoundTripConflict conflict in GreyboxConflictInbox.Conflicts)
            {
                DrawConflict(conflict);
            }
            EditorGUILayout.EndScrollView();
        }

        private void DrawConflict(GreyboxRoundTripConflict conflict)
        {
            using (new EditorGUILayout.VerticalScope(EditorStyles.helpBox))
            {
                EditorGUILayout.LabelField(conflict.FileName, EditorStyles.boldLabel);
                EditorGUILayout.LabelField("Path", conflict.Path);
                EditorGUILayout.LabelField("Strategy", conflict.Strategy);
                if (IsPrefabSidecar(conflict))
                {
                    DrawPrefabSidecar(conflict);
                }
                else
                {
                    DrawValue("Base", conflict.BaseValueJson);
                    DrawValue("Greybox Web", conflict.WebValueJson);
                    DrawValue("Unity", conflict.UnityValueJson);
                    if (!string.IsNullOrWhiteSpace(conflict.MergedContent))
                    {
                        DrawManualDraft(conflict);
                    }
                }
                using (new EditorGUILayout.HorizontalScope())
                {
                    if (GreyboxPrefabSidecarResolver.IsPrefabSidecar(conflict))
                    {
                        bool canAcceptIncoming = GreyboxPrefabSidecarResolver.CanAcceptIncoming(conflict);
                        bool canKeepCanonical = GreyboxPrefabSidecarResolver.CanKeepCanonical(conflict);
                        using (new EditorGUI.DisabledScope(!canAcceptIncoming))
                        {
                            if (GUILayout.Button("Ping Canonical Prefab")) PingAsset(GreyboxPrefabSidecarResolver.CanonicalPath(conflict));
                            if (GUILayout.Button("Adopt Incoming")) GreyboxPrefabSidecarResolver.AcceptIncoming(conflict);
                        }
                        using (new EditorGUI.DisabledScope(!canKeepCanonical))
                        {
                            if (GUILayout.Button("Ping Incoming Prefab")) PingAsset(GreyboxPrefabSidecarResolver.IncomingPath(conflict));
                            if (GUILayout.Button("Keep Canonical")) GreyboxPrefabSidecarResolver.KeepCanonical(conflict);
                        }
                    }
                    else
                    {
                        if (GUILayout.Button("Copy Web Value")) EditorGUIUtility.systemCopyBuffer = conflict.WebValueJson;
                        if (GUILayout.Button("Copy Unity Value")) EditorGUIUtility.systemCopyBuffer = conflict.UnityValueJson;
                        if (GUILayout.Button("Copy Manual Draft")) EditorGUIUtility.systemCopyBuffer = ManualDraft(conflict);
                    }
                }
                if (!GreyboxPrefabSidecarResolver.IsPrefabSidecar(conflict))
                {
                    using (new EditorGUILayout.HorizontalScope())
                    {
                        using (new EditorGUI.DisabledScope(!GreyboxLicenseState.CurrentCapabilities().CanRoundTrip))
                        {
                            if (GUILayout.Button("Accept Web Merge"))
                            {
                                var activeConfig = GreyboxSettings.LoadConfig();
                                GreyboxConflictResolver.AcceptWebMerge(activeConfig, conflict);
                            }
                            if (GUILayout.Button("Accept Unity Merge"))
                            {
                                var activeConfig = GreyboxSettings.LoadConfig();
                                GreyboxConflictResolver.AcceptUnityMerge(activeConfig, conflict);
                            }
                            if (GUILayout.Button("Accept Manual Merge"))
                            {
                                var activeConfig = GreyboxSettings.LoadConfig();
                                GreyboxConflictResolver.AcceptManualMerge(activeConfig, conflict, ManualDraft(conflict));
                            }
                        }
                    }
                }
            }
        }

        private static void DrawPrefabSidecar(GreyboxRoundTripConflict conflict)
        {
            EditorGUILayout.HelpBox(
                "Greybox detected user-added Unity components on the generated prefab. Adopt Incoming overwrites the canonical prefab with regenerated content; Keep Canonical discards the incoming sidecar.",
                MessageType.Info);
            DrawValue("Source Artifact", conflict.BaseValueJson);
            DrawValue("Canonical Prefab", conflict.UnityValueJson);
            DrawValue("Incoming Prefab", conflict.WebValueJson);
            DrawValue("Action", conflict.MergedContent);
        }

        private static void DrawValue(string label, string value)
        {
            EditorGUILayout.LabelField(label, EditorStyles.miniBoldLabel);
            EditorGUILayout.TextArea(value, GUILayout.MinHeight(32));
        }

        private void DrawManualDraft(GreyboxRoundTripConflict conflict)
        {
            string key = ConflictKey(conflict);
            if (!manualDrafts.ContainsKey(key)) manualDrafts[key] = conflict.MergedContent ?? "";
            EditorGUILayout.LabelField("Manual Merge", EditorStyles.miniBoldLabel);
            manualDrafts[key] = EditorGUILayout.TextArea(manualDrafts[key], GUILayout.MinHeight(72));
        }

        private string ManualDraft(GreyboxRoundTripConflict conflict)
        {
            string key = ConflictKey(conflict);
            if (!manualDrafts.TryGetValue(key, out string draft))
            {
                draft = conflict?.MergedContent ?? "";
                manualDrafts[key] = draft;
            }
            return draft;
        }

        private static void ResolveAll(GreyboxConflictResolution resolution)
        {
            var activeConfig = GreyboxSettings.LoadConfig();
            GreyboxConflictResolver.AcceptBatchMerge(
                activeConfig,
                GreyboxConflictInbox.Conflicts.Where(conflict => !GreyboxPrefabSidecarResolver.IsPrefabSidecar(conflict)).ToArray(),
                resolution);
        }

        private static string ConflictKey(GreyboxRoundTripConflict conflict)
        {
            if (conflict == null) return "";
            return string.Join("|", conflict.FileName ?? "", conflict.Path ?? "", conflict.UpdatedAt.ToString(System.Globalization.CultureInfo.InvariantCulture));
        }

        private static bool IsPrefabSidecar(GreyboxRoundTripConflict conflict)
        {
            return GreyboxPrefabSidecarResolver.IsPrefabSidecar(conflict);
        }

        private static void PingAsset(string path)
        {
            if (!GreyboxPrefabSidecarResolver.IsSafePrefabAssetPath(path)) return;
            var asset = AssetDatabase.LoadAssetAtPath<Object>(path);
            if (!asset) return;
            Selection.activeObject = asset;
            EditorGUIUtility.PingObject(asset);
        }

        private static string ConflictJson()
        {
            return Newtonsoft.Json.JsonConvert.SerializeObject(
                GreyboxConflictInbox.Conflicts,
                Newtonsoft.Json.Formatting.Indented);
        }
    }
}
