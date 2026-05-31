// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System;
using System.Text;
using System.Text.RegularExpressions;
using Greybox.Runtime;
using UnityEngine;

namespace Greybox.Editor.Importers
{
    internal static class GreyboxImportArtifactBuilder
    {
        private const int MaxArtifactNameLength = 120;
        private const int MaxArtifactSourcePathLength = 512;
        private const int MaxArtifactSourceJsonLength = 262144;
        private const int MaxArtifactProvenanceLength = 160;
        private static readonly Regex GeneratorMetaRegex = new Regex(@"<meta\b(?=[^>]*\bname\s*=\s*""generator"")(?=[^>]*\bcontent\s*=\s*""(?<credit>Greybox\s*\+\s*[^""]+)"")[^>]*>", RegexOptions.Compiled | RegexOptions.IgnoreCase);
        private static readonly Regex GeneratorCreditRegex = new Regex(@"Generator credit:\s*(?<credit>Greybox\s*\+\s*[^\.\r\n]+)", RegexOptions.Compiled | RegexOptions.IgnoreCase);
        private static readonly Regex HumanDesignerCreditRegex = new Regex(@"Human designer credit:\s*(?<designer>[^.\r\n,""\]]+)", RegexOptions.Compiled | RegexOptions.IgnoreCase);
        private static readonly Regex GreyboxDesignerRegex = new Regex(@"^Greybox\s*\+\s*(?<designer>.+)$", RegexOptions.Compiled | RegexOptions.IgnoreCase);
        private static readonly Regex ProvenanceWhitespace = new Regex(@"\s+", RegexOptions.Compiled);

        public static GreyboxArtifact Build(GreyboxArtifactKind kind, string sourcePath, string sourceContent, string name, bool watermarked)
        {
            string normalizedPath = NormalizePath(sourcePath);
            string content = sourceContent ?? "";
            ArtifactProvenance provenance = ExtractProvenance(content);
            var artifact = ScriptableObject.CreateInstance<GreyboxArtifact>();
            artifact.name = SafeArtifactName(name);
            artifact.ArtifactId = GreyboxHash.Sha256($"{kind}:{normalizedPath}");
            artifact.Kind = kind;
            artifact.SourcePath = normalizedPath;
            artifact.SourceJson = BoundedSourceJson(content);
            artifact.SourceHash = GreyboxHash.Sha256(content);
            artifact.GeneratorCredit = provenance.GeneratorCredit;
            artifact.HumanDesignerCredit = provenance.HumanDesignerCredit;
            artifact.AiDisclosure = provenance.AiDisclosure;
            artifact.Watermarked = watermarked;
            return artifact;
        }

        public static GreyboxImportedArtifact AttachToRoot(GameObject root, GreyboxArtifact artifact)
        {
            if (!root || !artifact) return null;
            var imported = root.GetComponent<GreyboxImportedArtifact>() ?? root.AddComponent<GreyboxImportedArtifact>();
            imported.Artifact = artifact;
            imported.ArtifactId = artifact.ArtifactId ?? "";
            imported.Kind = artifact.Kind;
            imported.SourcePath = artifact.SourcePath ?? "";
            imported.SourceHash = artifact.SourceHash ?? "";
            imported.GeneratorCredit = artifact.GeneratorCredit ?? "";
            imported.HumanDesignerCredit = artifact.HumanDesignerCredit ?? "";
            imported.AiDisclosure = artifact.AiDisclosure ?? "";
            imported.Watermarked = artifact.Watermarked;
            return imported;
        }

        private static string NormalizePath(string sourcePath)
        {
            string input = (sourcePath ?? "").Trim().Replace('\\', '/');
            if (string.IsNullOrWhiteSpace(input) || input.Contains("://")) return "";

            var builder = new StringBuilder(Math.Min(input.Length, MaxArtifactSourcePathLength));
            foreach (char c in input)
            {
                if (char.IsControl(c)) continue;
                builder.Append(c);
                if (builder.Length >= MaxArtifactSourcePathLength) break;
            }

            string normalized = builder.ToString().Trim();
            return IsSafeArtifactSourcePath(normalized) ? normalized : "";
        }

        private static bool IsSafeArtifactSourcePath(string sourcePath)
        {
            if (string.IsNullOrWhiteSpace(sourcePath)) return false;
            if (sourcePath.StartsWith("/", StringComparison.Ordinal) || sourcePath.StartsWith("~", StringComparison.Ordinal)) return false;
            if (sourcePath.Length >= 2 && sourcePath[1] == ':') return false;
            string[] segments = sourcePath.Split('/');
            foreach (string segment in segments)
            {
                if (string.IsNullOrWhiteSpace(segment) || segment == "." || segment == "..") return false;
            }

            return true;
        }

        private static string SafeArtifactName(string name)
        {
            string input = string.IsNullOrWhiteSpace(name) ? "Greybox Artifact" : name.Trim();
            var builder = new StringBuilder(Math.Min(input.Length, MaxArtifactNameLength));
            foreach (char c in input)
            {
                builder.Append(IsUnsafeUnityObjectNameChar(c) ? '_' : c);
                if (builder.Length >= MaxArtifactNameLength) break;
            }

            string result = builder.ToString().Trim();
            return string.IsNullOrWhiteSpace(result) ? "Greybox Artifact" : result;
        }

        private static bool IsUnsafeUnityObjectNameChar(char c)
        {
            if (char.IsControl(c) || c == '/' || c == '\\') return true;
            foreach (char invalid in System.IO.Path.GetInvalidFileNameChars())
            {
                if (c == invalid) return true;
            }

            return false;
        }

        private static string BoundedSourceJson(string content)
        {
            string source = content ?? "";
            return source.Length <= MaxArtifactSourceJsonLength
                ? source
                : source.Substring(0, MaxArtifactSourceJsonLength);
        }

        private static ArtifactProvenance ExtractProvenance(string content)
        {
            string generator = FirstGroup(content, GeneratorMetaRegex, "credit");
            if (string.IsNullOrWhiteSpace(generator)) generator = FirstGroup(content, GeneratorCreditRegex, "credit");

            string designer = FirstGroup(content, HumanDesignerCreditRegex, "designer");
            if (string.IsNullOrWhiteSpace(designer)) designer = DesignerFromGenerator(generator);
            if (string.IsNullOrWhiteSpace(generator) && !string.IsNullOrWhiteSpace(designer)) generator = $"Greybox + {designer}";

            string disclosure = content.IndexOf("AI-assisted", StringComparison.OrdinalIgnoreCase) >= 0
                ? "AI-assisted"
                : "";

            return new ArtifactProvenance(
                CleanCredit(generator),
                CleanCredit(designer),
                disclosure
            );
        }

        private static string FirstGroup(string content, Regex regex, string groupName)
        {
            Match match = regex.Match(content ?? "");
            return match.Success ? match.Groups[groupName].Value : "";
        }

        private static string DesignerFromGenerator(string generator)
        {
            Match match = GreyboxDesignerRegex.Match(generator ?? "");
            return match.Success ? match.Groups["designer"].Value : "";
        }

        private static string CleanCredit(string value)
        {
            string clean = ProvenanceWhitespace.Replace(value ?? "", " ").Trim().TrimEnd('.', ',', ';');
            if (string.IsNullOrWhiteSpace(clean)) return "";

            var builder = new StringBuilder(Math.Min(clean.Length, MaxArtifactProvenanceLength));
            foreach (char c in clean)
            {
                if (char.IsControl(c)) continue;
                builder.Append(c);
                if (builder.Length >= MaxArtifactProvenanceLength) break;
            }

            return builder.ToString().Trim().TrimEnd('.', ',', ';');
        }

        private readonly struct ArtifactProvenance
        {
            public ArtifactProvenance(string generatorCredit, string humanDesignerCredit, string aiDisclosure)
            {
                GeneratorCredit = generatorCredit;
                HumanDesignerCredit = humanDesignerCredit;
                AiDisclosure = aiDisclosure;
            }

            public string GeneratorCredit { get; }
            public string HumanDesignerCredit { get; }
            public string AiDisclosure { get; }
        }
    }
}
