// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using UnityEngine;

namespace Greybox.Runtime
{
    public sealed class GreyboxCameraRig : MonoBehaviour
    {
        public string Mode = "";
        public bool Orthographic = true;
        public float OrthographicSize = 7.5f;
        public Vector3 AuthoredPosition;
        public Color BackgroundColor = new Color(0.06f, 0.07f, 0.08f, 1f);
        public string JsonPath = "$.camera";
    }
}
