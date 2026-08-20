import type { TrackSpec } from "@contracts/track";
import { CARS } from "@catalog/cars";
import { TRACKS } from "@catalog/tracks";
import { derive } from "@sim/derive";
import { classIndex, meanReferenceLap, classOf } from "@sim/rating";
import { fmt } from "@sim/tower";

const tracks = TRACKS as TrackSpec[];
console.log("car                    mean ref lap   index  class");
for (const s of CARS) {
  const c = derive(s);
  const mean = meanReferenceLap(c, tracks);
  const pi = classIndex(c, tracks);
  console.log(
    `  ${(s.make + " " + s.model).padEnd(20)} ${fmt(mean).padStart(10)}   ${String(pi).padStart(4)}   ${classOf(pi)}`,
  );
}
