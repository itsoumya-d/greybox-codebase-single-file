// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using Greybox.Editor.Generation;
using Greybox.Runtime;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.UIElements;

namespace Greybox.Tests.EditMode
{
    public sealed class GreyboxWatermarkBuilderTests
    {
        [Test]
        public void CreatesVisibleWorldWatermarkForFreePersonalArtifacts()
        {
            var root = new GameObject("Arena");
            try
            {
                GreyboxWatermarkBuilder.Apply(root, true);
                Assert.AreEqual(GreyboxWatermarkBuilder.WatermarkText, root.GetComponent<GreyboxWatermark>().Label);
                var text = root.transform.Find("Greybox Watermark").GetComponent<TextMesh>();
                Assert.NotNull(text);
                Assert.AreEqual(GreyboxWatermarkBuilder.WatermarkText, text.text);
                Assert.True(text.GetComponent<GreyboxGeneratedComponents>().Contains(text));
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void CreatesVisibleHudWatermarkForFreePersonalArtifacts()
        {
            var root = new GameObject("HUD", typeof(RectTransform), typeof(Canvas));
            try
            {
                GreyboxWatermarkBuilder.Apply(root, true);
                var text = root.transform.Find("Greybox Watermark").GetComponent<Text>();
                Assert.NotNull(text);
                Assert.AreEqual(GreyboxWatermarkBuilder.WatermarkText, text.text);
                Assert.False(text.raycastTarget);
                Assert.True(text.GetComponent<GreyboxGeneratedComponents>().Contains(text));
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void CreatesUiToolkitHudWatermarkForFreePersonalArtifacts()
        {
            var root = new GameObject("HUD", typeof(UIDocument), typeof(GreyboxUiToolkitHud));
            try
            {
                GreyboxWatermarkBuilder.Apply(root, true);
                var hud = root.GetComponent<GreyboxUiToolkitHud>();
                Assert.True(hud.ShowFreePersonalWatermark);
                Assert.AreEqual(GreyboxWatermarkBuilder.WatermarkText, hud.WatermarkText);
                var marker = root.transform.Find("Greybox Watermark");
                Assert.NotNull(marker);
                Assert.NotNull(marker.GetComponent<GreyboxGeneratedComponents>());
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void DoesNotWatermarkPaidArtifacts()
        {
            var root = new GameObject("Arena");
            try
            {
                GreyboxWatermarkBuilder.Apply(root, false);
                Assert.IsNull(root.GetComponent<GreyboxWatermark>());
                Assert.IsNull(root.transform.Find("Greybox Watermark"));
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }
    }
}
