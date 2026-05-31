# SPDX-License-Identifier: Apache-2.0
@tool
extends RefCounted
class_name GreyboxCommunityArtifactImporter

const GreyboxCommunityArtifact = preload("res://addons/greybox_studio_community/runtime/greybox_artifact.gd")


static func import_gameview_json(path: String, designer_name: String = "") -> Dictionary:
	var loaded := _read_json_file(path)
	if loaded.get("ok") != true:
		return loaded
	var root := Node2D.new()
	root.name = "GreyboxGameview"
	root.set_meta("greybox_source_path", path)
	root.set_meta("generator", _generator(designer_name))
	var nodes: Array = _artifact_items(loaded.get("value", {}), ["nodes", "objects", "elements", "entities"])
	for index in range(nodes.size()):
		var entry: Variant = nodes[index]
		var child := Node2D.new()
		child.name = _safe_node_name(_entry_name(entry, "GameviewNode%d" % [index + 1]))
		if entry is Dictionary:
			var position_value: Variant = entry.get("position", entry.get("pos", null))
			if position_value is Dictionary:
				child.position = Vector2(float(position_value.get("x", 0.0)), float(position_value.get("y", 0.0)))
			child.set_meta("greybox_payload", entry)
		root.add_child(child)
	return { "ok": true, "node": root, "count": nodes.size(), "kind": ".gameview.json" }


static func import_design_markdown(path: String, designer_name: String = "") -> Dictionary:
	var text := _read_text_file(path)
	if text.get("ok") != true:
		return text
	var artifact := GreyboxCommunityArtifact.from_text(path, "DESIGN.md", text.get("value", ""), designer_name)
	return { "ok": true, "resource": artifact, "kind": "DESIGN.md" }


static func import_hud_html(path: String, designer_name: String = "") -> Dictionary:
	var text := _read_text_file(path)
	if text.get("ok") != true:
		return text
	var root := Control.new()
	root.name = "GreyboxHudPlan"
	root.set_meta("greybox_source_path", path)
	root.set_meta("generator", _generator(designer_name))
	var label := RichTextLabel.new()
	label.name = "HudHtmlPreview"
	label.fit_content = true
	label.bbcode_enabled = false
	label.text = text.get("value", "").substr(0, 4000)
	root.add_child(label)
	return { "ok": true, "node": root, "kind": "HUD HTML" }


static func import_level_board_json(path: String, designer_name: String = "") -> Dictionary:
	var loaded := _read_json_file(path)
	if loaded.get("ok") != true:
		return loaded
	var root := Node2D.new()
	root.name = "GreyboxLevelBoard"
	root.set_meta("greybox_source_path", path)
	root.set_meta("generator", _generator(designer_name))
	var rows: Array = _artifact_items(loaded.get("value", {}), ["rows", "tiles", "cells", "board"])
	for index in range(rows.size()):
		var marker := Node2D.new()
		marker.name = _safe_node_name("LevelBoardRow%d" % [index + 1])
		marker.position = Vector2(0, index * 32)
		marker.set_meta("greybox_payload", rows[index])
		root.add_child(marker)
	return { "ok": true, "node": root, "count": rows.size(), "kind": "level board JSON" }


static func _read_text_file(path: String) -> Dictionary:
	if path.strip_edges() == "":
		return { "ok": false, "error": "A source path is required." }
	if not FileAccess.file_exists(path):
		return { "ok": false, "error": "Source file does not exist: %s" % [path] }
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return { "ok": false, "error": "Could not open source file: %s" % [path] }
	return { "ok": true, "value": file.get_as_text() }


static func _read_json_file(path: String) -> Dictionary:
	var text := _read_text_file(path)
	if text.get("ok") != true:
		return text
	var parsed: Variant = JSON.parse_string(text.get("value", ""))
	if parsed == null:
		return { "ok": false, "error": "Source JSON could not be parsed: %s" % [path] }
	return { "ok": true, "value": parsed }


static func _artifact_items(value: Variant, keys: Array[String]) -> Array:
	if value is Array:
		return value
	if value is Dictionary:
		for key in keys:
			var candidate: Variant = value.get(key, null)
			if candidate is Array:
				return candidate
	return []


static func _entry_name(entry: Variant, fallback: String) -> String:
	if entry is Dictionary:
		for key in ["name", "id", "title", "label"]:
			var value: Variant = entry.get(key, "")
			if value is String and value.strip_edges() != "":
				return value
	return fallback


static func _safe_node_name(value: String) -> String:
	var cleaned := value.strip_edges()
	for token in ["/", "\\", ":", "*", "?", "\"", "<", ">", "|"]:
		cleaned = cleaned.replace(token, "_")
	return cleaned if cleaned != "" else "GreyboxNode"


static func _generator(designer_name: String) -> String:
	var clean_name := designer_name.strip_edges()
	return "Greybox" if clean_name == "" else "Greybox + %s" % [clean_name]
