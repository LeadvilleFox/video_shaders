#version 410 core

in vec2 TexCoord;
out vec4 FragColor;

uniform sampler2D inputTexture;
uniform vec2 resolution;

void main() {
    float kernel[5] = float[](
        1.0/16.0, 4.0/16.0, 6.0/16.0, 4.0/16.0, 1.0/16.0
    );

    vec2 texelSize = 1.0 / resolution;
    vec3 result = vec3(0.0);

    for (int y = -2; y <= 2; y++) {
        vec2 offset = vec2(0.0, float(y) * texelSize.y);
        result += texture(inputTexture, TexCoord + offset).rgb * kernel[y + 2];
    }
    FragColor = vec4(result, 1.0);
}
