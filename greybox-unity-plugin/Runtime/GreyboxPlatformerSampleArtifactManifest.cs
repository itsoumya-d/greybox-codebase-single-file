// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using UnityEngine;

namespace Greybox.Runtime
{
    [DisallowMultipleComponent]
    public sealed class GreyboxPlatformerSampleArtifactManifest : MonoBehaviour
    {
        public string SampleName = "2D Platformer";
        public string GameViewSourcePath = "";
        public string LevelBoardSourcePath = "";
        public string HudSourcePath = "";
        public string ArtBibleSourcePath = "";
        public string GameViewSourceHash = "";
        public string LevelBoardSourceHash = "";
        public string HudSourceHash = "";
        public string ArtBibleSourceHash = "";
        public string GeneratorCredit = "";
        public string HumanDesignerCredit = "";
        public string AiDisclosure = "";
        public bool ImportChainProvenanceReady;
        public int ImportedArtifactCount;
        public int PlayableObjectCount;
        public int LevelBoardDrivenObjectCount;
        public int GameViewDrivenObjectCount;
        public int LevelBoardTileCount;
        public int LevelBoardRouteLength;
        public int ArtBiblePaletteColorCount;
        public int ArtBibleDrivenMaterialCount;
        public int SourceTaggedRuntimeObjectCount;
        public int GameViewEnemyCount;
        public int GameViewHazardCount;
        public int GameViewCoinCount;
        public bool GameViewPlayerConfigured;
        public bool GameViewCheckpointConfigured;
        public bool GameViewGoalConfigured;
        public bool GameViewCameraConfigured;
        public string CameraMode = "";
        public float CameraOrthographicSize;
        public int SampleCoinCount;
        public bool PlayerControllerConfigured;
        public bool HudControllerConfigured;
        public bool GoalControllerConfigured;
        public bool CheckpointControllerConfigured;
        public bool CameraFollowConfigured;
        public bool ResetControllerConfigured;
        public bool PlayModeSmokeReady;
        public string AddressablesScenePath = "";
        public string[] AddressablesLabels = new string[0];
        public bool AddressablesTaggingConfigured;
        public float BuildBudgetSeconds = 30f;
        public float BuildDurationSeconds;
        public bool BuildCompletedUnderBudget;
        public bool HudResetActionConfigured;
        public string HudResetActionId = "";
        public bool KeyboardResetConfigured;
        public string KeyboardResetKey = "";
    }
}
