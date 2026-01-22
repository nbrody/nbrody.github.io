
const math = require('./docs/Talks/KIAS/js/math.js');
// Mocking DOM globals for the script
global.BigInt = BigInt;
global.Number = Number;

const BigFrac = math.BigFrac;
const BigMat = math.BigMat;

const A = new BigMat("3", "0", "0", "1/3");
const B = new BigMat("82/8", "2/8", "9/8", "1/8");

const gens = [A, A.inv(), B, B.inv()];
const z0 = { re: 0, im: 1 };

function hDist(z1, z2) {
    const dx = z1.re - z2.re;
    const dy = z1.im - z2.im;
    return Math.acosh(1 + (dx * dx + (z1.im - z2.im) * (z1.im - z2.im)) / (2 * z1.im * z2.im));
}

// Find neighbors
let orbit = [{ g: new BigMat(1, 0, 0, 1), z: z0 }];
let queue = [orbit[0]];
let seen = new Set();
seen.add("1:0:0:1");

for (let i = 0; i < 100; i++) {
    let curr = queue.shift();
    if (!curr) break;
    for (let g of gens) {
        let next = g.mul(curr.g);
        let key = `${next.a.toString()}:${next.b.toString()}:${next.c.toString()}:${next.d.toString()}`;
        if (!seen.has(key)) {
            seen.add(key);
            let nz = next.action(z0);
            orbit.push({ g: next, z: nz });
            if (orbit.length < 50) queue.push(orbit[orbit.length - 1]);
        }
    }
}

orbit.sort((a, b) => hDist(z0, a.z) - hDist(z0, b.z));

console.log("Neighbors found:", orbit.length);
orbit.slice(1, 10).forEach(o => {
    console.log(`z: ${o.z.re.toFixed(3)}, ${o.z.im.toFixed(3)} | d: ${hDist(z0, o.z).toFixed(3)}`);
});
