import sys; sys.path.insert(0, "/app")
import asyncio
from app.core.icy_meta import fetch_metadata_with_fallback

async def t():
    for name, url in [
        ("Radio1", "https://icast.connectmedia.hu/5201/live.mp3"),
        ("Petofi", "http://mr-stream.mediaconnect.hu/4737/mr2.aac"),
        ("Poptarisznya", "http://adas.poptarisznya.hu:8200/live.mp3"),
        ("SlagerFM", "http://92.61.114.159:7812/slagerfm256.mp3"),
        ("Retro", "https://icast.connectmedia.hu/5002/live.mp3"),
        ("Oxygen", "https://oxygenmusic.hu:8443/oxygenmusic_192"),
        ("Tilos", "http://stream.tilos.hu/tilos_32.mp3"),
    ]:
        r = await fetch_metadata_with_fallback(url)
        print(f"{name}: {r['title'] or '(üres)'}")

asyncio.run(t())
