// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System.IO;
using Greybox.Editor.Windows;
using Greybox.Runtime;
using Newtonsoft.Json.Linq;
using UnityEditor;

namespace Greybox.Editor.Sync
{
    public sealed class ProjectWatcher
    {
        private readonly GreyboxDaemonClient daemonClient;

        public ProjectWatcher(GreyboxDaemonClient daemonClient)
        {
            this.daemonClient = daemonClient;
        }

        public void NotifyTransformChanged(string assetPath, string objectPath, UnityEngine.Vector3 value)
        {
            if (!GreyboxLicenseState.CurrentCapabilities().CanRoundTrip) return;
            if (string.IsNullOrEmpty(assetPath) || !File.Exists(assetPath)) return;
            _ = daemonClient.SendUnityEditAsync(assetPath, objectPath, DiffApplier.FromVector3(value));
            EditorUtility.SetDirty(AssetDatabase.LoadMainAssetAtPath(assetPath));
        }

        public void NotifyMarkerTransformChanged(GreyboxMarker marker)
        {
            if (!GreyboxLicenseState.CurrentCapabilities().CanRoundTrip) return;
            if (!marker || string.IsNullOrWhiteSpace(marker.PositionJsonPath)) return;
            if (!marker.transform) return;
            string fileName = MarkerSourceFileName(marker);
            if (string.IsNullOrWhiteSpace(fileName))
            {
                UnityEngine.Debug.LogWarning("Greybox refused to send a Unity edit for an unsafe marker source file.");
                return;
            }
            _ = daemonClient.SendUnityEditAsync(fileName, marker.PositionJsonPath, DiffApplier.FromVector3(marker.transform.localPosition));
            EditorUtility.SetDirty(marker.gameObject);
        }

        public void NotifyMarkerFieldChanged(GreyboxMarker marker, string objectPath, JToken value)
        {
            if (!GreyboxLicenseState.CurrentCapabilities().CanRoundTrip) return;
            if (!marker || string.IsNullOrWhiteSpace(objectPath) || value == null) return;
            string fileName = MarkerSourceFileName(marker);
            if (string.IsNullOrWhiteSpace(fileName))
            {
                UnityEngine.Debug.LogWarning("Greybox refused to send a Unity field edit for an unsafe marker source file.");
                return;
            }
            _ = daemonClient.SendUnityEditAsync(fileName, objectPath, value);
            EditorUtility.SetDirty(marker.gameObject);
        }

        private static string MarkerSourceFileName(GreyboxMarker marker)
        {
            if (!marker) return "";
            string authoredFileName = string.IsNullOrWhiteSpace(marker.SourceFileName) ? marker.SourcePath : marker.SourceFileName;
            return GreyboxConflictResolver.SafeRoundTripFileName(authoredFileName);
        }
    }
}
