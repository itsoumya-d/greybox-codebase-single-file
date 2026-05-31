// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using Greybox.Runtime;
using NUnit.Framework;
using UnityEngine;

namespace Greybox.Tests.PlayMode
{
    public sealed class GreyboxArtifactPlayTests
    {
        [Test]
        public void ArtifactStoresSourceHash()
        {
            var artifact = ScriptableObject.CreateInstance<GreyboxArtifact>();
            artifact.SourceHash = "abc";
            Assert.AreEqual("abc", artifact.SourceHash);
        }
    }
}
