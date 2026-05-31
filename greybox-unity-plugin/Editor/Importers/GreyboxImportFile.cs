// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System.IO;
using System.Text;

namespace Greybox.Editor.Importers
{
    public static class GreyboxImportFile
    {
        private const int MaxImportFileErrorLength = 240;

        public static bool TryReadText(string assetPath, int maxBytes, string artifactLabel, out string content, out string error)
        {
            content = "";
            error = "";
            string label = string.IsNullOrWhiteSpace(artifactLabel) ? "artifact" : artifactLabel.Trim();
            if (string.IsNullOrWhiteSpace(assetPath))
            {
                error = $"Greybox {label} import failed: asset path is empty.";
                return false;
            }

            int safeMaxBytes = System.Math.Max(1, maxBytes);
            try
            {
                var info = new FileInfo(assetPath);
                if (!info.Exists)
                {
                    error = $"Greybox {label} import failed: file does not exist.";
                    return false;
                }
                if (info.Length > safeMaxBytes)
                {
                    error = $"Greybox {label} import failed: file exceeds the {safeMaxBytes} byte safety limit before import.";
                    return false;
                }

                content = File.ReadAllText(assetPath, Encoding.UTF8);
                return true;
            }
            catch (IOException ex)
            {
                error = $"Greybox {label} import failed: could not read file. {SafeImportFileError(ex.Message)}";
                return false;
            }
            catch (System.UnauthorizedAccessException ex)
            {
                error = $"Greybox {label} import failed: could not read file. {SafeImportFileError(ex.Message)}";
                return false;
            }
        }

        public static bool TryWriteTextAtomically(string assetPath, string content, int maxBytes, string artifactLabel, out string error)
        {
            error = "";
            string label = string.IsNullOrWhiteSpace(artifactLabel) ? "artifact" : artifactLabel.Trim();
            if (string.IsNullOrWhiteSpace(assetPath))
            {
                error = $"Greybox {label} write failed: asset path is empty.";
                return false;
            }
            if (content == null)
            {
                error = $"Greybox {label} write failed: content is empty.";
                return false;
            }

            int safeMaxBytes = System.Math.Max(1, maxBytes);
            if (Encoding.UTF8.GetByteCount(content) > safeMaxBytes)
            {
                error = $"Greybox {label} write failed: content exceeds the {safeMaxBytes} byte safety limit before import.";
                return false;
            }

            string normalized = assetPath.Trim().Replace('\\', '/');
            string directory = Path.GetDirectoryName(normalized);
            if (string.IsNullOrWhiteSpace(directory))
            {
                error = $"Greybox {label} write failed: asset directory is empty.";
                return false;
            }

            string tempPath = $"{normalized}.greybox-tmp-{System.Guid.NewGuid():N}";
            try
            {
                Directory.CreateDirectory(directory);
                File.WriteAllText(tempPath, content, Encoding.UTF8);
                if (File.Exists(normalized))
                {
                    File.Replace(tempPath, normalized, null);
                }
                else
                {
                    File.Move(tempPath, normalized);
                }
                return true;
            }
            catch (System.Exception ex)
            {
                TryDeleteTempFile(tempPath);
                error = $"Greybox {label} write failed: could not write file. {SafeImportFileError(ex.Message)}";
                return false;
            }
        }

        private static void TryDeleteTempFile(string tempPath)
        {
            try
            {
                if (File.Exists(tempPath)) File.Delete(tempPath);
            }
            catch
            {
                // Best-effort cleanup; the caller fails closed and leaves existing assets untouched.
            }
        }

        private static string SafeImportFileError(string value)
        {
            var builder = new StringBuilder();
            foreach (char c in value ?? "")
            {
                builder.Append(char.IsControl(c) ? ' ' : c);
                if (builder.Length >= MaxImportFileErrorLength) break;
            }
            return builder.ToString().Trim();
        }
    }
}
