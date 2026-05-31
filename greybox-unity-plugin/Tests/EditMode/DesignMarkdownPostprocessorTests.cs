// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System;
using System.IO;
using System.Reflection;
using Greybox.Editor.Importers;
using NUnit.Framework;

namespace Greybox.Tests.EditMode
{
    public sealed class DesignMarkdownPostprocessorTests
    {
        [Test]
        public void OnlyTreatsExactDesignMarkdownAssetsAsArtBibles()
        {
            Assert.True(IsDesignMarkdownPath("Assets/DESIGN.md"));
            Assert.True(IsDesignMarkdownPath("Assets/World/DESIGN.md"));
            Assert.False(IsDesignMarkdownPath("Assets/README.md"));
            Assert.False(IsDesignMarkdownPath("Packages/com.greybox.studio/DESIGN.md"));
        }

        [Test]
        public void BuildsStableProxyDesignAssetPaths()
        {
            Assert.AreEqual("Assets/art-bible.design", ProxyDesignAssetPath("Assets/DESIGN.md"));
            Assert.AreEqual("Assets/World/World.design", ProxyDesignAssetPath("Assets/World/DESIGN.md"));
            Assert.AreEqual("Assets/World-Boss/World-Boss.design", ProxyDesignAssetPath(@"Assets\World-Boss\DESIGN.md"));
        }

        [Test]
        public void MirrorDesignMarkdownRejectsOversizedSourceBeforeProxyWrite()
        {
            string root = Path.Combine("Assets", "GreyboxDesignPostprocessorOversized-" + Guid.NewGuid().ToString("N"));
            try
            {
                Directory.CreateDirectory(root);
                string markdownPath = Path.Combine(root, "DESIGN.md");
                File.WriteAllText(markdownPath, new string('x', PrivateIntConstant("MaxDesignMarkdownBytes") + 1));

                Assert.False(MirrorDesignMarkdown(markdownPath));
                Assert.False(File.Exists(Path.Combine(root, $"{Path.GetFileName(root)}.design")));
            }
            finally
            {
                if (Directory.Exists(root)) Directory.Delete(root, true);
            }
        }

        [Test]
        public void MirrorDesignMarkdownOverwritesOversizedProxyWithBoundedSource()
        {
            string root = Path.Combine("Assets", "GreyboxDesignPostprocessorProxy-" + Guid.NewGuid().ToString("N"));
            try
            {
                Directory.CreateDirectory(root);
                string markdownPath = Path.Combine(root, "DESIGN.md");
                string proxyPath = Path.Combine(root, $"{Path.GetFileName(root)}.design");
                const string markdown = "# Palette\n- Spark: #FF6B35\n";
                File.WriteAllText(markdownPath, markdown);
                File.WriteAllText(proxyPath, new string('x', PrivateIntConstant("MaxDesignMarkdownBytes") + 1));

                Assert.True(MirrorDesignMarkdown(markdownPath));
                Assert.AreEqual(markdown, File.ReadAllText(proxyPath));
                Assert.AreEqual(0, Directory.GetFiles(root, "*.greybox-tmp-*").Length);
            }
            finally
            {
                if (Directory.Exists(root)) Directory.Delete(root, true);
            }
        }

        private static bool IsDesignMarkdownPath(string assetPath)
        {
            return (bool)typeof(DesignMarkdownPostprocessor)
                .GetMethod("IsDesignMarkdownPath", BindingFlags.Static | BindingFlags.NonPublic)
                .Invoke(null, new object[] { assetPath });
        }

        private static string ProxyDesignAssetPath(string assetPath)
        {
            return (string)typeof(DesignMarkdownPostprocessor)
                .GetMethod("ProxyDesignAssetPath", BindingFlags.Static | BindingFlags.NonPublic)
                .Invoke(null, new object[] { assetPath });
        }

        private static bool MirrorDesignMarkdown(string assetPath)
        {
            return (bool)typeof(DesignMarkdownPostprocessor)
                .GetMethod("MirrorDesignMarkdown", BindingFlags.Static | BindingFlags.NonPublic)
                .Invoke(null, new object[] { assetPath });
        }

        private static int PrivateIntConstant(string name)
        {
            return (int)typeof(DesignMarkdownPostprocessor)
                .GetField(name, BindingFlags.Static | BindingFlags.NonPublic)
                .GetRawConstantValue();
        }
    }
}
