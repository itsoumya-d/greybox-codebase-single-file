// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

#pragma once

#include "CoreMinimal.h"
#include "Templates/Function.h"

struct FGreyboxEnginePackageManifestFile
{
    FString Path;
    FString Language;
    FString Purpose;
    FString Sha256;
    int64 Bytes = 0;
};

struct FGreyboxEnginePackageManifest
{
    FString Generator;
    FString ProjectId;
    FString ProjectName;
    FString SourceFileName;
    FString Engine;
    TArray<FString> RuntimeHooks;
    int32 TerrainColliderCount = 0;
    int32 TerrainSculptPatchCount = 0;
    int32 DynamicEventCount = 0;
    int32 FactionCount = 0;
    TArray<FGreyboxEnginePackageManifestFile> Files;
    FString GeneratedAt;
};

struct FGreyboxEnginePackagePreflight
{
    FString ProjectId;
    FString ProjectName;
    FString Engine;
    FString SourceFileName;
    FString PackageFileName;
    int32 FileCount = 0;
    int64 SizeBytes = 0;
    FGreyboxEnginePackageManifest Manifest;
    int64 GeneratedAt = 0;

    bool IsReady() const;
};

class FGreyboxEnginePackagePreflightClient
{
public:
    explicit FGreyboxEnginePackagePreflightClient(FString InDaemonUrl);

    FString UnrealPreflightUrl(const FString& ProjectId) const;
    void FetchUnrealAsync(
        const FString& ProjectId,
        TFunction<void(bool bSucceeded, const FGreyboxEnginePackagePreflight& Preflight, const FString& Error)> Completion) const;

    static bool ParseResponseJson(
        const FString& Json,
        FGreyboxEnginePackagePreflight& OutPreflight,
        FString& OutError);

private:
    FString DaemonUrl;
};
