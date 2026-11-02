# Illustration style (decided 2026-11-02)

Notebook pages mix two kinds of images:

- **Photo stickers**: what the walker photographed, cut out with the SAM 3.1 mask, thick white border and a soft shadow.
- **Illustrations**: what the guide told about, generated once per knowledge item with Muse Image (`muse-image-1.0`). They sit flat on the page (multiply blend, no border).

Rejected along the way: busy patterns, cartoon characters with faces or limbs, fantasy palettes, thin-line drawings with offset colour blocks.

## Prompt

`<object description>. ` followed by:

```
Hand-made flat illustration built from a few big solid colour blocks: chunky simplified shapes with slightly wobbly, uneven, hand-cut edges, no outlines. Use the object's real-world colours, flat and slightly muted. Plain solid fills only: no patterns, no dots, no stripes, no texture, no gradients, no shading, no 3D. Very few details, small dark shapes only where needed (windows, wheels). Single object, centred, plain white background, no border. No text, letters or numbers. No face. No people.
```

## Notes for writing object descriptions

- Name the real colours and the Taiwan-specific look (e.g. wires stretching to both sides of a pole, a ground-floor glass shopfront under a sign band).
- Pale objects (white scooter) disappear on the off-white page: pick a darker real colour or mention a darker part.
- Keep shops generic; no brand colours or logos.
- `size: "1024x1024"`; output is base64 WebP. No transparent background (`background` is rejected), so place on the page with a multiply blend.
- About 10–40 s per image; generate all items ahead of time, never during a walk.
