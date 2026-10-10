"""Generate local PNG icons and a portable, dependency-free extension archive."""
import json
from pathlib import Path
import struct
import zlib
import zipfile

root = Path(__file__).resolve().parents[1]
extension = root / "vk-classic"
(extension / "icons").mkdir(exist_ok=True)

# Tiny bitmap glyph: native vector/code asset, with no external fonts or images.
glyph = ["11110", "10001", "10001", "11110", "10001", "10001", "11110"]
def chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)

for size in [16, 32, 48, 128]:
    scale = max(1, size // 11)
    x0, y0 = (size - 5 * scale) // 2, (size - 7 * scale) // 2
    rows = bytearray()
    for y in range(size):
        rows.append(0)
        for x in range(size):
            gx, gy = (x - x0) // scale, (y - y0) // scale
            ink = 0 <= gx < 5 and 0 <= gy < 7 and glyph[gy][gx] == "1"
            rows.extend((255, 255, 255, 255) if ink else (78, 114, 154, 255))
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(bytes(rows))) + chunk(b"IEND", b"")
    (extension / "icons" / f"{size}.png").write_bytes(png)

manifest = json.loads((extension / "manifest.json").read_text())
files = ["manifest.json", "settings.js", "content.js", "classic.css", "popup.html", "popup.css", "popup.js", "README.md", "assets/classic-logo.gif"] + [f"icons/{size}.png" for size in [16, 32, 48, 128]]
destination = root / "VK-Classic-2011-2015.zip"
with zipfile.ZipFile(destination, "w", zipfile.ZIP_DEFLATED) as archive:
    for name in files:
        archive.write(extension / name, f"vk-classic/{name}")
print(f"Готово: {destination} ({destination.stat().st_size} байт)")
