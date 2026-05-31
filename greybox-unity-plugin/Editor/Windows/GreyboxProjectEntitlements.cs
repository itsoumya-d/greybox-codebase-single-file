// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using Greybox.Editor.Sync;
using Greybox.Runtime;

namespace Greybox.Editor.Windows
{
    public readonly struct GreyboxProjectAccess
    {
        public readonly bool Allowed;
        public readonly string Message;
        public readonly int UsedProjects;
        public readonly int MaxProjects;

        public GreyboxProjectAccess(bool allowed, string message, int usedProjects, int maxProjects)
        {
            Allowed = allowed;
            Message = message;
            UsedProjects = usedProjects;
            MaxProjects = maxProjects;
        }
    }

    public static class GreyboxProjectEntitlements
    {
        private const string FreePersonalProjectCapLabel = "3 projects";

        public static GreyboxProjectAccess CurrentProjectAccess(GreyboxConfig config)
        {
            return EvaluateProjectAccess(
                config ? config.ProjectId : "",
                GreyboxLicenseState.CurrentCapabilities(),
                GreyboxSettings.GetTrackedProjectKeys());
        }

        public static bool RegisterCurrentProject(GreyboxConfig config, out string message)
        {
            var capabilities = GreyboxLicenseState.CurrentCapabilities();
            string projectId = config ? config.ProjectId : "";
            string[] existingKeys = GreyboxSettings.GetTrackedProjectKeys();
            var access = EvaluateProjectAccess(projectId, capabilities, existingKeys);
            message = access.Message;
            if (!access.Allowed) return false;
            if (capabilities.MaxProjects <= 0) return true;

            string key = ProjectKey(projectId);
            if (!existingKeys.Contains(key, StringComparer.OrdinalIgnoreCase))
            {
                GreyboxSettings.SetTrackedProjectKeys(existingKeys.Concat(new[] { key }).Distinct(StringComparer.OrdinalIgnoreCase).ToArray());
            }
            return true;
        }

        public static GreyboxProjectAccess EvaluateProjectAccess(
            string projectId,
            GreyboxLicenseCapabilities capabilities,
            IEnumerable<string> existingProjectKeys)
        {
            if (!GreyboxDaemonUrlBuilder.TrySafeProjectId(projectId, out string safeProjectId))
            {
                return new GreyboxProjectAccess(false, "Set a safe Greybox Project ID before importing or syncing.", 0, capabilities.MaxProjects);
            }

            string[] keys = GreyboxSettings.SanitizeTrackedProjectKeys(existingProjectKeys);
            if (capabilities.MaxProjects <= 0)
            {
                return new GreyboxProjectAccess(true, "Unlimited projects for this tier.", keys.Length, 0);
            }

            string key = ProjectKey(safeProjectId);
            bool alreadyTracked = keys.Contains(key, StringComparer.OrdinalIgnoreCase);
            if (alreadyTracked || keys.Length < capabilities.MaxProjects)
            {
                int used = alreadyTracked ? keys.Length : keys.Length + 1;
                return new GreyboxProjectAccess(true, $"Free Personal project usage: {used}/{capabilities.MaxProjects}.", used, capabilities.MaxProjects);
            }

            return new GreyboxProjectAccess(false, $"Free Personal is limited to {FreePersonalProjectCapLabel}. Upgrade to Indie or higher to unlock more projects.", keys.Length, capabilities.MaxProjects);
        }

        public static string ProjectKey(string projectId)
        {
            if (!GreyboxDaemonUrlBuilder.TrySafeProjectId(projectId, out string safeProjectId)) return "";
            string normalized = safeProjectId.ToLowerInvariant();
            using var sha = SHA256.Create();
            byte[] hash = sha.ComputeHash(Encoding.UTF8.GetBytes(normalized));
            return BitConverter.ToString(hash).Replace("-", "").Substring(0, 16).ToLowerInvariant();
        }
    }
}
