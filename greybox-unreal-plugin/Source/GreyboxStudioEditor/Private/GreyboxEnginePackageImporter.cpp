// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

#include "GreyboxEnginePackageImporter.h"

#include "Dom/JsonObject.h"
#include "GenericPlatform/GenericPlatformHttp.h"
#include "HAL/FileManager.h"
#include "HttpModule.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "Math/UnrealMathUtility.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Misc/SecureHash.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

namespace
{
constexpr uint32 LocalFileHeaderSignature = 0x04034b50;
constexpr uint32 CentralDirectorySignature = 0x02014b50;
constexpr uint32 EndOfCentralDirectorySignature = 0x06054b50;
constexpr uint16 StoredCompressionMethod = 0;
constexpr uint16 EncryptedFlag = 1;
constexpr int32 MaxEnginePackageFiles = 128;
constexpr int64 MaxEnginePackageBytes = 50 * 1024 * 1024;

struct FVerifiedZipEntry
{
    FString RelativePath;
    TArray<uint8> Bytes;
};

FString NormalizedDaemonUrl(FString Url)
{
    Url.TrimStartAndEndInline();
    while (Url.EndsWith(TEXT("/")))
    {
        Url.LeftChopInline(1);
    }
    return Url.IsEmpty() ? TEXT("http://127.0.0.1:17345") : Url;
}

FString UnrealPackageUrl(const FString& DaemonUrl, const FString& ProjectId, const FString& PackageFileName)
{
    const FString Query = PackageFileName.IsEmpty()
        ? TEXT("")
        : FString::Printf(TEXT("?fileName=%s"), *FGenericPlatformHttp::UrlEncode(PackageFileName));
    return FString::Printf(
        TEXT("%s/api/projects/%s/engine-package/unreal%s"),
        *NormalizedDaemonUrl(DaemonUrl),
        *FGenericPlatformHttp::UrlEncode(ProjectId),
        *Query);
}

FGreyboxEnginePackageStageResult FailedStageResult(const FString& Message)
{
    FGreyboxEnginePackageStageResult Result;
    Result.bSucceeded = false;
    Result.ImportRoot = FGreyboxEnginePackageImporter::DefaultImportRoot();
    Result.Message = Message;
    return Result;
}

bool CanRead(const TArray<uint8>& Content, const int64 Offset, const int64 Length)
{
    return Offset >= 0 && Length >= 0 && Offset + Length <= Content.Num();
}

uint16 ReadUInt16LE(const TArray<uint8>& Content, const int64 Offset)
{
    return static_cast<uint16>(Content[Offset] | (Content[Offset + 1] << 8));
}

uint32 ReadUInt32LE(const TArray<uint8>& Content, const int64 Offset)
{
    return static_cast<uint32>(Content[Offset])
        | (static_cast<uint32>(Content[Offset + 1]) << 8)
        | (static_cast<uint32>(Content[Offset + 2]) << 16)
        | (static_cast<uint32>(Content[Offset + 3]) << 24);
}

int64 FindEndOfCentralDirectory(const TArray<uint8>& Content)
{
    const int64 LastPossibleOffset = Content.Num() - 22;
    const int64 FirstPossibleOffset = FMath::Max<int64>(0, LastPossibleOffset - 0xffff);
    for (int64 Offset = LastPossibleOffset; Offset >= FirstPossibleOffset; --Offset)
    {
        if (CanRead(Content, Offset, 4) && ReadUInt32LE(Content, Offset) == EndOfCentralDirectorySignature)
        {
            return Offset;
        }
    }
    return INDEX_NONE;
}

FString ReadAsciiPath(const TArray<uint8>& Content, const int64 Offset, const uint16 Length)
{
    FString Result;
    Result.Reserve(Length);
    for (uint16 Index = 0; Index < Length; ++Index)
    {
        Result.AppendChar(static_cast<TCHAR>(Content[Offset + Index]));
    }
    return Result;
}

FString Sha256Hex(const TArray<uint8>& Bytes)
{
    FSHA256Hash Hash;
    FSHA256::HashBuffer(Bytes.GetData(), Bytes.Num(), Hash.Hash);
    return Hash.ToString().ToLower();
}

bool BufferToText(const TArray<uint8>& Bytes, FString& OutText)
{
    if (Bytes.Num() == 0)
    {
        OutText.Empty();
        return false;
    }
    FFileHelper::BufferToString(OutText, Bytes.GetData(), Bytes.Num());
    return !OutText.IsEmpty();
}

bool ParseManifestHashes(const FString& ManifestJson, TMap<FString, FString>& OutHashes, FString& OutError)
{
    TSharedPtr<FJsonObject> Root;
    const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(ManifestJson);
    if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid())
    {
        OutError = TEXT("Greybox Unreal engine package manifest was not valid JSON.");
        return false;
    }

    const TArray<TSharedPtr<FJsonValue>>* Files = nullptr;
    if (!Root->TryGetArrayField(TEXT("files"), Files) || Files == nullptr || Files->Num() == 0)
    {
        OutError = TEXT("Greybox Unreal engine package manifest did not list runtime files.");
        return false;
    }

    for (const TSharedPtr<FJsonValue>& Value : *Files)
    {
        const TSharedPtr<FJsonObject> FileObject = Value.IsValid() ? Value->AsObject() : nullptr;
        if (!FileObject.IsValid())
        {
            OutError = TEXT("Greybox Unreal engine package manifest has an invalid file entry.");
            return false;
        }
        FString FilePath;
        FString FileHash;
        FileObject->TryGetStringField(TEXT("path"), FilePath);
        FileObject->TryGetStringField(TEXT("sha256"), FileHash);
        FString RelativePath;
        if (!FGreyboxEnginePackageImporter::IsSafePackageEntryPath(FilePath, RelativePath))
        {
            OutError = FString::Printf(TEXT("Greybox Unreal engine package manifest rejected unsafe file path: %s."), *FilePath);
            return false;
        }
        FileHash = FileHash.ToLower();
        if (FileHash.Len() != 64)
        {
            OutError = FString::Printf(TEXT("Greybox Unreal engine package manifest has an invalid SHA-256 for %s."), *RelativePath);
            return false;
        }
        OutHashes.Add(RelativePath, FileHash);
    }

    return true;
}
}

FString FGreyboxEnginePackageImporter::SafeFileName(const FString& FileName)
{
    FString Clean;
    Clean.Reserve(FileName.Len());
    for (const TCHAR Character : FileName)
    {
        const bool bAllowed =
            (Character >= TCHAR('A') && Character <= TCHAR('Z'))
            || (Character >= TCHAR('a') && Character <= TCHAR('z'))
            || (Character >= TCHAR('0') && Character <= TCHAR('9'))
            || Character == TCHAR('.')
            || Character == TCHAR('_')
            || Character == TCHAR('-');
        Clean.AppendChar(bAllowed ? Character : TCHAR('_'));
    }
    if (Clean.IsEmpty())
    {
        Clean = TEXT("greybox-unreal-engine-package.zip");
    }
    if (!Clean.EndsWith(TEXT(".zip")))
    {
        Clean += TEXT(".zip");
    }
    return Clean.Left(120);
}

FString FGreyboxEnginePackageImporter::DefaultPackageCacheDir()
{
    return FPaths::Combine(FPaths::ProjectSavedDir(), TEXT("Greybox"), TEXT("EnginePackages"));
}

FString FGreyboxEnginePackageImporter::DefaultImportRoot()
{
    return FPaths::Combine(FPaths::ProjectSourceDir(), TEXT("GreyboxGenerated"), TEXT("EnginePackage"));
}

bool FGreyboxEnginePackageImporter::IsSafePackageEntryPath(const FString& EntryPath, FString& OutRelativePath)
{
    FString Clean = EntryPath;
    Clean.ReplaceInline(TEXT("\\"), TEXT("/"));
    Clean.TrimStartAndEndInline();
    OutRelativePath.Empty();
    if (Clean.IsEmpty() || Clean.StartsWith(TEXT("/")) || (Clean.Len() >= 2 && Clean[1] == TCHAR(':')))
    {
        return false;
    }
    for (const TCHAR Character : Clean)
    {
        if (Character == TCHAR('\0'))
        {
            return false;
        }
    }

    TArray<FString> Parts;
    Clean.ParseIntoArray(Parts, TEXT("/"), true);
    if (Parts.Num() == 0)
    {
        return false;
    }
    for (const FString& Part : Parts)
    {
        if (Part == TEXT(".") || Part == TEXT(".."))
        {
            return false;
        }
    }
    OutRelativePath = FString::Join(Parts, TEXT("/"));
    return true;
}

bool FGreyboxEnginePackageImporter::ExtractStoredZipPackage(
    const TArray<uint8>& Content,
    const FString& ImportRoot,
    int32& OutExtractedFileCount,
    FString& OutError)
{
    OutExtractedFileCount = 0;
    OutError.Empty();
    if (Content.Num() == 0)
    {
        OutError = TEXT("Greybox Unreal engine package was empty.");
        return false;
    }
    if (Content.Num() > MaxEnginePackageBytes)
    {
        OutError = TEXT("Greybox Unreal engine package exceeds the import size limit.");
        return false;
    }

    const int64 EndOffset = FindEndOfCentralDirectory(Content);
    if (EndOffset == INDEX_NONE || !CanRead(Content, EndOffset, 22))
    {
        OutError = TEXT("Greybox Unreal engine package is missing a ZIP central directory.");
        return false;
    }

    const uint16 EntryCount = ReadUInt16LE(Content, EndOffset + 10);
    const uint32 CentralDirectorySize = ReadUInt32LE(Content, EndOffset + 12);
    const uint32 CentralDirectoryOffset = ReadUInt32LE(Content, EndOffset + 16);
    if (EntryCount > MaxEnginePackageFiles || !CanRead(Content, CentralDirectoryOffset, CentralDirectorySize))
    {
        OutError = TEXT("Greybox Unreal engine package central directory is invalid or too large.");
        return false;
    }

    TArray<FVerifiedZipEntry> Entries;
    FString ManifestJson;
    int64 Offset = CentralDirectoryOffset;
    int64 TotalExtractedBytes = 0;
    for (uint16 EntryIndex = 0; EntryIndex < EntryCount; ++EntryIndex)
    {
        if (!CanRead(Content, Offset, 46) || ReadUInt32LE(Content, Offset) != CentralDirectorySignature)
        {
            OutError = TEXT("Greybox Unreal engine package has an invalid central directory entry.");
            return false;
        }

        const uint16 Flags = ReadUInt16LE(Content, Offset + 8);
        const uint16 Method = ReadUInt16LE(Content, Offset + 10);
        const uint32 CompressedSize = ReadUInt32LE(Content, Offset + 20);
        const uint32 UncompressedSize = ReadUInt32LE(Content, Offset + 24);
        const uint16 NameLength = ReadUInt16LE(Content, Offset + 28);
        const uint16 ExtraLength = ReadUInt16LE(Content, Offset + 30);
        const uint16 CommentLength = ReadUInt16LE(Content, Offset + 32);
        const uint32 LocalHeaderOffset = ReadUInt32LE(Content, Offset + 42);
        const int64 NameOffset = Offset + 46;
        const int64 NextEntryOffset = NameOffset + NameLength + ExtraLength + CommentLength;
        if (!CanRead(Content, NameOffset, NameLength) || !CanRead(Content, NextEntryOffset, 0))
        {
            OutError = TEXT("Greybox Unreal engine package has an invalid entry name.");
            return false;
        }

        const FString EntryName = ReadAsciiPath(Content, NameOffset, NameLength);
        FString RelativePath;
        if (!IsSafePackageEntryPath(EntryName, RelativePath))
        {
            OutError = FString::Printf(TEXT("Greybox Unreal engine package rejected unsafe entry path: %s."), *EntryName);
            return false;
        }
        if (EntryName.EndsWith(TEXT("/")))
        {
            Offset = NextEntryOffset;
            continue;
        }
        if ((Flags & EncryptedFlag) != 0)
        {
            OutError = FString::Printf(TEXT("Encrypted ZIP entries are not supported: %s."), *RelativePath);
            return false;
        }
        if (Method != StoredCompressionMethod)
        {
            OutError = FString::Printf(TEXT("Unsupported ZIP compression method %d for %s."), Method, *RelativePath);
            return false;
        }
        if (CompressedSize != UncompressedSize)
        {
            OutError = FString::Printf(TEXT("Stored ZIP entry size mismatch for %s."), *RelativePath);
            return false;
        }
        TotalExtractedBytes += UncompressedSize;
        if (TotalExtractedBytes > MaxEnginePackageBytes)
        {
            OutError = TEXT("Greybox Unreal engine package extracted bytes exceed the import size limit.");
            return false;
        }

        if (!CanRead(Content, LocalHeaderOffset, 30) || ReadUInt32LE(Content, LocalHeaderOffset) != LocalFileHeaderSignature)
        {
            OutError = FString::Printf(TEXT("Greybox Unreal engine package has an invalid local header for %s."), *RelativePath);
            return false;
        }
        const uint16 LocalNameLength = ReadUInt16LE(Content, LocalHeaderOffset + 26);
        const uint16 LocalExtraLength = ReadUInt16LE(Content, LocalHeaderOffset + 28);
        const int64 BodyOffset = LocalHeaderOffset + 30 + LocalNameLength + LocalExtraLength;
        if (!CanRead(Content, BodyOffset, CompressedSize))
        {
            OutError = FString::Printf(TEXT("Greybox Unreal engine package entry exceeds archive bounds: %s."), *RelativePath);
            return false;
        }

        FVerifiedZipEntry Entry;
        Entry.RelativePath = RelativePath;
        Entry.Bytes.Append(Content.GetData() + BodyOffset, static_cast<int32>(CompressedSize));
        if (RelativePath == TEXT("GreyboxEnginePackageManifest.json"))
        {
            if (!BufferToText(Entry.Bytes, ManifestJson))
            {
                OutError = TEXT("Greybox Unreal engine package manifest could not be decoded as text.");
                return false;
            }
        }
        else
        {
            Entries.Add(MoveTemp(Entry));
        }
        Offset = NextEntryOffset;
    }

    if (ManifestJson.IsEmpty())
    {
        OutError = TEXT("Greybox Unreal engine package is missing GreyboxEnginePackageManifest.json.");
        return false;
    }

    TMap<FString, FString> ExpectedHashes;
    if (!ParseManifestHashes(ManifestJson, ExpectedHashes, OutError))
    {
        return false;
    }
    if (Entries.Num() == 0)
    {
        OutError = TEXT("Greybox Unreal engine package contained no extractable files.");
        return false;
    }

    IFileManager::Get().MakeDirectory(*ImportRoot, true);
    int32 VerifiedFileCount = 0;
    for (const FVerifiedZipEntry& Entry : Entries)
    {
        const FString* ExpectedHash = ExpectedHashes.Find(Entry.RelativePath);
        if (ExpectedHash == nullptr)
        {
            OutError = FString::Printf(TEXT("Greybox Unreal engine package entry was not listed in the manifest: %s."), *Entry.RelativePath);
            return false;
        }
        const FString ActualHash = Sha256Hex(Entry.Bytes);
        if (ActualHash != *ExpectedHash)
        {
            OutError = FString::Printf(TEXT("Greybox Unreal engine package SHA-256 mismatch for %s."), *Entry.RelativePath);
            return false;
        }

        const FString TargetPath = FPaths::Combine(ImportRoot, Entry.RelativePath);
        IFileManager::Get().MakeDirectory(*FPaths::GetPath(TargetPath), true);
        if (!FFileHelper::SaveArrayToFile(Entry.Bytes, *TargetPath))
        {
            OutError = FString::Printf(TEXT("Could not extract Greybox Unreal package entry to %s."), *TargetPath);
            return false;
        }
        VerifiedFileCount += 1;
    }
    if (VerifiedFileCount != ExpectedHashes.Num())
    {
        OutError = TEXT("Greybox Unreal engine package did not extract every manifest-listed runtime file.");
        return false;
    }

    OutExtractedFileCount = VerifiedFileCount;
    return true;
}

bool FGreyboxEnginePackageImporter::StageDownloadedPackage(
    const FString& FileName,
    const TArray<uint8>& Content,
    FGreyboxEnginePackageStageResult& OutResult)
{
    OutResult = FGreyboxEnginePackageStageResult();
    OutResult.ImportRoot = DefaultImportRoot();
    if (Content.Num() == 0)
    {
        OutResult.Message = TEXT("Greybox Unreal engine package was empty.");
        return false;
    }

    const FString CacheDir = DefaultPackageCacheDir();
    IFileManager::Get().MakeDirectory(*CacheDir, true);
    const FString PackagePath = FPaths::Combine(CacheDir, SafeFileName(FileName));
    if (!FFileHelper::SaveArrayToFile(Content, *PackagePath))
    {
        OutResult.Message = FString::Printf(TEXT("Could not write Greybox Unreal engine package to %s."), *PackagePath);
        return false;
    }

    FString ExtractError;
    int32 ExtractedFileCount = 0;
    if (!ExtractStoredZipPackage(Content, OutResult.ImportRoot, ExtractedFileCount, ExtractError))
    {
        OutResult.Message = ExtractError;
        return false;
    }

    OutResult.bSucceeded = true;
    OutResult.PackagePath = PackagePath;
    OutResult.BytesWritten = Content.Num();
    OutResult.ExtractedFileCount = ExtractedFileCount;
    OutResult.Message = FString::Printf(
        TEXT("Saved Greybox Unreal engine package to %s and extracted %d checksum-verified files into %s."),
        *PackagePath,
        ExtractedFileCount,
        *OutResult.ImportRoot);
    return true;
}

void FGreyboxEnginePackageImporter::DownloadAndStageUnrealPackageAsync(
    const FString& DaemonUrl,
    const FString& ProjectId,
    const FString& PackageFileName,
    TFunction<void(const FGreyboxEnginePackageStageResult& Result)> Completion)
{
    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
    Request->SetURL(UnrealPackageUrl(DaemonUrl, ProjectId, PackageFileName));
    Request->SetVerb(TEXT("GET"));
    Request->SetHeader(TEXT("Accept"), TEXT("application/zip"));
    Request->OnProcessRequestComplete().BindLambda(
        [PackageFileName, Completion = MoveTemp(Completion)](
            FHttpRequestPtr,
            FHttpResponsePtr Response,
            bool bRequestSucceeded) mutable
        {
            if (!bRequestSucceeded || !Response.IsValid())
            {
                Completion(FailedStageResult(TEXT("Greybox Unreal engine-package download failed.")));
                return;
            }
            if (Response->GetResponseCode() < 200 || Response->GetResponseCode() >= 300)
            {
                Completion(FailedStageResult(FString::Printf(
                    TEXT("Greybox Unreal engine-package download returned HTTP %d."),
                    Response->GetResponseCode())));
                return;
            }

            FGreyboxEnginePackageStageResult Result;
            StageDownloadedPackage(PackageFileName, Response->GetContent(), Result);
            Completion(Result);
        });
    Request->ProcessRequest();
}
