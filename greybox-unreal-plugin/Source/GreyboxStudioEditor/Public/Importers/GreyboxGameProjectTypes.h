// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

#pragma once

#include "CoreMinimal.h"
#include "Math/Color.h"
#include "Math/Rotator.h"
#include "Math/Vector.h"
#include "GreyboxGameProjectTypes.generated.h"

/**
 * Mirrors the canonical Greybox GameProject JSON shape produced by the
 * @greybox/schema package. Importers in this module convert these into
 * real UE5 assets (levels, UMG widgets, skeletal meshes, animation
 * blueprints, lights, cameras, etc.).
 *
 * Canonical space: right-handed, Y-up, metres. Unreal space:
 * left-handed, Z-up, centimetres. ConvertTransformToUnreal performs the
 * conversion (and is used by every component importer).
 */

USTRUCT()
struct GREYBOXSTUDIOEDITOR_API FGreyboxCanonicalTransform
{
    GENERATED_BODY()

    UPROPERTY()
    FVector Position = FVector::ZeroVector;

    UPROPERTY()
    FRotator Rotation = FRotator::ZeroRotator;

    UPROPERTY()
    FVector Scale = FVector(1.0f, 1.0f, 1.0f);
};

USTRUCT()
struct GREYBOXSTUDIOEDITOR_API FGreyboxComponentSpec
{
    GENERATED_BODY()

    /** Discriminator from ComponentSchema.kind, e.g. "Button", "Light". */
    UPROPERTY()
    FString Kind;

    /** Stable component id used by FlowEdge.trigger.componentRef. */
    UPROPERTY()
    FString Id;

    UPROPERTY()
    FString Name;

    UPROPERTY()
    FGreyboxCanonicalTransform Transform;

    UPROPERTY()
    FString Parent;

    UPROPERTY()
    bool bVisible = true;

    /** Kind-specific scalar properties parsed by the per-kind importer. */
    UPROPERTY()
    TMap<FString, FString> StringProperties;

    UPROPERTY()
    TMap<FString, float> NumberProperties;

    UPROPERTY()
    TMap<FString, bool> BoolProperties;
};

USTRUCT()
struct GREYBOXSTUDIOEDITOR_API FGreyboxScreenSpec
{
    GENERATED_BODY()

    UPROPERTY()
    FString Id;

    UPROPERTY()
    FString Name;

    /** One of: main-menu | gameplay | cutscene | pause | game-over | ... */
    UPROPERTY()
    FString Kind;

    /** Background colour as #RRGGBB hex, empty when background is an asset. */
    UPROPERTY()
    FString BackgroundColorHex;

    /** Background asset id if `type == asset`, empty otherwise. */
    UPROPERTY()
    FString BackgroundAssetRef;

    UPROPERTY()
    TArray<FGreyboxComponentSpec> Components;
};

USTRUCT()
struct GREYBOXSTUDIOEDITOR_API FGreyboxAnimationClipSpec
{
    GENERATED_BODY()

    UPROPERTY()
    FString Id;

    UPROPERTY()
    FString Name;

    UPROPERTY()
    FString ClipAssetRef;

    UPROPERTY()
    float Duration = 0.0f;

    UPROPERTY()
    bool bLoop = true;
};

USTRUCT()
struct GREYBOXSTUDIOEDITOR_API FGreyboxRigJointSpec
{
    GENERATED_BODY()

    UPROPERTY()
    FString JointName;

    UPROPERTY()
    FString ParentName;
};

USTRUCT()
struct GREYBOXSTUDIOEDITOR_API FGreyboxCharacterSpec
{
    GENERATED_BODY()

    UPROPERTY()
    FString Id;

    UPROPERTY()
    FString Name;

    UPROPERTY()
    FString MeshAssetRef;

    UPROPERTY()
    TArray<FGreyboxRigJointSpec> Joints;

    UPROPERTY()
    TArray<FGreyboxAnimationClipSpec> Animations;

    UPROPERTY()
    TMap<FString, float> GameStats;
};

USTRUCT()
struct GREYBOXSTUDIOEDITOR_API FGreyboxAssetSpec
{
    GENERATED_BODY()

    UPROPERTY()
    FString Id;

    /** One of gltf | fbx | png | jpg | webp | mp3 | wav | json | prefab. */
    UPROPERTY()
    FString Type;

    UPROPERTY()
    FString Uri;

    UPROPERTY()
    FString Sha256;

    UPROPERTY()
    int64 SizeBytes = 0;

    UPROPERTY()
    FString DisplayName;
};

USTRUCT()
struct GREYBOXSTUDIOEDITOR_API FGreyboxFlowEdgeSpec
{
    GENERATED_BODY()

    UPROPERTY()
    FString Id;

    UPROPERTY()
    FString FromScreenId;

    UPROPERTY()
    FString ToScreenId;

    /** One of tap | longPress | swipe | time | scriptEvent | collision | custom. */
    UPROPERTY()
    FString TriggerType;

    /** componentRef from tap/longPress trigger variants. */
    UPROPERTY()
    FString TriggerComponentRef;

    /** eventId for scriptEvent triggers. */
    UPROPERTY()
    FString TriggerEventId;

    UPROPERTY()
    float TriggerDurationSeconds = 0.0f;
};

USTRUCT()
struct GREYBOXSTUDIOEDITOR_API FGreyboxGameProjectMeta
{
    GENERATED_BODY()

    UPROPERTY()
    FString Id;

    UPROPERTY()
    FString Name;

    UPROPERTY()
    FString Version;

    UPROPERTY()
    FString Genre;
};

USTRUCT()
struct GREYBOXSTUDIOEDITOR_API FGreyboxGameProjectSpec
{
    GENERATED_BODY()

    UPROPERTY()
    FString SchemaVersion;

    UPROPERTY()
    FGreyboxGameProjectMeta Meta;

    UPROPERTY()
    TArray<FGreyboxAssetSpec> Assets;

    UPROPERTY()
    TArray<FGreyboxCharacterSpec> Characters;

    UPROPERTY()
    TArray<FGreyboxScreenSpec> Screens;

    UPROPERTY()
    TArray<FGreyboxFlowEdgeSpec> Flow;
};

USTRUCT(BlueprintType)
struct GREYBOXSTUDIOEDITOR_API FGreyboxImportedAsset
{
    GENERATED_BODY()

    /** Engine-style mount path, e.g. /Game/Greybox/Levels/main-menu. */
    UPROPERTY()
    FString PackagePath;

    /** Free-form descriptor, e.g. "Level", "WidgetBlueprint", "Texture2D". */
    UPROPERTY()
    FString AssetKind;

    /** Source spec id (componentId, screenId, characterId, assetId). */
    UPROPERTY()
    FString SourceId;
};

USTRUCT(BlueprintType)
struct GREYBOXSTUDIOEDITOR_API FGreyboxProjectImportResult
{
    GENERATED_BODY()

    UPROPERTY()
    bool bSucceeded = false;

    /** All assets created or referenced as a result of this import. */
    UPROPERTY()
    TArray<FGreyboxImportedAsset> ImportedAssets;

    UPROPERTY()
    TArray<FString> Warnings;

    UPROPERTY()
    TArray<FString> Errors;

    /** Engine-path of the first screen that was imported, for editor jump. */
    UPROPERTY()
    FString FirstLevelPackagePath;

    /** Path of the import plan JSON written to disk (CI-introspectable). */
    UPROPERTY()
    FString ImportPlanPath;

    /** How many primary objects (assets + actors + widgets) were created. */
    UPROPERTY()
    int32 PrimaryObjectCount = 0;
};
