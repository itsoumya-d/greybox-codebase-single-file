# Proprietary and confidential. Copyright (c) 2026 Greybox Studio.
@tool
extends RefCounted

const GreyboxDiffApplier := preload("res://addons/greybox_studio/sync/diff_applier.gd")


static func run() -> Array:
    var results: Array = []
    results.append_array(_test_identity_merge())
    results.append_array(_test_remote_only_edit())
    results.append_array(_test_local_only_edit())
    results.append_array(_test_conflict_scalar())
    results.append_array(_test_conflict_records_path())
    results.append_array(_test_vector_merge())
    results.append_array(_test_color_merge())
    results.append_array(_test_quaternion_merge())
    results.append_array(_test_array_by_id_merge())
    results.append_array(_test_array_positional_merge())
    results.append_array(_test_nested_dictionary_merge())
    results.append_array(_test_remote_deletion())
    results.append_array(_test_local_deletion())
    results.append_array(_test_resolution_helpers())
    results.append_array(_test_supports_field_type())
    results.append_array(_test_legacy_merge_entrypoint())
    return results


static func _record(name: String, passed: bool, message: String = "") -> Dictionary:
    return {"name": name, "passed": passed, "message": message}


static func _expect_equal(name: String, expected, actual) -> Dictionary:
    var passed = expected == actual or _deep_equal(expected, actual)
    return _record(name, passed, "expected %s, got %s" % [str(expected), str(actual)])


static func _deep_equal(a, b) -> bool:
    if typeof(a) != typeof(b):
        return false
    if typeof(a) == TYPE_DICTIONARY:
        if a.size() != b.size():
            return false
        for key in a.keys():
            if not b.has(key):
                return false
            if not _deep_equal(a[key], b[key]):
                return false
        return true
    if typeof(a) == TYPE_ARRAY:
        if a.size() != b.size():
            return false
        for index in range(a.size()):
            if not _deep_equal(a[index], b[index]):
                return false
        return true
    return a == b


static func _test_identity_merge() -> Array:
    var base := {"a": 1, "b": "hello"}
    var local := {"a": 1, "b": "hello"}
    var remote := {"a": 1, "b": "hello"}
    var result := GreyboxDiffApplier.apply_three_way_merge(base, local, remote)
    return [
        _expect_equal("diff/identity merge equals base", base, result.get("merged")),
        _record("diff/identity merge has no conflicts", result.get("conflicts", []).is_empty(), "")
    ]


static func _test_remote_only_edit() -> Array:
    var base := {"x": 1}
    var local := {"x": 1}
    var remote := {"x": 9}
    var result := GreyboxDiffApplier.apply_three_way_merge(base, local, remote)
    return [
        _expect_equal("diff/remote-only edit applied", {"x": 9}, result.get("merged")),
        _record("diff/remote-only edit no conflicts", result.get("conflicts").is_empty(), "")
    ]


static func _test_local_only_edit() -> Array:
    var base := {"x": 1}
    var local := {"x": 7}
    var remote := {"x": 1}
    var result := GreyboxDiffApplier.apply_three_way_merge(base, local, remote)
    return [
        _expect_equal("diff/local-only edit applied", {"x": 7}, result.get("merged")),
        _record("diff/local-only edit no conflicts", result.get("conflicts").is_empty(), "")
    ]


static func _test_conflict_scalar() -> Array:
    var base := {"x": 1}
    var local := {"x": 7}
    var remote := {"x": 9}
    var result := GreyboxDiffApplier.apply_three_way_merge(base, local, remote)
    var conflicts := result.get("conflicts", [])
    return [
        _record("diff/scalar conflict detected", conflicts.size() == 1, "expected one conflict, got %d" % conflicts.size()),
        _record("diff/scalar conflict defaults to local", result.get("merged").get("x", 0) == 7, "")
    ]


static func _test_conflict_records_path() -> Array:
    var base := {"foo": {"bar": "a"}}
    var local := {"foo": {"bar": "b"}}
    var remote := {"foo": {"bar": "c"}}
    var result := GreyboxDiffApplier.apply_three_way_merge(base, local, remote)
    var conflicts := result.get("conflicts", [])
    var path := str(conflicts[0].get("path", "")) if not conflicts.is_empty() else ""
    return [
        _record("diff/nested conflict path", path == "foo.bar", "got path=%s" % path)
    ]


static func _test_vector_merge() -> Array:
    var base := {"v": Vector3(0, 0, 0)}
    var local := {"v": Vector3(1, 0, 0)}
    var remote := {"v": Vector3(0, 0, 0)}
    var result := GreyboxDiffApplier.apply_three_way_merge(base, local, remote)
    return [
        _expect_equal("diff/vector3 local-only edit", Vector3(1, 0, 0), result.get("merged").get("v"))
    ]


static func _test_color_merge() -> Array:
    var base := {"c": Color.WHITE}
    var local := {"c": Color.RED}
    var remote := {"c": Color.WHITE}
    var result := GreyboxDiffApplier.apply_three_way_merge(base, local, remote)
    return [
        _record("diff/color local-only edit", result.get("merged").get("c") == Color.RED, "")
    ]


static func _test_quaternion_merge() -> Array:
    var base := {"q": Quaternion(0, 0, 0, 1)}
    var local := {"q": Quaternion(0, 1, 0, 0)}
    var remote := {"q": Quaternion(0, 0, 0, 1)}
    var result := GreyboxDiffApplier.apply_three_way_merge(base, local, remote)
    return [
        _record("diff/quaternion local-only edit", result.get("merged").get("q").is_equal_approx(Quaternion(0, 1, 0, 0)), "")
    ]


static func _test_array_by_id_merge() -> Array:
    var base := {"items": [{"id": "a", "v": 1}, {"id": "b", "v": 2}]}
    var local := {"items": [{"id": "a", "v": 3}, {"id": "b", "v": 2}]}
    var remote := {"items": [{"id": "a", "v": 1}, {"id": "b", "v": 5}]}
    var result := GreyboxDiffApplier.apply_three_way_merge(base, local, remote)
    var merged_items: Array = result.get("merged").get("items")
    var values_by_id := {}
    for entry in merged_items:
        values_by_id[entry.get("id")] = entry.get("v")
    return [
        _record("diff/array by id - both edits preserved", values_by_id.get("a", 0) == 3 and values_by_id.get("b", 0) == 5, "got %s" % str(values_by_id))
    ]


static func _test_array_positional_merge() -> Array:
    var base := {"items": [1, 2, 3]}
    var local := {"items": [9, 2, 3]}
    var remote := {"items": [1, 2, 3]}
    var result := GreyboxDiffApplier.apply_three_way_merge(base, local, remote)
    return [
        _expect_equal("diff/array positional local-only edit", [9, 2, 3], result.get("merged").get("items"))
    ]


static func _test_nested_dictionary_merge() -> Array:
    var base := {"a": {"b": {"c": 0}}}
    var local := {"a": {"b": {"c": 1}}}
    var remote := {"a": {"b": {"c": 0}}}
    var result := GreyboxDiffApplier.apply_three_way_merge(base, local, remote)
    return [
        _expect_equal("diff/nested dictionary", {"a": {"b": {"c": 1}}}, result.get("merged"))
    ]


static func _test_remote_deletion() -> Array:
    var base := {"a": 1, "b": 2}
    var local := {"a": 1, "b": 2}
    var remote := {"a": 1}
    var result := GreyboxDiffApplier.apply_three_way_merge(base, local, remote)
    return [
        _expect_equal("diff/remote deletion honoured", {"a": 1}, result.get("merged"))
    ]


static func _test_local_deletion() -> Array:
    var base := {"a": 1, "b": 2}
    var local := {"a": 1}
    var remote := {"a": 1, "b": 2}
    var result := GreyboxDiffApplier.apply_three_way_merge(base, local, remote)
    return [
        _expect_equal("diff/local deletion honoured", {"a": 1}, result.get("merged"))
    ]


static func _test_resolution_helpers() -> Array:
    var base := {"x": 1}
    var local := {"x": 7}
    var remote := {"x": 9}
    var result := GreyboxDiffApplier.apply_three_way_merge(base, local, remote)
    var conflicts: Array = result.get("conflicts")
    var conflict: Dictionary = conflicts[0] if not conflicts.is_empty() else {}
    GreyboxDiffApplier.resolve_conflict(result.get("merged"), conflict, GreyboxDiffApplier.RESOLUTION_REMOTE)
    return [
        _record("diff/resolution applies remote", result.get("merged").get("x", 0) == 9, "got %s" % str(result.get("merged").get("x"))),
        _record("diff/resolution updates status", int(conflict.get("resolution", -1)) == GreyboxDiffApplier.RESOLUTION_REMOTE, "")
    ]


static func _test_supports_field_type() -> Array:
    return [
        _record("diff/supports int", GreyboxDiffApplier.supports_field_type("int"), ""),
        _record("diff/supports Quaternion", GreyboxDiffApplier.supports_field_type("Quaternion"), ""),
        _record("diff/rejects Mesh", not GreyboxDiffApplier.supports_field_type("Mesh"), "")
    ]


static func _test_legacy_merge_entrypoint() -> Array:
    var base_json := JSON.stringify({"a": 1})
    var web_json := JSON.stringify({"a": 9})
    var edit_json := JSON.stringify({"a": 1})
    var legacy := GreyboxDiffApplier.merge(base_json, web_json, edit_json, "sha")
    var merged := JSON.parse_string(legacy.get("merged_artifact_json", "{}"))
    return [
        _record("diff/legacy merge succeeded", legacy.get("succeeded", false), ""),
        _record("diff/legacy merge applied remote edit", merged.get("a", 0) == 9, "got %s" % str(merged))
    ]
