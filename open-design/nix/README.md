# AI Game Design Studio — Nix Flake

This flake exposes AI Game Design Studio as reproducible Nix packages, a `nix run`
entry point, a dev shell, and Home Manager / NixOS modules. The runtime is split
into the **daemon** (`agds` CLI, Express API on `/api/*`) and the **studio web
shell** (Next.js static export at `apps/web/out/`), so you can run either or both.

## Outputs

| Output | What it is |
| --- | --- |
| `packages.<system>.daemon` | The `@ai-game-design-studio/daemon` package, producing the canonical `bin/agds` executable. |
| `packages.<system>.web` | The static studio web shell ready for any static file server. |
| `apps.<system>.default` | `nix run github:ai-game-design-studio/ai-game-design-studio`, which boots the daemon with `agds --no-open`. |
| `devShells.<system>.default` | Node 24 + Corepack-pinned pnpm 10.33 for local development. |
| `homeManagerModules.{default,agds}` | Home Manager module for individual creator workstations. |
| `nixosModules.{default,agds}` | NixOS module for shared or server-style studio installs. |

The flake exposes AGDS-native module names only: use
`homeManagerModules.{default,agds}` or `nixosModules.{default,agds}`.

## Try It

```bash
nix run github:ai-game-design-studio/ai-game-design-studio        # boots the AGDS daemon on :7457
nix develop github:ai-game-design-studio/ai-game-design-studio    # enters the Node/pnpm dev shell
```

## Home Manager

For an individual workstation, import the module and configure `services.agds`:

```nix
{
  inputs.agds.url = "github:ai-game-design-studio/ai-game-design-studio";

  outputs = { self, home-manager, agds, ... }: {
    homeConfigurations.you = home-manager.lib.homeManagerConfiguration {
      modules = [
        agds.homeManagerModules.default
        {
          services.agds = {
            enable = true;
            autoStart = true;
            webFrontend.enable = true;
          };
        }
      ];
    };
  };
}
```

What this wires up:

- Linux: `systemd --user` units `agds.service` and, optionally,
  `agds-web.service`.
- macOS: launchd agents `ai.gamedesignstudio.agds` and, optionally, `ai.gamedesignstudio.agds-web`.
- Data defaults to `$HOME/.agds/`.

## NixOS

For a shared studio host:

```nix
{
  imports = [ inputs.agds.nixosModules.default ];

  services.agds = {
    enable = true;
    autoStart = true;
    openFirewall = true;
    webFrontend.enable = true;
    user = "agds";
    group = "agds";
  };
}
```

This creates a system user, writes a tmpfiles rule for `/var/lib/agds`, and runs
the daemon under hardened systemd (`ProtectSystem=strict`, `PrivateTmp`,
`ReadWritePaths` scoped to the data directory).

## Web Frontend

`webFrontend.enable = true` starts a small Caddy static server on
`webFrontend.port` (default `5174`) and reverse-proxies `/api/*`, `/artifacts/*`,
and `/frames/*` to the daemon. Leave it disabled when you already run nginx,
Caddy, Apache, or Traefik yourself; point that server at the `web` package output
and replicate the same proxy contract.

For LAN or public exposure, widen the frontend host and declare every external
origin browsers will load:

```nix
services.agds.webFrontend = {
  enable = true;
  host = "0.0.0.0";
  allowedOrigins = [
    "http://laptop.local:5174"
    "https://laptop.local:5174"
  ];
};

services.agds.openFirewall = true;
```

The module forwards those origins as `AGDS_ALLOWED_ORIGINS`.

## Proxy Contract

The web package is built with `AGDS_DAEMON_URL = ""`, so bundled JavaScript sends
relative requests. Serve the static export same-origin with a reverse proxy to
the daemon:

- Document root: `agds.packages.<system>.web` or the `packages.<system>.web`
  output.
- Proxy `/api/*`, `/artifacts/*`, and `/frames/*` to the daemon bind address.
- Keep `/api/*` streaming uncompressed so SSE chunks flush immediately.
- Fallback unmatched studio-web-shell routes to `index.html`.

When your browser-facing origin differs from the daemon origin, set
`services.agds.webFrontend.allowedOrigins` or export `AGDS_ALLOWED_ORIGINS`
directly for custom services. For loopback split-port setups, `AGDS_WEB_PORT`
is also supported.

## Secrets

Use `environmentFile` for BYOK API keys and provider tokens:

```nix
services.agds.environmentFile = "/run/secrets/agds.env";
```

Do not inline secrets with `pkgs.writeText`; the Nix store is world-readable.
Use a runtime secret manager such as sops-nix or agenix.

## First-Build Hash Pinning

`nix/package-daemon.nix` and `nix/package-web.nix` vendor the pnpm store through
fixed-output derivations. If `pnpm-lock.yaml` changes, run the build once, copy
the expected hash into the matching `pnpmDepsHash`, and rebuild.

## CI

`.github/workflows/nix-check.yml` runs `nix flake check`, then builds
`.#daemon` and `.#web` when the flake or lockfile changes. Artifacts are cached
on the `agds` Cachix instance.
