// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System;
using Greybox.Runtime;
using UnityEngine.Networking;

namespace Greybox.Editor.Sync
{
    public static class GreyboxDaemonUrlBuilder
    {
        public const int MaxProjectIdChars = 256;

        public static string BuildProjectRoute(GreyboxConfig config, params string[] routeSegments)
        {
            return BuildRoute(config, "/api/projects", routeSegments);
        }

        public static string BuildGameDeliverableRoute(GreyboxConfig config, params string[] routeSegments)
        {
            return BuildRoute(config, "/api/game-deliverables", routeSegments);
        }

        public static bool TrySafeDaemonBaseUrl(string daemonUrl, out string baseUrl)
        {
            baseUrl = "";
            if (!Uri.TryCreate((daemonUrl ?? "").Trim(), UriKind.Absolute, out Uri uri)) return false;
            if (uri.Scheme != Uri.UriSchemeHttps && !(uri.Scheme == Uri.UriSchemeHttp && IsLoopbackHost(uri.Host))) return false;
            if (string.IsNullOrWhiteSpace(uri.Host)) return false;
            if (!string.IsNullOrWhiteSpace(uri.UserInfo)) return false;
            baseUrl = uri.GetLeftPart(UriPartial.Authority).TrimEnd('/');
            return !string.IsNullOrWhiteSpace(baseUrl);
        }

        public static bool TrySafeProjectId(string projectId, out string safeProjectId)
        {
            safeProjectId = (projectId ?? "").Trim();
            if (string.IsNullOrWhiteSpace(safeProjectId) || safeProjectId.Length > MaxProjectIdChars) return false;
            if (safeProjectId.Contains("://")) return false;
            if (safeProjectId == "." || safeProjectId == "..") return false;
            if (safeProjectId.Contains("/") || safeProjectId.Contains("\\")) return false;
            foreach (char c in safeProjectId)
            {
                if (char.IsControl(c)) return false;
            }
            return true;
        }

        private static string BuildRoute(GreyboxConfig config, string routeRoot, string[] routeSegments)
        {
            if (!config || !TrySafeProjectId(config.ProjectId, out string projectId)) return "";
            if (!TrySafeDaemonBaseUrl(config.DaemonUrl, out string baseUrl)) return "";
            string routeTail = SafeRouteTail(routeSegments);
            if (string.IsNullOrWhiteSpace(routeTail)) return "";
            return $"{baseUrl}{routeRoot}/{UnityWebRequest.EscapeURL(projectId)}/{routeTail}";
        }

        private static string SafeRouteTail(string[] routeSegments)
        {
            if (routeSegments == null || routeSegments.Length == 0) return "";
            var escaped = new string[routeSegments.Length];
            for (int index = 0; index < routeSegments.Length; index++)
            {
                string segment = (routeSegments[index] ?? "").Trim();
                if (!IsSafeRouteSegment(segment)) return "";
                escaped[index] = UnityWebRequest.EscapeURL(segment);
            }
            return string.Join("/", escaped);
        }

        private static bool IsSafeRouteSegment(string segment)
        {
            if (string.IsNullOrWhiteSpace(segment)) return false;
            if (segment == "." || segment == "..") return false;
            if (segment.Contains("/") || segment.Contains("\\") || segment.Contains("://")) return false;
            foreach (char c in segment)
            {
                if (char.IsControl(c)) return false;
            }
            return true;
        }

        private static bool IsLoopbackHost(string host)
        {
            if (string.IsNullOrWhiteSpace(host)) return false;
            string normalized = host.Trim().Trim('[', ']').ToLowerInvariant();
            return normalized == "localhost" || normalized == "127.0.0.1" || normalized == "::1";
        }
    }
}
