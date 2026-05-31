// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

#pragma once

#include "CoreMinimal.h"
#include "Importers/GreyboxGameProjectTypes.h"

/**
 * Per-kind component importer. Each Component in a Screen is dispatched
 * to a builder that emits the deterministic Unreal target descriptor:
 *
 * - Button       -> UMG UButton inside Widgets/<screenId>
 * - Image        -> UMG UImage referencing Texture2D
 * - Text         -> UMG UTextBlock
 * - HUDBar       -> UMG UProgressBar bound to stat key
 * - Character3DRef -> ASkeletalMeshActor (+ animation blueprint reference)
 * - GameObject   -> AStaticMeshActor with referenced mesh
 * - Camera       -> ACameraActor (optionally main)
 * - Light        -> ADirectionalLight or APointLight or ASpotLight
 * - Spawner / Trigger / Pickup / Hazard / Checkpoint -> AStaticMeshActor
 *   with a default cube + GreyboxComponent metadata tag
 *
 * The importer does NOT directly mutate the editor at this layer.
 * Instead it builds a deterministic JSON descriptor for each component
 * which is consumed by the editor / commandlet to spawn the real objects.
 * This keeps the importers CI-friendly (no headless editor required for
 * the deterministic asset-path / parameter test surface).
 */
class GREYBOXSTUDIOEDITOR_API FGreyboxComponentImporter
{
public:
    /**
     * Build the JSON descriptor for a single component. Returns the
     * imported-asset entries that the project import result should
     * surface for this component (typically one widget slot, one actor,
     * or one prop).
     */
    static TArray<FGreyboxImportedAsset> BuildComponentDescriptor(
        const FGreyboxComponentSpec& Component,
        const FString& ContentRoot,
        const FString& ScreenId,
        TSharedPtr<class FJsonObject>& InOutScreenDescriptor,
        TArray<FString>& OutWarnings);

    /** Convert canonical Y-up metres to Unreal Z-up centimetres. */
    static FTransform ConvertTransform(const FGreyboxCanonicalTransform& In);

    /** Translate hex `#RRGGBB[AA]` into a linear FLinearColor (sRGB-decoded). */
    static FLinearColor ParseHexColor(const FString& Hex);

    /** Returns true when Kind matches a UMG (widget-graph) component. */
    static bool IsUmgComponentKind(const FString& Kind);

    /** Returns true when Kind matches a level (actor-graph) component. */
    static bool IsLevelComponentKind(const FString& Kind);
};
