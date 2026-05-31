// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System;
using System.Collections.Generic;
using UnityEngine;

namespace Greybox.Runtime
{
    public sealed class GreyboxGameViewport : MonoBehaviour
    {
        public string ViewportId = "";
        public string DisplayName = "";
        public string Theme = "";
        public string TargetEngine = "";
        public string CameraMode = "";
        public int ActorCount;
        public int SpawnPointCount;
        public int ObjectiveCount;
        public int HazardCount;

        public GreyboxActorDefinition[] Actors()
        {
            return GetComponentsInChildren<GreyboxActorDefinition>(true);
        }

        public GreyboxSpawnPoint[] SpawnPoints()
        {
            return GetComponentsInChildren<GreyboxSpawnPoint>(true);
        }

        public GreyboxObjective[] Objectives()
        {
            return GetComponentsInChildren<GreyboxObjective>(true);
        }

        public GreyboxHazard[] Hazards()
        {
            return GetComponentsInChildren<GreyboxHazard>(true);
        }

        public bool TryGetActor(string actorId, out GreyboxActorDefinition actor)
        {
            string wanted = CleanId(actorId);
            foreach (GreyboxActorDefinition candidate in Actors())
            {
                if (!candidate || !SameId(candidate.ActorId, wanted)) continue;
                actor = candidate;
                return true;
            }

            actor = null;
            return false;
        }

        public bool TryGetSpawnPoint(string spawnId, out GreyboxSpawnPoint spawnPoint)
        {
            string wanted = CleanId(spawnId);
            foreach (GreyboxSpawnPoint candidate in SpawnPoints())
            {
                if (!candidate || !SameId(candidate.SpawnId, wanted)) continue;
                spawnPoint = candidate;
                return true;
            }

            spawnPoint = null;
            return false;
        }

        public bool TryGetObjective(string objectiveId, out GreyboxObjective objective)
        {
            string wanted = CleanId(objectiveId);
            foreach (GreyboxObjective candidate in Objectives())
            {
                if (!candidate || !SameId(candidate.ObjectiveId, wanted)) continue;
                objective = candidate;
                return true;
            }

            objective = null;
            return false;
        }

        public bool TryGetHazard(string hazardId, out GreyboxHazard hazard)
        {
            string wanted = CleanId(hazardId);
            foreach (GreyboxHazard candidate in Hazards())
            {
                if (!candidate || !SameId(candidate.HazardId, wanted)) continue;
                hazard = candidate;
                return true;
            }

            hazard = null;
            return false;
        }

        public GreyboxActorDefinition[] PlayerActors()
        {
            var actors = new List<GreyboxActorDefinition>();
            foreach (GreyboxActorDefinition actor in Actors())
            {
                if (!actor || (!actor.IsPlayerControlled && !ContainsToken(actor.Role, "controller") && !ContainsToken(actor.Role, "player"))) continue;
                actors.Add(actor);
            }

            return actors.ToArray();
        }

        public GreyboxActorDefinition[] EnemyActors()
        {
            var actors = new List<GreyboxActorDefinition>();
            foreach (GreyboxActorDefinition actor in Actors())
            {
                if (!actor || (!actor.IsEnemy && !ContainsToken(actor.Role, "enemy"))) continue;
                actors.Add(actor);
            }

            return actors.ToArray();
        }

        public GreyboxSpawnPoint[] CheckpointSpawnPoints()
        {
            var spawns = new List<GreyboxSpawnPoint>();
            foreach (GreyboxSpawnPoint spawn in SpawnPoints())
            {
                if (!spawn || (!spawn.IsCheckpoint && !ContainsToken(spawn.SpawnId, "checkpoint") && !ContainsToken(spawn.DisplayName, "checkpoint"))) continue;
                spawns.Add(spawn);
            }

            return spawns.ToArray();
        }

        public bool TryGetExitObjective(out GreyboxObjective objective)
        {
            foreach (GreyboxObjective candidate in Objectives())
            {
                if (!candidate) continue;
                if (candidate.IsPrimary || ContainsToken(candidate.ObjectiveType, "exit") || ContainsToken(candidate.ObjectiveId, "exit") || ContainsToken(candidate.DisplayName, "exit"))
                {
                    objective = candidate;
                    return true;
                }
            }

            objective = null;
            return false;
        }

        public bool TryGetWorldPosition(Component component, out Vector3 position)
        {
            if (component)
            {
                position = component.transform.position;
                return true;
            }

            position = Vector3.zero;
            return false;
        }

        private static string CleanId(string value)
        {
            return (value ?? "").Trim();
        }

        private static bool SameId(string left, string right)
        {
            string cleanRight = CleanId(right);
            return !string.IsNullOrWhiteSpace(cleanRight)
                && string.Equals(CleanId(left), cleanRight, StringComparison.OrdinalIgnoreCase);
        }

        private static bool ContainsToken(string value, string token)
        {
            return (value ?? "").IndexOf(token, StringComparison.OrdinalIgnoreCase) >= 0;
        }
    }
}
