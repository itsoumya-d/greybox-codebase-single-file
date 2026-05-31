# Proprietary and confidential. Copyright (c) 2026 Greybox Studio.
@tool
extends RefCounted

const GreyboxProjectImporter := preload("res://addons/greybox_studio/importers/project_importer.gd")

const FIXTURE_JSON := "res://Validation~/fixtures/sample-project/project.json"
const FIXTURE_ASSETS := "res://Validation~/fixtures/sample-project/assets"
const OUTPUT_DIR := "user://greybox_test_output/"


static func run() -> Array:
    var results: Array = []

    var globalized_output := ProjectSettings.globalize_path(OUTPUT_DIR)
    var clean_error := _wipe_dir(globalized_output)
    if clean_error != OK and clean_error != ERR_FILE_NOT_FOUND:
        results.append({"name": "project/output dir wiped", "passed": false, "message": "code=%d" % clean_error})
        return results

    if not FileAccess.file_exists(FIXTURE_JSON):
        # When running outside a Godot project layout (e.g. directly via run_tests.gd)
        # the fixture path resolves relative to the addon root. Skip gracefully.
        results.append({"name": "project/fixture present", "passed": false, "message": "fixture missing at %s" % FIXTURE_JSON})
        return results

    var asset_base := ProjectSettings.globalize_path(FIXTURE_ASSETS)
    var result := GreyboxProjectImporter.import_from_json(FIXTURE_JSON, asset_base, OUTPUT_DIR)

    results.append({"name": "project/import succeeded", "passed": result.get("succeeded", false), "message": str(result.get("errors", []))})
    results.append({"name": "project/screen count", "passed": result.get("screen_lookup", {}).size() == 2, "message": "got %d" % result.get("screen_lookup", {}).size()})
    results.append({"name": "project/character count", "passed": result.get("character_lookup", {}).size() == 1, "message": ""})
    results.append({"name": "project/asset copied", "passed": result.get("copied_asset_paths", []).size() >= 1, "message": ""})

    var menu_scene := str(result.get("screen_lookup", {}).get("scr-main-menu", ""))
    results.append({"name": "project/main menu scene exists", "passed": FileAccess.file_exists(menu_scene), "message": menu_scene})

    var gameplay_scene := str(result.get("screen_lookup", {}).get("scr-gameplay", ""))
    results.append({"name": "project/gameplay scene exists", "passed": FileAccess.file_exists(gameplay_scene), "message": gameplay_scene})

    var character_scene := str(result.get("character_lookup", {}).get("char-hero", ""))
    results.append({"name": "project/hero scene exists", "passed": FileAccess.file_exists(character_scene), "message": character_scene})

    var flow_path := str(result.get("flow_result", {}).get("script_path", ""))
    results.append({"name": "project/flow dispatcher emitted", "passed": FileAccess.file_exists(flow_path), "message": flow_path})

    return results


static func _wipe_dir(path: String) -> int:
    var dir := DirAccess.open(path)
    if dir == null:
        return ERR_FILE_NOT_FOUND
    var error := dir.list_dir_begin()
    if error != OK:
        return error
    while true:
        var entry := dir.get_next()
        if entry == "":
            break
        if entry == "." or entry == "..":
            continue
        var full := path.path_join(entry)
        if dir.current_is_dir():
            _wipe_dir(full)
            DirAccess.remove_absolute(full)
        else:
            DirAccess.remove_absolute(full)
    dir.list_dir_end()
    return OK
