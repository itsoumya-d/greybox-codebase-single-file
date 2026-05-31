// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

#include "Importers/GreyboxComponentImporter.h"
#include "Importers/GreyboxProjectImporter.h"
#include "Importers/GreyboxScreenImporter.h"

#include "HAL/FileManager.h"
#include "Misc/AutomationTest.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"

#if WITH_DEV_AUTOMATION_TESTS

namespace
{
const TCHAR* SampleGameProjectJson = TEXT(R"({
  "schemaVersion": "0.1.0",
  "meta": {
    "id": "proj-stream4-fixture",
    "name": "Stream 4 Fixture",
    "version": "0.1.0",
    "genre": "platformer",
    "targetEngines": ["unreal"],
    "platforms": ["windows"]
  },
  "art": {
    "palette": { "name": "default", "colors": [{ "role": "primary", "hex": "#ff0000" }] },
    "typography": { "styles": [{ "role": "body", "family": "Inter", "size": 16, "weight": 400, "lineHeight": 1.4 }] },
    "materials": []
  },
  "exportPolicy": {},
  "assets": [
    { "id": "asset-icon", "type": "png", "uri": "assets/icon.png", "sha256": "0000000000000000000000000000000000000000000000000000000000000000", "sizeBytes": 0, "provenance": { "license": "CC-BY-4.0", "source": "user-upload" } },
    { "id": "asset-character", "type": "gltf", "uri": "assets/character.glb", "sha256": "1111111111111111111111111111111111111111111111111111111111111111", "sizeBytes": 0, "provenance": { "license": "CC-BY-4.0", "source": "tripo3d" } }
  ],
  "characters": [
    {
      "id": "char-hero",
      "name": "Hero",
      "meshRef": "asset-character",
      "rig": { "joints": [{ "name": "mixamorig:Hips", "parent": null }, { "name": "customBone", "parent": "mixamorig:Hips" }] },
      "animations": [{ "id": "anim-idle", "name": "idle", "clipRef": "asset-character", "duration": 1.0, "loop": true }],
      "gameStats": { "hp": 100, "speed": 5, "damage": 10, "defense": 2 },
      "provenance": { "license": "CC-BY-4.0" }
    }
  ],
  "screens": [
    {
      "id": "main-menu",
      "name": "Main Menu",
      "kind": "main-menu",
      "background": { "type": "color", "color": "#101820" },
      "components": [
        { "id": "btn-play", "kind": "Button", "name": "Play", "transform": { "position": { "x": 0, "y": 1, "z": 2 }, "rotation": { "x": 0, "y": 0, "z": 0 }, "scale": { "x": 1, "y": 1, "z": 1 } }, "label": "Play", "onClickEvent": "navigate.gameplay" },
        { "id": "txt-title", "kind": "Text", "name": "Title", "transform": { "position": { "x": 0, "y": 2, "z": 0 }, "rotation": { "x": 0, "y": 0, "z": 0 }, "scale": { "x": 1, "y": 1, "z": 1 } }, "content": "Greybox Studio", "color": "#ffffff" },
        { "id": "img-banner", "kind": "Image", "name": "Banner", "transform": { "position": { "x": 0, "y": 0, "z": 0 }, "rotation": { "x": 0, "y": 0, "z": 0 }, "scale": { "x": 1, "y": 1, "z": 1 } }, "assetRef": "asset-icon" }
      ]
    },
    {
      "id": "gameplay",
      "name": "Gameplay",
      "kind": "gameplay",
      "components": [
        { "id": "hero", "kind": "Character3DRef", "name": "Hero", "transform": { "position": { "x": 0, "y": 0, "z": 0 }, "rotation": { "x": 0, "y": 0, "z": 0 }, "scale": { "x": 1, "y": 1, "z": 1 } }, "characterRef": "char-hero", "initialAnimation": "idle" },
        { "id": "cam-main", "kind": "Camera", "name": "Camera", "transform": { "position": { "x": 0, "y": 1, "z": -5 }, "rotation": { "x": 0, "y": 0, "z": 0 }, "scale": { "x": 1, "y": 1, "z": 1 } }, "fov": 75, "isMain": true },
        { "id": "sun", "kind": "Light", "name": "Sun", "transform": { "position": { "x": 0, "y": 10, "z": 0 }, "rotation": { "x": -45, "y": 0, "z": 0 }, "scale": { "x": 1, "y": 1, "z": 1 } }, "lightType": "directional", "color": "#ffffff", "intensity": 3 },
        { "id": "hp-bar", "kind": "HUDBar", "name": "HP", "transform": { "position": { "x": 0, "y": 0, "z": 0 }, "rotation": { "x": 0, "y": 0, "z": 0 }, "scale": { "x": 1, "y": 1, "z": 1 } }, "statKey": "hp" },
        { "id": "checkpoint-1", "kind": "Checkpoint", "name": "Checkpoint 1", "transform": { "position": { "x": 10, "y": 0, "z": 0 }, "rotation": { "x": 0, "y": 0, "z": 0 }, "scale": { "x": 1, "y": 1, "z": 1 } }, "checkpointId": "cp1" }
      ]
    }
  ],
  "flow": [
    { "id": "edge-play", "from": "main-menu", "to": "gameplay", "trigger": { "type": "tap", "componentRef": "btn-play" } }
  ]
})");
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FGreyboxProjectImporterParsesFixtureTest,
    "Greybox.ProjectImporter.ParsesFixture",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FGreyboxProjectImporterParsesFixtureTest::RunTest(const FString& Parameters)
{
    FGreyboxGameProjectSpec Spec;
    TArray<FString> Errors;
    TestTrue(
        TEXT("fixture project parses"),
        FGreyboxProjectImporter::ParseProjectSpec(SampleGameProjectJson, Spec, Errors));
    TestEqual(TEXT("schema version captured"), Spec.SchemaVersion, FString(TEXT("0.1.0")));
    TestEqual(TEXT("project id captured"), Spec.Meta.Id, FString(TEXT("proj-stream4-fixture")));
    TestEqual(TEXT("two screens"), Spec.Screens.Num(), 2);
    TestEqual(TEXT("first screen has three components"), Spec.Screens[0].Components.Num(), 3);
    TestEqual(TEXT("one flow edge"), Spec.Flow.Num(), 1);
    TestEqual(TEXT("one character"), Spec.Characters.Num(), 1);
    TestEqual(TEXT("two assets"), Spec.Assets.Num(), 2);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FGreyboxProjectImporterRoundTripTest,
    "Greybox.ProjectImporter.RoundTrip",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FGreyboxProjectImporterRoundTripTest::RunTest(const FString& Parameters)
{
    const FString WorkingDir = FPaths::Combine(FPaths::ProjectIntermediateDir(), TEXT("GreyboxProjectImporterRoundTripTest"));
    IFileManager::Get().DeleteDirectory(*WorkingDir, false, true);
    IFileManager::Get().MakeDirectory(*WorkingDir, true);

    const FString JsonPath = FPaths::Combine(WorkingDir, TEXT("project.json"));
    TestTrue(
        TEXT("fixture written"),
        FFileHelper::SaveStringToFile(SampleGameProjectJson, *JsonPath));

    const FString AssetBase = FPaths::Combine(WorkingDir, TEXT("assets"));
    IFileManager::Get().MakeDirectory(*AssetBase, true);
    FFileHelper::SaveStringToFile(TEXT("PNG-placeholder"), *FPaths::Combine(AssetBase, TEXT("icon.png")));
    FFileHelper::SaveStringToFile(TEXT("glTF-placeholder"), *FPaths::Combine(AssetBase, TEXT("character.glb")));

    const FGreyboxProjectImportResult Result = FGreyboxProjectImporter::ImportFromJson(JsonPath, AssetBase, TEXT("/Game/Greybox"));
    TestTrue(TEXT("import succeeded"), Result.bSucceeded);
    TestTrue(TEXT("primary objects emitted"), Result.PrimaryObjectCount >= 12);
    TestTrue(TEXT("plan written"), FPaths::FileExists(Result.ImportPlanPath));
    TestEqual(
        TEXT("first level path"),
        Result.FirstLevelPackagePath,
        FString(TEXT("/Game/Greybox/Levels/main-menu")));

    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FGreyboxComponentImporterMapsButtonTest,
    "Greybox.ComponentImporter.MapsButton",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FGreyboxComponentImporterMapsButtonTest::RunTest(const FString& Parameters)
{
    FGreyboxComponentSpec Spec;
    Spec.Id = TEXT("btn-play");
    Spec.Kind = TEXT("Button");
    Spec.Name = TEXT("Play");
    Spec.StringProperties.Add(TEXT("label"), TEXT("Play"));
    Spec.StringProperties.Add(TEXT("onClickEvent"), TEXT("navigate.gameplay"));

    TSharedPtr<FJsonObject> ScreenDescriptor = MakeShared<FJsonObject>();
    TArray<FString> Warnings;
    const TArray<FGreyboxImportedAsset> Items = FGreyboxComponentImporter::BuildComponentDescriptor(
        Spec,
        TEXT("/Game/Greybox"),
        TEXT("main-menu"),
        ScreenDescriptor,
        Warnings);
    TestEqual(TEXT("one imported asset"), Items.Num(), 1);
    TestEqual(TEXT("emitted UMG button slot"), Items[0].AssetKind, FString(TEXT("UMG.Button")));
    TestTrue(TEXT("widgets bucket populated"), ScreenDescriptor->HasField(TEXT("widgets")));
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FGreyboxComponentImporterClassifiesKindsTest,
    "Greybox.ComponentImporter.ClassifiesKinds",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FGreyboxComponentImporterClassifiesKindsTest::RunTest(const FString& Parameters)
{
    TestTrue(TEXT("Button is UMG"), FGreyboxComponentImporter::IsUmgComponentKind(TEXT("Button")));
    TestTrue(TEXT("Image is UMG"), FGreyboxComponentImporter::IsUmgComponentKind(TEXT("Image")));
    TestTrue(TEXT("Light is Level"), FGreyboxComponentImporter::IsLevelComponentKind(TEXT("Light")));
    TestTrue(TEXT("Camera is Level"), FGreyboxComponentImporter::IsLevelComponentKind(TEXT("Camera")));
    TestFalse(TEXT("Button is not Level"), FGreyboxComponentImporter::IsLevelComponentKind(TEXT("Button")));
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FGreyboxComponentImporterParsesColorTest,
    "Greybox.ComponentImporter.ParsesColor",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FGreyboxComponentImporterParsesColorTest::RunTest(const FString& Parameters)
{
    const FLinearColor White = FGreyboxComponentImporter::ParseHexColor(TEXT("#ffffff"));
    TestTrue(TEXT("white R near 1"), FMath::IsNearlyEqual(White.R, 1.0f));
    TestTrue(TEXT("white G near 1"), FMath::IsNearlyEqual(White.G, 1.0f));
    TestTrue(TEXT("white B near 1"), FMath::IsNearlyEqual(White.B, 1.0f));
    const FLinearColor Mid = FGreyboxComponentImporter::ParseHexColor(TEXT("#80c000"));
    TestTrue(TEXT("hex parsed bytes"), FMath::IsNearlyEqual(Mid.R, 128.0f / 255.0f, 0.001f));
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FGreyboxProjectImporterConvertsTransformTest,
    "Greybox.ProjectImporter.ConvertsTransform",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FGreyboxProjectImporterConvertsTransformTest::RunTest(const FString& Parameters)
{
    FGreyboxCanonicalTransform In;
    In.Position = FVector(1.0f, 2.0f, 3.0f);
    In.Rotation = FRotator(10.0f, 20.0f, 30.0f);
    In.Scale = FVector(1.5f, 2.0f, 4.0f);
    const FTransform Out = FGreyboxProjectImporter::ConvertTransformToUnreal(In);
    TestTrue(TEXT("X scaled to cm"), FMath::IsNearlyEqual(Out.GetLocation().X, 100.0f));
    TestTrue(TEXT("Y from canonical Z"), FMath::IsNearlyEqual(Out.GetLocation().Y, 300.0f));
    TestTrue(TEXT("Z from canonical Y"), FMath::IsNearlyEqual(Out.GetLocation().Z, 200.0f));
    return true;
}

#endif
