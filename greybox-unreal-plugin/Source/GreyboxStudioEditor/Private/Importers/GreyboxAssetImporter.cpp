// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

#include "Importers/GreyboxAssetImporter.h"

#include "Dom/JsonObject.h"
#include "HAL/FileManager.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"

namespace
{
FString JoinPath(const FString& Root, const FString& Tail)
{
    if (Root.IsEmpty())
    {
        return Tail;
    }
    if (Tail.IsEmpty())
    {
        return Root;
    }
    return Root.EndsWith(TEXT("/")) ? Root + Tail : Root + TEXT("/") + Tail;
}

FString DescriptorDiskPath(const FString& AssetId)
{
    return FPaths::Combine(
        FPaths::ProjectSavedDir(),
        TEXT("Greybox"),
        TEXT("ImportPlans"),
        TEXT("Assets"),
        AssetId + TEXT(".greybox-asset.json"));
}
}

FString FGreyboxAssetImporter::PackagePathForAsset(const FString& ContentRoot, const FString& AssetId)
{
    return JoinPath(ContentRoot, TEXT("Assets/") + AssetId);
}

FString FGreyboxAssetImporter::UnrealAssetClassForType(const FString& Type)
{
    if (Type == TEXT("gltf") || Type == TEXT("fbx"))
    {
        return TEXT("SkeletalMesh|StaticMesh");
    }
    if (Type == TEXT("png") || Type == TEXT("jpg") || Type == TEXT("webp"))
    {
        return TEXT("Texture2D");
    }
    if (Type == TEXT("mp3") || Type == TEXT("wav"))
    {
        return TEXT("SoundWave");
    }
    if (Type == TEXT("prefab"))
    {
        return TEXT("Blueprint");
    }
    if (Type == TEXT("json"))
    {
        return TEXT("DataAsset");
    }
    return TEXT("Unknown");
}

FGreyboxImportedAsset FGreyboxAssetImporter::BuildAssetDescriptor(
    const FGreyboxAssetSpec& Asset,
    const FString& AssetBaseDir,
    const FString& ContentRoot,
    TArray<FString>& OutWarnings)
{
    FGreyboxImportedAsset Imported;
    Imported.SourceId = Asset.Id;
    Imported.PackagePath = PackagePathForAsset(ContentRoot, Asset.Id);
    Imported.AssetKind = FString::Printf(TEXT("Asset.%s"), *Asset.Type);

    const FString UnrealClass = UnrealAssetClassForType(Asset.Type);
    if (UnrealClass == TEXT("Unknown"))
    {
        OutWarnings.Add(FString::Printf(
            TEXT("Asset '%s' has unknown type '%s' and was emitted as a raw blob descriptor."),
            *Asset.Id,
            *Asset.Type));
    }

    FString ResolvedUri = Asset.Uri;
    if (!ResolvedUri.StartsWith(TEXT("http://")) && !ResolvedUri.StartsWith(TEXT("https://")) && !AssetBaseDir.IsEmpty())
    {
        ResolvedUri = FPaths::Combine(AssetBaseDir, Asset.Uri);
        ResolvedUri = FPaths::ConvertRelativePathToFull(ResolvedUri);
    }

    TSharedRef<FJsonObject> Descriptor = MakeShared<FJsonObject>();
    Descriptor->SetStringField(TEXT("assetId"), Asset.Id);
    Descriptor->SetStringField(TEXT("type"), Asset.Type);
    Descriptor->SetStringField(TEXT("displayName"), Asset.DisplayName);
    Descriptor->SetStringField(TEXT("uri"), Asset.Uri);
    Descriptor->SetStringField(TEXT("resolvedUri"), ResolvedUri);
    Descriptor->SetStringField(TEXT("sha256"), Asset.Sha256);
    Descriptor->SetNumberField(TEXT("sizeBytes"), static_cast<double>(Asset.SizeBytes));
    Descriptor->SetStringField(TEXT("unrealAssetClass"), UnrealClass);
    Descriptor->SetStringField(TEXT("unrealPackagePath"), Imported.PackagePath);

    const FString DescriptorPath = DescriptorDiskPath(Asset.Id);
    FString DescriptorBody;
    const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&DescriptorBody);
    FJsonSerializer::Serialize(Descriptor, Writer);
    IFileManager::Get().MakeDirectory(*FPaths::GetPath(DescriptorPath), true);
    FFileHelper::SaveStringToFile(DescriptorBody, *DescriptorPath);

    return Imported;
}
