#version 410 core

in vec2 TexCoord;
out vec4 FragColor;

uniform sampler2D inputTexture;
uniform vec2 resolution;

// Flow-field smear — drags pixels along edge directions like
// thick oil paint applied with a palette knife.
// Computes gradients inline (no structure tensor pass needed),
// then samples along the edge-parallel direction and averages.

const int SMEAR_LENGTH = 28;  // samples in each direction along edge
const float STEP_SIZE = 2.0;  // pixels per step

void main() {
    vec2 texelSize = 1.0 / resolution;

    // Inline Sobel to get gradient direction
    float tl = dot(texture(inputTexture, TexCoord + vec2(-1, -1) * texelSize).rgb, vec3(0.299, 0.587, 0.114));
    float tc = dot(texture(inputTexture, TexCoord + vec2( 0, -1) * texelSize).rgb, vec3(0.299, 0.587, 0.114));
    float tr = dot(texture(inputTexture, TexCoord + vec2( 1, -1) * texelSize).rgb, vec3(0.299, 0.587, 0.114));
    float ml = dot(texture(inputTexture, TexCoord + vec2(-1,  0) * texelSize).rgb, vec3(0.299, 0.587, 0.114));
    float mr = dot(texture(inputTexture, TexCoord + vec2( 1,  0) * texelSize).rgb, vec3(0.299, 0.587, 0.114));
    float bl = dot(texture(inputTexture, TexCoord + vec2(-1,  1) * texelSize).rgb, vec3(0.299, 0.587, 0.114));
    float bc = dot(texture(inputTexture, TexCoord + vec2( 0,  1) * texelSize).rgb, vec3(0.299, 0.587, 0.114));
    float br = dot(texture(inputTexture, TexCoord + vec2( 1,  1) * texelSize).rgb, vec3(0.299, 0.587, 0.114));

    float gx = -tl + tr - 2.0*ml + 2.0*mr - bl + br;
    float gy = -tl - 2.0*tc - tr + bl + 2.0*bc + br;

    // Edge-parallel direction (perpendicular to gradient)
    vec2 flow = vec2(-gy, gx);
    float mag = length(flow);

    if (mag < 0.001) {
        // No edge — output original
        FragColor = vec4(texture(inputTexture, TexCoord).rgb, 1.0);
        return;
    }

    flow = normalize(flow);

    // Smear: accumulate samples along the flow direction
    vec3 sum = vec3(0.0);
    float totalW = 0.0;

    for (int i = -SMEAR_LENGTH; i <= SMEAR_LENGTH; i++) {
        float fi = float(i);
        vec2 offset = flow * fi * STEP_SIZE * texelSize;
        vec3 sample_color = texture(inputTexture, TexCoord + offset).rgb;

        // Gaussian-like weight: stronger at center
        float w = exp(-fi * fi / (float(SMEAR_LENGTH) * 0.5));
        sum += sample_color * w;
        totalW += w;
    }

    FragColor = vec4(sum / totalW, 1.0);
}
