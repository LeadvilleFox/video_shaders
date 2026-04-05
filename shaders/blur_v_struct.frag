#version 410 core

in vec2 TexCoord;
out vec4 FragColor;

uniform sampler2D inputTexture;
uniform vec2 resolution;

// Wide vertical Gaussian blur for structure tensor smoothing.

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
        int y = i - 12;
        vec2 offset = vec2(0.0, float(y) * texelSize.y);
        result += texture(inputTexture, TexCoord + offset) * (kernel[i] / sum);
    }
    FragColor = result;
}
