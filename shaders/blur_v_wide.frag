#version 410 core

in vec2 TexCoord;
out vec4 FragColor;

uniform sampler2D inputTexture;
uniform vec2 resolution;

void main() {
    // 25-tap Gaussian kernel (radius 12), sigma ~= 4.0
    const int RADIUS = 12;
    float weights[25] = float[](
        0.0089, 0.0132, 0.0186, 0.0249, 0.0318,
        0.0387, 0.0449, 0.0496, 0.0523, 0.0525,
        0.0503, 0.0459, 0.0459, 0.0503, 0.0525,
        0.0523, 0.0496, 0.0449, 0.0387, 0.0318,
        0.0249, 0.0186, 0.0132, 0.0089, 0.0057
    );

    float sum = 0.0;
    for (int i = 0; i < 25; i++) sum += weights[i];

    vec2 texelSize = 1.0 / resolution;
    vec3 result = vec3(0.0);

    for (int i = 0; i < 25; i++) {
        int y = i - RADIUS;
        vec2 offset = vec2(0.0, float(y) * texelSize.y);
        result += texture(inputTexture, TexCoord + offset).rgb * (weights[i] / sum);
    }
    FragColor = vec4(result, 1.0);
}
