#version 410 core

in vec2 TexCoord;
out vec4 FragColor;

uniform sampler2D inputTexture;
uniform vec2 resolution;

// Difference of Gaussians (DoG) edge overlay.
// Computes two Gaussian-weighted averages at different sigmas in one pass,
// subtracts them to isolate edges, then composites as soft dark lines.
// Much smoother and more organic than Sobel-based edge detection.

const float SIGMA1 = 1.0;
const float SIGMA2 = 2.5;
const int RADIUS = 6;
const float LINE_STRENGTH = 1.8;
const float THRESHOLD = 0.02;

void main() {
    vec2 texelSize = 1.0 / resolution;
    vec3 color = texture(inputTexture, TexCoord).rgb;

    float sum1 = 0.0, sum2 = 0.0;
    float w1Total = 0.0, w2Total = 0.0;
    float twoSig1Sq = 2.0 * SIGMA1 * SIGMA1;
    float twoSig2Sq = 2.0 * SIGMA2 * SIGMA2;

    for (int dy = -RADIUS; dy <= RADIUS; dy++) {
        for (int dx = -RADIUS; dx <= RADIUS; dx++) {
            float dist2 = float(dx * dx + dy * dy);
            if (dist2 > float(RADIUS * RADIUS)) continue;

            vec2 offset = vec2(float(dx), float(dy)) * texelSize;
            float lum = dot(texture(inputTexture, TexCoord + offset).rgb,
                            vec3(0.299, 0.587, 0.114));

            float g1 = exp(-dist2 / twoSig1Sq);
            float g2 = exp(-dist2 / twoSig2Sq);

            sum1 += lum * g1;
            sum2 += lum * g2;
            w1Total += g1;
            w2Total += g2;
        }
    }

    float dog = (sum1 / w1Total) - (sum2 / w2Total);

    // Edges show up as strong positive or negative DoG values
    float edge = smoothstep(THRESHOLD, THRESHOLD + 0.03, abs(dog)) * LINE_STRENGTH;
    edge = clamp(edge, 0.0, 1.0);

    // Composite as warm dark lines
    vec3 lineColor = vec3(0.06, 0.04, 0.02);
    color = mix(color, lineColor, edge);

    FragColor = vec4(color, 1.0);
}
