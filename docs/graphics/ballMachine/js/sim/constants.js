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

export const SUBSTEP = 1 / 1000;
