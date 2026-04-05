#version 410 core

in vec2 TexCoord;
out vec4 FragColor;

uniform sampler2D inputTexture;
uniform vec2 resolution;

// Risograph / zine print simulation.
// Four stages: color separation → per-channel halftone →
// misregistration → paper texture.
//
// Foxface Mocha + Latte ink palette, drawn from the actual
// Foxface colour system. 8 inks for rich warm coverage.

// --- Ink palette (Foxface) ---
const int NUM_INKS = 8;
const vec3 INKS[8] = vec3[](
    vec3(0.96, 0.93, 0.84),  // Warm Cream  (#F5ECD7)
    vec3(0.76, 0.60, 0.42),  // Camel       (#C19A6B)
    vec3(0.29, 0.17, 0.09),  // Chocolate   (#4A2C17)
    vec3(0.72, 0.25, 0.05),  // Rust        (#B7410E)
    vec3(0.83, 0.63, 0.09),  // Mustard     (#D4A017)
    vec3(0.42, 0.49, 0.27),  // Olive       (#6B7C45)
    vec3(0.45, 0.18, 0.22),  // Burgundy    (#722F37)
    vec3(0.83, 0.51, 0.42)   // Terracotta  (#D4836A)
);

// --- Halftone parameters ---
const float DOT_SCALE = 4.5;
const float SCREEN_ANGLES[8] = float[](
    15.0, 45.0, 75.0, 105.0, 30.0, 60.0, 90.0, 0.0
);

// --- Misregistration (pixels of offset per channel) ---
const vec2 MISREG[8] = vec2[](
    vec2( 1.2, -0.8),
    vec2(-0.6,  1.5),
    vec2( 0.9,  0.7),
    vec2(-1.0, -0.4),
    vec2( 0.5,  1.1),
    vec2(-1.3,  0.3),
    vec2( 0.7, -1.2),
    vec2(-0.8,  0.9)
);

const float PAPER_GRAIN = 0.08;

float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

// --- Stage 1: Color separation ---
// For each ink, compute how much of it is needed to reproduce the pixel.
// Uses distance in RGB space: closer color = more ink.
void getInkDensities(vec3 color, out float densities[8]) {
    float lum = dot(color, vec3(0.299, 0.587, 0.114));

    for (int i = 0; i < NUM_INKS; i++) {
        // Base density: inverse distance to ink color
        vec3 diff = color - INKS[i];
        float dist = length(diff);
        float density = exp(-dist * dist / 0.12);

        // Boost dark ink in shadows, light ink in highlights
        if (i == 2) density += (1.0 - lum) * 0.4;       // chocolate in darks
        if (i == 0) density += smoothstep(0.5, 1.0, lum) * 0.5; // cream in lights

        densities[i] = clamp(density, 0.0, 1.0);
    }
}

// --- Stage 2: Per-channel halftone ---
float halftoneScreen(vec2 pixelCoord, float angleDeg, float density) {
    float angle = radians(angleDeg);
    float cosA = cos(angle);
    float sinA = sin(angle);

    vec2 rotated = vec2(
        pixelCoord.x * cosA + pixelCoord.y * sinA,
       -pixelCoord.x * sinA + pixelCoord.y * cosA
    );

    float sx = sin(rotated.x * 3.14159265 / DOT_SCALE);
    float sy = sin(rotated.y * 3.14159265 / DOT_SCALE);
    float pattern = (sx * sy + 1.0) * 0.5;

    return step(pattern, density);
}

void main() {
    vec2 texelSize = 1.0 / resolution;
    vec2 pixelCoord = TexCoord * resolution;

    // Paper base color
    vec3 paper = vec3(0.94, 0.90, 0.84);
    vec3 result = paper;

    for (int i = 0; i < NUM_INKS; i++) {
        // Stage 3: Misregistration — sample from offset position
        vec2 offsetUV = TexCoord + MISREG[i] * texelSize;
        vec3 sampleColor = texture(inputTexture, offsetUV).rgb;

        // Stage 1: Get ink density
        float densities[8];
        getInkDensities(sampleColor, densities);
        float density = densities[i];

        // Stage 2: Halftone
        vec2 screenCoord = pixelCoord + MISREG[i];
        float dot = halftoneScreen(screenCoord, SCREEN_ANGLES[i], density);

        // Composite: multiply ink onto paper (overprinting)
        result = mix(result, result * INKS[i], dot * 0.8);
    }

    // Stage 4: Paper texture
    float grain = noise(pixelCoord * 0.3) * 2.0 - 1.0;
    result += grain * PAPER_GRAIN;

    FragColor = vec4(clamp(result, 0.0, 1.0), 1.0);
}
