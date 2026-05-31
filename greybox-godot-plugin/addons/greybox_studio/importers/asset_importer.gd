# Proprietary and confidential. Copyright (c) 2026 Greybox Studio.
@tool
extends RefCounted
class_name GreyboxAssetImporter

# Copies a canonical Asset blob from `asset_base_dir` into the Godot project tree.
# When running inside the editor it also nudges EditorFileSystem to re-scan so that
# Godot imports the file as a Texture2D / glTF / AudioStream. In headless mode the
# raw file lands at the destination path and a `requires_editor_reimport` flag is set.
#
# Supported asset types (matches schema/src/asset.ts):
#   gltf, fbx, png, jpg, webp, mp3, wav, json, prefab
# We persist the original extension; Godot's importer machinery picks the right
# import script via the file extension.

const ASSET_SUBDIR := "assets"
const SUPPORTED_TYPE_EXTENSIONS := {
    "gltf": "glb",
    "fbx": "fbx",
    "png": "png",
    "jpg": "jpg",
    "webp": "webp",
    "mp3": "mp3",
    "wav": "wav",
    "json": "json",
    "prefab": "tscn"
}


static func import_asset(asset: Dictionary, asset_base_dir: String, output_dir: String) -> Dictionary:
    var asset_id := str(asset.get("id", ""))
    if asset_id.is_empty():
        return _failure("Asset entry is missing an id.")

    var asset_type := str(asset.get("type", ""))
    if not SUPPORTED_TYPE_EXTENSIONS.has(asset_type):
        return _failure("Asset %s has unsupported type %s." % [asset_id, asset_type])

    var uri := str(asset.get("uri", ""))
    if uri.is_empty():
        return _failure("Asset %s has empty uri." % asset_id)

    var source_path := _resolve_source_path(uri, asset_base_dir)
    if source_path.is_empty():
        return _failure("Could not resolve source path for asset %s (uri=%s)." % [asset_id, uri])

    var extension := _detect_extension(uri, asset_type)
    var godot_path := output_dir.path_join(ASSET_SUBDIR).path_join("%s.%s" % [asset_id, extension])
    var ensure_dir := _ensure_dir(godot_path.get_base_dir())
    if not ensure_dir.get("succeeded", false):
        return _failure(ensure_dir.get("message", ""))

    var copy_result := _copy_file(source_path, godot_path)
    if not copy_result.get("succeeded", false):
        return _failure(copy_result.get("message", ""))

    var requires_reimport := _nudge_editor_reimport(godot_path)

    return {
        "succeeded": true,
        "asset_id": asset_id,
        "asset_type": asset_type,
        "godot_path": godot_path,
        "absolute_path": ProjectSettings.globalize_path(godot_path),
        "bytes_copied": int(copy_result.get("bytes_copied", 0)),
        "requires_editor_reimport": requires_reimport,
        "message": "Copied asset %s to %s." % [asset_id, godot_path]
    }


static func _resolve_source_path(uri: String, asset_base_dir: String) -> String:
    if uri.begins_with("http://") or uri.begins_with("https://"):
        return ""  # remote fetch is handled separately by the daemon
    if uri.is_absolute_path():
        return uri
    var clean_base := asset_base_dir.strip_edges()
    if clean_base.is_empty():
        return uri
    return clean_base.path_join(uri)


static func _detect_extension(uri: String, asset_type: String) -> String:
    var uri_extension := uri.get_extension().to_lower()
    if not uri_extension.is_empty():
        return uri_extension
    return str(SUPPORTED_TYPE_EXTENSIONS.get(asset_type, "bin"))


static func _copy_file(source: String, destination: String) -> Dictionary:
    var src := FileAccess.open(source, FileAccess.READ)
    if src == null:
        return {"succeeded": false, "message": "Asset source file is unreadable: %s." % source}
    var content := src.get_buffer(src.get_length())
    src.close()

    var dst := FileAccess.open(destination, FileAccess.WRITE)
    if dst == null:
        return {"succeeded": false, "message": "Could not open Godot destination for write: %s." % destination}
    dst.store_buffer(content)
    dst.close()
    return {"succeeded": true, "bytes_copied": content.size(), "message": ""}


static func _ensure_dir(path: String) -> Dictionary:
    var globalized := ProjectSettings.globalize_path(path)
    var directory_error := DirAccess.make_dir_recursive_absolute(globalized)
    if directory_error != OK:
        return {"succeeded": false, "message": "Could not create Greybox asset directory %s (code %d)." % [path, directory_error]}
    return {"succeeded": true, "message": ""}


static func _nudge_editor_reimport(_path: String) -> bool:
    # When the addon is enabled in the editor we want Godot to import the new file
    # immediately so downstream importers can reference the .import resource. In
    # headless tooling Engine.is_editor_hint() is false and we just leave the bytes
    # in place; release-readiness scripts copy them out before invoking the editor.
    if not Engine.is_editor_hint():
        return true
    if not Engine.has_singleton("EditorInterface"):
        return true
    var editor_interface := Engine.get_singleton("EditorInterface")
    if editor_interface == null:
        return true
    var efs = editor_interface.call("get_resource_filesystem")
    if efs == null:
        return true
    if efs.has_method("scan"):
        efs.call("scan")
    return false


static func _failure(message: String) -> Dictionary:
    return {
        "succeeded": false,
        "asset_id": "",
        "asset_type": "",
        "godot_path": "",
        "absolute_path": "",
        "bytes_copied": 0,
        "requires_editor_reimport": false,
        "message": message
    }
