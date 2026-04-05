#version 410 core

in vec2 TexCoord;
out vec4 FragColor;

uniform sampler2D inputTexture;
uniform vec2 resolution;

// Detect edges via Sobel on the current (post-Kuwahara) image
// and darken those pixels to create illustration-style outlines.
// Running this AFTER Kuwahara is intentional: the smoothed image
// has clean structural edges without texture noise.

const float EDGE_STRENGTH = 2.5;  // how dark the lines get
const float EDGE_THRESHOLD = 0.08; // ignore weak edges below this

void main() {
    vec2 t = 1.0 / resolution;
    vec3 color = texture(inputTexture, TexCoord).rgb;

    // Sample luminance in 3x3 neighborhood
    float tl = dot(texture(inputTexture, TexCoord + vec2(-1, -1) * t).rgb, vec3(0.299, 0.587, 0.114));
    float tc = dot(texture(inputTexture, TexCoord + vec2( 0, -1) * t).rgb, vec3(0.299, 0.587, 0.114));
    float tr = dot(texture(inputTexture, TexCoord + vec2( 1, -1) * t).rgb, vec3(0.299, 0.587, 0.114));
    float ml = dot(texture(inputTexture, TexCoord + vec2(-1,  0) * t).rgb, vec3(0.299, 0.587, 0.114));
    float mr = dot(texture(inputTexture, TexCoord + vec2( 1,  0) * t).rgb, vec3(0.299, 0.587, 0.114));
    float bl = dot(texture(inputTexture, TexCoord + vec2(-1,  1) * t).rgb, vec3(0.299, 0.587, 0.114));
    float bc = dot(texture(inputTexture, TexCoord + vec2( 0,  1) * t).rgb, vec3(0.299, 0.587, 0.114));
    float br = dot(texture(inputTexture, TexCoord + vec2( 1,  1) * t).rgb, vec3(0.299, 0.587, 0.114));

    // Sobel
    float gx = -tl + tr - 2.0*ml + 2.0*mr - bl + br;
    float gy = -tl - 2.0*tc - tr + bl + 2.0*bc + br;
    float edge = length(vec2(gx, gy));

    // Threshold and darken
    float darkening = smoothstep(EDGE_THRESHOLD, EDGE_THRESHOLD + 0.15, edge) * EDGE_STRENGTH;
    darkening = clamp(darkening, 0.0, 1.0);

    // Darken towards a warm dark brown rather than pure black
    vec3 lineColor = vec3(0.08, 0.05, 0.03);
    color = mix(color, lineColor, darkening);

    FragColor = vec4(color, 1.0);
}
