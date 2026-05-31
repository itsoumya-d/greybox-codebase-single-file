// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

#include "Importers/GreyboxLevelBoardImporter.h"

#include "Dom/JsonObject.h"
#include "Dom/JsonValue.h"
#include "HAL/FileManager.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"

DEFINE_LOG_CATEGORY_STATIC(LogGreyboxLevelBoardImporter, Log, All);

namespace
{
constexpr int32 MaxLevelBoardJsonBytes = 4 * 1024 * 1024;
// Default tile side length in Unreal centimetres (100 cm = 1 m).
constexpr float TileUnitCm = 100.0f;

FString JoinPath(const FString& Root, const FString& Tail)
{
    if (Root.IsEmpty()) return Tail;
    if (Tail.IsEmpty()) return Root;
    return Root.EndsWith(TEXT("/")) ? Root + Tail : Root + TEXT("/") + Tail;
}

FString DescriptorDiskPath(const FString& BoardId)
{
    if (BoardId.IsEmpty() || BoardId.Contains(TEXT("/")) || BoardId.Contains(TEXT("\\")) || BoardId.Contains(TEXT("..")))
    {
        return FString();
    }
    return FPaths::Combine(
        FPaths::ProjectSavedDir(),
        TEXT("Greybox"),
        TEXT("ImportPlans"),
        TEXT("LevelBoards"),
        BoardId + TEXT(".greybox-levelboard.json"));
}

bool TryReadNumber(const TSharedPtr<FJsonObject>& Object, const TCHAR* Key, double& OutValue)
{
    return Object.IsValid() && Object->TryGetNumberField(Key, OutValue);
}

bool TryReadVec2(const TSharedPtr<FJsonObject>& Object, const TCHAR* Key, double& OutX, double& OutY)
{
    const TSharedPtr<FJsonObject>* Child = nullptr;
    if (!Object.IsValid() || !Object->TryGetObjectField(Key, Child) || Child == nullptr || !Child->IsValid())
        return false;
    TryReadNumber(*Child, TEXT("x"), OutX);
    TryReadNumber(*Child, TEXT("y"), OutY);
    return true;
}

bool TryReadVec3(const TSharedPtr<FJsonObject>& Object, const TCHAR* Key, double& OutX, double& OutY, double& OutZ)
{
    const TSharedPtr<FJsonObject>* Child = nullptr;
    if (!Object.IsValid() || !Object->TryGetObjectField(Key, Child) || Child == nullptr || !Child->IsValid())
        return false;
    TryReadNumber(*Child, TEXT("x"), OutX);
    TryReadNumber(*Child, TEXT("y"), OutY);
    TryReadNumber(*Child, TEXT("z"), OutZ);
    return true;
}

/** Map tile type string to placeholder mesh path and nav/collision hints. */
void ClassifyTile(
    const FString& TileType,
    bool bWalkable,
    bool bHazard,
    FString& OutMeshPath,
    FString& OutNavModifier,
    bool& OutHasCollision)
{
    if (TileType == TEXT("wall"))
    {
        OutMeshPath = TEXT("/Engine/BasicShapes/Cube.Cube");
        OutNavModifier = TEXT("Obstacle");
        OutHasCollision = true;
    }
    else if (TileType == TEXT("door"))
    {
        OutMeshPath = TEXT("/Engine/BasicShapes/Plane.Plane");
        OutNavModifier = bWalkable ? TEXT("Walk") : TEXT("Obstacle");
        OutHasCollision = false;
    }
    else if (TileType == TEXT("hazard") || bHazard)
    {
        OutMeshPath = TEXT("/Engine/BasicShapes/Plane.Plane");
        OutNavModifier = TEXT("Walk"); // physically passable, but damage trigger overlaid
        OutHasCollision = false;
    }
    else if (TileType == TEXT("collectible"))
    {
        OutMeshPath = TEXT("/Engine/BasicShapes/Sphere.Sphere");
        OutNavModifier = TEXT("Walk");
        OutHasCollision = false;
    }
    else // floor (default)
    {
        OutMeshPath = TEXT("/Engine/BasicShapes/Plane.Plane");
        OutNavModifier = bWalkable ? TEXT("Walk") : TEXT("Obstacle");
        OutHasCollision = false;
    }
}

TSharedRef<FJsonObject> BuildTileEntry(const TSharedPtr<FJsonObject>& Tile)
{
    TSharedRef<FJsonObject> Entry = MakeShared<FJsonObject>();
    if (!Tile.IsValid()) return Entry;
    FString TileType;
    bool bWalkable = true, bHazard = false;
    Tile->TryGetStringField(TEXT("type"), TileType);
    Tile->TryGetBoolField(TEXT("walkable"), bWalkable);
    Tile->TryGetBoolField(TEXT("hazard"), bHazard);

    double TX = 0, TY = 0, TZ = 0;
    TryReadVec3(Tile, TEXT("position"), TX, TY, TZ);

    // Canonical tile coordinates (grid integer units) → Unreal cm
    TSharedRef<FJsonObject> LocObj = MakeShared<FJsonObject>();
    LocObj->SetNumberField(TEXT("x"), TX * TileUnitCm);
    LocObj->SetNumberField(TEXT("y"), TY * TileUnitCm);
    LocObj->SetNumberField(TEXT("z"), TZ * TileUnitCm);
    Entry->SetObjectField(TEXT("locationCm"), LocObj);

    FString MeshPath, NavModifier;
    bool bCollision = false;
    ClassifyTile(TileType, bWalkable, bHazard, MeshPath, NavModifier, bCollision);

    Entry->SetStringField(TEXT("tileType"), TileType);
    Entry->SetBoolField(TEXT("walkable"), bWalkable);
    Entry->SetBoolField(TEXT("hazard"), bHazard);
    Entry->SetStringField(TEXT("meshPath"), MeshPath);
    Entry->SetStringField(TEXT("navModifier"), NavModifier);
    Entry->SetBoolField(TEXT("hasCollision"), bCollision);

    if (bHazard || TileType == TEXT("hazard"))
    {
        Entry->SetBoolField(TEXT("spawnDamageTrigger"), true);
    }

    return Entry;
}

TSharedRef<FJsonObject> BuildEncounterEntry(const TSharedPtr<FJsonObject>& Encounter)
{
    TSharedRef<FJsonObject> Entry = MakeShared<FJsonObject>();
    if (!Encounter.IsValid()) return Entry;
    FString Id, EnemyType;
    Encounter->TryGetStringField(TEXT("id"), Id);
    Encounter->TryGetStringField(TEXT("enemyType"), EnemyType);
    Entry->SetStringField(TEXT("encounterId"), Id);
    Entry->SetStringField(TEXT("enemyType"), EnemyType);
    Entry->SetStringField(TEXT("unrealActorClass"), TEXT("ACharacter"));
    Entry->SetStringField(TEXT("placeholderMesh"), TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));

    double PX = 0, PY = 0, PZ = 0;
    TryReadVec3(Encounter, TEXT("position"), PX, PY, PZ);
    TSharedRef<FJsonObject> LocObj = MakeShared<FJsonObject>();
    LocObj->SetNumberField(TEXT("x"), PX * TileUnitCm);
    LocObj->SetNumberField(TEXT("y"), PY * TileUnitCm);
    LocObj->SetNumberField(TEXT("z"), PZ * TileUnitCm);
    Entry->SetObjectField(TEXT("locationCm"), LocObj);

    TArray<TSharedPtr<FJsonValue>> Tags;
    Tags.Add(MakeShared<FJsonValueString>(TEXT("Greybox.Encounter")));
    if (!EnemyType.IsEmpty())
        Tags.Add(MakeShared<FJsonValueString>(FString::Printf(TEXT("Greybox.EnemyType.%s"), *EnemyType)));
    Entry->SetArrayField(TEXT("tags"), Tags);

    return Entry;
}

TSharedRef<FJsonObject> BuildConnectionEntry(const TSharedPtr<FJsonObject>& Connection, const FString& SourceRoomId)
{
    TSharedRef<FJsonObject> Entry = MakeShared<FJsonObject>();
    if (!Connection.IsValid()) return Entry;
    FString TargetRoomId, Direction;
    Connection->TryGetStringField(TEXT("targetRoomId"), TargetRoomId);
    Connection->TryGetStringField(TEXT("direction"), Direction);
    Entry->SetStringField(TEXT("sourceRoomId"), SourceRoomId);
    Entry->SetStringField(TEXT("targetRoomId"), TargetRoomId);
    Entry->SetStringField(TEXT("direction"), Direction);
    Entry->SetStringField(TEXT("unrealActorClass"), TEXT("ATriggerBox"));
    Entry->SetStringField(TEXT("note"), TEXT("Doorway volume – connect in Blueprint"));
    return Entry;
}
}

FString FGreyboxLevelBoardImporter::DefaultContentRoot()
{
    return TEXT("/Game/Greybox/LevelBoards");
}

FGreyboxLevelBoardImportResult FGreyboxLevelBoardImporter::ImportFromJson(
    const FString& JsonPath,
    const FString& OutputContentDir)
{
    FGreyboxLevelBoardImportResult Result;

    FString JsonBody;
    if (!FFileHelper::LoadFileToString(JsonBody, *JsonPath))
    {
        Result.Errors.Add(FString::Printf(
            TEXT("Greybox LevelBoard JSON missing or unreadable: %s."), *JsonPath));
        return Result;
    }

    if (JsonBody.Len() > MaxLevelBoardJsonBytes)
    {
        Result.Errors.Add(FString::Printf(
            TEXT("Greybox LevelBoard JSON exceeds the %d-byte safety limit."), MaxLevelBoardJsonBytes));
        return Result;
    }

    TSharedPtr<FJsonObject> Root;
    const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(JsonBody);
    if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid())
    {
        Result.Errors.Add(FString::Printf(
            TEXT("Greybox LevelBoard JSON could not be parsed: %s."), *JsonPath));
        return Result;
    }

    FString BoardId;
    Root->TryGetStringField(TEXT("boardId"), BoardId);
    if (BoardId.IsEmpty())
    {
        BoardId = FPaths::GetBaseFilename(JsonPath);
        Result.Warnings.Add(TEXT("Greybox LevelBoard JSON is missing boardId; derived from filename."));
    }

    const FString ContentRoot = OutputContentDir.IsEmpty() ? DefaultContentRoot() : OutputContentDir;

    TSharedRef<FJsonObject> Plan = MakeShared<FJsonObject>();
    Plan->SetStringField(TEXT("generator"), TEXT("Greybox"));
    Plan->SetStringField(TEXT("kind"), TEXT("level-board"));
    Plan->SetStringField(TEXT("boardId"), BoardId);
    Plan->SetStringField(TEXT("sourcePath"), JsonPath);
    Plan->SetStringField(TEXT("contentRoot"), ContentRoot);
    Plan->SetStringField(TEXT("unrealTarget"), TEXT("Editor import plan"));
    Plan->SetNumberField(TEXT("tileUnitCm"), TileUnitCm);

    const TArray<TSharedPtr<FJsonValue>>* Rooms = nullptr;
    TArray<TSharedPtr<FJsonValue>> RoomEntries;

    int32 TotalTiles = 0, TotalEncounters = 0, TotalConnections = 0;

    if (Root->TryGetArrayField(TEXT("rooms"), Rooms) && Rooms != nullptr)
    {
        RoomEntries.Reserve(Rooms->Num());
        for (const TSharedPtr<FJsonValue>& RoomVal : *Rooms)
        {
            const TSharedPtr<FJsonObject> Room = RoomVal.IsValid() ? RoomVal->AsObject() : nullptr;
            if (!Room.IsValid()) continue;

            FString RoomId, RoomName;
            Room->TryGetStringField(TEXT("id"), RoomId);
            Room->TryGetStringField(TEXT("name"), RoomName);

            TSharedRef<FJsonObject> RoomEntry = MakeShared<FJsonObject>();
            RoomEntry->SetStringField(TEXT("roomId"), RoomId);
            RoomEntry->SetStringField(TEXT("roomName"), RoomName);
            RoomEntry->SetStringField(TEXT("contentPath"), JoinPath(ContentRoot, TEXT("Rooms/") + RoomId));

            // Bounds
            double MinX = 0, MinY = 0, MaxX = 0, MaxY = 0;
            TryReadVec2(Room, TEXT("bounds/min"), MinX, MinY);
            TryReadVec2(Room, TEXT("bounds/max"), MaxX, MaxY);
            const TSharedPtr<FJsonObject>* BoundsObj = nullptr;
            if (Room->TryGetObjectField(TEXT("bounds"), BoundsObj) && BoundsObj != nullptr && BoundsObj->IsValid())
            {
                double BMinX = 0, BMinY = 0, BMaxX = 0, BMaxY = 0;
                TryReadVec2(*BoundsObj, TEXT("min"), BMinX, BMinY);
                TryReadVec2(*BoundsObj, TEXT("max"), BMaxX, BMaxY);
                TSharedRef<FJsonObject> BoundsEntry = MakeShared<FJsonObject>();
                TSharedRef<FJsonObject> MinObj = MakeShared<FJsonObject>();
                MinObj->SetNumberField(TEXT("x"), BMinX * TileUnitCm);
                MinObj->SetNumberField(TEXT("y"), BMinY * TileUnitCm);
                TSharedRef<FJsonObject> MaxObj = MakeShared<FJsonObject>();
                MaxObj->SetNumberField(TEXT("x"), BMaxX * TileUnitCm);
                MaxObj->SetNumberField(TEXT("y"), BMaxY * TileUnitCm);
                BoundsEntry->SetObjectField(TEXT("minCm"), MinObj);
                BoundsEntry->SetObjectField(TEXT("maxCm"), MaxObj);
                RoomEntry->SetObjectField(TEXT("boundsCm"), BoundsEntry);
            }

            // Tiles
            TArray<TSharedPtr<FJsonValue>> TileEntries;
            const TArray<TSharedPtr<FJsonValue>>* Tiles = nullptr;
            if (Room->TryGetArrayField(TEXT("tiles"), Tiles) && Tiles != nullptr)
            {
                TileEntries.Reserve(Tiles->Num());
                for (const TSharedPtr<FJsonValue>& TileVal : *Tiles)
                {
                    const TSharedPtr<FJsonObject> Tile = TileVal.IsValid() ? TileVal->AsObject() : nullptr;
                    if (!Tile.IsValid()) continue;

                    TileEntries.Add(MakeShared<FJsonValueObject>(BuildTileEntry(Tile)));

                    // Register room descriptor
                    FGreyboxImportedLevelRoom RoomDesc;
                    RoomDesc.RoomId = RoomId;
                    RoomDesc.RoomName = RoomName;
                    // deduplicate rooms
                    bool bAlreadyAdded = false;
                    for (const FGreyboxImportedLevelRoom& Existing : Result.Rooms)
                    {
                        if (Existing.RoomId == RoomId) { bAlreadyAdded = true; break; }
                    }
                    if (!bAlreadyAdded) Result.Rooms.Add(RoomDesc);
                }
                TotalTiles += TileEntries.Num();
            }
            RoomEntry->SetArrayField(TEXT("tiles"), TileEntries);
            RoomEntry->SetNumberField(TEXT("tileCount"), static_cast<double>(TileEntries.Num()));

            // Encounters
            TArray<TSharedPtr<FJsonValue>> EncounterEntries;
            const TArray<TSharedPtr<FJsonValue>>* Encounters = nullptr;
            if (Room->TryGetArrayField(TEXT("encounters"), Encounters) && Encounters != nullptr)
            {
                EncounterEntries.Reserve(Encounters->Num());
                for (const TSharedPtr<FJsonValue>& EncVal : *Encounters)
                {
                    const TSharedPtr<FJsonObject> Encounter = EncVal.IsValid() ? EncVal->AsObject() : nullptr;
                    if (!Encounter.IsValid()) continue;
                    EncounterEntries.Add(MakeShared<FJsonValueObject>(BuildEncounterEntry(Encounter)));
                }
                TotalEncounters += EncounterEntries.Num();
            }
            RoomEntry->SetArrayField(TEXT("encounters"), EncounterEntries);
            RoomEntry->SetNumberField(TEXT("encounterCount"), static_cast<double>(EncounterEntries.Num()));

            // Connections
            TArray<TSharedPtr<FJsonValue>> ConnectionEntries;
            const TArray<TSharedPtr<FJsonValue>>* Connections = nullptr;
            if (Room->TryGetArrayField(TEXT("connections"), Connections) && Connections != nullptr)
            {
                ConnectionEntries.Reserve(Connections->Num());
                for (const TSharedPtr<FJsonValue>& ConnVal : *Connections)
                {
                    const TSharedPtr<FJsonObject> Conn = ConnVal.IsValid() ? ConnVal->AsObject() : nullptr;
                    if (!Conn.IsValid()) continue;
                    ConnectionEntries.Add(MakeShared<FJsonValueObject>(BuildConnectionEntry(Conn, RoomId)));
                }
                TotalConnections += ConnectionEntries.Num();
            }
            RoomEntry->SetArrayField(TEXT("connections"), ConnectionEntries);
            RoomEntry->SetNumberField(TEXT("connectionCount"), static_cast<double>(ConnectionEntries.Num()));

            RoomEntries.Add(MakeShared<FJsonValueObject>(RoomEntry));
        }
    }

    Plan->SetArrayField(TEXT("rooms"), RoomEntries);
    Plan->SetNumberField(TEXT("roomCount"), static_cast<double>(RoomEntries.Num()));
    Plan->SetNumberField(TEXT("totalTileCount"), static_cast<double>(TotalTiles));
    Plan->SetNumberField(TEXT("totalEncounterCount"), static_cast<double>(TotalEncounters));
    Plan->SetNumberField(TEXT("totalConnectionCount"), static_cast<double>(TotalConnections));

    const int32 TotalObjects = RoomEntries.Num() + TotalTiles + TotalEncounters + TotalConnections;
    Plan->SetNumberField(TEXT("primaryObjectCount"), static_cast<double>(TotalObjects));

    // Warnings
    TArray<TSharedPtr<FJsonValue>> WarningEntries;
    for (const FString& Warning : Result.Warnings)
    {
        WarningEntries.Add(MakeShared<FJsonValueString>(Warning));
    }
    Plan->SetArrayField(TEXT("warnings"), WarningEntries);

    // Write plan
    const FString PlanPath = DescriptorDiskPath(BoardId);
    if (PlanPath.IsEmpty())
    {
        Result.Errors.Add(FString::Printf(
            TEXT("Greybox LevelBoard: boardId '%s' contains invalid path characters."), *BoardId));
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
            TEXT("Greybox LevelBoard import plan could not be written to %s."), *PlanPath));
    }

    Result.ImportPlanPath = PlanPath;
    Result.PrimaryObjectCount = TotalObjects;
    Result.bSucceeded = Result.Errors.Num() == 0 && bSaved;

    UE_LOG(LogGreyboxLevelBoardImporter, Log,
        TEXT("Greybox LevelBoard '%s' import: %d rooms, %d tiles, %d encounters, %d connections."),
        *BoardId,
        RoomEntries.Num(),
        TotalTiles,
        TotalEncounters,
        TotalConnections);

    return Result;
}
