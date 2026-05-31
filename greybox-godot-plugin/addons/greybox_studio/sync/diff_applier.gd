# Proprietary and confidential. Copyright (c) 2026 Greybox Studio.
@tool
extends RefCounted
class_name GreyboxDiffApplier

# Three-way merge of canonical GameProject documents serialised as Dictionary trees.
#
# Strategy:
#   For every leaf path P, compare base[P], local[P], remote[P].
#       - if local == remote                         => merged[P] = local
#       - if local == base and remote != base        => merged[P] = remote (remote-only edit wins)
#       - if remote == base and local != base        => merged[P] = local  (local-only edit wins)
#       - if local != base and remote != base
#           and local != remote                       => CONFLICT (recorded, merged[P] = local as default)
#
# For arrays, elements are matched by an `id` field if present; otherwise positional.
# Deletions are detected: if a key existed in base but is missing in either local or remote,
# and the other side did not modify it, the deletion is honoured; otherwise it's a conflict.
#
# Supported scalar types (mirrors SUPPORTED_FIELD_TYPES literal that legacy validators check):
#   int, float, String, bool, Color, Vector2, Vector3, Quaternion, Array, Dictionary.
#
# This file kept the original `merge()` entry point for backwards compatibility — it now
# delegates into the full three-way machinery, accepting either JSON strings (legacy) or
# Dictionaries (new).

const SUPPORTED_FIELD_TYPES := ["int", "float", "String", "bool", "Color", "Vector2", "Vector3", "Quaternion"]

const RESOLUTION_PENDING := 0
const RESOLUTION_LOCAL := 1
const RESOLUTION_REMOTE := 2
const RESOLUTION_BASE := 3


# Legacy JSON-string entrypoint. Preserved so existing sync clients keep working.
static func merge(base_artifact_json: String, web_artifact_json: String, godot_edit_json: String, last_synced_sha256: String) -> Dictionary:
    if base_artifact_json.is_empty() or web_artifact_json.is_empty() or godot_edit_json.is_empty():
        return {
            "succeeded": false,
            "has_conflicts": false,
            "merged_artifact_json": "",
            "conflict_paths": [],
            "last_synced_sha256": last_synced_sha256
        }

    var base := JSON.parse_string(base_artifact_json)
    var web := JSON.parse_string(web_artifact_json)
    var edit := JSON.parse_string(godot_edit_json)
    if typeof(base) != TYPE_DICTIONARY or typeof(web) != TYPE_DICTIONARY or typeof(edit) != TYPE_DICTIONARY:
        return {
            "succeeded": false,
            "has_conflicts": false,
            "merged_artifact_json": "",
            "conflict_paths": [],
            "last_synced_sha256": last_synced_sha256
        }

    var merge_result := apply_three_way_merge(base, edit, web)
    var conflict_paths: Array[String] = []
    for conflict in merge_result.get("conflicts", []):
        conflict_paths.append(str(conflict.get("path", "")))

    return {
        "succeeded": true,
        "has_conflicts": not conflict_paths.is_empty(),
        "merged_artifact_json": JSON.stringify(merge_result.get("merged", {})),
        "conflict_paths": conflict_paths,
        "last_synced_sha256": last_synced_sha256
    }


static func supports_field_type(field_type: String) -> bool:
    return field_type in SUPPORTED_FIELD_TYPES


# Public three-way merge entrypoint. Inputs are arbitrary nested Dictionary trees.
# Returns: { "merged": Dictionary, "conflicts": Array[Dictionary] }.
static func apply_three_way_merge(base: Dictionary, local: Dictionary, remote: Dictionary) -> Dictionary:
    var conflicts: Array = []
    var merged := _merge_dict(base, local, remote, "", conflicts)
    return {
        "merged": merged,
        "conflicts": conflicts
    }


# Resolve a single conflict using the supplied resolution constant. Mutates `merged`
# at the given path, returning the new merged tree. Caller is expected to track which
# conflict ids are still pending.
static func resolve_conflict(merged: Dictionary, conflict: Dictionary, resolution: int) -> Dictionary:
    var path := str(conflict.get("path", ""))
    var chosen
    match resolution:
        RESOLUTION_LOCAL:
            chosen = conflict.get("local_value")
        RESOLUTION_REMOTE:
            chosen = conflict.get("remote_value")
        RESOLUTION_BASE:
            chosen = conflict.get("base_value")
        _:
            return merged
    _set_at_path(merged, path, chosen)
    conflict["resolution"] = resolution
    return merged


# -- internal helpers ---------------------------------------------------------------------------

static func _merge_dict(base: Dictionary, local: Dictionary, remote: Dictionary, prefix: String, conflicts: Array) -> Dictionary:
    var merged := {}
    var keys := {}
    for key in base.keys():
        keys[key] = true
    for key in local.keys():
        keys[key] = true
    for key in remote.keys():
        keys[key] = true

    for key in keys.keys():
        var path := _join_path(prefix, str(key))
        var has_base := base.has(key)
        var has_local := local.has(key)
        var has_remote := remote.has(key)
        var base_v = base.get(key) if has_base else null
        var local_v = local.get(key) if has_local else null
        var remote_v = remote.get(key) if has_remote else null

        if not has_local and not has_remote:
            # Both deleted (or never existed) — drop.
            continue
        if not has_local:
            if not has_base or _values_equal(base_v, remote_v):
                merged[key] = remote_v  # remote added or unchanged
            elif _values_equal(base_v, remote_v):
                # local deletion, remote unchanged — drop
                continue
            else:
                conflicts.append(_make_conflict(path, base_v, null, remote_v))
                merged[key] = remote_v
            continue
        if not has_remote:
            if not has_base or _values_equal(base_v, local_v):
                merged[key] = local_v
            elif _values_equal(base_v, local_v):
                continue
            else:
                conflicts.append(_make_conflict(path, base_v, local_v, null))
                merged[key] = local_v
            continue

        merged[key] = _merge_value(base_v, local_v, remote_v, path, conflicts)
    return merged


static func _merge_value(base_v, local_v, remote_v, path: String, conflicts: Array):
    # Both sides agree -> no conflict.
    if _values_equal(local_v, remote_v):
        return local_v

    # If one side matches base, the other side's edit wins.
    var local_equals_base := _values_equal(base_v, local_v)
    var remote_equals_base := _values_equal(base_v, remote_v)
    if local_equals_base and not remote_equals_base:
        return remote_v
    if remote_equals_base and not local_equals_base:
        return local_v

    # Both edited.
    if typeof(local_v) == TYPE_DICTIONARY and typeof(remote_v) == TYPE_DICTIONARY:
        var base_dict: Dictionary = base_v if typeof(base_v) == TYPE_DICTIONARY else {}
        return _merge_dict(base_dict, local_v, remote_v, path, conflicts)
    if typeof(local_v) == TYPE_ARRAY and typeof(remote_v) == TYPE_ARRAY:
        var base_arr: Array = base_v if typeof(base_v) == TYPE_ARRAY else []
        return _merge_array(base_arr, local_v, remote_v, path, conflicts)

    # Scalar conflict.
    conflicts.append(_make_conflict(path, base_v, local_v, remote_v))
    return local_v  # default to local — caller can resolve later via resolve_conflict()


static func _merge_array(base_arr: Array, local_arr: Array, remote_arr: Array, path: String, conflicts: Array) -> Array:
    var has_ids := _array_has_id_key(local_arr) and _array_has_id_key(remote_arr) and _array_has_id_key(base_arr)
    if not has_ids:
        return _merge_array_positional(base_arr, local_arr, remote_arr, path, conflicts)
    return _merge_array_by_id(base_arr, local_arr, remote_arr, path, conflicts)


static func _merge_array_positional(base_arr: Array, local_arr: Array, remote_arr: Array, path: String, conflicts: Array) -> Array:
    if _arrays_equal(local_arr, remote_arr):
        return local_arr
    if _arrays_equal(base_arr, local_arr):
        return remote_arr
    if _arrays_equal(base_arr, remote_arr):
        return local_arr
    # Genuine conflict — element-level walk for deeper precision.
    var length := max(local_arr.size(), remote_arr.size())
    var merged: Array = []
    for index in range(length):
        var local_index_path := "%s[%d]" % [path, index]
        var has_local := index < local_arr.size()
        var has_remote := index < remote_arr.size()
        var has_base := index < base_arr.size()
        var local_v = local_arr[index] if has_local else null
        var remote_v = remote_arr[index] if has_remote else null
        var base_v = base_arr[index] if has_base else null
        if not has_local and has_remote:
            merged.append(remote_v)
            continue
        if not has_remote and has_local:
            merged.append(local_v)
            continue
        merged.append(_merge_value(base_v, local_v, remote_v, local_index_path, conflicts))
    return merged


static func _merge_array_by_id(base_arr: Array, local_arr: Array, remote_arr: Array, path: String, conflicts: Array) -> Array:
    var base_by_id := _array_index_by_id(base_arr)
    var local_by_id := _array_index_by_id(local_arr)
    var remote_by_id := _array_index_by_id(remote_arr)

    var ordered_ids: Array = []
    var seen := {}
    var ordered_sources: Array = [local_arr, remote_arr, base_arr]
    for source in ordered_sources:
        for entry in source:
            if typeof(entry) != TYPE_DICTIONARY:
                continue
            var entry_id := str(entry.get("id", ""))
            if entry_id.is_empty() or seen.has(entry_id):
                continue
            seen[entry_id] = true
            ordered_ids.append(entry_id)

    var merged: Array = []
    for entry_id in ordered_ids:
        var has_base := base_by_id.has(entry_id)
        var has_local := local_by_id.has(entry_id)
        var has_remote := remote_by_id.has(entry_id)
        var element_path := "%s[id=%s]" % [path, entry_id]
        var base_v = base_by_id.get(entry_id) if has_base else null
        var local_v = local_by_id.get(entry_id) if has_local else null
        var remote_v = remote_by_id.get(entry_id) if has_remote else null

        if not has_local and not has_remote:
            continue
        if not has_local:
            if has_base and _values_equal(base_v, remote_v):
                continue  # local deletion, remote unchanged
            if has_base:
                conflicts.append(_make_conflict(element_path, base_v, null, remote_v))
            merged.append(remote_v)
            continue
        if not has_remote:
            if has_base and _values_equal(base_v, local_v):
                continue  # remote deletion, local unchanged
            if has_base:
                conflicts.append(_make_conflict(element_path, base_v, local_v, null))
            merged.append(local_v)
            continue
        merged.append(_merge_value(base_v, local_v, remote_v, element_path, conflicts))
    return merged


static func _array_has_id_key(arr: Array) -> bool:
    if arr.is_empty():
        return false
    for entry in arr:
        if typeof(entry) != TYPE_DICTIONARY:
            return false
        if not entry.has("id"):
            return false
    return true


static func _array_index_by_id(arr: Array) -> Dictionary:
    var index := {}
    for entry in arr:
        if typeof(entry) != TYPE_DICTIONARY:
            continue
        var entry_id := str(entry.get("id", ""))
        if entry_id.is_empty():
            continue
        index[entry_id] = entry
    return index


static func _arrays_equal(left: Array, right: Array) -> bool:
    if left.size() != right.size():
        return false
    for index in range(left.size()):
        if not _values_equal(left[index], right[index]):
            return false
    return true


static func _values_equal(left, right) -> bool:
    if typeof(left) != typeof(right):
        # Allow numeric int/float comparison since JSON often loses the distinction.
        if (typeof(left) == TYPE_INT or typeof(left) == TYPE_FLOAT) and (typeof(right) == TYPE_INT or typeof(right) == TYPE_FLOAT):
            return float(left) == float(right)
        return false
    match typeof(left):
        TYPE_DICTIONARY:
            if left.size() != right.size():
                return false
            for key in left.keys():
                if not right.has(key):
                    return false
                if not _values_equal(left[key], right[key]):
                    return false
            return true
        TYPE_ARRAY:
            return _arrays_equal(left, right)
        TYPE_FLOAT:
            return is_equal_approx(left, right)
        TYPE_VECTOR2:
            return left.is_equal_approx(right)
        TYPE_VECTOR3:
            return left.is_equal_approx(right)
        TYPE_QUATERNION:
            return left.is_equal_approx(right)
        TYPE_COLOR:
            return left.is_equal_approx(right)
        _:
            return left == right


static func _make_conflict(path: String, base_value, local_value, remote_value) -> Dictionary:
    return {
        "path": path,
        "base_value": base_value,
        "local_value": local_value,
        "remote_value": remote_value,
        "resolution": RESOLUTION_PENDING
    }


static func _join_path(prefix: String, segment: String) -> String:
    if prefix.is_empty():
        return segment
    if segment.begins_with("["):
        return "%s%s" % [prefix, segment]
    return "%s.%s" % [prefix, segment]


static func _set_at_path(root: Dictionary, path: String, value) -> void:
    if path.is_empty():
        return
    var parts := _split_path(path)
    var cursor = root
    for index in range(parts.size() - 1):
        var part = parts[index]
        if typeof(part) == TYPE_INT:
            if typeof(cursor) != TYPE_ARRAY or part >= cursor.size():
                return
            cursor = cursor[part]
        elif typeof(part) == TYPE_STRING and part.begins_with("id="):
            var lookup_id := part.substr(3)
            if typeof(cursor) != TYPE_ARRAY:
                return
            var found := false
            for entry in cursor:
                if typeof(entry) == TYPE_DICTIONARY and str(entry.get("id", "")) == lookup_id:
                    cursor = entry
                    found = true
                    break
            if not found:
                return
        else:
            if typeof(cursor) != TYPE_DICTIONARY or not cursor.has(part):
                return
            cursor = cursor[part]

    var last = parts[parts.size() - 1]
    if typeof(last) == TYPE_INT:
        if typeof(cursor) != TYPE_ARRAY or last >= cursor.size():
            return
        cursor[last] = value
    elif typeof(last) == TYPE_STRING and last.begins_with("id="):
        var lookup_id := last.substr(3)
        if typeof(cursor) != TYPE_ARRAY:
            return
        for entry in cursor:
            if typeof(entry) == TYPE_DICTIONARY and str(entry.get("id", "")) == lookup_id:
                # Replace fields in place.
                if typeof(value) == TYPE_DICTIONARY:
                    for key in value.keys():
                        entry[key] = value[key]
                return
    else:
        if typeof(cursor) == TYPE_DICTIONARY:
            cursor[last] = value


# Splits "screens[id=screen-1].components[0].label" into
# ["screens", "id=screen-1", "components", 0, "label"].
static func _split_path(path: String) -> Array:
    var parts: Array = []
    var buffer := ""
    var index := 0
    while index < path.length():
        var character := path.substr(index, 1)
        if character == ".":
            if not buffer.is_empty():
                parts.append(buffer)
                buffer = ""
            index += 1
        elif character == "[":
            if not buffer.is_empty():
                parts.append(buffer)
                buffer = ""
            var end_pos := path.find("]", index)
            if end_pos == -1:
                index += 1
                continue
            var inner := path.substr(index + 1, end_pos - index - 1)
            if inner.is_valid_int():
                parts.append(int(inner))
            else:
                parts.append(inner)
            index = end_pos + 1
        else:
            buffer += character
            index += 1
    if not buffer.is_empty():
        parts.append(buffer)
    return parts
