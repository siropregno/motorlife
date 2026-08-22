import { useMemo } from "react";
import type { TrackSpec } from "@contracts/track";
import { trackShape } from "@catalog/shape";

interface Props {
  track: TrackSpec;
}

/**
 * The circuit, drawn from its own geometry.
 *
 * Not an illustration and not an asset: the path comes out of the same segment
 * list the lap model laps, so the shape on screen cannot disagree with the
 * track being simulated. Change a corner radius in the fixture and the map
 * changes with it.
 *
 * Two strokes on one path. The wide dark one underneath is the run-off, the
 * bright one on top is the racing line -- which is the cheapest way to make a
 * closed polyline read as a ROAD rather than as a wire diagram, and it costs
 * one extra element rather than a fill and a mask.
 *
 * Memoised on the track id: solving the turn directions is exhaustive over the
 * corners and there is no reason to redo it while someone drags a slider.
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
