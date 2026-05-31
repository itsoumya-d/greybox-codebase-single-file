// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using UnityEngine;

namespace Greybox.Runtime
{
    public enum GreyboxArtifactKind
    {
        GameViewport,
        ArtBible,
        HudLayout,
        LevelBoard
    }

    public sealed class GreyboxArtifact : ScriptableObject
    {
        public string ArtifactId = "";
        public string SourcePath = "";
        public GreyboxArtifactKind Kind;
        public string SourceHash = "";
        [TextArea(3, 24)] public string SourceJson = "";
        public string GeneratorCredit = "";
        public string HumanDesignerCredit = "";
        public string AiDisclosure = "";
        public long LastSyncedAtUnixMs;
        public bool Watermarked;
    }
}
