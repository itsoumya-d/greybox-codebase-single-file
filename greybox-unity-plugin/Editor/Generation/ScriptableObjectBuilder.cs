// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System.Collections.Generic;
using System.Text.RegularExpressions;
using Greybox.Runtime;
using UnityEngine;

namespace Greybox.Editor.Generation
{
    public static class ScriptableObjectBuilder
    {
        public const int MaxArtBiblePaletteColors = 64;
        public const int MaxArtBibleColorNameLength = 80;
        public const int MaxArtBibleSourceMarkdownLength = 65536;
        private static readonly Regex HexColor = new Regex(@"#[0-9a-fA-F]{6}", RegexOptions.Compiled);
        private static readonly Regex MaterialNumber = new Regex(@"\b(?<key>metallic|metalness|smoothness|roughness)\s*[:=]\s*(?<value>[0-9]+(?:\.[0-9]+)?)", RegexOptions.Compiled | RegexOptions.IgnoreCase);
        private static readonly Regex EmissionColor = new Regex(@"\b(?:emission|emissive)\s*[:=]\s*(?<hex>#[0-9a-fA-F]{6})", RegexOptions.Compiled | RegexOptions.IgnoreCase);
        private static readonly Regex RenderPipelineHint = new Regex(@"\b(?:pipeline|renderPipeline|render-pipeline)\s*[:=]\s*(?<value>[a-zA-Z0-9_.-]+)", RegexOptions.Compiled | RegexOptions.IgnoreCase);
        private static readonly Regex Whitespace = new Regex(@"\s+", RegexOptions.Compiled);

        public static GreyboxArtBiblePalette BuildArtBiblePalette(string markdown)
        {
            var palette = ScriptableObject.CreateInstance<GreyboxArtBiblePalette>();
            palette.SourceMarkdown = BoundedSourceMarkdown(markdown);
            var labelCounts = new Dictionary<string, int>(System.StringComparer.OrdinalIgnoreCase);
            foreach (string line in palette.SourceMarkdown.Split(new[] { "\r\n", "\n" }, System.StringSplitOptions.None))
            {
                string lineLabel = "";
                foreach (Match match in HexColor.Matches(line))
                {
                    if (palette.Colors.Count >= MaxArtBiblePaletteColors) break;
                    if (IsEmissionColorMatch(line, match)) continue;
                    string hex = match.Value.ToUpperInvariant();
                    if (!ColorUtility.TryParseHtmlString(hex, out Color color)) continue;
                    if (string.IsNullOrWhiteSpace(lineLabel)) lineLabel = ColorLabel(line, match.Index, hex);
                    string label = UniqueColorLabel(lineLabel, labelCounts);
                    palette.ColorNames.Add(label);
                    palette.HexColors.Add(hex);
                    palette.Colors.Add(color);
                    palette.MetallicValues.Add(ReadMaterialNumber(line, "metallic", "metalness", 0f));
                    palette.SmoothnessValues.Add(ReadSmoothness(line));
                    bool hasEmission = TryReadEmission(line, out Color emission);
                    palette.EmissionEnabled.Add(hasEmission);
                    palette.EmissionColors.Add(hasEmission ? emission : Color.black);
                    palette.RenderPipelineHints.Add(ReadRenderPipelineHint(line));
                }
                if (palette.Colors.Count >= MaxArtBiblePaletteColors) break;
            }
            return palette;
        }

        private static string BoundedSourceMarkdown(string markdown)
        {
            string source = markdown ?? "";
            return source.Length <= MaxArtBibleSourceMarkdownLength
                ? source
                : source.Substring(0, MaxArtBibleSourceMarkdownLength);
        }

        private static string ColorLabel(string line, int hexIndex, string fallback)
        {
            string before = hexIndex > 0 ? line.Substring(0, hexIndex) : "";
            string label = Regex.Replace(before, @"^\s*[-*#>\d.)\s]+", "").Trim(' ', '-', '`', ':');
            return string.IsNullOrWhiteSpace(label) ? fallback : label;
        }

        private static string UniqueColorLabel(string label, Dictionary<string, int> labelCounts)
        {
            string clean = SafeColorLabel(label);
            labelCounts.TryGetValue(clean, out int count);
            count++;
            labelCounts[clean] = count;
            if (count == 1) return clean;
            string suffix = $" {count}";
            string baseName = clean.Length + suffix.Length > MaxArtBibleColorNameLength
                ? clean.Substring(0, MaxArtBibleColorNameLength - suffix.Length).TrimEnd()
                : clean;
            return $"{baseName}{suffix}";
        }

        private static string SafeColorLabel(string label)
        {
            string clean = Whitespace.Replace(label ?? "", " ").Trim();
            if (string.IsNullOrWhiteSpace(clean)) clean = "Color";
            foreach (char c in clean)
            {
                if (char.IsControl(c)) clean = clean.Replace(c, '_');
            }
            foreach (char c in System.IO.Path.GetInvalidFileNameChars()) clean = clean.Replace(c, '_');
            foreach (char c in new[] { '<', '>', '"', '|', '?', '*' }) clean = clean.Replace(c, '_');
            clean = clean.Replace('/', '_').Replace('\\', '_').Replace(':', '_').Trim(' ', '_', '-', '`', '.');
            if (string.IsNullOrWhiteSpace(clean)) clean = "Color";
            return clean.Length <= MaxArtBibleColorNameLength ? clean : clean.Substring(0, MaxArtBibleColorNameLength).TrimEnd();
        }

        private static bool IsEmissionColorMatch(string line, Match colorMatch)
        {
            Match emission = EmissionColor.Match(line ?? "");
            return emission.Success && emission.Groups["hex"].Index == colorMatch.Index;
        }

        private static float ReadSmoothness(string line)
        {
            float smoothness = ReadMaterialNumber(line, "smoothness", "", 0.55f);
            float roughness = ReadMaterialNumber(line, "roughness", "", -1f);
            if (roughness >= 0f) smoothness = 1f - roughness;
            return Mathf.Clamp01(smoothness);
        }

        private static float ReadMaterialNumber(string line, string primaryKey, string secondaryKey, float fallback)
        {
            foreach (Match match in MaterialNumber.Matches(line ?? ""))
            {
                string key = match.Groups["key"].Value;
                if (!string.Equals(key, primaryKey, System.StringComparison.OrdinalIgnoreCase)
                    && !string.Equals(key, secondaryKey, System.StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }
                if (float.TryParse(match.Groups["value"].Value, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out float value))
                {
                    return Mathf.Clamp01(value);
                }
            }
            return fallback;
        }

        private static bool TryReadEmission(string line, out Color emission)
        {
            emission = Color.black;
            Match match = EmissionColor.Match(line ?? "");
            return match.Success && ColorUtility.TryParseHtmlString(match.Groups["hex"].Value, out emission);
        }

        private static string ReadRenderPipelineHint(string line)
        {
            Match match = RenderPipelineHint.Match(line ?? "");
            if (!match.Success) return "";
            string value = match.Groups["value"].Value.Trim().ToLowerInvariant();
            switch (value)
            {
                case "urp":
                case "universal":
                case "universal-render-pipeline":
                case "lwrp":
                case "lightweight":
                case "lightweight-render-pipeline":
                    return "universal";
                case "hdrp":
                case "hd":
                case "high-definition":
                case "high-definition-render-pipeline":
                    return "hdrp";
                case "builtin":
                case "built-in":
                case "standard":
                case "legacy":
                    return "built-in";
                default:
                    return "";
            }
        }
    }
}
