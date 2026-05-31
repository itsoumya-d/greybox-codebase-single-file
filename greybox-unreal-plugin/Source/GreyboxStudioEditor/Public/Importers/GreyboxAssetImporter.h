// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

#pragma once

#include "CoreMinimal.h"
#include "Importers/GreyboxGameProjectTypes.h"

/**
 * Converts an Asset spec into the deterministic UE-asset descriptor for
 * a single content file under `/Game/Greybox/Assets/<assetId>`.
 *
 * Supported types:
 *   - gltf / fbx    -> Skeletal/Static Mesh import (via UAssetImportTask)
 *   - png / jpg / webp -> Texture2D import
 *   - mp3 / wav     -> SoundWave import
 *   - json / prefab -> Treated as raw blob, copied next to the import root
 *
 * Unknown types log a warning but do not fail the project import.
 */
class GREYBOXSTUDIOEDITOR_API FGreyboxAssetImporter
{
public:
    static FGreyboxImportedAsset BuildAssetDescriptor(
        const FGreyboxAssetSpec& Asset,
        const FString& AssetBaseDir,
        const FString& ContentRoot,
        TArray<FString>& OutWarnings);

    static FString PackagePathForAsset(
        const FString& ContentRoot,
        const FString& AssetId);

    static FString UnrealAssetClassForType(const FString& Type);
};
