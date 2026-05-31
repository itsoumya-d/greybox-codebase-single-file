// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

#include "Importers/GreyboxCharacterImporter.h"

#include "Dom/JsonObject.h"
#include "Dom/JsonValue.h"
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

const TArray<FString>& MixamoJoints()
{
    static const TArray<FString> Joints = {
        TEXT("mixamorig:Hips"),
        TEXT("mixamorig:Spine"),
        TEXT("mixamorig:Spine1"),
        TEXT("mixamorig:Spine2"),
        TEXT("mixamorig:Neck"),
        TEXT("mixamorig:Head"),
        TEXT("mixamorig:HeadTop_End"),
        TEXT("mixamorig:LeftShoulder"),
        TEXT("mixamorig:LeftArm"),
        TEXT("mixamorig:LeftForeArm"),
        TEXT("mixamorig:LeftHand"),
        TEXT("mixamorig:RightShoulder"),
        TEXT("mixamorig:RightArm"),
        TEXT("mixamorig:RightForeArm"),
        TEXT("mixamorig:RightHand"),
        TEXT("mixamorig:LeftUpLeg"),
        TEXT("mixamorig:LeftLeg"),
        TEXT("mixamorig:LeftFoot"),
        TEXT("mixamorig:LeftToeBase"),
        TEXT("mixamorig:LeftToe_End"),
        TEXT("mixamorig:RightUpLeg"),
        TEXT("mixamorig:RightLeg"),
        TEXT("mixamorig:RightFoot"),
        TEXT("mixamorig:RightToeBase"),
        TEXT("mixamorig:RightToe_End"),
    };
    return Joints;
}

FString DescriptorDiskPath(const FString& CharacterId)
{
    return FPaths::Combine(
        FPaths::ProjectSavedDir(),
        TEXT("Greybox"),
        TEXT("ImportPlans"),
        TEXT("Characters"),
        CharacterId + TEXT(".greybox-character.json"));
}
}

bool FGreyboxCharacterImporter::IsMixamoStandardJoint(const FString& JointName)
{
    for (const FString& Joint : MixamoJoints())
    {
        if (Joint == JointName)
        {
            return true;
        }
    }
    return false;
}

FString FGreyboxCharacterImporter::CharacterPackageBase(const FString& ContentRoot, const FString& CharacterId)
{
    return JoinPath(ContentRoot, TEXT("Characters/") + CharacterId);
}

FString FGreyboxCharacterImporter::SkeletalMeshPackagePath(const FString& ContentRoot, const FString& CharacterId)
{
    return CharacterPackageBase(ContentRoot, CharacterId) + TEXT("_SK");
}

FString FGreyboxCharacterImporter::AnimBlueprintPackagePath(const FString& ContentRoot, const FString& CharacterId)
{
    return CharacterPackageBase(ContentRoot, CharacterId) + TEXT("_ABP");
}

FString FGreyboxCharacterImporter::AnimSequencePackagePath(
    const FString& ContentRoot,
    const FString& CharacterId,
    const FString& ClipName)
{
    FString SafeClip = ClipName;
    SafeClip.ReplaceInline(TEXT(" "), TEXT("_"));
    return CharacterPackageBase(ContentRoot, CharacterId) + TEXT("_AnimClip_") + SafeClip;
}

TArray<FGreyboxImportedAsset> FGreyboxCharacterImporter::BuildCharacterDescriptor(
    const FGreyboxCharacterSpec& Character,
    const FString& ContentRoot,
    TArray<FString>& OutWarnings)
{
    TArray<FGreyboxImportedAsset> Items;
    if (Character.Id.IsEmpty())
    {
        OutWarnings.Add(TEXT("Greybox character is missing an id and was skipped."));
        return Items;
    }

    const FString SkeletalMesh = SkeletalMeshPackagePath(ContentRoot, Character.Id);
    const FString AnimBlueprint = AnimBlueprintPackagePath(ContentRoot, Character.Id);
    const FString Skeleton = CharacterPackageBase(ContentRoot, Character.Id) + TEXT("_Skeleton");
    const FString PhysAsset = CharacterPackageBase(ContentRoot, Character.Id) + TEXT("_PhysAsset");

    Items.Add({ SkeletalMesh, TEXT("SkeletalMesh"), Character.Id });
    Items.Add({ Skeleton, TEXT("Skeleton"), Character.Id });
    Items.Add({ PhysAsset, TEXT("PhysicsAsset"), Character.Id });
    Items.Add({ AnimBlueprint, TEXT("AnimBlueprint"), Character.Id });

    TArray<FString> NonStandardJoints;
    for (const FGreyboxRigJointSpec& Joint : Character.Joints)
    {
        if (!IsMixamoStandardJoint(Joint.JointName))
        {
            NonStandardJoints.Add(Joint.JointName);
        }
    }
    if (NonStandardJoints.Num() > 0)
    {
        OutWarnings.Add(FString::Printf(
            TEXT("Character '%s' has %d non-Mixamo joints (e.g. '%s'); animation retargeting may fail."),
            *Character.Id,
            NonStandardJoints.Num(),
            *NonStandardJoints[0]));
    }

    TSharedPtr<FJsonObject> Descriptor = MakeShared<FJsonObject>();
    Descriptor->SetStringField(TEXT("characterId"), Character.Id);
    Descriptor->SetStringField(TEXT("characterName"), Character.Name);
    Descriptor->SetStringField(TEXT("meshAssetRef"), Character.MeshAssetRef);
    Descriptor->SetStringField(TEXT("skeletalMeshPackagePath"), SkeletalMesh);
    Descriptor->SetStringField(TEXT("skeletonPackagePath"), Skeleton);
    Descriptor->SetStringField(TEXT("physicsAssetPackagePath"), PhysAsset);
    Descriptor->SetStringField(TEXT("animBlueprintPackagePath"), AnimBlueprint);

    TArray<TSharedPtr<FJsonValue>> JointValues;
    JointValues.Reserve(Character.Joints.Num());
    for (const FGreyboxRigJointSpec& Joint : Character.Joints)
    {
        TSharedRef<FJsonObject> JointObject = MakeShared<FJsonObject>();
        JointObject->SetStringField(TEXT("name"), Joint.JointName);
        JointObject->SetStringField(TEXT("parent"), Joint.ParentName);
        JointObject->SetBoolField(TEXT("mixamoStandard"), IsMixamoStandardJoint(Joint.JointName));
        JointValues.Add(MakeShared<FJsonValueObject>(JointObject));
    }
    Descriptor->SetArrayField(TEXT("joints"), JointValues);

    TArray<TSharedPtr<FJsonValue>> AnimationValues;
    AnimationValues.Reserve(Character.Animations.Num());
    for (const FGreyboxAnimationClipSpec& Clip : Character.Animations)
    {
        const FString ClipPath = AnimSequencePackagePath(ContentRoot, Character.Id, Clip.Name.IsEmpty() ? Clip.Id : Clip.Name);
        TSharedRef<FJsonObject> ClipObject = MakeShared<FJsonObject>();
        ClipObject->SetStringField(TEXT("clipId"), Clip.Id);
        ClipObject->SetStringField(TEXT("clipName"), Clip.Name);
        ClipObject->SetStringField(TEXT("clipAssetRef"), Clip.ClipAssetRef);
        ClipObject->SetStringField(TEXT("animSequencePackagePath"), ClipPath);
        ClipObject->SetNumberField(TEXT("durationSeconds"), Clip.Duration);
        ClipObject->SetBoolField(TEXT("loop"), Clip.bLoop);
        AnimationValues.Add(MakeShared<FJsonValueObject>(ClipObject));
        Items.Add({ ClipPath, TEXT("AnimSequence"), Clip.Id });
    }
    Descriptor->SetArrayField(TEXT("animations"), AnimationValues);

    TSharedRef<FJsonObject> StatsObject = MakeShared<FJsonObject>();
    for (const TPair<FString, float>& Pair : Character.GameStats)
    {
        StatsObject->SetNumberField(Pair.Key, Pair.Value);
    }
    Descriptor->SetObjectField(TEXT("gameStats"), StatsObject);

    const FString DescriptorPath = DescriptorDiskPath(Character.Id);
    FString DescriptorBody;
    const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&DescriptorBody);
    FJsonSerializer::Serialize(Descriptor.ToSharedRef(), Writer);
    IFileManager::Get().MakeDirectory(*FPaths::GetPath(DescriptorPath), true);
    FFileHelper::SaveStringToFile(DescriptorBody, *DescriptorPath);

    return Items;
}
