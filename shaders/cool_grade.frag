#version 410 core

in vec2 TexCoord;
out vec4 FragColor;

uniform sampler2D inputTexture;
uniform vec2 resolution;

// Neutral grade for graphic novel / ink-wash look.
// Desaturates slightly, deepens shadows, vignette. No color tinting.

void main() {
    vec3 color = texture(inputTexture, TexCoord).rgb;
    float lum = dot(color, vec3(0.299, 0.587, 0.114));

    // Slight desaturation
    color = mix(vec3(lum), color, 0.75);

    // Contrast boost — deepens darks, lifts lights slightly
    color = (color - 0.5) * 1.15 + 0.5;

    // Vignette
    vec2 uv = TexCoord - 0.5;
    float dist = length(uv * vec2(1.0, resolution.x / resolution.y));
    float vignette = 1.0 - smoothstep(0.3, 0.85, dist);
    color *= mix(0.75, 1.0, vignette);

    FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
