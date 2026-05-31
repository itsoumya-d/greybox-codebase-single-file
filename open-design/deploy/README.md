# Docker Deployment

This deployment ships AI Game Design Studio as a single Alpine-based runtime
image. The daemon serves both the API and the built Next.js static export, so
there is no separate nginx container.

## Local compose

```bash
cd deploy
AGDS_IMAGE=docker.io/vanjayak/ai-game-design-studio:latest docker compose pull
AGDS_IMAGE=docker.io/vanjayak/ai-game-design-studio:latest docker compose up -d --no-build
```

Defaults:

- Host port: `127.0.0.1:7456` (`AGDS_WEB_PORT=8080` to publish on `127.0.0.1:8080`)
- Runtime data volume: `agds_data` mounted at `/app/.agds`
- Node heap cap: `--max-old-space-size=192`
- Compose memory cap: `384m` (`AGDS_MEM_LIMIT=256m` to override)

The Compose file is AGDS-only: use `AGDS_IMAGE`, `AGDS_WEB_PORT`,
`AGDS_ALLOWED_ORIGINS`, and `AGDS_MEM_LIMIT` for runtime overrides.

Do not publish the daemon directly on a public or shared LAN interface. The API is
unauthenticated for non-browser clients, so remote deployments should keep Compose
bound to localhost and put an authenticated reverse proxy, SSH tunnel, or VPN in
front of it.

When exposing the service through an authenticated public IP, domain, or reverse
proxy, set `AGDS_ALLOWED_ORIGINS` to the browser origins that should be
allowed to call `/api`:

```bash
AGDS_ALLOWED_ORIGINS=https://studio.example.com,http://203.0.113.10:7456 docker compose up -d --no-build
```

Pin a specific published image with a digest instead of the mutable `latest` tag:

```bash
AGDS_IMAGE=docker.io/vanjayak/ai-game-design-studio@sha256:<digest> docker compose up -d --no-build
```

## Vercel web + local daemon tunnel

Topology B keeps the daemon, game projects, agent CLIs, and BYOK/provider keys on
the creator machine while serving the web shell from Vercel. Use it only behind
an authenticated tunnel such as Cloudflare Access, Tailscale Funnel with access
rules, an SSH tunnel, or a private VPN. Do not expose the daemon directly to the
public internet.

1. Run the daemon locally on the creator workstation.

```bash
pnpm tools-dev run web --daemon-port 7456 --web-port 5175
```

2. Publish only the daemon origin through an authenticated tunnel. Example with
   Cloudflare Tunnel:

```bash
cloudflared tunnel --url http://127.0.0.1:7456
```

3. Allow the Vercel origin to call the daemon through the tunnel, then restart
   the local daemon.

```bash
AGDS_ALLOWED_ORIGINS=https://studio.example.com pnpm tools-dev run web --daemon-port 7456 --web-port 5175
```

4. Configure the Vercel project as a server build, not the default static export:

```text
AGDS_WEB_OUTPUT_MODE=server
AGDS_DAEMON_ORIGIN=https://<your-authenticated-tunnel-host>
```

The web build strips any path from `AGDS_DAEMON_ORIGIN` and rewrites `/api/*`,
`/artifacts/*`, `/frames/*`, and `/assets/prompt-templates/*` to that origin.
`https://` tunnel origins are accepted; `http://` is accepted only for loopback
local previews. Keep the tunnel authentication policy outside this repository so
the open-source web bundle never carries shared secrets.

The image intentionally does not bundle Claude/Codex/Gemini CLI binaries. Keep
those outside the image, or build a separate private runtime layer if a server
deployment needs local code-agent CLIs installed in the container.

## Publish to Docker Hub

```bash
deploy/scripts/publish-images.sh --image_tag latest
```

Useful overrides:

```bash
IMAGE_NAMESPACE=your-dockerhub-user deploy/scripts/publish-images.sh --arch arm64
deploy/scripts/publish-images.sh --image docker.io/your-user/ai-game-design-studio:0.1.0
```

The script defaults to:

- `docker.io/vanjayak/ai-game-design-studio:<tag>`
- `linux/amd64,linux/arm64`
- `skopeo` push strategy with Docker credentials read from `~/.docker/config.json`
- preloading base images through `skopeo` to reduce Docker Hub pull flakiness

If `127.0.0.1:7890` is available and no proxy is already set, the script uses it
for registry access and passes `host.docker.internal:7890` into Docker builds. The
host-gateway alias is only added for builds that need this local proxy mapping.

### Colima swap helper for Apple Silicon

`deploy/scripts/prepare-colima-build-swap.sh` is for manual Docker image
publishing from an Apple Silicon macOS host that uses Colima as the Docker VM.
The helper is intentionally Apple Silicon-only because the failure mode it covers
is local arm64 Colima builds exhausting a small Linux VM while preparing
multi-arch images. It exits before touching Colima on non-macOS or
non-Apple-Silicon hosts.

Low-memory Colima VMs can run out of RAM during multi-arch image builds. The
helper checks the VM memory and swap status, then creates and enables a temporary
swap file only when the VM has no swap and less than 4 GiB of RAM. The 4 GiB
threshold is a conservative default for short-lived manual publishes on small
Colima profiles; raise `COLIMA_BUILD_SWAP_MEMORY_THRESHOLD_KIB` if larger builds
still OOM, or lower it if you only want swap for very small VMs.

Prefer increasing the Colima VM memory (`colima start --memory <GiB>` or the
profile config) when you want a persistent build machine. Use this helper when
you need a temporary, reversible boost for one manual publish without resizing
or recreating the VM.

Run it before a manual publish if Docker builds fail with out-of-memory errors,
or if `status` shows a small Colima VM with no swap. The swap remains active
until cleanup or VM restart, so use a shell trap for one-off sessions:

```bash
deploy/scripts/prepare-colima-build-swap.sh status
deploy/scripts/prepare-colima-build-swap.sh
trap 'deploy/scripts/prepare-colima-build-swap.sh cleanup' EXIT
deploy/scripts/publish-images.sh --image_tag latest
```

Useful overrides:

```bash
COLIMA_BUILD_SWAP_SIZE=6G deploy/scripts/prepare-colima-build-swap.sh
COLIMA_BUILD_SWAP_MEMORY_THRESHOLD_KIB=6291456 deploy/scripts/prepare-colima-build-swap.sh
COLIMA_BIN=/opt/homebrew/bin/colima deploy/scripts/prepare-colima-build-swap.sh status
COLIMA_BUILD_SWAP_CLEANUP_FORCE=1 COLIMA_BUILD_SWAPFILE=/custom-swapfile deploy/scripts/prepare-colima-build-swap.sh cleanup
```

`cleanup` removes the default helper path and the old helper path. If you set a
custom `COLIMA_BUILD_SWAPFILE`, cleanup refuses to remove it unless
`COLIMA_BUILD_SWAP_CLEANUP_FORCE=1` is also set.
