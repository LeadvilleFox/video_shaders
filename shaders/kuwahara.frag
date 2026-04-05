#version 410 core

in vec2 TexCoord;
out vec4 FragColor;

uniform sampler2D inputTexture;
uniform vec2 resolution;

// Isotropic Kuwahara filter with 8 overlapping circular sectors
// and smooth polynomial weighting.
// Single-pass: computes mean and variance simultaneously using
// E[X^2] - E[X]^2 formulation to avoid a second texture read loop.

const int RADIUS = 12;
const int NUM_SECTORS = 8;
const float PI = 3.14159265;

void main() {
    vec2 texelSize = 1.0 / resolution;
    float sectorWidth = 2.0 * PI / float(NUM_SECTORS);
    float halfOverlap = sectorWidth * 0.75;

    // Accumulators: weighted sum, weighted sum of luminance^2, total weight
    vec3 sumColor[NUM_SECTORS];
    float sumLum2[NUM_SECTORS];
    float sumLum[NUM_SECTORS];
    float totalW[NUM_SECTORS];

    for (int s = 0; s < NUM_SECTORS; s++) {
        sumColor[s] = vec3(0.0);
        sumLum2[s] = 0.0;
        sumLum[s] = 0.0;
        totalW[s] = 0.0;
    }

    // Single pass: accumulate mean and variance components together
    for (int dy = -RADIUS; dy <= RADIUS; dy++) {
        for (int dx = -RADIUS; dx <= RADIUS; dx++) {
            vec2 offset = vec2(float(dx), float(dy));
            float dist = length(offset);
            if (dist > float(RADIUS)) continue;

            vec2 sampleCoord = TexCoord + offset * texelSize;
            vec3 color = texture(inputTexture, sampleCoord).rgb;
            float lum = dot(color, vec3(0.299, 0.587, 0.114));

            // Spatial weight: quadratic falloff
            float spatialW = 1.0 - (dist / float(RADIUS));
            spatialW = spatialW * spatialW;

            // Determine angle (handle center pixel separately)
            if (dx == 0 && dy == 0) {
                // Center pixel contributes to all sectors
                for (int s = 0; s < NUM_SECTORS; s++) {
                    sumColor[s] += color * spatialW;
                    sumLum[s] += lum * spatialW;
                    sumLum2[s] += lum * lum * spatialW;
                    totalW[s] += spatialW;
                }
                continue;
            }

            float angle = atan(float(dy), float(dx)) + PI; // [0, 2*PI]

            for (int s = 0; s < NUM_SECTORS; s++) {
                float sectorCenter = (float(s) + 0.5) * sectorWidth;
                float angleDiff = abs(angle - sectorCenter);
                angleDiff = min(angleDiff, 2.0 * PI - angleDiff);

                if (angleDiff < halfOverlap) {
                    float sectorW = 1.0 - (angleDiff / halfOverlap);
                    sectorW = sectorW * sectorW;
                    float w = spatialW * sectorW;

                    sumColor[s] += color * w;
                    sumLum[s] += lum * w;
                    sumLum2[s] += lum * lum * w;
                    totalW[s] += w;
                }
            }
        }
    }

    // Select sector with lowest variance: Var = E[X^2] - E[X]^2
    float minVar = 1e10;
    vec3 result = vec3(0.0);

    for (int s = 0; s < NUM_SECTORS; s++) {
        if (totalW[s] > 0.0) {
            vec3 mean = sumColor[s] / totalW[s];
            float meanLum = sumLum[s] / totalW[s];
            float meanLum2 = sumLum2[s] / totalW[s];
            float var = meanLum2 - meanLum * meanLum;

            if (var < minVar) {
                minVar = var;
                result = mean;
            }
        }
    }

    FragColor = vec4(result, 1.0);
}
