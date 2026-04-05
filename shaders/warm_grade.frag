#version 410 core

in vec2 TexCoord;
out vec4 FragColor;

uniform sampler2D inputTexture;
uniform vec2 resolution;

// Warm impressionistic color grading.
// - Shifts shadows toward amber/ochre
// - Shifts highlights toward golden
// - Gentle vignette to draw the eye inward
// - Slight overall warmth

void main() {
    vec3 color = texture(inputTexture, TexCoord).rgb;
    float lum = dot(color, vec3(0.299, 0.587, 0.114));

    // --- Warm color shift ---
    // Shadow tint: amber/ochre
    vec3 shadowTint = vec3(0.15, 0.08, 0.0);
    // Highlight tint: golden warm
    vec3 highlightTint = vec3(0.08, 0.05, -0.02);

    // Blend based on luminance: shadows get amber, highlights get gold
    float shadowAmount = 1.0 - smoothstep(0.0, 0.5, lum);
    float highlightAmount = smoothstep(0.5, 1.0, lum);

    color += shadowTint * shadowAmount * 0.6;
    color += highlightTint * highlightAmount * 0.4;

    // Overall warmth: red up, blue down, green untouched
    color.r *= 1.05;
    color.b *= 0.93;

    // --- Vignette ---
    vec2 uv = TexCoord - 0.5;
    float dist = length(uv * vec2(1.0, resolution.x / resolution.y));
    float vignette = 1.0 - smoothstep(0.3, 0.85, dist);
    color *= mix(0.7, 1.0, vignette);

    FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
