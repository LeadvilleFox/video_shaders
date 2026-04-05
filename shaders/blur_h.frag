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

    for (int x = -2; x <= 2; x++) {
        vec2 offset = vec2(float(x) * texelSize.x, 0.0);
        result += texture(inputTexture, TexCoord + offset).rgb * kernel[x + 2];
    }
    FragColor = vec4(result, 1.0);
}
