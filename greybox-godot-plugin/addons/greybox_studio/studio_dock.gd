# Proprietary and confidential. Copyright (c) 2026 Greybox Studio.
@tool
extends VBoxContainer

const GreyboxEnginePackageImporter := preload("res://addons/greybox_studio/importers/engine_package_importer.gd")
const GreyboxEnginePackagePreflightClient := preload("res://addons/greybox_studio/sync/engine_package_preflight.gd")
const GreyboxMcpBridge := preload("res://addons/greybox_studio/mcp/mcp_bridge.gd")
const GreyboxProjectImporter := preload("res://addons/greybox_studio/importers/project_importer.gd")

var project_id := ""
var daemon_url := "http://127.0.0.1:17345"
var _last_preflight := {}
var _last_import_result := {}
var _project_id_input: LineEdit
var _package_status: Label
var _import_status: Label
var _import_scene_list: ItemList
var _open_first_screen_button: Button

func _ready() -> void:
    var title := Label.new()
    title.text = "Greybox Studio"
    add_child(title)

    var import_hint := Label.new()
    import_hint.text = "Import .gameview.json, DESIGN.md, HUD HTML, and level board JSON into Godot scenes and resources."
    import_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
    add_child(import_hint)

    var sync_hint := Label.new()
    sync_hint.text = "Round-trip sync uses /api/sync/godot?projectId=<id> and /api/projects/:id/round-trip-merge."
    sync_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
    add_child(sync_hint)

    _project_id_input = LineEdit.new()
    _project_id_input.placeholder_text = "Greybox project id"
    _project_id_input.text = project_id
    _project_id_input.text_changed.connect(func(value: String) -> void:
        project_id = value.strip_edges()
    )
    add_child(_project_id_input)

    var check_package := Button.new()
    check_package.text = "Check Godot Export"
    check_package.pressed.connect(_check_godot_export)
    add_child(check_package)

    var download_package := Button.new()
    download_package.text = "Download Godot Export"
    download_package.pressed.connect(_download_godot_export)
    add_child(download_package)

    _package_status = Label.new()
    _package_status.text = "Godot export preflight checks /api/game-deliverables/:id/engine-package/godot/preflight."
    _package_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
    add_child(_package_status)

    var copy_mcp := Button.new()
    copy_mcp.text = "Copy MCP Config"
    copy_mcp.pressed.connect(_copy_mcp_config)
    add_child(copy_mcp)

    var rotate_mcp := Button.new()
    rotate_mcp.text = "Rotate MCP Token"
    rotate_mcp.pressed.connect(_rotate_mcp_token)
    add_child(rotate_mcp)

    var import_section := Label.new()
    import_section.text = "Greybox GameProject import"
    import_section.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
    add_child(import_section)

    var import_button := Button.new()
    import_button.text = "Import GameProject..."
    import_button.pressed.connect(_show_import_dialog)
    add_child(import_button)

    _import_status = Label.new()
    _import_status.text = "Pick a canonical .greybox.json file to materialize screens, characters, and assets."
    _import_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
    add_child(_import_status)

    _import_scene_list = ItemList.new()
    _import_scene_list.custom_minimum_size = Vector2(0, 120)
    _import_scene_list.visible = false
    add_child(_import_scene_list)

    _open_first_screen_button = Button.new()
    _open_first_screen_button.text = "Open first imported screen"
    _open_first_screen_button.pressed.connect(_open_first_imported_screen)
    _open_first_screen_button.visible = false
    add_child(_open_first_screen_button)


func _show_import_dialog() -> void:
    var dialog := FileDialog.new()
    dialog.file_mode = FileDialog.FILE_MODE_OPEN_FILE
    dialog.access = FileDialog.ACCESS_FILESYSTEM
    dialog.add_filter("*.json ; Greybox GameProject (*.json)")
    dialog.add_filter("*.greybox.json ; Greybox GameProject (*.greybox.json)")
    dialog.file_selected.connect(_on_import_project_selected.bind(dialog))
    dialog.canceled.connect(func() -> void: dialog.queue_free())
    add_child(dialog)
    dialog.popup_centered_ratio(0.6)


func _on_import_project_selected(path: String, dialog: FileDialog) -> void:
    dialog.queue_free()
    _import_status.text = "Importing Greybox GameProject from %s..." % path
    var asset_base_dir := path.get_base_dir()
    var output_dir := "res://Greybox/"
    var result: Dictionary = GreyboxProjectImporter.import_from_json(path, asset_base_dir, output_dir)
    _last_import_result = result
    _refresh_import_status(result)


func _refresh_import_status(result: Dictionary) -> void:
    var success := bool(result.get("succeeded", false))
    var summary: String = str(result.get("message", ""))
    var error_lines: Array = result.get("errors", [])
    if not success and not error_lines.is_empty():
        summary += "\nErrors: %s" % ", ".join(error_lines)
    var warning_lines: Array = result.get("warnings", [])
    if not warning_lines.is_empty():
        summary += "\nWarnings: %d (see editor log)." % warning_lines.size()
        for warning in warning_lines:
            push_warning("Greybox import: %s" % str(warning))
    _import_status.text = summary
    _import_scene_list.clear()
    var scene_paths: Array = result.get("created_scene_paths", [])
    for scene_path in scene_paths:
        _import_scene_list.add_item(str(scene_path))
    _import_scene_list.visible = not scene_paths.is_empty()
    _open_first_screen_button.visible = success and not result.get("screen_lookup", {}).is_empty()


func _open_first_imported_screen() -> void:
    if _last_import_result.is_empty():
        return
    var screen_lookup: Dictionary = _last_import_result.get("screen_lookup", {})
    if screen_lookup.is_empty():
        return
    var first_path := ""
    for value in screen_lookup.values():
        first_path = str(value)
        break
    if first_path.is_empty():
        return
    if not Engine.is_editor_hint():
        return
    # Godot 4 exposes EditorInterface as a global accessor on EditorPlugin instances;
    # the running plugin pushes itself via set_meta() below for tests, but at runtime
    # we resolve via the editor singleton namespace.
    if Engine.has_singleton("EditorInterface"):
        var editor_interface := Engine.get_singleton("EditorInterface")
        if editor_interface and editor_interface.has_method("open_scene_from_path"):
            editor_interface.call("open_scene_from_path", first_path)
            return
    # Fallback: rely on the parent plugin meta when running inside the editor.
    var owning_plugin := get_meta("greybox_owning_plugin", null)
    if owning_plugin is EditorPlugin:
        var interface := owning_plugin.get_editor_interface()
        if interface and interface.has_method("open_scene_from_path"):
            interface.open_scene_from_path(first_path)


func _copy_mcp_config() -> void:
    DisplayServer.clipboard_set(GreyboxMcpBridge.client_config_json())


func _rotate_mcp_token() -> void:
    GreyboxMcpBridge.rotate_bearer_token()


func _check_godot_export() -> void:
    if project_id.is_empty():
        _package_status.text = "Enter a Greybox project id before running Godot engine-package preflight."
        return
    _package_status.text = "Checking Godot export package..."
    var client := GreyboxEnginePackagePreflightClient.new(daemon_url)
    client.fetch_godot_preflight(project_id, self, func(payload: Dictionary) -> void:
        _last_preflight = payload
        if bool(payload.get("ready", false)):
            _package_status.text = "Ready: %s files, %s bytes, %s runtime hooks." % [
                payload.get("file_count", 0),
                payload.get("size_bytes", 0),
                payload.get("runtime_hooks", []).size()
            ]
        else:
            _package_status.text = "Godot export preflight failed: %s" % payload.get("error", "unknown error")
    )


func _download_godot_export() -> void:
    if project_id.is_empty():
        _package_status.text = "Enter a Greybox project id before downloading a Godot engine package."
        return
    if not bool(_last_preflight.get("ready", false)):
        _package_status.text = "Run Check Godot Export before downloading."
        return
    var package_file_name := str(_last_preflight.get("package_file_name", "greybox-godot-engine-package.zip"))
    _package_status.text = "Downloading Godot engine package..."
    GreyboxEnginePackageImporter.download_and_stage_godot_package(
        daemon_url,
        project_id,
        package_file_name,
        self,
        func(result: Dictionary) -> void:
            _package_status.text = str(result.get("message", "Godot engine package download finished."))
    )
