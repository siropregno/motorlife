import { useMemo } from "react";
import type { TrackSpec } from "@contracts/track";
import { trackShape } from "@catalog/shape";

interface Props {
  track: TrackSpec;
}

/**
 * The circuit, drawn from its own geometry.
 *
 * Not an illustration and not an asset: the path is the polyline the import
 * traced, in metres, so the map is the real place rather than an impression of
 * it. Re-import a track and the map moves with it.
 *
 * Two strokes on one path. The wide dark one underneath is the run-off, the
 * bright one on top is the racing line -- which is the cheapest way to make a
 * closed polyline read as a ROAD rather than as a wire diagram, and it costs
 * one extra element rather than a fill and a mask.
 *
 * Memoised on the track: the projection is cheap, but it allocates a path
 * string of a few thousand characters and there is no reason to rebuild it
 * while someone drags a setup slider.
 */
export function TrackMap({ track }: Props) {
  const shape = useMemo(() => trackShape(track, 100, 7), [track]);

  return (
    <svg
      className="track-map"
      viewBox="0 0 100 100"
      role="img"
      aria-label={`Trazado de ${track.name}`}
    >
      <path className="track-run" d={shape.d} />
      <path className="track-line" d={shape.d} />
      {/* Where the lap starts, which is also where it is timed. */}
      <circle className="track-start" cx={shape.start.x} cy={shape.start.y} r="3.4" />
    </svg>
  );
}
