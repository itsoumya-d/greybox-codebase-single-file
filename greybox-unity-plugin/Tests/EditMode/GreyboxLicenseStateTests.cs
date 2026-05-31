// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System.Linq;
using Greybox.Editor.Windows;
using Greybox.Editor.Sync;
using NUnit.Framework;

namespace Greybox.Tests.EditMode
{
    public sealed class GreyboxLicenseStateTests
    {
        [Test]
        public void CapabilityMatrixMatchesPricingTiers()
        {
            var free = GreyboxLicenseCapabilities.ForTier(GreyboxLicenseTier.FreePersonal);
            Assert.True(free.CanImport);
            Assert.False(free.CanRoundTrip);
            Assert.False(free.CanUseMcpBridge);
            Assert.True(free.HasWatermark);
            Assert.AreEqual(3, free.MaxProjects);
            Assert.False(free.HasPriorityQueue);
            Assert.False(free.HasSso);
            Assert.False(free.HasCustomSkillPacks);
            Assert.AreEqual(1, free.SeatLimit);
            Assert.False(free.IsSiteLicense);
            Assert.AreEqual("$0", free.PriceLabel);

            var indie = GreyboxLicenseCapabilities.ForTier(GreyboxLicenseTier.Indie);
            Assert.True(indie.CanImport);
            Assert.False(indie.CanRoundTrip);
            Assert.False(indie.CanUseMcpBridge);
            Assert.False(indie.HasWatermark);
            Assert.AreEqual(0, indie.MaxProjects);
            Assert.False(indie.HasPriorityQueue);
            Assert.False(indie.HasSso);
            Assert.False(indie.HasCustomSkillPacks);
            Assert.AreEqual(1, indie.SeatLimit);
            Assert.False(indie.IsSiteLicense);
            Assert.AreEqual("$149 one-time", indie.PriceLabel);

            var pro = GreyboxLicenseCapabilities.ForTier(GreyboxLicenseTier.Pro);
            Assert.True(pro.CanImport);
            Assert.True(pro.CanRoundTrip);
            Assert.True(pro.CanUseMcpBridge);
            Assert.False(pro.HasWatermark);
            Assert.AreEqual(0, pro.MaxProjects);
            Assert.True(pro.HasPriorityQueue);
            Assert.False(pro.HasSso);
            Assert.False(pro.HasCustomSkillPacks);
            Assert.AreEqual(1, pro.SeatLimit);
            Assert.False(pro.IsSiteLicense);
            Assert.AreEqual("$399 one-time + $9/mo", pro.PriceLabel);

            var studio = GreyboxLicenseCapabilities.ForTier(GreyboxLicenseTier.Studio);
            Assert.True(studio.CanImport);
            Assert.True(studio.CanRoundTrip);
            Assert.True(studio.CanUseMcpBridge);
            Assert.False(studio.HasWatermark);
            Assert.AreEqual(0, studio.MaxProjects);
            Assert.True(studio.HasPriorityQueue);
            Assert.True(studio.HasSso);
            Assert.True(studio.HasCustomSkillPacks);
            Assert.AreEqual(25, studio.SeatLimit);
            Assert.True(studio.IsSiteLicense);
            Assert.AreEqual("$2,999 one-time + $499/yr", studio.PriceLabel);
        }

        [Test]
        public void CloudFeaturesCanDisableTierFeaturesButCannotUpgradeTier()
        {
            var capabilities = GreyboxLicenseCapabilities.FromCloudFeatures(
                GreyboxLicenseTier.Pro,
                false,
                true,
                true,
                false,
                0,
                true,
                true,
                true,
                7,
                true);

            Assert.AreEqual(GreyboxLicenseTier.Pro, capabilities.Tier);
            Assert.False(capabilities.CanImport);
            Assert.True(capabilities.CanRoundTrip);
            Assert.True(capabilities.CanUseMcpBridge);
            Assert.False(capabilities.HasWatermark);
            Assert.AreEqual(0, capabilities.MaxProjects);
            Assert.True(capabilities.HasPriorityQueue);
            Assert.False(capabilities.HasSso);
            Assert.False(capabilities.HasCustomSkillPacks);
            Assert.AreEqual(1, capabilities.SeatLimit);
            Assert.False(capabilities.IsSiteLicense);
        }

        [Test]
        public void CloudFeaturesClampFreeAndStudioCommercialCaps()
        {
            var free = GreyboxLicenseCapabilities.FromCloudFeatures(
                GreyboxLicenseTier.FreePersonal,
                true,
                true,
                true,
                false,
                0,
                true,
                true,
                true,
                99,
                true);

            Assert.AreEqual(GreyboxLicenseTier.FreePersonal, free.Tier);
            Assert.True(free.CanImport);
            Assert.False(free.CanRoundTrip);
            Assert.False(free.CanUseMcpBridge);
            Assert.True(free.HasWatermark);
            Assert.AreEqual(3, free.MaxProjects);
            Assert.False(free.HasPriorityQueue);
            Assert.False(free.HasSso);
            Assert.False(free.HasCustomSkillPacks);
            Assert.AreEqual(1, free.SeatLimit);
            Assert.False(free.IsSiteLicense);

            var studio = GreyboxLicenseCapabilities.FromCloudFeatures(
                GreyboxLicenseTier.Studio,
                true,
                true,
                true,
                false,
                0,
                true,
                true,
                true,
                99,
                true);

            Assert.AreEqual(GreyboxLicenseTier.Studio, studio.Tier);
            Assert.True(studio.CanRoundTrip);
            Assert.True(studio.CanUseMcpBridge);
            Assert.True(studio.HasSso);
            Assert.True(studio.HasCustomSkillPacks);
            Assert.AreEqual(25, studio.SeatLimit);
            Assert.True(studio.IsSiteLicense);
        }

        [Test]
        public void ParsesCachedCloudCapabilitySnapshot()
        {
            string snapshot = "{\"tier\":\"pro\",\"expiresAt\":\"2027-05-17T00:00:00.000Z\",\"import\":true,\"roundTripSync\":true,\"mcpBridge\":true,\"watermark\":false,\"maxProjects\":0,\"priorityQueue\":true,\"sso\":true,\"customSkillPacks\":true,\"seatLimit\":9,\"siteLicense\":true}";

            Assert.True(GreyboxLicenseState.TryParseCapabilities(snapshot, System.DateTimeOffset.Parse("2026-05-17T00:00:00.000Z"), out var capabilities));
            Assert.AreEqual(GreyboxLicenseTier.Pro, capabilities.Tier);
            Assert.True(capabilities.CanRoundTrip);
            Assert.True(capabilities.CanUseMcpBridge);
            Assert.True(capabilities.HasPriorityQueue);
            Assert.False(capabilities.HasSso);
            Assert.False(capabilities.HasCustomSkillPacks);
            Assert.AreEqual(1, capabilities.SeatLimit);
            Assert.False(capabilities.IsSiteLicense);

            Assert.False(GreyboxLicenseState.TryParseCapabilities("{\"tier\":\"trial\"}", out _));
            Assert.False(GreyboxLicenseState.TryParseCapabilities("not-json", out _));
        }

        [Test]
        public void RejectsCachedCloudCapabilitySnapshotWithMismatchedPlan()
        {
            string mismatch = "{\"tier\":\"pro\",\"plan\":\"enterprise\",\"expiresAt\":\"2027-05-17T00:00:00.000Z\",\"roundTripSync\":true,\"mcpBridge\":true}";
            Assert.False(GreyboxLicenseState.TryParseCapabilities(
                mismatch,
                System.DateTimeOffset.Parse("2026-05-17T00:00:00.000Z"),
                out var capabilities));
            Assert.AreEqual(GreyboxLicenseTier.FreePersonal, capabilities.Tier);
            Assert.False(capabilities.CanRoundTrip);
            Assert.False(capabilities.CanUseMcpBridge);

            Assert.True(GreyboxLicenseState.IsPlanCompatibleWithTier(GreyboxLicenseTier.Pro, "pro"));
            Assert.True(GreyboxLicenseState.IsPlanCompatibleWithTier(GreyboxLicenseTier.Studio, "enterprise"));
            Assert.False(GreyboxLicenseState.IsPlanCompatibleWithTier(GreyboxLicenseTier.Indie, "enterprise"));
            Assert.False(GreyboxLicenseState.IsPlanCompatibleWithTier(GreyboxLicenseTier.Pro, "trial"));
        }

        [Test]
        public void RejectsCachedCloudCapabilitySnapshotWithStringlyFeatureClaims()
        {
            string stringlyBool = "{\"tier\":\"pro\",\"expiresAt\":\"2027-05-17T00:00:00.000Z\",\"roundTripSync\":\"true\",\"mcpBridge\":true}";
            Assert.False(GreyboxLicenseState.TryParseCapabilities(
                stringlyBool,
                System.DateTimeOffset.Parse("2026-05-17T00:00:00.000Z"),
                out var boolCapabilities));
            Assert.AreEqual(GreyboxLicenseTier.FreePersonal, boolCapabilities.Tier);
            Assert.False(boolCapabilities.CanRoundTrip);

            string stringlyInt = "{\"tier\":\"studio\",\"expiresAt\":\"2027-05-17T00:00:00.000Z\",\"seatLimit\":\"25\",\"roundTripSync\":true,\"mcpBridge\":true}";
            Assert.False(GreyboxLicenseState.TryParseCapabilities(
                stringlyInt,
                System.DateTimeOffset.Parse("2026-05-17T00:00:00.000Z"),
                out var intCapabilities));
            Assert.AreEqual(GreyboxLicenseTier.FreePersonal, intCapabilities.Tier);
            Assert.False(intCapabilities.CanUseMcpBridge);
        }

        [Test]
        public void RejectsCachedCloudCapabilitySnapshotWithNonStringIdentityClaims()
        {
            string numericTier = "{\"tier\":2,\"expiresAt\":\"2027-05-17T00:00:00.000Z\",\"roundTripSync\":true,\"mcpBridge\":true}";
            Assert.False(GreyboxLicenseState.TryParseCapabilities(
                numericTier,
                System.DateTimeOffset.Parse("2026-05-17T00:00:00.000Z"),
                out var tierCapabilities));
            Assert.AreEqual(GreyboxLicenseTier.FreePersonal, tierCapabilities.Tier);
            Assert.False(tierCapabilities.CanRoundTrip);

            string arrayPlan = "{\"tier\":\"pro\",\"plan\":[\"pro\"],\"expiresAt\":\"2027-05-17T00:00:00.000Z\",\"roundTripSync\":true,\"mcpBridge\":true}";
            Assert.False(GreyboxLicenseState.TryParseCapabilities(
                arrayPlan,
                System.DateTimeOffset.Parse("2026-05-17T00:00:00.000Z"),
                out var planCapabilities));
            Assert.AreEqual(GreyboxLicenseTier.FreePersonal, planCapabilities.Tier);
            Assert.False(planCapabilities.CanUseMcpBridge);

            string numericExpiry = "{\"tier\":\"pro\",\"expiresAt\":20270517,\"roundTripSync\":true,\"mcpBridge\":true}";
            Assert.False(GreyboxLicenseState.TryParseCapabilities(
                numericExpiry,
                System.DateTimeOffset.Parse("2026-05-17T00:00:00.000Z"),
                out var expiryCapabilities));
            Assert.AreEqual(GreyboxLicenseTier.FreePersonal, expiryCapabilities.Tier);

            string numericValidation = "{\"tier\":\"pro\",\"validatedAt\":20260517,\"roundTripSync\":true,\"mcpBridge\":true}";
            Assert.False(GreyboxLicenseState.TryParseCapabilities(
                numericValidation,
                System.DateTimeOffset.Parse("2026-05-17T00:00:00.000Z"),
                out var validationCapabilities));
            Assert.AreEqual(GreyboxLicenseTier.FreePersonal, validationCapabilities.Tier);
        }

        [Test]
        public void RejectsCachedCloudCapabilitySnapshotWithUnsafeIdentityClaims()
        {
            string oversizedTier = "{\"tier\":\"" + new string('p', 129) + "\",\"expiresAt\":\"2027-05-17T00:00:00.000Z\",\"roundTripSync\":true,\"mcpBridge\":true}";
            Assert.False(GreyboxLicenseState.TryParseCapabilities(
                oversizedTier,
                System.DateTimeOffset.Parse("2026-05-17T00:00:00.000Z"),
                out var oversizedCapabilities));
            Assert.AreEqual(GreyboxLicenseTier.FreePersonal, oversizedCapabilities.Tier);

            string controlPlan = "{\"tier\":\"pro\",\"plan\":\"pro\\nInjected: true\",\"expiresAt\":\"2027-05-17T00:00:00.000Z\",\"roundTripSync\":true,\"mcpBridge\":true}";
            Assert.False(GreyboxLicenseState.TryParseCapabilities(
                controlPlan,
                System.DateTimeOffset.Parse("2026-05-17T00:00:00.000Z"),
                out var controlCapabilities));
            Assert.AreEqual(GreyboxLicenseTier.FreePersonal, controlCapabilities.Tier);
            Assert.False(controlCapabilities.CanRoundTrip);
        }

        [Test]
        public void RejectsOversizedCachedCloudCapabilitySnapshotBeforeParsing()
        {
            int maxSnapshotChars = PrivateIntConstant("MaxCachedLicenseSnapshotChars");
            string oversizedSnapshot = "{\"tier\":\"pro\",\"expiresAt\":\"2027-05-17T00:00:00.000Z\",\"roundTripSync\":true,\"mcpBridge\":true,\"padding\":\"" + new string('x', maxSnapshotChars + 1) + "\"}";

            Assert.Greater(oversizedSnapshot.Length, maxSnapshotChars);
            Assert.False(GreyboxLicenseState.TryParseCapabilities(
                oversizedSnapshot,
                System.DateTimeOffset.Parse("2026-05-17T00:00:00.000Z"),
                out var capabilities));
            Assert.AreEqual(GreyboxLicenseTier.FreePersonal, capabilities.Tier);
            Assert.False(capabilities.CanRoundTrip);
            Assert.False(capabilities.CanUseMcpBridge);
        }

        [Test]
        public void TrustedCapabilitiesRequireLicenseBoundIntegrity()
        {
            string snapshot = "{\"tier\":\"pro\",\"expiresAt\":\"2027-05-17T00:00:00.000Z\",\"import\":true,\"roundTripSync\":true,\"mcpBridge\":true}";
            string licenseKey = "gbx_pro_valid_123";
            string integrity = GreyboxLicenseState.CapabilitySnapshotIntegrity(snapshot, licenseKey);

            Assert.True(GreyboxLicenseState.TryParseTrustedCapabilities(
                snapshot,
                licenseKey,
                integrity,
                System.DateTimeOffset.Parse("2026-05-17T00:00:00.000Z"),
                out var capabilities));
            Assert.AreEqual(GreyboxLicenseTier.Pro, capabilities.Tier);
            Assert.True(capabilities.CanRoundTrip);
            Assert.True(capabilities.CanUseMcpBridge);

            Assert.False(GreyboxLicenseState.TryParseTrustedCapabilities(
                snapshot,
                "gbx_pro_other_456",
                integrity,
                System.DateTimeOffset.Parse("2026-05-17T00:00:00.000Z"),
                out var wrongKey));
            Assert.AreEqual(GreyboxLicenseTier.FreePersonal, wrongKey.Tier);

            string tampered = snapshot.Replace("\"mcpBridge\":true", "\"mcpBridge\":false");
            Assert.False(GreyboxLicenseState.TryParseTrustedCapabilities(
                tampered,
                licenseKey,
                integrity,
                System.DateTimeOffset.Parse("2026-05-17T00:00:00.000Z"),
                out _));
            Assert.False(GreyboxLicenseState.TryParseTrustedCapabilities(snapshot, licenseKey, "", out _));
        }

        [Test]
        public void ExpiredCachedCloudCapabilitySnapshotFailsClosed()
        {
            string snapshot = "{\"tier\":\"studio\",\"expiresAt\":\"2026-01-01T00:00:00.000Z\",\"roundTripSync\":true,\"mcpBridge\":true,\"siteLicense\":true}";

            Assert.False(GreyboxLicenseState.TryParseCapabilities(snapshot, System.DateTimeOffset.Parse("2026-05-17T00:00:00.000Z"), out var capabilities));
            Assert.AreEqual(GreyboxLicenseTier.FreePersonal, capabilities.Tier);
            Assert.False(capabilities.CanRoundTrip);
            Assert.False(capabilities.CanUseMcpBridge);
        }

        [Test]
        public void CachedCloudCapabilitySnapshotRequiresFreshValidationWhenNoExpiryIsPresent()
        {
            string fresh = "{\"tier\":\"pro\",\"validatedAt\":\"2026-05-17T11:30:00.000Z\",\"roundTripSync\":true,\"mcpBridge\":true}";
            Assert.True(GreyboxLicenseState.TryParseCapabilities(
                fresh,
                System.DateTimeOffset.Parse("2026-05-17T12:00:00.000Z"),
                out var freshCapabilities));
            Assert.True(freshCapabilities.CanRoundTrip);
            Assert.True(freshCapabilities.CanUseMcpBridge);

            string stale = "{\"tier\":\"pro\",\"validatedAt\":\"2026-05-16T11:59:00.000Z\",\"roundTripSync\":true,\"mcpBridge\":true}";
            Assert.False(GreyboxLicenseState.TryParseCapabilities(
                stale,
                System.DateTimeOffset.Parse("2026-05-17T12:00:00.000Z"),
                out var staleCapabilities));
            Assert.AreEqual(GreyboxLicenseTier.FreePersonal, staleCapabilities.Tier);
            Assert.False(staleCapabilities.CanRoundTrip);
            Assert.False(staleCapabilities.CanUseMcpBridge);

            string missingValidation = "{\"tier\":\"pro\",\"roundTripSync\":true,\"mcpBridge\":true}";
            Assert.False(GreyboxLicenseState.TryParseCapabilities(
                missingValidation,
                System.DateTimeOffset.Parse("2026-05-17T12:00:00.000Z"),
                out _));
        }

        [Test]
        public void CurrentCapabilitiesRequireCloudValidatedSnapshot()
        {
            GreyboxSettings.SetLicenseTier(GreyboxLicenseTier.Pro);
            GreyboxSettings.ClearLicenseCapabilities();

            var capabilities = GreyboxLicenseState.CurrentCapabilities();

            Assert.AreEqual(GreyboxLicenseTier.FreePersonal, capabilities.Tier);
            Assert.False(capabilities.CanRoundTrip);
            Assert.False(capabilities.CanUseMcpBridge);
            GreyboxSettings.ClearLicenseTier();
        }

        [Test]
        public void CurrentCapabilitiesAreBoundToStoredLicenseKey()
        {
            GreyboxSettings.SetLicenseKey("gbx_pro_bound_123");
            Assert.True(GreyboxSettings.SetLicenseCapabilities(
                GreyboxLicenseCapabilities.ForTier(GreyboxLicenseTier.Pro),
                "2027-05-17T00:00:00.000Z"));

            var validated = GreyboxLicenseState.CurrentCapabilities();
            Assert.AreEqual(GreyboxLicenseTier.Pro, validated.Tier);
            Assert.True(validated.CanRoundTrip);
            Assert.True(validated.CanUseMcpBridge);
            Assert.True(GreyboxLicenseState.VerifyCapabilitySnapshotIntegrity(
                GreyboxSettings.GetLicenseCapabilitiesJson(),
                GreyboxSettings.GetLicenseKey(),
                GreyboxSettings.GetLicenseCapabilitiesIntegrity()));

            GreyboxSettings.SetLicenseKey("gbx_pro_other_456");
            var rebound = GreyboxLicenseState.CurrentCapabilities();
            Assert.AreEqual(GreyboxLicenseTier.FreePersonal, rebound.Tier);
            Assert.False(rebound.CanRoundTrip);
            Assert.False(rebound.CanUseMcpBridge);

            GreyboxSettings.SetLicenseKey("");
        }

        [Test]
        public void LicenseCapabilitySnapshotsRejectUnsafeExpiryBeforeCaching()
        {
            GreyboxSettings.SetLicenseKey("gbx_pro_expiry_guard_123");
            var pro = GreyboxLicenseCapabilities.ForTier(GreyboxLicenseTier.Pro);

            Assert.False(GreyboxSettings.SetLicenseCapabilities(pro, "not-a-date"));
            Assert.AreEqual("", GreyboxSettings.GetLicenseCapabilitiesJson());
            Assert.AreEqual(GreyboxLicenseTier.FreePersonal, GreyboxLicenseState.CurrentCapabilities().Tier);

            Assert.False(GreyboxSettings.SetLicenseCapabilities(pro, "2027-05-17T00:00:00.000Z\nInjected: true"));
            Assert.AreEqual("", GreyboxSettings.GetLicenseCapabilitiesJson());

            Assert.False(GreyboxSettings.SetLicenseCapabilities(pro, new string('2', 129)));
            Assert.AreEqual("", GreyboxSettings.GetLicenseCapabilitiesJson());

            Assert.True(GreyboxSettings.SetLicenseCapabilities(pro, "2027-05-17T00:00:00.000Z"));
            Assert.AreEqual(GreyboxLicenseTier.Pro, GreyboxLicenseState.CurrentCapabilities().Tier);
            GreyboxSettings.SetLicenseKey("");
        }

        [Test]
        public void ImportAuthorizationFailsClosedWhenCloudDisablesImport()
        {
            GreyboxSettings.SetLicenseKey("gbx_pro_import_disabled_123");
            Assert.True(GreyboxSettings.SetLicenseCapabilities(
                new GreyboxLicenseCapabilities(
                    GreyboxLicenseTier.Pro,
                    false,
                    true,
                    true,
                    false,
                    0,
                    true,
                    false,
                    false,
                    1,
                    false),
                "2027-05-17T00:00:00.000Z"));

            Assert.False(GreyboxLicenseState.TryAuthorizeImport(out var capabilities, out string message));
            Assert.False(capabilities.CanImport);
            StringAssert.Contains("import is disabled", message);

            GreyboxSettings.SetLicenseKey("");
        }

        [Test]
        public void EnforcesFreePersonalThreeProjectCap()
        {
            var free = GreyboxLicenseCapabilities.ForTier(GreyboxLicenseTier.FreePersonal);
            string a = GreyboxProjectEntitlements.ProjectKey("project-a");
            string b = GreyboxProjectEntitlements.ProjectKey("project-b");
            string c = GreyboxProjectEntitlements.ProjectKey("project-c");

            var existing = GreyboxProjectEntitlements.EvaluateProjectAccess("project-b", free, new[] { a, b, c });
            Assert.True(existing.Allowed);
            Assert.AreEqual(3, existing.UsedProjects);

            var overflow = GreyboxProjectEntitlements.EvaluateProjectAccess("project-d", free, new[] { a, b, c });
            Assert.False(overflow.Allowed);
            StringAssert.Contains("limited to 3 projects", overflow.Message);

            var poisoned = GreyboxProjectEntitlements.EvaluateProjectAccess("project-a", free, new[] { "../bad", "not-a-hash", a.ToUpperInvariant() });
            Assert.True(poisoned.Allowed);
            Assert.AreEqual(1, poisoned.UsedProjects);
        }

        [Test]
        public void ProjectEntitlementsUseSafeCanonicalProjectIds()
        {
            var free = GreyboxLicenseCapabilities.ForTier(GreyboxLicenseTier.FreePersonal);
            Assert.AreEqual(GreyboxProjectEntitlements.ProjectKey("Project A"), GreyboxProjectEntitlements.ProjectKey(" project a "));
            Assert.AreEqual("", GreyboxProjectEntitlements.ProjectKey("project/42"));
            Assert.AreEqual("", GreyboxProjectEntitlements.ProjectKey("https://example.test/project-42"));
            Assert.AreEqual("", GreyboxProjectEntitlements.ProjectKey("project\n42"));

            var unsafeAccess = GreyboxProjectEntitlements.EvaluateProjectAccess("project/42", free, new string[0]);
            Assert.False(unsafeAccess.Allowed);
            StringAssert.Contains("safe Greybox Project ID", unsafeAccess.Message);
        }

        [Test]
        public void TrackedProjectKeysAreCanonicalBoundedHashes()
        {
            string a = GreyboxProjectEntitlements.ProjectKey("project-a");
            string b = GreyboxProjectEntitlements.ProjectKey("project-b");
            string[] safeKeys = GreyboxSettings.SanitizeTrackedProjectKeys(new[]
            {
                a.ToUpperInvariant(),
                b,
                "../bad",
                "not-a-hash",
                "0123456789abcdeg",
                new string('f', 17),
                a,
            });

            CollectionAssert.AreEqual(new[] { a, b }, safeKeys);

            string[] many = Enumerable.Range(0, 70)
                .Select(index => GreyboxProjectEntitlements.ProjectKey($"project-{index}"))
                .ToArray();
            GreyboxSettings.SetTrackedProjectKeys(many);

            string[] stored = GreyboxSettings.GetTrackedProjectKeys();
            Assert.AreEqual(64, stored.Length);
            Assert.True(stored.All(key => key.Length == 16));
            Assert.True(stored.All(key => key.All(c => c >= '0' && c <= '9' || c >= 'a' && c <= 'f')));
            GreyboxSettings.ClearTrackedProjectKeys();
        }

        [Test]
        public void PaidTiersAllowUnlimitedProjects()
        {
            var indie = GreyboxLicenseCapabilities.ForTier(GreyboxLicenseTier.Indie);
            var access = GreyboxProjectEntitlements.EvaluateProjectAccess("project-d", indie, new[] { "a", "b", "c" });
            Assert.True(access.Allowed);
            Assert.AreEqual(0, access.MaxProjects);
        }

        [Test]
        public void ParsesCloudTierValues()
        {
            Assert.True(GreyboxLicenseState.TryParseTier("free-personal", out var free));
            Assert.AreEqual(GreyboxLicenseTier.FreePersonal, free);

            Assert.True(GreyboxLicenseState.TryParseTier("studio", out var studio));
            Assert.AreEqual(GreyboxLicenseTier.Studio, studio);

            Assert.True(GreyboxLicenseState.TryParseTier("studio_site_license", out var site));
            Assert.AreEqual(GreyboxLicenseTier.Studio, site);

            Assert.True(GreyboxLicenseState.TryParseTier("enterprise", out var enterprise));
            Assert.AreEqual(GreyboxLicenseTier.Studio, enterprise);

            Assert.False(GreyboxLicenseState.TryParseTier("trial", out _));
            Assert.False(GreyboxLicenseState.TryParseTier("2", out _));
            Assert.False(GreyboxLicenseState.TryParseTier("0", out _));
        }

        [Test]
        public void RejectsLocalPaidPrefixActivation()
        {
            Assert.False(GreyboxLicenseState.TryParseCapabilities("", out var missing));
            Assert.AreEqual(GreyboxLicenseTier.FreePersonal, missing.Tier);
            Assert.False(missing.CanRoundTrip);
            Assert.False(missing.CanUseMcpBridge);
        }

        [Test]
        public void LicenseValidationFailuresClearCachedPaidCapabilities()
        {
            GreyboxSettings.SetLicenseKey("gbx_pro_revoked_123");
            GreyboxSettings.SetLicenseTier(GreyboxLicenseTier.Pro);
            Assert.True(GreyboxSettings.SetLicenseCapabilities(
                GreyboxLicenseCapabilities.ForTier(GreyboxLicenseTier.Pro),
                "2027-05-17T00:00:00.000Z"));
            Assert.AreEqual(GreyboxLicenseTier.Pro, GreyboxLicenseState.CurrentCapabilities().Tier);

            GreyboxCloudClient.ClearCachedLicenseAfterValidationFailure();

            var capabilities = GreyboxLicenseState.CurrentCapabilities();
            Assert.AreEqual(GreyboxLicenseTier.FreePersonal, capabilities.Tier);
            Assert.False(capabilities.CanRoundTrip);
            Assert.False(capabilities.CanUseMcpBridge);
            Assert.AreEqual("gbx_pro_revoked_123", GreyboxSettings.GetLicenseKey());
            GreyboxSettings.SetLicenseKey("");
        }

        private static int PrivateIntConstant(string name)
        {
            return (int)typeof(GreyboxLicenseState)
                .GetField(name, System.Reflection.BindingFlags.Static | System.Reflection.BindingFlags.NonPublic)
                .GetRawConstantValue();
        }
    }
}
