// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using Greybox.Editor.Generation;
using Greybox.Runtime;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.UIElements;

namespace Greybox.Tests.EditMode
{
    public sealed class HudLayoutBuilderTests
    {
        [Test]
        public void BuildsCanvasSlotsAndTextFromHudHtml()
        {
            var root = HudLayoutBuilder.BuildFromHudHtml(@"<section data-greybox-artifact=""hud"" data-layout=""platformer-horizontal""><header data-slot=""top-left"" data-agds-id=""hud-hearts""><span data-role=""label"">HEARTS</span><span data-role=""value"">3</span></header></section>", "Assets/Greybox/platformer.gbhud");
            try
            {
                Assert.NotNull(root.GetComponent<Canvas>());
                Assert.NotNull(root.GetComponent<CanvasScaler>());
                Assert.NotNull(root.transform.Find("hud-hearts"));
                Assert.GreaterOrEqual(root.GetComponentsInChildren<Text>().Length, 2);
                var marker = root.transform.Find("hud-hearts").GetComponent<GreyboxMarker>();
                Assert.NotNull(marker);
                Assert.AreEqual(GreyboxArtifactKind.HudLayout, marker.ArtifactKind);
                Assert.AreEqual("platformer.gbhud", marker.SourceFileName);
                Assert.AreEqual("hud-slot", marker.Collection);
                Assert.AreEqual("hud-hearts", marker.MarkerId);
                Assert.AreEqual("//*[@data-agds-id=\"hud-hearts\"]", marker.JsonPath);
                var slotBinding = root.transform.Find("hud-hearts").GetComponent<GreyboxHudBinding>();
                Assert.NotNull(slotBinding);
                Assert.AreEqual("top-left", slotBinding.Slot);
                Assert.AreEqual("hud-hearts", slotBinding.SlotId);
                Assert.AreEqual("slot", slotBinding.Role);

                var valueBinding = root.transform.Find("hud-hearts/value").GetComponent<GreyboxHudBinding>();
                Assert.NotNull(valueBinding);
                Assert.AreEqual("hud-hearts", valueBinding.SlotId);
                Assert.AreEqual("value", valueBinding.BindingId);
                Assert.AreEqual("value", valueBinding.Role);
                Assert.AreEqual("3", valueBinding.Text);
                Assert.AreEqual("//*[@data-agds-id=\"hud-hearts\"]/*[@data-role=\"value\"]", valueBinding.JsonPath);
                Assert.AreEqual("$.hud.slots[id=hud-hearts].bindings[id=value]", valueBinding.RoundTripJsonPath);
                Assert.False(valueBinding.IsButton);
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void StampsOriginalDaemonSourceFileFromUnityPackageMetadata()
        {
            var root = HudLayoutBuilder.BuildFromHudHtml(@"<meta name=""greybox-source-file"" content=""hud/combat.hud.html""><section data-greybox-artifact=""hud"" data-layout=""platformer-horizontal""><header data-slot=""top-left"" data-agds-id=""hud-hearts""><span data-role=""value"">3</span></header></section>", "Assets/Greybox/Generated/Project-A/hud/combat.gbhud");
            try
            {
                var marker = root.transform.Find("hud-hearts").GetComponent<GreyboxMarker>();
                Assert.NotNull(marker);
                Assert.AreEqual("hud/combat.hud.html", marker.SourceFileName);
                Assert.AreEqual("//*[@data-agds-id=\"hud-hearts\"]", marker.JsonPath);
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void UnsafeDaemonSourceFileMetadataFallsBackToLocalHudSourceFile()
        {
            var root = HudLayoutBuilder.BuildFromHudHtml(@"<meta name=""greybox-source-file"" content=""../hud/combat.hud.html""><section data-greybox-artifact=""hud"" data-layout=""platformer-horizontal""><header data-slot=""top-left"" data-agds-id=""hud-hearts""><span data-role=""value"">3</span></header></section>", "Assets/Greybox/Generated/Project-A/hud/combat.gbhud");
            try
            {
                var marker = root.transform.Find("hud-hearts").GetComponent<GreyboxMarker>();
                Assert.NotNull(marker);
                Assert.AreEqual("combat.gbhud", marker.SourceFileName);
                Assert.AreEqual("//*[@data-agds-id=\"hud-hearts\"]", marker.JsonPath);
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void RejectsUnsafeHudMarkerSourcePaths()
        {
            HudLayoutBuilder.BuildResult result = HudLayoutBuilder.BuildHudLayout(@"<meta name=""greybox-hud-renderer"" content=""uitoolkit""><section data-greybox-artifact=""hud"" data-layout=""platformer-horizontal""><header data-slot=""top-left"" data-agds-id=""hud-hearts""><span data-role=""value"">3</span></header></section>", "../ProjectSettings/ProjectSettings.asset");
            try
            {
                var hud = result.Root.GetComponent<GreyboxUiToolkitHud>();
                Assert.NotNull(hud);
                Assert.AreEqual("", hud.SourcePath);
                var marker = result.Root.transform.Find("hud-hearts").GetComponent<GreyboxMarker>();
                Assert.NotNull(marker);
                Assert.AreEqual("", marker.SourcePath);
                Assert.AreEqual("//*[@data-agds-id=\"hud-hearts\"]", marker.JsonPath);
            }
            finally
            {
                Object.DestroyImmediate(result.Root);
                Object.DestroyImmediate(result.PanelSettings);
            }
        }

        [Test]
        public void BuildsButtonsForHudActions()
        {
            var root = HudLayoutBuilder.BuildFromHudHtml(@"<section data-greybox-artifact=""hud"" data-layout=""mobile-idle-portrait""><footer data-slot=""bottom"" data-agds-id=""hud-primary-upgrade""><button data-action=""upgrade-starter-farm"">UPGRADE FARM - 100</button></footer></section>", "Assets/Greybox/mobile-idle.gbhud");
            try
            {
                var button = root.GetComponentInChildren<UnityEngine.UI.Button>();
                Assert.NotNull(button);
                Assert.AreEqual("upgrade-starter-farm", button.GetComponent<GreyboxMarker>().MarkerId);
                var binding = button.GetComponent<GreyboxHudBinding>();
                Assert.NotNull(binding);
                Assert.AreEqual("bottom", binding.Slot);
                Assert.AreEqual("hud-primary-upgrade", binding.SlotId);
                Assert.AreEqual("upgrade-starter-farm", binding.BindingId);
                Assert.AreEqual("button", binding.Role);
                Assert.AreEqual("upgrade-starter-farm", binding.Action);
                Assert.True(binding.IsButton);
                Assert.AreEqual("UPGRADE FARM - 100", button.GetComponentInChildren<Text>().text);

                var action = button.GetComponent<GreyboxHudButtonAction>();
                Assert.NotNull(action);
                Assert.AreEqual("upgrade-starter-farm", action.ActionId);
                GreyboxHudActionContext raised = null;
                void Capture(GreyboxHudActionContext context) => raised = context;
                GreyboxHudActionDispatcher.ActionRaised += Capture;
                try
                {
                    button.onClick.Invoke();
                }
                finally
                {
                    GreyboxHudActionDispatcher.ActionRaised -= Capture;
                }
                Assert.NotNull(raised);
                Assert.AreEqual("upgrade-starter-farm", raised.ActionId);
                Assert.AreEqual("hud-primary-upgrade", raised.SlotId);
                Assert.AreEqual("//*[@data-agds-id=\"hud-primary-upgrade\"]/*[@data-role=\"upgrade-starter-farm\"]", raised.JsonPath);
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void BuildsProgressBarsForHudMeters()
        {
            var root = HudLayoutBuilder.BuildFromHudHtml(@"<section data-greybox-artifact=""hud"" data-layout=""platformer-horizontal""><header data-slot=""top-left"" data-agds-id=""hud-health""><progress data-role=""health"" value=""75"" max=""100"">HP</progress></header></section>", "Assets/Greybox/platformer.gbhud");
            try
            {
                var slider = root.GetComponentInChildren<Slider>();
                Assert.NotNull(slider);
                Assert.False(slider.interactable);
                Assert.AreEqual(0f, slider.minValue);
                Assert.AreEqual(100f, slider.maxValue);
                Assert.AreEqual(75f, slider.value);
                Assert.NotNull(slider.fillRect);

                var marker = slider.GetComponent<GreyboxMarker>();
                Assert.NotNull(marker);
                Assert.AreEqual("hud-progress", marker.Collection);
                Assert.AreEqual("health", marker.MarkerId);

                var binding = slider.GetComponent<GreyboxHudBinding>();
                Assert.NotNull(binding);
                Assert.AreEqual("health", binding.BindingId);
                Assert.AreEqual("progress", binding.Role);
                Assert.AreEqual("HP", binding.Text);
                Assert.True(binding.IsProgress);
                Assert.AreEqual(0f, binding.ProgressMin);
                Assert.AreEqual(100f, binding.ProgressMax);
                Assert.AreEqual(75f, binding.ProgressValue);
                Assert.AreEqual("//*[@data-agds-id=\"hud-health\"]/*[@data-role=\"health\"]", binding.JsonPath);
                Assert.AreEqual("$.hud.slots[id=hud-health].bindings[id=health]", binding.RoundTripJsonPath);
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void BuildsImageIconsForHudSprites()
        {
            var root = HudLayoutBuilder.BuildFromHudHtml(@"<section data-greybox-artifact=""hud"" data-layout=""platformer-horizontal""><header data-slot=""top-left"" data-agds-id=""hud-health""><img data-role=""heart-icon"" src=""Assets/Greybox/HUD/heart.png"" alt=""Heart Icon""></header></section>", "Assets/Greybox/platformer.gbhud");
            Sprite[] generatedSprites = null;
            Texture2D[] generatedTextures = null;
            try
            {
                var icon = root.transform.Find("hud-health/heart-icon");
                Assert.NotNull(icon);
                var image = icon.GetComponent<UnityEngine.UI.Image>();
                Assert.NotNull(image);
                Assert.NotNull(image.sprite);
                StringAssert.StartsWith("Greybox Generated HUD Icon", image.sprite.name);
                Assert.NotNull(image.sprite.texture);
                StringAssert.StartsWith("Greybox Generated HUD Icon", image.sprite.texture.name);
                Assert.False(image.raycastTarget);
                generatedSprites = HudLayoutBuilder.CollectGeneratedIconSprites(root);
                generatedTextures = HudLayoutBuilder.CollectGeneratedIconTextures(root);
                Assert.AreEqual(1, generatedSprites.Length);
                Assert.AreSame(image.sprite, generatedSprites[0]);
                Assert.AreEqual(1, generatedTextures.Length);
                Assert.AreSame(image.sprite.texture, generatedTextures[0]);

                var marker = icon.GetComponent<GreyboxMarker>();
                Assert.NotNull(marker);
                Assert.AreEqual("hud-image", marker.Collection);
                Assert.AreEqual("heart-icon", marker.MarkerId);
                Assert.AreEqual("Heart Icon", marker.MarkerName);

                var binding = icon.GetComponent<GreyboxHudBinding>();
                Assert.NotNull(binding);
                Assert.True(binding.IsImage);
                Assert.False(binding.IsButton);
                Assert.AreEqual("image", binding.Role);
                Assert.AreEqual("Heart Icon", binding.Text);
                Assert.AreEqual("Assets/Greybox/HUD/heart.png", binding.AssetPath);
                Assert.AreEqual("//*[@data-agds-id=\"hud-health\"]/*[@data-role=\"heart-icon\"]", binding.JsonPath);
                Assert.AreEqual("$.hud.slots[id=hud-health].bindings[id=heart-icon]", binding.RoundTripJsonPath);
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
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void SanitizesHudTokensTextAndSelectorPaths()
        {
            string longText = new string('A', 300);
            string html = @"<section data-greybox-artifact=""hud"" data-layout=""../Boss Layout?:&lt;&gt;|""><header data-slot=""top left&quot;bad"" data-agds-id=""../hud&quot;boss[0]""><span data-role=""value&quot;]/bad""> HP "
                + longText
                + (char)1
                + @"</span><button data-action=""../upgrade&quot;boss[0]"">GO "
                + longText
                + (char)2
                + "</button></header></section>";
            var root = HudLayoutBuilder.BuildFromHudHtml(html, "Assets/Greybox/unsafe.gbhud");
            try
            {
                Assert.AreEqual("Greybox HUD - Boss-Layout", root.name);
                var slot = root.transform.Find("hud-boss-0");
                Assert.NotNull(slot);

                var slotMarker = slot.GetComponent<GreyboxMarker>();
                Assert.AreEqual("hud-boss-0", slotMarker.MarkerId);
                Assert.AreEqual("//*[@data-agds-id=\"hud-boss-0\"]", slotMarker.JsonPath);
                var slotBinding = slot.GetComponent<GreyboxHudBinding>();
                Assert.AreEqual("top-left-bad", slotBinding.Slot);
                Assert.AreEqual("hud-boss-0", slotBinding.SlotId);

                var value = slot.Find("value-bad");
                Assert.NotNull(value);
                var valueBinding = value.GetComponent<GreyboxHudBinding>();
                Assert.AreEqual("value-bad", valueBinding.BindingId);
                Assert.AreEqual("value-bad", valueBinding.Role);
                Assert.AreEqual("//*[@data-agds-id=\"hud-boss-0\"]/*[@data-role=\"value-bad\"]", valueBinding.JsonPath);
                Assert.LessOrEqual(valueBinding.Text.Length, 256);
                StringAssert.StartsWith("HP ", valueBinding.Text);
                Assert.False(valueBinding.Text.Contains("\u0001"));

                var button = slot.Find("upgrade-boss-0");
                Assert.NotNull(button);
                var buttonBinding = button.GetComponent<GreyboxHudBinding>();
                Assert.AreEqual("upgrade-boss-0", buttonBinding.BindingId);
                Assert.AreEqual("upgrade-boss-0", buttonBinding.Action);
                Assert.AreEqual("//*[@data-agds-id=\"hud-boss-0\"]/*[@data-role=\"upgrade-boss-0\"]", buttonBinding.JsonPath);
                Assert.LessOrEqual(buttonBinding.Text.Length, 256);
                Assert.False(buttonBinding.Text.Contains("\u0002"));
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void BuildsUiToolkitHudWhenRendererRequested()
        {
            HudLayoutBuilder.BuildResult result = HudLayoutBuilder.BuildHudLayout(@"<meta name=""greybox-hud-renderer"" content=""uitoolkit""><section data-greybox-artifact=""hud"" data-layout=""platformer-horizontal""><header data-slot=""top-left"" data-agds-id=""hud-hearts""><span data-role=""label"">HEARTS</span><span data-role=""value"">3</span></header><footer data-slot=""bottom"" data-agds-id=""hud-action""><button data-action=""start-run"">START</button></footer></section>", "Assets/Greybox/platformer.gbhud");
            try
            {
                Assert.AreEqual(HudRendererKind.UiToolkit, result.Renderer);
                Assert.NotNull(result.PanelSettings);
                var document = result.Root.GetComponent<UIDocument>();
                Assert.NotNull(document);
                Assert.AreSame(result.PanelSettings, document.panelSettings);
                Assert.IsNull(result.Root.GetComponent<Canvas>());
                var hud = result.Root.GetComponent<GreyboxUiToolkitHud>();
                Assert.NotNull(hud);
                Assert.AreEqual("platformer-horizontal", hud.LayoutId);
                Assert.AreEqual(3, hud.Elements.Count);
                Assert.True(hud.Elements.Exists(element => element.IsButton && element.MarkerId == "start-run"));
                var action = hud.Elements.Find(element => element.IsButton && element.MarkerId == "start-run");
                Assert.AreEqual("start-run", action.BindingId);
                Assert.AreEqual("start-run", action.Action);
                Assert.AreEqual("button", action.Role);
                GreyboxHudActionContext raised = null;
                void Capture(GreyboxHudActionContext context) => raised = context;
                GreyboxHudActionDispatcher.ActionRaised += Capture;
                try
                {
                    Assert.True(hud.InvokeAction("start-run"));
                }
                finally
                {
                    GreyboxHudActionDispatcher.ActionRaised -= Capture;
                }
                Assert.NotNull(raised);
                Assert.AreEqual("start-run", raised.ActionId);
                Assert.AreEqual("hud-action", raised.SlotId);
                Assert.AreEqual("//*[@data-agds-id=\"hud-action\"]/*[@data-role=\"start-run\"]", raised.JsonPath);
                Assert.NotNull(result.Root.transform.Find("hud-hearts"));
                Assert.NotNull(result.Root.transform.Find("hud-action/start-run"));
                var marker = result.Root.transform.Find("hud-action").GetComponent<GreyboxMarker>();
                Assert.AreEqual("hud-slot", marker.Collection);
                Assert.AreEqual("//*[@data-agds-id=\"hud-action\"]", marker.JsonPath);
                var slotBinding = result.Root.transform.Find("hud-action").GetComponent<GreyboxHudBinding>();
                Assert.NotNull(slotBinding);
                Assert.AreEqual("slot", slotBinding.Role);
                Assert.AreEqual("$.hud.slots[id=hud-action]", slotBinding.RoundTripJsonPath);
                var actionBinding = result.Root.transform.Find("hud-action/start-run").GetComponent<GreyboxHudBinding>();
                Assert.NotNull(actionBinding);
                Assert.True(actionBinding.IsButton);
                Assert.AreEqual("$.hud.slots[id=hud-action].bindings[id=start-run]", actionBinding.RoundTripJsonPath);
            }
            finally
            {
                Object.DestroyImmediate(result.Root);
                Object.DestroyImmediate(result.PanelSettings);
            }
        }

        [Test]
        public void BuildsUiToolkitProgressMetersWhenRendererRequested()
        {
            HudLayoutBuilder.BuildResult result = HudLayoutBuilder.BuildHudLayout(@"<meta name=""greybox-hud-renderer"" content=""uitoolkit""><section data-greybox-artifact=""hud"" data-layout=""platformer-horizontal""><header data-slot=""top-left"" data-agds-id=""hud-xp""><meter data-role=""xp"" min=""0"" max=""10"" value=""4"">XP</meter></header></section>", "Assets/Greybox/platformer.gbhud");
            try
            {
                var hud = result.Root.GetComponent<GreyboxUiToolkitHud>();
                Assert.NotNull(hud);
                var element = hud.Elements.Find(candidate => candidate.BindingId == "xp");
                Assert.NotNull(element);
                Assert.True(element.IsProgress);
                Assert.False(element.IsButton);
                Assert.AreEqual("progress", element.Role);
                Assert.AreEqual("XP", element.Text);
                Assert.AreEqual(0f, element.ProgressMin);
                Assert.AreEqual(10f, element.ProgressMax);
                Assert.AreEqual(4f, element.ProgressValue);

                var marker = result.Root.transform.Find("hud-xp/xp").GetComponent<GreyboxMarker>();
                Assert.NotNull(marker);
                Assert.AreEqual("hud-progress", marker.Collection);
                Assert.AreEqual("xp", marker.MarkerId);
                var binding = marker.GetComponent<GreyboxHudBinding>();
                Assert.NotNull(binding);
                Assert.True(binding.IsProgress);
                Assert.AreEqual(4f, binding.ProgressValue);
                Assert.AreEqual("$.hud.slots[id=hud-xp].bindings[id=xp]", binding.RoundTripJsonPath);
            }
            finally
            {
                Object.DestroyImmediate(result.Root);
                Object.DestroyImmediate(result.PanelSettings);
            }
        }

        [Test]
        public void BuildsUiToolkitImageElementsWhenRendererRequested()
        {
            HudLayoutBuilder.BuildResult result = HudLayoutBuilder.BuildHudLayout(@"<meta name=""greybox-hud-renderer"" content=""uitoolkit""><section data-greybox-artifact=""hud"" data-layout=""platformer-horizontal""><header data-slot=""top-left"" data-agds-id=""hud-keys""><img data-role=""key-icon"" src=""Resources/Hud/key.png"" alt=""Key Icon""></header></section>", "Assets/Greybox/platformer.gbhud");
            try
            {
                var hud = result.Root.GetComponent<GreyboxUiToolkitHud>();
                Assert.NotNull(hud);
                var element = hud.Elements.Find(candidate => candidate.BindingId == "key-icon");
                Assert.NotNull(element);
                Assert.True(element.IsImage);
                Assert.False(element.IsButton);
                Assert.False(element.IsProgress);
                Assert.AreEqual("image", element.Role);
                Assert.AreEqual("Key Icon", element.Text);
                Assert.AreEqual("Resources/Hud/key.png", element.ImageSourcePath);

                var marker = result.Root.transform.Find("hud-keys/key-icon").GetComponent<GreyboxMarker>();
                Assert.NotNull(marker);
                Assert.AreEqual("hud-image", marker.Collection);
                Assert.AreEqual("key-icon", marker.MarkerId);
                var binding = marker.GetComponent<GreyboxHudBinding>();
                Assert.NotNull(binding);
                Assert.True(binding.IsImage);
                Assert.AreEqual("Resources/Hud/key.png", binding.AssetPath);
                Assert.AreEqual("$.hud.slots[id=hud-keys].bindings[id=key-icon]", binding.RoundTripJsonPath);
            }
            finally
            {
                Object.DestroyImmediate(result.Root);
                Object.DestroyImmediate(result.PanelSettings);
            }
        }
    }
}
