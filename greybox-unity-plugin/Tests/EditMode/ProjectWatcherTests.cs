// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System.Reflection;
using Greybox.Editor.Sync;
using Greybox.Runtime;
using NUnit.Framework;
using UnityEngine;

namespace Greybox.Tests.EditMode
{
    public sealed class ProjectWatcherTests
    {
        [Test]
        public void MarkerSourceFileNameNormalizesSafeRoundTripArtifacts()
        {
            var go = new GameObject("Marker");
            var marker = go.AddComponent<GreyboxMarker>();
            try
            {
                marker.SourceFileName = @"levels\arena.gameview.json";
                Assert.AreEqual("levels/arena.gameview.json", MarkerSourceFileName(marker));

                marker.SourceFileName = "";
                marker.SourcePath = "world/DESIGN.md";
                Assert.AreEqual("world/DESIGN.md", MarkerSourceFileName(marker));

                marker.SourcePath = "ui/main.hud.html";
                Assert.AreEqual("ui/main.hud.html", MarkerSourceFileName(marker));
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void MarkerSourceFileNameRejectsUnsafeRoundTripArtifacts()
        {
            var go = new GameObject("Marker");
            var marker = go.AddComponent<GreyboxMarker>();
            try
            {
                marker.SourceFileName = "../levels/arena.gameview.json";
                Assert.AreEqual("", MarkerSourceFileName(marker));

                marker.SourceFileName = "/levels/arena.gameview.json";
                Assert.AreEqual("", MarkerSourceFileName(marker));

                marker.SourceFileName = "https://example.test/arena.gameview.json";
                Assert.AreEqual("", MarkerSourceFileName(marker));

                marker.SourceFileName = "C:/arena.gameview.json";
                Assert.AreEqual("", MarkerSourceFileName(marker));

                marker.SourceFileName = "levels/notes.txt";
                Assert.AreEqual("", MarkerSourceFileName(marker));

                marker.SourceFileName = "";
                marker.SourcePath = "levels/\n/arena.gameview.json";
                Assert.AreEqual("", MarkerSourceFileName(marker));
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        private static string MarkerSourceFileName(GreyboxMarker marker)
        {
            return (string)typeof(ProjectWatcher)
                .GetMethod("MarkerSourceFileName", BindingFlags.Static | BindingFlags.NonPublic)
                .Invoke(null, new object[] { marker });
        }
    }
}
