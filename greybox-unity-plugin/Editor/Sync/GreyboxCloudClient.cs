// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System;
using System.Collections;
using System.Text;
using Greybox.Editor.Windows;
using Greybox.Runtime;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Networking;

namespace Greybox.Editor.Sync
{
    public sealed class GreyboxCloudClient
    {
        private const int MaxLicenseKeyChars = 4096;
        private const int MaxLicenseValidationRequestMs = 5000;
        private const int MaxLicenseValidationResponseChars = 64 * 1024;
        private const int MaxLicenseClaimChars = 128;
        private const int MaxLicenseValidationMessageChars = 512;
        private readonly GreyboxConfig config;

        public bool LastLicenseValidationSucceeded { get; private set; }
        public string LastLicenseValidationMessage { get; private set; } = "";
        public GreyboxLicenseTier? LastValidatedTier { get; private set; }
        public GreyboxLicenseCapabilities? LastValidatedCapabilities { get; private set; }

        public GreyboxCloudClient(GreyboxConfig config)
        {
            this.config = config;
        }

        public IEnumerator ValidateLicense()
        {
            LastLicenseValidationSucceeded = false;
            LastLicenseValidationMessage = "";
            LastValidatedTier = null;
            LastValidatedCapabilities = null;
            string licenseKey = (GreyboxSettings.GetLicenseKey() ?? "").Trim();
            if (!IsSafeLicenseKey(licenseKey))
            {
                ClearCachedLicenseAfterValidationFailure();
                LastLicenseValidationMessage = "A safe Greybox license key is required.";
                yield break;
            }
            if (!TryBuildLicenseValidationUrl(config.CloudUrl, out string url, out string validationUrlMessage))
            {
                ClearCachedLicenseAfterValidationFailure();
                LastLicenseValidationMessage = validationUrlMessage;
                yield break;
            }
            using var request = UnityWebRequest.Post(url, "");
            request.SetRequestHeader("Authorization", $"Bearer {licenseKey}");
            request.timeout = Math.Max(1, (MaxLicenseValidationRequestMs + 999) / 1000);
            long startedAtMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var operation = request.SendWebRequest();
            while (!operation.isDone)
            {
                if (DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - startedAtMs > MaxLicenseValidationRequestMs)
                {
                    request.Abort();
                    ClearCachedLicenseAfterValidationFailure();
                    LastLicenseValidationMessage = $"Greybox license validation timed out after {MaxLicenseValidationRequestMs}ms.";
                    yield break;
                }
                yield return null;
            }
            if (request.result != UnityWebRequest.Result.Success)
            {
                ClearCachedLicenseAfterValidationFailure();
                LastLicenseValidationMessage = SafeLicenseValidationMessage($"Greybox license validation failed: {request.responseCode} {request.error}");
                yield break;
            }
            string responseText = request.downloadHandler?.text ?? "";
            if (!IsSafeLicenseValidationResponse(responseText))
            {
                ClearCachedLicenseAfterValidationFailure();
                LastLicenseValidationMessage = $"Greybox license validation response exceeded the {MaxLicenseValidationResponseChars} character safety cap.";
                yield break;
            }
            try
            {
                var body = JObject.Parse(responseText);
                string tierValue = OptionalLicenseClaim(body, "tier") ?? "";
                string planValue = OptionalLicenseClaim(body, "plan") ?? "";
                string status = OptionalLicenseClaim(body, "status") ?? "active";
                if (!string.Equals(status, "active", System.StringComparison.OrdinalIgnoreCase))
                {
                    ClearCachedLicenseAfterValidationFailure();
                    LastLicenseValidationMessage = SafeLicenseValidationMessage($"Greybox license is {status}; paid features remain disabled.");
                    yield break;
                }
                if (GreyboxLicenseState.TryParseTier(tierValue, out GreyboxLicenseTier tier))
                {
                    if (!GreyboxLicenseState.IsPlanCompatibleWithTier(tier, planValue))
                    {
                        ClearCachedLicenseAfterValidationFailure();
                        LastLicenseValidationMessage = "Greybox license validation response had mismatched tier and plan claims.";
                        yield break;
                    }
                    var features = OptionalObject(body, "features");
                    string expiresAt = OptionalLicenseClaim(body, "expiresAt") ?? "";
                    var capabilities = GreyboxLicenseCapabilities.FromCloudFeatures(
                        tier,
                        OptionalBool(features, "import"),
                        OptionalBool(features, "roundTripSync"),
                        OptionalBool(features, "mcpBridge"),
                        OptionalBool(features, "watermark"),
                        OptionalInt(features, "maxProjects"),
                        OptionalBool(features, "priorityQueue"),
                        OptionalBool(features, "sso"),
                        OptionalBool(features, "customSkillPacks"),
                        OptionalInt(features, "seatLimit"),
                        OptionalBool(features, "siteLicense"));
                    if (!GreyboxSettings.SetLicenseCapabilities(capabilities, expiresAt))
                    {
                        ClearCachedLicenseAfterValidationFailure();
                        LastLicenseValidationMessage = "Greybox license validation response included an unsafe or untrusted capability snapshot.";
                        yield break;
                    }
                    GreyboxSettings.SetLicenseTier(tier);
                    LastValidatedTier = tier;
                    LastValidatedCapabilities = capabilities;
                    LastLicenseValidationSucceeded = true;
                    LastLicenseValidationMessage = SafeLicenseValidationMessage(
                        $"Validated {capabilities.DisplayName} license. Priority queue: {(capabilities.HasPriorityQueue ? "enabled" : "disabled")}. Seats: {capabilities.SeatLimitLabel}."
                        + (string.IsNullOrWhiteSpace(expiresAt) ? "" : $" Expires: {expiresAt}."));
                }
                else
                {
                    ClearCachedLicenseAfterValidationFailure();
                    LastLicenseValidationMessage = "Greybox license validation response did not include a recognized tier.";
                }
            }
            catch (System.Exception ex)
            {
                ClearCachedLicenseAfterValidationFailure();
                LastLicenseValidationMessage = SafeLicenseValidationMessage($"Greybox license validation returned an unreadable response: {ex.Message}");
                Debug.LogWarning(LastLicenseValidationMessage);
            }
        }

        public static void ClearCachedLicenseAfterValidationFailure()
        {
            GreyboxSettings.ClearLicenseTier();
        }

        private static bool? OptionalBool(JObject body, string key)
        {
            if (body == null || body[key] == null || body[key].Type == JTokenType.Null) return null;
            if (body[key].Type != JTokenType.Boolean)
            {
                throw new FormatException($"Greybox license feature {key} must be a JSON boolean.");
            }
            return body[key].Value<bool>();
        }

        private static int? OptionalInt(JObject body, string key)
        {
            if (body == null || body[key] == null || body[key].Type == JTokenType.Null) return null;
            if (body[key].Type != JTokenType.Integer)
            {
                throw new FormatException($"Greybox license feature {key} must be a JSON integer.");
            }
            return body[key].Value<int>();
        }

        private static string OptionalString(JObject body, string key)
        {
            if (body == null || body[key] == null || body[key].Type == JTokenType.Null) return null;
            if (body[key].Type != JTokenType.String)
            {
                throw new FormatException($"Greybox license claim {key} must be a JSON string.");
            }
            return body[key].Value<string>();
        }

        private static string OptionalLicenseClaim(JObject body, string key)
        {
            string value = OptionalString(body, key);
            return value == null ? null : SafeLicenseClaim(value, key);
        }

        private static string SafeLicenseClaim(string value, string key)
        {
            string claim = (value ?? "").Trim();
            if (claim.Length > MaxLicenseClaimChars)
            {
                throw new FormatException($"Greybox license claim {key} exceeded the {MaxLicenseClaimChars} character safety cap.");
            }
            foreach (char c in claim)
            {
                if (char.IsControl(c))
                {
                    throw new FormatException($"Greybox license claim {key} contains control characters.");
                }
            }
            return claim;
        }

        private static string SafeLicenseValidationMessage(string message)
        {
            string value = string.IsNullOrWhiteSpace(message) ? "Greybox license validation failed." : message.Trim();
            int length = Math.Min(value.Length, MaxLicenseValidationMessageChars);
            var builder = new StringBuilder(length);
            for (int i = 0; i < length; i++)
            {
                char c = value[i];
                builder.Append(char.IsControl(c) ? ' ' : c);
            }
            return builder.ToString().Trim();
        }

        private static JObject OptionalObject(JObject body, string key)
        {
            if (body == null || body[key] == null || body[key].Type == JTokenType.Null) return null;
            if (body[key].Type != JTokenType.Object)
            {
                throw new FormatException($"Greybox license claim {key} must be a JSON object.");
            }
            return body[key] as JObject;
        }

        internal static bool IsSafeLicenseValidationResponse(string responseText)
        {
            return !string.IsNullOrWhiteSpace(responseText)
                && responseText.Length <= MaxLicenseValidationResponseChars;
        }

        internal static bool IsSafeLicenseKey(string licenseKey)
        {
            if (string.IsNullOrWhiteSpace(licenseKey) || licenseKey.Length > MaxLicenseKeyChars) return false;
            foreach (char c in licenseKey)
            {
                bool alpha = c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z';
                bool digit = c >= '0' && c <= '9';
                bool safePunctuation = c == '_' || c == '-' || c == '.';
                if (!alpha && !digit && !safePunctuation) return false;
            }
            return true;
        }

        internal static bool TryBuildLicenseValidationUrl(string cloudUrl, out string url, out string message)
        {
            url = "";
            message = "";
            string clean = (cloudUrl ?? "").Trim().TrimEnd('/');
            if (string.IsNullOrWhiteSpace(clean) || !Uri.TryCreate(clean, UriKind.Absolute, out Uri parsed))
            {
                message = "Greybox Cloud URL must be an absolute HTTPS URL.";
                return false;
            }
            if (!string.IsNullOrEmpty(parsed.Query) || !string.IsNullOrEmpty(parsed.Fragment))
            {
                message = "Greybox Cloud URL must not include query strings or fragments.";
                return false;
            }
            if (!string.IsNullOrEmpty(parsed.UserInfo))
            {
                message = "Greybox Cloud URL must not include credentials.";
                return false;
            }

            string host = parsed.Host.Trim('[', ']').ToLowerInvariant();
            bool localRehearsal = host == "localhost" || host == "127.0.0.1" || host == "::1";
            bool secure = parsed.Scheme == Uri.UriSchemeHttps || (parsed.Scheme == Uri.UriSchemeHttp && localRehearsal);
            if (!secure)
            {
                message = "Greybox Cloud license validation requires HTTPS outside localhost.";
                return false;
            }

            url = $"{clean}/v1/licenses/validate";
            return true;
        }
    }
}
