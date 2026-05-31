// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System;
using UnityEditor;
using UnityEngine;

namespace Greybox.Editor.Generation
{
    public static class MaterialAssetExporter
    {
        public static string[] ExportMaterialAssets(Material[] materials, string sourcePath, string projectId)
        {
            if (materials == null || materials.Length == 0) return Array.Empty<string>();
            string[] paths = GeneratedMaterialPaths(materials, sourcePath, projectId);
            for (int index = 0; index < materials.Length; index++)
            {
                Material material = materials[index];
                if (!material) continue;
                string assetPath = paths[index];
                GreyboxGeneratedAssetPaths.EnsureFolder(System.IO.Path.GetDirectoryName(assetPath)?.Replace('\\', '/') ?? GreyboxGeneratedAssetPaths.Root);

                var existing = AssetDatabase.LoadAssetAtPath<Material>(assetPath);
                if (existing)
                {
                    EditorUtility.CopySerialized(material, existing);
                    existing.name = ExportMaterialName(material, index);
                    EditorUtility.SetDirty(existing);
                    AssetDatabase.SaveAssetIfDirty(existing);
                    continue;
                }

                Material copy = UnityEngine.Object.Instantiate(material);
                copy.name = ExportMaterialName(material, index);
                AssetDatabase.CreateAsset(copy, assetPath);
            }
            AssetDatabase.SaveAssets();
            return paths;
        }

        public static string[] GeneratedMaterialPaths(Material[] materials, string sourcePath, string projectId)
        {
            if (materials == null || materials.Length == 0) return Array.Empty<string>();
            var paths = new string[materials.Length];
            for (int index = 0; index < materials.Length; index++)
            {
                paths[index] = materials[index] ? GeneratedMaterialPath(sourcePath, projectId, index) : "";
            }
            return paths;
        }

        public static string GeneratedMaterialPath(string sourcePath, string projectId, int index)
        {
            string projectSlug = GreyboxGeneratedAssetPaths.ProjectSlug(projectId);
            string fileName = GreyboxGeneratedAssetPaths.SourceAssetStem(sourcePath);
            if (string.IsNullOrWhiteSpace(fileName)) fileName = "art-bible";
            int materialNumber = Math.Max(0, index) + 1;
            return $"{GreyboxGeneratedAssetPaths.Root}/{projectSlug}/{GreyboxGeneratedAssetPaths.ArtBibleMaterialsFolder}/{fileName}-material-{materialNumber:00}.mat";
        }

        private static string ExportMaterialName(Material material, int index)
        {
            int materialNumber = Math.Max(0, index) + 1;
            return MaterialBuilder.SafeMaterialName(material ? material.name : "", $"Greybox Material {materialNumber:00}");
        }
    }
}
