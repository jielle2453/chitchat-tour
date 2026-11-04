# Narration lines for the promo (Microsoft voices via edge-tts). Writes video/public/vo/<id>.mp3
import asyncio, json, os, sys
import edge_tts

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "vo")
os.makedirs(OUT, exist_ok=True)

MALE = "en-US-AndrewMultilingualNeural"
GUIDE = "en-US-AvaMultilingualNeural"

LINES = {
    "v01": (MALE, "A new city. So many little things you've never seen before."),
    "v02": (MALE, "And you don't even know what to ask."),
    "v03": (MALE, "Chitchat Tour tells you, before you ask."),
    "v04": (MALE, "Keep your phone in your pocket, and just walk. Here's a visitor from Tokyo, on Yongkang Street in Taipei."),
    "v05": (MALE, "Same corner, two visitors. Both hear about the metro rule, but each one is compared with home."),
    "v06": (MALE, "And what you already know, it skips. A New Yorker can't turn right on red at home either, so that story drops down the list."),
    "v07": (MALE, "You can see every step. It looks at what's around you, scores what's new for your hometown, lets Muse Spark choose, and speaks only from verified sources."),
    "v08": (MALE, "Beyond the hand-checked stories, Muse Spark searches the web. No trusted source? It stays quiet."),
    "v09": (MALE, "Curious? Just ask. Muse Voice Transcribe listens, and the answer comes with sources."),
    "v10": (MALE, "Or point your camera. Muse Spark finds the objects, SAM 3.1 cuts them into stickers, and people get blurred."),
    "v11": (MALE, "Going somewhere? It walks you there, and still tells you stories on the way."),
    "v12": (MALE, "Every walk becomes a page in your notebook. No scores, no badges. Just what you noticed."),
    "v13": (MALE, "Why not just ask a chatbot? A chatbot waits for you to ask. This one speaks first."),
    "v14": (MALE, "All of this was built during the hackathon, and it's live today."),
    "v15": (MALE, "Travellers already love ordinary streets. Cities can license it, travellers can buy a city, and no story is ever for sale."),
    "v16": (MALE, "Next: Meta glasses."),
    "v17": (GUIDE, "Red takes express and airmail. Green takes ordinary mail."),
    "v18": (MALE, "Phone today. Glasses next."),
    "v19": (MALE, "Six Meta models, working as one quiet guide."),
    "v20": (MALE, "Chitchat Tour. Same street, different stories."),
}


async def main(only):
    for k, (voice, text) in LINES.items():
        if only and k not in only:
            continue
        await edge_tts.Communicate(text, voice, rate="+4%").save(os.path.join(OUT, f"{k}.mp3"))
        print("ok", k)


asyncio.run(main(sys.argv[1:]))
