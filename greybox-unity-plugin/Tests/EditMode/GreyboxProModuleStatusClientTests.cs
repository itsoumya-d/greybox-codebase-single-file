// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System.Reflection;
using Greybox.Editor.Sync;
using NUnit.Framework;

namespace Greybox.Tests.EditMode
{
    public sealed class GreyboxProModuleStatusClientTests
    {
        [Test]
        public void ParseCountsLicensedBlockedAndEngineTargetMetadata()
        {
            GreyboxProModuleStatus status = Parse(@"{
              ""modules"": [
                { ""status"": "" LICENSED "" },
                { ""status"": ""license-required"" },
                { ""status"": ""blocked"" }
              ],
              ""rejected"": [
                { ""id"": ""bad-signature"" },
                { ""id"": ""expired-license"" }
              ],
              ""registries"": {
                ""engineTargets"": [
                  { ""title"": ""Unity Full Prefab Export Pro"" },
                  { ""id"": ""unreal-blueprint-export-pro"" }
                ]
              }
            }");

            Assert.AreEqual(1, status.LicensedCount);
            Assert.AreEqual(1, status.LicenseRequiredCount);
            Assert.AreEqual(3, status.BlockedCount);
            Assert.AreEqual(2, status.EngineTargetCount);
            Assert.AreEqual("Unity Full Prefab Export Pro, unreal-blueprint-export-pro", status.EngineTargetNames);
            Assert.AreEqual("Licensed Pro module metadata is available for import.", status.SummaryMessage);
            Assert.True(status.HasAny);
        }

        [Test]
        public void SummaryMessageDistinguishesUnlicensedAndEmptyProStatus()
        {
            Assert.AreEqual(
                "No project-local Pro modules found.",
                new GreyboxProModuleStatus().SummaryMessage);

            Assert.AreEqual(
                "Pro modules found, but none are licensed for import.",
                Parse(@"{""modules"":[{""status"":""license-required""},{""status"":""blocked""}]}").SummaryMessage);

            Assert.AreEqual(
                "Licensed Pro module metadata is available for import.",
                Parse(@"{""registries"":{""engineTargets"":[{""title"":""Unity Full Prefab Export Pro""}]}}").SummaryMessage);
        }

        [Test]
        public void ParseFailsClosedForMalformedJson()
        {
            GreyboxProModuleStatus status = Parse("{nope");

            AssertEmpty(status);
        }

        [Test]
        public void ParseFailsClosedForStringlyProStatusClaims()
        {
            AssertEmpty(Parse(@"{""modules"":{""status"":""licensed""}}"));
            AssertEmpty(Parse(@"{""modules"":[1]}"));
            AssertEmpty(Parse(@"{""modules"":[{""status"":true}]}"));
            AssertEmpty(Parse(@"{""rejected"":{""id"":""bad-signature""}}"));
            AssertEmpty(Parse(@"{""rejected"":[1]}"));
            AssertEmpty(Parse(@"{""registries"":[]}"));
            AssertEmpty(Parse(@"{""registries"":{""engineTargets"":{""title"":""Unity""}}}"));
            AssertEmpty(Parse(@"{""registries"":{""engineTargets"":[1]}}"));
            AssertEmpty(Parse(@"{""registries"":{""engineTargets"":[{""title"":123}]}}"));
        }

        [Test]
        public void ParseSanitizesAndCapsEngineTargetNames()
        {
            GreyboxProModuleStatus status = Parse(@"{
              ""registries"": {
                ""engineTargets"": [
                  { ""title"": ""Unity\u0000 Export\nTarget"" },
                  { ""title"": ""Second Target"" },
                  { ""title"": ""Third Target"" },
                  { ""title"": ""Fourth Target"" },
                  { ""title"": ""Fifth Target"" },
                  { ""title"": ""Sixth Target"" }
                ]
              }
            }");

            Assert.AreEqual(6, status.EngineTargetCount);
            Assert.AreEqual("Unity Export Target, Second Target, Third Target, Fourth Target, Fifth Target, +1 more", status.EngineTargetNames);
            StringAssert.DoesNotContain("\n", status.EngineTargetNames);
            StringAssert.DoesNotContain("\0", status.EngineTargetNames);
        }

        [Test]
        public void ParseTruncatesOversizedEngineTargetNames()
        {
            GreyboxProModuleStatus status = Parse(@"{""registries"":{""engineTargets"":[{""title"":""" + new string('A', 120) + @"""}]}}");

            Assert.AreEqual(1, status.EngineTargetCount);
            Assert.LessOrEqual(status.EngineTargetNames.Length, 64);
        }

        [Test]
        public void ParseFailsClosedForOversizedStatusJson()
        {
            int maxChars = PrivateIntConstant("MaxProModuleStatusJsonChars");
            GreyboxProModuleStatus status = Parse("{" + new string('x', maxChars));

            AssertEmpty(status);
        }

        [Test]
        public void ParseFailsClosedForOversizedCollectionsAndStatusValues()
        {
            int maxItems = PrivateIntConstant("MaxProModuleStatusItems");

            AssertEmpty(Parse(@"{""modules"":[" + RepeatJson(@"{""status"":""licensed""}", maxItems + 1) + "]}"));
            AssertEmpty(Parse(@"{""rejected"":[" + RepeatJson(@"{""id"":""bad-signature""}", maxItems + 1) + "]}"));
            AssertEmpty(Parse(@"{""registries"":{""engineTargets"":[" + RepeatJson(@"{""title"":""Unity""}", maxItems + 1) + "]}}"));
            AssertEmpty(Parse(@"{""modules"":[{""status"":""" + new string('s', PrivateIntConstant("MaxProModuleStatusValueChars") + 1) + @"""}]}"));
            AssertEmpty(Parse(@"{""modules"":[{""status"":""licensed\n""}]}"));
        }

        private static void AssertEmpty(GreyboxProModuleStatus status)
        {
            Assert.AreEqual(0, status.LicensedCount);
            Assert.AreEqual(0, status.LicenseRequiredCount);
            Assert.AreEqual(0, status.BlockedCount);
            Assert.AreEqual(0, status.EngineTargetCount);
            Assert.AreEqual("", status.EngineTargetNames);
            Assert.False(status.HasAny);
        }

        [Test]
        public void StatusFetchTimeoutStaysInsideRoundTripBudget()
        {
            int timeoutMs = PrivateIntConstant("MaxProModuleStatusRequestMs");
            int pollMs = PrivateIntConstant("ProModuleStatusPollMs");

            Assert.Greater(timeoutMs, 0);
            Assert.LessOrEqual(timeoutMs, 2000);
            Assert.Greater(pollMs, 0);
            Assert.LessOrEqual(pollMs, 32);
            Assert.AreEqual(512, PrivateIntConstant("MaxProModuleStatusItems"));
            Assert.LessOrEqual(PrivateIntConstant("MaxProModuleStatusValueChars"), 80);
        }

        private static GreyboxProModuleStatus Parse(string json)
        {
            try
            {
                return (GreyboxProModuleStatus)typeof(GreyboxProModuleStatusClient)
                    .GetMethod("Parse", BindingFlags.Static | BindingFlags.NonPublic)
                    .Invoke(null, new object[] { json });
            }
            catch (TargetInvocationException error) when (error.InnerException != null)
            {
                throw error.InnerException;
            }
        }

        private static int PrivateIntConstant(string name)
        {
            return (int)typeof(GreyboxProModuleStatusClient)
                .GetField(name, BindingFlags.Static | BindingFlags.NonPublic)
                .GetRawConstantValue();
        }

        private static string RepeatJson(string item, int count)
        {
            var builder = new System.Text.StringBuilder();
            for (int index = 0; index < count; index++)
            {
                if (index > 0) builder.Append(",");
                builder.Append(item);
            }
            return builder.ToString();
        }
    }
}
