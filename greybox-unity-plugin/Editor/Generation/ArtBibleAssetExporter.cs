// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using Greybox.Runtime;
using UnityEditor;

namespace Greybox.Editor.Generation
{
    public static class ArtBibleAssetExporter
    {
        public static string ExportPaletteAsset(GreyboxArtBiblePalette palette, string sourcePath, string projectId)
        {
            if (!palette) return "";
            string assetPath = GeneratedPalettePath(sourcePath, projectId);
            GreyboxGeneratedAssetPaths.EnsureFolder(System.IO.Path.GetDirectoryName(assetPath)?.Replace('\\', '/') ?? GreyboxGeneratedAssetPaths.Root);

            var existing = AssetDatabase.LoadAssetAtPath<GreyboxArtBiblePalette>(assetPath);
            if (existing)
            {
                EditorUtility.CopySerialized(palette, existing);
                existing.name = ExportPaletteName(palette);
                EditorUtility.SetDirty(existing);
                AssetDatabase.SaveAssetIfDirty(existing);
                return assetPath;
            }

            GreyboxArtBiblePalette copy = UnityEngine.Object.Instantiate(palette);
            copy.name = ExportPaletteName(palette);
            AssetDatabase.CreateAsset(copy, assetPath);
            AssetDatabase.SaveAssets();
            return assetPath;
        }

        public static string GeneratedPalettePath(string sourcePath, string projectId)
        {
            string projectSlug = GreyboxGeneratedAssetPaths.ProjectSlug(projectId);
            string fileName = GreyboxGeneratedAssetPaths.SourceAssetStem(sourcePath);
            if (string.IsNullOrWhiteSpace(fileName)) fileName = "art-bible";
            return $"{GreyboxGeneratedAssetPaths.Root}/{projectSlug}/{fileName}-palette.asset";
        }

        private static string ExportPaletteName(GreyboxArtBiblePalette palette)
        {
            return MaterialBuilder.SafeMaterialName(palette ? palette.name : "", "Greybox Art Bible Palette");
        }
    }
}
