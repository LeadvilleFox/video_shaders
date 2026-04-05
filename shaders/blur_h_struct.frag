#version 410 core

in vec2 TexCoord;
out vec4 FragColor;

uniform sampler2D inputTexture;
uniform vec2 resolution;

// Wide horizontal Gaussian blur for structure tensor smoothing.
// Radius 12 / sigma ~4 — needs to be large enough to produce
// stable eigenvector orientations from the structure tensor.

void main() {
    float kernel[25] = float[](
        0.0089, 0.0132, 0.0186, 0.0249, 0.0318,
        0.0387, 0.0449, 0.0496, 0.0523, 0.0525,
        0.0503, 0.0459, 0.0459, 0.0503, 0.0525,
        0.0523, 0.0496, 0.0449, 0.0387, 0.0318,
        0.0249, 0.0186, 0.0132, 0.0089, 0.0057
    );

    float sum = 0.0;
    for (int i = 0; i < 25; i++) sum += kernel[i];

    vec2 texelSize = 1.0 / resolution;
    vec4 result = vec4(0.0);

    for (int i = 0; i < 25; i++) {
        int x = i - 12;
        vec2 offset = vec2(float(x) * texelSize.x, 0.0);
        result += texture(inputTexture, TexCoord + offset) * (kernel[i] / sum);
    }
    FragColor = result;
}
