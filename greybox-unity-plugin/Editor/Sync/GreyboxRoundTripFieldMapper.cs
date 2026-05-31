// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System;
using System.Text.RegularExpressions;
using Greybox.Runtime;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.UI;

namespace Greybox.Editor.Sync
{
    public readonly struct GreyboxRoundTripFieldEdit
    {
        public GreyboxRoundTripFieldEdit(GreyboxMarker marker, string path, JToken value)
        {
            Marker = marker;
            Path = path ?? "";
            Value = value?.DeepClone();
        }

        public GreyboxMarker Marker { get; }
        public string Path { get; }
        public JToken Value { get; }
    }

    public static class GreyboxRoundTripFieldMapper
    {
        private const int MaxRoundTripStringArrayItems = 64;
        private const int MaxRoundTripStringArrayItemLength = 256;
        private static readonly Regex TileRecordPropertyPathPattern = new Regex(@"^TileRecords\.Array\.data\[(\d+)\]\.(TileType|ColorHex|Walkable|BlocksMovement|IsSpawn|IsExit|IsHazard|Position(?:\.[xyz])?)$", RegexOptions.Compiled);

        public static bool TryMap(UnityEngine.Object target, string propertyPath, out GreyboxRoundTripFieldEdit edit)
        {
            edit = default;
            string fieldName = FieldName(propertyPath);
            if (string.IsNullOrWhiteSpace(fieldName)) return false;
            if (TryMapGameObjectMetadata(target, fieldName, out edit)) return true;
            var component = target as Component;
            if (!component) return false;
            var marker = DirectMarkerFor(component.gameObject);
            if (!marker) return false;

            if (TryMapTileRecord(component as GreyboxLevelTilemap, marker, propertyPath, out edit)) return true;
            if (TryMapHudBinding(component, fieldName, out edit)) return true;
            if (TryMapTransform(component, marker, fieldName, out edit)) return true;
            if (!TryJsonPath(component, marker, fieldName, out string path)) return false;
            if (!TryValue(component, fieldName, out JToken value)) return false;
            edit = new GreyboxRoundTripFieldEdit(marker, path, value);
            return true;
        }

        public static bool TryMapAsset(Component component, string propertyPath, string assetPath, out GreyboxRoundTripFieldEdit edit)
        {
            edit = default;
            string fieldName = FieldName(propertyPath);
            if (!component || string.IsNullOrWhiteSpace(fieldName) || string.IsNullOrWhiteSpace(assetPath)) return false;
            var marker = AssetMarkerFor(component);
            if (!marker || string.IsNullOrWhiteSpace(marker.JsonPath)) return false;
            string key = AssetFieldKey(component, fieldName);
            if (string.IsNullOrWhiteSpace(key)) return false;
            edit = new GreyboxRoundTripFieldEdit(marker, $"{marker.JsonPath}.{key}", new JValue(assetPath));
            return true;
        }

        private static bool TryMapGameObjectMetadata(UnityEngine.Object target, string fieldName, out GreyboxRoundTripFieldEdit edit)
        {
            edit = default;
            var go = target as GameObject ?? (target as Component)?.gameObject;
            if (!go) return false;
            var marker = DirectMarkerFor(go);
            if (!marker || string.IsNullOrWhiteSpace(marker.JsonPath)) return false;
            switch (fieldName)
            {
                case "m_TagString":
                case nameof(GameObject.tag):
                    edit = new GreyboxRoundTripFieldEdit(marker, $"{marker.JsonPath}.unityTag", new JValue(go.tag));
                    return true;
                case "m_Layer":
                case nameof(GameObject.layer):
                    edit = new GreyboxRoundTripFieldEdit(marker, $"{marker.JsonPath}.unityLayer", new JValue(go.layer));
                    return true;
                case "m_IsActive":
                case nameof(GameObject.activeSelf):
                    edit = new GreyboxRoundTripFieldEdit(marker, $"{marker.JsonPath}.unityActive", new JValue(go.activeSelf));
                    return true;
                case "m_StaticEditorFlags":
                case nameof(GameObject.isStatic):
                    edit = new GreyboxRoundTripFieldEdit(marker, $"{marker.JsonPath}.unityStatic", new JValue(go.isStatic));
                    return true;
                default:
                    return false;
            }
        }

        private static GreyboxMarker DirectMarkerFor(GameObject go)
        {
            if (!go) return null;
            return go.GetComponent<GreyboxMarker>();
        }

        private static GreyboxMarker AssetMarkerFor(Component component)
        {
            if (!component) return null;
            var direct = DirectMarkerFor(component.gameObject);
            if (direct) return direct;
            if (!IsGreyboxGeneratedComponent(component)) return null;
            return component.GetComponentInParent<GreyboxMarker>(true);
        }

        private static bool IsGreyboxGeneratedComponent(Component component)
        {
            if (!component) return false;
            var manifest = component.GetComponent<GreyboxGeneratedComponents>();
            return manifest && manifest.Contains(component);
        }

        private static bool TryMapTransform(Component component, GreyboxMarker marker, string fieldName, out GreyboxRoundTripFieldEdit edit)
        {
            edit = default;
            var transform = component as Transform;
            if (!transform) return false;
            if (fieldName == nameof(Transform.localPosition) || fieldName == "m_LocalPosition")
            {
                if (string.IsNullOrWhiteSpace(marker.PositionJsonPath)) return false;
                edit = new GreyboxRoundTripFieldEdit(marker, marker.PositionJsonPath, DiffApplier.FromVector3(transform.localPosition));
                return true;
            }
            if (fieldName == nameof(Transform.localScale) || fieldName == "m_LocalScale")
            {
                if (string.IsNullOrWhiteSpace(marker.JsonPath)) return false;
                edit = new GreyboxRoundTripFieldEdit(marker, $"{marker.JsonPath}.{ScaleFieldKey(marker)}", DiffApplier.FromVector3(transform.localScale));
                return true;
            }
            if (fieldName == nameof(Transform.localEulerAngles) || fieldName == nameof(Transform.localRotation) || fieldName == "m_LocalRotation")
            {
                if (string.IsNullOrWhiteSpace(marker.JsonPath)) return false;
                edit = new GreyboxRoundTripFieldEdit(marker, $"{marker.JsonPath}.rotation", DiffApplier.FromVector3(transform.localEulerAngles));
                return true;
            }
            return false;
        }

        private static string ScaleFieldKey(GreyboxMarker marker)
        {
            return marker.Collection == "rooms" ? "size" : "scale";
        }

        private static bool TryJsonPath(Component component, GreyboxMarker marker, string fieldName, out string path)
        {
            path = "";
            string root = component is GreyboxCameraRig camera ? camera.JsonPath : marker.JsonPath;
            if (string.IsNullOrWhiteSpace(root)) return false;
            string key = JsonFieldKey(component, fieldName);
            if (string.IsNullOrWhiteSpace(key)) return false;
            path = $"{root}.{key}";
            return true;
        }

        private static string JsonFieldKey(Component component, string fieldName)
        {
            switch (component)
            {
                case GreyboxActorDefinition _:
                    return ActorFieldKey(fieldName);
                case GreyboxSpawnPoint _:
                    return SpawnFieldKey(fieldName);
                case GreyboxObjective _:
                    return ObjectiveFieldKey(fieldName);
                case GreyboxHazard _:
                    return HazardFieldKey(fieldName);
                case GreyboxCameraRig _:
                    return CameraFieldKey(fieldName);
                case GreyboxLevelRoom _:
                    return LevelRoomFieldKey(fieldName);
                case GreyboxEncounter _:
                    return EncounterFieldKey(fieldName);
                case GreyboxLevelConnection _:
                    return LevelConnectionFieldKey(fieldName);
                case GreyboxPlatformerSampleCheckpoint _:
                    return PlatformerCheckpointFieldKey(fieldName);
                case GreyboxPlatformerSampleGoal _:
                    return PlatformerGoalFieldKey(fieldName);
                case GreyboxPlatformerSampleCollectible _:
                    return PlatformerCollectibleFieldKey(fieldName);
                default:
                    return "";
            }
        }

        private static string ActorFieldKey(string fieldName)
        {
            switch (fieldName)
            {
                case nameof(GreyboxActorDefinition.DisplayName): return "name";
                case nameof(GreyboxActorDefinition.Role): return "role";
                case nameof(GreyboxActorDefinition.Faction): return "faction";
                case nameof(GreyboxActorDefinition.Behavior): return "behavior";
                case nameof(GreyboxActorDefinition.AbilityIds): return "abilities";
                case nameof(GreyboxActorDefinition.PatrolPointIds): return "patrolRoute";
                case nameof(GreyboxActorDefinition.LootTableId): return "lootTable";
                case nameof(GreyboxActorDefinition.Health): return "health";
                case nameof(GreyboxActorDefinition.MoveSpeed): return "moveSpeed";
                case nameof(GreyboxActorDefinition.JumpImpulse): return "jumpImpulse";
                case nameof(GreyboxActorDefinition.Damage): return "damage";
                case nameof(GreyboxActorDefinition.AttackRange): return "attackRange";
                case nameof(GreyboxActorDefinition.PatrolRadius): return "patrolRadius";
                case nameof(GreyboxActorDefinition.AttackCooldownSeconds): return "attackCooldownSeconds";
                case nameof(GreyboxActorDefinition.AggroRadius): return "aggroRadius";
                case nameof(GreyboxActorDefinition.IsPlayerControlled): return "isPlayerControlled";
                case nameof(GreyboxActorDefinition.IsEnemy): return "isEnemy";
                default: return "";
            }
        }

        private static string SpawnFieldKey(string fieldName)
        {
            switch (fieldName)
            {
                case nameof(GreyboxSpawnPoint.DisplayName): return "name";
                case nameof(GreyboxSpawnPoint.SpawnGroup): return "spawnGroup";
                case nameof(GreyboxSpawnPoint.ActorIds): return "actorIds";
                case nameof(GreyboxSpawnPoint.MaxCount): return "maxCount";
                case nameof(GreyboxSpawnPoint.CooldownSeconds): return "cooldownSeconds";
                case nameof(GreyboxSpawnPoint.SpawnOnStart): return "spawnOnStart";
                case nameof(GreyboxSpawnPoint.SpawnRadius): return "spawnRadius";
                case nameof(GreyboxSpawnPoint.IsCheckpoint): return "isCheckpoint";
                default: return "";
            }
        }

        private static string ObjectiveFieldKey(string fieldName)
        {
            switch (fieldName)
            {
                case nameof(GreyboxObjective.DisplayName): return "name";
                case nameof(GreyboxObjective.ObjectiveType): return "objectiveType";
                case nameof(GreyboxObjective.TargetIds): return "targetIds";
                case nameof(GreyboxObjective.Reward): return "reward";
                case nameof(GreyboxObjective.TimeLimitSeconds): return "timeLimitSeconds";
                case nameof(GreyboxObjective.RequiredCount): return "requiredCount";
                case nameof(GreyboxObjective.IsPrimary): return "isPrimary";
                default: return "";
            }
        }

        private static string HazardFieldKey(string fieldName)
        {
            switch (fieldName)
            {
                case nameof(GreyboxHazard.DisplayName): return "name";
                case nameof(GreyboxHazard.HazardType): return "hazardType";
                case nameof(GreyboxHazard.Effect): return "effect";
                case nameof(GreyboxHazard.Damage): return "damage";
                case nameof(GreyboxHazard.TickSeconds): return "tickSeconds";
                case nameof(GreyboxHazard.Radius): return "radius";
                case nameof(GreyboxHazard.Knockback): return "knockback";
                case nameof(GreyboxHazard.AffectedTags): return "affectedTags";
                case nameof(GreyboxHazard.IsLethal): return "lethal";
                default: return "";
            }
        }

        private static string CameraFieldKey(string fieldName)
        {
            switch (fieldName)
            {
                case nameof(GreyboxCameraRig.Mode): return "mode";
                case nameof(GreyboxCameraRig.Orthographic): return "orthographic";
                case nameof(GreyboxCameraRig.OrthographicSize): return "orthographicSize";
                case nameof(GreyboxCameraRig.AuthoredPosition): return "position";
                case nameof(GreyboxCameraRig.BackgroundColor): return "backgroundColor";
                default: return "";
            }
        }

        private static string LevelRoomFieldKey(string fieldName)
        {
            switch (fieldName)
            {
                case nameof(GreyboxLevelRoom.DisplayName): return "name";
                case nameof(GreyboxLevelRoom.RoomType): return "roomType";
                case nameof(GreyboxLevelRoom.Difficulty): return "difficulty";
                case nameof(GreyboxLevelRoom.Radius): return "radius";
                case nameof(GreyboxLevelRoom.Size): return "size";
                case nameof(GreyboxLevelRoom.IsStart): return "isStart";
                case nameof(GreyboxLevelRoom.IsBoss): return "isBoss";
                case nameof(GreyboxLevelRoom.ConnectedRoomIds): return "connectedRoomIds";
                default: return "";
            }
        }

        private static string EncounterFieldKey(string fieldName)
        {
            switch (fieldName)
            {
                case nameof(GreyboxEncounter.DisplayName): return "name";
                case nameof(GreyboxEncounter.EncounterType): return "encounterType";
                case nameof(GreyboxEncounter.TargetRoomId): return "roomId";
                case nameof(GreyboxEncounter.Difficulty): return "difficulty";
                case nameof(GreyboxEncounter.EnemyCount): return "enemyCount";
                case nameof(GreyboxEncounter.Reward): return "reward";
                case nameof(GreyboxEncounter.Radius): return "radius";
                default: return "";
            }
        }

        private static string LevelConnectionFieldKey(string fieldName)
        {
            switch (fieldName)
            {
                case nameof(GreyboxLevelConnection.FromRoomId): return "fromRoomId";
                case nameof(GreyboxLevelConnection.ToRoomId): return "toRoomId";
                case nameof(GreyboxLevelConnection.ConnectionType): return "type";
                case nameof(GreyboxLevelConnection.Locked): return "locked";
                case nameof(GreyboxLevelConnection.TravelCost): return "travelCost";
                default: return "";
            }
        }

        private static string PlatformerCheckpointFieldKey(string fieldName)
        {
            switch (fieldName)
            {
                case nameof(GreyboxPlatformerSampleCheckpoint.DisplayName): return "name";
                case nameof(GreyboxPlatformerSampleCheckpoint.SpawnId): return "spawnId";
                case nameof(GreyboxPlatformerSampleCheckpoint.SpawnGroup): return "spawnGroup";
                case nameof(GreyboxPlatformerSampleCheckpoint.ActorIds): return "actorIds";
                case nameof(GreyboxPlatformerSampleCheckpoint.MaxActivations): return "maxActivations";
                case nameof(GreyboxPlatformerSampleCheckpoint.CooldownSeconds): return "cooldownSeconds";
                case nameof(GreyboxPlatformerSampleCheckpoint.SpawnOnStart): return "spawnOnStart";
                case nameof(GreyboxPlatformerSampleCheckpoint.RespawnPoint): return "respawnPoint";
                default: return "";
            }
        }

        private static string PlatformerGoalFieldKey(string fieldName)
        {
            switch (fieldName)
            {
                case nameof(GreyboxPlatformerSampleGoal.DisplayName): return "name";
                case nameof(GreyboxPlatformerSampleGoal.ObjectiveType): return "objectiveType";
                case nameof(GreyboxPlatformerSampleGoal.TargetIds): return "targetIds";
                case nameof(GreyboxPlatformerSampleGoal.Reward): return "reward";
                case nameof(GreyboxPlatformerSampleGoal.TimeLimitSeconds): return "timeLimitSeconds";
                case nameof(GreyboxPlatformerSampleGoal.RequiredCount): return "requiredCount";
                case nameof(GreyboxPlatformerSampleGoal.RequiredCoins): return "requiredCoins";
                case nameof(GreyboxPlatformerSampleGoal.IsPrimary): return "isPrimary";
                default: return "";
            }
        }

        private static string PlatformerCollectibleFieldKey(string fieldName)
        {
            switch (fieldName)
            {
                case nameof(GreyboxPlatformerSampleCollectible.DisplayName): return "name";
                case nameof(GreyboxPlatformerSampleCollectible.SourceObjectiveId): return "sourceObjectiveId";
                case nameof(GreyboxPlatformerSampleCollectible.SourceObjectiveDisplayName): return "sourceObjectiveDisplayName";
                case nameof(GreyboxPlatformerSampleCollectible.SourceObjectiveType): return "sourceObjectiveType";
                default: return "";
            }
        }

        private static bool TryMapTileRecord(GreyboxLevelTilemap metadata, GreyboxMarker marker, string propertyPath, out GreyboxRoundTripFieldEdit edit)
        {
            edit = default;
            if (!metadata || !marker) return false;
            Match match = TileRecordPropertyPathPattern.Match(propertyPath ?? "");
            if (!match.Success) return false;
            if (!int.TryParse(match.Groups[1].Value, out int index)) return false;
            GreyboxLevelTileRecord[] records = metadata.TileRecords ?? Array.Empty<GreyboxLevelTileRecord>();
            if (index < 0 || index >= records.Length) return false;
            GreyboxLevelTileRecord record = records[index];
            if (record == null) return false;
            string key = TileRecordFieldKey(match.Groups[2].Value);
            if (string.IsNullOrWhiteSpace(key)) return false;
            string root = TileRecordRootPath(marker, record, index);
            if (string.IsNullOrWhiteSpace(root)) return false;
            JToken value = TileRecordValue(record, key);
            if (value == null) return false;
            edit = new GreyboxRoundTripFieldEdit(marker, $"{root}.{key}", value);
            return true;
        }

        private static string TileRecordFieldKey(string serializedFieldName)
        {
            switch (serializedFieldName ?? "")
            {
                case nameof(GreyboxLevelTileRecord.TileType): return "type";
                case nameof(GreyboxLevelTileRecord.ColorHex): return "colorHex";
                case nameof(GreyboxLevelTileRecord.Walkable): return "walkable";
                case nameof(GreyboxLevelTileRecord.BlocksMovement): return "blocksMovement";
                case nameof(GreyboxLevelTileRecord.IsSpawn): return "isSpawn";
                case nameof(GreyboxLevelTileRecord.IsExit): return "isExit";
                case nameof(GreyboxLevelTileRecord.IsHazard): return "isHazard";
                case nameof(GreyboxLevelTileRecord.Position):
                case "Position.x":
                case "Position.y":
                case "Position.z":
                    return "position";
                default:
                    return "";
            }
        }

        private static string TileRecordRootPath(GreyboxMarker marker, GreyboxLevelTileRecord record, int index)
        {
            if (!string.IsNullOrWhiteSpace(record.SourceJsonPath)) return record.SourceJsonPath;
            string collectionPath = marker.JsonPath ?? "";
            if (string.IsNullOrWhiteSpace(collectionPath)) return "";
            return IsSafeTileRecordSelector(record.TileId)
                ? $"{collectionPath}[tileId={record.TileId}]"
                : $"{collectionPath}[{index}]";
        }

        private static JToken TileRecordValue(GreyboxLevelTileRecord record, string key)
        {
            switch (key)
            {
                case "type": return new JValue(record.TileType ?? "");
                case "colorHex": return new JValue(record.ColorHex ?? "");
                case "walkable": return new JValue(record.Walkable);
                case "blocksMovement": return new JValue(record.BlocksMovement);
                case "isSpawn": return new JValue(record.IsSpawn);
                case "isExit": return new JValue(record.IsExit);
                case "isHazard": return new JValue(record.IsHazard);
                case "position":
                    return new JObject
                    {
                        ["x"] = record.Position.x,
                        ["y"] = record.Position.y,
                        ["z"] = record.Position.z
                    };
                default:
                    return null;
            }
        }

        private static bool IsSafeTileRecordSelector(string value)
        {
            if (string.IsNullOrWhiteSpace(value) || value.Length > 128) return false;
            foreach (char c in value)
            {
                bool ok = (c >= 'a' && c <= 'z')
                    || (c >= 'A' && c <= 'Z')
                    || (c >= '0' && c <= '9')
                    || c == '-'
                    || c == '_';
                if (!ok) return false;
            }
            return true;
        }

        private static bool TryMapHudBinding(Component component, string fieldName, out GreyboxRoundTripFieldEdit edit)
        {
            edit = default;
            if (!component) return false;
            var binding = component as GreyboxHudBinding ?? component.GetComponent<GreyboxHudBinding>();
            if (!binding) return false;
            string root = HudRoundTripRoot(binding);
            if (string.IsNullOrWhiteSpace(root)) return false;

            if (component is GreyboxHudBinding)
            {
                switch (fieldName)
                {
                    case nameof(GreyboxHudBinding.Text):
                        edit = HudRoundTripEdit(binding, root, "text", new JValue(binding.Text ?? ""));
                        return true;
                    case nameof(GreyboxHudBinding.ProgressValue):
                        edit = HudRoundTripEdit(binding, root, "value", new JValue(binding.ProgressValue));
                        return true;
                    case nameof(GreyboxHudBinding.ProgressMin):
                        edit = HudRoundTripEdit(binding, root, "min", new JValue(binding.ProgressMin));
                        return true;
                    case nameof(GreyboxHudBinding.ProgressMax):
                        edit = HudRoundTripEdit(binding, root, "max", new JValue(binding.ProgressMax));
                        return true;
                    default:
                        return false;
                }
            }

            if (component is Text text && (fieldName == nameof(Text.text) || fieldName == "m_Text"))
            {
                edit = HudRoundTripEdit(binding, root, "text", new JValue(text.text ?? ""));
                return true;
            }

            if (component is Slider slider)
            {
                switch (fieldName)
                {
                    case nameof(Slider.value):
                    case "m_Value":
                        edit = HudRoundTripEdit(binding, root, "value", new JValue(slider.value));
                        return true;
                    case nameof(Slider.minValue):
                    case "m_MinValue":
                        edit = HudRoundTripEdit(binding, root, "min", new JValue(slider.minValue));
                        return true;
                    case nameof(Slider.maxValue):
                    case "m_MaxValue":
                        edit = HudRoundTripEdit(binding, root, "max", new JValue(slider.maxValue));
                        return true;
                    default:
                        return false;
                }
            }

            return false;
        }

        private static GreyboxRoundTripFieldEdit HudRoundTripEdit(GreyboxHudBinding binding, string root, string key, JToken value)
        {
            return new GreyboxRoundTripFieldEdit(binding.GetComponent<GreyboxMarker>(), $"{root}.{key}", value);
        }

        private static string HudRoundTripRoot(GreyboxHudBinding binding)
        {
            if (!binding) return "";
            string authored = GreyboxConflictResolver.SafeConflictJsonPath(binding.RoundTripJsonPath);
            if (!string.IsNullOrWhiteSpace(authored)) return authored;
            string slotId = SafeHudSelectorValue(binding.SlotId);
            if (string.IsNullOrWhiteSpace(slotId)) return "";
            if (string.Equals(binding.Role, "slot", StringComparison.Ordinal))
            {
                return $"$.hud.slots[id={slotId}]";
            }
            string bindingId = SafeHudSelectorValue(binding.BindingId);
            return string.IsNullOrWhiteSpace(bindingId)
                ? ""
                : $"$.hud.slots[id={slotId}].bindings[id={bindingId}]";
        }

        private static string SafeHudSelectorValue(string value)
        {
            if (string.IsNullOrWhiteSpace(value) || value.Length > 128) return "";
            foreach (char c in value)
            {
                bool ok = (c >= 'a' && c <= 'z')
                    || (c >= 'A' && c <= 'Z')
                    || (c >= '0' && c <= '9')
                    || c == '-'
                    || c == '_';
                if (!ok) return "";
            }
            return value;
        }

        private static string AssetFieldKey(Component component, string fieldName)
        {
            if (component is MeshFilter && (fieldName == nameof(MeshFilter.sharedMesh) || fieldName == nameof(MeshFilter.mesh)))
            {
                return "meshAssetPath";
            }
            if (component is Renderer && (fieldName == nameof(Renderer.sharedMaterial) || fieldName == nameof(Renderer.material)))
            {
                return "materialAssetPath";
            }
            return "";
        }

        private static bool TryValue(Component component, string fieldName, out JToken value)
        {
            value = null;
            object raw = component.GetType().GetField(fieldName)?.GetValue(component);
            if (raw == null) return false;
            switch (raw)
            {
                case string text:
                    value = new JValue(text);
                    return true;
                case string[] texts:
                    value = FromStringArray(texts);
                    return true;
                case int intValue:
                    value = new JValue(intValue);
                    return true;
                case float floatValue:
                    value = new JValue(floatValue);
                    return true;
                case bool flag:
                    value = new JValue(flag);
                    return true;
                case Vector3 vector:
                    value = DiffApplier.FromVector3(vector);
                    return true;
                case Color color:
                    value = DiffApplier.FromColor(color);
                    return true;
                default:
                    return false;
            }
        }

        private static JArray FromStringArray(string[] values)
        {
            var array = new JArray();
            if (values == null) return array;
            foreach (string value in values)
            {
                string text = (value ?? "").Trim();
                if (string.IsNullOrWhiteSpace(text) || ContainsControlCharacter(text)) continue;
                if (text.Length > MaxRoundTripStringArrayItemLength)
                {
                    text = text.Substring(0, MaxRoundTripStringArrayItemLength);
                }
                array.Add(text);
                if (array.Count >= MaxRoundTripStringArrayItems) break;
            }

            return array;
        }

        private static bool ContainsControlCharacter(string value)
        {
            foreach (char c in value)
            {
                if (char.IsControl(c)) return true;
            }
            return false;
        }

        private static string FieldName(string propertyPath)
        {
            if (string.IsNullOrWhiteSpace(propertyPath)) return "";
            int dot = propertyPath.IndexOf('.');
            return dot < 0 ? propertyPath : propertyPath.Substring(0, dot);
        }
    }
}
