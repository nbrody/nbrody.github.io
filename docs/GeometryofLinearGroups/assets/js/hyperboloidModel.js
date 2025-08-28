// This is a library of functions for working with the hyperboloid model of hyperbolic geometry.
// It includes functions for computing distances in a dimension-agnostic way. We use (x,t) coordinates
// for points in the hyperboloid model, where t > 0 is the time coordinate, and use ||x||^2-t^2 = -1
// to represent the hyperboloid surface.

export function hypDist(p, q) {
  // Hyperbolic distance in the hyperboloid model.
  // cosh d = <p,q> 
  const dot = p[0] * q[0] + p[1] * q[1] + p[2] * q[2] - p[3] * q[3];
  return Math.acosh(dot);
}