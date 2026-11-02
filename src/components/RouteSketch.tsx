import { projectPath, samplePath, type LatLon } from "@/lib/client/walkPath";

// A small route drawing from recorded points: just the shape of the walk, no map tiles.
export default function RouteSketch({
  paths,
  width = 88,
  height = 60,
  stroke = "#111",
  strokeWidth = 2.5,
  dashed = false,
  margin = 8,
}: {
  paths: LatLon[][];
  width?: number;
  height?: number;
  stroke?: string;
  strokeWidth?: number;
  dashed?: boolean;
  margin?: number;
}) {
  const flat = paths.flat();
  if (flat.length < 2) return <svg width={width} height={height} aria-hidden />;
  // project every segment together so they keep their relative positions
  const all = projectPath(flat, width, height, margin);
  const lines: [number, number][][] = [];
  let offset = 0;
  for (const p of paths) {
    const pts = all.slice(offset, offset + p.length);
    offset += p.length;
    lines.push(pts.length > 160 ? (samplePath(pts as unknown as LatLon[], 160) as unknown as [number, number][]) : pts);
  }
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="overflow-visible">
      {lines.map((pts, k) => (
        <polyline
          key={k}
          points={pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={dashed ? "3 9" : undefined}
        />
      ))}
    </svg>
  );
}
