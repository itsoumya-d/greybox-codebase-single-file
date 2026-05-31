#!/usr/bin/env node
// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_UNITY_ARGS = ['-batchmode', '-quit', '-nographics'];

export function discoverUnityEditors({
  env = process.env,
  exists = existsSync,
  platform = process.platform,
  readdir = readdirSync,
} = {}) {
  if (env.GREYBOX_UNITY_SMOKE_DISABLE_DISCOVERY === '1') return [];
  const candidates = [];
  candidates.push(...splitPathList(env.GREYBOX_UNITY_EDITORS));
  candidates.push(...splitPathList(env.UNITY_EDITORS));
  if (env.GREYBOX_UNITY_EDITOR) candidates.push(env.GREYBOX_UNITY_EDITOR);
  if (env.UNITY_EDITOR) candidates.push(env.UNITY_EDITOR);
  for (const command of unityCommandNames(platform)) {
    const found = which(command, platform);
    if (found) candidates.push(found);
  }
  candidates.push(...unityHubEditorCandidates({ env, platform, readdir }));
  candidates.push(...fixedUnityEditorCandidates({ env, platform }));
  return Array.from(new Set(candidates.map((candidate) => candidate.trim()).filter(Boolean))).filter((candidate) => exists(candidate));
}

export function createSmokeProject({ root, packageRoot, unityVersion = '2022.3.0f1' }) {
  const projectRoot = resolve(root);
  mkdirSync(join(projectRoot, 'Assets/GreyboxSmoke/Editor'), { recursive: true });
  mkdirSync(join(projectRoot, 'Assets/GreyboxSmoke/PlayMode'), { recursive: true });
  mkdirSync(join(projectRoot, 'Packages'), { recursive: true });
  mkdirSync(join(projectRoot, 'ProjectSettings'), { recursive: true });

  writeFileSync(
    join(projectRoot, 'Packages/manifest.json'),
    JSON.stringify({
      dependencies: {
        'com.unity.test-framework': '1.1.33',
        'com.unity.inputsystem': '1.7.0',
        'com.unity.ugui': '1.0.0',
        'com.greybox.studio': `file:${resolve(packageRoot).replaceAll('\\', '/')}`,
      },
      testables: ['com.greybox.studio'],
    }, null, 2),
  );
  writeFileSync(
    join(projectRoot, 'ProjectSettings/ProjectVersion.txt'),
    `m_EditorVersion: ${unityVersion}\n`,
  );
  writeFileSync(
    join(projectRoot, 'Assets/GreyboxSmoke/Editor/GreyboxImportSmoke.cs'),
    smokeTestSource(unityVersion),
  );
  writeFileSync(
    join(projectRoot, 'Assets/GreyboxSmoke/PlayMode/GreyboxPlatformerPlaySmoke.cs'),
    playModeSmokeTestSource(),
  );
  return projectRoot;
}

export function unitySmokeCommand({ unity, projectRoot, logFile, resultsFile, testPlatform = 'EditMode' }) {
  return [
    unity,
    ...DEFAULT_UNITY_ARGS,
    '-projectPath',
    projectRoot,
    '-logFile',
    logFile,
    '-runTests',
    '-testPlatform',
    testPlatform,
    '-testResults',
    resultsFile,
  ];
}

export function unityPlayModeSmokeCommand(options) {
  return unitySmokeCommand({ ...options, testPlatform: 'PlayMode' });
}

export function smokeTestSource(expectedUnityVersion = '2022.3.0f1') {
  const expectedUnityStream = unityStreamPrefix(expectedUnityVersion);
  return `using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using Greybox.Editor.Export;
using Greybox.Editor.Generation;
using Greybox.Editor.McpBridge;
using Greybox.Editor.Samples;
using Greybox.Editor.Sync;
using Greybox.Runtime;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEditor;
using UnityEditor.AddressableAssets;
using UnityEditor.AddressableAssets.Settings;
using UnityEditor.PackageManager;
using UnityEngine;
using UnityEngine.Tilemaps;
using UnityEngine.UI;
using UnityEngine.UIElements;

namespace Greybox.Validation
{
    public sealed class GreyboxImportSmoke
    {
        private const string ExpectedUnityVersion = "${escapeCSharpString(expectedUnityVersion)}";
        private const string ExpectedUnityStream = "${escapeCSharpString(expectedUnityStream)}";

        [Test]
        public void EditorVersionMatchesReleaseTarget()
        {
            StringAssert.StartsWith(ExpectedUnityStream + ".", Application.unityVersion, "Unity smoke evidence must come from the requested release stream, not a relabeled editor path.");
            StringAssert.StartsWith(ExpectedUnityStream + ".", ExpectedUnityVersion, "Smoke project expected Unity version should be pinned to the release stream.");
        }

        [Test]
        public void PackageMetadataAndAssembliesLoad()
        {
            var package = PackageInfo.FindForPackageName("com.greybox.studio");
            Assert.NotNull(package, "com.greybox.studio should be resolved by Unity Package Manager.");
            Assert.AreEqual("Greybox Studio", package.displayName);
            Assert.IsTrue(package.version.Length > 0);

            Assert.NotNull(Type.GetType("Greybox.Runtime.GreyboxConfig, Greybox.Runtime"));
            Assert.NotNull(Type.GetType("Greybox.Runtime.GreyboxArtifact, Greybox.Runtime"));
            Assert.NotNull(Type.GetType("Greybox.Runtime.GreyboxImportReceipt, Greybox.Runtime"));
            Assert.NotNull(Type.GetType("Greybox.Runtime.GreyboxMarker, Greybox.Runtime"));
            Assert.NotNull(Type.GetType("Greybox.Runtime.GreyboxWatermark, Greybox.Runtime"));
            Assert.NotNull(Type.GetType("Greybox.Runtime.GreyboxArtBiblePalette, Greybox.Runtime"));
            Assert.NotNull(Type.GetType("Greybox.Runtime.GreyboxLevelTilemap, Greybox.Runtime"));
            Assert.NotNull(Type.GetType("Greybox.Runtime.GreyboxUiToolkitHud, Greybox.Runtime"));
            Assert.NotNull(Type.GetType("Greybox.Runtime.GreyboxPlatformerSamplePlayer, Greybox.Runtime"));
            Assert.NotNull(Type.GetType("Greybox.Runtime.GreyboxPlatformerSampleHazard, Greybox.Runtime"));
            Assert.NotNull(Type.GetType("Greybox.Runtime.GreyboxPlatformerSampleCheckpoint, Greybox.Runtime"));
            Assert.NotNull(Type.GetType("Greybox.Runtime.GreyboxPlatformerSampleGoal, Greybox.Runtime"));
            Assert.NotNull(Type.GetType("Greybox.Runtime.GreyboxPlatformerSampleHud, Greybox.Runtime"));
            Assert.NotNull(Type.GetType("Greybox.Runtime.GreyboxPlatformerSampleCollectible, Greybox.Runtime"));
            Assert.NotNull(Type.GetType("Greybox.Runtime.GreyboxPlatformerSampleArtifactManifest, Greybox.Runtime"));
            Assert.NotNull(Type.GetType("Greybox.Editor.Generation.AddressablesTagger, Greybox.Editor"));
            Assert.NotNull(Type.GetType("Greybox.Editor.Generation.GreyboxImportReceiptExporter, Greybox.Editor"));
            Assert.NotNull(Type.GetType("Greybox.Editor.Export.GreyboxAssetStorePackageExporter, Greybox.Editor"));
            Assert.NotNull(Type.GetType("Greybox.Editor.Generation.MaterialAssetExporter, Greybox.Editor"));
            Assert.NotNull(Type.GetType("Greybox.Editor.Generation.HudLayoutBuilder, Greybox.Editor"));
            Assert.NotNull(Type.GetType("Greybox.Editor.Generation.GreyboxWatermarkBuilder, Greybox.Editor"));
            Assert.NotNull(Type.GetType("Greybox.Editor.Samples.Greybox2DPlatformerSampleBuilder, Greybox.Editor"));
            Assert.NotNull(Type.GetType("Greybox.Editor.Sync.GreyboxSceneChangeWatcher, Greybox.Editor"));
            Assert.NotNull(Type.GetType("Greybox.Editor.Sync.GreyboxArtifactRefresher, Greybox.Editor"), "web-to-Unity PullAndRefreshFromEvent wiring should compile.");
            Assert.NotNull(Type.GetType("Greybox.Editor.Sync.GreyboxConflictInbox, Greybox.Editor"));
            Assert.NotNull(Type.GetType("Greybox.Editor.Sync.GreyboxConflictResolver, Greybox.Editor"));
            Assert.NotNull(Type.GetType("Greybox.Editor.Sync.GreyboxPrefabSidecarResolver, Greybox.Editor"));
            Assert.NotNull(Type.GetType("Greybox.Editor.Sync.GreyboxEnginePackagePreflightClient, Greybox.Editor"));
            Assert.NotNull(Type.GetType("Greybox.Editor.Sync.GreyboxPackageDownloader, Greybox.Editor"));
            Assert.NotNull(Type.GetType("Greybox.Editor.Sync.GreyboxCloudClient, Greybox.Editor"));
            Assert.NotNull(Type.GetType("Greybox.Editor.Windows.GreyboxConflictWindow, Greybox.Editor"));
            Assert.NotNull(Type.GetType("Greybox.Editor.Windows.GreyboxLicenseState, Greybox.Editor"));
            Assert.NotNull(Type.GetType("Greybox.Editor.Windows.GreyboxLicenseWindow, Greybox.Editor"));
            Assert.NotNull(Type.GetType("Greybox.Editor.Windows.GreyboxProjectEntitlements, Greybox.Editor"));
            Assert.NotNull(Type.GetType("Greybox.Editor.Windows.GreyboxStudioWindow, Greybox.Editor"));
            Assert.NotNull(Type.GetType("Greybox.Editor.Sync.DiffApplier, Greybox.Editor"));
            Assert.NotNull(Type.GetType("Greybox.Editor.McpBridge.GreyboxMcpServer, Greybox.Editor"));
        }

        [Test]
        public void EnginePackagePreflightFailsClosedWhenPackageMetadataIsMissingOrUnsafe()
        {
            GreyboxEnginePackagePreflight missingAvailable = ParseEnginePackagePreflight(@"{""engine"":""unity"",""packageFileName"":""greybox.zip"",""fileCount"":1,""sizeBytes"":64}");
            Assert.False(missingAvailable.Available);
            StringAssert.Contains("available=true", missingAvailable.ErrorMessage);

            GreyboxEnginePackagePreflight missingFileName = ParseEnginePackagePreflight(@"{""engine"":""unity"",""available"":true,""fileCount"":1,""sizeBytes"":64}");
            Assert.False(missingFileName.Available);
            StringAssert.Contains("missing packageFileName", missingFileName.ErrorMessage);

            GreyboxEnginePackagePreflight pathFileName = ParseEnginePackagePreflight(@"{""engine"":""unity"",""available"":true,""packageFileName"":""../greybox.zip"",""fileCount"":1,""sizeBytes"":64}");
            Assert.False(pathFileName.Available);
            StringAssert.Contains("not a path", pathFileName.ErrorMessage);

            GreyboxEnginePackagePreflight unsupportedEngine = ParseEnginePackagePreflight(@"{""engine"":""unity/../../godot"",""available"":true,""packageFileName"":""greybox.zip"",""fileCount"":1,""sizeBytes"":64}");
            Assert.False(unsupportedEngine.Available);
            StringAssert.Contains("unsupported engine", unsupportedEngine.ErrorMessage);

            GreyboxEnginePackagePreflight wrongExtension = ParseEnginePackagePreflight(@"{""engine"":""unity"",""available"":true,""packageFileName"":""greybox.unitypackage"",""fileCount"":1,""sizeBytes"":64}");
            Assert.False(wrongExtension.Available);
            StringAssert.Contains(".zip", wrongExtension.ErrorMessage);

            GreyboxEnginePackagePreflight emptyFiles = ParseEnginePackagePreflight(@"{""engine"":""unity"",""available"":true,""packageFileName"":""greybox.zip"",""fileCount"":0,""sizeBytes"":64}");
            Assert.False(emptyFiles.Available);
            StringAssert.Contains("at least one file", emptyFiles.ErrorMessage);

            GreyboxEnginePackagePreflight tooManyFiles = ParseEnginePackagePreflight(@"{""engine"":""unity"",""available"":true,""packageFileName"":""greybox.zip"",""fileCount"":2049,""sizeBytes"":64,""contentRevisionSha256"":""aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa""}");
            Assert.False(tooManyFiles.Available);
            StringAssert.Contains("fileCount must be at most", tooManyFiles.ErrorMessage);

            GreyboxEnginePackagePreflight emptyBytes = ParseEnginePackagePreflight(@"{""engine"":""unity"",""available"":true,""packageFileName"":""greybox.zip"",""fileCount"":1,""sizeBytes"":0}");
            Assert.False(emptyBytes.Available);
            StringAssert.Contains("positive sizeBytes", emptyBytes.ErrorMessage);

            GreyboxEnginePackagePreflight oversizedPackage = ParseEnginePackagePreflight(@"{""engine"":""unity"",""available"":true,""packageFileName"":""greybox.zip"",""fileCount"":1,""sizeBytes"":536870913,""contentRevisionSha256"":""aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa""}");
            Assert.False(oversizedPackage.Available);
            StringAssert.Contains("sizeBytes must be at most", oversizedPackage.ErrorMessage);

            GreyboxEnginePackagePreflight oversizedMetric = ParseEnginePackagePreflight(@"{""engine"":""unity"",""available"":true,""packageFileName"":""greybox.zip"",""fileCount"":1,""sizeBytes"":64,""contentRevisionSha256"":""aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"",""manifest"":{""terrainColliderCount"":100001}}");
            Assert.False(oversizedMetric.Available);
            StringAssert.Contains("between 0", oversizedMetric.ErrorMessage);

            GreyboxEnginePackagePreflight oversizedResponse = ParseEnginePackagePreflight(new string('x', 65537));
            Assert.False(oversizedResponse.Available);
            StringAssert.Contains("response exceeded", oversizedResponse.ErrorMessage);

            GreyboxEnginePackagePreflight noisyMessage = ParseEnginePackagePreflight(@"{""engine"":""unity"",""available"":false,""errorMessage"":""" + new string('m', 600) + @"\nsecret""}");
            Assert.False(noisyMessage.Available);
            Assert.LessOrEqual(noisyMessage.ErrorMessage.Length, 512);
            Assert.False(noisyMessage.ErrorMessage.Contains("\n"));
        }

        [Test]
        public void LiveSyncPackageHandoffRequiresPreflightAndChecksumManifest()
        {
            var timer = System.Diagnostics.Stopwatch.StartNew();
            string packageBackedGameview = @"{""actors"":[{""id"":""boss"",""meshUrl"":""http://127.0.0.1/private/boss.fbx"",""greyboxImportedAssets"":[{""path"":""Assets/Greybox/Imported/abcdef/Boss.fbx"",""sha256"":""" + new string('a', 64) + @""",""bytes"":128}]}]}";
            Assert.True(
                ShouldRequestPackageRefresh("levels/arena.gameview.json", packageBackedGameview),
                "Package-backed gameview changes should request daemon preflight instead of fetching local-private asset URLs from JSON.");
            Assert.False(
                ShouldRequestPackageRefresh("levels/arena.gameview.json", @"{""actors"":[{""id"":""boss"",""health"":3}]}"),
                "Plain gameplay balance edits should not prompt package download UI.");

            GreyboxEnginePackagePreflight ready = ParseEnginePackagePreflight(@"{""engine"":""unity"",""available"":true,""sourceFileName"":""levels/arena.gameview.json"",""packageFileName"":""greybox-unity-engine-package.zip"",""fileCount"":2,""sizeBytes"":256,""contentRevisionSha256"":""aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"",""manifest"":{""terrainColliderCount"":1,""dynamicEventCount"":1,""factionCount"":2}}");
            Assert.True(ready.Available);
            Assert.AreEqual("levels/arena.gameview.json", ready.SourceFileName);
            Assert.AreEqual("greybox-unity-engine-package.zip", ready.PackageFileName);

            string tempRoot = Path.Combine(Path.GetTempPath(), "greybox-engine-package-smoke-" + Guid.NewGuid().ToString("N"));
            string zipPath = Path.Combine(tempRoot, "greybox-unity-engine-package.zip");
            string extractRoot = Path.Combine(tempRoot, "Assets", "GreyboxGenerated", "EnginePackage");
            Directory.CreateDirectory(tempRoot);
            const string runtimePath = "levels/arena/unity/AGDSGameViewRuntime.cs";
            const string runtimeSource = "public sealed class AGDSGameViewRuntime { public const int Version = 1; }\\n";
            string importedRuntime = Path.Combine(extractRoot, "levels", "arena", "unity", "AGDSGameViewRuntime.cs");

            try
            {
                using (var stream = File.Create(zipPath))
                using (var archive = new ZipArchive(stream, ZipArchiveMode.Create))
                {
                    WriteEnginePackageEntry(archive, runtimePath, runtimeSource);
                    WriteEnginePackageEntry(archive, "GreyboxEnginePackageManifest.json", EnginePackageManifest(runtimePath, runtimeSource));
                }

                Assert.AreEqual(2, ExtractEnginePackageZip(zipPath, extractRoot));
                Assert.True(File.Exists(importedRuntime), "Checksum-verified package imports should materialize runtime files under the generated package root.");

                File.Delete(zipPath);
                using (var stream = File.Create(zipPath))
                using (var archive = new ZipArchive(stream, ZipArchiveMode.Create))
                {
                    WriteEnginePackageEntry(archive, runtimePath, "tampered local-private-runtime\\n");
                    WriteEnginePackageEntry(archive, "GreyboxEnginePackageManifest.json", EnginePackageManifest(runtimePath, runtimeSource));
                }

                Assert.Throws<InvalidDataException>(() => ExtractEnginePackageZip(zipPath, extractRoot));
                Assert.True(File.Exists(importedRuntime), "Failed checksum validation should keep the previous checksum-verified package import intact.");

                timer.Stop();
                Assert.Less(timer.Elapsed.TotalSeconds, 30d, "Live-sync package preflight and checksum handoff checks should complete in under 30 seconds.");
            }
            finally
            {
                if (Directory.Exists(tempRoot)) Directory.Delete(tempRoot, true);
            }
        }

        [Test]
        public void ConflictInboxInjectsRepresentativeRoundTripSmokeConflict()
        {
            GreyboxConflictInbox.Clear();
            try
            {
                Assert.True(GreyboxConflictInbox.RecordExampleRoundTripConflict());
                Assert.AreEqual(3, GreyboxConflictInbox.Conflicts.Count);

                GreyboxRoundTripConflict health = GreyboxConflictInbox.Conflicts.FirstOrDefault(item => item.Path == "$.actors[id=boss].health");
                GreyboxRoundTripConflict position = GreyboxConflictInbox.Conflicts.FirstOrDefault(item => item.Path == "$.spawnPoints[id=hero].position");
                GreyboxRoundTripConflict title = GreyboxConflictInbox.Conflicts.FirstOrDefault(item => item.Path == "$.hud.title");

                Assert.NotNull(health, "Smoke conflict should include a numeric gameplay balance edit.");
                Assert.NotNull(position, "Smoke conflict should include a Vector3-like spawn transform edit.");
                Assert.NotNull(title, "Smoke conflict should include a string HUD edit.");
                Assert.AreEqual("3", health.WebValueJson);
                Assert.AreEqual("2", health.UnityValueJson);
                StringAssert.Contains(@"""x"":2", position.WebValueJson);
                Assert.AreEqual(@"""Greybox Smoke Merge""", title.UnityValueJson);
            }
            finally
            {
                GreyboxConflictInbox.Clear();
            }
        }

        [Test]
        public void ConflictResolverCoversWebUnityManualAndBatchUnderThirtySeconds()
        {
            var timer = System.Diagnostics.Stopwatch.StartNew();
            var health = new GreyboxRoundTripConflict
            {
                FileName = "arena.gameview.json",
                Path = "$.actors[id=boss].health",
                WebValueJson = "3",
                MergedContent = @"{""actors"":[{""id"":""boss"",""health"":2,""speed"":1.5},{""id"":""minion"",""health"":1,""speed"":1}]}"
            };
            var speed = new GreyboxRoundTripConflict
            {
                FileName = "arena.gameview.json",
                Path = "$.actors[id=minion].speed",
                WebValueJson = "2.25",
                MergedContent = health.MergedContent
            };

            JObject web = JObject.Parse(GreyboxConflictResolver.ResolveContent(health, GreyboxConflictResolution.Web));
            Assert.AreEqual(3, web["actors"][0]["health"].Value<int>(), "Accept Web should patch the conflict path into the merged draft.");

            JObject batchWeb = JObject.Parse(GreyboxConflictResolver.ResolveContent(new[] { health, speed }, GreyboxConflictResolution.Web));
            Assert.AreEqual(3, batchWeb["actors"][0]["health"].Value<int>(), "Batch Accept Web should patch the first conflict.");
            Assert.AreEqual(2.25f, batchWeb["actors"][1]["speed"].Value<float>(), "Batch Accept Web should patch the second conflict.");

            Assert.AreEqual(
                health.MergedContent,
                GreyboxConflictResolver.ResolveContent(health, GreyboxConflictResolution.Unity),
                "Accept Unity should keep the Unity-side merged draft.");

            string manualDraft = @"{""actors"":[{""id"":""boss"",""health"":4}]}";
            Assert.AreEqual(
                manualDraft,
                GreyboxConflictResolver.ResolveContent(health, GreyboxConflictResolution.Manual, manualDraft),
                "Accept Manual should submit the edited draft.");

            timer.Stop();
            Assert.Less(timer.Elapsed.TotalSeconds, 30d, "Representative round-trip conflicts should resolve in under 30 seconds.");
        }

        [Test]
        public void ConflictWindowActionsPostRefreshAndClearInboxUnderThirtySeconds()
        {
            var timer = System.Diagnostics.Stopwatch.StartNew();
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
                config.ProjectId = "conflict-window-smoke";
                config.DaemonUrl = "http://127.0.0.1:17456";
                InstallProSmokeLicense();

                GreyboxConflictInbox.Clear();
                Assert.True(GreyboxConflictInbox.RecordExampleRoundTripConflict());
                GreyboxRoundTripConflict health = SmokeConflict("$.actors[id=boss].health");
                var window = ScriptableObject.CreateInstance<GreyboxConflictWindow>();
                try
                {
                    Assert.AreEqual(health.MergedContent, InvokeManualDraft(window, health), "Conflict window manual draft should start from the merged daemon draft.");
                    string serialized = InvokeConflictJson();
                    StringAssert.Contains("$.actors[id=boss].health", serialized);
                    Assert.NotNull(typeof(GreyboxConflictWindow).GetMethod("ResolveAll", BindingFlags.Static | BindingFlags.NonPublic), "Conflict window should keep the Accept All action wired.");
                }
                finally
                {
                    UnityEngine.Object.DestroyImmediate(window);
                }

                Assert.True(InvokeAcceptWebMerge(config, health, post, refresh), "Accept Web should post a patched web merge through the resolver.");
                Assert.False(GreyboxConflictInbox.Conflicts.Contains(health));
                Assert.AreEqual("Samples/2D Platformer/platformer.gameview.json", postedFiles.Last());
                StringAssert.Contains(@"""health"": 3", postedContents.Last());
                CollectionAssert.Contains(refreshedFiles, "Samples/2D Platformer/platformer.gameview.json");

                GreyboxConflictInbox.Clear();
                Assert.True(GreyboxConflictInbox.RecordExampleRoundTripConflict());
                health = SmokeConflict("$.actors[id=boss].health");
                Assert.True(InvokeAcceptUnityMerge(config, health, post, refresh), "Accept Unity should post the daemon merged draft.");
                StringAssert.Contains(@"""health"":2", postedContents.Last());

                GreyboxConflictInbox.Clear();
                Assert.True(GreyboxConflictInbox.RecordExampleRoundTripConflict());
                health = SmokeConflict("$.actors[id=boss].health");
                Assert.True(InvokeAcceptManualMerge(config, health, @"{""actors"":[{""id"":""boss"",""health"":4}]}", post, refresh), "Accept Manual should post the edited draft.");
                StringAssert.Contains(@"""health"":4", postedContents.Last());

                GreyboxConflictInbox.Clear();
                Assert.True(GreyboxConflictInbox.RecordExampleRoundTripConflict());
                int accepted = InvokeAcceptBatchMerge(config, GreyboxConflictInbox.Conflicts.ToArray(), GreyboxConflictResolution.Web, post, refresh);
                Assert.AreEqual(3, accepted, "Accept All Web should resolve every non-sidecar conflict in the document.");
                Assert.AreEqual(0, GreyboxConflictInbox.Conflicts.Count);
                StringAssert.Contains(@"""health"": 3", postedContents.Last());
                StringAssert.Contains(@"""x"": 2", postedContents.Last());
                StringAssert.Contains(@"""title"": ""Greybox Web Revision""", postedContents.Last());

                timer.Stop();
                Assert.Less(timer.Elapsed.TotalSeconds, 30d, "Conflict window accept actions should post, refresh, and clear review items in under 30 seconds.");
            }
            finally
            {
                GreyboxConflictInbox.Clear();
                GreyboxSettings.SetLicenseKey("");
                UnityEngine.Object.DestroyImmediate(config);
            }
        }

        [Test]
        public void PrefabSidecarResolutionPreservesCanonicalChoiceUnderThirtySeconds()
        {
            var timer = System.Diagnostics.Stopwatch.StartNew();
            GreyboxConflictInbox.Clear();
            string projectId = "sidecar-smoke-" + Guid.NewGuid().ToString("N");
            string acceptSource = "Assets/GreyboxSmoke/Sidecar/accept.gameview";
            string keepSource = "Assets/GreyboxSmoke/Sidecar/keep.gameview";
            string acceptCanonicalPath = PrefabAssetExporter.GeneratedPrefabPath(GreyboxArtifactKind.GameViewport, acceptSource, projectId);
            string keepCanonicalPath = PrefabAssetExporter.GeneratedPrefabPath(GreyboxArtifactKind.GameViewport, keepSource, projectId);
            string projectFolder = GeneratedProjectFolder(acceptCanonicalPath);

            try
            {
                string acceptFirstPath = ExportSmokeGameViewport(acceptSource, projectId, @"{""title"":""Accept Arena"",""spawnPoints"":[{""id"":""spawn-a""}]}");
                string acceptGuid = AssetDatabase.AssetPathToGUID(acceptFirstPath);
                Assert.IsFalse(string.IsNullOrWhiteSpace(acceptGuid));
                AddUserRigidbodyToPrefab(acceptCanonicalPath);

                string acceptSidecarPath = ExportSmokeGameViewport(acceptSource, projectId, @"{""title"":""Accept Arena"",""spawnPoints"":[{""id"":""spawn-a""}],""objectives"":[{""id"":""relic""}]}");
                Assert.AreEqual(PrefabAssetExporter.IncomingSidecarPath(acceptCanonicalPath), acceptSidecarPath);
                GreyboxRoundTripConflict acceptConflict = GreyboxConflictInbox.Conflicts.First(item => item.FileName == acceptCanonicalPath && GreyboxPrefabSidecarResolver.IsPrefabSidecar(item));
                Assert.IsTrue(GreyboxPrefabSidecarResolver.AcceptIncoming(acceptConflict), "Adopt Incoming should replace canonical prefab contents with the regenerated sidecar.");
                var adoptedCanonical = AssetDatabase.LoadAssetAtPath<GameObject>(acceptCanonicalPath);
                Assert.NotNull(adoptedCanonical);
                Assert.AreEqual(acceptGuid, AssetDatabase.AssetPathToGUID(acceptCanonicalPath), "Adopting incoming sidecars must preserve the canonical prefab GUID.");
                Assert.NotNull(adoptedCanonical.transform.Find("Objectives/relic"));
                Assert.IsNull(adoptedCanonical.GetComponent<Rigidbody>(), "Adopt Incoming should discard user-added canonical components.");
                Assert.IsNull(AssetDatabase.LoadAssetAtPath<GameObject>(acceptSidecarPath));

                string keepFirstPath = ExportSmokeGameViewport(keepSource, projectId, @"{""title"":""Keep Arena"",""spawnPoints"":[{""id"":""spawn-a""}]}");
                Assert.IsFalse(string.IsNullOrWhiteSpace(AssetDatabase.AssetPathToGUID(keepFirstPath)));
                AddUserRigidbodyToPrefab(keepCanonicalPath);
                string keepSidecarPath = ExportSmokeGameViewport(keepSource, projectId, @"{""title"":""Keep Arena"",""spawnPoints"":[{""id"":""spawn-a""}],""objectives"":[{""id"":""relic""}]}");
                GreyboxRoundTripConflict keepConflict = GreyboxConflictInbox.Conflicts.First(item => item.FileName == keepCanonicalPath && GreyboxPrefabSidecarResolver.IsPrefabSidecar(item));
                Assert.IsTrue(GreyboxPrefabSidecarResolver.KeepCanonical(keepConflict), "Keep Canonical should discard the incoming sidecar.");
                var keptCanonical = AssetDatabase.LoadAssetAtPath<GameObject>(keepCanonicalPath);
                Assert.NotNull(keptCanonical);
                Assert.NotNull(keptCanonical.GetComponent<Rigidbody>(), "Keep Canonical should preserve user-added components.");
                Assert.IsNull(keptCanonical.transform.Find("Objectives"));
                Assert.IsNull(AssetDatabase.LoadAssetAtPath<GameObject>(keepSidecarPath));
                Assert.AreEqual(0, GreyboxConflictInbox.Conflicts.Count);

                timer.Stop();
                Assert.Less(timer.Elapsed.TotalSeconds, 30d, "Prefab sidecar review actions should complete in under 30 seconds.");
            }
            finally
            {
                GreyboxConflictInbox.Clear();
                AssetDatabase.DeleteAsset(projectFolder);
            }
        }

        [Test]
        public void RequiredSamplesDocumentationAndLegalFilesArePresent()
        {
            var package = PackageInfo.FindForPackageName("com.greybox.studio");
            Assert.NotNull(package, "com.greybox.studio should be resolved by Unity Package Manager.");

            AssertDirectory(package.resolvedPath, "Samples~", "2D Platformer");
            AssertDirectory(package.resolvedPath, "Samples~", "Top-Down Roguelike");
            AssertDirectory(package.resolvedPath, "Samples~", "Mobile Idle");
            AssertFile(package.resolvedPath, "Documentation~", "round-trip-sync.md");
            AssertFile(package.resolvedPath, "README.md");
            AssertFile(package.resolvedPath, "LICENSE.md");
            AssertFile(package.resolvedPath, "Third-Party Notices.txt");
            AssertFile(package.resolvedPath, "CHANGELOG.md");
        }

        [Test]
        public void McpToolDefinitionsAreProtocolShapedJson()
        {
            JObject document = JObject.Parse(McpToolDefinitions.ToolsJson());
            JArray tools = document["tools"] as JArray;
            Assert.NotNull(tools, "MCP tools/list response should include a tools array.");
            Assert.AreEqual(8, tools.Count, "MCP bridge should expose the expected Unity tool surface.");
            AssertToolSchema(tools, "unity.getSceneHierarchy");
            AssertToolSchema(tools, "unity.createGameObject");
            AssertToolSchema(tools, "unity.addComponent");
            AssertToolSchema(tools, "unity.setField");
            AssertToolSchema(tools, "unity.assignAsset");
            AssertToolSchema(tools, "unity.runEditModeTest");
            AssertToolSchema(tools, "unity.captureGameViewScreenshot");
            AssertToolSchema(tools, "unity.buildAddressables");
        }

        [Test]
        public void McpBridgeHandlesProtocolAndHierarchySmoke()
        {
            JObject initialize = JObject.Parse(InvokeMcpJsonRpc(@"{""jsonrpc"":""2.0"",""id"":1,""method"":""initialize""}"));
            Assert.AreEqual("2.0", initialize.Value<string>("jsonrpc"));
            Assert.AreEqual("2024-11-05", initialize["result"].Value<string>("protocolVersion"));
            Assert.AreEqual("greybox-unity-mcp", initialize["result"]["serverInfo"].Value<string>("name"));

            JObject list = JObject.Parse(InvokeMcpJsonRpc(@"{""jsonrpc"":""2.0"",""id"":2,""method"":""tools/list""}"));
            JArray tools = list["result"]["tools"] as JArray;
            Assert.NotNull(tools);
            Assert.AreEqual(8, tools.Count);

            var root = new GameObject("MCP Smoke Root");
            var child = new GameObject("Boss");
            child.transform.SetParent(root.transform, false);
            child.transform.localPosition = new Vector3(1f, 2f, 3f);
            var marker = child.AddComponent<GreyboxMarker>();
            marker.ArtifactKind = GreyboxArtifactKind.GameViewport;
            marker.SourceFileName = "Samples/2D Platformer/platformer.gameview.json";
            marker.Collection = "actors";
            marker.MarkerId = "boss";
            marker.MarkerName = "Boss";
            marker.JsonPath = "$.actors[id=boss]";
            marker.PositionJsonPath = "$.actors[id=boss].position";
            var actor = child.AddComponent<GreyboxActorDefinition>();
            actor.DisplayName = "Gate Boss";
            actor.Health = 2;
            var designNode = child.AddComponent<GreyboxDesignNode>();
            designNode.ArtifactKind = GreyboxArtifactKind.GameViewport;
            designNode.Collection = "actors";
            designNode.NodeId = "boss";
            designNode.DisplayName = "Gate Boss";
            designNode.JsonPath = "$.actors[id=boss]";
            designNode.Tags.Add("boss");
            designNode.Properties.Add(new GreyboxDesignProperty { Key = "phaseCount", Kind = GreyboxDesignPropertyKind.Number, Value = "2" });
            var imported = child.AddComponent<GreyboxImportedArtifact>();
            imported.ArtifactId = "artifact-smoke";
            imported.Kind = GreyboxArtifactKind.GameViewport;
            imported.CanonicalGeneratedAssetPath = "Assets/Greybox/Generated/local/GameViewports/platformer.prefab";
            imported.ExportedAssetPath = "Assets/Greybox/Generated/local/GameViewports/platformer.greybox-incoming.prefab";
            imported.ExportedToIncomingSidecar = true;
            try
            {
                JObject hierarchy = GreyboxMcpServer.DescribeForMcp(root);
                JToken describedChild = hierarchy["children"][0];
                Assert.AreEqual("MCP Smoke Root/Boss", describedChild.Value<string>("path"));
                Assert.AreEqual("boss", describedChild["greybox"].Value<string>("markerId"));
                Assert.AreEqual("$.actors[id=boss].position", describedChild["greybox"].Value<string>("positionJsonPath"));
                Assert.AreEqual("Gate Boss", describedChild["greyboxDesign"].Value<string>("displayName"));
                Assert.AreEqual("phaseCount", describedChild["greyboxDesign"]["properties"][0].Value<string>("key"));
                Assert.AreEqual("artifact-smoke", describedChild["greyboxImport"].Value<string>("artifactId"));
                Assert.AreEqual("Assets/Greybox/Generated/local/GameViewports/platformer.prefab", describedChild["greyboxImport"].Value<string>("canonicalGeneratedAssetPath"));
                Assert.AreEqual("Assets/Greybox/Generated/local/GameViewports/platformer.greybox-incoming.prefab", describedChild["greyboxImport"].Value<string>("exportedAssetPath"));
                Assert.True(describedChild["greyboxImport"].Value<bool>("exportedToIncomingSidecar"));
                Assert.False(describedChild["unityPrefab"].Value<bool>("isPartOfPrefabInstance"));
                Assert.AreEqual("", describedChild["unityPrefab"].Value<string>("nearestPrefabAssetPath"));
                Assert.IsTrue(describedChild["addableComponents"].Any(item => item.Value<string>("componentType") == typeof(Light).FullName && item.Value<string>("addTool") == "unity.addComponent" && item.Value<bool>("canAdd")));
                Assert.IsTrue(describedChild["addableComponents"].Any(item => item.Value<string>("componentType") == typeof(GreyboxActorDefinition).FullName && item.Value<bool>("alreadyAttached") && !item.Value<bool>("canAdd")));
                Assert.AreEqual("unity.setField", describedChild["writableGameObjectFields"]["tag"].Value<string>("setTool"));
                Assert.AreEqual("string", describedChild["writableGameObjectFields"]["tag"]["valueSchema"].Value<string>("kind"));
                Assert.AreEqual("unityTag", describedChild["writableGameObjectFields"]["tag"]["acceptedAliases"][1].Value<string>());
                Assert.IsTrue(describedChild["writableGameObjectFields"]["tag"]["allowedTags"].Any(item => item.Value<string>() == "Player"));
                Assert.True(describedChild["writableGameObjectFields"]["layer"].Value<bool>("propagatesToChildren"));
                Assert.IsTrue(describedChild["writableGameObjectFields"]["layer"]["allowedLayers"].Any(item => item.Value<string>("name") == "Ignore Raycast"));
                Assert.AreEqual(1f, describedChild["transform"]["localPosition"].Value<float>("x"));
                Assert.AreEqual("$.actors[id=boss].position", describedChild["roundTripTransform"]["localPosition"].Value<string>("path"));
                Assert.AreEqual("Samples/2D Platformer/platformer.gameview.json", describedChild["roundTripTransform"]["localPosition"].Value<string>("sourceFileName"));
                StringAssert.Contains(@"""writableProperties""", describedChild["componentDetails"].ToString());
                StringAssert.Contains(@"""writableFields""", describedChild["componentDetails"].ToString());
                StringAssert.Contains(@"""valueSchema""", describedChild["componentDetails"].ToString());
                StringAssert.Contains(@"""setTool"": ""unity.setField""", describedChild["componentDetails"].ToString());
                StringAssert.Contains(@"""assetReferenceFields""", describedChild["componentDetails"].ToString());
                StringAssert.Contains(@"""assignTool"": ""unity.assignAsset""", describedChild["componentDetails"].ToString());
                StringAssert.Contains(@"""Health"": 2", describedChild["componentDetails"].ToString());
                StringAssert.Contains(@"""roundTripFields""", describedChild["componentDetails"].ToString());
                StringAssert.Contains(@"""path"": ""$.actors[id=boss].health""", describedChild["componentDetails"].ToString());
                StringAssert.Contains(@"""sourceFileName"": ""Samples/2D Platformer/platformer.gameview.json""", describedChild["componentDetails"].ToString());
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void McpBridgeCreatesAndEditsRoundTripObjects()
        {
            ClearMcpRoundTripEdits();
            var group = new GameObject("Actors");
            var spawnGroup = new GameObject("Spawn Points");
            var objectiveGroup = new GameObject("Objectives");
            var hazardGroup = new GameObject("Hazards");
            var roomGroup = new GameObject("Rooms");
            var encounterGroup = new GameObject("Encounters");
            var tileGroup = new GameObject("Tiles", typeof(Tilemap), typeof(TilemapRenderer), typeof(GreyboxLevelTilemap));
            var connectionGroup = new GameObject("Connections");
            var goalGroup = new GameObject("Goals");
            var checkpointGroup = new GameObject("Checkpoints");
            var coinGroup = new GameObject("Coins");
            const string mcpAssetFolder = "Assets/GreyboxSmoke/McpAssets";
            Tile smokeTile = null;
            Tile generatedSmokeTile = null;
            Sprite generatedSmokeSprite = null;
            Texture2D generatedSmokeTexture = null;
            var groupMarker = group.AddComponent<GreyboxMarker>();
            groupMarker.ArtifactKind = GreyboxArtifactKind.GameViewport;
            groupMarker.SourceFileName = "Samples/2D Platformer/platformer.gameview.json";
            groupMarker.Collection = "actors";
            groupMarker.MarkerName = "Actors";
            groupMarker.JsonPath = "$.actors";
            var spawnMarker = spawnGroup.AddComponent<GreyboxMarker>();
            spawnMarker.ArtifactKind = GreyboxArtifactKind.GameViewport;
            spawnMarker.SourceFileName = "Samples/2D Platformer/platformer.gameview.json";
            spawnMarker.Collection = "spawnPoints";
            spawnMarker.MarkerName = "Spawn Points";
            spawnMarker.JsonPath = "$.spawnPoints";
            var objectiveMarker = objectiveGroup.AddComponent<GreyboxMarker>();
            objectiveMarker.ArtifactKind = GreyboxArtifactKind.GameViewport;
            objectiveMarker.SourceFileName = "Samples/2D Platformer/platformer.gameview.json";
            objectiveMarker.Collection = "objectives";
            objectiveMarker.MarkerName = "Objectives";
            objectiveMarker.JsonPath = "$.objectives";
            var hazardMarker = hazardGroup.AddComponent<GreyboxMarker>();
            hazardMarker.ArtifactKind = GreyboxArtifactKind.GameViewport;
            hazardMarker.SourceFileName = "Samples/2D Platformer/platformer.gameview.json";
            hazardMarker.Collection = "hazards";
            hazardMarker.MarkerName = "Hazards";
            hazardMarker.JsonPath = "$.hazards";
            var roomMarker = roomGroup.AddComponent<GreyboxMarker>();
            roomMarker.ArtifactKind = GreyboxArtifactKind.LevelBoard;
            roomMarker.SourceFileName = "Samples/2D Platformer/platformer.levelboard.json";
            roomMarker.Collection = "rooms";
            roomMarker.MarkerName = "Rooms";
            roomMarker.JsonPath = "$.rooms";
            var encounterMarker = encounterGroup.AddComponent<GreyboxMarker>();
            encounterMarker.ArtifactKind = GreyboxArtifactKind.LevelBoard;
            encounterMarker.SourceFileName = "Samples/2D Platformer/platformer.levelboard.json";
            encounterMarker.Collection = "encounters";
            encounterMarker.MarkerName = "Encounters";
            encounterMarker.JsonPath = "$.encounters";
            var tileMarker = tileGroup.AddComponent<GreyboxMarker>();
            tileMarker.ArtifactKind = GreyboxArtifactKind.LevelBoard;
            tileMarker.SourceFileName = "Samples/2D Platformer/platformer.levelboard.json";
            tileMarker.Collection = "tiles";
            tileMarker.MarkerId = "tiles";
            tileMarker.MarkerName = "Tiles";
            tileMarker.JsonPath = "$.tilemap.tiles";
            var connectionMarker = connectionGroup.AddComponent<GreyboxMarker>();
            connectionMarker.ArtifactKind = GreyboxArtifactKind.LevelBoard;
            connectionMarker.SourceFileName = "Samples/2D Platformer/platformer.levelboard.json";
            connectionMarker.Collection = "connections";
            connectionMarker.MarkerName = "Connections";
            connectionMarker.JsonPath = "$.connections";
            var goalMarker = goalGroup.AddComponent<GreyboxMarker>();
            goalMarker.ArtifactKind = GreyboxArtifactKind.GameViewport;
            goalMarker.SourceFileName = "Samples/2D Platformer/platformer.gameview.json";
            goalMarker.Collection = "goals";
            goalMarker.MarkerName = "Goals";
            goalMarker.JsonPath = "$.goals";
            var checkpointMarker = checkpointGroup.AddComponent<GreyboxMarker>();
            checkpointMarker.ArtifactKind = GreyboxArtifactKind.GameViewport;
            checkpointMarker.SourceFileName = "Samples/2D Platformer/platformer.gameview.json";
            checkpointMarker.Collection = "checkpoints";
            checkpointMarker.MarkerName = "Checkpoints";
            checkpointMarker.JsonPath = "$.checkpoints";
            var coinMarker = coinGroup.AddComponent<GreyboxMarker>();
            coinMarker.ArtifactKind = GreyboxArtifactKind.GameViewport;
            coinMarker.SourceFileName = "Samples/2D Platformer/platformer.gameview.json";
            coinMarker.Collection = "coins";
            coinMarker.MarkerName = "Coins";
            coinMarker.JsonPath = "$.coins";
            try
            {
                if (AssetDatabase.IsValidFolder(mcpAssetFolder))
                {
                    AssetDatabase.DeleteAsset(mcpAssetFolder);
                }
                AssetDatabase.CreateFolder("Assets/GreyboxSmoke", "McpAssets");
                string meshPath = mcpAssetFolder + "/SmokeBossMesh.asset";
                var smokeMesh = new Mesh
                {
                    name = "SmokeBossMesh",
                    vertices = new[] { Vector3.zero, Vector3.right, Vector3.up },
                    triangles = new[] { 0, 1, 2 }
                };
                AssetDatabase.CreateAsset(smokeMesh, meshPath);
                smokeTile = ScriptableObject.CreateInstance<Tile>();
                smokeTile.name = "Greybox Smoke Hazard Tile";
                var tileMetadata = tileGroup.GetComponent<GreyboxLevelTilemap>();
                tileMetadata.TileRecords = new[]
                {
                    new GreyboxLevelTileRecord
                    {
                        TileId = "smoke-hazard-existing",
                        TileType = "hazard",
                        SourceJsonPath = "$.tilemap.tiles[tileId=smoke-hazard-existing]",
                        Position = Vector3Int.zero,
                        Walkable = true,
                        IsHazard = true,
                        ColorHex = "#E94B3CFF"
                    }
                };
                tileMetadata.TileAssets = new TileBase[] { smokeTile };

                string parentId = GlobalObjectId.GetGlobalObjectIdSlow(group).ToString();
                JObject create = (JObject)InvokeMcpTool("unity.createGameObject", new JObject
                {
                    ["name"] = "Smoke Boss",
                    ["parentId"] = parentId,
                    ["position"] = new JObject { ["x"] = 4f, ["y"] = 1f, ["z"] = 0f }
                });

                var child = group.transform.Find("Smoke Boss");
                Assert.NotNull(child, "MCP createGameObject should add a child under the requested Greybox collection.");
                var marker = child.GetComponent<GreyboxMarker>();
                Assert.NotNull(marker, "MCP-created Greybox nodes should carry round-trip marker metadata.");
                Assert.AreEqual("smoke-boss", marker.MarkerId);
                Assert.AreEqual("$.actors[actorId=smoke-boss]", marker.JsonPath);
                Assert.AreEqual("$.actors[actorId=smoke-boss].position", marker.PositionJsonPath);
                var createdActor = child.GetComponent<GreyboxActorDefinition>();
                Assert.NotNull(createdActor, "Actors created by MCP should receive the default runtime actor component.");
                Assert.AreEqual("smoke-boss", createdActor.ActorId);
                Assert.AreEqual("Smoke Boss", createdActor.DisplayName);
                Assert.AreEqual(1, createdActor.Health);
                Assert.AreEqual(1f, createdActor.MoveSpeed, 0.01f);
                Assert.AreEqual(1, createdActor.Damage);
                Assert.AreEqual(1f, createdActor.AttackRange, 0.01f);
                Assert.AreEqual(1f, createdActor.AttackCooldownSeconds, 0.01f);
                Assert.AreEqual(5f, createdActor.AggroRadius, 0.01f);
                Assert.AreEqual("$.actors[actorId=smoke-boss]", create.Value<string>("roundTripPath"));
                Assert.AreEqual("smoke-boss", create["roundTripValue"].Value<string>("actorId"));
                Assert.AreEqual(1, create["roundTripValue"].Value<int>("health"));
                Assert.AreEqual(1f, create["roundTripValue"].Value<float>("moveSpeed"), 0.01f);
                Assert.AreEqual(1, create["roundTripValue"].Value<int>("damage"));
                Assert.AreEqual(1f, create["roundTripValue"].Value<float>("attackRange"), 0.01f);
                Assert.AreEqual(1f, create["roundTripValue"].Value<float>("attackCooldownSeconds"), 0.01f);
                Assert.AreEqual(5f, create["roundTripValue"].Value<float>("aggroRadius"), 0.01f);
                Assert.True(create.Value<bool>("sceneDirty"), "MCP createGameObject should report sceneDirty so agent-created nodes are not lost.");
                Assert.AreEqual(1, PendingMcpRoundTripEditCount(), "MCP createGameObject should queue an insert for web round-trip.");

                JObject connectionDefault = (JObject)InvokeMcpTool("unity.createGameObject", new JObject
                {
                    ["name"] = "Smoke Connection",
                    ["parentId"] = GlobalObjectId.GetGlobalObjectIdSlow(connectionGroup).ToString()
                });
                Assert.AreEqual("$.connections[connectionId=smoke-connection]", connectionDefault.Value<string>("roundTripPath"));
                Assert.AreEqual("smoke-connection", connectionDefault["roundTripValue"].Value<string>("connectionId"));
                Assert.AreEqual("connection", connectionDefault["roundTripValue"].Value<string>("type"));
                Assert.AreEqual(1f, connectionDefault["roundTripValue"].Value<float>("travelCost"), 0.01f);
                var createdConnection = connectionGroup.transform.Find("Smoke Connection").GetComponent<GreyboxLevelConnection>();
                Assert.NotNull(createdConnection);
                Assert.AreEqual("smoke-connection", createdConnection.ConnectionId);
                Assert.AreEqual("connection", createdConnection.ConnectionType);
                Assert.AreEqual(1f, createdConnection.TravelCost, 0.01f);
                Assert.AreEqual(2, PendingMcpRoundTripEditCount(), "MCP connection createGameObject should queue a defaulted graph insert.");

                JObject goalDefault = (JObject)InvokeMcpTool("unity.createGameObject", new JObject
                {
                    ["name"] = "Smoke Goal",
                    ["parentId"] = GlobalObjectId.GetGlobalObjectIdSlow(goalGroup).ToString()
                });
                Assert.AreEqual("$.goals[goalId=smoke-goal]", goalDefault.Value<string>("roundTripPath"));
                Assert.AreEqual("smoke-goal", goalDefault["roundTripValue"].Value<string>("goalId"));
                Assert.AreEqual("exit", goalDefault["roundTripValue"].Value<string>("objectiveType"));
                Assert.AreEqual(1, goalDefault["roundTripValue"].Value<int>("requiredCount"));
                var createdGoalObject = goalGroup.transform.Find("Smoke Goal");
                var createdGoal = createdGoalObject.GetComponent<GreyboxPlatformerSampleGoal>();
                Assert.NotNull(createdGoal);
                Assert.AreEqual("smoke-goal", createdGoal.GoalId);
                Assert.AreEqual("Smoke Goal", createdGoal.DisplayName);
                Assert.AreEqual("exit", createdGoal.ObjectiveType);
                Assert.AreEqual("gameview.objective", createdGoal.SourceArtifactKind);
                Assert.AreEqual("smoke-goal", createdGoal.SourceArtifactId);
                Assert.AreEqual("Smoke Goal", createdGoal.SourceArtifactDisplayName);
                Assert.AreEqual(1, createdGoal.RequiredCount);
                Assert.True(createdGoalObject.GetComponent<BoxCollider2D>().isTrigger);
                Assert.AreEqual(3, PendingMcpRoundTripEditCount(), "MCP playable goal createGameObject should queue a defaulted gameplay insert.");

                JObject checkpointDefault = (JObject)InvokeMcpTool("unity.createGameObject", new JObject
                {
                    ["name"] = "Smoke Checkpoint",
                    ["parentId"] = GlobalObjectId.GetGlobalObjectIdSlow(checkpointGroup).ToString(),
                    ["position"] = new JObject { ["x"] = 6f, ["y"] = 2f, ["z"] = 0f }
                });
                Assert.AreEqual("$.checkpoints[checkpointId=smoke-checkpoint]", checkpointDefault.Value<string>("roundTripPath"));
                Assert.AreEqual("smoke-checkpoint", checkpointDefault["roundTripValue"].Value<string>("checkpointId"));
                Assert.AreEqual(1, checkpointDefault["roundTripValue"].Value<int>("maxActivations"));
                Assert.True(checkpointDefault["roundTripValue"].Value<bool>("spawnOnStart"));
                Assert.AreEqual(6f, checkpointDefault["roundTripValue"]["respawnPoint"].Value<float>("x"), 0.01f);
                var createdCheckpointObject = checkpointGroup.transform.Find("Smoke Checkpoint");
                var createdCheckpoint = createdCheckpointObject.GetComponent<GreyboxPlatformerSampleCheckpoint>();
                Assert.NotNull(createdCheckpoint);
                Assert.AreEqual("smoke-checkpoint", createdCheckpoint.CheckpointId);
                Assert.AreEqual("Smoke Checkpoint", createdCheckpoint.DisplayName);
                Assert.AreEqual("gameview.checkpoint", createdCheckpoint.SourceArtifactKind);
                Assert.AreEqual("smoke-checkpoint", createdCheckpoint.SourceArtifactId);
                Assert.AreEqual("Smoke Checkpoint", createdCheckpoint.SourceArtifactDisplayName);
                Assert.AreEqual(1, createdCheckpoint.MaxActivations);
                Assert.AreEqual(new Vector3(6f, 2f, 0f), createdCheckpoint.RespawnPoint);
                Assert.True(createdCheckpointObject.GetComponent<BoxCollider2D>().isTrigger);
                Assert.AreEqual(4, PendingMcpRoundTripEditCount(), "MCP checkpoint createGameObject should queue a defaulted respawn insert.");

                JObject coinDefault = (JObject)InvokeMcpTool("unity.createGameObject", new JObject
                {
                    ["name"] = "Smoke Coin",
                    ["parentId"] = GlobalObjectId.GetGlobalObjectIdSlow(coinGroup).ToString()
                });
                Assert.AreEqual("$.coins[coinId=smoke-coin]", coinDefault.Value<string>("roundTripPath"));
                Assert.AreEqual("smoke-coin", coinDefault["roundTripValue"].Value<string>("coinId"));
                Assert.AreEqual("smoke-coin", coinDefault["roundTripValue"].Value<string>("sourceObjectiveId"));
                Assert.AreEqual("Smoke Coin", coinDefault["roundTripValue"].Value<string>("sourceObjectiveDisplayName"));
                Assert.AreEqual("collectible", coinDefault["roundTripValue"].Value<string>("sourceObjectiveType"));
                var createdCoinObject = coinGroup.transform.Find("Smoke Coin");
                var createdCoin = createdCoinObject.GetComponent<GreyboxPlatformerSampleCollectible>();
                Assert.NotNull(createdCoin);
                Assert.AreEqual("smoke-coin", createdCoin.CoinId);
                Assert.AreEqual("Smoke Coin", createdCoin.DisplayName);
                Assert.AreEqual("gameview.collectible", createdCoin.SourceArtifactKind);
                Assert.AreEqual("smoke-coin", createdCoin.SourceArtifactId);
                Assert.AreEqual("Smoke Coin", createdCoin.SourceArtifactDisplayName);
                Assert.AreEqual("smoke-coin", createdCoin.SourceObjectiveId);
                Assert.AreEqual("Smoke Coin", createdCoin.SourceObjectiveDisplayName);
                Assert.AreEqual("collectible", createdCoin.SourceObjectiveType);
                Assert.True(createdCoinObject.GetComponent<CircleCollider2D>().isTrigger);
                Assert.AreEqual(5, PendingMcpRoundTripEditCount(), "MCP coin createGameObject should queue a defaulted collectible insert.");

                JObject spawnDefault = (JObject)InvokeMcpTool("unity.createGameObject", new JObject
                {
                    ["name"] = "Smoke Spawn",
                    ["parentId"] = GlobalObjectId.GetGlobalObjectIdSlow(spawnGroup).ToString()
                });
                Assert.AreEqual("$.spawnPoints[spawnId=smoke-spawn]", spawnDefault.Value<string>("roundTripPath"));
                Assert.AreEqual("smoke-spawn", spawnDefault["roundTripValue"].Value<string>("spawnId"));
                Assert.AreEqual(0.5f, spawnDefault["roundTripValue"].Value<float>("spawnRadius"), 0.01f);
                var createdSpawn = spawnGroup.transform.Find("Smoke Spawn").GetComponent<GreyboxSpawnPoint>();
                Assert.NotNull(createdSpawn);
                Assert.AreEqual("smoke-spawn", createdSpawn.SpawnId);
                Assert.AreEqual("Smoke Spawn", createdSpawn.DisplayName);
                Assert.AreEqual(0.5f, createdSpawn.SpawnRadius, 0.01f);
                Assert.AreEqual(6, PendingMcpRoundTripEditCount(), "MCP spawn createGameObject should queue a defaulted spawn insert.");

                JObject objectiveDefault = (JObject)InvokeMcpTool("unity.createGameObject", new JObject
                {
                    ["name"] = "Smoke Objective",
                    ["parentId"] = GlobalObjectId.GetGlobalObjectIdSlow(objectiveGroup).ToString()
                });
                Assert.AreEqual("$.objectives[objectiveId=smoke-objective]", objectiveDefault.Value<string>("roundTripPath"));
                Assert.AreEqual("smoke-objective", objectiveDefault["roundTripValue"].Value<string>("objectiveId"));
                Assert.AreEqual("objective", objectiveDefault["roundTripValue"].Value<string>("objectiveType"));
                Assert.AreEqual(1, objectiveDefault["roundTripValue"].Value<int>("requiredCount"));
                var createdObjective = objectiveGroup.transform.Find("Smoke Objective").GetComponent<GreyboxObjective>();
                Assert.NotNull(createdObjective);
                Assert.AreEqual("smoke-objective", createdObjective.ObjectiveId);
                Assert.AreEqual("Smoke Objective", createdObjective.DisplayName);
                Assert.AreEqual("objective", createdObjective.ObjectiveType);
                Assert.AreEqual(1, createdObjective.RequiredCount);
                Assert.AreEqual(7, PendingMcpRoundTripEditCount(), "MCP objective createGameObject should queue a defaulted objective insert.");

                JObject hazardDefault = (JObject)InvokeMcpTool("unity.createGameObject", new JObject
                {
                    ["name"] = "Smoke Hazard",
                    ["parentId"] = GlobalObjectId.GetGlobalObjectIdSlow(hazardGroup).ToString()
                });
                Assert.AreEqual("$.hazards[hazardId=smoke-hazard]", hazardDefault.Value<string>("roundTripPath"));
                Assert.AreEqual("smoke-hazard", hazardDefault["roundTripValue"].Value<string>("hazardId"));
                Assert.AreEqual(1f, hazardDefault["roundTripValue"].Value<float>("damage"), 0.01f);
                Assert.AreEqual(1f, hazardDefault["roundTripValue"].Value<float>("tickSeconds"), 0.01f);
                Assert.AreEqual(1f, hazardDefault["roundTripValue"].Value<float>("radius"), 0.01f);
                var createdHazard = hazardGroup.transform.Find("Smoke Hazard").GetComponent<GreyboxHazard>();
                Assert.NotNull(createdHazard);
                Assert.AreEqual("smoke-hazard", createdHazard.HazardId);
                Assert.AreEqual("Smoke Hazard", createdHazard.DisplayName);
                Assert.AreEqual(1f, createdHazard.Damage, 0.01f);
                Assert.AreEqual(1f, createdHazard.TickSeconds, 0.01f);
                Assert.AreEqual(1f, createdHazard.Radius, 0.01f);
                Assert.AreEqual(8, PendingMcpRoundTripEditCount(), "MCP hazard createGameObject should queue a defaulted hazard insert.");

                JObject roomDefault = (JObject)InvokeMcpTool("unity.createGameObject", new JObject
                {
                    ["name"] = "Smoke Room",
                    ["parentId"] = GlobalObjectId.GetGlobalObjectIdSlow(roomGroup).ToString()
                });
                Assert.AreEqual("$.rooms[roomId=smoke-room]", roomDefault.Value<string>("roundTripPath"));
                Assert.AreEqual("smoke-room", roomDefault["roundTripValue"].Value<string>("roomId"));
                Assert.AreEqual("room", roomDefault["roundTripValue"].Value<string>("roomType"));
                Assert.AreEqual(1f, roomDefault["roundTripValue"]["size"].Value<float>("x"), 0.01f);
                var createdRoom = roomGroup.transform.Find("Smoke Room").GetComponent<GreyboxLevelRoom>();
                Assert.NotNull(createdRoom);
                Assert.AreEqual("smoke-room", createdRoom.RoomId);
                Assert.AreEqual("Smoke Room", createdRoom.DisplayName);
                Assert.AreEqual("room", createdRoom.RoomType);
                Assert.AreEqual(Vector3.one, createdRoom.Size);
                Assert.AreEqual(9, PendingMcpRoundTripEditCount(), "MCP room createGameObject should queue a defaulted level-room insert.");

                JObject encounterDefault = (JObject)InvokeMcpTool("unity.createGameObject", new JObject
                {
                    ["name"] = "Smoke Encounter",
                    ["parentId"] = GlobalObjectId.GetGlobalObjectIdSlow(encounterGroup).ToString()
                });
                Assert.AreEqual("$.encounters[encounterId=smoke-encounter]", encounterDefault.Value<string>("roundTripPath"));
                Assert.AreEqual("smoke-encounter", encounterDefault["roundTripValue"].Value<string>("encounterId"));
                Assert.AreEqual("encounter", encounterDefault["roundTripValue"].Value<string>("encounterType"));
                Assert.AreEqual(1f, encounterDefault["roundTripValue"].Value<float>("radius"), 0.01f);
                var createdEncounter = encounterGroup.transform.Find("Smoke Encounter").GetComponent<GreyboxEncounter>();
                Assert.NotNull(createdEncounter);
                Assert.AreEqual("smoke-encounter", createdEncounter.EncounterId);
                Assert.AreEqual("Smoke Encounter", createdEncounter.DisplayName);
                Assert.AreEqual("encounter", createdEncounter.EncounterType);
                Assert.AreEqual(1f, createdEncounter.Radius, 0.01f);
                Assert.AreEqual(10, PendingMcpRoundTripEditCount(), "MCP encounter createGameObject should queue a defaulted encounter insert.");

                JObject tileDefault = (JObject)InvokeMcpTool("unity.createGameObject", new JObject
                {
                    ["name"] = "Smoke Hazard Tile",
                    ["parentId"] = GlobalObjectId.GetGlobalObjectIdSlow(tileGroup).ToString(),
                    ["position"] = new JObject { ["x"] = 3f, ["y"] = 4f, ["z"] = 0f }
                });
                Assert.AreEqual("$.tilemap.tiles[tileId=smoke-hazard-tile]", tileDefault.Value<string>("roundTripPath"));
                Assert.AreEqual("smoke-hazard-tile", tileDefault["roundTripValue"].Value<string>("tileId"));
                Assert.AreEqual("hazard", tileDefault["roundTripValue"].Value<string>("type"));
                Assert.AreEqual(3, tileDefault["roundTripValue"].Value<int>("x"));
                Assert.AreEqual(4, tileDefault["roundTripValue"].Value<int>("y"));
                Assert.True(tileDefault["roundTripValue"].Value<bool>("isHazard"));
                Assert.AreSame(smokeTile, tileGroup.GetComponent<Tilemap>().GetTile(new Vector3Int(3, 4, 0)));
                Assert.True(tileMetadata.TryGetTileRecord("smoke-hazard-tile", out GreyboxLevelTileRecord createdTile));
                Assert.AreEqual("hazard", createdTile.TileType);
                Assert.AreEqual("$.tilemap.tiles[tileId=smoke-hazard-tile]", createdTile.SourceJsonPath);
                Assert.AreEqual(new Vector3Int(3, 4, 0), createdTile.Position);
                Assert.True(createdTile.IsHazard);
                Assert.AreEqual(11, PendingMcpRoundTripEditCount(), "MCP tile createGameObject should queue and realize a Tilemap cell insert.");

                JObject generatedTileDefault = (JObject)InvokeMcpTool("unity.createGameObject", new JObject
                {
                    ["name"] = "Smoke Wall Tile",
                    ["parentId"] = GlobalObjectId.GetGlobalObjectIdSlow(tileGroup).ToString(),
                    ["position"] = new JObject { ["x"] = 5f, ["y"] = 4f, ["z"] = 0f }
                });
                Assert.AreEqual("$.tilemap.tiles[tileId=smoke-wall-tile]", generatedTileDefault.Value<string>("roundTripPath"));
                Assert.AreEqual("wall", generatedTileDefault["roundTripValue"].Value<string>("type"));
                Assert.True(generatedTileDefault["roundTripValue"].Value<bool>("blocksMovement"));
                Assert.AreEqual(5, generatedTileDefault["roundTripValue"].Value<int>("x"));
                generatedSmokeTile = tileGroup.GetComponent<Tilemap>().GetTile(new Vector3Int(5, 4, 0)) as Tile;
                Assert.NotNull(generatedSmokeTile, "MCP tile creation should fabricate a Tile when no matching generated asset exists.");
                Assert.AreNotSame(smokeTile, generatedSmokeTile);
                Assert.AreEqual(Tile.ColliderType.Sprite, generatedSmokeTile.colliderType);
                generatedSmokeSprite = generatedSmokeTile.sprite;
                Assert.NotNull(generatedSmokeSprite);
                generatedSmokeTexture = generatedSmokeSprite.texture;
                Assert.NotNull(generatedSmokeTexture);
                Assert.AreEqual(2, tileMetadata.TileAssets.Length);
                Assert.AreSame(generatedSmokeTile, tileMetadata.TileAssets[1]);
                Assert.AreEqual(1, tileMetadata.TileTextures.Length);
                Assert.AreSame(generatedSmokeTexture, tileMetadata.TileTextures[0]);
                Assert.AreEqual(1, tileMetadata.TileSprites.Length);
                Assert.AreSame(generatedSmokeSprite, tileMetadata.TileSprites[0]);
                Assert.True(tileMetadata.TryGetTileRecord("smoke-wall-tile", out GreyboxLevelTileRecord generatedTileRecord));
                Assert.True(generatedTileRecord.BlocksMovement);
                Assert.AreEqual(12, PendingMcpRoundTripEditCount(), "MCP generated tile createGameObject should queue and realize a fallback Tilemap cell insert.");

                JObject setHealth = (JObject)InvokeMcpTool("unity.setField", new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(child.gameObject).ToString(),
                    ["componentType"] = typeof(GreyboxActorDefinition).FullName,
                    ["fieldName"] = nameof(GreyboxActorDefinition.Health),
                    ["value"] = 2
                });

                Assert.AreEqual(2, child.GetComponent<GreyboxActorDefinition>().Health);
                Assert.AreEqual("$.actors[actorId=smoke-boss].health", setHealth.Value<string>("roundTripPath"));
                Assert.AreEqual(2, setHealth["roundTripValue"].Value<int>());
                Assert.True(setHealth.Value<bool>("sceneDirty"), "MCP setField should report sceneDirty for Unity-authored field edits.");
                Assert.AreEqual(13, PendingMcpRoundTripEditCount(), "MCP setField should queue a field edit alongside the created node inserts.");

                JObject addLight = (JObject)InvokeMcpTool("unity.addComponent", new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(child.gameObject).ToString(),
                    ["componentType"] = typeof(Light).FullName
                });
                Assert.NotNull(child.GetComponent<Light>(), "MCP addComponent should attach the requested concrete Unity component.");
                Assert.AreEqual(typeof(Light).FullName, addLight.Value<string>("component"));
                Assert.AreEqual(typeof(Light).FullName, addLight["componentDetail"].Value<string>("type"));
                Assert.True(addLight.Value<bool>("sceneDirty"), "MCP addComponent should report sceneDirty for component mutations.");
                StringAssert.Contains(@"""writableProperties""", addLight["componentDetail"].ToString());

                JObject addMeshFilter = (JObject)InvokeMcpTool("unity.addComponent", new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(child.gameObject).ToString(),
                    ["componentType"] = typeof(MeshFilter).FullName
                });
                Assert.NotNull(child.GetComponent<MeshFilter>(), "MCP addComponent should attach MeshFilter before asset assignment.");
                Assert.True(addMeshFilter.Value<bool>("sceneDirty"), "MCP addComponent should report sceneDirty for renderable component mutations.");

                JObject assignMesh = (JObject)InvokeMcpTool("unity.assignAsset", new JObject
                {
                    ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(child.gameObject).ToString(),
                    ["componentType"] = typeof(MeshFilter).FullName,
                    ["fieldName"] = nameof(MeshFilter.sharedMesh),
                    ["assetPath"] = meshPath
                });
                Assert.AreSame(AssetDatabase.LoadAssetAtPath<Mesh>(meshPath), child.GetComponent<MeshFilter>().sharedMesh, "MCP assignAsset should update a MeshFilter asset reference.");
                Assert.AreEqual("$.actors[actorId=smoke-boss].meshAssetPath", assignMesh.Value<string>("roundTripPath"));
                Assert.AreEqual(meshPath, assignMesh["roundTripValue"].Value<string>());
                Assert.True(assignMesh.Value<bool>("sceneDirty"), "MCP assignAsset should report sceneDirty for asset-reference mutations.");
                Assert.True(child.gameObject.scene.isDirty, "MCP mutation smoke should leave the edited Unity scene dirty.");
                Assert.AreEqual(14, PendingMcpRoundTripEditCount(), "MCP assignAsset should queue an asset edit alongside the created node and field edits.");
            }
            finally
            {
                ClearMcpRoundTripEdits();
                if (smokeTile) UnityEngine.Object.DestroyImmediate(smokeTile);
                if (generatedSmokeTile) UnityEngine.Object.DestroyImmediate(generatedSmokeTile);
                if (generatedSmokeSprite) UnityEngine.Object.DestroyImmediate(generatedSmokeSprite);
                if (generatedSmokeTexture) UnityEngine.Object.DestroyImmediate(generatedSmokeTexture);
                UnityEngine.Object.DestroyImmediate(group);
                UnityEngine.Object.DestroyImmediate(spawnGroup);
                UnityEngine.Object.DestroyImmediate(objectiveGroup);
                UnityEngine.Object.DestroyImmediate(hazardGroup);
                UnityEngine.Object.DestroyImmediate(roomGroup);
                UnityEngine.Object.DestroyImmediate(encounterGroup);
                UnityEngine.Object.DestroyImmediate(tileGroup);
                UnityEngine.Object.DestroyImmediate(connectionGroup);
                UnityEngine.Object.DestroyImmediate(goalGroup);
                UnityEngine.Object.DestroyImmediate(checkpointGroup);
                UnityEngine.Object.DestroyImmediate(coinGroup);
                AssetDatabase.DeleteAsset(mcpAssetFolder);
            }
        }

        [Test]
        public void HudBuilderSupportsUiToolkitRenderer()
        {
            AssertUiToolkitHudBuilder();
        }

        [Test]
        public void PackagedSamplesImportIntoProjectAssetsUnderThirtySeconds()
        {
            var package = PackageInfo.FindForPackageName("com.greybox.studio");
            Assert.NotNull(package, "com.greybox.studio should be resolved by Unity Package Manager.");

            const string importRoot = "Assets/GreyboxSmoke/ImportedSamples";
            if (AssetDatabase.IsValidFolder(importRoot))
            {
                AssetDatabase.DeleteAsset(importRoot);
            }

            EnsureAddressablesSettings();
            var importTimer = System.Diagnostics.Stopwatch.StartNew();
            CopySampleArtifacts(package.resolvedPath, "2D Platformer", importRoot);
            CopySampleArtifacts(package.resolvedPath, "Top-Down Roguelike", importRoot);
            CopySampleArtifacts(package.resolvedPath, "Mobile Idle", importRoot);
            AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport | ImportAssetOptions.ForceUpdate);
            AddressablesTagger.FlushPending();
            importTimer.Stop();
            Assert.Less(importTimer.Elapsed.TotalSeconds, 30d, "Packaged sample artifacts should import in under 30 seconds.");

            AssertImportedSample(
                importRoot,
                "2D Platformer",
                "platformer",
                "Greybox 2D Platformer Vertical Slice",
                "2D Platformer Level Board",
                "Kai Designer");
            AssertPlayablePlatformerScene(importRoot + "/2D Platformer");
            AssertImportedSample(
                importRoot,
                "Top-Down Roguelike",
                "roguelike",
                "Greybox Top-Down Roguelike Floor",
                "Top-Down Roguelike Floor Board",
                "Mira Designer");
            AssertImportedSample(
                importRoot,
                "Mobile Idle",
                "mobile-idle",
                "Greybox Mobile Idle First Session",
                "Mobile Idle Economy Board",
                "Noor Designer");
        }

        private static void CopySampleArtifacts(string packageRoot, string sampleName, string importRoot)
        {
            var source = Path.Combine(packageRoot, "Samples~", sampleName);
            Assert.IsTrue(Directory.Exists(source), "Missing sample source: " + source);

            var destination = Path.Combine(importRoot, sampleName);
            Directory.CreateDirectory(destination);
            foreach (string file in Directory.GetFiles(source))
            {
                var extension = Path.GetExtension(file);
                if (extension != ".gameview" && extension != ".design" && extension != ".gbhud" && extension != ".levelboard")
                {
                    continue;
                }

                File.Copy(file, Path.Combine(destination, Path.GetFileName(file)), true);
            }
        }

        private static void AssertToolSchema(JArray tools, string name)
        {
            JObject tool = tools.OfType<JObject>().FirstOrDefault(item => item.Value<string>("name") == name);
            Assert.NotNull(tool, "Missing MCP tool schema: " + name);
            Assert.AreEqual("object", tool["inputSchema"]?.Value<string>("type"), "MCP tool schemas should be object-shaped.");
        }

        private static void AssertUiToolkitHudBuilder()
        {
            HudLayoutBuilder.BuildResult result = HudLayoutBuilder.BuildHudLayout(
                "<meta name=\\"greybox-hud-renderer\\" content=\\"uitoolkit\\"><section data-greybox-artifact=\\"hud\\" data-layout=\\"platformer-horizontal\\"><header data-slot=\\"top-left\\" data-agds-id=\\"hud-hearts\\"><img data-role=\\"heart-icon\\" src=\\"Resources/Hud/heart.png\\" alt=\\"Heart Icon\\"><span data-role=\\"value\\">3</span><meter data-role=\\"health\\" min=\\"0\\" max=\\"3\\" value=\\"3\\">HP</meter></header></section>",
                "Assets/GreyboxSmoke/ui-toolkit.gbhud");
            try
            {
                Assert.AreEqual(HudRendererKind.UiToolkit, result.Renderer, "HUD renderer request should opt into UI Toolkit.");
                Assert.NotNull(result.PanelSettings, "UI Toolkit HUD imports should carry generated PanelSettings.");
                Assert.NotNull(result.Root.GetComponent<UIDocument>(), "UI Toolkit HUD root should use UIDocument.");
                Assert.AreSame(result.PanelSettings, result.Root.GetComponent<UIDocument>().panelSettings);
                var hud = result.Root.GetComponent<GreyboxUiToolkitHud>();
                Assert.NotNull(hud, "UI Toolkit HUD root should include the runtime binder.");
                Assert.NotNull(hud.Elements.FirstOrDefault(item => item.BindingId == "value" && item.SlotId == "hud-hearts"), "UI Toolkit HUD elements should preserve binding ids.");
                Assert.NotNull(hud.Elements.FirstOrDefault(item => item.BindingId == "health" && item.IsProgress && item.ProgressMax == 3f), "UI Toolkit HUD should preserve meter/progress bindings.");
                Assert.NotNull(hud.Elements.FirstOrDefault(item => item.BindingId == "heart-icon" && item.IsImage && item.ImageSourcePath == "Resources/Hud/heart.png"), "UI Toolkit HUD should preserve image icon bindings.");
                hud.Elements.Add(new GreyboxUiToolkitHudElement { SlotId = "hud-actions", BindingId = "start-run", Role = "button", Action = "start-run", IsButton = true, JsonPath = "//*[@data-agds-id=\\"hud-actions\\"]/*[@data-role=\\"start-run\\"]" });
                GreyboxHudActionContext raised = null;
                System.Action<GreyboxHudActionContext> capture = context => raised = context;
                GreyboxHudActionDispatcher.ActionRaised += capture;
                try
                {
                    Assert.True(hud.InvokeAction("start-run"), "UI Toolkit HUD buttons should dispatch authored action ids.");
                }
                finally
                {
                    GreyboxHudActionDispatcher.ActionRaised -= capture;
                }
                Assert.NotNull(raised, "UI Toolkit HUD action dispatch should raise the shared Greybox action event.");
                Assert.AreEqual("start-run", raised.ActionId);
                Assert.NotNull(result.Root.GetComponentsInChildren<GreyboxMarker>().FirstOrDefault(item => item.JsonPath.Contains("data-agds-id")), "UI Toolkit HUD sidecar hierarchy should carry marker anchors.");
                AssertUiToolkitSlotPositioning();
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(result.Root);
                UnityEngine.Object.DestroyImmediate(result.PanelSettings);
            }
        }

        private static void AssertUiToolkitSlotPositioning()
        {
            MethodInfo buildSlot = typeof(GreyboxUiToolkitHud).GetMethod("BuildSlot", BindingFlags.NonPublic | BindingFlags.Static);
            Assert.NotNull(buildSlot, "UI Toolkit HUD slot factory should stay available to the smoke test.");

            var topCenter = (VisualElement)buildSlot.Invoke(null, new object[] { "hud-score", "top-center" });
            Assert.AreEqual(50f, topCenter.style.left.value.value, "Top-center slots should anchor at 50%.");
            Assert.AreEqual(-280f, topCenter.style.marginLeft.value.value, "Top-center slots should offset by half their fixed width.");

            var bottom = (VisualElement)buildSlot.Invoke(null, new object[] { "hud-action", "bottom" });
            Assert.AreEqual(50f, bottom.style.left.value.value, "Bottom slots should anchor at 50%.");
            Assert.AreEqual(-360f, bottom.style.marginLeft.value.value, "Bottom slots should offset by half their wider action width.");

            var center = (VisualElement)buildSlot.Invoke(null, new object[] { "hud-message", "center" });
            Assert.AreEqual(50f, center.style.left.value.value, "Center slots should anchor horizontally at 50%.");
            Assert.AreEqual(50f, center.style.top.value.value, "Center slots should anchor vertically at 50%.");
            Assert.AreEqual(-280f, center.style.marginLeft.value.value, "Center slots should offset by half their fixed width.");
            Assert.AreEqual(-48f, center.style.marginTop.value.value, "Center slots should offset by half their fixed height.");
        }

        private static void AssertImportedSample(
            string importRoot,
            string sampleName,
            string stem,
            string expectedGameTitle,
            string expectedLevelTitle,
            string expectedDesigner)
        {
            var sampleRoot = importRoot + "/" + sampleName;
            AssertGameViewport(sampleRoot + "/" + stem + ".gameview", expectedGameTitle, expectedDesigner);
            AssertPalette(sampleRoot + "/" + stem + ".design", expectedDesigner);
            AssertHudLayout(sampleRoot + "/" + stem + ".gbhud", expectedDesigner);
            AssertLevelBoard(sampleRoot + "/" + stem + ".levelboard", expectedLevelTitle, expectedDesigner);
        }

        private static void AssertPlayablePlatformerScene(string sampleRoot)
        {
            Greybox2DPlatformerSampleBuildResult result = Greybox2DPlatformerSampleBuilder.BuildScene(sampleRoot);
            AddressablesTagger.FlushPending();
            Assert.AreEqual(Greybox2DPlatformerSampleBuilder.GeneratedScenePath, result.ScenePath);
            AssertSampleSceneAddressable(result.ScenePath);
            Assert.GreaterOrEqual(result.ImportedArtifactCount, 4, "Playable sample scene should include imported Greybox gameview, art-bible, HUD, and level-board artifacts.");
            Assert.GreaterOrEqual(result.PlayableObjectCount, 32, "Playable sample scene should include controller, platforms, hazards, camera, coins, HUD, and exit trigger.");
            Assert.Greater(result.LevelBoardDrivenObjectCount, 0, "Playable sample should derive gameplay placement from the imported Greybox level board.");
            Assert.Greater(result.GameViewDrivenObjectCount, 0, "Playable sample should derive runtime entities from the imported Greybox game view.");
            Assert.Greater(result.GameViewEnemyCount, 0, "Playable sample should turn imported gameview enemy actors into runtime enemies.");
            Assert.Greater(result.GameViewHazardCount, 0, "Playable sample should turn imported gameview hazards into runtime hazards.");
            Assert.AreEqual(Greybox2DPlatformerSampleBuilder.SampleCoinCount, result.GameViewCoinCount, "Playable sample should place collectible coins from the imported coin-line objective.");
            Assert.IsTrue(result.GameViewPlayerConfigured, "Playable sample should bind the generated runner to imported player actor metadata.");
            Assert.AreEqual(7.2f, result.PlayerMoveSpeed, 0.01f, "Playable sample should carry imported player speed into the generated controller.");
            Assert.AreEqual(12.5f, result.PlayerJumpImpulse, 0.01f, "Playable sample should carry imported player jump impulse into the generated controller.");
            Assert.AreEqual(3, result.PlayerMaxHearts, "Playable sample should carry imported player health into the generated HUD hearts.");
            Assert.AreEqual(1, result.PlayerAttackDamage, "Playable sample should carry imported player attack damage into combat.");
            Assert.AreEqual(1.6f, result.PlayerAttackRange, 0.01f, "Playable sample should carry imported player attack range into combat.");
            Assert.AreEqual(0.45f, result.PlayerAttackCooldownSeconds, 0.01f, "Playable sample should carry imported player attack cooldown into combat.");
            Assert.IsTrue(result.GameViewCheckpointConfigured, "Playable sample should bind the generated checkpoint to imported checkpoint actor/spawn metadata.");
            Assert.IsTrue(result.GameViewGoalConfigured, "Playable sample should bind the generated exit trigger to the imported exit objective.");
            Assert.IsTrue(result.GameViewCameraConfigured, "Playable sample should derive camera framing from the imported gameview camera.");
            Assert.AreEqual("side-scroll", result.CameraMode, "Playable sample should carry the imported gameview camera mode into the generated Unity camera follow.");
            Assert.AreEqual(7.5f, result.CameraOrthographicSize, 0.01f, "Playable sample should carry the imported gameview orthographic size into the generated Unity camera.");
            Assert.Greater(result.LevelBoardTileCount, 0, "Playable sample should consume imported level-board tile metadata.");
            Assert.Greater(result.LevelBoardRouteLength, 1, "Playable sample should consume imported level-board room connections.");
            Assert.GreaterOrEqual(result.ArtBiblePaletteColorCount, 3, "Playable sample should consume imported art-bible palette colors.");
            Assert.Greater(result.ArtBibleDrivenMaterialCount, 0, "Playable sample should assign imported art-bible materials to generated gameplay objects.");
            Assert.IsTrue(result.CameraFollowEnabled, "Playable sample should wire camera follow to the generated player.");
            Assert.Greater(result.BuildDurationSeconds, 0d, "Playable sample should report build timing evidence.");
            Assert.Less(result.BuildDurationSeconds, 30d, "Playable sample scene should build in under 30 seconds.");
            GreyboxPlatformerSamplePlayer samplePlayer = UnityEngine.Object.FindObjectOfType<GreyboxPlatformerSamplePlayer>();
            Assert.NotNull(samplePlayer, "Playable sample should include a controllable runner.");
            Assert.AreEqual("player_runner", samplePlayer.PlayerId);
            Assert.AreEqual("Player Runner", samplePlayer.DisplayName);
            Assert.AreEqual("controller", samplePlayer.Role);
            Assert.AreEqual("runners", samplePlayer.Faction);
            Assert.AreEqual("player-controlled", samplePlayer.Behavior);
            CollectionAssert.AreEqual(new[] { "double-jump" }, samplePlayer.AbilityIds, "Playable player abilities should be driven by authored gameview actor metadata.");
            Assert.AreEqual("runner-pickups", samplePlayer.LootTableId);
            Assert.IsTrue(samplePlayer.HasAbility("double-jump"), "Playable player should expose authored double-jump ability.");
            Assert.AreEqual("gameview.actor", samplePlayer.SourceArtifactKind);
            Assert.AreEqual("player_runner", samplePlayer.SourceArtifactId);
            Assert.AreEqual("Player Runner", samplePlayer.SourceArtifactDisplayName);
            Assert.AreEqual(0.8f, samplePlayer.transform.localScale.x, 0.01f, "Playable player width should be driven by authored gameview actor radius.");
            Assert.AreEqual(1.25f, samplePlayer.transform.localScale.y, 0.01f, "Playable player height should be driven by authored gameview actor radius.");
            Assert.AreEqual(12.5f, samplePlayer.JumpImpulse, 0.01f, "Playable player jump should be driven by authored gameview actor jump impulse.");
            Assert.AreEqual(1, samplePlayer.AttackDamage);
            Assert.AreEqual(1.6f, samplePlayer.AttackRange, 0.01f, "Playable player attack range should be driven by authored gameview actor attack range.");
            Assert.AreEqual(0.45f, samplePlayer.AttackCooldownSeconds, 0.01f, "Playable player attack cooldown should be driven by authored gameview actor attack cooldown.");
            GreyboxPlatformerSampleHud sampleHud = UnityEngine.Object.FindObjectOfType<GreyboxPlatformerSampleHud>();
            Assert.NotNull(sampleHud, "Playable sample should wire the imported HUD to gameplay state.");
            Assert.AreEqual("REACH EXIT GATE", sampleHud.ObjectiveReadyText);
            Assert.AreEqual("EXIT GATE REACHED", sampleHud.ObjectiveCompletedText);
            Assert.AreEqual("CHECKPOINT FLAG READY", sampleHud.CheckpointReadyText);
            Assert.AreEqual("CHECKPOINT FLAG SET", sampleHud.CheckpointActivatedText);
            Assert.AreEqual(result.GameViewCoinCount, sampleHud.TotalCoins, "HUD coin target should be driven by the imported coin-line objective count.");
            GreyboxPlatformerSampleHazard[] sampleHazards = UnityEngine.Object.FindObjectsOfType<GreyboxPlatformerSampleHazard>().OrderBy(hazard => hazard.transform.position.x).ToArray();
            GreyboxPlatformerSampleHazard sampleHazard = sampleHazards.FirstOrDefault();
            Assert.NotNull(sampleHazard, "Playable sample should include imported hazards.");
            Assert.AreEqual("pit_gap_a", sampleHazard.HazardId);
            Assert.AreEqual("First Readable Pit", sampleHazard.DisplayName);
            Assert.AreEqual("pit", sampleHazard.HazardType);
            Assert.AreEqual("gameview.hazard", sampleHazard.SourceArtifactKind);
            Assert.AreEqual("pit_gap_a", sampleHazard.SourceArtifactId);
            Assert.AreEqual("First Readable Pit", sampleHazard.SourceArtifactDisplayName);
            Assert.AreEqual(2.88f, sampleHazard.transform.localScale.x, 0.02f, "Playable hazard width should be driven by authored gameview hazard radius.");
            Assert.AreEqual(0.45f, sampleHazard.transform.localScale.y, 0.02f, "Playable hazard height should be driven by authored gameview hazard radius.");
            Assert.AreEqual(1f, sampleHazard.Damage, 0.01f);
            Assert.AreEqual(0.65f, sampleHazard.TickSeconds, 0.01f, "Playable hazard tick cadence should be driven by authored gameview hazard timing.");
            Assert.AreEqual(3.25f, sampleHazard.Knockback, 0.01f, "Playable hazard knockback should be driven by authored gameview hazard knockback.");
            Assert.AreEqual("stagger", sampleHazard.Effect, "Playable hazard effect should be driven by authored gameview hazard metadata.");
            CollectionAssert.AreEqual(new[] { "Player" }, sampleHazard.AffectedTags, "Playable hazard affected tags should be driven by authored gameview hazard metadata.");
            Assert.IsFalse(sampleHazard.IsLethal);
            Assert.AreEqual("bleed", sampleHazards.Last().Effect, "Playable spike hazard should preserve authored status effect.");
            CollectionAssert.AreEqual(new[] { "controller" }, sampleHazards.Last().AffectedTags, "Playable spike hazard should preserve authored player targeting.");
            Assert.IsTrue(sampleHazards.Last().IsLethal, "Playable spike hazard should preserve authored lethal flag.");
            GreyboxPlatformerSampleCheckpoint sampleCheckpoint = UnityEngine.Object.FindObjectOfType<GreyboxPlatformerSampleCheckpoint>();
            Assert.NotNull(sampleCheckpoint, "Playable sample should include a checkpoint trigger.");
            Assert.AreEqual("checkpoint_flag", sampleCheckpoint.CheckpointId);
            Assert.AreEqual("Checkpoint Flag", sampleCheckpoint.DisplayName);
            Assert.AreEqual("spawn_checkpoint", sampleCheckpoint.SpawnId);
            Assert.AreEqual("gameview.checkpoint", sampleCheckpoint.SourceArtifactKind);
            Assert.AreEqual("checkpoint_flag", sampleCheckpoint.SourceArtifactId);
            Assert.AreEqual("Checkpoint Flag", sampleCheckpoint.SourceArtifactDisplayName);
            Assert.AreEqual("mid-run", sampleCheckpoint.SpawnGroup);
            CollectionAssert.AreEqual(new[] { "player_runner" }, sampleCheckpoint.ActorIds);
            Assert.IsTrue(sampleCheckpoint.CanActivatePlayer(samplePlayer), "Playable checkpoint actorIds should admit the imported player actor.");
            Assert.AreEqual(2, sampleCheckpoint.MaxActivations);
            Assert.AreEqual(0.75f, sampleCheckpoint.CooldownSeconds, 0.01f, "Playable checkpoint cooldown should be driven by authored gameview spawn metadata.");
            Assert.IsFalse(sampleCheckpoint.SpawnOnStart, "Playable checkpoint should preserve authored spawn-on-start metadata.");
            Vector3 importedStartSpawn = samplePlayer.SpawnPoint;
            Assert.IsFalse(sampleCheckpoint.ApplySpawnOnStart(samplePlayer), "Playable checkpoint should honor authored spawnOnStart=false and leave the start spawn alone.");
            Assert.IsFalse(sampleCheckpoint.SpawnOnStartApplied, "Playable checkpoint should not mark spawn-on-start applied when authored off.");
            Assert.AreEqual(importedStartSpawn, samplePlayer.SpawnPoint, "Authored spawnOnStart=false should preserve the imported start spawn.");
            Assert.AreEqual(0.8f, sampleCheckpoint.transform.localScale.x, 0.02f, "Playable checkpoint width should be driven by authored gameview checkpoint radius.");
            Assert.AreEqual(1.8f, sampleCheckpoint.transform.localScale.y, 0.02f, "Playable checkpoint height should be driven by authored gameview checkpoint radius.");
            GreyboxPlatformerSampleEnemy[] sampleEnemies = UnityEngine.Object.FindObjectsOfType<GreyboxPlatformerSampleEnemy>().OrderBy(enemy => enemy.transform.position.x).ToArray();
            GreyboxPlatformerSampleEnemy sampleEnemy = sampleEnemies.FirstOrDefault();
            Assert.NotNull(sampleEnemy, "Playable sample should include imported enemy patrols.");
            Assert.AreEqual("slime_patrol_a", sampleEnemy.EnemyId);
            Assert.AreEqual("Slime Patrol A", sampleEnemy.DisplayName);
            Assert.AreEqual("enemy", sampleEnemy.Role);
            Assert.AreEqual("slimes", sampleEnemy.Faction);
            Assert.AreEqual("patrol-aggro", sampleEnemy.Behavior, "Playable enemy behavior should be driven by authored gameview actor metadata.");
            CollectionAssert.AreEqual(new[] { "bump" }, sampleEnemy.AbilityIds, "Playable enemy abilities should be driven by authored gameview actor metadata.");
            CollectionAssert.AreEqual(new[] { "teach_move", "coin_arc" }, sampleEnemy.PatrolPointIds, "Playable enemy patrol route ids should be driven by authored gameview actor metadata.");
            Assert.GreaterOrEqual(sampleEnemy.PatrolWaypoints.Length, 2, "Playable enemy patrol waypoints should be resolved from authored route ids and the imported level board.");
            Vector3 authoredPatrolStart = sampleEnemy.transform.position;
            Vector3 authoredPatrolStep = sampleEnemy.Simulate(0.25f);
            Assert.AreEqual("teach_move", sampleEnemy.ActivePatrolPointId, "Playable enemy should expose the active authored patrol route id.");
            Assert.AreEqual(sampleEnemy.PatrolWaypoints[0], sampleEnemy.CurrentPatrolTarget, "Playable enemy should expose the current authored patrol target.");
            Assert.Less(authoredPatrolStep.x, authoredPatrolStart.x, "Playable enemy should move toward the first authored route waypoint instead of an unbound fallback patrol.");
            Assert.AreEqual("starter-slime-drops", sampleEnemy.LootTableId);
            Assert.IsTrue(sampleEnemy.CanPatrol(), "Patrol-aggro authored behavior should allow sample enemy patrol movement.");
            Assert.IsTrue(sampleEnemy.CanAggro(), "Patrol-aggro authored behavior should allow sample enemy contact damage.");
            Assert.IsTrue(sampleEnemy.CanTargetPlayer(samplePlayer), "Authored enemy faction should target the imported runner faction.");
            Assert.IsTrue(sampleEnemy.HasAbility("bump"));
            Assert.AreEqual("gameview.actor", sampleEnemy.SourceArtifactKind);
            Assert.AreEqual("slime_patrol_a", sampleEnemy.SourceArtifactId);
            Assert.AreEqual("Slime Patrol A", sampleEnemy.SourceArtifactDisplayName);
            Assert.AreEqual(2, sampleEnemy.Health);
            Assert.AreEqual(1, sampleEnemy.Damage);
            Assert.AreEqual(2.4f, sampleEnemy.AbilityKnockback, 0.01f, "Playable enemy ability knockback should be derived from authored damage/range.");
            Assert.AreEqual(1.8f, sampleEnemy.PatrolSpeed, 0.01f);
            Assert.AreEqual(1.6f, sampleEnemy.PatrolRadius, 0.01f, "Sample enemy patrol radius should stay authored independently from attack range.");
            Assert.AreEqual(1.4f, sampleEnemy.AttackRange, 0.01f);
            Assert.AreEqual(5.5f, sampleEnemy.AggroRadius, 0.01f, "Sample enemy aggro radius should stay authored from the imported detection radius.");
            Assert.AreEqual(0.81f, sampleEnemy.transform.localScale.x, 0.02f, "Playable enemy width should be driven by authored gameview actor radius.");
            Assert.AreEqual(0.54f, sampleEnemy.transform.localScale.y, 0.02f, "Playable enemy height should be driven by authored gameview actor radius.");
            Assert.AreEqual(0.75f, sampleEnemy.AttackCooldownSeconds, 0.01f);
            GreyboxPlatformerSampleEnemy guardEnemy = sampleEnemies.LastOrDefault();
            Assert.NotNull(guardEnemy, "Playable sample should include the authored guard enemy.");
            Assert.AreEqual("guard-aggro", guardEnemy.Behavior);
            Assert.IsFalse(guardEnemy.CanPatrol(), "Guard-aggro authored behavior should keep the sample enemy stationary.");
            Assert.IsTrue(guardEnemy.CanAggro(), "Guard-aggro authored behavior should still allow sample enemy contact damage.");
            GreyboxPlatformerSampleCameraFollow sampleCameraFollow = UnityEngine.Object.FindObjectOfType<GreyboxPlatformerSampleCameraFollow>();
            Assert.NotNull(sampleCameraFollow, "Playable sample should include a player-following camera.");
            Assert.AreEqual("gameview.camera", sampleCameraFollow.SourceArtifactKind);
            Assert.AreEqual("sample-camera", sampleCameraFollow.SourceArtifactId);
            Assert.AreEqual("Imported Game View Camera", sampleCameraFollow.SourceArtifactDisplayName);
            Assert.AreEqual("side-scroll", sampleCameraFollow.CameraMode);
            Assert.AreEqual(new Vector3(0f, 3f, -18f), sampleCameraFollow.Offset, "Playable sample should apply the side-scroll camera offset from the authored camera mode.");
            Assert.IsTrue(sampleCameraFollow.LockY, "Playable sample should lock camera Y for the authored side-scroll mode.");
            Assert.IsTrue(GreyboxPlatformerSampleCameraFollow.ShouldLockY(sampleCameraFollow.CameraMode), "Camera follow should derive Y locking from the authored camera mode.");
            GreyboxPlatformerSampleCollectible[] sampleCoins = UnityEngine.Object.FindObjectsOfType<GreyboxPlatformerSampleCollectible>().OrderBy(coin => coin.CoinId).ToArray();
            Assert.AreEqual(Greybox2DPlatformerSampleBuilder.SampleCoinCount, sampleCoins.Length, "Playable sample should place every collectible coin referenced by the HUD.");
            Assert.AreEqual("coin_line-01", sampleCoins.First().CoinId);
            Assert.AreEqual("Readable Coin Line 01", sampleCoins.First().DisplayName);
            Assert.AreEqual("gameview.objective", sampleCoins.First().SourceArtifactKind);
            Assert.AreEqual("coin_line", sampleCoins.First().SourceArtifactId);
            Assert.AreEqual("Readable Coin Line", sampleCoins.First().SourceArtifactDisplayName);
            Assert.AreEqual("coin_line", sampleCoins.First().SourceObjectiveId);
            Assert.AreEqual("Readable Coin Line", sampleCoins.First().SourceObjectiveDisplayName);
            Assert.AreEqual("collectible", sampleCoins.First().SourceObjectiveType);
            GreyboxPlatformerSampleGoal sampleGoal = UnityEngine.Object.FindObjectOfType<GreyboxPlatformerSampleGoal>();
            Assert.NotNull(sampleGoal, "Playable sample should include an exit trigger.");
            Assert.AreEqual("exit_gate", sampleGoal.GoalId);
            Assert.AreEqual("Exit Gate", sampleGoal.DisplayName);
            Assert.AreEqual("exit", sampleGoal.ObjectiveType);
            Assert.AreEqual("gameview.objective", sampleGoal.SourceArtifactKind);
            Assert.AreEqual("exit_gate", sampleGoal.SourceArtifactId);
            Assert.AreEqual("Exit Gate", sampleGoal.SourceArtifactDisplayName);
            CollectionAssert.AreEqual(new[] { "coin_line" }, sampleGoal.TargetIds);
            Assert.AreEqual("unlock-exit", sampleGoal.Reward);
            Assert.AreEqual(90f, sampleGoal.TimeLimitSeconds, 0.01f, "Playable goal should preserve authored gameview objective time limit.");
            Assert.IsTrue(sampleGoal.IsPrimary, "Playable goal should preserve authored primary objective flag.");
            Assert.AreEqual(0.8f, sampleGoal.transform.localScale.x, 0.02f, "Playable goal width should be driven by authored gameview objective radius.");
            Assert.AreEqual(2.6f, sampleGoal.transform.localScale.y, 0.02f, "Playable goal height should be driven by authored gameview objective radius.");
            Assert.AreEqual(sampleHud, sampleGoal.Hud);
            Assert.AreEqual(sampleCoins.Length, sampleGoal.RequiredCoins, "Playable exit should require the authored coin-line target before completion.");
            Assert.IsTrue(sampleGoal.IsLockedByCoins, "Playable exit should start locked until authored coins are collected.");
            Assert.IsTrue(sampleGoal.IsLockedByTargetIds, "Playable exit should start locked until authored target objectives are collected.");
            Assert.AreEqual(1, sampleGoal.RemainingTargetIds, "Playable exit should track authored target objective progress.");
            GreyboxPlatformerSampleArtifactManifest manifest = UnityEngine.Object.FindObjectOfType<GreyboxPlatformerSampleArtifactManifest>();
            Assert.NotNull(manifest, "Playable sample should carry an artifact manifest on the generated scene root.");
            Assert.AreEqual("2D Platformer", manifest.SampleName);
            Assert.IsTrue(manifest.GameViewSourcePath.EndsWith("/platformer.gameview"), "Manifest should keep the imported gameview source path.");
            Assert.IsTrue(manifest.LevelBoardSourcePath.EndsWith("/platformer.levelboard"), "Manifest should keep the imported level-board source path.");
            Assert.IsTrue(manifest.HudSourcePath.EndsWith("/platformer.gbhud"), "Manifest should keep the imported HUD source path.");
            Assert.IsTrue(manifest.ArtBibleSourcePath.EndsWith("/platformer.design"), "Manifest should keep the imported art-bible source path.");
            Assert.IsNotEmpty(manifest.GameViewSourceHash, "Manifest should keep the imported gameview source hash.");
            Assert.IsNotEmpty(manifest.LevelBoardSourceHash, "Manifest should keep the imported level-board source hash.");
            Assert.IsNotEmpty(manifest.HudSourceHash, "Manifest should keep the imported HUD source hash.");
            Assert.IsNotEmpty(manifest.ArtBibleSourceHash, "Manifest should keep the imported art-bible source hash.");
            Assert.AreEqual("Greybox + Kai Designer", manifest.GeneratorCredit, "Playable sample manifest should preserve the imported generator credit.");
            Assert.AreEqual("Kai Designer", manifest.HumanDesignerCredit, "Playable sample manifest should preserve the human designer credit.");
            Assert.AreEqual("AI-assisted", manifest.AiDisclosure, "Playable sample manifest should preserve the AI-assisted disclosure.");
            Assert.IsTrue(manifest.ImportChainProvenanceReady, "Playable sample manifest should mark its import chain provenance ready only after paths, hashes, credits, and disclosure are present.");
            Assert.GreaterOrEqual(manifest.ImportedArtifactCount, 4);
            Assert.AreEqual(result.PlayableObjectCount, manifest.PlayableObjectCount, "Playable sample manifest should preserve the generated playable object count.");
            Assert.Greater(manifest.GameViewDrivenObjectCount, 0);
            Assert.Greater(manifest.LevelBoardDrivenObjectCount, 0);
            Assert.GreaterOrEqual(manifest.SourceTaggedRuntimeObjectCount, Greybox2DPlatformerSampleBuilder.SampleCoinCount + result.GameViewEnemyCount + result.GameViewHazardCount + 4, "Playable sample should count runtime objects tagged with source artifact metadata.");
            Assert.AreEqual(result.GameViewEnemyCount, manifest.GameViewEnemyCount);
            Assert.AreEqual(result.GameViewHazardCount, manifest.GameViewHazardCount);
            Assert.AreEqual(result.GameViewCoinCount, manifest.GameViewCoinCount);
            Assert.IsTrue(manifest.GameViewPlayerConfigured);
            Assert.IsTrue(manifest.GameViewCheckpointConfigured);
            Assert.IsTrue(manifest.GameViewGoalConfigured);
            Assert.IsTrue(manifest.GameViewCameraConfigured);
            Assert.AreEqual(result.CameraMode, manifest.CameraMode);
            Assert.AreEqual(result.CameraOrthographicSize, manifest.CameraOrthographicSize, 0.01f);
            Assert.AreEqual(Greybox2DPlatformerSampleBuilder.SampleCoinCount, manifest.SampleCoinCount, "Playable sample manifest should preserve authored sample coin count.");
            Assert.IsTrue(manifest.PlayerControllerConfigured, "Playable sample manifest should prove player controller readiness.");
            Assert.IsTrue(manifest.HudControllerConfigured, "Playable sample manifest should prove HUD controller readiness.");
            Assert.IsTrue(manifest.GoalControllerConfigured, "Playable sample manifest should prove goal controller readiness.");
            Assert.IsTrue(manifest.CheckpointControllerConfigured, "Playable sample manifest should prove checkpoint controller readiness.");
            Assert.IsTrue(manifest.CameraFollowConfigured, "Playable sample manifest should prove camera follow readiness.");
            Assert.AreEqual(result.BuildDurationSeconds, manifest.BuildDurationSeconds, 0.25f, "Playable sample manifest should preserve measured build timing.");
            Assert.AreEqual(30f, manifest.BuildBudgetSeconds, 0.01f, "Playable sample manifest should preserve the Asset Store build budget.");
            Assert.IsTrue(manifest.BuildCompletedUnderBudget, "Playable sample manifest should prove the sample built inside the under-30-second budget.");
            Assert.IsTrue(manifest.HudResetActionConfigured, "Playable sample manifest should prove the imported HUD reset action is wired.");
            Assert.AreEqual("reset-run", manifest.HudResetActionId);
            Assert.IsTrue(manifest.KeyboardResetConfigured, "Playable sample manifest should prove keyboard reset is wired.");
            Assert.AreEqual("R", manifest.KeyboardResetKey);
            Assert.IsTrue(manifest.ResetControllerConfigured, "Playable sample manifest should prove reset controller readiness.");
            Assert.AreEqual(Greybox2DPlatformerSampleBuilder.GeneratedScenePath, manifest.AddressablesScenePath, "Playable sample manifest should preserve the generated scene Addressables path.");
            CollectionAssert.Contains(manifest.AddressablesLabels, AddressablesTagger.GeneratedLabel);
            CollectionAssert.Contains(manifest.AddressablesLabels, AddressablesTagger.SampleSceneLabel);
            CollectionAssert.Contains(manifest.AddressablesLabels, AddressablesTagger.PlatformerSampleLabel);
            Assert.IsTrue(manifest.AddressablesTaggingConfigured, "Playable sample manifest should prove sample scene Addressables labels are queued.");
            Assert.IsTrue(manifest.PlayModeSmokeReady, "Playable sample manifest should expose one pass/fail readiness bit for Asset Store smoke review.");
            GreyboxPlatformerSampleRunReset sampleReset = UnityEngine.Object.FindObjectOfType<GreyboxPlatformerSampleRunReset>();
            Assert.NotNull(sampleReset, "Playable sample should include a one-click run reset controller.");
            Assert.AreEqual(samplePlayer, sampleReset.Player, "Run reset should target the imported player.");
            Assert.AreEqual(sampleHud, sampleReset.Hud, "Run reset should target the imported HUD.");
            Assert.AreEqual(sampleGoal, sampleReset.Goal, "Run reset should target the imported goal.");
            Assert.AreEqual(sampleCheckpoint, sampleReset.Checkpoint, "Run reset should target the imported checkpoint.");
            Assert.IsTrue(sampleReset.HasInitialPlayerSpawnPoint, "Run reset should capture the imported initial spawn.");
            Assert.IsTrue(sampleReset.ResetOnKeyPress, "Run reset should be keyboard-accessible for Asset Store reviewers.");
            Assert.AreEqual(KeyCode.R, sampleReset.LegacyResetKey, "Run reset should default to the familiar R key.");
            Assert.IsTrue(sampleReset.CanHandleHudAction("reset-run"), "Run reset should bind the imported HUD reset action.");
            Assert.IsTrue(GreyboxPlatformerSampleRunReset.ComposeResetPressed(true, false), "Run reset input should accept Input System reset presses.");
            Assert.IsTrue(GreyboxPlatformerSampleRunReset.ComposeResetPressed(false, true), "Run reset input should accept legacy reset presses.");
            Assert.IsFalse(GreyboxPlatformerSampleRunReset.ComposeResetPressed(false, false), "Run reset input should stay idle without a reset press.");
            Assert.NotNull(AssetDatabase.LoadAssetAtPath<SceneAsset>(result.ScenePath), "Playable platformer scene should be saved as a Unity scene asset.");
            Assert.IsTrue(EditorBuildSettings.scenes.Any(scene => scene.path == result.ScenePath && scene.enabled), "Playable platformer scene should be registered for PlayMode smoke loading.");
        }

        private static string ExportSmokeGameViewport(string sourcePath, string projectId, string json)
        {
            var root = PrefabBuilder.BuildFromGameViewport(JObject.Parse(json), sourcePath);
            try
            {
                return PrefabAssetExporter.ExportGameViewportPrefab(root, sourcePath, projectId);
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(root);
            }
        }

        private static void AddUserRigidbodyToPrefab(string canonicalPath)
        {
            var prefabContents = PrefabUtility.LoadPrefabContents(canonicalPath);
            try
            {
                prefabContents.AddComponent<Rigidbody>();
                PrefabUtility.SaveAsPrefabAsset(prefabContents, canonicalPath);
            }
            finally
            {
                PrefabUtility.UnloadPrefabContents(prefabContents);
            }
        }

        private static string GeneratedProjectFolder(string prefabPath)
        {
            int gameViewports = prefabPath.IndexOf("/GameViewports/", StringComparison.Ordinal);
            if (gameViewports >= 0) return prefabPath.Substring(0, gameViewports);
            int levelBoards = prefabPath.IndexOf("/LevelBoards/", StringComparison.Ordinal);
            return levelBoards >= 0 ? prefabPath.Substring(0, levelBoards) : prefabPath;
        }

        private static GreyboxEnginePackagePreflight ParseEnginePackagePreflight(string json)
        {
            Type clientType = Type.GetType("Greybox.Editor.Sync.GreyboxEnginePackagePreflightClient, Greybox.Editor");
            Assert.NotNull(clientType, "GreyboxEnginePackagePreflightClient should be available in EditMode smoke.");
            MethodInfo parse = clientType.GetMethod("Parse", BindingFlags.Static | BindingFlags.NonPublic);
            Assert.NotNull(parse, "Preflight Parse should remain covered by Unity smoke evidence.");
            try
            {
                return (GreyboxEnginePackagePreflight)parse.Invoke(null, new object[] { json });
            }
            catch (TargetInvocationException error) when (error.InnerException != null)
            {
                throw error.InnerException;
            }
        }

        private static bool ShouldRequestPackageRefresh(string artifactName, string content)
        {
            Type refresherType = Type.GetType("Greybox.Editor.Sync.GreyboxArtifactRefresher, Greybox.Editor");
            Assert.NotNull(refresherType, "GreyboxArtifactRefresher should be available in EditMode smoke.");
            MethodInfo shouldRefresh = refresherType.GetMethod("ShouldRequestUnityPackageRefresh", BindingFlags.Static | BindingFlags.NonPublic);
            Assert.NotNull(shouldRefresh, "Live sync package preflight detection should remain covered by Unity smoke evidence.");
            try
            {
                return (bool)shouldRefresh.Invoke(null, new object[] { artifactName, content });
            }
            catch (TargetInvocationException error) when (error.InnerException != null)
            {
                throw error.InnerException;
            }
        }

        private static int ExtractEnginePackageZip(string zipPath, string assetRoot)
        {
            MethodInfo extract = typeof(GreyboxPackageDownloader).GetMethod("ExtractEnginePackageZip", BindingFlags.Static | BindingFlags.NonPublic);
            Assert.NotNull(extract, "Checksum-verified package extraction should remain covered by Unity smoke evidence.");
            try
            {
                return (int)extract.Invoke(null, new object[] { zipPath, assetRoot });
            }
            catch (TargetInvocationException error) when (error.InnerException != null)
            {
                throw error.InnerException;
            }
        }

        private static void WriteEnginePackageEntry(ZipArchive archive, string path, string content)
        {
            var entry = archive.CreateEntry(path);
            using (var writer = new StreamWriter(entry.Open()))
            {
                writer.Write(content);
            }
        }

        private static string EnginePackageManifest(string runtimePath, string content)
        {
            return "{\\"contentRevisionSha256\\":\\"" + ContentRevisionForFile(runtimePath, content) + "\\",\\"files\\":[{\\"path\\":\\"" + runtimePath + "\\",\\"language\\":\\"csharp\\",\\"purpose\\":\\"smoke\\",\\"sha256\\":\\"" + Sha256Hex(content) + "\\",\\"bytes\\":" + Encoding.UTF8.GetByteCount(content) + "}]}";
        }

        private static string ContentRevisionForFile(string runtimePath, string content)
        {
            string revisionInput = runtimePath
                + "\\0csharp\\0smoke\\0"
                + Sha256Hex(content)
                + "\\0"
                + Encoding.UTF8.GetByteCount(content)
                + "\\n";
            return Sha256Hex(revisionInput);
        }

        private static string Sha256Hex(string content)
        {
            using (SHA256 sha = SHA256.Create())
            {
                byte[] hash = sha.ComputeHash(Encoding.UTF8.GetBytes(content));
                var builder = new StringBuilder(hash.Length * 2);
                foreach (byte b in hash) builder.Append(b.ToString("x2"));
                return builder.ToString();
            }
        }

        private static void InstallProSmokeLicense()
        {
            GreyboxSettings.SetLicenseKey("gbx_pro_conflict_window_smoke");
            GreyboxSettings.SetLicenseCapabilities(
                GreyboxLicenseCapabilities.ForTier(GreyboxLicenseTier.Pro),
                "2027-05-22T00:00:00.000Z");
        }

        private static GreyboxRoundTripConflict SmokeConflict(string path)
        {
            return GreyboxConflictInbox.Conflicts.First(item => item.Path == path);
        }

        private static string InvokeManualDraft(GreyboxConflictWindow window, GreyboxRoundTripConflict conflict)
        {
            MethodInfo manualDraft = typeof(GreyboxConflictWindow).GetMethod("ManualDraft", BindingFlags.Instance | BindingFlags.NonPublic);
            Assert.NotNull(manualDraft, "Conflict window should expose a manual draft action for smoke verification.");
            return (string)manualDraft.Invoke(window, new object[] { conflict });
        }

        private static string InvokeConflictJson()
        {
            MethodInfo conflictJson = typeof(GreyboxConflictWindow).GetMethod("ConflictJson", BindingFlags.Static | BindingFlags.NonPublic);
            Assert.NotNull(conflictJson, "Conflict window should expose conflict JSON for reviewer handoff.");
            return (string)conflictJson.Invoke(null, null);
        }

        private static bool InvokeAcceptWebMerge(
            GreyboxConfig config,
            GreyboxRoundTripConflict conflict,
            Func<GreyboxConfig, string, string, Task<bool>> post,
            Func<GreyboxConfig, string, Task<bool>> refresh)
        {
            return InvokeResolverTask<bool>("AcceptWebMergeAsync", config, conflict, post, refresh);
        }

        private static bool InvokeAcceptUnityMerge(
            GreyboxConfig config,
            GreyboxRoundTripConflict conflict,
            Func<GreyboxConfig, string, string, Task<bool>> post,
            Func<GreyboxConfig, string, Task<bool>> refresh)
        {
            return InvokeResolverTask<bool>("AcceptUnityMergeAsync", config, conflict, post, refresh);
        }

        private static bool InvokeAcceptManualMerge(
            GreyboxConfig config,
            GreyboxRoundTripConflict conflict,
            string manualContent,
            Func<GreyboxConfig, string, string, Task<bool>> post,
            Func<GreyboxConfig, string, Task<bool>> refresh)
        {
            return InvokeResolverTask<bool>("AcceptManualMergeAsync", config, conflict, manualContent, post, refresh);
        }

        private static int InvokeAcceptBatchMerge(
            GreyboxConfig config,
            GreyboxRoundTripConflict[] conflicts,
            GreyboxConflictResolution resolution,
            Func<GreyboxConfig, string, string, Task<bool>> post,
            Func<GreyboxConfig, string, Task<bool>> refresh)
        {
            return InvokeResolverTask<int>("AcceptBatchMergeAsync", config, conflicts, resolution, post, refresh);
        }

        private static T InvokeResolverTask<T>(string methodName, params object[] args)
        {
            MethodInfo method = typeof(GreyboxConflictResolver).GetMethod(methodName, BindingFlags.Static | BindingFlags.NonPublic);
            Assert.NotNull(method, "Conflict resolver should expose awaitable action hooks for Unity smoke evidence: " + methodName);
            var task = (Task<T>)method.Invoke(null, args);
            return task.GetAwaiter().GetResult();
        }

        private static string InvokeMcpJsonRpc(string json)
        {
            MethodInfo handle = typeof(GreyboxMcpServer).GetMethod("HandleMcpJsonRpc", BindingFlags.Static | BindingFlags.NonPublic);
            Assert.NotNull(handle, "MCP JSON-RPC handler should remain covered by Unity smoke evidence.");
            try
            {
                return (string)handle.Invoke(null, new object[] { json });
            }
            catch (TargetInvocationException error) when (error.InnerException != null)
            {
                throw error.InnerException;
            }
        }

        private static JToken InvokeMcpTool(string name, JObject args)
        {
            MethodInfo invoke = typeof(GreyboxMcpServer).GetMethod("InvokeUnityTool", BindingFlags.Static | BindingFlags.NonPublic);
            Assert.NotNull(invoke, "MCP tool dispatcher should remain covered by Unity smoke evidence.");
            try
            {
                return (JToken)invoke.Invoke(null, new object[] { name, args });
            }
            catch (TargetInvocationException error) when (error.InnerException != null)
            {
                throw error.InnerException;
            }
        }

        private static void ClearMcpRoundTripEdits()
        {
            typeof(GreyboxSceneChangeWatcher)
                .GetMethod("ClearPendingForTests", BindingFlags.Static | BindingFlags.NonPublic)
                .Invoke(null, null);
        }

        private static int PendingMcpRoundTripEditCount()
        {
            return (int)typeof(GreyboxSceneChangeWatcher)
                .GetProperty("PendingFieldEditCountForTests", BindingFlags.Static | BindingFlags.NonPublic)
                .GetValue(null);
        }

        private static void AssertGameViewport(string path, string expectedTitle, string expectedDesigner)
        {
            var root = AssetDatabase.LoadAssetAtPath<GameObject>(path);
            Assert.NotNull(root, "Game viewport main object should import: " + path);
            Assert.AreEqual(expectedTitle, root.name);
            Assert.NotNull(root.transform.Find("Actors"), "Actors group should import.");
            Assert.NotNull(root.transform.Find("Spawn Points"), "Spawn Points group should import.");
            Assert.NotNull(root.transform.Find("Objectives"), "Objectives group should import.");
            Assert.NotNull(root.transform.Find("Hazards"), "Hazards group should import.");
            AssertRoundTripMarkers(root);
            var artifact = AssertArtifact(path, GreyboxArtifactKind.GameViewport, expectedTitle, expectedDesigner);
            AssertImportedArtifact(root, artifact, expectedDesigner);
            AssertImportReceipt(root.GetComponent<GreyboxImportedArtifact>().ImportReceiptPath, artifact, GreyboxArtifactKind.GameViewport, PrefabAssetExporter.GeneratedPrefabPath(GreyboxArtifactKind.GameViewport, path, ""));
            AssertAddressable(path, GreyboxArtifactKind.GameViewport);
        }

        private static void AssertLevelBoard(string path, string expectedTitle, string expectedDesigner)
        {
            var root = AssetDatabase.LoadAssetAtPath<GameObject>(path);
            Assert.NotNull(root, "Level board main object should import: " + path);
            Assert.AreEqual(expectedTitle, root.name);
            Assert.NotNull(root.transform.Find("Rooms"), "Rooms group should import.");
            Assert.NotNull(root.transform.Find("Encounters"), "Encounters group should import.");
            AssertRoundTripMarkers(root);
            var board = root.GetComponent<GreyboxLevelBoard>();
            Assert.NotNull(board, "Level board root should expose runtime board queries.");
            GreyboxLevelRoom[] rooms = board.Rooms();
            Assert.AreEqual(board.RoomCount, rooms.Length, "Runtime level board room queries should match imported metadata.");
            if (rooms.Length > 0)
            {
                Assert.True(board.TryGetRoom(rooms[0].RoomId, out GreyboxLevelRoom lookedUpRoom), "Runtime level board should look up imported rooms by id.");
                Assert.AreSame(rooms[0], lookedUpRoom);
                Assert.True(board.TryGetRoomWorldPosition(rooms[0].RoomId, out Vector3 roomWorldPosition), "Runtime level board should expose imported room world positions.");
                Assert.AreEqual(rooms[0].transform.position, roomWorldPosition);
            }
            var tilemap = root.GetComponentInChildren<GreyboxLevelTilemap>();
            if (tilemap != null)
            {
                Assert.AreEqual(tilemap.TileRecords.Length, tilemap.TileCount, "Level-board tilemap metadata should expose every generated cell.");
                Assert.Greater(tilemap.WalkableCells().Length, 0, "Level-board tilemaps should be runtime-queryable for walkable cells.");
                if (tilemap.TileRecords.Any(item => item != null && item.IsExit))
                {
                    Assert.Greater(tilemap.ExitCells().Length, 0, "Level-board tilemaps should expose exit cells to gameplay scripts.");
                }
            }
            var artifact = AssertArtifact(path, GreyboxArtifactKind.LevelBoard, expectedTitle, expectedDesigner);
            AssertImportedArtifact(root, artifact, expectedDesigner);
            AssertImportReceipt(root.GetComponent<GreyboxImportedArtifact>().ImportReceiptPath, artifact, GreyboxArtifactKind.LevelBoard, PrefabAssetExporter.GeneratedPrefabPath(GreyboxArtifactKind.LevelBoard, path, ""));
            AssertAddressable(path, GreyboxArtifactKind.LevelBoard);
        }

        private static void AssertHudLayout(string path, string expectedDesigner)
        {
            var root = AssetDatabase.LoadAssetAtPath<GameObject>(path);
            Assert.NotNull(root, "HUD layout main object should import: " + path);
            Assert.NotNull(root.GetComponent<Canvas>(), "HUD root should be a uGUI Canvas.");
            Assert.NotNull(root.GetComponent<CanvasScaler>(), "HUD root should scale across target devices.");
            Assert.GreaterOrEqual(root.GetComponentsInChildren<Text>().Length, 2, "HUD should generate visible uGUI text elements.");
            Assert.NotNull(root.GetComponentsInChildren<GreyboxMarker>().FirstOrDefault(item => item.ArtifactKind == GreyboxArtifactKind.HudLayout && item.JsonPath.Contains("data-agds-id")), "HUD hierarchy should carry stable Greybox marker anchors.");
            Assert.NotNull(root.GetComponentsInChildren<GreyboxHudBinding>().FirstOrDefault(item => item.SlotId == "hud-hearts" && item.Role == "value"), "HUD hierarchy should carry runtime GreyboxHudBinding anchors.");
            var artifact = AssertArtifact(path, GreyboxArtifactKind.HudLayout, "data-greybox-artifact=\\"hud\\"", expectedDesigner);
            if (artifact.SourceJson.Contains("<progress") || artifact.SourceJson.Contains("<meter"))
            {
                Assert.NotNull(root.GetComponentsInChildren<Slider>().FirstOrDefault(item => item.GetComponent<GreyboxHudBinding>() is GreyboxHudBinding binding && binding.Role == "progress" && binding.IsProgress), "HUD hierarchy should import progress and meter controls as uGUI sliders with runtime progress bindings.");
            }
            if (artifact.SourceJson.Contains("<img"))
            {
                Assert.NotNull(root.GetComponentsInChildren<UnityEngine.UI.Image>().FirstOrDefault(item => item.GetComponent<GreyboxHudBinding>()?.IsImage == true), "HUD hierarchy should import image icons as uGUI image controls.");
            }
            if (artifact.SourceJson.Contains("<button"))
            {
                Assert.NotNull(root.GetComponentsInChildren<Button>().FirstOrDefault(item => item.GetComponent<GreyboxHudBinding>()?.IsButton == true && item.GetComponent<GreyboxHudButtonAction>() != null), "HUD hierarchy should import authored buttons as runtime-dispatchable uGUI actions.");
            }
            AssertImportedArtifact(root, artifact, expectedDesigner);
            AssertImportReceipt(root.GetComponent<GreyboxImportedArtifact>().ImportReceiptPath, artifact, GreyboxArtifactKind.HudLayout, PrefabAssetExporter.GeneratedPrefabPath(GreyboxArtifactKind.HudLayout, path, ""));
            AssertAddressable(path, GreyboxArtifactKind.HudLayout);
        }

        private static void AssertRoundTripMarkers(GameObject root)
        {
            var markers = root.GetComponentsInChildren<GreyboxMarker>();
            Assert.Greater(markers.Length, 1, "Generated hierarchy should carry GreyboxMarker metadata.");
            Assert.NotNull(markers.FirstOrDefault(item => item.JsonPath == "$"), "Root marker should map to document root.");
            var editable = markers.FirstOrDefault(item => !string.IsNullOrEmpty(item.PositionJsonPath));
            Assert.NotNull(editable, "At least one marker should expose a position path for round-trip Scene edits.");
            StringAssert.StartsWith("$.", editable.PositionJsonPath);
            Assert.IsNotEmpty(editable.SourceFileName);
        }

        private static void AssertPalette(string path, string expectedDesigner)
        {
            var palette = AssetDatabase.LoadAssetAtPath<GreyboxArtBiblePalette>(path);
            Assert.NotNull(palette, "Art bible palette should import: " + path);
            Assert.GreaterOrEqual(palette.Colors.Count, 3, "Palette should import sample hex colors.");
            var materials = AssetDatabase.LoadAllAssetsAtPath(path).OfType<Material>().ToArray();
            Assert.GreaterOrEqual(materials.Length, palette.Colors.Count, "Art bible should generate material sub-assets for imported colors.");
            Assert.IsTrue(materials.Any(material => material.name.StartsWith("Greybox ")), "Generated materials should carry Greybox names.");
            string standaloneMaterialPath = MaterialAssetExporter.GeneratedMaterialPath(path, "", 0);
            var standaloneMaterial = AssetDatabase.LoadAssetAtPath<Material>(standaloneMaterialPath);
            Assert.NotNull(standaloneMaterial, "Art bible should export stable standalone material assets: " + standaloneMaterialPath);
            Assert.IsTrue(standaloneMaterial.name.StartsWith("Greybox "), "Standalone material assets should carry Greybox names.");
            AssertAddressable(standaloneMaterialPath, GreyboxArtifactKind.ArtBible);
            Assert.AreEqual("Greybox + " + expectedDesigner, palette.GeneratorCredit);
            Assert.AreEqual(expectedDesigner, palette.HumanDesignerCredit);
            Assert.AreEqual("AI-assisted", palette.AiDisclosure);
            AssertArtifact(path, GreyboxArtifactKind.ArtBible, "AI-assisted", expectedDesigner);
            GreyboxArtifact artifact = AssetDatabase.LoadAllAssetsAtPath(path).OfType<GreyboxArtifact>().FirstOrDefault(item => item.Kind == GreyboxArtifactKind.ArtBible);
            AssertImportReceipt(GreyboxImportReceiptExporter.ExpectedReceiptPath(path, ""), artifact, GreyboxArtifactKind.ArtBible, standaloneMaterialPath);
            AssertAddressable(path, GreyboxArtifactKind.ArtBible);
        }

        private static GreyboxArtifact AssertArtifact(string path, GreyboxArtifactKind kind, string requiredSourceText, string expectedDesigner)
        {
            var artifact = AssetDatabase.LoadAllAssetsAtPath(path).OfType<GreyboxArtifact>().FirstOrDefault(item => item.Kind == kind);
            Assert.NotNull(artifact, "Missing GreyboxArtifact sub-asset for " + kind + " at " + path);
            Assert.AreEqual(kind, artifact.Kind);
            Assert.IsNotEmpty(artifact.SourcePath);
            Assert.IsNotEmpty(artifact.SourceHash);
            StringAssert.Contains(requiredSourceText, artifact.SourceJson);
            AssertArtifactProvenance(artifact, expectedDesigner);
            return artifact;
        }

        private static void AssertArtifactProvenance(GreyboxArtifact artifact, string expectedDesigner)
        {
            Assert.AreEqual("Greybox + " + expectedDesigner, artifact.GeneratorCredit, "Imported artifacts should preserve the Greybox + designer generator credit.");
            Assert.AreEqual(expectedDesigner, artifact.HumanDesignerCredit, "Imported artifacts should preserve the human designer credit.");
            Assert.AreEqual("AI-assisted", artifact.AiDisclosure, "Imported artifacts should preserve the AI-assisted disclosure.");
            StringAssert.Contains("AI-assisted", artifact.SourceJson, "Imported source should retain AI-assisted provenance text.");
        }

        private static void AssertImportedArtifact(GameObject root, GreyboxArtifact artifact, string expectedDesigner)
        {
            var imported = root.GetComponent<GreyboxImportedArtifact>();
            Assert.NotNull(imported, "Imported root should expose Greybox provenance metadata.");
            Assert.AreSame(artifact, imported.Artifact);
            Assert.AreEqual("Greybox + " + expectedDesigner, imported.GeneratorCredit);
            Assert.AreEqual(expectedDesigner, imported.HumanDesignerCredit);
            Assert.AreEqual("AI-assisted", imported.AiDisclosure);
            Assert.IsNotEmpty(imported.ImportReceiptId, "Imported root should expose the generated import receipt id.");
            Assert.IsNotEmpty(imported.ImportReceiptPath, "Imported root should expose the generated import receipt path.");
            StringAssert.StartsWith("Assets/Greybox/Generated/", imported.ImportReceiptPath);
        }

        private static void AssertImportReceipt(string receiptPath, GreyboxArtifact artifact, GreyboxArtifactKind kind, string generatedAssetPath)
        {
            Assert.IsNotEmpty(receiptPath, "Imported Greybox content should write a receipt path.");
            StringAssert.StartsWith("Assets/Greybox/Generated/", receiptPath, "Import receipts must stay under the generated Greybox root.");
            var receipt = AssetDatabase.LoadAssetAtPath<GreyboxImportReceipt>(receiptPath);
            Assert.NotNull(receipt, "Imported Greybox content should create a durable import receipt asset: " + receiptPath);
            Assert.AreEqual(kind, receipt.Kind);
            Assert.AreEqual(artifact.ArtifactId, receipt.ArtifactId);
            Assert.AreEqual(artifact.SourcePath, receipt.SourcePath);
            Assert.AreEqual(artifact.SourceHash, receipt.SourceHash);
            Assert.AreEqual(artifact.GeneratorCredit, receipt.GeneratorCredit);
            Assert.AreEqual(artifact.HumanDesignerCredit, receipt.HumanDesignerCredit);
            Assert.AreEqual(artifact.AiDisclosure, receipt.AiDisclosure);
            Assert.AreEqual(receiptPath, receipt.ImportReceiptPath);
            CollectionAssert.Contains(receipt.GeneratedAssetPaths, generatedAssetPath);
            CollectionAssert.Contains(receipt.AddressableLabels, AddressablesTagger.GeneratedLabel);
            CollectionAssert.Contains(receipt.AddressableLabels, AddressablesTagger.LabelForKind(kind));
            AssertAddressable(receiptPath, kind);
        }

        private static void AssertAddressable(string path, GreyboxArtifactKind kind)
        {
            AddressableAssetSettings settings = AddressableAssetSettingsDefaultObject.Settings;
            Assert.NotNull(settings, "Addressables settings should exist for smoke import.");
            string guid = AssetDatabase.AssetPathToGUID(path);
            Assert.IsNotEmpty(guid, "Imported asset should have a GUID: " + path);
            AddressableAssetEntry entry = settings.FindAssetEntry(guid);
            Assert.NotNull(entry, "Greybox generated asset should be Addressable: " + path);
            Assert.NotNull(entry.parentGroup, "Addressable entry should have a group: " + path);
            Assert.AreEqual(AddressablesTagger.GeneratedGroupName, entry.parentGroup.Name);
            StringAssert.StartsWith("greybox/", entry.address);
            CollectionAssert.Contains(entry.labels, AddressablesTagger.GeneratedLabel);
            CollectionAssert.Contains(entry.labels, AddressablesTagger.LabelForKind(kind));
            var mainAsset = AssetDatabase.LoadMainAssetAtPath(path);
            CollectionAssert.Contains(AssetDatabase.GetLabels(mainAsset), AddressablesTagger.GeneratedLabel);
        }

        private static void AssertSampleSceneAddressable(string path)
        {
            AddressableAssetSettings settings = AddressableAssetSettingsDefaultObject.Settings;
            Assert.NotNull(settings, "Addressables settings should exist for generated sample scenes.");
            string guid = AssetDatabase.AssetPathToGUID(path);
            Assert.IsNotEmpty(guid, "Generated sample scene should have a GUID: " + path);
            AddressableAssetEntry entry = settings.FindAssetEntry(guid);
            Assert.NotNull(entry, "Greybox generated sample scene should be Addressable: " + path);
            Assert.NotNull(entry.parentGroup, "Generated sample scene Addressable entry should have a group: " + path);
            Assert.AreEqual(AddressablesTagger.GeneratedGroupName, entry.parentGroup.Name);
            StringAssert.StartsWith("greybox/", entry.address);
            CollectionAssert.Contains(entry.labels, AddressablesTagger.GeneratedLabel);
            CollectionAssert.Contains(entry.labels, AddressablesTagger.SampleSceneLabel);
            CollectionAssert.Contains(entry.labels, AddressablesTagger.PlatformerSampleLabel);
            var sceneAsset = AssetDatabase.LoadAssetAtPath<SceneAsset>(path);
            CollectionAssert.Contains(AssetDatabase.GetLabels(sceneAsset), AddressablesTagger.SampleSceneLabel);
            CollectionAssert.Contains(AssetDatabase.GetLabels(sceneAsset), AddressablesTagger.PlatformerSampleLabel);
        }

        private static void EnsureAddressablesSettings()
        {
            AddressableAssetSettings settings = AddressableAssetSettingsDefaultObject.GetSettings(true);
            Assert.NotNull(settings, "Smoke project should create Addressables settings.");
            Assert.NotNull(settings.DefaultGroup, "Smoke project should have a default Addressables group.");
        }

        private static void AssertDirectory(params string[] parts)
        {
            var path = Path.Combine(parts);
            Assert.IsTrue(Directory.Exists(path), "Missing directory: " + path);
        }

        private static void AssertFile(params string[] parts)
        {
            var path = Path.Combine(parts);
            Assert.IsTrue(File.Exists(path), "Missing file: " + path);
        }
    }
}
`;
}

export function playModeSmokeTestSource() {
  return `using System.Collections;
using System.Linq;
using Greybox.Runtime;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using UnityEngine.UI;

namespace Greybox.Validation
{
    public sealed class GreyboxPlatformerPlaySmoke
    {
        [UnityTest]
        public IEnumerator GeneratedPlatformerSceneRunsGameplayLoop()
        {
            SceneManager.LoadScene("Greybox2DPlatformerSample", LoadSceneMode.Single);
            yield return null;
            yield return new WaitForFixedUpdate();

            GreyboxPlatformerSamplePlayer player = UnityEngine.Object.FindObjectOfType<GreyboxPlatformerSamplePlayer>();
            Assert.NotNull(player, "Playable scene should load the sample player.");
            Rigidbody2D body = player.GetComponent<Rigidbody2D>();
            Assert.NotNull(body, "Sample player should have Rigidbody2D movement.");
            AssertInputFallbackComposition();

            player.QueueInput(1f, false);
            player.Simulate(1f, false);
            yield return new WaitForFixedUpdate();
            Assert.Greater(body.velocity.x, 0f, "Sample player should move through the runtime simulation path.");
            Assert.IsTrue(player.HasAbility("double-jump"), "Playable player should retain authored double-jump ability.");
            player.Simulate(0f, true);
            Assert.AreEqual(1, player.JumpCount, "First jump should consume the grounded jump.");
            player.Simulate(0f, true);
            Assert.AreEqual(2, player.JumpCount, "Player double jump should be driven by authored ability metadata.");
            Assert.AreEqual("double-jump", player.LastUsedAbilityId, "Player double jump should expose the authored ability id.");

            GreyboxPlatformerSampleHazard hazard = UnityEngine.Object.FindObjectOfType<GreyboxPlatformerSampleHazard>();
            Assert.NotNull(hazard, "Playable scene should include a hazard.");
            player.transform.position = hazard.transform.position + Vector3.right;
            Assert.IsTrue(hazard.Apply(player, 10f), "Hazard should respawn the player.");
            Assert.AreEqual(player.SpawnPoint, player.transform.position);
            Assert.AreEqual(1, player.DeathCount);
            Assert.AreEqual(1, player.LastDamageTaken, "Hazard should preserve imported damage on the player.");
            Assert.AreEqual(3.25f, player.LastKnockbackImpulse.magnitude, 0.01f, "Hazard should preserve imported knockback on the player.");
            Assert.AreEqual(0.65f, hazard.TickSeconds, 0.01f, "Hazard should preserve imported tick cadence on the player-facing runtime.");
            Assert.AreEqual("stagger", player.LastStatusEffect, "Hazard should preserve imported status effect on the player.");
            Assert.AreEqual("stagger", hazard.LastAppliedEffect, "Hazard should expose the last imported status effect it applied.");
            Assert.IsTrue(hazard.AffectsPlayer(player), "Hazard affected tags should include playable player identity.");
            Assert.IsFalse(hazard.Apply(player, 10.2f), "Hazard tick cadence should prevent duplicate immediate damage.");
            Assert.AreEqual("gameview.hazard", player.LastDamageSourceKind);
            Assert.AreEqual("pit_gap_a", player.LastDamageSourceId);
            Assert.AreEqual(2, player.CurrentHearts, "Hazard damage should reduce authored player hearts.");

            GreyboxPlatformerSampleHud hud = UnityEngine.Object.FindObjectOfType<GreyboxPlatformerSampleHud>();
            Assert.NotNull(hud, "Playable scene should wire a HUD controller.");
            hud.Refresh();
            Assert.AreEqual(2f, SlotSlider(hud.transform, "hud-hearts", "health").value, 0.001f, "HUD health progress should track deaths after the first hazard.");
            Assert.AreEqual("0", SlotText(hud.transform, "hud-loot", "value").text, "HUD loot slot should start from imported player inventory state.");

            GreyboxPlatformerSampleCheckpoint checkpoint = UnityEngine.Object.FindObjectOfType<GreyboxPlatformerSampleCheckpoint>();
            Assert.NotNull(checkpoint, "Playable scene should include a checkpoint trigger.");
            Vector3 originalSpawn = player.SpawnPoint;
            Assert.IsFalse(checkpoint.SpawnOnStartApplied, "Authored spawnOnStart=false should not auto-apply the checkpoint on scene load.");
            string playerId = player.PlayerId;
            player.PlayerId = "spectator";
            Assert.IsFalse(checkpoint.CanActivatePlayer(player), "Checkpoint actorIds should reject non-authored player actors.");
            Assert.IsFalse(checkpoint.Activate(player, 19f), "Checkpoint should not activate for an actor outside authored actorIds.");
            Assert.AreEqual(0, checkpoint.ActivationCount, "Rejected checkpoint activation should not consume authored activations.");
            player.PlayerId = playerId;
            Assert.IsTrue(checkpoint.CanActivatePlayer(player), "Checkpoint actorIds should allow the authored player actor.");
            Assert.IsTrue(checkpoint.Activate(player, 20f), "Checkpoint should update the player respawn point.");
            Assert.AreNotEqual(originalSpawn, player.SpawnPoint);
            Assert.AreEqual(1, checkpoint.RemainingActivations, "Checkpoint should retain authored activation count after first use.");
            Assert.IsFalse(checkpoint.Activate(player, 20.25f), "Checkpoint should respect authored spawn cooldown before reactivation.");
            hud.Refresh();
            Assert.AreEqual("CHECKPOINT FLAG SET", SlotText(hud.transform, "hud-checkpoint", "label").text);
            Assert.IsTrue(hazard.Apply(player, 10.7f), "Hazard should respawn the player at the activated checkpoint.");
            Assert.AreEqual(player.SpawnPoint, player.transform.position);
            Assert.AreEqual(2, player.DeathCount);
            Assert.AreEqual(1, player.CurrentHearts, "Repeated hazard damage should keep reducing authored player hearts.");
            hud.Refresh();
            Assert.AreEqual(1f, SlotSlider(hud.transform, "hud-hearts", "health").value, 0.001f, "HUD health progress should keep tracking repeated deaths.");

            GreyboxPlatformerSampleEnemy enemy = UnityEngine.Object.FindObjectsOfType<GreyboxPlatformerSampleEnemy>().OrderBy(item => item.transform.position.x).FirstOrDefault();
            Assert.NotNull(enemy, "Playable scene should include an imported enemy patrol.");
            Assert.AreEqual(2, enemy.Health, "Sample enemy health should stay authored from the imported gameview actor.");
            Assert.AreEqual(1, enemy.Damage, "Sample enemy attack damage should stay authored from the imported gameview actor.");
            Assert.AreEqual("patrol-aggro", enemy.Behavior, "Sample enemy behavior should stay authored from the imported gameview actor.");
            Assert.IsTrue(enemy.CanPatrol(), "Patrol-aggro imported behavior should permit patrol movement.");
            Assert.IsTrue(enemy.CanAggro(), "Patrol-aggro imported behavior should permit aggro contact.");
            Assert.IsTrue(enemy.HasAbility("bump"), "Sample enemy abilities should stay authored from the imported gameview actor.");
            Assert.AreEqual(1.6f, enemy.PatrolRadius, 0.01f, "Sample enemy patrol radius should stay authored independently from attack range.");
            Assert.AreEqual(5.5f, enemy.AggroRadius, 0.01f, "Sample enemy aggro radius should stay authored from the imported detection radius.");
            player.transform.position = enemy.transform.position;
            Assert.IsTrue(enemy.CanTargetPlayer(player), "Enemy contact should require different authored factions before damage.");
            Assert.IsTrue(enemy.IsPlayerInAggroRange(player), "Enemy contact should require authored aggro radius before damage.");
            Assert.IsTrue(enemy.IsPlayerInRange(player), "Enemy contact range should stay authored from the imported gameview actor.");
            string runnerFaction = player.Faction;
            player.Faction = enemy.Faction;
            Assert.IsFalse(enemy.CanTargetPlayer(player), "Enemy contact should reject same-faction imported actors.");
            Assert.IsFalse(enemy.IsPlayerInAggroRange(player), "Same-faction actors should not satisfy aggro targeting.");
            Assert.IsFalse(enemy.Apply(player, 11.5f), "Same-faction enemy contact should not damage the player.");
            Assert.AreEqual(0, enemy.HitCount, "Same-faction contact should not inflate enemy hit count.");
            player.Faction = runnerFaction;
            Assert.IsTrue(enemy.Apply(player, 12f), "Imported enemy contact damage should respawn the player.");
            Assert.AreEqual(1, player.LastDamageTaken);
            Assert.AreEqual("gameview.actor", player.LastDamageSourceKind);
            Assert.AreEqual("slime_patrol_a", player.LastDamageSourceId);
            Assert.AreEqual("bump", enemy.LastUsedAbilityId, "Enemy contact should expose the authored ability used for the hit.");
            Assert.AreEqual("bump", enemy.LastAppliedAbilityEffect, "Enemy contact should expose the authored ability effect used for the hit.");
            Assert.AreEqual("bump", player.LastStatusEffect, "Enemy contact should apply authored ability effects to the player runtime.");
            Assert.Greater(player.LastKnockbackImpulse.magnitude, 0f, "Enemy contact should apply authored ability knockback to the player runtime.");
            Assert.AreEqual(0, player.CurrentHearts, "Enemy damage should drive the imported HUD health state down to zero.");
            Assert.AreEqual(0.75f, enemy.AttackCooldownSeconds, 0.01f, "Enemy contact cooldown should stay authored from the imported gameview actor.");
            player.transform.position = enemy.transform.position;
            Assert.IsFalse(enemy.Apply(player, 12.25f), "Enemy contact damage should respect authored attack cooldown.");
            Assert.AreEqual(1, enemy.HitCount, "Cooldown-blocked contact should not inflate hit count.");
            Assert.IsTrue(enemy.IsAttackReady(12.75f), "Enemy contact should become ready again after authored cooldown.");
            player.transform.position = enemy.transform.position + Vector3.right * (enemy.AttackRange + 0.5f);
            Assert.IsFalse(enemy.IsPlayerInRange(player), "Enemy contact damage should respect authored attack range.");
            Assert.IsFalse(enemy.Apply(player, 12.75f), "Out-of-range enemy contact should not damage the player.");
            enemy.AggroRadius = 1f;
            player.transform.position = enemy.transform.position + Vector3.right * 1.2f;
            Assert.IsTrue(enemy.IsPlayerInRange(player), "Aggro smoke should keep the player inside authored attack range.");
            Assert.IsFalse(enemy.IsPlayerInAggroRange(player), "Enemy contact damage should respect authored detection radius.");
            Assert.IsFalse(enemy.Apply(player, 12.75f), "Outside-aggro enemy contact should not damage the player.");
            enemy.AggroRadius = 5.5f;
            player.transform.position = enemy.transform.position;
            Assert.AreEqual(1, player.AttackDamage, "Player attack damage should stay authored from the imported gameview actor.");
            Assert.AreEqual(1.6f, player.AttackRange, 0.01f, "Player attack range should stay authored from the imported gameview actor.");
            Assert.AreEqual(0.45f, player.AttackCooldownSeconds, 0.01f, "Player attack cooldown should stay authored from the imported gameview actor.");
            player.ResetHealth();
            enemy.ResetEnemy();
            player.transform.position = enemy.transform.position + Vector3.left * 0.75f;
            Assert.AreEqual(enemy, player.FindNearestAttackableEnemy(), "Player attack input should target the nearest authored enemy inside range.");
            player.Simulate(0f, false, true, 30f);
            Assert.AreEqual(1, enemy.CurrentHealth, "Input-driven player attack should damage the imported enemy.");
            Assert.IsFalse(enemy.Defeated, "Two-health imported enemy should survive one hit.");
            Assert.AreEqual(1, player.AttackCount);
            Assert.AreEqual(30f, player.LastAttackTimeSeconds, 0.001f, "Input-driven player attack should preserve deterministic simulation time.");
            Assert.AreEqual("slime_patrol_a", player.LastAttackedEnemyId, "Input-driven player attack should preserve authored enemy provenance.");
            Assert.AreEqual("", player.LastDefeatedEnemyLootTableId, "Non-defeating hits should not emit authored loot-table provenance.");
            Assert.IsFalse(player.Attack(enemy, player.LastAttackTimeSeconds + 0.25f), "Player attack input should respect authored attack cooldown.");
            Assert.AreEqual(1, player.AttackCount, "Cooldown-blocked player attacks should not inflate attack count.");
            Assert.IsTrue(player.IsAttackReady(player.LastAttackTimeSeconds + player.AttackCooldownSeconds), "Player attack should become ready after authored cooldown.");
            Assert.IsTrue(player.Attack(enemy, player.LastAttackTimeSeconds + player.AttackCooldownSeconds), "Second authored player attack should defeat the imported enemy.");
            Assert.IsTrue(enemy.Defeated);
            Assert.AreEqual(0, enemy.CurrentHealth);
            Assert.AreEqual(2, player.AttackCount);
            Assert.AreEqual(1, player.DefeatedEnemyCount);
            Assert.AreEqual("starter-slime-drops", player.LastDefeatedEnemyLootTableId, "Defeating an imported enemy should expose authored loot-table provenance.");
            Assert.IsTrue(player.HasDefeatedEnemy("slime_patrol_a"), "Player should track authored defeated enemy ids for target objectives.");
            Assert.AreEqual("loot-slime_patrol_a-starter-slime-drops", enemy.LastLootDropId, "Defeating an imported enemy should spawn a stable authored loot drop id.");
            Assert.NotNull(enemy.LastLootDrop, "Defeating an imported enemy should spawn a playable loot pickup.");
            Assert.AreEqual(new Vector3(0.35f, 0.35f, 0.1f), enemy.LastLootDrop.transform.localScale, "Enemy loot drops should render at a stable playable pickup scale.");
            Renderer lootDropRenderer = enemy.LastLootDrop.GetComponent<Renderer>();
            Assert.NotNull(lootDropRenderer, "Enemy loot drops should render visibly in the generated scene.");
            Assert.NotNull(lootDropRenderer.sharedMaterial, "Enemy loot drops should inherit an art-bible coin material.");
            GreyboxPlatformerSampleCollectible lootDrop = enemy.LastLootDrop.GetComponent<GreyboxPlatformerSampleCollectible>();
            Assert.NotNull(lootDrop, "Enemy loot drops should use the playable collectible runtime.");
            Assert.AreEqual("gameview.loot-table", lootDrop.SourceArtifactKind);
            Assert.AreEqual("starter-slime-drops", lootDrop.SourceArtifactId);
            Assert.AreEqual("loot", lootDrop.SourceObjectiveType);
            Assert.IsTrue(lootDrop.IsLoot(), "Enemy loot drops should be classified separately from objective coins.");
            Assert.AreEqual(0, player.LootPickupCount, "Enemy loot should not increment player inventory before collection.");
            Assert.IsTrue(lootDrop.Collect(player), "Enemy loot drop should be collectible without affecting objective coin gates.");
            Assert.IsTrue(lootDrop.Collected);
            Assert.AreEqual(1, player.LootPickupCount, "Enemy loot collection should update player inventory state.");
            Assert.AreEqual("loot-slime_patrol_a-starter-slime-drops", player.LastCollectedLootDropId);
            Assert.AreEqual("starter-slime-drops", player.LastCollectedLootTableId);
            Assert.AreEqual("Loot: starter-slime-drops", player.LastCollectedLootDisplayName);
            hud.Refresh();
            Assert.AreEqual("1", SlotText(hud.transform, "hud-loot", "value").text, "HUD loot slot should reflect collected enemy loot.");
            GameObject defeatGoalObject = new GameObject("Defeat Target Smoke Goal");
            GreyboxPlatformerSampleGoal defeatGoal = defeatGoalObject.AddComponent<GreyboxPlatformerSampleGoal>();
            defeatGoal.TargetIds = new[] { "slime_patrol_a" };
            defeatGoal.Reward = "open-slime-gate";
            defeatGoal.Hud = hud;
            Assert.IsFalse(defeatGoal.IsLockedByTargetIdsFor(player, hud), "Goal target ids should unlock when authored enemies are defeated.");
            Assert.IsTrue(defeatGoal.MarkReached(player, hud, 40f), "Defeated-enemy target goals should become completable.");
            Assert.AreEqual("open-slime-gate", player.LastCompletedGoalRewardId, "Defeated-enemy target goals should grant their authored reward.");
            defeatGoal.ResetGoal();
            player.ResetCombatProgress();
            hud.Refresh();
            Assert.IsFalse(player.HasDefeatedEnemy("slime_patrol_a"), "Resetting combat progress should clear defeated target ids for replay.");
            Assert.IsTrue(defeatGoal.IsLockedByTargetIdsFor(player, hud), "Defeated-enemy target goals should relock after combat progress resets.");
            UnityEngine.Object.DestroyImmediate(defeatGoalObject);
            Assert.IsFalse(lootDrop.gameObject.activeSelf);
            Assert.IsFalse(player.Attack(enemy), "Defeated imported enemy should reject extra player attacks.");
            Assert.IsFalse(enemy.gameObject.activeSelf, "Defeated imported enemy should leave the playable scene.");

            GreyboxPlatformerSampleCollectible[] coins = UnityEngine.Object.FindObjectsOfType<GreyboxPlatformerSampleCollectible>();
            Assert.AreEqual(24, coins.Length, "Playable scene should instantiate every sample coin.");
            Assert.AreEqual(hud.TotalCoins, coins.Length, "Playable HUD should use the authored coin-line objective count.");
            Assert.AreEqual("coin_line", coins.OrderBy(coin => coin.CoinId).First().SourceObjectiveId, "Playable coins should retain their source gameview objective id.");
            Assert.AreEqual("collectible", coins.OrderBy(coin => coin.CoinId).First().SourceObjectiveType, "Playable coins should retain their authored objective type.");
            GreyboxPlatformerSampleGoal goal = UnityEngine.Object.FindObjectOfType<GreyboxPlatformerSampleGoal>();
            Assert.NotNull(goal, "Playable scene should include a goal trigger.");
            Assert.IsTrue(goal.IsLockedByTargetIdsFor(hud), "Goal should stay locked before authored target objective coins are collected.");
            Assert.IsTrue(coins.First().Collect(player), "Coin collection should update HUD state.");
            hud.Refresh();
            Assert.AreEqual(1, hud.CoinsCollected);
            Assert.IsTrue(hud.HasCollectedObjective("coin_line"), "HUD should track collected authored source objective ids.");
            Assert.IsFalse(goal.IsLockedByTargetIdsFor(hud), "Goal target ids should unlock after collecting a coin from the authored target objective.");
            Assert.AreEqual("1 / 24", SlotText(hud.transform, "hud-coins", "value").text);
            Assert.IsFalse(hud.CollectCoin(coins.First().CoinId), "HUD should reject a duplicate stable coin id during PlayMode smoke.");
            Assert.AreEqual(1, hud.CoinsCollected, "Duplicate coin ids should not inflate the sample counter.");

            Assert.AreEqual(hud, goal.Hud, "Generated goal should reference the HUD that tracks authored coins.");
            Assert.AreEqual(hud.TotalCoins, goal.RequiredCoins, "Generated goal should require the authored coin-line objective count.");
            Assert.AreEqual("unlock-exit", goal.Reward, "Generated goal should retain the authored objective reward.");
            Assert.AreEqual(90f, goal.TimeLimitSeconds, 0.01f, "Generated goal should retain the authored objective time limit.");
            Assert.IsFalse(goal.IsExpired(89f), "Goal should remain completable before the authored objective time limit.");
            Assert.IsTrue(goal.IsExpired(91f), "Goal should expire after the authored objective time limit.");
            Assert.IsTrue(goal.IsLockedByCoins, "Goal should stay locked before every authored coin is collected.");
            Assert.IsFalse(goal.MarkReached(player), "Goal should reject completion while authored coins remain.");
            Assert.AreEqual(0, goal.CompletionCount);
            foreach (GreyboxPlatformerSampleCollectible remainingCoin in coins.OrderBy(item => item.CoinId).Where(item => !item.Collected))
            {
                Assert.IsTrue(remainingCoin.Collect(player), "Remaining authored coins should be collectible before exit.");
            }
            hud.Refresh();
            Assert.AreEqual(hud.TotalCoins, hud.CoinsCollected, "HUD should count every authored coin before exit unlocks.");
            Assert.IsFalse(goal.IsLockedByCoins, "Goal should unlock after every authored coin is collected.");
            Assert.AreEqual("REACH EXIT GATE", SlotText(hud.transform, "hud-objective", "label").text);
            Assert.IsFalse(goal.MarkReached(player, hud, 91f), "Goal should reject completion after authored time limit expires.");
            Assert.IsTrue(goal.MarkReached(player, hud, 89f), "Goal should mark sample completion before authored time limit expires.");
            Assert.IsTrue(goal.Completed);
            Assert.AreEqual("unlock-exit", goal.LastReward, "Goal completion should expose the authored objective reward.");
            Assert.AreEqual(1, player.GoalRewardCount, "Goal completion should grant the authored reward to the player runtime.");
            Assert.AreEqual("exit_gate", player.LastCompletedGoalId, "Goal completion should expose the authored goal id on the player runtime.");
            Assert.AreEqual("Exit Gate", player.LastCompletedGoalDisplayName, "Goal completion should expose the authored goal display name on the player runtime.");
            Assert.AreEqual("unlock-exit", player.LastCompletedGoalRewardId, "Goal completion should expose the authored reward id on the player runtime.");
            Assert.AreEqual("EXIT GATE REACHED", SlotText(hud.transform, "hud-objective", "label").text);
            GreyboxPlatformerSampleRunReset sceneReset = UnityEngine.Object.FindObjectOfType<GreyboxPlatformerSampleRunReset>();
            Assert.NotNull(sceneReset, "Generated scene should include a one-click sample run reset controller.");
            Assert.IsTrue(sceneReset.CanHandleHudAction("reset-run"), "Generated sample run reset should accept the imported HUD reset action.");
            GreyboxHudActionDispatcher.Raise("reset-run", "hud-reset", "reset-run", "//*[@data-agds-id=\\"hud-reset\\"]", "RESET RUN", hud);
            Assert.AreEqual(1, sceneReset.LastHudActionResetCount, "HUD reset action should restart the generated sample run.");
            sceneReset.ResetSampleRun();
            hud.Refresh();
            Assert.AreEqual(0, player.GoalRewardCount, "Sample run reset should clear awarded goal progress.");
            Assert.AreEqual(0, player.LootPickupCount, "Sample run reset should clear collected loot progress.");
            Assert.AreEqual(0, player.DeathCount, "Sample run reset should clear death count.");
            Assert.AreEqual(player.SpawnPoint, player.transform.position, "Sample run reset should return player to imported spawn.");
            Assert.GreaterOrEqual(sceneReset.LastResetEnemyCount, 1, "Sample run reset should reset imported enemies.");
            Assert.AreEqual(hud.TotalCoins, sceneReset.LastResetCollectibleCount, "Sample run reset should reset imported objective coins.");
        }

        [Test]
        public void InputFallbackCompositionWorks()
        {
            AssertInputFallbackComposition();
        }

        private static void AssertInputFallbackComposition()
        {
            Assert.AreEqual(-1f, GreyboxPlatformerSamplePlayer.ComposeHorizontal(true, false, false, true), "Input System left should override conflicting legacy right.");
            Assert.AreEqual(1f, GreyboxPlatformerSamplePlayer.ComposeHorizontal(false, true, true, false), "Input System right should override conflicting legacy left.");
            Assert.AreEqual(-1f, GreyboxPlatformerSamplePlayer.ComposeHorizontal(false, false, true, false), "Legacy left should be used when the Input System axis is neutral.");
            Assert.AreEqual(1f, GreyboxPlatformerSamplePlayer.ComposeHorizontal(false, false, false, true), "Legacy right should be used when the Input System axis is neutral.");
            Assert.AreEqual(0f, GreyboxPlatformerSamplePlayer.ComposeHorizontal(false, false, true, true), "Conflicting legacy keys should cancel when no Input System direction is active.");
            Assert.IsTrue(GreyboxPlatformerSamplePlayer.ComposeJumpPressed(true, false), "Input System jump should fire.");
            Assert.IsTrue(GreyboxPlatformerSamplePlayer.ComposeJumpPressed(false, true), "Legacy keyboard jump should fire.");
            Assert.IsFalse(GreyboxPlatformerSamplePlayer.ComposeJumpPressed(false, false), "Jump should stay idle without either input source.");
        }

        private static Text SlotText(Transform root, string slotId, string role)
        {
            Transform slot = root.Find(slotId);
            Assert.NotNull(slot, "Missing HUD slot: " + slotId);
            Transform text = slot.Find(role);
            Assert.NotNull(text, "Missing HUD role: " + role);
            return text.GetComponent<Text>();
        }

        private static Slider SlotSlider(Transform root, string slotId, string bindingId)
        {
            Transform slot = root.Find(slotId);
            Assert.NotNull(slot, "Missing HUD slot: " + slotId);
            foreach (Slider slider in slot.GetComponentsInChildren<Slider>(true))
            {
                var binding = slider.GetComponent<GreyboxHudBinding>();
                if (binding && binding.BindingId == bindingId) return slider;
            }

            Assert.Fail("Missing HUD slider: " + bindingId);
            return null;
        }
    }
}
`;
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    keepProject: false,
    skipIfMissing: false,
    unity: '',
    unityVersion: '2022.3.0f1',
    projectPath: '',
    logFile: '',
    playmodeLogFile: '',
    playmodeResultsFile: '',
    resultsFile: '',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--keep-project') options.keepProject = true;
    else if (arg === '--skip-if-missing') options.skipIfMissing = true;
    else if (arg === '--unity') options.unity = argv[++index] ?? '';
    else if (arg === '--unity-version') options.unityVersion = argv[++index] ?? options.unityVersion;
    else if (arg === '--project-path') options.projectPath = argv[++index] ?? '';
    else if (arg === '--log-file') options.logFile = argv[++index] ?? '';
    else if (arg === '--playmode-log-file') options.playmodeLogFile = argv[++index] ?? '';
    else if (arg === '--playmode-results-file') options.playmodeResultsFile = argv[++index] ?? '';
    else if (arg === '--results-file') options.resultsFile = argv[++index] ?? '';
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const here = dirname(fileURLToPath(import.meta.url));
  const packageRoot = resolve(here, '..');
  const discoveredUnity = options.unity || discoverUnityEditors()[0] || '';
  if (!discoveredUnity && !options.dryRun) {
    const message = 'BLOCKED Unity Editor not found. Install Unity 2022.3 LTS or pass --unity /path/to/Unity.';
    if (options.skipIfMissing) {
      console.log(message);
      return;
    }
    console.error(message);
    process.exitCode = 2;
    return;
  }
  const unity = discoveredUnity || '/path/to/Unity';

  const tempRoot = options.projectPath
    ? resolve(options.projectPath)
    : mkdtempSync(join(tmpdir(), 'greybox-unity-import-smoke-'));
  const projectRoot = createSmokeProject({
    root: tempRoot,
    packageRoot,
    unityVersion: options.unityVersion,
  });
  const logFile = options.logFile || join(projectRoot, 'unity-import-smoke.log');
  const resultsFile = options.resultsFile || join(projectRoot, 'unity-import-smoke-results.xml');
  const playmodeLogFile = options.playmodeLogFile || join(projectRoot, 'unity-playmode-smoke.log');
  const playmodeResultsFile = options.playmodeResultsFile || join(projectRoot, 'unity-playmode-smoke-results.xml');
  const editModeCommand = unitySmokeCommand({ unity, projectRoot, logFile, resultsFile });
  const playModeCommand = unityPlayModeSmokeCommand({
    unity,
    projectRoot,
    logFile: playmodeLogFile,
    resultsFile: playmodeResultsFile,
  });

  if (options.dryRun) {
    console.log(`DRY_RUN_EDITMODE ${editModeCommand.map(shellQuote).join(' ')}`);
    console.log(`DRY_RUN_PLAYMODE ${playModeCommand.map(shellQuote).join(' ')}`);
    console.log(`PROJECT ${projectRoot}`);
    return;
  }

  const editModeExit = runUnitySmokeCommand(editModeCommand, 'EditMode import smoke', logFile);
  if (editModeExit !== 0) {
    cleanupSmokeProject(projectRoot, options);
    process.exitCode = editModeExit;
    return;
  }
  if (!assertPassingResults(resultsFile, 'Unity EditMode import smoke')) {
    cleanupSmokeProject(projectRoot, options);
    process.exitCode = 1;
    return;
  }
  console.log(`PASS Unity EditMode required smoke results: ${requiredSmokeResultTests('Unity EditMode import smoke').join(', ')}`);
  console.log(`PASS Unity EditMode package test assemblies: ${requiredPackageTestAssemblies('Unity EditMode import smoke').join(', ')}`);
  console.log(`PASS Unity EditMode import smoke completed. Results: ${resultsFile}`);

  const playModeExit = runUnitySmokeCommand(playModeCommand, 'PlayMode gameplay smoke', playmodeLogFile);
  if (playModeExit !== 0) {
    cleanupSmokeProject(projectRoot, options);
    process.exitCode = playModeExit;
    return;
  }
  if (!assertPassingResults(playmodeResultsFile, 'Unity PlayMode gameplay smoke')) {
    cleanupSmokeProject(projectRoot, options);
    process.exitCode = 1;
    return;
  }
  cleanupSmokeProject(projectRoot, options);
  console.log(`PASS Unity PlayMode required smoke results: ${requiredSmokeResultTests('Unity PlayMode gameplay smoke').join(', ')}`);
  console.log(`PASS Unity PlayMode package test assemblies: ${requiredPackageTestAssemblies('Unity PlayMode gameplay smoke').join(', ')}`);
  console.log(`PASS Unity PlayMode gameplay smoke completed. Results: ${playmodeResultsFile}`);
}

function runUnitySmokeCommand(command, label, logFile) {
  const result = spawnSync(command[0], command.slice(1), {
    stdio: 'inherit',
    env: {
      ...process.env,
      UNITY_THISISABUILDMACHINE: '1',
    },
  });
  if (result.status !== 0) {
    console.error(`FAIL Unity ${label} exited with status ${result.status}. Log: ${logFile}`);
  }
  return result.status ?? 1;
}

export function assertPassingResults(resultsFile, label) {
  const results = existsSync(resultsFile) ? readFileSync(resultsFile, 'utf8') : '';
  if (!results.includes('test-case') || hasFailingUnityResult(results)) {
    console.error(`FAIL ${label} test results missing or failed: ${resultsFile}`);
    return false;
  }
  const missingTests = requiredSmokeResultTests(label).filter((testName) => !hasPassingSmokeResult(results, testName));
  if (missingTests.length > 0) {
    console.error(`FAIL ${label} missing required passing smoke test result(s): ${missingTests.join(', ')} in ${resultsFile}`);
    return false;
  }
  const missingAssemblies = requiredPackageTestAssemblies(label).filter((assemblyName) => !hasPassingPackageTestAssemblyResult(results, assemblyName));
  if (missingAssemblies.length > 0) {
    console.error(`FAIL ${label} missing package test assembly evidence: ${missingAssemblies.join(', ')} in ${resultsFile}`);
    return false;
  }
  return true;
}

function hasFailingUnityResult(results) {
  return /result="(?:Failed|Error|Cancelled)"/u.test(results)
    || /\b(?:failed|errors)="[1-9][0-9]*"/u.test(results);
}

function hasPassingSmokeResult(results, testName) {
  const testCasePattern = /<test-case\b[^>]*>/gu;
  for (const match of results.matchAll(testCasePattern)) {
    const tag = match[0];
    if (xmlAttributeValue(tag, 'result') === 'Passed' && xmlTestCaseNameMatches(tag, testName)) return true;
  }
  return false;
}

function xmlTestCaseNameMatches(tag, testName) {
  for (const attribute of ['name', 'methodname']) {
    if (xmlAttributeValue(tag, attribute) === testName) return true;
  }
  for (const attribute of ['name', 'fullname']) {
    const value = xmlAttributeValue(tag, attribute);
    if (value.endsWith(`.${testName}`)) return true;
  }
  return false;
}

function xmlAttributeValue(tag, attribute) {
  const pattern = new RegExp(`\\b${attribute}="([^"]*)"`, 'u');
  const match = pattern.exec(tag);
  return match ? xmlDecodeAttribute(match[1]) : '';
}

function xmlDecodeAttribute(value) {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

export function requiredSmokeResultTests(label) {
  if (/PlayMode/u.test(label)) {
    return ['GeneratedPlatformerSceneRunsGameplayLoop', 'InputFallbackCompositionWorks'];
  }
  return [
    'EditorVersionMatchesReleaseTarget',
    'PackageMetadataAndAssembliesLoad',
    'EnginePackagePreflightFailsClosedWhenPackageMetadataIsMissingOrUnsafe',
    'LiveSyncPackageHandoffRequiresPreflightAndChecksumManifest',
    'ConflictInboxInjectsRepresentativeRoundTripSmokeConflict',
    'ConflictResolverCoversWebUnityManualAndBatchUnderThirtySeconds',
    'ConflictWindowActionsPostRefreshAndClearInboxUnderThirtySeconds',
    'PrefabSidecarResolutionPreservesCanonicalChoiceUnderThirtySeconds',
    'McpToolDefinitionsAreProtocolShapedJson',
    'McpBridgeHandlesProtocolAndHierarchySmoke',
    'McpBridgeCreatesAndEditsRoundTripObjects',
    'HudBuilderSupportsUiToolkitRenderer',
    'PackagedSamplesImportIntoProjectAssetsUnderThirtySeconds',
    'RequiredSamplesDocumentationAndLegalFilesArePresent',
  ];
}

export function requiredPackageTestAssemblies(label) {
  return /PlayMode/u.test(label) ? ['Greybox.Runtime.Tests'] : ['Greybox.Editor.Tests'];
}

export function requiredPackageTestAssembliesFromOutput(output, label) {
  const observed = new Set(packageTestAssemblyNamesFromOutput(output, label));
  return requiredPackageTestAssemblies(label).filter((assemblyName) => observed.has(assemblyName));
}

function packageTestAssemblyNamesFromOutput(output, label) {
  const marker = /PlayMode/u.test(label)
    ? 'PASS Unity PlayMode package test assemblies:'
    : 'PASS Unity EditMode package test assemblies:';
  return String(output ?? '')
    .split(/\r?\n/u)
    .filter((line) => line.startsWith(marker))
    .flatMap((line) => line.slice(marker.length).split(','))
    .map((name) => name.trim())
    .filter(Boolean);
}

function hasPassingPackageTestAssemblyResult(results, assemblyName) {
  const testSuitePattern = /<test-suite\b[^>]*>/gu;
  for (const match of String(results ?? '').matchAll(testSuitePattern)) {
    const tag = match[0];
    if (xmlAttributeValue(tag, 'result') !== 'Passed') continue;
    for (const attribute of ['name', 'fullname', 'assembly']) {
      const value = xmlAttributeValue(tag, attribute);
      if (value === assemblyName || value === `${assemblyName}.dll` || value.endsWith(`/${assemblyName}.dll`) || value.endsWith(`\\${assemblyName}.dll`)) {
        return true;
      }
    }
  }
  return false;
}

export function requiredSmokeResultsFromOutput(output, label) {
  const observed = new Set(smokeResultNamesFromOutput(output, label));
  return requiredSmokeResultTests(label).filter((testName) => observed.has(testName));
}

function smokeResultNamesFromOutput(output, label) {
  const marker = /PlayMode/u.test(label)
    ? 'PASS Unity PlayMode required smoke results:'
    : 'PASS Unity EditMode required smoke results:';
  return String(output ?? '')
    .split(/\r?\n/u)
    .filter((line) => line.startsWith(marker))
    .flatMap((line) => line.slice(marker.length).split(','))
    .map((name) => name.trim())
    .filter(Boolean);
}

function cleanupSmokeProject(projectRoot, options) {
  if (!options.keepProject && !options.projectPath) rmSync(projectRoot, { recursive: true, force: true });
}

function splitPathList(value) {
  return String(value ?? '')
    .split(delimiter)
    .map((item) => item.trim())
    .filter(Boolean);
}

function unityCommandNames(platform) {
  if (platform === 'win32') return ['Unity.exe', 'Unity'];
  return ['Unity', 'unity-editor'];
}

function unityHubEditorCandidates({ env, platform, readdir }) {
  const roots = unityHubRoots(env, platform);
  const candidates = [];
  for (const root of roots) {
    for (const version of readVersionDirectories(root, readdir)) {
      candidates.push(unityExecutableForHubVersion(root, version, platform));
    }
  }
  return candidates;
}

function unityHubRoots(env, platform) {
  const configured = splitPathList(env.GREYBOX_UNITY_HUB_EDITORS);
  if (configured.length > 0) return configured;
  if (platform === 'darwin') return ['/Applications/Unity/Hub/Editor'];
  if (platform === 'win32') {
    return [
      join(env.ProgramFiles || 'C:\\Program Files', 'Unity', 'Hub', 'Editor'),
      join(env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Unity', 'Hub', 'Editor'),
    ];
  }
  return ['/opt/Unity/Hub/Editor', '/opt/unity/hub/editor'];
}

function readVersionDirectories(root, readdir) {
  try {
    return readdir(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => /^(\d+\.\d+|\d+\.\d+\.\d+|6000\.)/u.test(name))
      .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
  } catch {
    return [];
  }
}

function unityExecutableForHubVersion(root, version, platform) {
  if (platform === 'darwin') return join(root, version, 'Unity.app', 'Contents', 'MacOS', 'Unity');
  if (platform === 'win32') return join(root, version, 'Editor', 'Unity.exe');
  return join(root, version, 'Editor', 'Unity');
}

function fixedUnityEditorCandidates({ env, platform }) {
  if (platform === 'darwin') return ['/Applications/Unity/Unity.app/Contents/MacOS/Unity'];
  if (platform === 'win32') {
    return [
      join(env.ProgramFiles || 'C:\\Program Files', 'Unity', 'Editor', 'Unity.exe'),
      join(env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Unity', 'Editor', 'Unity.exe'),
    ];
  }
  return ['/opt/Unity/Editor/Unity', '/opt/unity/Editor/Unity'];
}

function which(command, platform = process.platform) {
  try {
    const lookup = platform === 'win32' ? 'where' : '/usr/bin/which';
    return execFileSync(lookup, [command], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split(/\r?\n/u)[0]?.trim() ?? '';
  } catch {
    return '';
  }
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function unityStreamPrefix(version) {
  return String(version ?? '')
    .match(/^(\d+\.\d+)/u)?.[1] ?? '2022.3';
}

function escapeCSharpString(value) {
  return String(value ?? '')
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
