// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using Greybox.Runtime;
using UnityEngine;
using UnityEngine.UI;

namespace Greybox.Editor.Generation
{
    public static class GreyboxWatermarkBuilder
    {
        public const string WatermarkText = "Greybox Free Personal";

        public static void Apply(GameObject root, bool watermarked)
        {
            if (!root || !watermarked) return;
            var marker = root.GetComponent<GreyboxWatermark>() ?? root.AddComponent<GreyboxWatermark>();
            marker.Label = WatermarkText;
            marker.LicenseTier = "Free Personal";
            marker.Visible = true;

            if (root.GetComponent<Canvas>()) ApplyHudWatermark(root);
            else if (root.GetComponent<GreyboxUiToolkitHud>()) ApplyUiToolkitHudWatermark(root);
            else ApplyWorldWatermark(root);
        }

        private static void ApplyWorldWatermark(GameObject root)
        {
            if (root.transform.Find("Greybox Watermark")) return;
            var go = new GameObject("Greybox Watermark", typeof(TextMesh));
            go.transform.SetParent(root.transform, false);
            go.transform.localPosition = new Vector3(0f, 2.25f, 0f);
            go.transform.localScale = Vector3.one * 0.16f;
            var text = go.GetComponent<TextMesh>();
            text.text = WatermarkText;
            text.anchor = TextAnchor.MiddleCenter;
            text.alignment = TextAlignment.Center;
            text.fontSize = 32;
            text.color = new Color(1f, 0.42f, 0.21f, 0.9f);
            MarkGeneratedWatermark(go);
        }

        private static void ApplyHudWatermark(GameObject root)
        {
            if (root.transform.Find("Greybox Watermark")) return;
            var go = new GameObject("Greybox Watermark", typeof(RectTransform), typeof(Text));
            go.transform.SetParent(root.transform, false);
            var rect = go.GetComponent<RectTransform>();
            rect.anchorMin = new Vector2(1f, 0f);
            rect.anchorMax = new Vector2(1f, 0f);
            rect.pivot = new Vector2(1f, 0f);
            rect.anchoredPosition = new Vector2(-24f, 24f);
            rect.sizeDelta = new Vector2(360f, 44f);
            var text = go.GetComponent<Text>();
            text.text = WatermarkText;
            text.font = Resources.GetBuiltinResource<Font>("Arial.ttf");
            text.fontSize = 18;
            text.fontStyle = FontStyle.Bold;
            text.alignment = TextAnchor.MiddleRight;
            text.color = new Color(1f, 0.42f, 0.21f, 0.9f);
            text.raycastTarget = false;
            MarkGeneratedWatermark(go);
        }

        private static void ApplyUiToolkitHudWatermark(GameObject root)
        {
            var hud = root.GetComponent<GreyboxUiToolkitHud>();
            if (hud)
            {
                hud.ShowFreePersonalWatermark = true;
                hud.WatermarkText = WatermarkText;
                hud.Build();
            }

            if (root.transform.Find("Greybox Watermark")) return;
            var go = new GameObject("Greybox Watermark");
            go.transform.SetParent(root.transform, false);
            MarkGeneratedWatermark(go);
        }

        private static void MarkGeneratedWatermark(GameObject go)
        {
            if (!go) return;
            var generated = go.GetComponent<GreyboxGeneratedComponents>() ?? go.AddComponent<GreyboxGeneratedComponents>();
            foreach (Component component in go.GetComponents<Component>())
            {
                generated.Record(component);
            }
        }
    }
}
