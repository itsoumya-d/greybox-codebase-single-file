// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

#pragma once

#include "CoreMinimal.h"

struct FGreyboxImportResult
{
    bool bSucceeded = false;
    FString AssetPath;
    FString PlanPath;
    FString Message;
    int32 PrimaryObjectCount = 0;
};

class FGreyboxArtifactImporters
{
public:
    static FString BuildGameViewPlanJson(const FString& SourceJson, const FString& SourcePath, const FString& DestinationPath);
    static FString BuildArtBiblePlanJson(const FString& SourceMarkdown, const FString& SourcePath, const FString& DestinationPath);
    static FString BuildHudPlanJson(const FString& SourceHtml, const FString& SourcePath, const FString& DestinationPath);
    static FString BuildLevelBoardPlanJson(const FString& SourceJson, const FString& SourcePath, const FString& DestinationPath);

    static FGreyboxImportResult ImportGameViewJson(const FString& SourcePath, const FString& DestinationPath);
    static FGreyboxImportResult ImportArtBibleMarkdown(const FString& SourcePath, const FString& DestinationPath);
    static FGreyboxImportResult ImportHudHtml(const FString& SourcePath, const FString& DestinationPath);
    static FGreyboxImportResult ImportLevelBoardJson(const FString& SourcePath, const FString& DestinationPath);
};
