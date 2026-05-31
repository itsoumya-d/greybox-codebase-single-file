// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System.Reflection;
using Greybox.Editor.Sync;
using Newtonsoft.Json.Linq;
using NUnit.Framework;

namespace Greybox.Tests.EditMode
{
    public sealed class GreyboxCloudClientTests
    {
        [Test]
        public void LicenseValidationUrlRequiresHttpsOutsideLocalRehearsals()
        {
            Assert.True(TryBuildLicenseValidationUrl("https://cloud.greybox.studio", out string productionUrl, out _));
            Assert.AreEqual("https://cloud.greybox.studio/v1/licenses/validate", productionUrl);

            Assert.True(TryBuildLicenseValidationUrl("http://localhost:8787/", out string localhostUrl, out _));
            Assert.AreEqual("http://localhost:8787/v1/licenses/validate", localhostUrl);

            Assert.True(TryBuildLicenseValidationUrl("http://[::1]:8787", out string ipv6Url, out _));
            Assert.AreEqual("http://[::1]:8787/v1/licenses/validate", ipv6Url);

            Assert.False(TryBuildLicenseValidationUrl("http://cloud.greybox.studio", out _, out string remoteHttpMessage));
            StringAssert.Contains("requires HTTPS", remoteHttpMessage);

            Assert.False(TryBuildLicenseValidationUrl("ftp://cloud.greybox.studio", out _, out string schemeMessage));
            StringAssert.Contains("requires HTTPS", schemeMessage);

            Assert.False(TryBuildLicenseValidationUrl("https://cloud.greybox.studio?token=leak", out _, out string queryMessage));
            StringAssert.Contains("query strings", queryMessage);

            Assert.False(TryBuildLicenseValidationUrl("https://user:pass@cloud.greybox.studio", out _, out string credentialMessage));
            StringAssert.Contains("credentials", credentialMessage);

            Assert.False(TryBuildLicenseValidationUrl("", out _, out string emptyMessage));
            StringAssert.Contains("absolute HTTPS", emptyMessage);
        }

        [Test]
        public void LicenseValidationTimeoutAndResponseCapsAreBounded()
        {
            int timeoutMs = PrivateIntConstant("MaxLicenseValidationRequestMs");
            int maxResponseChars = PrivateIntConstant("MaxLicenseValidationResponseChars");

            Assert.Greater(timeoutMs, 0);
            Assert.LessOrEqual(timeoutMs, 5000);
            Assert.Greater(maxResponseChars, 0);
            Assert.LessOrEqual(maxResponseChars, 64 * 1024);
            Assert.True(IsSafeLicenseValidationResponse(@"{""tier"":""pro"",""plan"":""pro"",""status"":""active""}"));
            Assert.False(IsSafeLicenseValidationResponse(""));
            Assert.False(IsSafeLicenseValidationResponse(new string('{', maxResponseChars + 1)));
        }

        [Test]
        public void LicenseValidationRejectsUnsafeBearerKeys()
        {
            int maxKeyChars = PrivateIntConstant("MaxLicenseKeyChars");

            Assert.True(IsSafeLicenseKey("gbx_pro_live_123.ABC-def"));
            Assert.False(IsSafeLicenseKey(""));
            Assert.False(IsSafeLicenseKey("gbx pro live"));
            Assert.False(IsSafeLicenseKey("gbx_pro_live\r\nInjected: true"));
            Assert.False(IsSafeLicenseKey("gbx/pro/live"));
            Assert.False(IsSafeLicenseKey(new string('a', maxKeyChars + 1)));
        }

        [Test]
        public void LicenseValidationFeatureClaimsRequireStrictJsonTypes()
        {
            var features = JObject.Parse(@"{""roundTripSync"":true,""seatLimit"":5,""missing"":null}");

            Assert.True(OptionalBool(features, "roundTripSync"));
            Assert.AreEqual(5, OptionalInt(features, "seatLimit"));
            Assert.IsNull(OptionalBool(features, "missing"));
            Assert.IsNull(OptionalInt(features, "absent"));
            Assert.Throws<System.FormatException>(() => OptionalBool(JObject.Parse(@"{""roundTripSync"":""true""}"), "roundTripSync"));
            Assert.Throws<System.FormatException>(() => OptionalInt(JObject.Parse(@"{""seatLimit"":""5""}"), "seatLimit"));
        }

        [Test]
        public void LicenseValidationIdentityClaimsRequireStrictJsonTypes()
        {
            var body = JObject.Parse(@"{""tier"":""pro"",""plan"":""pro"",""status"":""active"",""features"":{""roundTripSync"":true},""missing"":null}");

            Assert.AreEqual("pro", OptionalLicenseClaim(body, "tier"));
            Assert.AreEqual("active", OptionalLicenseClaim(body, "status"));
            Assert.IsNotNull(OptionalObject(body, "features"));
            Assert.IsNull(OptionalLicenseClaim(body, "missing"));
            Assert.IsNull(OptionalObject(body, "absent"));
            Assert.Throws<System.FormatException>(() => OptionalString(JObject.Parse(@"{""tier"":2}"), "tier"));
            Assert.Throws<System.FormatException>(() => OptionalString(JObject.Parse(@"{""status"":false}"), "status"));
            Assert.Throws<System.FormatException>(() => OptionalObject(JObject.Parse(@"{""features"":[]}"), "features"));
            Assert.Throws<System.FormatException>(() => OptionalObject(JObject.Parse(@"{""features"":""all""}"), "features"));
        }

        [Test]
        public void LicenseValidationIdentityClaimsAreBoundedAndDisplaySafe()
        {
            int maxClaimChars = PrivateIntConstant("MaxLicenseClaimChars");
            int maxMessageChars = PrivateIntConstant("MaxLicenseValidationMessageChars");
            var body = JObject.Parse(@"{""tier"":"" pro "",""expiresAt"":""2027-06-01T00:00:00Z"",""missing"":null}");

            Assert.AreEqual("pro", OptionalLicenseClaim(body, "tier"));
            Assert.AreEqual("2027-06-01T00:00:00Z", OptionalLicenseClaim(body, "expiresAt"));
            Assert.IsNull(OptionalLicenseClaim(body, "missing"));
            Assert.Throws<System.FormatException>(() => OptionalLicenseClaim(JObject.Parse($@"{{""tier"":""{new string('x', maxClaimChars + 1)}""}}"), "tier"));
            Assert.Throws<System.FormatException>(() => OptionalLicenseClaim(JObject.Parse(@"{""status"":""active\nInjected: true""}"), "status"));
            Assert.Throws<System.FormatException>(() => OptionalLicenseClaim(JObject.Parse(@"{""expiresAt"":5}"), "expiresAt"));

            string safeMessage = SafeLicenseValidationMessage("Greybox cloud failed\r\nInjected: true" + new string('x', maxMessageChars + 50));
            Assert.LessOrEqual(safeMessage.Length, maxMessageChars);
            Assert.False(safeMessage.Contains("\r"));
            Assert.False(safeMessage.Contains("\n"));
            StringAssert.Contains("Injected: true", safeMessage);
        }

        private static bool IsSafeLicenseKey(string licenseKey)
        {
            return (bool)typeof(GreyboxCloudClient)
                .GetMethod("IsSafeLicenseKey", BindingFlags.Static | BindingFlags.NonPublic)
                .Invoke(null, new object[] { licenseKey });
        }

        private static bool? OptionalBool(JObject body, string key)
        {
            return InvokePrivateOptional<bool>("OptionalBool", body, key);
        }

        private static int? OptionalInt(JObject body, string key)
        {
            return InvokePrivateOptional<int>("OptionalInt", body, key);
        }

        private static string OptionalString(JObject body, string key)
        {
            return InvokePrivate<string>("OptionalString", body, key);
        }

        private static string OptionalLicenseClaim(JObject body, string key)
        {
            return InvokePrivate<string>("OptionalLicenseClaim", body, key);
        }

        private static JObject OptionalObject(JObject body, string key)
        {
            return InvokePrivate<JObject>("OptionalObject", body, key);
        }

        private static string SafeLicenseValidationMessage(string message)
        {
            return (string)typeof(GreyboxCloudClient)
                .GetMethod("SafeLicenseValidationMessage", BindingFlags.Static | BindingFlags.NonPublic)
                .Invoke(null, new object[] { message });
        }

        private static T InvokePrivate<T>(string methodName, JObject body, string key)
        {
            try
            {
                return (T)typeof(GreyboxCloudClient)
                    .GetMethod(methodName, BindingFlags.Static | BindingFlags.NonPublic)
                    .Invoke(null, new object[] { body, key });
            }
            catch (TargetInvocationException error) when (error.InnerException != null)
            {
                throw error.InnerException;
            }
        }

        private static T? InvokePrivateOptional<T>(string methodName, JObject body, string key) where T : struct
        {
            try
            {
                return (T?)typeof(GreyboxCloudClient)
                    .GetMethod(methodName, BindingFlags.Static | BindingFlags.NonPublic)
                    .Invoke(null, new object[] { body, key });
            }
            catch (TargetInvocationException error) when (error.InnerException != null)
            {
                throw error.InnerException;
            }
        }

        private static bool TryBuildLicenseValidationUrl(string cloudUrl, out string url, out string message)
        {
            object[] args = { cloudUrl, "", "" };
            bool result = (bool)typeof(GreyboxCloudClient)
                .GetMethod("TryBuildLicenseValidationUrl", BindingFlags.Static | BindingFlags.NonPublic)
                .Invoke(null, args);
            url = (string)args[1];
            message = (string)args[2];
            return result;
        }

        private static bool IsSafeLicenseValidationResponse(string responseText)
        {
            return (bool)typeof(GreyboxCloudClient)
                .GetMethod("IsSafeLicenseValidationResponse", BindingFlags.Static | BindingFlags.NonPublic)
                .Invoke(null, new object[] { responseText });
        }

        private static int PrivateIntConstant(string name)
        {
            return (int)typeof(GreyboxCloudClient)
                .GetField(name, BindingFlags.Static | BindingFlags.NonPublic)
                .GetRawConstantValue();
        }
    }
}
