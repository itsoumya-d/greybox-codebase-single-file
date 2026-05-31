// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System.Security.Cryptography;
using System.Text;
using Greybox.Editor.Importers;
using Greybox.Runtime;
using NUnit.Framework;
using UnityEngine;

namespace Greybox.Tests.EditMode
{
    public sealed class GameViewportImporterTests
    {
        [Test]
        public void BuildsPrefabRootAndArtifactMetadataFromGameViewportJson()
        {
            const string json = @"{""title"":""Arena"",""spawnPoints"":[{""id"":""spawn-a"",""position"":{""x"":1,""y"":2,""z"":3}}],""objectives"":[{""id"":""win"",""name"":""Capture Relic""}],""notes"":[""AI-assisted sample artifact. Human designer credit: Kai Designer.""]}";
            var importObjects = GameViewportImporter.BuildImportObjects(json, "Assets/Greybox/arena.gameview", false);
            try
            {
                Assert.AreEqual("Arena", importObjects.Root.name);
                Assert.IsNotNull(importObjects.Root.transform.Find("Spawn Points/spawn-a"));
                Assert.IsNotNull(importObjects.Root.transform.Find("Objectives/Capture Relic"));

                var marker = importObjects.Root.transform.Find("Spawn Points/spawn-a").GetComponent<GreyboxMarker>();
                Assert.NotNull(marker);
                Assert.AreEqual(GreyboxArtifactKind.GameViewport, marker.ArtifactKind);
                Assert.AreEqual("Assets/Greybox/arena.gameview", marker.SourcePath);
                Assert.AreEqual("arena.gameview", marker.SourceFileName);
                Assert.AreEqual("$.spawnPoints[id=spawn-a]", marker.JsonPath);
                Assert.AreEqual("$.spawnPoints[id=spawn-a].position", marker.PositionJsonPath);

                Assert.AreEqual($"{importObjects.Root.name} Artifact", importObjects.Artifact.name);
                Assert.AreEqual(Sha256("GameViewport:Assets/Greybox/arena.gameview"), importObjects.Artifact.ArtifactId);
                Assert.AreEqual(GreyboxArtifactKind.GameViewport, importObjects.Artifact.Kind);
                Assert.AreEqual("Assets/Greybox/arena.gameview", importObjects.Artifact.SourcePath);
                Assert.AreEqual(json, importObjects.Artifact.SourceJson);
                Assert.AreEqual(Sha256(json), importObjects.Artifact.SourceHash);
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
                Assert.AreEqual(GreyboxArtifactKind.GameViewport, imported.Kind);
            }
            finally
            {
                Object.DestroyImmediate(importObjects.Root);
                Object.DestroyImmediate(importObjects.Artifact);
            }
        }

        [Test]
        public void AppliesFreePersonalWatermarkToGeneratedRootAndArtifact()
        {
            const string json = @"{""title"":""Arena"",""actors"":[{""id"":""boss"",""name"":""Boss""}]}";
            var importObjects = GameViewportImporter.BuildImportObjects(json, "Assets/Greybox/arena.gameview", true);
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
        public void TryBuildRejectsInvalidGameViewportJsonWithoutThrowing()
        {
            bool invalid = GameViewportImporter.TryBuildImportObjects(
                @"{""title"":""Arena"",",
                "Assets/Greybox/broken.gameview",
                false,
                out var broken,
                out string parseError
            );
            Assert.False(invalid);
            Assert.IsNull(broken.Root);
            Assert.IsNull(broken.Artifact);
            StringAssert.Contains("Greybox Game Viewport import failed", parseError);
            StringAssert.Contains("valid JSON object", parseError);
            Assert.LessOrEqual(parseError.Length, 320);

            bool arrayRoot = GameViewportImporter.TryBuildImportObjects(
                @"[{""title"":""Arena""}]",
                "Assets/Greybox/array.gameview",
                false,
                out var arrayImport,
                out string rootError
            );
            Assert.False(arrayRoot);
            Assert.IsNull(arrayImport.Root);
            Assert.IsNull(arrayImport.Artifact);
            StringAssert.Contains("root must be a JSON object", rootError);
        }

        [Test]
        public void TryBuildRejectsOversizedGameViewportJsonWithoutThrowing()
        {
            string json = @"{""title"":""" + new string('A', (16 * 1024 * 1024) + 1) + @"""}";

            bool imported = GameViewportImporter.TryBuildImportObjects(
                json,
                "Assets/Greybox/oversized.gameview",
                false,
                out var importObjects,
                out string error
            );

            Assert.False(imported);
            Assert.IsNull(importObjects.Root);
            Assert.IsNull(importObjects.Artifact);
            StringAssert.Contains("character safety limit", error);
        }

        [Test]
        public void BoundsStoredArtifactSourceJsonWhileHashingFullSource()
        {
            string json = @"{""title"":""Arena"",""notes"":""" + new string('A', 270000) + @"""}";
            var importObjects = GameViewportImporter.BuildImportObjects(json, "Assets/Greybox/arena.gameview", false);
            try
            {
                Assert.AreEqual("Arena", importObjects.Root.name);
                Assert.AreEqual(262144, importObjects.Artifact.SourceJson.Length);
                StringAssert.StartsWith(@"{""title"":""Arena"",""notes"":""", importObjects.Artifact.SourceJson);
                Assert.AreEqual(Sha256(json), importObjects.Artifact.SourceHash);

                var imported = importObjects.Root.GetComponent<GreyboxImportedArtifact>();
                Assert.NotNull(imported);
                Assert.AreEqual(importObjects.Artifact.SourceHash, imported.SourceHash);
            }
            finally
            {
                Object.DestroyImmediate(importObjects.Root);
                Object.DestroyImmediate(importObjects.Artifact);
            }
        }

        [Test]
        public void BoundsImportedArtifactNameAndSourcePath()
        {
            string json = @"{""title"":""" + new string('A', 240) + @""",""notes"":[""AI-assisted. Human designer credit: Kai Designer.""]}";
            string sourcePath = @"Assets\Greybox\Generated\" + new string('p', 700) + "\n.gameview";
            var importObjects = GameViewportImporter.BuildImportObjects(json, sourcePath, false);
            try
            {
                Assert.LessOrEqual(importObjects.Artifact.name.Length, 120);
                Assert.LessOrEqual(importObjects.Artifact.SourcePath.Length, 512);
                Assert.False(importObjects.Artifact.SourcePath.Contains("\\"));
                Assert.False(importObjects.Artifact.SourcePath.Contains("\n"));
                StringAssert.StartsWith("Assets/Greybox/Generated/", importObjects.Artifact.SourcePath);
            }
            finally
            {
                Object.DestroyImmediate(importObjects.Root);
                Object.DestroyImmediate(importObjects.Artifact);
            }
        }

        [Test]
        public void RejectsTraversalLikeImportedArtifactSourcePaths()
        {
            const string json = @"{""title"":""Arena"",""notes"":[""AI-assisted. Human designer credit: Kai Designer.""]}";
            var importObjects = GameViewportImporter.BuildImportObjects(json, "../ProjectSettings/ProjectSettings.asset", false);
            try
            {
                Assert.AreEqual("", importObjects.Artifact.SourcePath);

                var imported = importObjects.Root.GetComponent<GreyboxImportedArtifact>();
                Assert.NotNull(imported);
                Assert.AreEqual("", imported.SourcePath);
            }
            finally
            {
                Object.DestroyImmediate(importObjects.Root);
                Object.DestroyImmediate(importObjects.Artifact);
            }
        }

        [Test]
        public void BoundsImportedProvenanceCredits()
        {
            string longCredit = new string('D', 320);
            string json = @"{""title"":""Arena"",""notes"":[""AI-assisted sample artifact. Generator credit: Greybox + " + longCredit + @". Human designer credit: " + longCredit + @".""]}";
            var importObjects = GameViewportImporter.BuildImportObjects(json, "Assets/Greybox/arena.gameview", false);
            try
            {
                Assert.AreEqual(160, importObjects.Artifact.GeneratorCredit.Length);
                Assert.AreEqual(160, importObjects.Artifact.HumanDesignerCredit.Length);
                StringAssert.StartsWith("Greybox + D", importObjects.Artifact.GeneratorCredit);
                StringAssert.StartsWith("D", importObjects.Artifact.HumanDesignerCredit);
                Assert.AreEqual("AI-assisted", importObjects.Artifact.AiDisclosure);

                var imported = importObjects.Root.GetComponent<GreyboxImportedArtifact>();
                Assert.NotNull(imported);
                Assert.AreEqual(importObjects.Artifact.GeneratorCredit, imported.GeneratorCredit);
                Assert.AreEqual(importObjects.Artifact.HumanDesignerCredit, imported.HumanDesignerCredit);
            }
            finally
            {
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
