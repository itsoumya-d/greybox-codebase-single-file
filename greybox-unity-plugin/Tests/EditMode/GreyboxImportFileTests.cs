// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System.IO;
using Greybox.Editor.Importers;
using NUnit.Framework;

namespace Greybox.Tests.EditMode
{
    public sealed class GreyboxImportFileTests
    {
        [Test]
        public void TryReadTextReturnsFileContentUnderByteLimit()
        {
            string path = Path.GetTempFileName();
            try
            {
                File.WriteAllText(path, "{\"title\":\"Arena\"}");

                bool read = GreyboxImportFile.TryReadText(path, 1024, "Game Viewport", out string content, out string error);

                Assert.True(read);
                Assert.AreEqual("{\"title\":\"Arena\"}", content);
                Assert.AreEqual("", error);
            }
            finally
            {
                if (File.Exists(path)) File.Delete(path);
            }
        }

        [Test]
        public void TryReadTextRejectsOversizedFilesBeforeImport()
        {
            string path = Path.GetTempFileName();
            try
            {
                File.WriteAllText(path, "12345");

                bool read = GreyboxImportFile.TryReadText(path, 4, "HUD", out string content, out string error);

                Assert.False(read);
                Assert.AreEqual("", content);
                StringAssert.Contains("byte safety limit before import", error);
            }
            finally
            {
                if (File.Exists(path)) File.Delete(path);
            }
        }

        [Test]
        public void TryReadTextReportsMissingFilesWithoutThrowing()
        {
            string path = Path.Combine(Path.GetTempPath(), "greybox-missing-" + System.Guid.NewGuid().ToString("N") + ".gameview");

            bool read = GreyboxImportFile.TryReadText(path, 1024, "Game Viewport", out string content, out string error);

            Assert.False(read);
            Assert.AreEqual("", content);
            StringAssert.Contains("file does not exist", error);
        }

        [Test]
        public void TryWriteTextAtomicallyCreatesAndReplacesWithoutTempResidue()
        {
            string root = Path.Combine(Path.GetTempPath(), "greybox-import-write-" + System.Guid.NewGuid().ToString("N"));
            try
            {
                string path = Path.Combine(root, "arena.gameview");

                Assert.True(GreyboxImportFile.TryWriteTextAtomically(path, "{\"title\":\"Fresh\"}", 1024, "Game Viewport", out string createError));
                Assert.AreEqual("", createError);
                Assert.AreEqual("{\"title\":\"Fresh\"}", File.ReadAllText(path));

                Assert.True(GreyboxImportFile.TryWriteTextAtomically(path, "{\"title\":\"New\"}", 1024, "Game Viewport", out string replaceError));
                Assert.AreEqual("", replaceError);
                Assert.AreEqual("{\"title\":\"New\"}", File.ReadAllText(path));
                Assert.AreEqual(0, Directory.GetFiles(root, "*.greybox-tmp-*").Length);
            }
            finally
            {
                if (Directory.Exists(root)) Directory.Delete(root, true);
            }
        }

        [Test]
        public void TryWriteTextAtomicallyRejectsOversizedContentBeforeReplacing()
        {
            string root = Path.Combine(Path.GetTempPath(), "greybox-import-write-cap-" + System.Guid.NewGuid().ToString("N"));
            try
            {
                Directory.CreateDirectory(root);
                string path = Path.Combine(root, "arena.gameview");
                File.WriteAllText(path, "safe");

                bool written = GreyboxImportFile.TryWriteTextAtomically(path, "12345", 4, "Game Viewport", out string error);

                Assert.False(written);
                StringAssert.Contains("byte safety limit before import", error);
                Assert.AreEqual("safe", File.ReadAllText(path));
                Assert.AreEqual(0, Directory.GetFiles(root, "*.greybox-tmp-*").Length);
            }
            finally
            {
                if (Directory.Exists(root)) Directory.Delete(root, true);
            }
        }
    }
}
