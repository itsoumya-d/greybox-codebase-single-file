// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.PackageManager;
using UnityEngine;

namespace Greybox.Editor.Export
{
    public static class GreyboxAssetStorePackageExporter
    {
        public const string PackageName = "com.greybox.studio";
        public const string StagingRoot = "Assets/GreyboxStudio";
        public const string DefaultOutputPath = "dist/com.greybox.studio.unitypackage";
        public const string OutputArgument = "-greyboxAssetStorePackageOutput";
        public const string OutputEnvironmentVariable = "GREYBOX_ASSET_STORE_PACKAGE_OUTPUT";

        private static readonly HashSet<string> BlockedSegments = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            ".git",
            ".github",
            ".idea",
            ".vs",
            "Build",
            "Builds",
            "dist",
            "Library",
            "Logs",
            "node_modules",
            "Obj",
            "Temp",
            "Tests",
            "UserSettings",
            "Validation~"
        };

        private static readonly HashSet<string> BlockedExtensions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            ".app",
            ".csproj",
            ".dll",
            ".dmg",
            ".exe",
            ".log",
            ".sln",
            ".tgz",
            ".unitypackage",
            ".user",
            ".zip"
        };

        [MenuItem("Greybox/Export Asset Store .unitypackage")]
        public static void ExportFromMenu()
        {
            string outputPath = ExportToUnityPackage();
            EditorUtility.RevealInFinder(outputPath);
        }

        public static void ExportFromCommandLine()
        {
            try
            {
                ExportToUnityPackage();
            }
            catch (Exception error)
            {
                Debug.LogError($"Greybox Asset Store export failed: {error.Message}");
                EditorApplication.Exit(1);
                throw;
            }
        }

        public static string ExportToUnityPackage(string outputPath = null)
        {
            PackageInfo package = PackageInfo.FindForPackageName(PackageName);
            if (package == null || string.IsNullOrWhiteSpace(package.resolvedPath))
            {
                throw new InvalidOperationException($"Install {PackageName} in this Unity project before exporting the Asset Store package.");
            }

            string resolvedOutput = ResolveOutputPath(outputPath);
            string stageRoot = StagePackage(package.resolvedPath);
            AssetDatabase.ExportPackage(stageRoot, resolvedOutput, ExportPackageOptions.Recurse);

            if (!File.Exists(resolvedOutput))
            {
                throw new IOException($"Unity did not create the Asset Store package at {resolvedOutput}.");
            }

            Debug.Log($"Greybox Asset Store .unitypackage exported: {resolvedOutput}");
            return resolvedOutput;
        }

        internal static string ResolveOutputPath(string explicitOutput = null)
        {
            string output = explicitOutput;
            if (string.IsNullOrWhiteSpace(output)) output = Environment.GetEnvironmentVariable(OutputEnvironmentVariable);
            if (string.IsNullOrWhiteSpace(output)) output = CommandLineValue(OutputArgument);
            if (string.IsNullOrWhiteSpace(output)) output = DefaultOutputPath;
            string resolved = Path.GetFullPath(output);
            Directory.CreateDirectory(Path.GetDirectoryName(resolved) ?? Directory.GetCurrentDirectory());
            return resolved;
        }

        private static string StagePackage(string packageRoot)
        {
            ClearStagingRoot();
            Directory.CreateDirectory(StagingRoot);
            foreach (string file in EnumeratePackageFiles(packageRoot, packageRoot))
            {
                string relativePath = NormalizePath(Path.GetRelativePath(packageRoot, file));
                string targetRelativePath = AssetStoreRelativePath(relativePath);
                string targetPath = Path.Combine(StagingRoot, targetRelativePath);
                Directory.CreateDirectory(Path.GetDirectoryName(targetPath) ?? StagingRoot);
                File.Copy(file, targetPath, true);
            }

            AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport | ImportAssetOptions.ForceUpdate);
            return StagingRoot;
        }

        private static IEnumerable<string> EnumeratePackageFiles(string root, string directory)
        {
            foreach (string file in Directory.GetFiles(directory))
            {
                string relativePath = NormalizePath(Path.GetRelativePath(root, file));
                if (ShouldCopyFile(relativePath)) yield return file;
            }

            foreach (string child in Directory.GetDirectories(directory))
            {
                string relativePath = NormalizePath(Path.GetRelativePath(root, child));
                if (!ShouldDescendDirectory(relativePath)) continue;
                foreach (string file in EnumeratePackageFiles(root, child)) yield return file;
            }
        }

        private static void ClearStagingRoot()
        {
            if (AssetDatabase.IsValidFolder(StagingRoot)) AssetDatabase.DeleteAsset(StagingRoot);
            if (Directory.Exists(StagingRoot)) FileUtil.DeleteFileOrDirectory(StagingRoot);
            if (File.Exists($"{StagingRoot}.meta")) FileUtil.DeleteFileOrDirectory($"{StagingRoot}.meta");
            AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport | ImportAssetOptions.ForceUpdate);
        }

        private static bool ShouldCopyFile(string relativePath)
        {
            if (string.IsNullOrWhiteSpace(relativePath) || relativePath.StartsWith("../", StringComparison.Ordinal)) return false;
            string[] segments = relativePath.Split('/');
            foreach (string segment in segments)
            {
                if (BlockedSegments.Contains(segment)) return false;
                if (segment.StartsWith(".", StringComparison.Ordinal) && segment != ".npmignore") return false;
            }

            return !BlockedExtensions.Contains(Path.GetExtension(relativePath));
        }

        private static bool ShouldDescendDirectory(string relativePath)
        {
            if (string.IsNullOrWhiteSpace(relativePath) || relativePath.StartsWith("../", StringComparison.Ordinal)) return false;
            string[] segments = relativePath.Split('/');
            foreach (string segment in segments)
            {
                if (BlockedSegments.Contains(segment)) return false;
                if (segment.StartsWith(".", StringComparison.Ordinal)) return false;
            }

            return true;
        }

        private static string AssetStoreRelativePath(string relativePath)
        {
            string normalized = NormalizePath(relativePath);
            if (normalized.StartsWith("Samples~/", StringComparison.Ordinal)) return $"Samples/{normalized.Substring("Samples~/".Length)}";
            if (normalized.StartsWith("Documentation~/", StringComparison.Ordinal)) return $"Documentation/{normalized.Substring("Documentation~/".Length)}";
            return normalized;
        }

        private static string CommandLineValue(string argumentName)
        {
            string[] args = Environment.GetCommandLineArgs();
            for (int index = 0; index < args.Length - 1; index++)
            {
                if (string.Equals(args[index], argumentName, StringComparison.Ordinal)) return args[index + 1];
            }

            return "";
        }

        private static string NormalizePath(string path)
        {
            return (path ?? "").Replace('\\', '/').TrimStart('/');
        }
    }
}
