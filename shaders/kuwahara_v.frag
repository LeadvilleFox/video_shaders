#version 410 core

in vec2 TexCoord;
out vec4 FragColor;

uniform sampler2D inputTexture;
uniform vec2 resolution;

// Separable Kuwahara — vertical pass.

const int RADIUS = 30;

void main() {
    vec2 texelSize = 1.0 / resolution;
    int overlap = RADIUS / 3;

    vec3 sumT = vec3(0.0), sumB = vec3(0.0);
    float lumSumT = 0.0, lumSumB = 0.0;
    float lum2SumT = 0.0, lum2SumB = 0.0;
    float wT = 0.0, wB = 0.0;

    for (int dy = -RADIUS; dy <= RADIUS; dy++) {
        float fdy = float(dy);
        float dist = abs(fdy);

        vec2 sampleCoord = TexCoord + vec2(0.0, fdy * texelSize.y);
        vec3 color = texture(inputTexture, sampleCoord).rgb;
        float lum = dot(color, vec3(0.299, 0.587, 0.114));

        float spatialW = 1.0 - (dist / float(RADIUS));
        spatialW = spatialW * spatialW;

        if (dy <= overlap) {
            float sideW = 1.0;
            if (dy > 0) {
                sideW = 1.0 - float(dy) / float(overlap);
                sideW = sideW * sideW;
            }
            float w = spatialW * sideW;
            sumT += color * w;
            lumSumT += lum * w;
            lum2SumT += lum * lum * w;
            wT += w;
        }

        if (dy >= -overlap) {
            float sideW = 1.0;
            if (dy < 0) {
                sideW = 1.0 - float(-dy) / float(overlap);
                sideW = sideW * sideW;
            }
            float w = spatialW * sideW;
            sumB += color * w;
            lumSumB += lum * w;
            lum2SumB += lum * lum * w;
            wB += w;
        }
    }

    vec3 meanT = sumT / wT;
    vec3 meanB = sumB / wB;
    float varT = (lum2SumT / wT) - (lumSumT / wT) * (lumSumT / wT);
    float varB = (lum2SumB / wB) - (lumSumB / wB) * (lumSumB / wB);

    FragColor = vec4(varT < varB ? meanT : meanB, 1.0);
}
