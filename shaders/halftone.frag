#version 410 core

in vec2 TexCoord;
out vec4 FragColor;

uniform sampler2D inputTexture;
uniform vec2 resolution;

// Halftone — colored dots on white paper.
// Dot SIZE is determined by luminance (darker = bigger dot).
// Dot COLOR comes from the original pixel.
// Simple and punchy — no CMYK math needed.

const float DOT_SIZE = 5.0;
const float DOT_SCREEN_ANGLE = 30.0; // degrees

void main() {
    vec2 pixelCoord = TexCoord * resolution;

    float angle = radians(DOT_SCREEN_ANGLE);
    float cosA = cos(angle);
    float sinA = sin(angle);

    vec2 rotated = vec2(
        pixelCoord.x * cosA + pixelCoord.y * sinA,
       -pixelCoord.x * sinA + pixelCoord.y * cosA
    );

    // Snap to dot grid center to sample the color there
    vec2 cellCenter = (floor(rotated / DOT_SIZE) + 0.5) * DOT_SIZE;
    // Rotate back to get the texture coordinate at grid center
    vec2 unrotated = vec2(
        cellCenter.x * cosA - cellCenter.y * sinA,
        cellCenter.x * sinA + cellCenter.y * cosA
    );
    vec2 sampleUV = unrotated / resolution;

    vec3 color = texture(inputTexture, sampleUV).rgb;
    float lum = dot(color, vec3(0.299, 0.587, 0.114));

    // Dot radius: darker pixels get bigger dots
    float coverage = 1.0 - lum;
    float radius = sqrt(coverage) * 1.1;

    // Distance from current pixel to cell center
    vec2 cell = mod(rotated, DOT_SIZE) - DOT_SIZE * 0.5;
    float dist = length(cell) / (DOT_SIZE * 0.5);

    float dot = smoothstep(radius + 0.12, radius - 0.12, dist);

    // Dot shows the color; background is white paper
    vec3 result = mix(vec3(1.0), color, dot);

    FragColor = vec4(result, 1.0);
}
