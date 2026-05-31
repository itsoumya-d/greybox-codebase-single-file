// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System.Collections.Generic;
using System.Globalization;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using Greybox.Editor.Sync;
using Greybox.Runtime;
using UnityEditor;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.UIElements;

namespace Greybox.Editor.Generation
{
    public enum HudRendererKind
    {
        Ugui,
        UiToolkit
    }

    public static class HudLayoutBuilder
    {
        private const int MaxHudTokenLength = 80;
        private const int MaxHudTextLength = 256;
        private const int MaxSourcePathLength = 512;
        private const string GeneratedIconNamePrefix = "Greybox Generated HUD Icon";
        private static readonly Regex ContainerRegex = new Regex(@"<(?<tag>header|main|footer)\b(?<attrs>[^>]*)>(?<body>[\s\S]*?)</\k<tag>>", RegexOptions.Compiled | RegexOptions.IgnoreCase);
        private static readonly Regex ElementRegex = new Regex(@"<(?<tag>span|button|progress|meter)\b(?<attrs>[^>]*)>(?<body>[\s\S]*?)</\k<tag>>|<(?<tag>img)\b(?<attrs>[^>]*)/?>", RegexOptions.Compiled | RegexOptions.IgnoreCase);
        private static readonly Regex SourceFileMetaRegex = new Regex(@"<meta\b(?=[^>]*\bname\s*=\s*""greybox-source-file"")(?<attrs>[^>]*)>", RegexOptions.Compiled | RegexOptions.IgnoreCase);
        private static readonly Regex RendererMetaRegex = new Regex(@"<meta\b(?=[^>]*\bname\s*=\s*""greybox-hud-renderer"")(?<attrs>[^>]*)>", RegexOptions.Compiled | RegexOptions.IgnoreCase);
        private static readonly Regex AttributeRegex = new Regex(@"(?<name>[A-Za-z0-9_-]+)\s*=\s*""(?<value>[^""]*)""", RegexOptions.Compiled | RegexOptions.IgnoreCase);
        private static readonly Regex TagRegex = new Regex("<[^>]+>", RegexOptions.Compiled);

        public sealed class BuildResult
        {
            public BuildResult(GameObject root, PanelSettings panelSettings, HudRendererKind renderer)
            {
                Root = root;
                PanelSettings = panelSettings;
                Renderer = renderer;
            }

            public GameObject Root { get; }
            public PanelSettings PanelSettings { get; }
            public HudRendererKind Renderer { get; }
        }

        public static GameObject BuildFromHudHtml(string html, string sourcePath)
        {
            return BuildHudLayout(html, sourcePath).Root;
        }

        public static BuildResult BuildHudLayout(string html, string sourcePath)
        {
            return SelectRenderer(html) == HudRendererKind.UiToolkit
                ? BuildUiToolkitFromHudHtml(html, sourcePath)
                : new BuildResult(BuildUguiFromHudHtml(html, sourcePath), null, HudRendererKind.Ugui);
        }

        public static Texture2D[] CollectGeneratedIconTextures(GameObject root)
        {
            if (!root) return new Texture2D[0];
            var result = new List<Texture2D>();
            var seen = new HashSet<Texture2D>();
            foreach (UnityEngine.UI.Image image in root.GetComponentsInChildren<UnityEngine.UI.Image>(true))
            {
                Sprite sprite = image.sprite;
                Texture2D texture = sprite ? sprite.texture : null;
                if (!texture || !IsGeneratedIconAsset(texture.name) || !seen.Add(texture)) continue;
                result.Add(texture);
            }

            return result.ToArray();
        }

        public static Sprite[] CollectGeneratedIconSprites(GameObject root)
        {
            if (!root) return new Sprite[0];
            var result = new List<Sprite>();
            var seen = new HashSet<Sprite>();
            foreach (UnityEngine.UI.Image image in root.GetComponentsInChildren<UnityEngine.UI.Image>(true))
            {
                Sprite sprite = image.sprite;
                if (!sprite || !IsGeneratedIconAsset(sprite.name) || !seen.Add(sprite)) continue;
                result.Add(sprite);
            }

            return result.ToArray();
        }

        public static HudRendererKind SelectRenderer(string html)
        {
            var rootAttrs = ParseAttributes(Regex.Match(html ?? "", @"<section\b(?<attrs>[^>]*)>", RegexOptions.IgnoreCase).Groups["attrs"].Value);
            string requested = ValueOr(rootAttrs, "data-greybox-renderer", "");
            if (string.IsNullOrWhiteSpace(requested)) requested = ValueOr(rootAttrs, "data-renderer", "");
            if (string.IsNullOrWhiteSpace(requested)) requested = ValueOr(rootAttrs, "data-ui-framework", "");
            if (string.IsNullOrWhiteSpace(requested)) requested = ValueOr(rootAttrs, "data-greybox-ui", "");
            if (string.IsNullOrWhiteSpace(requested))
            {
                var metaAttrs = ParseAttributes(RendererMetaRegex.Match(html ?? "").Groups["attrs"].Value);
                requested = ValueOr(metaAttrs, "content", "");
            }

            string normalized = (requested ?? "").Trim().ToLowerInvariant().Replace("_", "").Replace("-", "").Replace(" ", "");
            return normalized == "uitoolkit" || normalized == "uikit"
                ? HudRendererKind.UiToolkit
                : HudRendererKind.Ugui;
        }

        private static GameObject BuildUguiFromHudHtml(string html, string sourcePath)
        {
            var rootAttrs = ParseAttributes(Regex.Match(html ?? "", @"<section\b(?<attrs>[^>]*)>", RegexOptions.IgnoreCase).Groups["attrs"].Value);
            string sourceFileName = SourceFileName(html, sourcePath);
            string layoutId = SafeHudToken(ValueOr(rootAttrs, "data-layout", System.IO.Path.GetFileNameWithoutExtension(sourcePath) ?? "hud"), "hud");
            var root = new GameObject($"Greybox HUD - {SafeName(layoutId)}", typeof(RectTransform), typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            ConfigureCanvas(root, layoutId);
            Stamp(root, sourcePath, sourceFileName, "hud", layoutId, "Greybox HUD", "$", "");

            int slotIndex = 0;
            foreach (Match match in ContainerRegex.Matches(html ?? ""))
            {
                var attrs = ParseAttributes(match.Groups["attrs"].Value);
                string slot = SafeHudToken(ValueOr(attrs, "data-slot", $"slot-{slotIndex + 1}"), $"slot-{slotIndex + 1}");
                string markerId = SafeHudToken(ValueOr(attrs, "data-agds-id", slot), slot);
                string slotPath = $"//*[@data-agds-id=\"{markerId}\"]";
                var slotObject = CreateSlot(root.transform, sourcePath, sourceFileName, slot, markerId, slotPath);
                BuildElements(slotObject.transform, sourcePath, sourceFileName, slot, markerId, slotPath, match.Groups["body"].Value);
                slotIndex++;
            }

            if (slotIndex == 0)
            {
                var slotObject = CreateSlot(root.transform, sourcePath, sourceFileName, "center", "hud-source", "//*[@data-agds-id=\"hud-source\"]");
                CreateText(slotObject.transform, sourcePath, sourceFileName, "center", "hud-source", "source", "HUD", StripTags(html ?? "HUD"), "//*[@data-agds-id=\"hud-source\"]/*[@data-role=\"source\"]");
            }

            return root;
        }

        private static BuildResult BuildUiToolkitFromHudHtml(string html, string sourcePath)
        {
            var rootAttrs = ParseAttributes(Regex.Match(html ?? "", @"<section\b(?<attrs>[^>]*)>", RegexOptions.IgnoreCase).Groups["attrs"].Value);
            string sourceFileName = SourceFileName(html, sourcePath);
            string layoutId = SafeHudToken(ValueOr(rootAttrs, "data-layout", System.IO.Path.GetFileNameWithoutExtension(sourcePath) ?? "hud"), "hud");
            var root = new GameObject($"Greybox HUD - {SafeName(layoutId)}", typeof(UIDocument), typeof(GreyboxUiToolkitHud));
            PanelSettings panelSettings = CreatePanelSettings(layoutId);
            var document = root.GetComponent<UIDocument>();
            document.panelSettings = panelSettings;
            var hud = root.GetComponent<GreyboxUiToolkitHud>();
            hud.LayoutId = layoutId;
            hud.SourcePath = SafeSourcePath(sourcePath);
            hud.SourceFileName = sourceFileName;
            hud.ReferenceResolution = ReferenceResolutionFor(layoutId);
            hud.Elements.Clear();
            Stamp(root, sourcePath, sourceFileName, "hud", layoutId, "Greybox HUD", "$", "");

            int slotIndex = 0;
            foreach (Match match in ContainerRegex.Matches(html ?? ""))
            {
                var attrs = ParseAttributes(match.Groups["attrs"].Value);
                string slot = SafeHudToken(ValueOr(attrs, "data-slot", $"slot-{slotIndex + 1}"), $"slot-{slotIndex + 1}");
                string markerId = SafeHudToken(ValueOr(attrs, "data-agds-id", slot), slot);
                string slotPath = $"//*[@data-agds-id=\"{markerId}\"]";
                var markerSlot = CreateUiToolkitMarker(
                    root.transform,
                    sourcePath,
                    sourceFileName,
                    "hud-slot",
                    markerId,
                    slot,
                    slotPath,
                    slot,
                    markerId,
                    markerId,
                    "slot",
                    "",
                    slot,
                    false,
                    "",
                    false,
                    false,
                    0f,
                    1f,
                    0f,
                    HudSlotRoundTripPath(markerId));
                BuildUiToolkitElements(hud.Elements, markerSlot.transform, sourcePath, sourceFileName, slot, markerId, slotPath, match.Groups["body"].Value);
                slotIndex++;
            }

            if (slotIndex == 0)
            {
                var markerSlot = CreateUiToolkitMarker(
                    root.transform,
                    sourcePath,
                    sourceFileName,
                    "hud-slot",
                    "hud-source",
                    "center",
                    "//*[@data-agds-id=\"hud-source\"]",
                    "center",
                    "hud-source",
                    "hud-source",
                    "slot",
                    "",
                    "center",
                    false,
                    "",
                    false,
                    false,
                    0f,
                    1f,
                    0f,
                    HudSlotRoundTripPath("hud-source"));
                AddUiToolkitElement(hud.Elements, markerSlot.transform, sourcePath, sourceFileName, "center", "hud-source", "source", "HUD", StripTags(html ?? "HUD"), "//*[@data-agds-id=\"hud-source\"]/*[@data-role=\"source\"]", false);
            }

            hud.Build();
            return new BuildResult(root, panelSettings, HudRendererKind.UiToolkit);
        }

        private static void ConfigureCanvas(GameObject root, string layoutId)
        {
            var rect = root.GetComponent<RectTransform>();
            rect.anchorMin = Vector2.zero;
            rect.anchorMax = Vector2.one;
            rect.offsetMin = Vector2.zero;
            rect.offsetMax = Vector2.zero;

            var canvas = root.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.pixelPerfect = true;

            var scaler = root.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            bool portrait = layoutId.ToLowerInvariant().Contains("portrait");
            scaler.referenceResolution = portrait ? new Vector2(1080, 1920) : new Vector2(1920, 1080);
            scaler.matchWidthOrHeight = portrait ? 1f : 0.5f;
        }

        private static GameObject CreateSlot(Transform parent, string sourcePath, string sourceFileName, string slot, string markerId, string path)
        {
            var go = new GameObject(SafeName(markerId), typeof(RectTransform), typeof(HorizontalLayoutGroup));
            go.transform.SetParent(parent, false);
            var rect = go.GetComponent<RectTransform>();
            PlaceSlot(rect, slot);
            var layout = go.GetComponent<HorizontalLayoutGroup>();
            layout.childAlignment = TextAnchor.MiddleCenter;
            layout.childControlHeight = true;
            layout.childControlWidth = true;
            layout.childForceExpandHeight = false;
            layout.childForceExpandWidth = false;
            layout.spacing = 8f;
            Stamp(go, sourcePath, sourceFileName, "hud-slot", markerId, slot, path, "");
            AttachHudBinding(go, slot, markerId, markerId, "slot", "", slot, path, false, "", false, HudSlotRoundTripPath(markerId));
            return go;
        }

        private static void BuildElements(Transform parent, string sourcePath, string sourceFileName, string slot, string slotId, string slotPath, string body)
        {
            int index = 0;
            foreach (Match match in ElementRegex.Matches(body ?? ""))
            {
                var attrs = ParseAttributes(match.Groups["attrs"].Value);
                string tag = match.Groups["tag"].Value.ToLowerInvariant();
                string role = SafeHudToken(ValueOr(attrs, "data-role", ValueOr(attrs, "data-action", tag)), tag);
                string text = SafeHudText(StripTags(match.Groups["body"].Value), role.ToUpperInvariant());
                string path = $"{slotPath}/*[@data-role=\"{role}\"]";
                if (tag == "button") CreateButton(parent, sourcePath, sourceFileName, slot, slotId, role, text, path);
                else if (tag == "img") CreateImage(parent, sourcePath, sourceFileName, slot, slotId, role, attrs, path);
                else if (tag == "progress" || tag == "meter") CreateProgress(parent, sourcePath, sourceFileName, slot, slotId, role, text, path, attrs);
                else CreateText(parent, sourcePath, sourceFileName, slot, slotId, role, role, text, path);
                index++;
            }

            if (index == 0)
            {
                CreateText(parent, sourcePath, sourceFileName, slot, slotId, slotId, "label", StripTags(body ?? ""), $"{slotPath}/*[@data-role=\"label\"]");
            }
        }

        private static void BuildUiToolkitElements(List<GreyboxUiToolkitHudElement> elements, Transform markerParent, string sourcePath, string sourceFileName, string slot, string slotId, string slotPath, string body)
        {
            int index = 0;
            foreach (Match match in ElementRegex.Matches(body ?? ""))
            {
                var attrs = ParseAttributes(match.Groups["attrs"].Value);
                string tag = match.Groups["tag"].Value.ToLowerInvariant();
                string role = SafeHudToken(ValueOr(attrs, "data-role", ValueOr(attrs, "data-action", tag)), tag);
                string text = SafeHudText(StripTags(match.Groups["body"].Value), role.ToUpperInvariant());
                if (tag == "img") text = SafeHudText(ValueOr(attrs, "alt", role), role.ToUpperInvariant());
                string path = $"{slotPath}/*[@data-role=\"{role}\"]";
                if (tag == "img")
                {
                    AddUiToolkitElement(elements, markerParent, sourcePath, sourceFileName, slot, slotId, role, "image", text, path, false, false, 0f, 1f, 0f, true, SafeSourcePath(ValueOr(attrs, "src", "")));
                }
                else if (tag == "progress" || tag == "meter")
                {
                    ReadProgress(attrs, out float min, out float max, out float value);
                    AddUiToolkitElement(elements, markerParent, sourcePath, sourceFileName, slot, slotId, role, "progress", text, path, false, true, min, max, value);
                }
                else
                {
                    AddUiToolkitElement(elements, markerParent, sourcePath, sourceFileName, slot, slotId, role, tag == "button" ? "button" : role, text, path, tag == "button");
                }
                index++;
            }

            if (index == 0)
            {
                AddUiToolkitElement(elements, markerParent, sourcePath, sourceFileName, slot, slotId, slotId, "label", StripTags(body ?? ""), $"{slotPath}/*[@data-role=\"label\"]", false);
            }
        }

        private static void AddUiToolkitElement(List<GreyboxUiToolkitHudElement> elements, Transform markerParent, string sourcePath, string sourceFileName, string slot, string slotId, string markerId, string role, string text, string path, bool isButton, bool isProgress = false, float progressMin = 0f, float progressMax = 1f, float progressValue = 0f, bool isImage = false, string imageSourcePath = "")
        {
            elements.Add(new GreyboxUiToolkitHudElement
            {
                Slot = slot ?? "",
                SlotId = slotId ?? "",
                BindingId = markerId ?? "",
                MarkerId = markerId ?? "",
                Role = role ?? "",
                Action = isButton ? markerId ?? "" : "",
                Text = text ?? "",
                ImageSourcePath = imageSourcePath ?? "",
                JsonPath = path ?? "",
                IsButton = isButton,
                IsImage = isImage,
                IsProgress = isProgress,
                ProgressMin = progressMin,
                ProgressMax = progressMax,
                ProgressValue = progressValue,
            });
            CreateUiToolkitMarker(
                markerParent,
                sourcePath,
                sourceFileName,
                isProgress ? "hud-progress" : isImage ? "hud-image" : isButton ? "hud-button" : "hud-text",
                markerId,
                text,
                path,
                slot,
                slotId,
                markerId,
                role,
                isButton ? markerId ?? "" : "",
                text,
                isButton,
                imageSourcePath,
                isImage,
                isProgress,
                progressMin,
                progressMax,
                progressValue,
                HudBindingRoundTripPath(slotId, markerId));
        }

        private static GameObject CreateUiToolkitMarker(Transform parent, string sourcePath, string sourceFileName, string collection, string markerId, string markerName, string path, string slot = "", string slotId = "", string bindingId = "", string role = "", string action = "", string text = "", bool isButton = false, string assetPath = "", bool isImage = false, bool isProgress = false, float progressMin = 0f, float progressMax = 1f, float progressValue = 0f, string roundTripJsonPath = "")
        {
            var go = new GameObject(SafeName(markerId));
            go.transform.SetParent(parent, false);
            Stamp(go, sourcePath, sourceFileName, collection, markerId, markerName, path, "");
            if (!string.IsNullOrWhiteSpace(bindingId) || !string.IsNullOrWhiteSpace(role))
            {
                AttachHudBinding(go, slot, slotId, bindingId, role, action, text, path, isButton, assetPath, isImage, roundTripJsonPath, isProgress, progressMin, progressMax, progressValue);
            }
            return go;
        }

        private static GameObject CreateButton(Transform parent, string sourcePath, string sourceFileName, string slot, string slotId, string action, string text, string path)
        {
            action = SafeHudToken(action, "button");
            text = SafeHudText(text, action);
            var go = new GameObject(SafeName(action), typeof(RectTransform), typeof(UnityEngine.UI.Image), typeof(UnityEngine.UI.Button));
            go.transform.SetParent(parent, false);
            var rect = go.GetComponent<RectTransform>();
            rect.sizeDelta = new Vector2(280f, 52f);
            var image = go.GetComponent<UnityEngine.UI.Image>();
            image.color = new Color(1f, 0.42f, 0.21f, 0.96f);
            var button = go.GetComponent<UnityEngine.UI.Button>();
            var colors = button.colors;
            colors.normalColor = image.color;
            colors.highlightedColor = new Color(1f, 0.55f, 0.34f, 1f);
            colors.pressedColor = new Color(0.9f, 0.3f, 0.14f, 1f);
            button.colors = colors;
            Stamp(go, sourcePath, sourceFileName, "hud-button", action, text, path, "");
            GreyboxHudBinding binding = AttachHudBinding(go, slot, slotId, action, "button", action, text, path, true, "", false, HudBindingRoundTripPath(slotId, action));
            var actionDispatcher = go.GetComponent<GreyboxHudButtonAction>() ?? go.AddComponent<GreyboxHudButtonAction>();
            actionDispatcher.Configure(binding);
            CreateText(go.transform, sourcePath, sourceFileName, slot, slotId, action, "button-label", text, $"{path}/text()", action);
            return go;
        }

        private static GameObject CreateProgress(Transform parent, string sourcePath, string sourceFileName, string slot, string slotId, string bindingId, string label, string path, Dictionary<string, string> attrs)
        {
            bindingId = SafeHudToken(bindingId, "progress");
            label = SafeHudText(label, bindingId.ToUpperInvariant());
            ReadProgress(attrs, out float min, out float max, out float value);
            var go = new GameObject(SafeName(bindingId), typeof(RectTransform), typeof(UnityEngine.UI.Image), typeof(Slider));
            go.transform.SetParent(parent, false);
            var rect = go.GetComponent<RectTransform>();
            rect.sizeDelta = new Vector2(240f, 32f);

            var background = go.GetComponent<UnityEngine.UI.Image>();
            background.color = new Color(0.04f, 0.04f, 0.05f, 0.72f);

            var fill = new GameObject("Fill", typeof(RectTransform), typeof(UnityEngine.UI.Image));
            fill.transform.SetParent(go.transform, false);
            var fillRect = fill.GetComponent<RectTransform>();
            fillRect.anchorMin = Vector2.zero;
            fillRect.anchorMax = Vector2.one;
            fillRect.offsetMin = Vector2.zero;
            fillRect.offsetMax = Vector2.zero;
            fill.GetComponent<UnityEngine.UI.Image>().color = new Color(1f, 0.42f, 0.21f, 0.96f);

            var slider = go.GetComponent<Slider>();
            slider.transition = Selectable.Transition.None;
            slider.interactable = false;
            slider.minValue = min;
            slider.maxValue = max;
            slider.value = Mathf.Clamp(value, min, max);
            slider.fillRect = fillRect;

            Stamp(go, sourcePath, sourceFileName, "hud-progress", bindingId, label, path, "");
            GreyboxHudBinding binding = AttachHudBinding(go, slot, slotId, bindingId, "progress", "", label, path, false, "", false, HudBindingRoundTripPath(slotId, bindingId));
            binding.IsProgress = true;
            binding.ProgressMin = min;
            binding.ProgressMax = max;
            binding.ProgressValue = slider.value;
            return go;
        }

        private static GameObject CreateImage(Transform parent, string sourcePath, string sourceFileName, string slot, string slotId, string bindingId, Dictionary<string, string> attrs, string path)
        {
            bindingId = SafeHudToken(bindingId, "image");
            string alt = SafeHudText(ValueOr(attrs, "alt", bindingId), bindingId.ToUpperInvariant());
            string assetPath = SafeSourcePath(ValueOr(attrs, "src", ""));
            var go = new GameObject(SafeName(bindingId), typeof(RectTransform), typeof(UnityEngine.UI.Image));
            go.transform.SetParent(parent, false);
            var rect = go.GetComponent<RectTransform>();
            rect.sizeDelta = new Vector2(44f, 44f);
            var image = go.GetComponent<UnityEngine.UI.Image>();
            image.color = new Color(1f, 1f, 1f, 0.96f);
            image.raycastTarget = false;
            Sprite sprite = LoadSprite(assetPath);
            if (!sprite) sprite = CreateFallbackIconSprite(bindingId, alt);
            if (sprite)
            {
                image.sprite = sprite;
                image.preserveAspect = true;
            }

            Stamp(go, sourcePath, sourceFileName, "hud-image", bindingId, alt, path, "");
            AttachHudBinding(go, slot, slotId, bindingId, "image", "", alt, path, false, assetPath, true, HudBindingRoundTripPath(slotId, bindingId));
            return go;
        }

        private static GameObject CreateText(Transform parent, string sourcePath, string sourceFileName, string slot, string slotId, string markerId, string role, string value, string path, string action = "")
        {
            markerId = SafeHudToken(markerId, "text");
            role = SafeHudToken(role, "label");
            value = SafeHudText(value, role.ToUpperInvariant());
            var go = new GameObject(SafeName(role), typeof(RectTransform), typeof(Text));
            go.transform.SetParent(parent, false);
            var rect = go.GetComponent<RectTransform>();
            rect.sizeDelta = new Vector2(Mathf.Clamp((value ?? "").Length * 12f, 80f, 360f), 48f);
            var text = go.GetComponent<Text>();
            text.text = value;
            text.font = Resources.GetBuiltinResource<Font>("Arial.ttf");
            text.fontSize = role == "value" || role == "button-label" ? 24 : 16;
            text.fontStyle = role == "value" ? FontStyle.Bold : FontStyle.Normal;
            text.alignment = TextAnchor.MiddleCenter;
            text.color = Color.white;
            text.raycastTarget = false;
            Stamp(go, sourcePath, sourceFileName, "hud-text", markerId, text.text, path, "");
            AttachHudBinding(go, slot, slotId, markerId, role, action, text.text, path, false, "", false, HudBindingRoundTripPath(slotId, markerId));
            return go;
        }

        private static GreyboxHudBinding AttachHudBinding(GameObject go, string slot, string slotId, string bindingId, string role, string action, string text, string path, bool isButton, string assetPath = "", bool isImage = false, string roundTripJsonPath = "", bool isProgress = false, float progressMin = 0f, float progressMax = 1f, float progressValue = 0f)
        {
            var binding = go.GetComponent<GreyboxHudBinding>() ?? go.AddComponent<GreyboxHudBinding>();
            binding.Slot = slot ?? "";
            binding.SlotId = slotId ?? "";
            binding.BindingId = bindingId ?? "";
            binding.Role = role ?? "";
            binding.Action = action ?? "";
            binding.Text = text ?? "";
            binding.AssetPath = assetPath ?? "";
            binding.JsonPath = path ?? "";
            binding.RoundTripJsonPath = roundTripJsonPath ?? "";
            binding.IsButton = isButton;
            binding.IsImage = isImage;
            binding.IsProgress = isProgress;
            binding.ProgressMin = progressMin;
            binding.ProgressMax = progressMax;
            binding.ProgressValue = progressValue;
            return binding;
        }

        private static string HudSlotRoundTripPath(string slotId)
        {
            return $"$.hud.slots[id={SafeHudToken(slotId, "hud-slot")}]";
        }

        private static string HudBindingRoundTripPath(string slotId, string bindingId)
        {
            return $"{HudSlotRoundTripPath(slotId)}.bindings[id={SafeHudToken(bindingId, "hud-binding")}]";
        }

        private static void ReadProgress(Dictionary<string, string> attrs, out float min, out float max, out float value)
        {
            min = ReadFloat(ValueOr(attrs, "min", "0"), 0f);
            max = ReadFloat(ValueOr(attrs, "max", "1"), 1f);
            if (max <= min) max = min + 1f;
            value = Mathf.Clamp(ReadFloat(ValueOr(attrs, "value", min.ToString(CultureInfo.InvariantCulture)), min), min, max);
        }

        private static float ReadFloat(string value, float fallback)
        {
            return float.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out float parsed)
                ? parsed
                : fallback;
        }

        private static Sprite LoadSprite(string assetPath)
        {
            if (string.IsNullOrWhiteSpace(assetPath)) return null;
            return AssetDatabase.LoadAssetAtPath<Sprite>(assetPath);
        }

        private static Sprite CreateFallbackIconSprite(string bindingId, string alt)
        {
            Texture2D texture = CreateFallbackIconTexture(bindingId, alt);
            var sprite = Sprite.Create(texture, new Rect(0f, 0f, texture.width, texture.height), new Vector2(0.5f, 0.5f), 32f);
            sprite.name = $"{GeneratedIconNamePrefix} {SafeName(bindingId)} Sprite";
            return sprite;
        }

        private static Texture2D CreateFallbackIconTexture(string bindingId, string alt)
        {
            const int size = 32;
            var texture = new Texture2D(size, size, TextureFormat.RGBA32, false)
            {
                name = $"{GeneratedIconNamePrefix} {SafeName(bindingId)} Texture",
                filterMode = FilterMode.Point,
                wrapMode = TextureWrapMode.Clamp,
            };
            string hint = $"{bindingId} {alt}".ToLowerInvariant();
            Color clear = new Color(0f, 0f, 0f, 0f);
            Color spark = new Color(1f, 0.42f, 0.21f, 1f);
            for (int y = 0; y < size; y++)
            {
                for (int x = 0; x < size; x++)
                {
                    texture.SetPixel(x, y, ShouldPaintFallbackIconPixel(x, y, size, hint) ? spark : clear);
                }
            }
            texture.Apply(false, false);
            return texture;
        }

        private static bool ShouldPaintFallbackIconPixel(int x, int y, int size, string hint)
        {
            float nx = (x + 0.5f - size * 0.5f) / (size * 0.5f);
            float ny = (y + 0.5f - size * 0.45f) / (size * 0.5f);
            if (hint.Contains("heart"))
            {
                float heart = Mathf.Pow(nx * nx + ny * ny - 0.32f, 3f) - nx * nx * Mathf.Pow(ny, 3f);
                return heart <= 0f && y < size - 2;
            }

            return Mathf.Abs(nx) + Mathf.Abs(ny) < 0.72f;
        }

        private static bool IsGeneratedIconAsset(string assetName)
        {
            return !string.IsNullOrWhiteSpace(assetName)
                && assetName.StartsWith(GeneratedIconNamePrefix, System.StringComparison.Ordinal);
        }

        private static void PlaceSlot(RectTransform rect, string slot)
        {
            Vector2 anchor = AnchorFor(slot);
            rect.anchorMin = anchor;
            rect.anchorMax = anchor;
            rect.pivot = anchor;
            rect.sizeDelta = new Vector2(slot == "bottom" ? 720f : 560f, 96f);
            rect.anchoredPosition = OffsetFor(slot);
        }

        private static Vector2 AnchorFor(string slot)
        {
            switch ((slot ?? "").ToLowerInvariant())
            {
                case "top-left": return new Vector2(0f, 1f);
                case "top-center": return new Vector2(0.5f, 1f);
                case "top-right": return new Vector2(1f, 1f);
                case "bottom-left": return new Vector2(0f, 0f);
                case "bottom-right": return new Vector2(1f, 0f);
                case "bottom": return new Vector2(0.5f, 0f);
                default: return new Vector2(0.5f, 0.5f);
            }
        }

        private static Vector2 OffsetFor(string slot)
        {
            switch ((slot ?? "").ToLowerInvariant())
            {
                case "top-left": return new Vector2(24f, -24f);
                case "top-center": return new Vector2(0f, -24f);
                case "top-right": return new Vector2(-24f, -24f);
                case "bottom-left": return new Vector2(24f, 24f);
                case "bottom-right": return new Vector2(-24f, 24f);
                case "bottom": return new Vector2(0f, 32f);
                default: return Vector2.zero;
            }
        }

        private static PanelSettings CreatePanelSettings(string layoutId)
        {
            var panelSettings = ScriptableObject.CreateInstance<PanelSettings>();
            panelSettings.name = $"Greybox HUD Panel - {SafeName(layoutId)}";
            panelSettings.scaleMode = PanelScaleMode.ScaleWithScreenSize;
            Vector2 referenceResolution = ReferenceResolutionFor(layoutId);
            panelSettings.referenceResolution = new Vector2Int(Mathf.RoundToInt(referenceResolution.x), Mathf.RoundToInt(referenceResolution.y));
            panelSettings.match = layoutId.ToLowerInvariant().Contains("portrait") ? 1f : 0.5f;
            return panelSettings;
        }

        private static Vector2 ReferenceResolutionFor(string layoutId)
        {
            bool portrait = (layoutId ?? "").ToLowerInvariant().Contains("portrait");
            return portrait ? new Vector2(1080, 1920) : new Vector2(1920, 1080);
        }

        private static void Stamp(GameObject go, string sourcePath, string sourceFileName, string collection, string markerId, string markerName, string path, string positionPath)
        {
            var marker = go.AddComponent<GreyboxMarker>();
            marker.ArtifactKind = GreyboxArtifactKind.HudLayout;
            marker.SourcePath = SafeSourcePath(sourcePath);
            marker.SourceFileName = sourceFileName ?? System.IO.Path.GetFileName(sourcePath ?? "");
            marker.Collection = collection ?? "";
            marker.MarkerId = markerId ?? "";
            marker.MarkerName = markerName ?? "";
            marker.JsonPath = path ?? "";
            marker.PositionJsonPath = positionPath ?? "";
        }

        private static string SourceFileName(string html, string sourcePath)
        {
            var attrs = ParseAttributes(SourceFileMetaRegex.Match(html ?? "").Groups["attrs"].Value);
            string sourceFileName = ValueOr(attrs, "content", "");
            return SafeSourceFileName(sourceFileName, sourcePath);
        }

        private static string SafeSourceFileName(string sourceFileName, string sourcePath)
        {
            string safeAuthored = GreyboxConflictResolver.SafeRoundTripFileName(sourceFileName);
            if (!string.IsNullOrWhiteSpace(safeAuthored)) return safeAuthored;
            return GreyboxConflictResolver.SafeRoundTripFileName(System.IO.Path.GetFileName(sourcePath ?? ""));
        }

        private static string SafeSourcePath(string sourcePath)
        {
            string input = (sourcePath ?? "").Trim().Replace('\\', '/');
            if (string.IsNullOrWhiteSpace(input) || input.Contains("://")) return "";

            var builder = new StringBuilder(System.Math.Min(input.Length, MaxSourcePathLength));
            foreach (char c in input)
            {
                if (char.IsControl(c)) continue;
                builder.Append(c);
                if (builder.Length >= MaxSourcePathLength) break;
            }

            string normalized = builder.ToString().Trim();
            return IsSafeSourcePath(normalized) ? normalized : "";
        }

        private static bool IsSafeSourcePath(string sourcePath)
        {
            if (string.IsNullOrWhiteSpace(sourcePath)) return false;
            if (sourcePath.StartsWith("/", System.StringComparison.Ordinal) || sourcePath.StartsWith("~", System.StringComparison.Ordinal)) return false;
            if (sourcePath.Length >= 2 && sourcePath[1] == ':') return false;
            string[] segments = sourcePath.Split('/');
            foreach (string segment in segments)
            {
                if (string.IsNullOrWhiteSpace(segment) || segment == "." || segment == "..") return false;
            }

            return true;
        }

        private static Dictionary<string, string> ParseAttributes(string attrs)
        {
            var values = new Dictionary<string, string>();
            foreach (Match match in AttributeRegex.Matches(attrs ?? ""))
            {
                values[match.Groups["name"].Value.ToLowerInvariant()] = WebUtility.HtmlDecode(match.Groups["value"].Value);
            }
            return values;
        }

        private static string ValueOr(Dictionary<string, string> attrs, string key, string fallback)
        {
            return attrs.TryGetValue(key.ToLowerInvariant(), out string value) && !string.IsNullOrWhiteSpace(value) ? value.Trim() : fallback;
        }

        private static string StripTags(string html)
        {
            return WebUtility.HtmlDecode(TagRegex.Replace(html ?? "", " ")).Trim();
        }

        private static string SafeName(string value)
        {
            string result = string.IsNullOrWhiteSpace(value) ? "HUD Element" : value.Trim();
            foreach (char c in System.IO.Path.GetInvalidFileNameChars()) result = result.Replace(c, '_');
            return result.Replace('/', '_');
        }

        private static string SafeHudToken(string value, string fallback)
        {
            string input = (value ?? "").Trim();
            if (string.IsNullOrWhiteSpace(input)) return SafeHudTokenFallback(fallback);
            var builder = new StringBuilder(input.Length);
            bool previousDash = false;
            foreach (char c in input)
            {
                bool safe = char.IsLetterOrDigit(c) || c == '_' || c == '-';
                if (safe)
                {
                    builder.Append(c);
                    previousDash = false;
                    continue;
                }
                if (previousDash) continue;
                builder.Append('-');
                previousDash = true;
            }

            string token = builder.ToString().Trim('-');
            if (token.Length > MaxHudTokenLength) token = token.Substring(0, MaxHudTokenLength).Trim('-');
            return string.IsNullOrWhiteSpace(token) ? SafeHudTokenFallback(fallback) : token;
        }

        private static string SafeHudTokenFallback(string fallback)
        {
            return string.IsNullOrWhiteSpace(fallback) ? "hud-element" : SafeHudToken(fallback, "hud-element");
        }

        private static string SafeHudText(string value, string fallback)
        {
            string input = string.IsNullOrWhiteSpace(value) ? fallback : value;
            var builder = new StringBuilder((input ?? "").Length);
            bool previousSpace = false;
            foreach (char c in input ?? "")
            {
                if (char.IsControl(c) || char.IsWhiteSpace(c))
                {
                    if (previousSpace) continue;
                    builder.Append(' ');
                    previousSpace = true;
                    continue;
                }
                builder.Append(c);
                previousSpace = false;
                if (builder.Length >= MaxHudTextLength) break;
            }
            string text = builder.ToString().Trim();
            return string.IsNullOrWhiteSpace(text) ? SafeHudText(fallback, "HUD") : text;
        }
    }
}
