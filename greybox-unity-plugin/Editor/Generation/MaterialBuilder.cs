// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System.Text.RegularExpressions;
using Greybox.Runtime;
using UnityEngine;
using UnityEngine.Rendering;

namespace Greybox.Editor.Generation
{
    public static class MaterialBuilder
    {
        public enum RenderPipelineKind
        {
            Unknown,
            BuiltIn,
            Universal,
            HighDefinition
        }

        public const int MaxMaterialNameLength = 96;
        private const float DefaultMetallic = 0f;
        private const float DefaultSmoothness = 0.55f;
        private static readonly Regex Whitespace = new Regex(@"\s+", RegexOptions.Compiled);

        public static Material Colored(Color color, string name = "Greybox Material")
        {
            return Styled(color, name, DefaultMetallic, DefaultSmoothness, false, Color.black);
        }

        public static Material Styled(Color color, string name, float metallic, float smoothness, bool emissionEnabled, Color emissionColor)
        {
            return Styled(color, name, metallic, smoothness, emissionEnabled, emissionColor, DetectActiveRenderPipelineKind());
        }

        public static Material Styled(Color color, string name, float metallic, float smoothness, bool emissionEnabled, Color emissionColor, RenderPipelineKind pipeline)
        {
            Shader shader = ResolveShader(pipeline);
            if (!shader) throw new System.InvalidOperationException("Greybox could not find a compatible Unity material shader.");
            var material = new Material(shader) { color = color, name = SafeMaterialName(name) };
            ApplyColor(material, color);
            ApplySurface(material, metallic, smoothness);
            ApplyEmission(material, emissionEnabled, emissionColor);
            return material;
        }

        public static RenderPipelineKind DetectActiveRenderPipelineKind()
        {
            RenderPipelineAsset activePipeline = GraphicsSettings.currentRenderPipeline;
            if (!activePipeline) return RenderPipelineKind.BuiltIn;

            string typeName = activePipeline.GetType().FullName ?? activePipeline.GetType().Name;
            if (Contains(typeName, "HDRenderPipeline") || Contains(typeName, "HDRP")) return RenderPipelineKind.HighDefinition;
            if (Contains(typeName, "UniversalRenderPipeline") || Contains(typeName, "Universal") || Contains(typeName, "URP") || Contains(typeName, "LightweightRenderPipeline")) return RenderPipelineKind.Universal;
            return RenderPipelineKind.Unknown;
        }

        public static string[] PreferredShaderNamesForPipeline(RenderPipelineKind pipeline)
        {
            switch (pipeline)
            {
                case RenderPipelineKind.Universal:
                    return new[] { "Universal Render Pipeline/Lit", "Universal Render Pipeline/Simple Lit", "Standard", "Sprites/Default" };
                case RenderPipelineKind.HighDefinition:
                    return new[] { "HDRP/Lit", "HDRenderPipeline/Lit", "Standard", "Sprites/Default" };
                case RenderPipelineKind.BuiltIn:
                    return new[] { "Standard", "Universal Render Pipeline/Lit", "HDRP/Lit", "Sprites/Default" };
                default:
                    return new[] { "Universal Render Pipeline/Lit", "HDRP/Lit", "Standard", "Sprites/Default" };
            }
        }

        public static Shader ResolveShader(RenderPipelineKind pipeline)
        {
            string[] candidates = PreferredShaderNamesForPipeline(pipeline);
            for (int index = 0; index < candidates.Length; index++)
            {
                Shader shader = Shader.Find(candidates[index]);
                if (shader) return shader;
            }
            return Shader.Find("Sprites/Default");
        }

        public static RenderPipelineKind PipelineHintToKind(string hint, RenderPipelineKind fallback = RenderPipelineKind.Unknown)
        {
            string normalized = (hint ?? "").Trim().ToLowerInvariant();
            if (normalized == "universal" || normalized == "urp" || normalized == "lwrp") return RenderPipelineKind.Universal;
            if (normalized == "hdrp" || normalized == "hd" || normalized == "high-definition") return RenderPipelineKind.HighDefinition;
            if (normalized == "built-in" || normalized == "builtin" || normalized == "standard" || normalized == "legacy") return RenderPipelineKind.BuiltIn;
            return fallback;
        }

        private static bool Contains(string value, string fragment)
        {
            return value != null && value.IndexOf(fragment, System.StringComparison.OrdinalIgnoreCase) >= 0;
        }

        private static void ApplyColor(Material material, Color color)
        {
            if (material.HasProperty("_BaseColor")) material.SetColor("_BaseColor", color);
            if (material.HasProperty("_Color")) material.SetColor("_Color", color);
        }

        private static void ApplySurface(Material material, float metallic, float smoothness)
        {
            float clampedMetallic = Mathf.Clamp01(metallic);
            float clampedSmoothness = Mathf.Clamp01(smoothness);
            if (material.HasProperty("_Metallic")) material.SetFloat("_Metallic", clampedMetallic);
            if (material.HasProperty("_Smoothness")) material.SetFloat("_Smoothness", clampedSmoothness);
            if (material.HasProperty("_Glossiness")) material.SetFloat("_Glossiness", clampedSmoothness);
        }

        private static void ApplyEmission(Material material, bool emissionEnabled, Color emissionColor)
        {
            if (!emissionEnabled) return;
            if (material.HasProperty("_EmissionColor")) material.SetColor("_EmissionColor", emissionColor);
            if (material.HasProperty("_EmissiveColor")) material.SetColor("_EmissiveColor", emissionColor);
            material.EnableKeyword("_EMISSION");
        }

        public static Material[] BuildFromPalette(GreyboxArtBiblePalette palette)
        {
            if (!palette) return new Material[0];
            var materials = new Material[palette.Colors.Count];
            RenderPipelineKind activePipeline = DetectActiveRenderPipelineKind();
            for (int index = 0; index < palette.Colors.Count; index++)
            {
                string label = index < palette.ColorNames.Count && !string.IsNullOrWhiteSpace(palette.ColorNames[index])
                    ? palette.ColorNames[index]
                    : $"Color {index + 1}";
                materials[index] = Styled(
                    palette.Colors[index],
                    $"Greybox {label}",
                    ReadFloat(palette.MetallicValues, index, DefaultMetallic),
                    ReadFloat(palette.SmoothnessValues, index, DefaultSmoothness),
                    ReadBool(palette.EmissionEnabled, index, false),
                    ReadColor(palette.EmissionColors, index, Color.black),
                    ReadRenderPipelineHint(palette.RenderPipelineHints, index, activePipeline)
                );
            }
            return materials;
        }

        private static float ReadFloat(System.Collections.Generic.IReadOnlyList<float> values, int index, float fallback)
        {
            return values != null && index >= 0 && index < values.Count ? values[index] : fallback;
        }

        private static bool ReadBool(System.Collections.Generic.IReadOnlyList<bool> values, int index, bool fallback)
        {
            return values != null && index >= 0 && index < values.Count ? values[index] : fallback;
        }

        private static Color ReadColor(System.Collections.Generic.IReadOnlyList<Color> values, int index, Color fallback)
        {
            return values != null && index >= 0 && index < values.Count ? values[index] : fallback;
        }

        private static RenderPipelineKind ReadRenderPipelineHint(System.Collections.Generic.IReadOnlyList<string> values, int index, RenderPipelineKind fallback)
        {
            return values != null && index >= 0 && index < values.Count ? PipelineHintToKind(values[index], fallback) : fallback;
        }

        internal static string SafeMaterialName(string value, string fallback = "Greybox Material")
        {
            string result = Whitespace.Replace(value ?? "", " ").Trim();
            if (string.IsNullOrWhiteSpace(result)) result = fallback;
            foreach (char c in result)
            {
                if (char.IsControl(c)) result = result.Replace(c, '_');
            }
            foreach (char c in System.IO.Path.GetInvalidFileNameChars()) result = result.Replace(c, '_');
            foreach (char c in new[] { '<', '>', '"', '|', '?', '*' }) result = result.Replace(c, '_');
            result = result.Replace('/', '_').Replace('\\', '_').Replace(':', '_').Trim(' ', '_', '-', '`', '.');
            if (string.IsNullOrWhiteSpace(result)) result = fallback;
            return result.Length <= MaxMaterialNameLength ? result : result.Substring(0, MaxMaterialNameLength).TrimEnd();
        }
    }
}
