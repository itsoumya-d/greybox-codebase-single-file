// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using Greybox.Runtime;
using Greybox.Editor.Generation;
using Greybox.Editor.Windows;
using UnityEditor.AssetImporters;
using UnityEngine;
using UnityEngine.UIElements;

namespace Greybox.Editor.Importers
{
    [ScriptedImporter(1, "gbhud")]
    public sealed class HudLayoutImporter : ScriptedImporter
    {
        public const int MaxHudHtmlImportLength = 4 * 1024 * 1024;

        public readonly struct ImportObjects
        {
            public ImportObjects(GameObject root, GreyboxArtifact artifact, PanelSettings panelSettings)
            {
                Root = root;
                Artifact = artifact;
                PanelSettings = panelSettings;
            }

            public GameObject Root { get; }
            public GreyboxArtifact Artifact { get; }
            public PanelSettings PanelSettings { get; }
        }

        public static ImportObjects BuildImportObjects(string html, string assetPath, bool watermarked)
        {
            if (!TryValidateHtml(html, out string error)) throw new System.ArgumentException(error);
            return BuildImportObjectsUnchecked(html, assetPath, watermarked);
        }

        public static bool TryBuildImportObjects(string html, string assetPath, bool watermarked, out ImportObjects importObjects, out string error)
        {
            importObjects = default;
            if (!TryValidateHtml(html, out error)) return false;
            importObjects = BuildImportObjectsUnchecked(html, assetPath, watermarked);
            return true;
        }

        private static ImportObjects BuildImportObjectsUnchecked(string html, string assetPath, bool watermarked)
        {
            HudLayoutBuilder.BuildResult build = HudLayoutBuilder.BuildHudLayout(html, assetPath);
            GameObject root = build.Root;
            GreyboxWatermarkBuilder.Apply(root, watermarked);
            GreyboxArtifact artifact = GreyboxImportArtifactBuilder.Build(
                GreyboxArtifactKind.HudLayout,
                assetPath,
                html,
                $"{root.name} Artifact",
                watermarked
            );
            artifact.Watermarked = watermarked;
            GreyboxImportArtifactBuilder.AttachToRoot(root, artifact);

            return new ImportObjects(root, artifact, build.PanelSettings);
        }

        private static bool TryValidateHtml(string html, out string error)
        {
            error = "";
            if ((html ?? "").Length <= MaxHudHtmlImportLength) return true;
            error = $"Greybox HUD import failed: file exceeds the {MaxHudHtmlImportLength} character safety limit.";
            return false;
        }

        public override void OnImportAsset(AssetImportContext ctx)
        {
            if (!GreyboxLicenseState.TryAuthorizeImport(out var capabilities, out string importMessage))
            {
                ctx.LogImportError(importMessage);
                return;
            }
            if (!GreyboxImportFile.TryReadText(ctx.assetPath, MaxHudHtmlImportLength, "HUD", out string html, out string readError))
            {
                ctx.LogImportError(readError);
                return;
            }
            bool watermarked = capabilities.HasWatermark;
            if (!TryBuildImportObjects(html, ctx.assetPath, watermarked, out ImportObjects importObjects, out string error))
            {
                ctx.LogImportError(error);
                return;
            }
            GameObject root = importObjects.Root;
            GreyboxArtifact artifact = importObjects.Artifact;

            if (importObjects.PanelSettings != null)
            {
                ctx.AddObjectToAsset("hud-panel-settings", importObjects.PanelSettings);
            }
            var iconTextures = HudLayoutBuilder.CollectGeneratedIconTextures(root);
            for (int index = 0; index < iconTextures.Length; index++)
            {
                ctx.AddObjectToAsset($"hud-icon-texture-{index + 1}", iconTextures[index]);
            }
            var iconSprites = HudLayoutBuilder.CollectGeneratedIconSprites(root);
            for (int index = 0; index < iconSprites.Length; index++)
            {
                ctx.AddObjectToAsset($"hud-icon-sprite-{index + 1}", iconSprites[index]);
            }
            ctx.AddObjectToAsset("hud-root", root);
            ctx.AddObjectToAsset("artifact", artifact);
            ctx.SetMainObject(root);
            var config = GreyboxSettings.LoadConfig();
            string projectId = config ? config.ProjectId : "";
            GreyboxImportReceiptExporter.RecordExpectedReceipt(root, artifact, GreyboxArtifactKind.HudLayout, ctx.assetPath, projectId);
            string canonicalPrefabPath = PrefabAssetExporter.GeneratedPrefabPath(GreyboxArtifactKind.HudLayout, ctx.assetPath, projectId);
            string prefabPath = PrefabAssetExporter.ExportHudLayoutPrefab(root, ctx.assetPath, projectId);
            string receiptPath = GreyboxImportReceiptExporter.ExportReceipt(
                artifact,
                root,
                GreyboxArtifactKind.HudLayout,
                ctx.assetPath,
                projectId,
                canonicalPrefabPath,
                prefabPath,
                new[] { canonicalPrefabPath, prefabPath });
            if (!string.IsNullOrWhiteSpace(prefabPath)) AddressablesTagger.TagDeferred(prefabPath, GreyboxArtifactKind.HudLayout);
            if (!string.IsNullOrWhiteSpace(receiptPath)) AddressablesTagger.TagDeferred(receiptPath, GreyboxArtifactKind.HudLayout);
            AddressablesTagger.TagDeferred(ctx.assetPath, GreyboxArtifactKind.HudLayout);
        }
    }
}
