# Proprietary and confidential. Copyright (c) 2026 Greybox Studio.
@tool
extends RefCounted
class_name GreyboxEnginePackageImporter

const PACKAGE_CACHE_DIR := "user://greybox/engine-packages"
const IMPORT_ROOT := "res://GreyboxGenerated/EnginePackage"
const MAX_EXTRACTED_FILES := 128
const MAX_EXTRACTED_BYTES := 52428800


static func godot_engine_package_url(daemon_url: String, project_id: String, file_name := "") -> String:
    var clean_daemon_url := daemon_url.rstrip("/")
    if clean_daemon_url.is_empty():
        clean_daemon_url = "http://127.0.0.1:17345"
    var query := "" if file_name.is_empty() else "?fileName=%s" % file_name.uri_encode()
    return "%s/api/projects/%s/engine-package/godot%s" % [clean_daemon_url, project_id.uri_encode(), query]


static func safe_file_name(file_name: String) -> String:
    var clean := ""
    var allowed := "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._-"
    for index in range(file_name.length()):
        var character := file_name.substr(index, 1)
        clean += character if allowed.contains(character) else "_"
    if clean.is_empty():
        clean = "greybox-godot-engine-package.zip"
    if not clean.ends_with(".zip"):
        clean += ".zip"
    return clean.left(120)


static func is_safe_package_entry_path(entry_path: String) -> Dictionary:
    var clean := entry_path.replace("\\", "/").strip_edges()
    if clean.is_empty() or clean.begins_with("/") or (clean.length() >= 2 and clean.substr(1, 1) == ":"):
        return {"safe": false, "path": ""}
    if clean.contains("\u0000"):
        return {"safe": false, "path": ""}

    var parts := clean.split("/", false)
    if parts.is_empty():
        return {"safe": false, "path": ""}
    for part in parts:
        if part == "." or part == "..":
            return {"safe": false, "path": ""}
    return {"safe": true, "path": "/".join(parts)}


static func sha256_hex(content: PackedByteArray) -> String:
    var context := HashingContext.new()
    context.start(HashingContext.HASH_SHA256)
    context.update(content)
    return context.finish().hex_encode()


static func _manifest_hashes(reader: ZIPReader, entries: PackedStringArray) -> Dictionary:
    if not entries.has("GreyboxEnginePackageManifest.json"):
        return {
            "succeeded": false,
            "hashes": {},
            "message": "Greybox Godot engine package is missing GreyboxEnginePackageManifest.json."
        }

    var manifest_bytes := reader.read_file("GreyboxEnginePackageManifest.json")
    var parsed := JSON.parse_string(manifest_bytes.get_string_from_utf8())
    if typeof(parsed) != TYPE_DICTIONARY:
        return {
            "succeeded": false,
            "hashes": {},
            "message": "Greybox Godot engine package manifest was not valid JSON."
        }
    var files := parsed.get("files", [])
    if typeof(files) != TYPE_ARRAY or files.is_empty():
        return {
            "succeeded": false,
            "hashes": {},
            "message": "Greybox Godot engine package manifest did not list runtime files."
        }

    var hashes := {}
    for file in files:
        if typeof(file) != TYPE_DICTIONARY:
            return {
                "succeeded": false,
                "hashes": {},
                "message": "Greybox Godot engine package manifest has an invalid file entry."
            }
        var path := str(file.get("path", ""))
        var safe_path := is_safe_package_entry_path(path)
        if not bool(safe_path.get("safe", false)):
            return {
                "succeeded": false,
                "hashes": {},
                "message": "Greybox Godot engine package manifest rejected unsafe file path: %s." % path
            }
        var sha256 := str(file.get("sha256", "")).to_lower()
        if sha256.length() != 64:
            return {
                "succeeded": false,
                "hashes": {},
                "message": "Greybox Godot engine package manifest has an invalid SHA-256 for %s." % path
            }
        hashes[str(safe_path.get("path", ""))] = sha256
    return {
        "succeeded": true,
        "hashes": hashes,
        "message": ""
    }


static func stage_downloaded_package(file_name: String, content: PackedByteArray) -> Dictionary:
    if content.is_empty():
        return {
            "succeeded": false,
            "package_path": "",
            "import_root": IMPORT_ROOT,
            "bytes_written": 0,
            "message": "Greybox Godot engine package was empty."
        }

    var cache_dir := ProjectSettings.globalize_path(PACKAGE_CACHE_DIR)
    var directory_error := DirAccess.make_dir_recursive_absolute(cache_dir)
    if directory_error != OK:
        return {
            "succeeded": false,
            "package_path": "",
            "import_root": IMPORT_ROOT,
            "bytes_written": 0,
            "message": "Could not create Greybox Godot engine package cache: %d." % directory_error
        }

    var package_path := PACKAGE_CACHE_DIR.path_join(safe_file_name(file_name))
    var manifest_path := is_safe_package_entry_path("GreyboxEnginePackageManifest.json")
    if not bool(manifest_path.get("safe", false)):
        return {
            "succeeded": false,
            "package_path": "",
            "import_root": IMPORT_ROOT,
            "bytes_written": 0,
            "message": "Greybox Godot engine package manifest path failed safety validation."
        }

    var file := FileAccess.open(package_path, FileAccess.WRITE)
    if file == null:
        return {
            "succeeded": false,
            "package_path": package_path,
            "import_root": IMPORT_ROOT,
            "bytes_written": 0,
            "message": "Could not write Greybox Godot engine package to %s." % package_path
        }
    file.store_buffer(content)
    file.close()

    var extraction_result := extract_staged_package(package_path, IMPORT_ROOT)
    if not bool(extraction_result.get("succeeded", false)):
        extraction_result["package_path"] = package_path
        extraction_result["bytes_written"] = content.size()
        return extraction_result

    return {
        "succeeded": true,
        "package_path": package_path,
        "import_root": IMPORT_ROOT,
        "bytes_written": content.size(),
        "extracted_file_count": int(extraction_result.get("extracted_file_count", 0)),
        "verified_file_count": int(extraction_result.get("verified_file_count", 0)),
        "extracted_bytes": int(extraction_result.get("extracted_bytes", 0)),
        "message": "Saved Greybox Godot engine package to %s and extracted %d checksum-verified files into %s." % [
            package_path,
            int(extraction_result.get("verified_file_count", 0)),
            IMPORT_ROOT
        ]
    }


static func extract_staged_package(package_path: String, import_root := IMPORT_ROOT) -> Dictionary:
    var reader := ZIPReader.new()
    var open_error := reader.open(package_path)
    if open_error != OK:
        return {
            "succeeded": false,
            "package_path": package_path,
            "import_root": import_root,
            "extracted_file_count": 0,
            "extracted_bytes": 0,
            "message": "Could not open Greybox Godot engine package ZIP: %d." % open_error
        }

    var entries := reader.get_files()
    if entries.is_empty():
        reader.close()
        return {
            "succeeded": false,
            "package_path": package_path,
            "import_root": import_root,
            "extracted_file_count": 0,
            "extracted_bytes": 0,
            "message": "Greybox Godot engine package contained no files."
        }
    if entries.size() > MAX_EXTRACTED_FILES:
        reader.close()
        return {
            "succeeded": false,
            "package_path": package_path,
            "import_root": import_root,
            "extracted_file_count": 0,
            "extracted_bytes": 0,
            "message": "Greybox Godot engine package contains too many files."
        }

    var manifest_result := _manifest_hashes(reader, entries)
    if not bool(manifest_result.get("succeeded", false)):
        reader.close()
        return {
            "succeeded": false,
            "package_path": package_path,
            "import_root": import_root,
            "extracted_file_count": 0,
            "verified_file_count": 0,
            "extracted_bytes": 0,
            "message": manifest_result.get("message", "Greybox Godot engine package manifest validation failed.")
        }
    var expected_hashes := manifest_result.get("hashes", {})

    var root_dir_error := DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(import_root))
    if root_dir_error != OK:
        reader.close()
        return {
            "succeeded": false,
            "package_path": package_path,
            "import_root": import_root,
            "extracted_file_count": 0,
            "verified_file_count": 0,
            "extracted_bytes": 0,
            "message": "Could not create Greybox Godot import root: %d." % root_dir_error
        }

    var extracted_file_count := 0
    var verified_file_count := 0
    var extracted_bytes := 0
    for entry_path in entries:
        if str(entry_path).ends_with("/"):
            continue
        var safe_path := is_safe_package_entry_path(str(entry_path))
        if not bool(safe_path.get("safe", false)):
            reader.close()
            return {
                "succeeded": false,
                "package_path": package_path,
                "import_root": import_root,
                "extracted_file_count": extracted_file_count,
                "verified_file_count": verified_file_count,
                "extracted_bytes": extracted_bytes,
                "message": "Greybox Godot engine package rejected unsafe entry path: %s." % entry_path
            }

        var entry_bytes := reader.read_file(str(entry_path))
        extracted_bytes += entry_bytes.size()
        if extracted_bytes > MAX_EXTRACTED_BYTES:
            reader.close()
            return {
                "succeeded": false,
                "package_path": package_path,
                "import_root": import_root,
                "extracted_file_count": extracted_file_count,
                "verified_file_count": verified_file_count,
                "extracted_bytes": extracted_bytes,
                "message": "Greybox Godot engine package extracted bytes exceed the import size limit."
            }

        var relative_path := str(safe_path.get("path", ""))
        if relative_path != "GreyboxEnginePackageManifest.json":
            if not expected_hashes.has(relative_path):
                reader.close()
                return {
                    "succeeded": false,
                    "package_path": package_path,
                    "import_root": import_root,
                    "extracted_file_count": extracted_file_count,
                    "verified_file_count": verified_file_count,
                    "extracted_bytes": extracted_bytes,
                    "message": "Greybox Godot engine package entry was not listed in the manifest: %s." % relative_path
                }
            var actual_sha256 := sha256_hex(entry_bytes)
            if actual_sha256 != str(expected_hashes.get(relative_path, "")).to_lower():
                reader.close()
                return {
                    "succeeded": false,
                    "package_path": package_path,
                    "import_root": import_root,
                    "extracted_file_count": extracted_file_count,
                    "verified_file_count": verified_file_count,
                    "extracted_bytes": extracted_bytes,
                    "message": "Greybox Godot engine package SHA-256 mismatch for %s." % relative_path
                }
            verified_file_count += 1
        var target_path := import_root.path_join(relative_path)
        var target_dir := target_path.get_base_dir()
        var dir_error := DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(target_dir))
        if dir_error != OK:
            reader.close()
            return {
                "succeeded": false,
                "package_path": package_path,
                "import_root": import_root,
                "extracted_file_count": extracted_file_count,
                "verified_file_count": verified_file_count,
                "extracted_bytes": extracted_bytes,
                "message": "Could not create Greybox Godot package directory: %d." % dir_error
            }
        var output := FileAccess.open(target_path, FileAccess.WRITE)
        if output == null:
            reader.close()
            return {
                "succeeded": false,
                "package_path": package_path,
                "import_root": import_root,
                "extracted_file_count": extracted_file_count,
                "verified_file_count": verified_file_count,
                "extracted_bytes": extracted_bytes,
                "message": "Could not extract Greybox Godot package entry to %s." % target_path
            }
        output.store_buffer(entry_bytes)
        output.close()
        extracted_file_count += 1

    reader.close()
    if extracted_file_count == 0:
        return {
            "succeeded": false,
            "package_path": package_path,
            "import_root": import_root,
            "extracted_file_count": 0,
            "verified_file_count": 0,
            "extracted_bytes": 0,
            "message": "Greybox Godot engine package contained no extractable files."
        }
    if verified_file_count != expected_hashes.size():
        return {
            "succeeded": false,
            "package_path": package_path,
            "import_root": import_root,
            "extracted_file_count": extracted_file_count,
            "verified_file_count": verified_file_count,
            "extracted_bytes": extracted_bytes,
            "message": "Greybox Godot engine package did not extract every manifest-listed runtime file."
        }
    return {
        "succeeded": true,
        "package_path": package_path,
        "import_root": import_root,
        "extracted_file_count": extracted_file_count,
        "verified_file_count": verified_file_count,
        "extracted_bytes": extracted_bytes,
        "message": "Extracted %d checksum-verified Greybox Godot engine package files into %s." % [
            verified_file_count,
            import_root
        ]
    }


static func download_and_stage_godot_package(
    daemon_url: String,
    project_id: String,
    package_file_name: String,
    parent: Node,
    completed: Callable
) -> HTTPRequest:
    var request := HTTPRequest.new()
    request.name = "GreyboxGodotEnginePackageDownload"
    parent.add_child(request)
    request.request_completed.connect(func(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
        if response_code < 200 or response_code >= 300:
            completed.call({
                "succeeded": false,
                "package_path": "",
                "import_root": IMPORT_ROOT,
                "bytes_written": 0,
                "message": "Greybox Godot engine-package download returned HTTP %d." % response_code,
                "request_result": result
            })
            request.queue_free()
            return
        var stage_result := GreyboxEnginePackageImporter.stage_downloaded_package(package_file_name, body)
        stage_result["request_result"] = result
        completed.call(stage_result)
        request.queue_free()
    )
    var error := request.request(
        godot_engine_package_url(daemon_url, project_id, package_file_name),
        PackedStringArray(["Accept: application/zip"]),
        HTTPClient.METHOD_GET
    )
    if error != OK:
        completed.call({
            "succeeded": false,
            "package_path": "",
            "import_root": IMPORT_ROOT,
            "bytes_written": 0,
            "message": "Could not start Godot engine-package download request: %d." % error,
            "request_result": error
        })
        request.queue_free()
    return request
