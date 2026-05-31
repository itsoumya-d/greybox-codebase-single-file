# SPDX-License-Identifier: Apache-2.0
@tool
extends EditorPlugin

const GreyboxCommunityDock = preload("res://addons/greybox_studio_community/studio_dock.gd")

var _dock: Control


func _enter_tree() -> void:
	_dock = GreyboxCommunityDock.new()
	_dock.name = "Greybox"
	add_control_to_dock(DOCK_SLOT_RIGHT_UL, _dock)


func _exit_tree() -> void:
	if _dock != null:
		remove_control_from_docks(_dock)
		_dock.queue_free()
		_dock = null
