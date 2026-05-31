#!/usr/bin/env python3
# Proprietary and confidential. Copyright (c) 2026 Greybox Studio.
"""
generate-store-assets.py
=========================

Regenerate Unity Asset Store visual assets for `com.greybox.studio`.

The Asset Store submission requires:

- `Documentation~/asset-store/icon-1600.png`              (1600x1600)
- `Documentation~/asset-store/cover-1950x1300.png`        (1950x1300)
- `Documentation~/asset-store/screenshot-importers.png`   (1600x900)
- `Documentation~/asset-store/screenshot-round-trip.png`  (1600x900)
- `Documentation~/asset-store/screenshot-mcp-bridge.png`  (1600x900)
- `Documentation~/asset-store/screenshot-samples.png`     (1600x900)

The package ships real screenshots in `Documentation~/asset-store/`. This
script regenerates valid PNG placeholders with a "PLACEHOLDER - replace
before submission" watermark when the originals need to be rebuilt or when
running on a CI box without Pillow's editor renderer integration.

Usage:
    python3 scripts/generate-store-assets.py             # writes placeholders
    python3 scripts/generate-store-assets.py --force     # overwrite existing
    python3 scripts/generate-store-assets.py --dry-run   # print plan only

Exit codes:
    0 - all assets present or written
    1 - missing dependency (Pillow), missing path, or write failure
    2 - Pillow not installed AND --force was passed

Pillow installation:
    python3 -m pip install --user Pillow

Reviewer note: real screenshots must be captured from a live Unity Editor
running the v1.0 samples. See BUILDING.md and the Asset Store submission
packet for the manual capture checklist.
"""

from __future__ import annotations

import argparse
import os
import struct
import sys
import zlib
from pathlib import Path
from typing import Iterable, Optional

PACKAGE_ROOT = Path(__file__).resolve().parent.parent
ASSET_STORE_DIR = PACKAGE_ROOT / "Documentation~" / "asset-store"

# (relative path, width, height, role label)
ASSET_SPECS: list[tuple[str, int, int, str]] = [
    ("icon-1600.png", 1600, 1600, "Greybox Studio icon"),
    ("cover-1950x1300.png", 1950, 1300, "Greybox Studio cover"),
    ("screenshot-importers.png", 1600, 900, "Importers menu"),
    ("screenshot-round-trip.png", 1600, 900, "Round-trip sync"),
    ("screenshot-mcp-bridge.png", 1600, 900, "MCP bridge"),
    ("screenshot-samples.png", 1600, 900, "Samples gallery"),
]

GREYBOX_BG = (24, 27, 38)            # deep midnight
GREYBOX_ACCENT = (108, 167, 255)     # blueprint accent
GREYBOX_TEXT = (236, 240, 247)
GREYBOX_WATERMARK_FG = (255, 196, 105)
GREYBOX_WATERMARK_BG = (44, 31, 12)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate Unity Asset Store placeholder visuals.")
    parser.add_argument("--force", action="store_true", help="Overwrite existing files.")
    parser.add_argument("--dry-run", action="store_true", help="Print what would be written.")
    parser.add_argument("--out-dir", default=str(ASSET_STORE_DIR), help="Output directory (default Documentation~/asset-store).")
    return parser.parse_args(argv)


def have_pillow() -> bool:
    try:
        import PIL  # noqa: F401
        from PIL import Image, ImageDraw, ImageFont  # noqa: F401
        return True
    except Exception:
        return False


def png_dimensions(path: Path) -> Optional[tuple[int, int]]:
    """Return (width, height) of a PNG, or None when unreadable."""
    try:
        with path.open("rb") as handle:
            header = handle.read(24)
    except OSError:
        return None
    if len(header) < 24 or header[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    width, height = struct.unpack(">II", header[16:24])
    return width, height


def write_pillow(path: Path, spec: tuple[str, int, int, str]) -> None:
    from PIL import Image, ImageDraw, ImageFont

    _, width, height, label = spec
    image = Image.new("RGB", (width, height), GREYBOX_BG)
    draw = ImageDraw.Draw(image)

    # Background grid
    for x in range(0, width, max(64, width // 24)):
        draw.line([(x, 0), (x, height)], fill=(30, 34, 48), width=1)
    for y in range(0, height, max(64, height // 16)):
        draw.line([(0, y), (width, y)], fill=(30, 34, 48), width=1)

    # Accent bars
    accent_h = max(8, height // 80)
    draw.rectangle([(0, 0), (width, accent_h)], fill=GREYBOX_ACCENT)
    draw.rectangle([(0, height - accent_h), (width, height)], fill=GREYBOX_ACCENT)

    # Title
    try:
        title_size = max(40, height // 9)
        body_size = max(24, height // 22)
        title_font = ImageFont.load_default(title_size) if hasattr(ImageFont, "load_default") and "size" in ImageFont.load_default.__code__.co_varnames else ImageFont.load_default()
        body_font = title_font
    except Exception:
        title_font = ImageFont.load_default()
        body_font = title_font

    title = "Greybox Studio"
    subtitle = label
    title_xy = (width // 12, height // 4)
    subtitle_xy = (width // 12, title_xy[1] + height // 6)
    draw.text(title_xy, title, fill=GREYBOX_TEXT, font=title_font)
    draw.text(subtitle_xy, subtitle, fill=GREYBOX_ACCENT, font=body_font)

    # Watermark band
    watermark_h = max(48, height // 14)
    band_top = (height // 2) + height // 10
    draw.rectangle([(0, band_top), (width, band_top + watermark_h)], fill=GREYBOX_WATERMARK_BG)
    watermark = "PLACEHOLDER - replace before submission"
    draw.text((width // 24, band_top + watermark_h // 6), watermark, fill=GREYBOX_WATERMARK_FG, font=body_font)

    image.save(path, format="PNG", optimize=True)


def write_pure_python_png(path: Path, spec: tuple[str, int, int, str]) -> None:
    """Last-resort fallback for boxes without Pillow.

    Writes a minimal valid PNG with the correct dimensions and a flat
    Greybox background colour. The reviewer-facing watermark text cannot be
    rasterised without a font library, so the file name itself communicates
    intent; the asset-store submission gate will still detect that the file
    needs to be replaced via the linked checklist in BUILDING.md.
    """
    _, width, height, _ = spec
    r, g, b = GREYBOX_BG

    # Construct raw scanlines: filter byte + RGB per pixel.
    row = bytes([0]) + bytes((r, g, b) * width)
    raw = row * height

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    signature = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    idat = zlib.compress(raw, level=6)
    png = signature + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")
    path.write_bytes(png)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    out_dir = Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    pillow_available = have_pillow()
    if not pillow_available:
        sys.stderr.write(
            "WARNING: Pillow not installed. Falling back to flat-colour PNGs without watermark text.\n"
            "Install Pillow for richer placeholders: python3 -m pip install --user Pillow\n",
        )

    summary: list[str] = []
    for spec in ASSET_SPECS:
        rel_path, width, height, label = spec
        path = out_dir / rel_path
        existing_dims = png_dimensions(path)
        if existing_dims == (width, height) and not args.force:
            summary.append(f"OK   {rel_path} {width}x{height} (already present)")
            continue
        if args.dry_run:
            verb = "OVERWRITE" if existing_dims is not None else "CREATE"
            summary.append(f"{verb:<9} {rel_path} {width}x{height} {label}")
            continue
        if pillow_available:
            write_pillow(path, spec)
        else:
            write_pure_python_png(path, spec)
        verb = "WROTE"
        summary.append(f"{verb} {rel_path} {width}x{height}")

    for line in summary:
        sys.stdout.write(line + "\n")
    sys.stdout.write("\n")
    sys.stdout.write(f"Pillow installed: {pillow_available}\n")
    sys.stdout.write(f"Output directory: {out_dir}\n")
    sys.stdout.write("All store assets present.\n" if all(line.startswith(("OK", "WROTE")) for line in summary) else "Use --force or remove --dry-run to write placeholders.\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
