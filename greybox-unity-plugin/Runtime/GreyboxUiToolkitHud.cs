// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;

namespace Greybox.Runtime
{
    [Serializable]
    public sealed class GreyboxUiToolkitHudElement
    {
        public string Slot = "";
        public string SlotId = "";
        public string BindingId = "";
        public string MarkerId = "";
        public string Role = "";
        public string Action = "";
        public string Text = "";
        public string ImageSourcePath = "";
        public string JsonPath = "";
        public bool IsButton;
        public bool IsImage;
        public bool IsProgress;
        public float ProgressMin;
        public float ProgressMax = 1f;
        public float ProgressValue;
    }

    [ExecuteAlways]
    [DisallowMultipleComponent]
    [RequireComponent(typeof(UIDocument))]
    public sealed class GreyboxUiToolkitHud : MonoBehaviour
    {
        private const float StandardSlotWidth = 560f;
        private const float BottomSlotWidth = 720f;
        private const float SlotHeight = 96f;

        public string LayoutId = "";
        public string SourcePath = "";
        public string SourceFileName = "";
        public Vector2 ReferenceResolution = new Vector2(1920f, 1080f);
        public List<GreyboxUiToolkitHudElement> Elements = new List<GreyboxUiToolkitHudElement>();
        public bool ShowFreePersonalWatermark;
        public string WatermarkText = "Greybox Free Personal";
        public GreyboxHudStringEvent OnAction = new GreyboxHudStringEvent();

        private void OnEnable()
        {
            Build();
        }

        private void OnValidate()
        {
            if (isActiveAndEnabled) Build();
        }

        public void Build()
        {
            var document = GetComponent<UIDocument>();
            if (document == null || document.rootVisualElement == null) return;

            VisualElement root = document.rootVisualElement;
            root.Clear();
            root.name = SafeElementName(LayoutId);
            root.pickingMode = PickingMode.Ignore;
            root.style.position = Position.Absolute;
            root.style.left = 0f;
            root.style.right = 0f;
            root.style.top = 0f;
            root.style.bottom = 0f;
            root.style.backgroundColor = new Color(0f, 0f, 0f, 0f);

            var renderedSlots = new HashSet<string>();
            foreach (GreyboxUiToolkitHudElement element in Elements)
            {
                string slotId = string.IsNullOrWhiteSpace(element.SlotId) ? "hud-slot" : element.SlotId;
                if (renderedSlots.Contains(slotId)) continue;
                renderedSlots.Add(slotId);
                root.Add(BuildSlot(slotId, element.Slot));
            }

            foreach (GreyboxUiToolkitHudElement element in Elements)
            {
                string slotId = string.IsNullOrWhiteSpace(element.SlotId) ? "hud-slot" : element.SlotId;
                VisualElement slot = root.Q<VisualElement>(SafeElementName(slotId));
                if (slot != null) slot.Add(BuildControl(element));
            }

            if (ShowFreePersonalWatermark)
            {
                root.Add(BuildWatermark());
            }
        }

        private static VisualElement BuildSlot(string slotId, string slot)
        {
            string normalizedSlot = (slot ?? "").ToLowerInvariant();
            float width = normalizedSlot == "bottom" ? BottomSlotWidth : StandardSlotWidth;
            var view = new VisualElement
            {
                name = SafeElementName(slotId),
                pickingMode = PickingMode.Ignore,
            };
            view.AddToClassList("greybox-hud-slot");
            view.style.position = Position.Absolute;
            view.style.flexDirection = FlexDirection.Row;
            view.style.alignItems = Align.Center;
            view.style.justifyContent = Justify.Center;
            view.style.width = width;
            view.style.height = SlotHeight;
            view.style.paddingLeft = 8f;
            view.style.paddingRight = 8f;
            view.style.paddingTop = 8f;
            view.style.paddingBottom = 8f;
            ApplySlotPosition(view, normalizedSlot, width, SlotHeight);
            return view;
        }

        public bool InvokeAction(string actionId)
        {
            string safeAction = (actionId ?? "").Trim();
            if (string.IsNullOrWhiteSpace(safeAction)) return false;
            foreach (GreyboxUiToolkitHudElement element in Elements)
            {
                string candidate = string.IsNullOrWhiteSpace(element.Action) ? element.BindingId : element.Action;
                if (!element.IsButton || candidate != safeAction) continue;
                RaiseHudAction(element);
                return true;
            }

            return false;
        }

        private VisualElement BuildControl(GreyboxUiToolkitHudElement element)
        {
            VisualElement control = element.IsProgress
                ? BuildProgressControl(element)
                : element.IsImage
                ? BuildImageControl(element)
                : element.IsButton
                ? new Button(() => RaiseHudAction(element)) { text = DisplayText(element) }
                : new Label(DisplayText(element));
            control.name = SafeElementName(string.IsNullOrWhiteSpace(element.BindingId) ? element.Role : element.BindingId);
            control.userData = element.JsonPath;
            control.tooltip = element.JsonPath ?? "";
            control.pickingMode = element.IsButton ? PickingMode.Position : PickingMode.Ignore;
            control.AddToClassList(element.IsProgress ? "greybox-hud-progress" : element.IsImage ? "greybox-hud-image" : element.IsButton ? "greybox-hud-button" : "greybox-hud-label");
            control.style.minWidth = element.IsProgress ? 220f : element.IsImage ? 44f : element.IsButton ? 220f : 72f;
            control.style.height = element.IsProgress ? 44f : element.IsImage ? 44f : element.IsButton ? 52f : 44f;
            control.style.marginLeft = 4f;
            control.style.marginRight = 4f;
            control.style.paddingLeft = 14f;
            control.style.paddingRight = 14f;
            control.style.color = Color.white;
            control.style.unityTextAlign = TextAnchor.MiddleCenter;
            control.style.fontSize = element.Role == "value" || element.IsButton ? 24f : 16f;
            control.style.unityFontStyleAndWeight = element.Role == "value" || element.IsButton ? FontStyle.Bold : FontStyle.Normal;

            if (element.IsProgress || element.IsImage)
            {
                control.style.backgroundColor = new Color(0.04f, 0.04f, 0.05f, 0.72f);
            }
            else if (element.IsButton)
            {
                control.style.backgroundColor = new Color(1f, 0.42f, 0.21f, 0.96f);
                control.style.borderTopLeftRadius = 4f;
                control.style.borderTopRightRadius = 4f;
                control.style.borderBottomLeftRadius = 4f;
                control.style.borderBottomRightRadius = 4f;
            }
            else
            {
                control.style.backgroundColor = new Color(0.04f, 0.04f, 0.05f, 0.72f);
            }

            return control;
        }

        private void RaiseHudAction(GreyboxUiToolkitHudElement element)
        {
            if (element == null) return;
            string action = string.IsNullOrWhiteSpace(element.Action) ? element.BindingId : element.Action;
            if (string.IsNullOrWhiteSpace(action)) return;
            OnAction.Invoke(action);
            GreyboxHudActionDispatcher.Raise(action, element.SlotId, element.BindingId, element.JsonPath, DisplayText(element), this);
        }

        private static Image BuildImageControl(GreyboxUiToolkitHudElement element)
        {
            var image = new Image
            {
                scaleMode = ScaleMode.ScaleToFit,
                tooltip = string.IsNullOrWhiteSpace(element.Text) ? element.ImageSourcePath ?? "" : element.Text.Trim(),
            };
            Texture2D texture = LoadResourcesTexture(element.ImageSourcePath);
            if (texture == null) texture = CreateFallbackIconTexture(element.BindingId, element.Text);
            if (texture != null) image.image = texture;
            image.pickingMode = PickingMode.Ignore;
            image.style.width = 44f;
            image.style.height = 44f;
            return image;
        }

        private static ProgressBar BuildProgressControl(GreyboxUiToolkitHudElement element)
        {
            float min = element.ProgressMin;
            float max = element.ProgressMax <= min ? min + 1f : element.ProgressMax;
            var progress = new ProgressBar
            {
                title = DisplayText(element),
                lowValue = min,
                highValue = max,
                value = Mathf.Clamp(element.ProgressValue, min, max),
            };
            progress.pickingMode = PickingMode.Ignore;
            return progress;
        }

        private VisualElement BuildWatermark()
        {
            var label = new Label(string.IsNullOrWhiteSpace(WatermarkText) ? "Greybox Free Personal" : WatermarkText.Trim())
            {
                name = "Greybox Watermark",
                pickingMode = PickingMode.Ignore,
            };
            label.style.position = Position.Absolute;
            label.style.right = 24f;
            label.style.bottom = 24f;
            label.style.width = 360f;
            label.style.height = 44f;
            label.style.color = new Color(1f, 0.42f, 0.21f, 0.9f);
            label.style.unityFontStyleAndWeight = FontStyle.Bold;
            label.style.unityTextAlign = TextAnchor.MiddleRight;
            label.style.fontSize = 18f;
            return label;
        }

        private static void ApplySlotPosition(VisualElement view, string normalizedSlot, float width, float height)
        {
            switch (normalizedSlot)
            {
                case "top-left":
                    view.style.left = 24f;
                    view.style.top = 24f;
                    break;
                case "top-center":
                    view.style.left = Length.Percent(50f);
                    view.style.top = 24f;
                    view.style.marginLeft = -width * 0.5f;
                    break;
                case "top-right":
                    view.style.right = 24f;
                    view.style.top = 24f;
                    break;
                case "bottom-left":
                    view.style.left = 24f;
                    view.style.bottom = 24f;
                    break;
                case "bottom-right":
                    view.style.right = 24f;
                    view.style.bottom = 24f;
                    break;
                case "bottom":
                    view.style.left = Length.Percent(50f);
                    view.style.bottom = 32f;
                    view.style.marginLeft = -width * 0.5f;
                    break;
                default:
                    view.style.left = Length.Percent(50f);
                    view.style.top = Length.Percent(50f);
                    view.style.marginLeft = -width * 0.5f;
                    view.style.marginTop = -height * 0.5f;
                    break;
            }
        }

        private static string DisplayText(GreyboxUiToolkitHudElement element)
        {
            if (element == null) return "";
            return string.IsNullOrWhiteSpace(element.Text) ? element.Role.ToUpperInvariant() : element.Text.Trim();
        }

        private static Texture2D LoadResourcesTexture(string sourcePath)
        {
            string path = (sourcePath ?? "").Trim().Replace('\\', '/');
            const string prefix = "Resources/";
            int index = path.IndexOf(prefix, StringComparison.OrdinalIgnoreCase);
            if (index < 0) return null;
            string resourcePath = path.Substring(index + prefix.Length);
            int extension = resourcePath.LastIndexOf('.');
            if (extension > 0) resourcePath = resourcePath.Substring(0, extension);
            return string.IsNullOrWhiteSpace(resourcePath) ? null : Resources.Load<Texture2D>(resourcePath);
        }

        private static Texture2D CreateFallbackIconTexture(string bindingId, string label)
        {
            const int size = 32;
            var texture = new Texture2D(size, size, TextureFormat.RGBA32, false)
            {
                name = $"Greybox Generated HUD Icon {SafeElementName(bindingId)} Texture",
                filterMode = FilterMode.Point,
                wrapMode = TextureWrapMode.Clamp,
                hideFlags = HideFlags.HideAndDontSave,
            };
            string hint = $"{bindingId} {label}".ToLowerInvariant();
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

        private static string SafeElementName(string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return "greybox-hud-element";
            return value.Trim().Replace(' ', '-').Replace('/', '-').Replace('\\', '-');
        }
    }
}
