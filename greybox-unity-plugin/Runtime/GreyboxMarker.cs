// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using UnityEngine;

namespace Greybox.Runtime
{
    public sealed class GreyboxMarker : MonoBehaviour
    {
        public GreyboxArtifactKind ArtifactKind;
        public string SourcePath = "";
        public string SourceFileName = "";
        public string Collection = "";
        public string MarkerId = "";
        public string MarkerName = "";
        public string JsonPath = "";
        public string PositionJsonPath = "";
        public string UnityAssetPath = "";
        public string UnityAssetGuid = "";
        public string Primitive = "";
    }
}
