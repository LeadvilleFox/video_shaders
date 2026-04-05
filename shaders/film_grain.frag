#version 410 core

in vec2 TexCoord;
out vec4 FragColor;

uniform sampler2D inputTexture;
uniform vec2 resolution;

// Film grain — adds organic noise texture back to the image
// after Kuwahara smoothing flattens everything.
// Luminance-adaptive: more grain in midtones, less in shadows/highlights.

const float GRAIN_STRENGTH = 0.03;

// Simple hash-based noise (no texture needed)
float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

void main() {
    vec3 color = texture(inputTexture, TexCoord).rgb;
    float lum = dot(color, vec3(0.299, 0.587, 0.114));

    // Generate noise from pixel coordinates (deterministic per-frame;
    // for video, pass a frame counter uniform to vary per-frame)
    vec2 pixelCoord = TexCoord * resolution;
    float noise = hash(pixelCoord) * 2.0 - 1.0; // [-1, 1]

    // Luminance-adaptive: strongest in midtones
    float midtoneMask = 1.0 - abs(lum - 0.5) * 2.0;
    midtoneMask = max(midtoneMask, 0.3); // always some grain

    color += noise * GRAIN_STRENGTH * midtoneMask;

    FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
