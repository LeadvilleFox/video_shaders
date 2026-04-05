#version 410 core

in vec2 TexCoord;
out vec4 FragColor;

uniform sampler2D inputTexture;
uniform vec2 resolution;

// Color quantization — reduces color to N levels per channel.
// Creates a more graphic/illustrated look when combined with Kuwahara.
// Uses smooth stepping to avoid harsh banding.

const float NUM_LEVELS = 10.0; // levels per channel (lower = more graphic)

void main() {
    vec3 color = texture(inputTexture, TexCoord).rgb;

    // Quantize each channel
    vec3 quantized = floor(color * (NUM_LEVELS - 1.0) + 0.5) / (NUM_LEVELS - 1.0);

    // Blend slightly with original to soften the banding
    color = mix(color, quantized, 0.7);

    FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
