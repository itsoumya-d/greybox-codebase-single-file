// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System;
using System.Collections.Generic;
using System.Linq;
using Greybox.Runtime;
using UnityEditor;
using UnityEditor.AddressableAssets;
using UnityEditor.AddressableAssets.Settings;
using UnityEngine;

namespace Greybox.Editor.Generation
{
    public static class AddressablesTagger
    {
        public const string GeneratedGroupName = "Greybox Generated";
        public const string GeneratedLabel = "greybox-generated";
        public const string GameViewportLabel = "greybox-gameview";
        public const string ArtBibleLabel = "greybox-art-bible";
        public const string HudLayoutLabel = "greybox-hud-layout";
        public const string LevelBoardLabel = "greybox-level-board";
        public const string SampleSceneLabel = "greybox-sample-scene";
        public const string PlatformerSampleLabel = "greybox-2d-platformer";
        public const int MaxAssetPathChars = 512;
        public const int MaxPendingTagRequests = 1024;

        private static readonly Queue<TagRequest> Pending = new Queue<TagRequest>();
        private static readonly HashSet<string> PendingKeys = new HashSet<string>(StringComparer.Ordinal);
        private static bool flushScheduled;

        public static void TagDeferred(string assetPath, GreyboxArtifactKind kind)
        {
            TagDeferred(assetPath, GeneratedLabel, LabelForKind(kind));
        }

        public static void TagSampleSceneDeferred(string scenePath, string sampleLabel)
        {
            TagDeferred(scenePath, GeneratedLabel, SampleSceneLabel, sampleLabel);
        }

        public static void TagDeferred(string assetPath, params string[] labels)
        {
            if (!TryNormalizeAssetPath(assetPath, out string normalizedAssetPath))
            {
                Debug.LogWarning("Greybox skipped an unsafe Addressables tag path.");
                return;
            }
            string[] normalizedLabels = NormalizeLabels(labels).ToArray();
            if (normalizedLabels.Length == 0) normalizedLabels = new[] { GeneratedLabel };
            string key = $"{normalizedAssetPath}|{string.Join("|", normalizedLabels)}";
            if (PendingKeys.Contains(key))
            {
                ScheduleFlush();
                return;
            }
            if (Pending.Count >= MaxPendingTagRequests)
            {
                Debug.LogWarning($"Greybox dropped a deferred Addressables tag request because the pending tag queue is capped at {MaxPendingTagRequests} entries.");
                return;
            }
            PendingKeys.Add(key);
            Pending.Enqueue(new TagRequest(normalizedAssetPath, normalizedLabels));
            ScheduleFlush();
        }

        private static void ScheduleFlush()
        {
            if (flushScheduled) return;
            flushScheduled = true;
            EditorApplication.delayCall += FlushPending;
        }

        public static void FlushPending()
        {
            FlushPending(request =>
            {
                bool tagged = TryTagGeneratedAsset(request.AssetPath, request.Labels, out bool retryable);
                if (tagged) return TagAttemptResult.Tagged;
                return retryable ? TagAttemptResult.RetryableFailure : TagAttemptResult.PermanentFailure;
            });
        }

        private static void FlushPending(Func<TagRequest, TagAttemptResult> tagger)
        {
            flushScheduled = false;
            int attempts = Pending.Count;
            for (int index = 0; index < attempts && Pending.Count > 0; index++)
            {
                TagRequest request = Pending.Dequeue();
                PendingKeys.Remove(request.Key);
                if (tagger(request) == TagAttemptResult.RetryableFailure)
                {
                    EnqueueRetry(request);
                }
            }
        }

        public static bool TagGeneratedAsset(string assetPath, GreyboxArtifactKind kind)
        {
            return TagGeneratedAsset(assetPath, GeneratedLabel, LabelForKind(kind));
        }

        public static bool TagGeneratedAsset(string assetPath, string label = GeneratedLabel)
        {
            return TagGeneratedAsset(assetPath, new[] { label });
        }

        public static bool TagGeneratedAsset(string assetPath, params string[] labels)
        {
            if (!TryNormalizeAssetPath(assetPath, out string normalizedAssetPath)) return false;
            string[] normalizedLabels = NormalizeLabels(labels).ToArray();
            if (normalizedLabels.Length == 0) normalizedLabels = new[] { GeneratedLabel };
            return TryTagGeneratedAsset(normalizedAssetPath, normalizedLabels, out _);
        }

        private static bool TryTagGeneratedAsset(string assetPath, string[] normalizedLabels, out bool retryable)
        {
            retryable = false;
            if (!TryNormalizeAssetPath(assetPath, out string normalizedAssetPath)) return false;
            var main = AssetDatabase.LoadMainAssetAtPath(normalizedAssetPath);
            if (!main) return false;
            ApplyEditorLabels(main, normalizedLabels);

            string guid = AssetDatabase.AssetPathToGUID(normalizedAssetPath);
            if (string.IsNullOrEmpty(guid)) return false;
            AddressableAssetSettings settings = AddressableAssetSettingsDefaultObject.GetSettings(true);
            if (!settings)
            {
                retryable = true;
                Debug.LogWarning("Greybox could not bootstrap Addressables settings for generated Greybox content.");
                return false;
            }

            AddressableAssetGroup group = ResolveGeneratedGroup(settings);
            if (!group)
            {
                retryable = true;
                Debug.LogWarning("Greybox could not find or create an Addressables group for generated assets.");
                return false;
            }

            AddressableAssetEntry entry = settings.CreateOrMoveEntry(guid, group, false, true);
            if (entry == null)
            {
                retryable = true;
                return false;
            }
            entry.SetAddress(BuildAddress(normalizedAssetPath), true);
            foreach (string currentLabel in normalizedLabels)
            {
                settings.AddLabel(currentLabel, false);
                entry.SetLabel(currentLabel, true, true, true);
            }
            settings.SetDirty(AddressableAssetSettings.ModificationEvent.EntryModified, entry, true, true);
            AssetDatabase.SaveAssets();
            return true;
        }

        public static string LabelForKind(GreyboxArtifactKind kind)
        {
            return kind switch
            {
                GreyboxArtifactKind.GameViewport => GameViewportLabel,
                GreyboxArtifactKind.ArtBible => ArtBibleLabel,
                GreyboxArtifactKind.HudLayout => HudLayoutLabel,
                GreyboxArtifactKind.LevelBoard => LevelBoardLabel,
                _ => GeneratedLabel
            };
        }

        private static AddressableAssetGroup ResolveGeneratedGroup(AddressableAssetSettings settings)
        {
            AddressableAssetGroup existing = settings.FindGroup(GeneratedGroupName);
            if (existing) return existing;
            AddressableAssetGroup defaultGroup = settings.DefaultGroup;
            if (!defaultGroup) return null;
            return settings.CreateGroup(GeneratedGroupName, false, false, true, defaultGroup.Schemas, Array.Empty<Type>());
        }

        private static void ApplyEditorLabels(UnityEngine.Object asset, IEnumerable<string> labels)
        {
            var merged = new HashSet<string>(AssetDatabase.GetLabels(asset), StringComparer.Ordinal);
            foreach (string label in labels) merged.Add(label);
            AssetDatabase.SetLabels(asset, merged.OrderBy(item => item, StringComparer.Ordinal).ToArray());
        }

        private static IEnumerable<string> NormalizeLabels(IEnumerable<string> labels)
        {
            foreach (string label in labels ?? Array.Empty<string>())
            {
                if (string.IsNullOrWhiteSpace(label)) continue;
                yield return label.Trim();
            }
        }

        private static void EnqueueRetry(TagRequest request)
        {
            if (PendingKeys.Contains(request.Key)) return;
            if (Pending.Count >= MaxPendingTagRequests)
            {
                Debug.LogWarning($"Greybox dropped a retryable Addressables tag request because the pending tag queue is capped at {MaxPendingTagRequests} entries.");
                return;
            }
            PendingKeys.Add(request.Key);
            Pending.Enqueue(request);
        }

        private static string BuildAddress(string assetPath)
        {
            string normalized = assetPath.Replace('\\', '/');
            if (normalized.StartsWith("Assets/", StringComparison.Ordinal)) normalized = normalized.Substring("Assets/".Length);
            return $"greybox/{normalized}";
        }

        private static bool TryNormalizeAssetPath(string assetPath, out string normalized)
        {
            normalized = (assetPath ?? "").Trim().Replace('\\', '/');
            if (string.IsNullOrWhiteSpace(normalized) || normalized.Length > MaxAssetPathChars) return false;
            if (!normalized.StartsWith("Assets/", StringComparison.Ordinal) || normalized.EndsWith("/", StringComparison.Ordinal)) return false;
            if (normalized.Contains("//")) return false;
            foreach (char c in normalized)
            {
                if (char.IsControl(c)) return false;
            }
            foreach (string segment in normalized.Split('/'))
            {
                if (string.IsNullOrWhiteSpace(segment) || segment == "." || segment == "..") return false;
            }
            return true;
        }

        internal static int PendingTagRequestCountForTests => Pending.Count;
        internal static int MaxPendingTagRequestsForTests => MaxPendingTagRequests;
        internal static int MaxAssetPathCharsForTests => MaxAssetPathChars;
        internal static bool FlushScheduledForTests => flushScheduled;

        internal static void ClearPendingForTests()
        {
            Pending.Clear();
            PendingKeys.Clear();
            flushScheduled = false;
            EditorApplication.delayCall -= FlushPending;
        }

        internal static void FlushPendingForTests(Func<string, string[], bool> tagger, Func<string, string[], bool> retryable)
        {
            FlushPending(request =>
            {
                if (tagger(request.AssetPath, request.Labels)) return TagAttemptResult.Tagged;
                return retryable(request.AssetPath, request.Labels) ? TagAttemptResult.RetryableFailure : TagAttemptResult.PermanentFailure;
            });
        }

        private enum TagAttemptResult
        {
            Tagged,
            PermanentFailure,
            RetryableFailure
        }

        private readonly struct TagRequest
        {
            public TagRequest(string assetPath, string[] labels)
            {
                AssetPath = assetPath;
                Labels = labels;
            }

            public string AssetPath { get; }
            public string[] Labels { get; }
            public string Key => $"{AssetPath}|{string.Join("|", Labels)}";
        }
    }
}
