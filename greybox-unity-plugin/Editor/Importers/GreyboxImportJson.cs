// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Greybox.Editor.Importers
{
    internal static class GreyboxImportJson
    {
        public const int MaxImportJsonLength = 16 * 1024 * 1024;
        public const int MaxImportJsonErrorLength = 240;

        public static bool TryParseObject(string json, string artifactLabel, out JObject document, out string error)
        {
            document = null;
            error = "";
            string label = string.IsNullOrWhiteSpace(artifactLabel) ? "artifact" : artifactLabel.Trim();
            if (string.IsNullOrWhiteSpace(json))
            {
                error = $"Greybox {label} import failed: file is empty.";
                return false;
            }
            if (json.Length > MaxImportJsonLength)
            {
                error = $"Greybox {label} import failed: file exceeds the {MaxImportJsonLength} character safety limit.";
                return false;
            }

            JToken token;
            try
            {
                token = JToken.Parse(json);
            }
            catch (JsonReaderException ex)
            {
                error = $"Greybox {label} import failed: expected a valid JSON object. {SafeImportError(ex.Message)}";
                return false;
            }

            document = token as JObject;
            if (document != null) return true;
            error = $"Greybox {label} import failed: root must be a JSON object.";
            return false;
        }

        public static JObject ParseObjectOrThrow(string json, string artifactLabel)
        {
            if (TryParseObject(json, artifactLabel, out JObject document, out string error)) return document;
            throw new System.ArgumentException(error);
        }

        private static string SafeImportError(string value)
        {
            var builder = new System.Text.StringBuilder();
            foreach (char c in value ?? "")
            {
                builder.Append(char.IsControl(c) ? ' ' : c);
                if (builder.Length >= MaxImportJsonErrorLength) break;
            }
            return builder.ToString().Trim();
        }
    }
}
