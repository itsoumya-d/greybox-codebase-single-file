// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

#pragma once

#include "CoreMinimal.h"
#include "Importers/GreyboxGameProjectTypes.h"

/**
 * Converts a Character spec into the deterministic UE-asset descriptor
 * for a Skeletal Mesh + Animation Blueprint pair.
 *
 * Output (per character):
 *   /Game/Greybox/Characters/<characterId>_SK            (Skeletal Mesh)
 *   /Game/Greybox/Characters/<characterId>_Skeleton      (Skeleton)
 *   /Game/Greybox/Characters/<characterId>_PhysAsset     (PhysicsAsset)
 *   /Game/Greybox/Characters/<characterId>_ABP           (AnimBlueprint)
 *   /Game/Greybox/Characters/<characterId>_AnimClip_<n>  (AnimSequence per clip)
 *
 * Mixamo joint convention is assumed. Joints that fall outside
 * `MIXAMO_STANDARD_JOINTS` (see @greybox/schema) are logged as warnings.
 */
class GREYBOXSTUDIOEDITOR_API FGreyboxCharacterImporter
{
public:
    static TArray<FGreyboxImportedAsset> BuildCharacterDescriptor(
        const FGreyboxCharacterSpec& Character,
        const FString& ContentRoot,
        TArray<FString>& OutWarnings);

    /** True when `JointName` matches one of the canonical Mixamo joints. */
    static bool IsMixamoStandardJoint(const FString& JointName);

    static FString CharacterPackageBase(const FString& ContentRoot, const FString& CharacterId);
    static FString SkeletalMeshPackagePath(const FString& ContentRoot, const FString& CharacterId);
    static FString AnimBlueprintPackagePath(const FString& ContentRoot, const FString& CharacterId);
    static FString AnimSequencePackagePath(
        const FString& ContentRoot,
        const FString& CharacterId,
        const FString& ClipName);
};
