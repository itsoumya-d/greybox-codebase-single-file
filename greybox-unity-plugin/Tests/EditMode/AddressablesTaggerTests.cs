// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System;
using System.Reflection;
using Greybox.Editor.Generation;
using Greybox.Runtime;
using NUnit.Framework;

namespace Greybox.Tests.EditMode
{
    public sealed class AddressablesTaggerTests
    {
        [Test]
        public void DeferredTagQueueDeduplicatesAndCapsGeneratedAssets()
        {
            ClearPending();
            try
            {
                int maxRequests = GetStaticIntProperty("MaxPendingTagRequestsForTests");
                Assert.GreaterOrEqual(maxRequests, 256);

                AddressablesTagger.TagDeferred("Assets/Greybox/Generated/arena.prefab", GreyboxArtifactKind.GameViewport);
                AddressablesTagger.TagDeferred("Assets/Greybox/Generated/arena.prefab", GreyboxArtifactKind.GameViewport);
                Assert.AreEqual(1, GetStaticIntProperty("PendingTagRequestCountForTests"));

                for (int index = 1; index < maxRequests + 2; index++)
                {
                    AddressablesTagger.TagDeferred($"Assets/Greybox/Generated/generated-{index}.prefab", GreyboxArtifactKind.LevelBoard);
                }

                Assert.AreEqual(maxRequests, GetStaticIntProperty("PendingTagRequestCountForTests"));
                AddressablesTagger.TagDeferred("Assets/Greybox/Generated/overflow.prefab", GreyboxArtifactKind.ArtBible);
                Assert.AreEqual(maxRequests, GetStaticIntProperty("PendingTagRequestCountForTests"));
            }
            finally
            {
                ClearPending();
            }
        }

        [Test]
        public void DeferredTagQueueNormalizesBackslashAssetPaths()
        {
            ClearPending();
            try
            {
                string observedPath = "";
                string[] observedLabels = Array.Empty<string>();

                AddressablesTagger.TagDeferred(@"Assets\Greybox\Generated\arena.prefab", GreyboxArtifactKind.GameViewport);
                Assert.AreEqual(1, GetStaticIntProperty("PendingTagRequestCountForTests"));

                FlushPendingForTests(
                    (assetPath, labels) =>
                    {
                        observedPath = assetPath;
                        observedLabels = labels;
                        return true;
                    },
                    (assetPath, labels) => false
                );

                Assert.AreEqual("Assets/Greybox/Generated/arena.prefab", observedPath);
                CollectionAssert.Contains(observedLabels, AddressablesTagger.GeneratedLabel);
                CollectionAssert.Contains(observedLabels, AddressablesTagger.GameViewportLabel);
                Assert.AreEqual(0, GetStaticIntProperty("PendingTagRequestCountForTests"));
            }
            finally
            {
                ClearPending();
            }
        }

        [Test]
        public void SampleSceneTagsUseGeneratedAndSampleLabels()
        {
            ClearPending();
            try
            {
                string observedPath = "";
                string[] observedLabels = Array.Empty<string>();

                AddressablesTagger.TagSampleSceneDeferred("Assets/GreyboxGenerated/Samples/2DPlatformer/Greybox2DPlatformerSample.unity", AddressablesTagger.PlatformerSampleLabel);
                Assert.AreEqual(1, GetStaticIntProperty("PendingTagRequestCountForTests"));

                FlushPendingForTests(
                    (assetPath, labels) =>
                    {
                        observedPath = assetPath;
                        observedLabels = labels;
                        return true;
                    },
                    (assetPath, labels) => false
                );

                Assert.AreEqual("Assets/GreyboxGenerated/Samples/2DPlatformer/Greybox2DPlatformerSample.unity", observedPath);
                CollectionAssert.Contains(observedLabels, AddressablesTagger.GeneratedLabel);
                CollectionAssert.Contains(observedLabels, AddressablesTagger.SampleSceneLabel);
                CollectionAssert.Contains(observedLabels, AddressablesTagger.PlatformerSampleLabel);
                Assert.AreEqual(0, GetStaticIntProperty("PendingTagRequestCountForTests"));
            }
            finally
            {
                ClearPending();
            }
        }

        [Test]
        public void DeferredTagQueueRejectsUnsafeAssetPathsBeforeEnqueue()
        {
            ClearPending();
            try
            {
                int maxPathChars = GetStaticIntProperty("MaxAssetPathCharsForTests");
                foreach (string unsafePath in new[]
                {
                    "",
                    "Packages/com.greybox.studio/Generated/arena.prefab",
                    "../ProjectSettings/ProjectSettings.asset",
                    "Assets/Greybox/../Generated/arena.prefab",
                    "Assets/Greybox/./Generated/arena.prefab",
                    "Assets//Greybox/Generated/arena.prefab",
                    "Assets/Greybox/Generated/\n.prefab",
                    "Assets/" + new string('a', maxPathChars + 1) + ".prefab"
                })
                {
                    AddressablesTagger.TagDeferred(unsafePath, GreyboxArtifactKind.GameViewport);
                }

                Assert.AreEqual(0, GetStaticIntProperty("PendingTagRequestCountForTests"));
                Assert.False(GetStaticBoolProperty("FlushScheduledForTests"));
            }
            finally
            {
                ClearPending();
            }
        }

        [Test]
        public void DeferredFlushRetainsRetryableAddressablesFailures()
        {
            ClearPending();
            try
            {
                AddressablesTagger.TagDeferred("Assets/Greybox/Generated/retry.prefab", GreyboxArtifactKind.GameViewport);

                FlushPendingForTests(
                    (assetPath, labels) => false,
                    (assetPath, labels) => true
                );
                Assert.AreEqual(1, GetStaticIntProperty("PendingTagRequestCountForTests"));

                FlushPendingForTests(
                    (assetPath, labels) => false,
                    (assetPath, labels) => false
                );
                Assert.AreEqual(0, GetStaticIntProperty("PendingTagRequestCountForTests"));
            }
            finally
            {
                ClearPending();
            }
        }

        [Test]
        public void DuplicateDeferredTagWakesRetryablePendingQueue()
        {
            ClearPending();
            try
            {
                AddressablesTagger.TagDeferred("Assets/Greybox/Generated/retry-wakeup.prefab", GreyboxArtifactKind.GameViewport);
                FlushPendingForTests(
                    (assetPath, labels) => false,
                    (assetPath, labels) => true
                );

                Assert.AreEqual(1, GetStaticIntProperty("PendingTagRequestCountForTests"));
                Assert.False(GetStaticBoolProperty("FlushScheduledForTests"));

                AddressablesTagger.TagDeferred("Assets/Greybox/Generated/retry-wakeup.prefab", GreyboxArtifactKind.GameViewport);

                Assert.AreEqual(1, GetStaticIntProperty("PendingTagRequestCountForTests"));
                Assert.True(GetStaticBoolProperty("FlushScheduledForTests"));
            }
            finally
            {
                ClearPending();
            }
        }

        private static void ClearPending()
        {
            typeof(AddressablesTagger)
                .GetMethod("ClearPendingForTests", BindingFlags.Static | BindingFlags.NonPublic)
                .Invoke(null, null);
        }

        private static int GetStaticIntProperty(string propertyName)
        {
            return (int)typeof(AddressablesTagger)
                .GetProperty(propertyName, BindingFlags.Static | BindingFlags.NonPublic)
                .GetValue(null);
        }

        private static bool GetStaticBoolProperty(string propertyName)
        {
            return (bool)typeof(AddressablesTagger)
                .GetProperty(propertyName, BindingFlags.Static | BindingFlags.NonPublic)
                .GetValue(null);
        }

        private static void FlushPendingForTests(Func<string, string[], bool> tagger, Func<string, string[], bool> retryable)
        {
            typeof(AddressablesTagger)
                .GetMethod("FlushPendingForTests", BindingFlags.Static | BindingFlags.NonPublic)
                .Invoke(null, new object[] { tagger, retryable });
        }
    }
}
