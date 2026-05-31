// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

#include "Importers/GreyboxScreenImporter.h"

#include "Dom/JsonObject.h"
#include "Dom/JsonValue.h"
#include "HAL/FileManager.h"
#include "Importers/GreyboxComponentImporter.h"
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

FString DescriptorDiskPath(const FString& ScreenId)
{
    return FPaths::Combine(
        FPaths::ProjectSavedDir(),
        TEXT("Greybox"),
        TEXT("ImportPlans"),
        TEXT("Screens"),
        ScreenId + TEXT(".greybox-screen.json"));
}
}

FString FGreyboxScreenImporter::LevelPackagePath(const FString& ContentRoot, const FString& ScreenId)
{
    return JoinPath(ContentRoot, TEXT("Levels/") + ScreenId);
}

FString FGreyboxScreenImporter::WidgetPackagePath(const FString& ContentRoot, const FString& ScreenId)
{
    return JoinPath(ContentRoot, FString::Printf(TEXT("Widgets/%s/WBP_%s"), *ScreenId, *ScreenId));
}

TArray<FGreyboxImportedAsset> FGreyboxScreenImporter::BuildScreenDescriptor(
    const FGreyboxScreenSpec& Screen,
    const FString& ContentRoot,
    TArray<FString>& OutWarnings)
{
    TArray<FGreyboxImportedAsset> Items;
    if (Screen.Id.IsEmpty())
    {
        OutWarnings.Add(TEXT("Greybox screen is missing an id and was skipped."));
        return Items;
    }

    const FString LevelPath = LevelPackagePath(ContentRoot, Screen.Id);
    const FString WidgetPath = WidgetPackagePath(ContentRoot, Screen.Id);

    FGreyboxImportedAsset LevelEntry;
    LevelEntry.PackagePath = LevelPath;
    LevelEntry.AssetKind = TEXT("Level");
    LevelEntry.SourceId = Screen.Id;
    Items.Add(LevelEntry);

    FGreyboxImportedAsset WidgetEntry;
    WidgetEntry.PackagePath = WidgetPath;
    WidgetEntry.AssetKind = TEXT("WidgetBlueprint");
    WidgetEntry.SourceId = Screen.Id;
    Items.Add(WidgetEntry);

    TSharedPtr<FJsonObject> ScreenDescriptor = MakeShared<FJsonObject>();
    ScreenDescriptor->SetStringField(TEXT("screenId"), Screen.Id);
    ScreenDescriptor->SetStringField(TEXT("screenName"), Screen.Name);
    ScreenDescriptor->SetStringField(TEXT("screenKind"), Screen.Kind);
    ScreenDescriptor->SetStringField(TEXT("levelPackagePath"), LevelPath);
    ScreenDescriptor->SetStringField(TEXT("widgetPackagePath"), WidgetPath);
    if (!Screen.BackgroundColorHex.IsEmpty())
    {
        const FLinearColor Color = FGreyboxComponentImporter::ParseHexColor(Screen.BackgroundColorHex);
        ScreenDescriptor->SetStringField(TEXT("backgroundColorHex"), Screen.BackgroundColorHex);
        ScreenDescriptor->SetNumberField(TEXT("backgroundColorR"), Color.R);
        ScreenDescriptor->SetNumberField(TEXT("backgroundColorG"), Color.G);
        ScreenDescriptor->SetNumberField(TEXT("backgroundColorB"), Color.B);
        ScreenDescriptor->SetNumberField(TEXT("backgroundColorA"), Color.A);
    }
    if (!Screen.BackgroundAssetRef.IsEmpty())
    {
        ScreenDescriptor->SetStringField(TEXT("backgroundAssetRef"), Screen.BackgroundAssetRef);
    }

    for (const FGreyboxComponentSpec& Component : Screen.Components)
    {
        TArray<FGreyboxImportedAsset> ComponentItems = FGreyboxComponentImporter::BuildComponentDescriptor(
            Component,
            ContentRoot,
            Screen.Id,
            ScreenDescriptor,
            OutWarnings);
        Items.Append(MoveTemp(ComponentItems));
    }

    const FString OnDiskDescriptor = DescriptorDiskPath(Screen.Id);
    FString DescriptorBody;
    const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&DescriptorBody);
    FJsonSerializer::Serialize(ScreenDescriptor.ToSharedRef(), Writer);
    IFileManager::Get().MakeDirectory(*FPaths::GetPath(OnDiskDescriptor), true);
    FFileHelper::SaveStringToFile(DescriptorBody, *OnDiskDescriptor);

    return Items;
}
