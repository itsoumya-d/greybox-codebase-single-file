// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System;
using System.Collections.Generic;
using UnityEngine;

namespace Greybox.Runtime
{
    public sealed class GreyboxLevelBoard : MonoBehaviour
    {
        public string BoardId = "";
        public string DisplayName = "";
        public string Theme = "";
        public int RoomCount;
        public int EncounterCount;
        public int ConnectionCount;
        public int TileCount;

        public GreyboxLevelRoom[] Rooms()
        {
            return GetComponentsInChildren<GreyboxLevelRoom>(true);
        }

        public GreyboxEncounter[] Encounters()
        {
            return GetComponentsInChildren<GreyboxEncounter>(true);
        }

        public GreyboxLevelConnection[] Connections()
        {
            return GetComponentsInChildren<GreyboxLevelConnection>(true);
        }

        public bool TryGetRoom(string roomId, out GreyboxLevelRoom room)
        {
            string wanted = CleanId(roomId);
            if (string.IsNullOrWhiteSpace(wanted))
            {
                room = null;
                return false;
            }

            foreach (GreyboxLevelRoom candidate in Rooms())
            {
                if (!candidate || !SameId(candidate.RoomId, wanted)) continue;
                room = candidate;
                return true;
            }

            room = null;
            return false;
        }

        public bool TryGetEncounter(string encounterId, out GreyboxEncounter encounter)
        {
            string wanted = CleanId(encounterId);
            if (string.IsNullOrWhiteSpace(wanted))
            {
                encounter = null;
                return false;
            }

            foreach (GreyboxEncounter candidate in Encounters())
            {
                if (!candidate || !SameId(candidate.EncounterId, wanted)) continue;
                encounter = candidate;
                return true;
            }

            encounter = null;
            return false;
        }

        public bool TryGetConnection(string connectionId, out GreyboxLevelConnection connection)
        {
            string wanted = CleanId(connectionId);
            if (string.IsNullOrWhiteSpace(wanted))
            {
                connection = null;
                return false;
            }

            foreach (GreyboxLevelConnection candidate in Connections())
            {
                if (!candidate || !SameId(candidate.ConnectionId, wanted)) continue;
                connection = candidate;
                return true;
            }

            connection = null;
            return false;
        }

        public string[] ConnectedRoomIds(string roomId, bool includeLocked = true)
        {
            string wanted = CleanId(roomId);
            if (string.IsNullOrWhiteSpace(wanted)) return Array.Empty<string>();

            var ids = new List<string>();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (GreyboxLevelConnection connection in Connections())
            {
                if (!connection || (!includeLocked && connection.Locked)) continue;
                string from = CleanId(connection.FromRoomId);
                string to = CleanId(connection.ToRoomId);
                if (SameId(from, wanted)) AddUnique(ids, seen, to);
                else if (SameId(to, wanted)) AddUnique(ids, seen, from);
            }

            return ids.ToArray();
        }

        public bool AreRoomsConnected(string firstRoomId, string secondRoomId, bool includeLocked = true)
        {
            string wanted = CleanId(secondRoomId);
            if (string.IsNullOrWhiteSpace(wanted)) return false;
            foreach (string connectedRoomId in ConnectedRoomIds(firstRoomId, includeLocked))
            {
                if (SameId(connectedRoomId, wanted)) return true;
            }

            return false;
        }

        public string[] ShortestRoomPath(string startRoomId, string goalRoomId, bool includeLocked = true)
        {
            string start = CleanId(startRoomId);
            string goal = CleanId(goalRoomId);
            if (string.IsNullOrWhiteSpace(start) || string.IsNullOrWhiteSpace(goal)) return Array.Empty<string>();
            if (!TryGetRoom(start, out _) || !TryGetRoom(goal, out _)) return Array.Empty<string>();
            if (SameId(start, goal)) return new[] { start };

            var queue = new Queue<string>();
            var visited = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var previous = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            queue.Enqueue(start);
            visited.Add(start);

            while (queue.Count > 0)
            {
                string current = queue.Dequeue();
                foreach (string next in ConnectedRoomIds(current, includeLocked))
                {
                    if (string.IsNullOrWhiteSpace(next) || !visited.Add(next)) continue;
                    previous[next] = current;
                    if (SameId(next, goal)) return BuildPath(start, next, previous);
                    queue.Enqueue(next);
                }
            }

            return Array.Empty<string>();
        }

        public bool TryGetRoomWorldPosition(string roomId, out Vector3 position)
        {
            if (TryGetRoom(roomId, out GreyboxLevelRoom room))
            {
                position = room.transform.position;
                return true;
            }

            position = Vector3.zero;
            return false;
        }

        private static string[] BuildPath(string start, string goal, Dictionary<string, string> previous)
        {
            var reversed = new List<string> { goal };
            string current = goal;
            while (!SameId(current, start) && previous.TryGetValue(current, out string parent))
            {
                reversed.Add(parent);
                current = parent;
            }
            reversed.Reverse();
            return reversed.ToArray();
        }

        private static void AddUnique(List<string> ids, HashSet<string> seen, string id)
        {
            string clean = CleanId(id);
            if (string.IsNullOrWhiteSpace(clean) || !seen.Add(clean)) return;
            ids.Add(clean);
        }

        private static string CleanId(string value)
        {
            return (value ?? "").Trim();
        }

        private static bool SameId(string left, string right)
        {
            return string.Equals(CleanId(left), CleanId(right), StringComparison.OrdinalIgnoreCase);
        }
    }
}
