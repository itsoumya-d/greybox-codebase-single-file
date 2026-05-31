// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System.Security.Cryptography;
using System.Text;

namespace Greybox.Editor.Importers
{
    internal static class GreyboxHash
    {
        public static string Sha256(string value)
        {
            using var sha = SHA256.Create();
            byte[] hash = sha.ComputeHash(Encoding.UTF8.GetBytes(value ?? ""));
            var builder = new StringBuilder(hash.Length * 2);
            foreach (byte b in hash) builder.Append(b.ToString("x2"));
            return builder.ToString();
        }
    }
}
