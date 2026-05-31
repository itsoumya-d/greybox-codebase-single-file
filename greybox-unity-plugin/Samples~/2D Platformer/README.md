# 2D Platformer Sample

AI-assisted sample set. Human designer credit: Kai Designer.

Import the four Greybox artifact files in this folder into a Unity 2D project:

- `platformer.gameview` builds a prefab hierarchy for actors, spawn points, objectives, and hazards.
- `platformer.design` imports the art-bible palette as a ScriptableObject.
- `platformer.gbhud` imports the HUD layout artifact.
- `platformer.levelboard` builds the level-board rooms, encounter markers, and tilemap beats.

The sample is tuned for the round-trip sync smoke path: move a spawn point or
hazard in Scene view, sync it back, and confirm the Greybox web artifact updates.

For a playable slice, import this sample and run
`Window/Greybox/Samples/Build 2D Platformer Scene`. Greybox creates
`Assets/GreyboxGenerated/Samples/2DPlatformer/Greybox2DPlatformerSample.unity`
with a controllable runner, platforms, trigger hazards, an exit gate, the
imported enemy patrols, a player-following camera, the imported HUD, and the
imported design artifacts in the scene for inspection.
The generated slice wires the imported HUD to gameplay state: hearts decrease
on hazard respawn, the checkpoint trigger updates the respawn point, the coin counter
advances across 24 collectible coins, and the objective flips when the exit gate
is reached.
The runner supports the Unity Input System when it is installed and falls back
to keyboard polling for lean 2022.3 projects.
Press `R` in Play Mode to restart the generated sample run: player state,
checkpoint progress, goals, enemies, and objective coins reset to the imported
starting state. The imported HUD also exposes a `RESET RUN` button wired to the
same restart path for controller-free Asset Store review.
