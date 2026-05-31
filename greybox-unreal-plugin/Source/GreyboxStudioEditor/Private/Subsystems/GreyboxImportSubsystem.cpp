// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

#include "Subsystems/GreyboxImportSubsystem.h"

#include "Importers/GreyboxProjectImporter.h"

FGreyboxProjectImportResult UGreyboxImportSubsystem::ImportProject(
    const FString& JsonPath,
    const FString& AssetBaseDir,
    const FString& OutputContentDir)
{
    return FGreyboxProjectImporter::ImportFromJson(JsonPath, AssetBaseDir, OutputContentDir);
}
