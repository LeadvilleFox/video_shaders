#version 410 core

in vec2 TexCoord;
out vec4 FragColor;

uniform sampler2D inputTexture;

void main() {
    FragColor = texture(inputTexture, TexCoord);
}
