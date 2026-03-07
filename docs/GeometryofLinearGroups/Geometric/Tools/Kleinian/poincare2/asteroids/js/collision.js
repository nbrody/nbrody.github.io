// collision.js — Torus-aware sphere collision detection

export function checkCollision(space, a, b) {
    const dist = space.distance(a.position, b.position);
    return dist < (a.getBoundingRadius() + b.getBoundingRadius());
}

export function checkBulletAsteroidCollisions(space, bullets, asteroids) {
    const hits = [];
    for (let i = 0; i < bullets.length; i++) {
        for (let j = 0; j < asteroids.length; j++) {
            if (checkCollision(space, bullets[i], asteroids[j])) {
                hits.push({ bulletIndex: i, asteroidIndex: j });
                break; // one bullet hits one asteroid
            }
        }
    }
    return hits;
}

export function checkShipAsteroidCollision(space, ship, asteroids) {
    if (ship.isInvulnerable) return -1;
    for (let i = 0; i < asteroids.length; i++) {
        if (checkCollision(space, ship, asteroids[i])) {
            return i;
        }
    }
    return -1;
}
