#version 410 core

in vec2 TexCoord;
out vec4 FragColor;

uniform sampler2D inputTexture;
uniform vec2 resolution;

// Chromatic aberration — shifts R/G/B channels slightly apart
// radially from the center, simulating a lens defect.
// Stronger at edges, zero at center.

const float STRENGTH = 2.5; // pixels of max shift at corners

void main() {
    vec2 texelSize = 1.0 / resolution;
    vec2 center = vec2(0.5);
    vec2 dir = TexCoord - center;
    float dist = length(dir);

    // Scale shift by distance from center (quadratic falloff)
    vec2 shift = dir * dist * STRENGTH * texelSize;

    float r = texture(inputTexture, TexCoord + shift).r;
    float g = texture(inputTexture, TexCoord).g;
    float b = texture(inputTexture, TexCoord - shift).b;

    FragColor = vec4(r, g, b, 1.0);
}
