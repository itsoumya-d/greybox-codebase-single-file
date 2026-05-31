// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

#include "GreyboxDiffApplier.h"

#include "Dom/JsonObject.h"
#include "Dom/JsonValue.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"

namespace
{
TSharedPtr<FJsonValue> ParseJsonValue(const FString& Body)
{
    if (Body.IsEmpty())
    {
        return nullptr;
    }
    const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Body);
    TSharedPtr<FJsonValue> Value;
    if (!FJsonSerializer::Deserialize(Reader, Value))
    {
        return nullptr;
    }
    return Value;
}

FString SerializeJsonValue(const TSharedPtr<FJsonValue>& Value)
{
    if (!Value.IsValid())
    {
        return FString();
    }
    FString Output;
    const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Output);
    FJsonSerializer::Serialize(Value.ToSharedRef(), TEXT(""), Writer);
    Writer->Close();
    Output.TrimStartAndEndInline();
    return Output;
}

FString SerializeJsonObject(const TSharedPtr<FJsonObject>& Object)
{
    if (!Object.IsValid())
    {
        return FString();
    }
    FString Output;
    const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Output);
    FJsonSerializer::Serialize(Object.ToSharedRef(), Writer);
    Writer->Close();
    return Output;
}

bool ValuesEqual(const TSharedPtr<FJsonValue>& Left, const TSharedPtr<FJsonValue>& Right)
{
    if (!Left.IsValid() && !Right.IsValid())
    {
        return true;
    }
    if (!Left.IsValid() || !Right.IsValid())
    {
        return false;
    }
    if (Left->Type != Right->Type)
    {
        return false;
    }

    switch (Left->Type)
    {
    case EJson::Null:
        return true;
    case EJson::Boolean:
    {
        bool L = false;
        bool R = false;
        Left->TryGetBool(L);
        Right->TryGetBool(R);
        return L == R;
    }
    case EJson::Number:
    {
        double L = 0.0;
        double R = 0.0;
        Left->TryGetNumber(L);
        Right->TryGetNumber(R);
        return FMath::IsNearlyEqual(L, R, KINDA_SMALL_NUMBER);
    }
    case EJson::String:
    {
        FString L;
        FString R;
        Left->TryGetString(L);
        Right->TryGetString(R);
        return L == R;
    }
    case EJson::Array:
    {
        const TArray<TSharedPtr<FJsonValue>>& L = Left->AsArray();
        const TArray<TSharedPtr<FJsonValue>>& R = Right->AsArray();
        if (L.Num() != R.Num())
        {
            return false;
        }
        for (int32 Index = 0; Index < L.Num(); ++Index)
        {
            if (!ValuesEqual(L[Index], R[Index]))
            {
                return false;
            }
        }
        return true;
    }
    case EJson::Object:
    {
        const TSharedPtr<FJsonObject> L = Left->AsObject();
        const TSharedPtr<FJsonObject> R = Right->AsObject();
        if (!L.IsValid() || !R.IsValid())
        {
            return false;
        }
        if (L->Values.Num() != R->Values.Num())
        {
            return false;
        }
        for (const TPair<FString, TSharedPtr<FJsonValue>>& Pair : L->Values)
        {
            const TSharedPtr<FJsonValue>* Other = R->Values.Find(Pair.Key);
            if (Other == nullptr || !ValuesEqual(Pair.Value, *Other))
            {
                return false;
            }
        }
        return true;
    }
    default:
        return false;
    }
}

FString EncodePointerSegment(const FString& Segment)
{
    // RFC 6901: replace `~` with `~0` and `/` with `~1`.
    FString Encoded = Segment;
    Encoded.ReplaceInline(TEXT("~"), TEXT("~0"));
    Encoded.ReplaceInline(TEXT("/"), TEXT("~1"));
    return Encoded;
}

bool TryGetStableId(const TSharedPtr<FJsonValue>& Value, FString& OutId)
{
    if (!Value.IsValid() || Value->Type != EJson::Object)
    {
        return false;
    }
    const TSharedPtr<FJsonObject> Object = Value->AsObject();
    if (!Object.IsValid())
    {
        return false;
    }
    static const TCHAR* KeyCandidates[] = {
        TEXT("id"), TEXT("componentId"), TEXT("screenId"), TEXT("characterId"), TEXT("assetId"), TEXT("edgeId")
    };
    for (const TCHAR* Key : KeyCandidates)
    {
        FString Candidate;
        if (Object->TryGetStringField(Key, Candidate) && !Candidate.IsEmpty())
        {
            OutId = Candidate;
            return true;
        }
    }
    return false;
}

TSharedPtr<FJsonValue> CloneValue(const TSharedPtr<FJsonValue>& Source)
{
    if (!Source.IsValid())
    {
        return nullptr;
    }
    const FString Body = SerializeJsonValue(Source);
    return ParseJsonValue(Body);
}

void RecordConflict(
    TArray<FGreyboxMergeConflict>& Conflicts,
    const FString& JsonPointer,
    const TSharedPtr<FJsonValue>& BaseValue,
    const TSharedPtr<FJsonValue>& LocalValue,
    const TSharedPtr<FJsonValue>& RemoteValue)
{
    FGreyboxMergeConflict Conflict;
    Conflict.JsonPointer = JsonPointer;
    Conflict.BaseValueJson = SerializeJsonValue(BaseValue);
    Conflict.LocalValueJson = SerializeJsonValue(LocalValue);
    Conflict.RemoteValueJson = SerializeJsonValue(RemoteValue);
    Conflict.FieldType = FGreyboxDiffApplier::ClassifyJsonValue(LocalValue.IsValid() ? LocalValue : RemoteValue);
    Conflict.Resolution = EGreyboxConflictResolution::Pending;
    Conflicts.Add(MoveTemp(Conflict));
}

TSharedPtr<FJsonValue> MergeValue(
    const TSharedPtr<FJsonValue>& BaseValue,
    const TSharedPtr<FJsonValue>& LocalValue,
    const TSharedPtr<FJsonValue>& RemoteValue,
    const FString& JsonPointer,
    TArray<FGreyboxMergeConflict>& Conflicts);

TSharedPtr<FJsonValue> MergeObject(
    const TSharedPtr<FJsonObject>& BaseObject,
    const TSharedPtr<FJsonObject>& LocalObject,
    const TSharedPtr<FJsonObject>& RemoteObject,
    const FString& JsonPointer,
    TArray<FGreyboxMergeConflict>& Conflicts)
{
    TSharedRef<FJsonObject> Merged = MakeShared<FJsonObject>();
    TSet<FString> AllKeys;
    if (BaseObject.IsValid())
    {
        for (const TPair<FString, TSharedPtr<FJsonValue>>& Pair : BaseObject->Values)
        {
            AllKeys.Add(Pair.Key);
        }
    }
    if (LocalObject.IsValid())
    {
        for (const TPair<FString, TSharedPtr<FJsonValue>>& Pair : LocalObject->Values)
        {
            AllKeys.Add(Pair.Key);
        }
    }
    if (RemoteObject.IsValid())
    {
        for (const TPair<FString, TSharedPtr<FJsonValue>>& Pair : RemoteObject->Values)
        {
            AllKeys.Add(Pair.Key);
        }
    }

    for (const FString& Key : AllKeys)
    {
        TSharedPtr<FJsonValue> BaseValue = BaseObject.IsValid() ? BaseObject->Values.FindRef(Key) : nullptr;
        TSharedPtr<FJsonValue> LocalValue = LocalObject.IsValid() ? LocalObject->Values.FindRef(Key) : nullptr;
        TSharedPtr<FJsonValue> RemoteValue = RemoteObject.IsValid() ? RemoteObject->Values.FindRef(Key) : nullptr;

        const FString ChildPointer = JsonPointer + TEXT("/") + EncodePointerSegment(Key);
        TSharedPtr<FJsonValue> MergedChild = MergeValue(BaseValue, LocalValue, RemoteValue, ChildPointer, Conflicts);
        if (MergedChild.IsValid())
        {
            Merged->Values.Add(Key, MergedChild);
        }
    }

    return MakeShared<FJsonValueObject>(Merged);
}

TSharedPtr<FJsonValue> MergeArrayPositional(
    const TArray<TSharedPtr<FJsonValue>>& BaseArray,
    const TArray<TSharedPtr<FJsonValue>>& LocalArray,
    const TArray<TSharedPtr<FJsonValue>>& RemoteArray,
    const FString& JsonPointer,
    TArray<FGreyboxMergeConflict>& Conflicts)
{
    const int32 MaxLen = FMath::Max3(BaseArray.Num(), LocalArray.Num(), RemoteArray.Num());
    TArray<TSharedPtr<FJsonValue>> Merged;
    Merged.Reserve(MaxLen);
    for (int32 Index = 0; Index < MaxLen; ++Index)
    {
        TSharedPtr<FJsonValue> BaseValue = BaseArray.IsValidIndex(Index) ? BaseArray[Index] : nullptr;
        TSharedPtr<FJsonValue> LocalValue = LocalArray.IsValidIndex(Index) ? LocalArray[Index] : nullptr;
        TSharedPtr<FJsonValue> RemoteValue = RemoteArray.IsValidIndex(Index) ? RemoteArray[Index] : nullptr;
        const FString ChildPointer = JsonPointer + FString::Printf(TEXT("/%d"), Index);
        TSharedPtr<FJsonValue> MergedChild = MergeValue(BaseValue, LocalValue, RemoteValue, ChildPointer, Conflicts);
        if (MergedChild.IsValid())
        {
            Merged.Add(MergedChild);
        }
    }
    return MakeShared<FJsonValueArray>(Merged);
}

bool BuildIdIndex(const TArray<TSharedPtr<FJsonValue>>& Array, TMap<FString, int32>& OutIndex)
{
    OutIndex.Reset();
    OutIndex.Reserve(Array.Num());
    for (int32 Index = 0; Index < Array.Num(); ++Index)
    {
        FString Id;
        if (!TryGetStableId(Array[Index], Id))
        {
            return false;
        }
        OutIndex.Add(Id, Index);
    }
    return true;
}

TSharedPtr<FJsonValue> MergeArrayById(
    const TArray<TSharedPtr<FJsonValue>>& BaseArray,
    const TArray<TSharedPtr<FJsonValue>>& LocalArray,
    const TArray<TSharedPtr<FJsonValue>>& RemoteArray,
    const FString& JsonPointer,
    TArray<FGreyboxMergeConflict>& Conflicts)
{
    TMap<FString, int32> BaseIndex;
    TMap<FString, int32> LocalIndex;
    TMap<FString, int32> RemoteIndex;
    if (!BuildIdIndex(BaseArray, BaseIndex) || !BuildIdIndex(LocalArray, LocalIndex) || !BuildIdIndex(RemoteArray, RemoteIndex))
    {
        return MergeArrayPositional(BaseArray, LocalArray, RemoteArray, JsonPointer, Conflicts);
    }

    // Decide ordering by preferring local order, then appending remote-only ids, then base-only ids.
    TArray<FString> Order;
    TSet<FString> Seen;
    for (const TSharedPtr<FJsonValue>& Item : LocalArray)
    {
        FString Id;
        if (TryGetStableId(Item, Id) && !Seen.Contains(Id))
        {
            Order.Add(Id);
            Seen.Add(Id);
        }
    }
    for (const TSharedPtr<FJsonValue>& Item : RemoteArray)
    {
        FString Id;
        if (TryGetStableId(Item, Id) && !Seen.Contains(Id))
        {
            Order.Add(Id);
            Seen.Add(Id);
        }
    }
    for (const TSharedPtr<FJsonValue>& Item : BaseArray)
    {
        FString Id;
        if (TryGetStableId(Item, Id) && !Seen.Contains(Id))
        {
            Order.Add(Id);
            Seen.Add(Id);
        }
    }

    TArray<TSharedPtr<FJsonValue>> Merged;
    Merged.Reserve(Order.Num());
    for (const FString& Id : Order)
    {
        const int32* BaseAt = BaseIndex.Find(Id);
        const int32* LocalAt = LocalIndex.Find(Id);
        const int32* RemoteAt = RemoteIndex.Find(Id);
        const bool bExistsInBase = BaseAt != nullptr;
        const bool bExistsInLocal = LocalAt != nullptr;
        const bool bExistsInRemote = RemoteAt != nullptr;
        const FString ChildPointer = JsonPointer + TEXT("/") + EncodePointerSegment(Id);

        TSharedPtr<FJsonValue> BaseValue = bExistsInBase ? BaseArray[*BaseAt] : nullptr;
        TSharedPtr<FJsonValue> LocalValue = bExistsInLocal ? LocalArray[*LocalAt] : nullptr;
        TSharedPtr<FJsonValue> RemoteValue = bExistsInRemote ? RemoteArray[*RemoteAt] : nullptr;

        // Deletion detection: if it existed in base and is missing on one side, treat as deletion on that side.
        if (bExistsInBase && (!bExistsInLocal || !bExistsInRemote))
        {
            const bool bLocalDeleted = !bExistsInLocal;
            const bool bRemoteDeleted = !bExistsInRemote;
            if (bLocalDeleted && bRemoteDeleted)
            {
                continue;
            }
            if (bLocalDeleted && bExistsInRemote)
            {
                const bool bRemoteUnchanged = ValuesEqual(BaseValue, RemoteValue);
                if (bRemoteUnchanged)
                {
                    // Local deletion wins.
                    continue;
                }
                RecordConflict(Conflicts, ChildPointer, BaseValue, nullptr, RemoteValue);
                Merged.Add(CloneValue(RemoteValue));
                continue;
            }
            if (bRemoteDeleted && bExistsInLocal)
            {
                const bool bLocalUnchanged = ValuesEqual(BaseValue, LocalValue);
                if (bLocalUnchanged)
                {
                    // Remote deletion wins.
                    continue;
                }
                RecordConflict(Conflicts, ChildPointer, BaseValue, LocalValue, nullptr);
                Merged.Add(CloneValue(LocalValue));
                continue;
            }
        }

        TSharedPtr<FJsonValue> MergedChild = MergeValue(BaseValue, LocalValue, RemoteValue, ChildPointer, Conflicts);
        if (MergedChild.IsValid())
        {
            Merged.Add(MergedChild);
        }
    }
    return MakeShared<FJsonValueArray>(Merged);
}

TSharedPtr<FJsonValue> MergeValue(
    const TSharedPtr<FJsonValue>& BaseValue,
    const TSharedPtr<FJsonValue>& LocalValue,
    const TSharedPtr<FJsonValue>& RemoteValue,
    const FString& JsonPointer,
    TArray<FGreyboxMergeConflict>& Conflicts)
{
    const bool bLocalChanged = !ValuesEqual(BaseValue, LocalValue);
    const bool bRemoteChanged = !ValuesEqual(BaseValue, RemoteValue);

    if (!bLocalChanged && !bRemoteChanged)
    {
        // Both sides equal base — keep base (which equals both).
        return CloneValue(BaseValue);
    }
    if (!bLocalChanged && bRemoteChanged)
    {
        return CloneValue(RemoteValue);
    }
    if (bLocalChanged && !bRemoteChanged)
    {
        return CloneValue(LocalValue);
    }

    // Both sides changed.
    if (ValuesEqual(LocalValue, RemoteValue))
    {
        return CloneValue(LocalValue);
    }

    const EJson LocalType = LocalValue.IsValid() ? LocalValue->Type : EJson::Null;
    const EJson RemoteType = RemoteValue.IsValid() ? RemoteValue->Type : EJson::Null;

    if (LocalType == EJson::Object && RemoteType == EJson::Object)
    {
        return MergeObject(
            BaseValue.IsValid() ? BaseValue->AsObject() : nullptr,
            LocalValue->AsObject(),
            RemoteValue->AsObject(),
            JsonPointer,
            Conflicts);
    }
    if (LocalType == EJson::Array && RemoteType == EJson::Array)
    {
        const TArray<TSharedPtr<FJsonValue>>& LocalArray = LocalValue->AsArray();
        const TArray<TSharedPtr<FJsonValue>>& RemoteArray = RemoteValue->AsArray();
        const TArray<TSharedPtr<FJsonValue>> BaseArray = BaseValue.IsValid() && BaseValue->Type == EJson::Array
            ? BaseValue->AsArray()
            : TArray<TSharedPtr<FJsonValue>>();
        // Try id-stable merge when items are identifiable objects.
        bool bAllIdentifiable = true;
        for (const TSharedPtr<FJsonValue>& Item : LocalArray)
        {
            FString Id;
            if (!TryGetStableId(Item, Id))
            {
                bAllIdentifiable = false;
                break;
            }
        }
        if (bAllIdentifiable)
        {
            for (const TSharedPtr<FJsonValue>& Item : RemoteArray)
            {
                FString Id;
                if (!TryGetStableId(Item, Id))
                {
                    bAllIdentifiable = false;
                    break;
                }
            }
        }
        if (bAllIdentifiable)
        {
            return MergeArrayById(BaseArray, LocalArray, RemoteArray, JsonPointer, Conflicts);
        }
        return MergeArrayPositional(BaseArray, LocalArray, RemoteArray, JsonPointer, Conflicts);
    }

    // Genuine scalar / mixed conflict.
    RecordConflict(Conflicts, JsonPointer, BaseValue, LocalValue, RemoteValue);
    // Default to local (caller may override via Resolve).
    return CloneValue(LocalValue);
}

void CollectConflictPaths(const TArray<FGreyboxMergeConflict>& Conflicts, TArray<FString>& OutPaths)
{
    OutPaths.Reserve(Conflicts.Num());
    for (const FGreyboxMergeConflict& Conflict : Conflicts)
    {
        OutPaths.Add(Conflict.JsonPointer);
    }
}

TSharedPtr<FJsonValue> FollowAndReplace(
    const TSharedPtr<FJsonValue>& Root,
    const TArray<FString>& Tokens,
    int32 TokenIndex,
    const TSharedPtr<FJsonValue>& Replacement);

TSharedPtr<FJsonValue> FollowAndReplaceObject(
    const TSharedPtr<FJsonObject>& Object,
    const TArray<FString>& Tokens,
    int32 TokenIndex,
    const TSharedPtr<FJsonValue>& Replacement)
{
    TSharedRef<FJsonObject> Output = MakeShared<FJsonObject>();
    for (const TPair<FString, TSharedPtr<FJsonValue>>& Pair : Object->Values)
    {
        Output->Values.Add(Pair.Key, Pair.Value);
    }
    const FString Segment = Tokens[TokenIndex];
    const TSharedPtr<FJsonValue> Child = Output->Values.FindRef(Segment);
    const TSharedPtr<FJsonValue> Replaced = FollowAndReplace(Child, Tokens, TokenIndex + 1, Replacement);
    if (Replaced.IsValid())
    {
        Output->Values.Add(Segment, Replaced);
    }
    else
    {
        Output->Values.Remove(Segment);
    }
    return MakeShared<FJsonValueObject>(Output);
}

TSharedPtr<FJsonValue> FollowAndReplaceArray(
    const TArray<TSharedPtr<FJsonValue>>& Array,
    const TArray<FString>& Tokens,
    int32 TokenIndex,
    const TSharedPtr<FJsonValue>& Replacement)
{
    TArray<TSharedPtr<FJsonValue>> Output = Array;
    const FString Segment = Tokens[TokenIndex];
    int32 Index = -1;
    if (Segment.IsNumeric() && LexTryParseString(Index, *Segment) && Index >= 0 && Index < Output.Num())
    {
        const TSharedPtr<FJsonValue> Replaced = FollowAndReplace(Output[Index], Tokens, TokenIndex + 1, Replacement);
        if (Replaced.IsValid())
        {
            Output[Index] = Replaced;
        }
        else
        {
            Output.RemoveAt(Index);
        }
        return MakeShared<FJsonValueArray>(Output);
    }
    // ID-based array — find by stable id.
    for (int32 ItemIndex = 0; ItemIndex < Output.Num(); ++ItemIndex)
    {
        FString ItemId;
        if (TryGetStableId(Output[ItemIndex], ItemId) && ItemId == Segment)
        {
            const TSharedPtr<FJsonValue> Replaced = FollowAndReplace(Output[ItemIndex], Tokens, TokenIndex + 1, Replacement);
            if (Replaced.IsValid())
            {
                Output[ItemIndex] = Replaced;
            }
            else
            {
                Output.RemoveAt(ItemIndex);
            }
            return MakeShared<FJsonValueArray>(Output);
        }
    }
    return MakeShared<FJsonValueArray>(Output);
}

TSharedPtr<FJsonValue> FollowAndReplace(
    const TSharedPtr<FJsonValue>& Root,
    const TArray<FString>& Tokens,
    int32 TokenIndex,
    const TSharedPtr<FJsonValue>& Replacement)
{
    if (TokenIndex >= Tokens.Num())
    {
        return Replacement;
    }
    if (!Root.IsValid())
    {
        return Replacement;
    }
    if (Root->Type == EJson::Object)
    {
        return FollowAndReplaceObject(Root->AsObject(), Tokens, TokenIndex, Replacement);
    }
    if (Root->Type == EJson::Array)
    {
        return FollowAndReplaceArray(Root->AsArray(), Tokens, TokenIndex, Replacement);
    }
    return Replacement;
}

TArray<FString> ParsePointer(const FString& Pointer)
{
    TArray<FString> Tokens;
    if (Pointer.IsEmpty() || Pointer == TEXT("/"))
    {
        return Tokens;
    }
    FString Body = Pointer;
    if (Body.StartsWith(TEXT("/")))
    {
        Body.RightChopInline(1);
    }
    Body.ParseIntoArray(Tokens, TEXT("/"), false);
    for (FString& Token : Tokens)
    {
        Token.ReplaceInline(TEXT("~1"), TEXT("/"));
        Token.ReplaceInline(TEXT("~0"), TEXT("~"));
    }
    return Tokens;
}
}

EGreyboxMergeFieldType FGreyboxDiffApplier::ClassifyJsonValue(const TSharedPtr<FJsonValue>& Value)
{
    if (!Value.IsValid())
    {
        return EGreyboxMergeFieldType::String;
    }
    switch (Value->Type)
    {
    case EJson::Number:
    {
        double Number = 0.0;
        Value->TryGetNumber(Number);
        return FMath::IsNearlyEqual(Number, FMath::TruncToFloat(static_cast<float>(Number)))
            ? EGreyboxMergeFieldType::Int
            : EGreyboxMergeFieldType::Float;
    }
    case EJson::Boolean:
        return EGreyboxMergeFieldType::Bool;
    case EJson::String:
    {
        FString StringValue;
        Value->TryGetString(StringValue);
        if (StringValue.StartsWith(TEXT("#")) && (StringValue.Len() == 7 || StringValue.Len() == 9))
        {
            return EGreyboxMergeFieldType::Color;
        }
        return EGreyboxMergeFieldType::String;
    }
    case EJson::Object:
    {
        const TSharedPtr<FJsonObject> Object = Value->AsObject();
        if (!Object.IsValid())
        {
            return EGreyboxMergeFieldType::Object;
        }
        if (Object->HasField(TEXT("x")) && Object->HasField(TEXT("y")) && Object->HasField(TEXT("z")))
        {
            if (Object->HasField(TEXT("rotation")) || Object->HasField(TEXT("pitch")))
            {
                return EGreyboxMergeFieldType::Rotator;
            }
            return EGreyboxMergeFieldType::Vector;
        }
        if (Object->HasField(TEXT("position")) && Object->HasField(TEXT("rotation")) && Object->HasField(TEXT("scale")))
        {
            return EGreyboxMergeFieldType::Transform;
        }
        return EGreyboxMergeFieldType::Object;
    }
    case EJson::Array:
        return EGreyboxMergeFieldType::Array;
    default:
        return EGreyboxMergeFieldType::String;
    }
}

bool FGreyboxDiffApplier::SupportsFieldType(EGreyboxMergeFieldType FieldType)
{
    switch (FieldType)
    {
    case EGreyboxMergeFieldType::Int:
    case EGreyboxMergeFieldType::Float:
    case EGreyboxMergeFieldType::String:
    case EGreyboxMergeFieldType::Color:
    case EGreyboxMergeFieldType::Vector:
    case EGreyboxMergeFieldType::Rotator:
    case EGreyboxMergeFieldType::Transform:
    case EGreyboxMergeFieldType::Bool:
    case EGreyboxMergeFieldType::Array:
    case EGreyboxMergeFieldType::Object:
        return true;
    default:
        return false;
    }
}

FGreyboxRoundTripMergeResult FGreyboxDiffApplier::Merge(const FGreyboxRoundTripMergeRequest& Request)
{
    FGreyboxRoundTripMergeResult Result;
    if (Request.BaseArtifactJson.IsEmpty() || Request.WebArtifactJson.IsEmpty() || Request.UnrealEditJson.IsEmpty())
    {
        Result.bSucceeded = false;
        Result.MergedArtifactJson = FString();
        return Result;
    }

    const TSharedPtr<FJsonValue> BaseValue = ParseJsonValue(Request.BaseArtifactJson);
    const TSharedPtr<FJsonValue> LocalValue = ParseJsonValue(Request.UnrealEditJson);
    const TSharedPtr<FJsonValue> RemoteValue = ParseJsonValue(Request.WebArtifactJson);
    if (!BaseValue.IsValid() || !LocalValue.IsValid() || !RemoteValue.IsValid())
    {
        Result.bSucceeded = false;
        Result.MergedArtifactJson = FString();
        return Result;
    }

    TArray<FGreyboxMergeConflict> Conflicts;
    const TSharedPtr<FJsonValue> Merged = MergeValue(BaseValue, LocalValue, RemoteValue, FString(), Conflicts);

    Result.bSucceeded = true;
    Result.bHasConflicts = Conflicts.Num() > 0;
    Result.Conflicts = MoveTemp(Conflicts);
    CollectConflictPaths(Result.Conflicts, Result.ConflictPaths);
    Result.MergedArtifactJson = SerializeJsonValue(Merged);
    return Result;
}

FGreyboxRoundTripMergeResult FGreyboxDiffApplier::Resolve(
    const FGreyboxRoundTripMergeResult& PreviousResult,
    const FString& JsonPointer,
    EGreyboxConflictResolution Choice)
{
    FGreyboxRoundTripMergeResult Result = PreviousResult;
    if (Choice == EGreyboxConflictResolution::Pending)
    {
        return Result;
    }

    int32 ConflictIndex = INDEX_NONE;
    for (int32 Index = 0; Index < Result.Conflicts.Num(); ++Index)
    {
        if (Result.Conflicts[Index].JsonPointer == JsonPointer)
        {
            ConflictIndex = Index;
            break;
        }
    }
    if (ConflictIndex == INDEX_NONE)
    {
        return Result;
    }

    const FGreyboxMergeConflict& Conflict = Result.Conflicts[ConflictIndex];
    const FString& ChosenJson = (Choice == EGreyboxConflictResolution::KeepLocal)
        ? Conflict.LocalValueJson
        : Conflict.RemoteValueJson;
    TSharedPtr<FJsonValue> Replacement = ParseJsonValue(ChosenJson);

    TArray<FString> Tokens = ParsePointer(JsonPointer);
    TSharedPtr<FJsonValue> Root = ParseJsonValue(Result.MergedArtifactJson);
    TSharedPtr<FJsonValue> Updated = FollowAndReplace(Root, Tokens, 0, Replacement);
    Result.MergedArtifactJson = SerializeJsonValue(Updated);
    Result.Conflicts[ConflictIndex].Resolution = Choice;

    Result.ConflictPaths.Reset();
    bool bAnyPending = false;
    for (const FGreyboxMergeConflict& Existing : Result.Conflicts)
    {
        Result.ConflictPaths.Add(Existing.JsonPointer);
        if (Existing.Resolution == EGreyboxConflictResolution::Pending)
        {
            bAnyPending = true;
        }
    }
    Result.bHasConflicts = bAnyPending;
    return Result;
}
