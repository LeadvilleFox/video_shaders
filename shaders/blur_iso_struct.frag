#version 410 core

in vec2 TexCoord;
out vec4 FragColor;

uniform sampler2D inputTexture;
uniform vec2 resolution;

// Isotropic 2D Gaussian blur for structure tensor smoothing.
// Single pass, circular kernel — no axis bias.
// Radius 6, sigma ~2.0.

const int RADIUS = 6;
const float SIGMA = 2.0;

void main() {
    vec2 texelSize = 1.0 / resolution;
    float twoSigma2 = 2.0 * SIGMA * SIGMA;

    vec4 result = vec4(0.0);
    float totalWeight = 0.0;

    for (int dy = -RADIUS; dy <= RADIUS; dy++) {
        for (int dx = -RADIUS; dx <= RADIUS; dx++) {
            float dist2 = float(dx * dx + dy * dy);
            if (dist2 > float(RADIUS * RADIUS)) continue;

            float w = exp(-dist2 / twoSigma2);
            vec2 offset = vec2(float(dx), float(dy)) * texelSize;
            result += texture(inputTexture, TexCoord + offset) * w;
            totalWeight += w;
        }
    }

    FragColor = result / totalWeight;
}
