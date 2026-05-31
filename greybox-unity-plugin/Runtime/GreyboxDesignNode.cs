// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System;
using System.Collections.Generic;
using UnityEngine;

namespace Greybox.Runtime
{
    public enum GreyboxDesignPropertyKind
    {
        String,
        Number,
        Boolean,
        Vector3,
        Color,
        Json
    }

    [Serializable]
    public sealed class GreyboxDesignProperty
    {
        public string Key = "";
        public GreyboxDesignPropertyKind Kind = GreyboxDesignPropertyKind.String;
        public string Value = "";
    }

    public sealed class GreyboxDesignNode : MonoBehaviour
    {
        public GreyboxArtifactKind ArtifactKind;
        public string Collection = "";
        public string NodeId = "";
        public string DisplayName = "";
        public string JsonPath = "";
        public Vector3 AuthoredPosition;
        public Vector3 AuthoredRotationEuler;
        public Vector3 AuthoredScale = Vector3.one;
        public List<string> Tags = new List<string>();
        public List<GreyboxDesignProperty> Properties = new List<GreyboxDesignProperty>();
        [TextArea(3, 16)] public string SourceJson = "";
    }
}
