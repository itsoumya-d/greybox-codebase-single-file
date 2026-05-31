// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System.Reflection;
using Greybox.Editor.Sync;
using NUnit.Framework;

namespace Greybox.Tests.EditMode
{
    public sealed class GreyboxEnginePackagePreflightClientTests
    {
        private const string ValidContentRevisionSha256 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

        [Test]
        public void ParseAcceptsReadyDaemonPackageMetadata()
        {
            GreyboxEnginePackagePreflight preflight = Parse(@"{
              ""engine"": ""unity"",
              ""sourceFileName"": ""levels\\arena.gameview.json"",
              ""packageFileName"": ""greybox-unity-engine-package.zip"",
              ""fileCount"": 4,
              ""sizeBytes"": 2048,
              ""contentRevisionSha256"": """ + ValidContentRevisionSha256 + @""",
              ""manifest"": {
                ""terrainColliderCount"": 2,
                ""dynamicEventCount"": 3,
                ""factionCount"": 4
              }
            }");

            Assert.True(preflight.Available);
            Assert.AreEqual("unity", preflight.Engine);
            Assert.AreEqual("levels/arena.gameview.json", preflight.SourceFileName);
            Assert.AreEqual("greybox-unity-engine-package.zip", preflight.PackageFileName);
            Assert.AreEqual(4, preflight.FileCount);
            Assert.AreEqual(2048L, preflight.SizeBytes);
            Assert.AreEqual(ValidContentRevisionSha256, preflight.ContentRevisionSha256);
            Assert.AreEqual(2, preflight.TerrainColliderCount);
            Assert.AreEqual(3, preflight.DynamicEventCount);
            Assert.AreEqual(4, preflight.FactionCount);
        }

        [Test]
        public void ParseFailsClosedWhenDaemonMarksPackageUnavailable()
        {
            GreyboxEnginePackagePreflight preflight = Parse(@"{
              ""available"": false,
              ""engine"": ""unity"",
              ""errorMessage"": ""No Unity package has been generated yet."",
              ""packageFileName"": ""greybox-unity-engine-package.zip"",
              ""fileCount"": 4,
              ""sizeBytes"": 2048
            }");

            Assert.False(preflight.Available);
            Assert.AreEqual("unity", preflight.Engine);
            Assert.AreEqual("No Unity package has been generated yet.", preflight.ErrorMessage);
        }

        [Test]
        public void ParseFailsClosedWhenPackageMetadataIsMissingOrUnsafe()
        {
            GreyboxEnginePackagePreflight missingAvailable = Parse(@"{""engine"":""unity"",""packageFileName"":""greybox.zip"",""fileCount"":1,""sizeBytes"":64}");
            Assert.False(missingAvailable.Available);
            StringAssert.Contains("available=true", missingAvailable.ErrorMessage);

            GreyboxEnginePackagePreflight missingFileName = Parse(@"{""engine"":""unity"",""available"":true,""fileCount"":1,""sizeBytes"":64}");
            Assert.False(missingFileName.Available);
            StringAssert.Contains("missing packageFileName", missingFileName.ErrorMessage);

            foreach (string packageFileName in new[]
            {
                "../greybox.zip",
                "greybox\\engine.zip",
                "C:greybox.zip",
                "https://example.test/greybox.zip",
                "greybox\nengine.zip",
                new string('g', 161) + ".zip"
            })
            {
                GreyboxEnginePackagePreflight unsafeFileName = Parse(@"{""engine"":""unity"",""available"":true,""packageFileName"":""" + JsonString(packageFileName) + @""",""fileCount"":1,""sizeBytes"":64,""contentRevisionSha256"":""" + ValidContentRevisionSha256 + @"""}");
                Assert.False(unsafeFileName.Available);
                StringAssert.Contains("not a path", unsafeFileName.ErrorMessage);
            }

            GreyboxEnginePackagePreflight unsupportedEngine = Parse(@"{""engine"":""unity/../../godot"",""available"":true,""packageFileName"":""greybox.zip"",""fileCount"":1,""sizeBytes"":64}");
            Assert.False(unsupportedEngine.Available);
            StringAssert.Contains("unsupported engine", unsupportedEngine.ErrorMessage);

            GreyboxEnginePackagePreflight wrongExtension = Parse(@"{""engine"":""unity"",""available"":true,""packageFileName"":""greybox.unitypackage"",""fileCount"":1,""sizeBytes"":64}");
            Assert.False(wrongExtension.Available);
            StringAssert.Contains(".zip", wrongExtension.ErrorMessage);

            GreyboxEnginePackagePreflight emptyFiles = Parse(@"{""engine"":""unity"",""available"":true,""packageFileName"":""greybox.zip"",""fileCount"":0,""sizeBytes"":64}");
            Assert.False(emptyFiles.Available);
            StringAssert.Contains("at least one file", emptyFiles.ErrorMessage);

            GreyboxEnginePackagePreflight tooManyFiles = Parse(@"{""engine"":""unity"",""available"":true,""packageFileName"":""greybox.zip"",""fileCount"":" + (PrivateIntConstant("MaxPackageFileCount") + 1) + @",""sizeBytes"":64,""contentRevisionSha256"":""" + ValidContentRevisionSha256 + @"""}");
            Assert.False(tooManyFiles.Available);
            StringAssert.Contains("fileCount must be at most", tooManyFiles.ErrorMessage);

            GreyboxEnginePackagePreflight emptyBytes = Parse(@"{""engine"":""unity"",""available"":true,""packageFileName"":""greybox.zip"",""fileCount"":1,""sizeBytes"":0}");
            Assert.False(emptyBytes.Available);
            StringAssert.Contains("positive sizeBytes", emptyBytes.ErrorMessage);

            GreyboxEnginePackagePreflight oversizedPackage = Parse(@"{""engine"":""unity"",""available"":true,""packageFileName"":""greybox.zip"",""fileCount"":1,""sizeBytes"":" + (PrivateLongConstant("MaxPackageSizeBytes") + 1L) + @",""contentRevisionSha256"":""" + ValidContentRevisionSha256 + @"""}");
            Assert.False(oversizedPackage.Available);
            StringAssert.Contains("sizeBytes must be at most", oversizedPackage.ErrorMessage);

            GreyboxEnginePackagePreflight missingRevision = Parse(@"{""engine"":""unity"",""available"":true,""packageFileName"":""greybox.zip"",""fileCount"":1,""sizeBytes"":64}");
            Assert.False(missingRevision.Available);
            StringAssert.Contains("valid contentRevisionSha256", missingRevision.ErrorMessage);

            GreyboxEnginePackagePreflight malformedRevision = Parse(@"{""engine"":""unity"",""available"":true,""packageFileName"":""greybox.zip"",""fileCount"":1,""sizeBytes"":64,""contentRevisionSha256"":""nope""}");
            Assert.False(malformedRevision.Available);
            StringAssert.Contains("valid contentRevisionSha256", malformedRevision.ErrorMessage);
        }

        [Test]
        public void ParseFailsClosedWhenSourceFileNameIsUnsafe()
        {
            foreach (string sourceFileName in new[]
            {
                "../levels/arena.gameview.json",
                "/levels/arena.gameview.json",
                "https://example.test/arena.gameview.json",
                "C:/arena.gameview.json",
                "levels/notes.txt",
                "levels/\n/arena.gameview.json",
                "levels/" + new string('a', 520) + ".gameview.json"
            })
            {
                GreyboxEnginePackagePreflight preflight = Parse(@"{""engine"":""unity"",""available"":true,""sourceFileName"":""" + JsonString(sourceFileName) + @""",""packageFileName"":""greybox.zip"",""fileCount"":1,""sizeBytes"":64,""contentRevisionSha256"":""" + ValidContentRevisionSha256 + @"""}");
                Assert.False(preflight.Available);
                StringAssert.Contains("safe Greybox artifact file name", preflight.ErrorMessage);
            }
        }

        [Test]
        public void ParseFailsClosedForStringlyPreflightClaims()
        {
            GreyboxEnginePackagePreflight stringAvailable = Parse(@"{""engine"":""unity"",""available"":""true"",""packageFileName"":""greybox.zip"",""fileCount"":1,""sizeBytes"":64,""contentRevisionSha256"":""" + ValidContentRevisionSha256 + @"""}");
            Assert.False(stringAvailable.Available);
            StringAssert.Contains("JSON boolean", stringAvailable.ErrorMessage);

            GreyboxEnginePackagePreflight stringFileCount = Parse(@"{""engine"":""unity"",""available"":true,""packageFileName"":""greybox.zip"",""fileCount"":""1"",""sizeBytes"":64,""contentRevisionSha256"":""" + ValidContentRevisionSha256 + @"""}");
            Assert.False(stringFileCount.Available);
            StringAssert.Contains("JSON integer", stringFileCount.ErrorMessage);

            GreyboxEnginePackagePreflight stringSizeBytes = Parse(@"{""engine"":""unity"",""available"":true,""packageFileName"":""greybox.zip"",""fileCount"":1,""sizeBytes"":""64"",""contentRevisionSha256"":""" + ValidContentRevisionSha256 + @"""}");
            Assert.False(stringSizeBytes.Available);
            StringAssert.Contains("JSON integer", stringSizeBytes.ErrorMessage);

            GreyboxEnginePackagePreflight numericEngine = Parse(@"{""engine"":1,""available"":true,""packageFileName"":""greybox.zip"",""fileCount"":1,""sizeBytes"":64,""contentRevisionSha256"":""" + ValidContentRevisionSha256 + @"""}");
            Assert.False(numericEngine.Available);
            StringAssert.Contains("JSON string", numericEngine.ErrorMessage);

            GreyboxEnginePackagePreflight arrayManifest = Parse(@"{""engine"":""unity"",""available"":true,""packageFileName"":""greybox.zip"",""fileCount"":1,""sizeBytes"":64,""contentRevisionSha256"":""" + ValidContentRevisionSha256 + @""",""manifest"":[]}");
            Assert.False(arrayManifest.Available);
            StringAssert.Contains("JSON object", arrayManifest.ErrorMessage);

            GreyboxEnginePackagePreflight stringManifestCount = Parse(@"{""engine"":""unity"",""available"":true,""packageFileName"":""greybox.zip"",""fileCount"":1,""sizeBytes"":64,""contentRevisionSha256"":""" + ValidContentRevisionSha256 + @""",""manifest"":{""terrainColliderCount"":""2""}}");
            Assert.False(stringManifestCount.Available);
            StringAssert.Contains("JSON integer", stringManifestCount.ErrorMessage);
        }

        [Test]
        public void ParseFailsClosedForOutOfRangeManifestMetrics()
        {
            foreach (string manifestClaim in new[]
            {
                @"""terrainColliderCount"":-1",
                @"""dynamicEventCount"":" + (PrivateIntConstant("MaxManifestMetricCount") + 1),
                @"""factionCount"":" + (PrivateIntConstant("MaxManifestMetricCount") + 1)
            })
            {
                GreyboxEnginePackagePreflight preflight = Parse(@"{""engine"":""unity"",""available"":true,""packageFileName"":""greybox.zip"",""fileCount"":1,""sizeBytes"":64,""contentRevisionSha256"":""" + ValidContentRevisionSha256 + @""",""manifest"":{" + manifestClaim + @"}}");
                Assert.False(preflight.Available);
                StringAssert.Contains("between 0", preflight.ErrorMessage);
            }
        }

        [Test]
        public void ParseFailsClosedForMalformedJson()
        {
            GreyboxEnginePackagePreflight preflight = Parse("{nope");

            Assert.False(preflight.Available);
            StringAssert.Contains("parse failed", preflight.ErrorMessage);
        }

        [Test]
        public void ParseBoundsResponseAndUnavailableMessages()
        {
            GreyboxEnginePackagePreflight oversized = Parse(new string('x', PrivateIntConstant("MaxPreflightResponseChars") + 1));
            Assert.False(oversized.Available);
            StringAssert.Contains("response exceeded", oversized.ErrorMessage);

            string noisyMessage = new string('m', PrivateIntConstant("MaxPreflightMessageChars") + 50) + "\nsecret";
            GreyboxEnginePackagePreflight unavailable = Parse(@"{""engine"":""unity"",""available"":false,""errorMessage"":""" + JsonString(noisyMessage) + @"""}");

            Assert.False(unavailable.Available);
            Assert.LessOrEqual(unavailable.ErrorMessage.Length, PrivateIntConstant("MaxPreflightMessageChars"));
            Assert.False(unavailable.ErrorMessage.Contains("\n"));
        }

        [Test]
        public void PreflightRequestTimeoutIsFinite()
        {
            int timeoutMs = PrivateIntConstant("MaxPreflightRequestMs");
            int pollMs = PrivateIntConstant("PreflightPollMs");

            Assert.Greater(timeoutMs, 0);
            Assert.LessOrEqual(timeoutMs, 3000);
            Assert.LessOrEqual(PrivateIntConstant("MaxPackageFileNameChars"), 160);
            Assert.AreEqual(2048, PrivateIntConstant("MaxPackageFileCount"));
            Assert.AreEqual(512L * 1024L * 1024L, PrivateLongConstant("MaxPackageSizeBytes"));
            Assert.LessOrEqual(PrivateIntConstant("MaxManifestMetricCount"), 100000);
            Assert.LessOrEqual(PrivateIntConstant("MaxPreflightResponseChars"), 64 * 1024);
            Assert.LessOrEqual(PrivateIntConstant("MaxPreflightMessageChars"), 512);
            Assert.Greater(pollMs, 0);
            Assert.LessOrEqual(pollMs, 50);
        }

        private static GreyboxEnginePackagePreflight Parse(string json)
        {
            try
            {
                return (GreyboxEnginePackagePreflight)typeof(GreyboxEnginePackagePreflightClient)
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
            return (int)typeof(GreyboxEnginePackagePreflightClient)
                .GetField(name, BindingFlags.Static | BindingFlags.NonPublic)
                .GetValue(null);
        }

        private static long PrivateLongConstant(string name)
        {
            return (long)typeof(GreyboxEnginePackagePreflightClient)
                .GetField(name, BindingFlags.Static | BindingFlags.NonPublic)
                .GetValue(null);
        }

        private static string JsonString(string value)
        {
            return (value ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", "\\n");
        }
    }
}
