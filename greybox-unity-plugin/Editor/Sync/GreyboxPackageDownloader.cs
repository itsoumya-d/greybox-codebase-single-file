// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using Greybox.Runtime;
using Greybox.Editor.Windows;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;
using UnityEngine.Networking;

namespace Greybox.Editor.Sync
{
    public static class GreyboxPackageDownloader
    {
        private const string EnginePackageImportRoot = "Assets/GreyboxGenerated/EnginePackage";
        private const int MaxUnityPackageBytes = 256 * 1024 * 1024;
        private const int MaxEnginePackageZipBytes = 512 * 1024 * 1024;
        private const int TarBlockBytes = 512;
        private const int MaxUnityPackagePathnameBytes = 4096;
        private const long MaxUnityPackageTarScanBytes = 512L * 1024L * 1024L;
        private const int MaxUnityPackageDownloadMs = 120000;
        private const int MaxEnginePackageDownloadMs = 180000;
        private const int PackageDownloadPollMs = 50;
        private const long MaxEnginePackageEntryBytes = 128L * 1024L * 1024L;
        private const long MaxEnginePackageManifestBytes = 1024L * 1024L;
        private const int MaxEnginePackagePathChars = 512;
        private const int MaxEnginePackagePathPartChars = 160;
        private const int MaxEnginePackageArchiveEntries = 2048;
        private const int MaxEnginePackageManifestFiles = 2048;
        private const int MaxEnginePackageManifestLabelChars = 80;
        private const int MaxEnginePackageFileNameChars = 160;

        private static readonly HashSet<string> BlockedEnginePackageFileExtensions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            ".bat",
            ".cmd",
            ".csproj",
            ".dll",
            ".dylib",
            ".exe",
            ".ps1",
            ".sh",
            ".sln",
            ".so",
            ".unitypackage",
        };

        public static async void DownloadUnityPackage(GreyboxConfig config)
        {
            if (!GreyboxLicenseState.TryAuthorizeImport(out _, out string importMessage))
            {
                EditorUtility.DisplayDialog("Greybox", importMessage, "OK");
                Debug.LogWarning(importMessage);
                return;
            }
            if (!GreyboxProjectEntitlements.RegisterCurrentProject(config, out string accessMessage))
            {
                EditorUtility.DisplayDialog("Greybox", accessMessage, "OK");
                Debug.LogWarning(accessMessage);
                return;
            }
            string url = GreyboxDaemonUrlBuilder.BuildProjectRoute(config, "unity-package");
            if (string.IsNullOrWhiteSpace(url))
            {
                const string message = "Greybox Unity package download requires a safe daemon URL and project id.";
                EditorUtility.DisplayDialog("Greybox", message, "OK");
                Debug.LogWarning(message);
                return;
            }
            using var request = UnityWebRequest.Get(url);
            if (!await SendWithDownloadTimeoutAsync(request, MaxUnityPackageDownloadMs, "Unity package")) return;
            if (request.result != UnityWebRequest.Result.Success)
            {
                Debug.LogError(request.error);
                return;
            }
            try
            {
                string path = "Temp/greybox.unitypackage";
                WriteBytesAtomically(path, VerifiedUnityPackageBytes(request.downloadHandler.data), MaxUnityPackageBytes, "Greybox Unity package");
                AssetDatabase.ImportPackage(path, true);
            }
            catch (Exception error)
            {
                Debug.LogError($"Greybox Unity package import failed: {error.Message}");
                EditorUtility.DisplayDialog("Greybox", $"Unity package import failed: {error.Message}", "OK");
            }
        }

        public static async void DownloadUnityEnginePackage(GreyboxConfig config, GreyboxEnginePackagePreflight preflight)
        {
            if (!GreyboxLicenseState.TryAuthorizeImport(out _, out string importMessage))
            {
                EditorUtility.DisplayDialog("Greybox", importMessage, "OK");
                Debug.LogWarning(importMessage);
                return;
            }
            if (!GreyboxProjectEntitlements.RegisterCurrentProject(config, out string accessMessage))
            {
                EditorUtility.DisplayDialog("Greybox", accessMessage, "OK");
                Debug.LogWarning(accessMessage);
                return;
            }
            if (preflight == null || !preflight.Available)
            {
                EditorUtility.DisplayDialog("Greybox", "Run Check Unity Export before downloading the native engine package.", "OK");
                return;
            }

            string url = GreyboxDaemonUrlBuilder.BuildGameDeliverableRoute(config, "engine-package", "unity");
            if (string.IsNullOrWhiteSpace(url))
            {
                const string message = "Greybox Unity engine package download requires a safe daemon URL and project id.";
                EditorUtility.DisplayDialog("Greybox", message, "OK");
                Debug.LogWarning(message);
                return;
            }
            using var request = UnityWebRequest.Get(url);
            if (!await SendWithDownloadTimeoutAsync(request, MaxEnginePackageDownloadMs, "Unity engine package")) return;
            if (request.result != UnityWebRequest.Result.Success)
            {
                Debug.LogError(request.error);
                EditorUtility.DisplayDialog("Greybox", $"Unity engine package download failed: {request.error}", "OK");
                return;
            }

            string packageFileName = SafeFileName(string.IsNullOrWhiteSpace(preflight.PackageFileName)
                ? "greybox-unity-engine-package.zip"
                : preflight.PackageFileName);
            string zipPath = Path.Combine("Temp", packageFileName);
            try
            {
                WriteBytesAtomically(zipPath, VerifiedEnginePackageZipBytes(request.downloadHandler.data, preflight), MaxEnginePackageZipBytes, "Greybox Unity engine package");
                int extracted = ExtractEnginePackageZip(zipPath, EnginePackageImportRoot);
                AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport | ImportAssetOptions.ForceUpdate);
                EditorUtility.DisplayDialog(
                    "Greybox",
                    $"Imported {extracted} checksum-verified Unity engine package files into {EnginePackageImportRoot}.",
                    "OK");
            }
            catch (Exception error)
            {
                Debug.LogError($"Greybox Unity engine package extraction failed: {error.Message}");
                EditorUtility.DisplayDialog("Greybox", $"Unity engine package extraction failed: {error.Message}", "OK");
            }
        }

        private static async Task<bool> SendWithDownloadTimeoutAsync(UnityWebRequest request, int timeoutMs, string label)
        {
            if (request == null) return false;
            int safeTimeoutMs = Math.Max(1000, timeoutMs);
            request.timeout = Math.Max(1, (safeTimeoutMs + 999) / 1000);
            long startedAtMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var op = request.SendWebRequest();
            while (!op.isDone)
            {
                if (DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - startedAtMs > safeTimeoutMs)
                {
                    request.Abort();
                    string message = $"Greybox aborted {label} download after {safeTimeoutMs}ms.";
                    Debug.LogWarning(message);
                    EditorUtility.DisplayDialog("Greybox", message, "OK");
                    return false;
                }
                await Task.Delay(PackageDownloadPollMs);
            }
            return true;
        }

        internal static byte[] VerifiedUnityPackageBytes(byte[] data)
        {
            byte[] verified = VerifiedDownloadBytes(data, MaxUnityPackageBytes, "Greybox Unity package");
            if (!IsGzipUnityPackage(verified))
            {
                throw new InvalidDataException("Greybox Unity package download must be a gzip-compressed .unitypackage archive.");
            }
            ValidateUnityPackageTarStructure(verified);
            return verified;
        }

        internal static byte[] VerifiedEnginePackageZipBytes(byte[] data, GreyboxEnginePackagePreflight preflight)
        {
            byte[] verified = VerifiedDownloadBytes(data, MaxEnginePackageZipBytes, "Greybox Unity engine package");
            if (!IsZipArchive(verified))
            {
                throw new InvalidDataException("Greybox Unity engine package download must be a zip archive.");
            }
            if (preflight != null && preflight.SizeBytes > 0L && verified.LongLength != preflight.SizeBytes)
            {
                throw new InvalidDataException("Greybox Unity engine package download size did not match preflight sizeBytes.");
            }
            ValidateEnginePackageZipManifest(verified, preflight);
            return verified;
        }

        internal static byte[] VerifiedDownloadBytes(byte[] data, long maxBytes, string label)
        {
            if (data == null || data.Length == 0)
            {
                throw new InvalidDataException($"{label} download was empty.");
            }
            if (data.LongLength > maxBytes)
            {
                throw new InvalidDataException($"{label} download exceeded the {FormatBytes(maxBytes)} safety cap.");
            }
            return data;
        }

        private static bool IsGzipUnityPackage(byte[] data)
        {
            return data != null
                && data.Length >= 3
                && data[0] == 0x1f
                && data[1] == 0x8b
                && data[2] == 0x08;
        }

        private static bool IsZipArchive(byte[] data)
        {
            return data != null
                && data.Length >= 4
                && data[0] == 0x50
                && data[1] == 0x4b
                && data[2] == 0x03
                && data[3] == 0x04;
        }

        private static void ValidateUnityPackageTarStructure(byte[] data)
        {
            using var memory = new MemoryStream(data);
            using var gzip = new GZipStream(memory, CompressionMode.Decompress);
            var assetRoots = new HashSet<string>(StringComparer.Ordinal);
            var metaRoots = new HashSet<string>(StringComparer.Ordinal);
            var safePathnameRoots = new HashSet<string>(StringComparer.Ordinal);
            var header = new byte[TarBlockBytes];
            long scannedBytes = 0L;
            while (true)
            {
                if (!ReadExactBlock(gzip, header))
                {
                    throw new InvalidDataException("Greybox Unity package tar ended before the required Unity package entries.");
                }
                scannedBytes += TarBlockBytes;
                if (scannedBytes > MaxUnityPackageTarScanBytes)
                {
                    throw new InvalidDataException("Greybox Unity package tar exceeded the structure scan safety cap.");
                }
                if (IsZeroBlock(header)) break;

                string path = TarPath(header);
                long size = TarSize(header);
                bool readPathname = IsUnityPackageEntry(path, out string root, out string leaf)
                    && string.Equals(leaf, "pathname", StringComparison.Ordinal);
                if (readPathname)
                {
                    scannedBytes += ReadUnityPackagePathnamePayload(gzip, size, root, safePathnameRoots);
                }
                else
                {
                    NoteUnityPackagePath(path, assetRoots, metaRoots);
                    scannedBytes += SkipTarPayload(gzip, size);
                }
                if (HasCompleteUnityPackageRoot(assetRoots, metaRoots, safePathnameRoots)) return;
                if (scannedBytes > MaxUnityPackageTarScanBytes)
                {
                    throw new InvalidDataException("Greybox Unity package tar exceeded the structure scan safety cap.");
                }
            }
            throw new InvalidDataException("Greybox Unity package tar is missing matching asset, asset.meta, and safe pathname entries.");
        }

        private static bool ReadExactBlock(Stream stream, byte[] buffer)
        {
            int offset = 0;
            while (offset < buffer.Length)
            {
                int read = stream.Read(buffer, offset, buffer.Length - offset);
                if (read == 0)
                {
                    if (offset == 0) return false;
                    throw new InvalidDataException("Greybox Unity package tar has a partial header block.");
                }
                offset += read;
            }
            return true;
        }

        private static bool IsZeroBlock(byte[] block)
        {
            for (int index = 0; index < block.Length; index++)
            {
                if (block[index] != 0) return false;
            }
            return true;
        }

        private static string TarPath(byte[] header)
        {
            string name = TarString(header, 0, 100);
            string prefix = TarString(header, 345, 155);
            return string.IsNullOrWhiteSpace(prefix) ? name : $"{prefix}/{name}";
        }

        private static string TarString(byte[] header, int offset, int count)
        {
            int end = offset;
            int max = offset + count;
            while (end < max && header[end] != 0) end++;
            return Encoding.UTF8.GetString(header, offset, end - offset).Trim();
        }

        private static long TarSize(byte[] header)
        {
            string value = TarString(header, 124, 12).Trim();
            if (string.IsNullOrEmpty(value)) return 0L;
            long result = 0L;
            foreach (char c in value)
            {
                if (c < '0' || c > '7')
                {
                    throw new InvalidDataException("Greybox Unity package tar has an invalid octal size field.");
                }
                result = (result * 8L) + (c - '0');
            }
            return result;
        }

        private static bool IsUnityPackageEntry(string path, out string root, out string leaf)
        {
            root = "";
            leaf = "";
            int separator = string.IsNullOrWhiteSpace(path) ? -1 : path.IndexOf("/", StringComparison.Ordinal);
            if (separator <= 0) return false;
            root = path.Substring(0, separator);
            leaf = path.Substring(separator + 1);
            return IsUnityPackageRoot(root);
        }

        private static bool IsUnityPackageRoot(string root)
        {
            if (string.IsNullOrWhiteSpace(root) || root.Length != 32) return false;
            foreach (char c in root)
            {
                bool digit = c >= '0' && c <= '9';
                bool lowerHex = c >= 'a' && c <= 'f';
                if (!digit && !lowerHex) return false;
            }
            return true;
        }

        private static void NoteUnityPackagePath(
            string path,
            HashSet<string> assetRoots,
            HashSet<string> metaRoots)
        {
            if (!IsUnityPackageEntry(path, out string root, out string leaf)) return;
            if (string.Equals(leaf, "asset", StringComparison.Ordinal)) assetRoots.Add(root);
            else if (string.Equals(leaf, "asset.meta", StringComparison.Ordinal)) metaRoots.Add(root);
        }

        private static long ReadUnityPackagePathnamePayload(
            Stream stream,
            long size,
            string root,
            HashSet<string> safePathnameRoots)
        {
            if (size <= 0L || size > MaxUnityPackagePathnameBytes)
            {
                throw new InvalidDataException("Greybox Unity package pathname entry has an invalid size.");
            }
            byte[] content = ReadTarPayload(stream, size, out long consumed);
            string pathname = Encoding.UTF8.GetString(content).Trim();
            if (!IsSafeUnityPackagePathname(pathname))
            {
                throw new InvalidDataException("Greybox Unity package pathname must stay inside Assets/ without traversal.");
            }
            safePathnameRoots.Add(root);
            return consumed;
        }

        private static bool IsSafeUnityPackagePathname(string pathname)
        {
            if (string.IsNullOrWhiteSpace(pathname) || pathname.Contains("\0")) return false;
            string normalized = pathname.Replace('\\', '/').Trim();
            if (!normalized.StartsWith("Assets/", StringComparison.Ordinal)) return false;
            if (normalized.StartsWith("/", StringComparison.Ordinal) || normalized.Contains("://")) return false;
            if (normalized.Contains("//")) return false;
            foreach (char c in normalized)
            {
                if (char.IsControl(c)) return false;
            }
            foreach (string part in normalized.Split('/'))
            {
                if (string.IsNullOrWhiteSpace(part) || part == "." || part == "..") return false;
            }
            return true;
        }

        private static bool HasCompleteUnityPackageRoot(
            HashSet<string> assetRoots,
            HashSet<string> metaRoots,
            HashSet<string> pathnameRoots)
        {
            foreach (string root in assetRoots)
            {
                if (metaRoots.Contains(root) && pathnameRoots.Contains(root)) return true;
            }
            return false;
        }

        private static byte[] ReadTarPayload(Stream stream, long size, out long consumed)
        {
            if (size < 0L) throw new InvalidDataException("Greybox Unity package tar has a negative entry size.");
            if (size > int.MaxValue) throw new InvalidDataException("Greybox Unity package tar entry is too large to inspect.");
            byte[] content = new byte[(int)size];
            int offset = 0;
            while (offset < content.Length)
            {
                int read = stream.Read(content, offset, content.Length - offset);
                if (read == 0) throw new InvalidDataException("Greybox Unity package tar ended inside an entry payload.");
                offset += read;
            }
            long padding = (((size + TarBlockBytes - 1L) / TarBlockBytes) * TarBlockBytes) - size;
            SkipExact(stream, padding);
            consumed = size + padding;
            return content;
        }

        private static long SkipTarPayload(Stream stream, long size)
        {
            if (size < 0L) throw new InvalidDataException("Greybox Unity package tar has a negative entry size.");
            long rounded = ((size + TarBlockBytes - 1L) / TarBlockBytes) * TarBlockBytes;
            SkipExact(stream, rounded);
            return rounded;
        }

        private static void SkipExact(Stream stream, long bytes)
        {
            var buffer = new byte[8192];
            long remaining = bytes;
            while (remaining > 0L)
            {
                int requested = (int)Math.Min(buffer.Length, remaining);
                int read = stream.Read(buffer, 0, requested);
                if (read == 0) throw new InvalidDataException("Greybox Unity package tar ended inside an entry payload.");
                remaining -= read;
            }
        }

        private static string FormatBytes(long bytes)
        {
            if (bytes < 1024L) return $"{bytes} B";
            double kib = bytes / 1024d;
            if (kib < 1024d) return $"{kib:0.#} KB";
            return $"{kib / 1024d:0.#} MB";
        }

        internal static int ExtractEnginePackageZip(string zipPath, string assetRoot)
        {
            string rootFullPath = Path.GetFullPath(assetRoot);
            using var stream = File.OpenRead(zipPath);
            using var archive = new ZipArchive(stream, ZipArchiveMode.Read);
            var manifestEntries = ManifestEntriesByPath(archive, out _);
            var verifiedPaths = new HashSet<string>(StringComparer.Ordinal);
            var seenArchivePaths = new HashSet<string>(StringComparer.Ordinal);
            var pendingWrites = new List<(string DestinationPath, byte[] Content)>();
            int archiveEntryCount = 0;
            foreach (var entry in archive.Entries)
            {
                archiveEntryCount++;
                if (archiveEntryCount > MaxEnginePackageArchiveEntries)
                {
                    throw new InvalidDataException("Greybox engine package contains too many archive entries.");
                }
                if (string.IsNullOrWhiteSpace(entry.Name)) continue;
                string relativePath = SafeEnginePackageRelativePath(entry.FullName);
                if (!seenArchivePaths.Add(relativePath))
                {
                    throw new InvalidDataException($"Greybox engine package contains a duplicate archive entry: {relativePath}.");
                }
                string destinationPath = SafeEnginePackageEntryPath(rootFullPath, entry.FullName);
                bool isManifest = string.Equals(relativePath, "GreyboxEnginePackageManifest.json", StringComparison.Ordinal);
                long maxEntryBytes = isManifest ? MaxEnginePackageManifestBytes : MaxEnginePackageEntryBytes;
                EnginePackageManifestEntry manifestEntry = default;
                if (!isManifest)
                {
                    if (!manifestEntries.TryGetValue(relativePath, out manifestEntry))
                    {
                        throw new InvalidDataException($"Greybox engine package entry is not listed in the manifest: {relativePath}.");
                    }
                    if (manifestEntry.Bytes >= 0 && entry.Length != manifestEntry.Bytes)
                    {
                        throw new InvalidDataException($"Greybox engine package byte count mismatch for {relativePath}.");
                    }
                }

                byte[] content = ReadZipEntryBytes(entry, maxEntryBytes, relativePath);
                if (!isManifest)
                {
                    string actualSha256 = Sha256Hex(content);
                    if (!string.Equals(actualSha256, manifestEntry.Sha256, StringComparison.Ordinal))
                    {
                        throw new InvalidDataException($"Greybox engine package SHA-256 mismatch for {relativePath}.");
                    }
                    verifiedPaths.Add(relativePath);
                }
                pendingWrites.Add((destinationPath, content));
            }
            if (verifiedPaths.Count != manifestEntries.Count)
            {
                throw new InvalidDataException("Greybox engine package did not extract every manifest-listed runtime file.");
            }
            return ReplaceEnginePackageImportRoot(rootFullPath, pendingWrites);
        }

        private static byte[] ReadZipEntryBytes(ZipArchiveEntry entry, long maxBytes, string relativePath)
        {
            if (entry == null) throw new InvalidDataException("Greybox engine package contains a missing zip entry.");
            if (entry.Length < 0 || entry.Length > maxBytes)
            {
                throw new InvalidDataException($"Greybox engine package entry exceeds the {FormatBytes(maxBytes)} safety cap: {relativePath}.");
            }
            using var entryStream = entry.Open();
            using var memory = new MemoryStream();
            var buffer = new byte[8192];
            while (true)
            {
                int read = entryStream.Read(buffer, 0, buffer.Length);
                if (read == 0) break;
                if (memory.Length + read > maxBytes)
                {
                    throw new InvalidDataException($"Greybox engine package entry exceeded the {FormatBytes(maxBytes)} safety cap while reading: {relativePath}.");
                }
                memory.Write(buffer, 0, read);
            }
            if (entry.Length >= 0 && memory.Length != entry.Length)
            {
                throw new InvalidDataException($"Greybox engine package entry byte count changed while reading: {relativePath}.");
            }
            return memory.ToArray();
        }

        private static int ReplaceEnginePackageImportRoot(string rootFullPath, List<(string DestinationPath, byte[] Content)> pendingWrites)
        {
            rootFullPath = Path.GetFullPath(rootFullPath);
            string parent = Path.GetDirectoryName(rootFullPath);
            if (string.IsNullOrWhiteSpace(parent))
            {
                throw new InvalidDataException("Greybox engine package import root must have a parent directory.");
            }
            Directory.CreateDirectory(parent);

            string rootName = Path.GetFileName(rootFullPath.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar));
            string stagingRoot = Path.Combine(parent, $"{rootName}.greybox-staging-{Guid.NewGuid():N}");
            string backupRoot = Path.Combine(parent, $"{rootName}.greybox-backup-{Guid.NewGuid():N}");
            int extracted = 0;
            bool committed = false;
            try
            {
                Directory.CreateDirectory(stagingRoot);
                foreach (var pendingWrite in pendingWrites)
                {
                    string stagedPath = StagedEnginePackageDestinationPath(rootFullPath, stagingRoot, pendingWrite.DestinationPath);
                    WriteBytesAtomically(stagedPath, pendingWrite.Content, MaxEnginePackageEntryBytes, "Greybox engine package entry");
                    extracted++;
                }

                bool movedExistingRoot = false;
                if (Directory.Exists(rootFullPath))
                {
                    Directory.Move(rootFullPath, backupRoot);
                    movedExistingRoot = true;
                }
                try
                {
                    Directory.Move(stagingRoot, rootFullPath);
                    committed = true;
                    if (movedExistingRoot) TryDeleteDirectory(backupRoot);
                }
                catch
                {
                    if (movedExistingRoot && !Directory.Exists(rootFullPath) && Directory.Exists(backupRoot))
                    {
                        Directory.Move(backupRoot, rootFullPath);
                    }
                    throw;
                }
                return extracted;
            }
            finally
            {
                if (!committed) TryDeleteDirectory(stagingRoot);
            }
        }

        private static string StagedEnginePackageDestinationPath(string rootFullPath, string stagingRoot, string destinationPath)
        {
            string relativePath = RelativeEnginePackageDestinationPath(rootFullPath, destinationPath);
            string stagedPath = Path.GetFullPath(Path.Combine(stagingRoot, relativePath));
            string stagingWithSeparator = stagingRoot.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;
            if (!stagedPath.StartsWith(stagingWithSeparator, StringComparison.Ordinal))
            {
                throw new InvalidDataException("Greybox engine package staged path escaped the import root.");
            }
            return stagedPath;
        }

        private static string RelativeEnginePackageDestinationPath(string rootFullPath, string destinationPath)
        {
            string fullDestinationPath = Path.GetFullPath(destinationPath);
            string rootWithSeparator = rootFullPath.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;
            if (!fullDestinationPath.StartsWith(rootWithSeparator, StringComparison.Ordinal))
            {
                throw new InvalidDataException("Greybox engine package pending write escaped the import root.");
            }
            return fullDestinationPath.Substring(rootWithSeparator.Length);
        }

        private static void WriteBytesAtomically(string path, byte[] content, long maxBytes, string label)
        {
            if (string.IsNullOrWhiteSpace(path))
            {
                throw new InvalidDataException($"{label} write path is empty.");
            }
            if (content == null)
            {
                throw new InvalidDataException($"{label} write content is empty.");
            }
            if (content.LongLength > maxBytes)
            {
                throw new InvalidDataException($"{label} write exceeded the {FormatBytes(maxBytes)} safety cap.");
            }

            string fullPath = Path.GetFullPath(path);
            string directory = Path.GetDirectoryName(fullPath);
            if (string.IsNullOrWhiteSpace(directory))
            {
                throw new InvalidDataException($"{label} write path must have a parent directory.");
            }
            Directory.CreateDirectory(directory);

            string tempPath = $"{fullPath}.greybox-tmp-{Guid.NewGuid():N}";
            try
            {
                File.WriteAllBytes(tempPath, content);
                if (File.Exists(fullPath))
                {
                    File.Replace(tempPath, fullPath, null);
                }
                else
                {
                    File.Move(tempPath, fullPath);
                }
            }
            catch
            {
                TryDeleteFile(tempPath);
                throw;
            }
        }

        private static void TryDeleteFile(string path)
        {
            try
            {
                if (File.Exists(path)) File.Delete(path);
            }
            catch
            {
                // Best-effort cleanup; callers fail closed and keep validated state untouched.
            }
        }

        private static void TryDeleteDirectory(string path)
        {
            try
            {
                if (Directory.Exists(path)) Directory.Delete(path, true);
            }
            catch
            {
                // Best-effort cleanup; stale staging folders are safer than deleting live imports.
            }
        }

        private static void ValidateEnginePackageZipManifest(byte[] data, GreyboxEnginePackagePreflight preflight)
        {
            using var memory = new MemoryStream(data);
            using var archive = new ZipArchive(memory, ZipArchiveMode.Read);
            var manifestEntries = ManifestEntriesByPath(archive, out string contentRevisionSha256);
            if (preflight != null && preflight.FileCount > 0 && manifestEntries.Count != preflight.FileCount)
            {
                throw new InvalidDataException("Greybox Unity engine package manifest file count did not match preflight fileCount.");
            }
            if (preflight != null
                && !string.IsNullOrWhiteSpace(preflight.ContentRevisionSha256)
                && !string.Equals(contentRevisionSha256, preflight.ContentRevisionSha256, StringComparison.Ordinal))
            {
                throw new InvalidDataException("Greybox Unity engine package download contentRevisionSha256 did not match preflight.");
            }
        }

        private static Dictionary<string, EnginePackageManifestEntry> ManifestEntriesByPath(ZipArchive archive, out string contentRevisionSha256)
        {
            var manifestEntry = archive.GetEntry("GreyboxEnginePackageManifest.json");
            if (manifestEntry == null)
            {
                throw new InvalidDataException("Greybox engine package is missing GreyboxEnginePackageManifest.json.");
            }
            if (manifestEntry.Length <= 0 || manifestEntry.Length > MaxEnginePackageManifestBytes)
            {
                throw new InvalidDataException("Greybox engine package manifest exceeds the safety cap.");
            }
            byte[] manifestBytes = ReadZipEntryBytes(manifestEntry, MaxEnginePackageManifestBytes, "GreyboxEnginePackageManifest.json");
            var manifest = JObject.Parse(Encoding.UTF8.GetString(manifestBytes));
            var files = OptionalArray(manifest, "files");
            if (files == null || files.Count == 0)
            {
                throw new InvalidDataException("Greybox engine package manifest does not list runtime files.");
            }
            contentRevisionSha256 = (OptionalString(manifest, "contentRevisionSha256") ?? "").ToLowerInvariant();
            if (!IsSha256Hex(contentRevisionSha256))
            {
                throw new InvalidDataException("Greybox engine package manifest has an invalid contentRevisionSha256.");
            }
            if (files.Count > MaxEnginePackageManifestFiles)
            {
                throw new InvalidDataException("Greybox engine package manifest lists too many runtime files.");
            }
            var hashes = new Dictionary<string, EnginePackageManifestEntry>(StringComparer.Ordinal);
            foreach (JToken fileToken in files)
            {
                var file = RequireObject(fileToken, "files");
                string path = OptionalString(file, "path") ?? "";
                string safePath = SafeEnginePackageRelativePath(path);
                string sha256 = (OptionalString(file, "sha256") ?? "").ToLowerInvariant();
                string language = SafeManifestLabel(OptionalString(file, "language"), "language", safePath);
                string purpose = SafeManifestLabel(OptionalString(file, "purpose"), "purpose", safePath);
                if (!IsSha256Hex(sha256))
                {
                    throw new InvalidDataException($"Greybox engine package manifest has an invalid SHA-256 for {safePath}.");
                }
                if (hashes.ContainsKey(safePath))
                {
                    throw new InvalidDataException($"Greybox engine package manifest lists a duplicate runtime file: {safePath}.");
                }
                long bytes = OptionalLong(file, "bytes") ?? -1L;
                if (bytes < -1L)
                {
                    throw new InvalidDataException($"Greybox engine package manifest has an invalid byte count for {safePath}.");
                }
                hashes[safePath] = new EnginePackageManifestEntry(sha256, bytes, language, purpose);
            }
            string actualContentRevisionSha256 = EnginePackageContentRevisionSha256(hashes);
            if (!string.Equals(actualContentRevisionSha256, contentRevisionSha256, StringComparison.Ordinal))
            {
                throw new InvalidDataException("Greybox engine package manifest contentRevisionSha256 did not match runtime files.");
            }
            return hashes;
        }

        private static JArray OptionalArray(JObject container, string key)
        {
            if (container == null || container[key] == null || container[key].Type == JTokenType.Null) return null;
            if (container[key].Type != JTokenType.Array)
            {
                throw new InvalidDataException($"Greybox engine package manifest {key} must be a JSON array.");
            }
            return container[key] as JArray;
        }

        private static JObject RequireObject(JToken token, string key)
        {
            if (token == null || token.Type != JTokenType.Object)
            {
                throw new InvalidDataException($"Greybox engine package manifest {key} entry must be a JSON object.");
            }
            return token as JObject;
        }

        private static string OptionalString(JObject container, string key)
        {
            if (container == null || container[key] == null || container[key].Type == JTokenType.Null) return null;
            if (container[key].Type != JTokenType.String)
            {
                throw new InvalidDataException($"Greybox engine package manifest {key} must be a JSON string.");
            }
            return container[key].Value<string>();
        }

        private static long? OptionalLong(JObject container, string key)
        {
            if (container == null || container[key] == null || container[key].Type == JTokenType.Null) return null;
            if (container[key].Type != JTokenType.Integer)
            {
                throw new InvalidDataException($"Greybox engine package manifest {key} must be a JSON integer.");
            }
            return container[key].Value<long>();
        }

        private static string SafeManifestLabel(string value, string key, string path)
        {
            string label = (value ?? "").Trim();
            if (label.Length > MaxEnginePackageManifestLabelChars)
            {
                throw new InvalidDataException($"Greybox engine package manifest {key} is too long for {path}.");
            }
            foreach (char c in label)
            {
                if (char.IsControl(c))
                {
                    throw new InvalidDataException($"Greybox engine package manifest {key} contains control characters for {path}.");
                }
            }
            return label;
        }

        private static string EnginePackageContentRevisionSha256(Dictionary<string, EnginePackageManifestEntry> entriesByPath)
        {
            var paths = new List<string>(entriesByPath.Keys);
            paths.Sort(StringComparer.Ordinal);
            var builder = new StringBuilder();
            foreach (string path in paths)
            {
                EnginePackageManifestEntry entry = entriesByPath[path];
                builder
                    .Append(path).Append('\0')
                    .Append(entry.Language).Append('\0')
                    .Append(entry.Purpose).Append('\0')
                    .Append(entry.Sha256).Append('\0')
                    .Append(entry.Bytes).Append('\n');
            }
            return Sha256Hex(Encoding.UTF8.GetBytes(builder.ToString()));
        }

        private static bool IsSha256Hex(string value)
        {
            if (string.IsNullOrWhiteSpace(value) || value.Length != 64) return false;
            foreach (char c in value)
            {
                bool digit = c >= '0' && c <= '9';
                bool lowerHex = c >= 'a' && c <= 'f';
                if (!digit && !lowerHex) return false;
            }
            return true;
        }

        private static string Sha256Hex(byte[] content)
        {
            using var sha = SHA256.Create();
            byte[] hash = sha.ComputeHash(content);
            var builder = new StringBuilder(hash.Length * 2);
            foreach (byte b in hash) builder.Append(b.ToString("x2"));
            return builder.ToString();
        }

        private static string SafeEnginePackageRelativePath(string entryName)
        {
            string normalized = (entryName ?? "").Trim().Replace('\\', '/');
            if (string.IsNullOrWhiteSpace(normalized)
                || normalized.Length > MaxEnginePackagePathChars
                || normalized.StartsWith("/", StringComparison.Ordinal)
                || normalized.Contains("\0")
                || normalized.Contains("://")
                || normalized.Contains("//")
                || normalized.Contains("../", StringComparison.Ordinal)
                || normalized.StartsWith("../", StringComparison.Ordinal))
            {
                throw new InvalidDataException($"Unsafe Greybox engine package entry: {entryName}");
            }
            var parts = normalized.Split(new[] { '/' }, StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length == 0)
            {
                throw new InvalidDataException($"Unsafe Greybox engine package entry: {entryName}");
            }
            foreach (string part in parts)
            {
                if (part == "." || part == ".." || part.Length > MaxEnginePackagePathPartChars || part.IndexOf(":", StringComparison.Ordinal) >= 0)
                {
                    throw new InvalidDataException($"Unsafe Greybox engine package entry: {entryName}");
                }
                foreach (char c in part)
                {
                    if (char.IsControl(c))
                    {
                        throw new InvalidDataException($"Unsafe Greybox engine package entry: {entryName}");
                    }
                }
            }
            if (HasBlockedEnginePackageExtension(parts[parts.Length - 1]))
            {
                throw new InvalidDataException(
                    $"Greybox engine package entry uses a blocked executable/project extension: {entryName}");
            }
            return string.Join("/", parts);
        }

        private static bool HasBlockedEnginePackageExtension(string fileName)
        {
            string normalized = (fileName ?? "").Trim();
            if (normalized.EndsWith(".meta", StringComparison.OrdinalIgnoreCase))
            {
                normalized = normalized.Substring(0, normalized.Length - ".meta".Length);
            }
            string extension = Path.GetExtension(normalized);
            return BlockedEnginePackageFileExtensions.Contains(extension);
        }

        internal static string SafeEnginePackageEntryPath(string rootFullPath, string entryName)
        {
            string normalized = SafeEnginePackageRelativePath(entryName);
            string destinationPath = Path.GetFullPath(Path.Combine(rootFullPath, normalized));
            string rootWithSeparator = rootFullPath.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;
            if (!destinationPath.StartsWith(rootWithSeparator, StringComparison.Ordinal))
            {
                throw new InvalidDataException($"Unsafe Greybox engine package entry: {entryName}");
            }
            return destinationPath;
        }

        private static string SafeFileName(string value)
        {
            string fileName = string.IsNullOrWhiteSpace(value) ? "greybox-unity-engine-package.zip" : value.Trim();
            if (fileName == "." || fileName == ".." || fileName.Length > MaxEnginePackageFileNameChars)
            {
                throw new InvalidDataException("Greybox Unity engine package file name must be a bounded file name.");
            }
            if (!fileName.EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidDataException("Greybox Unity engine package file name must be a .zip file.");
            }
            if (fileName.IndexOf("/", StringComparison.Ordinal) >= 0
                || fileName.IndexOf("\\", StringComparison.Ordinal) >= 0
                || fileName.IndexOf(":", StringComparison.Ordinal) >= 0
                || fileName.IndexOf("://", StringComparison.Ordinal) >= 0)
            {
                throw new InvalidDataException("Greybox Unity engine package file name must not contain path separators or URL markers.");
            }
            foreach (char c in fileName)
            {
                if (char.IsControl(c))
                {
                    throw new InvalidDataException("Greybox Unity engine package file name contains control characters.");
                }
            }
            return fileName;
        }

        private readonly struct EnginePackageManifestEntry
        {
            public EnginePackageManifestEntry(string sha256, long bytes, string language, string purpose)
            {
                Sha256 = sha256 ?? "";
                Bytes = bytes;
                Language = language ?? "";
                Purpose = purpose ?? "";
            }

            public string Sha256 { get; }
            public long Bytes { get; }
            public string Language { get; }
            public string Purpose { get; }
        }
    }
}
