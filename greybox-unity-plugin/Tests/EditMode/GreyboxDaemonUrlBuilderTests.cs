// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using Greybox.Editor.Sync;
using Greybox.Runtime;
using NUnit.Framework;
using UnityEngine;

namespace Greybox.Tests.EditMode
{
    public sealed class GreyboxDaemonUrlBuilderTests
    {
        [Test]
        public void BuildsProjectRoutesFromSafeDaemonOrigins()
        {
            var config = ScriptableObject.CreateInstance<GreyboxConfig>();
            try
            {
                config.ProjectId = " project 42 ";
                config.DaemonUrl = "http://127.0.0.1:17456/ignored/path";

                Assert.AreEqual(
                    "http://127.0.0.1:17456/api/projects/project%2042/unity-package",
                    GreyboxDaemonUrlBuilder.BuildProjectRoute(config, "unity-package"));

                config.DaemonUrl = "https://daemon.greybox.studio/base";
                Assert.AreEqual(
                    "https://daemon.greybox.studio/api/game-deliverables/project%2042/engine-package/unity/preflight",
                    GreyboxDaemonUrlBuilder.BuildGameDeliverableRoute(config, "engine-package", "unity", "preflight"));
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(config);
            }
        }

        [Test]
        public void RejectsUnsafeDaemonOriginsProjectIdsAndRouteSegments()
        {
            var config = ScriptableObject.CreateInstance<GreyboxConfig>();
            try
            {
                config.ProjectId = "project-42";
                foreach (string daemonUrl in new[]
                {
                    "",
                    "file:///Users/soumyadebnath16/project",
                    "javascript:alert(1)",
                    "http://daemon.greybox.studio",
                    "http://192.168.1.50:17456",
                    "http://user:pass@127.0.0.1:17456",
                    "mailto:ops@greybox.studio",
                })
                {
                    config.DaemonUrl = daemonUrl;
                    Assert.AreEqual("", GreyboxDaemonUrlBuilder.BuildProjectRoute(config, "unity-package"));
                }

                config.DaemonUrl = "http://127.0.0.1:17456";
                config.ProjectId = "";
                Assert.AreEqual("", GreyboxDaemonUrlBuilder.BuildProjectRoute(config, "unity-package"));
                config.ProjectId = "project\n42";
                Assert.AreEqual("", GreyboxDaemonUrlBuilder.BuildProjectRoute(config, "unity-package"));
                config.ProjectId = "https://example.test/project-42";
                Assert.AreEqual("", GreyboxDaemonUrlBuilder.BuildProjectRoute(config, "unity-package"));
                config.ProjectId = new string('p', GreyboxDaemonUrlBuilder.MaxProjectIdChars + 1);
                Assert.AreEqual("", GreyboxDaemonUrlBuilder.BuildProjectRoute(config, "unity-package"));
                config.ProjectId = "project-42";
                Assert.AreEqual("", GreyboxDaemonUrlBuilder.BuildProjectRoute(config, "../unity-package"));
                Assert.AreEqual("", GreyboxDaemonUrlBuilder.BuildGameDeliverableRoute(config, "engine-package/unity"));
                Assert.AreEqual("", GreyboxDaemonUrlBuilder.BuildGameDeliverableRoute(config, "engine-package", "\n"));
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(config);
            }
        }

        [Test]
        public void TrySafeDaemonBaseUrlRejectsCredentialsAndNonHttpSchemes()
        {
            Assert.True(GreyboxDaemonUrlBuilder.TrySafeDaemonBaseUrl("https://daemon.greybox.studio/path?q=ignored", out string baseUrl));
            Assert.AreEqual("https://daemon.greybox.studio", baseUrl);
            Assert.True(GreyboxDaemonUrlBuilder.TrySafeDaemonBaseUrl("http://localhost:17456/path?q=ignored", out string localBaseUrl));
            Assert.AreEqual("http://localhost:17456", localBaseUrl);

            Assert.False(GreyboxDaemonUrlBuilder.TrySafeDaemonBaseUrl("http://daemon.greybox.studio/path", out _));
            Assert.False(GreyboxDaemonUrlBuilder.TrySafeDaemonBaseUrl("http://192.168.1.50:17456", out _));
            Assert.False(GreyboxDaemonUrlBuilder.TrySafeDaemonBaseUrl("http://user:pass@127.0.0.1:17456", out _));
            Assert.False(GreyboxDaemonUrlBuilder.TrySafeDaemonBaseUrl("file:///tmp/greybox", out _));
            Assert.False(GreyboxDaemonUrlBuilder.TrySafeDaemonBaseUrl("javascript:alert(1)", out _));
        }

        [Test]
        public void TrySafeProjectIdTrimsAndRejectsAmbiguousScopes()
        {
            Assert.True(GreyboxDaemonUrlBuilder.TrySafeProjectId(" project 42 ", out string safeProjectId));
            Assert.AreEqual("project 42", safeProjectId);

            Assert.False(GreyboxDaemonUrlBuilder.TrySafeProjectId("", out _));
            Assert.False(GreyboxDaemonUrlBuilder.TrySafeProjectId("project\n42", out _));
            Assert.False(GreyboxDaemonUrlBuilder.TrySafeProjectId("https://example.test/project-42", out _));
            Assert.False(GreyboxDaemonUrlBuilder.TrySafeProjectId("project/42", out _));
            Assert.False(GreyboxDaemonUrlBuilder.TrySafeProjectId(".", out _));
            Assert.False(GreyboxDaemonUrlBuilder.TrySafeProjectId(new string('p', GreyboxDaemonUrlBuilder.MaxProjectIdChars + 1), out _));
        }
    }
}
