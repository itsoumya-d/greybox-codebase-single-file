// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using UnityEngine;

namespace Greybox.Runtime
{
    public sealed class GreyboxActorDefinition : MonoBehaviour
    {
        public string ActorId = "";
        public string DisplayName = "";
        public string Role = "";
        public string Faction = "";
        public string Behavior = "";
        public string[] AbilityIds = new string[0];
        public string[] PatrolPointIds = new string[0];
        public string LootTableId = "";
        public int Health = 1;
        public float MoveSpeed = 1f;
        public float JumpImpulse = 0f;
        public int Damage = 1;
        public float AttackRange = 1f;
        public float PatrolRadius = 0f;
        public float AttackCooldownSeconds = 1f;
        public float AggroRadius = 5f;
        public bool IsPlayerControlled;
        public bool IsEnemy;
    }
}
