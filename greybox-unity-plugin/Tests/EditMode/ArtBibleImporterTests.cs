// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System.Security.Cryptography;
using System.Text;
using Greybox.Editor.Generation;
using Greybox.Editor.Importers;
using Greybox.Runtime;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;

namespace Greybox.Tests.EditMode
{
    public sealed class ArtBibleImporterTests
    {
        [Test]
        public void BuildsRuntimePaletteFromDesignMarkdown()
        {
            var palette = ScriptableObjectBuilder.BuildArtBiblePalette("- Spark: #FF6B35 metallic=0.2 smoothness=0.75 emission=#331100 pipeline=urp\n- Ink: #1A1A1F roughness=0.8 pipeline=hdrp\n- Focus: #3CC2E0 pipeline=built-in\n");
            try
            {
                Assert.AreEqual(3, palette.Colors.Count);
                Assert.AreEqual("Spark", palette.ColorNames[0]);
                Assert.AreEqual("#FF6B35", palette.HexColors[0]);
                Assert.AreEqual("#FF6B35", ColorUtility.ToHtmlStringRGB(palette.Colors[0]).Insert(0, "#"));
                Assert.AreEqual(0.2f, palette.MetallicValues[0], 0.0001f);
                Assert.AreEqual(0.75f, palette.SmoothnessValues[0], 0.0001f);
                Assert.True(palette.EmissionEnabled[0]);
                Assert.AreEqual("#331100", ColorUtility.ToHtmlStringRGB(palette.EmissionColors[0]).Insert(0, "#"));
                Assert.AreEqual("universal", palette.RenderPipelineHints[0]);
                Assert.AreEqual("hdrp", palette.RenderPipelineHints[1]);
                Assert.AreEqual("built-in", palette.RenderPipelineHints[2]);
                Assert.AreEqual(0.2f, palette.SmoothnessValues[1], 0.0001f);
            }
            finally
            {
                Object.DestroyImmediate(palette);
            }
        }

        [Test]
        public void BuildsBoundedPaletteFromMultiSwatchDesignLines()
        {
            var builder = new StringBuilder();
            builder.AppendLine("- Team Palette: #101010 / #202020 emission=#303030 metallic=0.1 smoothness=0.9 pipeline=urp");
            builder.AppendLine("- Team Palette: #404040");
            for (int index = 0; index < 80; index++)
            {
                builder.AppendLine($"- Overflow {index}: #{index % 10}{index % 10}{index % 10}{index % 10}{index % 10}{index % 10}");
            }

            var palette = ScriptableObjectBuilder.BuildArtBiblePalette(builder.ToString());
            try
            {
                Assert.AreEqual(ScriptableObjectBuilder.MaxArtBiblePaletteColors, palette.Colors.Count);
                Assert.AreEqual("Team Palette", palette.ColorNames[0]);
                Assert.AreEqual("Team Palette 2", palette.ColorNames[1]);
                Assert.AreEqual("Team Palette 3", palette.ColorNames[2]);
                Assert.AreEqual("#101010", palette.HexColors[0]);
                Assert.AreEqual("#202020", palette.HexColors[1]);
                Assert.AreEqual("#404040", palette.HexColors[2]);
                CollectionAssert.DoesNotContain(palette.HexColors, "#303030");
                Assert.True(palette.EmissionEnabled[0]);
                Assert.True(palette.EmissionEnabled[1]);
                Assert.AreEqual("#303030", ColorUtility.ToHtmlStringRGB(palette.EmissionColors[0]).Insert(0, "#"));
                Assert.AreEqual(0.1f, palette.MetallicValues[1], 0.0001f);
                Assert.AreEqual(0.9f, palette.SmoothnessValues[1], 0.0001f);
                Assert.AreEqual("universal", palette.RenderPipelineHints[1]);
            }
            finally
            {
                Object.DestroyImmediate(palette);
            }
        }

        [Test]
        public void BoundsStoredArtBibleSourceMarkdown()
        {
            var builder = new StringBuilder();
            builder.AppendLine("- Spark: #FF6B35");
            builder.Append(new string('A', ScriptableObjectBuilder.MaxArtBibleSourceMarkdownLength + 1024));

            var palette = ScriptableObjectBuilder.BuildArtBiblePalette(builder.ToString());
            try
            {
                Assert.AreEqual(1, palette.Colors.Count);
                Assert.AreEqual("#FF6B35", palette.HexColors[0]);
                Assert.AreEqual(ScriptableObjectBuilder.MaxArtBibleSourceMarkdownLength, palette.SourceMarkdown.Length);
                StringAssert.StartsWith("- Spark: #FF6B35", palette.SourceMarkdown);
            }
            finally
            {
                Object.DestroyImmediate(palette);
            }
        }

        [Test]
        public void SanitizesAndBoundsPaletteLabelsBeforeMaterialGeneration()
        {
            string longName = new string('A', ScriptableObjectBuilder.MaxArtBibleColorNameLength + 24);
            var palette = ScriptableObjectBuilder.BuildArtBiblePalette($"- ../Unsafe/Label\tName?: #ABCDEF\n- {longName}: #123456\n- \u0001\u0002: #654321\n");
            var materials = MaterialBuilder.BuildFromPalette(palette);
            try
            {
                Assert.AreEqual("Unsafe_Label Name", palette.ColorNames[0]);
                Assert.AreEqual(ScriptableObjectBuilder.MaxArtBibleColorNameLength, palette.ColorNames[1].Length);
                Assert.AreEqual("Color", palette.ColorNames[2]);
                Assert.AreEqual("Greybox Unsafe_Label Name", materials[0].name);
                Assert.LessOrEqual(materials[1].name.Length, "Greybox ".Length + ScriptableObjectBuilder.MaxArtBibleColorNameLength);
            }
            finally
            {
                foreach (var material in materials) Object.DestroyImmediate(material);
                Object.DestroyImmediate(palette);
            }
        }

        [Test]
        public void BuildsNamedMaterialsFromPalette()
        {
            var palette = ScriptableObjectBuilder.BuildArtBiblePalette("- Spark Button: #FF6B35 metallic=0.2 smoothness=0.75 emission=#331100\n- Focus Cyan: #3CC2E0\n");
            var materials = MaterialBuilder.BuildFromPalette(palette);
            try
            {
                Assert.AreEqual(2, materials.Length);
                Assert.AreEqual("Greybox Spark Button", materials[0].name);
                Assert.AreEqual(palette.Colors[0], materials[0].color);
                if (materials[0].HasProperty("_Metallic")) Assert.AreEqual(0.2f, materials[0].GetFloat("_Metallic"), 0.0001f);
                if (materials[0].HasProperty("_Smoothness")) Assert.AreEqual(0.75f, materials[0].GetFloat("_Smoothness"), 0.0001f);
                if (materials[0].HasProperty("_Glossiness")) Assert.AreEqual(0.75f, materials[0].GetFloat("_Glossiness"), 0.0001f);
                if (materials[0].HasProperty("_EmissionColor"))
                {
                    Assert.AreEqual("#331100", ColorUtility.ToHtmlStringRGB(materials[0].GetColor("_EmissionColor")).Insert(0, "#"));
                }
            }
            finally
            {
                foreach (var material in materials) Object.DestroyImmediate(material);
                Object.DestroyImmediate(palette);
            }
        }

        [Test]
        public void RuntimePaletteLooksUpColorsAndMaterialPathsByNameOrHex()
        {
            var palette = ScriptableObjectBuilder.BuildArtBiblePalette("- Platform Moss: #2ECC71\n- Hazard Crit: #E94B3C\n");
            palette.MaterialAssetPaths.Add("Assets/Greybox/Generated/local/Materials/design-material-01.mat");
            palette.MaterialAssetPaths.Add("Assets/Greybox/Generated/local/Materials/design-material-02.mat");

            try
            {
                Assert.AreEqual(2, palette.ColorCount);
                Assert.AreEqual(0, palette.FindColorIndex("platform moss"));
                Assert.AreEqual(1, palette.FindColorIndex("#E94B3C"));
                Assert.True(palette.TryGetColor("Platform-Moss", out Color platform));
                Assert.AreEqual("#2ECC71", ColorUtility.ToHtmlStringRGB(platform).Insert(0, "#"));
                Assert.AreEqual("#E94B3C", ColorUtility.ToHtmlStringRGB(palette.ColorOrDefault("Hazard Crit", Color.black)).Insert(0, "#"));
                Assert.True(palette.TryGetMaterialAssetPath("Hazard Crit", out string materialPath));
                Assert.AreEqual("Assets/Greybox/Generated/local/Materials/design-material-02.mat", materialPath);
                Assert.False(palette.TryGetMaterialAssetPath("Missing", out _));
            }
            finally
            {
                Object.DestroyImmediate(palette);
            }
        }

        [Test]
        public void SanitizesDirectMaterialNamesForGeneratedUnityAssets()
        {
            var unsafeName = MaterialBuilder.Colored(Color.white, "../Boss\tMat?:<>|*");
            var blankName = MaterialBuilder.Colored(Color.white, " \n\t ");
            var longName = MaterialBuilder.Styled(Color.white, "Greybox " + new string('M', MaterialBuilder.MaxMaterialNameLength + 24), 0f, 0.5f, false, Color.black);
            try
            {
                Assert.AreEqual("Boss Mat", unsafeName.name);
                Assert.AreEqual("Greybox Material", blankName.name);
                Assert.AreEqual(MaterialBuilder.MaxMaterialNameLength, longName.name.Length);
                StringAssert.StartsWith("Greybox ", longName.name);
            }
            finally
            {
                Object.DestroyImmediate(unsafeName);
                Object.DestroyImmediate(blankName);
                Object.DestroyImmediate(longName);
            }
        }

        [Test]
        public void ChoosesRenderPipelineShaderCandidatesForArtBibleMaterials()
        {
            CollectionAssert.AreEqual(
                new[] { "Universal Render Pipeline/Lit", "Universal Render Pipeline/Simple Lit", "Standard", "Sprites/Default" },
                MaterialBuilder.PreferredShaderNamesForPipeline(MaterialBuilder.RenderPipelineKind.Universal));

            CollectionAssert.AreEqual(
                new[] { "HDRP/Lit", "HDRenderPipeline/Lit", "Standard", "Sprites/Default" },
                MaterialBuilder.PreferredShaderNamesForPipeline(MaterialBuilder.RenderPipelineKind.HighDefinition));

            CollectionAssert.AreEqual(
                new[] { "Standard", "Universal Render Pipeline/Lit", "HDRP/Lit", "Sprites/Default" },
                MaterialBuilder.PreferredShaderNamesForPipeline(MaterialBuilder.RenderPipelineKind.BuiltIn));

            Assert.AreEqual(MaterialBuilder.RenderPipelineKind.Universal, MaterialBuilder.PipelineHintToKind("urp"));
            Assert.AreEqual(MaterialBuilder.RenderPipelineKind.HighDefinition, MaterialBuilder.PipelineHintToKind("HDRP"));
            Assert.AreEqual(MaterialBuilder.RenderPipelineKind.BuiltIn, MaterialBuilder.PipelineHintToKind("built-in"));
            Assert.AreEqual(MaterialBuilder.RenderPipelineKind.BuiltIn, MaterialBuilder.PipelineHintToKind("custom", MaterialBuilder.RenderPipelineKind.BuiltIn));
        }

        [Test]
        public void BuildsPaletteMaterialsAndArtifactMetadataFromDesignMarkdown()
        {
            const string markdown = "Generator credit: Greybox + Noor Designer. AI-assisted, human-directed.\n\n- Spark: #FF6B35\n- Ink: #1A1A1F\n";
            var importObjects = ArtBibleImporter.BuildImportObjects(markdown, "Assets/Greybox/DESIGN.design", false);
            try
            {
                Assert.AreEqual("Greybox Art Bible Palette", importObjects.Palette.name);
                Assert.AreEqual(2, importObjects.Palette.Colors.Count);
                Assert.AreEqual(markdown, importObjects.Palette.SourceMarkdown);
                Assert.AreEqual("Greybox + Noor Designer", importObjects.Palette.GeneratorCredit);
                Assert.AreEqual("Noor Designer", importObjects.Palette.HumanDesignerCredit);
                Assert.AreEqual("AI-assisted", importObjects.Palette.AiDisclosure);
                Assert.False(importObjects.Palette.Watermarked);
                Assert.AreEqual(2, importObjects.Materials.Length);
                Assert.AreEqual("Greybox Spark", importObjects.Materials[0].name);
                Assert.AreEqual("#FF6B35", ColorUtility.ToHtmlStringRGB(importObjects.Materials[0].color).Insert(0, "#"));

                Assert.AreEqual("Greybox Art Bible", importObjects.Artifact.name);
                Assert.AreEqual(Sha256("ArtBible:Assets/Greybox/DESIGN.design"), importObjects.Artifact.ArtifactId);
                Assert.AreEqual(GreyboxArtifactKind.ArtBible, importObjects.Artifact.Kind);
                Assert.AreEqual("Assets/Greybox/DESIGN.design", importObjects.Artifact.SourcePath);
                Assert.AreEqual(markdown, importObjects.Artifact.SourceJson);
                Assert.AreEqual(Sha256(markdown), importObjects.Artifact.SourceHash);
                Assert.AreEqual("Greybox + Noor Designer", importObjects.Artifact.GeneratorCredit);
                Assert.AreEqual("Noor Designer", importObjects.Artifact.HumanDesignerCredit);
                Assert.AreEqual("AI-assisted", importObjects.Artifact.AiDisclosure);
                Assert.False(importObjects.Artifact.Watermarked);
            }
            finally
            {
                foreach (var material in importObjects.Materials) Object.DestroyImmediate(material);
                Object.DestroyImmediate(importObjects.Palette);
                Object.DestroyImmediate(importObjects.Artifact);
            }
        }

        [Test]
        public void TryBuildRejectsOversizedArtBibleMarkdownWithoutThrowing()
        {
            string markdown = "- Spark: #FF6B35\n" + new string('A', ArtBibleImporter.MaxArtBibleMarkdownImportLength + 1);

            bool imported = ArtBibleImporter.TryBuildImportObjects(
                markdown,
                "Assets/Greybox/DESIGN.design",
                false,
                out var importObjects,
                out string error
            );

            Assert.False(imported);
            Assert.IsNull(importObjects.Palette);
            Assert.IsNull(importObjects.Artifact);
            Assert.IsNull(importObjects.Materials);
            StringAssert.Contains("character safety limit", error);
        }

        [Test]
        public void AppliesFreePersonalWatermarkToArtBiblePaletteAndArtifact()
        {
            const string markdown = "- Spark: #FF6B35\n";
            var importObjects = ArtBibleImporter.BuildImportObjects(markdown, "Assets/Greybox/DESIGN.design", true);
            try
            {
                Assert.True(importObjects.Palette.Watermarked);
                Assert.True(importObjects.Artifact.Watermarked);
            }
            finally
            {
                foreach (var material in importObjects.Materials) Object.DestroyImmediate(material);
                Object.DestroyImmediate(importObjects.Palette);
                Object.DestroyImmediate(importObjects.Artifact);
            }
        }

        [Test]
        public void BuildsStableStandalonePaletteAssetPath()
        {
            Assert.AreEqual(
                "Assets/Greybox/Generated/project-a/design-palette.asset",
                ArtBibleAssetExporter.GeneratedPalettePath("Assets/GreyboxGenerated/Artifacts/DESIGN.design", "Project A"));

            Assert.AreEqual(
                "Assets/Greybox/Generated/project-a/world-design-palette.asset",
                ArtBibleAssetExporter.GeneratedPalettePath("Assets/GreyboxGenerated/Artifacts/world/DESIGN.design", "Project A"));
        }

        [Test]
        public void BuildsStableStandaloneMaterialAssetPaths()
        {
            Assert.AreEqual(
                "Assets/Greybox/Generated/project-a/Materials/design-material-01.mat",
                MaterialAssetExporter.GeneratedMaterialPath("Assets/GreyboxGenerated/Artifacts/DESIGN.design", "Project A", 0));

            Assert.AreEqual(
                "Assets/Greybox/Generated/local/Materials/world-design-material-02.mat",
                MaterialAssetExporter.GeneratedMaterialPath("Assets/GreyboxGenerated/Artifacts/world/DESIGN.design", "", 1));
        }

        [Test]
        public void GeneratedArtBibleAssetPathsRejectTraversalLikeSegments()
        {
            const string sourcePath = "Assets/GreyboxGenerated/Artifacts/../world/../../DESIGN.design";

            Assert.AreEqual(
                "Assets/Greybox/Generated/local/world-design-palette.asset",
                ArtBibleAssetExporter.GeneratedPalettePath(sourcePath, "."));
            Assert.AreEqual(
                "Assets/Greybox/Generated/local/Materials/world-design-material-01.mat",
                MaterialAssetExporter.GeneratedMaterialPath(sourcePath, ".", 0));
            Assert.AreEqual(
                "Assets/Greybox/Generated/local/world-design-palette.asset",
                ArtBibleAssetExporter.GeneratedPalettePath("Assets/GreyboxGenerated/Artifacts/world/DESIGN.design", "project/42"));
            Assert.AreEqual(
                "Assets/Greybox/Generated/local/Materials/world-design-material-01.mat",
                MaterialAssetExporter.GeneratedMaterialPath("Assets/GreyboxGenerated/Artifacts/world/DESIGN.design", "https://example.test/project-42", 0));
        }

        [Test]
        public void ArtBibleImportProducesStandalonePaletteAsset()
        {
            string projectId = "palette-test-" + System.Guid.NewGuid().ToString("N");
            string sourcePath = "Assets/GreyboxGenerated/Artifacts/DESIGN.design";
            string assetPath = ArtBibleAssetExporter.GeneratedPalettePath(sourcePath, projectId);
            var palette = ScriptableObjectBuilder.BuildArtBiblePalette("- Spark: #FF6B35\n- Ink: #1A1A1F\n");
            palette.name = "Greybox Art Bible Palette";
            palette.Watermarked = true;

            try
            {
                string exportedPath = ArtBibleAssetExporter.ExportPaletteAsset(palette, sourcePath, projectId);
                var standalone = AssetDatabase.LoadAssetAtPath<GreyboxArtBiblePalette>(exportedPath);

                Assert.AreEqual(assetPath, exportedPath);
                Assert.NotNull(standalone);
                Assert.AreEqual("Greybox Art Bible Palette", standalone.name);
                Assert.AreEqual(2, standalone.Colors.Count);
                Assert.AreEqual("#FF6B35", standalone.HexColors[0]);
                Assert.True(standalone.Watermarked);
                Assert.AreEqual(palette.SourceMarkdown, standalone.SourceMarkdown);
            }
            finally
            {
                Object.DestroyImmediate(palette);
                AssetDatabase.DeleteAsset(ProjectFolder(assetPath));
            }
        }

        [Test]
        public void ReExportingPaletteAssetPreservesGuidAndUpdatesContents()
        {
            string projectId = "palette-guid-test-" + System.Guid.NewGuid().ToString("N");
            string sourcePath = "Assets/GreyboxGenerated/Artifacts/DESIGN.design";
            string assetPath = ArtBibleAssetExporter.GeneratedPalettePath(sourcePath, projectId);
            var firstPalette = ScriptableObjectBuilder.BuildArtBiblePalette("- Spark: #FF6B35\n");
            firstPalette.name = "Greybox Art Bible Palette";
            var secondPalette = ScriptableObjectBuilder.BuildArtBiblePalette("- Spark: #FF6B35\n- Ink: #1A1A1F\n- Focus: #3CC2E0\n");
            secondPalette.name = "Greybox Art Bible Palette";

            try
            {
                string firstPath = ArtBibleAssetExporter.ExportPaletteAsset(firstPalette, sourcePath, projectId);
                string firstGuid = AssetDatabase.AssetPathToGUID(firstPath);
                Assert.IsFalse(string.IsNullOrWhiteSpace(firstGuid));

                string secondPath = ArtBibleAssetExporter.ExportPaletteAsset(secondPalette, sourcePath, projectId);
                string secondGuid = AssetDatabase.AssetPathToGUID(secondPath);

                Assert.AreEqual(firstPath, secondPath);
                Assert.AreEqual(firstGuid, secondGuid, "Palette GUID must remain stable across re-exports so scene/prefab references survive re-imports.");

                var standalone = AssetDatabase.LoadAssetAtPath<GreyboxArtBiblePalette>(secondPath);
                Assert.NotNull(standalone);
                Assert.AreEqual(3, standalone.Colors.Count);
            }
            finally
            {
                Object.DestroyImmediate(firstPalette);
                Object.DestroyImmediate(secondPalette);
                AssetDatabase.DeleteAsset(ProjectFolder(assetPath));
            }
        }

        [Test]
        public void PaletteAssetExporterSanitizesStandalonePaletteNamesOnCreateAndReexport()
        {
            string projectId = "palette-name-test-" + System.Guid.NewGuid().ToString("N");
            string sourcePath = "Assets/GreyboxGenerated/Artifacts/DESIGN.design";
            string assetPath = ArtBibleAssetExporter.GeneratedPalettePath(sourcePath, projectId);
            var unsafePalette = ScriptableObjectBuilder.BuildArtBiblePalette("- Spark: #FF6B35\n");
            unsafePalette.name = "../Unsafe\tPalette?:<>|*";
            var blankPalette = ScriptableObjectBuilder.BuildArtBiblePalette("- Ink: #1A1A1F\n");
            blankPalette.name = " \n\t ";

            try
            {
                string firstPath = ArtBibleAssetExporter.ExportPaletteAsset(unsafePalette, sourcePath, projectId);
                string firstGuid = AssetDatabase.AssetPathToGUID(firstPath);
                var firstStandalone = AssetDatabase.LoadAssetAtPath<GreyboxArtBiblePalette>(firstPath);

                Assert.AreEqual(assetPath, firstPath);
                Assert.NotNull(firstStandalone);
                Assert.AreEqual("Unsafe Palette", firstStandalone.name);

                string secondPath = ArtBibleAssetExporter.ExportPaletteAsset(blankPalette, sourcePath, projectId);
                string secondGuid = AssetDatabase.AssetPathToGUID(secondPath);
                var secondStandalone = AssetDatabase.LoadAssetAtPath<GreyboxArtBiblePalette>(secondPath);

                Assert.AreEqual(firstPath, secondPath);
                Assert.AreEqual(firstGuid, secondGuid);
                Assert.NotNull(secondStandalone);
                Assert.AreEqual("Greybox Art Bible Palette", secondStandalone.name);
            }
            finally
            {
                Object.DestroyImmediate(unsafePalette);
                Object.DestroyImmediate(blankPalette);
                AssetDatabase.DeleteAsset(ProjectFolder(assetPath));
            }
        }

        [Test]
        public void ArtBibleImportProducesStandaloneMaterialAssets()
        {
            string projectId = "material-test-" + System.Guid.NewGuid().ToString("N");
            string sourcePath = "Assets/GreyboxGenerated/Artifacts/DESIGN.design";
            string firstPath = MaterialAssetExporter.GeneratedMaterialPath(sourcePath, projectId, 0);
            var palette = ScriptableObjectBuilder.BuildArtBiblePalette("- Spark: #FF6B35 metallic=0.2 smoothness=0.75\n- Ink: #1A1A1F\n");
            Material[] materials = MaterialBuilder.BuildFromPalette(palette);

            try
            {
                string[] exportedPaths = MaterialAssetExporter.ExportMaterialAssets(materials, sourcePath, projectId);
                var standalone = AssetDatabase.LoadAssetAtPath<Material>(exportedPaths[0]);

                Assert.AreEqual(2, exportedPaths.Length);
                Assert.AreEqual(firstPath, exportedPaths[0]);
                Assert.NotNull(standalone);
                Assert.AreEqual("Greybox Spark", standalone.name);
                Assert.AreEqual("#FF6B35", ColorUtility.ToHtmlStringRGB(standalone.color).Insert(0, "#"));
                if (standalone.HasProperty("_Metallic")) Assert.AreEqual(0.2f, standalone.GetFloat("_Metallic"), 0.0001f);
                if (standalone.HasProperty("_Smoothness")) Assert.AreEqual(0.75f, standalone.GetFloat("_Smoothness"), 0.0001f);
            }
            finally
            {
                foreach (var material in materials) Object.DestroyImmediate(material);
                Object.DestroyImmediate(palette);
                AssetDatabase.DeleteAsset(ProjectFolder(firstPath));
            }
        }

        [Test]
        public void ArtBiblePaletteRecordsStandaloneMaterialAssetPaths()
        {
            string projectId = "palette-material-paths-" + System.Guid.NewGuid().ToString("N");
            string sourcePath = "Assets/GreyboxGenerated/Artifacts/DESIGN.design";
            string palettePath = ArtBibleAssetExporter.GeneratedPalettePath(sourcePath, projectId);
            var importObjects = ArtBibleImporter.BuildImportObjects("- Spark: #FF6B35\n- Ink: #1A1A1F\n", sourcePath, false);

            try
            {
                string[] materialPaths = MaterialAssetExporter.ExportMaterialAssets(importObjects.Materials, sourcePath, projectId);
                ArtBibleImporter.RecordGeneratedAssetPaths(importObjects.Palette, palettePath, materialPaths);
                string exportedPalettePath = ArtBibleAssetExporter.ExportPaletteAsset(importObjects.Palette, sourcePath, projectId);
                var standalone = AssetDatabase.LoadAssetAtPath<GreyboxArtBiblePalette>(exportedPalettePath);

                Assert.AreEqual(palettePath, exportedPalettePath);
                Assert.AreEqual(palettePath, importObjects.Palette.StandalonePalettePath);
                Assert.AreEqual(2, importObjects.Palette.MaterialAssetPaths.Count);
                Assert.AreEqual(materialPaths[0], importObjects.Palette.MaterialAssetPaths[0]);
                Assert.AreEqual(materialPaths[1], importObjects.Palette.MaterialAssetPaths[1]);
                Assert.NotNull(standalone);
                Assert.AreEqual(palettePath, standalone.StandalonePalettePath);
                Assert.AreEqual(2, standalone.MaterialAssetPaths.Count);
                Assert.AreEqual(materialPaths[0], standalone.MaterialAssetPaths[0]);
                Assert.AreEqual(materialPaths[1], standalone.MaterialAssetPaths[1]);
            }
            finally
            {
                foreach (var material in importObjects.Materials) Object.DestroyImmediate(material);
                Object.DestroyImmediate(importObjects.Palette);
                Object.DestroyImmediate(importObjects.Artifact);
                AssetDatabase.DeleteAsset(ProjectFolder(palettePath));
            }
        }

        [Test]
        public void ReExportingMaterialAssetPreservesGuidAndUpdatesContents()
        {
            string projectId = "material-guid-test-" + System.Guid.NewGuid().ToString("N");
            string sourcePath = "Assets/GreyboxGenerated/Artifacts/DESIGN.design";
            string materialPath = MaterialAssetExporter.GeneratedMaterialPath(sourcePath, projectId, 0);
            var firstPalette = ScriptableObjectBuilder.BuildArtBiblePalette("- Spark: #FF6B35\n");
            var secondPalette = ScriptableObjectBuilder.BuildArtBiblePalette("- Spark Revised: #3CC2E0 smoothness=0.2\n");
            Material[] firstMaterials = MaterialBuilder.BuildFromPalette(firstPalette);
            Material[] secondMaterials = MaterialBuilder.BuildFromPalette(secondPalette);

            try
            {
                string firstPath = MaterialAssetExporter.ExportMaterialAssets(firstMaterials, sourcePath, projectId)[0];
                string firstGuid = AssetDatabase.AssetPathToGUID(firstPath);
                Assert.IsFalse(string.IsNullOrWhiteSpace(firstGuid));

                string secondPath = MaterialAssetExporter.ExportMaterialAssets(secondMaterials, sourcePath, projectId)[0];
                string secondGuid = AssetDatabase.AssetPathToGUID(secondPath);
                var standalone = AssetDatabase.LoadAssetAtPath<Material>(secondPath);

                Assert.AreEqual(firstPath, secondPath);
                Assert.AreEqual(firstGuid, secondGuid, "Material GUID must remain stable across art-bible re-exports so scene and prefab references survive refreshes.");
                Assert.NotNull(standalone);
                Assert.AreEqual("Greybox Spark Revised", standalone.name);
                Assert.AreEqual("#3CC2E0", ColorUtility.ToHtmlStringRGB(standalone.color).Insert(0, "#"));
                if (standalone.HasProperty("_Smoothness")) Assert.AreEqual(0.2f, standalone.GetFloat("_Smoothness"), 0.0001f);
            }
            finally
            {
                foreach (var material in firstMaterials) Object.DestroyImmediate(material);
                foreach (var material in secondMaterials) Object.DestroyImmediate(material);
                Object.DestroyImmediate(firstPalette);
                Object.DestroyImmediate(secondPalette);
                AssetDatabase.DeleteAsset(ProjectFolder(materialPath));
            }
        }

        [Test]
        public void MaterialAssetExporterSanitizesStandaloneMaterialNamesOnCreateAndReexport()
        {
            string projectId = "material-name-test-" + System.Guid.NewGuid().ToString("N");
            string sourcePath = "Assets/GreyboxGenerated/Artifacts/DESIGN.design";
            string materialPath = MaterialAssetExporter.GeneratedMaterialPath(sourcePath, projectId, 0);
            var unsafeMaterial = MaterialBuilder.Colored(Color.white, "Temporary");
            unsafeMaterial.name = "../Unsafe\tExport?:<>|*";
            var blankMaterial = MaterialBuilder.Colored(Color.white, "Temporary");
            blankMaterial.name = " \n\t ";

            try
            {
                string firstPath = MaterialAssetExporter.ExportMaterialAssets(new[] { unsafeMaterial }, sourcePath, projectId)[0];
                string firstGuid = AssetDatabase.AssetPathToGUID(firstPath);
                var firstStandalone = AssetDatabase.LoadAssetAtPath<Material>(firstPath);

                Assert.AreEqual(materialPath, firstPath);
                Assert.NotNull(firstStandalone);
                Assert.AreEqual("Unsafe Export", firstStandalone.name);

                string secondPath = MaterialAssetExporter.ExportMaterialAssets(new[] { blankMaterial }, sourcePath, projectId)[0];
                string secondGuid = AssetDatabase.AssetPathToGUID(secondPath);
                var secondStandalone = AssetDatabase.LoadAssetAtPath<Material>(secondPath);

                Assert.AreEqual(firstPath, secondPath);
                Assert.AreEqual(firstGuid, secondGuid);
                Assert.NotNull(secondStandalone);
                Assert.AreEqual("Greybox Material 01", secondStandalone.name);
            }
            finally
            {
                Object.DestroyImmediate(unsafeMaterial);
                Object.DestroyImmediate(blankMaterial);
                AssetDatabase.DeleteAsset(ProjectFolder(materialPath));
            }
        }

        private static string ProjectFolder(string assetPath)
        {
            int slash = assetPath.LastIndexOf('/');
            return slash > 0 ? assetPath.Substring(0, slash) : assetPath;
        }

        private static string Sha256(string value)
        {
            using var sha = SHA256.Create();
            byte[] hash = sha.ComputeHash(Encoding.UTF8.GetBytes(value));
            var builder = new StringBuilder(hash.Length * 2);
            foreach (byte b in hash) builder.Append(b.ToString("x2"));
            return builder.ToString();
        }
    }
}
