// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

#pragma once

#include "CoreMinimal.h"
#include "Importers/GreyboxGameProjectTypes.h"

/**
 * Converts a Screen spec into the deterministic UE-asset descriptor for
 * one ULevel + one Widget Blueprint. Components inside the screen are
 * dispatched to {@link FGreyboxComponentImporter}.
 *
 * Output (per screen):
 *   /Game/Greybox/Levels/<screenId>.umap                 (Level)
 *   /Game/Greybox/Widgets/<screenId>.WBP_<screenId>       (UMG)
 *
 * The level script actor receives a `GreyboxLevelMetadata` struct stamped
 * with screen id + kind so the editor can locate the level back to its
 * source spec.
 */
class GREYBOXSTUDIOEDITOR_API FGreyboxScreenImporter
{
public:
    static TArray<FGreyboxImportedAsset> BuildScreenDescriptor(
        const FGreyboxScreenSpec& Screen,
        const FString& ContentRoot,
        TArray<FString>& OutWarnings);

    /** Mount-style level package path for a screen. */
    static FString LevelPackagePath(const FString& ContentRoot, const FString& ScreenId);

    /** Mount-style UMG widget-blueprint package path for a screen. */
    static FString WidgetPackagePath(const FString& ContentRoot, const FString& ScreenId);
};
