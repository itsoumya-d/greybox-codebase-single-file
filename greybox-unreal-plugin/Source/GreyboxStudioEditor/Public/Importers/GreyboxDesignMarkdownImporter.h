// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

#pragma once

#include "CoreMinimal.h"
#include "GreyboxDesignMarkdownImporter.generated.h"

/**
 * A single palette color extracted from a DESIGN.md art bible.
 * R/G/B/A are in sRGB [0,1] range; the import plan also provides
 * gamma-corrected linear values ready for UMaterialInstanceDynamic.
 */
USTRUCT(BlueprintType)
struct GREYBOXSTUDIOEDITOR_API FGreyboxArtBibleColor
{
    GENERATED_BODY()

    /** Upper-case hex value including # prefix, e.g. #1A2B3C. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Greybox")
    FString Hex;

    /** Human-readable name extracted from the surrounding line, e.g. "Primary". */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Greybox")
    FString Name;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Greybox")
    float R = 0.0f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Greybox")
    float G = 0.0f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Greybox")
    float B = 0.0f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Greybox")
    float A = 1.0f;
};

USTRUCT()
struct GREYBOXSTUDIOEDITOR_API FGreyboxDesignMarkdownImportResult
{
    GENERATED_BODY()

    UPROPERTY()
    bool bSucceeded = false;

    /** All colors extracted from the palette section(s), in order of first appearance. */
    UPROPERTY()
    TArray<FGreyboxArtBibleColor> Colors;

    /** First font family name found in the Typography section, or empty. */
    UPROPERTY()
    FString FontFamily;

    /** Raw art direction prose extracted from the Art Direction / Style section. */
    UPROPERTY()
    FString ArtDirectionNotes;

    UPROPERTY()
    TArray<FString> Warnings;

    UPROPERTY()
    TArray<FString> Errors;

    UPROPERTY()
    FString ImportPlanPath;
};

/**
 * Parses a DESIGN.md art bible file and writes a deterministic import plan to
 * Saved/Greybox/ImportPlans/ArtBibles/<designId>.greybox-artbible.json.
 *
 * Extraction rules:
 *  - Palette: every #RRGGBB / #RRGGBBAA token in the document (de-duplicated,
 *    preserving first-occurrence order). The name is inferred from the text on
 *    the same line (stripping markdown punctuation).
 *  - Font family: first "font-family: Foo" or "font: Foo" match in a Typography
 *    section.
 *  - Art direction notes: first 2000 chars from an Art Direction / Style section.
 *
 * The plan includes both sRGB and gamma-corrected linear values for each color,
 * plus a suggested Unreal material instance path under ContentRoot/Materials/.
 */
class GREYBOXSTUDIOEDITOR_API FGreyboxDesignMarkdownImporter
{
public:
    /**
     * Parse a DESIGN.md file and write a deterministic import plan.
     *
     * @param MarkdownPath      Absolute path to the DESIGN.md file.
     * @param OutputContentDir  Engine-style content root, e.g. /Game/Greybox/ArtBibles.
     */
    static FGreyboxDesignMarkdownImportResult ImportFromMarkdown(
        const FString& MarkdownPath,
        const FString& OutputContentDir = FString());

    /** Default /Game/Greybox/ArtBibles mount path. */
    static FString DefaultContentRoot();
};
