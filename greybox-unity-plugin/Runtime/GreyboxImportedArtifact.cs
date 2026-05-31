// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using UnityEngine;

namespace Greybox.Runtime
{
    public sealed class GreyboxImportedArtifact : MonoBehaviour
    {
        public GreyboxArtifact Artifact;
        public string ArtifactId = "";
        public GreyboxArtifactKind Kind;
        public string SourcePath = "";
        public string SourceHash = "";
        public string GeneratorCredit = "";
        public string HumanDesignerCredit = "";
        public string AiDisclosure = "";
        public string CanonicalGeneratedAssetPath = "";
        public string ExportedAssetPath = "";
        public string ImportReceiptId = "";
        public string ImportReceiptPath = "";
        public bool ExportedToIncomingSidecar;
        public bool Watermarked;
    }
}
