// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

#pragma once

#include "CoreMinimal.h"
#include "Templates/Function.h"

struct FGreyboxEnginePackageStageResult
{
    bool bSucceeded = false;
    FString PackagePath;
    FString ImportRoot;
    FString Message;
    int64 BytesWritten = 0;
    int32 ExtractedFileCount = 0;
};

class FGreyboxEnginePackageImporter
{
public:
    static FString SafeFileName(const FString& FileName);
    static FString DefaultPackageCacheDir();
    static FString DefaultImportRoot();
    static bool IsSafePackageEntryPath(const FString& EntryPath, FString& OutRelativePath);
    static bool ExtractStoredZipPackage(
        const TArray<uint8>& Content,
        const FString& ImportRoot,
        int32& OutExtractedFileCount,
        FString& OutError);
    static bool StageDownloadedPackage(
        const FString& FileName,
        const TArray<uint8>& Content,
        FGreyboxEnginePackageStageResult& OutResult);

    static void DownloadAndStageUnrealPackageAsync(
        const FString& DaemonUrl,
        const FString& ProjectId,
        const FString& PackageFileName,
        TFunction<void(const FGreyboxEnginePackageStageResult& Result)> Completion);
};
