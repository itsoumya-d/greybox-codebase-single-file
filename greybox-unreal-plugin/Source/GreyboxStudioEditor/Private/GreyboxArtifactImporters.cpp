// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

#include "GreyboxArtifactImporters.h"

#include "Dom/JsonObject.h"
#include "HAL/FileManager.h"
#include "Internationalization/Regex.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"

namespace
{
int32 CountJsonArray(const TSharedPtr<FJsonObject>& Root, const TCHAR* FieldName)
{
    const TArray<TSharedPtr<FJsonValue>>* Items = nullptr;
    return Root.IsValid() && Root->TryGetArrayField(FieldName, Items) && Items != nullptr ? Items->Num() : 0;
}

int32 CountSubstring(const FString& Haystack, const FString& Needle)
{
    if (Needle.IsEmpty())
    {
        return 0;
    }

    int32 Count = 0;
    int32 SearchFrom = Haystack.Find(*Needle, ESearchCase::IgnoreCase, ESearchDir::FromStart, 0);
    while (SearchFrom != INDEX_NONE)
    {
        ++Count;
        SearchFrom = Haystack.Find(*Needle, ESearchCase::IgnoreCase, ESearchDir::FromStart, SearchFrom + Needle.Len());
    }
    return Count;
}

int32 CountRegexMatches(const FString& Text, const FString& PatternText)
{
    const FRegexPattern Pattern(PatternText);
    FRegexMatcher Matcher(Pattern, Text);
    int32 Count = 0;
    while (Matcher.FindNext())
    {
        ++Count;
    }
    return Count;
}

FString DestinationPlanPath(const FString& DestinationPath)
{
    FString Clean = DestinationPath;
    Clean.TrimStartAndEndInline();
    if (Clean.IsEmpty())
    {
        Clean = FPaths::Combine(FPaths::ProjectSavedDir(), TEXT("Greybox"), TEXT("ImportPlans"), TEXT("greybox-import.greybox-plan.json"));
    }
    else if (Clean.StartsWith(TEXT("/Game/")))
    {
        Clean = FPaths::Combine(FPaths::ProjectContentDir(), Clean.RightChop(6));
    }

    if (FPaths::GetExtension(Clean).IsEmpty())
    {
        Clean += TEXT(".greybox-plan.json");
    }
    return FPaths::ConvertRelativePathToFull(Clean);
}

FString SerializePlan(const TSharedRef<FJsonObject>& Plan)
{
    FString Json;
    const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Json);
    FJsonSerializer::Serialize(Plan, Writer);
    return Json;
}

TSharedRef<FJsonObject> BasePlan(const TCHAR* Kind, const FString& SourcePath, const FString& DestinationPath)
{
    TSharedRef<FJsonObject> Plan = MakeShared<FJsonObject>();
    Plan->SetStringField(TEXT("generator"), TEXT("Greybox"));
    Plan->SetStringField(TEXT("kind"), Kind);
    Plan->SetStringField(TEXT("sourcePath"), SourcePath);
    Plan->SetStringField(TEXT("destinationPath"), DestinationPath);
    Plan->SetStringField(TEXT("unrealTarget"), TEXT("Editor import plan"));
    return Plan;
}

bool ParseJsonObject(const FString& SourceJson, TSharedPtr<FJsonObject>& OutRoot)
{
    const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(SourceJson);
    return FJsonSerializer::Deserialize(Reader, OutRoot) && OutRoot.IsValid();
}

FGreyboxImportResult ImportPlan(
    const FString& SourcePath,
    const FString& DestinationPath,
    const TCHAR* Kind,
    FString (*BuildPlan)(const FString&, const FString&, const FString&))
{
    FGreyboxImportResult Result;
    Result.AssetPath = DestinationPath;
    Result.PlanPath = DestinationPlanPath(DestinationPath);

    FString SourceBody;
    if (!FFileHelper::LoadFileToString(SourceBody, *SourcePath))
    {
        Result.Message = FString::Printf(TEXT("Greybox %s source file is missing or unreadable: %s."), Kind, *SourcePath);
        return Result;
    }

    const FString PlanJson = BuildPlan(SourceBody, SourcePath, DestinationPath);
    if (PlanJson.IsEmpty())
    {
        Result.Message = FString::Printf(TEXT("Greybox %s source could not be parsed into an Unreal import plan: %s."), Kind, *SourcePath);
        return Result;
    }

    IFileManager::Get().MakeDirectory(*FPaths::GetPath(Result.PlanPath), true);
    Result.bSucceeded = FFileHelper::SaveStringToFile(PlanJson, *Result.PlanPath);
    TSharedPtr<FJsonObject> PlanRoot;
    if (ParseJsonObject(PlanJson, PlanRoot))
    {
        double PrimaryObjectCount = 0.0;
        if (PlanRoot->TryGetNumberField(TEXT("primaryObjectCount"), PrimaryObjectCount))
        {
            Result.PrimaryObjectCount = static_cast<int32>(PrimaryObjectCount);
        }
    }
    Result.Message = Result.bSucceeded
        ? FString::Printf(TEXT("Wrote Greybox %s Unreal import plan to %s."), Kind, *Result.PlanPath)
        : FString::Printf(TEXT("Greybox could not write %s Unreal import plan to %s."), Kind, *Result.PlanPath);
    return Result;
}
}

FString FGreyboxArtifactImporters::BuildGameViewPlanJson(const FString& SourceJson, const FString& SourcePath, const FString& DestinationPath)
{
    TSharedPtr<FJsonObject> Root;
    if (!ParseJsonObject(SourceJson, Root))
    {
        return FString();
    }

    TSharedRef<FJsonObject> Plan = BasePlan(TEXT("gameview"), SourcePath, DestinationPath);
    FString Title;
    Root->TryGetStringField(TEXT("title"), Title);
    const int32 ActorCount = CountJsonArray(Root, TEXT("actors"));
    const int32 SpawnPointCount = CountJsonArray(Root, TEXT("spawnPoints"));
    const int32 ObjectiveCount = CountJsonArray(Root, TEXT("objectives"));
    const int32 HazardCount = CountJsonArray(Root, TEXT("hazards"));
    Plan->SetStringField(TEXT("title"), Title);
    Plan->SetNumberField(TEXT("primaryObjectCount"), ActorCount + SpawnPointCount + ObjectiveCount + HazardCount);
    Plan->SetNumberField(TEXT("actorCount"), ActorCount);
    Plan->SetNumberField(TEXT("spawnPointCount"), SpawnPointCount);
    Plan->SetNumberField(TEXT("objectiveCount"), ObjectiveCount);
    Plan->SetNumberField(TEXT("hazardCount"), HazardCount);
    Plan->SetStringField(TEXT("output"), TEXT("Actor hierarchy plus Blueprint placement plan"));
    return SerializePlan(Plan);
}

FString FGreyboxArtifactImporters::BuildArtBiblePlanJson(const FString& SourceMarkdown, const FString& SourcePath, const FString& DestinationPath)
{
    TSharedRef<FJsonObject> Plan = BasePlan(TEXT("art-bible"), SourcePath, DestinationPath);
    const int32 ColorCount = CountRegexMatches(SourceMarkdown, TEXT("#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?"));
    Plan->SetNumberField(TEXT("primaryObjectCount"), ColorCount);
    Plan->SetNumberField(TEXT("colorCount"), ColorCount);
    Plan->SetNumberField(TEXT("sectionCount"), CountRegexMatches(SourceMarkdown, TEXT("(?m)^#{1,3} ")));
    Plan->SetStringField(TEXT("output"), TEXT("UDataAsset palette and material guidance plan"));
    return SerializePlan(Plan);
}

FString FGreyboxArtifactImporters::BuildHudPlanJson(const FString& SourceHtml, const FString& SourcePath, const FString& DestinationPath)
{
    TSharedRef<FJsonObject> Plan = BasePlan(TEXT("hud-layout"), SourcePath, DestinationPath);
    const int32 SlotCount = CountSubstring(SourceHtml, TEXT("data-agds-id"));
    Plan->SetNumberField(TEXT("primaryObjectCount"), SlotCount);
    Plan->SetNumberField(TEXT("slotCount"), SlotCount);
    Plan->SetNumberField(TEXT("panelCount"), CountSubstring(SourceHtml, TEXT("data-greybox-artifact")));
    Plan->SetStringField(TEXT("output"), TEXT("UMG Widget Blueprint plan"));
    return SerializePlan(Plan);
}

FString FGreyboxArtifactImporters::BuildLevelBoardPlanJson(const FString& SourceJson, const FString& SourcePath, const FString& DestinationPath)
{
    TSharedPtr<FJsonObject> Root;
    if (!ParseJsonObject(SourceJson, Root))
    {
        return FString();
    }

    TSharedRef<FJsonObject> Plan = BasePlan(TEXT("level-board"), SourcePath, DestinationPath);
    FString Title;
    Root->TryGetStringField(TEXT("title"), Title);
    const int32 RoomCount = CountJsonArray(Root, TEXT("rooms"));
    const int32 EncounterCount = CountJsonArray(Root, TEXT("encounters"));
    const int32 ConnectionCount = CountJsonArray(Root, TEXT("connections"));
    Plan->SetStringField(TEXT("title"), Title);
    Plan->SetNumberField(TEXT("primaryObjectCount"), RoomCount + EncounterCount + ConnectionCount);
    Plan->SetNumberField(TEXT("roomCount"), RoomCount);
    Plan->SetNumberField(TEXT("encounterCount"), EncounterCount);
    Plan->SetNumberField(TEXT("connectionCount"), ConnectionCount);
    Plan->SetStringField(TEXT("output"), TEXT("Paper2D TileMap or Level layout plan"));
    return SerializePlan(Plan);
}

FGreyboxImportResult FGreyboxArtifactImporters::ImportGameViewJson(const FString& SourcePath, const FString& DestinationPath)
{
    return ImportPlan(SourcePath, DestinationPath, TEXT(".gameview.json actor tree / Blueprint"), &FGreyboxArtifactImporters::BuildGameViewPlanJson);
}

FGreyboxImportResult FGreyboxArtifactImporters::ImportArtBibleMarkdown(const FString& SourcePath, const FString& DestinationPath)
{
    return ImportPlan(SourcePath, DestinationPath, TEXT("DESIGN.md art bible / UDataAsset palette"), &FGreyboxArtifactImporters::BuildArtBiblePlanJson);
}

FGreyboxImportResult FGreyboxArtifactImporters::ImportHudHtml(const FString& SourcePath, const FString& DestinationPath)
{
    return ImportPlan(SourcePath, DestinationPath, TEXT("HUD HTML / UMG Widget Blueprint"), &FGreyboxArtifactImporters::BuildHudPlanJson);
}

FGreyboxImportResult FGreyboxArtifactImporters::ImportLevelBoardJson(const FString& SourcePath, const FString& DestinationPath)
{
    return ImportPlan(SourcePath, DestinationPath, TEXT("level board JSON / Paper2D TileMap or Level"), &FGreyboxArtifactImporters::BuildLevelBoardPlanJson);
}
