# Sticker style (photos since 2026-11-04; flat illustrations 11-02 to 11-04)

Notebook pages mix two kinds of images:

- **Photo stickers**: what the walker photographed, cut out with the SAM 3.1 mask, thick white border and a soft shadow.
- **Story stickers**: what the guide told about, generated once per knowledge item with Muse Image (`muse-image-1.0`) as a realistic, shadowless studio photo on pure white, then die-cut in the browser (`src/lib/client/dieCut.ts`) so they match the photo stickers. `scripts/generate-i## Prompt

`<object description>. ` followed by:

```
Realistic studio product photograph of one single real object, isolated, fully in frame with a generous margin, centred on a pure white (#FFFFFF) seamless background. Flat, even, shadowless lighting: absolutely no shadow, no reflection and no floor line under or around the object, the white is clean right up to its edges. True-to-life colours and materials, sharp focus, slight three-quarter view, 50mm lens. No text, letters, numbers or logos. No people, no hands, no faces. No other objects.
```

d fills only: no patterns, no dots, no stripes, no texture, no gradients, no shading, no 3D. Very few details, small dark shapes only where needed (windows, wheels). Single object, centred, plain white background, no border. No text, letters or numbers. No face. No people.
```

## Notes for writing object descriptions

- Name the real colours and the Taiwan-specific look (e.g. wires stretching to both sides of a pole, a ground-floor glass shopfront under a sign band).
- Pale objects (white scooter) lose their edge in the die-cut: pick a darker real colour or mention a darker part.
- Shadows survive the die-cut as a grey smear, hence "shadowless" in the prompt.
- Keep shops generic; no brand colours or logos.
- `size: "1024x1024"`; output is base64 WebP. No transparent background (`background` is rejected), hence the browser die-cut.
- About 10–40 s per image; generate all items ahead of time, never during a walk.
