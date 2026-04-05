#version 410 core

in vec2 TexCoord;
out vec4 FragColor;

uniform sampler2D inputTexture;
uniform vec2 resolution;

// Brush distortion — warps UV coordinates with smooth noise
// to simulate visible brushstrokes. The noise is structured
// to create elongated, directional perturbations that look
// like paint was applied with a flat brush.

const float DISTORT_STRENGTH = 2.5; // pixels of max displacement
const float BRUSH_SCALE = 0.004;     // noise frequency (lower = longer strokes)

// Smooth value noise
float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f); // smoothstep interpolation

    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));

    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Fractal noise for more organic look
float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 4; i++) {
        value += amplitude * noise(p);
        p *= 2.0;
        amplitude *= 0.5;
    }
    return value;
}

void main() {
    vec2 texelSize = 1.0 / resolution;
    vec2 noiseCoord = TexCoord / BRUSH_SCALE;

    // Two independent noise fields for x and y displacement
    // Use anisotropic noise coordinates: stretch horizontally
    // to create elongated brush-like strokes
    float nx = fbm(noiseCoord * vec2(1.0, 2.5)) * 2.0 - 1.0;
    float ny = fbm(noiseCoord * vec2(2.5, 1.0) + 100.0) * 2.0 - 1.0;

    vec2 offset = vec2(nx, ny) * DISTORT_STRENGTH * texelSize;
    vec3 color = texture(inputTexture, TexCoord + offset).rgb;

    FragColor = vec4(color, 1.0);
}
