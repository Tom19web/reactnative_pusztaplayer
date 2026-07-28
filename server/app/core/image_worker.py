from PIL import Image
import asyncio
import aiofiles
import os

SIZES = {
    "thumb": (300, 450),
    "full": (800, 1200),
    "backdrop": (1920, 1080),
}


async def resize_to_webp(
    input_path: str,
    output_dir: str,
    base_name: str,
) -> dict[str, str]:
    """Convert image to WebP in 3 sizes. Returns URL paths."""
    results = {}
    loop = asyncio.get_event_loop()

    def _resize():
        img = Image.open(input_path).convert("RGB")
        for label, (w, h) in SIZES.items():
            resized = img.resize((w, h), Image.LANCZOS)
            filename = f"{base_name}_{label}.webp"
            out_path = os.path.join(output_dir, filename)
            resized.save(out_path, "WEBP", quality=80)
            results[label] = f"/media/{filename}"
        return results

    return await loop.run_in_executor(None, _resize)
