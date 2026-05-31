# Proprietary and confidential. Copyright (c) 2026 Greybox Studio.
@tool
extends EditorPlugin

const GreyboxDock := preload("res://addons/greybox_studio/studio_dock.gd")
const GreyboxMcpBridge := preload("res://addons/greybox_studio/mcp/mcp_bridge.gd")

var _dock: Control

func _enter_tree() -> void:
    _dock = GreyboxDock.new()
    _dock.name = "Greybox Studio"
    _dock.set_meta("greybox_owning_plugin", self)
    add_control_to_dock(DOCK_SLOT_RIGHT_UL, _dock)


func _exit_tree() -> void:
    GreyboxMcpBridge.stop()
    if _dock:
        remove_control_from_docks(_dock)
        _dock.queue_free()
        _dock = null
