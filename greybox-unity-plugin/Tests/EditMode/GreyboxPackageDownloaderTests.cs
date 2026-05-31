// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using Greybox.Editor.Sync;
using NUnit.Framework;

namespace Greybox.Tests.EditMode
{
    public sealed class GreyboxPackageDownloaderTests
    {
        [Test]
        public void VerifiedDownloadBytesRejectsEmptyAndOversizedPackages()
        {
            Assert.Throws<InvalidDataException>(() => VerifiedDownloadBytes(null, 16L, "Greybox Unity package"));
            Assert.Throws<InvalidDataException>(() => VerifiedDownloadBytes(new byte[0], 16L, "Greybox Unity package"));

            var tooLarge = Assert.Throws<InvalidDataException>(() => VerifiedDownloadBytes(new byte[17], 16L, "Greybox Unity package"));
            StringAssert.Contains("safety cap", tooLarge.Message);

            byte[] package = { 1, 2, 3 };
            Assert.AreSame(package, VerifiedDownloadBytes(package, 16L, "Greybox Unity package"));
        }

        [Test]
        public void PackageDownloadTimeoutsAreFiniteAndSizedForPackageCaps()
        {
            int unityPackageTimeoutMs = PrivateIntConstant("MaxUnityPackageDownloadMs");
            int enginePackageTimeoutMs = PrivateIntConstant("MaxEnginePackageDownloadMs");
            int pollMs = PrivateIntConstant("PackageDownloadPollMs");

            Assert.Greater(unityPackageTimeoutMs, 0);
            Assert.Greater(enginePackageTimeoutMs, unityPackageTimeoutMs);
            Assert.Greater(pollMs, 0);
            Assert.LessOrEqual(pollMs, 100);
        }

        [Test]
        public void PackageEntryCapsAreFiniteAndOrdered()
        {
            long manifestBytes = PrivateLongConstant("MaxEnginePackageManifestBytes");
            long entryBytes = PrivateLongConstant("MaxEnginePackageEntryBytes");
            int archiveEntries = PrivateIntConstant("MaxEnginePackageArchiveEntries");
            int manifestFiles = PrivateIntConstant("MaxEnginePackageManifestFiles");

            Assert.Greater(manifestBytes, 0L);
            Assert.Greater(entryBytes, manifestBytes);
            Assert.LessOrEqual(manifestBytes, 1024L * 1024L);
            Assert.LessOrEqual(entryBytes, 128L * 1024L * 1024L);
            Assert.LessOrEqual(PrivateIntConstant("MaxEnginePackageManifestLabelChars"), 80);
            Assert.Greater(archiveEntries, 0);
            Assert.Greater(manifestFiles, 0);
            Assert.LessOrEqual(manifestFiles, archiveEntries);
            Assert.LessOrEqual(PrivateIntConstant("MaxEnginePackageFileNameChars"), 160);
        }

        [Test]
        public void WriteBytesAtomicallyCreatesAndReplacesDownloadsWithoutTempResidue()
        {
            string tempRoot = Path.Combine(Path.GetTempPath(), $"greybox-atomic-download-{Guid.NewGuid():N}");
            string path = Path.Combine(tempRoot, "greybox.unitypackage");
            Directory.CreateDirectory(tempRoot);
            try
            {
                WriteBytesAtomically(path, new byte[] { 1, 2, 3 }, 16L, "Greybox test");

                Assert.True(File.Exists(path));
                CollectionAssert.AreEqual(new byte[] { 1, 2, 3 }, File.ReadAllBytes(path));
                AssertNoAtomicTempFiles(path);

                WriteBytesAtomically(path, new byte[] { 4, 5 }, 16L, "Greybox test");

                CollectionAssert.AreEqual(new byte[] { 4, 5 }, File.ReadAllBytes(path));
                AssertNoAtomicTempFiles(path);

                WriteBytesAtomically(path, new byte[0], 16L, "Greybox test");

                CollectionAssert.AreEqual(new byte[0], File.ReadAllBytes(path));
                AssertNoAtomicTempFiles(path);
            }
            finally
            {
                if (Directory.Exists(tempRoot)) Directory.Delete(tempRoot, true);
            }
        }

        [Test]
        public void WriteBytesAtomicallyRejectsOversizedDownloadsBeforeReplacing()
        {
            string tempRoot = Path.Combine(Path.GetTempPath(), $"greybox-atomic-download-{Guid.NewGuid():N}");
            string path = Path.Combine(tempRoot, "greybox.unitypackage");
            Directory.CreateDirectory(tempRoot);
            File.WriteAllBytes(path, new byte[] { 9 });
            try
            {
                var error = Assert.Throws<InvalidDataException>(() => WriteBytesAtomically(path, new byte[] { 1, 2 }, 1L, "Greybox test"));

                StringAssert.Contains("safety cap", error.Message);
                CollectionAssert.AreEqual(new byte[] { 9 }, File.ReadAllBytes(path));
                AssertNoAtomicTempFiles(path);
            }
            finally
            {
                if (Directory.Exists(tempRoot)) Directory.Delete(tempRoot, true);
            }
        }

        [Test]
        public void SafeFileNameRejectsPathLikePackageNames()
        {
            Assert.AreEqual("greybox-unity-engine-package.zip", SafeFileName(""));
            Assert.AreEqual("greybox.zip", SafeFileName(" greybox.zip "));

            foreach (string packageFileName in new[]
            {
                ".",
                "..",
                "../greybox.zip",
                "greybox\\engine.zip",
                "C:greybox.zip",
                "https://example.test/greybox.zip",
                "greybox.unitypackage",
                "greybox\nengine.zip",
                new string('g', 161) + ".zip"
            })
            {
                Assert.Throws<InvalidDataException>(() => SafeFileName(packageFileName), packageFileName);
            }
        }

        [Test]
        public void VerifiedUnityPackageBytesRequiresGzipUnityPackageTarStructure()
        {
            byte[] unityPackage = UnityPackageGzip("Assets/Greybox/Arena.gameview\n");
            Assert.AreSame(unityPackage, VerifiedUnityPackageBytes(unityPackage));

            var error = Assert.Throws<InvalidDataException>(() => VerifiedUnityPackageBytes(new byte[] { 0x50, 0x4b, 0x03, 0x04 }));
            StringAssert.Contains("gzip-compressed .unitypackage", error.Message);

            var missingPathname = Assert.Throws<InvalidDataException>(() => VerifiedUnityPackageBytes(UnityPackageGzip(null)));
            StringAssert.Contains("missing matching asset, asset.meta, and safe pathname", missingPathname.Message);

            var traversalPathname = Assert.Throws<InvalidDataException>(() => VerifiedUnityPackageBytes(UnityPackageGzip("../escape.gameview\n")));
            StringAssert.Contains("must stay inside Assets/", traversalPathname.Message);

            var nonAssetsPathname = Assert.Throws<InvalidDataException>(() => VerifiedUnityPackageBytes(UnityPackageGzip("Packages/Greybox/Arena.gameview\n")));
            StringAssert.Contains("must stay inside Assets/", nonAssetsPathname.Message);

            var controlPathname = Assert.Throws<InvalidDataException>(() => VerifiedUnityPackageBytes(UnityPackageGzip("Assets/Greybox/Arena\nInjected.gameview\n")));
            StringAssert.Contains("must stay inside Assets/", controlPathname.Message);
        }

        [Test]
        public void VerifiedEnginePackageZipBytesRequiresZipHeaderAndPreflightSizeMatch()
        {
            const string runtimePath = "arena/unity/AGDSGameViewRuntime.cs";
            const string runtimeSource = "public sealed class AGDSGameViewRuntime {}\n";
            byte[] zipBytes = EnginePackageZip(runtimePath, runtimeSource);
            var matching = new GreyboxEnginePackagePreflight
            {
                FileCount = 1,
                SizeBytes = zipBytes.Length,
                ContentRevisionSha256 = ContentRevisionForFile(runtimePath, runtimeSource)
            };
            Assert.AreSame(zipBytes, VerifiedEnginePackageZipBytes(zipBytes, matching));

            var wrongArchive = Assert.Throws<InvalidDataException>(() => VerifiedEnginePackageZipBytes(new byte[] { 0x1f, 0x8b, 0x08 }, null));
            StringAssert.Contains("zip archive", wrongArchive.Message);

            var mismatch = new GreyboxEnginePackagePreflight { SizeBytes = zipBytes.Length + 1 };
            var error = Assert.Throws<InvalidDataException>(() => VerifiedEnginePackageZipBytes(zipBytes, mismatch));
            StringAssert.Contains("preflight sizeBytes", error.Message);

            var wrongRevision = new GreyboxEnginePackagePreflight
            {
                SizeBytes = zipBytes.Length,
                ContentRevisionSha256 = new string('0', 64)
            };
            var revisionError = Assert.Throws<InvalidDataException>(() => VerifiedEnginePackageZipBytes(zipBytes, wrongRevision));
            StringAssert.Contains("download contentRevisionSha256", revisionError.Message);

            var wrongFileCount = new GreyboxEnginePackagePreflight
            {
                FileCount = 2,
                SizeBytes = zipBytes.Length,
                ContentRevisionSha256 = ContentRevisionForFile(runtimePath, runtimeSource)
            };
            var fileCountError = Assert.Throws<InvalidDataException>(() => VerifiedEnginePackageZipBytes(zipBytes, wrongFileCount));
            StringAssert.Contains("preflight fileCount", fileCountError.Message);
        }

        [Test]
        public void SafeEnginePackageEntryPathRejectsTraversal()
        {
            string root = Path.Combine(Path.GetTempPath(), "greybox-engine-package-safe-root");

            Assert.Throws<InvalidDataException>(() => SafeEnginePackageEntryPath(root, "../escape.cs"));
            Assert.Throws<InvalidDataException>(() => SafeEnginePackageEntryPath(root, "runtime/../../escape.cs"));
            Assert.Throws<InvalidDataException>(() => SafeEnginePackageEntryPath(root, "/absolute.cs"));
            Assert.Throws<InvalidDataException>(() => SafeEnginePackageEntryPath(root, "https://example.test/runtime.cs"));
            Assert.Throws<InvalidDataException>(() => SafeEnginePackageEntryPath(root, "C:/temp/runtime.cs"));
            Assert.Throws<InvalidDataException>(() => SafeEnginePackageEntryPath(root, "arena/" + new string('a', 170) + ".cs"));
            Assert.Throws<InvalidDataException>(() => SafeEnginePackageEntryPath(root, "arena/" + new string('a', 520) + ".cs"));
            Assert.Throws<InvalidDataException>(() => SafeEnginePackageEntryPath(root, "arena/native/malware.dll"));
            Assert.Throws<InvalidDataException>(() => SafeEnginePackageEntryPath(root, "arena/native/malware.dll.meta"));
            Assert.Throws<InvalidDataException>(() => SafeEnginePackageEntryPath(root, "arena/scripts/install.sh"));
            Assert.Throws<InvalidDataException>(() => SafeEnginePackageEntryPath(root, "arena/project/Game.csproj"));
        }

        [Test]
        public void SafeEnginePackageEntryPathAllowsNestedRuntimeFiles()
        {
            string root = Path.GetFullPath(Path.Combine(Path.GetTempPath(), "greybox-engine-package-safe-root"));
            string destination = SafeEnginePackageEntryPath(root, "arena/unity/AGDSGameViewRuntime.cs");

            StringAssert.StartsWith(root, destination);
            StringAssert.EndsWith(Path.Combine("arena", "unity", "AGDSGameViewRuntime.cs"), destination);
        }

        [Test]
        public void ExtractEnginePackageZipWritesOnlySafeFiles()
        {
            string tempRoot = Path.Combine(Path.GetTempPath(), $"greybox-engine-package-{Guid.NewGuid():N}");
            string zipPath = Path.Combine(tempRoot, "package.zip");
            string extractRoot = Path.Combine(tempRoot, "Assets", "GreyboxGenerated", "EnginePackage");
            Directory.CreateDirectory(tempRoot);
            try
            {
                using (var stream = File.Create(zipPath))
                using (var archive = new ZipArchive(stream, ZipArchiveMode.Create))
                {
                    const string runtimePath = "arena/unity/AGDSGameViewRuntime.cs";
                    const string runtimeSource = "public sealed class AGDSGameViewRuntime {}\n";
                    WriteEntry(archive, runtimePath, runtimeSource);
                    WriteEntry(archive, "GreyboxEnginePackageManifest.json", Manifest(runtimePath, runtimeSource));
                }

                int extracted = ExtractEnginePackageZip(zipPath, extractRoot);

                Assert.AreEqual(2, extracted);
                Assert.True(File.Exists(Path.Combine(extractRoot, "arena", "unity", "AGDSGameViewRuntime.cs")));
                Assert.True(File.Exists(Path.Combine(extractRoot, "GreyboxEnginePackageManifest.json")));
            }
            finally
            {
                if (Directory.Exists(tempRoot)) Directory.Delete(tempRoot, true);
            }
        }

        [Test]
        public void ExtractEnginePackageZipPrunesStaleFilesAfterValidation()
        {
            string tempRoot = Path.Combine(Path.GetTempPath(), $"greybox-engine-package-{Guid.NewGuid():N}");
            string zipPath = Path.Combine(tempRoot, "package.zip");
            string extractRoot = Path.Combine(tempRoot, "Assets", "GreyboxGenerated", "EnginePackage");
            string staleFile = Path.Combine(extractRoot, "old", "LegacyRuntime.cs");
            Directory.CreateDirectory(Path.GetDirectoryName(staleFile));
            File.WriteAllText(staleFile, "public sealed class LegacyRuntime {}\n");
            try
            {
                using (var stream = File.Create(zipPath))
                using (var archive = new ZipArchive(stream, ZipArchiveMode.Create))
                {
                    const string runtimePath = "arena/unity/AGDSGameViewRuntime.cs";
                    const string runtimeSource = "public sealed class AGDSGameViewRuntime {}\n";
                    WriteEntry(archive, runtimePath, runtimeSource);
                    WriteEntry(archive, "GreyboxEnginePackageManifest.json", Manifest(runtimePath, runtimeSource));
                }

                ExtractEnginePackageZip(zipPath, extractRoot);

                Assert.False(File.Exists(staleFile), "Successful engine package imports should replace stale generated runtime files.");
                Assert.True(File.Exists(Path.Combine(extractRoot, "arena", "unity", "AGDSGameViewRuntime.cs")));
            }
            finally
            {
                if (Directory.Exists(tempRoot)) Directory.Delete(tempRoot, true);
            }
        }

        [Test]
        public void ExtractEnginePackageZipStagesReplacementWithoutResidue()
        {
            string tempRoot = Path.Combine(Path.GetTempPath(), $"greybox-engine-package-{Guid.NewGuid():N}");
            string zipPath = Path.Combine(tempRoot, "package.zip");
            string extractRoot = Path.Combine(tempRoot, "Assets", "GreyboxGenerated", "EnginePackage");
            string existingFile = Path.Combine(extractRoot, "old", "LegacyRuntime.cs");
            Directory.CreateDirectory(Path.GetDirectoryName(existingFile));
            File.WriteAllText(existingFile, "public sealed class LegacyRuntime {}\n");
            try
            {
                using (var stream = File.Create(zipPath))
                using (var archive = new ZipArchive(stream, ZipArchiveMode.Create))
                {
                    const string runtimePath = "arena/unity/AGDSGameViewRuntime.cs";
                    const string runtimeSource = "public sealed class AGDSGameViewRuntime {}\n";
                    WriteEntry(archive, runtimePath, runtimeSource);
                    WriteEntry(archive, "GreyboxEnginePackageManifest.json", Manifest(runtimePath, runtimeSource));
                }

                ExtractEnginePackageZip(zipPath, extractRoot);

                string parent = Path.GetDirectoryName(extractRoot);
                Assert.False(File.Exists(existingFile), "Successful staged imports should replace stale generated runtime files.");
                Assert.True(File.Exists(Path.Combine(extractRoot, "arena", "unity", "AGDSGameViewRuntime.cs")));
                Assert.AreEqual(0, Directory.GetDirectories(parent, "EnginePackage.greybox-staging-*").Length);
                Assert.AreEqual(0, Directory.GetDirectories(parent, "EnginePackage.greybox-backup-*").Length);
            }
            finally
            {
                if (Directory.Exists(tempRoot)) Directory.Delete(tempRoot, true);
            }
        }

        [Test]
        public void ExtractEnginePackageZipKeepsExistingFilesWhenValidationFails()
        {
            string tempRoot = Path.Combine(Path.GetTempPath(), $"greybox-engine-package-{Guid.NewGuid():N}");
            string zipPath = Path.Combine(tempRoot, "package.zip");
            string extractRoot = Path.Combine(tempRoot, "Assets", "GreyboxGenerated", "EnginePackage");
            string existingFile = Path.Combine(extractRoot, "old", "LegacyRuntime.cs");
            Directory.CreateDirectory(Path.GetDirectoryName(existingFile));
            File.WriteAllText(existingFile, "public sealed class LegacyRuntime {}\n");
            try
            {
                using (var stream = File.Create(zipPath))
                using (var archive = new ZipArchive(stream, ZipArchiveMode.Create))
                {
                    const string runtimePath = "arena/unity/AGDSGameViewRuntime.cs";
                    WriteEntry(archive, runtimePath, "tampered runtime\n");
                    WriteEntry(archive, "GreyboxEnginePackageManifest.json", Manifest(runtimePath, "original runtime\n"));
                }

                Assert.Throws<InvalidDataException>(() => ExtractEnginePackageZip(zipPath, extractRoot));

                Assert.True(File.Exists(existingFile), "Failed package validation should not delete the previously generated runtime.");
                Assert.False(File.Exists(Path.Combine(extractRoot, "arena", "unity", "AGDSGameViewRuntime.cs")));
            }
            finally
            {
                if (Directory.Exists(tempRoot)) Directory.Delete(tempRoot, true);
            }
        }

        [Test]
        public void ExtractEnginePackageZipRejectsManifestHashMismatch()
        {
            string tempRoot = Path.Combine(Path.GetTempPath(), $"greybox-engine-package-{Guid.NewGuid():N}");
            string zipPath = Path.Combine(tempRoot, "package.zip");
            string extractRoot = Path.Combine(tempRoot, "Assets", "GreyboxGenerated", "EnginePackage");
            Directory.CreateDirectory(tempRoot);
            try
            {
                using (var stream = File.Create(zipPath))
                using (var archive = new ZipArchive(stream, ZipArchiveMode.Create))
                {
                    const string runtimePath = "arena/unity/AGDSGameViewRuntime.cs";
                    WriteEntry(archive, runtimePath, "tampered runtime\n");
                    WriteEntry(archive, "GreyboxEnginePackageManifest.json", Manifest(runtimePath, "original runtime\n"));
                }

                Assert.Throws<InvalidDataException>(() => ExtractEnginePackageZip(zipPath, extractRoot));
                Assert.False(File.Exists(Path.Combine(extractRoot, "arena", "unity", "AGDSGameViewRuntime.cs")));
            }
            finally
            {
                if (Directory.Exists(tempRoot)) Directory.Delete(tempRoot, true);
            }
        }

        [Test]
        public void ExtractEnginePackageZipRejectsBlockedExecutableEntriesBeforeReplacingExistingFiles()
        {
            string tempRoot = Path.Combine(Path.GetTempPath(), $"greybox-engine-package-{Guid.NewGuid():N}");
            string zipPath = Path.Combine(tempRoot, "package.zip");
            string extractRoot = Path.Combine(tempRoot, "Assets", "GreyboxGenerated", "EnginePackage");
            string existingFile = Path.Combine(extractRoot, "old", "LegacyRuntime.cs");
            Directory.CreateDirectory(Path.GetDirectoryName(existingFile));
            File.WriteAllText(existingFile, "public sealed class LegacyRuntime {}\n");
            try
            {
                using (var stream = File.Create(zipPath))
                using (var archive = new ZipArchive(stream, ZipArchiveMode.Create))
                {
                    const string runtimePath = "arena/native/malware.dll";
                    const string runtimeSource = "native payload\n";
                    WriteEntry(archive, runtimePath, runtimeSource);
                    WriteEntry(archive, "GreyboxEnginePackageManifest.json", Manifest(runtimePath, runtimeSource));
                }

                var error = Assert.Throws<InvalidDataException>(() => ExtractEnginePackageZip(zipPath, extractRoot));

                StringAssert.Contains("blocked executable/project extension", error.Message);
                Assert.True(File.Exists(existingFile), "Failed package validation should not delete the previously generated runtime.");
                Assert.False(File.Exists(Path.Combine(extractRoot, "arena", "native", "malware.dll")));
            }
            finally
            {
                if (Directory.Exists(tempRoot)) Directory.Delete(tempRoot, true);
            }
        }

        [Test]
        public void ExtractEnginePackageZipRejectsManifestByteMismatch()
        {
            string tempRoot = Path.Combine(Path.GetTempPath(), $"greybox-engine-package-{Guid.NewGuid():N}");
            string zipPath = Path.Combine(tempRoot, "package.zip");
            string extractRoot = Path.Combine(tempRoot, "Assets", "GreyboxGenerated", "EnginePackage");
            Directory.CreateDirectory(tempRoot);
            try
            {
                using (var stream = File.Create(zipPath))
                using (var archive = new ZipArchive(stream, ZipArchiveMode.Create))
                {
                    const string runtimePath = "arena/unity/AGDSGameViewRuntime.cs";
                    const string runtimeSource = "public sealed class AGDSGameViewRuntime {}\n";
                    WriteEntry(archive, runtimePath, runtimeSource);
                    WriteEntry(archive, "GreyboxEnginePackageManifest.json", Manifest(runtimePath, runtimeSource, Encoding.UTF8.GetByteCount(runtimeSource) + 10));
                }

                Assert.Throws<InvalidDataException>(() => ExtractEnginePackageZip(zipPath, extractRoot));
                Assert.False(File.Exists(Path.Combine(extractRoot, "arena", "unity", "AGDSGameViewRuntime.cs")));
            }
            finally
            {
                if (Directory.Exists(tempRoot)) Directory.Delete(tempRoot, true);
            }
        }

        [Test]
        public void ExtractEnginePackageZipRejectsStringlyManifestClaims()
        {
            const string runtimePath = "arena/unity/AGDSGameViewRuntime.cs";
            const string runtimeSource = "public sealed class AGDSGameViewRuntime {}\n";
            int runtimeBytes = Encoding.UTF8.GetByteCount(runtimeSource);
            string runtimeHash = Sha256(runtimeSource);
            string revisionHash = ContentRevisionForFile(runtimePath, runtimeSource);
            string validEntry = ManifestEntry(runtimePath, runtimeHash, runtimeBytes);

            AssertManifestRejected(runtimePath, runtimeSource, "{\"contentRevisionSha256\":123,\"files\":[" + validEntry + "]}", "JSON string");
            AssertManifestRejected(runtimePath, runtimeSource, "{\"contentRevisionSha256\":\"" + revisionHash + "\",\"files\":{}}", "JSON array");
            AssertManifestRejected(runtimePath, runtimeSource, "{\"contentRevisionSha256\":\"" + revisionHash + "\",\"files\":[\"runtime\"]}", "JSON object");
            AssertManifestRejected(runtimePath, runtimeSource, "{\"contentRevisionSha256\":\"" + revisionHash + "\",\"files\":[{\"path\":7,\"language\":\"csharp\",\"purpose\":\"test\",\"sha256\":\"" + runtimeHash + "\",\"bytes\":" + runtimeBytes + "}]}", "JSON string");
            AssertManifestRejected(runtimePath, runtimeSource, "{\"contentRevisionSha256\":\"" + revisionHash + "\",\"files\":[{\"path\":\"" + runtimePath + "\",\"language\":\"csharp\",\"purpose\":\"test\",\"sha256\":7,\"bytes\":" + runtimeBytes + "}]}", "JSON string");
            AssertManifestRejected(runtimePath, runtimeSource, "{\"contentRevisionSha256\":\"" + revisionHash + "\",\"files\":[{\"path\":\"" + runtimePath + "\",\"language\":7,\"purpose\":\"test\",\"sha256\":\"" + runtimeHash + "\",\"bytes\":" + runtimeBytes + "}]}", "JSON string");
            AssertManifestRejected(runtimePath, runtimeSource, "{\"contentRevisionSha256\":\"" + revisionHash + "\",\"files\":[{\"path\":\"" + runtimePath + "\",\"language\":\"csharp\",\"purpose\":\"test\",\"sha256\":\"" + runtimeHash + "\",\"bytes\":\"" + runtimeBytes + "\"}]}", "JSON integer");
        }

        [Test]
        public void ExtractEnginePackageZipRejectsUnsafeManifestLabels()
        {
            const string runtimePath = "arena/unity/AGDSGameViewRuntime.cs";
            const string runtimeSource = "public sealed class AGDSGameViewRuntime {}\n";

            AssertManifestRejected(
                runtimePath,
                runtimeSource,
                Manifest(runtimePath, runtimeSource, null, "csharp\nunsafe", "test"),
                "language contains control characters");

            AssertManifestRejected(
                runtimePath,
                runtimeSource,
                Manifest(runtimePath, runtimeSource, null, "csharp", new string('p', 81)),
                "purpose is too long");
        }

        [Test]
        public void ExtractEnginePackageZipRejectsDuplicateManifestPaths()
        {
            string tempRoot = Path.Combine(Path.GetTempPath(), $"greybox-engine-package-{Guid.NewGuid():N}");
            string zipPath = Path.Combine(tempRoot, "package.zip");
            string extractRoot = Path.Combine(tempRoot, "Assets", "GreyboxGenerated", "EnginePackage");
            Directory.CreateDirectory(tempRoot);
            try
            {
                using (var stream = File.Create(zipPath))
                using (var archive = new ZipArchive(stream, ZipArchiveMode.Create))
                {
                    const string runtimePath = "arena/unity/AGDSGameViewRuntime.cs";
                    const string runtimeSource = "public sealed class AGDSGameViewRuntime {}\n";
                    WriteEntry(archive, runtimePath, runtimeSource);
                    WriteEntry(archive, "GreyboxEnginePackageManifest.json", DuplicateManifest(runtimePath, runtimeSource));
                }

                Assert.Throws<InvalidDataException>(() => ExtractEnginePackageZip(zipPath, extractRoot));
                Assert.False(File.Exists(Path.Combine(extractRoot, "arena", "unity", "AGDSGameViewRuntime.cs")));
            }
            finally
            {
                if (Directory.Exists(tempRoot)) Directory.Delete(tempRoot, true);
            }
        }

        [Test]
        public void ExtractEnginePackageZipRejectsDuplicateArchiveEntries()
        {
            string tempRoot = Path.Combine(Path.GetTempPath(), $"greybox-engine-package-{Guid.NewGuid():N}");
            string zipPath = Path.Combine(tempRoot, "package.zip");
            string extractRoot = Path.Combine(tempRoot, "Assets", "GreyboxGenerated", "EnginePackage");
            Directory.CreateDirectory(tempRoot);
            try
            {
                using (var stream = File.Create(zipPath))
                using (var archive = new ZipArchive(stream, ZipArchiveMode.Create))
                {
                    const string runtimePath = "arena/unity/AGDSGameViewRuntime.cs";
                    const string runtimeSource = "public sealed class AGDSGameViewRuntime {}\n";
                    WriteEntry(archive, runtimePath, runtimeSource);
                    WriteEntry(archive, runtimePath, runtimeSource);
                    WriteEntry(archive, "GreyboxEnginePackageManifest.json", Manifest(runtimePath, runtimeSource));
                }

                Assert.Throws<InvalidDataException>(() => ExtractEnginePackageZip(zipPath, extractRoot));
                Assert.False(File.Exists(Path.Combine(extractRoot, "arena", "unity", "AGDSGameViewRuntime.cs")));
            }
            finally
            {
                if (Directory.Exists(tempRoot)) Directory.Delete(tempRoot, true);
            }
        }

        [Test]
        public void ExtractEnginePackageZipRejectsOversizedManifestBeforeReplacingExistingFiles()
        {
            string tempRoot = Path.Combine(Path.GetTempPath(), $"greybox-engine-package-{Guid.NewGuid():N}");
            string zipPath = Path.Combine(tempRoot, "package.zip");
            string extractRoot = Path.Combine(tempRoot, "Assets", "GreyboxGenerated", "EnginePackage");
            string existingFile = Path.Combine(extractRoot, "old", "LegacyRuntime.cs");
            Directory.CreateDirectory(Path.GetDirectoryName(existingFile));
            File.WriteAllText(existingFile, "public sealed class LegacyRuntime {}\n");
            try
            {
                using (var stream = File.Create(zipPath))
                using (var archive = new ZipArchive(stream, ZipArchiveMode.Create))
                {
                    WriteEntry(archive, "GreyboxEnginePackageManifest.json", new string('x', (int)PrivateLongConstant("MaxEnginePackageManifestBytes") + 1));
                }

                var error = Assert.Throws<InvalidDataException>(() => ExtractEnginePackageZip(zipPath, extractRoot));

                StringAssert.Contains("manifest exceeds the safety cap", error.Message);
                Assert.True(File.Exists(existingFile), "Failed package validation should not delete the previously generated runtime.");
            }
            finally
            {
                if (Directory.Exists(tempRoot)) Directory.Delete(tempRoot, true);
            }
        }

        [Test]
        public void ExtractEnginePackageZipRejectsTooManyArchiveEntries()
        {
            string tempRoot = Path.Combine(Path.GetTempPath(), $"greybox-engine-package-{Guid.NewGuid():N}");
            string zipPath = Path.Combine(tempRoot, "package.zip");
            string extractRoot = Path.Combine(tempRoot, "Assets", "GreyboxGenerated", "EnginePackage");
            Directory.CreateDirectory(tempRoot);
            try
            {
                using (var stream = File.Create(zipPath))
                using (var archive = new ZipArchive(stream, ZipArchiveMode.Create))
                {
                    const string runtimePath = "arena/unity/AGDSGameViewRuntime.cs";
                    const string runtimeSource = "public sealed class AGDSGameViewRuntime {}\n";
                    WriteEntry(archive, runtimePath, runtimeSource);
                    WriteEntry(archive, "GreyboxEnginePackageManifest.json", Manifest(runtimePath, runtimeSource));
                    int maxEntries = PrivateIntConstant("MaxEnginePackageArchiveEntries");
                    for (int index = 0; index < maxEntries; index++)
                    {
                        archive.CreateEntry($"noise/{index}/");
                    }
                }

                var error = Assert.Throws<InvalidDataException>(() => ExtractEnginePackageZip(zipPath, extractRoot));

                StringAssert.Contains("too many archive entries", error.Message);
                Assert.False(File.Exists(Path.Combine(extractRoot, "arena", "unity", "AGDSGameViewRuntime.cs")));
            }
            finally
            {
                if (Directory.Exists(tempRoot)) Directory.Delete(tempRoot, true);
            }
        }

        [Test]
        public void ExtractEnginePackageZipRejectsTooManyManifestFiles()
        {
            string tempRoot = Path.Combine(Path.GetTempPath(), $"greybox-engine-package-{Guid.NewGuid():N}");
            string zipPath = Path.Combine(tempRoot, "package.zip");
            string extractRoot = Path.Combine(tempRoot, "Assets", "GreyboxGenerated", "EnginePackage");
            Directory.CreateDirectory(tempRoot);
            try
            {
                using (var stream = File.Create(zipPath))
                using (var archive = new ZipArchive(stream, ZipArchiveMode.Create))
                {
                    WriteEntry(archive, "GreyboxEnginePackageManifest.json", ManifestWithFileCount(PrivateIntConstant("MaxEnginePackageManifestFiles") + 1));
                }

                var error = Assert.Throws<InvalidDataException>(() => ExtractEnginePackageZip(zipPath, extractRoot));

                StringAssert.Contains("too many runtime files", error.Message);
            }
            finally
            {
                if (Directory.Exists(tempRoot)) Directory.Delete(tempRoot, true);
            }
        }

        private static void WriteEntry(ZipArchive archive, string path, string content)
        {
            var entry = archive.CreateEntry(path);
            using var writer = new StreamWriter(entry.Open());
            writer.Write(content);
        }

        private static byte[] EnginePackageZip(string runtimePath, string content)
        {
            return EnginePackageZipWithManifest(runtimePath, content, Manifest(runtimePath, content));
        }

        private static byte[] EnginePackageZipWithManifest(string runtimePath, string content, string manifest)
        {
            using var stream = new MemoryStream();
            using (var archive = new ZipArchive(stream, ZipArchiveMode.Create, true))
            {
                WriteEntry(archive, runtimePath, content);
                WriteEntry(archive, "GreyboxEnginePackageManifest.json", manifest);
            }
            return stream.ToArray();
        }

        private static string Manifest(
            string runtimePath,
            string content,
            int? bytes = null,
            string language = "csharp",
            string purpose = "test")
        {
            int byteCount = bytes ?? Encoding.UTF8.GetByteCount(content);
            return "{\"contentRevisionSha256\":\"" + ContentRevisionForFile(runtimePath, content, byteCount, language, purpose) + "\",\"files\":[{\"path\":\"" + runtimePath + "\",\"language\":\"" + JsonEscape(language) + "\",\"purpose\":\"" + JsonEscape(purpose) + "\",\"sha256\":\"" + Sha256(content) + "\",\"bytes\":" + byteCount + "}]}";
        }

        private static string DuplicateManifest(string runtimePath, string content)
        {
            string entry = ManifestEntry(runtimePath, Sha256(content), Encoding.UTF8.GetByteCount(content));
            return "{\"contentRevisionSha256\":\"" + new string('0', 64) + "\",\"files\":[" + entry + "," + entry + "]}";
        }

        private static string ManifestEntry(string runtimePath, string sha256, int bytes)
        {
            return "{\"path\":\"" + runtimePath + "\",\"language\":\"csharp\",\"purpose\":\"test\",\"sha256\":\"" + sha256 + "\",\"bytes\":" + bytes + "}";
        }

        private static void AssertManifestRejected(string runtimePath, string runtimeSource, string manifest, string expectedMessage)
        {
            byte[] zipBytes = EnginePackageZipWithManifest(runtimePath, runtimeSource, manifest);
            var error = Assert.Throws<InvalidDataException>(() => VerifiedEnginePackageZipBytes(zipBytes, null));
            StringAssert.Contains(expectedMessage, error.Message);
        }

        private static string ManifestWithFileCount(int count)
        {
            string hash = new string('0', 64);
            var builder = new StringBuilder("{\"files\":[");
            for (int index = 0; index < count; index++)
            {
                if (index > 0) builder.Append(",");
                builder.Append("{\"path\":\"arena/unity/runtime");
                builder.Append(index);
                builder.Append(".cs\",\"language\":\"csharp\",\"purpose\":\"test\",\"sha256\":\"");
                builder.Append(hash);
                builder.Append("\",\"bytes\":0}");
            }
            builder.Append("]}");
            return builder.ToString();
        }

        private static string ContentRevisionForFile(
            string runtimePath,
            string content,
            int? bytes = null,
            string language = "csharp",
            string purpose = "test")
        {
            string revisionInput = runtimePath
                + "\0" + (language ?? "").Trim() + "\0" + (purpose ?? "").Trim() + "\0"
                + Sha256(content)
                + "\0"
                + (bytes ?? Encoding.UTF8.GetByteCount(content))
                + "\n";
            return Sha256(revisionInput);
        }

        private static string JsonEscape(string value)
        {
            return (value ?? "")
                .Replace("\\", "\\\\")
                .Replace("\"", "\\\"")
                .Replace("\n", "\\n")
                .Replace("\r", "\\r")
                .Replace("\t", "\\t");
        }

        private static byte[] UnityPackageGzip(string pathname)
        {
            using var memory = new MemoryStream();
            using (var gzip = new GZipStream(memory, CompressionMode.Compress, true))
            using (var tar = new MemoryStream())
            {
                WriteTarEntry(tar, "0123456789abcdef0123456789abcdef/asset", "greybox asset\n");
                WriteTarEntry(tar, "0123456789abcdef0123456789abcdef/asset.meta", "fileFormatVersion: 2\n");
                if (pathname != null)
                {
                    WriteTarEntry(tar, "0123456789abcdef0123456789abcdef/pathname", pathname);
                }
                tar.Write(new byte[1024], 0, 1024);
                byte[] tarBytes = tar.ToArray();
                gzip.Write(tarBytes, 0, tarBytes.Length);
            }
            return memory.ToArray();
        }

        private static void WriteTarEntry(MemoryStream tar, string path, string content)
        {
            byte[] contentBytes = Encoding.UTF8.GetBytes(content);
            var header = new byte[512];
            WriteAscii(header, 0, 100, path);
            WriteAscii(header, 100, 8, "0000644");
            WriteAscii(header, 108, 8, "0000000");
            WriteAscii(header, 116, 8, "0000000");
            WriteOctal(header, 124, 12, contentBytes.Length);
            WriteAscii(header, 136, 12, "00000000000");
            for (int index = 148; index < 156; index++) header[index] = 0x20;
            header[156] = (byte)'0';
            WriteAscii(header, 257, 6, "ustar");
            WriteAscii(header, 263, 2, "00");
            int checksum = 0;
            foreach (byte b in header) checksum += b;
            WriteOctal(header, 148, 8, checksum);
            tar.Write(header, 0, header.Length);
            tar.Write(contentBytes, 0, contentBytes.Length);
            int padding = (512 - (contentBytes.Length % 512)) % 512;
            if (padding > 0) tar.Write(new byte[padding], 0, padding);
        }

        private static void WriteAscii(byte[] target, int offset, int count, string value)
        {
            byte[] bytes = Encoding.ASCII.GetBytes(value);
            Array.Copy(bytes, 0, target, offset, Math.Min(bytes.Length, count));
        }

        private static void WriteOctal(byte[] target, int offset, int count, long value)
        {
            string text = Convert.ToString(value, 8).PadLeft(count - 1, '0');
            WriteAscii(target, offset, count - 1, text);
            target[offset + count - 1] = 0;
        }

        private static string Sha256(string content)
        {
            using var sha = SHA256.Create();
            byte[] hash = sha.ComputeHash(Encoding.UTF8.GetBytes(content));
            var builder = new StringBuilder(hash.Length * 2);
            foreach (byte b in hash) builder.Append(b.ToString("x2"));
            return builder.ToString();
        }

        private static byte[] VerifiedDownloadBytes(byte[] data, long maxBytes, string label)
        {
            try
            {
                return (byte[])typeof(GreyboxPackageDownloader)
                    .GetMethod("VerifiedDownloadBytes", BindingFlags.Static | BindingFlags.NonPublic)
                    .Invoke(null, new object[] { data, maxBytes, label });
            }
            catch (TargetInvocationException error) when (error.InnerException != null)
            {
                throw error.InnerException;
            }
        }

        private static int PrivateIntConstant(string name)
        {
            return (int)typeof(GreyboxPackageDownloader)
                .GetField(name, BindingFlags.Static | BindingFlags.NonPublic)
                .GetValue(null);
        }

        private static long PrivateLongConstant(string name)
        {
            return (long)typeof(GreyboxPackageDownloader)
                .GetField(name, BindingFlags.Static | BindingFlags.NonPublic)
                .GetValue(null);
        }

        private static byte[] VerifiedUnityPackageBytes(byte[] data)
        {
            try
            {
                return (byte[])typeof(GreyboxPackageDownloader)
                    .GetMethod("VerifiedUnityPackageBytes", BindingFlags.Static | BindingFlags.NonPublic)
                    .Invoke(null, new object[] { data });
            }
            catch (TargetInvocationException error) when (error.InnerException != null)
            {
                throw error.InnerException;
            }
        }

        private static byte[] VerifiedEnginePackageZipBytes(byte[] data, GreyboxEnginePackagePreflight preflight)
        {
            try
            {
                return (byte[])typeof(GreyboxPackageDownloader)
                    .GetMethod("VerifiedEnginePackageZipBytes", BindingFlags.Static | BindingFlags.NonPublic)
                    .Invoke(null, new object[] { data, preflight });
            }
            catch (TargetInvocationException error) when (error.InnerException != null)
            {
                throw error.InnerException;
            }
        }

        private static string SafeEnginePackageEntryPath(string rootFullPath, string entryName)
        {
            try
            {
                return (string)typeof(GreyboxPackageDownloader)
                    .GetMethod("SafeEnginePackageEntryPath", BindingFlags.Static | BindingFlags.NonPublic)
                    .Invoke(null, new object[] { rootFullPath, entryName });
            }
            catch (TargetInvocationException error) when (error.InnerException != null)
            {
                throw error.InnerException;
            }
        }

        private static string SafeFileName(string value)
        {
            try
            {
                return (string)typeof(GreyboxPackageDownloader)
                    .GetMethod("SafeFileName", BindingFlags.Static | BindingFlags.NonPublic)
                    .Invoke(null, new object[] { value });
            }
            catch (TargetInvocationException error) when (error.InnerException != null)
            {
                throw error.InnerException;
            }
        }

        private static int ExtractEnginePackageZip(string zipPath, string assetRoot)
        {
            try
            {
                return (int)typeof(GreyboxPackageDownloader)
                    .GetMethod("ExtractEnginePackageZip", BindingFlags.Static | BindingFlags.NonPublic)
                    .Invoke(null, new object[] { zipPath, assetRoot });
            }
            catch (TargetInvocationException error) when (error.InnerException != null)
            {
                throw error.InnerException;
            }
        }

        private static void WriteBytesAtomically(string path, byte[] content, long maxBytes, string label)
        {
            try
            {
                typeof(GreyboxPackageDownloader)
                    .GetMethod("WriteBytesAtomically", BindingFlags.Static | BindingFlags.NonPublic)
                    .Invoke(null, new object[] { path, content, maxBytes, label });
            }
            catch (TargetInvocationException error) when (error.InnerException != null)
            {
                throw error.InnerException;
            }
        }

        private static void AssertNoAtomicTempFiles(string path)
        {
            string directory = Path.GetDirectoryName(path);
            string pattern = Path.GetFileName(path) + ".greybox-tmp-*";
            Assert.AreEqual(0, Directory.GetFiles(directory, pattern).Length);
        }
    }
}
