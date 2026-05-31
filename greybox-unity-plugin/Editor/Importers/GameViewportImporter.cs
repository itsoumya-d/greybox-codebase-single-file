// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using Greybox.Editor.Generation;
using Greybox.Editor.Windows;
using Greybox.Runtime;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEditor.AssetImporters;
using UnityEngine;

namespace Greybox.Editor.Importers
{
    [ScriptedImporter(1, "gameview")]
    public sealed class GameViewportImporter : ScriptedImporter
    {
        public readonly struct ImportObjects
        {
            public ImportObjects(GameObject root, GreyboxArtifact artifact)
            {
                Root = root;
                Artifact = artifact;
            }

            public GameObject Root { get; }
            public GreyboxArtifact Artifact { get; }
        }

        public static ImportObjects BuildImportObjects(string json, string assetPath, bool watermarked)
        {
            JObject document = GreyboxImportJson.ParseObjectOrThrow(json, "Game Viewport");
            return BuildImportObjects(document, json, assetPath, watermarked);
        }

        public static bool TryBuildImportObjects(string json, string assetPath, bool watermarked, out ImportObjects importObjects, out string error)
        {
            importObjects = default;
            if (!GreyboxImportJson.TryParseObject(json, "Game Viewport", out JObject document, out error)) return false;
            importObjects = BuildImportObjects(document, json, assetPath, watermarked);
            return true;
        }

        private static ImportObjects BuildImportObjects(JObject document, string json, string assetPath, bool watermarked)
        {
            GameObject root = PrefabBuilder.BuildFromGameViewport(document, assetPath);
            GreyboxWatermarkBuilder.Apply(root, watermarked);

            GreyboxArtifact artifact = GreyboxImportArtifactBuilder.Build(
                GreyboxArtifactKind.GameViewport,
                assetPath,
                json,
                $"{root.name} Artifact",
                watermarked
            );
            artifact.Watermarked = watermarked;
            GreyboxImportArtifactBuilder.AttachToRoot(root, artifact);

            return new ImportObjects(root, artifact);
        }

        public override void OnImportAsset(AssetImportContext ctx)
        {
            if (!GreyboxLicenseState.TryAuthorizeImport(out var capabilities, out string importMessage))
            {
                ctx.LogImportError(importMessage);
                return;
            }
            if (!GreyboxImportFile.TryReadText(ctx.assetPath, GreyboxImportJson.MaxImportJsonLength, "Game Viewport", out string json, out string readError))
            {
                ctx.LogImportError(readError);
                return;
            }
            bool watermarked = capabilities.HasWatermark;
            if (!TryBuildImportObjects(json, ctx.assetPath, watermarked, out ImportObjects importObjects, out string error))
            {
                ctx.LogImportError(error);
                return;
            }

            ctx.AddObjectToAsset("prefab-root", importObjects.Root);
            ctx.AddObjectToAsset("artifact", importObjects.Artifact);
            var materials = PrefabBuilder.CollectGeneratedMaterials(importObjects.Root);
            for (int index = 0; index < materials.Length; index++)
            {
                ctx.AddObjectToAsset($"material-{index + 1}", materials[index]);
            }
            ctx.SetMainObject(importObjects.Root);
            var config = GreyboxSettings.LoadConfig();
            string projectId = config ? config.ProjectId : "";
            GreyboxImportReceiptExporter.RecordExpectedReceipt(importObjects.Root, importObjects.Artifact, GreyboxArtifactKind.GameViewport, ctx.assetPath, projectId);
            string canonicalPrefabPath = PrefabAssetExporter.GeneratedPrefabPath(GreyboxArtifactKind.GameViewport, ctx.assetPath, projectId);
            string prefabPath = PrefabAssetExporter.ExportGameViewportPrefab(importObjects.Root, ctx.assetPath, projectId);
            string receiptPath = GreyboxImportReceiptExporter.ExportReceipt(
                importObjects.Artifact,
                importObjects.Root,
                GreyboxArtifactKind.GameViewport,
                ctx.assetPath,
                projectId,
                canonicalPrefabPath,
                prefabPath,
                new[] { canonicalPrefabPath, prefabPath });
            if (!string.IsNullOrWhiteSpace(prefabPath)) AddressablesTagger.TagDeferred(prefabPath, GreyboxArtifactKind.GameViewport);
            if (!string.IsNullOrWhiteSpace(receiptPath)) AddressablesTagger.TagDeferred(receiptPath, GreyboxArtifactKind.GameViewport);
            AddressablesTagger.TagDeferred(ctx.assetPath, GreyboxArtifactKind.GameViewport);
        }
    }
}
