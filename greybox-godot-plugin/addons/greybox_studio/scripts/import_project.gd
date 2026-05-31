# Proprietary and confidential. Copyright (c) 2026 Greybox Studio.
@tool
extends SceneTree

# Headless CLI runner for the Greybox project importer.
#
# Usage:
#   godot --headless --script res://addons/greybox_studio/scripts/import_project.gd -- \
#       --json path/to/project.json \
#       --asset-base path/to/assets \
#       --output res://Greybox/
#
# Exit codes:
#   0  success
#   1  invalid arguments
#   2  importer reported errors
#
# Emits one JSON line to stdout describing the outcome so CI pipelines can
# parse it; warnings are also surfaced via push_warning().

const GreyboxProjectImporter := preload("res://addons/greybox_studio/importers/project_importer.gd")


func _initialize() -> void:
    var args := _collect_args()
    var json_path := str(args.get("json", ""))
    var asset_base := str(args.get("asset-base", ""))
    var output := str(args.get("output", "res://Greybox/"))

    if json_path.is_empty():
        printerr("Greybox import_project: --json <path> is required.")
        quit(1)
        return

    var result: Dictionary = GreyboxProjectImporter.import_from_json(json_path, asset_base, output)
    print(JSON.stringify(result))
    if not result.get("succeeded", false):
        quit(2)
        return
    quit(0)


func _collect_args() -> Dictionary:
    var collected := {}
    var argv := OS.get_cmdline_user_args()
    var index := 0
    while index < argv.size():
        var current := str(argv[index])
        if current.begins_with("--"):
            var key := current.substr(2)
            var value := ""
            if index + 1 < argv.size() and not str(argv[index + 1]).begins_with("--"):
                value = str(argv[index + 1])
                index += 1
            collected[key] = value
        index += 1
    return collected
