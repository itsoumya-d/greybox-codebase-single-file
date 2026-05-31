// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System;
using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json.Linq;

namespace Greybox.Editor.Windows
{
    public enum GreyboxLicenseTier
    {
        FreePersonal,
        Indie,
        Pro,
        Studio,
    }

    public readonly struct GreyboxLicenseCapabilities
    {
        public readonly GreyboxLicenseTier Tier;
        public readonly bool CanImport;
        public readonly bool CanRoundTrip;
        public readonly bool CanUseMcpBridge;
        public readonly bool HasWatermark;
        public readonly int MaxProjects;
        public readonly bool HasPriorityQueue;
        public readonly bool HasSso;
        public readonly bool HasCustomSkillPacks;
        public readonly int SeatLimit;
        public readonly bool IsSiteLicense;

        public GreyboxLicenseCapabilities(
            GreyboxLicenseTier tier,
            bool canImport,
            bool canRoundTrip,
            bool canUseMcpBridge,
            bool hasWatermark,
            int maxProjects,
            bool hasPriorityQueue,
            bool hasSso,
            bool hasCustomSkillPacks,
            int seatLimit,
            bool isSiteLicense)
        {
            Tier = tier;
            CanImport = canImport;
            CanRoundTrip = canRoundTrip;
            CanUseMcpBridge = canUseMcpBridge;
            HasWatermark = hasWatermark;
            MaxProjects = maxProjects;
            HasPriorityQueue = hasPriorityQueue;
            HasSso = hasSso;
            HasCustomSkillPacks = hasCustomSkillPacks;
            SeatLimit = seatLimit;
            IsSiteLicense = isSiteLicense;
        }

        public static GreyboxLicenseCapabilities ForTier(GreyboxLicenseTier tier)
        {
            switch (tier)
            {
                case GreyboxLicenseTier.Indie:
                    return new GreyboxLicenseCapabilities(tier, true, false, false, false, 0, false, false, false, 1, false);
                case GreyboxLicenseTier.Pro:
                    return new GreyboxLicenseCapabilities(tier, true, true, true, false, 0, true, false, false, 1, false);
                case GreyboxLicenseTier.Studio:
                    return new GreyboxLicenseCapabilities(tier, true, true, true, false, 0, true, true, true, 25, true);
                case GreyboxLicenseTier.FreePersonal:
                default:
                    return new GreyboxLicenseCapabilities(GreyboxLicenseTier.FreePersonal, true, false, false, true, 3, false, false, false, 1, false);
            }
        }

        public static GreyboxLicenseCapabilities FromCloudFeatures(
            GreyboxLicenseTier tier,
            bool? canImport,
            bool? canRoundTrip,
            bool? canUseMcpBridge,
            bool? hasWatermark,
            int? maxProjects,
            bool? hasPriorityQueue,
            bool? hasSso,
            bool? hasCustomSkillPacks,
            int? seatLimit,
            bool? isSiteLicense)
        {
            var fallback = ForTier(tier);
            int projectLimit = ClampProjectLimit(maxProjects, fallback.MaxProjects);
            int seatLimitValue = ClampSeatLimit(seatLimit, fallback.SeatLimit);
            return new GreyboxLicenseCapabilities(
                tier,
                ClampFeature(canImport, fallback.CanImport),
                ClampFeature(canRoundTrip, fallback.CanRoundTrip),
                ClampFeature(canUseMcpBridge, fallback.CanUseMcpBridge),
                ClampWatermark(hasWatermark, fallback.HasWatermark),
                projectLimit,
                ClampFeature(hasPriorityQueue, fallback.HasPriorityQueue),
                ClampFeature(hasSso, fallback.HasSso),
                ClampFeature(hasCustomSkillPacks, fallback.HasCustomSkillPacks),
                seatLimitValue,
                ClampFeature(isSiteLicense, fallback.IsSiteLicense));
        }

        private static bool ClampFeature(bool? requested, bool tierAllows)
        {
            return (requested ?? tierAllows) && tierAllows;
        }

        private static bool ClampWatermark(bool? requested, bool tierRequiresWatermark)
        {
            return tierRequiresWatermark || (requested ?? false);
        }

        private static int ClampProjectLimit(int? requested, int tierLimit)
        {
            int value = requested ?? tierLimit;
            if (tierLimit <= 0) return Math.Max(0, value);
            if (value <= 0) return tierLimit;
            return Math.Min(value, tierLimit);
        }

        private static int ClampSeatLimit(int? requested, int tierLimit)
        {
            int value = requested ?? tierLimit;
            if (tierLimit <= 0) return Math.Max(0, value);
            if (value <= 0) return tierLimit;
            return Math.Min(value, tierLimit);
        }

        public string ProjectLimitLabel => MaxProjects > 0 ? MaxProjects.ToString() : "unlimited";

        public string SeatLimitLabel => SeatLimit > 0 ? SeatLimit.ToString() : "unlimited";

        public string PriceLabel
        {
            get
            {
                switch (Tier)
                {
                    case GreyboxLicenseTier.Indie:
                        return "$149 one-time";
                    case GreyboxLicenseTier.Pro:
                        return "$399 one-time + $9/mo";
                    case GreyboxLicenseTier.Studio:
                        return "$2,999 one-time + $499/yr";
                    case GreyboxLicenseTier.FreePersonal:
                    default:
                        return "$0";
                }
            }
        }

        public string DisplayName
        {
            get
            {
                switch (Tier)
                {
                    case GreyboxLicenseTier.Indie:
                        return "Indie";
                    case GreyboxLicenseTier.Pro:
                        return "Pro";
                    case GreyboxLicenseTier.Studio:
                        return "Studio";
                    case GreyboxLicenseTier.FreePersonal:
                    default:
                        return "Free Personal";
                }
            }
        }
    }

    public static class GreyboxLicenseState
    {
        private const string CapabilityIntegrityPrefix = "greybox-license-capabilities/v1";
        private const int MaxCachedLicenseSnapshotChars = 4096;
        private const int MaxCachedLicenseClaimChars = 128;
        private static readonly TimeSpan MaxCapabilityCacheAge = TimeSpan.FromHours(24);

        public static GreyboxLicenseCapabilities CurrentCapabilities()
        {
            if (TryParseTrustedCapabilities(
                GreyboxSettings.GetLicenseCapabilitiesJson(),
                GreyboxSettings.GetLicenseKey(),
                GreyboxSettings.GetLicenseCapabilitiesIntegrity(),
                out var capabilities))
            {
                return capabilities;
            }
            return GreyboxLicenseCapabilities.ForTier(GreyboxLicenseTier.FreePersonal);
        }

        public static bool TryAuthorizeImport(out GreyboxLicenseCapabilities capabilities, out string message)
        {
            capabilities = CurrentCapabilities();
            if (capabilities.CanImport)
            {
                message = "";
                return true;
            }
            message = "Greybox import is disabled by the current license. Validate an active Free Personal, Indie, Pro, or Studio license in Window/Greybox/License.";
            return false;
        }

        public static GreyboxLicenseTier CurrentTier()
        {
            string cached = GreyboxSettings.GetLicenseTier();
            if (TryParseTier(cached, out GreyboxLicenseTier tier)) return tier;
            return GreyboxLicenseTier.FreePersonal;
        }

        public static bool TryParseTier(string value, out GreyboxLicenseTier tier)
        {
            tier = GreyboxLicenseTier.FreePersonal;
            if (string.IsNullOrWhiteSpace(value)) return false;
            string normalized = value.Trim().Replace("-", "").Replace("_", "");
            if (string.Equals(normalized, "free", StringComparison.OrdinalIgnoreCase)
                || string.Equals(normalized, "freepersonal", StringComparison.OrdinalIgnoreCase)
                || string.Equals(normalized, "personal", StringComparison.OrdinalIgnoreCase))
            {
                tier = GreyboxLicenseTier.FreePersonal;
                return true;
            }
            if (string.Equals(normalized, "indie", StringComparison.OrdinalIgnoreCase))
            {
                tier = GreyboxLicenseTier.Indie;
                return true;
            }
            if (string.Equals(normalized, "pro", StringComparison.OrdinalIgnoreCase))
            {
                tier = GreyboxLicenseTier.Pro;
                return true;
            }
            if (string.Equals(normalized, "professional", StringComparison.OrdinalIgnoreCase))
            {
                tier = GreyboxLicenseTier.Pro;
                return true;
            }
            if (string.Equals(normalized, "studio", StringComparison.OrdinalIgnoreCase)
                || string.Equals(normalized, "studiositelicense", StringComparison.OrdinalIgnoreCase)
                || string.Equals(normalized, "enterprise", StringComparison.OrdinalIgnoreCase))
            {
                tier = GreyboxLicenseTier.Studio;
                return true;
            }
            return false;
        }

        public static bool IsPlanCompatibleWithTier(GreyboxLicenseTier tier, string planValue)
        {
            if (string.IsNullOrWhiteSpace(planValue)) return true;
            if (!TryParseTier(planValue, out GreyboxLicenseTier planTier)) return false;
            return tier == planTier;
        }

        public static bool TryParseCapabilities(string value, out GreyboxLicenseCapabilities capabilities)
        {
            return TryParseCapabilities(value, DateTimeOffset.UtcNow, out capabilities);
        }

        public static bool TryParseCapabilities(string value, DateTimeOffset nowUtc, out GreyboxLicenseCapabilities capabilities)
        {
            capabilities = GreyboxLicenseCapabilities.ForTier(GreyboxLicenseTier.FreePersonal);
            if (string.IsNullOrWhiteSpace(value)) return false;
            if (value.Length > MaxCachedLicenseSnapshotChars) return false;
            try
            {
                var body = JObject.Parse(value);
                string expiresAt = OptionalString(body, "expiresAt") ?? "";
                if (!string.IsNullOrWhiteSpace(expiresAt))
                {
                    if (!DateTimeOffset.TryParse(expiresAt, out var parsedExpiry)) return false;
                    if (parsedExpiry <= nowUtc) return false; // cached license capabilities expired; fail closed.
                }
                else
                {
                    string validatedAt = OptionalString(body, "validatedAt") ?? "";
                    if (!DateTimeOffset.TryParse(validatedAt, out var parsedValidation)) return false;
                    if (parsedValidation > nowUtc.AddMinutes(5)) return false;
                    if (parsedValidation < nowUtc.Subtract(MaxCapabilityCacheAge)) return false;
                }
                string tierValue = OptionalString(body, "tier") ?? "";
                if (!TryParseTier(tierValue, out GreyboxLicenseTier tier)) return false;
                if (!IsPlanCompatibleWithTier(tier, OptionalString(body, "plan") ?? "")) return false;
                capabilities = GreyboxLicenseCapabilities.FromCloudFeatures(
                    tier,
                    OptionalBool(body, "import"),
                    OptionalBool(body, "roundTripSync"),
                    OptionalBool(body, "mcpBridge"),
                    OptionalBool(body, "watermark"),
                    OptionalInt(body, "maxProjects"),
                    OptionalBool(body, "priorityQueue"),
                    OptionalBool(body, "sso"),
                    OptionalBool(body, "customSkillPacks"),
                    OptionalInt(body, "seatLimit"),
                    OptionalBool(body, "siteLicense"));
                return true;
            }
            catch
            {
                return false;
            }
        }

        public static bool TryParseTrustedCapabilities(
            string value,
            string licenseKey,
            string integrity,
            out GreyboxLicenseCapabilities capabilities)
        {
            return TryParseTrustedCapabilities(value, licenseKey, integrity, DateTimeOffset.UtcNow, out capabilities);
        }

        public static bool TryParseTrustedCapabilities(
            string value,
            string licenseKey,
            string integrity,
            DateTimeOffset nowUtc,
            out GreyboxLicenseCapabilities capabilities)
        {
            capabilities = GreyboxLicenseCapabilities.ForTier(GreyboxLicenseTier.FreePersonal);
            if (!TryParseCapabilities(value, nowUtc, out var parsed)) return false;
            if (!VerifyCapabilitySnapshotIntegrity(value, licenseKey, integrity)) return false;
            capabilities = parsed;
            return true;
        }

        public static string CapabilitySnapshotIntegrity(string value, string licenseKey)
        {
            if (string.IsNullOrWhiteSpace(value) || string.IsNullOrWhiteSpace(licenseKey)) return "";
            using var sha = SHA256.Create();
            byte[] bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(
                CapabilityIntegrityPrefix
                + "\n"
                + licenseKey.Trim()
                + "\n"
                + value));
            return BitConverter.ToString(bytes).Replace("-", "").ToLowerInvariant();
        }

        public static bool VerifyCapabilitySnapshotIntegrity(string value, string licenseKey, string integrity)
        {
            string expected = CapabilitySnapshotIntegrity(value, licenseKey);
            if (string.IsNullOrWhiteSpace(expected) || string.IsNullOrWhiteSpace(integrity)) return false;
            return FixedTimeEquals(expected, integrity.Trim().ToLowerInvariant());
        }

        private static bool? OptionalBool(JObject body, string key)
        {
            if (body == null || body[key] == null || body[key].Type == JTokenType.Null) return null;
            if (body[key].Type != JTokenType.Boolean)
            {
                throw new FormatException($"Greybox cached license feature {key} must be a JSON boolean.");
            }
            return body[key].Value<bool>();
        }

        private static int? OptionalInt(JObject body, string key)
        {
            if (body == null || body[key] == null || body[key].Type == JTokenType.Null) return null;
            if (body[key].Type != JTokenType.Integer)
            {
                throw new FormatException($"Greybox cached license feature {key} must be a JSON integer.");
            }
            return body[key].Value<int>();
        }

        private static string OptionalString(JObject body, string key)
        {
            if (body == null || body[key] == null || body[key].Type == JTokenType.Null) return null;
            if (body[key].Type != JTokenType.String)
            {
                throw new FormatException($"Greybox cached license claim {key} must be a JSON string.");
            }
            return SafeCachedLicenseClaim(body[key].Value<string>(), key);
        }

        private static string SafeCachedLicenseClaim(string value, string key)
        {
            string claim = (value ?? "").Trim();
            if (claim.Length > MaxCachedLicenseClaimChars)
            {
                throw new FormatException($"Greybox cached license claim {key} exceeded the {MaxCachedLicenseClaimChars} character safety cap.");
            }
            foreach (char c in claim)
            {
                if (char.IsControl(c))
                {
                    throw new FormatException($"Greybox cached license claim {key} contains control characters.");
                }
            }
            return claim;
        }

        private static bool FixedTimeEquals(string left, string right)
        {
            byte[] leftBytes = Encoding.UTF8.GetBytes(left ?? "");
            byte[] rightBytes = Encoding.UTF8.GetBytes(right ?? "");
            if (leftBytes.Length != rightBytes.Length) return false;
            int diff = 0;
            for (int i = 0; i < leftBytes.Length; i++)
            {
                diff |= leftBytes[i] ^ rightBytes[i];
            }
            return diff == 0;
        }
    }
}
