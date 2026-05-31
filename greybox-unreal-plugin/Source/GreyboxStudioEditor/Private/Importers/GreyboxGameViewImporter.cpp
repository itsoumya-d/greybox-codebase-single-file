// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

#include "Importers/GreyboxGameViewImporter.h"

#include "Dom/JsonObject.h"
#include "Dom/JsonValue.h"
#include "HAL/FileManager.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"

DEFINE_LOG_CATEGORY_STATIC(LogGreyboxGameViewImporter, Log, All);

namespace
{
constexpr int32 MaxGameViewJsonBytes = 4 * 1024 * 1024;

FString DescriptorDiskPath(const FString& GameId)
{
    if (GameId.IsEmpty() || GameId.Contains(TEXT("/")) || GameId.Contains(TEXT("\\")) || GameId.Contains(TEXT("..")))
    {
        return FString();
    }
    return FPaths::Combine(
        FPaths::ProjectSavedDir(),
        TEXT("Greybox"),
        TEXT("ImportPlans"),
        TEXT("GameViews"),
        GameId + TEXT(".greybox-gameview.json"));
}

bool TryReadNumber(const TSharedPtr<FJsonObject>& Object, const TCHAR* Key, float& OutValue)
{
    double Temp = 0.0;
    if (Object.IsValid() && Object->TryGetNumberField(Key, Temp))
    {
        OutValue = static_cast<float>(Temp);
        return true;
    }
    return false;
}

bool TryReadVector3(const TSharedPtr<FJsonObject>& Object, const TCHAR* Key, float& OutX, float& OutY, float& OutZ)
{
    const TSharedPtr<FJsonObject>* Child = nullptr;
    if (!Object.IsValid() || !Object->TryGetObjectField(Key, Child) || Child == nullptr || !Child->IsValid())
    {
        return false;
    }
    TryReadNumber(*Child, TEXT("x"), OutX);
    TryReadNumber(*Child, TEXT("y"), OutY);
    TryReadNumber(*Child, TEXT("z"), OutZ);
    return true;
}

// Canonical space (Y-up, metres, RH) → Unreal (Z-up, cm, LH).
TSharedRef<FJsonObject> ConvertTransformToUnrealJson(
    float CX, float CY, float CZ,         // position, metres
    float RX, float RY, float RZ,         // rotation, euler degrees
    float SX, float SY, float SZ)         // scale
{
    TSharedRef<FJsonObject> T = MakeShared<FJsonObject>();

    // Position
    TSharedRef<FJsonObject> Pos = MakeShared<FJsonObject>();
    Pos->SetNumberField(TEXT("x"), CX * 100.0f);
    Pos->SetNumberField(TEXT("y"), CZ * 100.0f);
    Pos->SetNumberField(TEXT("z"), CY * 100.0f);
    T->SetObjectField(TEXT("locationCm"), Pos);

    // Rotation – Y-up RH → Unreal Z-up LH: pitch←RZ, yaw←-RY, roll←RX
    TSharedRef<FJsonObject> Rot = MakeShared<FJsonObject>();
    Rot->SetNumberField(TEXT("pitch"), RZ);
    Rot->SetNumberField(TEXT("yaw"), -RY);
    Rot->SetNumberField(TEXT("roll"), RX);
    T->SetObjectField(TEXT("rotation"), Rot);

    // Scale – swap Y/Z
    TSharedRef<FJsonObject> Scl = MakeShared<FJsonObject>();
    Scl->SetNumberField(TEXT("x"), SX);
    Scl->SetNumberField(TEXT("y"), SZ);
    Scl->SetNumberField(TEXT("z"), SY);
    T->SetObjectField(TEXT("scale3D"), Scl);

    return T;
}

TSharedRef<FJsonObject> ParseActorEntry(const TSharedPtr<FJsonObject>& Actor)
{
    TSharedRef<FJsonObject> Entry = MakeShared<FJsonObject>();
    if (!Actor.IsValid()) return Entry;
    FString Id, Type, Name, MeshAssetPath, FactionId;
    Actor->TryGetStringField(TEXT("id"), Id);
    Actor->TryGetStringField(TEXT("type"), Type);
    Actor->TryGetStringField(TEXT("name"), Name);
    Actor->TryGetStringField(TEXT("meshAssetPath"), MeshAssetPath);
    Actor->TryGetStringField(TEXT("factionId"), FactionId);

    Entry->SetStringField(TEXT("actorId"), Id);
    Entry->SetStringField(TEXT("actorType"), Type);
    Entry->SetStringField(TEXT("actorName"), Name);
    Entry->SetStringField(TEXT("factionId"), FactionId);

    // Determine placeholder mesh based on actor type.
    if (MeshAssetPath.IsEmpty())
    {
        if (Type == TEXT("player"))
            MeshAssetPath = TEXT("/Engine/BasicShapes/Cylinder.Cylinder");
        else if (Type == TEXT("hazard"))
            MeshAssetPath = TEXT("/Engine/BasicShapes/Sphere.Sphere");
        else
            MeshAssetPath = TEXT("/Engine/BasicShapes/Cube.Cube");
    }
    Entry->SetStringField(TEXT("meshAssetPath"), MeshAssetPath);

    // UE actor class
    FString ActorClass = TEXT("AStaticMeshActor");
    if (Type == TEXT("player") || Type == TEXT("npc") || Type == TEXT("enemy"))
        ActorClass = TEXT("ACharacter");
    else if (Type == TEXT("trigger"))
        ActorClass = TEXT("ATriggerVolume");
    else if (Type == TEXT("spawn"))
        ActorClass = TEXT("APlayerStart");
    Entry->SetStringField(TEXT("unrealActorClass"), ActorClass);

    // Tags
    TArray<TSharedPtr<FJsonValue>> Tags;
    Tags.Add(MakeShared<FJsonValueString>(TEXT("Greybox")));
    Tags.Add(MakeShared<FJsonValueString>(FString::Printf(TEXT("Greybox.%s"), *Type)));
    if (!FactionId.IsEmpty())
        Tags.Add(MakeShared<FJsonValueString>(FString::Printf(TEXT("Greybox.Faction.%s"), *FactionId)));
    Entry->SetArrayField(TEXT("tags"), Tags);

    // Transform
    float PX = 0, PY = 0, PZ = 0, RX = 0, RY = 0, RZ = 0;
    float SX = 1, SY = 1, SZ = 1;
    TryReadVector3(Actor, TEXT("position"), PX, PY, PZ);
    TryReadVector3(Actor, TEXT("rotation"), RX, RY, RZ);
    TryReadVector3(Actor, TEXT("scale"), SX, SY, SZ);
    Entry->SetObjectField(TEXT("unrealTransform"), ConvertTransformToUnrealJson(PX, PY, PZ, RX, RY, RZ, SX, SY, SZ));

    // Components passthrough
    const TArray<TSharedPtr<FJsonValue>>* Components = nullptr;
    if (Actor->TryGetArrayField(TEXT("components"), Components) && Components != nullptr)
    {
        Entry->SetArrayField(TEXT("components"), *Components);
    }

    return Entry;
}

TSharedRef<FJsonObject> ParseSpawnPointEntry(const TSharedPtr<FJsonObject>& Spawn)
{
    TSharedRef<FJsonObject> Entry = MakeShared<FJsonObject>();
    if (!Spawn.IsValid()) return Entry;
    FString Id, ActorId;
    Spawn->TryGetStringField(TEXT("id"), Id);
    Spawn->TryGetStringField(TEXT("actorId"), ActorId);
    Entry->SetStringField(TEXT("spawnId"), Id);
    Entry->SetStringField(TEXT("actorId"), ActorId);
    Entry->SetStringField(TEXT("unrealActorClass"), TEXT("APlayerStart"));

    float PX = 0, PY = 0, PZ = 0;
    TryReadVector3(Spawn, TEXT("position"), PX, PY, PZ);
    Entry->SetObjectField(TEXT("unrealTransform"), ConvertTransformToUnrealJson(PX, PY, PZ, 0, 0, 0, 1, 1, 1));
    return Entry;
}

TSharedRef<FJsonObject> ParseObjectiveEntry(const TSharedPtr<FJsonObject>& Obj)
{
    TSharedRef<FJsonObject> Entry = MakeShared<FJsonObject>();
    if (!Obj.IsValid()) return Entry;
    FString Id, Type;
    Obj->TryGetStringField(TEXT("id"), Id);
    Obj->TryGetStringField(TEXT("type"), Type);
    Entry->SetStringField(TEXT("objectiveId"), Id);
    Entry->SetStringField(TEXT("objectiveType"), Type);
    Entry->SetStringField(TEXT("unrealActorClass"), TEXT("ATriggerSphere"));

    float PX = 0, PY = 0, PZ = 0;
    TryReadVector3(Obj, TEXT("position"), PX, PY, PZ);
    Entry->SetObjectField(TEXT("unrealTransform"), ConvertTransformToUnrealJson(PX, PY, PZ, 0, 0, 0, 1, 1, 1));
    return Entry;
}

TSharedRef<FJsonObject> ParseHazardEntry(const TSharedPtr<FJsonObject>& Hazard)
{
    TSharedRef<FJsonObject> Entry = MakeShared<FJsonObject>();
    if (!Hazard.IsValid()) return Entry;
    FString Id, Type;
    double Radius = 100.0;
    Hazard->TryGetStringField(TEXT("id"), Id);
    Hazard->TryGetStringField(TEXT("type"), Type);
    Hazard->TryGetNumberField(TEXT("radius"), Radius);
    Entry->SetStringField(TEXT("hazardId"), Id);
    Entry->SetStringField(TEXT("hazardType"), Type);
    Entry->SetNumberField(TEXT("radiusCm"), Radius * 100.0);
    Entry->SetStringField(TEXT("unrealActorClass"), TEXT("ATriggerSphere"));

    TArray<TSharedPtr<FJsonValue>> Tags;
    Tags.Add(MakeShared<FJsonValueString>(TEXT("Greybox.Hazard")));
    Tags.Add(MakeShared<FJsonValueString>(FString::Printf(TEXT("Greybox.Hazard.%s"), *Type)));
    Entry->SetArrayField(TEXT("tags"), Tags);

    float PX = 0, PY = 0, PZ = 0;
    TryReadVector3(Hazard, TEXT("position"), PX, PY, PZ);
    Entry->SetObjectField(TEXT("unrealTransform"), ConvertTransformToUnrealJson(PX, PY, PZ, 0, 0, 0, 1, 1, 1));
    return Entry;
}
}

FString FGreyboxGameViewImporter::DefaultContentRoot()
{
    return TEXT("/Game/Greybox/GameViews");
}

FGreyboxGameViewImportResult FGreyboxGameViewImporter::ImportFromJson(
    const FString& JsonPath,
    const FString& OutputContentDir)
{
    FGreyboxGameViewImportResult Result;

    FString JsonBody;
    if (!FFileHelper::LoadFileToString(JsonBody, *JsonPath))
    {
        Result.Errors.Add(FString::Printf(
            TEXT("Greybox GameView JSON missing or unreadable: %s."), *JsonPath));
        return Result;
    }

    if (JsonBody.Len() > MaxGameViewJsonBytes)
    {
        Result.Errors.Add(FString::Printf(
            TEXT("Greybox GameView JSON exceeds the %d-byte safety limit: %s."),
            MaxGameViewJsonBytes, *JsonPath));
        return Result;
    }

    TSharedPtr<FJsonObject> Root;
    const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(JsonBody);
    if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid())
    {
        Result.Errors.Add(FString::Printf(
            TEXT("Greybox GameView JSON could not be parsed: %s."), *JsonPath));
        return Result;
    }

    FString GameId, Version;
    Root->TryGetStringField(TEXT("gameId"), GameId);
    Root->TryGetStringField(TEXT("version"), Version);
    if (GameId.IsEmpty())
    {
        GameId = FPaths::GetBaseFilename(JsonPath);
        Result.Warnings.Add(TEXT("Greybox GameView JSON is missing gameId; derived from filename."));
    }

    const FString ContentRoot = OutputContentDir.IsEmpty() ? DefaultContentRoot() : OutputContentDir;

    // Viewport metadata
    TSharedRef<FJsonObject> Plan = MakeShared<FJsonObject>();
    Plan->SetStringField(TEXT("generator"), TEXT("Greybox"));
    Plan->SetStringField(TEXT("kind"), TEXT("gameview"));
    Plan->SetStringField(TEXT("gameId"), GameId);
    Plan->SetStringField(TEXT("version"), Version);
    Plan->SetStringField(TEXT("sourcePath"), JsonPath);
    Plan->SetStringField(TEXT("contentRoot"), ContentRoot);
    Plan->SetStringField(TEXT("unrealTarget"), TEXT("Editor import plan"));

    const TSharedPtr<FJsonObject>* ViewportObj = nullptr;
    if (Root->TryGetObjectField(TEXT("viewport"), ViewportObj) && ViewportObj != nullptr && ViewportObj->IsValid())
    {
        double Width = 1920.0, Height = 1080.0;
        FString CameraMode;
        (*ViewportObj)->TryGetNumberField(TEXT("width"), Width);
        (*ViewportObj)->TryGetNumberField(TEXT("height"), Height);
        (*ViewportObj)->TryGetStringField(TEXT("camera"), CameraMode);
        Plan->SetNumberField(TEXT("viewportWidth"), Width);
        Plan->SetNumberField(TEXT("viewportHeight"), Height);
        Plan->SetStringField(TEXT("cameraMode"), CameraMode);
    }

    // --- Actors ---
    TArray<TSharedPtr<FJsonValue>> ActorEntries;
    const TArray<TSharedPtr<FJsonValue>>* Actors = nullptr;
    if (Root->TryGetArrayField(TEXT("actors"), Actors) && Actors != nullptr)
    {
        ActorEntries.Reserve(Actors->Num());
        for (const TSharedPtr<FJsonValue>& Val : *Actors)
        {
            const TSharedPtr<FJsonObject> Actor = Val.IsValid() ? Val->AsObject() : nullptr;
            if (!Actor.IsValid()) continue;

            TSharedRef<FJsonObject> Entry = ParseActorEntry(Actor);
            ActorEntries.Add(MakeShared<FJsonValueObject>(Entry));

            FGreyboxImportedGameViewActor Descriptor;
            Actor->TryGetStringField(TEXT("id"), Descriptor.ActorId);
            Actor->TryGetStringField(TEXT("type"), Descriptor.ActorType);
            Actor->TryGetStringField(TEXT("name"), Descriptor.ActorName);
            Actor->TryGetStringField(TEXT("meshAssetPath"), Descriptor.MeshAssetPath);
            float PX = 0, PY = 0, PZ = 0;
            TryReadVector3(Actor, TEXT("position"), PX, PY, PZ);
            Descriptor.UnrealLocationCm = FVector(PX * 100.0f, PZ * 100.0f, PY * 100.0f);
            Result.Actors.Add(MoveTemp(Descriptor));
        }
    }
    Plan->SetArrayField(TEXT("actors"), ActorEntries);
    Plan->SetNumberField(TEXT("actorCount"), static_cast<double>(ActorEntries.Num()));

    // --- Factions ---
    TArray<TSharedPtr<FJsonValue>> FactionEntries;
    const TArray<TSharedPtr<FJsonValue>>* Factions = nullptr;
    if (Root->TryGetArrayField(TEXT("factions"), Factions) && Factions != nullptr)
    {
        for (const TSharedPtr<FJsonValue>& Val : *Factions)
        {
            const TSharedPtr<FJsonObject> Faction = Val.IsValid() ? Val->AsObject() : nullptr;
            if (!Faction.IsValid()) continue;
            FactionEntries.Add(Val);
        }
    }
    Plan->SetArrayField(TEXT("factions"), FactionEntries);

    // --- Spawn points ---
    TArray<TSharedPtr<FJsonValue>> SpawnEntries;
    const TArray<TSharedPtr<FJsonValue>>* SpawnPoints = nullptr;
    if (Root->TryGetArrayField(TEXT("spawnPoints"), SpawnPoints) && SpawnPoints != nullptr)
    {
        SpawnEntries.Reserve(SpawnPoints->Num());
        for (const TSharedPtr<FJsonValue>& Val : *SpawnPoints)
        {
            const TSharedPtr<FJsonObject> Spawn = Val.IsValid() ? Val->AsObject() : nullptr;
            if (!Spawn.IsValid()) continue;
            SpawnEntries.Add(MakeShared<FJsonValueObject>(ParseSpawnPointEntry(Spawn)));
        }
    }
    Plan->SetArrayField(TEXT("spawnPoints"), SpawnEntries);
    Plan->SetNumberField(TEXT("spawnPointCount"), static_cast<double>(SpawnEntries.Num()));

    // --- Objectives ---
    TArray<TSharedPtr<FJsonValue>> ObjectiveEntries;
    const TArray<TSharedPtr<FJsonValue>>* Objectives = nullptr;
    if (Root->TryGetArrayField(TEXT("objectives"), Objectives) && Objectives != nullptr)
    {
        ObjectiveEntries.Reserve(Objectives->Num());
        for (const TSharedPtr<FJsonValue>& Val : *Objectives)
        {
            const TSharedPtr<FJsonObject> Obj = Val.IsValid() ? Val->AsObject() : nullptr;
            if (!Obj.IsValid()) continue;
            ObjectiveEntries.Add(MakeShared<FJsonValueObject>(ParseObjectiveEntry(Obj)));
        }
    }
    Plan->SetArrayField(TEXT("objectives"), ObjectiveEntries);
    Plan->SetNumberField(TEXT("objectiveCount"), static_cast<double>(ObjectiveEntries.Num()));

    // --- Hazards ---
    TArray<TSharedPtr<FJsonValue>> HazardEntries;
    const TArray<TSharedPtr<FJsonValue>>* Hazards = nullptr;
    if (Root->TryGetArrayField(TEXT("hazards"), Hazards) && Hazards != nullptr)
    {
        HazardEntries.Reserve(Hazards->Num());
        for (const TSharedPtr<FJsonValue>& Val : *Hazards)
        {
            const TSharedPtr<FJsonObject> Hazard = Val.IsValid() ? Val->AsObject() : nullptr;
            if (!Hazard.IsValid()) continue;
            HazardEntries.Add(MakeShared<FJsonValueObject>(ParseHazardEntry(Hazard)));
        }
    }
    Plan->SetArrayField(TEXT("hazards"), HazardEntries);
    Plan->SetNumberField(TEXT("hazardCount"), static_cast<double>(HazardEntries.Num()));

    const int32 TotalObjects = ActorEntries.Num() + SpawnEntries.Num() + ObjectiveEntries.Num() + HazardEntries.Num();
    Plan->SetNumberField(TEXT("primaryObjectCount"), static_cast<double>(TotalObjects));

    // Warnings
    TArray<TSharedPtr<FJsonValue>> WarningEntries;
    for (const FString& Warning : Result.Warnings)
    {
        WarningEntries.Add(MakeShared<FJsonValueString>(Warning));
    }
    Plan->SetArrayField(TEXT("warnings"), WarningEntries);

    // Write plan to disk
    const FString PlanPath = DescriptorDiskPath(GameId);
    if (PlanPath.IsEmpty())
    {
        Result.Errors.Add(FString::Printf(
            TEXT("Greybox GameView: gameId '%s' contains invalid path characters."), *GameId));
        return Result;
    }
    FString PlanBody;
    const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&PlanBody);
    FJsonSerializer::Serialize(Plan, Writer);
    IFileManager::Get().MakeDirectory(*FPaths::GetPath(PlanPath), true);
    const bool bSaved = FFileHelper::SaveStringToFile(PlanBody, *PlanPath);

    if (!bSaved)
    {
        Result.Warnings.Add(FString::Printf(
            TEXT("Greybox GameView import plan could not be written to %s."), *PlanPath));
    }

    Result.ImportPlanPath = PlanPath;
    Result.PrimaryObjectCount = TotalObjects;
    Result.bSucceeded = Result.Errors.Num() == 0 && bSaved;

    UE_LOG(LogGreyboxGameViewImporter, Log,
        TEXT("Greybox GameView '%s' import: %d actors, %d spawn points, %d objectives, %d hazards."),
        *GameId,
        ActorEntries.Num(),
        SpawnEntries.Num(),
        ObjectiveEntries.Num(),
        HazardEntries.Num());

    return Result;
}
