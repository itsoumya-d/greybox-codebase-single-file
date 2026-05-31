// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

#pragma once

#include "CoreMinimal.h"
#include "Dom/JsonObject.h"
#include "Importers/GreyboxGameProjectTypes.h"

/**
 * Top-level orchestrator that converts a canonical Greybox GameProject
 * JSON document (produced by @greybox/schema and the web editor) into
 * real Unreal assets.
 *
 * The orchestrator owns parsing, validation, and dispatch. Per-entity
 * conversion is delegated to {@link FGreyboxScreenImporter},
 * {@link FGreyboxCharacterImporter}, {@link FGreyboxAssetImporter},
 * {@link FGreyboxComponentImporter}, and {@link FGreyboxFlowImporter}.
 *
 * Importers are deterministic: given the same JSON input + asset bundle
 * they produce the same output (asset paths, widget contents, flow
 * dispatcher map). This makes it safe to wire into CI commandlets.
 */
class GREYBOXSTUDIOEDITOR_API FGreyboxProjectImporter
{
public:
    /**
     * Import a project from a canonical GameProject JSON document on disk.
     *
     * @param JsonPath Absolute path to the `project.json` document.
     * @param AssetBaseDir Absolute path to the bundled asset directory
     *        (the same root that {@link FGreyboxAssetSpec::Uri} paths are
     *        resolved against).
     * @param OutputContentDir Engine-style content root, e.g. `/Game/Greybox`.
     *        Imported assets land under
     *        `<OutputContentDir>/Levels/<screenId>`,
     *        `<OutputContentDir>/Widgets/<screenId>`,
     *        `<OutputContentDir>/Characters/<characterId>`,
     *        `<OutputContentDir>/Assets/<assetId>`.
     */
    static FGreyboxProjectImportResult ImportFromJson(
        const FString& JsonPath,
        const FString& AssetBaseDir,
        const FString& OutputContentDir);

    /**
     * Parse the canonical JSON into a strongly-typed spec without running
     * the per-entity importers. Useful for tests and the commandlet.
     */
    static bool ParseProjectSpec(
        const FString& JsonBody,
        FGreyboxGameProjectSpec& OutSpec,
        TArray<FString>& OutErrors);

    /** Convert canonical {Y-up, metres, RH} to Unreal {Z-up, cm, LH}. */
    static FTransform ConvertTransformToUnreal(const FGreyboxCanonicalTransform& In);

    /** Default `/Game/Greybox` mount path used when callers don't supply one. */
    static FString DefaultContentRoot();

    /** Default fixture path written by the editor button (CI introspectable). */
    static FString DefaultImportPlanPath();

private:
    static bool ParseTransform(const TSharedPtr<FJsonObject>& Source, FGreyboxCanonicalTransform& OutTransform);
    static void ParseComponent(const TSharedPtr<FJsonObject>& Source, FGreyboxComponentSpec& OutSpec);
    static void ParseScreen(const TSharedPtr<FJsonObject>& Source, FGreyboxScreenSpec& OutSpec);
    static void ParseCharacter(const TSharedPtr<FJsonObject>& Source, FGreyboxCharacterSpec& OutSpec);
    static void ParseAsset(const TSharedPtr<FJsonObject>& Source, FGreyboxAssetSpec& OutSpec);
    static void ParseFlowEdge(const TSharedPtr<FJsonObject>& Source, FGreyboxFlowEdgeSpec& OutSpec);
};
