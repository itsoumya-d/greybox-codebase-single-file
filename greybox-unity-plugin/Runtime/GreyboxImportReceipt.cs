// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System;
using System.Collections.Generic;
using UnityEngine;

namespace Greybox.Runtime
{
    public sealed class GreyboxImportReceipt : ScriptableObject
    {
        public string ReceiptId = "";
        public string ArtifactId = "";
        public GreyboxArtifactKind Kind;
        public string SourcePath = "";
        public string SourceHash = "";
        public string GeneratorCredit = "";
        public string HumanDesignerCredit = "";
        public string AiDisclosure = "";
        public string CanonicalGeneratedAssetPath = "";
        public string ExportedAssetPath = "";
        public string ImportReceiptPath = "";
        public bool ExportedToIncomingSidecar;
        public bool Watermarked;
        public long UpdatedAtUnixMs;
        public List<string> GeneratedAssetPaths = new List<string>();
        public List<string> AddressableLabels = new List<string>();
        public List<GreyboxMissingReferenceRecord> MissingReferences = new List<GreyboxMissingReferenceRecord>();

        public bool HasMissingReferences => MissingReferences != null && MissingReferences.Count > 0;
    }

    [Serializable]
    public sealed class GreyboxMissingReferenceRecord
    {
        public string ObjectPath = "";
        public string ComponentType = "";
        public string ReferenceName = "";
        public string ExpectedAssetPath = "";
    }
}
