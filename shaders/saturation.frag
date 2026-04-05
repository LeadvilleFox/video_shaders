#version 410 core

in vec2 TexCoord;
out vec4 FragColor;

uniform sampler2D inputTexture;
uniform vec2 resolution;

// Boost saturation and contrast slightly.
// Applied before Kuwahara to compensate for the averaging
// which tends to mute colors.

const float SATURATION = 1.4;  // 1.0 = no change
const float CONTRAST = 1.15;   // 1.0 = no change

void main() {
    vec3 color = texture(inputTexture, TexCoord).rgb;

    // Luminance
    float lum = dot(color, vec3(0.299, 0.587, 0.114));

    // Saturation: push colors away from grey
    color = mix(vec3(lum), color, SATURATION);

    // Contrast: push away from mid-grey
    color = (color - 0.5) * CONTRAST + 0.5;

    FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
