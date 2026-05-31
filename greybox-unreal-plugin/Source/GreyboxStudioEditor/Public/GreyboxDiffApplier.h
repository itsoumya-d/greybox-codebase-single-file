// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

#pragma once

#include "CoreMinimal.h"
#include "Dom/JsonObject.h"
#include "Dom/JsonValue.h"

enum class EGreyboxMergeFieldType : uint8
{
    Int,
    Float,
    String,
    Color,
    Vector,
    Rotator,
    Transform,
    Bool,
    Array,
    Object
};

enum class EGreyboxConflictResolution : uint8
{
    Pending,
    KeepLocal,
    KeepRemote
};

struct FGreyboxRoundTripMergeRequest
{
    FString BaseArtifactJson;
    FString WebArtifactJson;
    FString UnrealEditJson;
    FString LastSyncedSha256;
};

struct FGreyboxMergeConflict
{
    /** JSON Pointer (RFC 6901) of the conflicted leaf. */
    FString JsonPointer;
    FString BaseValueJson;
    FString LocalValueJson;
    FString RemoteValueJson;
    EGreyboxMergeFieldType FieldType = EGreyboxMergeFieldType::String;
    EGreyboxConflictResolution Resolution = EGreyboxConflictResolution::Pending;
};

struct FGreyboxRoundTripMergeResult
{
    bool bSucceeded = false;
    bool bHasConflicts = false;
    FString MergedArtifactJson;
    TArray<FString> ConflictPaths;
    TArray<FGreyboxMergeConflict> Conflicts;
};

/**
 * 3-way JSON merge ("base / local / remote") for round-tripping a Greybox
 * GameProject between the web editor and Unreal.
 *
 * Field handling:
 * - Scalars (int/float/string/bool):
 *   - remote==base   -> keep local
 *   - local==base    -> keep remote
 *   - both changed   -> conflict
 * - FVector / FRotator / FColor / FTransform: same rules but tuple-wise.
 * - Arrays: element-wise reconciliation when array items carry a stable
 *   id (object with `id` or `componentId`); falls back to positional
 *   compare otherwise.
 * - Nested objects: recursive.
 *
 * Conflicts are surfaced via {@link FGreyboxMergeConflict}; callers can
 * call {@link Resolve} to choose a side before re-running the merge.
 */
class FGreyboxDiffApplier
{
public:
    static FGreyboxRoundTripMergeResult Merge(const FGreyboxRoundTripMergeRequest& Request);
    static bool SupportsFieldType(EGreyboxMergeFieldType FieldType);

    /**
     * Resolve a previously-surfaced conflict by choosing local or remote.
     * Returns a new result with the chosen value applied at the conflict path.
     */
    static FGreyboxRoundTripMergeResult Resolve(
        const FGreyboxRoundTripMergeResult& PreviousResult,
        const FString& JsonPointer,
        EGreyboxConflictResolution Choice);

    /** Classify a JSON value's leaf type, used when surfacing conflicts. */
    static EGreyboxMergeFieldType ClassifyJsonValue(const TSharedPtr<FJsonValue>& Value);
};
