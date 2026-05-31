# Proprietary and confidential. Copyright (c) 2026 Greybox Studio.
@tool
extends RefCounted
class_name GreyboxProjectImporter

# Top-level orchestrator that turns a Stream-0 canonical GameProject JSON document
# into real Godot 4 PackedScenes / Resources written under `output_dir`.
#
# Sub-importers each return a per-step result Dictionary. We collect every step into
# the returned `ProjectImportResult` so the caller (editor dock, headless tool,
# release script) can surface warnings without halting the whole pipeline.

const GreyboxAssetImporter := preload("res://addons/greybox_studio/importers/asset_importer.gd")
const GreyboxCharacterImporter := preload("res://addons/greybox_studio/importers/character_importer.gd")
const GreyboxScreenImporter := preload("res://addons/greybox_studio/importers/screen_importer.gd")
const GreyboxFlowImporter := preload("res://addons/greybox_studio/importers/flow_importer.gd")

const SUPPORTED_SCHEMA_VERSION := "1.0.0"


static func import_from_json(json_path: String, asset_base_dir: String, output_dir: String) -> Dictionary:
    var result := _empty_result(output_dir)

    if not FileAccess.file_exists(json_path):
        result["errors"].append("GameProject JSON does not exist: %s" % json_path)
        return result

    var raw := FileAccess.open(json_path, FileAccess.READ)
    if raw == null:
        result["errors"].append("Could not read GameProject JSON: %s" % json_path)
        return result
    var body := raw.get_as_text()
    raw.close()

    var project := JSON.parse_string(body)
    if typeof(project) != TYPE_DICTIONARY:
        result["errors"].append("GameProject JSON did not parse as an object: %s" % json_path)
        return result

    var schema_version := str(project.get("schemaVersion", ""))
    result["schema_version"] = schema_version
    if schema_version != SUPPORTED_SCHEMA_VERSION:
        result["warnings"].append("GameProject schemaVersion=%s differs from supported %s." % [schema_version, SUPPORTED_SCHEMA_VERSION])

    return import_from_dictionary(project, asset_base_dir, output_dir)


static func import_from_dictionary(project: Dictionary, asset_base_dir: String, output_dir: String) -> Dictionary:
    var result := _empty_result(output_dir)
    var meta_entry = project.get("meta", {})
    if typeof(meta_entry) == TYPE_DICTIONARY:
        result["project_id"] = str(meta_entry.get("id", ""))

    var normalized_output := _ensure_trailing_slash(output_dir)
    var ensure_root := _ensure_directory(normalized_output)
    if not ensure_root.get("succeeded", false):
        result["errors"].append(ensure_root.get("message", "Could not prepare output directory."))
        return result

    # Assets first so screen/character importers can reference them.
    var assets := project.get("assets", [])
    if typeof(assets) == TYPE_ARRAY:
        for asset in assets:
            if typeof(asset) != TYPE_DICTIONARY:
                continue
            var asset_result: Dictionary = GreyboxAssetImporter.import_asset(asset, asset_base_dir, normalized_output)
            result["asset_results"].append(asset_result)
            if asset_result.get("succeeded", false):
                result["copied_asset_paths"].append(asset_result.get("godot_path", ""))
                result["asset_lookup"][str(asset.get("id", ""))] = asset_result.get("godot_path", "")
            else:
                result["warnings"].append(asset_result.get("message", ""))

    # Characters next so screen importer can resolve Character3DRef.
    var characters := project.get("characters", [])
    if typeof(characters) == TYPE_ARRAY:
        for character in characters:
            if typeof(character) != TYPE_DICTIONARY:
                continue
            var character_result: Dictionary = GreyboxCharacterImporter.import_character(character, result["asset_lookup"], normalized_output)
            result["character_results"].append(character_result)
            if character_result.get("succeeded", false):
                result["created_scene_paths"].append(character_result.get("scene_path", ""))
                result["character_lookup"][str(character.get("id", ""))] = character_result.get("scene_path", "")
            else:
                result["warnings"].append(character_result.get("message", ""))

    var screens := project.get("screens", [])
    if typeof(screens) == TYPE_ARRAY:
        for screen in screens:
            if typeof(screen) != TYPE_DICTIONARY:
                continue
            var screen_result: Dictionary = GreyboxScreenImporter.import_screen(
                screen,
                result["asset_lookup"],
                result["character_lookup"],
                normalized_output
            )
            result["screen_results"].append(screen_result)
            if screen_result.get("succeeded", false):
                result["created_scene_paths"].append(screen_result.get("scene_path", ""))
                result["screen_lookup"][str(screen.get("id", ""))] = screen_result.get("scene_path", "")
                result["warnings"].append_array(screen_result.get("warnings", []))
            else:
                result["errors"].append(screen_result.get("message", ""))

    var flow_edges := project.get("flow", [])
    if typeof(flow_edges) == TYPE_ARRAY:
        var flow_result := GreyboxFlowImporter.write_flow_dispatcher(flow_edges, result["screen_lookup"], normalized_output)
        result["flow_result"] = flow_result
        if flow_result.get("succeeded", false):
            result["created_scene_paths"].append(flow_result.get("script_path", ""))
        else:
            result["warnings"].append(flow_result.get("message", ""))

    result["succeeded"] = result["errors"].is_empty()
    result["message"] = (
        "Imported %d screen scenes, %d character scenes, %d assets." % [
            result["screen_lookup"].size(),
            result["character_lookup"].size(),
            result["copied_asset_paths"].size()
        ]
    )
    return result


static func _empty_result(output_dir: String) -> Dictionary:
    return {
        "succeeded": false,
        "schema_version": "",
        "project_id": "",
        "output_dir": output_dir,
        "created_scene_paths": [],
        "copied_asset_paths": [],
        "asset_lookup": {},
        "character_lookup": {},
        "screen_lookup": {},
        "asset_results": [],
        "character_results": [],
        "screen_results": [],
        "flow_result": {},
        "warnings": [],
        "errors": [],
        "message": ""
    }


static func _ensure_trailing_slash(path: String) -> String:
    var clean := path.strip_edges()
    if clean.is_empty():
        clean = "res://Greybox/"
    if not clean.ends_with("/"):
        clean += "/"
    return clean


static func _ensure_directory(path: String) -> Dictionary:
    var globalized := ProjectSettings.globalize_path(path)
    var directory_error := DirAccess.make_dir_recursive_absolute(globalized)
    if directory_error != OK:
        return {
            "succeeded": false,
            "message": "Could not create Greybox import directory %s (code %d)." % [path, directory_error]
        }
    return {"succeeded": true, "message": ""}
