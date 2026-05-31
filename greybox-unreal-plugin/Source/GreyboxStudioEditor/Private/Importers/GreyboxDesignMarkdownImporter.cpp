// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

#include "Importers/GreyboxDesignMarkdownImporter.h"

#include "Dom/JsonObject.h"
#include "Dom/JsonValue.h"
#include "HAL/FileManager.h"
#include "Internationalization/Regex.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonWriter.h"
#include "Serialization/JsonSerializer.h"

DEFINE_LOG_CATEGORY_STATIC(LogGreyboxDesignMarkdownImporter, Log, All);

namespace
{
constexpr int32 MaxDesignMarkdownBytes = 4 * 1024 * 1024;

FString DescriptorDiskPath(const FString& DesignId)
{
    return FPaths::Combine(
        FPaths::ProjectSavedDir(),
        TEXT("Greybox"),
        TEXT("ImportPlans"),
        TEXT("ArtBibles"),
        DesignId + TEXT(".greybox-artbible.json"));
}

uint8 HexDigitValue(TCHAR C)
{
    if (C >= TCHAR('0') && C <= TCHAR('9')) return static_cast<uint8>(C - TCHAR('0'));
    if (C >= TCHAR('a') && C <= TCHAR('f')) return static_cast<uint8>(10 + (C - TCHAR('a')));
    if (C >= TCHAR('A') && C <= TCHAR('F')) return static_cast<uint8>(10 + (C - TCHAR('A')));
    return 0;
}

bool ParseHexColor(const FString& Hex, float& OutR, float& OutG, float& OutB, float& OutA)
{
    FString Raw = Hex;
    Raw.TrimStartAndEndInline();
    if (Raw.StartsWith(TEXT("#"))) Raw.RightChopInline(1);
    if (Raw.Len() != 6 && Raw.Len() != 8) return false;
    OutR = (HexDigitValue(Raw[0]) * 16 + HexDigitValue(Raw[1])) / 255.0f;
    OutG = (HexDigitValue(Raw[2]) * 16 + HexDigitValue(Raw[3])) / 255.0f;
    OutB = (HexDigitValue(Raw[4]) * 16 + HexDigitValue(Raw[5])) / 255.0f;
    OutA = Raw.Len() == 8
        ? (HexDigitValue(Raw[6]) * 16 + HexDigitValue(Raw[7])) / 255.0f
        : 1.0f;
    return true;
}

/**
 * Try to extract a human-readable name for a color from the same line.
 * Accepts patterns like:
 *   - Primary: #1A2B3C
 *   - background-dark #0D0D0D
 *   **Brand Red** `#FF3300`
 */
FString ExtractColorName(const FString& Line, const FString& HexToken)
{
    // Remove the hex token itself plus the # prefix
    FString Remainder = Line;
    const int32 HexIdx = Remainder.Find(HexToken, ESearchCase::IgnoreCase);
    if (HexIdx != INDEX_NONE)
    {
        Remainder = Remainder.Left(HexIdx);
    }
    // Strip markdown punctuation and whitespace
    Remainder.ReplaceInline(TEXT("*"), TEXT(""));
    Remainder.ReplaceInline(TEXT("`"), TEXT(""));
    Remainder.ReplaceInline(TEXT("#"), TEXT(""));
    Remainder.ReplaceInline(TEXT("-"), TEXT(" "));
    Remainder.ReplaceInline(TEXT(":"), TEXT(""));
    Remainder.TrimStartAndEndInline();

    // Collapse multiple spaces
    while (Remainder.Contains(TEXT("  ")))
    {
        Remainder.ReplaceInline(TEXT("  "), TEXT(" "));
    }
    return Remainder;
}

/**
 * Extract all palette colors from the markdown.
 * Looks for hex strings matching #RRGGBB or #RRGGBBAA.
 * Returns unique hex values preserving first-occurrence order.
 */
TArray<FGreyboxArtBibleColor> ExtractPaletteColors(const FString& Markdown)
{
    TArray<FGreyboxArtBibleColor> Colors;
    TSet<FString> Seen;

    TArray<FString> Lines;
    Markdown.ParseIntoArrayLines(Lines, false);

    const FRegexPattern HexPattern(TEXT("#([0-9A-Fa-f]{8}|[0-9A-Fa-f]{6})(?![0-9A-Fa-f])"));

    for (const FString& Line : Lines)
    {
        FRegexMatcher Matcher(HexPattern, Line);
        while (Matcher.FindNext())
        {
            const FString HexToken = Matcher.GetCaptureGroup(0); // includes #
            const FString NormHex = HexToken.ToUpper();
            if (Seen.Contains(NormHex)) continue;
            Seen.Add(NormHex);

            float R = 0, G = 0, B = 0, A = 1;
            if (!ParseHexColor(HexToken, R, G, B, A)) continue;

            FGreyboxArtBibleColor Color;
            Color.Hex = NormHex;
            Color.R = R;
            Color.G = G;
            Color.B = B;
            Color.A = A;
            Color.Name = ExtractColorName(Line, HexToken);
            if (Color.Name.IsEmpty())
            {
                Color.Name = FString::Printf(TEXT("Color%d"), Colors.Num() + 1);
            }
            Colors.Add(MoveTemp(Color));
        }
    }
    return Colors;
}

/**
 * Extract font family name(s) from a Typography section.
 * Looks for lines under headings containing "Typography", "Font", or "Type".
 * Returns the first font-like token found.
 */
FString ExtractFontFamily(const FString& Markdown)
{
    TArray<FString> Lines;
    Markdown.ParseIntoArrayLines(Lines, false);

    bool bInTypographySection = false;
    const FRegexPattern FontPattern(TEXT("(?i)(?:font[- ]family|font)[:\\s]+([A-Za-z][A-Za-z0-9 _-]+)"));
    const FRegexPattern SectionPattern(TEXT("(?i)^#{1,3}\\s+.*(typography|font|type)"));

    for (const FString& Line : Lines)
    {
        // Detect section entry/exit
        if (Line.StartsWith(TEXT("#")))
        {
            FRegexMatcher SectionMatcher(SectionPattern, Line);
            bInTypographySection = SectionMatcher.FindNext();
        }

        if (!bInTypographySection) continue;

        FRegexMatcher FontMatcher(FontPattern, Line);
        if (FontMatcher.FindNext())
        {
            FString Family = FontMatcher.GetCaptureGroup(1);
            Family.TrimStartAndEndInline();
            if (!Family.IsEmpty()) return Family;
        }
    }
    return FString();
}

/**
 * Extract art direction notes: everything under headings containing
 * "Art Direction", "Style", "Notes", or "Direction".
 * Returns up to the first 2000 characters.
 */
FString ExtractArtDirectionNotes(const FString& Markdown)
{
    TArray<FString> Lines;
    Markdown.ParseIntoArrayLines(Lines, false);

    const FRegexPattern ArtPattern(TEXT("(?i)^#{1,3}\\s+.*(art direction|style guide|notes|direction|aesthetic)"));
    bool bInArtSection = false;
    FString Notes;

    for (const FString& Line : Lines)
    {
        if (Line.StartsWith(TEXT("#")))
        {
            FRegexMatcher ArtMatcher(ArtPattern, Line);
            bInArtSection = ArtMatcher.FindNext();
            continue;
        }
        if (!bInArtSection) continue;
        Notes += Line + TEXT("\n");
        if (Notes.Len() >= 2000) break;
    }

    Notes.TrimStartAndEndInline();
    return Notes;
}

/** Extract section headings (## or ###) as a flat list for the plan metadata. */
TArray<FString> ExtractSectionHeadings(const FString& Markdown)
{
    TArray<FString> Headings;
    const FRegexPattern HeadingPattern(TEXT("(?m)^#{2,3}\\s+(.+)"));
    FRegexMatcher Matcher(HeadingPattern, Markdown);
    while (Matcher.FindNext())
    {
        FString Heading = Matcher.GetCaptureGroup(1);
        Heading.TrimStartAndEndInline();
        if (!Heading.IsEmpty()) Headings.Add(MoveTemp(Heading));
    }
    return Headings;
}
}

FString FGreyboxDesignMarkdownImporter::DefaultContentRoot()
{
    return TEXT("/Game/Greybox/ArtBibles");
}

FGreyboxDesignMarkdownImportResult FGreyboxDesignMarkdownImporter::ImportFromMarkdown(
    const FString& MarkdownPath,
    const FString& OutputContentDir)
{
    FGreyboxDesignMarkdownImportResult Result;

    FString Markdown;
    if (!FFileHelper::LoadFileToString(Markdown, *MarkdownPath))
    {
        Result.Errors.Add(FString::Printf(
            TEXT("Greybox DESIGN.md missing or unreadable: %s."), *MarkdownPath));
        return Result;
    }

    if (Markdown.Len() > MaxDesignMarkdownBytes)
    {
        Result.Errors.Add(FString::Printf(
            TEXT("Greybox DESIGN.md exceeds the %d-byte safety limit."), MaxDesignMarkdownBytes));
        return Result;
    }

    FString DesignId = FPaths::GetBaseFilename(FPaths::GetPath(MarkdownPath));
    if (DesignId.IsEmpty() || DesignId.Equals(TEXT("."), ESearchCase::IgnoreCase))
    {
        DesignId = TEXT("art-bible");
    }
    else
    {
        // Convert spaces/special chars to dashes for a safe ID
        DesignId.ReplaceInline(TEXT(" "), TEXT("-"));
    }

    const FString ContentRoot = OutputContentDir.IsEmpty() ? DefaultContentRoot() : OutputContentDir;

    // --- Extract palette ---
    Result.Colors = ExtractPaletteColors(Markdown);

    // --- Extract font ---
    Result.FontFamily = ExtractFontFamily(Markdown);

    // --- Extract art direction ---
    Result.ArtDirectionNotes = ExtractArtDirectionNotes(Markdown);

    // --- Extract headings (for the plan metadata) ---
    const TArray<FString> Sections = ExtractSectionHeadings(Markdown);

    // --- Build plan JSON ---
    TSharedRef<FJsonObject> Plan = MakeShared<FJsonObject>();
    Plan->SetStringField(TEXT("generator"), TEXT("Greybox"));
    Plan->SetStringField(TEXT("kind"), TEXT("art-bible"));
    Plan->SetStringField(TEXT("designId"), DesignId);
    Plan->SetStringField(TEXT("sourcePath"), MarkdownPath);
    Plan->SetStringField(TEXT("contentRoot"), ContentRoot);
    Plan->SetStringField(TEXT("unrealTarget"), TEXT("Editor import plan"));
    Plan->SetNumberField(TEXT("primaryObjectCount"), static_cast<double>(Result.Colors.Num()));
    Plan->SetNumberField(TEXT("colorCount"), static_cast<double>(Result.Colors.Num()));
    Plan->SetNumberField(TEXT("sectionCount"), static_cast<double>(Sections.Num()));
    Plan->SetStringField(TEXT("fontFamily"), Result.FontFamily);
    Plan->SetStringField(TEXT("artDirectionNotes"), Result.ArtDirectionNotes.Left(500));

    // Section list
    TArray<TSharedPtr<FJsonValue>> SectionEntries;
    SectionEntries.Reserve(Sections.Num());
    for (const FString& Section : Sections)
    {
        SectionEntries.Add(MakeShared<FJsonValueString>(Section));
    }
    Plan->SetArrayField(TEXT("sections"), SectionEntries);

    // Per-color entries
    TArray<TSharedPtr<FJsonValue>> ColorEntries;
    ColorEntries.Reserve(Result.Colors.Num());
    for (const FGreyboxArtBibleColor& Color : Result.Colors)
    {
        TSharedRef<FJsonObject> ColorObj = MakeShared<FJsonObject>();
        ColorObj->SetStringField(TEXT("hex"), Color.Hex);
        ColorObj->SetStringField(TEXT("name"), Color.Name);
        ColorObj->SetNumberField(TEXT("r"), Color.R);
        ColorObj->SetNumberField(TEXT("g"), Color.G);
        ColorObj->SetNumberField(TEXT("b"), Color.B);
        ColorObj->SetNumberField(TEXT("a"), Color.A);
        // Gamma-corrected for UE material use (sRGB → linear approximation)
        ColorObj->SetNumberField(TEXT("linearR"), FMath::Pow(Color.R, 2.2f));
        ColorObj->SetNumberField(TEXT("linearG"), FMath::Pow(Color.G, 2.2f));
        ColorObj->SetNumberField(TEXT("linearB"), FMath::Pow(Color.B, 2.2f));
        ColorObj->SetNumberField(TEXT("linearA"), Color.A);
        ColorObj->SetStringField(TEXT("unrealAssetPath"),
            ContentRoot + TEXT("/Materials/MI_Palette_") + Color.Name.Replace(TEXT(" "), TEXT("_")));
        ColorEntries.Add(MakeShared<FJsonValueObject>(ColorObj));
    }
    Plan->SetArrayField(TEXT("palette"), ColorEntries);

    // Warnings
    TArray<TSharedPtr<FJsonValue>> WarningEntries;
    for (const FString& Warning : Result.Warnings)
    {
        WarningEntries.Add(MakeShared<FJsonValueString>(Warning));
    }
    Plan->SetArrayField(TEXT("warnings"), WarningEntries);

    // Write plan to disk
    const FString PlanPath = DescriptorDiskPath(DesignId);
    FString PlanBody;
    const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&PlanBody);
    FJsonSerializer::Serialize(Plan, Writer);
    IFileManager::Get().MakeDirectory(*FPaths::GetPath(PlanPath), true);
    const bool bSaved = FFileHelper::SaveStringToFile(PlanBody, *PlanPath);

    if (!bSaved)
    {
        Result.Warnings.Add(FString::Printf(
            TEXT("Greybox Art Bible import plan could not be written to %s."), *PlanPath));
    }

    Result.ImportPlanPath = PlanPath;
    Result.bSucceeded = Result.Errors.Num() == 0 && bSaved;

    UE_LOG(LogGreyboxDesignMarkdownImporter, Log,
        TEXT("Greybox DESIGN.md '%s' import: %d palette colors, %d sections, font '%s'."),
        *DesignId,
        Result.Colors.Num(),
        Sections.Num(),
        *Result.FontFamily);

    return Result;
}
