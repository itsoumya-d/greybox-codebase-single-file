{
  description = "AI Game Design Studio — local-first game design operating system. Daemon (`agds` CLI) + static studio web shell.";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    dream2nix = {
      url = "github:nix-community/dream2nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = {
    self,
    nixpkgs,
    flake-utils,
    dream2nix,
    home-manager,
  }: let
    perSystem = flake-utils.lib.eachDefaultSystem (system: let
      pkgs = import nixpkgs {inherit system;};
      nodejs = pkgs.nodejs_24;

      # nixpkgs ships pnpm 10.33.0; the repo's package.json declares
      # `engines.pnpm: ">=10.33.2 <11"` and pnpm refuses to install
      # against an older binary. Override the upstream tarball to
      # the exact version pinned by `packageManager`. Bump the url
      # + hash in lockstep with package.json#packageManager.
      #
      # When bumping versions, run the following to get a new hash:
      #
      # ```bash
      # nix store prefetch-file --hash-type sha256 \
      #   https://registry.npmjs.org/pnpm/-/pnpm-${NEW_VERSION}.tgz
      # ```
      pnpm_10 = pkgs.pnpm_10.overrideAttrs (_old: rec {
        version = "10.33.2";
        src = pkgs.fetchurl {
          url = "https://registry.npmjs.org/pnpm/-/pnpm-${version}.tgz";
          hash = "sha256-envPE9f2zrOUbAOXg3PZm+n94cr8MAC9/tTE95EWdhA=";
        };
      });

      daemon = pkgs.callPackage ./nix/package-daemon.nix {
        inherit dream2nix nixpkgs system nodejs pnpm_10;
        src = self;
      };
      web = pkgs.callPackage ./nix/package-web.nix {
        inherit dream2nix nixpkgs system nodejs pnpm_10;
        src = self;
      };
    in {
      packages = {
        inherit daemon web;
        default = daemon;
      };

      # Wrap `agds` with `--no-open` for `nix run`: the daemon package
      # builds the daemon workspace only, not `apps/web/out/`, so the
      # browser would otherwise auto-open onto an empty static dir.
      #
      # Set AGDS_DATA_DIR to a writable location when unset. The Nix store
      # is read-only at runtime, so the daemon cannot write to its default
      # project-local `.agds` location under `nix run`.
      apps.default = {
        type = "app";
        program = "${pkgs.writeShellScript "agds-nix-run" ''
          export AGDS_DATA_DIR="''${AGDS_DATA_DIR:-$HOME/.agds}"
          exec ${daemon}/bin/agds --no-open "$@"
        ''}";
        meta.description = "AI Game Design Studio local daemon (`agds`)";
      };

      devShells.default = pkgs.mkShell {
        packages = [
          nodejs
          pnpm_10
        ];
        shellHook = ''
          echo "AI Game Design Studio dev shell loaded."
          echo ""
          echo "Language runtimes:"
          echo "  - Node.js: $(node --version 2>/dev/null || echo 'not found')"
          echo "  - pnpm:    $(pnpm --version 2>/dev/null || echo 'not found')"
          echo ""
          echo "Quick start:"
          echo "  - pnpm install"
          echo "  - pnpm tools-dev    # local studio lifecycle entry point"
          echo ""
        '';
      };

      checks = {
        daemon = daemon;
        web = web;
      };

      formatter = pkgs.nixpkgs-fmt;
    });

    moduleCommon = import ./nix/module-common.nix;
  in
    perSystem
    // {
      homeManagerModules = rec {
        agds = import ./nix/home-manager.nix {
          inherit moduleCommon;
          flake = self;
        };
        default = agds;
      };

      nixosModules = rec {
        agds = import ./nix/nixos.nix {
          inherit moduleCommon;
          flake = self;
        };
        default = agds;
      };
    };
}
