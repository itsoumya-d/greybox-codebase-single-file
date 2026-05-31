// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using Greybox.Editor.Sync;
using Greybox.Editor.Windows;
using Greybox.Runtime;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using UnityEngine;

namespace Greybox.Tests.EditMode
{
    public sealed class GreyboxConflictResolverTests
    {
        [Test]
        public void WebResolutionPatchesStableIdConflictIntoMergedDocument()
        {
            var conflict = new GreyboxRoundTripConflict
            {
                FileName = "arena.gameview.json",
                Path = "$.actors[id=boss].health",
                WebValueJson = "3",
                MergedContent = @"{""actors"":[{""id"":""boss"",""health"":2},{""id"":""minion"",""health"":1}]}"
            };

            var resolved = JObject.Parse(GreyboxConflictResolver.ResolveContent(conflict, GreyboxConflictResolution.Web));

            Assert.AreEqual(3, resolved["actors"][0]["health"].Value<int>());
            Assert.AreEqual(1, resolved["actors"][1]["health"].Value<int>());
        }

        [Test]
        public void WebResolutionSupportsGameDomainSelectorKeys()
        {
            var conflict = new GreyboxRoundTripConflict
            {
                FileName = "floor.levelboard.json",
                Path = "$.rooms[roomId=boss].difficulty",
                WebValueJson = "5",
                MergedContent = @"{""rooms"":[{""roomId"":""entry"",""difficulty"":1},{""roomId"":""boss"",""difficulty"":4}]}"
            };

            var resolved = JObject.Parse(GreyboxConflictResolver.ResolveContent(conflict, GreyboxConflictResolution.Web));

            Assert.AreEqual(1, resolved["rooms"][0]["difficulty"].Value<int>());
            Assert.AreEqual(5, resolved["rooms"][1]["difficulty"].Value<int>());
        }

        [Test]
        public void BatchWebResolutionPatchesMultipleConflictsInOneDocument()
        {
            var conflicts = new[]
            {
                new GreyboxRoundTripConflict
                {
                    FileName = "arena.gameview.json",
                    Path = "$.actors[id=boss].health",
                    WebValueJson = "3",
                    MergedContent = @"{""actors"":[{""id"":""boss"",""health"":2,""speed"":1.5},{""id"":""minion"",""health"":1,""speed"":1}]}"
                },
                new GreyboxRoundTripConflict
                {
                    FileName = "arena.gameview.json",
                    Path = "$.actors[id=minion].speed",
                    WebValueJson = "2.25",
                    MergedContent = @"{""actors"":[{""id"":""boss"",""health"":2,""speed"":1.5},{""id"":""minion"",""health"":1,""speed"":1}]}"
                }
            };

            var resolved = JObject.Parse(GreyboxConflictResolver.ResolveContent(conflicts, GreyboxConflictResolution.Web));

            Assert.AreEqual(3, resolved["actors"][0]["health"].Value<int>());
            Assert.AreEqual(2.25f, resolved["actors"][1]["speed"].Value<float>());
            Assert.AreEqual(1.5f, resolved["actors"][0]["speed"].Value<float>());
        }

        [Test]
        public void BatchUnityResolutionKeepsMergedDraft()
        {
            var conflicts = new[]
            {
                new GreyboxRoundTripConflict
                {
                    FileName = "arena.gameview.json",
                    Path = "$.actors[id=boss].health",
                    WebValueJson = "3",
                    MergedContent = @"{""actors"":[{""id"":""boss"",""health"":2}]}"
                }
            };

            Assert.AreEqual(
                @"{""actors"":[{""id"":""boss"",""health"":2}]}",
                GreyboxConflictResolver.ResolveContent(conflicts, GreyboxConflictResolution.Unity));
        }

        [Test]
        public void WebResolutionSupportsRootTextConflicts()
        {
            var conflict = new GreyboxRoundTripConflict
            {
                FileName = "DESIGN.md",
                Path = "$",
                WebValueJson = JValue.CreateString("# Design\n\nReadable web edit.\n").ToString(),
                MergedContent = "# Design\n\nUnity edit.\n"
            };

            Assert.AreEqual(
                "# Design\n\nReadable web edit.\n",
                GreyboxConflictResolver.ResolveContent(conflict, GreyboxConflictResolution.Web));
        }

        [Test]
        public void WebResolutionRejectsOversizedConflictValuesBeforeParsing()
        {
            int maxValueChars = PrivateIntConstant("MaxRoundTripConflictValueJsonChars");
            var conflict = new GreyboxRoundTripConflict
            {
                FileName = "arena.gameview.json",
                Path = "$.actors[id=boss].notes",
                WebValueJson = new string('x', maxValueChars + 1),
                MergedContent = @"{""actors"":[{""id"":""boss"",""notes"":""keep merged draft""}]}"
            };

            Assert.AreEqual(
                conflict.MergedContent,
                GreyboxConflictResolver.ResolveContent(conflict, GreyboxConflictResolution.Web));
            Assert.Throws<Newtonsoft.Json.JsonException>(() =>
                GreyboxConflictResolver.ResolveContent(new[] { conflict }, GreyboxConflictResolution.Web));
        }

        [Test]
        public void ManualResolutionReturnsEditedDraft()
        {
            var conflict = new GreyboxRoundTripConflict
            {
                FileName = "arena.gameview.json",
                Path = "$.actors[id=boss].health",
                WebValueJson = "3",
                MergedContent = @"{""actors"":[{""id"":""boss"",""health"":2}]}"
            };

            Assert.AreEqual(
                @"{""actors"":[{""id"":""boss"",""health"":4}]}",
                GreyboxConflictResolver.ResolveContent(
                    conflict,
                    GreyboxConflictResolution.Manual,
                @"{""actors"":[{""id"":""boss"",""health"":4}]}"));
        }

        [Test]
        public async Task AcceptActionsPostRefreshAndClearInboxWithInjectedTransport()
        {
            var config = ScriptableObject.CreateInstance<GreyboxConfig>();
            var postedFiles = new List<string>();
            var postedContents = new List<string>();
            var refreshedFiles = new List<string>();
            Func<GreyboxConfig, string, string, Task<bool>> post = (activeConfig, fileName, content) =>
            {
                postedFiles.Add(fileName);
                postedContents.Add(content);
                return Task.FromResult(activeConfig && !string.IsNullOrWhiteSpace(fileName));
            };
            Func<GreyboxConfig, string, Task<bool>> refresh = (activeConfig, fileName) =>
            {
                refreshedFiles.Add(fileName);
                return Task.FromResult(activeConfig && !string.IsNullOrWhiteSpace(fileName));
            };

            try
            {
                config.ProjectId = "conflict-resolver-test";
                config.DaemonUrl = "http://127.0.0.1:17456";
                InstallProLicense();

                GreyboxConflictInbox.Clear();
                Assert.True(GreyboxConflictInbox.RecordExampleRoundTripConflict());
                GreyboxRoundTripConflict health = Conflict("$.actors[id=boss].health");
                Assert.True(await AcceptWebMergeAsync(config, health, post, refresh));
                Assert.False(GreyboxConflictInbox.Conflicts.Contains(health));
                Assert.AreEqual("Samples/2D Platformer/platformer.gameview.json", postedFiles.Last());
                StringAssert.Contains(@"""health"": 3", postedContents.Last());
                CollectionAssert.Contains(refreshedFiles, "Samples/2D Platformer/platformer.gameview.json");

                GreyboxConflictInbox.Clear();
                Assert.True(GreyboxConflictInbox.RecordExampleRoundTripConflict());
                health = Conflict("$.actors[id=boss].health");
                Assert.True(await AcceptUnityMergeAsync(config, health, post, refresh));
                StringAssert.Contains(@"""health"":2", postedContents.Last());

                GreyboxConflictInbox.Clear();
                Assert.True(GreyboxConflictInbox.RecordExampleRoundTripConflict());
                health = Conflict("$.actors[id=boss].health");
                Assert.True(await AcceptManualMergeAsync(config, health, @"{""actors"":[{""id"":""boss"",""health"":4}]}", post, refresh));
                StringAssert.Contains(@"""health"":4", postedContents.Last());

                GreyboxConflictInbox.Clear();
                Assert.True(GreyboxConflictInbox.RecordExampleRoundTripConflict());
                int accepted = await AcceptBatchMergeAsync(
                    config,
                    GreyboxConflictInbox.Conflicts.ToArray(),
                    GreyboxConflictResolution.Web,
                    post,
                    refresh);

                Assert.AreEqual(3, accepted);
                Assert.AreEqual(0, GreyboxConflictInbox.Conflicts.Count);
                StringAssert.Contains(@"""health"": 3", postedContents.Last());
                StringAssert.Contains(@"""x"": 2", postedContents.Last());
                StringAssert.Contains(@"""title"": ""Greybox Web Revision""", postedContents.Last());
            }
            finally
            {
                GreyboxConflictInbox.Clear();
                GreyboxSettings.SetLicenseKey("");
                UnityEngine.Object.DestroyImmediate(config);
            }
        }

        [Test]
        public void MergeFileNameRejectsTraversalAndUnsupportedArtifacts()
        {
            Assert.AreEqual("Samples/2D Platformer/platformer.gameview.json", SafeRoundTripFileName(@"Samples\2D Platformer\platformer.gameview.json"));
            Assert.AreEqual("world/DESIGN.md", SafeRoundTripFileName("world/DESIGN.md"));
            Assert.AreEqual("ui/main.hud.html", SafeRoundTripFileName("ui/main.hud.html"));
            Assert.True(IsSafeRoundTripFileName("levels/arena.levelboard.json"));

            Assert.AreEqual("", SafeRoundTripFileName("../levels/../arena.gameview.json"));
            Assert.AreEqual("", SafeRoundTripFileName("/levels/arena.gameview.json"));
            Assert.AreEqual("", SafeRoundTripFileName("https://example.test/arena.gameview.json"));
            Assert.AreEqual("", SafeRoundTripFileName("C:/arena.gameview.json"));
            Assert.AreEqual("", SafeRoundTripFileName("levels/notes.txt"));
            Assert.AreEqual("", SafeRoundTripFileName("levels/\n/arena.gameview.json"));
            Assert.AreEqual("", SafeRoundTripFileName("levels/" + new string('a', 520) + ".gameview.json"));
            Assert.False(IsSafeRoundTripFileName("../levels/arena.gameview.json"));
        }

        [Test]
        public void ConflictJsonPathRejectsPrototypeAndTraversalSelectors()
        {
            Assert.AreEqual("$.actors[id=boss].health", SafeConflictJsonPath(" $.actors[id=boss].health "));
            Assert.AreEqual("$.actors[name=Gate Boss].health", SafeConflictJsonPath("$.actors[name=Gate Boss].health"));
            Assert.AreEqual("$.spawnPoints[0].position", SafeConflictJsonPath("$.spawnPoints[0].position"));
            Assert.AreEqual("$", SafeConflictJsonPath("$"));

            Assert.AreEqual("", SafeConflictJsonPath("actors[id=boss].health"));
            Assert.AreEqual("", SafeConflictJsonPath("$..actors[id=boss].health"));
            Assert.AreEqual("", SafeConflictJsonPath("$.__proto__.polluted"));
            Assert.AreEqual("", SafeConflictJsonPath("$.constructor.polluted"));
            Assert.AreEqual("", SafeConflictJsonPath("$.actors[__proto__=boss].health"));
            Assert.AreEqual("", SafeConflictJsonPath("$.actors[constructor=boss].health"));
            Assert.AreEqual("", SafeConflictJsonPath("$.actors[id=../../boss].health"));
            Assert.AreEqual("", SafeConflictJsonPath("$.actors[id=boss]/health"));
            Assert.AreEqual("", SafeConflictJsonPath("$.actors .health"));
            Assert.AreEqual("", SafeConflictJsonPath("$.actors[id=boss]." + new string('a', 129)));
            Assert.AreEqual("", SafeConflictJsonPath("$.actors[id=" + new string('a', 161) + "].health"));
        }

        [Test]
        public void ConflictResolutionPostTimeoutAndPayloadCapsAreBounded()
        {
            int maxContentChars = PrivateIntConstant("MaxResolvedMergeContentChars");
            int maxPayloadBytes = PrivateIntConstant("MaxRoundTripMergePayloadBytes");
            int timeoutMs = PrivateIntConstant("MaxRoundTripMergeRequestMs");

            Assert.Greater(maxContentChars, 0);
            Assert.Greater(maxPayloadBytes, maxContentChars);
            Assert.Greater(timeoutMs, 0);
            Assert.LessOrEqual(timeoutMs, 2000);
            Assert.True(IsSafeResolvedMergeContent(""));
            Assert.True(IsSafeResolvedMergeContent(new string('x', maxContentChars)));
            Assert.False(IsSafeResolvedMergeContent(null));
            Assert.False(IsSafeResolvedMergeContent(new string('x', maxContentChars + 1)));
        }

        [Test]
        public void RoundTripMergeUrlRequiresHttpDaemonAndProjectId()
        {
            var config = ScriptableObject.CreateInstance<GreyboxConfig>();
            try
            {
                config.ProjectId = "project 42";
                config.DaemonUrl = "http://127.0.0.1:17456/extra/path";
                Assert.AreEqual(
                    "http://127.0.0.1:17456/api/projects/project%2042/round-trip-merge",
                    BuildRoundTripMergeUrl(config));

                config.DaemonUrl = "https://daemon.greybox.studio/base";
                Assert.AreEqual(
                    "https://daemon.greybox.studio/api/projects/project%2042/round-trip-merge",
                    BuildRoundTripMergeUrl(config));

                config.DaemonUrl = "file:///Users/soumyadebnath16/project";
                Assert.AreEqual("", BuildRoundTripMergeUrl(config));
                config.DaemonUrl = "javascript:alert(1)";
                Assert.AreEqual("", BuildRoundTripMergeUrl(config));
                config.DaemonUrl = "";
                Assert.AreEqual("", BuildRoundTripMergeUrl(config));
                config.DaemonUrl = "http://127.0.0.1:17456";
                config.ProjectId = "";
                Assert.AreEqual("", BuildRoundTripMergeUrl(config));
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(config);
            }
        }

        [Test]
        public async Task AcceptActionsRejectOversizedResolvedContentBeforeInjectedTransport()
        {
            var config = ScriptableObject.CreateInstance<GreyboxConfig>();
            var postedFiles = new List<string>();
            Func<GreyboxConfig, string, string, Task<bool>> post = (activeConfig, fileName, content) =>
            {
                postedFiles.Add(fileName);
                return Task.FromResult(true);
            };
            Func<GreyboxConfig, string, Task<bool>> refresh = (activeConfig, fileName) => Task.FromResult(true);

            try
            {
                config.ProjectId = "oversized-conflict-content-test";
                config.DaemonUrl = "http://127.0.0.1:17456";
                InstallProLicense();
                int maxContentChars = PrivateIntConstant("MaxResolvedMergeContentChars");
                var conflict = new GreyboxRoundTripConflict
                {
                    FileName = "levels/arena.gameview.json",
                    Path = "$.actors[id=boss].health",
                    WebValueJson = "3",
                    MergedContent = @"{""actors"":[{""id"":""boss"",""health"":2}]}",
                };

                Assert.False(await AcceptManualMergeAsync(
                    config,
                    conflict,
                    new string('x', maxContentChars + 1),
                    post,
                    refresh));
                Assert.AreEqual(0, postedFiles.Count);
            }
            finally
            {
                GreyboxSettings.SetLicenseKey("");
                UnityEngine.Object.DestroyImmediate(config);
            }
        }

        [Test]
        public async Task AcceptActionsRejectOversizedWebConflictValueBeforeInjectedTransport()
        {
            var config = ScriptableObject.CreateInstance<GreyboxConfig>();
            var postedFiles = new List<string>();
            Func<GreyboxConfig, string, string, Task<bool>> post = (activeConfig, fileName, content) =>
            {
                postedFiles.Add(fileName);
                return Task.FromResult(true);
            };
            Func<GreyboxConfig, string, Task<bool>> refresh = (activeConfig, fileName) => Task.FromResult(true);

            try
            {
                config.ProjectId = "oversized-web-value-test";
                config.DaemonUrl = "http://127.0.0.1:17456";
                InstallProLicense();
                int maxValueChars = PrivateIntConstant("MaxRoundTripConflictValueJsonChars");
                var conflict = new GreyboxRoundTripConflict
                {
                    FileName = "levels/arena.gameview.json",
                    Path = "$.actors[id=boss].notes",
                    WebValueJson = new string('x', maxValueChars + 1),
                    MergedContent = @"{""actors"":[{""id"":""boss"",""notes"":""keep merged draft""}]}",
                };

                Assert.False(await AcceptWebMergeAsync(config, conflict, post, refresh));
                Assert.AreEqual(0, postedFiles.Count);
            }
            finally
            {
                GreyboxSettings.SetLicenseKey("");
                UnityEngine.Object.DestroyImmediate(config);
            }
        }

        [Test]
        public async Task AcceptActionsRejectUnsafeConflictPathsBeforeInjectedTransport()
        {
            var config = ScriptableObject.CreateInstance<GreyboxConfig>();
            var postedFiles = new List<string>();
            Func<GreyboxConfig, string, string, Task<bool>> post = (activeConfig, fileName, content) =>
            {
                postedFiles.Add(fileName);
                return Task.FromResult(true);
            };
            Func<GreyboxConfig, string, Task<bool>> refresh = (activeConfig, fileName) => Task.FromResult(true);

            try
            {
                config.ProjectId = "unsafe-conflict-path-test";
                config.DaemonUrl = "http://127.0.0.1:17456";
                InstallProLicense();
                var unsafeConflict = new GreyboxRoundTripConflict
                {
                    FileName = "levels/arena.gameview.json",
                    Path = "$.__proto__.polluted",
                    WebValueJson = "3",
                    MergedContent = @"{""actors"":[{""id"":""boss"",""health"":2}]}",
                };
                var safeConflict = new GreyboxRoundTripConflict
                {
                    FileName = "levels/arena.gameview.json",
                    Path = "$.actors[id=boss].health",
                    WebValueJson = "3",
                    MergedContent = @"{""actors"":[{""id"":""boss"",""health"":2}]}",
                };

                Assert.False(await AcceptWebMergeAsync(config, unsafeConflict, post, refresh));
                Assert.AreEqual(0, postedFiles.Count);

                int accepted = await AcceptBatchMergeAsync(
                    config,
                    new[] { unsafeConflict, safeConflict },
                    GreyboxConflictResolution.Web,
                    post,
                    refresh);

                Assert.AreEqual(1, accepted);
                CollectionAssert.AreEqual(new[] { "levels/arena.gameview.json" }, postedFiles);
            }
            finally
            {
                GreyboxSettings.SetLicenseKey("");
                UnityEngine.Object.DestroyImmediate(config);
            }
        }

        [Test]
        public async Task AcceptActionsRejectUnsafeMergeFileNamesBeforeInjectedTransport()
        {
            var config = ScriptableObject.CreateInstance<GreyboxConfig>();
            var postedFiles = new List<string>();
            Func<GreyboxConfig, string, string, Task<bool>> post = (activeConfig, fileName, content) =>
            {
                postedFiles.Add(fileName);
                return Task.FromResult(true);
            };
            Func<GreyboxConfig, string, Task<bool>> refresh = (activeConfig, fileName) => Task.FromResult(true);

            try
            {
                config.ProjectId = "unsafe-conflict-resolver-test";
                config.DaemonUrl = "http://127.0.0.1:17456";
                InstallProLicense();
                var unsafeConflict = new GreyboxRoundTripConflict
                {
                    FileName = "../arena.gameview.json",
                    Path = "$.actors[id=boss].health",
                    WebValueJson = "3",
                    MergedContent = @"{""actors"":[{""id"":""boss"",""health"":2}]}",
                };
                var safeConflict = new GreyboxRoundTripConflict
                {
                    FileName = "levels/arena.gameview.json",
                    Path = "$.actors[id=boss].health",
                    WebValueJson = "3",
                    MergedContent = @"{""actors"":[{""id"":""boss"",""health"":2}]}",
                };

                Assert.False(await AcceptWebMergeAsync(config, unsafeConflict, post, refresh));
                Assert.AreEqual(0, postedFiles.Count);

                int accepted = await AcceptBatchMergeAsync(
                    config,
                    new[] { unsafeConflict, safeConflict },
                    GreyboxConflictResolution.Web,
                    post,
                    refresh);

                Assert.AreEqual(1, accepted);
                CollectionAssert.AreEqual(new[] { "levels/arena.gameview.json" }, postedFiles);
            }
            finally
            {
                GreyboxSettings.SetLicenseKey("");
                UnityEngine.Object.DestroyImmediate(config);
            }
        }

        [Test]
        public async Task AcceptBatchRejectsMixedMergedDraftsForSameArtifactBeforeInjectedTransport()
        {
            var config = ScriptableObject.CreateInstance<GreyboxConfig>();
            var postedFiles = new List<string>();
            Func<GreyboxConfig, string, string, Task<bool>> post = (activeConfig, fileName, content) =>
            {
                postedFiles.Add(fileName);
                return Task.FromResult(true);
            };
            Func<GreyboxConfig, string, Task<bool>> refresh = (activeConfig, fileName) => Task.FromResult(true);

            try
            {
                config.ProjectId = "mixed-conflict-draft-test";
                config.DaemonUrl = "http://127.0.0.1:17456";
                InstallProLicense();
                var staleConflict = new GreyboxRoundTripConflict
                {
                    FileName = "levels/arena.gameview.json",
                    Path = "$.actors[id=boss].health",
                    WebValueJson = "3",
                    MergedContent = @"{""actors"":[{""id"":""boss"",""health"":2,""speed"":1.5}]}",
                };
                var freshConflict = new GreyboxRoundTripConflict
                {
                    FileName = "levels/arena.gameview.json",
                    Path = "$.actors[id=boss].speed",
                    WebValueJson = "2.25",
                    MergedContent = @"{""actors"":[{""id"":""boss"",""health"":2,""speed"":1.75}]}",
                };

                int accepted = await AcceptBatchMergeAsync(
                    config,
                    new[] { staleConflict, freshConflict },
                    GreyboxConflictResolution.Web,
                    post,
                    refresh);

                Assert.AreEqual(0, accepted);
                Assert.AreEqual(0, postedFiles.Count);
            }
            finally
            {
                GreyboxSettings.SetLicenseKey("");
                UnityEngine.Object.DestroyImmediate(config);
            }
        }

        private static void InstallProLicense()
        {
            GreyboxSettings.SetLicenseKey("gbx_pro_conflict_resolver_test");
            Assert.True(GreyboxSettings.SetLicenseCapabilities(
                GreyboxLicenseCapabilities.ForTier(GreyboxLicenseTier.Pro),
                "2027-05-22T00:00:00.000Z"));
        }

        private static GreyboxRoundTripConflict Conflict(string path)
        {
            return GreyboxConflictInbox.Conflicts.First(item => item.Path == path);
        }

        private static async Task<bool> AcceptWebMergeAsync(
            GreyboxConfig config,
            GreyboxRoundTripConflict conflict,
            Func<GreyboxConfig, string, string, Task<bool>> post,
            Func<GreyboxConfig, string, Task<bool>> refresh)
        {
            return await InvokeAsync<bool>("AcceptWebMergeAsync", config, conflict, post, refresh);
        }

        private static async Task<bool> AcceptUnityMergeAsync(
            GreyboxConfig config,
            GreyboxRoundTripConflict conflict,
            Func<GreyboxConfig, string, string, Task<bool>> post,
            Func<GreyboxConfig, string, Task<bool>> refresh)
        {
            return await InvokeAsync<bool>("AcceptUnityMergeAsync", config, conflict, post, refresh);
        }

        private static async Task<bool> AcceptManualMergeAsync(
            GreyboxConfig config,
            GreyboxRoundTripConflict conflict,
            string manualContent,
            Func<GreyboxConfig, string, string, Task<bool>> post,
            Func<GreyboxConfig, string, Task<bool>> refresh)
        {
            return await InvokeAsync<bool>("AcceptManualMergeAsync", config, conflict, manualContent, post, refresh);
        }

        private static async Task<int> AcceptBatchMergeAsync(
            GreyboxConfig config,
            GreyboxRoundTripConflict[] conflicts,
            GreyboxConflictResolution resolution,
            Func<GreyboxConfig, string, string, Task<bool>> post,
            Func<GreyboxConfig, string, Task<bool>> refresh)
        {
            return await InvokeAsync<int>("AcceptBatchMergeAsync", config, conflicts, resolution, post, refresh);
        }

        private static async Task<T> InvokeAsync<T>(string methodName, params object[] args)
        {
            var task = (Task<T>)typeof(GreyboxConflictResolver)
                .GetMethod(methodName, BindingFlags.Static | BindingFlags.NonPublic)
                .Invoke(null, args);
            return await task;
        }

        private static string SafeRoundTripFileName(string fileName)
        {
            return (string)typeof(GreyboxConflictResolver)
                .GetMethod("SafeRoundTripFileName", BindingFlags.Static | BindingFlags.NonPublic)
                .Invoke(null, new object[] { fileName });
        }

        private static string SafeConflictJsonPath(string path)
        {
            return (string)typeof(GreyboxConflictResolver)
                .GetMethod("SafeConflictJsonPath", BindingFlags.Static | BindingFlags.NonPublic)
                .Invoke(null, new object[] { path });
        }

        private static bool IsSafeResolvedMergeContent(string content)
        {
            return (bool)typeof(GreyboxConflictResolver)
                .GetMethod("IsSafeResolvedMergeContent", BindingFlags.Static | BindingFlags.NonPublic)
                .Invoke(null, new object[] { content });
        }

        private static bool IsSafeRoundTripFileName(string fileName)
        {
            return (bool)typeof(GreyboxConflictResolver)
                .GetMethod("IsSafeRoundTripFileName", BindingFlags.Static | BindingFlags.NonPublic)
                .Invoke(null, new object[] { fileName });
        }

        private static string BuildRoundTripMergeUrl(GreyboxConfig config)
        {
            return (string)typeof(GreyboxConflictResolver)
                .GetMethod("BuildRoundTripMergeUrl", BindingFlags.Static | BindingFlags.NonPublic)
                .Invoke(null, new object[] { config });
        }

        private static int PrivateIntConstant(string name)
        {
            return (int)typeof(GreyboxConflictResolver)
                .GetField(name, BindingFlags.Static | BindingFlags.NonPublic)
                .GetRawConstantValue();
        }
    }
}
