// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using Greybox.Editor.Generation;
using Greybox.Editor.Windows;
using Greybox.Runtime;
using UnityEditor.AssetImporters;
using UnityEngine;

namespace Greybox.Editor.Importers
{
    [ScriptedImporter(1, "design")]
    public sealed class ArtBibleImporter : ScriptedImporter
    {
        public const int MaxArtBibleMarkdownImportLength = 4 * 1024 * 1024;

        public readonly struct ImportObjects
        {
            public ImportObjects(GreyboxArtBiblePalette palette, Material[] materials, GreyboxArtifact artifact)
            {
                Palette = palette;
                Materials = materials;
                Artifact = artifact;
            }

            public GreyboxArtBiblePalette Palette { get; }
            public Material[] Materials { get; }
            public GreyboxArtifact Artifact { get; }
        }

        public static ImportObjects BuildImportObjects(string markdown, string assetPath, bool watermarked)
        {
            if (!TryValidateMarkdown(markdown, out string error)) throw new System.ArgumentException(error);
            return BuildImportObjectsUnchecked(markdown, assetPath, watermarked);
        }

        public static bool TryBuildImportObjects(string markdown, string assetPath, bool watermarked, out ImportObjects importObjects, out string error)
        {
            importObjects = default;
            if (!TryValidateMarkdown(markdown, out error)) return false;
            importObjects = BuildImportObjectsUnchecked(markdown, assetPath, watermarked);
            return true;
        }

        private static ImportObjects BuildImportObjectsUnchecked(string markdown, string assetPath, bool watermarked)
        {
            GreyboxArtBiblePalette palette = ScriptableObjectBuilder.BuildArtBiblePalette(markdown);
            palette.name = "Greybox Art Bible Palette";
            palette.Watermarked = watermarked;
            Material[] materials = MaterialBuilder.BuildFromPalette(palette);
            GreyboxArtifact artifact = GreyboxImportArtifactBuilder.Build(
                GreyboxArtifactKind.ArtBible,
                assetPath,
                markdown,
                "Greybox Art Bible",
                watermarked
            );
            palette.GeneratorCredit = artifact.GeneratorCredit ?? "";
            palette.HumanDesignerCredit = artifact.HumanDesignerCredit ?? "";
            palette.AiDisclosure = artifact.AiDisclosure ?? "";
            artifact.Watermarked = watermarked;

            return new ImportObjects(palette, materials, artifact);
        }

        private static bool TryValidateMarkdown(string markdown, out string error)
        {
            error = "";
            if ((markdown ?? "").Length <= MaxArtBibleMarkdownImportLength) return true;
            error = $"Greybox Art Bible import failed: file exceeds the {MaxArtBibleMarkdownImportLength} character safety limit.";
            return false;
        }

        public static void RecordGeneratedAssetPaths(GreyboxArtBiblePalette palette, string palettePath, string[] materialPaths)
        {
            if (!palette) return;
            palette.StandalonePalettePath = palettePath ?? "";
            palette.MaterialAssetPaths.Clear();
            foreach (string materialPath in materialPaths ?? System.Array.Empty<string>())
            {
                if (!string.IsNullOrWhiteSpace(materialPath)) palette.MaterialAssetPaths.Add(materialPath);
            }
        }

        public override void OnImportAsset(AssetImportContext ctx)
        {
            if (!GreyboxLicenseState.TryAuthorizeImport(out var capabilities, out string importMessage))
            {
                ctx.LogImportError(importMessage);
                return;
            }
            if (!GreyboxImportFile.TryReadText(ctx.assetPath, MaxArtBibleMarkdownImportLength, "Art Bible", out string markdown, out string readError))
            {
                ctx.LogImportError(readError);
                return;
            }
            bool watermarked = capabilities.HasWatermark;
            if (!TryBuildImportObjects(markdown, ctx.assetPath, watermarked, out ImportObjects importObjects, out string error))
            {
                ctx.LogImportError(error);
                return;
            }
            GreyboxArtBiblePalette palette = importObjects.Palette;
            Material[] materials = importObjects.Materials;
            GreyboxArtifact artifact = importObjects.Artifact;

            ctx.AddObjectToAsset("palette", palette);
            for (int index = 0; index < materials.Length; index++)
            {
                ctx.AddObjectToAsset($"material-{index + 1}", materials[index]);
            }

            ctx.AddObjectToAsset("artifact", artifact);
            ctx.SetMainObject(palette);
            var config = GreyboxSettings.LoadConfig();
            string projectId = config ? config.ProjectId : "";
            string[] materialPaths = MaterialAssetExporter.ExportMaterialAssets(materials, ctx.assetPath, projectId);
            string expectedPalettePath = ArtBibleAssetExporter.GeneratedPalettePath(ctx.assetPath, projectId);
            RecordGeneratedAssetPaths(palette, expectedPalettePath, materialPaths);
            string palettePath = ArtBibleAssetExporter.ExportPaletteAsset(palette, ctx.assetPath, projectId);
            string receiptPath = GreyboxImportReceiptExporter.ExportReceipt(
                artifact,
                palette,
                GreyboxArtifactKind.ArtBible,
                ctx.assetPath,
                projectId,
                expectedPalettePath,
                palettePath,
                GeneratedReceiptAssetPaths(palettePath, materialPaths));
            if (!string.IsNullOrWhiteSpace(palettePath)) AddressablesTagger.TagDeferred(palettePath, GreyboxArtifactKind.ArtBible);
            foreach (string materialPath in materialPaths)
            {
                if (!string.IsNullOrWhiteSpace(materialPath)) AddressablesTagger.TagDeferred(materialPath, GreyboxArtifactKind.ArtBible);
            }
            if (!string.IsNullOrWhiteSpace(receiptPath)) AddressablesTagger.TagDeferred(receiptPath, GreyboxArtifactKind.ArtBible);
            AddressablesTagger.TagDeferred(ctx.assetPath, GreyboxArtifactKind.ArtBible);
        }

        private static string[] GeneratedReceiptAssetPaths(string palettePath, string[] materialPaths)
        {
            var paths = new System.Collections.Generic.List<string>();
            if (!string.IsNullOrWhiteSpace(palettePath)) paths.Add(palettePath);
            foreach (string materialPath in materialPaths ?? System.Array.Empty<string>())
            {
                if (!string.IsNullOrWhiteSpace(materialPath)) paths.Add(materialPath);
            }
            return paths.ToArray();
        }
    }
}
