/** Air density at sea level, kg/m³. */
export const RHO = 1.225;
/** Gravity, m/s². */
export const G = 9.81;

/**
 * Turn-in cost per corner, seconds per tonne. A steady-state segment model
 * never simulates CHANGING direction, which is exactly where a 725 kg car
 * beats a 1460 kg one. Without this the model systematically under-rewards
 * light cars on twisty circuits.
 */
export const TURN_IN_S_PER_TONNE = 0.08;

/**
 * How much of the track width a driver uses to straighten a corner, metres
 * added to every centreline radius. Imported geometry is the centreline; a
 * racing line is not.
 */
export const RACING_LINE_GAIN_M = 8;

/** Above this radius a segment is a straight, metres. */
export const STRAIGHT_ABOVE_M = 400;

/** Integration step along a straight, metres. */
export const ACCEL_STEP_M = 0.5;
