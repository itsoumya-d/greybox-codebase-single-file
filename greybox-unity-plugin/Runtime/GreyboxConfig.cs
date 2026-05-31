// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using UnityEngine;

namespace Greybox.Runtime
{
    [CreateAssetMenu(menuName = "Greybox/Config", fileName = "GreyboxConfig")]
    public sealed class GreyboxConfig : ScriptableObject
    {
        public string ProjectId = "";
        public string DaemonUrl = "http://127.0.0.1:17456";
        public string CloudUrl = "https://cloud.greybox.studio";
        public bool RoundTripSyncEnabled;
        public bool McpBridgeEnabled;
    }
}
