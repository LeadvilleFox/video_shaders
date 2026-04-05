#version 410 core

in vec2 TexCoord;
out vec4 FragColor;

uniform sampler2D inputTexture;    // post-Kuwahara image (what we draw lines over)
uniform sampler2D originalTexture; // original frame (what we detect edges from)
uniform vec2 resolution;

// eXtended Difference of Gaussians (XDoG).
// Detects edges on the ORIGINAL image and composites as soft dark
// lines over the current (post-Kuwahara) image. Running edge detection
// on the original avoids picking up Kuwahara sector boundaries as
// false edges.
//
// Based on Winnemoller et al. "XDoG: An eXtended difference-of-Gaussians
// compendium including advanced image stylization"

const float SIGMA = 1.4;
const float K = 1.6;         // sigma ratio (sigma2 = sigma * k)
const float TAU = 0.98;      // soft threshold sharpness
const float EPSILON = 0.01;  // threshold offset
const float LINE_STRENGTH = 0.85;
const int RADIUS = 6;

// Soft thresholding function from XDoG paper
float softThreshold(float x) {
    if (x >= EPSILON) return 1.0;
    return 1.0 + tanh(TAU * (x - EPSILON));
}

void main() {
    vec2 texelSize = 1.0 / resolution;
    vec3 color = texture(inputTexture, TexCoord).rgb;

    float sigma1 = SIGMA;
    float sigma2 = SIGMA * K;
    float twoSig1Sq = 2.0 * sigma1 * sigma1;
    float twoSig2Sq = 2.0 * sigma2 * sigma2;

    float sum1 = 0.0, sum2 = 0.0;
    float w1Total = 0.0, w2Total = 0.0;

    for (int dy = -RADIUS; dy <= RADIUS; dy++) {
        for (int dx = -RADIUS; dx <= RADIUS; dx++) {
            float dist2 = float(dx * dx + dy * dy);
            if (dist2 > float(RADIUS * RADIUS)) continue;

            vec2 offset = vec2(float(dx), float(dy)) * texelSize;
            // Sample from ORIGINAL image for edge detection
            float lum = dot(texture(originalTexture, TexCoord + offset).rgb,
                            vec3(0.299, 0.587, 0.114));

            float g1 = exp(-dist2 / twoSig1Sq);
            float g2 = exp(-dist2 / twoSig2Sq);

            sum1 += lum * g1;
            sum2 += lum * g2;
            w1Total += g1;
            w2Total += g2;
        }
    }

    float dog = (sum1 / w1Total) - (sum2 / w2Total);

    // XDoG: soft threshold produces clean artistic lines
    float edge = 1.0 - softThreshold(dog);

    // Composite lines over the post-Kuwahara image
    // Warm dark line color
    vec3 lineColor = vec3(0.06, 0.04, 0.02);
    color = mix(color, lineColor, edge * LINE_STRENGTH);

    FragColor = vec4(color, 1.0);
}
