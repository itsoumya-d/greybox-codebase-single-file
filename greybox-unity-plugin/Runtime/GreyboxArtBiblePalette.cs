// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System.Collections.Generic;
using System.Text;
using UnityEngine;

namespace Greybox.Runtime
{
    public sealed class GreyboxArtBiblePalette : ScriptableObject
    {
        public List<string> ColorNames = new List<string>();
        public List<string> HexColors = new List<string>();
        public List<Color> Colors = new List<Color>();
        public List<float> MetallicValues = new List<float>();
        public List<float> SmoothnessValues = new List<float>();
        public List<bool> EmissionEnabled = new List<bool>();
        public List<Color> EmissionColors = new List<Color>();
        public List<string> RenderPipelineHints = new List<string>();
        public string StandalonePalettePath = "";
        public List<string> MaterialAssetPaths = new List<string>();
        [TextArea(4, 20)] public string SourceMarkdown = "";
        public string GeneratorCredit = "";
        public string HumanDesignerCredit = "";
        public string AiDisclosure = "";
        public bool Watermarked;

        public int ColorCount => Colors != null ? Colors.Count : 0;

        public bool TryGetColor(string labelOrHex, out Color color)
        {
            int index = FindColorIndex(labelOrHex);
            if (index >= 0 && Colors != null && index < Colors.Count)
            {
                color = Colors[index];
                return true;
            }

            if (ColorUtility.TryParseHtmlString((labelOrHex ?? "").Trim(), out color)) return true;
            color = default(Color);
            return false;
        }

        public Color ColorOrDefault(string labelOrHex, Color fallback)
        {
            return TryGetColor(labelOrHex, out Color color) ? color : fallback;
        }

        public bool TryGetMaterialAssetPath(string labelOrHex, out string assetPath)
        {
            assetPath = "";
            int index = FindColorIndex(labelOrHex);
            if (index < 0 || MaterialAssetPaths == null || index >= MaterialAssetPaths.Count) return false;
            assetPath = MaterialAssetPaths[index] ?? "";
            return !string.IsNullOrWhiteSpace(assetPath);
        }

        public int FindColorIndex(string labelOrHex)
        {
            string key = NormalizeKey(labelOrHex);
            string hex = (labelOrHex ?? "").Trim().ToUpperInvariant();
            int count = Mathf.Max(ColorNames != null ? ColorNames.Count : 0, HexColors != null ? HexColors.Count : 0);
            for (int index = 0; index < count; index++)
            {
                string name = ColorNames != null && index < ColorNames.Count ? ColorNames[index] : "";
                if (!string.IsNullOrWhiteSpace(key) && NormalizeKey(name) == key) return index;

                string authoredHex = HexColors != null && index < HexColors.Count ? HexColors[index] : "";
                if (!string.IsNullOrWhiteSpace(hex) && string.Equals(authoredHex, hex, System.StringComparison.OrdinalIgnoreCase)) return index;
            }

            return -1;
        }

        private static string NormalizeKey(string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return "";
            var builder = new StringBuilder(value.Length);
            foreach (char c in value)
            {
                if (char.IsLetterOrDigit(c)) builder.Append(char.ToLowerInvariant(c));
            }

            return builder.ToString();
        }
    }
}
