// A piece of masking tape across the top of a sticker: translucent warm
// paper, hairline border, torn zigzag ends. A plain sibling overlay — never
// an ancestor of the multiply-blended art.
export default function Tape({
  rotate = 12,
  width = 38,
}: {
  rotate?: number; // ±20° from the collage layout
  width?: number; // 38 sheet px
}) {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        // Visible art starts ~18% down the box (die-cut border + shadow +
        // contain-fit padding); straddle that edge with ~40% of the tape over
        // the art. % of the sticker box so it scales with the sheet.
        top: "calc(18% - 8px)",
        left: "50%",
        width,
        height: 14,
        transform: `translateX(-50%) rotate(${rotate}deg)`,
        background: "rgba(235,232,224,0.85)",
        border: "1px solid rgba(17,17,17,0.06)",
        // torn short ends: small zigzags on the left/right edges
        clipPath:
          "polygon(3% 0, 97% 5%, 100% 22%, 98% 38%, 100% 55%, 97.5% 72%, 99% 88%, 96% 100%, 2% 95%, 0% 78%, 2% 60%, 0% 42%, 1.5% 25%, 0% 10%)",
      }}
    />
  );
}
