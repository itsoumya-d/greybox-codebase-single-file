// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System;
using System.Collections.Generic;
using UnityEngine;

namespace Greybox.Runtime
{
    public sealed class GreyboxGeneratedComponents : MonoBehaviour
    {
        public List<string> ComponentTypeNames = new List<string>();

        public void Record(Component component)
        {
            if (!component) return;
            Record(component.GetType().FullName ?? component.GetType().Name);
        }

        public void Record(string componentTypeName)
        {
            if (string.IsNullOrWhiteSpace(componentTypeName)) return;
            if (!ComponentTypeNames.Contains(componentTypeName)) ComponentTypeNames.Add(componentTypeName);
        }

        public bool Contains(Component component)
        {
            if (!component) return false;
            return Contains(component.GetType().FullName ?? component.GetType().Name);
        }

        public bool Contains(string componentTypeName)
        {
            return !string.IsNullOrWhiteSpace(componentTypeName)
                && ComponentTypeNames.Exists(item => string.Equals(item, componentTypeName, StringComparison.Ordinal));
        }
    }
}
