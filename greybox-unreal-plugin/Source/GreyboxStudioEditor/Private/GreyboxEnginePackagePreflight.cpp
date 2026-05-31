// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

#include "GreyboxEnginePackagePreflight.h"

#include "Dom/JsonObject.h"
#include "GenericPlatform/GenericPlatformHttp.h"
#include "HttpModule.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

namespace
{
FString NormalizedDaemonUrl(FString Url)
{
    Url.TrimStartAndEndInline();
    while (Url.EndsWith(TEXT("/")))
    {
        Url.LeftChopInline(1);
    }
    return Url.IsEmpty() ? TEXT("http://127.0.0.1:17345") : Url;
}

int32 JsonInt(const FJsonObject& Object, const TCHAR* FieldName)
{
    double Value = 0;
    return Object.TryGetNumberField(FieldName, Value) ? static_cast<int32>(Value) : 0;
}

int64 JsonInt64(const FJsonObject& Object, const TCHAR* FieldName)
{
    double Value = 0;
    return Object.TryGetNumberField(FieldName, Value) ? static_cast<int64>(Value) : 0;
}

void ReadStringArray(const FJsonObject& Object, const TCHAR* FieldName, TArray<FString>& OutValues)
{
    const TArray<TSharedPtr<FJsonValue>>* Values = nullptr;
    if (!Object.TryGetArrayField(FieldName, Values) || Values == nullptr)
    {
        return;
    }
    for (const TSharedPtr<FJsonValue>& Value : *Values)
    {
        FString Text;
        if (Value.IsValid() && Value->TryGetString(Text))
        {
            OutValues.Add(Text);
        }
    }
}

void ReadManifestFiles(const FJsonObject& Object, TArray<FGreyboxEnginePackageManifestFile>& OutFiles)
{
    const TArray<TSharedPtr<FJsonValue>>* Values = nullptr;
    if (!Object.TryGetArrayField(TEXT("files"), Values) || Values == nullptr)
    {
        return;
    }
    for (const TSharedPtr<FJsonValue>& Value : *Values)
    {
        const TSharedPtr<FJsonObject> FileObject = Value.IsValid() ? Value->AsObject() : nullptr;
        if (!FileObject.IsValid())
        {
            continue;
        }
        FGreyboxEnginePackageManifestFile File;
        FileObject->TryGetStringField(TEXT("path"), File.Path);
        FileObject->TryGetStringField(TEXT("language"), File.Language);
        FileObject->TryGetStringField(TEXT("purpose"), File.Purpose);
        FileObject->TryGetStringField(TEXT("sha256"), File.Sha256);
        File.Bytes = JsonInt64(*FileObject, TEXT("bytes"));
        OutFiles.Add(MoveTemp(File));
    }
}

void ReadManifest(const FJsonObject& Object, FGreyboxEnginePackageManifest& OutManifest)
{
    Object.TryGetStringField(TEXT("generator"), OutManifest.Generator);
    Object.TryGetStringField(TEXT("projectId"), OutManifest.ProjectId);
    Object.TryGetStringField(TEXT("projectName"), OutManifest.ProjectName);
    Object.TryGetStringField(TEXT("sourceFileName"), OutManifest.SourceFileName);
    Object.TryGetStringField(TEXT("engine"), OutManifest.Engine);
    ReadStringArray(Object, TEXT("runtimeHooks"), OutManifest.RuntimeHooks);
    OutManifest.TerrainColliderCount = JsonInt(Object, TEXT("terrainColliderCount"));
    OutManifest.TerrainSculptPatchCount = JsonInt(Object, TEXT("terrainSculptPatchCount"));
    OutManifest.DynamicEventCount = JsonInt(Object, TEXT("dynamicEventCount"));
    OutManifest.FactionCount = JsonInt(Object, TEXT("factionCount"));
    ReadManifestFiles(Object, OutManifest.Files);
    Object.TryGetStringField(TEXT("generatedAt"), OutManifest.GeneratedAt);
}
}

bool FGreyboxEnginePackagePreflight::IsReady() const
{
    return Engine == TEXT("unreal")
        && !ProjectId.IsEmpty()
        && !SourceFileName.IsEmpty()
        && !PackageFileName.IsEmpty()
        && FileCount > 0
        && SizeBytes > 0
        && Manifest.Files.Num() > 0;
}

FGreyboxEnginePackagePreflightClient::FGreyboxEnginePackagePreflightClient(FString InDaemonUrl)
    : DaemonUrl(NormalizedDaemonUrl(MoveTemp(InDaemonUrl)))
{
}

FString FGreyboxEnginePackagePreflightClient::UnrealPreflightUrl(const FString& ProjectId) const
{
    return FString::Printf(
        TEXT("%s/api/game-deliverables/%s/engine-package/unreal/preflight"),
        *DaemonUrl,
        *FGenericPlatformHttp::UrlEncode(ProjectId));
}

void FGreyboxEnginePackagePreflightClient::FetchUnrealAsync(
    const FString& ProjectId,
    TFunction<void(bool bSucceeded, const FGreyboxEnginePackagePreflight& Preflight, const FString& Error)> Completion) const
{
    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
    Request->SetURL(UnrealPreflightUrl(ProjectId));
    Request->SetVerb(TEXT("GET"));
    Request->SetHeader(TEXT("Accept"), TEXT("application/json"));
    Request->OnProcessRequestComplete().BindLambda(
        [Completion = MoveTemp(Completion)](
            FHttpRequestPtr,
            FHttpResponsePtr Response,
            bool bRequestSucceeded) mutable
        {
            FGreyboxEnginePackagePreflight Preflight;
            FString Error;
            if (!bRequestSucceeded || !Response.IsValid())
            {
                Completion(false, Preflight, TEXT("Greybox Unreal engine-package preflight request failed."));
                return;
            }
            if (Response->GetResponseCode() < 200 || Response->GetResponseCode() >= 300)
            {
                Completion(false, Preflight, FString::Printf(
                    TEXT("Greybox Unreal engine-package preflight returned HTTP %d."),
                    Response->GetResponseCode()));
                return;
            }
            const bool bParsed = ParseResponseJson(Response->GetContentAsString(), Preflight, Error);
            Completion(bParsed && Preflight.IsReady(), Preflight, bParsed ? Error : Error);
        });
    Request->ProcessRequest();
}

bool FGreyboxEnginePackagePreflightClient::ParseResponseJson(
    const FString& Json,
    FGreyboxEnginePackagePreflight& OutPreflight,
    FString& OutError)
{
    TSharedPtr<FJsonObject> Root;
    const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Json);
    if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid())
    {
        OutError = TEXT("Greybox Unreal engine-package preflight response was not valid JSON.");
        return false;
    }

    Root->TryGetStringField(TEXT("projectId"), OutPreflight.ProjectId);
    Root->TryGetStringField(TEXT("projectName"), OutPreflight.ProjectName);
    Root->TryGetStringField(TEXT("engine"), OutPreflight.Engine);
    Root->TryGetStringField(TEXT("sourceFileName"), OutPreflight.SourceFileName);
    Root->TryGetStringField(TEXT("packageFileName"), OutPreflight.PackageFileName);
    OutPreflight.FileCount = JsonInt(*Root, TEXT("fileCount"));
    OutPreflight.SizeBytes = JsonInt64(*Root, TEXT("sizeBytes"));
    OutPreflight.GeneratedAt = JsonInt64(*Root, TEXT("generatedAt"));

    const TSharedPtr<FJsonObject>* ManifestObject = nullptr;
    if (Root->TryGetObjectField(TEXT("manifest"), ManifestObject) && ManifestObject != nullptr && ManifestObject->IsValid())
    {
        ReadManifest(**ManifestObject, OutPreflight.Manifest);
    }

    if (!OutPreflight.IsReady())
    {
        OutError = TEXT("Greybox Unreal engine-package preflight is missing package readiness fields.");
        return false;
    }
    OutError.Empty();
    return true;
}
