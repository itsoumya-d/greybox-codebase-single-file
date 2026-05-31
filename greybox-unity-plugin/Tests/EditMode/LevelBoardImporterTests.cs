// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System.Security.Cryptography;
using System.Text;
using Greybox.Editor.Importers;
using Greybox.Runtime;
using NUnit.Framework;
using UnityEngine;

namespace Greybox.Tests.EditMode
{
    public sealed class LevelBoardImporterTests
    {
        [Test]
        public void BuildsLevelRootAndArtifactMetadataFromLevelBoardJson()
        {
            const string json = @"{""id"":""floor-01"",""title"":""Crypt Floor"",""rooms"":[{""id"":""entry"",""name"":""Entry Room""}],""encounters"":[{""id"":""ambush"",""name"":""Entry Ambush"",""roomId"":""entry""}],""notes"":[""AI-assisted sample artifact. Human designer credit: Mira Designer.""]}";
            var importObjects = LevelBoardImporter.BuildImportObjects(json, "Assets/Greybox/floor.levelboard", false);
            try
            {
                Assert.AreEqual("Crypt Floor", importObjects.Root.name);
                Assert.IsNotNull(importObjects.Root.transform.Find("Rooms/Entry Room"));
                Assert.IsNotNull(importObjects.Root.transform.Find("Encounters/Entry Ambush"));

                var board = importObjects.Root.GetComponent<GreyboxLevelBoard>();
                Assert.NotNull(board);
                Assert.AreEqual("floor-01", board.BoardId);
                Assert.AreEqual(1, board.RoomCount);
                Assert.AreEqual(1, board.EncounterCount);

                Assert.AreEqual($"{importObjects.Root.name} Artifact", importObjects.Artifact.name);
                Assert.AreEqual(Sha256("LevelBoard:Assets/Greybox/floor.levelboard"), importObjects.Artifact.ArtifactId);
                Assert.AreEqual(GreyboxArtifactKind.LevelBoard, importObjects.Artifact.Kind);
                Assert.AreEqual("Assets/Greybox/floor.levelboard", importObjects.Artifact.SourcePath);
                Assert.AreEqual(json, importObjects.Artifact.SourceJson);
                Assert.AreEqual(Sha256(json), importObjects.Artifact.SourceHash);
                Assert.AreEqual("Greybox + Mira Designer", importObjects.Artifact.GeneratorCredit);
                Assert.AreEqual("Mira Designer", importObjects.Artifact.HumanDesignerCredit);
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
                Assert.AreEqual(GreyboxArtifactKind.LevelBoard, imported.Kind);
            }
            finally
            {
                Object.DestroyImmediate(importObjects.Root);
                Object.DestroyImmediate(importObjects.Artifact);
            }
        }

        [Test]
        public void AppliesFreePersonalWatermarkToLevelBoardRootAndArtifact()
        {
            const string json = @"{""title"":""Crypt Floor"",""rooms"":[{""id"":""entry"",""name"":""Entry Room""}]}";
            var importObjects = LevelBoardImporter.BuildImportObjects(json, "Assets/Greybox/floor.levelboard", true);
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
        public void TryBuildRejectsInvalidLevelBoardJsonWithoutThrowing()
        {
            bool invalid = LevelBoardImporter.TryBuildImportObjects(
                @"{""title"":""Crypt Floor"",",
                "Assets/Greybox/broken.levelboard",
                false,
                out var broken,
                out string parseError
            );
            Assert.False(invalid);
            Assert.IsNull(broken.Root);
            Assert.IsNull(broken.Artifact);
            StringAssert.Contains("Greybox Level Board import failed", parseError);
            StringAssert.Contains("valid JSON object", parseError);
            Assert.LessOrEqual(parseError.Length, 320);

            bool arrayRoot = LevelBoardImporter.TryBuildImportObjects(
                @"[{""title"":""Crypt Floor""}]",
                "Assets/Greybox/array.levelboard",
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
        public void TryBuildRejectsOversizedLevelBoardJsonWithoutThrowing()
        {
            string json = @"{""title"":""" + new string('A', (16 * 1024 * 1024) + 1) + @"""}";

            bool imported = LevelBoardImporter.TryBuildImportObjects(
                json,
                "Assets/Greybox/oversized.levelboard",
                false,
                out var importObjects,
                out string error
            );

            Assert.False(imported);
            Assert.IsNull(importObjects.Root);
            Assert.IsNull(importObjects.Artifact);
            StringAssert.Contains("character safety limit", error);
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
