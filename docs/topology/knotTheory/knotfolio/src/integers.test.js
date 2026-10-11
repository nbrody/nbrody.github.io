import {assert, test} from "./util.js";
import {gcd} from "./integers.js";

test("gcd", () => {
  assert(gcd(5,0) === 5);
  assert(gcd(0,5) === 5);
  assert(gcd(5,2) === 1);
  assert(gcd(15,21) === 3);
});
