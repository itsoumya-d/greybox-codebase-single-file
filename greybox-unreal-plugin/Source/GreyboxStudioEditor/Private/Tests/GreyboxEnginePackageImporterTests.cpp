// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

#include "GreyboxEnginePackageImporter.h"

#include "Containers/StringConv.h"
#include "HAL/FileManager.h"
#include "Misc/AutomationTest.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Misc/SecureHash.h"

#if WITH_DEV_AUTOMATION_TESTS

namespace
{
void AppendUInt16LE(TArray<uint8>& Bytes, const uint16 Value)
{
    Bytes.Add(static_cast<uint8>(Value & 0xff));
    Bytes.Add(static_cast<uint8>((Value >> 8) & 0xff));
}

void AppendUInt32LE(TArray<uint8>& Bytes, const uint32 Value)
{
    Bytes.Add(static_cast<uint8>(Value & 0xff));
    Bytes.Add(static_cast<uint8>((Value >> 8) & 0xff));
    Bytes.Add(static_cast<uint8>((Value >> 16) & 0xff));
    Bytes.Add(static_cast<uint8>((Value >> 24) & 0xff));
}

void AppendUtf8(TArray<uint8>& Bytes, const FTCHARToUTF8& Text)
{
    Bytes.Append(reinterpret_cast<const uint8*>(Text.Get()), Text.Length());
}

FString Sha256Hex(const FTCHARToUTF8& Text)
{
    FSHA256Hash Hash;
    FSHA256::HashBuffer(reinterpret_cast<const uint8*>(Text.Get()), Text.Length(), Hash.Hash);
    return Hash.ToString().ToLower();
}

TArray<uint8> BuildStoredZip(const FString& EntryPath, const FString& Body)
{
    FTCHARToUTF8 BodyUtf8(*Body);
    const FString Manifest = FString::Printf(
        TEXT("{\"files\":[{\"path\":\"%s\",\"language\":\"cpp\",\"purpose\":\"test\",\"sha256\":\"%s\",\"bytes\":%d}]}"),
        *EntryPath,
        *Sha256Hex(BodyUtf8),
        BodyUtf8.Length());

    struct FRecord
    {
        FString Path;
        FString Content;
        uint32 LocalHeaderOffset = 0;
    };

    TArray<FRecord> Records;
    Records.Add({ EntryPath, Body, 0 });
    Records.Add({ TEXT("GreyboxEnginePackageManifest.json"), Manifest, 0 });

    TArray<uint8> Bytes;
    for (FRecord& Record : Records)
    {
        FTCHARToUTF8 EntryPathUtf8(*Record.Path);
        FTCHARToUTF8 EntryBodyUtf8(*Record.Content);
        Record.LocalHeaderOffset = Bytes.Num();
        AppendUInt32LE(Bytes, 0x04034b50);
        AppendUInt16LE(Bytes, 20);
        AppendUInt16LE(Bytes, 0);
        AppendUInt16LE(Bytes, 0);
        AppendUInt16LE(Bytes, 0);
        AppendUInt16LE(Bytes, 0);
        AppendUInt32LE(Bytes, 0);
        AppendUInt32LE(Bytes, EntryBodyUtf8.Length());
        AppendUInt32LE(Bytes, EntryBodyUtf8.Length());
        AppendUInt16LE(Bytes, EntryPathUtf8.Length());
        AppendUInt16LE(Bytes, 0);
        AppendUtf8(Bytes, EntryPathUtf8);
        AppendUtf8(Bytes, EntryBodyUtf8);
    }

    const uint32 CentralDirectoryOffset = Bytes.Num();
    for (const FRecord& Record : Records)
    {
        FTCHARToUTF8 EntryPathUtf8(*Record.Path);
        FTCHARToUTF8 EntryBodyUtf8(*Record.Content);
        AppendUInt32LE(Bytes, 0x02014b50);
        AppendUInt16LE(Bytes, 20);
        AppendUInt16LE(Bytes, 20);
        AppendUInt16LE(Bytes, 0);
        AppendUInt16LE(Bytes, 0);
        AppendUInt16LE(Bytes, 0);
        AppendUInt16LE(Bytes, 0);
        AppendUInt32LE(Bytes, 0);
        AppendUInt32LE(Bytes, EntryBodyUtf8.Length());
        AppendUInt32LE(Bytes, EntryBodyUtf8.Length());
        AppendUInt16LE(Bytes, EntryPathUtf8.Length());
        AppendUInt16LE(Bytes, 0);
        AppendUInt16LE(Bytes, 0);
        AppendUInt16LE(Bytes, 0);
        AppendUInt16LE(Bytes, 0);
        AppendUInt32LE(Bytes, 0);
        AppendUInt32LE(Bytes, Record.LocalHeaderOffset);
        AppendUtf8(Bytes, EntryPathUtf8);
    }

    const uint32 CentralDirectorySize = Bytes.Num() - CentralDirectoryOffset;
    AppendUInt32LE(Bytes, 0x06054b50);
    AppendUInt16LE(Bytes, 0);
    AppendUInt16LE(Bytes, 0);
    AppendUInt16LE(Bytes, Records.Num());
    AppendUInt16LE(Bytes, Records.Num());
    AppendUInt32LE(Bytes, CentralDirectorySize);
    AppendUInt32LE(Bytes, CentralDirectoryOffset);
    AppendUInt16LE(Bytes, 0);
    return Bytes;
}

}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FGreyboxPackageEntryRejectsTraversalTest,
    "Greybox.EnginePackage.EntryRejectsTraversal",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FGreyboxPackageEntryRejectsTraversalTest::RunTest(const FString& Parameters)
{
    FString RelativePath;
    TestFalse(
        TEXT("rejects traversal package entry"),
        FGreyboxEnginePackageImporter::IsSafePackageEntryPath(TEXT("../Source/Boss.cpp"), RelativePath));
    TestFalse(
        TEXT("rejects absolute package entry"),
        FGreyboxEnginePackageImporter::IsSafePackageEntryPath(TEXT("/tmp/AGDSGameViewRuntimeComponent.cpp"), RelativePath));
    TestTrue(
        TEXT("accepts Unreal runtime component"),
        FGreyboxEnginePackageImporter::IsSafePackageEntryPath(
            TEXT("Arena/unreal/AGDSGameViewRuntimeComponent.cpp"),
            RelativePath));
    TestEqual(TEXT("normalizes accepted runtime path"), RelativePath, TEXT("Arena/unreal/AGDSGameViewRuntimeComponent.cpp"));
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FGreyboxPackageSafeFileNameTest,
    "Greybox.EnginePackage.SafeFileName",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FGreyboxPackageSafeFileNameTest::RunTest(const FString& Parameters)
{
    TestEqual(
        TEXT("keeps safe zip file names"),
        FGreyboxEnginePackageImporter::SafeFileName(TEXT("Arena-demo-unreal.zip")),
        TEXT("Arena-demo-unreal.zip"));
    TestEqual(
        TEXT("adds zip extension to package names"),
        FGreyboxEnginePackageImporter::SafeFileName(TEXT("Arena demo unreal")),
        TEXT("Arena_demo_unreal.zip"));
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FGreyboxPackageExtractsStoredZipTest,
    "Greybox.EnginePackage.ExtractsStoredZip",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FGreyboxPackageExtractsStoredZipTest::RunTest(const FString& Parameters)
{
    const FString ImportRoot = FPaths::Combine(FPaths::ProjectIntermediateDir(), TEXT("GreyboxEnginePackageImporterTests"));
    IFileManager::Get().DeleteDirectory(*ImportRoot, false, true);

    int32 ExtractedFileCount = 0;
    FString Error;
    const FString EntryPath = TEXT("Arena/unreal/AGDSGameViewRuntimeComponent.cpp");
    const TArray<uint8> ZipBytes = BuildStoredZip(EntryPath, TEXT("UAGDSGameViewRuntimeComponent::AdvanceWorldTick"));
    TestTrue(
        TEXT("extracts stored ZIP engine package"),
        FGreyboxEnginePackageImporter::ExtractStoredZipPackage(ZipBytes, ImportRoot, ExtractedFileCount, Error));
    TestEqual(TEXT("extracts one file"), ExtractedFileCount, 1);
    TestTrue(
        TEXT("writes runtime component source"),
        FPaths::FileExists(FPaths::Combine(ImportRoot, EntryPath)));
    return true;
}

#endif
