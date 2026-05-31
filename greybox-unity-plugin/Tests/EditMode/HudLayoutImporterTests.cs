// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System.Security.Cryptography;
using System.Text;
using Greybox.Editor.Importers;
using Greybox.Runtime;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.UIElements;

namespace Greybox.Tests.EditMode
{
    public sealed class HudLayoutImporterTests
    {
        [Test]
        public void BuildsHudRootAndArtifactMetadataFromHudHtml()
        {
            const string html = @"<meta name=""generator"" content=""Greybox + Kai Designer""><p>AI-assisted, human-directed.</p><section data-greybox-artifact=""hud"" data-layout=""platformer-horizontal""><header data-slot=""top-left"" data-agds-id=""hud-hearts""><span data-role=""label"">HEARTS</span><span data-role=""value"">3</span></header></section>";
            var importObjects = HudLayoutImporter.BuildImportObjects(html, "Assets/Greybox/platformer.gbhud", false);
            try
            {
                Assert.AreEqual("Greybox HUD - platformer-horizontal", importObjects.Root.name);
                Assert.NotNull(importObjects.Root.GetComponent<Canvas>());
                Assert.NotNull(importObjects.Root.GetComponent<CanvasScaler>());
                Assert.NotNull(importObjects.Root.transform.Find("hud-hearts"));
                Assert.GreaterOrEqual(importObjects.Root.GetComponentsInChildren<Text>().Length, 2);

                var marker = importObjects.Root.transform.Find("hud-hearts").GetComponent<GreyboxMarker>();
                Assert.NotNull(marker);
                Assert.AreEqual(GreyboxArtifactKind.HudLayout, marker.ArtifactKind);
                Assert.AreEqual("hud-slot", marker.Collection);
                Assert.AreEqual("hud-hearts", marker.MarkerId);

                Assert.AreEqual($"{importObjects.Root.name} Artifact", importObjects.Artifact.name);
                Assert.AreEqual(Sha256("HudLayout:Assets/Greybox/platformer.gbhud"), importObjects.Artifact.ArtifactId);
                Assert.AreEqual(GreyboxArtifactKind.HudLayout, importObjects.Artifact.Kind);
                Assert.AreEqual("Assets/Greybox/platformer.gbhud", importObjects.Artifact.SourcePath);
                Assert.AreEqual(html, importObjects.Artifact.SourceJson);
                Assert.AreEqual(Sha256(html), importObjects.Artifact.SourceHash);
                Assert.AreEqual("Greybox + Kai Designer", importObjects.Artifact.GeneratorCredit);
                Assert.AreEqual("Kai Designer", importObjects.Artifact.HumanDesignerCredit);
                Assert.AreEqual("AI-assisted", importObjects.Artifact.AiDisclosure);
                Assert.False(importObjects.Artifact.Watermarked);

                var imported = importObjects.Root.GetComponent<GreyboxImportedArtifact>();
                Assert.NotNull(imported);
                Assert.AreSame(importObjects.Artifact, imported.Artifact);
                Assert.AreEqual(importObjects.Artifact.ArtifactId, imported.ArtifactId);
                Assert.AreEqual(importObjects.Artifact.SourceHash, imported.SourceHash);
                Assert.AreEqual(importObjects.Artifact.GeneratorCredit, imported.GeneratorCredit);
                Assert.AreEqual(importObjects.Artifact.HumanDesignerCredit, imported.HumanDesignerCredit);
                Assert.AreEqual(importObjects.Artifact.AiDisclosure, imported.AiDisclosure);
                Assert.AreEqual(GreyboxArtifactKind.HudLayout, imported.Kind);
            }
            finally
            {
                Object.DestroyImmediate(importObjects.Root);
                Object.DestroyImmediate(importObjects.Artifact);
            }
        }

        [Test]
        public void AppliesFreePersonalWatermarkToHudRootAndArtifact()
        {
            const string html = @"<section data-greybox-artifact=""hud"" data-layout=""platformer-horizontal""><main data-slot=""center"" data-agds-id=""hud-message""><span data-role=""label"">READY</span></main></section>";
            var importObjects = HudLayoutImporter.BuildImportObjects(html, "Assets/Greybox/platformer.gbhud", true);
            try
            {
                var watermark = importObjects.Root.GetComponent<GreyboxWatermark>();
                Assert.NotNull(watermark);
                Assert.True(watermark.Visible);
                Assert.AreEqual("Free Personal", watermark.LicenseTier);
                Assert.IsNotNull(importObjects.Root.transform.Find("Greybox Watermark"));
                Assert.True(importObjects.Artifact.Watermarked);
            }
            finally
            {
                Object.DestroyImmediate(importObjects.Root);
                Object.DestroyImmediate(importObjects.Artifact);
            }
        }

        [Test]
        public void TryBuildRejectsOversizedHudHtmlWithoutThrowing()
        {
            string html = @"<section data-greybox-artifact=""hud"">" + new string('A', HudLayoutImporter.MaxHudHtmlImportLength + 1);

            bool imported = HudLayoutImporter.TryBuildImportObjects(
                html,
                "Assets/Greybox/oversized.gbhud",
                false,
                out var importObjects,
                out string error
            );

            Assert.False(imported);
            Assert.IsNull(importObjects.Root);
            Assert.IsNull(importObjects.Artifact);
            Assert.IsNull(importObjects.PanelSettings);
            StringAssert.Contains("character safety limit", error);
        }

        [Test]
        public void BuildsUiToolkitHudRootPanelSettingsAndArtifactMetadata()
        {
            const string html = @"<section data-greybox-artifact=""hud"" data-layout=""platformer-horizontal"" data-greybox-renderer=""ui-toolkit""><header data-slot=""top-left"" data-agds-id=""hud-hearts""><span data-role=""value"">3</span></header></section>";
            var importObjects = HudLayoutImporter.BuildImportObjects(html, "Assets/Greybox/platformer.gbhud", false);
            try
            {
                Assert.AreEqual("Greybox HUD - platformer-horizontal", importObjects.Root.name);
                Assert.NotNull(importObjects.PanelSettings);
                var document = importObjects.Root.GetComponent<UIDocument>();
                Assert.NotNull(document);
                Assert.AreSame(importObjects.PanelSettings, document.panelSettings);
                var hud = importObjects.Root.GetComponent<GreyboxUiToolkitHud>();
                Assert.NotNull(hud);
                Assert.True(hud.Elements.Exists(element => element.BindingId == "value" && element.SlotId == "hud-hearts"));
                Assert.IsNull(importObjects.Root.GetComponent<Canvas>());
                Assert.AreEqual(GreyboxArtifactKind.HudLayout, importObjects.Artifact.Kind);
                Assert.AreEqual(html, importObjects.Artifact.SourceJson);
                Assert.NotNull(importObjects.Root.GetComponent<GreyboxImportedArtifact>());
            }
            finally
            {
                Object.DestroyImmediate(importObjects.Root);
                Object.DestroyImmediate(importObjects.Artifact);
                Object.DestroyImmediate(importObjects.PanelSettings);
            }
        }

        [Test]
        public void BuildsGeneratedIconAssetsForMissingHudSprites()
        {
            const string html = @"<section data-greybox-artifact=""hud"" data-layout=""platformer-horizontal""><header data-slot=""top-left"" data-agds-id=""hud-hearts""><img data-role=""heart-icon"" src=""Resources/Hud/heart.png"" alt=""Heart Icon""></header></section>";
            var importObjects = HudLayoutImporter.BuildImportObjects(html, "Assets/Greybox/platformer.gbhud", false);
            Sprite[] generatedSprites = null;
            Texture2D[] generatedTextures = null;
            try
            {
                generatedSprites = Greybox.Editor.Generation.HudLayoutBuilder.CollectGeneratedIconSprites(importObjects.Root);
                generatedTextures = Greybox.Editor.Generation.HudLayoutBuilder.CollectGeneratedIconTextures(importObjects.Root);
                Assert.AreEqual(1, generatedSprites.Length);
                Assert.AreEqual(1, generatedTextures.Length);
                StringAssert.StartsWith("Greybox Generated HUD Icon", generatedSprites[0].name);
                StringAssert.StartsWith("Greybox Generated HUD Icon", generatedTextures[0].name);
            }
            finally
            {
                if (generatedSprites != null)
                {
                    foreach (Sprite sprite in generatedSprites) Object.DestroyImmediate(sprite);
                }
                if (generatedTextures != null)
                {
                    foreach (Texture2D texture in generatedTextures) Object.DestroyImmediate(texture);
                }
                Object.DestroyImmediate(importObjects.Root);
                Object.DestroyImmediate(importObjects.Artifact);
            }
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
