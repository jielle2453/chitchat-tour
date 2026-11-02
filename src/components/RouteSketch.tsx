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
  endpoints = false,
}: {
  paths: LatLon[][];
  width?: number;
  height?: number;
  stroke?: string;
  strokeWidth?: number;
  dashed?: boolean;
  margin?: number;
  endpoints?: boolean; // start dot + end ring
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
  const first = lines[0]?.[0];
  const last = lines.length ? lines[lines.length - 1][lines[lines.length - 1].length - 1] : undefined;
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
      {endpoints && first ? <circle cx={first[0]} cy={first[1]} r={strokeWidth * 1.1} fill={stroke} /> : null}
      {endpoints && last ? (
        <>
          <circle cx={last[0]} cy={last[1]} r={strokeWidth * 1.6} fill="none" stroke={stroke} strokeWidth={strokeWidth * 0.8} />
          <circle cx={last[0]} cy={last[1]} r={strokeWidth * 0.5} fill={stroke} />
        </>
      ) : null}
    </svg>
  );
}
