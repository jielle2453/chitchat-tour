// A circular postmark stamp: double ink ring, curved text on the ring, the
// walk date at the centre. Monochrome, restrained, slightly rotated. The ring
// text rides far enough out that it clears the centre date.
export default function Stamp({
  date = "03 NOV 2026",
  size = 72,
}: {
  date?: string; // "DD MON YYYY", Latin capitals
  size?: number; // 72 sheet px
}) {
  const c = size / 2;
  const ink = "rgba(17,17,17,0.7)";
  const pathId = "rgc-stamp-ring";
  const ringR = c - 7.5; // text baseline radius; glyphs reach ~2px inward
  return (
    <div
      aria-hidden
      style={{ width: size, height: size, transform: "rotate(-12deg)", opacity: 0.75 }}
    >
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="block">
        <defs>
          <path
            id={pathId}
            d={`M ${c},${c} m ${-ringR},0 a ${ringR},${ringR} 0 1,1 ${2 * ringR},0 a ${ringR},${ringR} 0 1,1 ${-2 * ringR},0`}
            fill="none"
          />
        </defs>
        <circle cx={c} cy={c} r={c - 1.5} fill="none" stroke={ink} strokeWidth={1} />
        <circle cx={c} cy={c} r={c - 5.5} fill="none" stroke={ink} strokeWidth={0.75} />
        <text fontSize={6.5} fill={ink} letterSpacing={1.8} style={{ fontFamily: "Georgia, 'Songti TC', serif" }}>
          <textPath href={`#${pathId}`}>CHITCHAT TOUR · TAIPEI ·</textPath>
        </text>
        <text
          x={c}
          y={c + 3}
          textAnchor="middle"
          fontSize={8}
          fontWeight={600}
          fill={ink}
          style={{ fontFamily: "Georgia, 'Songti TC', serif" }}
        >
          {date}
        </text>
      </svg>
    </div>
  );
}
