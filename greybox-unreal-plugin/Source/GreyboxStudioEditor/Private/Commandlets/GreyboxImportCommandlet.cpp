// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

#include "Commandlets/GreyboxImportCommandlet.h"

#include "Importers/GreyboxProjectImporter.h"

DEFINE_LOG_CATEGORY_STATIC(LogGreyboxImportCommandlet, Log, All);

UGreyboxImportCommandlet::UGreyboxImportCommandlet()
{
    IsClient = false;
    IsEditor = true;
    IsServer = false;
    LogToConsole = true;
    ShowErrorCount = true;
}

int32 UGreyboxImportCommandlet::Main(const FString& Params)
{
    TArray<FString> Tokens;
    TArray<FString> Switches;
    TMap<FString, FString> ParsedSwitches;
    UCommandlet::ParseCommandLine(*Params, Tokens, Switches, ParsedSwitches);

    const FString* ProjectJson = ParsedSwitches.Find(TEXT("ProjectJson"));
    if (ProjectJson == nullptr || ProjectJson->IsEmpty())
    {
        UE_LOG(LogGreyboxImportCommandlet, Error, TEXT("Greybox import commandlet requires -ProjectJson=<path>."));
        return 2;
    }

    const FString* AssetBase = ParsedSwitches.Find(TEXT("AssetBase"));
    const FString* Output = ParsedSwitches.Find(TEXT("Output"));
    const FString ResolvedAssetBase = AssetBase != nullptr ? *AssetBase : FString();
    const FString ResolvedOutput = Output != nullptr ? *Output : FGreyboxProjectImporter::DefaultContentRoot();

    UE_LOG(LogGreyboxImportCommandlet, Log,
        TEXT("Greybox import: project=%s, assets=%s, output=%s"),
        **ProjectJson,
        *ResolvedAssetBase,
        *ResolvedOutput);

    const FGreyboxProjectImportResult Result = FGreyboxProjectImporter::ImportFromJson(
        *ProjectJson,
        ResolvedAssetBase,
        ResolvedOutput);
    for (const FString& Warning : Result.Warnings)
    {
        UE_LOG(LogGreyboxImportCommandlet, Warning, TEXT("%s"), *Warning);
    }
    for (const FString& Error : Result.Errors)
    {
        UE_LOG(LogGreyboxImportCommandlet, Error, TEXT("%s"), *Error);
    }
    UE_LOG(LogGreyboxImportCommandlet, Log,
        TEXT("Greybox import: %d primary objects, plan=%s, status=%s"),
        Result.PrimaryObjectCount,
        *Result.ImportPlanPath,
        Result.bSucceeded ? TEXT("OK") : TEXT("FAILED"));
    return Result.bSucceeded ? 0 : 1;
}
