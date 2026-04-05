#version 410 core

in vec2 TexCoord;
out vec4 FragColor;

uniform sampler2D inputTexture;
uniform vec2 resolution;

// Separable Kuwahara — horizontal pass.
// Scans along the x-axis only. Divides the 1D neighborhood into
// overlapping left/right halves, picks the half with lower variance.
// Complexity: O(r) instead of O(r²).

const int RADIUS = 30;

void main() {
    vec2 texelSize = 1.0 / resolution;

    // Two halves: left [-RADIUS, overlap] and right [-overlap, RADIUS]
    // Overlap region around center ensures smooth transitions
    int overlap = RADIUS / 3;

    vec3 sumL = vec3(0.0), sumR = vec3(0.0);
    float lumSumL = 0.0, lumSumR = 0.0;
    float lum2SumL = 0.0, lum2SumR = 0.0;
    float wL = 0.0, wR = 0.0;

    for (int dx = -RADIUS; dx <= RADIUS; dx++) {
        float fdx = float(dx);
        float dist = abs(fdx);

        vec2 sampleCoord = TexCoord + vec2(fdx * texelSize.x, 0.0);
        vec3 color = texture(inputTexture, sampleCoord).rgb;
        float lum = dot(color, vec3(0.299, 0.587, 0.114));

        // Spatial weight: quadratic falloff from center
        float spatialW = 1.0 - (dist / float(RADIUS));
        spatialW = spatialW * spatialW;

        // Left half: dx in [-RADIUS, overlap]
        if (dx <= overlap) {
            float sideW = 1.0;
            // Smooth falloff in overlap region
            if (dx > 0) {
                sideW = 1.0 - float(dx) / float(overlap);
                sideW = sideW * sideW;
            }
            float w = spatialW * sideW;
            sumL += color * w;
            lumSumL += lum * w;
            lum2SumL += lum * lum * w;
            wL += w;
        }

        // Right half: dx in [-overlap, RADIUS]
        if (dx >= -overlap) {
            float sideW = 1.0;
            if (dx < 0) {
                sideW = 1.0 - float(-dx) / float(overlap);
                sideW = sideW * sideW;
            }
            float w = spatialW * sideW;
            sumR += color * w;
            lumSumR += lum * w;
            lum2SumR += lum * lum * w;
            wR += w;
        }
    }

    // Compute means and variances
    vec3 meanL = sumL / wL;
    vec3 meanR = sumR / wR;
    float varL = (lum2SumL / wL) - (lumSumL / wL) * (lumSumL / wL);
    float varR = (lum2SumR / wR) - (lumSumR / wR) * (lumSumR / wR);

    FragColor = vec4(varL < varR ? meanL : meanR, 1.0);
}
