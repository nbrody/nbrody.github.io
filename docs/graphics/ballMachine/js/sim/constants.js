// Physical constants for the machine. SI units.

export const BALL = {
  R: 0.03,                 // 60 mm resin balls (a little bigger than pool balls)
  m: 0.17,                 // kg
  contactAngle: 38 * Math.PI / 180, // rail contact angle from the ball's vertical
  railRadius: 0.0055,      // 11 mm stainless rod
  // quadratic air drag per unit mass: 0.5 * rho * Cd * A / m
  drag: 0.5 * 1.2 * 0.47 * Math.PI * 0.03 * 0.03 / 0.17,
  e_ball: 0.88,            // ball-ball restitution (phenolic resin)
};

// Rolling on two rails the ball turns about the line through both contact
// points, which is d = R cos(alpha) from its centre, so it spins faster than
// on a flat floor and stores more energy in rotation:
//   KE = 1/2 m v^2 (1 + (2/5) R^2 / d^2)
export const railK = 1 + 0.4 / Math.cos(BALL.contactAngle) ** 2;
export const flatK = 1.4;

// Rails are offset from the ball-centre path.
export const RAIL = {
  lateral: (BALL.R + BALL.railRadius) * Math.sin(BALL.contactAngle),
  drop: (BALL.R + BALL.railRadius) * Math.cos(BALL.contactAngle),
};

// Water (the water slide). The resin ball is half again as dense as water, so
// it sinks, but under water it weighs only a third as much, drags a shell of
// water along with it (added mass) and meets forty times the air's drag.
const BALL_DENSITY = BALL.m / (4 / 3 * Math.PI * BALL.R ** 3);
export const WATER = {
  ratio: 1000 / BALL_DENSITY,                                   // water / ball density ≈ 0.66
  // quadratic drag per unit mass, fully submerged: 0.5 ρ Cd A / m ≈ 3.9 /m
  dragFull: 0.5 * 1000 * 0.47 * Math.PI * BALL.R ** 2 / BALL.m,
  addedMass: 0.5,                                               // sphere added-mass coefficient
};
// Under water: effective gravity and the inertia factor of a rolling ball
// (1 + added mass + 2/5 for the spin).
WATER.g = 9.81 * (1 - WATER.ratio);
WATER.kRoll = 1 + WATER.addedMass * WATER.ratio + 0.4;
WATER.kFree = 1 + WATER.addedMass * WATER.ratio;

export const SUBSTEP = 1 / 1000;
