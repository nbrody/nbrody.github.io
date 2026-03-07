const shaders = {
    baseVertex: `
        precision highp float;
        attribute vec2 aPosition;
        varying vec2 vUv;
        varying vec2 vL;
        varying vec2 vR;
        varying vec2 vT;
        varying vec2 vB;
        uniform vec2 texelSize;

        void main () {
            vUv = aPosition * 0.5 + 0.5;
            vL = vUv - vec2(texelSize.x, 0.0);
            vR = vUv + vec2(texelSize.x, 0.0);
            vT = vUv + vec2(0.0, texelSize.y);
            vB = vUv - vec2(0.0, texelSize.y);
            gl_Position = vec4(aPosition, 0.0, 1.0);
        }
    `,

    clear: `
        precision mediump float;
        precision mediump sampler2D;
        varying vec2 vUv;
        uniform sampler2D uTexture;
        uniform float uValue;

        void main () {
            gl_FragColor = uValue * texture2D(uTexture, vUv);
        }
    `,

    splat: `
        precision highp float;
        precision highp sampler2D;
        varying vec2 vUv;
        uniform sampler2D uTarget;
        uniform float uAspectRatio;
        uniform vec3 uColor;
        uniform vec2 uPoint;
        uniform float uRadius;

        void main () {
            vec2 p = vUv - uPoint.xy;
            p.x *= uAspectRatio;
            vec3 splat = exp(-dot(p, p) / uRadius) * uColor;
            vec3 base = texture2D(uTarget, vUv).xyz;
            gl_FragColor = vec4(base + splat, 1.0);
        }
    `,

    advection: `
        precision highp float;
        precision highp sampler2D;

        varying vec2 vUv;
        uniform sampler2D uVelocity;
        uniform sampler2D uSource;
        uniform vec2 texelSize;
        uniform float dt;
        uniform float dissipation;

        void main () {
            vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
            vec4 result = texture2D(uSource, coord);
            
            // Allow heat to rise, cooling
            float decay = 1.0;
            if (dissipation < 1.0) {
                decay = dissipation;
            }
            gl_FragColor = result * decay;
        }
    `,

    divergence: `
        precision highp float;
        precision highp sampler2D;

        varying vec2 vUv;
        varying vec2 vL;
        varying vec2 vR;
        varying vec2 vT;
        varying vec2 vB;
        uniform sampler2D uVelocity;

        void main () {
            float L = texture2D(uVelocity, vL).x;
            float R = texture2D(uVelocity, vR).x;
            float T = texture2D(uVelocity, vT).y;
            float B = texture2D(uVelocity, vB).y;

            vec2 C = texture2D(uVelocity, vUv).xy;
            if (vL.x < 0.0) { L = -C.x; }
            if (vR.x > 1.0) { R = -C.x; }
            if (vT.y > 1.0) { T = -C.y; }
            if (vB.y < 0.0) { B = -C.y; }

            float div = 0.5 * (R - L + T - B);
            gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
        }
    `,

    curl: `
        precision highp float;
        precision highp sampler2D;

        varying vec2 vUv;
        varying vec2 vL;
        varying vec2 vR;
        varying vec2 vT;
        varying vec2 vB;
        uniform sampler2D uVelocity;

        void main () {
            float L = texture2D(uVelocity, vL).y;
            float R = texture2D(uVelocity, vR).y;
            float T = texture2D(uVelocity, vT).x;
            float B = texture2D(uVelocity, vB).x;
            float vorticity = R - L - T + B;
            gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
        }
    `,

    vorticity: `
        precision highp float;
        precision highp sampler2D;

        varying vec2 vUv;
        varying vec2 vL;
        varying vec2 vR;
        varying vec2 vT;
        varying vec2 vB;
        uniform sampler2D uVelocity;
        uniform sampler2D uCurl;
        uniform float curlAmount;
        uniform float dt;

        void main () {
            float L = texture2D(uCurl, vL).x;
            float R = texture2D(uCurl, vR).x;
            float T = texture2D(uCurl, vT).x;
            float B = texture2D(uCurl, vB).x;
            float C = texture2D(uCurl, vUv).x;

            vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
            force /= length(force) + 0.0001;
            force *= curlAmount * C;
            force.y *= -1.0;

            vec2 vel = texture2D(uVelocity, vUv).xy;
            gl_FragColor = vec4(vel + force * dt, 0.0, 1.0);
        }
    `,

    buoyancy: `
        precision highp float;
        precision highp sampler2D;
        
        varying vec2 vUv;
        uniform sampler2D uVelocity;
        uniform sampler2D uDensity;
        uniform float buoyancyAmount;
        uniform float dt;

        void main() {
            vec2 vel = texture2D(uVelocity, vUv).xy;
            vec4 tempAndFuel = texture2D(uDensity, vUv);
            
            // Temperature is in G channel, fuel in R. 
            float temp = tempAndFuel.g;
            // Upward force proportional to temperature
            vel.y += buoyancyAmount * temp * dt;

            gl_FragColor = vec4(vel, 0.0, 1.0);
        }
    `,

    pressure: `
        precision highp float;
        precision highp sampler2D;

        varying vec2 vUv;
        varying vec2 vL;
        varying vec2 vR;
        varying vec2 vT;
        varying vec2 vB;
        uniform sampler2D uPressure;
        uniform sampler2D uDivergence;

        void main () {
            float L = texture2D(uPressure, vL).x;
            float R = texture2D(uPressure, vR).x;
            float T = texture2D(uPressure, vT).x;
            float B = texture2D(uPressure, vB).x;
            float C = texture2D(uPressure, vUv).x;
            float divergence = texture2D(uDivergence, vUv).x;
            float pressure = (L + R + B + T - divergence) * 0.25;
            gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
        }
    `,

    gradientSubtract: `
        precision highp float;
        precision highp sampler2D;

        varying vec2 vUv;
        varying vec2 vL;
        varying vec2 vR;
        varying vec2 vT;
        varying vec2 vB;
        uniform sampler2D uPressure;
        uniform sampler2D uVelocity;

        void main () {
            float L = texture2D(uPressure, vL).x;
            float R = texture2D(uPressure, vR).x;
            float T = texture2D(uPressure, vT).x;
            float B = texture2D(uPressure, vB).x;
            vec2 velocity = texture2D(uVelocity, vUv).xy;
            velocity.xy -= vec2(R - L, T - B);
            gl_FragColor = vec4(velocity, 0.0, 1.0);
        }
    `,

    display: `
        precision highp float;
        precision highp sampler2D;

        varying vec2 vUv;
        uniform sampler2D uTexture;
        uniform sampler2D uBloom;
        uniform int hasBloom;

        // Custom ACES filmic tonemapping for premium glowing colors
        vec3 ACESFilm(vec3 x) {
            float a = 2.51;
            float b = 0.03;
            float c = 2.43;
            float d = 0.59;
            float e = 0.14;
            return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0);
        }

        void main () {
            // R = fuel/smoke, G = temperature
            vec4 data = texture2D(uTexture, vUv);
            float fuel = data.r;
            float temp = data.g;

            // Blackbody approximation
            // As temperature goes up, we cycle from black -> dark red -> bright orange -> yellow -> white
            vec3 fireColor = vec3(1.2, 0.1, 0.0) * temp; // Base glow (red)
            fireColor += vec3(1.0, 0.8, 0.1) * pow(temp, 1.5) * 1.5; // Core glow (orange-yellow)
            fireColor += vec3(1.0, 1.0, 1.0) * pow(max(0.0, temp - 0.7), 2.0) * 2.0; // White hot
            
            // Smoke adds faint gray but obscures background
            float smokeAlpha = min(1.0, pow(fuel * 0.5, 0.5));
            vec3 smokeColor = vec3(0.1) * smokeAlpha;
            
            vec3 c = mix(smokeColor, fireColor, smoothstep(0.0, 0.5, temp));

            if (hasBloom == 1) {
                // simple cheap bloom overlay from blurred buffer could go here
                // We'll mimic internal bloom by boosting
                c += fireColor * 0.3;
            }

            // ACES Tonemap
            c = ACESFilm(c);

            // subtle dither
            vec2 u = vUv * 500.0;
            c += dot(vec2(fract(sin(u.x*12.9898 + u.y*78.233)*43758.5453)), vec2(1.0)) * 0.01 - 0.005;

            gl_FragColor = vec4(c, 1.0);
        }
    `
};
