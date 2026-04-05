#version 410 core

in vec2 TexCoord;
out vec4 FragColor;

uniform sampler2D inputTexture;    // smoothed structure tensor
uniform sampler2D originalTexture; // original frame (unit 1)
uniform vec2 resolution;

// Anisotropic Kuwahara filter.
// Reads the structure tensor to determine local edge orientation,
// applies an elliptical kernel aligned to edges.
// Samples from the regular pixel grid; uses eigenvector frame
// only for sector classification and elliptical distance.

const int RADIUS = 24;
const int NUM_SECTORS = 8;
const float PI = 3.14159265;

void main() {
    vec2 texelSize = 1.0 / resolution;

    // Read smoothed structure tensor
    vec4 st = texture(inputTexture, TexCoord);
    float j00 = st.r; // Ix^2
    float j11 = st.g; // Iy^2
    float j01 = st.b; // Ix*Iy

    // Eigenvalue decomposition of 2x2 symmetric matrix
    float trace = j00 + j11;
    float det = j00 * j11 - j01 * j01;
    float delta = max(0.0, trace * trace - 4.0 * det);
    float sqrtDelta = sqrt(delta);

    float lambda1 = (trace + sqrtDelta) * 0.5;
    float lambda2 = (trace - sqrtDelta) * 0.5;

    // Major eigenvector (across edge — strongest gradient direction)
    vec2 v1;
    if (abs(j01) > 0.001) {
        v1 = normalize(vec2(j01, lambda1 - j00));
    } else if (j00 > j11 + 0.001) {
        v1 = vec2(1.0, 0.0);
    } else if (j11 > j00 + 0.001) {
        v1 = vec2(0.0, 1.0);
    } else {
        v1 = vec2(1.0, 0.0);
    }
    vec2 v2 = vec2(-v1.y, v1.x); // along edge

    // Anisotropy strength
    float aniso = (lambda1 - lambda2) / (lambda1 + lambda2 + 0.001);
    aniso = clamp(aniso, 0.0, 1.0);

    // Ellipse: stretch along edge, compress across
    float rAlong  = 1.0 + 2.0 * aniso;
    float rAcross = 1.0 - 0.7 * aniso;

    float sectorWidth = 2.0 * PI / float(NUM_SECTORS);
    float halfOverlap = sectorWidth * 0.75;

    vec3 sumColor[NUM_SECTORS];
    float sumLum[NUM_SECTORS];
    float sumLum2[NUM_SECTORS];
    float totalW[NUM_SECTORS];

    for (int s = 0; s < NUM_SECTORS; s++) {
        sumColor[s] = vec3(0.0);
        sumLum[s] = 0.0;
        sumLum2[s] = 0.0;
        totalW[s] = 0.0;
    }

    for (int dy = -RADIUS; dy <= RADIUS; dy++) {
        for (int dx = -RADIUS; dx <= RADIUS; dx++) {
            vec2 offset = vec2(float(dx), float(dy));

            // Project onto eigenvector frame for classification
            float u = dot(offset, v1);
            float v = dot(offset, v2);

            // Elliptical distance
            float ellipDist = sqrt(
                (u * u) / (rAcross * rAcross) +
                (v * v) / (rAlong * rAlong)
            );
            if (ellipDist > float(RADIUS)) continue;

            // Sample from ORIGINAL image at regular grid position
            vec2 sampleCoord = TexCoord + offset * texelSize;
            vec3 color = texture(originalTexture, sampleCoord).rgb;
            float lum = dot(color, vec3(0.299, 0.587, 0.114));

            float spatialW = 1.0 - (ellipDist / float(RADIUS));
            spatialW = spatialW * spatialW;

            if (dx == 0 && dy == 0) {
                for (int s = 0; s < NUM_SECTORS; s++) {
                    sumColor[s] += color * spatialW;
                    sumLum[s] += lum * spatialW;
                    sumLum2[s] += lum * lum * spatialW;
                    totalW[s] += spatialW;
                }
                continue;
            }

            // Sector angle in rotated eigenvector frame
            float angle = atan(v, u) + PI;

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
