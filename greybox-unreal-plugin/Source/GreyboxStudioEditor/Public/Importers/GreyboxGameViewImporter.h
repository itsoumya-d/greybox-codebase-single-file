// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

#pragma once

#include "CoreMinimal.h"
#include "Math/Vector.h"
#include "GreyboxGameViewImporter.generated.h"

/**
 * Per-actor import descriptor produced by FGreyboxGameViewImporter.
 * Holds the Unreal-space transform (Z-up, cm, LH) alongside the source
 * metadata so the editor commandlet / UI can spawn actors without
 * re-parsing the plan JSON.
 */
USTRUCT()
struct GREYBOXSTUDIOEDITOR_API FGreyboxImportedGameViewActor
{
    GENERATED_BODY()

    UPROPERTY()
    FString ActorId;

    /** One of: player | enemy | npc | prop | trigger | spawn | hazard */
    UPROPERTY()
    FString ActorType;

    UPROPERTY()
    FString ActorName;

    UPROPERTY()
    FString FactionId;

    /** Resolved mesh asset path, or a placeholder BasicShapes path. */
    UPROPERTY()
    FString MeshAssetPath;

    /** Converted from canonical Y-up metres to Unreal Z-up centimetres. */
    UPROPERTY()
    FVector UnrealLocationCm = FVector::ZeroVector;
};

USTRUCT()
struct GREYBOXSTUDIOEDITOR_API FGreyboxGameViewImportResult
{
    GENERATED_BODY()

    UPROPERTY()
    bool bSucceeded = false;

    UPROPERTY()
    TArray<FGreyboxImportedGameViewActor> Actors;

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
 * Converts a .gameview.json artifact into a deterministic Unreal import
 * plan written to Saved/Greybox/ImportPlans/GameViews/<gameId>.greybox-gameview.json.
 *
 * The plan contains:
 *  - Per-actor entries with Unreal-space transforms, mesh paths, and tags.
 *  - Spawn point entries (→ APlayerStart).
 *  - Objective entries (→ ATriggerSphere).
 *  - Hazard entries (→ ATriggerSphere + damage tags + radius in cm).
 *
 * Coordinate mapping: canonical (X, Y, Z) metres, Y-up, right-handed
 * → Unreal (X*100, Z*100, Y*100) cm, Z-up, left-handed.
 */
class GREYBOXSTUDIOEDITOR_API FGreyboxGameViewImporter
{
public:
    /**
     * Parse a .gameview.json file and write a deterministic import plan.
     *
     * @param JsonPath      Absolute path to the .gameview.json file.
     * @param OutputContentDir  Engine-style content root, e.g. /Game/Greybox/GameViews.
     *                          Defaults to FGreyboxGameViewImporter::DefaultContentRoot().
     */
    static FGreyboxGameViewImportResult ImportFromJson(
        const FString& JsonPath,
        const FString& OutputContentDir = FString());

    /** Default /Game/Greybox/GameViews mount path. */
    static FString DefaultContentRoot();
};
