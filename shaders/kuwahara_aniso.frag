#version 410 core

in vec2 TexCoord;
out vec4 FragColor;

uniform sampler2D inputTexture;    // smoothed structure tensor from previous passes
uniform sampler2D originalTexture; // original frame (bound to unit 1 by renderer)
uniform vec2 resolution;

// Anisotropic Kuwahara filter.
// Reads the structure tensor to determine local edge orientation,
// then applies an elliptical Kuwahara kernel aligned to the edge.
//
// Key difference from isotropic: samples are taken from the regular
// pixel grid, but sector classification and distance weighting are
// computed in the rotated eigenvector frame, producing an elliptical
// kernel that stretches along edges and compresses across them.

const int RADIUS = 12;
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

    float lambda1 = (trace + sqrtDelta) * 0.5; // major (strongest gradient direction)
    float lambda2 = (trace - sqrtDelta) * 0.5; // minor

    // Major eigenvector (across the edge — direction of strongest gradient)
    vec2 v1;
    if (abs(j01) > 0.001) {
        v1 = normalize(vec2(j01, lambda1 - j00));
    } else if (j00 > j11 + 0.001) {
        v1 = vec2(1.0, 0.0);
    } else if (j11 > j00 + 0.001) {
        v1 = vec2(0.0, 1.0);
    } else {
        v1 = vec2(1.0, 0.0); // isotropic fallback
    }
    // Minor eigenvector (along the edge)
    vec2 v2 = vec2(-v1.y, v1.x);

    // Anisotropy strength [0, 1]
    float aniso = (lambda1 - lambda2) / (lambda1 + lambda2 + 0.001);
    aniso = clamp(aniso, 0.0, 1.0);

    // Ellipse semi-axes (in units of RADIUS):
    // Along edge (v2): stretch up to 3x
    // Across edge (v1): compress down to 0.3x
    float rAlong  = 1.0 + 2.0 * aniso;  // [1.0, 3.0]
    float rAcross = 1.0 - 0.7 * aniso;  // [1.0, 0.3]

    float sectorWidth = 2.0 * PI / float(NUM_SECTORS);
    float halfOverlap = sectorWidth * 0.75;

    // Accumulators
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

            // Project offset onto eigenvector frame
            float u = dot(offset, v1); // component across edge
            float v = dot(offset, v2); // component along edge

            // Elliptical distance: normalize each axis by its radius
            float ellipDist = sqrt(
                (u * u) / (rAcross * rAcross) +
                (v * v) / (rAlong * rAlong)
            );
            if (ellipDist > float(RADIUS)) continue;

            // Sample from the ORIGINAL image at the regular grid position
            vec2 sampleCoord = TexCoord + offset * texelSize;
            vec3 color = texture(originalTexture, sampleCoord).rgb;
            float lum = dot(color, vec3(0.299, 0.587, 0.114));

            // Spatial weight based on elliptical distance
            float spatialW = 1.0 - (ellipDist / float(RADIUS));
            spatialW = spatialW * spatialW;

            // Center pixel: contribute to all sectors
            if (dx == 0 && dy == 0) {
                for (int s = 0; s < NUM_SECTORS; s++) {
                    sumColor[s] += color * spatialW;
                    sumLum[s] += lum * spatialW;
                    sumLum2[s] += lum * lum * spatialW;
                    totalW[s] += spatialW;
                }
                continue;
            }

            // Sector assignment in the ROTATED eigenvector frame
            // This aligns sectors with the edge direction
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

    // Select sector with lowest variance
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
