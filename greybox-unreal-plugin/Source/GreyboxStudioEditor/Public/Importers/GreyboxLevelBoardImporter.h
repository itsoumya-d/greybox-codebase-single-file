// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

#pragma once

#include "CoreMinimal.h"
#include "GreyboxLevelBoardImporter.generated.h"

USTRUCT()
struct GREYBOXSTUDIOEDITOR_API FGreyboxImportedLevelRoom
{
    GENERATED_BODY()

    UPROPERTY()
    FString RoomId;

    UPROPERTY()
    FString RoomName;
};

USTRUCT()
struct GREYBOXSTUDIOEDITOR_API FGreyboxLevelBoardImportResult
{
    GENERATED_BODY()

    UPROPERTY()
    bool bSucceeded = false;

    UPROPERTY()
    TArray<FGreyboxImportedLevelRoom> Rooms;

    UPROPERTY()
    TArray<FString> Warnings;

    UPROPERTY()
    TArray<FString> Errors;

    UPROPERTY()
    FString ImportPlanPath;

    UPROPERTY()
    int32 PrimaryObjectCount = 0;
};

/**
 * Converts a .levelboard.json artifact into a deterministic Unreal import
 * plan written to Saved/Greybox/ImportPlans/LevelBoards/<boardId>.greybox-levelboard.json.
 *
 * For each room the plan records:
 *  - Per-tile entries with Unreal locations (cm), mesh paths, nav modifier
 *    (Walk / Obstacle), collision hint, and an optional spawnDamageTrigger flag.
 *  - Encounter entries (→ ACharacter placeholder).
 *  - Connection entries (→ ATriggerBox doorway volume).
 *
 * Tile grid units are mapped 1:1 to TileUnitCm (100 cm) in Unreal space.
 */
class GREYBOXSTUDIOEDITOR_API FGreyboxLevelBoardImporter
{
public:
    /**
     * Parse a .levelboard.json file and write a deterministic import plan.
     *
     * @param JsonPath          Absolute path to the .levelboard.json file.
     * @param OutputContentDir  Engine-style content root, e.g. /Game/Greybox/LevelBoards.
     */
    static FGreyboxLevelBoardImportResult ImportFromJson(
        const FString& JsonPath,
        const FString& OutputContentDir = FString());

    /** Default /Game/Greybox/LevelBoards mount path. */
    static FString DefaultContentRoot();
};
