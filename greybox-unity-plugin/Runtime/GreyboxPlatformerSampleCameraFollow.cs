// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System;
using UnityEngine;

namespace Greybox.Runtime
{
    public sealed class GreyboxPlatformerSampleCameraFollow : MonoBehaviour
    {
        public Transform Target;
        public string SourceArtifactKind = "";
        public string SourceArtifactId = "";
        public string SourceArtifactDisplayName = "";
        public string CameraMode = "";
        public Vector3 Offset = new Vector3(0f, 3f, -18f);
        public float SmoothTime = 0.12f;
        public bool LockY;
        public float LockedY = 4f;

        private Vector3 velocity;

        private void LateUpdate()
        {
            if (!Target) return;
            transform.position = Vector3.SmoothDamp(
                transform.position,
                ComposeTargetPosition(Target.position, Offset, LockY, LockedY),
                ref velocity,
                Mathf.Max(0.01f, SmoothTime));
        }

        public void SnapToTarget()
        {
            if (!Target) return;
            velocity = Vector3.zero;
            transform.position = ComposeTargetPosition(Target.position, Offset, LockY, LockedY);
        }

        public void ApplyCameraMode(string cameraMode)
        {
            CameraMode = cameraMode ?? "";
            Offset = OffsetForMode(CameraMode, Offset);
            LockY = ShouldLockY(CameraMode);
        }

        public static Vector3 ComposeTargetPosition(Vector3 targetPosition, Vector3 offset, bool lockY, float lockedY)
        {
            Vector3 position = targetPosition + offset;
            if (lockY) position.y = lockedY;
            return position;
        }

        public static bool ShouldLockY(string cameraMode)
        {
            string normalized = (cameraMode ?? "").Trim();
            if (string.IsNullOrWhiteSpace(normalized)) return true;
            if (ContainsCameraModeToken(normalized, "top") || ContainsCameraModeToken(normalized, "isometric") || ContainsCameraModeToken(normalized, "free")) return false;
            return true;
        }

        public static Vector3 OffsetForMode(string cameraMode, Vector3 fallback)
        {
            float depth = Mathf.Approximately(fallback.z, 0f) ? -18f : fallback.z;
            if (ContainsCameraModeToken(cameraMode, "top") || ContainsCameraModeToken(cameraMode, "isometric") || ContainsCameraModeToken(cameraMode, "portrait")) return new Vector3(0f, 0f, depth);
            if (IsSideScrollCameraMode(cameraMode)) return new Vector3(0f, 3f, depth);
            return new Vector3(fallback.x, fallback.y, depth);
        }

        public static bool IsSideScrollCameraMode(string cameraMode)
        {
            string normalized = (cameraMode ?? "").Trim();
            return ContainsCameraModeToken(normalized, "side")
                || ContainsCameraModeToken(normalized, "scroll")
                || ContainsCameraModeToken(normalized, "platform");
        }

        private static bool ContainsCameraModeToken(string cameraMode, string token)
        {
            return (cameraMode ?? "").IndexOf(token ?? "", StringComparison.OrdinalIgnoreCase) >= 0;
        }
    }
}
