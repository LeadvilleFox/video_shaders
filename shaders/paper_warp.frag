#version 410 core

in vec2 TexCoord;
out vec4 FragColor;

uniform sampler2D inputTexture;
uniform vec2 resolution;

// Paper warp — subtle UV distortion simulating cheap paper
// that doesn't lie perfectly flat. Low-frequency, gentle.

const float WARP_STRENGTH = 1.5; // pixels of max displacement

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

void main() {
    vec2 texelSize = 1.0 / resolution;

    // Very low frequency noise — large gentle waves
    float nx = noise(TexCoord * 3.0) * 2.0 - 1.0;
    float ny = noise(TexCoord * 3.0 + 50.0) * 2.0 - 1.0;

    vec2 offset = vec2(nx, ny) * WARP_STRENGTH * texelSize;
    vec3 color = texture(inputTexture, TexCoord + offset).rgb;

    FragColor = vec4(color, 1.0);
}
