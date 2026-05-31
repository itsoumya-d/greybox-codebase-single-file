# SPDX-License-Identifier: Apache-2.0
@tool
extends VBoxContainer
class_name GreyboxCommunityImportDock

const GreyboxCommunityArtifactImporter = preload("res://addons/greybox_studio_community/importers/artifact_importers.gd")

var _designer_name := LineEdit.new()
var _source_path := LineEdit.new()
var _status := RichTextLabel.new()


func _ready() -> void:
	_build_ui()


func _build_ui() -> void:
	var title := Label.new()
	title.text = "Greybox"
	title.tooltip_text = "Free local import for AI-assisted Greybox game-design artifacts."
	add_child(title)

	_designer_name.placeholder_text = "Human designer name"
	_designer_name.tooltip_text = "Stored in imported metadata as Greybox + designer."
	add_child(_designer_name)

	_source_path.placeholder_text = "res:// or absolute artifact path"
	_source_path.tooltip_text = "Use .gameview.json, DESIGN.md, HUD HTML, or level board JSON."
	add_child(_source_path)

	var gameview_button := Button.new()
	gameview_button.text = "Import Gameview"
	gameview_button.pressed.connect(_import_gameview)
	add_child(gameview_button)

	var design_button := Button.new()
	design_button.text = "Import DESIGN.md"
	design_button.pressed.connect(_import_design)
	add_child(design_button)

	var hud_button := Button.new()
	hud_button.text = "Import HUD HTML"
	hud_button.pressed.connect(_import_hud)
	add_child(hud_button)

	var board_button := Button.new()
	board_button.text = "Import Level Board"
	board_button.pressed.connect(_import_level_board)
	add_child(board_button)

	_status.fit_content = true
	_status.bbcode_enabled = false
	_status.text = "Imports stay local. No telemetry, cloud calls, paid unlocks, or model training."
	add_child(_status)


func _import_gameview() -> void:
	_show_result(GreyboxCommunityArtifactImporter.import_gameview_json(_source_path.text, _designer_name.text))


func _import_design() -> void:
	_show_result(GreyboxCommunityArtifactImporter.import_design_markdown(_source_path.text, _designer_name.text))


func _import_hud() -> void:
	_show_result(GreyboxCommunityArtifactImporter.import_hud_html(_source_path.text, _designer_name.text))


func _import_level_board() -> void:
	_show_result(GreyboxCommunityArtifactImporter.import_level_board_json(_source_path.text, _designer_name.text))


func _show_result(result: Dictionary) -> void:
	if result.get("ok") != true:
		_status.text = str(result.get("error", "Import failed."))
		return
	var kind := str(result.get("kind", "artifact"))
	var count := int(result.get("count", 1))
	var imported_node: Variant = result.get("node", null)
	if imported_node is Node:
		var scene_root := EditorInterface.get_edited_scene_root()
		if scene_root != null:
			scene_root.add_child(imported_node)
			imported_node.owner = scene_root
			_status.text = "Imported %s into the current scene (%d item%s)." % [kind, count, "" if count == 1 else "s"]
			return
	_status.text = "Imported %s locally (%d item%s)." % [kind, count, "" if count == 1 else "s"]
